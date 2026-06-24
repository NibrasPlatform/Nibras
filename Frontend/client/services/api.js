/**
 * Centralized API Service Layer
 *
 * Provides typed service methods for all remote backend endpoints.
 * Uses the existing NibrasShared.apiFetch infrastructure for auth, token refresh, and error handling.
 *
 * Services:
 * - authService: Login, register, get current user (admin service)
 * - communityAuthService: Get current user (community service)
 * - questionService: CRUD for questions (legacy community service)
 * - answerService: CRUD for answers/comments (legacy community service)
 * - voteService: Cast/get votes (legacy community service)
 * - communityVoteService: Cast/get votes for threads/posts (community service)
 * - communityCourseService: Course discovery and enrollment (community service)
 * - threadService: Course discussion thread APIs (community service)
 * - postService: Thread post/reply APIs (community service)
 * - notificationService: User notifications (tracking service)
 * - programService: Student program planning and petitions (tracking service)
 * - competitionsService: Competitions contests/problems/accounts flows (competitions service)
 * - tagService: Get/create/update tags (legacy community service)
 * - chatbotService: AI chat ask/publish (legacy community service)
 * - recommendationService: ML track recommendations from grades (recommendation service)
 *
 * Usage:
 *   const user = await window.NibrasServices.authService.getMe();
 *   const questions = await window.NibrasServices.questionService.list();
 */
(function () {
  'use strict';

  // Keep services available even if shared utilities initialize slightly later.

  const isAuthErrorStatus = (status) => status === 401 || status === 403;

  const toQueryString = (filters = {}) => {
    const params = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
      const value = filters[key];
      if (value != null && value !== '') {
        params.append(key, value);
      }
    });
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const unwrapApiData = (payload) => {
    if (payload == null) return null;
    if (typeof payload !== 'object') return payload;
    if (Object.prototype.hasOwnProperty.call(payload, 'data'))
      return payload.data;
    return payload;
  };

  const normalizeBadgesResponse = (payload) => {
    const raw = unwrapApiData(payload) || payload;
    if (Array.isArray(raw?.badges)) return raw.badges;
    if (Array.isArray(raw?.awarded)) return raw.awarded;
    if (Array.isArray(raw)) return raw;
    return [];
  };

  const normalizeLeaderboardResponse = (payload) => {
    const raw = unwrapApiData(payload) || payload || {};
    return {
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      total: Number(raw.total) || 0,
      page: Number(raw.page) || 1,
      limit: Number(raw.limit) || 25,
    };
  };

  const normalizeReputationResponse = (payload) => {
    const raw = unwrapApiData(payload) || payload || {};
    return {
      total: Number(raw.total) || 0,
      weeklyDelta: Number(raw.weeklyDelta) || 0,
      monthlyDelta: Number(raw.monthlyDelta) || 0,
      rank: raw.rank != null ? raw.rank : null,
      percentile: raw.percentile != null ? raw.percentile : null,
      levelLabel: raw.levelLabel || '',
      tier: raw.tier || '',
      breakdown: Array.isArray(raw.breakdown) ? raw.breakdown : [],
      history: Array.isArray(raw.history) ? raw.history : [],
    };
  };

  const mapLeaderboardPeriod = (uiPeriod) => {
    const map = {
      'all-time': 'all',
      all: 'all',
      weekly: 'week',
      week: 'week',
      monthly: 'month',
      month: 'month',
      today: 'today',
    };
    return map[String(uiPeriod || '').toLowerCase()] || 'week';
  };

  const mapLeaderboardCategory = (type) => {
    const map = {
      overall: null,
      academic: 'course',
      competitive: 'contest',
      community: 'community',
      practice: 'problem',
    };
    const key = String(type || 'overall').toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  };

  const buildLeaderboardParams = (filters = {}) => {
    const { period, scope, courseId, page, limit, category, type } = filters;
    const params = {};
    const apiPeriod = mapLeaderboardPeriod(period);
    if (apiPeriod) params.period = apiPeriod;
    if (scope) params.scope = scope;
    if (courseId) params.courseId = courseId;
    if (page) params.page = page;
    if (limit) params.limit = limit;
    const apiCategory =
      category != null && category !== ''
        ? category
        : mapLeaderboardCategory(type);
    if (apiCategory) params.category = apiCategory;
    return params;
  };

  const normalizeCommunityThreadList = (payload) => {
    const raw = unwrapApiData(payload) || payload || {};
    const threads = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.threads)
        ? raw.threads
        : Array.isArray(raw)
          ? raw
          : [];
    return {
      threads,
      total: raw.total,
      page: raw.page,
      limit: raw.limit,
    };
  };

  const normalizeCommunityThread = (payload) => {
    const raw = unwrapApiData(payload) || payload || {};
    const thread =
      raw.thread && typeof raw.thread === 'object' ? raw.thread : raw;
    return { thread };
  };

  const normalizeCommunityPostList = (payload) => {
    const raw = unwrapApiData(payload) || payload;
    const posts = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw?.posts)
          ? raw.posts
          : [];
    return { posts };
  };

  const normalizeCommunityPost = (payload) => {
    const raw = unwrapApiData(payload) || payload || {};
    const post = raw.post && typeof raw.post === 'object' ? raw.post : raw;
    return { post };
  };

  const buildQueryString = (paramsObject = {}) => {
    const params = new URLSearchParams();
    Object.keys(paramsObject).forEach((key) => {
      const value = paramsObject[key];
      if (value == null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry != null && entry !== '') params.append(key, String(entry));
        });
        return;
      }
      params.append(key, String(value));
    });
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  // ============================================================
  // Internal Helpers
  // ============================================================
  const isAbsoluteUrl = (value) => /^https?:\/\//i.test(String(value || ''));

  const joinUrl = (baseUrl, path) => {
    const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
    const normalizedPath = String(path || '');
    if (!normalizedPath) return normalizedBase;
    if (isAbsoluteUrl(normalizedPath)) return normalizedPath;
    if (!normalizedBase) return normalizedPath;
    if (normalizedPath.startsWith('/'))
      return `${normalizedBase}${normalizedPath}`;
    return `${normalizedBase}/${normalizedPath}`;
  };

  const toPlainHeaders = (headers) => {
    if (!headers) return {};
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      const result = {};
      headers.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    return Object.assign({}, headers);
  };

  const hasHeader = (headers, key) =>
    Object.keys(headers || {}).some(
      (headerKey) =>
        headerKey.toLowerCase() === String(key || '').toLowerCase(),
    );

  const normalizeToken = (token) => {
    if (typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!trimmed) return null;
    if (/^bearer\s+/i.test(trimmed))
      return trimmed.replace(/^bearer\s+/i, '').trim() || null;
    return trimmed;
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

  const getTokenFromStorage = (storage) => {
    if (window.NibrasSession) return null;
    const keys = [
      'token',
      'nibras.webSession',
      'accessToken',
      'authToken',
      'jwt',
    ];
    for (let i = 0; i < keys.length; i += 1) {
      const token = pickTokenCandidate(safeStorageGet(storage, keys[i]));
      if (token) return token;
    }
    return null;
  };

  const getToken = () => {
    if (window.NibrasSession) return window.NibrasSession.getToken();
    return (
      getTokenFromStorage(window.localStorage) ||
      getTokenFromStorage(window.sessionStorage)
    );
  };

  const getRefreshToken = () => {
    if (window.NibrasSession) return window.NibrasSession.getRefreshToken();
    return (
      safeStorageGet(window.localStorage, 'refreshToken') ||
      safeStorageGet(window.sessionStorage, 'refreshToken')
    );
  };

  const getUser = () => {
    if (window.NibrasSession) return window.NibrasSession.getUser();
    const raw = safeStorageGet(window.localStorage, 'user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  };

  const safeStorageGet = (storage, key) => {
    if (!storage || !key) return null;
    try {
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  const extractAuth = (payload) => {
    if (window.NibrasSession) return window.NibrasSession.extractAuth(payload);
    const data = payload && payload.data ? payload.data : payload || {};
    const tokens =
      payload && payload.tokens ? payload.tokens : data.tokens || {};
    const user = data.user || payload?.user || data;
    const accessToken =
      data.token || payload?.token || tokens?.access?.token || null;
    const refreshToken =
      data.refreshToken ||
      payload?.refreshToken ||
      tokens?.refresh?.token ||
      null;
    return {
      accessToken,
      refreshToken,
      user: user && user._id ? user : payload?.data || null,
    };
  };

  const setAuth = ({ token, accessToken, refreshToken, user }) => {
    if (window.NibrasSession) {
      window.NibrasSession.setAuth({ token, accessToken, refreshToken, user });
      return;
    }
    const finalAccess = accessToken || token || null;
    if (finalAccess) window.localStorage.setItem('token', finalAccess);
    if (refreshToken) window.localStorage.setItem('refreshToken', refreshToken);
    if (user) window.localStorage.setItem('user', JSON.stringify(user));
  };

  const clearAuth = () => {
    if (window.NibrasSession) {
      window.NibrasSession.clearAuth();
      return;
    }
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('refreshToken');
    window.localStorage.removeItem('user');
  };

  const safeParseResponse = async (response) => {
    let rawText = '';
    try {
      rawText = await response.text();
    } catch (_) {
      return { payload: null, rawText: '', isJson: false };
    }

    if (!rawText) {
      return { payload: null, rawText: '', isJson: false };
    }

    const parsed = tryParseJson(rawText);
    if (parsed.ok) {
      return { payload: parsed.value, rawText, isJson: true };
    }

    return { payload: null, rawText, isJson: false };
  };

  const getErrorMessage = (payload, status, statusText, rawText) => {
    const serverMessage = [
      payload?.message,
      payload?.error?.message,
      typeof payload?.error === 'string' ? payload.error : null,
    ].find((candidate) => typeof candidate === 'string' && candidate.trim());

    if (status === 401) {
      return (
        serverMessage?.trim() ||
        'Authentication required. Please sign in to continue.'
      );
    }
    if (status === 403) {
      return (
        serverMessage?.trim() ||
        'You do not have permission to perform this action.'
      );
    }
    if (status === 429) {
      return 'Too many attempts. Please wait a moment before trying again.';
    }

    const candidates = [
      serverMessage || null,
      payload?.message,
      payload?.error?.message,
      typeof payload?.error === 'string' ? payload.error : null,
      Array.isArray(payload?.errors) && payload.errors.length
        ? payload.errors
            .map((entry) => entry?.message || entry?.msg)
            .filter(Boolean)
            .join(' ')
        : null,
      rawText || null,
      status
        ? `Request failed (${status}${statusText ? ` ${statusText}` : ''})`
        : null,
      'Request failed',
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (typeof candidate === 'string' && candidate.trim())
        return candidate.trim();
    }
    return 'Request failed';
  };

  const getErrorCode = (status, explicitCode = null) =>
    explicitCode || AUTH_ERROR_CODES[status] || 'REQUEST_FAILED';
  const AUTH_ERROR_CODES = Object.freeze({
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    429: 'RATE_LIMITED',
  });
  const COMPETITIONS_REQUEST_TIMEOUT_MS = 15000;

  const isCompetitionsFallbackCandidate = (error) => {
    if (!error || typeof error !== 'object') return false;
    const status = Number(error.status || 0);
    const code = String(error.code || '').toUpperCase();
    if (code === 'TIMEOUT' || code === 'NETWORK_ERROR') return true;
    return (
      status === 0 ||
      status === 404 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  };

  const normalizeError = ({
    status = 0,
    statusText = '',
    payload = null,
    rawText = '',
    service = 'admin',
    url = '',
    code = null,
  }) => {
    const message = getErrorMessage(payload, status, statusText, rawText);
    return {
      message,
      status,
      statusText,
      code: getErrorCode(status, code),
      isAuthError: isAuthErrorStatus(status),
      payload,
      rawText: rawText || '',
      service,
      url,
    };
  };

  const toError = (normalizedError) => {
    const err = new Error(normalizedError?.message || 'Request failed');
    err.status = normalizedError?.status || 0;
    err.statusText = normalizedError?.statusText || '';
    err.code = normalizedError?.code || 'REQUEST_FAILED';
    err.isAuthError = Boolean(normalizedError?.isAuthError);
    err.payload = normalizedError?.payload || null;
    err.service = normalizedError?.service || 'admin';
    err.url = normalizedError?.url || '';
    err.rawText = normalizedError?.rawText || '';
    return err;
  };

  const buildAuthHeaders = (headers, options = {}) => {
    const result = toPlainHeaders(headers);
    const authEnabled = options.auth !== false;
    if (!authEnabled) return result;

    const replaceAuthorization = options.replaceAuthorization === true;
    if (replaceAuthorization) {
      Object.keys(result).forEach((key) => {
        if (String(key).toLowerCase() === 'authorization') {
          delete result[key];
        }
      });
    }

    if (hasHeader(result, 'Authorization')) return result;

    const token = normalizeToken(options.token || getToken());
    if (token) result.Authorization = `Bearer ${token}`;
    return result;
  };

  const resolveServiceUrl = (service = 'admin') => {
    if (
      window.NibrasApiConfig &&
      typeof window.NibrasApiConfig.getServiceUrl === 'function'
    ) {
      return window.NibrasApiConfig.getServiceUrl(service);
    }
    // Use fallback values from window if config is missing
    const fallbacks = {
      admin: window.NIBRAS_API_URL || window.NIBRAS_BACKEND_URL,
      legacyCommunity: window.NIBRAS_LEGACY_API_URL || window.NIBRAS_API_URL,
      community: window.NIBRAS_COMMUNITY_API_URL || window.NIBRAS_API_URL,
      tracking: window.NIBRAS_TRACKING_API_URL || window.NIBRAS_API_URL,
      competitions: window.NIBRAS_COMPETITIONS_API_URL || window.NIBRAS_API_URL,
      recommendation:
        window.NIBRAS_RECOMMENDATION_API_URL || window.NIBRAS_API_URL,
      courses: window.NIBRAS_COURSES_API_URL || window.NIBRAS_API_URL,
    };
    return fallbacks[service] || fallbacks.admin;
  };

  // ============================================================
  // Core Request Logic (with Retry & Token Refresh)
  // ============================================================
  const emitAuthError = (normalizedError) => {
    if (!normalizedError || !isAuthErrorStatus(normalizedError.status)) return;
    if (
      typeof window?.dispatchEvent !== 'function' ||
      typeof window?.CustomEvent !== 'function'
    )
      return;
    try {
      window.dispatchEvent(
        new window.CustomEvent(AUTH_ERROR_EVENT, {
          detail: {
            status: normalizedError.status,
            code: normalizedError.code,
            message: normalizedError.message,
            service: normalizedError.service,
            url: normalizedError.url,
          },
        }),
      );
    } catch (_) {
      // ignore custom event dispatch failures
    }
  };

  const request = async (path, options = {}) => {
    const settings = Object.assign({}, options);
    const service = settings.service || 'admin';
    const authEnabled = settings.auth !== false;
    const throwOnError = settings.throwOnError === true;
    const timeoutMs = Number(settings.timeoutMs || settings.timeout || 0);
    const method = (settings.method || 'GET').toUpperCase();
    const explicitBaseUrl =
      settings.baseUrl || settings.serviceUrl || settings.url || null;

    delete settings.service;
    delete settings.auth;
    delete settings.throwOnError;
    delete settings.timeout;
    delete settings.timeoutMs;
    delete settings.baseUrl;
    delete settings.serviceUrl;
    delete settings.url;

    const headers = buildAuthHeaders(settings.headers, { auth: authEnabled });
    delete settings.headers;

    const hasBody =
      Object.prototype.hasOwnProperty.call(settings, 'body') &&
      settings.body != null;
    const isJsonBody =
      hasBody &&
      typeof settings.body === 'object' &&
      !(settings.body instanceof FormData) &&
      !(
        typeof URLSearchParams !== 'undefined' &&
        settings.body instanceof URLSearchParams
      ) &&
      !(typeof Blob !== 'undefined' && settings.body instanceof Blob) &&
      !(
        typeof ArrayBuffer !== 'undefined' &&
        settings.body instanceof ArrayBuffer
      );
    if (isJsonBody) {
      if (!hasHeader(headers, 'Content-Type'))
        headers['Content-Type'] = 'application/json';
      settings.body = JSON.stringify(settings.body);
    }
    const baseUrl = explicitBaseUrl || resolveServiceUrl(service);
    const requestUrl = joinUrl(baseUrl, path);

    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId =
      timeoutMs > 0 && controller
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
      const response = await fetch(
        requestUrl,
        Object.assign({}, settings, {
          method,
          headers,
          signal: controller ? controller.signal : settings.signal,
        }),
      );
      const parsed = await safeParseResponse(response);
      const payload = parsed.payload;
      const data = parsed.isJson ? payload : parsed.rawText || null;

      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        service,
        url: requestUrl,
        data: response.ok ? data : null,
        payload,
        rawText: parsed.rawText || '',
        error: null,
        response,
      };

      if (!response.ok) {
        result.error = normalizeError({
          status: response.status,
          statusText: response.statusText,
          payload,
          rawText: parsed.rawText,
          service,
          url: requestUrl,
        });
        if (throwOnError) throw toError(result.error);
      }

      return result;
    } catch (error) {
      if (
        throwOnError &&
        error &&
        typeof error.status === 'number' &&
        error.status > 0
      ) {
        throw error;
      }
      const isAbort =
        error &&
        (error.name === 'AbortError' ||
          /aborted|timeout/i.test(String(error.message || '')));
      const normalizedError = normalizeError({
        status: 0,
        payload: null,
        rawText: '',
        service,
        url: requestUrl,
        code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      });
      normalizedError.message = isAbort
        ? `Request timeout after ${timeoutMs}ms`
        : error?.message || normalizedError.message;

      if (throwOnError) throw toError(normalizedError);

      return {
        ok: false,
        status: 0,
        statusText: '',
        service,
        url: requestUrl,
        data: null,
        payload: null,
        rawText: '',
        error: normalizedError,
        response: null,
      };
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const REFRESH_ELIGIBLE_SERVICES = new Set([
    'admin',
    'legacyCommunity',
    'community',
    'tracking',
    'competitions',
    'courses',
  ]);
  let refreshPromise = null;

  const refreshAccessToken = async () => {
    if (window.NibrasSession) {
      return window.NibrasSession.refreshAccessToken(
        resolveServiceUrl('admin'),
      );
    }
    if (refreshPromise) return refreshPromise;

    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    refreshPromise = request('/auth/refresh-tokens', {
      service: 'admin',
      method: 'POST',
      auth: false,
      throwOnError: true,
      body: { refreshToken },
    })
      .then((result) => {
        const nextAuth = extractAuth(result?.data || {});
        if (!nextAuth.accessToken) return null;
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

  const apiFetch = async (path, options = {}) => {
    const service = options.service || 'admin';
    const authEnabled = options.auth !== false;
    const retryAuth = options.retryAuth !== false;
    const requestedTimeout = Number(options.timeoutMs || options.timeout || 0);
    const timeoutMs =
      requestedTimeout > 0
        ? requestedTimeout
        : service === 'competitions'
          ? COMPETITIONS_REQUEST_TIMEOUT_MS
          : 0;
    const requestOptions = Object.assign({}, options, {
      service,
      auth: authEnabled,
      throwOnError: false,
      timeoutMs,
    });
    delete requestOptions.retryAuth;

    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      toPlainHeaders(requestOptions.headers),
    );
    if (
      requestOptions.body instanceof FormData &&
      !hasHeader(toPlainHeaders(options.headers), 'Content-Type')
    ) {
      delete headers['Content-Type'];
    }
    requestOptions.headers = headers;

    let result = await request(path, requestOptions);

    if (
      !result.ok &&
      service === 'competitions' &&
      isCompetitionsFallbackCandidate(result.error)
    ) {
      result = await request(
        path,
        Object.assign({}, requestOptions, {
          service: 'admin',
        }),
      );
    }

    const shouldRetryWithRefresh =
      REFRESH_ELIGIBLE_SERVICES.has(service) &&
      authEnabled &&
      retryAuth &&
      result.status === 401 &&
      path !== '/auth/login' &&
      path !== '/auth/register' &&
      path !== '/auth/refresh-tokens';

    if (shouldRetryWithRefresh) {
      const nextAccessToken = await refreshAccessToken();
      if (nextAccessToken) {
        const retryHeaders = buildAuthHeaders(headers, {
          token: nextAccessToken,
          replaceAuthorization: true,
        });
        result = await request(
          path,
          Object.assign({}, requestOptions, { headers: retryHeaders }),
        );
      }
    }

    if (authEnabled && isAuthErrorStatus(result.status)) {
      emitAuthError(
        result.error ||
          normalizeError({ status: result.status, service, url: result.url }),
      );
    }

    if (!result.ok) {
      throw toError(
        result.error ||
          normalizeError({ status: result.status, service, url: result.url }),
      );
    }

    return result.data;
  };

  let logoutRequestPromise = null;

  // ============================================================
  // Auth Service (admin)
  // ============================================================
  const authService = {
    /**
     * Login with email and password
     * @param {string} email
     * @param {string} password
     * @returns {Promise<object>}
     */
    async login(email, password) {
      return apiFetch('/auth/login', {
        service: 'admin',
        method: 'POST',
        auth: false,
        retryAuth: false,
        body: { email, password },
      });
    },

    /**
     * Register a new user
     * @param {object} data - { name, email, password, role? }
     * @returns {Promise<object>}
     */
    async register(data) {
      return apiFetch('/auth/register', {
        service: 'admin',
        method: 'POST',
        auth: false,
        retryAuth: false,
        body: data,
      });
    },

    /**
     * Verify email OTP for manual registration
     * @param {string} email
     * @param {string} otp
     * @returns {Promise<object>}
     */
    async verifyOtp(email, otp) {
      return apiFetch('/auth/verify-otp', {
        service: 'admin',
        method: 'POST',
        auth: false,
        retryAuth: false,
        body: { email, otp },
      });
    },

    /**
     * Login or register with Google idToken
     * @param {string} idToken
     * @returns {Promise<object>}
     */
    async loginWithGoogle(idToken) {
      return apiFetch('/auth/google', {
        service: 'admin',
        method: 'POST',
        auth: false,
        retryAuth: false,
        body: { idToken },
      });
    },

    /**
     * Get the currently authenticated user profile
     * @returns {Promise<{user: object}>}
     */
    async getMe() {
      return apiFetch('/auth/me', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Revoke current refresh token session
     * @param {string} refreshToken
     * @returns {Promise<object>}
     */
    async logout(refreshToken) {
      return apiFetch('/auth/logout', {
        service: 'admin',
        method: 'POST',
        auth: true,
        retryAuth: false,
        body: { refreshToken },
      });
    },

    /**
     * Send forgot password email
     * @param {string} email
     * @returns {Promise<object>}
     */
    async forgotPassword(email) {
      return apiFetch('/auth/forgot-password', {
        service: 'admin',
        method: 'POST',
        auth: false,
        retryAuth: false,
        body: { email },
      });
    },

    /**
     * Reset password with token or OTP
     * @param {object} data - { token, password } or { email, otp, newPassword }
     * @returns {Promise<object>}
     */
    async resetPassword(data) {
      return apiFetch('/auth/reset-password', {
        service: 'admin',
        method: 'POST',
        auth: false,
        retryAuth: false,
        body: data,
      });
    },

    /**
     * Change password for the authenticated user
     * @param {object} data - { currentPassword, newPassword }
     * @returns {Promise<object>}
     */
    async changePassword(data) {
      return apiFetch('/auth/change-password', {
        service: 'admin',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Update current user profile
     * @param {object} data - { name?, avatarUrl?, preferences? }
     * @returns {Promise<object>}
     */
    async updateProfile(data) {
      return apiFetch('/users/me', {
        service: 'admin',
        method: 'PATCH',
        auth: true,
        body: data,
      });
    },

    /**
     * Get user by ID (admin only)
     * @param {string} id
     * @returns {Promise<object>}
     */
    async getUserById(id) {
      return apiFetch(`/users/${id}`, {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Auth Service (community)
  // ============================================================
  const communityAuthService = {
    /**
     * Get the current community user profile
     * @returns {Promise<{user: object}>}
     */
    async getMe() {
      return apiFetch('/auth/me', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Question Service (legacy community)
  // ============================================================
  const questionService = {
    /**
     * List all questions (with optional filters)
     * @param {object} filters - { search, title, tag, course }
     * @returns {Promise<Array>}
     */
    async list(filters = {}) {
      const params = new URLSearchParams();
      Object.keys(filters).forEach((key) => {
        if (filters[key] != null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      const query = params.toString();
      return apiFetch(`/v1/community/questions${query ? '?' + query : ''}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Get a single question by ID with its answers
     * @param {string} id - Question MongoDB ObjectId
     * @returns {Promise<{question: object, answers: Array}>}
     */
    async getById(id) {
      return apiFetch(`/v1/community/questions/${id}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Create a new question
     * @param {object} data - { title, body, tags?, course? }
     * @returns {Promise<object>}
     */
    async create(data) {
      return apiFetch('/v1/community/questions', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Update a question (owner only)
     * @param {string} id - Question MongoDB ObjectId
     * @param {object} data - Fields to update { title?, body?, tags?, course? }
     * @returns {Promise<object>}
     */
    async update(id, data) {
      return apiFetch(`/v1/community/questions/${id}`, {
        service: 'legacyCommunity',
        method: 'PATCH',
        auth: true,
        body: data,
      });
    },

    /**
     * Delete a question (owner or admin)
     * @param {string} id - Question MongoDB ObjectId
     * @returns {Promise<object>}
     */
    async delete(id) {
      return apiFetch(`/v1/community/questions/${id}`, {
        service: 'legacyCommunity',
        method: 'DELETE',
        auth: true,
      });
    },

    /**
     * Full-text search questions
     * @param {string} query - Search query
     * @param {object} filters - { page, limit, tag }
     * @returns {Promise<object>}
     */
    async search(query, filters = {}) {
      const params = new URLSearchParams();
      params.append('q', query);
      Object.keys(filters).forEach((key) => {
        if (filters[key] != null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      return apiFetch(`/questions/search?${params.toString()}`, {
        service: 'admin',
        method: 'GET',
        auth: false,
      });
    },

    async listBookmarks() {
      return apiFetch('/v1/community/bookmarks', {
        service: 'legacyCommunity',
        method: 'GET',
        auth: true,
      });
    },

    async bookmark(id) {
      return apiFetch(
        `/v1/community/questions/${encodeURIComponent(String(id || ''))}/bookmark`,
        {
          service: 'legacyCommunity',
          method: 'POST',
          auth: true,
          body: {},
        },
      );
    },

    async removeBookmark(id) {
      return apiFetch(
        `/v1/community/questions/${encodeURIComponent(String(id || ''))}/bookmark`,
        {
          service: 'legacyCommunity',
          method: 'DELETE',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Answer Service (legacy community)
  // ============================================================
  const answerService = {
    /**
     * Get all answers for a question
     * @param {string} questionId - Question MongoDB ObjectId
     * @returns {Promise<Array>}
     */
    async listByQuestion(questionId) {
      return apiFetch(`/v1/community/answers/question/${questionId}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Get an answer by ID
     * @param {string} questionId - Question MongoDB ObjectId
     * @param {string} answerId - Answer MongoDB ObjectId
     * @returns {Promise<object>}
     */
    async getById(questionId, answerId) {
      const payload = await apiFetch(
        `/v1/community/answers/question/${questionId}`,
        {
          service: 'legacyCommunity',
          method: 'GET',
          auth: false,
        },
      );
      const answers =
        payload?.answers ||
        unwrapApiData(payload)?.answers ||
        unwrapApiData(payload) ||
        [];
      const match = Array.isArray(answers)
        ? answers.find(
            (entry) =>
              String(entry?.id || entry?._id || '') === String(answerId || ''),
          )
        : null;
      return match ? { answer: match } : payload;
    },

    /**
     * Create an answer
     * @param {string} questionId - Question MongoDB ObjectId
     * @param {object} data - { body, isFromAI? }
     * @returns {Promise<object>}
     */
    async create(questionId, data) {
      return apiFetch(`/v1/community/answers/${questionId}`, {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Update an answer (owner only)
     * @param {string} questionId - Question MongoDB ObjectId
     * @param {string} answerId - Answer MongoDB ObjectId
     * @param {object} data - { body }
     * @returns {Promise<object>}
     */
    async update(questionId, answerId, data) {
      return apiFetch(`/v1/community/answers/${answerId}`, {
        service: 'legacyCommunity',
        method: 'PATCH',
        auth: true,
        body: data,
      });
    },

    /**
     * Delete an answer (owner or admin)
     * @param {string} questionId - Question MongoDB ObjectId
     * @param {string} answerId - Answer MongoDB ObjectId
     * @returns {Promise<object>}
     */
    async delete(questionId, answerId) {
      return apiFetch(`/v1/community/answers/${answerId}`, {
        service: 'legacyCommunity',
        method: 'DELETE',
        auth: true,
      });
    },

    /**
     * Accept an answer (question author only)
     * @param {string} answerId - Answer MongoDB ObjectId
     * @returns {Promise<object>}
     */
    async accept(questionId, answerId) {
      return apiFetch(
        `/v1/community/answers/${encodeURIComponent(String(answerId))}/accept`,
        {
          service: 'legacyCommunity',
          method: 'PATCH',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Vote Service (legacy community)
  // ============================================================
  const voteService = {
    /**
     * Cast or toggle a vote
     * @param {object} data - { targetType: 'question'|'answer', targetId: string, value: 1|-1 }
     * @returns {Promise<{message: string, action: string, voteValue: number, votesCount: number}>}
     */
    async cast(data) {
      return apiFetch('/v1/community/votes', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Get the current user's vote on a target
     * @param {object} params - { targetType: 'question'|'answer', targetId: string }
     * @returns {Promise<{value: number}>} 1, -1, or 0
     */
    async getMyVote(params) {
      const targetType =
        params.targetType === 'question' ? 'question' : 'answer';
      return apiFetch(`/v1/community/votes/${targetType}/${params.targetId}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Vote Service (course-thread community)
  // ============================================================
  const communityVoteService = {
    /**
     * Cast or toggle a vote for thread/post targets
     * @param {object} data - { targetType: 'thread'|'post', targetId: string, value: 1|-1 }
     * @returns {Promise<{message: string, action: string, voteValue: number, votesCount: number}>}
     */
    async cast(data) {
      return apiFetch('/v1/community/votes', {
        service: 'community',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Get the current user's vote on a thread/post target
     * @param {object} params - { targetType: 'thread'|'post', targetId: string }
     * @returns {Promise<{value: number}>}
     */
    async getMyVote(params) {
      const targetType = params.targetType === 'thread' ? 'thread' : 'post';
      return apiFetch(`/v1/community/votes/${targetType}/${params.targetId}`, {
        service: 'community',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Tag Service (legacy community)
  // ============================================================
  const tagService = {
    /**
     * Get all tags
     * @returns {Promise<Array>}
     */
    async list() {
      return apiFetch('/v1/community/tags', {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Get popular tags
     * @param {number} limit - Max number of tags to return
     * @returns {Promise<Array>}
     */
    async popular(limit = 5) {
      return apiFetch(`/v1/community/tags/popular?limit=${limit}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Get a tag by ID
     * @param {string} id - Tag MongoDB ObjectId
     * @returns {Promise<object>}
     */
    async getById(id) {
      return apiFetch(`/v1/community/tags/${id}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Get tag suggestions for autocomplete
     * @param {string} partial - Partial tag name input
     * @returns {Promise<Array>}
     */
    async suggest(partial) {
      const params = new URLSearchParams();
      if (partial) params.append('search', partial);
      return apiFetch(`/tags?${params.toString()}`, {
        service: 'admin',
        method: 'GET',
        auth: false,
      });
    },
  };

  // ============================================================
  // Flag Service (content moderation)
  // ============================================================
  const flagService = {
    /**
     * Report content as inappropriate
     * @param {object} data - { targetId, targetType: 'question'|'answer'|'thread'|'post', reason: string }
     * @returns {Promise<object>}
     */
    async create(data) {
      return apiFetch('/v1/community/reports', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Get moderation queue (admin only)
     * @param {object} filters - { status, page, limit }
     * @returns {Promise<object>}
     */
    async getQueue(filters = {}) {
      const params = new URLSearchParams();
      Object.keys(filters).forEach((key) => {
        if (filters[key] != null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      const query = params.toString();
      return apiFetch(`/v1/community/reports${query ? '?' + query : ''}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Resolve a report (admin only)
     * @param {string} reportId - Report id
     * @param {object} data - { action: 'dismiss'|'hide'|'remove', note?: string }
     * @returns {Promise<object>}
     */
    async resolve(reportId, data) {
      const actionMap = {
        dismiss: 'dismiss',
        remove: 'remove',
        ban: 'ban',
        hide: 'hide',
      };
      const action =
        actionMap[String(data?.action || '').toLowerCase()] || 'dismiss';
      return apiFetch(`/v1/community/reports/${reportId}`, {
        service: 'legacyCommunity',
        method: 'PATCH',
        auth: true,
        body: { action, note: data?.note },
      });
    },
  };

  // ============================================================
  // Chatbot Service (legacy community)
  // ============================================================
  const extractQuestionEntity = (payload) => {
    const data = unwrapApiData(payload);
    const candidates = [
      payload?.data?.question,
      payload?.question,
      data?.question,
      data,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (!candidate || typeof candidate !== 'object') continue;
      if (candidate._id || candidate.id) return candidate;
    }

    return null;
  };

  const extractQuestionId = (payload) => {
    const question = extractQuestionEntity(payload);
    if (question) return question._id || question.id || null;

    const data = unwrapApiData(payload);
    return (
      payload?.data?.questionId ||
      payload?.questionId ||
      data?.questionId ||
      null
    );
  };

  const isRoleObjectIdCastError = (error) => {
    const msg = String(error?.message || error?.payload?.message || '');
    return /Cast to ObjectId failed/i.test(msg) && /path\s+"?role"?/i.test(msg);
  };

  const AI_TUTOR_MARKER = '<!--NIBRAS_AI_TUTOR-->';
  const withAiTutorMarker = (answerText) => {
    const normalized = String(answerText || '').trim();
    if (!normalized) return normalized;
    if (normalized.includes(AI_TUTOR_MARKER)) return normalized;
    return `${normalized}\n\n${AI_TUTOR_MARKER}`;
  };

  const normalizeAskResponse = (payload) => {
    const raw = unwrapApiData(payload) || payload || {};
    const answer = String(raw.answer ?? raw.finalAnswer ?? '').trim();
    const refused =
      Boolean(raw.refused) ||
      String(raw.status || '')
        .trim()
        .toLowerCase() === 'off_topic';
    return {
      answer,
      finalAnswer: answer,
      hints: Array.isArray(raw.hints) ? raw.hints : [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      followUps: Array.isArray(raw.followUps) ? raw.followUps : [],
      communityQuestionId: raw.communityQuestionId ?? null,
      communityQuestion: raw.communityQuestion ?? null,
      matchScore: raw.matchScore ?? null,
      citations: Array.isArray(raw.citations) ? raw.citations : [],
      xai: raw.xai ?? null,
      refused,
      persistenceWarning: raw.persistenceWarning ?? null,
    };
  };

  const normalizePublishPayload = (data = {}) => {
    const title = String(data?.title || '').trim();
    const question = String(data?.question || '').trim();
    const answerText = String(
      data?.finalAnswer != null ? data.finalAnswer : data?.answer || '',
    ).trim();
    const answer = withAiTutorMarker(answerText);
    const tags = Array.from(
      new Set(
        (Array.isArray(data?.tags) ? data.tags : [])
          .map((tag) => String(tag || '').trim())
          .filter(Boolean),
      ),
    );

    return { title, question, answer, tags };
  };

  const chatbotService = {
    normalizeAskResponse,

    async getConfig() {
      return apiFetch('/v1/community/chatbot/config', {
        service: 'legacyCommunity',
        method: 'GET',
        auth: false,
      });
    },

    /**
     * Ask the AI chatbot a question
     * @param {string} question
     * @param {object} [options] - { history?, conversationId?, context? }
     */
    async ask(question, options = {}) {
      const body = { question };
      if (Array.isArray(options.history) && options.history.length) {
        body.history = options.history;
      }
      if (options.conversationId) body.conversationId = options.conversationId;
      if (options.context) body.context = options.context;
      const payload = await apiFetch('/v1/community/chatbot/ask', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body,
      });
      return normalizeAskResponse(payload);
    },

    /**
     * Stream an AI tutor answer (SSE). Falls back to non-streaming ask on failure.
     * @param {string} question
     * @param {object} options - { history?, conversationId?, context?, onToken?, onDone?, onError? }
     */
    async askStream(question, options = {}) {
      const baseUrl = resolveServiceUrl('legacyCommunity');
      const url = joinUrl(baseUrl, '/v1/community/chatbot/ask/stream');
      const body = { question };
      if (Array.isArray(options.history) && options.history.length) {
        body.history = options.history;
      }
      if (options.conversationId) body.conversationId = options.conversationId;
      if (options.context) body.context = options.context;

      const headers = buildAuthHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        return chatbotService.ask(question, options);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullAnswer = '';
      let citations = [];

      const parseEvent = (line) => {
        if (!line.startsWith('data: ')) return null;
        try {
          return JSON.parse(line.slice(6));
        } catch (_) {
          return null;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (let i = 0; i < lines.length; i += 1) {
          const evt = parseEvent(lines[i].trim());
          if (!evt) continue;
          if (evt.type === 'token' && evt.content) {
            fullAnswer += evt.content;
            if (typeof options.onToken === 'function') {
              options.onToken(evt.content, fullAnswer);
            }
          } else if (evt.type === 'done') {
            fullAnswer = String(evt.answer || fullAnswer).trim();
            citations = Array.isArray(evt.citations) ? evt.citations : [];
            if (typeof options.onDone === 'function') {
              options.onDone({ answer: fullAnswer, citations });
            }
          } else if (evt.type === 'error') {
            if (typeof options.onError === 'function') {
              options.onError(new Error(evt.message || 'Stream failed'));
            }
            return chatbotService.ask(question, options);
          }
        }
      }

      return normalizeAskResponse({
        answer: fullAnswer,
        hints: [],
        tags: [],
        followUps: [],
        citations,
        refused: false,
      });
    },

    async explainTerm({ term, context = '', conversationId = null } = {}) {
      const body = { term, context };
      if (conversationId) body.conversationId = conversationId;
      return apiFetch('/v1/community/chatbot/explain', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body,
      });
    },

    async getInsights() {
      return apiFetch('/v1/community/chatbot/insights', {
        service: 'legacyCommunity',
        method: 'GET',
        auth: true,
      });
    },

    async getRouting(goal) {
      return apiFetch('/v1/community/chatbot/routing', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body: { goal },
      });
    },

    async listConversations({ page = 1, limit = 30 } = {}) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      return apiFetch(`/v1/tutor/conversations?${params}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: true,
      });
    },

    async createConversation(title = 'New conversation') {
      return apiFetch('/v1/tutor/conversations', {
        service: 'legacyCommunity',
        method: 'POST',
        auth: true,
        body: { title },
      });
    },

    async getConversation(id) {
      return apiFetch(`/v1/tutor/conversations/${encodeURIComponent(id)}`, {
        service: 'legacyCommunity',
        method: 'GET',
        auth: true,
      });
    },

    async deleteConversation(id) {
      return apiFetch(`/v1/tutor/conversations/${encodeURIComponent(id)}`, {
        service: 'legacyCommunity',
        method: 'DELETE',
        auth: true,
      });
    },

    async renameConversation(id, title) {
      return apiFetch(`/v1/tutor/conversations/${encodeURIComponent(id)}`, {
        service: 'legacyCommunity',
        method: 'PATCH',
        auth: true,
        body: { title },
      });
    },

    async rateMessage(messageId, { rating, comment } = {}) {
      return apiFetch(
        `/v1/tutor/messages/${encodeURIComponent(messageId)}/feedback`,
        {
          service: 'legacyCommunity',
          method: 'POST',
          auth: true,
          body: { rating, comment },
        },
      );
    },

    /**
     * Publish a chatbot answer as a community question
     * @param {object} data - { title, question, finalAnswer, tags? }
     */
    async publish(data) {
      const payload = normalizePublishPayload(data);
      try {
        return await apiFetch('/v1/community/chatbot/publish', {
          service: 'legacyCommunity',
          method: 'POST',
          auth: true,
          body: payload,
        });
      } catch (error) {
        if (!isRoleObjectIdCastError(error)) throw error;

        const questionPayload = await questionService.create({
          title: payload.title,
          body: payload.question,
          tags: payload.tags,
        });
        const questionId = extractQuestionId(questionPayload);
        if (!questionId) throw error;

        const answerPayload = await answerService.create(questionId, {
          body: payload.answer,
          isFromAI: true,
        });

        return {
          data: {
            question: extractQuestionEntity(questionPayload) || {
              _id: questionId,
              id: questionId,
            },
            answer: unwrapApiData(answerPayload),
            source: 'community-route-fallback',
          },
        };
      }
    },
  };

  // ============================================================
  // Recommendation Service (recommendation backend)
  // ============================================================
  const normalizeRecommendationGrade = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value < 0) return 0;
      if (value > 100) return 100;
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.replace('%', '').trim());
      if (!Number.isFinite(parsed)) return null;
      return normalizeRecommendationGrade(parsed);
    }
    return null;
  };

  const sanitizeRecommendationGrades = (grades) => {
    const source = grades && typeof grades === 'object' ? grades : {};
    const normalized = {};
    Object.keys(source).forEach((courseCode) => {
      const code = String(courseCode || '').trim();
      if (!code) return;
      const grade = normalizeRecommendationGrade(source[courseCode]);
      if (grade == null) return;
      normalized[code] = Number(grade.toFixed(2));
    });
    return normalized;
  };

  const isRecommendationRouteNotFoundError = (error) => {
    const status = Number(error?.status || 0);
    const message = String(
      error?.message || error?.payload?.message || '',
    ).toLowerCase();
    if (status === 404) return true;
    return message.includes('route not found') || message.includes('not found');
  };

  const isRecommendationAuthError = (error) => {
    const status = Number(error?.status || 0);
    return status === 401 || status === 403;
  };

  const requestRecommendationGradesCandidate = async (candidate) =>
    apiFetch(candidate.path, {
      service: candidate.service,
      method: candidate.method || 'GET',
      auth: candidate.auth !== false,
      retryAuth: candidate.retryAuth !== false,
      body: candidate.body,
      baseUrl: candidate.baseUrl || null,
    });

  const normalizeRecommendationServiceBaseUrl = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      pathname = pathname.replace(/\/recommend$/i, '');
      if (!pathname || pathname === '/') pathname = '/api';
      parsed.pathname = pathname;
      return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
      return trimmed.replace(/\/recommend$/i, '');
    }
  };

  const isRecommendationNetworkError = (error) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      status === 0 ||
      code === 'NETWORK_ERROR' ||
      message.includes('failed to fetch') ||
      message.includes('network')
    );
  };

  const buildLocalRecommendationFallback = (normalizedGrades, endpoint) => {
    const entries = Object.entries(normalizedGrades).sort(
      (a, b) => b[1] - a[1],
    );
    const average = entries.length
      ? Math.round(
          entries.reduce((sum, [, grade]) => sum + grade, 0) / entries.length,
        )
      : 0;

    const strengths = entries
      .slice(0, 3)
      .map(([code, grade]) => `${code}: ${grade}%`);
    const trackSet = new Set();
    entries.forEach(([code]) => {
      const upper = String(code || '').toUpperCase();
      if (/^(CS|CSE|SWE|SE)/.test(upper)) trackSet.add('Software Engineering');
      if (/^(AI|ML|DS|STAT|MATH)/.test(upper))
        trackSet.add('Data Science & AI');
      if (/^(CYB|SEC|NET)/.test(upper)) trackSet.add('Cybersecurity');
      if (/^(EE|ECE|PHY|EMB)/.test(upper))
        trackSet.add('Embedded & Systems Engineering');
      if (/^(HCI|UX|DES)/.test(upper)) trackSet.add('UI/UX Engineering');
      if (/^(BUS|MGT|PM|FIN)/.test(upper))
        trackSet.add('Product & Project Management');
    });

    if (!trackSet.size) {
      if (average >= 85) {
        trackSet.add('Advanced Software Engineering');
        trackSet.add('Data Science & AI');
      } else if (average >= 70) {
        trackSet.add('Software Engineering');
        trackSet.add('Product & Project Management');
      } else {
        trackSet.add('Foundation Track Reinforcement');
        trackSet.add('Software Engineering');
      }
    }

    return {
      strengths,
      recommendations: Array.from(trackSet).slice(0, 3),
      explanation: `Recommendation API call is blocked from browser context (likely CORS) for: ${endpoint || 'configured endpoint'}. Showing local heuristic recommendations until server CORS is fixed.`,
      source: 'local-fallback',
    };
  };

  const recommendationService = {
    /**
     * Retrieve raw grades payload from available backend routes.
     * Tries multiple routes/services to tolerate partial deployments.
     * @param {{refreshSheet?: boolean}} options
     * @returns {Promise<{payload: any, source: string}>}
     */
    async getGradesPayload(options = {}) {
      const refreshSheet = options.refreshSheet === true;

      if (refreshSheet) {
        const generateCandidates = [
          {
            service: 'tracking',
            path: '/v1/programs/student/me/generate-sheet',
            method: 'POST',
            body: {},
          },
          {
            service: 'admin',
            path: '/v1/programs/student/me/generate-sheet',
            method: 'POST',
            body: {},
          },
        ];
        for (let i = 0; i < generateCandidates.length; i += 1) {
          const candidate = generateCandidates[i];
          try {
            await requestRecommendationGradesCandidate(candidate);
            break;
          } catch (error) {
            if (isRecommendationAuthError(error)) throw error;
            if (!isRecommendationRouteNotFoundError(error)) {
              // keep trying other candidates; read route may still succeed
            }
          }
        }
      }

      const readCandidates = [
        { service: 'tracking', path: '/v1/programs/student/me/sheet' },
        { service: 'tracking', path: '/v1/programs/student/me' },
        { service: 'admin', path: '/v1/programs/student/me/sheet' },
        { service: 'admin', path: '/v1/programs/student/me' },
        { service: 'admin', path: '/courses?page=1&limit=100' },
        { service: 'admin', path: '/courses' },
        { service: 'community', path: '/courses?page=1&limit=100' },
      ];

      const non404Errors = [];
      for (let i = 0; i < readCandidates.length; i += 1) {
        const candidate = readCandidates[i];
        try {
          const payload = await requestRecommendationGradesCandidate(candidate);
          return {
            payload,
            source: `${candidate.service}:${candidate.path}`,
          };
        } catch (error) {
          if (isRecommendationAuthError(error)) throw error;
          if (isRecommendationRouteNotFoundError(error)) continue;
          non404Errors.push(error);
        }
      }

      if (non404Errors.length > 0) {
        const networkOrCorsError = non404Errors.find(
          isRecommendationNetworkError,
        );
        if (networkOrCorsError) {
          const origin =
            typeof window !== 'undefined' &&
            window.location &&
            window.location.origin
              ? window.location.origin
              : 'this origin';
          const explicitError = new Error(
            `Could not reach tracking API from ${origin}. Usually CORS/network. Add this origin to API CORS allowlist (NIBRAS_WEB_CORS_ORIGINS).`,
          );
          explicitError.status = Number(networkOrCorsError?.status || 0);
          explicitError.code = 'TRACKING_NETWORK_OR_CORS';
          explicitError.service = networkOrCorsError?.service || 'tracking';
          explicitError.url = networkOrCorsError?.url || '';
          throw explicitError;
        }
        throw non404Errors[0];
      }

      const notFound = new Error(
        'No compatible backend grades endpoint was found.',
      );
      notFound.status = 404;
      notFound.code = 'GRADES_ROUTE_NOT_FOUND';
      throw notFound;
    },

    /**
     * Get top recommendations from student grades
     * @param {Record<string, number|string>} grades
     * @returns {Promise<{strengths: string[], recommendations: string[], explanation?: string}>}
     */
    async recommend(grades) {
      const normalizedGrades = sanitizeRecommendationGrades(grades);
      if (Object.keys(normalizedGrades).length === 0) {
        throw new Error('No valid grades found to generate recommendations.');
      }
      const configuredBaseUrl = resolveServiceUrl('recommendation');
      const normalizedBaseUrl =
        normalizeRecommendationServiceBaseUrl(configuredBaseUrl);
      const readResponse = (payload) => {
        const data = unwrapApiData(payload) || payload || {};
        return {
          strengths: Array.isArray(data.strengths) ? data.strengths : [],
          recommendations: Array.isArray(data.recommendations)
            ? data.recommendations
            : [],
          explanation:
            typeof data.explanation === 'string' ? data.explanation : '',
          source: 'api',
        };
      };

      const requestRecommend = (baseUrl) =>
        apiFetch('/recommend', {
          service: 'recommendation',
          method: 'POST',
          auth: false,
          retryAuth: false,
          body: { grades: normalizedGrades },
          baseUrl: baseUrl || null,
        });

      try {
        const payload = await requestRecommend();
        return readResponse(payload);
      } catch (error) {
        let resolvedError = error;
        if (
          isRecommendationRouteNotFoundError(error) &&
          normalizedBaseUrl &&
          normalizedBaseUrl !== configuredBaseUrl
        ) {
          try {
            const retryPayload = await requestRecommend(normalizedBaseUrl);
            return readResponse(retryPayload);
          } catch (retryError) {
            resolvedError = retryError;
          }
        }

        if (isRecommendationNetworkError(resolvedError)) {
          return buildLocalRecommendationFallback(
            normalizedGrades,
            normalizedBaseUrl || configuredBaseUrl || '',
          );
        }

        throw resolvedError;
      }
    },
  };

  // ============================================================
  // Community Courses Service (course-thread backend)
  // ============================================================
  const communityCourseService = {
    /**
     * List courses available for discussions
     * @param {object} filters - ignored; kept for API compatibility
     * @returns {Promise<{courses: Array}>}
     */
    async list(_filters = {}) {
      const payload = await apiFetch('/v1/community/discussion-courses', {
        service: 'community',
        method: 'GET',
        auth: true,
      });
      const raw = unwrapApiData(payload) || payload || {};
      const courses = Array.isArray(raw.courses) ? raw.courses : [];
      return { courses };
    },

    /**
     * Get a community course by ID
     * @param {string} id
     * @returns {Promise<{course: object}>}
     */
    async getById(id) {
      return apiFetch(`/courses/${id}`, {
        service: 'community',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Enroll current user in a course
     * @param {string} courseId
     * @returns {Promise<{course: object}>}
     */
    async enroll(courseId) {
      return apiFetch(`/courses/${courseId}/enroll`, {
        service: 'community',
        method: 'POST',
        auth: true,
        body: {},
      });
    },

    /**
     * Unenroll current user from a course
     * @param {string} courseId
     * @returns {Promise<{course: object}>}
     */
    async unenroll(courseId) {
      return apiFetch(`/courses/${courseId}/enroll`, {
        service: 'community',
        method: 'DELETE',
        auth: true,
      });
    },
  };

  // ============================================================
  // Thread Service (course-thread backend)
  // ============================================================
  const threadService = {
    /**
     * List threads by course
     * @param {string} courseId
     * @param {object} filters - { search, status, tag }
     * @returns {Promise<{threads: Array}>}
     */
    async listByCourse(courseId, filters = {}) {
      const apiFilters = Object.assign({}, filters);
      if (apiFilters.search) {
        apiFilters.q = apiFilters.search;
        delete apiFilters.search;
      }
      delete apiFilters.status;
      const payload = await apiFetch(
        `/v1/community/threads/course/${courseId}${toQueryString(apiFilters)}`,
        {
          service: 'community',
          method: 'GET',
          auth: true,
        },
      );
      return normalizeCommunityThreadList(payload);
    },

    /**
     * Get thread by ID
     * @param {string} threadId
     * @returns {Promise<{thread: object}>}
     */
    async getById(threadId) {
      const payload = await apiFetch(`/v1/community/threads/${threadId}`, {
        service: 'community',
        method: 'GET',
        auth: true,
      });
      return normalizeCommunityThread(payload);
    },

    /**
     * Create thread in a course
     * @param {string} courseId
     * @param {object} data - { title, body, tags? }
     * @returns {Promise<{thread: object}>}
     */
    async create(courseId, data) {
      const payload = await apiFetch(`/v1/community/threads/${courseId}`, {
        service: 'community',
        method: 'POST',
        auth: true,
        body: data,
      });
      return normalizeCommunityThread(payload);
    },

    /**
     * Update thread
     * @param {string} threadId
     * @param {object} data
     * @returns {Promise<{thread: object}>}
     */
    async update(threadId, data) {
      const payload = await apiFetch(`/v1/community/threads/${threadId}`, {
        service: 'community',
        method: 'PATCH',
        auth: true,
        body: data,
      });
      return normalizeCommunityThread(payload);
    },

    /**
     * Delete thread
     * @param {string} threadId
     * @returns {Promise<{message: string}>}
     */
    async delete(threadId) {
      return apiFetch(`/v1/community/threads/${threadId}`, {
        service: 'community',
        method: 'DELETE',
        auth: true,
      });
    },

    async pin(threadId) {
      const payload = await apiFetch(`/v1/community/threads/${threadId}/pin`, {
        service: 'community',
        method: 'PATCH',
        auth: true,
        body: {},
      });
      return normalizeCommunityThread(payload);
    },

    async unpin(threadId) {
      const payload = await apiFetch(
        `/v1/community/threads/${threadId}/unpin`,
        {
          service: 'community',
          method: 'PATCH',
          auth: true,
          body: {},
        },
      );
      return normalizeCommunityThread(payload);
    },

    async close(threadId) {
      const payload = await apiFetch(
        `/v1/community/threads/${threadId}/close`,
        {
          service: 'community',
          method: 'PATCH',
          auth: true,
          body: {},
        },
      );
      return normalizeCommunityThread(payload);
    },

    async open(threadId) {
      const payload = await apiFetch(`/v1/community/threads/${threadId}/open`, {
        service: 'community',
        method: 'PATCH',
        auth: true,
        body: {},
      });
      return normalizeCommunityThread(payload);
    },
  };

  // ============================================================
  // Post Service (course-thread backend)
  // ============================================================
  const postService = {
    /**
     * List posts by thread
     * @param {string} threadId
     * @returns {Promise<{posts: Array}>}
     */
    async listByThread(threadId) {
      const payload = await apiFetch(`/v1/community/posts/thread/${threadId}`, {
        service: 'community',
        method: 'GET',
        auth: true,
      });
      return normalizeCommunityPostList(payload);
    },

    /**
     * Get post by ID
     * @param {string} postId
     * @returns {Promise<{post: object}>}
     */
    async getById(postId) {
      const payload = await apiFetch(`/v1/community/posts/${postId}`, {
        service: 'community',
        method: 'GET',
        auth: true,
      });
      return normalizeCommunityPost(payload);
    },

    /**
     * Create a post in a thread
     * @param {string} threadId
     * @param {object} data - { body }
     * @returns {Promise<{post: object}>}
     */
    async create(threadId, data) {
      const payload = await apiFetch(`/v1/community/posts/${threadId}`, {
        service: 'community',
        method: 'POST',
        auth: true,
        body: data,
      });
      return normalizeCommunityPost(payload);
    },

    /**
     * Update post
     * @param {string} postId
     * @param {object} data
     * @returns {Promise<{post: object}>}
     */
    async update(postId, data) {
      const payload = await apiFetch(`/v1/community/posts/${postId}`, {
        service: 'community',
        method: 'PATCH',
        auth: true,
        body: data,
      });
      return normalizeCommunityPost(payload);
    },

    /**
     * Delete post
     * @param {string} postId
     * @returns {Promise<{message: string}>}
     */
    async delete(postId) {
      return apiFetch(`/v1/community/posts/${postId}`, {
        service: 'community',
        method: 'DELETE',
        auth: true,
      });
    },

    async pin(postId) {
      const payload = await apiFetch(`/v1/community/posts/${postId}/pin`, {
        service: 'community',
        method: 'PATCH',
        auth: true,
        body: {},
      });
      return normalizeCommunityPost(payload);
    },

    async accept(postId) {
      const payload = await apiFetch(`/v1/community/posts/${postId}/accept`, {
        service: 'community',
        method: 'PATCH',
        auth: true,
        body: {},
      });
      return normalizeCommunityPost(payload);
    },
  };

  // ============================================================
  // Notification Service (tracking backend)
  // ============================================================
  const notificationService = {
    /**
     * List current user notifications
     * @returns {Promise<{notifications: Array}>}
     */
    async list() {
      return apiFetch('/v1/notifications', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get unread notifications count
     * @returns {Promise<{count: number}>}
     */
    async count() {
      return apiFetch('/v1/notifications/count', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Mark all notifications as read
     * @returns {Promise<{ok: boolean}>}
     */
    async markAllRead() {
      return apiFetch('/v1/notifications/read-all', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: {},
      });
    },

    /**
     * Get notification preferences
     * @returns {Promise<Array>}
     */
    async getPreferences() {
      return apiFetch('/v1/notifications/preferences', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Update a notification preference
     * @param {string} type - preference type slug (e.g. 'achievement', 'grade_posted')
     * @param {boolean} enabled
     * @returns {Promise<object>}
     */
    async updatePreference(type, enabled) {
      return apiFetch(
        `/v1/notifications/preferences/${encodeURIComponent(String(type))}`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body: { enabled: !!enabled },
        },
      );
    },
  };

  // ============================================================
  // Admin Notification Service (Nibras-Backend /notifications)
  // ============================================================
  const adminNotificationService = {
    async list(page, limit) {
      var qs = '';
      if (page || limit) {
        var p = new URLSearchParams();
        if (page) p.set('page', page);
        if (limit) p.set('limit', limit);
        qs = '?' + p.toString();
      }
      return apiFetch('/notifications' + qs, {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    async count() {
      return apiFetch('/notifications/unread-count', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    async markRead(notificationId) {
      return apiFetch(
        '/notifications/' +
          encodeURIComponent(String(notificationId)) +
          '/read',
        {
          service: 'admin',
          method: 'PATCH',
          auth: true,
          body: {},
        },
      );
    },

    async markAllRead() {
      return apiFetch('/notifications/read-all', {
        service: 'admin',
        method: 'PATCH',
        auth: true,
        body: {},
      });
    },
  };

  // ============================================================
  // Program Service (tracking backend)
  // ============================================================
  const programService = {
    /**
     * List all available programs
     * @returns {Promise<Array>}
     */
    async listPrograms() {
      return apiFetch('/v1/programs', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Enroll current student in a program
     * @param {string} programId
     * @returns {Promise<object>}
     */
    async enroll(programId) {
      return apiFetch(
        `/v1/programs/${encodeURIComponent(String(programId || ''))}/enroll`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body: {},
        },
      );
    },

    /**
     * Get current student's program plan
     * @returns {Promise<object>}
     */
    async getMyPlan() {
      return apiFetch('/v1/programs/student/me', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Select specialization track
     * @param {string} trackId
     * @returns {Promise<object>}
     */
    async selectTrack(trackId) {
      return apiFetch('/v1/programs/student/me/select-track', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: { trackId: String(trackId || '') },
      });
    },

    /**
     * Update student planned courses
     * @param {Array} plannedCourses
     * @returns {Promise<object>}
     */
    async updatePlan(plannedCourses) {
      return apiFetch('/v1/programs/student/me/plan', {
        service: 'tracking',
        method: 'PATCH',
        auth: true,
        body: {
          plannedCourses: Array.isArray(plannedCourses) ? plannedCourses : [],
        },
      });
    },

    /**
     * Get student sheet view
     * @returns {Promise<object>}
     */
    async getSheet() {
      return apiFetch('/v1/programs/student/me/sheet', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Generate and snapshot sheet
     * @returns {Promise<object>}
     */
    async generateSheet() {
      return apiFetch('/v1/programs/student/me/generate-sheet', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: {},
      });
    },

    /**
     * List student petitions
     * @returns {Promise<Array>}
     */
    async listPetitions() {
      return apiFetch('/v1/programs/student/me/petitions', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Create a new student petition
     * @param {object} payload
     * @returns {Promise<object>}
     */
    async createPetition(payload) {
      return apiFetch('/v1/programs/student/me/petitions', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: payload || {},
      });
    },

    async validatePlan(plannedCourses) {
      return apiFetch('/v1/programs/student/me/validate', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: {
          plannedCourses: Array.isArray(plannedCourses) ? plannedCourses : [],
        },
      });
    },

    async getValidatePlan() {
      return apiFetch('/v1/programs/student/me/validate', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async recommendTrack() {
      return apiFetch('/v1/programs/student/me/recommend-track', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async getRecommendedPlan() {
      return apiFetch('/v1/programs/student/me/recommended-plan', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async getPrerequisiteGraph() {
      return apiFetch('/v1/programs/student/me/prerequisite-graph', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async submitForAdvisor(note) {
      return apiFetch('/v1/programs/student/me/submit-for-advisor', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: { note: note != null ? String(note) : null },
      });
    },

    async getCatalogLink(catalogCourseId) {
      return apiFetch(
        '/v1/programs/student/me/catalog-link' +
          toQueryString({ catalogCourseId: String(catalogCourseId || '') }),
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Competitions Service (competitions backend)
  // ============================================================
  const normalizeCompetitionsServiceBaseUrl = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().replace(/\/+$/, '');
    return trimmed || null;
  };

  const getCompetitionsBaseCandidates = () => {
    const gatewayBase = normalizeCompetitionsServiceBaseUrl(
      resolveServiceUrl('competitions'),
    );
    const adminBase = normalizeCompetitionsServiceBaseUrl(
      resolveServiceUrl('admin'),
    );
    const candidates = [];
    if (gatewayBase) {
      candidates.push(gatewayBase.replace(/\/api$/i, ''));
      candidates.push(gatewayBase);
    }
    if (adminBase && !candidates.includes(adminBase)) {
      candidates.push(adminBase);
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  };

  const toV1CompetitionPaths = (pathCandidates) => {
    const paths = Array.isArray(pathCandidates)
      ? pathCandidates
      : [pathCandidates];
    const expanded = [];
    paths.forEach((path) => {
      const raw = String(path || '');
      if (!raw) return;
      if (raw.startsWith('/v1/')) {
        expanded.push(raw);
        return;
      }
      if (raw.startsWith('/api/')) {
        expanded.push(raw.replace(/^\/api/, '/v1'));
        expanded.push(raw);
        return;
      }
      expanded.push(`/v1${raw.startsWith('/') ? raw : `/${raw}`}`);
      expanded.push(raw);
    });
    return Array.from(new Set(expanded));
  };

  const requestInternalContest = async (path, options = {}) => {
    const normalizedPath = String(path || '').startsWith('/api/')
      ? path
      : `/api${String(path || '').startsWith('/') ? path : `/${path}`}`;
    return apiFetch(
      normalizedPath,
      Object.assign({}, options, { service: 'admin' }),
    );
  };

  const isCompetitionsCompatibilityRetryableError = (error) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || '').toUpperCase();
    if (status === 0 || code === 'NETWORK_ERROR' || code === 'TIMEOUT')
      return true;
    return (
      status === 404 ||
      status === 405 ||
      status === 501 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  };

  const requestCompetitionsWithCompatibility = async (
    pathCandidates,
    options = {},
  ) => {
    const paths = toV1CompetitionPaths(pathCandidates);
    const baseCandidates = getCompetitionsBaseCandidates();
    let lastError = null;

    for (let b = 0; b < baseCandidates.length; b += 1) {
      const baseUrl = baseCandidates[b];
      const isAdminBase = /\/api$/i.test(String(baseUrl || ''));

      for (let p = 0; p < paths.length; p += 1) {
        const path = paths[p];
        const useAdminPath = isAdminBase && path.startsWith('/api/');
        const useV1OnGateway = !isAdminBase && path.startsWith('/v1/');
        const useLegacyOnGateway = !isAdminBase && !path.startsWith('/v1/');
        if (isAdminBase && path.startsWith('/v1/') && !useAdminPath) {
          continue;
        }
        if (!isAdminBase && path.startsWith('/api/')) {
          continue;
        }
        if (
          isAdminBase &&
          !path.startsWith('/api/') &&
          !path.startsWith('/v1/')
        ) {
          continue;
        }
        if (!useV1OnGateway && !useLegacyOnGateway && !useAdminPath) {
          continue;
        }
        try {
          return await apiFetch(
            path,
            Object.assign({}, options, {
              service: isAdminBase ? 'admin' : 'competitions',
              baseUrl: baseUrl || null,
            }),
          );
        } catch (error) {
          lastError = error;
          if (isAuthErrorStatus(Number(error?.status || 0))) throw error;
          if (!isCompetitionsCompatibilityRetryableError(error)) throw error;
        }
      }
    }

    throw lastError || new Error('No compatible competitions endpoint found.');
  };

  const normalizeContest = (raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const id = raw._id || raw.id || null;
    const startsAt = raw.startTime || raw.startsAt || null;
    const endsAt = raw.endsAt || null;
    const now = Date.now();
    let status = raw.status;
    if (!status && startsAt) {
      const startMs = new Date(startsAt).getTime();
      const endMs = endsAt
        ? new Date(endsAt).getTime()
        : startMs + Number(raw.duration ?? raw.durationMinutes ?? 120) * 60000;
      if (Number.isFinite(startMs)) {
        if (now < startMs) status = 'upcoming';
        else if (now <= endMs) status = 'running';
        else status = 'past';
      }
    }
    return Object.assign({}, raw, {
      _id: id,
      id,
      title: raw.title || raw.name || '',
      platform: raw.platform || raw.host || '',
      startTime: startsAt,
      duration: raw.duration ?? raw.durationMinutes ?? null,
      contestIdOnPlatform:
        raw.contestIdOnPlatform || raw.platformContestId || '',
      status,
    });
  };

  const extractContestList = (payload) => {
    const data = unwrapApiData(payload);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.contests)) return data.contests;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  };

  const buildContestListQuery = (filters = {}) => {
    const params = {
      page: filters.page,
      limit: filters.limit,
      bookmarked: filters.bookmarked,
    };
    const platform = filters.platform;
    if (platform && platform !== 'all') {
      params.host = platform;
    }
    const status = String(filters.status || '').toLowerCase();
    if (status === 'running' || status === 'active') {
      params.active = 'true';
    } else if (status === 'upcoming') {
      params.upcoming = 'true';
    } else if (status === 'past') {
      params.past = 'true';
    }
    return buildQueryString(params);
  };

  const competitionsService = {
    async getMe() {
      const payload = await apiFetch('/auth/me', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
      return payload?.user || unwrapApiData(payload);
    },

    async listContests(filters = {}) {
      const query = buildContestListQuery(filters);
      const payload = await requestCompetitionsWithCompatibility(
        `/contests${query}`,
        {
          method: 'GET',
          auth: false,
        },
      );
      const items = extractContestList(payload).map(normalizeContest);
      const data = unwrapApiData(payload);
      const total =
        payload?.pagination?.total ??
        data?.pagination?.total ??
        data?.total ??
        items.length;
      return {
        contests: items,
        pagination:
          data?.pagination ||
          payload?.pagination ||
          (items.length
            ? {
                total,
                page: filters.page || 1,
                limit: filters.limit || items.length,
              }
            : null),
      };
    },

    async getContestById(id) {
      const payload = await requestCompetitionsWithCompatibility(
        `/contests/${encodeURIComponent(String(id || ''))}`,
        {
          method: 'GET',
          auth: false,
        },
      );
      const raw = unwrapApiData(payload);
      return raw ? normalizeContest(raw) : raw;
    },

    async bookmarkContest(id) {
      const contestId = encodeURIComponent(String(id || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/user-contests/${contestId}/bookmark`,
        {
          method: 'POST',
          auth: true,
          body: { on: true },
        },
      );
      return {
        message: payload?.message || 'Contest bookmarked successfully',
        data: unwrapApiData(payload),
      };
    },

    async removeBookmark(id) {
      const contestId = encodeURIComponent(String(id || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/user-contests/${contestId}/bookmark`,
        {
          method: 'POST',
          auth: true,
          body: { on: false },
        },
      );
      return {
        message: payload?.message || 'Bookmark removed successfully',
        data: unwrapApiData(payload),
      };
    },

    async listBookmarks(filters = {}) {
      const query = buildQueryString({
        page: filters.page,
        limit: filters.limit,
      });
      const payload = await requestCompetitionsWithCompatibility(
        [
          `/user-contests/bookmarks${query}`,
          `/user/contests/bookmarks${query}`,
          `/contests/user-contests/bookmarks${query}`,
        ],
        {
          method: 'GET',
          auth: true,
        },
      );
      const items = extractContestList(payload).map(normalizeContest);
      const data = unwrapApiData(payload);
      return {
        contests: items,
        pagination: data?.pagination || payload?.pagination || null,
      };
    },

    async setReminder(id) {
      const contestId = encodeURIComponent(String(id || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/user-contests/${contestId}/reminder`,
        {
          method: 'POST',
          auth: true,
          body: { on: true },
        },
      );
      return {
        message: payload?.message || 'Reminder set successfully',
        data: unwrapApiData(payload),
      };
    },

    async removeReminder(id) {
      const contestId = encodeURIComponent(String(id || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/user-contests/${contestId}/reminder`,
        {
          method: 'POST',
          auth: true,
          body: { on: false },
        },
      );
      return {
        message: payload?.message || 'Reminder removed successfully',
        data: unwrapApiData(payload),
      };
    },

    async listReminders(filters = {}) {
      const query = buildQueryString({
        page: filters.page,
        limit: filters.limit,
      });
      const payload = await requestCompetitionsWithCompatibility(
        [
          `/user-contests/reminders${query}`,
          `/user/contests/reminders${query}`,
          `/contests/user-contests/reminders${query}`,
        ],
        {
          method: 'GET',
          auth: true,
        },
      );
      const items = extractContestList(payload).map(normalizeContest);
      const data = unwrapApiData(payload);
      return {
        contests: items,
        pagination: data?.pagination || payload?.pagination || null,
      };
    },

    // Legacy/internal only: registers on NestJS Mongo contests, not synced Fastify contests.
    async joinContest(id) {
      const contestId = encodeURIComponent(String(id || ''));
      const payload = await requestInternalContest(
        `/contests/${contestId}/register`,
        {
          method: 'POST',
          auth: true,
          body: {},
        },
      );
      return {
        message: payload?.message || 'Contest registration successful',
        data: unwrapApiData(payload),
      };
    },

    async listHistory(filters = {}) {
      const query = buildQueryString({
        host: filters.platform || filters.host,
        from: filters.from,
        to: filters.to,
        page: filters.page,
        limit: filters.limit,
      });
      const payload = await requestCompetitionsWithCompatibility(
        [
          `/user-contests/history${query}`,
          `/contests/user-contests/history${query}`,
        ],
        {
          method: 'GET',
          auth: true,
        },
      );
      const data = unwrapApiData(payload);
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
      const total = Number(
        data?.total ?? payload?.pagination?.total ?? items.length,
      );
      return {
        items,
        total,
        pagination: payload?.pagination || data?.pagination || { total },
      };
    },

    async listLinkedAccounts() {
      const payload = await requestCompetitionsWithCompatibility(
        '/contests/accounts',
        {
          method: 'GET',
          auth: true,
        },
      );
      const data = unwrapApiData(payload);
      return Array.isArray(data) ? data : Array.isArray(payload) ? payload : [];
    },

    async linkAccount(platform, handle) {
      const payload = await requestCompetitionsWithCompatibility(
        '/contests/accounts/link',
        {
          method: 'POST',
          auth: true,
          body: {
            platform: String(platform || '').toLowerCase(),
            handle: String(handle || '').trim(),
          },
          timeoutMs: 60000,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async linkAccounts(accounts) {
      const entries = [];
      if (accounts?.platform && accounts?.handle) {
        entries.push(
          await this.linkAccount(accounts.platform, accounts.handle),
        );
      } else {
        if (accounts?.codeforcesHandle) {
          entries.push(
            await this.linkAccount('codeforces', accounts.codeforcesHandle),
          );
        }
        if (accounts?.leetcodeUsername || accounts?.leetcodeHandle) {
          entries.push(
            await this.linkAccount(
              'leetcode',
              accounts.leetcodeUsername || accounts.leetcodeHandle,
            ),
          );
        }
        if (accounts?.atcoderHandle) {
          entries.push(
            await this.linkAccount('atcoder', accounts.atcoderHandle),
          );
        }
        if (accounts?.codechefHandle) {
          entries.push(
            await this.linkAccount('codechef', accounts.codechefHandle),
          );
        }
      }
      if (!entries.length) {
        return { message: 'No accounts to link', data: [] };
      }
      return {
        message: 'Accounts linked successfully',
        data: entries,
      };
    },

    async resyncAccount(host) {
      const platform = encodeURIComponent(String(host || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/contests/accounts/${platform}/resync`,
        {
          method: 'POST',
          auth: true,
          body: {},
          timeoutMs: 60000,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async getRanking(filters = {}) {
      const query = buildQueryString({
        host: filters.host || filters.platform,
        scope: filters.scope,
        page: filters.page,
        limit: filters.limit,
      });
      const payload = await requestCompetitionsWithCompatibility(
        `/ranking${query}`,
        {
          method: 'GET',
          auth: true,
        },
      );
      const data = unwrapApiData(payload);
      return Array.isArray(data) ? data : Array.isArray(payload) ? payload : [];
    },

    async getMyRanking() {
      const payload = await requestCompetitionsWithCompatibility(
        '/ranking/me',
        {
          method: 'GET',
          auth: true,
        },
      );
      const data = unwrapApiData(payload);
      return Array.isArray(data) ? data : Array.isArray(payload) ? payload : [];
    },

    async startVerification(platform) {
      const host = encodeURIComponent(String(platform || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/contests/accounts/${host}/verify`,
        {
          method: 'POST',
          auth: true,
          body: {},
          timeoutMs: 60000,
        },
      );
      const data = unwrapApiData(payload) || payload || {};
      return {
        message:
          data?.message ||
          (data?.verified ? 'Verified' : 'Verification checked'),
        data,
      };
    },

    async checkVerification(platform) {
      const host = encodeURIComponent(String(platform || ''));
      const payload = await requestCompetitionsWithCompatibility(
        `/contests/accounts/${host}/verify`,
        {
          method: 'POST',
          auth: true,
          body: {},
          timeoutMs: 60000,
        },
      );
      const data = unwrapApiData(payload) || payload || {};
      return {
        message: data?.message || '',
        data,
      };
    },

    async getAggregatedProfile(userId) {
      const accounts = await this.listLinkedAccounts();
      const mapped =
        typeof window !== 'undefined' &&
        window.RankingAccounts?.mapLinkedAccounts
          ? window.RankingAccounts.mapLinkedAccounts(accounts)
          : {
              linkedAccounts: Object.fromEntries(
                accounts.map((a) => [a.host, a.handle]),
              ),
              verification: Object.fromEntries(
                accounts.map((a) => [
                  a.host,
                  { status: a.verificationStatus || 'unverified' },
                ]),
              ),
            };
      return {
        userId,
        linkedAccounts: mapped.linkedAccounts,
        verification: mapped.verification,
      };
    },

    async syncProfile(options = {}) {
      const accounts = await this.listLinkedAccounts();
      const hosts = accounts.map((account) => account.host).filter(Boolean);
      const results = [];
      for (const host of hosts) {
        results.push(await this.resyncAccount(host));
      }
      return {
        syncing: true,
        results,
        problemSync: { totalSynced: results.length },
        force: options.force === true,
      };
    },

    async listProblems(filters = {}) {
      const practiceHelpers = window.PracticeProblems || null;
      const platform = String(filters.platform || 'all').toLowerCase();
      const queryFilters = practiceHelpers
        ? practiceHelpers.buildPracticeProblemsQuery(filters, platform)
        : {};
      const path = practiceHelpers
        ? practiceHelpers.buildPracticeProblemsPath(platform)
        : '/problems';
      const payload = await requestCompetitionsWithCompatibility(
        `${path}${buildQueryString(queryFilters)}`,
        {
          method: 'GET',
          auth: true,
        },
      );
      if (practiceHelpers?.parseListProblemsResponse) {
        return practiceHelpers.parseListProblemsResponse(
          payload,
          filters,
          platform,
        );
      }
      const data = unwrapApiData(payload);
      const problems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
      return {
        problems,
        total: data?.total ?? problems.length,
        page: filters.page || 1,
        limit: filters.limit || problems.length,
        pages: 1,
      };
    },

    async setProblemSolved(problemId, solved = true) {
      const payload = await requestCompetitionsWithCompatibility(
        `/problems/${encodeURIComponent(String(problemId || ''))}/solved`,
        {
          method: 'POST',
          auth: true,
          body: { solved },
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async getRoadmap() {
      const payload = await requestCompetitionsWithCompatibility(
        '/practice/cp-roadmap/roadmap',
        {
          method: 'GET',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async getCpRoadmapTopic(topicId) {
      const payload = await requestCompetitionsWithCompatibility(
        `/practice/cp-roadmap/topics/${encodeURIComponent(String(topicId || ''))}`,
        {
          method: 'GET',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async setCpRoadmapProblemSolved(problemId, solved = true) {
      const id = encodeURIComponent(String(problemId || ''));
      if (solved) {
        const payload = await requestCompetitionsWithCompatibility(
          `/practice/cp-roadmap/problems/${id}/solved`,
          {
            method: 'POST',
            auth: true,
            body: { solved: true },
          },
        );
        return unwrapApiData(payload) || payload || {};
      }
      const payload = await requestCompetitionsWithCompatibility(
        `/practice/cp-roadmap/problems/${id}/solved`,
        {
          method: 'DELETE',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async getProgress() {
      try {
        const payload = await requestCompetitionsWithCompatibility(
          '/practice/cp-roadmap/stats',
          {
            method: 'GET',
            auth: true,
          },
        );
        return unwrapApiData(payload) || payload || {};
      } catch (e) {
        return {};
      }
    },

    async listNibras75Problems(filters = {}) {
      const query = buildQueryString({
        q: filters.q,
        sort: filters.sort,
        solved: filters.solved ?? filters.status,
        difficulty: filters.difficulty,
        page: filters.page,
        limit: filters.limit,
      });
      const payload = await requestCompetitionsWithCompatibility(
        `/practice/nibras-75/problems${query}`,
        {
          method: 'GET',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async setNibras75ProblemSolved(slug, solved = true) {
      const problemSlug = encodeURIComponent(String(slug || ''));
      if (solved) {
        const payload = await requestCompetitionsWithCompatibility(
          `/practice/nibras-75/problems/${problemSlug}/solved`,
          {
            method: 'POST',
            auth: true,
            body: { solved: true },
          },
        );
        return unwrapApiData(payload) || payload || {};
      }
      const payload = await requestCompetitionsWithCompatibility(
        `/practice/nibras-75/problems/${problemSlug}/solved`,
        {
          method: 'DELETE',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async getNibras75Stats() {
      const payload = await requestCompetitionsWithCompatibility(
        '/practice/nibras-75/stats',
        {
          method: 'GET',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async getDailyProblemToday() {
      const payload = await requestCompetitionsWithCompatibility(
        '/daily-problem/today',
        {
          method: 'GET',
          auth: true,
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async verifyDailyProblem() {
      const payload = await requestCompetitionsWithCompatibility(
        '/daily-problem/today/verify',
        {
          method: 'POST',
          auth: true,
          body: {},
        },
      );
      return unwrapApiData(payload) || payload || {};
    },

    async solveDailyProblem() {
      const payload = await requestCompetitionsWithCompatibility(
        '/daily-problem/today/solve',
        {
          method: 'POST',
          auth: true,
          body: {},
        },
      );
      return unwrapApiData(payload) || payload || {};
    },
  };

  // ============================================================
  // Team Service (competitions backend)
  // ============================================================
  const emptyTeamsResponse = () => ({
    teams: [],
    pagination: null,
    message:
      'Standalone teams are not available yet. Create teams from an internal contest page.',
  });

  const teamService = {
    async listTeams() {
      return emptyTeamsResponse();
    },

    async getTeamById() {
      return null;
    },

    async createTeam(data = {}) {
      const contestId = data.contestId || data.contest_id;
      if (!contestId) {
        throw new Error(
          'Contest teams require a contest. Open an internal contest and create a team there.',
        );
      }
      const payload = await requestInternalContest(
        `/contests/${encodeURIComponent(String(contestId))}/teams`,
        {
          method: 'POST',
          auth: true,
          body: data,
        },
      );
      return {
        message: payload?.message || 'Team created successfully',
        data: unwrapApiData(payload),
      };
    },

    async updateTeam() {
      throw new Error('Standalone team updates are not supported.');
    },

    async deleteTeam() {
      throw new Error('Standalone team deletion is not supported.');
    },

    async joinTeam() {
      throw new Error('Join teams from the contest detail page.');
    },

    async leaveTeam() {
      throw new Error('Leave teams from the contest detail page.');
    },

    async listMyTeams() {
      return emptyTeamsResponse();
    },

    async inviteToTeam() {
      throw new Error(
        'Team invitations are not supported for standalone teams.',
      );
    },

    async respondToInvite() {
      return { invitations: [], pagination: null };
    },

    async listTeamMembers() {
      return { members: [], pagination: null };
    },

    async listMyInvitations() {
      return { invitations: [], pagination: null };
    },
  };

  // ============================================================
  // Tracking Session Service (new backend - port 4848)
  // ============================================================
  const sessionService = {
    /**
     * Get current authenticated user from new tracking API
     * @returns {Promise<{id, login, systemRole, githubAccount, enrolledCourses, accessibleCourseCount}>}
     */
    async getCurrentUser() {
      return apiFetch('/v1/web/session', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Health check for tracking API
     * @returns {Promise<object>}
     */
    async healthCheck() {
      return apiFetch('/v1/health', {
        service: 'tracking',
        method: 'GET',
        auth: false,
      });
    },
  };

  // ============================================================
  // Tracking Courses Service (new backend)
  // ============================================================
  const trackingCourseService = {
    /**
     * List courses the current user is enrolled in
     * @returns {Promise<Array>}
     */
    async list() {
      return apiFetch('/v1/tracking/courses', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get course details (alias for getDetail — legacy callers)
     * @param {string} courseId
     * @returns {Promise<object>}
     */
    async getById(courseId) {
      return this.getDetail(courseId);
    },

    /**
     * Get course detail with video progress summary
     * Backend: GET /v1/tracking/courses/:courseId/detail
     */
    async getDetail(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/detail`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get grade export CSV
     */
    async getGradesCsv(courseId) {
      const response = await fetch(
        `${resolveServiceUrl('tracking')}/v1/tracking/courses/${encodeURIComponent(String(courseId))}/export.csv`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const error = new Error(
          `Failed to download grades: ${response.status}`,
        );
        error.status = response.status;
        throw error;
      }
      return response.text();
    },

    /**
     * List course sections with nested lecture videos and watch progress
     */
    async listSections(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/sections`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async createSection(courseId, body) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/sections`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async addVideo(courseId, sectionId, body) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/sections/${encodeURIComponent(String(sectionId))}/videos`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async saveVideoProgress(videoId, body) {
      return apiFetch(
        `/v1/tracking/videos/${encodeURIComponent(String(videoId))}/progress`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    /**
     * List course assignments with submission status
     * Backend: GET /v1/tracking/courses/:courseId/assignments
     */
    async listAssignments(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/assignments`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get assignment detail
     * Backend: GET /v1/tracking/assignments/:assignmentId
     */
    async getAssignment(assignmentId) {
      return apiFetch(
        `/v1/tracking/assignments/${encodeURIComponent(String(assignmentId))}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Submit assignment (text or MCQ)
     * Backend: POST /v1/tracking/assignments/:assignmentId/submit
     */
    async submitAssignment(assignmentId, body) {
      return apiFetch(
        `/v1/tracking/assignments/${encodeURIComponent(String(assignmentId))}/submit`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    /**
     * Student grade rollup for a course
     * Backend: GET /v1/tracking/courses/:courseId/grades/me
     */
    async getMyGrades(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/grades/me`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Instructor gradebook for a course
     * Backend: GET /v1/tracking/courses/:courseId/grades
     */
    async getInstructorGrades(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/grades`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Instructor video completion analytics
     * Backend: GET /v1/tracking/courses/:courseId/videos/analytics
     */
    async getVideoAnalytics(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/videos/analytics`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async listAnnouncements(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/announcements`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async createAnnouncement(courseId, body) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/announcements`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async updateAnnouncement(courseId, announcementId, body) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/announcements/${encodeURIComponent(String(announcementId))}`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    async deleteAnnouncement(courseId, announcementId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/announcements/${encodeURIComponent(String(announcementId))}`,
        {
          service: 'tracking',
          method: 'DELETE',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Tracking Projects Service (new backend)
  // ============================================================
  const trackingProjectService = {
    /**
     * List projects for a course
     * @param {string} courseId
     * @returns {Promise<Array>}
     */
    async listByCourse(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/projects`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async createProject(body) {
      return apiFetch('/v1/tracking/projects', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body,
      });
    },

    /**
     * Get project details
     * @param {string} projectId
     * @returns {Promise<object>}
     */
    async getById(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async updateProject(projectId, body) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    async publishProject(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/publish`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
        },
      );
    },

    async unpublishProject(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/unpublish`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
        },
      );
    },

    /**
     * Get milestones for a project
     * @param {string} projectId
     * @returns {Promise<Array>}
     */
    async getMilestones(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/milestones`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async createMilestone(projectId, body) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/milestones`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async listCourseTemplates(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/templates`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async createCourseTemplate(courseId, body) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/templates`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async getCatalog(filters = {}) {
      return apiFetch(`/v1/tracking/catalog${toQueryString(filters)}`, {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async expressInterest(projectId, body = {}) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/interests`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async getMyInterest(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/interests/me`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async listInterests(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/interests`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async reviewInterest(projectId, interestId, body) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/interests/${encodeURIComponent(String(interestId))}`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    async submitApplication(projectId, data) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/applications`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async getMyApplication(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/applications/me`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async listApplications(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/applications`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async generateTeamFormation(projectId, body = {}) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/team-formation/generate`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async lockTeams(projectId, body = {}) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/team-formation/lock`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async listTeams(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/teams`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async updateTeam(projectId, teamId, body) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/teams/${encodeURIComponent(String(teamId))}`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    async listMilestoneSubmissions(milestoneId) {
      return apiFetch(
        `/v1/tracking/milestones/${encodeURIComponent(String(milestoneId))}/submissions`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async createSubmission(milestoneId, body) {
      return apiFetch(
        `/v1/tracking/milestones/${encodeURIComponent(String(milestoneId))}/submissions`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async getSubmission(submissionId) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async patchSubmission(submissionId, body) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    async cancelSubmission(submissionId) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}`,
        {
          service: 'tracking',
          method: 'DELETE',
          auth: true,
        },
      );
    },

    async getReview(submissionId) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}/review`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async submitReview(submissionId, body) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}/review`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },

    async patchReview(submissionId, body) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}/review`,
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    async retrySubmission(submissionId) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}/retry`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
        },
      );
    },

    async getReviewQueue(filters = {}) {
      return apiFetch(`/v1/tracking/review-queue${toQueryString(filters)}`, {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async getActivity() {
      return apiFetch('/v1/tracking/activity', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async getSubmissionCommits(submissionId) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(submissionId))}/commits`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getCommits(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/commits`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getContributions(projectId) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/contributions`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async grade(projectId, body = {}) {
      return apiFetch(
        `/v1/tracking/projects/${encodeURIComponent(String(projectId))}/grade`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body,
        },
      );
    },
  };

  // ============================================================
  // Tracking Milestones Service (new backend)
  // ============================================================
  const trackingMilestoneService = {
    /**
     * Get milestone details
     * @param {string} milestoneId
     * @returns {Promise<object>}
     */
    async getById(milestoneId) {
      return apiFetch(
        `/v1/tracking/milestones/${encodeURIComponent(String(milestoneId))}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // GitHub Repository Service (new backend)
  // ============================================================
  const githubService = {
    /**
     * Validate a GitHub repository for submission
     * @param {string} repoUrl
     * @returns {Promise<{owner, name, defaultBranch, visibility, permission}>}
     */
    async validateRepo(repoUrl) {
      return apiFetch('/v1/github/repositories/validate', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: { repoUrl },
      });
    },

    /**
     * Get GitHub App install URL
     * @returns {Promise<{installUrl}>}
     */
    async getInstallUrl() {
      return apiFetch('/v1/github/install-url', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get GitHub App configuration
     * @returns {Promise<{configured, appName, webBaseUrl}>}
     */
    async getConfig() {
      return apiFetch('/v1/github/config', {
        service: 'tracking',
        method: 'GET',
        auth: false,
      });
    },
  };

  // ============================================================
  // Submission Service (new backend)
  // ============================================================
  const submissionService = {
    /**
     * Create a new submission
     * @param {string} projectId
     * @param {string} repoUrl
     * @param {string} notes
     * @returns {Promise<{id, projectId, status, createdAt}>}
     */
    async create(projectId, repoUrl, notes) {
      return apiFetch('/v1/submissions', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: { projectId, repoUrl, notes },
      });
    },

    /**
     * Get submission status
     * @param {string} id
     * @returns {Promise<object>}
     */
    async getById(id) {
      return apiFetch(`/v1/submissions/${encodeURIComponent(String(id))}`, {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * List submissions for a course (instructor)
     * @param {string} courseId
     * @returns {Promise<Array>}
     */
    async listByCourse(courseId) {
      return apiFetch(
        `/v1/tracking/courses/${encodeURIComponent(String(courseId))}/submissions`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Submit instructor review
     * @param {string} id
     * @param {number} score
     * @param {string} feedback
     * @returns {Promise<object>}
     */
    async submitReview(id, score, feedback) {
      return apiFetch(
        `/v1/tracking/submissions/${encodeURIComponent(String(id))}/review`,
        {
          service: 'tracking',
          method: 'POST',
          auth: true,
          body: { score, feedback },
        },
      );
    },
  };

  // ============================================================
  // Courses Service (Nibras-Backend GitHub: Railway)
  // Base: https://nibras-backend.up.railway.app/api/courses
  // ============================================================
  const coursesApiFetch = async (path, options = {}) => {
    try {
      return await apiFetch(
        path,
        Object.assign({}, options, { service: 'courses' }),
      );
    } catch (error) {
      const status = Number(error?.status || error?.payload?.status || 0);
      if (status === 401 || status === 403) {
        return { success: false, data: null, error: 'unauthorized' };
      }
      throw error;
    }
  };

  const coursesService = {
    /**
     * List all courses with pagination and search
     * Backend: GET /courses
     * @param {object} filters - { page, limit, search, sortBy, sortOrder, instructorId }
     * @returns {Promise<{success: boolean, data: {items: Array}, meta: object}>}
     */
    async list(filters = {}) {
      return coursesApiFetch(`/courses${toQueryString(filters)}`, {
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get a course by ID with sections and instructor
     * Backend: GET /courses/:courseId
     * @param {string} courseId
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getById(courseId) {
      return apiFetch(`/courses/${encodeURIComponent(String(courseId))}`, {
        service: 'courses',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get a course by course code.
     * Backend (if mounted): GET /courses/code/:code
     * @param {string} code
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getByCode(code) {
      return apiFetch(
        `/courses/code/${encodeURIComponent(String(code).toLowerCase())}`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get courses by level.
     * Backend (if mounted): GET /courses/level/:level
     * @param {string} level
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getByLevel(level) {
      return coursesApiFetch(
        `/courses/level/${encodeURIComponent(String(level))}`,
        {
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get student dashboard summary - workaround using list + global progress.
     * Since /courses/my-dashboard doesn't exist in backend, we fetch courses
     * and global progress separately and combine them.
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getDashboard() {
      try {
        const [coursesResponse, globalProgressResponse] = await Promise.all([
          this.list({ page: 1, limit: 100 }),
          this.getGlobalProgress(),
        ]);

        if (coursesResponse?.success === false) {
          return {
            success: false,
            data: null,
            error: coursesResponse.error || 'unauthorized',
          };
        }

        const courses = Array.isArray(coursesResponse?.data)
          ? coursesResponse.data
          : Array.isArray(coursesResponse?.data?.courses)
            ? coursesResponse.data.courses
            : Array.isArray(coursesResponse?.courses)
              ? coursesResponse.courses
              : [];

        let overallProgress = 0;
        const progressData =
          globalProgressResponse?.data || globalProgressResponse || {};
        const value = Number(progressData.overallPercentage);
        if (Number.isFinite(value)) {
          overallProgress = Math.max(0, Math.min(100, Math.round(value)));
        }

        const dashboardData = {
          stats: {
            coursesEnrolled: courses.length,
            overallProgress,
          },
          courses: courses.map((course) => ({
            _id: course?._id || course?.id || '',
            title: course?.title || course?.name || 'Untitled Course',
            instructorName:
              course?.instructor?.name ||
              course?.instructorName ||
              'Instructor',
            level: course?.level || 'Beginner',
            category: course?.category || 'Core',
            progressPercentage: Number.isFinite(
              Number(course?.progressPercentage),
            )
              ? Math.max(0, Math.min(100, Number(course.progressPercentage)))
              : 0,
            status: course?.status || 'not_started',
            assignmentsCount: Array.isArray(course?.assignments)
              ? course.assignments.length
              : Number.isFinite(Number(course?.assignmentsCount))
                ? Number(course.assignmentsCount)
                : 0,
            hasStarted:
              course?.status === 'in_progress' ||
              course?.status === 'completed',
          })),
        };

        return {
          success: true,
          data: dashboardData,
        };
      } catch (error) {
        console.warn(
          '[coursesService.getDashboard] Workaround failed:',
          error?.message || error,
        );
        return {
          success: false,
          data: null,
          error: error?.message || 'Failed to load dashboard',
        };
      }
    },

    /**
     * Get current student progress for a course
     * Backend: GET /courses/:courseId/progress
     * @param {string} courseId
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getProgress(courseId) {
      return coursesApiFetch(
        `/courses/${encodeURIComponent(String(courseId))}/progress`,
        {
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Toggle section completion status
     * Backend: POST /courses/:courseId/sections/:sectionId/toggle
     * @param {string} courseId
     * @param {string} sectionId
     * @param {boolean} isCompleted
     * @param {boolean} watchedAll
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async toggleSection(courseId, sectionId, isCompleted, watchedAll = false) {
      return apiFetch(
        `/courses/${encodeURIComponent(String(courseId))}/sections/${encodeURIComponent(String(sectionId))}/toggle`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: { isCompleted, watchedAll },
        },
      );
    },

    /**
     * Get global progress across all enrolled courses
     * Backend: GET /courses/progress/global
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getGlobalProgress() {
      return coursesApiFetch('/courses/progress/global', {
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Submit an assignment
     * Backend: POST /submissions
     * @param {object} data - { courseId, assignmentId, githubLink }
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async createSubmission(data) {
      return apiFetch('/courses/submissions', {
        service: 'courses',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    /**
     * Update submission status (admin/instructor only)
     * Backend: PATCH /submissions/:submissionId/status
     * @param {string} submissionId
     * @param {object} data - { status, grade }
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async updateSubmissionStatus(submissionId, data) {
      const body = typeof data === 'string' ? { status: data } : data;
      return apiFetch(
        `/courses/submissions/${encodeURIComponent(String(submissionId))}/status`,
        {
          service: 'courses',
          method: 'PATCH',
          auth: true,
          body,
        },
      );
    },

    /**
     * Get approved grades map used by AI recommendations.
     * Backend (if mounted): GET /ai/grades
     * @returns {Promise<{success: boolean, enoughData: boolean, data: {grades: object}}>}
     */
    async getGrades() {
      return apiFetch('/ai/grades', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    async updateLevel(level) {
      return apiFetch('/courses/update-level', {
        service: 'admin',
        method: 'PATCH',
        auth: true,
        body: { level: String(level) },
      });
    },
  };

  // ============================================================
  // Backend Courses Service (Nibras-Backend GitHub repo: Railway)
  // ============================================================
  const backendCoursesService = {
    /**
     * List all courses from Nibras-Backend
     * @param {object} filters - { page, limit, search }
     * @returns {Promise<{data: Array}>}
     */
    async list(filters = {}) {
      return coursesApiFetch(`/courses${toQueryString(filters)}`, {
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get a course by ID from Nibras-Backend
     * @param {string} courseId
     * @returns {Promise<{data: object}>}
     */
    async getById(courseId) {
      return apiFetch(`/courses/${encodeURIComponent(String(courseId))}`, {
        service: 'courses',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Get assignments for a course from Nibras-Backend
     * @param {string} courseId
     * @returns {Promise<{data: Array}>}
     */
    async getAssignments(courseId) {
      return apiFetch(
        `/assignments/course/${encodeURIComponent(String(courseId))}`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get a specific assignment by ID from Nibras-Backend
     * @param {string} assignmentId
     * @returns {Promise<{data: object}>}
     */
    async getAssignmentById(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Backend Analytics Service (Nibras-Backend GitHub repo: Railway)
  // ============================================================
  const backendAnalyticsService = {
    /**
     * Get student dashboard data from Nibras-Backend
     * @param {string} studentId - The student ID
     * @returns {Promise<{data: object}>}
     */
    async getDashboard(studentId) {
      return apiFetch(
        `/analytics/dashboard/${encodeURIComponent(String(studentId))}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get comprehensive student performance dashboard
     * Backend: GET /analytics/student-performance/:studentId
     * @param {string} studentId
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getStudentPerformance(studentId) {
      return apiFetch(
        `/analytics/student-performance/${encodeURIComponent(String(studentId))}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Get course performance dashboard (instructor/admin)
     * Backend: GET /analytics/courses/:courseId/performance?topN=N
     * @param {string} courseId
     * @param {number} topN - Number of leaderboard entries (1-50, default 10)
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getCoursePerformance(courseId, topN) {
      var params = {};
      if (topN != null) params.topN = topN;
      return apiFetch(
        `/analytics/courses/${encodeURIComponent(String(courseId))}/performance${toQueryString(params)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },

    // ---- Phase 9: Analytics & Insights ----

    /**
     * Get individual student metrics (grades, progress, activity, contest performance)
     * Backend: GET /api/analytics/students/:id
     * @param {string} studentId
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async getStudentMetrics(studentId) {
      return apiFetch(
        `/v1/analytics/students/${encodeURIComponent(String(studentId))}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getStudentProgress(studentId) {
      return apiFetch(
        `/v1/analytics/students/${encodeURIComponent(String(studentId))}/progress`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getAtRiskStudents() {
      return apiFetch('/v1/analytics/students/at-risk', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async getCourseMetrics(courseId) {
      return apiFetch(
        `/v1/analytics/courses/${encodeURIComponent(String(courseId))}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getCourseSections(courseId) {
      return apiFetch(
        `/v1/analytics/courses/${encodeURIComponent(String(courseId))}/sections`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getCourseAssignments(courseId) {
      return apiFetch(
        `/v1/analytics/courses/${encodeURIComponent(String(courseId))}/assignments`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getPlatformMetrics() {
      return apiFetch('/v1/analytics/platform', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async getPlatformEngagement() {
      return apiFetch('/v1/analytics/platform/engagement', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async exportStudentsReport(format) {
      return apiFetch(
        `/v1/analytics/export/students?format=${encodeURIComponent(format || 'csv')}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    /**
     * Export course reports in specified format for accreditation
     * Backend: GET /api/analytics/export/courses?format=pdf|csv
     * @param {string} format - 'pdf' or 'csv'
     * @returns {Promise<{success: boolean, data: blob}>}
     */
    async exportCoursesReport(format) {
      return apiFetch(
        `/analytics/export/courses?format=${encodeURIComponent(format)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Users Service (admin service → /auth/*, /users/*)
  // ============================================================
  const usersService = {
    /**
     * Get current user profile (alias for authService.getMe)
     * @returns {Promise<{user: object}>}
     */
    async getMe() {
      return apiFetch('/auth/me', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Update current user profile/preferences
     * Backend: PATCH /users/me or PATCH /auth/me
     * @param {object} updates - Fields to update (e.g., { preferences: { language, timezone, level } })
     * @returns {Promise<{success: boolean, data: object}>}
     */
    async updateMe(updates) {
      return apiFetch('/users/me', {
        service: 'admin',
        method: 'PATCH',
        auth: true,
        body: updates,
      });
    },

    /**
     * Get privacy settings (leaderboard visibility)
     * @returns {Promise<{showOnLeaderboard: boolean}>}
     */
    async getPrivacy() {
      return apiFetch('/v1/me/privacy', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Update privacy settings (leaderboard opt-out, etc.)
     * @param {object} privacy - { showOnLeaderboard?: boolean }
     * @returns {Promise<object>}
     */
    async updatePrivacy(privacy) {
      return apiFetch('/v1/me/privacy', {
        service: 'tracking',
        method: 'PATCH',
        auth: true,
        body: privacy,
      });
    },

    /**
     * Update study level (maps to academic year 1–4 on the server)
     * @param {string} studyLevel - Beginner | Intermediate | Advanced | Expert
     * @returns {Promise<{studyLevel: string, yearLevel: number}>}
     */
    async updateStudyLevel(studyLevel) {
      return apiFetch('/v1/me/study-level', {
        service: 'tracking',
        method: 'PATCH',
        auth: true,
        body: { studyLevel: String(studyLevel) },
      });
    },

    async getPortfolio(userId) {
      return apiFetch(
        `/v1/users/${encodeURIComponent(String(userId))}/portfolio`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getProfile(userId) {
      return apiFetch(`/v1/users/${encodeURIComponent(String(userId))}`, {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Gamification Service (admin service → /api/gamification/*)
  // ============================================================
  const gamificationService = {
    async getAchievementsDashboard(opts = {}) {
      const params = {};
      if (opts.sync) params.sync = 'true';
      const res = await apiFetch(
        `/gamification/achievements-dashboard${toQueryString(params)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
      const raw = unwrapApiData(res) || res || {};
      return {
        badges: normalizeBadgesResponse(
          raw.badges != null ? { badges: raw.badges } : raw,
        ),
        reputation: normalizeReputationResponse(raw.reputation || {}),
        newlyAwarded: normalizeBadgesResponse(
          raw.newlyAwarded != null ? { awarded: raw.newlyAwarded } : [],
        ),
      };
    },
    async getAllBadges() {
      const res = await apiFetch('/gamification/all-badges', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
      const raw = unwrapApiData(res) || res || {};
      return normalizeBadgesResponse(
        raw.badges != null ? { badges: raw.badges } : res,
      );
    },
    async checkAwardBadges(studentId) {
      const res = await apiFetch('/gamification/check-award', {
        service: 'admin',
        method: 'POST',
        auth: true,
        body: studentId ? { studentId } : {},
      });
      const raw = unwrapApiData(res) || res || {};
      return normalizeBadgesResponse(
        raw.awarded != null ? { awarded: raw.awarded } : res,
      );
    },
    async getLeaderboard(filters = {}) {
      const params = buildLeaderboardParams(filters);
      const res = await apiFetch(
        `/gamification/leaderboards${toQueryString(params)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
      return normalizeLeaderboardResponse(res);
    },
    async getMyLeaderboardRank(filters = {}) {
      const params = buildLeaderboardParams(filters);
      const res = await apiFetch(
        `/gamification/leaderboards/me${toQueryString(params)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
      return unwrapApiData(res) || res || {};
    },
    async getLeaderboardConfig() {
      return apiFetch('/gamification/leaderboards/config', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    async getMyStats() {
      return apiFetch('/gamification/my-stats', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    async getBadges() {
      return gamificationService.getAllBadges();
    },

    async createBadge(data) {
      return apiFetch('/admin/badges', {
        service: 'admin',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    async updateBadge(badgeId, data) {
      return apiFetch('/admin/badges/' + encodeURIComponent(String(badgeId)), {
        service: 'admin',
        method: 'PATCH',
        auth: true,
        body: data,
      });
    },

    async deleteBadge(badgeId) {
      return apiFetch('/admin/badges/' + encodeURIComponent(String(badgeId)), {
        service: 'admin',
        method: 'DELETE',
        auth: true,
      });
    },

    async awardBadge(badgeId, payload) {
      return apiFetch(
        '/admin/badges/' + encodeURIComponent(String(badgeId)) + '/award',
        {
          service: 'admin',
          method: 'POST',
          auth: true,
          body: payload,
        },
      );
    },

    async getAcademicLeaderboard(filters = {}) {
      return gamificationService.getLeaderboard(
        Object.assign({}, filters, { type: 'academic' }),
      );
    },
    async getCompetitiveLeaderboard(filters = {}) {
      return gamificationService.getLeaderboard(
        Object.assign({}, filters, { type: 'competitive' }),
      );
    },
    async getCommunityLeaderboard(filters = {}) {
      return gamificationService.getLeaderboard(
        Object.assign({}, filters, { type: 'community' }),
      );
    },
  };

  // ============================================================
  // Reputation Service (admin service → /api/reputation/*)
  // ============================================================
  const reputationService = {
    async getMyReputation(opts = {}) {
      const params = {};
      if (opts.sync) params.sync = 'true';
      const res = await apiFetch(`/reputation/me${toQueryString(params)}`, {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
      return normalizeReputationResponse(res);
    },

    async getActivityFeed(limit) {
      const rep = await reputationService.getMyReputation();
      const history = Array.isArray(rep.history) ? rep.history : [];
      const max = limit ? Math.max(1, Number(limit) || 20) : history.length;
      return history.slice(0, max);
    },
  };

  // ============================================================
  // AI Service (Nibras-Backend AI module → /api/ai/*)
  // ============================================================
  const aiService = {
    /**
     * Get AI recommendation from Nibras-Backend AI module.
     * Backend fetches approved submissions → builds grades map →
     * forwards to ML model → returns grades + recommendations.
     * GET /ai/grades
     * @returns {Promise<{success: boolean, grades: object, data: {strengths: string[], recommendations: string[], explanation?: string}}>}
     */
    async getRecommendation() {
      return apiFetch('/ai/grades', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Check for duplicate/similar questions before posting.
     * POST /api/ai/check-duplicates
     * @param {string} title - Question title to check
     * @returns {Promise<{duplicates: Array<{_id: string, title: string, score: number}>}>}
     */
    async checkDuplicates(title) {
      return apiFetch('/v1/ai/check-duplicates', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: { title },
      });
    },

    async getSimilarQuestions(questionId, threshold) {
      const params =
        threshold != null
          ? `?threshold=${encodeURIComponent(String(threshold))}`
          : '';
      return apiFetch(
        `/v1/ai/questions/${encodeURIComponent(String(questionId))}/similar${params}`,
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },

    async routeQuestion(payload) {
      return apiFetch('/v1/ai/route-question', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: payload,
      });
    },

    async suggestAnswer(questionId) {
      return apiFetch('/v1/ai/suggest-answer', {
        service: 'tracking',
        method: 'POST',
        auth: true,
        body: { questionId },
      });
    },

    async getRecommendations() {
      return apiFetch('/v1/ai/recommendations', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    /**
     * Approve an AI-generated answer for publishing.
     * POST /api/ai/answers/:id/approve
     * @param {string} answerId
     * @returns {Promise<{success: boolean}>}
     */
    async approveAnswer(answerId) {
      return apiFetch(
        '/api/ai/answers/' + encodeURIComponent(String(answerId)) + '/approve',
        { service: 'admin', method: 'POST', auth: true },
      );
    },

    /**
     * Reject an AI-generated answer and optionally provide a reason.
     * POST /api/ai/answers/:id/reject
     * @param {string} answerId
     * @param {string} [reason]
     * @returns {Promise<{success: boolean}>}
     */
    async rejectAnswer(answerId, reason) {
      return apiFetch(
        '/api/ai/answers/' + encodeURIComponent(String(answerId)) + '/reject',
        {
          service: 'admin',
          method: 'POST',
          auth: true,
          body: { reason: reason || '' },
        },
      );
    },

    /**
     * Send feedback on an AI-generated answer.
     * POST /api/ai/feedback
     * @param {string} answerId
     * @param {boolean} helpful
     * @returns {Promise<{success: boolean}>}
     */
    async sendFeedback(answerId, helpful) {
      return apiFetch('/api/ai/feedback', {
        service: 'admin',
        method: 'POST',
        auth: true,
        body: { answerId, helpful },
      });
    },
  };

  // ============================================================
  // Mentorship Service (admin service → /api/mentorship/*)
  // ============================================================
  const mentorshipService = {
    async getSuggestions(limit) {
      var params = {};
      if (limit != null) params.limit = limit;
      return apiFetch('/mentorship/suggestions/me' + toQueryString(params), {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },
    async updateProfile(data) {
      return apiFetch('/mentorship/profile/me', {
        service: 'admin',
        method: 'PUT',
        auth: true,
        body: data,
      });
    },
    async requestMentor(mentorId, message) {
      return apiFetch('/mentorship/request', {
        service: 'admin',
        method: 'POST',
        auth: true,
        body: { mentorId, message },
      });
    },
    async listProfiles(status) {
      var params = {};
      if (status) params.status = status;
      return apiFetch('/mentorship/admin/profiles' + toQueryString(params), {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },
    async approveProfile(userId) {
      return apiFetch(
        '/mentorship/admin/profiles/' +
          encodeURIComponent(String(userId)) +
          '/approve',
        { service: 'admin', method: 'PATCH', auth: true },
      );
    },
    async rejectProfile(userId) {
      return apiFetch(
        '/mentorship/admin/profiles/' +
          encodeURIComponent(String(userId)) +
          '/reject',
        { service: 'admin', method: 'PATCH', auth: true },
      );
    },
    async updateAvailability(userId, availability) {
      return apiFetch(
        '/mentorship/admin/profiles/' +
          encodeURIComponent(String(userId)) +
          '/availability',
        {
          service: 'admin',
          method: 'PATCH',
          auth: true,
          body: { availability },
        },
      );
    },
    async getMyRequests() {
      return apiFetch('/mentorship/requests/me', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Levels Service (tracking backend)
  // ============================================================
  const levelsService = {
    async getProgress() {
      return apiFetch('/v1/levels/progress', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Instructor Application Service (admin backend)
  // ============================================================
  const instructorApplicationService = {
    async submit(department) {
      return apiFetch('/instructor-applications', {
        service: 'admin',
        method: 'POST',
        auth: true,
        body: { department: String(department || '') },
      });
    },
    async getMine() {
      return apiFetch('/instructor-applications/me', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },
    async listAdmin(status) {
      var params = {};
      if (status) params.status = status;
      return apiFetch(
        '/v1/admin/instructor-applications' + toQueryString(params),
        {
          service: 'tracking',
          method: 'GET',
          auth: true,
        },
      );
    },
    async approve(id) {
      return apiFetch(
        '/v1/admin/instructor-applications/' +
          encodeURIComponent(String(id)) +
          '/approve',
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
        },
      );
    },
    async reject(id) {
      return apiFetch(
        '/v1/admin/instructor-applications/' +
          encodeURIComponent(String(id)) +
          '/reject',
        {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Instructor Dashboard Service (Nibras-Backend admin service)
  // Backend: GET /instructor-dashboard, etc.
  // ============================================================
  const instructorDashboardService = {
    async getDashboard() {
      return apiFetch('/instructor-dashboard', {
        service: 'admin',
        method: 'GET',
        auth: true,
      });
    },

    async getCoursePerformance(filters = {}) {
      return apiFetch(
        `/instructor-dashboard/course-performance${toQueryString(filters)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getPendingAssignments(filters = {}) {
      return apiFetch(
        `/instructor-dashboard/pending-assignments${toQueryString(filters)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getRecentSubmissions(filters = {}) {
      return apiFetch(
        `/instructor-dashboard/recent-submissions${toQueryString(filters)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Instructor Course Management Service (Nibras-Backend admin)
  // Backend: GET /instructor-course-management/courses
  // ============================================================
  const instructorCourseManagementService = {
    async listCourses(filters = {}) {
      return apiFetch(
        `/instructor-course-management/courses${toQueryString(filters)}`,
        {
          service: 'admin',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Phase 6 — Assignment Admin Service
  // ============================================================
  const assignmentAdminService = {
    async create(data) {
      return apiFetch('/assignments', {
        service: 'courses',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    async update(id, data) {
      return apiFetch(`/assignments/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'PUT',
        auth: true,
        body: data,
      });
    },

    async delete(id) {
      return apiFetch(`/assignments/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'DELETE',
        auth: true,
      });
    },

    async listByCourse(courseId) {
      return apiFetch(
        `/assignments/course/${encodeURIComponent(String(courseId))}`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getById(id) {
      return apiFetch(`/assignments/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'GET',
        auth: true,
      });
    },
  };

  // ============================================================
  // Phase 6 — Test Case Service
  // ============================================================
  const testCaseService = {
    async create(assignmentId, data) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/test-cases`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async update(id, data) {
      return apiFetch(`/test-cases/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'PATCH',
        auth: true,
        body: data,
      });
    },

    async delete(id) {
      return apiFetch(`/test-cases/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'DELETE',
        auth: true,
      });
    },

    async listByAssignment(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/test-cases`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async batchImport(assignmentId, testCases) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/test-cases/batch`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: { testCases },
        },
      );
    },
  };

  // ============================================================
  // Phase 6 — Rubric Service
  // ============================================================
  const rubricService = {
    async create(assignmentId, data) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/rubric`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async update(assignmentId, data) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/rubric`,
        {
          service: 'courses',
          method: 'PUT',
          auth: true,
          body: data,
        },
      );
    },

    async getByAssignment(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/rubric`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Phase 6 — Evaluation Service
  // ============================================================
  const evaluationService = {
    async submit(assignmentId, data) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/submit`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async evaluate(submissionId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(submissionId))}/evaluate`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
        },
      );
    },

    async getResults(submissionId) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/results`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getStyleReport(submissionId) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/style-report`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getBenchmark(submissionId) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/benchmark`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async listByAssignment(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/submissions`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Phase 6 — Plagiarism Service
  // ============================================================
  const plagiarismService = {
    async triggerCheck(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/plagiarism-check`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
        },
      );
    },

    async getResults(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/plagiarism-report`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },
  };

  // ============================================================
  // Phase 6 — Feedback Service
  // ============================================================
  const feedbackService = {
    async submitGrade(submissionId, data) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/grade`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async addTextFeedback(submissionId, data) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/feedback`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async attachVideoFeedback(submissionId, data) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/feedback/video`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async assignPeerReview(assignmentId, data) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/peer-reviews`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async submitPeerReview(reviewId, data) {
      return apiFetch(`/peer-reviews/${encodeURIComponent(String(reviewId))}`, {
        service: 'courses',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    async getPeerReviews(assignmentId) {
      return apiFetch(
        `/assignments/${encodeURIComponent(String(assignmentId))}/peer-reviews`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async batchDistribute(submissionId, data) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/feedback/batch`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },
  };

  // ============================================================
  // Phase 7 — Project Service (deprecated — use trackingProjectService)
  // ============================================================
  var projectServiceDeprecatedWarned = false;
  function warnLegacyProjectService(method) {
    if (projectServiceDeprecatedWarned) return;
    projectServiceDeprecatedWarned = true;
    console.warn(
      '[NibrasServices] projectService is deprecated; migrate to trackingProjectService.',
      method || '',
    );
  }

  const projectService = {
    async create(data) {
      warnLegacyProjectService('create');
      return apiFetch('/projects', {
        service: 'courses',
        method: 'POST',
        auth: true,
        body: data,
      });
    },

    async update(id, data) {
      return apiFetch(`/projects/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'PUT',
        auth: true,
        body: data,
      });
    },

    async delete(id) {
      return apiFetch(`/projects/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'DELETE',
        auth: true,
      });
    },

    async listByCourse(courseId) {
      return apiFetch(
        `/projects/course/${encodeURIComponent(String(courseId))}`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getById(id) {
      return apiFetch(`/projects/${encodeURIComponent(String(id))}`, {
        service: 'courses',
        method: 'GET',
        auth: true,
      });
    },

    async addMilestone(projectId, data) {
      return apiFetch(
        `/projects/${encodeURIComponent(String(projectId))}/milestones`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async updateMilestone(milestoneId, data) {
      return apiFetch(
        `/milestones/${encodeURIComponent(String(milestoneId))}`,
        {
          service: 'courses',
          method: 'PUT',
          auth: true,
          body: data,
        },
      );
    },

    async deleteMilestone(milestoneId) {
      return apiFetch(
        `/milestones/${encodeURIComponent(String(milestoneId))}`,
        {
          service: 'courses',
          method: 'DELETE',
          auth: true,
        },
      );
    },

    async submitMilestone(projectId, milestoneId, data) {
      return apiFetch(
        `/projects/${encodeURIComponent(String(projectId))}/milestones/${encodeURIComponent(String(milestoneId))}/submit`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async getSubmissions(projectId) {
      return apiFetch(
        `/projects/${encodeURIComponent(String(projectId))}/submissions`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getFeedback(submissionId) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/feedback`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async getTeamDetails(projectId) {
      return apiFetch(
        `/projects/${encodeURIComponent(String(projectId))}/team`,
        {
          service: 'courses',
          method: 'GET',
          auth: true,
        },
      );
    },

    async gradeSubmission(submissionId, data) {
      return apiFetch(
        `/submissions/${encodeURIComponent(String(submissionId))}/grade`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: data,
        },
      );
    },

    async listByInstructor(filters = {}) {
      return apiFetch(`/projects/instructor${toQueryString(filters)}`, {
        service: 'courses',
        method: 'GET',
        auth: true,
      });
    },

    async batchCreateMilestones(projectId, milestones) {
      return apiFetch(
        `/projects/${encodeURIComponent(String(projectId))}/milestones/batch`,
        {
          service: 'courses',
          method: 'POST',
          auth: true,
          body: { milestones },
        },
      );
    },
  };

  // ============================================================
  // AI Credentials Service (BYOK for Hassona / AI Tutor)
  // ============================================================
  const aiCredentialsService = {
    async get() {
      return apiFetch('/v1/me/ai-credentials', {
        service: 'tracking',
        method: 'GET',
        auth: true,
      });
    },

    async upsert(data) {
      return apiFetch('/v1/me/ai-credentials', {
        service: 'tracking',
        method: 'PUT',
        auth: true,
        body: data,
      });
    },

    async remove() {
      return apiFetch('/v1/me/ai-credentials', {
        service: 'tracking',
        method: 'DELETE',
        auth: true,
      });
    },
  };

  // ============================================================
  // Expose on window
  // ============================================================
  window.NibrasServices = Object.freeze({
    authService,
    communityAuthService,
    questionService,
    answerService,
    voteService,
    communityVoteService,
    communityCourseService,
    threadService,
    postService,
    notificationService,
    adminNotificationService,
    programService,
    competitionsService,
    tagService,
    chatbotService,
    recommendationService,
    sessionService,
    trackingCourseService,
    trackingProjectService,
    trackingMilestoneService,
    githubService,
    submissionService,
    coursesService,
    backendCoursesService,
    backendAnalyticsService,
    usersService,
    aiCredentialsService,
    gamificationService,
    reputationService,
    aiService,
    mentorshipService,
    levelsService,
    instructorApplicationService,
    instructorDashboardService,
    instructorCourseManagementService,
    flagService,
    teamService,
    assignmentAdminService,
    testCaseService,
    rubricService,
    evaluationService,
    plagiarismService,
    feedbackService,
    projectService,
  });

  console.log(
    '[NibrasServices] Initialized. Available as window.NibrasServices',
  );
})();
