/*
 * Optional per-tab authentication storage for the Guacamole 1.6.0 Web UI.
 * This adapts the internal localStorageService contract (JSON values).
 * Enable with ?jwt-tab=1 before the hash; the marker survives Angular routing.
 * Open independent windows with noopener: browser tab duplication can copy
 * sessionStorage, and is not a separate authorization flow.
 */
(function () {
    'use strict';

    angular.module('index').config(['$provide', function ($provide) {
        $provide.decorator('localStorageService', ['$delegate', '$window',
            function ($delegate, $window) {
                var AUTH_KEY = 'GUAC_AUTH_TOKEN';
                var MODE_KEY = 'GUAC_JWT_TAB_MODE';
                var TOKEN_KEY = 'GUAC_JWT_TAB_AUTH_TOKEN';
                var PREFIX = 'jwt-session:';
                var session = null;
                var token = null;
                var bootstrap = null;
                var location = $window.location;
                var hashQuery = location.hash.indexOf('?');
                var explicit = new URLSearchParams(location.search).get('jwt-tab') === '1'
                        || (hashQuery !== -1 && new URLSearchParams(
                            location.hash.substring(hashQuery + 1)).get('jwt-tab') === '1');
                var isolated = explicit;

                // Erase the same-origin broker handoff before parsing or using it.
                // Never accept tokens from this transport into the shared store.
                var name = $window.name || '';
                if (name.indexOf(PREFIX) === 0) {
                    $window.name = '';
                    if (name.length <= 16384) {
                        try {
                            var data = JSON.parse(name.substring(PREFIX.length));
                            if (data && typeof data.authToken === 'string'
                                    && data.authToken.length > 0 && data.authToken.length <= 4096)
                                bootstrap = data.authToken;
                        }
                        catch (ignore) {}
                    }
                }

                try {
                    session = $window.sessionStorage;
                    if (session)
                        isolated = isolated || session.getItem(MODE_KEY) === '1';
                }
                catch (ignore) { session = null; }

                if (!isolated)
                    return $delegate;

                // Never read GUAC_AUTH_TOKEN from the original shared delegate.
                // A failed storage operation latches memory-only mode for this page.
                function disablePersistence() {
                    if (session) {
                        try { session.removeItem(TOKEN_KEY); }
                        catch (ignore) {}
                    }
                    session = null;
                }

                try {
                    if (session) {
                        session.setItem(MODE_KEY, '1');
                        var stored = session.getItem(TOKEN_KEY);
                        token = stored ? JSON.parse(stored) : null;
                    }
                }
                catch (ignore) { disablePersistence(); }

                var getItem = $delegate.getItem;
                var setItem = $delegate.setItem;
                var removeItem = $delegate.removeItem;
                $delegate.getItem = function (key) {
                    if (key === AUTH_KEY)
                        return token;
                    return getItem.apply(this, arguments);
                };
                $delegate.setItem = function (key, value) {
                    if (key !== AUTH_KEY)
                        return setItem.apply(this, arguments);
                    // Match Guacamole's serialization semantics for this slot.
                    var serialized = JSON.stringify(value);
                    token = serialized ? JSON.parse(serialized) : null;
                    try {
                        if (session)
                            session.setItem(TOKEN_KEY, serialized);
                    }
                    catch (ignore) { disablePersistence(); }
                };
                $delegate.removeItem = function (key) {
                    if (key !== AUTH_KEY)
                        return removeItem.apply(this, arguments);
                    token = null;
                    try {
                        if (session)
                            session.removeItem(TOKEN_KEY);
                    }
                    catch (ignore) { disablePersistence(); }
                };

                if (bootstrap !== null)
                    $delegate.setItem(AUTH_KEY, bootstrap);

                return $delegate;
            }
        ]);
    }]);
}());
