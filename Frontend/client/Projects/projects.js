var projectsPage = {
  courseId: '',
  trackingCourseId: '',
  activeProjectKey: '',
  courseByLocalId: {},
  activeCourse: null,
};

var DROPDOWN_TIMEOUT_MS = 15000;

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

function getUserLevel() {
  try {
    var u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.selectedLevel || 'Beginner';
  } catch (_) {
    return 'Beginner';
  }
}

function getLocalCoursesForLevel(level) {
  var nc = window.NibrasCourses;
  if (!nc) return [];
  if (level === 'Intermediate' && nc.getIntermediateCoursesList) {
    return nc.getIntermediateCoursesList();
  }
  if (level === 'Advanced' && nc.getAdvancedCoursesList) {
    return nc.getAdvancedCoursesList();
  }
  if (level === 'Expert' && nc.getExpertCoursesList) {
    return nc.getExpertCoursesList();
  }
  return nc.getCoursesList ? nc.getCoursesList() : [];
}

function updateSidebarUser() {
  try {
    var u = JSON.parse(localStorage.getItem('user'));
    if (!u || !u.name) return;
    var nameEl = document.querySelector('.user-info h4');
    if (nameEl) nameEl.textContent = u.name;
    var roleEl = document.querySelector('.user-info span');
    if (roleEl) {
      var r = u.role;
      roleEl.textContent =
        typeof r === 'object' && r
          ? r.name || r.title || 'student'
          : r || 'student';
    }
    var initials = u.name
      .split(' ')
      .map(function (n) {
        return n.charAt(0);
      })
      .join('')
      .toUpperCase()
      .slice(0, 2);
    var avatarEl = document.querySelector('.avatar-circle');
    if (avatarEl) avatarEl.textContent = initials || 'U';
    var smallAvatar = document.querySelector('.profile-circle-small');
    if (smallAvatar) smallAvatar.textContent = initials || 'U';
  } catch (_) {}
}

window.NibrasReact.run(function () {
  updateSidebarUser();
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    var htmlEl = document.documentElement;
    var themeIcon = themeToggle.querySelector('i');
    var saved = localStorage.getItem('theme') || 'light';
    htmlEl.setAttribute('data-theme', saved);
    updateUI(themeIcon, saved);
    themeToggle.addEventListener('click', function () {
      var cur = htmlEl.getAttribute('data-theme');
      var next = cur === 'light' ? 'dark' : 'light';
      htmlEl.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateUI(themeIcon, next);
    });
  }
  function updateUI(el, theme) {
    if (!el) return;
    el.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    var logo = document.querySelector('.sidebar-logo');
    if (logo) {
      logo.src =
        theme === 'dark'
          ? '../Assets/images/logo-dark.png'
          : '../Assets/images/logo-light.png';
    }
  }

  var sel = document.getElementById('course-select');
  if (sel) {
    sel.addEventListener('change', function () {
      if (this.value) void loadCourse(this.value);
      else showSelectCourseEmpty();
    });
  }

  void loadDropdown();
});

function setMsg(msg, type) {
  var el = document.getElementById('projects-api-notice');
  if (!el) return;
  el.hidden = !msg;
  el.style.display = msg ? '' : 'none';
  el.textContent = msg || '';
  if (type === 'error') el.style.color = '#ef4444';
  else if (type === 'loading') el.style.color = '';
  else el.style.color = '';
}

function hideCoursePanels() {
  var hero = document.getElementById('projects-hero');
  var progress = document.getElementById('progress-container');
  var grid = document.getElementById('project-grid');
  var empty = document.getElementById('projects-empty');
  var loading = document.getElementById('projects-loading');
  var tabs = document.getElementById('projects-context-tabs');
  if (hero) hero.style.display = 'none';
  if (progress) progress.style.display = 'none';
  if (grid) grid.style.display = 'none';
  if (empty) empty.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (tabs) tabs.style.display = 'none';
}

function showSelectCourseEmpty() {
  hideCoursePanels();
  var empty = document.getElementById('projects-empty');
  if (empty) empty.style.display = '';
  setMsg('', '');
}

function showLoadingCourse() {
  hideCoursePanels();
  var loading = document.getElementById('projects-loading');
  if (loading) loading.style.display = '';
}

function showCourseContent() {
  hideCoursePanels();
  var hero = document.getElementById('projects-hero');
  var progress = document.getElementById('progress-container');
  var grid = document.getElementById('project-grid');
  var tabs = document.getElementById('projects-context-tabs');
  if (hero) hero.style.display = '';
  if (progress) progress.style.display = '';
  if (grid) grid.style.display = '';
  if (tabs) tabs.style.display = '';
}

function showEmpty() {
  showSelectCourseEmpty();
}

function showContent() {
  showCourseContent();
}

function normalizeMatchToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function indexCourseEntry(entry) {
  if (!entry) return;
  if (entry.localCourseId) {
    projectsPage.courseByLocalId[entry.localCourseId] = entry;
  }
  if (entry.trackingCourseId) {
    projectsPage.courseByLocalId[entry.trackingCourseId] = entry;
  }
}

function findCourseEntry(courseId) {
  if (!courseId) return null;
  if (projectsPage.courseByLocalId[courseId]) {
    return projectsPage.courseByLocalId[courseId];
  }
  return (
    Object.values(projectsPage.courseByLocalId).find(function (entry) {
      return (
        entry.localCourseId === courseId ||
        entry.trackingCourseId === courseId
      );
    }) || null
  );
}

async function listEnrolledTrackingCourses() {
  var trackingService = window.NibrasServices?.trackingCourseService;
  if (!trackingService || typeof trackingService.list !== 'function') {
    return [];
  }
  try {
    var remote = await trackingService.list();
    return Array.isArray(remote)
      ? remote
      : Array.isArray(remote?.data)
        ? remote.data
        : Array.isArray(remote?.items)
          ? remote.items
          : [];
  } catch (_) {
    return [];
  }
}

function matchEnrolledTrackingCourse(catalogCourse, enrolledCourses) {
  if (!catalogCourse || !Array.isArray(enrolledCourses)) return null;
  var codeToken = normalizeMatchToken(catalogCourse.code);
  var titleToken = normalizeMatchToken(catalogCourse.title);

  for (var i = 0; i < enrolledCourses.length; i += 1) {
    var enrolled = enrolledCourses[i];
    var enrolledId = enrolled?.id || enrolled?._id || '';
    if (!enrolledId) continue;
    var enrolledCode = normalizeMatchToken(
      enrolled.courseCode || enrolled.code,
    );
    var enrolledTitle = normalizeMatchToken(enrolled.title);
    if (
      (codeToken && enrolledCode && codeToken === enrolledCode) ||
      (titleToken && enrolledTitle && titleToken === enrolledTitle)
    ) {
      return enrolled;
    }
  }
  return null;
}

async function resolveTrackingCourseIdForLoad(localCourseId, entry, catalogCourse) {
  var selectedOption = document.getElementById('course-select')?.selectedOptions?.[0];
  var optionTrackingId = selectedOption?.getAttribute('data-tracking-id') || '';

  if (
    optionTrackingId &&
    (!localCourseId || optionTrackingId !== localCourseId)
  ) {
    return optionTrackingId;
  }

  if (
    entry?.trackingCourseId &&
    (!entry.localCourseId || entry.trackingCourseId !== entry.localCourseId)
  ) {
    return entry.trackingCourseId;
  }

  var nc = window.NibrasCourses;
  if (localCourseId && typeof nc?.resolveCourseIdentifiersAsync === 'function') {
    try {
      var ids = await nc.resolveCourseIdentifiersAsync(localCourseId, {
        loadRemote: true,
        warnOnMissing: false,
      });
      if (ids?.trackingCourseId) return ids.trackingCourseId;
    } catch (_) {}
  } else if (localCourseId && typeof nc?.resolveCourseIdentifiers === 'function') {
    var syncIds = nc.resolveCourseIdentifiers(localCourseId, {
      warnOnMissing: false,
    });
    if (syncIds?.trackingCourseId) return syncIds.trackingCourseId;
  }

  var enrolledCourses = await listEnrolledTrackingCourses();
  var matched = matchEnrolledTrackingCourse(
    catalogCourse || entry,
    enrolledCourses,
  );
  if (matched) return matched.id || matched._id || '';

  return entry?.trackingCourseId || '';
}

async function collectDropdownCourses() {
  var nc = window.NibrasCourses;
  if (!nc) return [];

  var userLevel = getUserLevel();
  var localCourses = getLocalCoursesForLevel(userLevel).filter(function (c) {
    return c && c.type !== 'practice_lab';
  });
  var enrolledCourses = await listEnrolledTrackingCourses();

  var mapped = [];
  var resolveAsync = nc.resolveCourseIdentifiersAsync;

  if (typeof resolveAsync === 'function') {
    await Promise.all(
      localCourses.map(async function (course) {
        try {
          var ids = await resolveAsync(course.id, { loadRemote: true });
          var trackingId = ids?.trackingCourseId || '';
          if (!trackingId) {
            var matched = matchEnrolledTrackingCourse(course, enrolledCourses);
            trackingId = matched?.id || matched?._id || '';
          }
          if (!trackingId) return;
          mapped.push({
            localCourseId: course.id,
            trackingCourseId: trackingId,
            title: course.title || course.code || course.id,
            code: course.code || '',
            level: course.level || userLevel,
            category: course.category || '',
            description: course.description || '',
          });
        } catch (_) {}
      }),
    );
  } else {
    localCourses.forEach(function (course) {
      var ids =
        typeof nc.resolveCourseIdentifiers === 'function'
          ? nc.resolveCourseIdentifiers(course.id)
          : null;
      var trackingId = ids?.trackingCourseId || '';
      if (!trackingId) {
        var matched = matchEnrolledTrackingCourse(course, enrolledCourses);
        trackingId = matched?.id || matched?._id || '';
      }
      if (!trackingId) return;
      mapped.push({
        localCourseId: course.id,
        trackingCourseId: trackingId,
        title: course.title || course.code || course.id,
        code: course.code || '',
        level: course.level || userLevel,
        category: course.category || '',
        description: course.description || '',
      });
    });
  }

  enrolledCourses.forEach(function (course) {
    var remoteId = course.id || course._id || '';
    if (!remoteId) return;
    if (
      mapped.some(function (entry) {
        return entry.trackingCourseId === remoteId;
      })
    ) {
      return;
    }
    mapped.push({
      localCourseId: '',
      trackingCourseId: remoteId,
      title: course.title || course.courseCode || 'Course',
      code: course.courseCode || course.code || '',
      level: course.termLabel || userLevel,
      category: '',
      description: course.description || '',
    });
  });

  mapped.sort(function (a, b) {
    return String(a.title).localeCompare(String(b.title));
  });

  return mapped;
}

function esc(str) {
  if (!str && str !== 0) return '';
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function resolveStoredCourseTarget(courses) {
  var storedId = localStorage.getItem('selectedCourseId') || '';
  if (!storedId) return '';

  if (findCourseEntry(storedId)) return storedId;

  var byTracking = courses.find(function (c) {
    return c.trackingCourseId === storedId;
  });
  if (byTracking) {
    return byTracking.localCourseId || byTracking.trackingCourseId;
  }

  return '';
}

async function loadDropdown() {
  var sel = document.getElementById('course-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading courses...</option>';
  var urlId = new URLSearchParams(window.location.search).get('courseId') || '';

  if (!window.NibrasCourses) {
    sel.innerHTML = '<option value="">Catalog unavailable</option>';
    setMsg('Course catalog failed to load. Hard-refresh the page.', 'error');
    showEmpty();
    return;
  }

  try {
    var courses = await withTimeout(
      collectDropdownCourses(),
      DROPDOWN_TIMEOUT_MS,
      'Course list timed out',
    );

    projectsPage.courseByLocalId = {};
    courses.forEach(function (entry) {
      indexCourseEntry(entry);
    });

    if (!courses.length) {
      sel.innerHTML = '<option value="">No mapped courses</option>';
      setMsg(
        'No courses with backend mapping found. Enroll in a course from the catalog to view projects.',
        'error',
      );
      showEmpty();
      return;
    }

    sel.innerHTML = '<option value="">Select a course...</option>';
    courses.forEach(function (entry) {
      var value = entry.localCourseId || entry.trackingCourseId;
      var label = entry.title + (entry.code ? ' (' + entry.code + ')' : '');
      sel.innerHTML +=
        '<option value="' +
        esc(value) +
        '" data-tracking-id="' +
        esc(entry.trackingCourseId) +
        '">' +
        esc(label) +
        '</option>';
    });

    var countEl = document.getElementById('available-count');
    if (countEl) countEl.textContent = courses.length + ' available';

    var target = '';
    if (urlId && projectsPage.courseByLocalId[urlId]) {
      target = urlId;
    } else if (urlId) {
      var byTracking = courses.find(function (c) {
        return c.trackingCourseId === urlId;
      });
      if (byTracking) target = byTracking.localCourseId || byTracking.trackingCourseId;
    }
    if (!target && courses.length === 1) {
      target = courses[0].localCourseId || courses[0].trackingCourseId;
    }
    if (!target) {
      target = resolveStoredCourseTarget(courses);
    }

    if (target) {
      sel.value = target;
      await loadCourse(target);
    } else {
      showSelectCourseEmpty();
    }
  } catch (error) {
    sel.innerHTML = '<option value="">Failed to load</option>';
    setMsg(error?.message || 'Failed to load courses.', 'error');
    showSelectCourseEmpty();
  }
}

function updateHeroFromCourse(entry, catalogCourse) {
  var title = catalogCourse?.title || entry?.title || 'Course';
  var code = catalogCourse?.code || entry?.code || '';
  var level = catalogCourse?.level || entry?.level || '';
  document.getElementById('hero-course-code').textContent =
    (code ? code + ' · ' : '') + (level || 'Course');
  document.getElementById('hero-title').textContent = title;
  document.getElementById('hero-subtitle').textContent =
    'Track milestones, submit work, and monitor progress.';
  document.getElementById('progress-title').textContent =
    (code ? code + ' — ' : '') + title;
  document.getElementById('progress-level').textContent = level || 'Active';
  document.getElementById('standing-label').textContent = level || 'Year 1';
}

async function loadCourse(courseId) {
  if (!courseId) {
    showSelectCourseEmpty();
    return;
  }

  if (!window.NibrasProjectsCore) {
    showLoadingCourse();
    setMsg('Projects core module failed to load.', 'error');
    return;
  }

  showLoadingCourse();
  setMsg('Loading projects...', 'loading');

  projectsPage.courseId = courseId;
  var entry = findCourseEntry(courseId);
  var nc = window.NibrasCourses;
  var localCourseId = entry?.localCourseId || courseId;
  var catalogCourse =
    typeof nc?.getCourseById === 'function'
      ? nc.getCourseById(localCourseId)
      : null;

  try {
    var trackingCourseId = await resolveTrackingCourseIdForLoad(
      localCourseId,
      entry,
      catalogCourse,
    );

    if (!trackingCourseId) {
      var enrollHref = catalogCourse?.id
        ? '../Courses/Course Description/courseContent.html?courseId=' +
          encodeURIComponent(catalogCourse.id)
        : '../Courses/courses.html';
      showCourseContent();
      var notice = document.getElementById('projects-api-notice');
      if (notice) {
        notice.hidden = false;
        notice.style.display = '';
        notice.style.color = '#ef4444';
        notice.innerHTML =
          'Projects require enrollment. <a href="' +
          esc(enrollHref) +
          '">Go to course</a>';
      }
      return;
    }

    projectsPage.trackingCourseId = trackingCourseId;
    projectsPage.activeCourse = catalogCourse || entry || null;
    localStorage.setItem('selectedCourseId', localCourseId || courseId);

    updateHeroFromCourse(entry, catalogCourse || entry);
    showCourseContent();

    await window.NibrasProjectsCore.init(trackingCourseId, {
      localCourseId: localCourseId,
    });

    setMsg('', '');

    var activeProject = window.NibrasProjectsCore.state.ui.projects[0];
    var activeProjectId = activeProject?.apiProjectId || '';
    if (window.NibrasProjectsCore.renderActivityFeed) {
      window.NibrasProjectsCore.renderActivityFeed(activeProjectId);
    }
  } catch (error) {
    showCourseContent();
    setMsg(error?.message || 'Failed to load projects.', 'error');
  }
}

function openCliHelpModal() {
  var modal = document.getElementById('cliHelpModal');
  if (!modal) return;
  modal.style.display = 'block';
  if (typeof window.loadCliGuide === 'function') window.loadCliGuide();
}

function closeCliHelpModal() {
  var modal = document.getElementById('cliHelpModal');
  if (modal) modal.style.display = 'none';
}

function copyCliModalText(text) {
  navigator.clipboard.writeText(text || '').then(function () {
    var result = document.getElementById('cli-verify-result');
    if (result) {
      result.textContent = 'Copied!';
      setTimeout(function () {
        result.textContent = '';
      }, 1500);
    }
  });
}

window.openCliHelpModal = openCliHelpModal;
window.closeCliHelpModal = closeCliHelpModal;
window.copyCliModalText = copyCliModalText;
