//Define global functions for eslint
/*global Zotero*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

//Methods to search for available sci-hub mirrors.
Zotero.TheLiterature.sciHubMirror = new function() {
	//Load a set of sci-hub mirrors to test into an array

	this.sci_hub_mirrors = ["http://sci-hub.la", "http://sci-hub.mn",
		"http://sci-hub.name", "http://sci-hub.tv", "http://sci-hub.tw",
		"http://sci-hub.hk"];

	//First a function that connects to each mirror asynchronously and returns 
	//a promise containing an array with the mirror and the time it took
	// to connect
	this.mirrorTimer = function (mirror) {
		var promise_timer = new Promise(
			function resolver(resolve, reject) {
				//Use Date.now() to  start a timer
				var start_time = Date.now(); 
				//Send a standard ajax request
				var request = new XMLHttpRequest();
				request.open("GET", mirror, true);
				//Sci-hub mirrors can be slow. Set a generous timeout
				request.timeout = 10000;
				//Function to stop the timer once the page has loaded
				request.onload = function () {
					var finish_time = Date.now();
					var load_time = finish_time - start_time;
					//Return an array with the mirror and the time taken to
					// connect
					resolve([mirror, load_time]);
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
			}
		);
		//Return the array or an error
		return promise_timer;
	};

	//Iterate through an array of mirrors using map to
	//apply a function that returns promises and
	//consolidate the returned promises into a single array with Promise.all()
	//Arguments are an array of mirrors and
	//the function used to generate a promise for each array element
	//Returns an array of promises (and nulls if errors arise)
	this.consolidateMirrorPromises = function (timer_function, mirror_array) {
		var fulfilled_promises = mirror_array.map(function (mirror) {

			return timer_function(mirror).then(
				function onFulfilled(mirror_time_array) {
					return mirror_time_array;
				},
				function onRejected(error) {
					return null;
				}
			);
		});
		return Promise.all(fulfilled_promises);
	};


	//Take an array of arrays. The first element of each subarray
	//is a mirror's url and the second element of each
	//component array being the connection time
	//Then return the url with the fastest time
	this.sortTime = function (array) {
		//Use reduce() to shrink the array down to the component
		//array with the shortest connection time
		var fast_mirror = array.reduce(function (previousValue, currentValue) {
			if (currentValue == null) {
				return previousValue;
			}
			if (currentValue[1] < previousValue[1]) {
				previousValue = currentValue;
			}
			return previousValue;
		//Set the initial value to the same value as the timeout in
		//mirrorTimer() because no connection times should be greater than that
		}, [null, 10000]);
		if (fast_mirror[0] == null) {
			console.warn("No Sci-Hub mirror's available. ",
				"Is your internet connection up?");
			return null;
		}
		return fast_mirror[0];
	};

	//Now to chain the functions together utilizing promises and then()
	this.fastestMirror = function () {
		return this.consolidateMirrorPromises(this.mirrorTimer, 
			this.sci_hub_mirrors)
			.then(function (array) {
				//Using "this" in the scope here doesn't work. Need the
				//complete function title
				return Zotero.TheLiterature.sciHubMirror.sortTime(array);
			});
	};
};