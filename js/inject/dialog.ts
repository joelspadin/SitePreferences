/// <reference path="../lib/chrome.d.ts" />
/// <reference path="../interfaces.ts" />

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	switch (message.action) {
		case 'trigger':
			dialog.show(message.settings);
			break;

		default:
			console.log('Unknown action: ' + message.action);
	}
});

module dialog {
	var localize = chrome.i18n.getMessage;

	interface SettingDefiniton {
		title: string;
		values: string[];
	}

	interface HiddenEmbed {
		element: HTMLElement;
		visibility: string;
	}

	var OVERLAY_ID = '__ext_site_preferences_overlay__';
	var CONTENT_ID = '__ext_site_preferences_content__';
	var SETTING_NAME = '__ext_site_preferences_setting_%s__';
	var PULSE_CLASS = '__ext_site_preferences_pulse__';
	var TRANSPARENT_CLASS = '__ext_site_preferences_transparent__';

	var CONTENT_TITLE = localize('title_preferences', '<span>%s</span>');

	var SETTINGS: { [key: string]: SettingDefiniton; } = {
		cookies: {
			title: localize('cookies'),
			values: ['allow', 'session_only', 'block'],
		},
		images: {
			title: localize('images'),
			values: ['allow', 'block'],
		},
		notifications: {
			title: localize('notifications'),
			values: ['allow', 'ask', 'block'],
		},
		plugins: {
			title: localize('plugins'),
			values: ['allow', 'ask', 'block'],
		},
		popups: {
			title: localize('popups'),
			values: ['allow', 'block'],
		},
		javascript: {
			title: localize('scripts'),
			values: ['allow', 'block'],
		},
	}

	var SETTING_VALUES = {
		allow: localize('allow'),
		ask: localize('ask'),
		block: localize('block'),
		session_only: localize('session_only'),
	}

	var BUTTONS = [
		{ text: localize('save'), action: saveAndClose },
		{ text: localize('cancel'), action: close },
	];

	var ANIMATION_LENGTH = 200;

	var built = false;
	var closingTimeout: number = null;
	var hiddenEmbeds: HiddenEmbed[] = [];
	var inputIndex = 0;

	export var overlay: HTMLDivElement = null;
	export var content: HTMLDivElement = null;
	export var settings: { [key: string]: HTMLElement; } = {};

	export function show(settings: ContentSettings) {
		if (!built) {
			buildDialog();
		}

		if (closingTimeout) {
			window.clearTimeout(closingTimeout);
		}

		if (content && !content.classList.contains(TRANSPARENT_CLASS)) {
			pulse();
		}

		updateSettings(settings);

		window.setTimeout(() => {
			overlay.classList.remove(TRANSPARENT_CLASS);
		}, ANIMATION_LENGTH);
	}

	export function close() {
		if (!closingTimeout) {
			overlay.classList.add(TRANSPARENT_CLASS);
			closingTimeout = window.setTimeout(() => {
				closingTimeout = null;
				destroyDialog();
			}, ANIMATION_LENGTH);
		}
	}

	export function saveAndClose() {
		chrome.runtime.sendMessage({
			action: 'save',
			settings: getCurrentSettings(),
		});
		close();
	}

	function buildDialog() {
		built = true;
		styles.inject();
		hideEmbeds();

		overlay = document.createElement('div');
		overlay.classList.add(TRANSPARENT_CLASS);
		overlay.id = OVERLAY_ID;

		overlay.addEventListener('click', pulse, false);
		overlay.addEventListener('animationend', endPulse, false);
		overlay.addEventListener('webkitAnimationEnd', endPulse, false);

		content = document.createElement('div');
		content.id = CONTENT_ID;
		content.addEventListener('click', (e) => {
			e.stopPropagation();
		}, false);

		var header = document.createElement('header');
		header.innerHTML = getDialogTitle();
		content.appendChild(header);

		for (var key in SETTINGS) {
			if (SETTINGS.hasOwnProperty(key)) {
				settings[key] = buildSetting(key);
				content.appendChild(settings[key]);
			}
		}

		var footer = document.createElement('footer');

		BUTTONS.forEach((info) => {
			var button = document.createElement('button');
			button.textContent = info.text;
			button.addEventListener('click', info.action, false);
			footer.appendChild(button);
		});

		content.appendChild(footer);

		overlay.appendChild(content);
		document.body.appendChild(overlay);
	}

	function buildSetting(setting: string): HTMLElement {
		var row = document.createElement('p');
		var text = document.createElement('span');
		text.textContent = SETTINGS[setting].title;
		row.appendChild(text);

		var settings = document.createElement('span');

		SETTINGS[setting].values.forEach((value) => {
			var id = getSettingName(inputIndex);
			var label = document.createElement('label');
			label.setAttribute('for', id);
			label.textContent = SETTING_VALUES[value];

			var input = document.createElement('input');
			input.type = 'radio';
			input.id = id;
			input.name = getSettingName(setting);
			input.value = value;

			settings.appendChild(input);
			settings.appendChild(label);
			inputIndex += 1;
		});

		row.appendChild(settings);
		return row;
	}

	function destroyDialog() {
		styles.remove();
		restoreEmbeds();

		document.body.removeChild(overlay);
		overlay = null;
		content = null;
		settings = {};

		built = false;
	}

	function endPulse() {
		content.classList.remove(PULSE_CLASS);
	}

	function getCurrentSettings(): ContentSettings {
		var settings: ContentSettings = {
			cookies: null,
			images: null,
			javascript: null,
			notifications: null,
			plugins: null,
			popups: null,
		};

		for (var key in settings) {
			if (settings.hasOwnProperty(key)) {
				var name = getSettingName(key);
				var input = document.querySelector('input[name=' + name + ']:checked');
				if (input) {
					settings[key] = (<HTMLInputElement>input).value;
				}
			}
		}

		return settings;
	}

	function getDialogTitle() {
		var path;
		if (window.location.protocol === 'file:') {
			path = decodeURIComponent(window.location.pathname).replace(/^\//, '');
			if (navigator.platform.toLowerCase().indexOf('win') >= 0) {
				path = path.replace(/\//g, '\\');
			}
		} else {
			path = window.location.hostname;
		}

		return CONTENT_TITLE.replace('%s', path);
	}

	function getSettingName(setting: number);
	function getSettingName(setting: string);
	function getSettingName(setting: any) {
		return SETTING_NAME.replace('%s', setting);
	}

	function hideEmbeds() {
		var embeds = document.querySelectorAll('embed, object');
		for (var i = 0; i < embeds.length; i++) {
			var elem = <HTMLElement>embeds[i];
			var info: HiddenEmbed = {
				element: elem,
				visibility: elem.style.visibility || 'visible',
			}
			elem.style.visibility = 'hidden';
			hiddenEmbeds.push(info);
		}
	}

	function pulse() {
		content.classList.add(PULSE_CLASS);
	}

	function restoreEmbeds() {
		hiddenEmbeds.forEach((embed) => {
			embed.element.style.visibility = embed.visibility;
		});
		hiddenEmbeds = [];
	}

	function updateSettings(settings: ContentSettings) {
		for (var key in settings) {
			if (settings.hasOwnProperty(key)) {
				var value = settings[key];
				var name = getSettingName(key);

				var input = document.querySelector('input[name=' + name + '][value=' + value + ']');
				if (input) {
					(<HTMLInputElement>input).checked = true;
				}
			}
		}
	}
}

module styles {
	var injected = false;
	var element: HTMLLinkElement = null;

	export function inject() {
		if (!injected) {
			var path = chrome.extension.getURL('css/inject/dialog.css');
			element = document.createElement('link');
			element.rel = 'stylesheet';
			element.type = 'text/css';
			element.href = path;
			document.head.appendChild(element);

			injected = true;
		}
	}

	export function remove() {
		if (injected) {
			document.head.removeChild(element);
			injected = false;
		}
	}
}