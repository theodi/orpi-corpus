var es = require('event-stream'),
	request = require('request'),
	zlib = require('zlib'),
	gunzip = zlib.createGunzip(),
	data = es.writeArray(function (err, array) {
		console.log(JSON.parse(array.join(''))
			.TIPLOCDATA
			.filter(function (entry) {
				return (entry.STANOX !== ' ') && (entry["3ALPHA"] !== ' ');
			}));
	});

// Uses OSM's Nominatim service to get the latitude and longitude of the best
// match for searchString
var getLatLon = function (searchString, callback) {
	request.get({
			'url': 'http://nominatim.openstreetmap.org/search', 
			'qs': { 'format': 'json', 'q': searchString },
			'json': true
		},
		function (error, response, body) {
			if (error) {
				callback(error);
				return;
			}
			if (body.length === 0) {
				// the call to the API could not find anything
				callback(new Error("Nominatim did not return any results."));
				return;
			}
			callback(error, { 'lat': body[0].lat, 'lon': body[0].lon });
		});
};

var run = function () {
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

getLatLon("berkhamsted railway station", function (err, latLon) {
	console.log(latLon);
});