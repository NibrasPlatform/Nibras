/* Shared modules: projects-cache.js, projects-utils.js (loaded before this file) */
var projectsPageState = window.NibrasProjectsUtils.projectsPageState;
var projectsCache = window.NibrasProjectsCache;
var milestoneStatusUiMap = window.NibrasProjectsUtils.milestoneStatusUiMap;
var IDs = window.NibrasProjectsUtils.IDs;
var escapeHtml = window.NibrasProjectsUtils.escapeHtml;
var formatDateTime = window.NibrasProjectsUtils.formatDateTime;
var formatRequestError = window.NibrasProjectsUtils.formatRequestError;

function renderCacheIndicator(key) {
  var age = projectsCache.getAge(key);
  if (age < 0) return '';
  var label = projectsCache.getAgeLabel(key);
  var isFresh = age < projectsCache.DEFAULT_TTL;
  return (
    '<span class="cache-indicator ' +
    (isFresh ? 'cache-fresh' : 'cache-stale') +
    '" title="' +
    escapeHtml(label) +
    '">' +
    '<i class="fa-solid ' +
    (isFresh ? 'fa-database' : 'fa-triangle-exclamation') +
    '"></i> ' +
    label +
    '</span>'
  );
}

function setApiNoticeWithCache(message, type, cacheKey) {
  setApiNotice(message, type);
  var el = document.getElementById('projects-api-notice');
  if (!el) return;
  var existingBadge = el.querySelector('.cache-indicator');
  if (existingBadge) existingBadge.remove();

  if (cacheKey) {
    var indicator = renderCacheIndicator(cacheKey);
    if (indicator) {
      var wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'space-between';
      wrapper.style.gap = '8px';
      wrapper.style.flexWrap = 'wrap';

      var msgSpan = document.createElement('span');
      msgSpan.textContent = message || '';
      wrapper.appendChild(msgSpan);

      var badgeEl = document.createElement('span');
      badgeEl.innerHTML = indicator;
      wrapper.appendChild(badgeEl);

      var refreshBtn = document.createElement('button');
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Refresh';
      refreshBtn.className = 'btn btn-outline btn-sm';
      refreshBtn.style.fontSize = '0.7rem';
      refreshBtn.style.padding = '3px 10px';
      refreshBtn.onclick = function () {
        projectsCache.invalidate(cacheKey);
        void loadProjectsOverview();
      };
      wrapper.appendChild(refreshBtn);

      el.innerHTML = '';
      el.appendChild(wrapper);
      el.style.display = '';
    }
  }
}

const projectsApiClient =
  window.NibrasProjectsApi?.createClient?.({
    baseUrl:
      window.NibrasShared?.resolveServiceUrl?.('tracking') ||
      window.NIBRAS_TRACKING_API_URL,
    getAuthToken: () =>
      window.NibrasShared?.auth?.getToken?.() ||
      localStorage.getItem('token') ||
      null,
  }) || null;

var projectsLoadToken = 0;

function resetProjectsUiState() {
  projectsPageState.ui.projects = [];
  projectsPageState.activeProjectId = '';
  var tabsRoot = document.getElementById('projectListTabs');
  if (tabsRoot) tabsRoot.innerHTML = '';
  var detailsHost = document.getElementById('projectDetailsHost');
  if (detailsHost) detailsHost.innerHTML = '';
}

function trackingProjects() {
  return window.NibrasServices?.trackingProjectService || null;
}

async function resolveEnrolledTrackingCourseId(course) {
  const trackingService = window.NibrasServices?.trackingCourseService;
  if (!trackingService || typeof trackingService.list !== 'function') {
    return '';
  }
  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const codeToken = normalize(course?.code);
  const titleToken = normalize(course?.title);
  try {
    const payload = await trackingService.list();
    const enrolled = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    const match = enrolled.find((entry) => {
      const enrolledCode = normalize(entry?.courseCode || entry?.code);
      const enrolledTitle = normalize(entry?.title);
      return (
        (codeToken && enrolledCode && codeToken === enrolledCode) ||
        (titleToken && enrolledTitle && titleToken === enrolledTitle)
      );
    });
    return match?.id || match?._id || '';
  } catch {
    return '';
  }
}

async function initProjectsCore(trackingCourseId, options) {
  options = options || {};
  var loadToken = ++projectsLoadToken;

  projectsPageState.trackingCourseId = String(trackingCourseId || '');
  projectsPageState.courseId = String(options.localCourseId || '');
  resetProjectsUiState();

  initCourseProjectsCliHelp();

  setGroupWorkspaceStatus(
    'ok',
    'Group Workspace shows your team roster and repository when assigned.',
  );

  var submitForm = document.getElementById('milestoneSubmitForm');
  if (submitForm && !submitForm._nibrasBound) {
    submitForm.addEventListener('submit', handleMilestoneSubmit);
    submitForm._nibrasBound = true;
  }

  return loadProjectsOverview(Boolean(options.forceRefresh), loadToken);
}

async function loadProjectsOverview(forceRefresh, loadToken) {
  var token = loadToken != null ? loadToken : projectsLoadToken;

  if (!projectsApiClient) {
    if (token !== projectsLoadToken) return;
    setApiNotice('Projects API is not configured.', 'error');
    return;
  }

  var cacheKey = 'projects_overview_' + projectsPageState.trackingCourseId;

  if (!forceRefresh) {
    var cached = projectsCache.get(cacheKey);
    if (cached) {
      if (token !== projectsLoadToken) return;
      mergeOverviewToState(cached);
      renderProjects();
      updateHeaderStats();
      setApiNoticeWithCache('Projects loaded from cache.', '', cacheKey);
      setGroupWorkspaceStatus('ok', 'Showing cached project data.');
      return;
    }
  }

  setApiNotice('Loading projects...', 'loading');
  try {
    const response = await projectsApiClient.getProjectsOverview({
      courseId: projectsPageState.trackingCourseId,
    });
    if (token !== projectsLoadToken) return;
    const payload = response?.data || {};
    projectsCache.set(cacheKey, payload);
    mergeOverviewToState(payload);
    renderProjects();
    updateHeaderStats();
    setApiNoticeWithCache(
      payload.pageError || '',
      payload.pageError ? 'empty' : '',
      cacheKey,
    );
    setGroupWorkspaceStatus('ok', 'Tracking API connection is active.');
  } catch (error) {
    if (token !== projectsLoadToken) return;
    var cached = projectsCache.get(cacheKey);
    if (cached) {
      mergeOverviewToState(cached);
      renderProjects();
      updateHeaderStats();
      setApiNoticeWithCache(
        'Using cached data. Live update failed.',
        'empty',
        cacheKey,
      );
      setGroupWorkspaceStatus('error', 'Showing stale cached data.');
      return;
    }
    const message = formatRequestError(error, 'Unable to load projects.');
    setApiNotice(message, 'error');
    renderProjects();
    setGroupWorkspaceStatus('error', 'API status: ' + message);
  }
}

function mergeOverviewToState(payload) {
  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  projectsPageState.ui.projects = projects.map((project, index) => {
    const projectId = IDs.toApi(project.projectId || project.id || index + 1);
    const projectKey = String(project.projectKey || '');

    return {
      domId: IDs.toDom(projectId),
      apiProjectId: projectId,
      projectKey,
      card: {
        title: String(project.title || `Project ${index + 1}`),
        meta: String(project.cardMeta || ''),
      },
      details: {
        title: String(project.title || `Project ${index + 1}`),
        description: String(project.description || ''),
      },
      teamMembers: Array.isArray(project.teamMembers || project.members)
        ? project.teamMembers || project.members
        : [],
      githubRepo: String(project.githubRepo || project.githubUrl || ''),
      commits: Array.isArray(project.commits) ? project.commits : [],
      contribution: Array.isArray(project.contribution)
        ? project.contribution
        : [],
      grade: project.grade != null ? project.grade : null,
      milestones: Array.isArray(project.milestones) ? project.milestones : [],
      stats: {
        completion: Number(project.stats?.completion || 0),
        approved: Number(project.stats?.approved || 0),
        in_review: Number(project.stats?.in_review || 0),
        complete: Number(project.stats?.complete || 0),
        total: Number(project.stats?.total || 0),
      },
      cli: {
        setupCommand: `nibras setup --project ${projectKey || 'your-course/project-key'}`,
      },
    };
  });

  if (!projectsPageState.ui.projects.length) {
    projectsPageState.activeProjectId = '';
  } else if (
    !projectsPageState.activeProjectId ||
    !projectsPageState.ui.projects.some(
      (entry) => entry.domId === projectsPageState.activeProjectId,
    )
  ) {
    projectsPageState.activeProjectId = projectsPageState.ui.projects[0].domId;
  }

  const payloadCounters = payload?.statusCounters || {};
  const computedCounters = projectsPageState.ui.projects.reduce(
    (acc, project) => {
      acc.approved += project.stats.approved;
      acc.in_review += project.stats.in_review;
      acc.complete += project.stats.complete;
      return acc;
    },
    { approved: 0, in_review: 0, complete: 0 },
  );

  projectsPageState.ui.statusCounters = {
    approved: Number(payloadCounters.approved ?? computedCounters.approved),
    in_review: Number(payloadCounters.in_review ?? computedCounters.in_review),
    complete: Number(payloadCounters.complete ?? computedCounters.complete),
  };
}

function renderProjects() {
  const tabsRoot = document.getElementById('projectListTabs');
  if (!tabsRoot) return;

  const projects = projectsPageState.ui.projects;
  if (!projects.length) {
    tabsRoot.innerHTML =
      '<div class="project-card-tab active"><h3>No Projects Found</h3></div>';
    const host = document.getElementById('projectDetailsHost');
    if (host)
      host.innerHTML =
        '<div class="card"><p>No project details available yet.</p></div>';
    return;
  }

  tabsRoot.innerHTML = projects
    .map(
      (project) => `
        <button type="button" class="project-card-tab ${project.domId === projectsPageState.activeProjectId ? 'active' : ''}"
                data-dom-id="${escapeHtml(project.domId)}">
            <h3>${escapeHtml(project.card.title)}</h3>
            <p>${escapeHtml(project.card.meta || 'Project')}</p>
        </button>
    `,
    )
    .join('');

  tabsRoot.querySelectorAll('.project-card-tab').forEach((button) => {
    button.onclick = () => {
      projectsPageState.activeProjectId = button.dataset.domId || '';
      renderProjects();
    };
  });

  renderProjectDetails();
}

function renderProjectDetails() {
  const host = document.getElementById('projectDetailsHost');
  if (!host) return;

  const project = projectsPageState.ui.projects.find(
    (entry) => entry.domId === projectsPageState.activeProjectId,
  );
  if (!project) {
    host.innerHTML =
      '<div class="card"><p>Select a project to view details.</p></div>';
    return;
  }

  // Fetch additional details for this project
  loadProjectExtraDetails(project);

  host.innerHTML = `
        <div class="project-details active">
            <div class="two-col-grid">
                <div class="left-col">
                    <div class="card">
                        <h3>${escapeHtml(project.details.title)}</h3>
                        <p class="section-desc">${escapeHtml(project.details.description || 'No description provided yet.')}</p>
                    </div>
                    <div class="card">
                        <div class="card-header"><h4>Milestones</h4></div>
                        <div class="timeline">
                            ${project.milestones.map((milestone) => createMilestoneRow(project, milestone)).join('')}
                        </div>
                    </div>
                </div>
                <div class="right-col">
                    ${renderTeamPanel(project)}
                    <div class="card progress-widget">
                        <h4>Overall Progress: ${Math.max(0, Math.min(100, Math.round(project.stats.completion || 0)))}%</h4>
                        <div class="progress-bar-container">
                            <div class="progress-fill" style="width: ${Math.max(0, Math.min(100, Math.round(project.stats.completion || 0)))}%"></div>
                        </div>
                        <div class="stat-row"><span>Approved</span><span class="stat-val green">${project.stats.approved}</span></div>
                        <div class="stat-row"><span>In Review</span><span class="stat-val">${project.stats.in_review}</span></div>
                        <div class="stat-row"><span>Total Milestones</span><span class="stat-val">${project.stats.total}</span></div>
                    </div>
                    ${renderGitHubPanel(project)}
                    ${renderGradePanel(project)}
                    ${createCliQuickstartCard(project)}
                </div>
            </div>
        </div>
    `;
}

function loadProjectExtraDetails(project) {
  if (!project) return;
  var apiId = project.apiProjectId || project._id || project.id;
  if (!apiId) return;
  if (project._extraLoaded) return;

  var svc = trackingProjects();
  if (!svc) return;

  Promise.all([
    svc.getById(apiId).catch(function () {
      return null;
    }),
    svc.listTeams(apiId).catch(function () {
      return [];
    }),
    svc.getCommits(apiId).catch(function () {
      return null;
    }),
  ])
    .then(function (results) {
      var detail = results[0]?.data || results[0];
      var teams = Array.isArray(results[1]) ? results[1] : results[1]?.data || [];
      var commitsPayload = results[2]?.data || results[2];
      project._extraLoaded = true;

      if (detail && typeof detail === 'object') {
        if (detail.githubRepo || detail.githubUrl) {
          project.githubRepo = detail.githubRepo || detail.githubUrl;
        }
        if (Array.isArray(detail.milestones)) {
          detail.milestones.forEach(function (ms, idx) {
            if (project.milestones[idx]) {
              if (ms.score != null) project.milestones[idx].score = ms.score;
              if (ms.weight != null) project.milestones[idx].weight = ms.weight;
              if (ms.status) project.milestones[idx].status = ms.status;
            }
          });
        }
      }

      if (teams.length) {
        var team = teams[0];
        project.teamName = team.name || project.teamName;
        project.teamMembers = (team.members || []).map(function (m) {
          return {
            name: m.displayName || m.userId,
            role: m.roleLabel || m.roleKey || 'member',
            userId: m.userId,
          };
        });
      }

      if (commitsPayload && Array.isArray(commitsPayload.commits)) {
        project.commits = commitsPayload.commits;
      }

      renderProjectDetails();
      renderGroupWorkspace();
    })
    .catch(function () {});
}

function renderTeamPanel(project) {
  var members = project.teamMembers || [];
  if (!members || !members.length) return '';

  var memberHtml = members
    .map(function (m) {
      var name = m.name || m.username || m.email || 'Member';
      var initials = name
        .split(/\s+/)
        .map(function (s) {
          return s[0];
        })
        .join('')
        .toUpperCase()
        .slice(0, 2);
      var role = m.role || '';
      var contribText = '';
      if (m.contributionPercent != null)
        contribText = 'Contrib: ' + m.contributionPercent + '%';
      else if (m.commits != null) contribText = m.commits + ' commits';
      return (
        '<div class="team-member-row">' +
        '<div class="team-member-avatar">' +
        escapeHtml(initials) +
        '</div>' +
        '<div class="team-member-info">' +
        '<span class="team-member-name">' +
        escapeHtml(name) +
        '</span>' +
        (role
          ? '<span class="team-member-role">' + escapeHtml(role) + '</span>'
          : '') +
        (contribText
          ? '<span class="team-member-contrib">' +
            escapeHtml(contribText) +
            '</span>'
          : '') +
        '</div></div>'
      );
    })
    .join('');

  var apiId = project.apiProjectId || project._id || project.id;
  var manageBtn =
    '<button class="btn btn-outline btn-sm" onclick="openTeamManagementModal(\'' +
    escapeHtml(apiId) +
    '\')" style="margin-top:10px;width:100%;justify-content:center;"><i class="fa-solid fa-gear"></i> Manage Team</button>';

  return (
    '<div class="card team-panel">' +
    '<div class="card-header"><div class="card-title">Team Members</div></div>' +
    memberHtml +
    manageBtn +
    '</div>'
  );
}

function renderGitHubPanel(project) {
  var repo = project.githubRepo || '';
  var commits = project.commits || [];

  var repoHtml = repo
    ? '<div class="github-repo-link"><i class="fa-brands fa-github"></i><a href="' +
      escapeHtml(repo) +
      '" target="_blank">' +
      escapeHtml(repo) +
      '</a></div>'
    : '<button class="github-connect-btn" onclick="openGithubConnectModal(\'' +
      escapeHtml(project.apiProjectId || project._id || project.id) +
      '\')"><i class="fa-brands fa-github"></i> Connect GitHub Repository</button>';

  var statusHtml = '';
  if (commits.length) {
    var latestCommit = commits[0];
    var commitCount = commits.length;
    statusHtml =
      '<div class="github-status-row"><span class="label">Commits</span><span class="value">' +
      commitCount +
      '</span></div>' +
      '<div class="github-status-row"><span class="label">Latest</span><span class="value">' +
      escapeHtml(latestCommit.message || '') +
      '</span></div>';
  } else if (repo) {
    statusHtml =
      '<div class="github-status-row"><span class="label">Status</span><span class="value">Connected</span></div>';
  }

  var hasData = repo || commits.length;
  var viewCommitsBtn = hasData
    ? '<button class="btn btn-outline btn-sm" onclick="openCommitHistoryModal(\'' +
      escapeHtml(project.apiProjectId || project._id || project.id) +
      '\')" style="margin-top:10px;width:100%;justify-content:center;"><i class="fa-solid fa-code-commit"></i> View Commit History</button>'
    : '';
  var analyticsBtn = hasData
    ? '<button class="btn btn-outline btn-sm" onclick="openContributionAnalyticsModal(\'' +
      escapeHtml(project.apiProjectId || project._id || project.id) +
      '\')" style="margin-top:6px;width:100%;justify-content:center;"><i class="fa-solid fa-chart-pie"></i> Contribution Analytics</button>'
    : '';

  if (!hasData) return '';

  return (
    '<div class="card github-panel">' +
    '<div class="card-header"><div class="card-title"><i class="fa-brands fa-github"></i> GitHub</div></div>' +
    repoHtml +
    statusHtml +
    viewCommitsBtn +
    analyticsBtn +
    '</div>'
  );
}

function renderGradePanel(project) {
  var milestones = project.milestones || [];
  var hasScores = milestones.some(function (m) {
    return (
      m.score != null || m.status === 'approved' || m.status === 'complete'
    );
  });
  if (!hasScores) return '';

  var totalWeighted = 0;
  var totalMaxWeighted = 0;
  var msRows = milestones
    .map(function (ms) {
      var weight = ms.weight || 0;
      var score = ms.score || 0;
      var maxScore = ms.maxScore || 100;
      var weighted = (score * weight) / 100;
      var maxWeighted = (maxScore * weight) / 100;
      totalWeighted += weighted;
      totalMaxWeighted += maxWeighted;
      return (
        '<div class="grade-milestone-row">' +
        '<span class="grade-milestone-name">' +
        escapeHtml(ms.name || ms.title || 'Milestone') +
        '</span>' +
        '<span class="grade-milestone-weight">(' +
        weight +
        '%)</span>' +
        '<span class="grade-milestone-score">' +
        weighted.toFixed(1) +
        ' / ' +
        maxWeighted.toFixed(1) +
        '</span>' +
        '</div>'
      );
    })
    .join('');

  var overallPct =
    totalMaxWeighted > 0
      ? Math.round((totalWeighted / totalMaxWeighted) * 100)
      : 0;
  var overall =
    project.grade != null
      ? project.grade
      : totalWeighted.toFixed(1) + ' / ' + totalMaxWeighted.toFixed(1);

  return (
    '<div class="card grade-panel">' +
    '<div class="card-header"><div class="card-title">Grading Breakdown</div></div>' +
    msRows +
    '<div class="grade-total-row">' +
    '<span class="grade-total-label">Overall</span>' +
    '<span class="grade-total-value">' +
    overall +
    ' (' +
    overallPct +
    '%)</span>' +
    '</div></div>'
  );
}

function createMilestoneRow(project, milestone) {
  const status = String(milestone?.status || 'pending');
  const config = milestoneStatusUiMap[status] || milestoneStatusUiMap.default;
  const milestoneId = String(milestone?.apiMilestoneId || milestone?.id || '');
  const canSubmit = config.canSubmit && milestoneId;
  const canFeedback = config.canFeedback && milestoneId;

  let actions = '';
  if (canFeedback) {
    actions += `<button class="btn btn-outline btn-sm" type="button" onclick="openFeedbackModal('${escapeHtml(project.apiProjectId)}','${escapeHtml(milestoneId)}')">View Feedback</button> `;
  }
  if (canSubmit) {
    actions += `<button class="btn btn-primary btn-sm" type="button" onclick="openSubmissionModal('${escapeHtml(project.apiProjectId)}','${escapeHtml(milestoneId)}')">Submit Milestone</button>`;
  }
  if (!actions)
    actions = '<span class="card-subtitle">No action needed.</span>';

  return `
        <div class="milestone">
            <div class="m-icon ${config.iconContainerClass}"><i class="${config.iconClass}"></i></div>
            <div class="m-content">
                <div class="m-header">
                    <h4>${escapeHtml(String(milestone?.title || 'Milestone'))}</h4>
                    <span class="status-badge ${config.badgeClass}">${config.label}</span>
                </div>
                <div class="m-meta"><i class="fa-regular fa-calendar"></i> ${escapeHtml(String(milestone?.dueLabel || milestone?.dueDateLabel || 'TBD'))}</div>
                <div class="cli-actions">${actions}</div>
            </div>
        </div>
    `;
}

function createCliQuickstartCard(project) {
  return `
        <div class="card cli-quickstart">
            <div class="card-header"><h4>CLI Quickstart</h4></div>
            <p class="section-desc">Use the Nibras CLI to setup, test, and submit this project from your terminal.</p>
            <div class="cli-command-box">
                <code class="cli-command">${escapeHtml(project.cli.setupCommand)}</code>
            </div>
            <div class="cli-actions">
                <button class="btn btn-outline btn-sm" type="button" onclick="copyActiveCliSetupCommand()">Copy setup command</button>
                <button class="btn btn-primary btn-sm" type="button" onclick="openCliHelpModal()">Open CLI Guide</button>
            </div>
        </div>
    `;
}

function updateHeaderStats() {
  const counters = projectsPageState.ui.statusCounters;

  const approvedEl = document.querySelector('[data-counter="approved"]');
  const inReview = document.querySelector('[data-counter="in_review"]');
  const complete = document.querySelector('[data-counter="complete"]');
  if (approvedEl) approvedEl.textContent = `Approved: ${counters.approved}`;
  if (inReview) inReview.textContent = `In Review: ${counters.in_review}`;
  if (complete) complete.textContent = `Complete: ${counters.complete}`;

  const projects = projectsPageState.ui.projects;
  const averageCompletion = projects.length
    ? Math.round(
        projects.reduce(
          (sum, project) => sum + (project.stats.completion || 0),
          0,
        ) / projects.length,
      )
    : 0;
  const completionLabel = document.querySelector(
    '.header-stats .stat-line.secondary',
  );
  if (completionLabel)
    completionLabel.textContent = averageCompletion + '% Complete';

  var totalMilestones = projects.reduce(function (sum, p) {
    return sum + (p.stats?.total || 0);
  }, 0);
  var approved = counters.approved || 0;
  var pct =
    totalMilestones > 0 ? Math.round((approved / totalMilestones) * 100) : averageCompletion;

  var heroSections = document.getElementById('stat-sections');
  var heroCompleted = document.getElementById('stat-completed');
  var heroComplete = document.getElementById('stat-complete');
  if (heroSections) heroSections.textContent = String(totalMilestones);
  if (heroCompleted) heroCompleted.textContent = String(approved);
  if (heroComplete) heroComplete.textContent = pct + '%';

  var progressPct = document.getElementById('progress-pct');
  var progressFill = document.getElementById('progress-fill');
  var progressPctLarge = document.getElementById('progress-pct-large');
  if (progressPct) progressPct.textContent = pct + '%';
  if (progressFill) progressFill.style.width = pct + '%';
  if (progressPctLarge) progressPctLarge.textContent = pct + '%';

  var legendApproved = document.getElementById('legend-approved');
  var legendReview = document.getElementById('legend-review');
  var legendOpen = document.getElementById('legend-open');
  if (legendApproved) legendApproved.textContent = String(approved);
  if (legendReview) legendReview.textContent = String(counters.in_review || 0);
  if (legendOpen)
    legendOpen.textContent = String(
      Math.max(0, totalMilestones - approved - (counters.in_review || 0)),
    );
}

function resolveCliBaseUrl() {
  return (
    projectsApiClient?.getCliBaseUrl?.() ||
    window.NibrasCli?.resolveApiBase?.() ||
    '{your-api-url}'
  );
}

function getCliProjectKey() {
  var project = projectsPageState.ui.projects.find(function (e) {
    return e.domId === projectsPageState.activeProjectId;
  });
  return project?.projectKey || project?.details?.projectKey || '';
}

function getCliTrackingCourseId() {
  var currentProject = projectsPageState.ui.projects.find(function (e) {
    return e.domId === projectsPageState.activeProjectId;
  });
  if (currentProject && currentProject.trackingCourseId) {
    return currentProject.trackingCourseId;
  }
  return projectsPageState.trackingCourseId || '';
}

function initCourseProjectsCliHelp() {
  if (!window.NibrasCli?.initHelpModal) return;
  window.NibrasCli.initHelpModal({
    getCliBaseUrl: function () {
      return projectsApiClient?.getCliBaseUrl?.() || null;
    },
    getActiveProjectKey: getCliProjectKey,
    getTrackingCourseId: getCliTrackingCourseId,
  });
}

async function handleMilestoneSubmit(event) {
  event.preventDefault();
  if (!projectsApiClient) return;

  const payload = buildSubmissionPayload(event.currentTarget);
  setSubmissionBusy(true, 'Submitting...');

  try {
    const result = await projectsApiClient.submitMilestone(payload);
    const submissionId = String(result?.data?.submissionId || '');
    if (submissionId) {
      showPulseTracker(submissionId);
    } else {
      setSubmissionMessage('Submitted successfully.', 'success');
      setTimeout(() => closeModal('submissionModal'), 1200);
      await loadProjectsOverview();
    }
  } catch (error) {
    setSubmissionMessage(
      formatRequestError(error, 'Submission failed.'),
      'error',
    );
  } finally {
    setSubmissionBusy(false);
  }
}

function buildSubmissionPayload(form) {
  const data = new FormData(form);
  return {
    courseId: projectsPageState.trackingCourseId,
    projectId: IDs.toApi(data.get('project_id')),
    milestoneId: String(data.get('milestone_id') || ''),
    submissionType: String(data.get('submission_type') || 'github'),
    resourceLink: String(data.get('resource_link') || ''),
    branch: String(data.get('submission_branch') || 'main'),
    commitSha: String(data.get('submission_commit_sha') || ''),
    notes: String(data.get('notes') || ''),
  };
}

function showPulseTracker(submissionId) {
  const formContent = document.getElementById('milestone-form-content');
  const pulseTracker = document.getElementById('modal-pulse-tracker');
  const submitButton = document.getElementById('submit-milestone-btn');
  const closePulseButton = document.getElementById('btn-close-pulse');

  if (formContent) formContent.style.display = 'none';
  if (pulseTracker) pulseTracker.style.display = 'block';
  if (submitButton) submitButton.style.display = 'none';
  if (closePulseButton) closePulseButton.style.display = 'none';

  document.getElementById('pulse-result-details')?.classList.remove('show');
  document.getElementById('btn-retry-submission')?.classList.remove('show');
  projectsPageState.submissionStartTime = Date.now();
  projectsPageState.currentSubmissionId = submissionId;

  updatePulseUI('queued');

  if (projectsPageState.pollingInterval) {
    clearInterval(projectsPageState.pollingInterval);
  }

  projectsPageState.pollingInterval = setInterval(async () => {
    try {
      const statusData =
        await projectsApiClient.getSubmissionStatus(submissionId);
      const status = String(statusData?.status || '');
      updatePulseUI(status);

      if (
        ['completed', 'passed', 'approved', 'failed', 'error'].includes(status)
      ) {
        clearInterval(projectsPageState.pollingInterval);
        projectsPageState.pollingInterval = null;
        if (closePulseButton) closePulseButton.style.display = 'inline-block';
        renderPulseResultDetails(status, statusData);
        if (['failed', 'error'].includes(status)) {
          document
            .getElementById('btn-retry-submission')
            ?.classList.add('show');
        }
        setSubmissionMessage(
          status === 'failed' ? 'Submission failed.' : 'Submission completed.',
          status === 'failed' ? 'error' : 'success',
        );
        await loadProjectsOverview();
      }
    } catch (error) {
      clearInterval(projectsPageState.pollingInterval);
      projectsPageState.pollingInterval = null;
      setSubmissionMessage(
        formatRequestError(error, 'Unable to fetch submission status.'),
        'error',
      );
    }
  }, 3000);
}

function renderPulseResultDetails(status, statusData) {
  const details = document.getElementById('pulse-result-details');
  if (!details) return;
  details.classList.add('show');

  const elapsed = projectsPageState.submissionStartTime
    ? Math.round((Date.now() - projectsPageState.submissionStartTime) / 1000) +
      's'
    : '—';
  document.getElementById('pulse-result-time').textContent = elapsed;

  const isSuccess = ['completed', 'passed', 'approved'].includes(status);
  document.getElementById('pulse-result-status').textContent = isSuccess
    ? 'Completed'
    : 'Failed';
  document.getElementById('pulse-result-status').className =
    'pulse-result-value ' +
    (isSuccess ? 'pulse-result-pass' : 'pulse-result-fail');

  const grade = statusData?.grade ?? statusData?.score ?? '—';
  document.getElementById('pulse-result-grade').textContent =
    grade !== '—' ? String(grade) + '/100' : '—';

  const testsContainer = document.getElementById('pulse-result-tests');
  if (!testsContainer) return;
  testsContainer.innerHTML = '';
  const testResults = statusData?.testResults || statusData?.tests || [];
  if (testResults.length > 0) {
    testResults.forEach(function (t) {
      const passed = t.passed === true || t.status === 'pass';
      const item = document.createElement('div');
      item.className = 'pulse-test-item';
      item.innerHTML =
        '<i class="fa-solid fa-' +
        (passed
          ? 'circle-check" style="color:var(--status-graded-text)'
          : 'circle-xmark" style="color:var(--status-late-text)') +
        '"></i><span>' +
        escapeHtml(t.name || t.testName || 'Test') +
        '</span>';
      testsContainer.appendChild(item);
    });
  }
}

function updatePulseUI(status) {
  const steps = {
    init: 'step-init',
    clone: 'step-clone',
    verify: 'step-verify',
    test: 'step-test',
    grade: 'step-grade',
  };
  Object.values(steps).forEach((id) => {
    const element = document.getElementById(id);
    if (element)
      element.classList.remove('step-active', 'step-done', 'step-failed');
  });

  if (status === 'queued') {
    document.getElementById(steps.init)?.classList.add('step-active');
    return;
  }
  if (status === 'cloning') {
    document.getElementById(steps.init)?.classList.add('step-done');
    document.getElementById(steps.clone)?.classList.add('step-active');
    return;
  }
  if (status === 'verifying') {
    document.getElementById(steps.init)?.classList.add('step-done');
    document.getElementById(steps.clone)?.classList.add('step-done');
    document.getElementById(steps.verify)?.classList.add('step-active');
    return;
  }
  if (status === 'running') {
    document.getElementById(steps.init)?.classList.add('step-done');
    document.getElementById(steps.clone)?.classList.add('step-done');
    document.getElementById(steps.verify)?.classList.add('step-done');
    document.getElementById(steps.test)?.classList.add('step-active');
    return;
  }
  if (['completed', 'passed', 'approved'].includes(status)) {
    Object.values(steps).forEach((id) =>
      document.getElementById(id)?.classList.add('step-done'),
    );
    return;
  }
  if (['failed', 'error'].includes(status)) {
    Object.values(steps).forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('step-done');
        el.classList.remove('step-active');
      }
    });
  }
}

function retrySubmission() {
  const sid = projectsPageState.currentSubmissionId;
  if (!sid) return;
  document.getElementById('btn-retry-submission')?.classList.remove('show');
  document.getElementById('pulse-result-details')?.classList.remove('show');
  showPulseTracker(sid);
}

function resetSubmissionModalUi() {
  const form = document.getElementById('milestoneSubmitForm');
  const formContent = document.getElementById('milestone-form-content');
  const pulseTracker = document.getElementById('modal-pulse-tracker');
  const submitButton = document.getElementById('submit-milestone-btn');
  const closePulseButton = document.getElementById('btn-close-pulse');

  if (form) form.reset();
  if (formContent) formContent.style.display = 'block';
  if (pulseTracker) pulseTracker.style.display = 'none';
  if (submitButton) submitButton.style.display = 'inline-flex';
  if (closePulseButton) closePulseButton.style.display = 'none';
  document.getElementById('pulse-result-details')?.classList.remove('show');
  document.getElementById('btn-retry-submission')?.classList.remove('show');
  setSubmissionMessage('');
  projectsPageState.currentSubmissionId = '';
  projectsPageState.submissionStartTime = 0;
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (modalId === 'submissionModal') {
    if (projectsPageState.pollingInterval) {
      clearInterval(projectsPageState.pollingInterval);
      projectsPageState.pollingInterval = null;
    }
    resetSubmissionModalUi();
  }
}

function setApiNotice(message, type) {
  const element = document.getElementById('projects-api-notice');
  if (!element) return;
  element.hidden = !message;
  element.style.display = message ? '' : 'none';
  element.textContent = message;
  element.style.color = type === 'error' ? 'red' : 'var(--text-secondary)';
}

function setGroupWorkspaceStatus(type, message) {
  const notice = document.getElementById('group-readonly-notice');
  if (!notice) return;
  projectsPageState.groupWorkspaceStatusType = type;
  notice.textContent = message;
  if (type === 'error') {
    notice.style.color = 'red';
  } else if (type === 'ok') {
    notice.style.color = 'var(--status-graded-text)';
  } else {
    notice.style.color = 'var(--text-secondary)';
  }
}

function setSubmissionBusy(busy, message) {
  const button = document.getElementById('submit-milestone-btn');
  if (button) button.disabled = Boolean(busy);
  if (message) setSubmissionMessage(message, busy ? '' : 'success');
}

function setSubmissionMessage(message, type) {
  const element = document.getElementById('submission-status-message');
  if (!element) return;
  element.textContent = message || '';
  if (type === 'error') {
    element.style.color = 'red';
  } else if (type === 'success') {
    element.style.color = 'green';
  } else {
    element.style.color = 'inherit';
  }
}

function updateCourseMeta(course) {
  const sidebarTitle = document.querySelector('.course-meta h4');
  if (sidebarTitle)
    sidebarTitle.textContent = `${course.code}: ${course.title}`;

  const pageSubtitle = document.querySelector('.header-titles p');
  if (pageSubtitle)
    pageSubtitle.textContent = `${course.code}: ${course.title}`;
}

function setupNavigationLinks(courseId) {
  const navLinks = [
    { key: 'courseContent', path: '../Course Description/courseContent.html' },
    { key: 'videos', path: '../Videos/videos.html' },
    { key: 'assignments', path: '../Assignments/Assignments.html' },
    { key: 'projects', path: './Projects.html' },
    { key: 'grades', path: '../Grades/grades.html' },
  ];

  navLinks.forEach(({ key, path }) => {
    const element = document.querySelector(`[data-nav-link="${key}"]`);
    if (element)
      element.setAttribute(
        'href',
        window.NibrasCourses.withCourseId(path, courseId),
      );
  });

  const backButton =
    document.getElementById('return-to-courses-link') ||
    document.querySelector('.sidebar-footer a.back-btn');
  if (backButton) {
    var coursesUrl = window.NibrasCourseSidebar?.getCoursesListUrl?.() ||
      '/Courses/courses.html';
    backButton.setAttribute('href', coursesUrl);
  }
}

function setupThemeToggle() {
  // Ensure theme is set on page load
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  const button = document.getElementById('themeBtn');
  if (!button) return;

  const appLogo = document.getElementById('app-logo');

  function updateThemeButton() {
    const isDark =
      document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = button.querySelector('i');
    const text = button.querySelector('span');
    if (icon) icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    if (text) text.textContent = isDark ? 'Light Mode' : 'Dark Mode';

    // Update logo
    if (appLogo) {
      appLogo.src = isDark
        ? '/Assets/images/logo-dark.png'
        : '/Assets/images/logo-light.png';
    }
  }

  updateThemeButton();
  button.onclick = () => {
    const theme =
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light'
        : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeButton();
  };
}

function resolveProjectsCourseContext(course) {
  if (typeof window.NibrasCourses?.resolveCourseIdentifiers === 'function') {
    const identifiers = window.NibrasCourses.resolveCourseIdentifiers(
      course.id,
    );
    if (identifiers) {
      return {
        localCourseId: identifiers.localCourseId,
        trackingCourseIdForApi: identifiers.trackingCourseIdForApi,
        hasTrackingMapping: identifiers.hasTrackingMapping,
      };
    }
  }
  return {
    localCourseId: course.id,
    trackingCourseIdForApi: course.trackingCourseIdForApi || course.trackingCourseId || course.id,
    hasTrackingMapping: Boolean(course.trackingCourseId),
  };
}

window.switchView = (viewId, event) => {
  projectsPageState.activeViewId = viewId;

  document.querySelectorAll('.context-tab').forEach((tab) => {
    tab.classList.remove('active');
    tab.setAttribute('aria-pressed', 'false');
  });

  if (event?.target) {
    event.target.classList.add('active');
    event.target.setAttribute('aria-pressed', 'true');
  }

  document.querySelectorAll('.view-section').forEach((section) => {
    section.classList.remove('active');
  });

  document.getElementById(viewId)?.classList.add('active');
  if (viewId === 'my-projects-view') void loadProjectsOverview();
  if (viewId === 'group-view') renderGroupWorkspace();
};

function renderGroupWorkspace() {
  var host = document.getElementById('group-workspace-body');
  if (!host) return;

  var project = projectsPageState.ui.projects.find(function (e) {
    return e.domId === projectsPageState.activeProjectId;
  });
  if (!project) {
    host.innerHTML =
      '<p class="section-desc">Select a project to view your team workspace.</p>';
    return;
  }

  var members = project.teamMembers || [];
  if (!members.length) {
    host.innerHTML =
      '<p class="section-desc">No team assigned yet for <strong>' +
      escapeHtml(project.details.title) +
      '</strong>. Apply via the catalog or wait for team formation.</p>';
    return;
  }

  host.innerHTML =
    '<table class="data-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead><tbody>' +
    members
      .map(function (m) {
        var name = m.name || m.username || m.email || 'Member';
        return (
          '<tr><td>' +
          escapeHtml(name) +
          '</td><td>' +
          escapeHtml(m.role || 'Member') +
          '</td><td><span class="status-badge badge-graded">Active</span></td></tr>'
        );
      })
      .join('') +
    '</tbody></table>';
}

window.selectProject = (domId, event) => {
  projectsPageState.activeProjectId = String(domId || '');
  if (event?.target) {
    document.querySelectorAll('.project-card-tab').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    event.target.classList.add('active');
    event.target.setAttribute('aria-pressed', 'true');
  }
  renderProjects();
};

window.openSubmissionModal = (projectId, milestoneId) => {
  document.getElementById('modal_project_id').value = String(projectId || '');
  document.getElementById('modal_milestone_id').value = String(
    milestoneId || '',
  );

  const project = projectsPageState.ui.projects.find(
    (entry) => entry.apiProjectId === IDs.toApi(projectId),
  );
  const projectKeyInput = document.getElementById('modal_project_key');
  if (projectKeyInput && project?.projectKey)
    projectKeyInput.value = project.projectKey;

  resetSubmissionModalUi();

  const modal = document.getElementById('submissionModal');
  if (modal) {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }
};

window.openFeedbackModal = async (projectId, milestoneId) => {
  const modal = document.getElementById('feedbackModal');
  if (modal) {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  const statusBadge = document.getElementById('feedback-status-badge');
  const comment = document.getElementById('feedback-comment');
  const checklist = document.getElementById('feedback-checklist');
  const historyBody = document.getElementById('history-body');
  if (statusBadge) statusBadge.textContent = 'Loading...';
  if (comment) comment.textContent = 'Loading feedback...';
  if (checklist)
    checklist.innerHTML =
      '<li><i class="fa-regular fa-square"></i> Loading...</li>';
  if (historyBody)
    historyBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

  if (!projectsApiClient) return;

  try {
    const response = await projectsApiClient.getMilestoneFeedbackHistory({
      projectId: String(projectId || ''),
      milestoneId: String(milestoneId || ''),
    });
    const submissions = Array.isArray(response?.data?.submissions)
      ? response.data.submissions
      : [];
    const latestFeedback = response?.data?.latestFeedback || null;

    if (statusBadge) {
      const statusKey = String(latestFeedback?.status || '').toLowerCase();
      const config =
        milestoneStatusUiMap[statusKey] || milestoneStatusUiMap.default;
      statusBadge.textContent = config.label;
      statusBadge.className = `status-badge ${config.badgeClass}`;
    }

    if (comment) {
      comment.textContent =
        latestFeedback?.reviewerComment || 'No feedback available yet.';
    }

    // Test Results
    const testResultsContainer = document.getElementById(
      'feedback-test-results',
    );
    const testResultsContent = document.getElementById(
      'feedback-test-results-content',
    );
    if (testResultsContainer && testResultsContent) {
      if (latestFeedback?.testResults) {
        testResultsContainer.style.display = 'block';
        // Assuming testResults is a string; if it's an object, we might need to format it.
        testResultsContent.textContent =
          typeof latestFeedback.testResults === 'string'
            ? latestFeedback.testResults
            : JSON.stringify(latestFeedback.testResults, null, 2);
      } else {
        testResultsContainer.style.display = 'none';
        testResultsContent.textContent = '';
      }
    }

    // AI Evidence
    const aiAnalysisContainer = document.getElementById('project-ai-analysis');
    const aiConfidence = document.getElementById('project-ai-confidence');
    const aiReasoning = document.getElementById('project-ai-reasoning');
    const aiEvidence = document.getElementById('project-ai-evidence');
    const toggleAiButton = document.getElementById('btn-toggle-project-ai');
    if (
      aiAnalysisContainer &&
      aiConfidence &&
      aiReasoning &&
      aiEvidence &&
      toggleAiButton
    ) {
      if (latestFeedback?.aiEvidence) {
        // Show the AI analysis section
        aiAnalysisContainer.style.display = 'block';
        // Set confidence if available
        if (latestFeedback.aiEvidence.confidence !== undefined) {
          aiConfidence.textContent = `Confidence: ${latestFeedback.aiEvidence.confidence}%`;
        } else {
          aiConfidence.textContent = 'Confidence: --%';
        }
        // Set reasoning
        aiReasoning.textContent =
          latestFeedback.aiEvidence.reasoning || 'No reasoning provided.';
        // Set evidence (assuming it's a string or code)
        aiEvidence.textContent =
          typeof latestFeedback.aiEvidence.evidence === 'string'
            ? latestFeedback.aiEvidence.evidence
            : JSON.stringify(latestFeedback.aiEvidence.evidence, null, 2);
        // Show the toggle button
        toggleAiButton.style.display = 'inline-block';

        // Add toggle functionality
        toggleAiButton.onclick = () => {
          const isHidden = aiAnalysisContainer.style.display === 'none';
          aiAnalysisContainer.style.display = isHidden ? 'block' : 'none';
          toggleAiButton.textContent = isHidden
            ? '<i class="fa-solid fa-brain"></i> Hide AI Analysis'
            : '<i class="fa-solid fa-brain"></i> AI Analysis';
        };
      } else {
        // Hide the AI analysis section
        aiAnalysisContainer.style.display = 'none';
        // Reset content
        aiConfidence.textContent = 'Confidence: --%';
        aiReasoning.textContent = '...';
        aiEvidence.textContent = '...';
        // Hide the toggle button
        toggleAiButton.style.display = 'none';
        // Remove any existing onclick handler
        toggleAiButton.onclick = null;
      }
    }

    if (checklist) {
      checklist.innerHTML = latestFeedback?.reviewerComment
        ? `<li><i class="fa-regular fa-square"></i> ${escapeHtml(latestFeedback.reviewerComment)}</li>`
        : '<li><i class="fa-regular fa-square"></i> No required changes listed yet.</li>';
    }

    if (historyBody) {
      if (!submissions.length) {
        historyBody.innerHTML =
          '<tr><td colspan="4">No submission history yet.</td></tr>';
      } else {
        historyBody.innerHTML = submissions
          .map((entry, index) => {
            const statusKey = String(entry.status || '').toLowerCase();
            const config =
              milestoneStatusUiMap[statusKey] || milestoneStatusUiMap.default;
            return `
                        <tr>
                            <td>Attempt ${submissions.length - index}</td>
                            <td>${escapeHtml(formatDateTime(entry.createdAt || entry.updatedAt))}</td>
                            <td><span class="status-badge ${config.badgeClass}">${config.label}</span></td>
                            <td>${escapeHtml(entry.reviewerComment || 'No notes')}</td>
                        </tr>
                    `;
          })
          .join('');
      }
    }
  } catch (error) {
    if (statusBadge) statusBadge.textContent = 'Error';
    if (comment)
      comment.textContent = formatRequestError(
        error,
        'Error loading feedback.',
      );
    if (checklist)
      checklist.innerHTML =
        '<li><i class="fa-regular fa-square"></i> Unable to load required changes.</li>';
    if (historyBody)
      historyBody.innerHTML =
        '<tr><td colspan="4">Unable to load history. Check authentication, course access, and API connectivity.</td></tr>';
  }
};

window.closeModal = closeModal;

window.copyActiveCliSetupCommand = () => {
  const project = projectsPageState.ui.projects.find(
    (entry) => entry.domId === projectsPageState.activeProjectId,
  );
  const command =
    project?.cli?.setupCommand ||
    'nibras setup --project your-course/project-key';
  navigator.clipboard
    .writeText(command)
    .then(() => setApiNotice('CLI setup command copied.', 'info'));
};

/* ── GitHub Repository Connection ──────────────────────────── */

var githubConnectProjectId = '';

window.openGithubConnectModal = function (projectId) {
  githubConnectProjectId = String(projectId || '');
  var modal = document.getElementById('githubConnectModal');
  if (!modal) return;

  resetGithubConnectUI();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  checkGithubAuthStatus();
};

function closeGithubConnectModal() {
  var modal = document.getElementById('githubConnectModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
  githubConnectProjectId = '';
}

function resetGithubConnectUI() {
  document.getElementById('gh-auth-step').style.display = '';
  document.getElementById('gh-repo-step').style.display = 'none';
  document.getElementById('gh-connect-step').style.display = 'none';
  document.getElementById('gh-success-state').style.display = 'none';
  document.getElementById('gh-connect-error').style.display = 'none';
  document.getElementById('gh-connect-error').textContent = '';
  document.getElementById('gh-repo-url').value = '';
  document.getElementById('gh-validate-status').innerHTML = '';
  document.getElementById('gh-repo-branch').value = 'main';
  setGithubStep(1);
}

function setGithubStep(step) {
  for (var i = 1; i <= 3; i++) {
    var el = document.getElementById('gh-step-' + i);
    if (el) el.classList.toggle('active', i === step);
  }
}

function checkGithubAuthStatus() {
  var statusEl = document.getElementById('gh-auth-status');
  var actionsEl = document.getElementById('gh-auth-actions');
  var authedEl = document.getElementById('gh-authenticated-info');

  statusEl.style.display = '';
  statusEl.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Checking GitHub connection...';
  actionsEl.style.display = 'none';
  authedEl.style.display = 'none';

  var svc = window.NibrasServices;
  if (!svc || !svc.githubService) {
    statusEl.style.display = 'none';
    actionsEl.style.display = '';
    return;
  }

  svc.githubService
    .getConfig()
    .then(function (res) {
      var configured = res?.configured ?? res?.data?.configured ?? false;
      var appName = res?.appName || res?.data?.appName || '';
      var user = null;
      try {
        user = JSON.parse(localStorage.getItem('user') || '{}');
      } catch (_) {}
      var ghUser = user?.githubUsername || user?.githubLogin || '';

      if (configured || ghUser) {
        statusEl.style.display = 'none';
        authedEl.style.display = '';
        document.getElementById('gh-authenticated-user').textContent =
          ghUser || appName || 'GitHub';
        document.getElementById('gh-repo-step').style.display = '';
        setGithubStep(2);
      } else {
        statusEl.style.display = 'none';
        actionsEl.style.display = '';
      }
    })
    .catch(function () {
      statusEl.style.display = 'none';
      actionsEl.style.display = '';
    });
}

window.startGithubOAuth = function () {
  var returnTo = encodeURIComponent(window.location.href);
  var svc = window.NibrasServices;
  if (svc && svc.githubService) {
    svc.githubService
      .getInstallUrl()
      .then(function (res) {
        var url = res?.installUrl || res?.data?.installUrl;
        if (url) {
          window.open(url, '_blank', 'width=800,height=700');
          pollGithubAuth();
          return;
        }
        fallbackGithubOAuth(returnTo);
      })
      .catch(function () {
        fallbackGithubOAuth(returnTo);
      });
  } else {
    fallbackGithubOAuth(returnTo);
  }
};

function fallbackGithubOAuth(returnTo) {
  var cliBase = resolveCliBaseUrl();
  var candidates = [cliBase];
  var raw = String(
    window.NibrasShared?.resolveServiceUrl?.('tracking') ||
      window.NIBRAS_TRACKING_API_URL ||
      '',
  ).trim();
  if (raw) candidates.unshift(raw.replace(/\/+$/, ''));
  var adminUrl = String(window.NIBRAS_API_URL || '')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
  if (adminUrl) candidates.push(adminUrl);

  function tryOAuth(idx) {
    if (idx >= candidates.length) return;
    var base = candidates[idx];
    fetch(base + '/v1/github/config', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        if (r.status !== 404) {
          window.open(
            base + '/v1/github/oauth/start?return_to=' + returnTo,
            '_blank',
            'width=800,height=700',
          );
          pollGithubAuth();
        } else {
          tryOAuth(idx + 1);
        }
      })
      .catch(function () {
        tryOAuth(idx + 1);
      });
  }
  tryOAuth(0);
}

function pollGithubAuth() {
  var statusEl = document.getElementById('gh-auth-status');
  statusEl.style.display = '';
  statusEl.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Waiting for GitHub authorization...';

  var attempts = 0;
  var maxAttempts = 30;
  var interval = setInterval(function () {
    attempts++;
    var svc = window.NibrasServices;
    if (!svc || !svc.githubService) {
      clearInterval(interval);
      statusEl.innerHTML =
        '<i class="fa-solid fa-circle-exclamation"></i> GitHub service unavailable.';
      document.getElementById('gh-auth-actions').style.display = '';
      return;
    }
    svc.githubService
      .getConfig()
      .then(function (res) {
        var configured = res?.configured ?? res?.data?.configured ?? false;
        if (configured) {
          clearInterval(interval);
          statusEl.style.display = 'none';
          document.getElementById('gh-authenticated-info').style.display = '';
          document.getElementById('gh-authenticated-user').textContent =
            res?.appName || res?.data?.appName || 'GitHub';
          document.getElementById('gh-repo-step').style.display = '';
          setGithubStep(2);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          statusEl.innerHTML =
            '<i class="fa-solid fa-circle-exclamation"></i> Authorization timed out. Please try again.';
          document.getElementById('gh-auth-actions').style.display = '';
        }
      })
      .catch(function () {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          statusEl.innerHTML =
            '<i class="fa-solid fa-circle-exclamation"></i> Could not verify authorization. Please try again.';
          document.getElementById('gh-auth-actions').style.display = '';
        }
      });
  }, 2000);
}

window.confirmGithubConnect = function () {
  var repoUrl = document.getElementById('gh-repo-url').value.trim();
  var branch = document.getElementById('gh-repo-branch').value.trim() || 'main';
  var errorEl = document.getElementById('gh-connect-error');
  var validateEl = document.getElementById('gh-validate-status');
  var connectBtn = document.getElementById('gh-connect-btn');

  if (!repoUrl) {
    errorEl.textContent = 'Please enter a repository URL.';
    errorEl.style.display = '';
    return;
  }

  var ghPattern = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i;
  if (!ghPattern.test(repoUrl)) {
    errorEl.textContent =
      'Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).';
    errorEl.style.display = '';
    return;
  }

  errorEl.style.display = 'none';
  connectBtn.disabled = true;
  connectBtn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting...';
  validateEl.innerHTML =
    '<span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Validating repository...</span>';

  var svc = window.NibrasServices;

  // Validate the repo
  var validatePromise =
    svc && svc.githubService
      ? svc.githubService.validateRepo(repoUrl).catch(function () {
          return null;
        })
      : Promise.resolve(null);

  validatePromise
    .then(function (validation) {
      if (validation) {
        validateEl.innerHTML =
          '<span style="color:var(--status-graded-text);font-size:0.85rem;"><i class="fa-solid fa-circle-check"></i> Repository validated: ' +
          escapeHtml(validation.owner + '/' + validation.name) +
          '</span>';
      } else {
        validateEl.innerHTML =
          '<span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-info-circle"></i> Repository URL accepted</span>';
      }

      var connectPromise;
      var trackingSvc = trackingProjects();
      if (trackingSvc && githubConnectProjectId) {
        connectPromise = trackingSvc
          .updateProject(githubConnectProjectId, {
            resources: [{ label: 'Repository', url: repoUrl }],
          })
          .catch(function () {
            return null;
          });
      } else {
        connectPromise = Promise.resolve(null);
      }

      connectPromise
        .then(function () {
          connectBtn.disabled = false;
          connectBtn.innerHTML =
            '<i class="fa-solid fa-link"></i> Connect Repository';

          document.getElementById('gh-connect-step').style.display = 'none';
          document.getElementById('gh-success-state').style.display = '';
          document.getElementById('gh-connected-repo-name').textContent =
            repoUrl;
          setGithubStep(3);

          // Refresh project details
          var currentProject = projectsPageState.ui.projects.find(function (e) {
            return e.domId === projectsPageState.activeProjectId;
          });
          if (currentProject) {
            currentProject.githubRepo = repoUrl;
            loadProjectExtraDetails(currentProject);
          }
        })
        .catch(function (err) {
          connectBtn.disabled = false;
          connectBtn.innerHTML =
            '<i class="fa-solid fa-link"></i> Connect Repository';
          errorEl.textContent =
            err?.message || 'Failed to connect repository. Please try again.';
          errorEl.style.display = '';
        });
    })
    .catch(function () {
      connectBtn.disabled = false;
      connectBtn.innerHTML =
        '<i class="fa-solid fa-link"></i> Connect Repository';
      errorEl.textContent =
        'Could not validate repository URL. Please check and try again.';
      errorEl.style.display = '';
    });
};

// Listen for repo URL input to auto-upgrade to step 3 preview
document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'gh-repo-url') {
    var val = e.target.value.trim();
    var connectStep = document.getElementById('gh-connect-step');
    if (connectStep && val) {
      document.getElementById('gh-connect-repo-display').textContent = val;
      document.getElementById('gh-connect-branch-display').textContent =
        document.getElementById('gh-repo-branch')?.value || 'main';
      connectStep.style.display = '';
      setGithubStep(3);
    } else if (connectStep) {
      connectStep.style.display = 'none';
      setGithubStep(2);
    }
  }
});

// Update branch display on branch change
document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'gh-repo-branch') {
    var display = document.getElementById('gh-connect-branch-display');
    if (display) display.textContent = e.target.value || 'main';
  }
});

/* ── Commit History ───────────────────────────────────── */

window.openCommitHistoryModal = function (projectId) {
  var modal = document.getElementById('commitHistoryModal');
  if (!modal) return;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('commit-loading').style.display = '';
  document.getElementById('commit-empty').style.display = 'none';
  document.getElementById('commit-content').style.display = 'none';
  document.getElementById('commit-error').style.display = 'none';

  var project = projectsPageState.ui.projects.find(function (e) {
    return e.apiProjectId === projectId || e.domId === IDs.toDom(projectId);
  });

  var repo = (project && project.githubRepo) || '';
  document.getElementById('commit-repo-name').textContent =
    repo || 'Local project';

  loadCommitHistory(projectId, project);
};

function closeCommitHistoryModal() {
  var modal = document.getElementById('commitHistoryModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function loadCommitHistory(projectId, project) {
  var apiId = projectId || (project && project.apiProjectId);

  if (project && project.commits && project.commits.length) {
    renderCommitHistory(project.commits, project);
    return;
  }

  var svc = trackingProjects();
  if (svc && apiId) {
    svc
      .getCommits(apiId)
      .then(function (res) {
        var payload = res?.data || res;
        var commits = payload && Array.isArray(payload.commits) ? payload.commits : [];
        if (project) project.commits = commits;
        renderCommitHistory(commits, project);
      })
      .catch(function () {
        renderCommitHistory([], project);
      });
  } else {
    renderCommitHistory([], project);
  }
}

function renderCommitHistory(commits, project) {
  document.getElementById('commit-loading').style.display = 'none';

  if (!commits || !commits.length) {
    document.getElementById('commit-empty').style.display = '';
    return;
  }

  // Build contributor breakdown
  var contributors = {};
  commits.forEach(function (c) {
    var author = c.author || c.authorName || c.committer || 'Unknown';
    if (!contributors[author]) {
      contributors[author] = {
        name: author,
        commits: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
    }
    contributors[author].commits++;
    contributors[author].linesAdded += c.linesAdded || c.additions || 0;
    contributors[author].linesRemoved += c.linesRemoved || c.deletions || 0;
  });

  var contribList = Object.keys(contributors).map(function (k) {
    return contributors[k];
  });
  var totalCommits = commits.length;
  var totalLines = contribList.reduce(function (s, c) {
    return s + c.linesAdded + c.linesRemoved;
  }, 0);
  var dateRange =
    commits.length > 0
      ? (commits[commits.length - 1]?.date ||
          commits[commits.length - 1]?.timestamp ||
          '') +
        ' — ' +
        (commits[0]?.date || commits[0]?.timestamp || '')
      : '';

  // Summary bar
  document.getElementById('commit-summary').innerHTML =
    '' +
    '<div class="commit-summary-item"><strong>' +
    totalCommits +
    '</strong> commits</div>' +
    '<div class="commit-summary-item"><strong>' +
    contribList.length +
    '</strong> contributors</div>' +
    '<div class="commit-summary-item"><strong>' +
    totalLines +
    '</strong> lines changed</div>' +
    (dateRange
      ? '<div class="commit-summary-item" style="margin-left:auto;"><i class="fa-regular fa-calendar"></i> ' +
        escapeHtml(dateRange) +
        '</div>'
      : '');

  // Contributor breakdown with bars
  var maxCommits = Math.max.apply(
    null,
    contribList.map(function (c) {
      return c.commits;
    }),
  );
  var contribHtml =
    '<div class="commit-contrib-title"><i class="fa-solid fa-users"></i> Contributors</div>';
  contribList.forEach(function (c) {
    var pct =
      totalCommits > 0 ? Math.round((c.commits / totalCommits) * 100) : 0;
    var color = 'var(--accent-blue)';
    contribHtml +=
      '<div class="commit-contrib-row">' +
      '<span class="commit-contrib-name">' +
      escapeHtml(c.name) +
      '</span>' +
      '<div class="commit-contrib-track"><div class="commit-contrib-fill" style="width:' +
      pct +
      '%;background:' +
      color +
      ';"></div></div>' +
      '<span class="commit-contrib-pct">' +
      pct +
      '%</span>' +
      '<span class="commit-contrib-stat">+' +
      c.linesAdded +
      ' / -' +
      c.linesRemoved +
      '</span>' +
      '</div>';
  });
  document.getElementById('commit-contrib-breakdown').innerHTML = contribHtml;

  // Commit list
  var listHtml =
    '<div class="commit-contrib-title" style="margin-top:16px;"><i class="fa-solid fa-timeline"></i> Recent Commits</div>';
  commits.slice(0, 50).forEach(function (c) {
    var msg = c.message || c.commitMessage || 'No message';
    var author = c.author || c.authorName || c.committer || 'Unknown';
    var date = c.date || c.timestamp || c.authoredDate || '';
    var sha = c.sha || c.commitSha || '';
    var shortSha = sha.length > 7 ? sha.slice(0, 7) : sha;
    var formattedDate = date ? formatDateTime(date) : '';

    listHtml +=
      '<div class="commit-item">' +
      '<div class="commit-item-left">' +
      '<div class="commit-item-msg">' +
      escapeHtml(msg) +
      '</div>' +
      '<div class="commit-item-meta">' +
      '<span><i class="fa-regular fa-user"></i> ' +
      escapeHtml(author) +
      '</span>' +
      (formattedDate
        ? '<span><i class="fa-regular fa-clock"></i> ' +
          formattedDate +
          '</span>'
        : '') +
      '</div></div>' +
      (shortSha
        ? '<span class="commit-item-sha">' + shortSha + '</span>'
        : '') +
      '</div>';
  });
  document.getElementById('commit-list-container').innerHTML = listHtml;

  document.getElementById('commit-content').style.display = '';
}

// Close commit modal on outside click
document.addEventListener('click', function (e) {
  var modal = document.getElementById('commitHistoryModal');
  if (modal && modal.classList.contains('active') && e.target === modal) {
    closeCommitHistoryModal();
  }
});

/* ── Contribution Analytics ──────────────────────────── */

window.openContributionAnalyticsModal = function (projectId) {
  var modal = document.getElementById('contributionAnalyticsModal');
  if (!modal) return;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('analytics-loading').style.display = '';
  document.getElementById('analytics-empty').style.display = 'none';
  document.getElementById('analytics-content').style.display = 'none';
  document.getElementById('analytics-error').style.display = 'none';

  var project = projectsPageState.ui.projects.find(function (e) {
    return e.apiProjectId === projectId || e.domId === IDs.toDom(projectId);
  });

  document.getElementById('analytics-project-name').textContent =
    (project && project.details && project.details.title) || 'Project';
  loadContributionAnalytics(projectId, project);
};

function closeContributionAnalyticsModal() {
  var modal = document.getElementById('contributionAnalyticsModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function loadContributionAnalytics(projectId, project) {
  var apiId = projectId || (project && project.apiProjectId);

  var svc = trackingProjects();
  if (svc && apiId) {
    Promise.all([
      svc.getCommits(apiId).catch(function () {
        return null;
      }),
      svc.getContributions(apiId).catch(function () {
        return null;
      }),
    ])
      .then(function (results) {
        var commitsPayload = results[0]?.data || results[0];
        var contribPayload = results[1]?.data || results[1];
        var commits =
          commitsPayload && Array.isArray(commitsPayload.commits)
            ? commitsPayload.commits
            : project
              ? project.commits || []
              : [];
        var contribution =
          contribPayload && Array.isArray(contribPayload.members)
            ? contribPayload.members
            : contribPayload && Array.isArray(contribPayload.contribution)
              ? contribPayload.contribution
              : [];
        if (project) {
          project.commits = commits;
          if (contribution.length) project.contribution = contribution;
        }
        renderContributionAnalytics(commits, contribution, project);
      })
      .catch(function () {
        renderContributionAnalytics(
          (project && project.commits) || [],
          (project && project.contribution) || [],
          project,
        );
      });
  } else {
    renderContributionAnalytics(
      (project && project.commits) || [],
      (project && project.contribution) || [],
      project,
    );
  }
}

function renderContributionAnalytics(commits, contribution, project) {
  document.getElementById('analytics-loading').style.display = 'none';

  if (!commits.length && (!contribution || !contribution.length)) {
    document.getElementById('analytics-empty').style.display = '';
    return;
  }

  // Build contribution data from commits
  var memberStats = {};
  if (contribution.length) {
    contribution.forEach(function (c) {
      memberStats[c.name || c.member || 'Unknown'] = {
        name: c.name || c.member || 'Unknown',
        commits: c.commits || 0,
        linesAdded: c.linesAdded || c.additions || 0,
        linesRemoved: c.linesRemoved || c.deletions || 0,
        percentage: c.percentage || 0,
      };
    });
  }
  commits.forEach(function (c) {
    var author = c.author || c.authorName || c.committer || 'Unknown';
    if (!memberStats[author]) {
      memberStats[author] = {
        name: author,
        commits: 0,
        linesAdded: 0,
        linesRemoved: 0,
        percentage: 0,
      };
    }
    memberStats[author].commits++;
    memberStats[author].linesAdded += c.linesAdded || c.additions || 0;
    memberStats[author].linesRemoved += c.linesRemoved || c.deletions || 0;
  });

  var members = Object.keys(memberStats).map(function (k) {
    return memberStats[k];
  });
  var totalCommits = members.reduce(function (s, m) {
    return s + m.commits;
  }, 0);
  var totalAdded = members.reduce(function (s, m) {
    return s + m.linesAdded;
  }, 0);
  var totalRemoved = members.reduce(function (s, m) {
    return s + m.linesRemoved;
  }, 0);
  var maxCommits =
    Math.max.apply(
      null,
      members.map(function (m) {
        return m.commits;
      }),
    ) || 1;
  var maxLines =
    Math.max.apply(
      null,
      members.map(function (m) {
        return m.linesAdded + m.linesRemoved;
      }),
    ) || 1;

  // Summary cards
  document.getElementById('analytics-summary').innerHTML =
    '' +
    '<div class="analytics-stat-card"><span class="analytics-stat-value">' +
    members.length +
    '</span><span class="analytics-stat-label">Contributors</span></div>' +
    '<div class="analytics-stat-card"><span class="analytics-stat-value">' +
    totalCommits +
    '</span><span class="analytics-stat-label">Total Commits</span></div>' +
    '<div class="analytics-stat-card"><span class="analytics-stat-value">+' +
    totalAdded +
    '/-' +
    totalRemoved +
    '</span><span class="analytics-stat-label">Lines Changed</span></div>';

  // --- Commits Tab ---
  var commitsChart = '';
  members.forEach(function (m) {
    var pct = Math.round((m.commits / totalCommits) * 100);
    var color =
      m.name ===
      (project &&
        project.teamMembers &&
        project.teamMembers[0] &&
        project.teamMembers[0].name)
        ? '#3b82f6'
        : '#6366f1';
    commitsChart +=
      '<div class="analytics-bar-row">' +
      '<span class="analytics-bar-label">' +
      escapeHtml(m.name) +
      '</span>' +
      '<div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:' +
      pct +
      '%;background:' +
      color +
      ';"></div></div>' +
      '<span class="analytics-bar-stat">' +
      m.commits +
      ' (' +
      pct +
      '%)</span>' +
      '</div>';
  });
  document.getElementById('analytics-commits-chart').innerHTML = commitsChart;

  var commitsTable =
    '<table><thead><tr><th>Member</th><th>Commits</th><th>Contribution %</th></tr></thead><tbody>';
  members.forEach(function (m) {
    var pct =
      totalCommits > 0 ? Math.round((m.commits / totalCommits) * 100) : 0;
    commitsTable +=
      '<tr><td>' +
      escapeHtml(m.name) +
      '</td><td>' +
      m.commits +
      '</td><td>' +
      pct +
      '%</td></tr>';
  });
  commitsTable += '</tbody></table>';
  document.getElementById('analytics-commits-table').innerHTML = commitsTable;

  // --- Lines Tab ---
  var linesChart = '';
  members.forEach(function (m) {
    var total = m.linesAdded + m.linesRemoved;
    var pct = Math.round((total / maxLines) * 100);
    var addedPct = total > 0 ? Math.round((m.linesAdded / total) * 100) : 0;
    linesChart +=
      '<div class="analytics-bar-row">' +
      '<span class="analytics-bar-label">' +
      escapeHtml(m.name) +
      '</span>' +
      '<div class="analytics-bar-track" style="height:24px;">' +
      '<div class="analytics-bar-fill" style="width:' +
      pct +
      '%;background:linear-gradient(90deg,#22c55e ' +
      addedPct +
      '%,#ef4444 0%);"></div>' +
      '</div>' +
      '<span class="analytics-bar-stat">+' +
      m.linesAdded +
      '/-' +
      m.linesRemoved +
      '</span>' +
      '</div>';
  });
  document.getElementById('analytics-lines-chart').innerHTML = linesChart;

  var linesTable =
    '<table><thead><tr><th>Member</th><th>Lines Added</th><th>Lines Removed</th><th>Net</th></tr></thead><tbody>';
  members.forEach(function (m) {
    var net = m.linesAdded - m.linesRemoved;
    var netStr = (net >= 0 ? '+' : '') + net;
    linesTable +=
      '<tr><td>' +
      escapeHtml(m.name) +
      '</td><td style="color:var(--status-graded-text);">+' +
      m.linesAdded +
      '</td><td style="color:var(--status-late-text);">-' +
      m.linesRemoved +
      '</td><td>' +
      netStr +
      '</td></tr>';
  });
  linesTable += '</tbody></table>';
  document.getElementById('analytics-lines-table').innerHTML = linesTable;

  // --- Frequency Tab ---
  var freqMap = {};
  commits.forEach(function (c) {
    var rawDate = c.date || c.timestamp || c.authoredDate || '';
    if (!rawDate) return;
    var day;
    try {
      day = new Date(rawDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return;
    }
    if (!freqMap[day]) freqMap[day] = { date: day, count: 0, members: {} };
    freqMap[day].count++;
    var author = c.author || c.authorName || c.committer || 'Unknown';
    freqMap[day].members[author] = (freqMap[day].members[author] || 0) + 1;
  });

  var freqDates = Object.keys(freqMap).sort(function (a, b) {
    return new Date(a) - new Date(b);
  });
  var maxFreq =
    Math.max.apply(
      null,
      freqDates.map(function (d) {
        return freqMap[d].count;
      }),
    ) || 1;

  var freqHtml = '';
  freqDates.forEach(function (day) {
    var f = freqMap[day];
    var pct = Math.round((f.count / maxFreq) * 100);
    var memberList = Object.keys(f.members)
      .map(function (m) {
        return escapeHtml(m) + ' (' + f.members[m] + ')';
      })
      .join(', ');
    freqHtml +=
      '<div class="analytics-frequency-item">' +
      '<span class="analytics-frequency-date">' +
      day +
      '</span>' +
      '<div class="analytics-frequency-bar"><div class="analytics-frequency-fill" style="width:' +
      pct +
      '%;"></div></div>' +
      '<span class="analytics-frequency-count">' +
      f.count +
      '</span>' +
      '</div>';
  });
  document.getElementById('analytics-frequency-timeline').innerHTML =
    freqHtml ||
    '<p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.85rem;">No date data available for frequency analysis.</p>';

  document.getElementById('analytics-content').style.display = '';
}

// Analytics tab switching
document.addEventListener('click', function (e) {
  var tab = e.target.closest && e.target.closest('.analytics-tab');
  if (!tab) return;

  document.querySelectorAll('.analytics-tab').forEach(function (t) {
    t.classList.remove('active');
  });
  tab.classList.add('active');

  var panelId = 'analytics-panel-' + tab.getAttribute('data-analytics-tab');
  document.querySelectorAll('.analytics-tab-panel').forEach(function (p) {
    p.classList.remove('active');
  });
  var panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
});

// Close analytics modal on outside click
document.addEventListener('click', function (e) {
  var modal = document.getElementById('contributionAnalyticsModal');
  if (modal && modal.classList.contains('active') && e.target === modal) {
    closeContributionAnalyticsModal();
  }
});

/* ── Team Management ──────────────────────────────────── */

var teamManagementProjectId = '';
var teamMembers = [];

window.openTeamManagementModal = function (projectId) {
  teamManagementProjectId = String(projectId || '');
  var modal = document.getElementById('teamManagementModal');
  if (!modal) return;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('team-loading').style.display = '';
  document.getElementById('team-content').style.display = 'none';
  document.getElementById('team-success-msg').style.display = 'none';
  document.getElementById('team-modal-footer').style.display = 'none';
  document.getElementById('team-invite-error').style.display = 'none';

  var project = projectsPageState.ui.projects.find(function (e) {
    return e.apiProjectId === projectId || e.domId === IDs.toDom(projectId);
  });
  document.getElementById('team-project-name').textContent =
    (project && project.details && project.details.title) || 'Project';

  loadTeamData(projectId, project);
};

function closeTeamManagementModal() {
  var modal = document.getElementById('teamManagementModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
  teamManagementProjectId = '';
  teamMembers = [];
}

function loadTeamData(projectId, project) {
  teamMembers =
    project && project.teamMembers ? project.teamMembers.slice() : [];

  var teamName = (project && project.teamName) || '';
  var teamRepo = (project && project.githubRepo) || '';

  var svc = trackingProjects();
  if (svc && projectId) {
    svc
      .listTeams(projectId)
      .then(function (teams) {
        var list = Array.isArray(teams) ? teams : teams?.data || [];
        if (list.length) {
          var team = list[0];
          teamName = team.name || teamName;
          teamMembers = (team.members || []).map(function (m) {
            return {
              name: m.displayName || m.userId,
              role: m.roleLabel || m.roleKey || 'member',
              userId: m.userId,
            };
          });
          if (project) {
            project.teamMembers = teamMembers.slice();
            project.teamName = teamName;
          }
        }
        document.getElementById('team-name-input').value = teamName;
        document.getElementById('team-repo-input').value = teamRepo;
        document.getElementById('team-loading').style.display = 'none';
        document.getElementById('team-content').style.display = '';
        document.getElementById('team-modal-footer').style.display = '';
        renderTeamMembersList();
      })
      .catch(function () {
        document.getElementById('team-name-input').value = teamName;
        document.getElementById('team-repo-input').value = teamRepo;
        document.getElementById('team-loading').style.display = 'none';
        document.getElementById('team-content').style.display = '';
        document.getElementById('team-modal-footer').style.display = '';
        renderTeamMembersList();
      });
    return;
  }

  document.getElementById('team-name-input').value = teamName;
  document.getElementById('team-repo-input').value = teamRepo;
  document.getElementById('team-loading').style.display = 'none';
  document.getElementById('team-content').style.display = '';
  document.getElementById('team-modal-footer').style.display = '';
  renderTeamMembersList();
}

function renderTeamMembersList() {
  var container = document.getElementById('team-member-list');
  var countEl = document.getElementById('team-member-count');

  countEl.textContent = teamMembers.length;

  if (!teamMembers.length) {
    container.innerHTML =
      '<p style="text-align:center;padding:20px;color:var(--text-secondary);font-size:0.85rem;">No members yet. Add team members using the invite form below.</p>';
    return;
  }

  container.innerHTML = teamMembers
    .map(function (m, idx) {
      var name = m.name || m.username || m.email || 'Member';
      var role = m.role || 'member';
      var initials = name
        .split(/\s+/)
        .map(function (s) {
          return s[0];
        })
        .join('')
        .toUpperCase()
        .slice(0, 2);
      var roleOptions = ['member', 'admin', 'reviewer']
        .map(function (r) {
          return (
            '<option value="' +
            r +
            '"' +
            (r === role ? ' selected' : '') +
            '>' +
            r.charAt(0).toUpperCase() +
            r.slice(1) +
            '</option>'
          );
        })
        .join('');

      return (
        '<div class="team-member-card" data-idx="' +
        idx +
        '">' +
        '<div class="team-member-avatar-sm">' +
        escapeHtml(initials) +
        '</div>' +
        '<div class="team-member-card-info">' +
        '<div class="team-member-card-name">' +
        escapeHtml(name) +
        '</div>' +
        '</div>' +
        '<select class="team-member-role-select" data-idx="' +
        idx +
        '" onchange="updateTeamMemberRole(' +
        idx +
        ', this.value)">' +
        roleOptions +
        '</select>' +
        '<button class="team-member-remove-btn" onclick="removeTeamMember(' +
        idx +
        ')" title="Remove member"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>'
      );
    })
    .join('');
}

function inviteTeamMember() {
  var input = document.getElementById('team-invite-input');
  var roleSelect = document.getElementById('team-invite-role');
  var errorEl = document.getElementById('team-invite-error');
  var name = input.value.trim();

  errorEl.style.display = 'none';

  if (!name) {
    errorEl.textContent = 'Please enter a name or email.';
    errorEl.style.display = '';
    return;
  }

  var existing = teamMembers.some(function (m) {
    return (
      (m.name || '').toLowerCase() === name.toLowerCase() ||
      (m.email || '').toLowerCase() === name.toLowerCase()
    );
  });
  if (existing) {
    errorEl.textContent = 'Member already in team.';
    errorEl.style.display = '';
    return;
  }

  teamMembers.push({
    name: name,
    role: roleSelect.value,
    email: name.includes('@') ? name : '',
  });

  input.value = '';
  renderTeamMembersList();
}

function removeTeamMember(idx) {
  if (idx >= 0 && idx < teamMembers.length) {
    teamMembers.splice(idx, 1);
    renderTeamMembersList();
  }
}

function updateTeamMemberRole(idx, role) {
  if (idx >= 0 && idx < teamMembers.length) {
    teamMembers[idx].role = role;
  }
}

function saveTeamSettings() {
  var teamName = document.getElementById('team-name-input').value.trim();
  var teamRepo = document.getElementById('team-repo-input').value.trim();
  var msgEl = document.getElementById('team-success-msg');

  var project = projectsPageState.ui.projects.find(function (e) {
    return (
      e.apiProjectId === teamManagementProjectId ||
      e.domId === IDs.toDom(teamManagementProjectId)
    );
  });

  if (project) {
    project.teamMembers = teamMembers.slice();
    project.teamName = teamName;
    if (teamRepo) project.githubRepo = teamRepo;
  }

  var svc = trackingProjects();
  var savePromise = Promise.resolve(null);
  if (svc && teamManagementProjectId) {
    savePromise = svc
      .listTeams(teamManagementProjectId)
      .then(function (teams) {
        var list = Array.isArray(teams) ? teams : teams?.data || [];
        if (!list.length) return null;
        return svc.updateTeam(teamManagementProjectId, list[0].id, {
          name: teamName || undefined,
          members: teamMembers.map(function (m) {
            return {
              userId: m.userId || m.email || m.name,
              roleKey: m.role || 'member',
              roleLabel: m.role || 'Member',
            };
          }),
        });
      })
      .catch(function () {
        return null;
      });
  }

  savePromise
    .then(function () {
      msgEl.style.display = '';
      msgEl.innerHTML =
        '<i class="fa-solid fa-circle-check"></i> Team saved successfully!';
      setTimeout(function () {
        msgEl.style.display = 'none';
      }, 2500);
      renderProjectDetails();
      renderGroupWorkspace();
    })
    .catch(function () {
      msgEl.style.display = '';
      msgEl.innerHTML =
        '<i class="fa-solid fa-circle-check"></i> Team saved locally!';
      setTimeout(function () {
        msgEl.style.display = 'none';
      }, 2500);
      renderProjectDetails();
      renderGroupWorkspace();
    });
}

// Close team modal on outside click
document.addEventListener('click', function (e) {
  var modal = document.getElementById('teamManagementModal');
  if (modal && modal.classList.contains('active') && e.target === modal) {
    closeTeamManagementModal();
  }
});

// Close submission modal on outside click
document.addEventListener('click', function (e) {
  var modal = document.getElementById('submissionModal');
  if (modal && modal.classList.contains('active') && e.target === modal) {
    closeModal('submissionModal');
  }
});

// Close feedback modal on outside click
document.addEventListener('click', function (e) {
  var modal = document.getElementById('feedbackModal');
  if (modal && modal.classList.contains('active') && e.target === modal) {
    closeModal('feedbackModal');
  }
});

// Close GitHub connect modal on outside click
document.addEventListener('click', function (e) {
  var modal = document.getElementById('githubConnectModal');
  if (modal && modal.classList.contains('active') && e.target === modal) {
    closeGithubConnectModal();
  }
});

window.addEventListener('beforeunload', () => {
  if (projectsPageState.pollingInterval) {
    clearInterval(projectsPageState.pollingInterval);
    projectsPageState.pollingInterval = null;
  }
});

function renderActivityFeed(projectId) {
  var feed = document.getElementById('webhook-feed');
  var badge = document.getElementById('webhook-badge');
  if (!feed) return;

  var svc = trackingProjects();
  if (!svc) {
    feed.innerHTML =
      '<div class="empty-state"><p>Activity feed unavailable.</p></div>';
    return;
  }

  feed.innerHTML =
    '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><p>Loading activity...</p></div>';

  var promises = [svc.getActivity().catch(function () { return []; })];
  if (projectId) {
    promises.push(
      svc.getCommits(projectId).catch(function () {
        return null;
      }),
    );
  }

  Promise.all(promises).then(function (results) {
    var activity = Array.isArray(results[0]) ? results[0] : results[0]?.data || [];
    var commitsPayload = results[1]?.data || results[1];
    var commits =
      commitsPayload && Array.isArray(commitsPayload.commits)
        ? commitsPayload.commits
        : [];

    var events = [];
    activity.forEach(function (evt) {
      events.push({
        type: evt.type || 'activity',
        message: evt.message || evt.title || evt.summary || 'Activity update',
        at: evt.createdAt || evt.timestamp,
      });
    });
    commits.slice(0, 10).forEach(function (c) {
      events.push({
        type: 'commit',
        message: c.message || c.sha || 'Commit',
        at: c.committedAt || c.date,
      });
    });

    if (!events.length) {
      if (badge) {
        badge.innerHTML = '<i class="fa-solid fa-circle"></i> Quiet';
      }
      feed.innerHTML =
        '<div class="empty-state"><i class="fa-solid fa-code-branch"></i><p>No recent activity yet.</p><p class="empty-state-sub">Connect GitHub and submit milestones to see updates here.</p></div>';
      return;
    }

    if (badge) {
      badge.innerHTML = '<i class="fa-solid fa-circle"></i> Live';
      badge.style.background = 'rgba(34,197,94,0.15)';
      badge.style.color = '#22c55e';
    }

    feed.innerHTML =
      '<div class="webhook-list">' +
      events
        .slice(0, 12)
        .map(function (evt) {
          var icon =
            evt.type === 'commit' ? 'fa-code-commit wh-commit' : 'fa-bell wh-pr';
          return (
            '<div class="webhook-item ' +
            (evt.type === 'commit' ? 'wh-commit' : 'wh-pr') +
            '"><i class="fa-solid ' +
            icon +
            ' wh-icon"></i><div><strong>' +
            escapeHtml(evt.message) +
            '</strong><div style="font-size:0.75rem;color:var(--text-secondary);">' +
            escapeHtml(formatDateTime(evt.at)) +
            '</div></div></div>'
          );
        })
        .join('') +
      '</div>';
  });
}

window.NibrasProjectsCore = Object.freeze({
  init: initProjectsCore,
  loadProjectsOverview: loadProjectsOverview,
  renderActivityFeed: renderActivityFeed,
  renderGroupWorkspace: renderGroupWorkspace,
  state: projectsPageState,
});
