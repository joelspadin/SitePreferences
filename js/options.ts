/// <reference path="lib/chrome.d.ts" />
/// <reference path="lib/async.d.ts" />

var CONTENT_TYPE_TITLES = {
	cookies: localize('type_cookie'),
	images: localize('type_image'),
	javascript: localize('type_script'),
	notifications: localize('type_notification'),
	plugins: localize('type_plugin'),
	popups: localize('type_popup'),
	all: localize('type_all'),
}

function addResetButton(button: HTMLElement) {
	var self = this;
	var contentType = button.getAttribute('data-content-type');
	var typeString = CONTENT_TYPE_TITLES[contentType];

	button.addEventListener('click', (e: Event) => {
		var title = localize('title_reset_settings', typeString);
		var message = localize('msg_confirm_reset', typeString);

		button.setAttribute('disabled', 'disabled');
		ModalDialog.confirm(
			title,
			message,
			(result) => {
				if (result) {
					resetContentSettings(contentType);
					window.location.reload();
				}
				button.removeAttribute('disabled');
			});
	});
}

function resetContentSettings(contentType: string) {
	if (contentType === 'all') {
		for (var key in CONTENT_TYPE_TITLES) {
			if (CONTENT_TYPE_TITLES.hasOwnProperty(key) && key !== 'all') {
				resetContentSettings(key);
			}
		}
	} else {
		chrome.contentSettings[contentType].clear({ scope: 'regular' });
	}
}

function versionCheck() {
	// Compare the browser version to the first version with the 'ask' bug fixed.
	// (http://blogs.opera.com/desktop/changelog21/#b1419.0)
	var supportedVersion = [21, 0, 1419, 0];
	var match = navigator.appVersion.match(/OPR\/((?:\d+.)+\d+)/);
	if (match) {
		var version = match[1].split('.').map((part) => parseInt(part));
		var oldVersion = false;
		var newVersion = false;
		for (var i = 0; i < version.length; i++) {
			if (version[i] < supportedVersion[i]) {
				// Version is older. Show the warning.
				oldVersion = true;
				break;
			} else if (version[i] > supportedVersion[i]) {
				// Version is newer. Don't show the warning.
				newVersion = true;
				break;
			}
		}

		// Version is neither newer nor older. Make sure it is the same.
		if (!oldVersion && !newVersion) {
			if (supportedVersion.length != version.length) {
				oldVersion = true;
			}
		}

		if (oldVersion) {
			// This version can't set plug-ins to 'ask'. Show a warning.
			document.querySelector('#version-warning').removeAttribute('hidden');
		}
	} else {
		// This isn't Opera. Warn that some features might not work.
		document.querySelector('#browser-warning').removeAttribute('hidden');
	}
}

document.addEventListener('DOMContentLoaded', () => {
	var buttons = document.querySelectorAll('button[data-content-type]');
	for (var i = 0; i < buttons.length; i++) {
		addResetButton(<HTMLButtonElement>buttons[i]);
	}

	versionCheck();

	GlobalPlugins.buildSettings(<HTMLElement>document.querySelector('#plugins'));
});

module experimental {
	var LEFT = 37;
	var UP = 38;
	var RIGHT = 39;
	var DOWN = 40;
	var B = 66;
	var A = 65;

	var SEQUENCE = [UP, UP, DOWN, DOWN, LEFT, RIGHT, LEFT, RIGHT, B, A];
	var index = 0;

	document.addEventListener('keydown', (e) => {
		if (e.keyCode === SEQUENCE[index]) {
			index += 1;
			if (index >= SEQUENCE.length) {
				onCodeEntered();
				index = 0;
			}
		} else {
			index = 0;
		}
	}, false);

	function onCodeEntered() {
		var hidden = document.querySelectorAll('section[hidden]');
		for (var i = 0; i < hidden.length; i++) {
			(<HTMLElement>hidden[i]).removeAttribute('hidden');
		}
	}
}

module GlobalPlugins {
	interface PluginContentSetting {
		plugin: chrome.contentSettings.ResourceIdentifier;
		setting: string;
	}

	var SETTING_NAME = 'setting_%s';
	var SETTING_VALUES = {
		allow: localize('allow'),
		ask: localize('ask'),
		block: localize('block'),
		'default': localize('default'),
	}

	var HTTP_PATTERN = 'http://*/*';
	var HTTPS_PATTERN = 'https://*/*';

	var inputIndex = 0;

	export function buildSettings(container: HTMLElement) {
		async.waterfall([
		// Get info for all plugins
			getPluginIdentifiers,

			(plugins: chrome.contentSettings.ResourceIdentifier[]) => {
				// Get the global content setting for each plugin
				async.parallel(plugins.map((plugin) => {
					return async.apply(getGlobalPluginSettings, plugin);
				}),
					(err, pluginSettings: PluginContentSetting[]) => {
						if (err) {
							// Show an error message if something failed
							console.error(err);
							var error = document.createElement('p');
							error.classList.add('error');
							error.textContent = err;
							container.appendChild(error);
						} else {
							// Add a row for each plugin
							pluginSettings.sort(comparePlugins).forEach((info) => {
								var row = buildSetting(info.plugin, info.setting);
								container.appendChild(row);
							});
						}
					});
			}
		]);
	}

	function buildSetting(plugin: chrome.contentSettings.ResourceIdentifier, initialVal: string): HTMLElement {
		var row = document.createElement('p');
		var text = document.createElement('span');
		text.textContent = plugin.description;
		text.title = plugin.id;
		row.appendChild(text);

		var settings = document.createElement('span');

		for (var key in SETTING_VALUES) {
			var id = getSettingName(inputIndex);
			var label = document.createElement('label');
			label.setAttribute('for', id);
			label.textContent = SETTING_VALUES[key];

			var input = document.createElement('input');
			input.type = 'radio';
			input.id = id;
			input.name = plugin.id;
			input.value = key;

			if (input.value == initialVal) {
				input.checked = true;
			}

			input.addEventListener('change', (e) => {
				var checkbox = <HTMLInputElement>e.target;
				if (checkbox.checked) {
					setGlobalPluginSetting(plugin, checkbox.value, (err, result) => {
						if (err) {
							ModalDialog.message(localize('error'), localize('change_failed', plugin.description, SETTING_VALUES[checkbox.value]));
						}
					});
				}
			}, false);

			settings.appendChild(input);
			settings.appendChild(label);
			inputIndex += 1;
		}
		row.appendChild(settings);
		return row;
	}

	function comparePlugins(a: PluginContentSetting, b: PluginContentSetting) {
		var aString = a.plugin.description.toLowerCase();
		var bString = b.plugin.description.toLowerCase();
		if (aString === bString) {
			return 0;
		} else {
			return aString < bString ? -1 : 1;
		}
	}

	function getGlobalPluginSettings(plugin: chrome.contentSettings.ResourceIdentifier, callback: AsyncSingleResultCallback<PluginContentSetting>) {
		async.parallel([
			async.apply(getPluginSetting, HTTP_PATTERN, plugin),
			async.apply(getPluginSetting, HTTPS_PATTERN, plugin),
		],
			(err, results: PluginContentSetting[]) => {
				if (err) {
					callback(err, null);
				} else {
					var http = results[0];
					var https = results[1];

					if (http.setting != https.setting) {
						console.warn('HTTP and HTTPS settings for ' + plugin.description + ' do not match. Using HTTP setting.');
					}

					callback(null, {
						plugin: http.plugin,
						setting: http.setting,
					})
				}
			});
	}

	function getPluginSetting(url: string, plugin: chrome.contentSettings.ResourceIdentifier, callback: AsyncSingleResultCallback<PluginContentSetting>) {
		chrome.contentSettings.plugins.get({
			primaryUrl: url,
			resourceIdentifier: plugin,
		},
			(details) => {
				if (details) {
					callback(null, {
						plugin: plugin,
						setting: details.setting
					});
				} else {
					callback('Couldn\'t get setting for ' + plugin.id, null);
				}
			});
	}

	function getPluginIdentifiers(callback: AsyncSingleResultCallback<chrome.contentSettings.ResourceIdentifier[]>) {
		chrome.contentSettings.plugins.getResourceIdentifiers((resources) => {
			if (resources.length > 0) {
				callback(null, resources);
			} else {
				callback('No resource identifiers found.', null);
			}
		});
	}

	function getSettingName(setting: number);
	function getSettingName(setting: string);
	function getSettingName(setting: any) {
		return SETTING_NAME.replace('%s', setting);
	}

	function setGlobalPluginSetting(plugin: chrome.contentSettings.ResourceIdentifier, setting: string, callback: AsyncSingleResultCallback<void>) {
		setPluginSetting('<all_urls>', plugin, setting, callback);
	}

	function setPluginSetting(url: string, plugin: chrome.contentSettings.ResourceIdentifier, setting: string, callback: AsyncSingleResultCallback<void>) {
		try {
			chrome.contentSettings.plugins.set({
				primaryPattern: url,
				resourceIdentifier: plugin,
				setting: setting
			},
				() => {
					callback(null, null);
				});
		} catch (e) {
			console.error(e);
			callback(e, null);
		}
	}
}