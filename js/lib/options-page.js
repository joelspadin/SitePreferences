/// <reference path="chrome.d.ts" />

var ModalDialog = (function () {
    function ModalDialog(title, text, onclose) {
        var _this = this;
        var buttons;
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
        body.innerHTML = '<p>' + text.replace('\n\n', '</p><p>').replace('\n', '<br>') + '</p>';

        buttons.forEach(function (info) {
            var button = document.createElement('button');
            button.textContent = info.text;
            if (info.action) {
                button.addEventListener('click', info.action, false);
            }

            button.addEventListener('click', _this._close.bind(_this), false);
            footer.appendChild(button);
        });

        this.dialog.appendChild(header);
        this.dialog.appendChild(body);
        this.dialog.appendChild(footer);

        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);

        window.setTimeout(function () {
            return _this.overlay.classList.remove('transparent');
        }, 1);
    }
    ModalDialog.confirm = function (title, text, callback) {
        return new ModalDialog(title, text, {
            text: 'Cancel',
            action: function (e) {
                return callback(false);
            }
        }, {
            text: 'OK',
            action: function (e) {
                return callback(true);
            }
        });
    };

    ModalDialog.message = function (title, text, onclose) {
        if (typeof onclose !== 'function') {
            onclose = function (e) {
                return undefined;
            };
        }

        return new ModalDialog(title, text, onclose, {
            text: 'OK'
        });
    };

    ModalDialog.prototype._cancelEvent = function (e) {
        e.stopPropagation();
    };

    ModalDialog.prototype._pulse = function (e) {
        this.dialog.classList.add('pulse');
    };

    ModalDialog.prototype._endPulse = function (e) {
        this.dialog.classList.remove('pulse');
    };

    ModalDialog.prototype._close = function (e) {
        var _this = this;
        if (this.onclose) {
            this.onclose();
        }

        this.overlay.classList.add('transparent');
        this.overlay.addEventListener('transitionend', function (e) {
            document.body.removeChild(_this.overlay);
            _this.overlay = null;
            _this.dialog = null;
            _this.onclose = null;
        });
    };
    return ModalDialog;
})();

function localize(message) {
    var substitutions = [];
    for (var _i = 0; _i < (arguments.length - 1); _i++) {
        substitutions[_i] = arguments[_i + 1];
    }
    return chrome.i18n.getMessage(message, substitutions);
}

var i18n;
(function (i18n) {
    var HTML_TAG = 'html:';

    function translate(elem, msg) {
        msg = msg || elem.getAttribute('data-msg');
        if (msg.indexOf(HTML_TAG) === 0) {
            elem.innerHTML = chrome.i18n.getMessage(msg.substr(HTML_TAG.length));
        } else {
            elem.textContent = chrome.i18n.getMessage(msg);
        }
    }
    i18n.translate = translate;

    function localizePage() {
        var elems = document.querySelectorAll('[data-msg]');
        for (var i = 0; i < elems.length; i++) {
            i18n.translate(elems[i]);
        }
    }
    i18n.localizePage = localizePage;
})(i18n || (i18n = {}));

// Automatically intialize things on startup
document.title = chrome.runtime.getManifest()['name'] + ' Settings';

window.addEventListener('DOMContentLoaded', function () {
    // Localize the page
    i18n.localizePage();

    // Fill elements with data from the extension manifest
    var manifest = chrome.runtime.getManifest();

    var fields = document.querySelectorAll('[data-manifest]');
    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var format = field.dataset['format'] || '{0}';
        var values = [];

        field.dataset['manifest'].split(',').forEach(function (property) {
            var chunks = property.split('.');
            var current = manifest;

            try  {
                chunks.forEach(function (chunk) {
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
            field.textContent = format.replace(/{(\d+)}/g, function (match) {
                var groups = [];
                for (var _i = 0; _i < (arguments.length - 1); _i++) {
                    groups[_i] = arguments[_i + 1];
                }
                var index = groups[0];
                return (typeof values[index] != 'undefined') ? values[index].toString() : match.toString();
            });
        }
    }
});
//# sourceMappingURL=options-page.js.map
