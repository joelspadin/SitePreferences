/// <reference path="interfaces.ts" />
/// <reference path="lib/async.d.ts" />
/// <reference path="lib/chrome.d.ts" />
var INJECTED_KEY = 'injected';

var MESSAGE_HANDLERS = {
    save: onSaveMessage
};

function registerEventHandlers() {
    chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
    chrome.tabs.onRemoved.addListener(onTabRemoved);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.runtime.onMessage.addListener(onMessage);
}
registerEventHandlers();

// Because Opera doesn't seem to fire runtime.onInstalled or runtime.onStartup
// when the browser starts any more, this will re-register the context menu
// each and every time the extension gets loaded. I shouldn't have to do this,
// but at least this fixes the issue where the context menu doesn't appear
// until you reload the extension.
function stupidWorkaroundToCreateContextMenu() {
    var CONTEXT_ID = 'page-settings';

    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
        id: CONTEXT_ID,
        title: chrome.i18n.getMessage('context_menu'),
        contexts: ['page'],
        targetUrlPatterns: ['*://*/*']
    });
}

chrome.runtime.onInstalled.addListener(function (details) {
    clearInjectedTabs();

    stupidWorkaroundToCreateContextMenu();
});

stupidWorkaroundToCreateContextMenu();

function onContextMenuClicked(e, tab) {
    // Get the Primary URL pattern for chrome.contentSettings
    var url = getPrimaryUrlPattern(e.pageUrl);

    async.waterfall([
        async.apply(getTabInjected, tab.id),
        // Inject the settings dialog into the page
        function (alreadyInjected) {
            var tasks = [];

            // Only inject styles and the script if we haven't done so yet.
            if (!alreadyInjected) {
                tasks = tasks.concat([
                    async.apply(injectScript, tab.id),
                    async.apply(setTabInjected, tab.id, true)
                ]);
            }

            // Collect each of the content settings for the site
            ['cookies', 'popups', 'javascript', 'notifications', 'plugins', 'images'].forEach(function (setting) {
                tasks.push(async.apply(getContentSettings, setting, url));
            });

            async.parallel(tasks, function (err, results) {
                // Collect all the results and message them to the injected script
                var settings = mergeObjects(results);
                chrome.tabs.sendMessage(tab.id, {
                    action: 'trigger',
                    settings: settings
                });
            });
        }
    ]);
}

function onMessage(message, sender, sendResponse) {
    if (message.action in MESSAGE_HANDLERS) {
        MESSAGE_HANDLERS[message.action](message, sender);
    } else {
        console.log('Unknown action: ' + message.action);
    }
}

function onTabRemoved(tabId, removeInfo) {
    // Remove the tab from the injected tabs list
    setTabInjected(tabId, false);
}

function onTabUpdated(tabId, changeInfo) {
    // Remove the tab from the injected tabs list
    // if it has navigated to a new URL.
    if (changeInfo.url || changeInfo.status === 'complete') {
        setTabInjected(tabId, false);
    }
}

function onSaveMessage(message, sender) {
    var url = getPrimaryUrlPattern(sender.tab.url);

    for (var key in message.settings) {
        if (message.settings.hasOwnProperty(key)) {
            var value = message.settings[key];
            if (value) {
                try  {
                    chrome.contentSettings[key].set({
                        primaryPattern: url,
                        setting: value
                    });
                } catch (e) {
                    console.error('Failed to set ' + key + ' for ' + url + ' to ' + value);
                    console.error(e);
                }
            }
        }
    }
}

function clearInjectedTabs(callback) {
    // Set the list of injected tabs to an empty array
    var items = {};
    items[INJECTED_KEY] = [];
    chrome.storage.local.set(items, function () {
        if (callback) {
            callback(null);
        }
    });
}

function getContentSettings(setting, url, callback) {
    chrome.contentSettings[setting].get({
        primaryUrl: url
    }, function (details) {
        var result = {};
        if (details) {
            result[setting] = details.setting;
        }
        callback(null, result);
    });
}

function getPrimaryUrlPattern(url) {
    var a = document.createElement('a');
    a.href = url;

    if (a.protocol === 'file:') {
        return a.protocol + '//' + a.pathname;
    } else {
        return a.protocol + '//' + a.hostname + '/*';
    }
}

function getTabInjected(tabId, callback) {
    chrome.storage.local.get(INJECTED_KEY, function (items) {
        // Return whether tabId is found in the list of injected tabs
        var list = items[INJECTED_KEY] || [];
        callback(null, list.indexOf(tabId) >= 0);
    });
}

function injectScript(tabId, callback) {
    chrome.tabs.executeScript(tabId, { file: '/js/inject/dialog.js' }, function () {
        callback(null);
    });
}

function mergeObjects(objects) {
    var result = {};

    objects.forEach(function (object) {
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
function setTabInjected(tabId, injected, callback) {
    // Get the list of injected tab IDs
    chrome.storage.local.get(INJECTED_KEY, function (items) {
        var list = items[INJECTED_KEY] || [];
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
            chrome.storage.local.set(items, function () {
                if (callback) {
                    callback(null);
                }
            });
        } else if (callback) {
            callback(null);
        }
    });
}
//# sourceMappingURL=background.js.map
