//Define global functions for eslint
/*global Zotero ZoteroPane Components Services AddonManager*/
/*eslint no-undef: "error"*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */


Zotero.TheLiterature = new function() {

	this.prefs = null;

	//Initialize plugin to starting state. Mainly copied from the
	//Zotero sample plugin
	this.init = function() {
		//First time setrup. Copied from zotfile
		if(this.prefs === null) {
			// define TheLiterature variables
			this.wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator);
			//Preference docs at https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Code_snippets/Preferences
			this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService).getBranch("extensions.TheLiterature.");
		}

		//Version handling. Copied from zotfile then modified
		this.previous_version = this.getPref("version");
		Components.utils.import("resource://gre/modules/AddonManager.jsm");
		AddonManager.getAddonByID("TheLiterature@protonmail.com", function(addon) {
			if(addon.version != this.previous_version) {
				Zotero.TheLiterature.setPref("version", addon.version);
			}
		});

		// Register a callback in Zotero as an item observer
		if(notifierID === null) {
			var notifierID = Zotero.Notifier.registerObserver(
				this.notifierCallback, ["item"]);
		}

		// Unregister event listeners when the window closes 
		// Important to avoid a memory leak
		window.addEventListener("unload", function() {
			Zotero.Notifier.unregisterObserver(notifierID);
		}, false);

		//Set an initial sci-hub mirror
		this.sci_hub_url = this.getPref("sciHubUrl");
		
		//If no sci-hub  mirror set, find one and set it
		//Should change this into a worker thread...
		//https://developer.mozilla.org/en-US/docs/Archive/Using_workers_in_extensions
		if (!this.sci_hub_url) {
			this.sciHubMirror.fastestMirror()
			.then(function (mirror) {
			console.log("Setting sci-hub url to " + mirror)
			Zotero.TheLiterature.setPref("sciHubUrl", mirror);
			})
		}
	};

	//Set callback to notify if new item is added
	//Also from https://www.zotero.org/support/dev/sample_plugin
	this.notifierCallback = {
		notify: function(event, type, ids, extraData) {
			if (event == "add") {
				var itemsAdded = Zotero.Items.get(ids);
				//Check if item has a pdf
				for (var item of itemsAdded) {
					if (this.hasPDF(item)) {
						return;
					}
					else {
						this.fetchPDF(item);
					}
				}
			}
		}
	};

	/**
	 * Get preference value in 'extensions.zotfile' branch
	 * @param  {string} pref     Name of preference in 'extensions.zotfile' branch
	 * @return {string|int|bool} Value of preference.
	 */
	//Taken from zotfile. Further documentation at
	//https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIPrefService
	//https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Code_snippets/Preferences
	this.getPref = function(pref) {
		var type = this.prefs.getPrefType(pref);
		if (type == 0)
			throw("this.getPref(): Invalid preference value for '" + pref + "'");
		if (type == this.prefs.PREF_STRING)
			return this.prefs.getComplexValue(pref, Components.interfaces.nsISupportsString).data;
		if (type == this.prefs.PREF_INT)
			return this.prefs.getIntPref(pref);
		if (type == this.prefs.PREF_BOOL)
			return this.prefs.getBoolPref(pref);
	};

	/**
	 * Set preference value in 'extensions.zotfile' branch
	 * @param {string}          pref  Name of preference in 'extensions.zotfile' branch
	 * @param {string|int|bool} value Value of preference
	 */
	//Taken from zotfile
	//Why is this a state machine while getPref is a series of ifs?
	this.setPref = function(pref, value) {        
		switch (this.prefs.getPrefType(pref)) {
		case this.prefs.PREF_BOOL:
			return this.prefs.setBoolPref(pref, value);
		case this.prefs.PREF_STRING:
			var str = Components.classes["@mozilla.org/supports-string;1"]
				.createInstance(Components.interfaces.nsISupportsString);
			str.data = value;
			return this.prefs.setComplexValue(pref, Components.interfaces.nsISupportsString, str);
		case this.prefs.PREF_INT:
			return this.prefs.setIntPref(pref, value);
		}
		throw("Zotero.TheLiterature.setPref(): Unable to set preference.");
	};

	//Check if an item has an attached PDF
	this.hasPDF = function(item) {
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
	this.getMissingSelectedItems = function() {
		var missingItems = [];
		for (var item of ZoteroPane.getSelectedItems()) {
			if (!this.hasPDF(item)) {
				missingItems.push(item);
			}
		}
		this.fetchPDFs(missingItems);
	};

	//Get pdfs for all user selected items
	this.getAllSelectedItems = function() {
		this.fetchPDFs(ZoteroPane.getSelectedItems());
	};

	//Main function to fetch pdf for individual items
	this.fetchPDFs = function(items) {
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
				this.searchDOI(item, function (response) {
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
			if (!this.testDOI(item.getField("DOI"))) {
				//if not valid, try to search for a vaild doi
				this.searchDOI(item, function (response) {
					//If search fails, bail
					if (response == false) {
						console.warn("DOI misformatted for ", item.getField("title"),
							" and unable to find replacement");
						searchable = false;
					}
					else {
						//If search succeeds, test again
						if (!this.testDOI(item.getField("DOI"))) {
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
				this.getPDF(item, function (result) {
					console.log("getting PDF for ", item.getField("title"));
					if (result == false) {
						console.warn("Unable to download PDF for ", item.getField("title"));
					}
				});
			}
		}
	};

	//Function to search for missing DOI based on item title
	this.searchDOI = function(item, callback) {
		//If search successful, set DOI field for Zotero item and return true
		//First look based on PMID or PMCID
		var extra = item.getField("extra");
		if (extra.indexOf("PMID:") >= 0) {
			var index = extra.indexOf("PMID") + 6;
			var extraSub = extra.substring(index);
			var id = extraSub.match(/^(\d)+/)[0];
			this.queryNCBI(item, id, callback, function (result) {
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
			this.queryNCBI(item, id, callback, function (result) {
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

	this.queryNCBI = function(item, searchstring, callback) {
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
	this.testDOI = function(doi) {
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
	this.getPDF = function(item, callback) {
		var itemDOI = item.getField("DOI");
		var request = new XMLHttpRequest();
		//Set parameters for the post. Using encodeURIComponent to
		//encode special characters often used in DOIs
		var params = encodeURIComponent("request") +
			"=" + encodeURIComponent(itemDOI);
		//Since only looking for one result, set to synchronous
		request.open("POST", this.sci_hub_url, true);
		//Set a generous timeout
		request.timeout = 10000;
		//Set the proper header information
		request.setRequestHeader("User-Agent", "TheLiterature/" +
			this.version);
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
//this.notifier = function(status) {
	// if (status) {
	// 	var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
	// 				getService(Components.interfaces.nsIWindowWatcher);
	// 	successWindow = ww.openWindow(null, "chrome://zotero/content/progressWindow.xul",
	// 					"", "chrome,dialog=no,titlebar=no,popup=yes", null);
	// }
//};
