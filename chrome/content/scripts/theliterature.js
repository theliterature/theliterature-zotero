//Define global functions for eslint
/*global Zotero Components AddonManager*/
/*eslint no-undef: "error"*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */


Zotero.TheLiterature = new function() {

	this.prefs = null;

	//Initialize plugin to starting state. Mainly copied from the
	//Zotero sample plugin and zotfile.
	this.init = function() {
		//Detect if this is the first time setting up.
		if(this.prefs === null) {
			//Set up a window mediator with Zotero
			this.wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator);
			//Set up preference service with Zotero
			//Documentation on preferences at 
			//https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Code_snippets/Preferences
			this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService)
				.getBranch("extensions.TheLiterature.");
		}

		//Version handling. Copied from zotfile then modified
		//Fetch the version number hard coded in preferences
		//**TODO** set up automatic updates
		this.version = this.getPref("version");
		//Ask Zotero what version it has loaded
		Components.utils.import("resource://gre/modules/AddonManager.jsm");
		AddonManager.getAddonByID("TheLiterature@protonmail.com", function(addon) {
			//If the version Zotero returns doesn't equal that in preferences
			//assume that Zotero version is newer and set it in preferences
			if(addon.version != this.version) {
				Zotero.TheLiterature.setPref("version", addon.version);
			}
		});

		//Register a callback in Zotero as an item observer
		//Can then catch item changes and act on them if needed
		if(notifierID === null) {
			var notifierID = Zotero.Notifier.registerObserver(
				this.notifierCallback, ["item"]);
		}

		//Unregister event listeners when the window closes 
		//Originally loaded in include.js
		window.addEventListener("unload", function() {
			Zotero.Notifier.unregisterObserver(notifierID);
		}, false);

		//Set an initial sci-hub mirror by fetching from preferences
		//**TODO**Need to set up a preferences window so that users can
		//modify the default mirror
		this.sci_hub_url = this.getPref("sciHubUrl");
		
		//Load a set of sci-hub mirrors to test into an array
		this.sci_hub_mirrors = ["http://sci-hub.is", "http://sci-hub.se",
			"https://sci-hub.se", "http://sci-hub.tw", "https://sci-hub.tw"];
		
		//See if the saved mirror is up
		var url_test = Zotero.TheLiterature.findSciHubMirror
			.mirrorTest(this.sci_hub_url);
		url_test.then(console.log("using ", this.sci_hub_url))
			//If the mirror is not up, find one and set it
			.catch(function () {
				var fast_mirror = Zotero.TheLiterature.findSciHubMirror
					.findFastestMirror(Zotero.TheLiterature.sci_hub_mirrors);
				fast_mirror.then(function(mirror) {
					console.log("setting ", mirror);
					Zotero.TheLiterature.setPref("sciHubUrl", mirror);
				})
					//Bail if no mirrors found
					.catch(function(err) {
						console.log(err);
						console.log("Could not find a working sci-hub mirror,\
							is your internet working?");
					});

			});
	};

	//Taken from zotfile and modified. Further documentation on preferences at
	//https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIPrefService
	//https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Code_snippets/Preferences
	this.getPref = function(pref) {
		switch (this.prefs.getPrefType(pref)) {
		case this.prefs.PREF_BOOL:
			return this.prefs.getBoolPref(pref);
		case this.prefs.PREF_STRING:
			return this.prefs.getComplexValue(pref,
				Components.interfaces.nsISupportsString).data;
		case this.prefs.PREF_INT:
			return this.prefs.getIntPref(pref);
		}
		throw("Zotero.TheLiterature.getPref(): ",
			"Invalid preference value for '" + pref + "'");
	};


	//Modified from zotfile
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
		throw("Zotero.TheLiterature.setPref(): Unable to set preference for ",
			pref);
	};

	//Check if a parent item has an attached PDF
	//return true if PDF present, false if not
	this.hasPDF = function(item) {
		//Get list of attachments to the item and filter for those that are PDFs
		var attachments = item.getAttachments()
			//getAttachments() returns an array with numeric references to the 
			//actual attachment. Use map and Zotero.Items.get to fetch the
			//actual attachment object
			.map(item => typeof item == "number" ? Zotero.Items.get(item) : item)
			//Filter for attachment objects. Not sure if necessary but Zotfile
			//does this
			.filter(att => att.isAttachment())
			//Filter for attachments that are of type PDF
			.filter(att => att.attachmentContentType == "application/pdf");
		//Test to see if any PDF attachments in the list
		if (attachments.length > 0) {
			return true;
		}
		else {
			return false;
		}
	};

	//Function to search for missing DOI from online sources
	//First tries NCBI's id converter API and then Crossref
	//If search is successful, indirectly returns a promise containing the DOI
	//If unsuccessful returns a rejected promise
	this.searchDOI = function(item) {
		//See  if a PMID or PMCID is stored in the item's 'extra' field
		var extra = item.getField("extra");
		//The extra field isn't strictly formatted so need to search for a
		//string starting with 'PMID:' or 'PMCID:'
		//indexOf() returns -1 if not found, otherwise a number indicating
		//the character index the string starts with
		var pmidIndex = extra.indexOf("PMID:");
		var pmcidIndex = extra.indexOf("PMCID:");

		if (pmidIndex >= 0) {
			//Now shift the index to the start of the pmid value 
			pmidIndex = pmidIndex + 6;
			//Get the substring starting at that index
			var extraSub = extra.substring(pmidIndex);
			//Use regex to get the string of digits
			var id = extraSub.match(/^(\d)+/)[0];
			//Now search NCBI to see if they have a DOI match for the PMID
			return this.queryNCBI(item, id)
				//If the NCBI search fails, try crossref
				.catch(function() {
					return Zotero.TheLiterature.findDOI.queryCrossref(item);
				});
		}

		//Same  as above, but with PMCID instead of PMID
		else if (pmcidIndex >= 0) {
			pmcidIndex = pmcidIndex + 6;
			extraSub = extra.substring(pmcidIndex);
			id = extraSub.match(/^(\d)+/)[0];
			return this.queryNCBI(item, id)
				.catch(function() {
					return Zotero.TheLiterature.findDOI.queryCrossref(item);
				});
		}
		//Can also try searching crossref
		else {
			return Zotero.TheLiterature.findDOI.queryCrossref(item);
		}
	};

	//Function to get the DOI of an item from Zotero. The DOI can be stored in a
	//couple of places, so need to check them all
	this.getDOI = function (item) {
		//Check the DOI field
		if (item.getField("DOI")) {
			return item.getField("DOI");
		}
		//See  if a DOI is stored in the item's 'extra' field
		var extra = item.getField("extra");
		//The extra field isn't strictly formatted so need to search for a
		//string starting with 'DOI:'
		var doiIndex = extra.indexOf("DOI:");
		//indexOf() returns -1 if not found, otherwise a number indicating
		//the character index the string starts with
		if (doiIndex >= 0) {
			//Move the index to the start of the actual DOI
			doiIndex = doiIndex + 5;
			//Get the substring starting at that index
			var extraSub = extra.substring(doiIndex);
			//Use regex to match a DOI
			var pattern = new RegExp("(^10.(\\d)+/(\\S)+)");
			//Return the DOI
			return extraSub.match(pattern)[0];
		}
		//If no DOI found, return false
		return false;
	};

	//Function to set the DOI field of an item in Zotero
	this.setDOI = function (item, doi) {
		//Some item types don't allow for a DOI field. First try to
		//set the DOI field.
		try {
			item.setField("DOI", doi);
		} catch (error) {
		//If the DOI field fails, save in the extra field
			console.log(error);
			console.log("Error saving doi, saving to 'extra' field");
			//Preserve the current content of the 'extra' field
			var savedExtraField = item.getField("extra");
			//Set the field with its prior content, a newline, and then the DOI
			item.setField("extra", savedExtraField + "\n"
				+ "DOI: " + doi);
		}
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

	//Take a list of items and fetch PDFs for each
	this.fetchPDFs = function(items) {
		items.map(item => this.fetchPDF(item));
	};

	//Inspect item for correct DOI then fetch PDF
	this.fetchPDF = function(item) {
		//To get a PDF from sci-hub, we need a doi to be present and valid
		//First check for a DOI
		if (!this.getDOI(item)) {
			//if not present, try to search for a vaild doi
			this.searchDOI(item)
				//searchDOI() returns a promise. If the promise is resolved
				//a valid DOI was found and has been set in the Zotero database.
				.then(function(doi) {
					return Zotero.TheLiterature.sciHub.getPDF(item);
				})
				.catch(function(err) {
					console.log("No DOI found for " + 
						item.getField("title") +
						" and unable to find replacement");
					console.log(err);
					return false;
				});
		}
		//If there is a DOI, test that it is valid
		else if (!this.testDOI(this.getDOI(item))) {
			//If not valid, search for a valid DOI
			//searchDOI() both searches and tests the response for validity
			//searchDOI() returns a promise. If the promise is resolved
			//a valid DOI was found and has been set in the Zotero databse.
			this.searchDOI(item)
				.then(function(doi) {
					this.setDOI(doi);
					return Zotero.TheLiterature.sciHub.getPDF(item);
				})
				.catch(function() {
					console.log("DOI misformatted for " + 
						item.getField("title") +
						" and unable to find replacement");
					return false;
				});
		}
		else {
			return Zotero.TheLiterature.sciHub.getPDF(item);
		}
	};

	//Get missing pdfs for user selected items
	//via ZoteroPane.getSelectedItems()
	this.getMissingSelectedItems = function(items) {
		var missingItems = [];
		for (var item of items) {
			if (this.hasPDF(item) === false) {
				missingItems.push(item);
			}
		}
		this.fetchPDFs(missingItems);
	};

	//Get pdfs for all user selected items
	//ZoteroPane.getSelectedItems()
	this.getAllSelectedItems = function(items) {
		this.fetchPDFs(items);
	};
};

//TODO
//	Window to display download progress and success status
//  Automatic updates
//  Preferences window
//  ?Automatic downloading for newly added items without attachments?
//  Get the context-menu icon to work