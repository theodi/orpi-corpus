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
		.transform(function (row) { return row['Origin TLC'] ? row : undefined; })
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
var fetchNRCorpus = function (relevant3Alpha, callback) {
	var successCount = 0,
		gunzip = zlib.createGunzip(),
		data = es.writeArray(function (err, array) {
			array = JSON.parse(array.join(''))
				.TIPLOCDATA
				.filter(function (entry) {
					// drop all points defined in the corpus that a) don't have
				    // a stanox code, b) don't have a 3alpha code and c) whose
				    // 3alpha code is not included in the specified list of
				    // relevant3Alpha 
					return (entry.STANOX !== ' ') && (relevant3Alpha.indexOf(entry["3ALPHA"]) > -1);
			});
			async.map(array, function (item, callback) {
				getLatLon(item.NLCDESC + " railway station", function (err, latLon) {
					if(!err) {
						successCount++;
						process.stdout.write('.');
						item.LAT = latLon.lat;
						item.LON = latLon.lon;
					} else {
						process.stdout.write("\nLat/lon resolution failed for " + item.NLCDESC);
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
		// gets the relevant stations' 3 letter codes from the ORR station usage
		// data...
		_.keys(orrStations), 
		// ... and uses it to filter the NR corpus
		function (err, corpus) {
			csv()
				.from.array(corpus)
				.transform(function (row) {
					// integrates the rest of the data from the ORR file
					return(_.extend(row, orrStations[row["3ALPHA"]]));
				})
				.to(argv.out)
				.to.options({ 'header': true, 'columns': Object.keys(corpus[0]).sort() })
				.on('end', function () { 
					console.log('Data written to ' + argv.out + '.'); 
				});
		}
	);
});
