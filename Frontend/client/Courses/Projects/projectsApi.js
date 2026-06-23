(function initProjectsApi(global) {
  const PATHS = Object.freeze({
    DASHBOARD_STUDENT: '/v1/tracking/dashboard/student',
    DASHBOARD_HOME: '/v1/tracking/dashboard/home',
    SUBMISSIONS_BY_MILESTONE:
      '/v1/tracking/milestones/{milestoneId}/submissions',
    SUBMISSION_DETAIL: '/v1/tracking/submissions/{submissionId}',
    SUBMISSION_REVIEW: '/v1/tracking/submissions/{submissionId}/review',
  });

  const RUNTIME_ORIGIN = /^https?:/i.test(global.location?.origin || '')
    ? String(global.location.origin).replace(/\/+$/, '')
    : '';

  const DEFAULT_BACKEND_URL =
    global.NibrasShared?.resolveServiceUrl?.('tracking') ||
    global.NibrasApi?.resolveServiceUrl?.('tracking') ||
    global.NIBRAS_TRACKING_API_URL ||
    RUNTIME_ORIGIN;

  function createClient(options = {}) {
    const fetchImpl =
      options.fetchImpl ||
      (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error('Fetch is not available in this environment.');
    }

    const settings = {
      baseUrl: normalizeBaseUrl(options.baseUrl || DEFAULT_BACKEND_URL),
      getAuthToken:
        options.getAuthToken ||
        (() =>
          global.NibrasShared?.auth?.getToken?.() ||
          global.NibrasApi?.getToken?.() ||
          global.localStorage?.getItem('token') ||
          null),
      fetchImpl,
    };

    return Object.freeze({
      getProjectsOverview: (request) =>
        getProjectsOverview(request || {}, settings),
      getMilestoneFeedbackHistory: (request) =>
        getMilestoneFeedbackHistory(request || {}, settings),
      submitMilestone: (payload) => submitMilestone(payload || {}, settings),
      getSubmissionStatus: (submissionId) =>
        getSubmissionStatus(submissionId, settings),
      getSubmissionReview: (submissionId) =>
        getSubmissionReview(submissionId, settings),
      getCliBaseUrl: () => toCliBaseUrl(settings.baseUrl),
    });
  }

  async function getProjectsOverview(request, settings) {
    const query = request.courseId
      ? `?courseId=${encodeURIComponent(request.courseId)}`
      : '';
    const data = await requestJsonWithCompatibility(
      [
        { path: `${PATHS.DASHBOARD_STUDENT}${query}` },
        {
          path: `${PATHS.DASHBOARD_HOME}${query ? `${query}&mode=student` : '?mode=student'}`,
        },
      ],
      { method: 'GET' },
      settings,
    );

    return { ok: true, data: normalizeDashboardPayload(data) };
  }

  async function getMilestoneFeedbackHistory(request, settings) {
    const milestoneId = String(request.milestoneId || '').trim();
    const projectId = String(request.projectId || '').trim();

    if (!milestoneId) {
      throw new Error('Milestone ID is required.');
    }

    const response = await requestJsonWithCompatibility(
      [
        {
          path: PATHS.SUBMISSIONS_BY_MILESTONE.replace(
            '{milestoneId}',
            encodeURIComponent(milestoneId),
          ),
        },
      ],
      { method: 'GET' },
      settings,
    );

    const submissions = normalizeSubmissions(
      Array.isArray(response) ? response : response?.submissions || [],
    );
    const latestSubmission = submissions[0] || null;
    let latestFeedback = null;

    if (latestSubmission?.id) {
      try {
        const review = await getSubmissionReview(latestSubmission.id, settings);
        latestFeedback = normalizeFeedback(review, latestSubmission);
      } catch {
        latestFeedback = normalizeFeedback(null, latestSubmission);
      }
    }

    return {
      ok: true,
      data: {
        submissions,
        latestFeedback,
      },
    };
  }

  async function submitMilestone(payload, settings) {
    const milestoneId = String(payload.milestoneId || '').trim();
    if (!milestoneId) {
      throw new Error('Milestone ID is required.');
    }

    const body = toTrackingSubmissionPayload(payload);

    const response = await requestJsonWithCompatibility(
      [
        {
          path: PATHS.SUBMISSIONS_BY_MILESTONE.replace(
            '{milestoneId}',
            encodeURIComponent(milestoneId),
          ),
        },
      ],
      { method: 'POST', body },
      settings,
    );

    return {
      ok: true,
      data: {
        submissionId: String(response?.id || response?.submissionId || ''),
        status: normalizeSubmissionStatus(
          response?.status || response?.data?.status || '',
        ),
        raw: response,
      },
    };
  }

  async function getSubmissionStatus(submissionId, settings) {
    const submissionKey = String(submissionId || '').trim();
    if (!submissionKey) {
      throw new Error('Submission ID is required.');
    }

    const response = await requestJsonWithCompatibility(
      [
        {
          path: PATHS.SUBMISSION_DETAIL.replace(
            '{submissionId}',
            encodeURIComponent(submissionKey),
          ),
        },
      ],
      { method: 'GET' },
      settings,
    );

    return {
      submissionId: submissionKey,
      status: normalizeSubmissionStatus(
        response?.status || response?.data?.status || '',
      ),
      raw: response,
    };
  }

  async function getSubmissionReview(submissionId, settings) {
    const submissionKey = String(submissionId || '').trim();
    if (!submissionKey) return null;

    return await requestJsonWithCompatibility(
      [
        {
          path: PATHS.SUBMISSION_REVIEW.replace(
            '{submissionId}',
            encodeURIComponent(submissionKey),
          ),
        },
      ],
      { method: 'GET' },
      settings,
      { allowNotFound: true },
    );
  }

  async function requestJsonWithCompatibility(
    candidates,
    options,
    settings,
    behavior = {},
  ) {
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        return await requestJson(candidates[i].path, options, settings);
      } catch (error) {
        if (error?.status === 404 && i < candidates.length - 1) continue;
        if (error?.status === 404 && behavior.allowNotFound) return null;
        throw error;
      }
    }
    throw new Error('API route not found.');
  }

  async function requestJson(path, options, settings) {
    const headers = { 'Content-Type': 'application/json' };
    const token = settings.getAuthToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const requestUrl = buildUrl(settings.baseUrl, path);
    let response;
    try {
      response = await settings.fetchImpl(requestUrl, {
        method: options.method || 'GET',
        headers,
        credentials: 'include',
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      throw createRequestError({
        message: buildNetworkErrorMessage(requestUrl, cause),
        code: 'NETWORK_OR_CORS',
        status: 0,
        url: requestUrl,
        cause,
      });
    }

    const parsed = await response.json().catch(() => null);
    if (!response.ok) {
      throw createRequestError({
        message:
          parsed?.message ||
          parsed?.error ||
          defaultStatusMessage(response.status),
        code: statusCodeToCode(response.status),
        status: response.status,
        payload: parsed,
        url: requestUrl,
      });
    }
    return parsed;
  }

  function createRequestError({
    message,
    code = 'REQUEST_FAILED',
    status = 0,
    payload = null,
    url = '',
    cause = null,
  }) {
    const error = new Error(message || 'Request failed');
    error.code = code;
    error.status = status;
    error.payload = payload;
    error.url = url;
    if (cause) error.cause = cause;
    return error;
  }

  function defaultStatusMessage(status) {
    if (status === 401) return 'Authentication required. Please sign in again.';
    if (status === 403)
      return 'You do not have permission to access this resource.';
    if (status === 404) return 'Requested resource was not found.';
    return `Request failed (${status})`;
  }

  function statusCodeToCode(status) {
    if (status === 401) return 'AUTH_REQUIRED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    return 'REQUEST_FAILED';
  }

  function buildNetworkErrorMessage(requestUrl, cause) {
    const rawMessage = String(cause?.message || '').toLowerCase();
    const origin = String(global.location?.origin || '').trim();
    if (
      rawMessage.includes('failed to fetch') ||
      rawMessage.includes('network')
    ) {
      return `Could not reach tracking API from ${origin || 'this page origin'}. This is usually CORS/network. Ensure this origin is allowed in NIBRAS_WEB_CORS_ORIGINS on the API deployment.`;
    }
    return `Could not reach the tracking API endpoint: ${requestUrl}`;
  }

  function normalizeDashboardPayload(payload) {
    const projects = Array.isArray(payload?.projects) ? payload.projects : [];
    const milestonesByProject = isObject(payload?.milestonesByProject)
      ? payload.milestonesByProject
      : {};
    const statsByProject = isObject(payload?.statsByProject)
      ? payload.statsByProject
      : {};

    const normalizedProjects = projects.map((project, index) => {
      const projectId = String(
        project?.id || project?.projectId || `project-${index + 1}`,
      );
      const milestoneList = Array.isArray(project?.milestones)
        ? project.milestones
        : Array.isArray(milestonesByProject[projectId])
          ? milestonesByProject[projectId]
          : [];

      const normalizedMilestones = milestoneList.map((milestone) =>
        normalizeMilestone(milestone, projectId),
      );
      const stats = normalizeProjectStats(
        statsByProject[projectId] || project?.stats,
        normalizedMilestones,
      );
      const deliveryMode = String(
        project?.deliveryMode || project?.type || '',
      ).toLowerCase();
      const cardMeta =
        project?.cardMeta ||
        project?.gradeWeight ||
        (deliveryMode === 'team' ? 'Team project' : 'Individual project');

      return {
        projectId,
        projectKey: String(project?.projectKey || project?.key || ''),
        title: String(project?.title || `Project ${index + 1}`),
        description: String(project?.description || ''),
        cardMeta: String(cardMeta),
        milestones: normalizedMilestones,
        stats,
        status: String(project?.status || 'open'),
      };
    });

    const statusCounters = normalizedProjects.reduce(
      (acc, project) => {
        acc.approved += Number(project.stats.approved || 0);
        acc.in_review += Number(project.stats.in_review || 0);
        acc.complete += Number(project.stats.complete || 0);
        return acc;
      },
      { approved: 0, in_review: 0, complete: 0 },
    );

    return {
      projects: normalizedProjects,
      statusCounters,
      pageError: String(payload?.pageError || ''),
    };
  }

  function normalizeMilestone(milestone, projectId) {
    const status = normalizeMilestoneStatus(
      milestone?.status || milestone?.state || 'pending',
    );

    return {
      apiMilestoneId: String(milestone?.id || milestone?.milestoneId || ''),
      apiProjectId: String(projectId || milestone?.projectId || ''),
      title: String(milestone?.title || 'Milestone'),
      dueLabel: String(
        milestone?.dueDateLabel ||
          milestone?.dueLabel ||
          formatDateLabel(milestone?.dueAt || milestone?.dueDate),
      ),
      dueAt: milestone?.dueAt || milestone?.dueDate || null,
      description: String(milestone?.description || ''),
      status,
    };
  }

  function normalizeProjectStats(stats, milestones) {
    const safeStats = isObject(stats) ? stats : {};
    const total = toInt(
      safeStats.total,
      toInt(safeStats.totalMilestones, milestones.length),
    );
    const approved = toInt(
      safeStats.approved,
      toInt(safeStats.approvedCount, 0),
    );
    const inReview = toInt(
      safeStats.in_review,
      toInt(
        safeStats.inReview,
        toInt(safeStats.submitted, toInt(safeStats.submittedCount, 0)),
      ),
    );
    const complete = toInt(
      safeStats.complete,
      Math.min(total, approved + inReview),
    );
    const completionRaw = toInt(
      safeStats.completion,
      toInt(
        safeStats.completionRate,
        total > 0 ? Math.round((approved / total) * 100) : 0,
      ),
    );

    return {
      total,
      approved,
      in_review: inReview,
      complete,
      completion: clamp(completionRaw, 0, 100),
    };
  }

  function normalizeSubmissions(submissions) {
    return submissions
      .map((entry) => ({
        id: String(entry?.id || entry?.submissionId || ''),
        status: normalizeMilestoneStatus(entry?.status || ''),
        statusLabel: String(entry?.statusLabel || entry?.status || 'Pending'),
        reviewerComment: String(entry?.summary || entry?.reviewerComment || ''),
        createdAt: entry?.createdAt || entry?.updatedAt || null,
        updatedAt: entry?.updatedAt || null,
      }))
      .sort((left, right) =>
        String(right.createdAt || '').localeCompare(
          String(left.createdAt || ''),
        ),
      );
  }

  function normalizeFeedback(review, latestSubmission) {
    if (!review) {
      return {
        status: latestSubmission?.status || 'pending',
        reviewerComment:
          latestSubmission?.reviewerComment || 'No feedback available yet.',
      };
    }

    return {
      status: normalizeMilestoneStatus(
        review?.status || latestSubmission?.status || 'pending',
      ),
      reviewerComment: String(
        review?.comment ||
          review?.summary ||
          latestSubmission?.reviewerComment ||
          'No feedback available yet.',
      ),
      score: typeof review?.score === 'number' ? review.score : null,
    };
  }

  function toTrackingSubmissionPayload(payload) {
    const submissionType = String(
      payload.submissionType || payload.submission_type || 'github',
    ).toLowerCase();
    const submissionValue = String(
      payload.resourceLink || payload.submissionValue || '',
    ).trim();
    const notes = String(payload.notes || '').trim();
    const branch = String(payload.branch || 'main').trim() || 'main';
    const commitSha = String(payload.commitSha || '').trim();
    const repoUrl = submissionType === 'github' ? submissionValue : '';

    return {
      submissionType,
      submissionValue,
      notes,
      repoUrl,
      branch,
      commitSha,
    };
  }

  function normalizeSubmissionStatus(status) {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();
    if (!normalized) return 'queued';
    if (['queued', 'pending'].includes(normalized)) return 'queued';
    if (['cloning'].includes(normalized)) return 'cloning';
    if (
      [
        'running',
        'verifying',
        'processing',
        'submitted',
        'under_review',
        'reviewing',
        'needs_review',
      ].includes(normalized)
    )
      return 'running';
    if (
      ['approved', 'graded', 'passed', 'complete', 'completed'].includes(
        normalized,
      )
    )
      return 'completed';
    if (['failed', 'error', 'rejected'].includes(normalized)) return 'failed';
    return normalized;
  }

  function normalizeMilestoneStatus(status) {
    const normalized = String(status || '')
      .trim()
      .toLowerCase();
    if (['approved', 'graded', 'passed'].includes(normalized))
      return 'approved';
    if (['complete', 'completed'].includes(normalized)) return 'complete';
    if (['changes_requested', 'needs_changes'].includes(normalized))
      return 'needs_changes';
    if (
      ['submitted', 'under_review', 'in_review', 'reviewing'].includes(
        normalized,
      )
    )
      return 'in_review';
    if (['open', 'pending', 'draft'].includes(normalized)) return 'pending';
    return normalized || 'pending';
  }

  function normalizeBaseUrl(value) {
    const base = String(value || '')
      .trim()
      .replace(/\/+$/, '');
    return base || RUNTIME_ORIGIN;
  }

  function toCliBaseUrl(baseUrl) {
    return String(baseUrl || '')
      .replace(/\/+$/, '')
      .replace(/\/v1$/i, '');
  }

  function buildUrl(baseUrl, path) {
    const base = normalizeBaseUrl(baseUrl);
    const cleanPath = String(path || '').startsWith('/')
      ? String(path || '')
      : `/${String(path || '')}`;
    if (/\/v1$/i.test(base) && /^\/v1(?:\/|$)/i.test(cleanPath)) {
      return `${base}${cleanPath.replace(/^\/v1/i, '')}`;
    }
    return `${base}${cleanPath}`;
  }

  function formatDateLabel(value) {
    if (!value) return 'TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'TBD';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function toInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  global.NibrasProjectsApi = { createClient, normalizeDashboardPayload };
})(window);
