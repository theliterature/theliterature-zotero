//Modified from https://github.com/scienceai/crossref
//Also https://search.crossref.org/help/api

// make a request
Zotero.TheLiterature.queryCrossref = function (item, callback) {
	console.log("starting queryCrossref");
	var baseUrl =  "https://api.crossref.org/";
	var path = "links";
	var request = new XMLHttpRequest();
	//Set parameters for the post
	request.setRequestHeader("Content-Type", "application/json");
	var fullUrl = baseUrl + path;
	//Since only looking for one result, set to synchronous
	request.open("POST", fullUrl, true);
	//Set a generous timeout
	request.timeout = 60000;
	//Call a function when the state changes.
	request.onload = function () {
		console.log("loaded!");
		var responseJSON = JSON.parse(request.response);
		if(responseJSON.records[0].doi) {
			console.log("DOI is " + responseJSON.records[0].doi);
			item.setField("DOI", responseJSON.records[0].doi);
			callback(true);
		}
		else {
			console.log("DOI not found");
			callback(false);
		}
	};
	request.onerror = function (error) {
    if (request.statusCode === 429) {
      var headers = request.headers || {};
      var limit = headers["x-rate-limit-limit"] || "N/A";
      var interval = headers["x-rate-limit-interval"] || "N/A";
      console.warn("Rate limit exceeded: ${limit} requests in ${interval}");
    }
		console.log(error);
		callback(false);
	};
	request.ontimeout = function (error) {
		console.log(error);
		callback(false);
	};
	request.send();
};

//
// request({ url: `${endpoint}${path}`, json: true, timeout }, (err, res, body) => {
//   if (err || !res || res.statusCode >= 400) {
//     let statusCode = res ? res.statusCode : 0
//       , statusMessage = res ? res.statusMessage : 'Unspecified error (likely a timeout)'
//     ;
//
//     if (statusCode === 429) {
//       let headers = res.headers || {}
//         , limit = headers['x-rate-limit-limit'] || 'N/A'
//         , interval = headers['x-rate-limit-interval'] || 'N/A'
//       ;
//       return cb(new Error(`Rate limit exceeded: ${limit} requests in ${interval}`));
//     }
//     if (statusCode === 404) return cb(new Error(`Not found on CrossRef: '${endpoint}${path}'`));
//     let msg = (err && err.message) ? err.message : statusMessage;
//     return cb(new Error(`CrossRef error: [${statusCode}] ${msg}`));
//   }
//   if (typeof body !== 'object') return cb(new Error(`CrossRef response was not JSON: ${body}`));
//   if (!body.status) return cb(new Error('Malformed CrossRef response: no `status` field.'));
//   if (body.status !== 'ok') return cb(new Error(`CrossRef error: ${body.status}`));
//   cb(null, body.message);
// });
// }
