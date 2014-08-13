/// <reference path="lib/chrome.d.ts" />
/// <reference path="inject/dialog.ts" />

var port = chrome.runtime.connect({ name: 'SitePreferencesPopup' });
port.onMessage.addListener((message) => {
	console.log(message);
	onDialogMessage(message, null, null);
});
port.postMessage({ action: 'popup' });