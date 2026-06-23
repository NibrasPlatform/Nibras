(function () {
  'use strict';

  var session = window.NibrasSession;
  if (!session) {
    console.error(
      '[auth-guard] NibrasSession is not loaded. Include session.js before auth-guard.js.',
    );
    return;
  }

  var script = document.currentScript;
  var loginPage =
    script.getAttribute('data-login') || '../../Login/loginPage/login.html';

  var apiBase =
    (window.NibrasApiConfig &&
      typeof window.NibrasApiConfig.getServiceUrl === 'function' &&
      window.NibrasApiConfig.getServiceUrl('admin')) ||
    session.resolveAdminApiUrl();

  function redirectToLogin() {
    window.location.replace(loginPage);
  }

  function showNotAuthorized() {
    var overlay = document.createElement('div');
    overlay.id = 'nibras-auth-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
    overlay.innerHTML =
      '<div style="background:#1e1e2e;border-radius:12px;padding:2rem 3rem;text-align:center;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
      '<div style="font-size:3rem;margin-bottom:1rem;">&#128274;</div>' +
      '<h2 style="color:#fff;margin:0 0 0.5rem;">Access Denied</h2>' +
      '<p style="color:#a0a0b0;margin:0 0 1.5rem;line-height:1.5;">You do not have permission to access this page. Contact your administrator if you believe this is a mistake.</p>' +
      '<button onclick="window.location.replace(\'' +
      loginPage +
      '\')" style="background:#6c5ce7;color:#fff;border:none;border-radius:8px;padding:0.75rem 2rem;cursor:pointer;font-size:1rem;">Go to Login</button>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  var ADMIN_ROLES = ['super-admin', 'admin'];
  var ADMIN_PATHS = ['/Admin/', '/admin/'];

  var currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  var isAdminPage = ADMIN_PATHS.some(function (p) {
    return currentPath.indexOf(p) !== -1;
  });

  var token = session.getToken();

  if (!token) {
    redirectToLogin();
    return;
  }

  if (isAdminPage) {
    var storedUser = session.getUser();
    if (storedUser) {
      var role = String(
        storedUser.role?.name || storedUser.role || '',
      ).toLowerCase();
      if (role && ADMIN_ROLES.indexOf(role) === -1) {
        showNotAuthorized();
        return;
      }
    }
  }

  session.validateSession(apiBase).then(function (result) {
    if (result.ok && result.user) {
      try {
        window.localStorage.setItem('user', JSON.stringify(result.user));
      } catch (_) {}
      if (isAdminPage) {
        var role = String(
          result.user.role?.name || result.user.role || '',
        ).toLowerCase();
        if (role && ADMIN_ROLES.indexOf(role) === -1) {
          showNotAuthorized();
        }
      }
      return;
    }

    if (result.status === 401) {
      session.clearAuth();
      redirectToLogin();
      return;
    }

    if (result.status === 403) {
      showNotAuthorized();
    }
  });
})();
