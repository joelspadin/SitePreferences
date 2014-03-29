/// <reference path="interfaces.ts" />
/// <reference path="lib/async.d.ts" />
/// <reference path="lib/chrome.d.ts" />

var INJECTED_KEY = 'injected';

var MESSAGE_HANDLERS = {
	save: onSaveMessage,
}

function registerEventHandlers() {
	chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
	chrome.tabs.onRemoved.addListener(onTabRemoved);
	chrome.tabs.onUpdated.addListener(onTabUpdated);
	chrome.runtime.onMessage.addListener(onMessage);
}
registerEventHandlers();

chrome.runtime.onInstalled.addListener((details) => {
	var CONTEXT_ID = 'page-settings';

	chrome.contextMenus.create({
		id: CONTEXT_ID,
		title: chrome.i18n.getMessage('context_menu'),
		contexts: ['page'],
		targetUrlPatterns: ['*://*/*'],
	});

	clearInjectedTabs();
});

function onContextMenuClicked(e: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
	// Get the Primary URL pattern for chrome.contentSettings
	var url = getPrimaryUrlPattern(e.pageUrl);

	async.waterfall([
		// Get whether the script is already injected
		async.apply(getTabInjected, tab.id),

		// Inject the settings dialog into the page
		(alreadyInjected: boolean) => {
			var tasks = [];

			// Only inject styles and the script if we haven't done so yet.
			if (!alreadyInjected) {
				tasks = tasks.concat([
					async.apply(injectScript, tab.id),
					async.apply(setTabInjected, tab.id, true),
				]);
			}

			// Collect each of the content settings for the site
			['cookies', 'popups', 'javascript', 'notifications', 'plugins', 'images'].forEach((setting) => {
				tasks.push(async.apply(getContentSettings, setting, url));
			});

			async.parallel(tasks, (err, results) => {
				// Collect all the results and message them to the injected script
				var settings = mergeObjects(results);
				chrome.tabs.sendMessage(tab.id, {
					action: 'trigger',
					settings: settings,
				});
			});
		}
	]);
}

function onMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse) {
	if (message.action in MESSAGE_HANDLERS) {
		MESSAGE_HANDLERS[message.action](message, sender);
	} else {
		console.log('Unknown action: ' + message.action);
	}
}

function onTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {
	// Remove the tab from the injected tabs list
	setTabInjected(tabId, false);
}

function onTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
	// Remove the tab from the injected tabs list
	// if it has navigated to a new URL.
	if (changeInfo.url || changeInfo.status === 'complete') {
		setTabInjected(tabId, false);
	}
}

function onSaveMessage(message: SaveMessage, sender: chrome.runtime.MessageSender) {
	var url = getPrimaryUrlPattern(sender.tab.url);

	for (var key in message.settings) {
		if (message.settings.hasOwnProperty(key)) {
			var value = message.settings[key];
			if (value) {
				try {
					chrome.contentSettings[key].set({
						primaryPattern: url,
						setting: value,
					});
				} catch (e) {
					console.error('Failed to set ' + key + ' for ' + url + ' to ' + value);
					console.error(e);
				}
			}
		}
	}
}

function clearInjectedTabs(callback?: Function) {
	// Set the list of injected tabs to an empty array
	var items = {};
	items[INJECTED_KEY] = [];
	chrome.storage.local.set(items, () => {
		if (callback) {
			callback(null);
		}
	});
}

function getContentSettings(setting: string, url: string, callback: AsyncSingleResultCallback<Object>) {
	chrome.contentSettings[setting].get({
		primaryUrl: url,
	}, (details) => {
			var result = {};
			if (details) {
				result[setting] = details.setting;
			}
			callback(null, result);
		});
}

function getPrimaryUrlPattern(url: string) {
	var a = document.createElement('a');
	a.href = url;

	if (a.protocol === 'file:') {
		return a.protocol + '//' + a.pathname;
	} else {
		return a.protocol + '//' + a.hostname + '/*';
	}
}

function getTabInjected(tabId: number, callback: AsyncSingleResultCallback<boolean>) {
	chrome.storage.local.get(INJECTED_KEY, (items) => {
		// Return whether tabId is found in the list of injected tabs
		var list: number[] = items[INJECTED_KEY] || [];
		callback(null, list.indexOf(tabId) >= 0);
	});
}

function injectScript(tabId: number, callback: Function) {
	chrome.tabs.executeScript(tabId, { file: '/js/inject/dialog.js' }, () => { callback(null) });
}

function mergeObjects(objects: any[]): { [key: string]: any; } {
	var result: { [key: string]: any; } = {};

	objects.forEach((object) => {
		if (!object) {
			return;
		}

		for (var key in object) {
			if (object.hasOwnProperty(key)) {
				result[key] = object[key] || null;
			}
		}
	});

	return result;
}

/**
 * Sets whether we have injected code into a tab
 * @param tabId		The ID of the tab
 * @param injected	Is code injected into the tab?
 * @param callback  Called when finished
 */
function setTabInjected(tabId: number, injected: boolean, callback?: Function) {
	// Get the list of injected tab IDs
	chrome.storage.local.get(INJECTED_KEY, (items) => {
		var list: number[] = items[INJECTED_KEY] || [];
		var changed = false;

		// Update the list of tabs
		if (injected) {
			list.push(tabId);
			changed = true;
		} else {
			var index = list.indexOf(tabId);
			if (index >= 0) {
				list.splice(index, 1);
				changed = true;
			}
		}

		// If the list changed, put it back into storage
		if (changed) {
			items[INJECTED_KEY] = list;
			chrome.storage.local.set(items, () => {
				if (callback) {
					callback(null);
				}
			});
		} else if (callback) {
			callback(null);
		}
	});
}
