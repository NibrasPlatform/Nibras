/**
 * API Configuration
 *
 * Service map:
 * - admin: Railway admin/auth/courses backend
 * - legacyCommunity: legacy community + tutor backend
 * - community: course-thread community backend
 * - tracking: nibras tracking/projects backend
 * - competitions: competitions backend
 * - recommendation: recommendation model backend
 * - courses: GitHub backend (Dummy-Nibras) for courses/progress/grades
 *
 * Override priority per service:
 * 1. Query parameter
 *    - admin: ?api=URL or ?adminApi=URL
 *    - legacyCommunity: ?legacyApi=URL
 *    - community: ?communityApi=URL or ?discussionsApi=URL
 *    - tracking: ?trackingApi=URL or ?trackApi=URL
 *    - competitions: ?competitionsApi=URL or ?compApi=URL
 *    - recommendation: ?recommendationApi=URL or ?recommendApi=URL or ?recApi=URL
 *    - courses: ?coursesApi=URL or ?courseApi=URL
 * 2. localStorage
 *    - admin: nibras_admin_api_url or nibras_api_url (legacy key)
 *    - legacyCommunity: nibras_legacy_api_url
 *    - community: nibras_community_api_url
 *    - tracking: nibras_tracking_api_url
 *    - competitions: nibras_competitions_api_url
 *    - recommendation: nibras_recommendation_api_url
 *    - courses: nibras_courses_api_url
 *    - googleClientId: nibras_google_client_id
 * 3. Defaults below
 */
(function () {
  const gw = window.NibrasGateway;
  const PRODUCTION_API = gw?.PRODUCTION_GATEWAY || 'https://web-production-3011ec.up.railway.app';
  const LOCAL_GATEWAY = gw?.LOCAL_GATEWAY || 'http://localhost:8080';

  const isLocalHost = (() => {
    try {
      if (gw) return gw.isLocalHost(window.location.hostname);
      return ['localhost', '127.0.0.1'].includes(window.location.hostname);
    } catch (_) {
      return false;
    }
  })();

  const isGatewayHost = (() => {
    try {
      if (gw) return gw.isGatewayHost(window.location.hostname);
      const host = window.location.hostname;
      if (isLocalHost) return true;
      if (host.includes('vercel.app')) return true;
      if (host.includes('azurecontainerapps.io')) return true;
      if (host.includes('railway.app') && !host.startsWith('api-')) return true;
      return false;
    } catch (_) {
      return false;
    }
  })();

  const pageOrigin = (() => {
    try {
      return window.location.origin;
    } catch (_) {
      return '';
    }
  })();

  const readStoredUrl = (key) => {
    if (gw) return gw.readStoredApiUrl(localStorage, key, pageOrigin, isGatewayHost);
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  const DEFAULT_GATEWAY = isLocalHost
    ? LOCAL_GATEWAY
    : isGatewayHost
      ? pageOrigin || window.location.origin
      : PRODUCTION_API;
  let productionGateway = DEFAULT_GATEWAY;
  const DEFAULT_MONOLITH_API = isLocalHost
    ? `${LOCAL_GATEWAY}/api`
    : `${productionGateway}/api`;
  const DEFAULT_ADMIN_API = DEFAULT_MONOLITH_API;
  const DEFAULT_LEGACY_API = isLocalHost ? LOCAL_GATEWAY : productionGateway;
  const DEFAULT_COMMUNITY_API = isLocalHost ? LOCAL_GATEWAY : productionGateway;
  var DEFAULT_TRACKING_API = isLocalHost
    ? LOCAL_GATEWAY
    : isGatewayHost
      ? pageOrigin || window.location.origin
      : PRODUCTION_API;
  const DEFAULT_COMPETITIONS_API = isLocalHost
    ? LOCAL_GATEWAY
    : productionGateway;
  const DEFAULT_RECOMMENDATION_API =
    'https://recommendationmodel-production-c22c.up.railway.app/api/recommend';
  const DEFAULT_COURSES_API = 'https://nibras-backend.up.railway.app/api';
  const DEFAULT_GOOGLE_CLIENT_ID =
    '561316297025-c9ohua7q6sa91nn2eetsprac65a3oog6.apps.googleusercontent.com';

  const params = new URLSearchParams(window.location.search);

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

  const ensureRecommendationApiBaseUrl = (value) => {
    const normalizedBase = ensureApiBaseUrl(value);
    if (!normalizedBase) return null;

    try {
      const parsed = new URL(normalizedBase);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      pathname = pathname.replace(/\/recommend$/i, '');
      if (!pathname || pathname === '/') pathname = '/api';
      parsed.pathname = pathname;
      return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
      return normalizedBase.replace(/\/recommend$/i, '');
    }
  };

  const ensureGatewayBaseUrl = (value) => {
    const normalized = normalizeUrl(value);
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      parsed.pathname = '/';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
      return normalized.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
    }
  };

  const ensureCompetitionsApiBaseUrl = (value) => {
    const gatewayBase = ensureGatewayBaseUrl(value);
    if (gatewayBase) return gatewayBase;
    const normalizedBase = ensureApiBaseUrl(value);
    if (!normalizedBase) return null;
    try {
      const parsed = new URL(normalizedBase);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      if (!pathname || pathname === '/') pathname = '/api';
      parsed.pathname = pathname;
      return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
      return normalizedBase.endsWith('/api')
        ? normalizedBase
        : normalizedBase + '/api';
    }
  };

  const readFirst = (...values) => {
    for (let i = 0; i < values.length; i += 1) {
      const normalized = normalizeUrl(values[i]);
      if (normalized) return normalized;
    }
    return null;
  };

  const adminApi =
    ensureApiBaseUrl(
      readFirst(
        params.get('api'),
        params.get('adminApi'),
        readStoredUrl('nibras_admin_api_url'),
        readStoredUrl('nibras_api_url'),
        window.NIBRAS_API_URL,
        window.NIBRAS_BACKEND_URL,
        DEFAULT_ADMIN_API,
      ),
    ) || DEFAULT_ADMIN_API;

  const legacyCommunityApi =
    ensureGatewayBaseUrl(
      readFirst(
        params.get('legacyApi'),
        readStoredUrl('nibras_legacy_api_url'),
        DEFAULT_LEGACY_API,
      ),
    ) || DEFAULT_LEGACY_API;

  const communityApi =
    ensureGatewayBaseUrl(
      readFirst(
        params.get('communityApi'),
        params.get('discussionsApi'),
        readStoredUrl('nibras_community_api_url'),
        DEFAULT_COMMUNITY_API,
      ),
    ) || DEFAULT_COMMUNITY_API;

  const trackingApi = (() => {
    const raw = readFirst(
      params.get('trackingApi'),
      params.get('trackApi'),
      readStoredUrl('nibras_tracking_api_url'),
      DEFAULT_TRACKING_API,
    );
    if (!raw) return DEFAULT_TRACKING_API;
    const normalized = normalizeUrl(raw);
    if (!normalized) return DEFAULT_TRACKING_API;
    try {
      const parsed = new URL(normalized);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      // Keep tracking base at host/root (or custom prefix), because callers already use /v1 paths.
      pathname = pathname.replace(/\/v1$/i, '');
      if (!pathname || pathname === '/') pathname = '/';
      parsed.pathname = pathname;
      return parsed.toString().replace(/\/+$/, '');
    } catch (_) {
      return raw.replace(/\/+$/, '').replace(/\/v1$/i, '');
    }
  })();

  // New: ensure tracking API uses session-based auth (cookie)
  const ensureTrackingApiUrl = (value) => {
    if (!value) return null;
    try {
      const parsed = new URL(value);
      return parsed.origin; // Return just origin for session-based requests
    } catch (_) {
      return value;
    }
  };

  const competitionsApi =
    ensureCompetitionsApiBaseUrl(
      readFirst(
        params.get('competitionsApi'),
        params.get('compApi'),
        readStoredUrl('nibras_competitions_api_url'),
        DEFAULT_COMPETITIONS_API,
      ),
    ) || DEFAULT_COMPETITIONS_API;

  const recommendationApi =
    ensureRecommendationApiBaseUrl(
      readFirst(
        params.get('recommendationApi'),
        params.get('recommendApi'),
        params.get('recApi'),
        readStoredUrl('nibras_recommendation_api_url'),
        window.NIBRAS_RECOMMENDATION_API_URL,
        DEFAULT_RECOMMENDATION_API,
      ),
    ) || DEFAULT_RECOMMENDATION_API;

  const coursesApi =
    ensureApiBaseUrl(
      readFirst(
        params.get('coursesApi'),
        params.get('courseApi'),
        readStoredUrl('nibras_courses_api_url'),
        DEFAULT_COURSES_API,
      ),
    ) || DEFAULT_COURSES_API;

  const services = Object.freeze({
    admin: adminApi,
    legacyCommunity: legacyCommunityApi,
    community: communityApi,
    tracking: trackingApi,
    competitions: competitionsApi,
    recommendation: recommendationApi,
    courses: coursesApi,
  });
  const googleClientId = String(
    window.NibrasApiConfig?.googleClientId ||
      params.get('googleClientId') ||
      params.get('gClientId') ||
      localStorage.getItem('nibras_google_client_id') ||
      window.NIBRAS_GOOGLE_CLIENT_ID ||
      DEFAULT_GOOGLE_CLIENT_ID,
  ).trim();

  const getServiceUrl = (service = 'admin') =>
    services[service] || services.admin;

  window.NIBRAS_API_SERVICES = services;
  window.NIBRAS_API_URL = services.admin;
  window.NIBRAS_BACKEND_URL = services.admin;
  window.NIBRAS_LEGACY_API_URL = services.legacyCommunity;
  window.NIBRAS_COMMUNITY_API_URL = services.community;
  window.NIBRAS_TRACKING_API_URL = services.tracking;
  window.NIBRAS_COMPETITIONS_API_URL = services.competitions;
  window.NIBRAS_RECOMMENDATION_API_URL = services.recommendation;
  window.NIBRAS_COURSES_API_URL = services.courses;
  window.NIBRAS_GOOGLE_CLIENT_ID = googleClientId;
  window.NIBRAS_IS_LOCALHOST = isLocalHost;
  window.NIBRAS_PREFER_LOCAL_TRACKING_FALLBACK = isLocalHost;
  const existingGoogleClientId = window.NibrasApiConfig?.googleClientId;
  window.NibrasApiConfig = Object.freeze({
    services,
    googleClientId: existingGoogleClientId || googleClientId,
    getServiceUrl,
    isLocalHost,
    preferLocalTrackingFallback: isLocalHost,
  });

  console.log('[NIBRAS Config] API services:', services);
  console.log(
    '[NIBRAS Config] Frontend running on:',
    `${window.location.hostname}:${window.location.port}`,
  );
})();
