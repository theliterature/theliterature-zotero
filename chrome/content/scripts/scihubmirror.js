//Define global functions for eslint
/*global Zotero*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

//Search for available sci-hub mirrors.
Zotero.TheLiterature.findSciHubMirror = new function() {

	//First a function that takes a URL and returns 
	//a promise on successful connection
	this.mirrorTest = function(mirror) {
		return new Promise(function resolver(resolve, reject) {
			//Send a standard ajax request
			var request = new XMLHttpRequest();
			request.open("GET", mirror, true);
			//Sci-hub mirrors can be slow. Set a generous timeout
			request.timeout = 15000;
			//Function to stop the timer once the page has loaded
			request.onload = function () {
				if (this.status >= 200 && this.status < 300) {
					//Success! Resolve the promise
					console.log(mirror, " responded successfully");
					resolve(mirror);
				}
				else {
					console.log(mirror, " responded with status ", this.status);
					reject();
				}
			};
			//Handle connection errors
			request.onerror = function (e) {
				console.log("Something went wrong with requesting mirror:"
					+ mirror);
				reject(e);
			};
			//Handle connection timeouts
			request.ontimeout = function (e) {
				console.log(mirror + " timed out!");
				reject(e);
			};
			//Send off the request.
			request.send();
		});
	};

	//Take an array of promises and use an inversion of 
	//Promise.all() to return the first successful promise.
	//https://stackoverflow.com/questions/37234191/resolve-es6-promise-with-first-success
	this.firstSuccess = function(promise_array) {
		
		return Promise.all(promise_array.map(function (mirror) {
			// If a request fails, count that as a resolution so it will keep
			// waiting for other possible successes. If a request succeeds,
			// treat it as a rejection so Promise.all immediately bails out.
			return mirror.then(
				val => Promise.reject(val),
				err => Promise.resolve(err)
			);
		})).then(
			// If '.all' resolved, we've just got an array of errors.
			errors => Promise.reject(errors),
			// If '.all' rejected, we've got the result we wanted.
			val => Promise.resolve(val)
		);
	};

	//Now to put it all together
	this.findFastestMirror = function(url_array) {
		return this.firstSuccess(url_array.map(url => this.mirrorTest(url)));
	};
};