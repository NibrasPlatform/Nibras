window.NibrasReact.run(() => {
  // --- 1. SIDEBAR LOGIC ---
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((n) => n.classList.remove('active'));
      link.classList.add('active');
    });
  });

  const apiFetch = window.NibrasShared?.apiFetch;
  const resolveServiceUrl =
    window.NibrasApiConfig?.getServiceUrl?.bind(window.NibrasApiConfig) ||
    window.NibrasShared?.resolveServiceUrl ||
    (() => null);

  function resolveGatewayOrigin() {
    const gw = window.NibrasGateway;
    if (gw) return gw.gatewayOrigin(window.location);
    try {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return 'http://localhost:8080';
      }
      if (
        host.includes('vercel.app') ||
        host.includes('azurecontainerapps.io') ||
        (host.includes('railway.app') && !host.startsWith('api-'))
      ) {
        return window.location.origin;
      }
    } catch (_) {
      // Fall through to production default.
    }
    return 'https://web-production-3011ec.up.railway.app';
  }

  const gatewayOrigin = resolveGatewayOrigin();
  const adminApiBase = String(
    resolveServiceUrl('admin') || `${gatewayOrigin}/api`,
  ).replace(/\/+$/, '');
  const trackingApiBase = String(
    resolveServiceUrl('tracking') || gatewayOrigin,
  ).replace(/\/+$/, '');
  const githubServiceCandidates = ['tracking', 'admin'];

  const LEVEL_OPTIONS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  const LEGACY_LEVEL_MAP = {
    'Level 1': 'Beginner',
    'Level 2': 'Intermediate',
    'Level 3': 'Advanced',
    'Level 4': 'Expert',
  };

  function normalizeStudyLevel(level) {
    const raw = String(level || '').trim();
    if (!raw) return 'Beginner';
    if (LEVEL_OPTIONS.includes(raw)) return raw;
    return LEGACY_LEVEL_MAP[raw] || 'Beginner';
  }

  function loadLevel(user) {
    if (user?.selectedLevel) return normalizeStudyLevel(user.selectedLevel);
    return normalizeStudyLevel(localStorage.getItem('pref-level'));
  }

  function saveLevel(level) {
    const normalized = normalizeStudyLevel(level);
    localStorage.setItem('pref-level', normalized);
    try {
      const cached = JSON.parse(localStorage.getItem('user') || '{}');
      cached.selectedLevel = normalized;
      localStorage.setItem('user', JSON.stringify(cached));
    } catch (_) {}
    return normalized;
  }

  var loadedSnapshot = null;

  function captureToggleSnapshot(containerId) {
    var state = {};
    var container = document.getElementById(containerId);
    if (!container) return state;
    container.querySelectorAll('input[type="checkbox"]').forEach(function (el) {
      if (el.id) state[el.id] = el.checked;
    });
    return state;
  }

  function applyToggleSnapshot(containerId, state) {
    if (!state) return;
    var container = document.getElementById(containerId);
    if (!container) return;
    Object.keys(state).forEach(function (id) {
      var el = container.querySelector('#' + id);
      if (el) el.checked = !!state[id];
    });
  }

  function captureSnapshot() {
    return {
      name: document.getElementById('input-name')?.value || '',
      email: document.getElementById('input-email')?.value || '',
      level: document.getElementById('pref-level')?.value || 'Beginner',
      theme: document.getElementById('theme-selector')?.value || 'light',
      privacyLeaderboard:
        document.getElementById('privacy-leaderboard')?.checked ?? true,
      currentPassword: document.getElementById('input-current-password')?.value || '',
      newPassword: document.getElementById('input-new-password')?.value || '',
      confirmPassword: document.getElementById('input-confirm-password')?.value || '',
      notifications: captureToggleSnapshot('notification-container'),
      channels: captureToggleSnapshot('channel-container'),
    };
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    const nameInput = document.getElementById('input-name');
    const emailInput = document.getElementById('input-email');
    const levelSelect = document.getElementById('pref-level');
    const themeSelect = document.getElementById('theme-selector');
    const privacyToggle = document.getElementById('privacy-leaderboard');
    if (nameInput) nameInput.value = snapshot.name;
    if (emailInput) emailInput.value = snapshot.email;
    if (levelSelect) levelSelect.value = normalizeStudyLevel(snapshot.level);
    if (themeSelect) themeSelect.value = snapshot.theme || 'light';
    if (privacyToggle) privacyToggle.checked = snapshot.privacyLeaderboard;
    const currentPassword = document.getElementById('input-current-password');
    const newPassword = document.getElementById('input-new-password');
    const confirmPassword = document.getElementById('input-confirm-password');
    if (currentPassword) currentPassword.value = snapshot.currentPassword || '';
    if (newPassword) newPassword.value = snapshot.newPassword || '';
    if (confirmPassword) confirmPassword.value = snapshot.confirmPassword || '';
    applyToggleSnapshot('notification-container', snapshot.notifications);
    applyToggleSnapshot('channel-container', snapshot.channels);
    pendingTheme = snapshot.theme || 'light';
  }

  const btnConnectGitHub = document.getElementById('btn-connect-github');
  const btnInstallGitHubApp = document.getElementById('btn-install-github-app');
  const btnDisconnectGitHub = document.getElementById('btn-disconnect-github');

  function getBaseForService(service) {
    if (service === 'tracking') return trackingApiBase;
    return adminApiBase;
  }

  function isCompatibilityStatus(status) {
    return status === 404 || status === 405 || status === 501;
  }

  function buildGithubServiceCandidates() {
    const unique = [];
    githubServiceCandidates.forEach((service) => {
      const base = getBaseForService(service);
      if (!base) return;
      const duplicate = unique.some((entry) => entry.base === base);
      if (!duplicate) {
        unique.push({ service, base });
      }
    });
    return unique;
  }

  async function githubApiRequestWithFallback(
    path,
    options = {},
    fallbackStatuses = [404, 405, 501],
  ) {
    if (!apiFetch) {
      throw new Error('API fetch utility is unavailable.');
    }
    let lastError = null;
    const candidates = buildGithubServiceCandidates();
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        return await apiFetch(
          path,
          Object.assign({}, options, {
            service: candidate.service,
            auth: options.auth !== false,
          }),
        );
      } catch (error) {
        const status = Number(error?.status || 0);
        const isLastCandidate = i === candidates.length - 1;
        const shouldFallback = fallbackStatuses.includes(status);
        lastError = error;
        if (!shouldFallback || isLastCandidate) {
          throw error;
        }
      }
    }
    throw lastError || new Error(`No compatible endpoint found for ${path}`);
  }

  async function resolveGitHubConnectTarget() {
    if (typeof fetch !== 'function') {
      return { base: adminApiBase, path: '/v1/github/oauth/login' };
    }

    const candidates = buildGithubServiceCandidates();
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        const response = await fetch(`${candidate.base}/v1/github/config`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (response.status !== 404) {
          return { base: candidate.base, path: '/v1/github/oauth/start' };
        }
      } catch (_) {
        // Probe failed, continue fallback chain.
      }
    }

    return { base: adminApiBase, path: '/v1/github/oauth/login' };
  }

  async function disconnectGitHubAccount() {
    await githubApiRequestWithFallback('/v1/github/oauth/disconnect', {
      method: 'POST',
      auth: true,
    });
  }

  async function startGitHubAppInstallFlow() {
    const settingsReturnTo = `${window.location.origin}${window.location.pathname}`;
    const payload = await githubApiRequestWithFallback(
      `/v1/github/install-url?return_to=${encodeURIComponent(settingsReturnTo)}`,
      {
        method: 'GET',
        auth: true,
      },
    );
    const installUrl = String(payload?.installUrl || '').trim();
    if (!installUrl) {
      throw new Error('Install URL is missing from backend response.');
    }
    window.location.href = installUrl;
  }

  function setGitHubStatusMessage(message, tone = 'neutral') {
    const statusText = document.getElementById('github-status-text');
    if (!statusText) return;
    statusText.textContent = String(message || '');
    if (tone === 'error') {
      statusText.style.color = 'var(--tag-red-text, #dc2626)';
      return;
    }
    if (tone === 'success') {
      statusText.style.color = 'var(--accent-blue, #2563eb)';
      return;
    }
    statusText.style.color = '';
  }

  async function syncGitHubInstallationIfNeeded() {
    try {
      await githubApiRequestWithFallback(
        '/v1/github/installations/sync',
        {
          method: 'POST',
          auth: true,
        },
        [404, 405, 501, 503],
      );
    } catch (_) {
      // Sync is best-effort; setup/complete remains the primary web path.
    }
  }

  async function handleGitHubSetupCompletionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get('installation_id');
    if (!installationId) return;

    const stateToken = params.get('state') || undefined;
    try {
      await githubApiRequestWithFallback('/v1/github/setup/complete', {
        method: 'POST',
        auth: true,
        body: {
          installationId,
          state: stateToken,
        },
      });
      setGitHubStatusMessage(
        'GitHub App installation linked successfully.',
        'success',
      );
    } catch (error) {
      setGitHubStatusMessage(
        error?.message || 'Could not complete GitHub App setup.',
        'error',
      );
    } finally {
      params.delete('installation_id');
      params.delete('state');
      params.delete('setup_action');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
  }

  // --- GITHUB BUTTON ACTIONS ---
  if (btnConnectGitHub) {
    btnConnectGitHub.addEventListener('click', async () => {
      const originalText = btnConnectGitHub.innerHTML;
      btnConnectGitHub.disabled = true;
      btnConnectGitHub.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';

      try {
        const target = await resolveGitHubConnectTarget();
        if (target.path === '/v1/github/oauth/start') {
          const returnTo = window.location.href;
          window.location.href = `${target.base}${target.path}?return_to=${encodeURIComponent(returnTo)}`;
          return;
        }
        window.location.href = `${target.base}${target.path}`;
      } catch (err) {
        alert(
          'Could not start GitHub connection: ' +
            (err?.message || 'Unknown error'),
        );
        btnConnectGitHub.disabled = false;
        btnConnectGitHub.innerHTML = originalText;
      }
    });
  }

  if (btnInstallGitHubApp) {
    btnInstallGitHubApp.addEventListener('click', async () => {
      const originalText = btnInstallGitHubApp.innerHTML;
      btnInstallGitHubApp.disabled = true;
      btnInstallGitHubApp.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Opening...';
      try {
        await startGitHubAppInstallFlow();
      } catch (error) {
        alert(
          'Could not start GitHub App installation: ' +
            (error?.message || 'Unknown error'),
        );
        btnInstallGitHubApp.disabled = false;
        btnInstallGitHubApp.innerHTML = originalText;
      }
    });
  }

  if (btnDisconnectGitHub) {
    btnDisconnectGitHub.addEventListener('click', async () => {
      if (
        !confirm(
          'Are you sure you want to disconnect your GitHub account? Automated grading will be disabled.',
        )
      )
        return;
      if (!apiFetch) {
        alert(
          'Disconnect is unavailable because API utilities are not loaded on this page.',
        );
        return;
      }
      try {
        await disconnectGitHubAccount();
        location.reload();
      } catch (err) {
        if (Number(err?.status || 0) === 404) {
          alert(
            'Disconnect is not supported by the active backend integration.',
          );
          return;
        }
        alert('Failed to disconnect: ' + (err?.message || 'Unknown error'));
      }
    });
  }

  // --- 2. FETCH USER PROFILE FROM API ---
  async function loadUserProfile() {
    try {
      const cachedUser = JSON.parse(localStorage.getItem('user'));
      if (
        cachedUser &&
        (cachedUser.name || cachedUser.username || cachedUser.email)
      ) {
        applyProfileToUI(cachedUser);
      }
    } catch (_) {}

    try {
      const token = localStorage.getItem('token');
      if (!token || !apiFetch) return;

      const data = await fetchProfileWithFallback();
      const user = data?.user || data;
      if (user && (user.name || user.username || user.email)) {
        localStorage.setItem('user', JSON.stringify(user));
        applyProfileToUI(user);
      }
    } catch (err) {
      console.warn('[SETTINGS.JS] Could not fetch user profile:', err.message);
    }
  }

  async function fetchProfileWithFallback() {
    const profileCandidates = [
      { service: 'tracking', path: '/v1/web/session' },
      { service: 'tracking', path: '/v1/me' },
      { service: 'admin', path: '/auth/me' },
      { service: 'admin', path: '/v1/web/session' },
      { service: 'admin', path: '/v1/me' },
    ];
    let lastError = null;
    for (let index = 0; index < profileCandidates.length; index += 1) {
      const candidate = profileCandidates[index];
      try {
        return await apiFetch(candidate.path, {
          service: candidate.service,
          method: 'GET',
          auth: true,
        });
      } catch (error) {
        const status = Number(error?.status || 0);
        const shouldTryFallback = isCompatibilityStatus(status);
        const isLastCandidate = index === profileCandidates.length - 1;
        lastError = error;
        if (!shouldTryFallback || isLastCandidate) {
          throw error;
        }
      }
    }
    throw (
      lastError || new Error('Unable to load profile from the active backend.')
    );
  }

  function applyProfileToUI(user) {
    const nameInput = document.getElementById('input-name');
    const emailInput = document.getElementById('input-email');

    if (nameInput && (user.name || user.username))
      nameInput.value = user.name || user.username;
    if (emailInput && user.email) emailInput.value = user.email;

    const levelSelect = document.getElementById('pref-level');
    if (levelSelect) {
      levelSelect.value = loadLevel(user);
    }

    const displayName = user?.name || user?.username || '';
    if (displayName) {
      const initials = displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
      const avatarLarge = document.getElementById('avatar-display');
      if (avatarLarge && !avatarLarge.querySelector('img')) {
        avatarLarge.textContent = initials;
      }
      const sidebarName = document.getElementById('sidebar-name');
      if (sidebarName) sidebarName.textContent = displayName;
      const sidebarAvatar = document.getElementById('sidebar-avatar');
      if (sidebarAvatar) sidebarAvatar.textContent = initials;
      const displayRole = user?.role?.name || user?.role || 'student';
      const sidebarRole = document.getElementById('sidebar-role');
      if (sidebarRole) sidebarRole.textContent = displayRole;
    }

    const btnConnect = document.getElementById('btn-connect-github');
    const btnInstall = document.getElementById('btn-install-github-app');
    const profileInfo = document.getElementById('github-profile-info');
    const statusText = document.getElementById('github-status-text');
    const usernameNode = document.getElementById('github-username');
    const avatarNode = document.getElementById('github-avatar');
    if (statusText) statusText.style.color = '';

    const githubUsername = user.githubUsername || user.githubLogin || '';
    const hasGithubLink = Boolean(
      user.githubId ||
      githubUsername ||
      user.githubLinked ||
      user.githubAppInstalled,
    );
    const hasAppInstall = Boolean(user.githubAppInstalled);
    const githubAvatarUrl =
      user.githubAvatarUrl ||
      (githubUsername
        ? `https://avatars.githubusercontent.com/${encodeURIComponent(githubUsername)}?s=64`
        : '');

    if (hasGithubLink) {
      if (btnConnect) btnConnect.style.display = 'none';
      if (profileInfo) profileInfo.style.display = 'flex';
      if (usernameNode)
        usernameNode.textContent = githubUsername || 'Connected';
      if (avatarNode && githubAvatarUrl) avatarNode.src = githubAvatarUrl;

      if (hasAppInstall) {
        if (btnInstall) btnInstall.style.display = 'none';
        if (statusText) statusText.textContent = 'Connected and Synced';
      } else {
        if (btnInstall) btnInstall.style.display = '';
        if (statusText)
          statusText.textContent =
            'Connected. Install GitHub App to enable automated grading.';
      }
    } else {
      if (btnConnect) btnConnect.style.display = '';
      if (btnInstall) btnInstall.style.display = 'none';
      if (profileInfo) profileInfo.style.display = 'none';
      if (statusText) statusText.textContent = 'Not connected';
    }
  }

  async function loadPrivacySettings() {
    const privacyToggle = document.getElementById('privacy-leaderboard');
    if (!privacyToggle) return;
    if (!window.NibrasServices?.usersService?.getPrivacy) {
      return;
    }
    try {
      const privacy = await window.NibrasServices.usersService.getPrivacy();
      if (privacy && typeof privacy.showOnLeaderboard === 'boolean') {
        privacyToggle.checked = privacy.showOnLeaderboard;
      }
    } catch (err) {
      console.warn('[SETTINGS.JS] Could not fetch privacy settings:', err.message);
    }
  }

  // Load setup completion first (if redirected from install), then profile.
  void handleGitHubSetupCompletionFromUrl()
    .then(() => syncGitHubInstallationIfNeeded())
    .finally(() => {
    void loadUserProfile().then(function () {
      void loadPrivacySettings().finally(function () {
        loadedSnapshot = captureSnapshot();
      });
    });
  });

  var notifTypeMap = {
    'notif-assign': 'assignment_deadline',
    'notif-grade': 'grade_posted',
    'notif-course': 'course_announcement',
    'notif-achieve': 'achievement',
    'notif-contest': 'contest_starting',
    'notif-badge': 'badge_earned',
    'notif-atrisk': 'at_risk_alert',
    'notif-email': 'email_digest',
  };
  var notifLabels = [
    {
      id: 'notif-assign',
      title: 'Assignment Deadlines',
      desc: 'Get notified about upcoming assignment due dates',
    },
    {
      id: 'notif-grade',
      title: 'Grade Updates',
      desc: 'Receive notifications when new grades are posted',
    },
    {
      id: 'notif-course',
      title: 'Course Announcements',
      desc: 'Stay updated with course announcements from instructors',
    },
    {
      id: 'notif-achieve',
      title: 'Achievement Unlocked',
      desc: 'Get notified when you earn new badges and achievements',
    },
    {
      id: 'notif-contest',
      title: 'Contest Reminders',
      desc: 'Get notified when a contest is about to start',
    },
    {
      id: 'notif-badge',
      title: 'Badge Earned',
      desc: 'Get notified when you earn a new badge',
    },
    {
      id: 'notif-email',
      title: 'Email Digest',
      desc: 'Receive a periodic email summary of activity',
    },
  ];

  var notifDefaults = {
    'notif-assign': true,
    'notif-grade': true,
    'notif-course': true,
    'notif-achieve': true,
    'notif-contest': true,
    'notif-atrisk': true,
    'notif-email': false,
  };

  var channelLabels = [
    {
      id: 'channel-email',
      title: 'Email',
      desc: 'Receive notification emails',
      icon: 'fa-solid fa-envelope',
    },
    {
      id: 'channel-slack',
      title: 'Slack',
      desc: 'Send notifications to your Slack workspace',
      icon: 'fa-brands fa-slack',
    },
    {
      id: 'channel-discord',
      title: 'Discord',
      desc: 'Send notifications to your Discord channel',
      icon: 'fa-brands fa-discord',
    },
  ];
  var channelDefaults = {
    'channel-email': false,
    'channel-slack': false,
    'channel-discord': false,
  };

  function renderNotificationToggles(prefMap) {
    var container = document.getElementById('notification-container');
    if (!container) return;
    container.innerHTML = '';
    var isInstructor = false;
    try {
      var _u = JSON.parse(localStorage.getItem('user') || '{}');
      var _r = String(_u?.role?.name || _u?.role || '').toLowerCase();
      isInstructor = _r === 'instructor';
    } catch (_) {}
    notifLabels.forEach(function (n) {
      var checked =
        prefMap && prefMap[n.id] !== undefined
          ? prefMap[n.id]
          : notifDefaults[n.id];
      var isChecked = checked ? 'checked' : '';
      container.innerHTML += [
        '<div class="toggle-row">',
        '<div class="toggle-info"><h4>' +
          n.title +
          '</h4><p>' +
          n.desc +
          '</p></div>',
        '<label class="switch">',
        '<input type="checkbox" id="' + n.id + '" ' + isChecked + '>',
        '<span class="slider round"></span>',
        '</label>',
        '</div>',
      ].join('');
    });
    if (isInstructor) {
      var atriskChecked =
        prefMap && prefMap['notif-atrisk'] !== undefined
          ? prefMap['notif-atrisk']
          : notifDefaults['notif-atrisk'];
      container.innerHTML += [
        '<div class="toggle-row border-top">',
        '<div class="toggle-info"><h4>At-Risk Alerts</h4><p>Get alerts about students who may need help</p></div>',
        '<label class="switch">',
        '<input type="checkbox" id="notif-atrisk" ' +
          (atriskChecked ? 'checked' : '') +
          '>',
        '<span class="slider round"></span>',
        '</label>',
        '</div>',
      ].join('');
    }
  }

  function attachNotificationListeners() {
    notifLabels.forEach(function (n) {
      var checkbox = document.getElementById(n.id);
      if (!checkbox) return;
      checkbox.addEventListener('change', function () {
        var type = notifTypeMap[n.id];
        var enabled = this.checked;
        if (
          window.NibrasServices &&
          window.NibrasServices.notificationService
        ) {
          window.NibrasServices.notificationService
            .updatePreference(type, enabled)
            .catch(function () {
              /* silent — keep UI state */
            });
        }
      });
    });
    var atriskBox = document.getElementById('notif-atrisk');
    if (atriskBox) {
      atriskBox.addEventListener('change', function () {
        var type = notifTypeMap['notif-atrisk'];
        var enabled = this.checked;
        if (
          window.NibrasServices &&
          window.NibrasServices.notificationService
        ) {
          window.NibrasServices.notificationService
            .updatePreference(type, enabled)
            .catch(function () {});
        }
      });
    }
  }

  function renderChannelToggles(prefMap) {
    var container = document.getElementById('channel-container');
    if (!container) return;
    container.innerHTML = '';
    channelLabels.forEach(function (c) {
      var checked =
        prefMap && prefMap[c.id] !== undefined
          ? prefMap[c.id]
          : channelDefaults[c.id];
      var isChecked = checked ? 'checked' : '';
      container.innerHTML += [
        '<div class="toggle-row">',
        '<div class="toggle-info"><h4><i class="' +
          c.icon +
          '" style="width:18px;margin-right:6px;"></i>' +
          c.title +
          '</h4><p>' +
          c.desc +
          '</p></div>',
        '<label class="switch">',
        '<input type="checkbox" id="' + c.id + '" ' + isChecked + '>',
        '<span class="slider round"></span>',
        '</label>',
        '</div>',
      ].join('');
    });
  }

  function attachChannelListeners() {
    channelLabels.forEach(function (c) {
      var checkbox = document.getElementById(c.id);
      if (!checkbox) return;
      checkbox.addEventListener('change', function () {
        var enabled = this.checked;
        if (
          window.NibrasServices &&
          window.NibrasServices.notificationService
        ) {
          window.NibrasServices.notificationService
            .updatePreference(
              'channel_' + c.id.replace('channel-', ''),
              enabled,
            )
            .catch(function () {});
        }
      });
    });
  }

  function loadChannelPreferences() {
    if (!window.NibrasServices || !window.NibrasServices.notificationService) {
      renderChannelToggles(null);
      attachChannelListeners();
      return;
    }
    window.NibrasServices.notificationService
      .getPreferences()
      .then(function (res) {
        var prefs = Array.isArray(res)
          ? res
          : (res && (res.preferences || res.data)) || [];
        var prefMap = {};
        channelLabels.forEach(function (c) {
          var channelKey = 'channel_' + c.id.replace('channel-', '');
          var match = null;
          if (Array.isArray(prefs)) {
            for (var i = 0; i < prefs.length; i++) {
              if (prefs[i].type === channelKey || prefs[i].id === channelKey) {
                match = prefs[i];
                break;
              }
            }
          }
          prefMap[c.id] = match ? match.enabled : channelDefaults[c.id];
        });
        renderChannelToggles(prefMap);
        attachChannelListeners();
      })
      .catch(function () {
        renderChannelToggles(null);
        attachChannelListeners();
      });
  }

  function loadNotificationPreferences() {
    if (!window.NibrasServices || !window.NibrasServices.notificationService) {
      renderNotificationToggles(null);
      attachNotificationListeners();
      return;
    }
    window.NibrasServices.notificationService
      .getPreferences()
      .then(function (res) {
        var prefs = Array.isArray(res)
          ? res
          : (res && (res.preferences || res.data)) || [];
        var prefMap = {};
        notifLabels.forEach(function (n) {
          var type = notifTypeMap[n.id];
          var match = null;
          if (Array.isArray(prefs)) {
            for (var i = 0; i < prefs.length; i++) {
              if (prefs[i].type === type || prefs[i].id === type) {
                match = prefs[i];
                break;
              }
            }
          }
          prefMap[n.id] = match ? match.enabled : notifDefaults[n.id];
        });
        var atriskType = notifTypeMap['notif-atrisk'];
        var atriskMatch = null;
        if (Array.isArray(prefs)) {
          for (var j = 0; j < prefs.length; j++) {
            if (
              prefs[j].type === atriskType ||
              prefs[j].id === atriskType
            ) {
              atriskMatch = prefs[j];
              break;
            }
          }
        }
        prefMap['notif-atrisk'] = atriskMatch
          ? atriskMatch.enabled
          : notifDefaults['notif-atrisk'];
        renderNotificationToggles(prefMap);
        attachNotificationListeners();
      })
      .catch(function () {
        renderNotificationToggles(null);
        attachNotificationListeners();
      });
  }

  // --- 3. BACKEND DATA (fallback defaults) ---
  const settingsData = {
    profile: { name: '', email: '', avatar: '' },
    preferences: { level: 'Beginner' },
    theme: 'light',
  };

  // --- 4. RENDER UI ---
  document.getElementById('input-name').value = settingsData.profile.name;
  document.getElementById('input-email').value = settingsData.profile.email;

  loadNotificationPreferences();
  loadChannelPreferences();

  function setAiStatusMessage(message, tone) {
    var el = document.getElementById('ai-credential-status');
    if (!el) return;
    el.textContent = message || '';
    if (tone === 'error') {
      el.style.color = 'var(--danger-color, #dc2626)';
      return;
    }
    if (tone === 'success') {
      el.style.color = 'var(--accent-blue, #2563eb)';
      return;
    }
    el.style.color = '';
  }

  function applyAiCredentialUi(cred) {
    var providerSelect = document.getElementById('ai-provider');
    var modelInput = document.getElementById('ai-model');
    var maskedNode = document.getElementById('ai-masked-key');
    var removeBtn = document.getElementById('btn-remove-ai');
    var keyInput = document.getElementById('ai-api-key');
    if (providerSelect && cred?.provider) {
      providerSelect.value = String(cred.provider);
    }
    if (modelInput && cred?.model) {
      modelInput.value = String(cred.model);
    }
    if (cred?.configured && cred?.maskedKey) {
      if (maskedNode) {
        maskedNode.style.display = 'block';
        maskedNode.textContent = 'Saved key: ' + cred.maskedKey;
      }
      if (removeBtn) removeBtn.style.display = '';
      if (keyInput) keyInput.placeholder = 'Enter a new key to replace the saved one';
    } else {
      if (maskedNode) maskedNode.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
    }
    if (cred?.encryptionReady === false) {
      setAiStatusMessage(
        'Server encryption is not configured. Contact an administrator before saving keys.',
        'error',
      );
    } else if (cred?.configured) {
      setAiStatusMessage(
        cred.tutorAvailable
          ? 'Personal API key configured. Hassona can use your credentials.'
          : 'Key saved, but tutor availability depends on provider settings.',
        'success',
      );
    } else {
      setAiStatusMessage(
        'No personal API key saved. Add one to use BYOK with Hassona.',
        'neutral',
      );
    }
  }

  async function loadAiCredentials() {
    if (!window.NibrasServices?.aiCredentialsService?.get) {
      setAiStatusMessage('AI credential service is unavailable on this page.', 'error');
      return;
    }
    try {
      var cred = await window.NibrasServices.aiCredentialsService.get();
      applyAiCredentialUi(cred);
    } catch (err) {
      setAiStatusMessage(
        err?.message || 'Could not load AI credential status.',
        'error',
      );
    }
  }

  var btnSaveAi = document.getElementById('btn-save-ai');
  if (btnSaveAi) {
    btnSaveAi.addEventListener('click', async function () {
      if (!window.NibrasServices?.aiCredentialsService?.upsert) {
        setAiStatusMessage('AI credential service is unavailable.', 'error');
        return;
      }
      var provider = document.getElementById('ai-provider')?.value || 'openai';
      var model =
        document.getElementById('ai-model')?.value?.trim() || 'gpt-4o-mini';
      var apiKey = document.getElementById('ai-api-key')?.value?.trim() || '';
      if (!apiKey) {
        setAiStatusMessage('Enter an API key before saving.', 'error');
        return;
      }
      var original = btnSaveAi.textContent;
      btnSaveAi.disabled = true;
      btnSaveAi.textContent = 'Saving...';
      try {
        var saved = await window.NibrasServices.aiCredentialsService.upsert({
          provider: provider,
          model: model,
          apiKey: apiKey,
        });
        document.getElementById('ai-api-key').value = '';
        applyAiCredentialUi(saved);
        setAiStatusMessage('AI key saved successfully.', 'success');
      } catch (err) {
        setAiStatusMessage(err?.message || 'Could not save AI key.', 'error');
      } finally {
        btnSaveAi.disabled = false;
        btnSaveAi.textContent = original;
      }
    });
  }

  var btnRemoveAi = document.getElementById('btn-remove-ai');
  if (btnRemoveAi) {
    btnRemoveAi.addEventListener('click', async function () {
      if (
        !confirm('Remove your saved AI API key? Hassona will fall back to platform credentials if available.')
      ) {
        return;
      }
      if (!window.NibrasServices?.aiCredentialsService?.remove) {
        setAiStatusMessage('AI credential service is unavailable.', 'error');
        return;
      }
      try {
        await window.NibrasServices.aiCredentialsService.remove();
        applyAiCredentialUi({ configured: false, tutorAvailable: false });
        setAiStatusMessage('AI key removed.', 'success');
      } catch (err) {
        setAiStatusMessage(err?.message || 'Could not remove AI key.', 'error');
      }
    });
  }

  void loadAiCredentials();

  try {
    var cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('pref-level').value = loadLevel(cachedUser);
  } catch (_) {
    document.getElementById('pref-level').value = loadLevel(null);
  }

  // --- 5. AVATAR (local file) ---
  document
    .getElementById('btn-change-avatar')
    .addEventListener('click', function () {
      document.getElementById('avatar-file-input').click();
    });
  document
    .getElementById('avatar-file-input')
    .addEventListener('change', function (e) {
      var file = e.target.files?.[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        document.getElementById('avatar-display').innerHTML =
          '<img src="' +
          ev.target.result +
          '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
        localStorage.setItem('nibras_avatar', ev.target.result);
      };
      reader.readAsDataURL(file);
    });
  var savedAvatar = localStorage.getItem('nibras_avatar');
  if (savedAvatar) {
    document.getElementById('avatar-display').innerHTML =
      '<img src="' +
      savedAvatar +
      '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
  }

  // --- 6. THEME TOGGLE (apply only on save) ---
  const appLogo = document.getElementById('app-logo');
  var currentTheme = localStorage.getItem('theme');
  if (currentTheme === 'dark' && appLogo) {
    appLogo.src = '/Assets/images/logo-dark.png';
  }
  const themeSelector = document.getElementById('theme-selector');
  var pendingTheme = localStorage.getItem('theme') || 'light';
  if (themeSelector) {
    themeSelector.value = pendingTheme;
  }

  themeSelector.addEventListener('change', function () {
    pendingTheme = themeSelector.value;
  });

  document.querySelector('.btn-cancel').addEventListener('click', function () {
    applySnapshot(loadedSnapshot || captureSnapshot());
  });

  // --- 7. SAVE ---
  document.querySelector('.btn-save').addEventListener('click', function () {
    var btn = document.querySelector('.btn-save');
    var originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    var displayName = document.getElementById('input-name').value.trim();
    var level = normalizeStudyLevel(document.getElementById('pref-level').value);
    var theme = pendingTheme || localStorage.getItem('theme') || 'light';
    var showOnLeaderboard = document.getElementById('privacy-leaderboard').checked;
    var currentPassword = document.getElementById('input-current-password').value;
    var newPassword = document.getElementById('input-new-password').value;
    var confirmPassword = document.getElementById('input-confirm-password').value;
    var passwordFieldsFilled =
      currentPassword || newPassword || confirmPassword;

    if (passwordFieldsFilled) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        btn.textContent = 'Fill all password fields';
        btn.style.backgroundColor = 'var(--danger-color, #dc2626)';
        setTimeout(function () {
          btn.textContent = originalText;
          btn.style.backgroundColor = '';
          btn.disabled = false;
        }, 2000);
        return;
      }
      if (newPassword !== confirmPassword) {
        btn.textContent = 'Passwords do not match';
        btn.style.backgroundColor = 'var(--danger-color, #dc2626)';
        setTimeout(function () {
          btn.textContent = originalText;
          btn.style.backgroundColor = '';
          btn.disabled = false;
        }, 2000);
        return;
      }
      if (newPassword.length < 6) {
        btn.textContent = 'Password too short';
        btn.style.backgroundColor = 'var(--danger-color, #dc2626)';
        setTimeout(function () {
          btn.textContent = originalText;
          btn.style.backgroundColor = '';
          btn.disabled = false;
        }, 2000);
        return;
      }
    }

    function done(ok, message) {
      btn.textContent = message || (ok ? 'Settings saved!' : 'Save failed');
      btn.style.backgroundColor = ok
        ? 'var(--accent-blue, #2563eb)'
        : 'var(--danger-color, #dc2626)';
      setTimeout(function () {
        btn.textContent = originalText;
        btn.style.backgroundColor = '';
        btn.disabled = false;
      }, 1500);
    }

    saveLevel(level);

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (appLogo) {
      appLogo.src =
        theme === 'dark'
          ? '/Assets/images/logo-dark.png'
          : '/Assets/images/logo-light.png';
    }

    var tasks = [];

    if (apiFetch && displayName) {
      tasks.push(
        apiFetch('/v1/me/profile', {
          service: 'tracking',
          method: 'PATCH',
          auth: true,
          body: { displayName: displayName },
        }).then(function () {
          try {
            var cached = JSON.parse(localStorage.getItem('user') || '{}');
            cached.name = displayName;
            cached.displayName = displayName;
            localStorage.setItem('user', JSON.stringify(cached));
          } catch (_) {}
        }),
      );
    }

    if (window.NibrasServices?.usersService?.updatePrivacy) {
      tasks.push(
        window.NibrasServices.usersService.updatePrivacy({
          showOnLeaderboard: showOnLeaderboard,
        }),
      );
    }

    if (window.NibrasServices?.usersService?.updateStudyLevel) {
      tasks.push(
        window.NibrasServices.usersService.updateStudyLevel(level).then(function () {
          try {
            var cached = JSON.parse(localStorage.getItem('user') || '{}');
            cached.selectedLevel = level;
            localStorage.setItem('user', JSON.stringify(cached));
          } catch (_) {}
        }),
      );
    }

    if (passwordFieldsFilled && window.NibrasServices?.authService?.changePassword) {
      tasks.push(
        window.NibrasServices.authService.changePassword({
          currentPassword: currentPassword,
          newPassword: newPassword,
        }).then(function () {
          document.getElementById('input-current-password').value = '';
          document.getElementById('input-new-password').value = '';
          document.getElementById('input-confirm-password').value = '';
        }),
      );
    }

    if (tasks.length === 0) {
      loadedSnapshot = captureSnapshot();
      done(true);
      return;
    }

    Promise.all(tasks)
      .then(function () {
        loadedSnapshot = captureSnapshot();
        done(true);
      })
      .catch(function (err) {
        done(false, err?.message || 'Save failed');
      });
  });
});
