//Define global functions for eslint
/*global Zotero*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

//Methods to search for DOIs with which we can search sci-hub
Zotero.TheLiterature.findDOI = new function () {
	//Function to use the NCBI's api to convert PubMed IDs (PMIDs)
	//and PubMed Central IDs (PMCIDs) to DOIs
	//Info at https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
	//Takes as arguments an identifier (PMID or PMCID) and returns a DOI
	this.queryNCBI = function(item, identifier) {
		var ncbiPromise = new Promise(
			function resolver(resolve, reject) {
				//Set parameters for sending a request to the API endpoint
				console.log("sending query to NCBI");
				var baseUrl =  "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/";
				var ids = "?ids=" + identifier;
				var tool = "&tool=TheLiterature";
				var email = "&email=TheLiterature@protonmail.com";
				var format ="&format=json";
				//Combine parameters for the post
				var fullUrl = baseUrl + ids + tool + email + format;
				//Send a standard ajax request
				var request = new XMLHttpRequest();
				//Set a generous timeout. This service can be slow
				request.timeout = 30000;
				request.open("GET", fullUrl, true);
				//Function to process returned JSON
				request.onload = function () {
					//Parse the JSON response
					var responseJSON = JSON.parse(request.response);
					//See if there's a DOI element in the response
					if(responseJSON.records[0].doi) {
						var foundDOI = responseJSON.records[0].doi;
						//Test if the DOI is correctly formatted
						if(!Zotero.TheLiterature.testDOI(foundDOI)) {
							reject(null);
						}
						//Set the DOI in Zotero
						Zotero.TheLiterature.setDOI(item, foundDOI);
						//Return the promise
						resolve(foundDOI);
					}
					//If no DOI in the response then a DOI wasn't found
					else {
						console.log("DOI not found by NCBI");
						reject(null);
					}
				};
				//Handle connection errors
				request.onerror = function (e) {
					reject(e);
				};
				//Handle connection timeouts
				request.ontimeout = function (e) {
					reject(e);
				};
				//Send off the request.
				request.send();
			}
		);
		//Return the promise
		return ncbiPromise;
	}.bind(Zotero.TheLiterature);

	//Search theCrossref API for a DOI
	//Modified from https://github.com/scienceai/crossref
	//Additional documentation at https://search.crossref.org/help/api
	this.queryCrossref = function(item) {
		var crossref_promise = new Promise(function (resolve, reject) {
			console.log("starting queryCrossref");
			var baseUrl =  "https://api.crossref.org/";
			var path = "links";
			var request = new XMLHttpRequest();
			//Set parameters for the post
			request.setRequestHeader("Content-Type", "application/json");
			var fullUrl = baseUrl + path;
			request.open("POST", fullUrl, true);
			//Set a generous timeout
			request.timeout = 30000;
			//Call a function when the state changes.
			request.onload = function () {
				console.log("loaded!");
				var responseJSON = JSON.parse(request.response);
				if(responseJSON.records[0].doi) {
					var foundDOI = responseJSON.records[0].doi;
					//Test that the DOI is correctly formatted
					if(!Zotero.TheLiterature.testDOI(foundDOI)) {
						reject(null);
					}
					//Set the DOI in Zotero
					Zotero.TheLiterature.setDOI(item, foundDOI);
					//Return the promise
					resolve(foundDOI);
				}
				//If no DOI in the response, then it wasn't found
				else {
					console.log("DOI not found in crossref");
					reject(false);
				}
			};
			request.onerror = function (error) {
				if (request.statusCode === 429) {
					var headers = request.headers || {};
					var limit = headers["x-rate-limit-limit"] || "N/A";
					var interval = headers["x-rate-limit-interval"] || "N/A";
					console.warn("Rate limit exceeded: " + limit + " requests in " 
						+ interval);
				}
				reject(error);
			};
			request.ontimeout = function (error) {
				console.log(error);
				reject(error);
			};
			//Need a proper payload for the POST
			request.send();
		});
		return crossref_promise;
	}.bind(Zotero.TheLiterature);

	// More error handling to implement from crossref.js
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

};