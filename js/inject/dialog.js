/// <reference path="../lib/chrome.d.ts" />
/// <reference path="../interfaces.ts" />
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    switch (message.action) {
        case 'trigger':
            dialog.show(message.settings);
            break;

        default:
            console.log('Unknown action: ' + message.action);
    }
});

var dialog;
(function (dialog) {
    var localize = chrome.i18n.getMessage;

    var OVERLAY_ID = '__ext_site_preferences_overlay__';
    var CONTENT_ID = '__ext_site_preferences_content__';
    var SETTING_NAME = '__ext_site_preferences_setting_%s__';
    var PULSE_CLASS = '__ext_site_preferences_pulse__';
    var TRANSPARENT_CLASS = '__ext_site_preferences_transparent__';

    var CONTENT_TITLE = localize('title_preferences', '<span>%s</span>');

    var SETTINGS = {
        cookies: {
            title: localize('cookies'),
            values: ['allow', 'session_only', 'block']
        },
        images: {
            title: localize('images'),
            values: ['allow', 'block']
        },
        notifications: {
            title: localize('notifications'),
            values: ['allow', 'ask', 'block']
        },
        plugins: {
            title: localize('plugins'),
            values: ['allow', 'ask', 'block']
        },
        popups: {
            title: localize('popups'),
            values: ['allow', 'block']
        },
        javascript: {
            title: localize('scripts'),
            values: ['allow', 'block']
        }
    };

    var SETTING_VALUES = {
        allow: localize('allow'),
        ask: localize('ask'),
        block: localize('block'),
        session_only: localize('session_only')
    };

    var BUTTONS = [
        { text: localize('save'), action: saveAndClose },
        { text: localize('cancel'), action: close }
    ];

    var ANIMATION_LENGTH = 200;

    var built = false;
    var closingTimeout = null;
    var hiddenEmbeds = [];
    var inputIndex = 0;

    dialog.overlay = null;
    dialog.content = null;
    dialog.settings = {};
    dialog.url = null;

    function show(settings) {
        if (!built) {
            buildDialog(settings.url);
        }

        if (closingTimeout) {
            window.clearTimeout(closingTimeout);
        }

        if (dialog.content && !dialog.content.classList.contains(TRANSPARENT_CLASS)) {
            pulse();
        }

        updateSettings(settings);

        window.setTimeout(function () {
            dialog.overlay.classList.remove(TRANSPARENT_CLASS);
        }, ANIMATION_LENGTH);
    }
    dialog.show = show;

    function close() {
        if (!closingTimeout) {
            dialog.overlay.classList.add(TRANSPARENT_CLASS);
            closingTimeout = window.setTimeout(function () {
                closingTimeout = null;
                destroyDialog();
            }, ANIMATION_LENGTH);
        }
    }
    dialog.close = close;

    function saveAndClose() {
        chrome.runtime.sendMessage({
            action: 'save',
            settings: getCurrentSettings()
        });
        close();
    }
    dialog.saveAndClose = saveAndClose;

    function buildDialog(url) {
        built = true;
        styles.inject();
        hideEmbeds();

        dialog.url = url;

        dialog.overlay = document.createElement('div');
        dialog.overlay.classList.add(TRANSPARENT_CLASS);
        dialog.overlay.id = OVERLAY_ID;

        dialog.overlay.addEventListener('click', pulse, false);
        dialog.overlay.addEventListener('animationend', endPulse, false);
        dialog.overlay.addEventListener('webkitAnimationEnd', endPulse, false);

        dialog.content = document.createElement('div');
        dialog.content.id = CONTENT_ID;
        dialog.content.addEventListener('click', function (e) {
            e.stopPropagation();
        }, false);

        var header = document.createElement('header');
        var title = getDialogTitle(url);
        header.innerHTML = title;
        dialog.content.appendChild(header);

        for (var key in SETTINGS) {
            if (SETTINGS.hasOwnProperty(key)) {
                dialog.settings[key] = buildSetting(key);
                dialog.content.appendChild(dialog.settings[key]);
            }
        }

        var footer = document.createElement('footer');

        BUTTONS.forEach(function (info) {
            var button = document.createElement('button');
            button.textContent = info.text;
            button.addEventListener('click', info.action, false);
            footer.appendChild(button);
        });

        dialog.content.appendChild(footer);

        dialog.overlay.appendChild(dialog.content);
        document.body.appendChild(dialog.overlay);

        // If standalone page, set page title
        if (window.location.protocol === 'chrome-extension:') {
            document.title = title.replace('<span>', '').replace('</span>', '');
        }
    }

    function buildSetting(setting) {
        var row = document.createElement('p');
        var text = document.createElement('span');
        text.textContent = SETTINGS[setting].title;
        row.appendChild(text);

        var settings = document.createElement('span');

        SETTINGS[setting].values.forEach(function (value) {
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

        document.body.removeChild(dialog.overlay);
        dialog.overlay = null;
        dialog.content = null;
        dialog.settings = {};

        built = false;

        // If standalone, close the tab too
        if (window.location.protocol === 'chrome-extension:') {
            window.close();
        }
    }

    function endPulse() {
        dialog.content.classList.remove(PULSE_CLASS);
    }

    function getCurrentSettings() {
        var settings = {
            url: dialog.url,
            cookies: null,
            images: null,
            javascript: null,
            notifications: null,
            plugins: null,
            popups: null
        };

        for (var key in settings) {
            if (key in SETTINGS) {
                var name = getSettingName(key);
                var input = document.querySelector('input[name=' + name + ']:checked');
                if (input) {
                    settings[key] = input.value;
                }
            }
        }

        return settings;
    }

    function getDialogTitle(url) {
        var path;
        var a = document.createElement('a');
        a.href = url;

        if (a.protocol === 'file:') {
            path = decodeURIComponent(a.pathname).replace(/^\//, '');
            if (navigator.platform.toLowerCase().indexOf('win') >= 0) {
                path = path.replace(/\//g, '\\');
            }
        } else {
            path = a.hostname;
        }

        return CONTENT_TITLE.replace('%s', path);
    }

    function getSettingName(setting) {
        return SETTING_NAME.replace('%s', setting);
    }

    function hideEmbeds() {
        var embeds = document.querySelectorAll('embed, object');
        for (var i = 0; i < embeds.length; i++) {
            var elem = embeds[i];
            var info = {
                element: elem,
                visibility: elem.style.visibility || 'visible'
            };
            elem.style.visibility = 'hidden';
            hiddenEmbeds.push(info);
        }
    }

    function pulse() {
        dialog.content.classList.add(PULSE_CLASS);
    }

    function restoreEmbeds() {
        hiddenEmbeds.forEach(function (embed) {
            embed.element.style.visibility = embed.visibility;
        });
        hiddenEmbeds = [];
    }

    function updateSettings(settings) {
        for (var key in settings) {
            if (key in SETTINGS) {
                var value = settings[key];
                var name = getSettingName(key);

                var input = document.querySelector('input[name=' + name + '][value=' + value + ']');
                if (input) {
                    input.checked = true;
                }
            }
        }
    }
})(dialog || (dialog = {}));

var styles;
(function (styles) {
    var injected = false;
    var element = null;

    function inject() {
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
    styles.inject = inject;

    function remove() {
        if (injected) {
            document.head.removeChild(element);
            injected = false;
        }
    }
    styles.remove = remove;
})(styles || (styles = {}));
//# sourceMappingURL=dialog.js.map
