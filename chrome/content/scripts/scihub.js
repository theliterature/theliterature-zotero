//Define global functions for eslint
/*global Zotero*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

//Methods to fetch PDFs from sci-hub using functional composition
//Usual flow is the client POSTs a DOI to sci-hub and gets a URL in response
//The client then GETs the URL from sci-hub 
//but the response can be a PDF or captcha challenge
//Answer the challenge with a POST, then finally receive the PDF
Zotero.TheLiterature.sciHub = new function() {

	this.getPDF = function(item) {
		//Having trouble passing multiple values via promises so set a variable
		//for the item's sci-hub download url at a higher scope
		var item_url = "";
		//Before this function is called, a DOI should have been assigned to
		//the item, but let's check
		var itemDOI = Zotero.TheLiterature.getDOI(item);
		if (!Zotero.TheLiterature.testDOI(itemDOI)) {
			console.log("item doesn't have a valid DOI. Aborting");
			return false;
		}
		//Post the DOI to sci-hub and get's back the direct download url
		return this.postDOI(item, itemDOI)
			//Now use the direct url to import the PDF into Zotero
			.then(function(array) {
				[item, item_url] = array;
				console.log("importing " + item.getField("title") + 
					" to Zotero");
				//Would like to pass both the promise from the 
				//Zotero.Attachments.importFromURL() function and the item_url 
				//but if passed together in an array a rejected promise doesn't
				//trigger the catch handler. Maybe due to Zotero using the 
				//bludbird promise library rather than ES6. For now using the 
				//higher scope item_url variable to pass the value
				return Zotero.Attachments.importFromURL({parentItemID : item.id,
					url : item_url});
			})
			.then(function() {
				console.log("Successfully imported " + 
					item.getField("title"));
				return item;
			})
			.catch(function(err) {
				var url = item_url;
				//Check if the Zotero.Attachments.importFromURL() function 
				//failed due to not getting a PDF. Often happens when a captcha
				//challenge is sent instead.
				if (err.message) {
					if (err.message.startsWith("Downloaded PDF did not have MIME" +
					" type 'application/pdf'")) {
						console.log(err.message);
						console.log("Likely captcha, trying " + url);
						//Okay let's try to deal with the captcha
						return Zotero.TheLiterature.sciHub
							.getPDFwithCaptcha(item, url);
					}
				}
				else {
					console.log("unexpected error");
					console.log(err);
				}
			});
	};

	this.getPDFwithCaptcha = function(item, url) {
		return Zotero.TheLiterature.sciHub.getCaptchaImage(item, url)
			.then(function (array) {
				Zotero.TheLiterature.sciHub.displayCaptchaToUser(array);
			})
			.catch(function(err) {
				console.log(err);
			});
	};

	//Post a DOI to sci-hub 
	//Return a promise containing the url to directly download the PDF
	this.postDOI = function(item, itemDOI) {
		console.log("POSTing DOI to SciHub for ", item.getField("title"));
		return new Promise(function resolver(resolve, reject) {
			var request = new XMLHttpRequest();
			//Set parameters for the post. Using encodeURIComponent() to
			//encode special characters often used in DOIs
			var params = encodeURIComponent("request") +
				"=" + encodeURIComponent(itemDOI);
			request.open("POST", Zotero.TheLiterature.sci_hub_url, true);
			//Set a generous timeout
			request.timeout = 30000;
			//Set the proper header information
			request.setRequestHeader("User-Agent", "TheLiterature/" +
				Zotero.TheLiterature.version);
			request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
			request.responseType = "document";
			request.onload = function() {
				//See if we got the expected type of response
				var tested = Zotero.TheLiterature.sciHub
					.testForPDF(request.response);
				if (tested) {
					resolve([item,tested]);
				}
				else {
					console.log("failed PDF test");
					reject(request.response);
				}
			};
			request.onerror = function(err) {
				console.log("ajax error");
				console.log(err);
				console.log(err.target.status);
				console.log(err.target.statusText);
				reject(err);
			};
			request.ontimeout = function(err) {
				console.log("sci-hub timed out while getting PDF");
				reject(err);
			};
			//Now that all of the handlers are defined, fire off the request
			request.send(params);
		}
		);
	};

	//Test if Sci-hub's response is a PDF or has a PDF download link
	//Return the download URL if true, null if not a PDF
	this.testForPDF = function (response) {
		console.log("testing sci-hub response for a PDF");					
		//Search for a PDF download URL, and if present download PDF
		if (response.getElementById("pdf")) {
			//Sometimes get a response with a "chrome://" scheme
			//Test to see if there's a scheme (http) 
			//included in the returned uri
			if (response.getElementById("pdf").src
				.startsWith("chrome")) {
				//Slice "chrome" off the returned uri and add http
				//**TODO** don't assume it's http (could be https) and get the 
				//scheme from the download url
				var downloadURL = "http" + 
					response.getElementById("pdf")
						.src.slice(6);
			}
			else {
				//Otherwise save the returned url
				downloadURL = response.getElementById("pdf").src;
			}
			console.log("download url is " + downloadURL);
			return(downloadURL);
		}

		//Newer versions of sci-hub now put the link in an "article" iframe
		else if (response.getElementById("article")) {
			if (response.getElementById("article").src
				.startsWith("chrome")) {
				//Slice "chrome" off the returned uri and add http
				//**TODO** don't assume it's http (could be https) and get the 
				//scheme from the download url
				downloadURL = "http" + 
					response.getElementById("pdf")
						.src.slice(6);
			}
			else {
				//Otherwise save the returned url
				downloadURL = response.getElementById("pdf").src;
			}
			console.log("download url is " + downloadURL);
			return(downloadURL);
		}

		//See if a direct PDF was returned. Usually a url ending in pdf then a
		//hash and fragment afterwards
		else if(response.URL.indexOf("#") > -1) {
			if (response.URL.substring(response.URL.indexOf("#") - 3, 
				response.URL.indexOf("#")) === "pdf") {
				console.log("returned a direct link");
				return(response.URL);
			}
		}

		//Handle pdf not found
		//Should probably find a more specific way to test for this
		//but generally a generic response with Sci-hub in the 
		//title is a marker for a failed search
		else if (response.title ==
			"Sci-Hub: removing barriers in the way of science"){
			console.log("pdf not found by sci-hub");
			return(null);
		}

		//Handle sci-hub returning a framed HTML page instead of a PDF
		//Sci-hub often does this for open access journals
		else if (response.getElementsByClassName("donate")[0] !== undefined 
				&& response.getElementsByClassName("donate")[0]
					.outerHTML.search("sci_hub") > -1) {
			console.log("sci-hub returned a webpage, not a pdf");
			console.log(response);
			return(null);
		}
		
		//Sometimes sci-hub will point to a libgen link for a book or chapter
		else if (response.URL.startsWith("http://libgen.io")) {
			console.log("Sci-Hub returned a book or chapter from libgen");
			return(null);
			//**TODO** develop a way to get these pdfs
		}

		//Handle anything else
		else {
			console.log("wasn't able to handle this sci-hub response");
			console.log(response.URL);
			console.log(response.title);
			console.log(response);
			return(null);
		}
	};

	//If Zotero.importFromURL fails, it's likely due to a captcha
	//First, get the image and return it's src url along with its "key"
	//ID needed to respond to it
	this.getCaptchaImage = function (item, captcha_response_url) {
		return new Promise(function resolver(resolve, reject) {
			var request = new XMLHttpRequest();
			console.log("getting captcha for " + item.getField("title") +
			" from " + captcha_response_url);
			request.open("GET", captcha_response_url, true);
			//Set a generous timeout
			request.timeout = 30000;
			request.setRequestHeader("User-Agent", "TheLiterature/" +
				Zotero.TheLiterature.version);
			request.responseType = "document";
			request.onload = function () {
				//console.log(request.response);
				var response = request.response;
				if (response.getElementById("captcha")) {
					console.log("got a captcha");
					var img_url = response.getElementById("captcha").src;
					//Also need the image filename as its "key"
					var img_key = img_url.split("/").pop().slice(0, -4);
					console.log(img_url);
					var reply = [item, img_url, img_key, captcha_response_url];
					resolve(reply);
				}
				else if (Zotero.TheLiterature.sciHub.testForPDF(response)) {
					console.log("importing " + item.getField("title") + 
						" to Zotero");
					resolve(Zotero.Attachments.importFromURL(
						{parentItemID : item.id, url : captcha_response_url}));
				}
				else {	
					console.log("Got something besides a captcha");
					console.log(response);
					reject(response);
				}
			};
			request.onerror = function(err) {
				console.log("ajax error");
				console.log(err);
				console.log(err.target.status);
				console.log(err.target.statusText);
				reject(err);
			};
			request.ontimeout = function(err) {
				console.log("sci-hub timed out while getting captcha image");
				reject(err);
			};
			request.send();
		});
	};

	//Display a dialog to the user with the captcha image
	//**TODO** Currently can't handle multiple captcha requests
	this.displayCaptchaToUser = function(array) {
		console.log("Displaying captcha");
		//Unpack the array passed by the promise
		var [item, img_url, img_key, captcha_response_url] = array;
		//Set up variables to pass from the prompt window 
		//via openDialog()
		var window_args = {item:item, img_src:img_url, key:img_key, 
			response_url:captcha_response_url};

		//Now open the window
		//Appears this is rejecting before awaiting user input
		Zotero.TheLiterature.sciHub.captcha_window = window.openDialog(
			"chrome://TheLiterature/content/captcha.xul", "captcha_prompt", 
			"dialog", window_args);
	};

	//Button handler function for the captcha dialog. Takes user input and sends
	//it to postCaptchaText()
	this.returnText = function () {
		try {
			//Make sure it's not empty
			console.log("testing response");
			if (!Zotero.TheLiterature.sciHub.testReturnedTextValid()) {
				Zotero.TheLiterature.sciHub.captcha_window.document
					.getElementById("captcha_text").setAttribute("value",
						"Please fill in the captcha");
				return false;
			}
			var captcha_text = Zotero.TheLiterature.sciHub.captcha_window
				.document.getElementById("captcha_text").value;
			var item = Zotero.TheLiterature.sciHub.captcha_window.window
				.arguments[0].item;
			var img_key = Zotero.TheLiterature.sciHub.captcha_window.window
				.arguments[0].key;
			var captcha_response_url = Zotero.TheLiterature.sciHub
				.captcha_window.window.arguments[0].response_url;
			//Take the returned text and post it back to sci-hub
			console.log("calling postCaptchaText");
			this.postCaptchaText(item, captcha_text, img_key,
				captcha_response_url)
				.then(function(array) {
					var [item, item_url] = array;
					console.log("importing " + item.getField("title") + 
					" to Zotero");
					return Zotero.Attachments.importFromURL({
						parentItemID : item.id, url : item_url});
				})
				.then(function() {
					console.log("Successfully imported " + 
						item.getField("title"));
					return item;
				})
				.catch(function(err) {
					console.log("Captcha response failed");
					console.log(err.message);
				});
		}
		catch(e) {
			console.log("error returning user inputted text");
			console.log(e);
			return false;
		}
	};

	//User input validation
	//**TODO** Expand this to do further input validation
	this.testReturnedTextValid = function() {
		if (Zotero.TheLiterature.sciHub.captcha_window.document
			.getElementById("captcha_text").value == "") {
			console.log("empty text");
			return false;
		}
		//**TODO** test if 6 characters long
		else {
			return true;
		}
	};

	//Button handler for captcha dialog
	this.returnCancel = function() {
		console.log("user canceled captcha input");
		return true;
	};

	//Take user's captcha text input and post to sci-hub to get PDF
	//Returns the item and the download url if successful
	//**TODO** test and handle if incorrect captcha text was entered
	this.postCaptchaText = function(item, captcha_text, image_key, reply_url) {
		console.log("POSTing captcha text back to sci-hub");
		return new Promise(function resolver(resolve, reject) {
			var request = new XMLHttpRequest();
			var params = "id=" + image_key + "&answer=" + captcha_text;
			request.open("POST", reply_url, true);
			//Set a generous timeout
			request.timeout = 30000;
			//Set the proper header information
			request.setRequestHeader("User-Agent", "TheLiterature/" +
				this.version);
			request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
			request.responseType = "document";
			//This is firing twice. Why?
			request.onload = function() {
				//**TODO** test and handle if incorrect captcha text was 
				//supplied
				console.log(request.response);
				var tested = Zotero.TheLiterature.sciHub
					.testForPDF(request.response);
				if (tested) {
					resolve([item,tested]);
				}
				else {
					reject(item);
				}
			};
			request.onerror = function(err) {
				console.log("ajax error");
				console.log(err);
				reject(err);
			};
			request.ontimeout = function(err) {
				console.log("sci-hub timed out while getting PDF");
				reject(err);
			};
			//Now that all of the handlers are defined, fire off the request
			console.log("posting");
			request.send(params);
		});
	};
};