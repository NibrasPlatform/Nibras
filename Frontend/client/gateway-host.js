/**
 * Shared gateway host detection and stored API URL helpers.
 * Load before config.js and session.js.
 */
(function () {
  'use strict';

  const PRODUCTION_GATEWAY =
    'https://web-production-3011ec.up.railway.app';
  const LOCAL_GATEWAY = 'http://localhost:8080';

  const isLocalHost = (hostname) => {
    try {
      return ['localhost', '127.0.0.1'].includes(String(hostname || ''));
    } catch (_) {
      return false;
    }
  };

  const isGatewayHost = (hostname) => {
    try {
      const host = String(hostname || '');
      if (isLocalHost(host)) return true;
      if (host.includes('vercel.app')) return true;
      if (host.includes('azurecontainerapps.io')) return true;
      if (host.includes('railway.app') && !host.startsWith('api-')) return true;
      return false;
    } catch (_) {
      return false;
    }
  };

  const gatewayOrigin = (locationLike, productionFallback) => {
    const fallback = productionFallback || PRODUCTION_GATEWAY;
    try {
      const loc = locationLike || window.location;
      const host = loc.hostname;
      if (isLocalHost(host)) return LOCAL_GATEWAY;
      if (isGatewayHost(host)) return loc.origin;
    } catch (_) {
      // Fall through to production default.
    }
    return fallback;
  };

  const shouldIgnoreStoredApiUrl = (storedUrl, pageOrigin, onGatewayHost) => {
    if (!storedUrl || !onGatewayHost) return false;
    try {
      const storedOrigin = new URL(String(storedUrl)).origin;
      const currentOrigin = String(pageOrigin || window.location.origin);
      return storedOrigin !== currentOrigin;
    } catch (_) {
      return false;
    }
  };

  const readStoredApiUrl = (storage, key, pageOrigin, onGatewayHost) => {
    if (!storage || !key) return null;
    try {
      const value = storage.getItem(key);
      if (!value) return null;
      if (shouldIgnoreStoredApiUrl(value, pageOrigin, onGatewayHost)) return null;
      return value;
    } catch (_) {
      return null;
    }
  };

  window.NibrasGateway = Object.freeze({
    PRODUCTION_GATEWAY,
    LOCAL_GATEWAY,
    isLocalHost,
    isGatewayHost,
    gatewayOrigin,
    shouldIgnoreStoredApiUrl,
    readStoredApiUrl,
  });
})();
