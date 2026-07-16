console.log('[DASHBOARD.JS] Script started (direct execution)');

// Role-based routing and sidebar gating
(function () {
  try {
    var _user = JSON.parse(localStorage.getItem('user') || '{}');
    var _role = String(_user?.role?.name || _user?.role || '').toLowerCase();
    if (_role === 'instructor') {
      window.location.replace('./instructor-dashboard.html');
    }
    if (_role === 'admin' || _role === 'super-admin') {
      window.location.replace('../Admin/Dashboard/dashboard.html');
    }
  } catch (_) {}
})();

(function () {
  try {
    var _user = JSON.parse(localStorage.getItem('user') || '{}');
    var _role = String(_user?.role?.name || _user?.role || '').toLowerCase();
    var adminOnlySelectors = ['a[href*="/Admin/"]', 'a[href*="admin-"]'];
    var isAdmin = _role === 'super-admin' || _role === 'admin';
    if (!isAdmin) {
      adminOnlySelectors.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (el) {
          var li = el.closest('.nav-item');
          if (li) li.style.display = 'none';
        });
      });
    }
  } catch (_) {}
})();

let selectedCourseId = localStorage.getItem('selectedCourseId') || '';
let dashboardData = {};
let courseSwitcherBound = false;

const DROPDOWN_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error(label || 'Request timed out'));
      }, ms);
    }),
  ]);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTrackingBaseUrl() {
  const shared = window.NibrasShared || {};
  return (
    (typeof shared.resolveServiceUrl === 'function'
      ? shared.resolveServiceUrl('tracking')
      : null) ||
    window.NibrasApi?.resolveServiceUrl?.('tracking') ||
    window.NibrasApiConfig?.getServiceUrl?.('tracking') ||
    window.NIBRAS_TRACKING_API_URL ||
    window.NIBRAS_API_URL ||
    (/^https?:/i.test(window.location?.origin || '')
      ? window.location.origin.replace(/\/+$/, '')
      : '')
  );
}

function createTrackingRequestJson() {
  const shared = window.NibrasShared || {};
  if (shared.apiFetch) {
    return (path, options = {}) =>
      shared.apiFetch(path, Object.assign({}, options, { service: 'tracking' }));
  }
  return async (path, options = {}) => {
        const headers = Object.assign(
          { 'Content-Type': 'application/json' },
          options.headers || {},
        );
        const token =
          shared?.auth?.getToken?.() || window.NibrasApi?.getToken?.() || null;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const baseUrl = getTrackingBaseUrl();
        const response = await fetch(`${baseUrl}${path}`, {
          method: options.method || 'GET',
          headers,
          body: options.body,
        });
        const payload = await response.json();
        if (!response.ok) {
          const error = new Error(
            payload?.message || `Request failed (${response.status})`,
          );
          error.status = response.status;
          error.payload = payload;
          throw error;
        }
        return payload;
      };
}

function resolveDashboardHref(href) {
  if (!href) return '#';
  if (/^https?:/i.test(href)) return href;
  if (href.startsWith('../') || href.startsWith('./')) return href;

  if (href.startsWith('/projects') || href.startsWith('/Projects')) {
    var query = href.includes('?') ? href.slice(href.indexOf('?')) : '';
    return '../Projects/projects.html' + query;
  }
  if (href.startsWith('/submissions/')) {
    return '../Projects/projects.html';
  }
  if (href.startsWith('/Settings/') || href.startsWith('/settings')) {
    return '../Settings/settings.html';
  }
  if (href.startsWith('/Integrations')) {
    return '../Integrations/integrations.html';
  }
  if (href.startsWith('/')) {
    return '..' + href;
  }
  return href;
}

function getInitials(name) {
  if (!name) return 'U';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(function (n) {
      return n[0];
    })
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRoleLabel(role) {
  if (!role) return 'Student';
  if (typeof role === 'object') return role.name || 'Student';
  if (typeof role === 'string') {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }
  return 'Student';
}

function getDisplayName(user) {
  return user.displayName || user.name || 'Student';
}

function updateUserUI(user) {
  var name = getDisplayName(user);
  var initials = getInitials(name);
  var role = getRoleLabel(user.role);
  var firstName = name.split(/\s+/)[0];

  var sidebarAvatar = document.querySelector('.sidebar .avatar-circle');
  var sidebarName = document.querySelector('.sidebar .user-info h4');
  var sidebarRole = document.querySelector('.sidebar .user-info span');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarRole) sidebarRole.textContent = role;

  document.querySelectorAll('.profile-circle-small').forEach(function (el) {
    el.textContent = initials;
  });

  var welcomeEl = document.getElementById('welcome-msg');
  if (welcomeEl) {
    welcomeEl.textContent = 'Welcome back, ' + firstName + '!';
  }
}

async function refreshUserProfile() {
  var user = {};
  try {
    user = JSON.parse(localStorage.getItem('user') || '{}');
  } catch (_) {}

  if (user.name) updateUserUI(user);

  try {
    var S = window.NibrasServices;
    if (S?.authService?.getMe) {
      var meData = await S.authService.getMe();
      var freshUser =
        meData &&
        (meData.user ||
          (meData.data && meData.data.user) ||
          meData.data ||
          meData);
      if (freshUser && (freshUser.name || freshUser.displayName || freshUser.email)) {
        if (!freshUser.name && freshUser.displayName) {
          freshUser.name = freshUser.displayName;
        }
        localStorage.setItem('user', JSON.stringify(freshUser));
        updateUserUI(freshUser);
        user = freshUser;
      }
    }
  } catch (_) {}

  return user;
}

async function resolveUserName() {
  var user = {};
  try {
    user = JSON.parse(localStorage.getItem('user') || '{}');
  } catch (_) {}
  var displayName = getDisplayName(user);
  if (displayName && displayName !== 'Student') return displayName.split(/\s+/)[0];

  try {
    var cachedUser = JSON.parse(localStorage.getItem('nibras_user') || 'null');
    if (cachedUser?.user?.displayName) {
      return cachedUser.user.displayName.split(/\s+/)[0];
    }
    if (cachedUser?.user?.name) {
      return cachedUser.user.name.split(/\s+/)[0];
    }
  } catch (_) {}

  try {
    var requestJson = createTrackingRequestJson();
    var sessionData = await requestJson('/v1/web/session', { method: 'GET' });
    if (sessionData?.user?.displayName || sessionData?.user?.name) {
      localStorage.setItem('nibras_user', JSON.stringify(sessionData));
      var sessionName =
        sessionData.user.displayName || sessionData.user.name || '';
      if (sessionName) return sessionName.split(/\s+/)[0];
    }
  } catch (err) {
    console.warn('[DASHBOARD.JS] Could not fetch tracking session:', err.message);
  }

  return 'Student';
}

function normalizeCourseId(course) {
  return course?.id || course?.courseId || '';
}

function isCourseIdEnrolled(courses, courseId) {
  if (!courseId) return true;
  return (courses || []).some(function (course) {
    return normalizeCourseId(course) === courseId;
  });
}

function clearStaleSelectedCourseId(courses) {
  if (!selectedCourseId) return false;
  if (isCourseIdEnrolled(courses, selectedCourseId)) return false;
  selectedCourseId = '';
  localStorage.removeItem('selectedCourseId');
  var selector = document.getElementById('course-switcher');
  if (selector) selector.value = '';
  return true;
}

function buildHomeDashboardPath() {
  return '/v1/tracking/dashboard/home?mode=student';
}

async function fetchStudentHomeDashboard(requestJson) {
  return withTimeout(
    requestJson(buildHomeDashboardPath(), { method: 'GET' }),
    DROPDOWN_TIMEOUT_MS,
    'Home dashboard request timed out',
  );
}

function buildTrackingDashboardPath(courseId) {
  var params = new URLSearchParams({ includeDeadlines: '1' });
  if (courseId) params.set('courseId', courseId);
  return '/v1/tracking/dashboard/student?' + params.toString();
}

async function fetchTrackingDashboard(requestJson, courseId) {
  return withTimeout(
    requestJson(buildTrackingDashboardPath(courseId), { method: 'GET' }),
    DROPDOWN_TIMEOUT_MS,
    'Tracking dashboard request timed out',
  );
}

function normalizeTrackingPayload(payload) {
  if (window.NibrasProjectsApi?.normalizeDashboardPayload) {
    return window.NibrasProjectsApi.normalizeDashboardPayload(payload);
  }
  return {
    projects: Array.isArray(payload?.projects) ? payload.projects : [],
    statusCounters: { approved: 0, in_review: 0, complete: 0 },
    pageError: '',
  };
}

function formatDueLabel(dueAt) {
  if (!dueAt) return 'TBD';
  try {
    return new Date(dueAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (_) {
    return 'TBD';
  }
}

function filterStudentByCourse(student, courseId) {
  if (!student || !courseId) return student;
  var snapshots = (student.courseSnapshots || []).filter(function (s) {
    return s.courseId === courseId;
  });
  var attentionItems = (student.attentionItems || []).filter(function (item) {
    return item.courseId === courseId;
  });
  var upcomingDeadlines = (student.upcomingDeadlines || []).filter(function (d) {
    return d.courseId === courseId;
  });
  var courses = (student.courses || []).filter(function (c) {
    return (c.id || c.courseId) === courseId;
  });

  var approved = 0;
  var underReview = 0;
  var open = 0;
  var totalMilestones = 0;
  var activeProjects = 0;
  snapshots.forEach(function (snap) {
    approved += snap.approved || 0;
    underReview += snap.underReview || 0;
    open += snap.open || 0;
    totalMilestones += (snap.approved || 0) + (snap.underReview || 0) + (snap.open || 0);
    activeProjects += (snap.projects || []).length;
  });
  var completion =
    snapshots.length === 1
      ? snapshots[0].completion || 0
      : snapshots.length > 0
        ? Math.round(
            snapshots.reduce(function (sum, s) {
              return sum + (s.completion || 0);
            }, 0) / snapshots.length,
          )
        : 0;

  return Object.assign({}, student, {
    courses: courses,
    selectedCourseId: courseId,
    courseSnapshots: snapshots,
    attentionItems: attentionItems,
    upcomingDeadlines: upcomingDeadlines,
    overallStats: {
      coursesEnrolled: courses.length,
      overallCompletionPercent: completion,
      milestonesApproved: approved,
      milestonesTotal: totalMilestones,
      activeProjectCount: activeProjects,
    },
  });
}

function mapMilestoneStatus(status) {
  var statusLabel = status || 'pending';
  var statusColor = '#6b7280';
  var completedPercent = 0;

  switch (statusLabel) {
    case 'approved':
    case 'complete':
    case 'graded':
      statusLabel = 'Complete';
      statusColor = '#10b981';
      completedPercent = 100;
      break;
    case 'in_review':
    case 'needs_review':
    case 'submitted':
      statusLabel = 'In Review';
      statusColor = '#2563eb';
      completedPercent = 50;
      break;
    case 'needs_changes':
    case 'changes_requested':
      statusLabel = 'Needs Changes';
      statusColor = '#f97316';
      completedPercent = 25;
      break;
    default:
      statusLabel = statusLabel.replace(/_/g, ' ');
      statusLabel =
        statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
      break;
  }

  return {
    statusLabel: statusLabel,
    statusColor: statusColor,
    completedPercent: completedPercent,
  };
}

function mapHomeDashboardToViewModel(homePayload, courseId, userName) {
  var student = homePayload?.student;
  if (!student) {
    throw new Error('Student dashboard data unavailable.');
  }

  if (courseId) {
    student = filterStudentByCourse(student, courseId);
  }

  var stats = student.overallStats || {};
  var statsArray = [
    {
      label: 'Courses Enrolled',
      value: stats.coursesEnrolled ?? (student.courses || []).length,
      icon: 'fa-solid fa-book-bookmark',
      color: 'pink',
    },
    {
      label: 'Milestones Completed',
      value: stats.milestonesApproved ?? 0,
      icon: 'fa-solid fa-bullseye',
      color: 'orange',
    },
    {
      label: 'Total Milestones',
      value: stats.milestonesTotal ?? 0,
      icon: 'fa-solid fa-heart',
      color: 'green',
    },
    {
      label: 'Overall Progress',
      value: (stats.overallCompletionPercent ?? 0) + '%',
      icon: 'fa-solid fa-chart-line',
      color: 'blue',
    },
    {
      label: 'Active Projects',
      value: stats.activeProjectCount ?? 0,
      icon: 'fa-solid fa-diagram-project',
      color: 'purple',
    },
  ];

  var progress = (student.courseSnapshots || [])
    .slice()
    .sort(function (a, b) {
      return (b.completion || 0) - (a.completion || 0);
    })
    .slice(0, 4)
    .map(function (snap) {
      return {
        subject: snap.courseTitle || 'Course',
        percent: Math.max(0, Math.min(100, snap.completion || 0)),
      };
    });

  var allMilestones = [];
  (student.courseSnapshots || []).forEach(function (snap) {
    (snap.nextMilestones || []).forEach(function (ms) {
      allMilestones.push(ms);
    });
  });
  var milestones = allMilestones.slice(0, 3).map(function (ms) {
    var mapped = mapMilestoneStatus(ms.status);
    return {
      title: ms.title || 'Milestone',
      completed: mapped.completedPercent,
      status: ms.statusLabel || mapped.statusLabel,
      color: mapped.statusColor,
      due: formatDueLabel(ms.dueAt),
    };
  });

  var deadlines = (student.upcomingDeadlines || []).slice(0, 5).map(function (item) {
    return {
      title: item.title || 'Milestone',
      code: item.courseTitle || '',
      date: formatDueLabel(item.dueAt),
      statusLabel: item.statusLabel || '',
      href: resolveDashboardHref(item.href),
    };
  });

  return {
    user: userName,
    stats: statsArray,
    milestones: milestones,
    progress: progress,
    deadlines: deadlines,
    achievements: [],
    attentionItems: student.attentionItems || [],
    blockers: student.blockers || [],
    submissionHealth: student.submissionHealth || null,
    courses: student.courses || [],
    pageError: '',
  };
}

function mapTrackingFallbackToViewModel(normalized, rawPayload, userName) {
  var trackingProjects = normalized?.projects || [];
  var totalMilestones = 0;
  var approvedMilestones = 0;
  trackingProjects.forEach(function (project) {
    var pstats = project.stats || {};
    totalMilestones += pstats.total || 0;
    approvedMilestones += pstats.approved || 0;
  });

  var allMilestones = [];
  trackingProjects.forEach(function (project) {
    (project.milestones || []).forEach(function (milestone) {
      allMilestones.push(milestone);
    });
  });
  var milestones = allMilestones.slice(0, 3).map(function (milestone) {
    var mapped = mapMilestoneStatus(milestone.status);
    return {
      title: milestone.title || 'Milestone',
      completed: mapped.completedPercent,
      status: mapped.statusLabel,
      color: mapped.statusColor,
      due: milestone.dueLabel || 'TBD',
    };
  });

  var deadlines = [];
  var rawDeadlines = Array.isArray(rawPayload?.courseDeadlines)
    ? rawPayload.courseDeadlines
    : [];
  deadlines = rawDeadlines.slice(0, 5).map(function (item) {
    return {
      title: item.title || 'Milestone',
      code: item.courseTitle || '',
      date: formatDueLabel(item.dueAt),
      statusLabel: '',
      href: '',
    };
  });

  return {
    user: userName,
    stats: [
      {
        label: 'Courses Enrolled',
        value: trackingProjects.length,
        icon: 'fa-solid fa-book-bookmark',
        color: 'pink',
      },
      {
        label: 'Milestones Completed',
        value: approvedMilestones,
        icon: 'fa-solid fa-bullseye',
        color: 'orange',
      },
      {
        label: 'Total Milestones',
        value: totalMilestones,
        icon: 'fa-solid fa-heart',
        color: 'green',
      },
      {
        label: 'Overall Progress',
        value: '0%',
        icon: 'fa-solid fa-chart-line',
        color: 'blue',
      },
      {
        label: 'Active Projects',
        value: trackingProjects.length,
        icon: 'fa-solid fa-diagram-project',
        color: 'purple',
      },
    ],
    milestones: milestones,
    progress: [],
    deadlines: deadlines,
    achievements: [],
    attentionItems: [],
    blockers: [],
    submissionHealth: null,
    courses: [],
    pageError: normalized?.pageError || '',
  };
}

function populateCourseSwitcher(courses, activeCourseId) {
  var selector = document.getElementById('course-switcher');
  if (!selector) return;

  selector.innerHTML = '<option value="">All Courses</option>';
  (courses || []).forEach(function (course) {
    var option = document.createElement('option');
    option.value = course.id || course.courseId || '';
    option.textContent =
      course.title || course.name || course.courseTitle || 'Untitled Course';
    selector.appendChild(option);
  });

  if (activeCourseId && isCourseIdEnrolled(courses, activeCourseId)) {
    selector.value = activeCourseId;
  } else if (
    selectedCourseId &&
    isCourseIdEnrolled(courses, selectedCourseId)
  ) {
    selector.value = selectedCourseId;
  } else {
    selector.value = '';
    if (selectedCourseId) {
      selectedCourseId = '';
      localStorage.removeItem('selectedCourseId');
    }
  }
}

function bindCourseSwitcher(onChange) {
  if (courseSwitcherBound) return;
  var selector = document.getElementById('course-switcher');
  if (!selector) return;
  courseSwitcherBound = true;
  selector.addEventListener('change', function () {
    selectedCourseId = selector.value || '';
    if (selectedCourseId) {
      localStorage.setItem('selectedCourseId', selectedCourseId);
    } else {
      localStorage.removeItem('selectedCourseId');
    }
    onChange();
  });
}

function renderDashboardError(message, showRetry) {
  var el = document.getElementById('dashboard-error');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML =
    '<div class="dashboard-error-inner">' +
    '<i class="fa-solid fa-circle-exclamation"></i>' +
    '<span>' +
    escapeHtml(message) +
    '</span>' +
    (showRetry
      ? '<button type="button" class="dashboard-error-retry" id="dashboard-retry-btn">Retry</button>'
      : '') +
    '</div>';
}

function renderBlockers(blockers) {
  var container = document.getElementById('blockers-container');
  if (!container) return;
  container.innerHTML = '';

  (blockers || []).forEach(function (blocker) {
    var href = resolveDashboardHref(blocker.cta?.href);
    container.innerHTML +=
      '<div class="blocker-card" data-kind="' +
      escapeHtml(blocker.kind) +
      '">' +
      '<div class="blocker-content">' +
      '<strong>' +
      escapeHtml(blocker.title) +
      '</strong>' +
      '<p>' +
      escapeHtml(blocker.body) +
      '</p>' +
      '</div>' +
      '<a class="btn-solid-small blocker-cta" href="' +
      escapeHtml(href) +
      '">' +
      escapeHtml(blocker.cta?.label || 'Open') +
      '</a>' +
      '</div>';
  });
}

function attentionKindMeta(kind) {
  switch (kind) {
    case 'failed_submission':
      return { icon: 'fa-solid fa-circle-xmark', className: 'attention-failed' };
    case 'changes_requested':
      return { icon: 'fa-solid fa-pen-to-square', className: 'attention-changes' };
    case 'needs_review':
      return { icon: 'fa-solid fa-clock', className: 'attention-review' };
    case 'due_soon':
      return { icon: 'fa-solid fa-calendar-day', className: 'attention-due' };
    case 'recent_feedback':
      return { icon: 'fa-solid fa-comment-dots', className: 'attention-feedback' };
    default:
      return { icon: 'fa-solid fa-bell', className: 'attention-default' };
  }
}

function renderAttentionItems(items) {
  var section = document.getElementById('attention-section');
  var container = document.getElementById('attention-container');
  if (!container) return;

  var list = items || [];
  if (section) section.hidden = list.length === 0;
  container.innerHTML = '';

  list.forEach(function (item) {
    var meta = attentionKindMeta(item.kind);
    var href = resolveDashboardHref(item.cta?.href);
    var subtitle = item.reason || item.statusText || '';
    container.innerHTML +=
      '<div class="attention-item ' +
      meta.className +
      '">' +
      '<div class="attention-icon"><i class="' +
      meta.icon +
      '"></i></div>' +
      '<div class="attention-body">' +
      '<div class="attention-title">' +
      escapeHtml(item.projectTitle) +
      '</div>' +
      '<div class="attention-sub">' +
      escapeHtml(item.courseTitle) +
      (item.milestoneTitle ? ' &middot; ' + escapeHtml(item.milestoneTitle) : '') +
      '</div>' +
      '<div class="attention-reason">' +
      escapeHtml(subtitle) +
      '</div>' +
      '</div>' +
      '<a class="btn-solid-small attention-cta" href="' +
      escapeHtml(href) +
      '">' +
      escapeHtml(item.cta?.label || 'View') +
      '</a>' +
      '</div>';
  });
}

function renderSubmissionHealth(health) {
  var section = document.getElementById('submission-health-section');
  var container = document.getElementById('submission-health-container');
  if (!container) return;

  if (!health) {
    if (section) section.hidden = true;
    container.innerHTML = '';
    return;
  }

  if (section) section.hidden = false;
  var pills = [
    {
      label: 'Failed Checks',
      value: health.failedChecks ?? 0,
      color: 'pink',
    },
    {
      label: 'Needs Review',
      value: health.needsReview ?? 0,
      color: 'orange',
    },
    {
      label: 'Awaiting Review',
      value: health.awaitingReview ?? 0,
      color: 'blue',
    },
    {
      label: 'Recently Passed',
      value: health.recentlyPassed ?? 0,
      color: 'green',
    },
  ];

  container.innerHTML = pills
    .map(function (pill) {
      return (
        '<div class="health-pill health-' +
        pill.color +
        '">' +
        '<span class="health-value">' +
        pill.value +
        '</span>' +
        '<span class="health-label">' +
        escapeHtml(pill.label) +
        '</span>' +
        '</div>'
      );
    })
    .join('');
}

function initUserSession() {
  var session = window.NibrasShared?.session;
  if (session && typeof session.updateUserInfoDisplay === 'function') {
    session.updateUserInfoDisplay();
  }
}

function initDashboard() {
  initUserSession();

  var navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.forEach(function (n) {
        n.classList.remove('active');
      });
      link.classList.add('active');
    });
  });

  var savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  var themeBtn = document.getElementById('themeBtn');
  var themeIcon = themeBtn?.querySelector('i');
  var appLogo = document.getElementById('app-logo');

  if (themeBtn) {
    themeBtn.classList.remove('rotating');
    void themeBtn.offsetWidth;
  }

  var currentTheme =
    document.documentElement.getAttribute('data-theme') || 'light';
  if (currentTheme === 'dark') {
    if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
    if (appLogo) appLogo.src = '/Assets/images/logo-dark.png';
  } else {
    if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
    if (appLogo) appLogo.src = '/Assets/images/logo-light.png';
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      themeBtn.classList.add('rotating');
      setTimeout(function () {
        themeBtn.classList.remove('rotating');
      }, 500);

      var html = document.documentElement;
      var current = html.getAttribute('data-theme');
      var newTheme = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);

      if (newTheme === 'dark') {
        if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
        if (appLogo) appLogo.src = '/Assets/images/logo-dark.png';
      } else {
        if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
        if (appLogo) appLogo.src = '/Assets/images/logo-light.png';
      }
    });
  }
}

function animateCounter(el, duration) {
  if (!el) return;
  var text = el.textContent.trim();
  var num = Number(text.replace(/[^\d.-]/g, ''));
  if (isNaN(num) || text.indexOf('%') !== -1) return;
  if (num === 0) return;

  var isInt = Number.isInteger(num);
  var startTime = performance.now();
  var original = text;

  function update(now) {
    var elapsed = now - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = num * eased;
    el.textContent = isInt
      ? Math.round(current).toString()
      : current.toFixed(1);
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = original;
    }
  }

  el.textContent = isInt ? '0' : '0.0';
  requestAnimationFrame(update);
}

function renderDashboard(data) {
  if (!data || !data.stats) {
    console.warn('[DASHBOARD.JS] renderDashboard called with invalid data:', data);
    return;
  }

  renderDashboardError(data.pageError || '', false);
  renderBlockers(data.blockers);
  renderAttentionItems(data.attentionItems);
  renderSubmissionHealth(data.submissionHealth);

  var welcomeMsg = document.getElementById('welcome-msg');
  if (welcomeMsg && data.user) {
    welcomeMsg.textContent = 'Welcome back, ' + data.user + '!';
  }

  var statsContainer = document.getElementById('stats-container');
  if (!statsContainer) return;
  statsContainer.innerHTML = '';

  data.stats.forEach(function (stat) {
    var bgVar = 'var(--stat-icon-bg-pink)';
    var textVar = 'var(--stat-icon-text-pink)';
    if (stat.color === 'orange') {
      bgVar = 'var(--stat-icon-bg-orange)';
      textVar = 'var(--stat-icon-text-orange)';
    }
    if (stat.color === 'green') {
      bgVar = 'var(--stat-icon-bg-green)';
      textVar = 'var(--stat-icon-text-green)';
    }
    if (stat.color === 'blue') {
      bgVar = 'var(--stat-icon-bg-blue)';
      textVar = 'var(--stat-icon-text-blue)';
    }
    if (stat.color === 'purple') {
      bgVar = 'var(--stat-icon-bg-purple)';
      textVar = 'var(--stat-icon-text-purple)';
    }

    statsContainer.innerHTML +=
      '<div class="stat-card" data-color="' +
      stat.color +
      '">' +
      '<div class="stat-info">' +
      '<span>' +
      escapeHtml(stat.label) +
      '</span>' +
      '<h2>' +
      escapeHtml(String(stat.value)) +
      '</h2>' +
      '</div>' +
      '<div class="stat-icon" style="background-color:' +
      bgVar +
      ';color:' +
      textVar +
      '">' +
      '<i class="' +
      stat.icon +
      '"></i>' +
      '</div>' +
      '</div>';
  });

  statsContainer.querySelectorAll('.stat-info h2').forEach(function (el, i) {
    setTimeout(function () {
      animateCounter(el, 700);
    }, i * 100);
  });

  renderLists(data);
  renderMilestones(data.milestones);
}

function renderLists(data) {
  var progContainer = document.getElementById('progress-container');
  if (progContainer) {
    progContainer.innerHTML = '';
    if (!data.progress || data.progress.length === 0) {
      progContainer.innerHTML =
        '<p class="empty-state">No courses enrolled yet</p>';
    } else {
      data.progress.forEach(function (prog) {
        progContainer.innerHTML +=
          '<div class="prog-item"><div class="prog-header"><span>' +
          escapeHtml(prog.subject) +
          '</span><span class="prog-percent">' +
          prog.percent +
          '%</span></div><div class="prog-track"><div class="prog-fill" style="width:' +
          prog.percent +
          '%"></div></div></div>';
      });
    }
  }

  var deadContainer = document.getElementById('deadlines-container');
  if (deadContainer) {
    deadContainer.innerHTML = '';
    if (!data.deadlines || data.deadlines.length === 0) {
      deadContainer.innerHTML =
        '<p class="empty-state">No upcoming deadlines</p>';
    } else {
      data.deadlines.forEach(function (item) {
        var inner =
          '<div class="deadline-details"><h4>' +
          escapeHtml(item.title) +
          '</h4><span class="course-code">' +
          escapeHtml(item.code) +
          '</span>';
        if (item.statusLabel) {
          inner +=
            '<span class="deadline-status">' +
            escapeHtml(item.statusLabel) +
            '</span>';
        }
        inner += '<span class="due-date">' + escapeHtml(item.date) + '</span></div>';
        if (item.href) {
          deadContainer.innerHTML +=
            '<a class="deadline-item deadline-link" href="' +
            escapeHtml(item.href) +
            '"><i class="fa-solid fa-circle bullet"></i>' +
            inner +
            '</a>';
        } else {
          deadContainer.innerHTML +=
            '<div class="deadline-item"><i class="fa-solid fa-circle bullet"></i>' +
            inner +
            '</div>';
        }
      });
    }
  }

  var achieveContainer = document.getElementById('achievements-container');
  if (achieveContainer && data.achievements && data.achievements.length > 0) {
    achieveContainer.innerHTML = '';
    data.achievements.forEach(function (item) {
      achieveContainer.innerHTML +=
        '<div class="achieve-item"><i class="' +
        item.icon +
        ' achieve-icon"></i><span class="achieve-text">' +
        escapeHtml(item.title) +
        '</span></div>';
    });
  }
}

function renderMilestones(milestones) {
  var container = document.getElementById('milestone-container');
  if (!container) return;
  container.innerHTML = '';

  if (!milestones || milestones.length === 0) {
    container.innerHTML = '<p class="empty-state">No active milestones</p>';
    return;
  }

  milestones.forEach(function (ms) {
    var statusClass = 'status-track';
    if (ms.status === 'Complete' || ms.completed >= 100) {
      statusClass = 'status-completed';
    } else if (ms.status === 'Needs Changes') {
      statusClass = 'status-atrisk';
    }

    container.innerHTML +=
      '<div class="milestone-item">' +
      '<div class="ms-header">' +
      '<span class="ms-title">' +
      escapeHtml(ms.title) +
      '</span>' +
      '<span class="ms-percentage">' +
      ms.completed +
      '%</span>' +
      '</div>' +
      '<div class="ms-bar-track">' +
      '<div class="ms-bar-fill" style="width:' +
      ms.completed +
      '%;background-color:' +
      ms.color +
      '"></div>' +
      '</div>' +
      '<div class="ms-meta">' +
      '<span class="ms-status ' +
      statusClass +
      '">' +
      escapeHtml(ms.status) +
      '</span>' +
      '<span>Due: ' +
      escapeHtml(ms.due) +
      '</span>' +
      '</div>' +
      '</div>';
  });
}

function renderEmptyDashboard(userName, errorMessage) {
  renderDashboard({
    user: userName,
    stats: [
      {
        label: 'Courses Enrolled',
        value: 0,
        icon: 'fa-solid fa-book-bookmark',
        color: 'pink',
      },
      {
        label: 'Milestones Completed',
        value: 0,
        icon: 'fa-solid fa-bullseye',
        color: 'orange',
      },
      {
        label: 'Total Milestones',
        value: 0,
        icon: 'fa-solid fa-heart',
        color: 'green',
      },
      {
        label: 'Overall Progress',
        value: '0%',
        icon: 'fa-solid fa-chart-line',
        color: 'blue',
      },
      {
        label: 'Active Projects',
        value: 0,
        icon: 'fa-solid fa-diagram-project',
        color: 'purple',
      },
    ],
    milestones: [],
    progress: [],
    deadlines: [],
    achievements: [],
    attentionItems: [],
    blockers: [],
    submissionHealth: null,
    pageError: errorMessage || '',
  });
  renderDashboardError(errorMessage, true);
}

async function loadDashboardData() {
  var requestJson = createTrackingRequestJson();
  var userName = (await resolveUserName()).split(/\s+/)[0];
  var courseId = selectedCourseId || '';

  try {
    var homePayload = await fetchStudentHomeDashboard(requestJson);
    if (
      homePayload?.student?.courses &&
      clearStaleSelectedCourseId(homePayload.student.courses)
    ) {
      courseId = '';
    }
    var viewModel = mapHomeDashboardToViewModel(
      homePayload,
      courseId,
      userName,
    );
    populateCourseSwitcher(viewModel.courses, courseId);
    dashboardData = viewModel;
    renderDashboard(dashboardData);
    renderDashboardError('', false);
  } catch (homeError) {
    console.warn(
      '[DASHBOARD.JS] Home dashboard unavailable, falling back to student tracking:',
      homeError.message,
    );

    try {
      var rawTracking = await fetchTrackingDashboard(requestJson, courseId);
      var normalized = normalizeTrackingPayload(rawTracking);
      var fallbackModel = mapTrackingFallbackToViewModel(
        normalized,
        rawTracking,
        userName,
      );
      dashboardData = fallbackModel;
      renderDashboard(dashboardData);
      if (fallbackModel.pageError) {
        renderDashboardError(fallbackModel.pageError, false);
      } else {
        renderDashboardError(
          'Showing limited project data. Some dashboard features may be unavailable.',
          false,
        );
      }
    } catch (trackingError) {
      console.warn('[DASHBOARD.JS] Dashboard load failed:', trackingError.message);
      renderEmptyDashboard(
        userName,
        trackingError.message || 'Could not load dashboard data.',
      );
    }
  }
}

async function loadGamificationAchievements() {
  try {
    if (!window.NibrasServices?.gamificationService) return;

    var dashboard = await window.NibrasServices.gamificationService
      .getAchievementsDashboard({ sync: true })
      .catch(function () {
        return null;
      });

    var allBadges = Array.isArray(dashboard?.badges) ? dashboard.badges : [];
    var earnedBadges = allBadges.filter(function (b) {
      return !!b.earnedAt;
    });
    var repTotal = dashboard?.reputation?.total || 0;

    var repBadge = document.querySelector('.rep-badge');
    if (repBadge && repTotal > 0) repBadge.textContent = repTotal;

    var achieveContainer = document.getElementById('achievements-container');
    if (!achieveContainer) return;
    achieveContainer.innerHTML = '';

    if (earnedBadges.length > 0) {
      earnedBadges.slice(0, 5).forEach(function (b) {
        var icon = b.iconUrl || 'fa-solid fa-medal';
        var iconHtml =
          icon.startsWith('http') ||
          icon.startsWith('/') ||
          icon.startsWith('data:')
            ? '<img src="' + escapeHtml(icon) + '" alt="" class="achieve-icon" style="width:1rem;height:1rem;">'
            : '<i class="' + escapeHtml(icon) + ' achieve-icon"></i>';
        achieveContainer.innerHTML +=
          '<div class="achieve-item">' +
          iconHtml +
          '<span class="achieve-text">' +
          escapeHtml(b.name || 'Badge') +
          '</span></div>';
      });
    } else {
      achieveContainer.innerHTML =
        '<div class="achieve-item empty-achievements"><span class="achieve-text">' +
        allBadges.length +
        ' achievements available &bull; ' +
        repTotal +
        ' reputation</span></div>';
    }
  } catch (_) {}
}

function bindDashboardRetry() {
  document.addEventListener('click', function (event) {
    if (event.target && event.target.id === 'dashboard-retry-btn') {
      loadDashboardData();
    }
  });
}

const runDashboardInit = function () {
  bindDashboardRetry();
  bindCourseSwitcher(function () {
    loadDashboardData();
  });
  initDashboard();

  refreshUserProfile()
    .then(function () {
      return loadDashboardData();
    })
    .catch(function () {
      return loadDashboardData();
    });

  loadGamificationAchievements();
};

if (typeof window.bootstrapReactPage === 'function') {
  window.bootstrapReactPage(runDashboardInit);
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runDashboardInit);
} else {
  runDashboardInit();
}
