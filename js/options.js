/// <reference path="lib/chrome.d.ts" />
/// <reference path="lib/async.d.ts" />
var CONTENT_TYPE_TITLES = {
    cookies: localize('type_cookie'),
    images: localize('type_image'),
    javascript: localize('type_script'),
    notifications: localize('type_notification'),
    plugins: localize('type_plugin'),
    popups: localize('type_popup'),
    all: localize('type_all')
};

function addResetButton(button) {
    var self = this;
    var contentType = button.getAttribute('data-content-type');
    var typeString = CONTENT_TYPE_TITLES[contentType];

    button.addEventListener('click', function (e) {
        var title = localize('title_reset_settings', typeString);
        var message = localize('msg_confirm_reset', typeString);

        button.setAttribute('disabled', 'disabled');
        ModalDialog.confirm(title, message, function (result) {
            if (result) {
                resetContentSettings(contentType);
                window.location.reload();
            }
            button.removeAttribute('disabled');
        });
    });
}

function resetContentSettings(contentType) {
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
        var version = match[1].split('.').map(function (part) {
            return parseInt(part);
        });
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

document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('button[data-content-type]');
    for (var i = 0; i < buttons.length; i++) {
        addResetButton(buttons[i]);
    }

    versionCheck();

    GlobalPlugins.buildSettings(document.querySelector('#plugins'));
});

var experimental;
(function (experimental) {
    var LEFT = 37;
    var UP = 38;
    var RIGHT = 39;
    var DOWN = 40;
    var B = 66;
    var A = 65;

    var SEQUENCE = [UP, UP, DOWN, DOWN, LEFT, RIGHT, LEFT, RIGHT, B, A];
    var index = 0;

    document.addEventListener('keydown', function (e) {
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
            hidden[i].removeAttribute('hidden');
        }
    }
})(experimental || (experimental = {}));

var GlobalPlugins;
(function (GlobalPlugins) {
    var SETTING_NAME = 'setting_%s';
    var SETTING_VALUES = {
        allow: localize('allow'),
        ask: localize('ask'),
        block: localize('block'),
        'default': localize('default')
    };

    var HTTP_PATTERN = 'http://*/*';
    var HTTPS_PATTERN = 'https://*/*';

    var inputIndex = 0;

    function buildSettings(container) {
        async.waterfall([
            getPluginIdentifiers,
            function (plugins) {
                // Get the global content setting for each plugin
                async.parallel(plugins.map(function (plugin) {
                    return async.apply(getGlobalPluginSettings, plugin);
                }), function (err, pluginSettings) {
                    if (err) {
                        // Show an error message if something failed
                        console.error(err);
                        var error = document.createElement('p');
                        error.classList.add('error');
                        error.textContent = err;
                        container.appendChild(error);
                    } else {
                        // Add a row for each plugin
                        pluginSettings.sort(comparePlugins).forEach(function (info) {
                            var row = buildSetting(info.plugin, info.setting);
                            container.appendChild(row);
                        });
                    }
                });
            }
        ]);
    }
    GlobalPlugins.buildSettings = buildSettings;

    function buildSetting(plugin, initialVal) {
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

            input.addEventListener('change', function (e) {
                var checkbox = e.target;
                if (checkbox.checked) {
                    setGlobalPluginSetting(plugin, checkbox.value, function (err, result) {
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

    function comparePlugins(a, b) {
        var aString = a.plugin.description.toLowerCase();
        var bString = b.plugin.description.toLowerCase();
        if (aString === bString) {
            return 0;
        } else {
            return aString < bString ? -1 : 1;
        }
    }

    function getGlobalPluginSettings(plugin, callback) {
        async.parallel([
            async.apply(getPluginSetting, HTTP_PATTERN, plugin),
            async.apply(getPluginSetting, HTTPS_PATTERN, plugin)
        ], function (err, results) {
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
                    setting: http.setting
                });
            }
        });
    }

    function getPluginSetting(url, plugin, callback) {
        chrome.contentSettings.plugins.get({
            primaryUrl: url,
            resourceIdentifier: plugin
        }, function (details) {
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

    function getPluginIdentifiers(callback) {
        chrome.contentSettings.plugins.getResourceIdentifiers(function (resources) {
            if (resources.length > 0) {
                callback(null, resources);
            } else {
                callback('No resource identifiers found.', null);
            }
        });
    }

    function getSettingName(setting) {
        return SETTING_NAME.replace('%s', setting);
    }

    function setGlobalPluginSetting(plugin, setting, callback) {
        setPluginSetting('<all_urls>', plugin, setting, callback);
    }

    function setPluginSetting(url, plugin, setting, callback) {
        try  {
            chrome.contentSettings.plugins.set({
                primaryPattern: url,
                resourceIdentifier: plugin,
                setting: setting
            }, function () {
                callback(null, null);
            });
        } catch (e) {
            console.error(e);
            callback(e, null);
        }
    }
})(GlobalPlugins || (GlobalPlugins = {}));
//# sourceMappingURL=options.js.map
