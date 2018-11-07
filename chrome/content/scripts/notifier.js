//Define global functions for eslint
/*global Zotero*/

Zotero.TheLiterature.notifierCallback = new function() {

	//Set callback to notify if new item is added
	//Code modified from the zotero sample plugin
	//Zotfile makes this a coroutine, which is interesting. Should look into that
	this.notify = function (event, type, ids, extraData) {
		//If a new item is added without a PDF and the user has opted for 
		//automatic PDF fetching, then try to fetch a PDF
		if (type == "item" && event == "add" && 
			this.getPref("automaticPdfFetch") != false) {
			//Gather up all the items that were added
			//Then filter for just top level items that don't already
			//have PDFs. Then use map() to run fetchPDFs() on each item
			Zotero.Items.get(ids)
				.filter(item => item.isTopLevelItem())
				.filter(item => !item.Zotero.TheLiterature.hasPDF())
				.map(item => item.Zotero.TheLiterature.fetchPDFs());
		}
	};
};