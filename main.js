var // https://github.com/caolan/async
	async = require('async'),
	// http://www.adaltas.com/projects/node-csv/
	// Note we're still using version 0.3.x as 0.4.x is unstable
	csv = require('csv'),
	// https://github.com/dominictarr/event-stream
	es = require('event-stream'),
	// https://github.com/jhurliman/node-rate-limiter
	RateLimiter = require('limiter').RateLimiter,
	// https://github.com/mikeal/request
	request = require('request'),
	// https://github.com/chevex/yargs
	argv = require('yargs')
		.usage('Usage: --out <filename> [--throttle <requests per second>]')
		.demand([ 'out' ])
		.default('throttle', 1)
		.argv,
	zlib = require('zlib'),
	// http://underscorejs.org/
	_ = require('underscore');

// No more than 1 request per second! http://wiki.openstreetmap.org/wiki/Nominatim_usage_policy
var nominatimLimiter = new RateLimiter(Math.max(1, parseFloat(argv.throttle)), 'second');

// Uses OSM's Nominatim service to get the latitude and longitude of the best
// match for searchString http://wiki.openstreetmap.org/wiki/Nominatim
var getLatLon = function (searchString, callback) {
	nominatimLimiter.removeTokens(1, function() {
		request.get({
				'url': 'http://nominatim.openstreetmap.org/search', 
				'headers': { 'User-Agent': process.env.USER_AGENT },
				'qs': { 'format': 'json', 'q': searchString },
				'json': false
			},
			function (error, response, body) {
				if (error) {
					callback(error);
					return;
				}
				try {
					body = JSON.parse(body);
				} catch(err) {
					throw new Error("Nominatim did not return valid JSON content. Perhaps you broke the usage policy? Aborting.");
				}
				if (body.length === 0) {
					// the call to the API could not find anything
					callback(new Error("Nominatim did not return any results."));
					return;
				}
				callback(error, { 'lat': body[0].lat, 'lon': body[0].lon });
			});
	});
};

// fetch the station data as published by ORR at 
// http://orr.gov.uk/statistics/published-stats/station-usage-estimates
// and returns it as a hash with the 'Origin TLC' as key
var fetchORRStationUsage = function (callback) {
	csv()
		.from.path('./data/ORR-station-usage-2012-13.csv', { 'columns': true })
		.transform(function (row) { 
				delete row['']; // for empty columns
				return row['Origin TLC'] ? row : undefined; // for empty rows 
			})
		.to.array(function (data) {
				var dataAsHash = { },
					originTlc;
				data.forEach(function (station) { 
					// moves the 'Origin TLC' property from the record to its key
					originTlc = station['Origin TLC'];
					delete station['Origin TLC'];
					dataAsHash[originTlc] = station; 
				}); 
				callback(null, dataAsHash); 
			});	
}

// fetches the corpus, filters out items that have no STANOX or 3ALPHA valies
// and integrates with latitude and longitude
var fetchNRCorpus = function (orrStations, callback) {
	var relevant3Alpha = _.keys(orrStations),
		successCount = 0,
		gunzip = zlib.createGunzip(),
		data = es.writeArray(function (err, array) {
			array = JSON.parse(array.join(''))
				.TIPLOCDATA
				.filter(function (entry) {
					// drop all points defined in the corpus that a) don't have
				    // a stanox code, b) don't have a 3alpha code and c) whose
				    // 3alpha code is not included in the specified list of
				    // relevant3Alpha 
					return((entry.STANOX !== ' ') && _.contains(relevant3Alpha, entry["3ALPHA"]));
				});
			async.mapSeries(array, function (item, callback) {
				// add to the station the data from the ORR file
				item = _.extend(item, orrStations[item["3ALPHA"]]);
				// add latitude and longitude, trying first by adding 
				// " railway station" to the station name and then without
				var latLon = undefined;
				async.detectSeries(
					[ 
					  // first I try by adding 'railway station'
					  item['Station Name'] + ' railway station, ' + 
						  item['County or Unitary Authority'] + ', uk',
					  // then by removing the stuff in brackets and adding 
					  // 'railway station' 
					  item['Station Name'].replace(/ *\([^)]*\) */g, "") + 
					      ' railway station, ' + 
					      item['County or Unitary Authority'] + ', uk',
					  // then by using just the ORR station names, that will
					  // likely give me the latlon of the town rather than the
					  // station
					  item['Station Name'] + ', ' + 
					  	  item['County or Unitary Authority'] + ', uk' ],
					function (searchString, callback) {
						getLatLon(searchString, function (err, _latLon) {
							latLon = err ? undefined : _latLon;
							callback(!err);
						});
					},
					function (found) {
						if(found) {
							successCount++;
							item.LAT = latLon.lat;
							item.LON = latLon.lon;
							process.stdout.write(".");
						} else {
							process.stdout.write("\nLat/lon resolution failed for " + item['Station Name']);
						}						
						callback(null, item);
				});
			}, function (err, results) {
				console.log("\nCompleted. Success rate " + (successCount / array.length * 100).toFixed(0) + "%.");
				callback(err, results);
			});
		});
	request.get('http://datafeeds.networkrail.co.uk/ntrod/SupportingFileAuthenticate?type=CORPUS', {
			'followAllRedirects': true,
			'auth': {
			    'user': process.env.NROD_USERNAME,
			    'pass': process.env.NROD_PASSWORD,
			    'sendImmediately': true
			}
		}, function (error, response, body) {
			request.get(response.request.uri.href).pipe(gunzip).pipe(data);
	 	});	
}

fetchORRStationUsage(function (err, orrStations) {
	fetchNRCorpus(
		orrStations, 
		function (err, corpus) {
			csv()
				.from.array(corpus)
				.to(argv.out)
				.to.options({ 'header': true, 'columns': Object.keys(corpus[0]).sort() })
				.on('end', function () { 
					console.log('Data written to ' + argv.out + '.'); 
				});
		}
	);
});
