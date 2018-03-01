//Define global functions for eslint
/*global Zotero*/
/*eslint no-undef: "error"*/
/*eslint no-console: ["error", { allow: ["warn", "error", "log"] }] */

//Search for available sci-hub mirror.
Zotero.TheLiterature.sciHubMirror = new function() {
	//Load a set of sci-hub mirrors.
	//console.log("Searching for available Sci-hub mirrors");
	this.sci_hub_mirrors = ["http://sci-hub.la", "http://sci-hub.mn", "http://sci-hub.name",
		"http://sci-hub.tv", "http://sci-hub.tw", "http://sci-hub.hk"];

	//First a function that connects to each mirror asynchronously and returns 
	//a promise containing an array with the mirror and the time it took to connect
	this.mirrorTimer = function (mirror) {
		var promise_timer = new Promise(
			function resolver(resolve, reject) {
				var start_time = Date.now(); 
				var request = new XMLHttpRequest();
				request.open("GET", mirror, true);
				request.timeout = 10000;
				request.onload = function () {
					var finish_time = Date.now();
					var load_time = finish_time - start_time;
					resolve([mirror, load_time]);
				};

				request.onerror = function (e) {
					console.log("Something went wrong with requesting mirror:" + mirror);
					console.log(e);
					reject(e);
				};
				request.ontimeout = function (e) {
					console.log(mirror + " timed out!");
					console.log(e);
					reject(e);
				};
				request.send();
			}
		);
		return promise_timer;
	};

	//Iterate through an array of mirrors using a function that returns promises
	//and consolidate the returned promises with Promise.all 
	//Returns an array of promises
	this.consolidateMirrorPromises = function (timer_function, mirror_array) {
		var fulfilled_promises = mirror_array.map(function (mirror) {

			return timer_function(mirror).then(
				function onFulfilled(mirror_time_array) {
					return mirror_time_array;
				},
				function onRejected(error) {
					console.log(error);
					return null;
				}
			);
		});
		return Promise.all(fulfilled_promises);
	};


	//Get fastest time from an array of arrays, with time being the 
	//second element
	this.sortTime = function (array) {
		console.log("Picking fastest mirror");
		var fast_mirror = array.reduce(function (previousValue, currentValue) {
			if (currentValue == null) {
				return previousValue;
			}
			if (currentValue[1] < previousValue[1]) {
				previousValue = currentValue;
			}
			return previousValue;
		}, [null, 10000]);
		if (fast_mirror[0] == null) {
			console.log("No mirror's available")
			return null;
		}
		console.log(fast_mirror)
		console.log(fast_mirror[0])
		return fast_mirror[0];
	};

	//Now to chain them together
	this.fastestMirror = function () {
		return this.consolidateMirrorPromises(this.mirrorTimer, this.sci_hub_mirrors)
			.then(function (array) {
				return Zotero.TheLiterature.sciHubMirror.sortTime(array);
			});
	};
};