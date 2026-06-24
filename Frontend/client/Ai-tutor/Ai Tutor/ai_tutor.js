window.NibrasReact.run(() => {
  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const chatbotService = () => window.NibrasServices?.chatbotService || null;
  const questionService = () => window.NibrasServices?.questionService || null;

  const ASK_MIN = 10;
  const ASK_MAX = 500;
  const sharedAuth = window.NibrasShared?.auth || null;
  const sharedUiStates = window.NibrasShared?.uiStates || null;

  const quickTopics = [
    {
      title: 'Binary Search',
      sub: 'Algorithms',
      icon: 'fa-solid fa-magnifying-glass',
      iconColor: 'text-primary',
      bg: 'transparent',
    },
    {
      title: 'Tree Traversal',
      sub: 'Data Structures',
      icon: 'fa-solid fa-network-wired',
      iconColor: '#16a34a',
      bg: '#dcfce7',
    },
    {
      title: 'Dynamic Programming',
      sub: 'Problem Solving',
      icon: 'fa-solid fa-bolt',
      iconColor: '#ca8a04',
      bg: '#fef9c3',
    },
    {
      title: 'Graph Algorithms',
      sub: 'Algorithms',
      icon: 'fa-solid fa-chart-simple',
      iconColor: '#2563eb',
      bg: '#dbeafe',
    },
    {
      title: 'Linked Lists',
      sub: 'Data Structures',
      icon: 'fa-solid fa-link',
      iconColor: '#4b5563',
      bg: '#f3f4f6',
    },
    {
      title: 'Greedy Algorithms',
      sub: 'Problem Solving',
      icon: 'fa-solid fa-bullseye',
      iconColor: '#dc2626',
      bg: '#fee2e2',
    },
  ];

  const popularTopics = [
    'Algorithms',
    'Data Structures',
    'Complexity Analysis',
    'Problem Solving',
    'Code Optimization',
  ];

  // --- DOM refs ---
  const topicContainer = document.getElementById('quick-topics-container');
  const recentContainer = document.getElementById('recent-ai-container');
  const statsContainer = document.getElementById('stats-container');
  const popContainer = document.getElementById('pop-topics-container');
  const askAiBtn = document.getElementById('ask-ai-btn');
  const newChatBtn = document.getElementById('new-chat-btn');
  const questionInput = document.getElementById('ai-question-input');
  const interactionArea = document.getElementById('ai-interaction-area');
  const interactionTitle = document.getElementById('interaction-title');
  const choiceActions = document.getElementById('choice-actions');
  const viewAnswerBtn = document.getElementById('view-answer-btn');
  const getHintBtn = document.getElementById('get-hint-btn');
  const hintsContainer = document.getElementById('hints-container');
  const fullAnswerContainer = document.getElementById('full-answer-container');
  const citationsContainer = document.getElementById('citations-container');
  const followUpsContainer = document.getElementById('follow-ups-container');
  const postAnswerActions = document.getElementById('post-answer-actions');
  const resetChatBtn = document.getElementById('reset-chat-btn');
  const pushCommunityBtn = document.getElementById('push-community-btn');
  const communityModal = document.getElementById('community-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const confirmPushBtn = document.getElementById('confirm-push-btn');
  const modalQuestionDisplay = document.getElementById(
    'modal-question-display',
  );
  const modalAnswerDisplay = document.getElementById('modal-answer-display');
  const modalTitleInput = document.getElementById('modal-title-input');
  const modalTagsDisplay = document.getElementById('modal-tags-display');
  const xaiBtn = document.getElementById('xai-btn');
  const explainModal = document.getElementById('explain-modal');
  const explainLoading = document.getElementById('explain-loading');
  const explainContent = document.getElementById('explain-content');
  const explainError = document.getElementById('explain-error');

  // --- Session state ---
  let sessionHints = [];
  let sessionFinalAnswer = '';
  let sessionQuestion = '';
  let sessionTags = [];
  let sessionXai = null;
  let sessionFollowUps = [];
  let sessionCitations = [];
  let sessionMatchedQuestionId = null;
  let sessionMatchedQuestion = null;
  let currentHintIndex = 0;
  let modalReturnFocus = null;
  let conversationId = null;
  let chatHistory = [];
  let useStreaming = false;

  const getAuthToken = () =>
    sharedAuth?.getToken?.() || window.NibrasApi?.getToken?.() || null;

  const getErrorMessage = (err) => {
    const p = err?.payload;
    if (p && Array.isArray(p.errors) && p.errors.length) {
      return p.errors.map((e) => e.message || e.msg).join(' ');
    }
    return err?.message || 'Something went wrong.';
  };

  const resolveUiStateFromError = (error, fallbackMessage) => {
    if (sharedUiStates?.fromError) {
      return sharedUiStates.fromError(error, fallbackMessage);
    }
    return {
      state: 'error',
      message: error?.message || fallbackMessage || 'Request failed',
    };
  };

  const ensureTutorNotice = () => {
    let notice = document.getElementById('ai-tutor-state-notice');
    if (notice) return notice;
    notice = document.createElement('div');
    notice.id = 'ai-tutor-state-notice';
    notice.hidden = true;
    const initialActions = document.getElementById('initial-actions');
    if (initialActions?.parentNode) {
      initialActions.parentNode.insertBefore(notice, initialActions);
    } else {
      document.querySelector('.input-card')?.appendChild(notice);
    }
    return notice;
  };

  const setTutorNotice = (state, message) => {
    const notice = ensureTutorNotice();
    if (!notice) return;
    notice.setAttribute(
      'role',
      state === 'error' || state === 'unauthorized' || state === 'forbidden'
        ? 'alert'
        : 'status',
    );
    if (sharedUiStates?.render) {
      sharedUiStates.render(notice, { state, message, mode: 'notice' });
      return;
    }
    if (!message) {
      notice.hidden = true;
      notice.textContent = '';
      return;
    }
    notice.hidden = false;
    notice.textContent = message;
    const isErrorTone =
      state === 'error' || state === 'unauthorized' || state === 'forbidden';
    const isSuccessTone = state === 'success';
    notice.style.marginTop = '12px';
    notice.style.padding = '10px 12px';
    notice.style.borderRadius = '10px';
    notice.style.border = '1px solid';
    notice.style.fontSize = '13px';
    notice.style.color = isErrorTone
      ? '#ef4444'
      : isSuccessTone
        ? '#10b981'
        : 'var(--text-secondary)';
    notice.style.borderColor = isErrorTone
      ? 'rgba(239, 68, 68, 0.35)'
      : isSuccessTone
        ? 'rgba(16, 185, 129, 0.35)'
        : 'var(--border-color)';
    notice.style.backgroundColor = isErrorTone
      ? 'rgba(239, 68, 68, 0.08)'
      : isSuccessTone
        ? 'rgba(16, 185, 129, 0.08)'
        : 'var(--bg-secondary)';
  };

  const normalizeHint = (h) => {
    if (h == null) return '';
    if (typeof h === 'string') return h;
    return String(h);
  };

  const formatRelativeTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const AI_PUBLISHED_QUESTIONS_KEY = 'nibras_ai_published_questions_v1';
  const rememberAiPublishedQuestion = (questionId, answerText) => {
    if (!questionId) return;
    try {
      const parsed = JSON.parse(
        localStorage.getItem(AI_PUBLISHED_QUESTIONS_KEY) || '{}',
      );
      parsed[String(questionId)] = { updatedAt: Date.now() };
      localStorage.setItem(AI_PUBLISHED_QUESTIONS_KEY, JSON.stringify(parsed));
    } catch (_) {
      // storage unavailable
    }
  };

  const extractPublishQuestionId = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    return (
      payload.questionId ||
      payload.data?.questionId ||
      payload.data?.question?.id ||
      payload.data?.question?._id ||
      payload.question?.id ||
      payload.question?._id ||
      null
    );
  };

  // --- Render static UI ---
  const renderQuickTopics = () => {
    if (!topicContainer) return;
    topicContainer.innerHTML = '';
    quickTopics.forEach((t) => {
      let style =
        t.bg === 'transparent'
          ? ''
          : `background-color:${t.bg}; color:${t.iconColor};`;
      if (t.title === 'Binary Search') {
        style = 'background-color: var(--tag-bg); color: var(--text-primary);';
      }
      topicContainer.innerHTML += `
        <button type="button" class="topic-card" data-topic-title="${escapeHtml(t.title)}" aria-label="Try topic: ${escapeHtml(t.title)}">
          <div class="topic-icon" style="${style}"><i class="${t.icon}"></i></div>
          <div class="topic-info"><h4>${escapeHtml(t.title)}</h4><span>${escapeHtml(t.sub)}</span></div>
        </button>`;
    });
  };

  const renderPopularTopics = () => {
    if (!popContainer) return;
    popContainer.innerHTML = '';
    popularTopics.forEach((p) => {
      popContainer.innerHTML += `<button type="button" class="pop-link" data-pop-topic="${escapeHtml(p)}">${escapeHtml(p)}</button>`;
    });
  };

  const renderRecentConversations = (conversations) => {
    if (!recentContainer) return;
    recentContainer.innerHTML = '';
    const list = Array.isArray(conversations) ? conversations : [];
    if (!list.length) {
      recentContainer.innerHTML =
        '<p style="color:var(--text-secondary);font-size:0.9rem;padding:8px 0;">No conversations yet. Ask your first question!</p>';
      return;
    }
    list.slice(0, 5).forEach((conv) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-conv-item';
      btn.style.cssText =
        'display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:0;';
      btn.dataset.conversationId = conv.id;
      btn.innerHTML = `
        <h4>${escapeHtml(conv.title || 'Untitled')}</h4>
        <div class="ai-meta">
          <span>${conv.messageCount || 0} messages</span>
          <span>• <i class="fa-regular fa-clock"></i> ${escapeHtml(formatRelativeTime(conv.updatedAt))}</span>
        </div>`;
      recentContainer.appendChild(btn);
    });
  };

  const renderStats = (metrics) => {
    if (!statsContainer) return;
    const m = metrics || {};
    const total = Number(m.totalQuestions) || 0;
    const streak = Number(m.streakDays) || 0;
    const topics = Array.isArray(m.topTags) ? m.topTags.length : 0;
    const stats = [
      {
        label: 'Questions Asked',
        val: String(total),
        pct: Math.min(100, total),
        color: 'var(--stat-bar-blue)',
      },
      {
        label: 'Day Streak',
        val: `${streak} days`,
        pct: Math.min(100, streak * 10),
        color: 'var(--stat-bar-green)',
      },
      {
        label: 'Topics Covered',
        val: String(topics),
        pct: Math.min(100, topics * 8),
        color: 'var(--stat-bar-purple)',
      },
    ];
    statsContainer.innerHTML = '';
    stats.forEach((s) => {
      statsContainer.innerHTML += `
        <div class="stat-row">
          <div class="stat-head"><span>${escapeHtml(s.label)}</span><span class="stat-val">${escapeHtml(s.val)}</span></div>
          <div class="stat-track"><div class="stat-fill" style="width:${s.pct}%;background-color:${s.color};"></div></div>
        </div>`;
    });
  };

  const loadTutorAccess = async () => {
    if (!getAuthToken()) return;
    const credSvc = window.NibrasServices?.aiCredentialsService;
    if (!credSvc?.get) return;
    try {
      const cred = await credSvc.get();
      if (cred?.configured || cred?.tutorAvailable) return;
      setTutorNotice(
        'info',
        'Add an API key in Settings → AI Integration to use the AI Tutor. Groq offers a free tier.',
      );
    } catch (_) {
      // ignore credential probe failures
    }
  };

  const loadSidebarData = async () => {
    const svc = chatbotService();
    if (!svc || !getAuthToken()) {
      renderRecentConversations([]);
      renderStats(null);
      return;
    }
    try {
      const [conversations, insights] = await Promise.all([
        svc.listConversations({ limit: 10 }).catch(() => []),
        svc.getInsights().catch(() => null),
      ]);
      renderRecentConversations(conversations);
      renderStats(insights?.hardMetrics || null);
      if (
        insights?.aiSummary?.overallAssessment &&
        !insights?.hardMetrics?.totalQuestions
      ) {
        renderStats({ totalQuestions: 0, streakDays: 0, topTags: [] });
      }
    } catch (_) {
      renderRecentConversations([]);
      renderStats(null);
    }
  };

  const setAskLoading = (loading) => {
    if (!askAiBtn) return;
    if (!askAiBtn.dataset.defaultHtml) {
      askAiBtn.dataset.defaultHtml = askAiBtn.innerHTML;
    }
    askAiBtn.disabled = loading;
    askAiBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    askAiBtn.innerHTML = loading
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Thinking...'
      : askAiBtn.dataset.defaultHtml;
  };

  const resetSession = (keepConversation) => {
    sessionHints = [];
    sessionFinalAnswer = '';
    sessionQuestion = '';
    sessionTags = [];
    sessionXai = null;
    sessionFollowUps = [];
    sessionCitations = [];
    sessionMatchedQuestionId = null;
    sessionMatchedQuestion = null;
    currentHintIndex = 0;
    if (!keepConversation) {
      conversationId = null;
      chatHistory = [];
    }
    ['community-match-banner', 'community-match-banner-full'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (citationsContainer) citationsContainer.style.display = 'none';
    if (followUpsContainer) followUpsContainer.style.display = 'none';
    if (newChatBtn)
      newChatBtn.style.display = conversationId ? 'inline-flex' : 'none';
  };

  const ensureConversation = async (title) => {
    const svc = chatbotService();
    if (!svc) throw new Error('AI Tutor service unavailable.');
    if (conversationId) return conversationId;
    const conv = await svc.createConversation(
      (title || 'New conversation').slice(0, 120),
    );
    conversationId = conv?.id || null;
    if (newChatBtn)
      newChatBtn.style.display = conversationId ? 'inline-flex' : 'none';
    return conversationId;
  };

  const loadMatchedQuestion = async (questionId) => {
    if (!questionId) return null;
    const qs = questionService();
    if (!qs?.getById) return null;
    try {
      const payload = await qs.getById(questionId);
      return (
        payload?.question ||
        payload?.data?.question ||
        (payload?.id || payload?._id ? payload : null)
      );
    } catch (_) {
      return null;
    }
  };

  const renderCitations = () => {
    if (!citationsContainer) return;
    citationsContainer.innerHTML = '';
    if (!sessionCitations.length) {
      citationsContainer.style.display = 'none';
      return;
    }
    citationsContainer.style.display = 'block';
    let html =
      '<div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary);"><i class="fa-solid fa-book-open"></i> Sources</div><div style="display:flex;flex-direction:column;gap:6px;">';
    sessionCitations.forEach((c) => {
      const title = escapeHtml(c.title || 'Community Q&A');
      let url = c.url ? String(c.url) : '#';
      const citationIdMatch = url.match(/\/community\/q\/([^/?#]+)/);
      if (citationIdMatch) {
        url = `../../Community/QuestionID/question.html?id=${encodeURIComponent(citationIdMatch[1])}`;
      }
      url = escapeHtml(url);
      html += `<a href="${url}" target="_blank" rel="noopener" style="font-size:0.9rem;color:var(--accent-blue);">${title}</a>`;
    });
    html += '</div>';
    citationsContainer.innerHTML = html;
  };

  const renderFollowUps = () => {
    if (!followUpsContainer) return;
    followUpsContainer.innerHTML = '';
    if (!sessionFollowUps.length) {
      followUpsContainer.style.display = 'none';
      return;
    }
    followUpsContainer.style.display = 'block';
    let html =
      '<div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary);">Suggested follow-ups</div><div style="display:flex;flex-wrap:wrap;gap:8px;">';
    sessionFollowUps.forEach((q, idx) => {
      html += `<button type="button" class="pop-link follow-up-chip" data-follow-up-idx="${idx}">${escapeHtml(q)}</button>`;
    });
    html += '</div>';
    followUpsContainer.innerHTML = html;
    followUpsContainer.querySelectorAll('.follow-up-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-follow-up-idx'));
        const text = sessionFollowUps[idx];
        if (text && questionInput) {
          questionInput.value = text;
          questionInput.disabled = false;
          askAiBtn.parentElement.style.display = 'flex';
          interactionArea.style.display = 'none';
          resetSession(true);
          questionInput.focus();
        }
      });
    });
  };

  const renderFullAnswer = (streamingText) => {
    if (!fullAnswerContainer) return;
    const text = streamingText != null ? streamingText : sessionFinalAnswer;
    fullAnswerContainer.innerHTML = '';
    const head = document.createElement('h4');
    head.style.marginBottom = '10px';
    head.innerHTML =
      '<i class="fa-solid fa-robot" style="color:#2563eb;"></i> AI Explanation:';
    const body = document.createElement('div');
    body.className = 'markdown-body';
    body.dir = 'auto';
    body.innerHTML = DOMPurify.sanitize(
      marked.parse(text || '*No answer text.*'),
    );
    fullAnswerContainer.appendChild(head);
    fullAnswerContainer.appendChild(body);
    renderCitations();
    renderFollowUps();
  };

  const renderMatchBanner = (targetBanner) => {
    if (!sessionMatchedQuestion || !targetBanner) return;
    const questionId = sessionMatchedQuestion._id || sessionMatchedQuestion.id;
    const questionUrl = `../../Community/QuestionID/question.html?id=${encodeURIComponent(questionId)}`;
    const authorName =
      sessionMatchedQuestion.author?.name ||
      sessionMatchedQuestion.author ||
      'Unknown';
    const votesCount =
      sessionMatchedQuestion.votesCount ?? sessionMatchedQuestion.votes ?? 0;
    const answersCount =
      sessionMatchedQuestion.answersCount ??
      sessionMatchedQuestion.answers ??
      0;

    const titleEl = targetBanner.querySelector('.match-question-title');
    const metaEl = targetBanner.querySelector('.match-question-meta');
    const viewBtn = targetBanner.querySelector('.btn-match-view');

    if (titleEl) {
      titleEl.textContent = sessionMatchedQuestion.title || 'Untitled Question';
      titleEl.href = questionUrl;
      titleEl.dir = 'auto';
    }
    if (metaEl) {
      metaEl.dir = 'auto';
      metaEl.innerHTML =
        `<span><i class="fa-solid fa-user"></i> ${escapeHtml(authorName)}</span>` +
        `<span><i class="fa-solid fa-caret-up"></i> ${votesCount} votes</span>` +
        `<span><i class="fa-regular fa-comment-dots"></i> ${answersCount} answers</span>`;
    }
    if (viewBtn) viewBtn.href = questionUrl;
    targetBanner.style.display = 'flex';
  };

  const applyAskResponse = async (data) => {
    sessionFinalAnswer = String(data.finalAnswer || data.answer || '').trim();
    sessionTags = Array.isArray(data.tags) ? data.tags : [];
    sessionXai = data.xai || null;
    sessionFollowUps = Array.isArray(data.followUps) ? data.followUps : [];
    sessionCitations = Array.isArray(data.citations) ? data.citations : [];
    const rawHints = Array.isArray(data.hints) ? data.hints : [];
    sessionHints = rawHints.map(normalizeHint).filter((h) => {
      return h && !/no hints needed/i.test(h);
    });
    currentHintIndex = 0;
    sessionMatchedQuestionId =
      data.communityQuestionId || data.communityQuestion || null;
    sessionMatchedQuestion = null;

    if (data.refused) {
      sessionFinalAnswer =
        sessionFinalAnswer ||
        'This question is outside the scope of this platform.';
      sessionHints = [];
    }

    if (sessionMatchedQuestionId) {
      sessionMatchedQuestion = await loadMatchedQuestion(
        sessionMatchedQuestionId,
      );
    }

    chatHistory.push({ role: 'user', content: sessionQuestion });
    if (sessionFinalAnswer) {
      chatHistory.push({ role: 'assistant', content: sessionFinalAnswer });
    }

    const matchBanner = document.getElementById('community-match-banner');
    const matchBannerFull = document.getElementById(
      'community-match-banner-full',
    );
    if (matchBanner) matchBanner.style.display = 'none';
    if (matchBannerFull) matchBannerFull.style.display = 'none';
    if (sessionMatchedQuestion && matchBanner) {
      renderMatchBanner(matchBanner);
    }

    askAiBtn.parentElement.style.display = 'none';
    interactionArea.style.display = 'block';

    if (data.refused) {
      choiceActions.style.display = 'none';
      interactionTitle.style.display = 'none';
      renderFullAnswer();
      fullAnswerContainer.style.display = 'block';
      postAnswerActions.style.display = 'flex';
      getHintBtn.style.display = 'none';
    } else {
      choiceActions.style.display = 'flex';
      interactionTitle.style.display = 'block';
      hintsContainer.innerHTML = '';
      fullAnswerContainer.style.display = 'none';
      postAnswerActions.style.display = 'none';
      getHintBtn.style.display = sessionHints.length ? 'inline-block' : 'none';
    }

    if (data.persistenceWarning) {
      setTutorNotice('info', data.persistenceWarning);
    }

    loadSidebarData();
  };

  const handleAsk = async () => {
    const trimmed = questionInput?.value?.trim() || '';
    if (!trimmed) {
      setTutorNotice('error', 'Please enter a question first.');
      return;
    }
    if (trimmed.length < ASK_MIN) {
      setTutorNotice(
        'error',
        `Your question must be at least ${ASK_MIN} characters.`,
      );
      return;
    }
    if (trimmed.length > ASK_MAX) {
      setTutorNotice(
        'error',
        `Your question cannot exceed ${ASK_MAX} characters.`,
      );
      return;
    }
    if (!getAuthToken()) {
      setTutorNotice('unauthorized', 'Please sign in to use the AI Tutor.');
      return;
    }
    const svc = chatbotService();
    if (!svc) {
      setTutorNotice(
        'error',
        'AI Tutor service is not loaded. Refresh the page.',
      );
      return;
    }

    setAskLoading(true);
    questionInput.disabled = true;
    setTutorNotice('loading', 'Generating your AI Tutor response...');
    sessionQuestion = trimmed;

    try {
      await ensureConversation(trimmed);

      const askOptions = {
        history: chatHistory,
        conversationId,
      };

      let data = null;

      if (useStreaming && typeof svc.askStream === 'function') {
        try {
          askAiBtn.parentElement.style.display = 'none';
          interactionArea.style.display = 'block';
          choiceActions.style.display = 'none';
          interactionTitle.style.display = 'none';
          fullAnswerContainer.style.display = 'block';
          postAnswerActions.style.display = 'flex';
          let streamText = '';
          data = await svc.askStream(trimmed, {
            ...askOptions,
            onToken: (_chunk, full) => {
              streamText = full;
              renderFullAnswer(streamText);
            },
          });
          if (!data?.finalAnswer && streamText) {
            data = svc.normalizeAskResponse
              ? svc.normalizeAskResponse({ answer: streamText })
              : {
                  finalAnswer: streamText,
                  hints: [],
                  tags: [],
                  refused: false,
                };
          }
        } catch (_) {
          data = await svc.ask(trimmed, askOptions);
        }
      } else {
        data = await svc.ask(trimmed, askOptions);
      }

      if (!data) throw new Error('Unexpected response from server.');
      await applyAskResponse(data);
      setTutorNotice('info', '');
    } catch (err) {
      questionInput.disabled = false;
      const uiState = resolveUiStateFromError(err, getErrorMessage(err));
      setTutorNotice(uiState.state, uiState.message);
    } finally {
      setAskLoading(false);
      questionInput.disabled = true;
    }
  };

  const resumeConversation = async (id) => {
    const svc = chatbotService();
    if (!svc || !id) return;
    try {
      const conv = await svc.getConversation(id);
      conversationId = conv.id;
      chatHistory = (conv.messages || [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
      const lastUser = [...chatHistory]
        .reverse()
        .find((m) => m.role === 'user');
      const lastAssistant = [...chatHistory]
        .reverse()
        .find((m) => m.role === 'assistant');
      if (lastUser) sessionQuestion = lastUser.content;
      if (lastAssistant) {
        sessionFinalAnswer = lastAssistant.content;
        sessionXai = lastAssistant.xai || null;
      }
      questionInput.value = '';
      questionInput.disabled = true;
      askAiBtn.parentElement.style.display = 'none';
      interactionArea.style.display = 'block';
      choiceActions.style.display = 'none';
      interactionTitle.style.display = 'none';
      renderFullAnswer();
      fullAnswerContainer.style.display = 'block';
      postAnswerActions.style.display = 'flex';
      if (newChatBtn) newChatBtn.style.display = 'inline-flex';
      setTutorNotice('info', `Resumed "${conv.title || 'conversation'}".`);
    } catch (err) {
      setTutorNotice('error', getErrorMessage(err));
    }
  };

  const startNewConversation = () => {
    questionInput.value = '';
    questionInput.disabled = false;
    askAiBtn.parentElement.style.display = 'flex';
    interactionArea.style.display = 'none';
    resetSession(false);
    setAskLoading(false);
    setTutorNotice('info', 'Started a new conversation.');
    if (newChatBtn) newChatBtn.style.display = 'none';
  };

  const renderXaiModal = () => {
    if (!sessionXai) {
      setTutorNotice('empty', 'No AI explanation available for this answer.');
      return;
    }
    explainModal.style.display = 'flex';
    explainModal.setAttribute('aria-hidden', 'false');
    explainLoading.style.display = 'none';
    explainContent.style.display = '';
    explainError.style.display = 'none';

    const xaiData =
      typeof sessionXai === 'string' ? JSON.parse(sessionXai) : sessionXai;
    let xaiHtml = '';
    if (xaiData.reasoning) {
      xaiHtml += `<div style="margin-bottom:1rem;"><strong style="font-size:0.9rem;display:block;margin-bottom:6px;">Reasoning</strong><p style="color:var(--text-secondary);line-height:1.6;font-size:0.9rem;">${escapeHtml(xaiData.reasoning)}</p></div>`;
    }
    if (xaiData.concepts_used?.length) {
      xaiHtml +=
        '<div style="margin-bottom:1rem;"><strong style="font-size:0.9rem;display:block;margin-bottom:8px;">Concepts Used</strong><div style="display:flex;flex-wrap:wrap;gap:6px;">';
      xaiData.concepts_used.forEach((c) => {
        xaiHtml += `<span style="background:var(--tag-bg);color:var(--text-primary);padding:4px 12px;border-radius:6px;font-size:0.85rem;">${escapeHtml(c)}</span>`;
      });
      xaiHtml += '</div></div>';
    }
    if (xaiData.might_be_unclear?.length) {
      xaiHtml +=
        '<div><strong style="font-size:0.9rem;display:block;margin-bottom:8px;">Might Be Unclear — click to explain</strong><div style="display:flex;flex-wrap:wrap;gap:6px;">';
      xaiData.might_be_unclear.forEach((term, idx) => {
        xaiHtml += `<button type="button" class="explain-term-btn" data-term-idx="${idx}" style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:4px 12px;border-radius:6px;font-size:0.85rem;border:none;cursor:pointer;">${escapeHtml(term)}</button>`;
      });
      xaiHtml += '</div></div>';
    }
    explainContent.innerHTML = DOMPurify.sanitize(
      xaiHtml ||
        '<p style="color:var(--text-secondary);">No explanation available.</p>',
    );

    explainContent.querySelectorAll('.explain-term-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-term-idx'));
        const term = xaiData.might_be_unclear[idx];
        if (!term) return;
        const svc = chatbotService();
        if (!svc?.explainTerm) return;
        explainLoading.style.display = 'block';
        explainContent.style.display = 'none';
        explainError.style.display = 'none';
        try {
          const result = await svc.explainTerm({
            term,
            context: sessionFinalAnswer,
            conversationId,
          });
          explainLoading.style.display = 'none';
          explainContent.style.display = 'block';
          let html = `<h4 style="margin-bottom:8px;">${escapeHtml(result.term || term)}</h4>`;
          html += `<p style="color:var(--text-secondary);line-height:1.6;">${escapeHtml(result.explanation || '')}</p>`;
          if (result.example) {
            html += `<p style="margin-top:12px;font-size:0.9rem;"><strong>Example:</strong> ${escapeHtml(result.example)}</p>`;
          }
          explainContent.innerHTML = DOMPurify.sanitize(html);
        } catch (err) {
          explainLoading.style.display = 'none';
          explainError.style.display = 'block';
          explainError.textContent = getErrorMessage(err);
        }
      });
    });
  };

  // --- Event listeners ---
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      document
        .querySelectorAll('.nav-link')
        .forEach((n) => n.classList.remove('active'));
      link.classList.add('active');
    });
  });

  document.querySelectorAll('.ai-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('.ai-tab')
        .forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const themeBtn = document.getElementById('themeBtn');
  const themeIcon = themeBtn?.querySelector('i');
  const appLogo = document.getElementById('app-logo');
  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    if (themeIcon) themeIcon.className = 'fa-regular fa-sun';
    if (appLogo) appLogo.src = '/Assets/images/logo-dark.png';
  } else if (appLogo) {
    appLogo.src = '/Assets/images/logo-light.png';
  }
  themeBtn?.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    if (themeIcon) {
      themeIcon.className =
        next === 'dark' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    }
    if (appLogo) {
      appLogo.src =
        next === 'dark'
          ? '/Assets/images/logo-dark.png'
          : '/Assets/images/logo-light.png';
    }
  });

  renderQuickTopics();
  renderPopularTopics();
  loadSidebarData();
  void loadTutorAccess();

  topicContainer?.addEventListener('click', (event) => {
    const btn = event.target.closest('.topic-card[data-topic-title]');
    if (!btn || !questionInput) return;
    const title = btn.getAttribute('data-topic-title');
    questionInput.value = `Can you explain ${title} with an example?`;
    questionInput.focus();
  });

  popContainer?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-pop-topic]');
    if (!btn || !questionInput) return;
    questionInput.value = `I need help with ${btn.getAttribute('data-pop-topic')}. Where should I start?`;
    questionInput.focus();
  });

  recentContainer?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-conversation-id]');
    if (!btn) return;
    resumeConversation(btn.getAttribute('data-conversation-id'));
  });

  askAiBtn?.addEventListener('click', handleAsk);
  newChatBtn?.addEventListener('click', startNewConversation);

  viewAnswerBtn?.addEventListener('click', () => {
    choiceActions.style.display = 'none';
    interactionTitle.style.display = 'none';
    renderFullAnswer();
    fullAnswerContainer.style.display = 'block';
    const matchBannerFull = document.getElementById(
      'community-match-banner-full',
    );
    if (sessionMatchedQuestion && matchBannerFull) {
      renderMatchBanner(matchBannerFull);
    }
    postAnswerActions.style.display = 'flex';
  });

  getHintBtn?.addEventListener('click', () => {
    if (currentHintIndex >= sessionHints.length) return;
    const hintEl = document.createElement('div');
    hintEl.style.cssText =
      'padding:12px 16px;background-color:rgba(202,138,4,0.1);color:#ca8a04;border-radius:8px;border-left:4px solid #ca8a04;font-size:0.95rem;';
    hintEl.dir = 'auto';
    const strong = document.createElement('strong');
    strong.innerHTML = '<i class="fa-regular fa-lightbulb"></i> ';
    const span = document.createElement('span');
    span.innerHTML = DOMPurify.sanitize(
      marked.parseInline(sessionHints[currentHintIndex]),
    );
    hintEl.appendChild(strong);
    hintEl.appendChild(span);
    hintsContainer.appendChild(hintEl);
    currentHintIndex += 1;
    if (currentHintIndex >= sessionHints.length) {
      getHintBtn.style.display = 'none';
    }
  });

  resetChatBtn?.addEventListener('click', () => {
    questionInput.value = '';
    questionInput.disabled = false;
    askAiBtn.parentElement.style.display = 'flex';
    interactionArea.style.display = 'none';
    resetSession(true);
    setAskLoading(false);
    setTutorNotice('info', '');
  });

  pushCommunityBtn?.addEventListener('click', () => {
    if (!sessionQuestion || !sessionFinalAnswer) {
      setTutorNotice(
        'empty',
        'View the full answer before posting to the community.',
      );
      return;
    }
    modalQuestionDisplay.textContent = sessionQuestion;
    modalAnswerDisplay.className = 'modal-text-box markdown-body';
    modalAnswerDisplay.innerHTML = DOMPurify.sanitize(
      marked.parse(sessionFinalAnswer),
    );
    modalTitleInput.value = sessionQuestion.slice(0, 120);
    if (modalTagsDisplay) {
      modalTagsDisplay.innerHTML = sessionTags.length
        ? sessionTags
            .map(
              (tag) =>
                `<span style="background:var(--tag-bg,#f3f4f6);color:var(--accent-blue,#2563eb);border:1px solid var(--accent-blue,#2563eb);padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:600;">${escapeHtml(tag)}</span>`,
            )
            .join('')
        : '<span style="color:#9ca3af;font-size:0.9rem;">No tags generated</span>';
    }
    modalReturnFocus = document.activeElement;
    communityModal.style.display = 'flex';
    communityModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => modalTitleInput?.focus(), 40);
  });

  xaiBtn?.addEventListener('click', renderXaiModal);

  const closeExplainModal = () => {
    explainModal.style.display = 'none';
    explainModal.setAttribute('aria-hidden', 'true');
  };
  document
    .getElementById('close-explain-btn')
    ?.addEventListener('click', closeExplainModal);
  document
    .getElementById('close-explain-modal-btn')
    ?.addEventListener('click', closeExplainModal);
  explainModal?.addEventListener('click', (e) => {
    if (e.target === explainModal) closeExplainModal();
  });

  const closeModal = () => {
    communityModal.style.display = 'none';
    communityModal.setAttribute('aria-hidden', 'true');
    modalReturnFocus?.focus?.();
  };
  closeModalBtn?.addEventListener('click', closeModal);
  cancelModalBtn?.addEventListener('click', closeModal);
  communityModal?.addEventListener('click', (e) => {
    if (e.target === communityModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && communityModal?.style.display === 'flex') {
      closeModal();
    }
  });

  confirmPushBtn?.addEventListener('click', async () => {
    const title = modalTitleInput?.value?.trim();
    if (!title) {
      setTutorNotice('error', 'Please enter a title for your community post.');
      return;
    }
    if (!getAuthToken()) {
      setTutorNotice(
        'unauthorized',
        'Please sign in to publish to the community.',
      );
      return;
    }
    if (!sessionQuestion || !sessionFinalAnswer) {
      setTutorNotice(
        'error',
        'Missing question or answer. Start over and try again.',
      );
      return;
    }
    const svc = chatbotService();
    if (!svc) return;

    const defaultLabel = confirmPushBtn.innerHTML;
    confirmPushBtn.disabled = true;
    confirmPushBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...';
    setTutorNotice('loading', 'Publishing your AI answer to the community...');
    try {
      const payload = await svc.publish({
        title,
        question: sessionQuestion,
        finalAnswer: sessionFinalAnswer,
        tags: sessionTags,
      });
      const id = extractPublishQuestionId(payload);
      rememberAiPublishedQuestion(id, sessionFinalAnswer);
      closeModal();
      if (id) {
        const go = confirm(
          'Published to the community. Open the new question now?',
        );
        if (go) {
          window.location.href = `../../Community/QuestionID/question.html?id=${encodeURIComponent(id)}`;
        } else {
          setTutorNotice('success', 'Published successfully.');
        }
      } else {
        setTutorNotice('success', 'Published to the community successfully.');
      }
    } catch (err) {
      const uiState = resolveUiStateFromError(err, getErrorMessage(err));
      setTutorNotice(uiState.state, uiState.message);
    } finally {
      confirmPushBtn.disabled = false;
      confirmPushBtn.innerHTML = defaultLabel;
    }
  });
});
