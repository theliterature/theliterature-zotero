//Define global functions for eslint
/*global Zotero Components*/

if (!Zotero.TheLiterature) {
	var scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Components.interfaces.mozIJSSubScriptLoader);
	var scripts = ["theliterature", "findDOI", "notifier", "scihubmirror",
		"scihub"];
	scripts.map(s => scriptLoader.loadSubScript(
		"chrome://TheLiterature/content/scripts/" + s + ".js"));
}


if(window.ZoteroPane) {
	window.addEventListener("load", function() {
		Zotero.TheLiterature.init();
	}, false);
}