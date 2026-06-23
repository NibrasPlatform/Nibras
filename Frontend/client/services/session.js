/**
 * Shared session storage, API URL resolution, refresh, and validation.
 * Used by auth-guard.js, api.js, and react-page-utils.js.
 */
(function () {
  'use strict';

  const TOKEN_READ_KEYS = [
    'token',
    'accessToken',
    'authToken',
    'nibras.webSession',
    'nibras_session_token',
    'jwt',
  ];

  const AUTH_STORAGE_KEYS = [
    'token',
    'accessToken',
    'authToken',
    'refreshToken',
    'user',
    'nibras.webSession',
    'nibras_session_token',
    'nibras_user',
    'jwt',
  ];

  const LOCAL_GATEWAY =
    window.NibrasGateway?.LOCAL_GATEWAY || 'http://localhost:8080';
  const PRODUCTION_GATEWAY =
    window.NibrasGateway?.PRODUCTION_GATEWAY ||
    'https://web-production-3011ec.up.railway.app';

  const getPageOrigin = () => {
    try {
      return window.location.origin;
    } catch (_) {
      return '';
    }
  };

  const readStoredUrl = (key) => {
    const gw = window.NibrasGateway;
    const pageOrigin = getPageOrigin();
    const onGateway = gw
      ? gw.isGatewayHost(window.location.hostname)
      : false;
    if (gw) {
      return gw.readStoredApiUrl(
        window.localStorage,
        key,
        pageOrigin,
        onGateway,
      );
    }
    return safeStorageGet(window.localStorage, key);
  };

  const normalizeToken = (token) => {
    if (typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!trimmed) return null;
    return trimmed.replace(/^bearer\s+/i, '') || null;
  };

  const tryParseJson = (value) => {
    if (typeof value !== 'string') return { ok: false, value: null };
    try {
      return { ok: true, value: JSON.parse(value) };
    } catch (_) {
      return { ok: false, value: null };
    }
  };

  const pickTokenCandidate = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const parsed = tryParseJson(value);
      if (parsed.ok) return pickTokenCandidate(parsed.value);
      return normalizeToken(value);
    }
    if (typeof value === 'object') {
      const candidates = [
        value.token,
        value.accessToken,
        value.authToken,
        value.jwt,
        value?.tokens?.access?.token,
        value?.tokens?.accessToken,
      ];
      for (let i = 0; i < candidates.length; i += 1) {
        const token = pickTokenCandidate(candidates[i]);
        if (token) return token;
      }
    }
    return null;
  };

  const safeStorageGet = (storage, key) => {
    if (!storage || !key) return null;
    try {
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  const safeStorageRemove = (storage, key) => {
    if (!storage || !key) return;
    try {
      storage.removeItem(key);
    } catch (_) {}
  };

  const normalizeUrl = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/\/+$/, '') : null;
  };

  const ensureApiBaseUrl = (value) => {
    const normalized = normalizeUrl(value);
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      if (!pathname || pathname === '/') {
        pathname = '/api';
      } else if (!/^\/api(?:\/|$)/i.test(pathname)) {
        pathname = `${pathname}/api`;
      }
      parsed.pathname = pathname;
      return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
      if (/\/api(?:\/|$)/i.test(normalized)) return normalized;
      return `${normalized}/api`;
    }
  };

  const readFirst = (...values) => {
    for (let i = 0; i < values.length; i += 1) {
      const normalized = normalizeUrl(values[i]);
      if (normalized) return normalized;
    }
    return null;
  };

  const resolveAdminApiUrl = () => {
    if (
      window.NibrasApiConfig &&
      typeof window.NibrasApiConfig.getServiceUrl === 'function'
    ) {
      return window.NibrasApiConfig.getServiceUrl('admin');
    }
    if (window.NIBRAS_API_URL) {
      return ensureApiBaseUrl(window.NIBRAS_API_URL) || window.NIBRAS_API_URL;
    }

    let params = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (_) {}

    const gw = window.NibrasGateway;
    const isLocalHost = gw
      ? gw.isLocalHost(window.location.hostname)
      : (() => {
          try {
            return ['localhost', '127.0.0.1'].includes(
              window.location.hostname,
            );
          } catch (_) {
            return false;
          }
        })();

    const isGatewayHost = gw
      ? gw.isGatewayHost(window.location.hostname)
      : (() => {
          try {
            const host = window.location.hostname;
            if (isLocalHost) return true;
            if (host.includes('vercel.app')) return true;
            if (host.includes('azurecontainerapps.io')) return true;
            if (host.includes('railway.app') && !host.startsWith('api-')) {
              return true;
            }
            return false;
          } catch (_) {
            return false;
          }
        })();

    const defaultGateway = gw
      ? gw.gatewayOrigin(window.location, PRODUCTION_GATEWAY)
      : isLocalHost
        ? LOCAL_GATEWAY
        : isGatewayHost
          ? getPageOrigin()
          : PRODUCTION_GATEWAY;

    const defaultAdminApi = isLocalHost
      ? `${LOCAL_GATEWAY}/api`
      : `${defaultGateway}/api`;

    return (
      ensureApiBaseUrl(
        readFirst(
          params && params.get('api'),
          params && params.get('adminApi'),
          readStoredUrl('nibras_admin_api_url'),
          readStoredUrl('nibras_api_url'),
          window.NIBRAS_BACKEND_URL,
          defaultAdminApi,
        ),
      ) || defaultAdminApi
    );
  };

  const getTokenFromStorage = (storage) => {
    for (let i = 0; i < TOKEN_READ_KEYS.length; i += 1) {
      const token = pickTokenCandidate(
        safeStorageGet(storage, TOKEN_READ_KEYS[i]),
      );
      if (token) return token;
    }
    return null;
  };

  const getToken = () =>
    getTokenFromStorage(window.localStorage) ||
    getTokenFromStorage(window.sessionStorage);

  const getRefreshToken = () =>
    safeStorageGet(window.localStorage, 'refreshToken') ||
    safeStorageGet(window.sessionStorage, 'refreshToken');

  const getUser = () => {
    const raw =
      safeStorageGet(window.localStorage, 'user') ||
      safeStorageGet(window.localStorage, 'nibras_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  };

  const extractAuth = (payload) => {
    const data = payload && payload.data ? payload.data : payload || {};
    const tokens =
      payload && payload.tokens ? payload.tokens : data.tokens || {};
    const user = data.user || payload?.user || data;
    const accessToken =
      data.token ||
      data.accessToken ||
      payload?.token ||
      payload?.accessToken ||
      tokens?.access?.token ||
      null;
    const refreshToken =
      data.refreshToken ||
      payload?.refreshToken ||
      tokens?.refresh?.token ||
      null;
    return {
      accessToken,
      refreshToken,
      user:
        user && (user._id || user.id)
          ? user
          : payload?.data?.user || payload?.data || null,
    };
  };

  const setAuth = ({ token, accessToken, refreshToken, user }) => {
    const finalAccess = accessToken || token || null;
    TOKEN_READ_KEYS.forEach((key) => {
      if (key !== 'token') safeStorageRemove(window.localStorage, key);
      safeStorageRemove(window.sessionStorage, key);
    });
    safeStorageRemove(window.localStorage, 'nibras_user');
    if (finalAccess) window.localStorage.setItem('token', finalAccess);
    if (refreshToken) window.localStorage.setItem('refreshToken', refreshToken);
    if (user) window.localStorage.setItem('user', JSON.stringify(user));
  };

  const clearAuth = () => {
    AUTH_STORAGE_KEYS.forEach((key) => {
      safeStorageRemove(window.localStorage, key);
      safeStorageRemove(window.sessionStorage, key);
    });
  };

  let refreshPromise = null;

  const refreshAccessToken = async (apiBase) => {
    if (refreshPromise) return refreshPromise;

    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    const base = (apiBase || resolveAdminApiUrl()).replace(/\/+$/, '');

    refreshPromise = fetch(`${base}/auth/refresh-tokens`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) {
          clearAuth();
          return null;
        }
        const payload = await response.json().catch(() => ({}));
        const nextAuth = extractAuth(payload);
        if (!nextAuth.accessToken) {
          clearAuth();
          return null;
        }
        setAuth(nextAuth);
        return nextAuth.accessToken;
      })
      .catch(() => {
        clearAuth();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  };

  const fetchMe = async (apiBase, token) => {
    const base = apiBase.replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/auth/me`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        return { status: response.status, user: null };
      }
      const payload = await response.json().catch(() => ({}));
      const user =
        payload?.user || payload?.data?.user || payload?.data || null;
      return { status: 200, user };
    } catch (_) {
      return { status: 0, user: null };
    }
  };

  const validateSession = async (apiBase) => {
    const base = apiBase || resolveAdminApiUrl();
    let token = getToken();
    if (!token) return { ok: false, status: 401 };

    let result = await fetchMe(base, token);
    if (result.status === 200) {
      return { ok: true, user: result.user, status: 200 };
    }
    if (result.status === 401) {
      const nextToken = await refreshAccessToken(base);
      if (!nextToken) return { ok: false, status: 401 };
      result = await fetchMe(base, nextToken);
      if (result.status === 200) {
        return { ok: true, user: result.user, status: 200 };
      }
      return { ok: false, status: result.status || 401 };
    }
    if (result.status === 403) {
      return { ok: false, status: 403 };
    }
    return { ok: true, status: result.status || 0 };
  };

  const performLogout = async (apiBase) => {
    const base = (apiBase || resolveAdminApiUrl()).replace(/\/+$/, '');
    const accessToken = getToken();
    const refreshToken = getRefreshToken();
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    try {
      await fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refreshToken: refreshToken || undefined }),
      });
    } catch (_) {}

    clearAuth();
  };

  window.NibrasSession = Object.freeze({
    TOKEN_READ_KEYS,
    AUTH_STORAGE_KEYS,
    resolveAdminApiUrl,
    getToken,
    getRefreshToken,
    getUser,
    setAuth,
    clearAuth,
    extractAuth,
    refreshAccessToken,
    validateSession,
    performLogout,
  });
})();
