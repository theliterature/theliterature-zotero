if (!Zotero.TheLiterature) {
    var scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                    .getService(Components.interfaces.mozIJSSubScriptLoader);
    var scripts = ['theliterature', 'crossref'];
    scripts.forEach(s => scriptLoader.loadSubScript('chrome://zotfile/content/scripts/' + s + '.js'));
}


if(window.ZoteroPane) {
	window.addEventListener("load", function() {
		Zotero.TheLiterature.init();
	}, false);
}