/// <reference path="chrome.d.ts" />

interface ModalButton {
	text: string;
	action?: EventListener;
}

class ModalDialog {
	public overlay: HTMLElement;
	public dialog: HTMLElement;
	public onclose: Function;

	public static confirm(title: string, text: string, callback: (result: boolean) => any): ModalDialog {
		return new ModalDialog(title, text,
			{
				text: 'Cancel',
				action: (e) => callback(false),
			}, {
				text: 'OK',
				action: (e) => callback(true),
			});
	}

	public static message(title: string, text: string, onclose?: EventListener): ModalDialog {
		if (typeof onclose !== 'function') {
			onclose = (e) => undefined;
		}

		return new ModalDialog(title, text, onclose, {
			text: 'OK',
		});
	}

	constructor(title: string, text: string, ...buttons: ModalButton[]);
	constructor(title: string, text: string, onclose: Function, ...buttons: ModalButton[]);
	constructor(title: string, text: string, onclose?: any) {
		var buttons: ModalButton[];
		if (typeof onclose === 'function') {
			buttons = Array.prototype.slice.call(arguments, [3]);
		} else {
			buttons = Array.prototype.slice.call(arguments, [2]);
			onclose = null;
		}

		this.onclose = onclose;

		this.overlay = document.createElement('div');
		this.overlay.className = 'overlay transparent';
		this.overlay.addEventListener('click', this._pulse.bind(this), false);
		this.overlay.addEventListener('animationend', this._endPulse.bind(this), false);
		this.overlay.addEventListener('webkitAnimationEnd', this._endPulse.bind(this), false);

		this.dialog = document.createElement('aside');
		this.dialog.addEventListener('click', this._cancelEvent, false);

		var header = document.createElement('h1');
		var body = document.createElement('div');
		var footer = document.createElement('footer');

		header.textContent = title;
		body.innerHTML = '<p>' + text.replace('\n\n', '</p><p>').replace('\n', '<br>') + '</p>'

		buttons.forEach((info) => {
			var button = document.createElement('button');
			button.textContent = info.text;
			if (info.action) {
				button.addEventListener('click', info.action, false);
			}

			button.addEventListener('click', this._close.bind(this), false);
			footer.appendChild(button);
		});

		this.dialog.appendChild(header);
		this.dialog.appendChild(body);
		this.dialog.appendChild(footer);

		this.overlay.appendChild(this.dialog);
		document.body.appendChild(this.overlay);

		window.setTimeout(() => this.overlay.classList.remove('transparent'), 1);
	}

	private _cancelEvent(e: Event) {
		e.stopPropagation();
	}

	private _pulse(e) {
		this.dialog.classList.add('pulse');
	}

	private _endPulse(e) {
		this.dialog.classList.remove('pulse');
	}

	private _close(e) {
		if (this.onclose) {
			this.onclose();
		}

		this.overlay.classList.add('transparent');
		this.overlay.addEventListener('transitionend', (e) => {
			document.body.removeChild(this.overlay);
			this.overlay = null;
			this.dialog = null;
			this.onclose = null;
		})
	}
}

function localize(message: string, ...substitutions: string[]) {
	return chrome.i18n.getMessage(message, substitutions);
}

module i18n {
	var HTML_TAG = 'html:';

	export function translate(elem: HTMLElement, msg?: string) {
		msg = msg || elem.getAttribute('data-msg');
		if (msg.indexOf(HTML_TAG) === 0) {
			elem.innerHTML = chrome.i18n.getMessage(msg.substr(HTML_TAG.length));
		} else {
			elem.textContent = chrome.i18n.getMessage(msg);
		}
	}

	export function localizePage() {
		var elems = document.querySelectorAll('[data-msg]');
		for (var i = 0; i < elems.length; i++) {
			i18n.translate(<HTMLElement>elems[i]);
		}
	}
}

// Automatically intialize things on startup

document.title = chrome.runtime.getManifest()['name'] + ' Settings';

window.addEventListener('DOMContentLoaded', () => {
	// Localize the page
	i18n.localizePage();

	// Fill elements with data from the extension manifest
	var manifest = <any>chrome.runtime.getManifest();

	var fields = document.querySelectorAll('[data-manifest]');
	for (var i = 0; i < fields.length; i++) {
		var field = <HTMLElement>fields[i];
		var format: string = field.dataset['format'] || '{0}';
		var values = [];

		field.dataset['manifest'].split(',').forEach((property: string) => {
			var chunks = property.split('.');
			var current = manifest;

			try {
				chunks.forEach((chunk) => {
					current = current[chunk];
				});
			} catch (e) {
				current = undefined;
			}

			values.push(current);
		});

		if (values.length === 0 || values[0] === undefined) {
			field.textContent = 'manifest: ' + field.dataset['manifest'];
		} else {
			field.textContent = format.replace(/{(\d+)}/g, function (match, ...groups) {
				var index = groups[0];
				return (typeof values[index] != 'undefined') ? values[index].toString() : match.toString();
			});
		}
	}
});