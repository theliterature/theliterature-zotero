//Define global functions for eslint
/*global Zotero ZoteroPane*/
/*eslint no-undef: "error"*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */
if (typeof Zotero === 'undefined') {
    Zotero = {};
}

Zotero.TheLiterature = {};

//Initialize plugin to starting state. Mainly copied from the
//Zotero sample plugin
Zotero.TheLiterature.init = function() {
	Zotero.TheLiterature.version = "0.0.1";

	//Load additional scripts
	//https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Overlay_Extensions/XUL_School/Appendix_D:_Loading_Scripts
	let context = {};
	Services.scriptloader.loadSubScript("chrome://TheLiterature/content/scripts/crossref.js",
		context, "UTF-8");

	// Register a callback in Zotero as an item observer
	if(notifierID === null) {
		var notifierID = Zotero.Notifier.registerObserver(
			Zotero.TheLiterature.notifierCallback, ["item"]);
	}

	// Unregister callback when the window closes (important to avoid a memory leak)
	window.addEventListener("unload", function() {
		Zotero.Notifier.unregisterObserver(notifierID);
	}, false);


};

// Check for Zotero pane and if present, run initialization
if(window.ZoteroPane) {
	window.addEventListener("load", function() {
		Zotero.TheLiterature.init();
	}, false);
}


//Search for available sci-hub mirror. Should probably put this in a separate
//script
Zotero.TheLiterature.mirrorSearch = function() {
	var sci_hub_mirrors = ["http://sci-hub.la", "http://sci-hub.mn", "http://sci-hub.name",
	  "http://sci-hub.tv", "http://sci-hub.tw", "http://sci-hub.hk"]
	];
	// for (var mirror of sci_hub_mirrors) {
	// 	Zotero.TheLiterature.timeConnection(mirror, Zotero.TheLiterature.responseTimes);
	// }

	return sci_hub_mirrors[0];
};
//Set a sci-hub mirror
var sci_hub_url = Zotero.TheLiterature.mirrorSearch();

// //function to time responses from sci-hub mirrors
// Zotero.TheLiterature.timeConnection = function(item,callback) {
// 	const start = Date.now();
// 	var request = new XMLHttpRequest();
// 	request.open("GET", item, true);
// 	//Set a Timeout
// 	request.timeout = 5000;
// 	//Set the proper header information
// 	request.setRequestHeader("User-Agent", "TheLiterature/" +
// 		Zotero.TheLiterature.version);
// 	request.setRequestHeader("Connection", "close");
// 	//Call a function when the state changes.
// 	request.onload = function () {
// 		var results = {
// 			url: item,
// 			time: Date.now() - start
// 		};
// 		return callback(true, results);
// 	};
// 	//Silently handle errors. Don't care why a mirror fails
// 	request.onerror = callback(null);
// 	request.ontimeout = callback(null);
// 	console.log("checking mirror");
// 	request.send();
// };
//
// //Sort mirrors by response time
// Zotero.TheLiterature.responseTimes =

//Set callback to notify if new item is added
//Also from https://www.zotero.org/support/dev/sample_plugin
Zotero.TheLiterature.notifierCallback = {
	notify: function(event, type, ids, extraData) {
		if (event == "add") {
			var itemsAdded = Zotero.Items.get(ids);
			//Check if item has a pdf
			for (var item of itemsAdded) {
				if (Zotero.TheLiterature.hasPDF(item)) {
					return;
				}
				else {
					Zotero.TheLiterature.fetchPDF(item);
				}
			}
		}
	}
};

//Check if an item has an attached PDF
Zotero.TheLiterature.hasPDF = function(item) {
//return True if PDF present, False if not
	var attachments = item.getAttachments();
	for (var attachment of attachments) {
		if (Zotero.Items.get(attachment)._attachmentContentType == "application/pdf") {
			return true;
		}
	}
	return false;
};

//Get missing pdfs for user selected items
Zotero.TheLiterature.getMissingSelectedItems = function() {
	var missingItems = [];
	for (var item of ZoteroPane.getSelectedItems()) {
		if (!Zotero.TheLiterature.hasPDF(item)) {
			missingItems.push(item);
		}
	}
	Zotero.TheLiterature.fetchPDFs(missingItems);
};

//Get pdfs for all user selected items
Zotero.TheLiterature.getAllSelectedItems = function() {
	Zotero.TheLiterature.fetchPDFs(ZoteroPane.getSelectedItems());
};

//Main function to fetch pdf for individual items
Zotero.TheLiterature.fetchPDFs = function(items) {
	//If nothing to get, stop
	if (!items) {
		return;
	}
	//Cycle through each item to check for identifiers
	for (var item of items) {
		var searchable = true;
		//Check if a DOI is available to search Sci-Hub with
		if (!item.getField("DOI")) {
			//If no DOI, search for one
			Zotero.TheLiterature.searchDOI(item, function (response) {
				if (response == false) {
					console.warn("No DOI available for ", item.getField("title"));
					searchable = false;
				}
				else {
					console.log("DOI found");
				}
			});
		}

		//Verify doi is correctly formatted
		if (!Zotero.TheLiterature.testDOI(item.getField("DOI"))) {
			//if not valid, try to search for a vaild doi
			Zotero.TheLiterature.searchDOI(item, function (response) {
				//If search fails, bail
				if (response == false) {
					console.warn("DOI misformatted for ", item.getField("title"),
						" and unable to find replacement");
					searchable = false;
				}
				else {
					//If search succeeds, test again
					if (!Zotero.TheLiterature.testDOI(item.getField("DOI"))) {
						console.warn("DOI misformatted for ", item.getField("title"),
							" and unable to find replacement");
						searchable = false;
					}
				}
			});
		}

		//Once all checks done, pass on to function to give the DOI
		//to sci-hub and have it save PDF to Zotero under
		//the parent item
		if (searchable) {
			Zotero.TheLiterature.getPDF(item, function (result) {
				console.log("getting PDF for ", item.getField("title"));
				if (result == false) {
					console.warn("Unable to download PDF for ", item.getField("title"));
				}
			});
		}
	}
};

//Function to search for missing DOI based on item title
Zotero.TheLiterature.searchDOI = function(item, callback) {
	//If search successful, set DOI field for Zotero item and return true
	//First look based on PMID or PMCID
	var extra = item.getField("extra");
	if (extra.indexOf("PMID:") >= 0) {
		var index = extra.indexOf("PMID") + 6;
		var extraSub = extra.substring(index);
		var id = extraSub.match(/^(\d)+/)[0];
		Zotero.TheLiterature.queryNCBI(item, id, callback, function (result) {
			if (result != null ) {
				item.setField("DOI", result);
				console.log("NCBI search success");
				callback(true);
			}
			else {
				console.log("NCBI search failed");
				callback(false);
			}
		});
	}

	else if (extra.indexOf("PMCID:") >= 0) {
		index = extra.indexOf("PMCID") + 6;
		extraSub = extra.substring(index);
		id = extraSub.match(/^(\d)+/)[0];
		Zotero.TheLiterature.queryNCBI(item, id, callback, function (result) {
			if (result == true ) {
				item.setField("DOI", result);
				console.log("NCBI search successful");
				callback(true);
			}
			else {
				console.log("NCBI search failed");
				callback(false);
			}
		});
	}
	//Can also try searching by title from google scholar
	//If fails, return false
	else {
		callback(false);
	}
};

Zotero.TheLiterature.queryNCBI = function(item, searchstring, callback) {
	//info at https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
	console.log("starting queryNCBI");
	var baseUrl =  "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/";
	var ids = "?ids=" + searchstring;
	var tool = "&tool=TheLiterature";
	var email = "&email=TheLiterature@protonmail.com";
	var format ="&format=json";
	var request = new XMLHttpRequest();
	//Set parameters for the post
	var fullUrl = baseUrl + ids + tool + email + format;
	//Since only looking for one result, set to synchronous
	request.open("GET", fullUrl, true);
	//Set a generous timeout
	request.timeout = 10000;
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
		console.log(error);
		callback(false);
	};
	request.ontimeout = function (error) {
		console.log(error);
		callback(false);
	};
	request.send();
};

//Take a DOI and lightly test if correctly formatted
Zotero.TheLiterature.testDOI = function(doi) {
	var pattern = new RegExp("(^10.(\\d)+/(\\S)+)");
	if (doi.match(pattern)) {
		return true;
	}
	else {
		return false;
	}
};

//Post a DOI to sci-hub and get PDF
//Should probably move to its own script
Zotero.TheLiterature.getPDF = function(item, callback) {
	var itemDOI = item.getField("DOI");
	var request = new XMLHttpRequest();
	//Set parameters for the post. Using encodeURIComponent to
	//encode special characters often used in DOIs
	var params = encodeURIComponent("request") +
		"=" + encodeURIComponent(itemDOI);
	//Since only looking for one result, set to synchronous
	request.open("POST", sci_hub_url, true);
	//Set a generous timeout
	request.timeout = 10000;
	//Set the proper header information
	request.setRequestHeader("User-Agent", "TheLiterature/" +
		Zotero.TheLiterature.version);
	request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	request.setRequestHeader("Connection", "open");
	//Call a function when the state changes.
	request.onload = function () {
		console.log(request.response);
		var response = request.responseText;
		console.log("request loaded");
		//Take the response text and parse it as HTML
		var parser = new DOMParser();
		var responseHTML = parser.parseFromString(response, "text/html");
		//Search for a PDF download URL, and if present download PDF
		if (responseHTML.getElementById("pdf") != null) {
			console.log("download url is " + responseHTML.getElementById("pdf").src);
			var downloadURL = responseHTML.getElementById("pdf").src;
			var importArguments = {url: downloadURL, libraryID: item.libraryID,
				parentItemID: item.id, collections: undefined};
			Zotero.Attachments.importFromURL(importArguments);
			callback(true);
		}
		//Handle captcha
		//Need to figure out how to display a picture and user input

		//Handle pdf not found
		else if (responseHTML.title ==
			"Sci-Hub: removing barriers in the way of science") {
			console.log("pdf not found");
			callback(false);
		}

		//Handle anything else
		else {
			console.log("wasn't able to handle this case \n", responseHTML);
			callback(false);
		}
	};

	request.onerror = function(err) {
		console.warn(err);
		callback(false);
	};
	request.ontimeout = function(err) {
		console.warn(err);
		callback(false);
	};
	console.log("sending request for" + itemDOI);
	request.send(params);
};

//TODO
//Search for DOI if not available in parent item
//Implement https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
//Display an icon on the toolbar
	//Maybe needs to be in overlay.xul?
	//Provide some menu items under the icon when clicked
//Set up display windows and user input

//Callback function to display download success status
//Should probably make this a stub and have a separate
//subsystem for window handling
//Zotero.TheLiterature.notifier = function(status) {
	// if (status) {
	// 	var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
	// 				getService(Components.interfaces.nsIWindowWatcher);
	// 	successWindow = ww.openWindow(null, "chrome://zotero/content/progressWindow.xul",
	// 					"", "chrome,dialog=no,titlebar=no,popup=yes", null);
	// }
//};
