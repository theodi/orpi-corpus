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
	zlib = require('zlib');

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

// fetches the corpus, filters out items that have no STANOX or 3ALPHA valies
// and integrates with latitude and longitude
var fetchCorpus = function (callback) {
	var successCount = 0,
		gunzip = zlib.createGunzip(),
		data = es.writeArray(function (err, array) {
			array = JSON.parse(array.join(''))
				.TIPLOCDATA
				.filter(function (entry) {
					return (entry.STANOX !== ' ') && (entry["3ALPHA"] !== ' ');
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

fetchCorpus(function (err, corpus) {
	csv()
		.from.array(corpus)
		.to(argv.out)
		.to.options({ 'header': true, 'columns': Object.keys(corpus[0]).sort() })
		.on('end', function () { console.log('Data written to ' + argv.out + '.'); });
});
