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
		return new Promise(function resolver(resolve, reject) {
			//Set parameters for sending a request to the API endpoint
			console.log("sending query to NCBI");
			var baseUrl =  "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/";
			var ids = "?ids=" + identifier;
			var tool = "&tool=TheLiterature";
			var email = "&email=TheLiterature@protonmail.com";
			var format ="&format=json";
			//Combine parameters for the query
			var fullUrl = baseUrl + ids + tool + email + format;
			//Send a standard ajax request
			var request = new XMLHttpRequest();
			//Set a generous timeout. This service can be slow
			request.timeout = 60000;
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
						console.log("DOI from NCBI was not ",
							"correctly formatted");
						reject(null);
					}
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
		});
	};

	//Search theCrossref API for a DOI
	//Documentation at https://github.com/CrossRef/rest-api-doc
	//Mainly followed https://www.crossref.org/labs/resolving-citations-we-dont-need-no-stinkin-parser/
	//Could also try the "reverse" endpoint (http://partiallyattended.com/2017/01/10/crossref-reverse-lookups/)
	this.queryCrossref = function(item) {
		return new Promise(function (resolve, reject) {
			console.log("searching crossref for a DOI for " +
				item.getField("title"));
			var base_URL =  "https://api.crossref.org/";
			var path = "works?";
			var query = "query.bibliographic=";
			var request = new XMLHttpRequest();
			//Set parameters for the query
			var search_terms = [];
			//Make sure to encode any parameter values so that
			//special characters don't break the URL
			search_terms.push(encodeURIComponent(item.getField("title"))
				.replace(/%20/g, "+"));
			//See if any creators are listed
			if (item.getCreators()) {		
				//Iterate through the list of authors and append last name using
				//the spread operator (...)
				search_terms.push(...item.getCreators().map(name =>
					encodeURIComponent(name.lastName)));
			}
			//See if there is a date with a publication year
			if (Zotero.Date.strToDate(item.getField("date")).year) {
				//Since I'm not sure how precise the date fields are in crossref,
				//so just use the year
				search_terms.push(Zotero.Date.strToDate(
					item.getField("date")).year);
			}
			//See if there is an ISSN listed
			if (item.getField("ISSN")) {
				search_terms.push(item.getField("ISSN"));
			}
			//Limit crossref's response to their top result
			//Crossref automatically sorts by match score unless otherwise
			//specified
			var number_results = "&rows=1";
			//Add up all of the search parameters
			search_terms = search_terms.join("+");
			var payload = query + search_terms + number_results;
			//Construct the full search URL
			var full_URL = base_URL + path + payload;
			//Set a generous timeout
			request.timeout = 30000;
			request.open("GET", full_URL, true);
			//Crossref asks for these headers in order to get access
			//to their faster API servers
			request.setRequestHeader("Content-Type", "application/json");
			request.setRequestHeader("User-Agent", "TheLiterature/" +
					Zotero.TheLiterature.getPref("version") + 
					" (mailto:TheLiterature@protonmail.com)");

			//**TODO** Set up request throttling

			//Call a function when Crossref answers
			request.onload = function () {
				//console.log("Crossref responded!");
				//Parse the raw response text into JSON
				var responseJSON = JSON.parse(request.response);
				//See if the crossref response score is high enough
				//Have arbitrarily selected 40 as a cutoff after looking
				//at a few responses
				if (responseJSON.message.items[0].score < 40) {
					console.log("Crossref didn't find a good enough match for "
						+ item.getField("title") + " DOI: " +
						responseJSON.message.items[0].DOI + 
						" score: " + responseJSON.message.items[0].score);
					reject(responseJSON.message.items[0].DOI);
				}
				//See if the JSON response has a DOI field
				else if(responseJSON.message.items[0].DOI) {
					var foundDOI = responseJSON.message.items[0].DOI;
					//Test that the DOI is correctly formatted
					if(!Zotero.TheLiterature.testDOI(foundDOI)) {
						reject(foundDOI);
					}
					console.log("Crossref DOI for " + item.getField("title") +
						" is " + foundDOI + " with score " +
						responseJSON.message.items[0].score);
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
				if (request.statusCode === 404) {
					console.warn(base_URL + path + " not found on crossref");
				}
				else {
					console.log(error)
				}
				reject(error);
			};
			request.ontimeout = function (error) {
				console.log(error);
				reject(error);
			};
			request.send();
		});
	};

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