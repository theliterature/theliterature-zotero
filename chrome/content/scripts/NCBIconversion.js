//Define global functions for eslint
/*global Zotero*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

Zotero.TheLiterature.idconvNCBI = new function () {
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
				request.timeout = 10000;
				request.open("GET", fullUrl, true);
				//Function to process returned JSON
				request.onload = function () {
					//Parse the JSON response
					var responseJSON = JSON.parse(request.response);
					//See if there's a DOI element in the response
					if(responseJSON.records[0].doi) {
						item.setField("DOI", responseJSON.records[0].doi);
						resolve(true);
					}
					//If not there it means  a DOI wasn't found
					else {
						console.log("DOI not found by NCBI");
						resolve(false);
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
};