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

