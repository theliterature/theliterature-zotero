//Define global functions for eslint
/*global Zotero*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

//Methods to fetch PDFs from sci-hub.
Zotero.TheLiterature.sciHub = new function() {
	//Post a DOI to sci-hub and get PDF
	this.getPDF = function(item) {
		var itemDOI = item.getField("DOI");
		var sci_hub_pdf_promise = new Promise(
			function resolver(resolve, reject) {
				var request = new XMLHttpRequest();
				//Set parameters for the post. Using encodeURIComponent() to
				//encode special characters often used in DOIs
				var params = encodeURIComponent("request") +
					"=" + encodeURIComponent(itemDOI);
				//Since only looking for one result, set to synchronous
				request.open("POST", Zotero.TheLiterature.sci_hub_url, true);
				//Set a generous timeout
				request.timeout = 30000;
				//Set the proper header information
				request.setRequestHeader("User-Agent", "TheLiterature/" +
					this.version);
				request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
				request.setRequestHeader("Connection", "open");
				//Call a function when the state changes.
				request.onload = function () {
					var response = request.responseText;
					console.log("request loaded");
					//Take the response text and parse it as HTML
					var parser = new DOMParser();
					var responseHTML = parser.parseFromString(response, 
						"text/html");
					//Search for a PDF download URL, and if present download PDF
					if (responseHTML.getElementById("pdf") != null) {
						//Test to see if there's a scheme (http) 
						//included in the returned uri
						if (responseHTML.getElementById("pdf").src
							.startsWith("chrome")) {
							//Slice "chrome" off the uri and add http
							var downloadURL = "http" + 
							responseHTML.getElementById("pdf")
								.src.slice(6);

						}
						else {
							downloadURL = responseHTML.getElementById("pdf").src;
						}
						console.log("download url is " + 
							downloadURL);
						var importArguments = {url: downloadURL, 
							libraryID: item.libraryID,
							parentItemID: item.id, collections: undefined};
						Zotero.Attachments.importFromURL(importArguments)
							.then(function() {
								resolve(downloadURL);
							})
							.catch(function(error) {
								console.log("Zotero had an error adding PDF to item");
								reject(error);
							});
					}

					//Another type of response
					// if (responseHTML.getElementById("content") != null) {
					// 	console.log("download url is " + 
					// 		responseHTML.getElementById("pdf").src);
					// 	var downloadURL = responseHTML.getElementById("pdf").src;
					// 	var importArguments = {url: downloadURL, 
					// 		libraryID: item.libraryID,
					// 		parentItemID: item.id, collections: undefined};
					// 	Zotero.Attachments.importFromURL(importArguments);
					// 	resolve(downloadURL);
					// }

					//Handle captcha
					//Need to figure out how to display a picture and user input

					//Handle pdf not found
					else if (responseHTML.title ==
						"Sci-Hub: removing barriers in the way of science") {
						console.log("pdf not found");
						reject(null);
					}

					//Handle sci-hub returning a framed HTML page
					else if (responseHTML
						.getElementsByClassName("reveal-modal-bg").length > 0) {
						console.log("sci-hub returned a webpage, not a pdf");
					}

					//Handle anything else
					else {
						console.log("wasn't able to handle this case \n",
							responseHTML);
						reject(responseHTML);
					}
				};

				request.onerror = function(err) {
					console.warn(err);
					reject(err);
				};
				request.ontimeout = function(err) {
					console.log("sci-hub timed out while getting PDF");
					reject(err);
				};
				console.log("sending request for " + itemDOI);
				request.send(params);
			}
		);
		return sci_hub_pdf_promise;
	};
};