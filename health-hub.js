(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const viewNames = ['today', 'ask', 'health', 'profile', 'symptoms', 'medications', 'appointments', 'results', 'timeline', 'documents'];
  const viewLabels = { today: 'Today', ask: 'Ask DoctorAI', health: 'My Health', profile: 'Profile', symptoms: 'Symptom Diary', medications: 'Medications', appointments: 'Appointments', results: 'Results', timeline: 'Timeline', documents: 'Documents' };
  const groupedHealthViews = ['health', 'symptoms', 'medications', 'appointments', 'results', 'timeline', 'documents'];
  const storagePrefix = 'doctorai-health-hub-';
  const storageConsentKey = storagePrefix + 'device-storage-consent';
  let deviceStorageChoice = '';
  let localStorageAllowed = false;
  try { deviceStorageChoice = localStorage.getItem(storageConsentKey) || ''; localStorageAllowed = deviceStorageChoice === 'yes'; } catch {}

  const read = (key, fallback) => {
    if (deviceStorageChoice === 'session') return fallback;
    try {
      const value = localStorage.getItem(storagePrefix + key);
      return value ? JSON.parse(value) : fallback;
    } catch { return fallback; }
  };
  const write = (key, value) => {
    if (!localStorageAllowed) return;
    try { localStorage.setItem(storagePrefix + key, JSON.stringify(value)); } catch {}
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const emptyProfile = { name: '', bloodType: '', allergies: '', conditions: '', notes: '' };
  const profileShortcutDefinitions = [
    { id: 'ask', label: 'Ask DoctorAI', description: 'Prepare a care conversation', iconName: 'ask', tone: 'cyan', view: 'ask' },
    { id: 'symptoms', label: 'Symptom log', description: 'Notice patterns over time', iconName: 'symptoms', tone: 'blue', view: 'symptoms' },
    { id: 'medications', label: 'Medications', description: 'Keep your routine together', iconName: 'medications', tone: 'cyan', view: 'medications' },
    { id: 'appointments', label: 'Appointments', description: 'Prepare for your next visit', iconName: 'appointments', tone: 'violet', view: 'appointments' },
    { id: 'results', label: 'Measurements', description: 'See your personal trends', iconName: 'results', tone: 'coral', view: 'results' },
    { id: 'documents', label: 'Documents', description: 'Keep chosen files close', iconName: 'documents', tone: 'mint', view: 'documents' },
    { id: 'health', label: 'Health details', description: 'Review what you have saved', iconName: 'health', tone: 'blue', view: 'health' },
    { id: 'privacy', label: 'Privacy controls', description: 'Storage, access and deletion', iconName: 'privacy', tone: 'purple', action: 'privacy' }
  ];
  const profileShortcutDefinition = id => profileShortcutDefinitions.find(item => item.id === id);
  const defaultProfileShortcutIds = ['ask', 'symptoms', 'medications', 'appointments', 'results', 'documents'];
  const normaliseProfileShortcuts = value => {
    const source = Array.isArray(value) ? value : defaultProfileShortcutIds;
    const clean = [];
    source.forEach(id => {
      const valueId = String(id || '').trim();
      if (profileShortcutDefinition(valueId) && !clean.includes(valueId)) clean.push(valueId);
    });
    return Array.isArray(value) ? clean.slice(0, 8) : [...defaultProfileShortcutIds];
  };
  let profileShortcuts = normaliseProfileShortcuts(read('profile-shortcuts', defaultProfileShortcutIds));
  const storedProfile = read('profile', emptyProfile);
  const profileIsDemoIdentity = /^emma\s+morgan$/i.test(String(storedProfile?.name || '').trim());
  const initialProfile = profileIsDemoIdentity ? clone(emptyProfile) : { ...emptyProfile, ...(storedProfile || {}) };
  function clearMedicationSafetyResults() {
    const localResult = $('[data-local-medication-db-result]');
    if (typeof medicationCheckController !== 'undefined') refreshMedicationCheckContext().catch(() => {});
    else if (localResult) localResult.replaceChildren();
  }

  const state = {
    medications: read('medications', []),
    appointments: read('appointments', []),
    providers: read('providers', []),
    timeline: read('timeline', []),
    documents: read('documents', []),
    measurements: read('measurements', []),
    tasks: read('tasks', []),
    profile: initialProfile,
    memoryEnabled: read('memory-enabled', false),
    memoryDetails: read('memory-details', [])
  };

  const els = {
    views: $$('[data-view-panel]'),
    nav: $$('.nav-item'),
    categories: $$('.category-tab'),
    date: $('#today-date'),
    todayGreeting: $('#today-greeting'),
    dailyInsight: $('#daily-insight-copy'),
    medicationToday: $('#today-medication-list'),
    medicationLibrary: $('#medication-library'),
    medOverview: $('#med-overview-value'),
    medicationsCount: $('#medications-count'),
    nextAppointmentValue: $('#next-appointment-value'),
    nextAppointmentMeta: $('#next-appointment-meta'),
    refillOverviewValue: $('#refill-overview-value'),
    refillOverviewMeta: $('#refill-overview-meta'),
    memoryOverviewMeta: $('#memory-overview-meta'),
    todayAppointmentPreview: $('#today-appointment-preview'),
    todayBpValue: $('#today-bp-value'),
    todayBpStatus: $('#today-bp-status'),
    todayBpUpdated: $('#today-bp-updated'),
    todayMiniChart: $('#today-mini-chart'),
    todayTrendPills: $('#today-trend-pills'),
    homePrescriptionAlert: $('#home-prescription-alert-status'),
    homePrescriptionLastChecked: $('#home-prescription-last-checked'),
    taskList: $('#today-task-list'),
    taskCount: $('#task-count'),
    activity: $('#mini-activity-list'),
    profileFacts: $('#profile-facts'),
    conditionsTags: $('#conditions-tags'),
    allergiesList: $('#allergies-list'),
    providersList: $('#providers-list'),
    emergencyBloodType: $('#emergency-blood-type'),
    memoryApproved: $('#memory-approved-list'),
    memoryToggle: $('#memory-toggle'),
    healthMemoryToggle: $('#health-memory-toggle'),
    chatMemoryStatus: $('#chat-memory-status'),
    memoryMiniStatus: $('#memory-mini-status'),
    memoryOverview: $('#memory-overview-value'),
    drawerMemoryStatus: $('#drawer-memory-status'),
    profilePageName: $('#profile-page-name'),
    profilePageEmail: $('#profile-page-email'),
    profilePageAvatar: $('#profile-page-avatar'),
    profileShortcutGrid: $('#profile-shortcuts-grid'),
    profileShortcutEdit: $('[data-profile-edit-shortcuts]'),
    profileShortcutEditNote: $('#profile-shortcuts-edit-note'),
    resultList: $('#result-list'),
    symptomList: $('#symptom-list'),
    symptomTriggers: $('#symptom-triggers'),
    symptomCount: $('#symptom-count'),
    symptomWeekCount: $('#symptom-week-count'),
    symptomDaysCount: $('#symptom-days-count'),
    symptomLastLog: $('#symptom-last-log'),
    symptomPatternCard: $('#symptom-pattern-card'),
    symptomPatternTitle: $('#symptom-pattern-title'),
    symptomPatternList: $('#symptom-pattern-list'),
    timelineList: $('#timeline-list'),
    documentsGrid: $('#documents-grid'),
    modal: $('#quick-modal'),
    modalTitle: $('#modal-title'),
    modalEyebrow: $('#modal-eyebrow'),
    modalBody: $('#modal-body'),
    medicationScannerModal: $('#medication-scanner-modal'),
    medicationImageConsent: $('[data-medication-image-consent]'),
    medicationScannerVideo: $('#medication-scanner-video'),
    medicationScannerStatus: $('#medication-scanner-status'),
    medicationCameraStage: $('.medication-camera-stage'),
    medicationCaptureButton: $('[data-medication-capture]'),
    privacyModal: $('#privacy-modal'),
    googleSigninModal: $('#google-signin-modal'),
    googleSigninButton: $('#google-signin-button'),
    googleSigninFallback: $('.google-signin-fallback'),
    googleSigninStatus: $('#google-signin-status'),
    drawer: $('#profile-drawer'),
    refillTitle: $('#refill-title'),
    refillCopy: $('#refill-copy'),
    refillProgress: $('#refill-progress'),
    refillMeta: $('#refill-meta'),
    refillAction: $('#refill-action'),
    medicationHistory: $('#medication-history-list'),
    appointmentsCount: $('#appointments-count'),
    upcomingAppointments: $('#upcoming-appointments-list'),
    pastAppointments: $('#past-appointments-list'),
    toast: $('#toast'),
    medicationAlertModal: $('#medication-alert-modal'),
    medicationAlertTitle: $('#medication-alert-title'),
    medicationAlertDescription: $('#medication-alert-description'),
    medicationAlertSource: $('#medication-alert-source'),
    chatForm: $('#chat-form'),
    chatInput: $('#chat-input'),
    chatCount: $('#chat-count'),
    chatMessages: $('#chat-messages'),
    chatWelcome: $('#chat-welcome'),
    conversationScroll: $('#conversation-scroll'),
    chatPanel: $('.conversation-panel'),
    chatStatus: $('#chat-status'),
    responseLengthInputs: $$('input[name="chat-response-length"]'),
    measurementValue: $('#measurement-value'),
    measurementLabel: $('#measurement-label'),
    measurementStatus: $('#measurement-status'),
    largeChart: $('#large-chart'),
    measurementChips: $('#measurement-chips')
  };
  const storageConsent = $('#storage-consent');

  let currentView = 'today';
  let timelineFilter = 'all';
  let symptomMode = 'entries';
  let documentFilter = 'all';
  let trendRange = 'blood-pressure';
  let toastTimer;
  let chatHistory = [];
  let chatBusy = false;
  let chatController = null;
  let chatRequestId = 0;
  let chatResponseLength = ['short', 'medium', 'detailed'].includes(read('chat-response-length', 'medium')) ? read('chat-response-length', 'medium') : 'medium';
  let authUser = null;
  let accountSessionReady = false;
  let entitlementExpiresAt = null;
  let entitlementReady = false;
  let entitlementTimer = null;
  let medicationScanBusy = false;
  let medicationScannerActive = false;
  let medicationScannerStream = null;
  let cloudSyncTimer = null;
  let cloudSyncEnabled = true;
  let cloudSyncBusy = false;
  let cloudSyncDirty = false;
  let cloudSyncRevision = 0;
  let localStateUpdatedAt = Number(read('updated-at', 0)) || 0;
  let profileShortcutEditing = false;
  let medicationAlertFingerprint = '';
  let medicationAlertTimer = null;
  let medicationAccountDataReady = false;
  let medicationLoginId = '';
  let accountSessionRevision = 0;
  let googleCredentialInFlight = false;
  let medicationRulesVersion = '';
  let medicationContextPromise = Promise.resolve();
  const medicationCheckController = new window.DoctorAIMedicationCheck.Controller({
    request: async (payload, signal) => {
      const response = await fetch('/api/medication/safety', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload), signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No medication check was returned.');
      return result;
    },
    load: () => read('medication-check', null),
    save: value => write('medication-check', value),
    remove: () => { try { localStorage.removeItem(storagePrefix + 'medication-check'); } catch {} },
    onChange: () => { renderMedicationCheckState(); renderHomePrescriptionAlert(); }
  });

  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const CHAT_MAX_MESSAGES = 12;
  const CHAT_MAX_MEMORY_DETAILS = 6;
  const CHAT_MAX_MEMORY_CHARS = 1400;
  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const scrollConversation = () => {
    if (!els.conversationScroll) return;
    els.conversationScroll.scrollTo({ top: els.conversationScroll.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  function setChatStatus(message, busy = chatBusy) {
    if (els.chatStatus) els.chatStatus.textContent = String(message || '');
    if (els.chatMessages) els.chatMessages.setAttribute('aria-busy', String(Boolean(busy)));
    if (els.chatPanel) els.chatPanel.setAttribute('aria-busy', String(Boolean(busy)));
    const assistantStatus = $('#chat-assistant-status');
    if (assistantStatus) assistantStatus.innerHTML = busy ? '<i></i>Thinking through that…' : '<i></i>Ready when you are';
  }
  function approvedChatMemory() {
    if (!state.memoryEnabled || !Array.isArray(state.memoryDetails)) return [];
    let total = 0;
    return state.memoryDetails.map(detail => String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 240)).filter(detail => {
      if (!detail || total + detail.length > CHAT_MAX_MEMORY_CHARS) return false;
      total += detail.length;
      return true;
    }).slice(0, CHAT_MAX_MEMORY_DETAILS);
  }
  // The server must eventually inject the authenticated entitlement here. Until billing and
  // account sessions are connected, this page intentionally defaults to Free and never trusts
  // localStorage or a URL parameter to unlock health files.
  let subscriptionTier = String(document.body.dataset.subscription || 'free').toLowerCase();
  const hasProAccess = () => subscriptionTier === 'pro';
  function applyBrandTheme() {
    const brand = window.DOCTORAI_BRANDING || { publicLogo: '/doctorai-public-logo-transparent.png?v=10', headLogo: '/doctorai-head-logo-transparent.png?v=10', appIcon: '/doctorai-app-icon.png?v=10' };
    document.body.dataset.subscription = hasProAccess() ? 'pro' : 'free';
    document.querySelectorAll('img[src*="doctorai-public-logo"], img[data-brand-logo], .brand-lockup img, .pro-brand-logo, .home-hero-logo').forEach(image => {
      image.onerror = () => { image.onerror = null; image.src = brand.headLogo; };
      image.src = brand.publicLogo;
    });
    document.querySelectorAll('img[data-brand-head], img[src*="doctorai-head-logo"], .doctorai-head-icon, .orbit-doctorai-mark').forEach(image => {
      image.onerror = () => { image.onerror = null; image.src = brand.appIcon; };
      image.src = brand.headLogo;
    });
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => { link.href = brand.appIcon; link.type = 'image/png'; });
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = '#173550';
  }
  const isDocumentEntry = entry => entry?.source === 'document' || entry?.title === 'Health document uploaded';
  const proFeatureGate = (title, copy) => `<div class="pro-gate" role="note"><span class="pro-gate-icon">✦</span><div class="pro-gate-copy"><b>${escapeHTML(title)}</b><p>${escapeHTML(copy)}</p></div><a href="/subscription#plans">See DoctorAI Pro <span>→</span></a></div>`;
  const formatDate = value => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const formatShortDate = value => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const formatTime = value => {
    if (!value) return '';
    const [hours, minutes] = String(value).split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
    const date = new Date(2000, 0, 1, hours, minutes);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const appointmentParts = value => {
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return { weekday: '', day: '', month: '' };
    return {
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      day: date.toLocaleDateString('en-US', { day: 'numeric' }),
      month: date.toLocaleDateString('en-US', { month: 'short' })
    };
  };
  const splitDetails = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  const measurementPills = measurements => {
    const definitions = [
      ['heart-rate', 'Heart rate', 'blue-dot'],
      ['sleep', 'Sleep', 'purple-dot'],
      ['weight', 'Weight', 'green-dot'],
      ['activity', 'Activity', 'cyan-dot'],
      ['temperature', 'Temperature', 'orange-dot'],
      ['mood', 'Mood', 'purple-dot']
    ];
    return definitions.map(([type, label, dot]) => {
      const item = measurements.find(measurement => measurement.type === type);
      return item ? `<span><i class="pill-dot ${dot}"></i> ${label} <b>${escapeHTML(item.value)}</b></span>` : '';
    }).filter(Boolean).join('');
  };
  const showToast = message => {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  };
  function setDeviceStorage(allowed) {
    deviceStorageChoice = allowed ? 'yes' : 'session';
    localStorageAllowed = Boolean(allowed);
    try { localStorage.setItem(storageConsentKey, deviceStorageChoice); } catch {}
    if (storageConsent) storageConsent.hidden = true;
    if (allowed) saveState();
    setSyncStatus(allowed ? 'Saved in this browser' : 'Device storage off · session only');
    refreshMedicationCheckContext().catch(() => {});
    showToast(allowed ? 'This browser will keep your health hub between visits.' : 'Health-hub changes will stay only for this session unless account sync is active.');
    renderHomePrescriptionAlert();
  }
  const saveState = () => {
    write('medications', state.medications);
    write('appointments', state.appointments);
    write('providers', state.providers);
    write('timeline', state.timeline);
    write('documents', state.documents);
    write('measurements', state.measurements);
    write('tasks', state.tasks);
    write('profile', state.profile);
    write('memory-enabled', state.memoryEnabled);
    write('memory-details', state.memoryDetails);
    localStateUpdatedAt = Date.now();
    write('updated-at', localStateUpdatedAt);
    queueCloudSave();
    refreshMedicationCheckContext().catch(() => {});
  };

  const serialiseHealthState = () => ({
    medications: clone(state.medications), appointments: clone(state.appointments), providers: clone(state.providers), timeline: clone(state.timeline), documents: clone(state.documents), measurements: clone(state.measurements), tasks: clone(state.tasks), profile: clone(state.profile), memoryEnabled: Boolean(state.memoryEnabled), memoryDetails: clone(state.memoryDetails)
  });
  const hasHealthState = value => Boolean(value?.medications?.length || value?.appointments?.length || value?.providers?.length || value?.timeline?.length || value?.documents?.length || value?.measurements?.length || value?.tasks?.length || value?.memoryDetails?.length || Object.values(value?.profile || {}).some(Boolean));

  function applyCloudState(value) {
    if (!value || typeof value !== 'object') return;
    state.medications = Array.isArray(value.medications) ? value.medications : [];
    state.appointments = Array.isArray(value.appointments) ? value.appointments : [];
    state.providers = Array.isArray(value.providers) ? value.providers : [];
    state.timeline = Array.isArray(value.timeline) ? value.timeline : [];
    state.documents = Array.isArray(value.documents) ? value.documents : [];
    state.measurements = Array.isArray(value.measurements) ? value.measurements : [];
    state.tasks = Array.isArray(value.tasks) ? value.tasks : [];
    state.profile = { ...emptyProfile, ...(value.profile || {}) };
    clearMedicationSafetyResults();
    state.memoryEnabled = Boolean(value.memoryEnabled);
    state.memoryDetails = Array.isArray(value.memoryDetails) ? value.memoryDetails : [];
    write('medications', state.medications); write('appointments', state.appointments); write('providers', state.providers); write('timeline', state.timeline); write('documents', state.documents); write('measurements', state.measurements); write('tasks', state.tasks); write('profile', state.profile); write('memory-enabled', state.memoryEnabled); write('memory-details', state.memoryDetails);
  }

  function deviceStorageStatus() {
    if (localStorageAllowed) return 'Saved in this browser';
    if (deviceStorageChoice === 'session') return 'Device storage off · session only';
    return 'Choose storage settings';
  }
  function setSyncStatus(message) { const target = $('#last-synced'); if (target) target.textContent = message; }
  function queueCloudSave() {
    if (!authUser || !cloudSyncEnabled) return;
    cloudSyncDirty = true;
    cloudSyncRevision += 1;
    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(() => saveCloudState().catch(() => {}), 900);
  }
  async function saveCloudState() {
    if (!authUser || !cloudSyncEnabled) return;
    if (cloudSyncBusy) { cloudSyncDirty = true; return; }
    const revision = cloudSyncRevision;
    const stateToSave = serialiseHealthState();
    cloudSyncDirty = false;
    cloudSyncBusy = true; setSyncStatus('Saving private health data…');
    try {
      const response = await fetch('/api/health/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: stateToSave }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.code === 'secure_storage_not_configured') { cloudSyncEnabled = false; setSyncStatus(deviceStorageStatus()); return; }
        throw new Error(payload.error || 'Private data could not be synced.');
      }
      if (revision === cloudSyncRevision && !cloudSyncDirty) {
        localStateUpdatedAt = Number(payload.updatedAt) || Date.now();
        write('updated-at', localStateUpdatedAt);
        setSyncStatus('Private data synced');
      }
    } catch { setSyncStatus(deviceStorageStatus()); }
    finally {
      cloudSyncBusy = false;
      if (cloudSyncDirty && authUser && cloudSyncEnabled) {
        window.clearTimeout(cloudSyncTimer);
        cloudSyncTimer = window.setTimeout(() => saveCloudState().catch(() => {}), 0);
      }
    }
  }
  async function loadCloudState() {
    if (!authUser || !cloudSyncEnabled) return;
    const accountScope = String(authUser.sub || '') + ':' + String(authUser.email || '').toLowerCase();
    setSyncStatus('Checking private account data…');
    try {
      const response = await fetch('/api/health/state', { headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!cloudSyncEnabled || accountScope !== (String(authUser?.sub || '') + ':' + String(authUser?.email || '').toLowerCase())) return;
      if (!response.ok) {
        if (payload.code === 'secure_storage_not_configured') { cloudSyncEnabled = false; setSyncStatus(deviceStorageStatus()); return; }
        throw new Error(payload.error || 'Private data could not be loaded.');
      }
      const cloudState = payload.state; const cloudUpdatedAt = Number(payload.updatedAt || 0);
      if (cloudState && (!hasHealthState(serialiseHealthState()) || cloudUpdatedAt > localStateUpdatedAt)) {
        applyCloudState(cloudState); localStateUpdatedAt = cloudUpdatedAt || Date.now(); write('updated-at', localStateUpdatedAt); renderAll();
      } else if (hasHealthState(serialiseHealthState())) queueCloudSave();
      medicationAccountDataReady = true;
      refreshMedicationCheckContext().catch(() => {});
      setSyncStatus('Private data synced');
    } catch { medicationAccountDataReady = false; refreshMedicationCheckContext().catch(() => {}); setSyncStatus(deviceStorageStatus()); }
  }

  function updateDate() {
    const now = new Date();
    if (els.date) els.date.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const navigationIcons = {
    today: '<path d="m3.5 10 8.5-7 8.5 7v10.5h-6v-6h-5v6h-5z"/>',
    ask: '<path d="M12 3.5c.7 4.6 3.2 7.1 7.8 7.8-4.6.7-7.1 3.2-7.8 7.8-.7-4.6-3.2-7.1-7.8-7.8 4.6-.7 7.1-3.2 7.8-7.8Z"/>',
    health: '<path d="M20.6 5.7c-2.3-2.4-6.2-1.8-8.6 1.1-2.4-2.9-6.3-3.5-8.6-1.1-2.4 2.5-1.2 6.2.7 8.3L12 21l7.9-7c1.9-2.1 3.1-5.8.7-8.3Z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.5-4.4 3.2-6.8 7.5-6.8s7 2.4 7.5 6.8"/>',
    symptoms: '<path d="M3 12h4l2-5 4 10 2.2-5H21"/><path d="M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"/>',
    medications: '<rect x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m9.2 9.2 5.6 5.6"/>',
    appointments: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h3M13.5 14H16M8 17h3"/>',
    results: '<path d="M4 19.5V5M4 19.5h16M7 16l3.5-4 3 2 5-7"/>',
    timeline: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    documents: '<path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6"/>',
    research: '<path d="M4.5 5.5A3.5 3.5 0 0 1 8 3h4v16H8a3.5 3.5 0 0 0-3.5 2.2ZM19.5 5.5A3.5 3.5 0 0 0 16 3h-4v16h4a3.5 3.5 0 0 1 3.5 2.2Z"/>'
  };
  const iconMarkup = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${navigationIcons[name] || navigationIcons.today}</svg>`;
  // Profile shortcuts use the same outlined, duotone pictograms as the Home orbit.
  // These bodies are static app-owned markup; no user content is interpolated.
  const profileShortcutIconBodies = {
    ask: '<path class="icon-fill" d="M12 2.9c.7 4.5 2.6 6.4 7.1 7.1-4.5.7-6.4 2.6-7.1 7.1-.7-4.5-2.6-6.4-7.1-7.1 4.5-.7 6.4-2.6 7.1-7.1Z"/><path d="M12 2.9c.7 4.5 2.6 6.4 7.1 7.1-4.5.7-6.4 2.6-7.1 7.1-.7-4.5-2.6-6.4-7.1-7.1 4.5-.7 6.4-2.6 7.1-7.1Z"/><path d="M18.8 3.5v3M20.3 5h-3M4.5 16.6V19M5.7 17.8H3.3"/>',
    medications: '<rect class="icon-fill" x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(-45 12 12)"/><rect x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m9.2 14.8 5.6-5.6M17.4 4.2v3M18.9 5.7h-3.1"/>',
    appointments: '<rect class="icon-fill" x="3.5" y="5.5" width="17" height="15" rx="3"/><rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M3.5 10h17M8 15l2 2 4-4"/><circle class="icon-solid" cx="17.5" cy="15.5" r="1"/>',
    documents: '<path class="icon-fill" d="M6 3.5h8l4 4v13H6z"/><path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h4"/><circle class="icon-solid" cx="9.5" cy="18" r="1"/>',
    symptoms: '<path class="icon-fill" d="M4 12h3l2-5 4 10 2.2-5H20v7H4z"/><path d="M3 12h4l2-5 4 10 2.2-5H21M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"/>',
    results: '<path d="M4 19.5V5M4 19.5h16M7 16l3.5-4 3 2 5-7"/>',
    health: navigationIcons.health,
    privacy: '<path class="icon-fill" d="m12 3 7 8.5-7 9-7-9Z"/><path d="m12 3 7 8.5-7 9-7-9Z"/><path d="M12 8v6"/>',
    person: navigationIcons.profile,
    blood: '<path class="icon-fill" d="M12 2.5C9.4 6.4 5.5 10 5.5 14a6.5 6.5 0 0 0 13 0c0-4-3.9-7.6-6.5-11.5Z"/><path d="M12 2.5C9.4 6.4 5.5 10 5.5 14a6.5 6.5 0 0 0 13 0c0-4-3.9-7.6-6.5-11.5Z"/><path d="M9 15.5a3 3 0 0 0 3 3"/>',
    allergies: '<path class="icon-fill" d="M12 3 2.5 20h19Z"/><path d="M12 3 2.5 20h19Z"/><path d="M12 9v5m0 3h.01"/>',
    providers: '<path class="icon-fill" d="M5 17c1.3-2 3.6-3 7-3s5.7 1 7 3v3H5Z"/><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20v-3c1.3-2 3.6-3 7-3s5.7 1 7 3v3H5Z"/><path d="M18 4v5m-2.5-2.5h5"/>',
    refill: '<path class="icon-fill" d="M5 5h12v6H5z"/><path d="M5 5h12v6H5zM8 14a5 5 0 1 0 9 4M8 14v4h4"/>',
    memory: '<path class="icon-fill" d="M5 4.5h14v15H5z"/><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5ZM8 8h8M8 12h8M8 16h5"/>'
  };
  const profileShortcutIconMarkup = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${profileShortcutIconBodies[name] || navigationIcons.today}</svg>`;
  function setupNavigationIcons() {
    // Reuse Home's artwork everywhere, including the dynamically rendered menus.
    document.querySelectorAll('#view-today [data-orbit-action][data-view]').forEach(item => {
      const svg = item.querySelector('svg');
      if (svg) profileShortcutIconBodies[item.dataset.view] = svg.innerHTML;
    });
    const prescriptionIcon = document.querySelector('#view-today [data-open-medication-scanner] svg');
    if (prescriptionIcon) profileShortcutIconBodies.medications = prescriptionIcon.innerHTML;
    const askIcon = document.querySelector('#view-today .hub-ask-prompt-icon svg');
    if (askIcon) profileShortcutIconBodies.ask = askIcon.innerHTML;
    document.querySelectorAll('.primary-nav [data-view], .category-tab[data-view], .category-more-menu [data-view]').forEach(item => {
      const target = item.matches('.nav-item') ? item.querySelector('.nav-icon') : item.querySelector(':scope > span:first-child');
      if (target) {
        target.innerHTML = profileShortcutIconMarkup(item.dataset.view);
        target.setAttribute('aria-hidden', 'true');
        target.classList.add('feature-icon', `tone-${profileShortcutDefinition(item.dataset.view)?.tone || 'blue'}`);
      }
    });
    document.querySelectorAll('.research-nav-highlight').forEach(item => {
      const target = item.querySelector('.nav-icon, :scope > span:first-child');
      if (target) target.innerHTML = iconMarkup('research');
    });
    const featureTargets = [
      ['.quick-asks button:nth-of-type(1) .quick-ask-icon', 'appointments'],
      ['.quick-asks button:nth-of-type(2) .quick-ask-icon', 'results'],
      ['.quick-asks button:nth-of-type(3) .quick-ask-icon', 'symptoms'],
      ['.overview-stat[data-view="medications"]:first-child .overview-icon', 'medications'],
      ['.overview-stat[data-view="appointments"] .overview-icon', 'appointments'],
      ['.overview-stat[data-view="medications"]:nth-child(3) .overview-icon', 'refill'],
      ['.overview-stat[data-view="health"] .overview-icon', 'memory'],
      ['#view-health .memory-large-icon', 'memory'],
      ['#view-health .info-icon.blue', 'health'],
      ['#view-health .info-icon.coral', 'allergies'],
      ['#view-health .info-icon.purple', 'providers'],
      ['#view-health .info-icon.dark', 'blood'],
      ['.drawer-pro-status .drawer-row-icon', 'ask'],
      ['.drawer-row[data-view="health"] .drawer-row-icon', 'health'],
      ['.drawer-row[data-show-privacy] .drawer-row-icon, .profile-trust-icon.tone-cyan', 'privacy'],
      ['.profile-trust-icon.tone-violet', 'health']
    ];
    const supportingTones = { refill: 'cyan', memory: 'mint', allergies: 'coral', providers: 'violet', blood: 'coral' };
    featureTargets.forEach(([selector, name]) => document.querySelectorAll(selector).forEach(icon => {
      icon.innerHTML = profileShortcutIconMarkup(name);
      icon.classList.add('feature-icon', `tone-${profileShortcutDefinition(name)?.tone || supportingTones[name] || 'blue'}`);
      icon.setAttribute('aria-hidden', 'true');
    }));
  }

  function setMobileMenuOpen(open, restoreFocus = false) {
    const button = document.querySelector('[data-mobile-menu]');
    const mobileFullMenu = window.matchMedia('(max-width: 620px)').matches;
    const moreMenu = document.querySelector('.category-more-menu');
    document.body.classList.toggle('mobile-category-open', open);
    button?.setAttribute('aria-expanded', String(open));
    button?.setAttribute('aria-label', open ? 'Close health hub navigation' : 'Open health hub navigation');
    if (mobileFullMenu && moreMenu) moreMenu.hidden = !open;
    if (open) {
      closeProfile();
      requestAnimationFrame(() => document.querySelector('#category-bar [data-view]')?.focus({ preventScroll: true }));
    } else if (restoreFocus) button?.focus({ preventScroll: true });
  }

  function showView(name, updateHash = true, moveFocus = false) {
    const next = viewNames.includes(name) ? name : 'today';
    currentView = next;
    if (next === 'medications' || next === 'today') refreshMedicationCheckContext().catch(() => {});
    try { sessionStorage.setItem('doctorai-last-hub-view', next); } catch {}
    document.body.dataset.hubTheme = next;
    document.body.dataset.activeFeature = next;
    const signatureOrbit = document.getElementById('quick-access-orbit');
    if (signatureOrbit) {
      signatureOrbit.dataset.activeFeature = next;
      signatureOrbit.querySelectorAll('[data-orbit-action]').forEach(action => {
        action.classList.toggle('is-selected', action.dataset.view === next || (next === 'research' && action.getAttribute('href') === '/research'));
      });
      signatureOrbit.classList.remove('is-pulsing');
      window.requestAnimationFrame(() => {
        signatureOrbit.classList.add('is-pulsing');
        window.setTimeout(() => signatureOrbit.classList.remove('is-pulsing'), 900);
      });
    }
    els.views.forEach(view => {
      const active = view.dataset.viewPanel === next;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    els.nav.forEach(item => item.classList.toggle('active', item.dataset.view === next));
    document.querySelectorAll('.mobile-bottom-nav [data-view]').forEach(item => {
      const exact = item.dataset.view === next;
      const grouped = item.dataset.view === 'health' && groupedHealthViews.includes(next);
      item.classList.toggle('active', exact || grouped);
      if (exact) item.setAttribute('aria-current', 'page');
      else if (grouped) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
    els.nav.forEach(item => {
      if (item.dataset.view === next) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    els.categories.forEach(item => {
      const active = item.dataset.view === next;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    const secondaryItems = document.querySelectorAll('.category-more-menu [data-view]');
    secondaryItems.forEach(item => {
      const active = item.dataset.view === next;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    const moreButton = document.querySelector('[data-more-menu]');
    const secondaryActive = ['symptoms', 'results', 'timeline', 'documents'].includes(next);
    moreButton?.classList.toggle('active', secondaryActive);
    moreButton?.setAttribute('aria-label', secondaryActive ? `More sections, ${viewLabels[next]} selected` : 'More health hub sections');
    document.title = `${viewLabels[next]} · DoctorAI Personal Health Hub`;
    if (updateHash && location.hash !== `#${next}`) history.pushState({ view: next }, '', `#${next}`);
    else if (!viewNames.includes(name) && location.hash) history.replaceState({ view: 'today' }, '', '#today');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    if (moveFocus) {
      const heading = document.querySelector(`[data-view-panel="${next}"] h1, [data-view-panel="${next}"] h2`);
      if (heading) { heading.setAttribute('tabindex', '-1'); requestAnimationFrame(() => heading.focus({ preventScroll: true })); }
    }
    window.dispatchEvent(new CustomEvent('doctorai:view-shown', { detail: next }));
  }

  function renderTodayMedications() {
    if (!els.medicationToday) return;
    const medications = state.medications.slice(0, 2);
    if (!medications.length) {
      els.medicationToday.innerHTML = '<div class="empty-state">No medications due today. Add a prescription reminder when you are ready.</div>';
      return;
    }
    els.medicationToday.innerHTML = medications.map(medication => {
      const isTaken = medication.status === 'taken';
      const isMissed = medication.status === 'missed';
      const statusText = isTaken ? 'Taken' : isMissed ? 'Missed' : `Due ${medication.time}`;
      const medicationName = escapeHTML(medication.name || 'medication');
      const safety = medicationSafetyMarkup(medication);
      return `<article class="medication-row-wrap ${safety ? 'has-safety-alert' : ''}"><div class="medication-row ${isTaken ? 'taken' : ''} ${isMissed ? 'missed' : ''}">
        <button class="medication-check" type="button" data-med-toggle="${escapeHTML(medication.id)}" aria-label="${isTaken ? `Mark ${medicationName} as due` : `Mark ${medicationName} as taken`}">${isTaken ? '✓' : isMissed ? '!' : ''}</button>
        <span class="medication-time">${escapeHTML(medication.time)}</span>
        <div class="medication-copy"><b>${escapeHTML(medication.name)} ${escapeHTML(medication.dose)}</b><span>${escapeHTML(medication.frequency)}</span><small>${escapeHTML(medication.instructions)}</small></div>
        <div class="medication-actions"><span class="medication-status">${statusText}</span>${!isTaken && !isMissed ? `<button class="missed-button" type="button" data-med-missed="${escapeHTML(medication.id)}" aria-label="Mark ${medicationName} as missed">Mark missed</button>` : ''}<button class="delete-item" type="button" data-delete-medication="${escapeHTML(medication.id)}" aria-label="Delete ${medicationName} from saved medications">Delete</button></div>
      </div>${safety}</article>`;
    }).join('');
  }

  function savedSupplyAmount(medication) {
    if (!medication || medication.supply === null || medication.supply === undefined || String(medication.supply).trim() === '') return null;
    const amount = Number(medication.supply);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  function medicationWithoutRefillWithLowSupply() {
    return state.medications.find(medication => {
      const amount = savedSupplyAmount(medication);
      const hasRefillDate = medication.refill && medication.refill !== 'Not set';
      return !hasRefillDate && amount !== null && amount <= 14;
    });
  }

  function renderMedicationLibrary() {
    if (!els.medicationLibrary) return;
    if (els.medicationsCount) els.medicationsCount.textContent = `${state.medications.length} active`;
    els.medicationLibrary.innerHTML = state.medications.length ? state.medications.map(medication => {
      const safety = medicationSafetyMarkup(medication);
      const medicationName = escapeHTML(medication.name || 'medication');
      const supply = savedSupplyAmount(medication);
      const supplyText = supply === null ? 'Remaining supply not recorded' : `Recorded remaining: ${escapeHTML(supply)}`;
      const supplyStatus = supply === null ? 'Supply not set' : supply === 0 ? 'Verify amount' : supply <= 14 ? 'Low supply' : 'Active';
      return `<article class="library-item-wrap ${safety ? 'has-safety-alert' : ''}"><div class="library-item">
        <span class="medicine-icon">▣</span><div class="library-copy"><b>${escapeHTML(medication.name)} ${escapeHTML(medication.dose)}</b><span>${escapeHTML(medication.frequency)} · ${escapeHTML(medication.instructions)}</span><small>${escapeHTML(medication.time)} reminder · ${supplyText}</small></div>
        <div class="library-meta"><b>${supplyStatus}</b><span>${escapeHTML(medication.refill)}</span><div class="library-item-actions"><button class="medication-edit-link" type="button" data-edit-medication="${escapeHTML(medication.id)}" aria-label="Edit ${medicationName} in saved medications">Edit</button><button class="delete-item" type="button" data-delete-medication="${escapeHTML(medication.id)}" aria-label="Delete ${medicationName} from saved medications">Delete</button></div></div>
      </div>${safety}</article>`;
    }).join('') : '<div class="empty-state">No medications added yet. Your prescription reminders will appear here.</div>';
    els.medicationLibrary.querySelectorAll('.library-item-wrap').forEach((item, index) => {
      const medication = state.medications[index];
      const ingredients = Array.isArray(medication?.activeIngredients) ? medication.activeIngredients.filter(Boolean) : [];
      const copy = item.querySelector('.library-copy');
      if (!copy) return;
      const manuallyConfirmed = medication?.activeIngredientsManuallyConfirmed === true;
      const ingredientSummary = document.createElement('small');
      ingredientSummary.textContent = ingredients.length
        ? 'Label ingredients: ' + ingredients.join(', ') + ' · ' + (manuallyConfirmed ? 'checked against the label by you' : 'not confirmed against the label')
        : 'Active ingredients not recorded from the label';
      const hasRetiredProviderMetadata = Boolean(
        medication?.nzfProduct || medication?.nzfProductConfirmed ||
        (Array.isArray(medication?.resolvedIngredients) && medication.resolvedIngredients.length)
      );
      if (hasRetiredProviderMetadata) ingredientSummary.textContent += ' · older provider match details remain in this private record but are not used by the current check';
      copy.append(ingredientSummary);
    });
    renderMedicationClashPanel();
  }

  function renderMedicationClashPanel() {
    const card = els.medicationLibrary?.closest('.library-card');
    if (!card) return;
    let panel = $('.clash-panel', card);
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'clash-panel pro-feature-control';
      panel.dataset.proFeature = 'medication-clash';
      card.appendChild(panel);
      panel.innerHTML = '<div class="clash-heading"><div><p class="card-kicker">DoctorAI Pro</p><h2>Limited local medication check</h2></div><span>Pro</span></div>' +
        '<p class="clash-description">This check compares saved medicine names and recorded allergies or conditions with a small set of DoctorAI’s own local rules. It does not assess every medicine, interaction, allergy, condition, dose, timing, or your personal situation. No alert does not mean a medicine or combination is safe.</p>' +
        '<details class="medication-local-coverage"><summary>See what the local data covers</summary><div>' +
          '<p>The dataset contains 3,419 medicine product and formulation records, 1,444 brand names, 1,224 chemical names and 1,136 ingredient terms. Of its products, 3,288 are fully mapped and 131 have incomplete ingredient mappings.</p>' +
          '<p>The rules include 13 curated medicine-pair checks and 2 allergy classes. There are no condition-specific rules. Coverage is limited and is not the full New Zealand medicine catalogue. This does not report Medsafe approval, availability or funding.</p>' +
          '<p>Source data: Pharmac New Zealand schedules, shared under CC BY 4.0. <a href="https://schedule.pharmac.govt.nz/pub/" target="_blank" rel="noopener noreferrer">View Pharmac source files</a>.</p>' +
        '</div></details>' +
        '<div class="clash-status" role="status" aria-live="polite"></div>' +
        '<label class="clash-consent"><input type="checkbox" data-local-medication-db-consent aria-describedby="medication-check-steps"><span><b>Allow one fresh check after login and checks when my medicine details, allergies or conditions change.</b> After I choose Check saved medicines, send each saved medicine name and strength/dose (up to 30 medicines), plus active ingredient names only when you confirmed them against the original label, and allergy and condition terms in your active profile to DoctorAI’s server for this check, once after each successful login, and on relevant changes while this consent remains enabled. Schedules, notes, symptoms, label images and older provider match details are not included. DoctorAI checks these terms against its own limited local rules and does not query an external medicine database.</span></label>' +
        '<p class="medication-check-steps" id="medication-check-steps">Select consent, then choose Check saved medicines to start. Selecting the box alone sends nothing. Rechecks run once after each successful login and on relevant changes. Reloading the same signed-in session does not add another login check. Uncheck it to revoke consent. Last results are kept only where you already allow device storage.</p>' +
        '<div class="clash-actions"><button class="primary-button" type="button" data-run-local-medication-safety-check>Check saved medicines</button></div>' +
        '<p class="medication-check-time" data-medication-check-time></p>' +
        '<div class="medication-db-result" data-local-medication-db-result role="status" aria-live="polite"></div>' +
        '<small class="clash-footnote">Review any result with a pharmacist or prescriber. Do not start, stop or change treatment based on this app.</small>';
    }
    panel.classList.toggle('pro-locked', !hasProAccess());
    renderMedicationCheckState();
    refreshMedicationCheckContext().catch(() => {});
    const status = $('.clash-status', panel);
    if (!hasProAccess()) {
      status.innerHTML = proFeatureGate('Medication database checks are a DoctorAI Pro feature.', 'This local check uses limited rules. Unknown or uncovered entries remain unchecked.');
      return;
    }
    const alerts = state.medications.flatMap(medication => medicationSafetyAlerts(medication));
    const caution = alerts.filter(alert => alert.severity === 'caution');
    status.innerHTML = !state.medications.length
      ? '<div class="clash-box clash-box-note"><span>i</span><div><b>No medicines saved yet</b><p>Add your medicines to see if any local name or label-text match needs review.</p></div></div>'
      : caution.length
        ? '<div class="clash-box clash-box-caution"><span>⚠</span><div><b>Possible text match to review</b><p>' + escapeHTML(caution[0].message) + ' This has not been checked against a medicine database.</p></div></div>'
        : '<div class="clash-box clash-box-note"><span>i</span><div><b>Interaction check not run</b><p>No interaction check has been run for this list. Consent and choose Check saved medicines to start the limited check.</p></div></div>';
    renderMedicationCheckState();
  }

  function medicationSafetyAlerts(medication) {
    const alerts = [];
    const medName = String(medication.name || '').trim().toLowerCase();
    const duplicate = state.medications.some(other => other.id !== medication.id && medicationLooksDuplicated(other, medication));
    if (duplicate) alerts.push({ severity: 'caution', title: 'Possible name/strength duplicate (not verified)', message: medication.name + ' ' + (medication.dose || '') + ' resembles another saved entry. This text match cannot tell whether the medicines contain the same ingredient or whether both were intentionally prescribed. Ask a pharmacist or clinician to review it.', source: 'Your saved medication list' });
    const ingredientNames = medication.activeIngredientsManuallyConfirmed === true && Array.isArray(medication.activeIngredients)
      ? medication.activeIngredients.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const sharedIngredient = ingredientNames.find(ingredient => state.medications.some(other =>
      other.id !== medication.id &&
      other.activeIngredientsManuallyConfirmed === true &&
      Array.isArray(other.activeIngredients) &&
      other.activeIngredients.some(item => String(item || '').trim().toLowerCase() === ingredient)
    ));
    if (sharedIngredient) alerts.push({ severity: 'caution', title: 'Possible repeated label ingredient (not database checked)', message: 'The label details you checked include “' + sharedIngredient + '” in another saved entry. This text match does not verify the products, doses or whether the combination was intended. Ask a pharmacist or clinician to review it.', source: 'User-confirmed label text in your saved medication list' });
    const allergies = splitDetails(state.profile.allergies);
    const allergyMatchTerms = [medName, ...ingredientNames].filter(Boolean);
    const matchingAllergy = allergies.find(item => {
      const allergyName = item.toLowerCase().replace(/\([^)]*\)/g, '').trim();
      return allergyName && allergyMatchTerms.some(term => term.includes(allergyName) || allergyName.includes(term));
    });
    if (matchingAllergy) alerts.push({ severity: 'caution', title: 'Possible text match to saved allergy/reaction (not verified)', message: 'Your health profile mentions “' + matchingAllergy + '”. This text comparison has not checked active ingredients or known cross-sensitivity. Ask a pharmacist or clinician to verify the match before relying on this alert.', source: 'Your saved health profile' });
    const history = splitDetails(state.profile.conditions + ' ' + state.profile.notes);
    const historyMatch = history.find(item => {
      const itemText = item.toLowerCase();
      return medName && itemText.includes(medName) && !itemText.includes('allerg');
    });
    if (historyMatch && !matchingAllergy) alerts.push({ severity: 'caution', title: 'Check your saved health history', message: 'Your notes mention this medicine or a related past issue: “' + historyMatch + '”. Confirm it with your pharmacist or clinician before taking it.', source: 'Your saved health profile' });
    return alerts;
  }

  function medicationSafetyMarkup(medication) {
    const alerts = medicationSafetyAlerts(medication);
    if (!alerts.length) return '';
    return `<div class="medication-safety-alerts" role="alert">${alerts.map(alert => `<div class="medication-safety-alert ${alert.severity === 'critical' ? 'critical' : 'caution'}"><span class="safety-alert-icon">${alert.severity === 'critical' ? '!' : '⚠'}</span><div><b>${escapeHTML(alert.title)}</b><p>${escapeHTML(alert.message)}</p><small>${escapeHTML(alert.source)} · Confirm with a pharmacist or clinician</small></div></div>`).join('')}</div>`;
  }

  function medicationGuidanceMarkup(medications) {
    if (!medications.length) return '<div class="today-medication-empty">Add a medication to see a practical, label-led checklist here.</div>';
    const shorten = (value, limit = 90) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
    };
    const guidance = medications.slice(0, 6).map(medication => {
      const instructions = String(medication.instructions || '').replace(/\s+/g, ' ').trim();
      const instructionText = instructions && !/^follow the prescription label$/i.test(instructions)
        ? `Saved label direction: ${instructions}`
        : 'No detailed label direction saved yet. Check the prescription label before taking it.';
      return `<li><span class="today-medication-guidance-icon" aria-hidden="true">✓</span><div><b>${escapeHTML(shorten(medication.name) || 'Saved medication')}</b><p>${escapeHTML(instructionText)}</p><small>Before taking: check food/timing instructions and ask a pharmacist what to avoid with this medicine, including alcohol, driving or other medicines. Never double a missed dose or change/stop treatment without professional advice.</small></div></li>`;
    }).join('');
    return `<ul class="today-medication-guidance-list">${guidance}</ul><p class="today-medication-guidance-note"><strong>Personalised from your saved notes—not a drug database.</strong> These reminders do not verify interactions or replace the label. Confirm medicine-specific food, drink, supplement and activity advice with your pharmacist or prescriber.</p>`;
  }

  function verifiedMedicationEducationMarkup(medications) {
    const recognised = [];
    medications.forEach(medication => {
      const name = String(medication.name || '').toLowerCase();
      if (/\bcodeine\b/.test(name) && !recognised.includes('codeine')) recognised.push('codeine');
    });
    if (!recognised.length) return '';
    return `<section class="today-dashboard-section today-verified-guidance" aria-labelledby="verified-medicine-title"><div class="today-dashboard-heading"><div><p>Recognised medicine</p><h3 id="verified-medicine-title">Verified patient guidance</h3></div><span>Source checked</span></div>${recognised.includes('codeine') ? `<article class="today-verified-card"><div><b>Codeine</b><small>General NHS guidance—your specific product and label still take priority.</small></div><ul><li>Codeine itself can usually be taken with or without food. Combination products can have different directions, so check the full product name and leaflet.</li><li>Avoid alcohol because it can increase sleepiness and serious side effects. Do not drive, cycle or use machinery if it makes you sleepy, dizzy or unable to concentrate.</li><li>Common effects include constipation, nausea and sleepiness. Slow, weak or shallow breathing, severe confusion, or difficulty waking needs urgent medical help.</li><li>Do not take an extra dose to make up for a missed dose, and do not stop long-term codeine suddenly without advice.</li></ul><a href="https://www.nhs.uk/medicines/codeine/" target="_blank" rel="noopener noreferrer">Read NHS codeine guidance <span aria-hidden="true">↗</span></a></article>` : ''}</section>`;
  }

  function verifiedSymptomEducationMarkup(symptoms) {
    const names = symptoms.map(item => String(symptomName(item) || '').toLowerCase());
    const hasHeadache = names.some(name => /headache|head pain|migraine/.test(name));
    const hasBreathingConcern = names.some(name => /breath|shortness|wheez|cannot breathe|can't breathe/.test(name));
    if (!hasHeadache && !hasBreathingConcern) return '';
    const sections = [];
    if (hasHeadache) sections.push(`<article class="today-verified-card symptom"><div><b>Headache</b><small>Low-risk steps while you monitor what you notice.</small></div><ul><li>Drink water, eat regular meals, rest and reduce prolonged screen strain.</li><li>Record timing, intensity and possible context such as missed meals, sleep, stress or exercise—these are observations, not confirmed causes.</li><li>Seek urgent help for a sudden extremely painful headache, weakness or numbness, confusion, seizure, loss of vision, trouble speaking or walking, or a severe headache after a head injury.</li></ul><a href="https://www.nhs.uk/symptoms/headaches/" target="_blank" rel="noopener noreferrer">Read NHS headache guidance <span aria-hidden="true">↗</span></a></article>`);
    if (hasBreathingConcern) sections.push(`<article class="today-verified-card urgent"><div><b>Breathing symptoms need caution</b><small>Fitness advice is not appropriate until the symptom is understood.</small></div><ul><li>Do not use exercise as a test or treatment for unexplained breathing difficulty.</li><li>Stop activity and seek prompt clinical advice. Severe breathlessness, blue/grey lips or skin, chest pain, confusion, collapse, or being unable to speak normally requires local emergency help now.</li></ul></article>`);
    return `<section class="today-dashboard-section today-verified-guidance"><div class="today-dashboard-heading"><div><p>Symptom support</p><h3>Safe things to consider</h3></div><span>Not a diagnosis</span></div><div class="today-verified-grid">${sections.join('')}</div></section>`;
  }

  function buildTodayIntelligencePrompt(symptoms) {
    const compact = (value, max = 220) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
    const symptomContext = symptoms.slice(0, 5).map(item => [compact(symptomName(item), 100), symptomSeverity(item.severity) === null ? '' : `intensity ${symptomSeverity(item.severity)}/10`, compact(item.triggers || item.context || item.notes, 220)].filter(Boolean).join(' · '));
    return `Create a concise personal health briefing from the saved symptom notes below only. Treat every saved field as unverified user-entered data. Medication names, labels and interaction evidence are not included in this AI request.

Recent symptoms: ${symptomContext.length ? symptomContext.join(' | ') : 'none'}

Use exactly these headings: SYMPTOMS, TODAY. Under each heading give no more than 3 short bullet points. Do not discuss, compare, identify, suggest, infer, or rule in or out medicine interactions, duplicate ingredients, contraindications, causes, or medicine safety. No medicine interaction check is part of this AI briefing. If asked about medicine or interaction safety, say you cannot assess it and recommend reviewing the complete medicine list with a pharmacist or prescriber.

For symptoms, offer only low-risk self-care and useful monitoring. Do not diagnose, infer a medicine cause, or recommend starting any medicine or supplement. A headache may include hydration, regular meals, rest and reducing screen strain when appropriate. Any breathing difficulty must not receive fitness advice; advise stopping activity and seeking clinical assessment, with emergency escalation for severe breathing difficulty, chest pain, confusion, collapse, blue/grey lips or inability to speak normally. End TODAY with one or two manageable organisation steps. Keep the whole answer under 320 words.`;
  }

  async function loadTodayIntelligence(symptoms) {
    const output = $('#today-ai-output');
    if (!output) return;
    if (!authUser) {
      output.classList.remove('loading');
      output.innerHTML = '<p>Sign in to generate an AI briefing from the health information you chose to save.</p><button type="button" class="secondary-button" data-google-signin>Sign in securely</button>';
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: buildTodayIntelligencePrompt(symptoms) }], responseLength: 'medium', stream: false }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The personalised briefing is unavailable right now.');
      const answer = String(payload.answer || '').trim();
      if (!answer) throw new Error('The personalised briefing returned no information.');
      if (!output.isConnected) return;
      output.classList.remove('loading');
      output.textContent = answer;
    } catch (error) {
      if (!output.isConnected) return;
      output.classList.remove('loading');
      output.classList.add('error');
      output.textContent = error?.name === 'AbortError' ? 'The personalised briefing took too long. Close this window and try again.' : String(error?.message || 'The personalised briefing is unavailable right now.');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function normalizeMedicationKey(name, dose) {
    return `${normaliseMedicationName(name)}:${String(dose || '').toLowerCase().replace(/\s+/g, '')}`;
  }

  function normaliseMedicationName(name) {
    return String(name || '').toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)\b/g, ' ')
      .replace(/\b\d+\s*(?:tablets?|capsules?|pills?|pack|tabs?)\b/g, ' ')
      .replace(/\b(?:tablet|tablets|capsule|capsules|pill|pills|film|coated|oral|solution|syrup|generic|brand)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function medicationLooksDuplicated(left, right) {
    const leftName = normaliseMedicationName(left.name);
    const rightName = normaliseMedicationName(right.name);
    if (!leftName || !rightName || leftName !== rightName) return false;
    const leftDose = String(left.dose || '').toLowerCase().replace(/\s+/g, '');
    const rightDose = String(right.dose || '').toLowerCase().replace(/\s+/g, '');
    return !leftDose || !rightDose || leftDose === rightDose || normalizeMedicationKey(left.name, left.dose) === normalizeMedicationKey(right.name, right.dose);
  }

  function renderTasks() {
    if (!els.taskList) return;
    els.taskList.innerHTML = state.tasks.length ? state.tasks.map(task => `<div class="task-row ${task.done ? 'done' : ''}">
      <button class="task-check" type="button" data-task-toggle="${escapeHTML(task.id)}" aria-label="${task.done ? 'Mark task incomplete' : 'Complete task'}">${task.done ? '✓' : ''}</button><span><b>${escapeHTML(task.label)}</b><small>${escapeHTML(task.detail)}</small></span><span>${task.done ? 'Done' : 'Today'}</span>
    </div>`).join('') : '<div class="empty-state">No health tasks yet. Add a small next step when you need one.</div>';
    const complete = state.tasks.filter(task => task.done).length;
    if (els.taskCount) els.taskCount.textContent = state.tasks.length ? `${complete} of ${state.tasks.length} complete` : 'No tasks yet';
  }

  function renderActivity() {
    if (!els.activity) return;
    const activity = state.timeline.filter(entry => hasProAccess() || !isDocumentEntry(entry));
    els.activity.innerHTML = activity.length ? activity.slice(0, 3).map(entry => `<div class="mini-activity-row"><span class="activity-icon">${escapeHTML(entry.icon || '•')}</span><div><b>${escapeHTML(entry.title)}</b><small>${escapeHTML(entry.description)}</small></div><time>${formatShortDate(entry.date)}</time></div>`).join('') : '<div class="empty-state">No recent activity yet. Your saved health events will appear here.</div>';
  }

  const upcomingAppointments = () => state.appointments.filter(item => item.status !== 'past').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  function renderTodayOverview() {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const displayName = String(authUser?.name || state.profile.name || '').trim().split(/\s+/)[0];
    if (els.todayGreeting) els.todayGreeting.textContent = `${salutation}${displayName ? `, ${displayName}` : ''}.`;
    const tracked = state.medications.filter(item => item.status === 'taken').length;
    if (els.medOverview) els.medOverview.textContent = state.medications.length ? `${tracked} of ${state.medications.length} taken` : 'No medicines logged';
    const medOverviewMeta = $('#med-overview-meta');
    if (medOverviewMeta) medOverviewMeta.textContent = state.medications.length ? 'Based on your saved medication list' : 'Add medicines to track your routine';
    if (els.dailyInsight) {
      const medicationText = state.medications.length ? `${state.medications.length} medication ${state.medications.length === 1 ? 'reminder' : 'reminders'}` : 'no medication reminders';
      const taskText = state.tasks.length ? `${state.tasks.length} ${state.tasks.length === 1 ? 'task' : 'tasks'}` : 'no tasks';
      els.dailyInsight.textContent = state.medications.length || state.tasks.length ? `${medicationText} and ${taskText} to review today.` : 'Add one health item to make today more useful.';
    }
    const appointment = upcomingAppointments()[0];
    if (els.nextAppointmentValue) els.nextAppointmentValue.textContent = appointment ? formatShortDate(appointment.date) : 'No appointment';
    if (els.nextAppointmentMeta) els.nextAppointmentMeta.textContent = appointment ? `${appointment.provider || 'Provider to confirm'} · ${formatTime(appointment.time)}` : 'Add one when you’re ready';
    const unscheduledLowSupply = medicationWithoutRefillWithLowSupply();
    const refill = state.medications.find(item => item.refill && item.refill !== 'Not set');
    const refillSupply = refill ? savedSupplyAmount(refill) : null;
    if (els.refillOverviewValue) els.refillOverviewValue.textContent = unscheduledLowSupply ? 'Refill date not set' : refill ? `Due ${refill.refill}` : 'No refill reminder';
    if (els.refillOverviewMeta) els.refillOverviewMeta.textContent = unscheduledLowSupply ? `${unscheduledLowSupply.name} · ${savedSupplyAmount(unscheduledLowSupply)} remaining recorded` : refill ? `${refill.name} · ${refillSupply === null ? 'supply not recorded' : `${refillSupply} remaining recorded`}` : 'Add a refill date if you want a reminder';
    if (els.memoryOverviewMeta) els.memoryOverviewMeta.textContent = state.memoryEnabled ? `${state.memoryDetails.length} approved details` : '0 approved details';
  }

  function renderTodayAppointment() {
    if (!els.todayAppointmentPreview) return;
    const appointment = upcomingAppointments()[0];
    if (!appointment) {
      els.todayAppointmentPreview.innerHTML = '<div class="empty-state">No upcoming appointments yet. Add one when you are ready.</div>';
      return;
    }
    const parts = appointmentParts(appointment.date);
    els.todayAppointmentPreview.innerHTML = `<div class="appointment-date"><b>${escapeHTML(parts.day)}</b><span>${escapeHTML(parts.month)}</span></div><div class="appointment-details"><b>${escapeHTML(appointment.provider || 'Provider to confirm')}</b><span>${escapeHTML(appointment.title)}</span><small><i>◷</i> ${escapeHTML(parts.weekday)} · ${escapeHTML(formatTime(appointment.time))}</small><small><i>⌖</i> ${escapeHTML(appointment.location || 'Location to confirm')}</small></div>`;
  }

  function renderTodayTrend() {
    const latest = state.measurements.find(item => item.type === 'blood-pressure');
    if (!latest) {
      if (els.todayBpValue) els.todayBpValue.textContent = 'No data yet';
      if (els.todayBpStatus) els.todayBpStatus.textContent = 'Log a measurement to start a trend';
      if (els.todayBpUpdated) els.todayBpUpdated.textContent = '';
      if (els.todayMiniChart) els.todayMiniChart.hidden = true;
    } else {
      if (els.todayBpValue) els.todayBpValue.innerHTML = escapeHTML(latest.value).replace(' / ', ' <small>/</small> ');
      if (els.todayBpStatus) els.todayBpStatus.innerHTML = '<i>↘</i> Your latest saved reading';
      if (els.todayBpUpdated) els.todayBpUpdated.textContent = `Updated ${formatShortDate(latest.date)}`;
      if (els.todayMiniChart) els.todayMiniChart.hidden = false;
    }
    if (els.todayTrendPills) els.todayTrendPills.innerHTML = measurementPills(state.measurements) || '<span class="trend-empty">Your personal signals will appear here.</span>';
  }

  function renderHomePrescriptionAlert() {
    if (!els.homePrescriptionAlert) return;
    const alerts = state.medications.flatMap(medication => medicationSafetyAlerts(medication));
    const concern = alerts.find(alert => alert.severity === 'critical') || alerts.find(alert => alert.severity === 'caution');
    const check = medicationCheckController.snapshot();
    const issue = (check.status === 'complete' || (check.status === 'pending' && check.result)) ? window.DoctorAIMedicationCheck.issues(check.result)[0] : null;
    const status = issue
      ? { className: 'status-danger', icon: '!', label: (issue.type === 'interaction' ? 'Interaction warning' : issue.title) + (check.status === 'pending' ? ' · updating' : ''), message: issue.message, detail: check.status === 'pending' ? 'Previous warning · updating after login. No fresh result yet.' : 'Limited local rules · review the sourced alert and complete list with a pharmacist or prescriber.' }
      : check.status === 'pending'
        ? { className: 'status-note', icon: 'i', label: 'Checking medicines…', message: 'No current interaction result is available yet.', detail: 'Wait for the current limited check.' }
      : concern
      ? { className: concern.severity === 'critical' ? 'status-danger' : 'status-caution', icon: concern.severity === 'critical' ? '!' : '⚠', label: concern.title, message: concern.message, detail: `${concern.source} · Confirm with a pharmacist or clinician.`, concern, alerts }
      : !state.medications.length
        ? { className: 'status-note', icon: 'i', label: 'No medicines saved yet', message: 'Add your medication list to review saved details.', detail: 'The optional local rules check covers only a small set of medicine risks; it cannot confirm medicines are safe together.' }
        : { className: 'status-note', icon: 'i', label: check.status === 'complete' ? (check.result.coverage?.unknown ? 'Check incomplete' : 'Limited check: no interaction alert found') : check.status === 'unavailable' ? 'Check unavailable' : 'Interaction check not run', message: check.status === 'complete' ? (check.result.coverage?.unknown ? 'Some medicines could not be assessed. Review the coverage details.' : 'No covered interaction alert was found. This does not confirm safety.') : 'No current interaction assessment is available.', detail: 'The limited rules cannot confirm safety. Confirm your full list with a pharmacist or clinician.' };
    els.homePrescriptionAlert.className = `prescription-alert-status ${status.className}`;
    els.homePrescriptionAlert.innerHTML = `<span class="prescription-alert-icon" aria-hidden="true">${status.icon}</span><div><b>${escapeHTML(status.label)}</b><p>${escapeHTML(status.message)}</p><small>${escapeHTML(status.detail)}</small></div><button type="button" data-view="medications">View details <span aria-hidden="true">→</span></button>`;
    if (els.homePrescriptionLastChecked) els.homePrescriptionLastChecked.textContent = check.checkedAt ? (check.status === 'pending' ? 'Previous check · updating: ' : 'Last checked: ') + new Date(check.checkedAt).toLocaleString() : 'No current interaction check';
    if (status.concern) queueMedicationSafetyAlert(status);
    else closeMedicationSafetyAlert(false);
  }

  function medicationAlertHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function medicationAlertAcknowledged(fingerprint) {
    try { return sessionStorage.getItem('doctorai-medication-alert-ack-v1') === fingerprint; } catch { return false; }
  }

  function queueMedicationSafetyAlert(status) {
    if (!els.medicationAlertModal || !status?.concern) return;
    const fingerprint = medicationAlertHash((status.alerts || []).map(alert => [alert.severity, alert.title, alert.message, alert.source].join('|')).sort().join('||'));
    medicationAlertFingerprint = fingerprint;
    els.medicationAlertModal.dataset.severity = status.concern.severity;
    els.medicationAlertTitle.textContent = status.concern.title;
    els.medicationAlertDescription.textContent = status.concern.message;
    els.medicationAlertSource.textContent = `Based on: ${status.concern.source}`;
    if (medicationAlertAcknowledged(fingerprint) || els.medicationAlertModal.open) return;
    clearTimeout(medicationAlertTimer);
    medicationAlertTimer = window.setTimeout(() => {
      if (!els.medicationAlertModal || els.medicationAlertModal.open || medicationAlertAcknowledged(fingerprint) || (storageConsent && !storageConsent.hidden)) return;
      els.medicationAlertModal.showModal();
      window.setTimeout(() => els.medicationAlertModal.querySelector('[data-review-medication-alert]')?.focus({ preventScroll: true }), 0);
    }, 180);
  }

  function closeMedicationSafetyAlert(acknowledge = true) {
    clearTimeout(medicationAlertTimer);
    if (acknowledge && medicationAlertFingerprint) {
      try { sessionStorage.setItem('doctorai-medication-alert-ack-v1', medicationAlertFingerprint); } catch {}
    } else if (!acknowledge) medicationAlertFingerprint = '';
    if (els.medicationAlertModal?.open) els.medicationAlertModal.close();
  }

  function renderRefillCard() {
    if (!els.refillTitle || !els.refillCopy) return;
    const unscheduledLowSupply = medicationWithoutRefillWithLowSupply();
    const refill = state.medications.find(item => item.refill && item.refill !== 'Not set');
    if (unscheduledLowSupply) {
      const amount = savedSupplyAmount(unscheduledLowSupply);
      const needsReview = amount === 0;
      els.refillTitle.textContent = needsReview ? 'Supply amount needs review' : 'Low supply recorded';
      els.refillCopy.textContent = needsReview
        ? `A saved amount of 0 for ${unscheduledLowSupply.name} may mean the amount was left blank in an older entry. Confirm the current amount against the package or prescription, then add a refill date if you want a reminder.`
        : `${unscheduledLowSupply.name} has ${amount} remaining recorded and no refill date. Confirm the current amount against the package or prescription; add a refill date if you want a reminder.`;
      if (els.refillProgress) els.refillProgress.hidden = true;
      if (els.refillMeta) els.refillMeta.hidden = true;
      if (els.refillAction) {
        els.refillAction.innerHTML = 'Review medicines <span>→</span>';
        els.refillAction.dataset.view = 'medications';
        delete els.refillAction.dataset.chatPrompt;
      }
      return;
    }
    if (!refill) {
      els.refillTitle.textContent = 'No refill reminders';
      els.refillCopy.textContent = 'No medication refill dates are saved, so there are no scheduled reminders to show. Add a refill date if you want one.';
      if (els.refillProgress) els.refillProgress.hidden = true;
      if (els.refillMeta) els.refillMeta.hidden = true;
      if (els.refillAction) {
        els.refillAction.innerHTML = '＋ Add medication <span>→</span>';
        els.refillAction.dataset.view = 'medications';
        delete els.refillAction.dataset.chatPrompt;
      }
      return;
    }
    const refillSupply = savedSupplyAmount(refill);
    els.refillTitle.textContent = `${refill.name} refill`;
    els.refillCopy.textContent = 'Keep an eye on your remaining supply and contact your prescriber or pharmacy in time.';
    if (els.refillProgress) {
      els.refillProgress.hidden = refillSupply === null;
      if (refillSupply !== null) els.refillProgress.querySelector('span').style.width = `${Math.min(100, Math.max(12, refillSupply * 4))}%`;
    }
    if (els.refillMeta) {
      els.refillMeta.hidden = false;
      els.refillMeta.querySelector('span').textContent = refillSupply === null ? 'Supply not recorded' : `${refillSupply} remaining recorded`;
      els.refillMeta.querySelector('b').textContent = refill.refill;
    }
    if (els.refillAction) {
      els.refillAction.innerHTML = 'Ask about a refill <span>✦</span>';
      els.refillAction.dataset.view = 'ask';
      els.refillAction.dataset.chatPrompt = `Help me prepare a question for my pharmacy about refilling my ${refill.name} prescription.`;
    }
  }

  function renderMedicationHistory() {
    if (!els.medicationHistory) return;
    const history = state.timeline.filter(entry => entry.type === 'medication');
    els.medicationHistory.innerHTML = history.length ? history.slice(0, 4).map(entry => `<div class="history-item"><span class="history-dot changed"></span><div><b>${escapeHTML(entry.title)}</b><small>${escapeHTML(entry.description)}</small></div><span>›</span></div>`).join('') : '<div class="empty-inline">Medication changes will appear here.</div>';
  }

  function renderAppointments() {
    const upcoming = upcomingAppointments();
    const past = state.appointments.filter(item => item.status === 'past');
    if (els.appointmentsCount) els.appointmentsCount.textContent = `${upcoming.length} scheduled`;
    if (els.upcomingAppointments) {
      els.upcomingAppointments.innerHTML = upcoming.length ? upcoming.map(appointment => {
        const parts = appointmentParts(appointment.date);
        return `<article class="appointment-large"><div class="large-date"><span>${escapeHTML(parts.weekday)}</span><b>${escapeHTML(parts.day)}</b><small>${escapeHTML(parts.month)}</small></div><div class="large-appointment-copy"><div class="appointment-type"><span class="purple-dot"></span>${escapeHTML(appointment.title)}</div><h3>${escapeHTML(appointment.provider || 'Provider to confirm')}</h3><p><span>◷</span> ${escapeHTML(formatTime(appointment.time))} &nbsp; <span>⌖</span> ${escapeHTML(appointment.location || 'Location to confirm')}</p><div class="large-appointment-actions"><button class="primary-button" type="button" data-prepare-appointment="${escapeHTML(appointment.id)}">Prepare me with DoctorAI <span>✦</span></button><button class="quiet-button" type="button" data-modal="appointment">Edit details</button><button class="delete-item" type="button" data-delete-appointment="${escapeHTML(appointment.id)}">Delete</button></div></div></article>`;
      }).join('') : '<div class="empty-state">No upcoming appointments yet. Add one when you are ready.</div>';
    }
    if (els.pastAppointments) els.pastAppointments.innerHTML = past.length ? past.map(appointment => `<div class="past-item"><div><b>${escapeHTML(appointment.title)}</b><span>${escapeHTML(appointment.provider || 'Provider to confirm')}</span></div><time>${escapeHTML(formatDate(appointment.date))}</time><small>${escapeHTML(appointment.note || 'Saved in your health history')}</small><button class="delete-item" type="button" data-delete-appointment="${escapeHTML(appointment.id)}">Delete</button></div>`).join('') : '<div class="empty-inline">Previous appointments will appear here.</div>';
  }

  function renderProfileShortcuts() {
    if (!els.profileShortcutGrid) return;
    const items = profileShortcuts.map(profileShortcutDefinition).filter(Boolean);
    const cards = items.map(item => `<div class="profile-shortcut-item"><button type="button" class="profile-shortcut-card" data-profile-shortcut="${escapeHTML(item.id)}" aria-label="Open ${escapeHTML(item.label)}"><span class="profile-shortcut-icon tone-${escapeHTML(item.tone)}" aria-hidden="true">${profileShortcutIconMarkup(item.iconName)}</span><span class="profile-shortcut-copy"><b>${escapeHTML(item.label)}</b><small>${escapeHTML(item.description)}</small></span><span class="profile-shortcut-arrow" aria-hidden="true">→</span></button>${profileShortcutEditing ? `<button type="button" class="profile-shortcut-remove" data-profile-shortcut-remove="${escapeHTML(item.id)}" aria-label="Remove ${escapeHTML(item.label)} shortcut">−</button>` : ''}</div>`).join('');
    const addCard = profileShortcutEditing ? '<button type="button" class="profile-shortcut-add" data-profile-add-shortcut><span aria-hidden="true">＋</span><b>Add shortcut</b><small>Choose another DoctorAI tool</small></button>' : '';
    els.profileShortcutGrid.innerHTML = cards || '<div class="profile-shortcuts-empty">No shortcuts pinned yet. Choose Add shortcut to build your personal list.</div>';
    if (profileShortcutEditing) els.profileShortcutGrid.insertAdjacentHTML('beforeend', addCard);
    if (els.profileShortcutEdit) {
      els.profileShortcutEdit.textContent = profileShortcutEditing ? 'Done' : 'Edit shortcuts';
      els.profileShortcutEdit.setAttribute('aria-pressed', String(profileShortcutEditing));
      els.profileShortcutEdit.setAttribute('aria-label', profileShortcutEditing ? 'Finish editing personal shortcuts' : 'Edit personal shortcuts');
    }
    if (els.profileShortcutEditNote) els.profileShortcutEditNote.hidden = !profileShortcutEditing;
  }

  function renderProfile() {
    if (!els.profileFacts) return;
    const facts = [
      ['Name', state.profile.name || 'Not added', 'person', 'cyan'],
      ['Blood type', state.profile.bloodType || 'Not added', 'blood', 'violet'],
      ['Conditions', state.profile.conditions || 'Not added', 'health', 'mint'],
      ['Allergies', state.profile.allergies || 'Not added', 'allergies', 'coral'],
      ['Notes', state.profile.notes || 'Not added', 'documents', 'violet'],
      ['Memory', state.memoryEnabled ? `${state.memoryDetails.length} approved details` : 'Off · not used in chat', 'memory', 'mint']
    ];
    els.profileFacts.innerHTML = facts.map(([label, value, icon, tone]) => `<div class="profile-fact"><span class="profile-fact-label"><span class="profile-fact-icon feature-icon tone-${tone}" aria-hidden="true">${profileShortcutIconMarkup(icon)}</span><small>${escapeHTML(label)}</small></span><b title="${escapeHTML(value)}">${escapeHTML(value)}</b></div>`).join('');
    if (els.conditionsTags) {
      const conditions = splitDetails(state.profile.conditions);
      els.conditionsTags.innerHTML = conditions.length ? `${conditions.map(condition => `<span>${escapeHTML(condition)}</span>`).join('')}<span class="muted-tag">＋ Add condition</span>` : '<span class="muted-tag">＋ Add condition</span>';
    }
    if (els.allergiesList) {
      const allergies = splitDetails(state.profile.allergies);
      els.allergiesList.innerHTML = allergies.length ? allergies.map(allergy => `<div class="allergy-row"><b>${escapeHTML(allergy)}</b><span>Saved in your profile</span></div>`).join('') : '<div class="empty-inline">No allergies added</div>';
    }
    if (els.providersList) {
      els.providersList.innerHTML = state.providers.length ? state.providers.map(provider => {
        const initials = String(provider.name || 'Doctor').split(/\s+/).map(part => part[0]).join('').slice(-2).toUpperCase();
        const contact = [provider.practice, provider.phone, provider.email].filter(Boolean).join(' · ');
        return `<div class="provider-row"><span class="provider-avatar">${escapeHTML(initials)}</span><div><b>${escapeHTML(provider.name)}</b><small>${escapeHTML(contact || 'Local doctor · contact details not added')}</small></div><button type="button" class="quiet-button" data-edit-provider="${escapeHTML(provider.id)}">Edit</button></div>`;
      }).join('') : '<div class="empty-inline">No local doctors added yet. Add one here; appointments stay separate.</div>';
    }
    if (els.emergencyBloodType) els.emergencyBloodType.textContent = state.profile.bloodType || 'Not added';
    if (els.memoryApproved) els.memoryApproved.innerHTML = state.memoryDetails.map(detail => `<span>${escapeHTML(detail)}</span>`).join('');
    const status = state.memoryEnabled ? `On · ${state.memoryDetails.length} saved details` : 'Off · not used';
    if (els.memoryMiniStatus) els.memoryMiniStatus.textContent = status;
    if (els.memoryOverview) els.memoryOverview.textContent = state.memoryEnabled ? 'On' : 'Off';
    if (els.memoryOverviewMeta) els.memoryOverviewMeta.textContent = state.memoryEnabled ? `${state.memoryDetails.length} approved details` : '0 approved details';
    if (els.chatMemoryStatus) els.chatMemoryStatus.textContent = state.memoryEnabled ? 'on' : 'off';
    if (els.drawerMemoryStatus) els.drawerMemoryStatus.textContent = state.memoryEnabled ? 'On' : 'Off';
    if (els.memoryToggle) els.memoryToggle.checked = state.memoryEnabled;
    if (els.healthMemoryToggle) els.healthMemoryToggle.checked = state.memoryEnabled;
    renderProfileShortcuts();
  }

  function renderResults() {
    if (!els.resultList) return;
    if (!hasProAccess()) {
      els.resultList.innerHTML = proFeatureGate('Results files are a Pro feature.', 'Free includes typed measurements and trends. Pro unlocks medical uploads, health photos, AI explanations and permission-based sharing.');
      return;
    }
    const results = state.documents.filter(doc => doc.category === 'result');
    els.resultList.innerHTML = results.length ? results.map(result => `<article class="result-item"><span class="result-file-icon">⌁</span><div class="result-copy"><b>${escapeHTML(result.title)}</b><span>${escapeHTML(result.description)}</span><small>${escapeHTML(result.date)} · ${escapeHTML(result.size)}</small></div><div class="result-actions"><button type="button" data-document-view="${escapeHTML(result.id)}">View</button><button type="button" data-explain-result="${escapeHTML(result.title)}">Explain <span>✦</span></button><button type="button" data-document-download="${escapeHTML(result.id)}">Download</button><button type="button" class="delete-item" data-delete-document="${escapeHTML(result.id)}">Delete</button></div></article>`).join('') : '<div class="empty-state">No results saved yet. Upload a report when you are ready.</div>';
  }

  const symptomImpactLabels = {
    none: 'No change to normal activities',
    some: 'Some activities were harder',
    stopped: 'Stopped normal activities',
    unsure: 'Not sure'
  };
  const symptomSeverity = value => {
    const severity = Number(value);
    return Number.isFinite(severity) && severity >= 1 && severity <= 10 ? Math.round(severity) : null;
  };
  const symptomName = entry => String(entry?.name || entry?.title || 'Symptom').replace(/^Symptom recorded:\s*/i, '').trim() || 'Symptom';
  const symptomLogDescription = entry => {
    const severity = symptomSeverity(entry?.severity);
    return severity === null ? 'Symptom recorded' : `Intensity ${severity}/10`;
  };
  const symptomDateValue = entry => `${entry?.date || ''}T${entry?.time || '00:00'}-${String(entry?.createdAt || '')}`;
  const symptomEmptyIcon = kind => kind === 'filtered'
    ? '<svg class="symptom-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>'
    : '<svg class="symptom-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2.2-5H21"/></svg>';

  const commonSymptomPicks = ['Headache', 'Tiredness', 'Nausea', 'Dizziness', 'Cough', 'Pain', 'Sleep difficulty'];
  const commonContextPicks = ['After a workout', 'After a meal', 'Poor sleep', 'Stressful day', 'New medicine', 'Not enough water', 'Travel', 'Long screen time'];
  const symptomPatternFamilies = [
    { key: 'headache', label: 'Headache', match: /\b(headache|migraine)\b/i },
    { key: 'tiredness', label: 'Tiredness', match: /\b(tired(?:ness)?|fatigue|exhaust(?:ion|ed)?)\b/i },
    { key: 'nausea', label: 'Nausea', match: /\b(nausea|nauseous|sick to (?:my )?stomach)\b/i },
    { key: 'dizziness', label: 'Dizziness', match: /\b(dizz(?:y|iness)|light[- ]?headed)\b/i },
    { key: 'cough', label: 'Cough', match: /\bcough(?:ing)?\b/i },
    { key: 'pain', label: 'Pain', match: /\b(pain|ache|aching|sore|soreness)\b/i },
    { key: 'sleep', label: 'Sleep difficulty', match: /\b(sleep|insomnia|can't sleep|cannot sleep)\b/i }
  ];
  const symptomPatternContexts = [
    { key: 'exercise', label: 'exercise or a workout', match: /\b(workout|exercise|gym|run(?:ning)?|jog(?:ging)?|lifting|physical activity|training)\b/i },
    { key: 'meal', label: 'eating or a meal', match: /\b(meal|eating|ate|food|breakfast|lunch|dinner|snack)\b/i },
    { key: 'sleep', label: 'poor or short sleep', match: /\b(poor sleep|little sleep|short sleep|late night|slept badly|not enough sleep)\b/i },
    { key: 'stress', label: 'a stressful day', match: /\b(stress(?:ed|ful)?|anxious|worry|busy day|overwhelmed)\b/i },
    { key: 'medicine', label: 'a new medicine or dose', match: /\b(new (?:medicine|medication|drug)|new dose|started (?:a )?(?:medicine|medication)|changed dose)\b/i },
    { key: 'hydration', label: 'not having enough water', match: /\b(dehydrat(?:ed|ion)|not enough water|little water|didn't drink enough|did not drink enough)\b/i },
    { key: 'travel', label: 'travel', match: /\b(travel(?:led|ing)?|flight|long drive|jet lag)\b/i },
    { key: 'screen', label: 'long screen time', match: /\b(screen time|computer|phone|laptop|video call)\b/i },
    { key: 'heat', label: 'heat or sun', match: /\b(heat|hot day|sun|sunny|humid)\b/i }
  ];
  const patternFamilyFor = value => symptomPatternFamilies.find(family => family.match.test(String(value || '')));
  const patternContextFor = entry => {
    const text = `${entry?.name || ''} ${entry?.triggers || ''} ${entry?.context || ''}`;
    return symptomPatternContexts.find(context => context.match.test(text));
  };
  function getSymptomPatternInsights(entries) {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 44);
    const groups = new Map();
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      if (!entry || entry.type !== 'symptom') return;
      const dateValue = String(entry.date || '');
      const date = new Date(`${dateValue}T12:00:00`);
      if (Number.isNaN(date.getTime()) || date < cutoff || date > now) return;
      const family = patternFamilyFor(entry.name || entry.title);
      const context = patternContextFor(entry);
      if (!family || !context) return;
      const key = `${family.key}:${context.key}`;
      const group = groups.get(key) || { key, family, context, entries: [], dates: new Set() };
      group.entries.push(entry);
      group.dates.add(dateValue);
      groups.set(key, group);
    });
    return Array.from(groups.values())
      .filter(group => group.dates.size >= 2)
      .map(group => {
        const latest = group.entries.slice().sort((left, right) => symptomDateValue(right).localeCompare(symptomDateValue(left)))[0];
        return { key: group.key, family: group.family, context: group.context, count: group.dates.size, latestDate: latest?.date || '' };
      })
      .sort((left, right) => right.count - left.count || String(right.latestDate).localeCompare(String(left.latestDate)));
  }

  const symptomObservationItems = entry => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const items = [];
    const triggers = clean(entry?.triggers);
    const context = clean(entry?.context);
    if (triggers) items.push({ kind: 'trigger', label: 'Possible trigger', text: triggers });
    if (context) items.push({ kind: 'context', label: 'Context note', text: context });
    return items;
  };

  function renderSymptomTriggers(entries) {
    if (!els.symptomTriggers) return;
    const observations = entries.flatMap(entry => symptomObservationItems(entry).map(observation => ({ entry, ...observation })));
    if (!observations.length) {
      const hasEntries = entries.length > 0;
      els.symptomTriggers.innerHTML = `<div class="symptom-triggers-empty"><span class="symptom-trigger-empty-icon" aria-hidden="true">✦</span><h3>${hasEntries ? 'No observations recorded yet' : 'Start with what you notice'}</h3><p>${hasEntries ? 'Edit a diary entry and add a possible trigger or context note. Your observations will appear here.' : 'Add a symptom and note what was happening around it. Your notes will stay private to this hub.'}</p><button type="button" class="primary-button" data-modal="symptom">＋ ${hasEntries ? 'Add an observation' : 'Add your first symptom'}</button></div>`;
      return;
    }
    const grouped = new Map();
    observations.forEach(({ entry, kind, label, text }) => {
      const key = `${kind}:${text.toLocaleLowerCase()}`;
      const current = grouped.get(key) || { kind, label, text, entries: [] };
      current.entries.push(entry);
      grouped.set(key, current);
    });
    const groups = Array.from(grouped.values()).sort((left, right) => {
      if (right.entries.length !== left.entries.length) return right.entries.length - left.entries.length;
      return symptomDateValue(right.entries[0]).localeCompare(symptomDateValue(left.entries[0]));
    });
    els.symptomTriggers.innerHTML = `<div class="symptom-triggers-intro"><span class="symptom-trigger-mark" aria-hidden="true"><svg class="symptom-icon-svg" viewBox="0 0 24 24"><path d="M12 3.5c.7 4.6 3.2 7.1 7.8 7.8-4.6.7-7.1 3.2-7.8 7.8-.7-4.6-3.2-7.1-7.8-7.8 4.6-.7 7.1-3.2 7.8-7.8Z"/></svg></span><div><h3>Recorded observations</h3><p>These are patterns you wrote down near a symptom — not a diagnosis or proof of cause.</p></div></div><div class="symptom-trigger-list">${groups.map(group => {
      const names = Array.from(new Set(group.entries.map(symptomName))).slice(0, 3);
      const nameSummary = names.join(', ') + (group.entries.length > names.length ? ` +${group.entries.length - names.length} more` : '');
      const latest = group.entries.slice().sort((left, right) => symptomDateValue(right).localeCompare(symptomDateValue(left)))[0];
      const countLabel = `${group.entries.length} ${group.entries.length === 1 ? 'entry' : 'entries'}`;
      return `<article class="symptom-trigger-item"><span class="symptom-trigger-icon" aria-hidden="true"><svg class="symptom-icon-svg" viewBox="0 0 24 24"><path d="M7 5.5h10M7 9.5h10M7 13.5h6M5 3.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/></svg></span><div class="symptom-trigger-copy"><div class="symptom-trigger-heading"><b>${escapeHTML(group.label)}</b><small>${countLabel}</small></div><p>${escapeHTML(group.text)}</p><small class="symptom-trigger-meta">Near: ${escapeHTML(nameSummary)} · Last noted ${escapeHTML(formatShortDate(latest.date))}</small></div></article>`;
    }).join('')}</div><p class="symptom-triggers-note"><span aria-hidden="true">i</span> Keep noting what you experience in your own words. A qualified healthcare professional can help interpret patterns in context.</p>`;
  }

  function renderSymptomInsights(entries) {
    if (!els.symptomPatternCard || !els.symptomPatternList) return;
    const symptomEntries = (Array.isArray(entries) ? entries : []).filter(entry => entry && entry.type === 'symptom');
    if (!symptomEntries.length) {
      els.symptomPatternCard.hidden = true;
      return;
    }
    const insights = getSymptomPatternInsights(symptomEntries);
    els.symptomPatternCard.hidden = false;
    if (els.symptomPatternTitle) els.symptomPatternTitle.textContent = insights.length ? 'Observations to review' : 'Your notes are being grouped';
    if (!insights.length) {
      els.symptomPatternList.innerHTML = '<div class="symptom-pattern-empty"><b>Keep noting what was happening around each symptom.</b><p>Similar symptom and context notes from different days will be grouped here for your review.</p></div>';
      return;
    }
    els.symptomPatternList.innerHTML = insights.slice(0, 3).map(insight => {
      const noteLabel = `${insight.count} ${insight.count === 1 ? 'note' : 'notes'} on different days in the last 45 days`;
      return `<article class="symptom-pattern-item"><span class="symptom-pattern-item-icon" aria-hidden="true">≈</span><div><b>${escapeHTML(insight.family.label)} recorded near ${escapeHTML(insight.context.label)}</b><p>${escapeHTML(noteLabel)}. This is a grouping of your notes, not evidence that one thing caused another. You may choose to discuss it with a qualified healthcare professional.</p><small>Last noted ${escapeHTML(formatShortDate(insight.latestDate))}</small></div></article>`;
    }).join('');
  }

  function renderSymptoms() {
    if (!els.symptomList) return;
    const entries = state.timeline
      .filter(entry => entry && typeof entry === 'object' && entry.type === 'symptom')
      .slice()
      .sort((left, right) => symptomDateValue(right).localeCompare(symptomDateValue(left)));
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const weeklyEntries = entries.filter(entry => {
      const date = new Date(`${entry.date || ''}T12:00:00`);
      return !Number.isNaN(date.getTime()) && date >= sevenDaysAgo && date <= todayEnd;
    });
    const daysLogged = new Set(entries.map(entry => String(entry.date || '')).filter(Boolean));
    const latest = entries.find(entry => {
      const date = new Date(`${entry.date || ''}T12:00:00`);
      return !Number.isNaN(date.getTime()) && date <= todayEnd;
    });
    if (els.symptomCount) els.symptomCount.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    if (els.symptomWeekCount) els.symptomWeekCount.textContent = String(weeklyEntries.length);
    if (els.symptomDaysCount) els.symptomDaysCount.textContent = String(daysLogged.size);
    if (els.symptomLastLog) els.symptomLastLog.textContent = latest ? `${formatShortDate(latest.date)}${latest.time ? ` · ${formatTime(latest.time)}` : ''}` : 'No entries';
    renderSymptomInsights(entries);

    if (els.symptomTriggers) {
      renderSymptomTriggers(entries);
      els.symptomTriggers.hidden = symptomMode !== 'triggers';
    }
    $$('[data-symptom-mode]').forEach(button => {
      const active = button.dataset.symptomMode === symptomMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    els.symptomList.hidden = symptomMode === 'triggers';
    if (symptomMode === 'triggers') return;
    if (!entries.length) {
      els.symptomList.innerHTML = `<div class="symptom-empty"><span aria-hidden="true">${symptomEmptyIcon('empty')}</span><h3>Start with what you notice</h3><p>Add a note in your own words, then include timing, intensity or context if useful.</p><button type="button" class="primary-button" data-modal="symptom">＋ Add your first symptom</button></div>`;
      return;
    }
    els.symptomList.innerHTML = entries.map(entry => {
      const severity = symptomSeverity(entry.severity);
      const severityTone = severity === null ? 'unknown' : severity >= 7 ? 'high' : severity >= 4 ? 'moderate' : 'low';
      const dateParts = appointmentParts(entry.date);
      const meter = severity === null ? '' : Array.from({ length: 10 }, (_, index) => `<i class="${index < severity ? 'active' : ''}"></i>`).join('');
      const context = String(entry.context || '').trim();
      const triggers = String(entry.triggers || '').trim();
      const notes = String(entry.notes || (entry.source === 'symptom-diary' ? '' : entry.description) || '').trim();
      const duration = String(entry.duration || '').trim();
      const detailRows = [
        ['Where', entry.location],
        ['Pattern', entry.frequency],
        ['Feels like', entry.quality],
        ['Alongside', entry.associatedSymptoms],
        ['Impact', entry.impact && symptomImpactLabels[entry.impact]],
        ['Tried', entry.interventions]
      ].filter(([, value]) => String(value || '').trim());
      const detailMarkup = detailRows.length ? `<dl class="symptom-entry-details">${detailRows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value).trim())}</dd></div>`).join('')}</dl>` : '';
      return `<article class="symptom-entry severity-${severityTone}">
        <div class="symptom-entry-date"><span>${escapeHTML(dateParts.weekday || '')}</span><b>${escapeHTML(dateParts.day || '')}</b><small>${escapeHTML(dateParts.month || '')}${entry.time ? ` · ${escapeHTML(formatTime(entry.time))}` : ''}</small></div>
        <div class="symptom-entry-content"><div class="symptom-entry-heading"><div><h3>${escapeHTML(symptomName(entry))}</h3>${duration ? `<small>${escapeHTML(duration)}</small>` : ''}</div></div>
          ${severity === null ? '<div class="symptom-severity symptom-severity-unknown"><span>Intensity not recorded</span></div>' : `<div class="symptom-severity" aria-label="Intensity ${severity} out of 10"><span><b>${severity}/10</b> intensity</span><span class="symptom-severity-meter" aria-hidden="true">${meter}</span></div>`}
          ${triggers ? `<p class="symptom-context"><b>Possible trigger</b>${escapeHTML(triggers)}</p>` : ''}
          ${context ? `<p class="symptom-context"><b>Context</b>${escapeHTML(context)}</p>` : ''}
          ${notes ? `<p class="symptom-notes">${escapeHTML(notes)}</p>` : ''}
          ${detailMarkup}
          <div class="symptom-entry-actions"><button type="button" data-prepare-symptom="${escapeHTML(entry.id)}">Prepare for care <span>✦</span></button><button type="button" data-edit-symptom="${escapeHTML(entry.id)}">Edit</button><button type="button" class="delete-item" data-delete-symptom="${escapeHTML(entry.id)}">Delete</button></div>
        </div>
      </article>`;
    }).join('');
  }

  function renderTimeline() {
    if (!els.timelineList) return;
    const visibleTimeline = state.timeline.filter(entry => hasProAccess() || !isDocumentEntry(entry));
    const entries = visibleTimeline.filter(entry => timelineFilter === 'all' || entry.type === timelineFilter);
    els.timelineList.innerHTML = entries.length ? entries.map(entry => {
      const description = entry.type === 'symptom' ? symptomLogDescription(entry) : entry.description;
      return `<article class="timeline-entry ${escapeHTML(entry.type)}"><span class="timeline-dot">${escapeHTML(entry.icon || '•')}</span><div><h3>${escapeHTML(entry.title)}</h3><p>${escapeHTML(description)}</p></div><time>${formatDate(entry.date)}</time></article>`;
    }).join('') : '<div class="empty-state">No entries match this filter yet.</div>';
  }

  function renderDocuments() {
    if (!els.documentsGrid) return;
    if (!hasProAccess()) {
      els.documentsGrid.innerHTML = proFeatureGate('Your private file library is part of Pro.', 'Upload and share prescriptions, lab reports, referrals, letters, imaging, scans and health photos only when you choose.');
      return;
    }
    const docs = state.documents.filter(doc => documentFilter === 'all' || doc.category === documentFilter);
    els.documentsGrid.innerHTML = docs.length ? docs.map(doc => `<article class="document-card"><span class="document-type">${escapeHTML(doc.type)}</span><h3>${escapeHTML(doc.title)}</h3><p>${escapeHTML(doc.description)}</p><small>${escapeHTML(doc.date)} · ${escapeHTML(doc.size)}</small><div class="document-card-actions"><button type="button" data-document-view="${escapeHTML(doc.id)}">View document</button><button type="button" data-explain-document="${escapeHTML(doc.title)}">Explain with AI <span>✦</span></button><button type="button" data-document-download="${escapeHTML(doc.id)}">Download</button><button type="button" class="delete-item" data-delete-document="${escapeHTML(doc.id)}">Delete</button></div></article>`).join('') : '<div class="empty-state">No documents in this category yet.</div>';
  }

  function renderProControls() {
    $$('[data-pro-feature]').forEach(control => {
      const locked = !hasProAccess();
      control.classList.toggle('pro-locked', locked);
      control.removeAttribute('aria-disabled');
      if (locked) control.setAttribute('aria-label', `${control.textContent.trim()} — DoctorAI Pro feature`);
      else control.removeAttribute('aria-label');
      control.title = locked ? 'DoctorAI Pro feature' : '';
    });
  }

  function renderMeasurement(range = trendRange) {
    trendRange = range;
    const latest = state.measurements.find(item => item.type === range);
    if (!latest) {
      if (els.measurementValue) els.measurementValue.textContent = 'No data yet';
      if (els.measurementLabel) els.measurementLabel.textContent = 'Log a measurement to start a trend';
      if (els.measurementStatus) els.measurementStatus.textContent = '';
      if (els.largeChart) els.largeChart.hidden = true;
      if (els.measurementChips) els.measurementChips.innerHTML = measurementPills(state.measurements) || '<span class="trend-empty">Your personal signals will appear here.</span>';
      $$('[data-range]').forEach(button => button.classList.toggle('active', button.dataset.range === range));
      return;
    }
    if (els.measurementValue) els.measurementValue.innerHTML = escapeHTML(latest.value).replace(' / ', ' <small>/</small> ');
    if (els.measurementLabel) els.measurementLabel.textContent = `${range === 'blood-pressure' ? 'Blood pressure' : range[0].toUpperCase() + range.slice(1)} · ${formatShortDate(latest.date)}`;
    if (els.measurementStatus) els.measurementStatus.textContent = range === 'blood-pressure' ? 'Within your usual range' : 'A useful pattern to keep watching';
    if (els.largeChart) els.largeChart.hidden = false;
    if (els.measurementChips) els.measurementChips.innerHTML = measurementPills(state.measurements) || '<span class="trend-empty">Your personal signals will appear here.</span>';
    $$('[data-range]').forEach(button => button.classList.toggle('active', button.dataset.range === range));
  }

  function renderAll() {
    applyBrandTheme();
    updateDate();
    renderTodayOverview();
    renderCareHome();
    renderTodayMedications();
    renderMedicationLibrary();
    renderTodayAppointment();
    renderTodayTrend();
    renderHomePrescriptionAlert();
    renderTasks();
    renderActivity();
    renderProfile();
    renderResults();
    renderSymptoms();
    renderTimeline();
    renderDocuments();
    renderRefillCard();
    renderMedicationHistory();
    renderAppointments();
    renderMeasurement(trendRange);
    renderProControls();
  }

  function setMemory(enabled) {
    state.memoryEnabled = Boolean(enabled);
    saveState();
    renderProfile();
    if (state.memoryEnabled && !approvedChatMemory().length) showToast('Health Memory is on, but no approved details have been added yet.');
    else showToast(state.memoryEnabled ? 'Health Memory is on. Only your approved details will be shared in new messages.' : 'Health Memory is off. It will not be used in new messages.');
  }

  let profileReturnFocus = null;
  function openProfile() {
    setMobileMenuOpen(false);
    profileReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    els.drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('[data-open-profile]').forEach(item => item.setAttribute('aria-expanded', 'true'));
    requestAnimationFrame(() => els.drawer.querySelector('[data-close-profile]')?.focus({ preventScroll: true }));
  }
  function closeProfile(restoreFocus = false) {
    if (els.drawer.hidden) return;
    els.drawer.hidden = true;
    document.body.style.overflow = '';
    document.querySelectorAll('[data-open-profile]').forEach(item => item.setAttribute('aria-expanded', 'false'));
    if (restoreFocus && profileReturnFocus?.isConnected) profileReturnFocus.focus({ preventScroll: true });
    profileReturnFocus = null;
  }
  function openPrivacy() {
    if (!els.privacyModal.open) els.privacyModal.showModal();
  }
  function closeModal() { if (els.modal.open) els.modal.close(); }
  function closePrivacy() { if (els.privacyModal.open) els.privacyModal.close(); }
  function setGoogleSigninStatus(message, tone = '') {
    if (!els.googleSigninStatus) return;
    els.googleSigninStatus.textContent = message;
    els.googleSigninStatus.dataset.tone = tone;
  }
  function initialsAvatar(user) {
    const source = String(user?.name || user?.email || 'U').trim();
    const words = source.split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : source.slice(0, 2)).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#173451"/><text x="50" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#d8f6ff">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  function setAvatar(root, user, signedIn) {
    const image = root?.querySelector('img');
    if (!root || !image) return;
    root.classList.toggle('google-avatar', !signedIn);
    root.classList.toggle('initials-avatar', signedIn);
    image.src = signedIn ? initialsAvatar(user) : 'google-g-logo.svg';
    image.alt = signedIn ? 'Account initials' : '';
  }
  function renderAccountSession(user, loginId = '') {
    const previousEmail = String(authUser?.email || '').trim().toLowerCase();
    const nextEmail = String(user?.email || '').trim().toLowerCase();
    if (previousEmail && previousEmail !== nextEmail) clearChat({ confirm: false, notify: false });
    if (previousEmail !== nextEmail) medicationAccountDataReady = false;
    authUser = user || null;
    medicationLoginId = authUser && /^[a-f0-9]{64}$/.test(loginId) ? loginId : '';
    refreshMedicationCheckContext().catch(() => {});
    const signedIn = Boolean(authUser);
    const displayName = String(authUser?.name || authUser?.email || 'Your account');
    const firstName = displayName.split(/\s+/)[0];
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    if (els.todayGreeting) els.todayGreeting.textContent = `${salutation}${signedIn ? `, ${firstName}` : ''}.`;
    const accountLink = $('.account-link');
    if (accountLink) {
      accountLink.querySelector('b').textContent = signedIn ? displayName : 'Sign in with Google';
      accountLink.querySelector('small').textContent = signedIn ? authUser.email : 'Keep your health hub private';
      setAvatar(accountLink.querySelector('.avatar'), authUser, signedIn);
    }
    const profileName = $('.profile-trigger-name');
    if (profileName) profileName.textContent = signedIn ? firstName : 'Sign in';
    const profileTrigger = $('.profile-trigger');
    if (profileTrigger) profileTrigger.setAttribute('aria-label', signedIn ? `Open profile for ${displayName}` : 'Sign in with Google');
    if (els.profilePageName) els.profilePageName.textContent = signedIn ? displayName : 'Your profile';
    if (els.profilePageEmail) els.profilePageEmail.textContent = signedIn ? authUser.email : 'Shortcuts and settings for your private hub';
    if (els.profilePageAvatar) setAvatar(els.profilePageAvatar, authUser, signedIn);
    const drawerProfile = $('.drawer-profile');
    if (drawerProfile) {
      drawerProfile.querySelector('b').textContent = signedIn ? displayName : 'Not signed in';
      drawerProfile.querySelector('small').textContent = signedIn ? authUser.email : 'Sign in to personalise your private workspace';
      drawerProfile.querySelector('button').textContent = signedIn ? 'Account' : 'Sign in';
      setAvatar(drawerProfile.querySelector('.avatar'), authUser, signedIn);
    }
    setAvatar($('.profile-trigger .avatar'), authUser, signedIn);
    const welcome = $('#today-welcome');
    if (welcome) welcome.textContent = signedIn
      ? `Welcome, ${firstName}. Your health stays in your hands.`
      : 'Welcome to DoctorAI. Your health stays in your hands.';
    const accountAction = $('.drawer-signout');
    if (accountAction) {
      accountAction.toggleAttribute('data-google-signout', signedIn);
      accountAction.toggleAttribute('data-google-signin', !signedIn);
      accountAction.innerHTML = signedIn ? 'Sign out <span>→</span>' : 'Sign in with Google <span>→</span>';
    }
    if (signedIn) loadCloudState().catch(() => {});
    else setSyncStatus(deviceStorageStatus());
  }
  function renderEntitlementStatus() {
    refreshMedicationCheckContext().catch(() => {});
    const title = $('#drawer-pro-status');
    const copy = $('#drawer-pro-countdown');
    if (!title || !copy) return;
    const expiry = entitlementExpiresAt ? new Date(Number(entitlementExpiresAt) * 1000) : null;
    const remaining = expiry ? expiry.getTime() - Date.now() : 0;
    if (!expiry || !Number.isFinite(expiry.getTime()) || remaining <= 0) { title.textContent = 'Free plan'; copy.textContent = 'No active Pro access'; return; }
    const totalMinutes = Math.max(1, Math.ceil(remaining / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
    if (hours && parts.length < 2) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (!days && !hours) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    title.textContent = 'Pro active';
    copy.textContent = `${parts.join(', ')} remaining · expires ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  async function loadAccountSession() {
    const revision = ++accountSessionRevision;
    try {
      const response = await fetch('/api/auth/google', { headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (revision !== accountSessionRevision) return;
      renderAccountSession(response.ok && payload.authenticated ? payload.user : null, payload.medicationLoginId);
    } catch {
      if (revision === accountSessionRevision) renderAccountSession(null);
    } finally { if (revision === accountSessionRevision) { accountSessionReady = true; refreshMedicationCheckContext().catch(() => {}); } }
  }
  async function loadEntitlement() {
    const revision = accountSessionRevision;
    try {
      const response = await fetch('/api/stripe/entitlement', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Pro access could not be verified.');
      const payload = await response.json();
      if (revision !== accountSessionRevision) return;
      if (payload.active === true) {
        entitlementExpiresAt = Number(payload.expiresAt) || null;
        subscriptionTier = 'pro';
        document.body.dataset.subscription = 'pro';
        applyBrandTheme();
        renderAll();
        showToast('DoctorAI Pro is active on this device.');
      } else { entitlementExpiresAt = null; subscriptionTier = 'free'; applyBrandTheme(); }
      renderEntitlementStatus();
      refreshMedicationCheckContext().catch(() => {});
      if (!entitlementTimer) entitlementTimer = window.setInterval(renderEntitlementStatus, 60000);
    } catch { if (revision === accountSessionRevision) { entitlementExpiresAt = null; subscriptionTier = 'free'; renderEntitlementStatus(); } } finally { if (revision === accountSessionRevision) { entitlementReady = true; refreshMedicationCheckContext().catch(() => {}); } }
  }
  async function signOut() {
    ++accountSessionRevision;
    try { await fetch('/api/auth/google', { method: 'DELETE' }); } catch {}
    renderAccountSession(null);
    closeProfile();
    showToast('Signed out securely. Health information saved on this device was not deleted.');
  }
  let googleSignInConfigured = false;
  let googleSignInConfigPromise = null;
  async function configureGoogleSignIn() {
    if (googleSignInConfigured) return;
    if (googleSignInConfigPromise) return googleSignInConfigPromise;
    googleSignInConfigPromise = configureGoogleSignInOnce();
    try { await googleSignInConfigPromise; } finally { googleSignInConfigPromise = null; }
  }
  async function configureGoogleSignInOnce() {
    if (!els.googleSigninButton || !els.googleSigninFallback) return;
    let clientId = '';
    try {
      const configResponse = await fetch('/api/auth/config', { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (configResponse.ok) {
        const config = await configResponse.json();
        clientId = String(config.googleClientId || '').trim();
        medicationRulesVersion = String(config.medicationRulesVersion || '');
        refreshMedicationCheckContext().catch(() => {});
      }
    } catch { /* Keep the safe setup message below. */ }
    if (!clientId) {
      els.googleSigninButton.hidden = true;
      els.googleSigninFallback.hidden = false;
      setGoogleSigninStatus('Google sign-in needs the OAuth client ID for www.doctoraiworld.com before it can create a secure session.', 'setup');
      return;
    }
    if (!window.google?.accounts?.id) {
      setGoogleSigninStatus('Loading Google sign-in…');
      window.setTimeout(() => { configureGoogleSignIn().catch(() => {}); }, 500);
      return;
    }
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential, cancel_on_tap_outside: true });
    els.googleSigninButton.replaceChildren();
    window.google.accounts.id.renderButton(els.googleSigninButton, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 280 });
    els.googleSigninButton.hidden = false;
    els.googleSigninFallback.hidden = true;
    googleSignInConfigured = true;
    setGoogleSigninStatus('Continue with Google to open your private DoctorAI workspace.');
  }
  async function handleGoogleCredential(response) {
    if (googleCredentialInFlight) return;
    if (!response?.credential) {
      setGoogleSigninStatus('Google sign-in was cancelled. No health information was changed.');
      return;
    }
    googleCredentialInFlight = true;
    const startingRevision = accountSessionRevision;
    try {
      const result = await fetch('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: response.credential }) });
      const payload = await result.json().catch(() => ({}));
      if (startingRevision !== accountSessionRevision) return;
      if (!result.ok) {
        const error = new Error(payload.error || 'Secure session endpoint unavailable');
        error.status = result.status;
        throw error;
      }
      const loginRevision = ++accountSessionRevision; accountSessionReady = true;
      const sameAccount = String(authUser?.email || '').toLowerCase() === String(payload.user?.email || '').toLowerCase();
      if (!sameAccount) { entitlementReady = false; renderAccountSession(payload.user || null, payload.medicationLoginId); }
      await loadEntitlement();
      if (loginRevision !== accountSessionRevision) return;
      if (sameAccount) renderAccountSession(payload.user || null, payload.medicationLoginId);
      closeGoogleSignIn();
      showToast('Signed in to your private DoctorAI workspace.');
    } catch (error) {
      if (startingRevision !== accountSessionRevision) return;
      if (error?.status === 401) {
        setGoogleSigninStatus('Google sign-in could not be verified. Please try again and choose your Google account once more.', 'setup');
      } else if (error?.status === 429) {
        setGoogleSigninStatus('Too many sign-in attempts. Please wait a few minutes, then try again.', 'setup');
      } else {
        setGoogleSigninStatus('DoctorAI could not create your secure session. Please check your connection and try again. No health information was changed.', 'setup');
      }
    } finally { googleCredentialInFlight = false; }
  }
  function openGoogleSignIn() {
    closeProfile();
    if (!els.googleSigninModal) return;
    if (!els.googleSigninModal.open) els.googleSigninModal.showModal();
    configureGoogleSignIn();
  }
  function closeGoogleSignIn() { if (els.googleSigninModal?.open) els.googleSigninModal.close(); }
  function renderCareHome() {
    const copy = $('#care-pattern-copy');
    if (!copy) return;
    const insight = getSymptomPatternInsights(state.timeline)[0];
    copy.textContent = insight
      ? `Your log mentions ${insight.family.label.toLowerCase()} alongside ${insight.context.label} on ${insight.count} different days in the last 45 days.`
      : 'Log symptoms and what was happening around them. Repeated observations can help you prepare questions.';
  }

  let careSummaryDraft = null;
  const briefDate = value => {
    const date = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== Number(date.slice(0, 4)) || parsed.getMonth() + 1 !== Number(date.slice(5, 7)) || parsed.getDate() !== Number(date.slice(8, 10)) ? '' : date;
  };
  const briefLocalDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function updateBriefPeriod(form) {
    const since = briefDate(form.elements.since.value);
    const today = briefLocalDate(new Date());
    let available = 0;
    form.querySelectorAll('.care-summary-choice').forEach(choice => {
      const date = briefDate(choice.dataset.briefDate);
      const visible = !choice.hasAttribute('data-brief-date') || ((!since || (date && date >= since)) && (!date || date <= today));
      choice.hidden = !visible;
      if (!visible) choice.querySelector('input').checked = false;
      else available++;
    });
    form.querySelectorAll('fieldset').forEach(group => {
      const hasRecords = !!group.querySelector('.care-summary-choice:not([hidden])');
      group.querySelector('[data-brief-empty]').hidden = hasRecords;
      group.hidden = !hasRecords;
    });
    form.querySelector('[data-brief-empty-all]').hidden = available > 0;
    form.querySelector('[data-brief-count]').textContent = `${available} saved records available to choose. Current medicines are shown separately from dated notes.`;
  }
  function openPersonalOverview() {
    const oneLine = (value, limit = 420) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
    };
    const detailSection = (title, entries, className = '') => {
      const saved = entries.filter(([, value]) => value);
      if (!saved.length) return '';
      return `<section class="personal-overview-section${className ? ` ${className}` : ''}"><h3>${escapeHTML(title)}</h3><dl>${saved.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl></section>`;
    };
    const listSection = (title, entries, emptyMessage) => {
      const content = entries.length
        ? `<ul>${entries.map(entry => `<li>${escapeHTML(entry)}</li>`).join('')}</ul>`
        : `<p class="personal-overview-empty">${escapeHTML(emptyMessage)}</p>`;
      return `<section class="personal-overview-section"><h3>${escapeHTML(title)}</h3>${content}</section>`;
    };
    const profileRows = [
      ['Name', oneLine(state.profile.name, 100)],
      ['Blood type', oneLine(state.profile.bloodType, 80)],
      ['Conditions & history', oneLine(state.profile.conditions)],
      ['Allergies & reactions', oneLine(state.profile.allergies)],
      ['Personal notes', oneLine(state.profile.notes, 900)]
    ];
    const sections = [];
    const profileSection = detailSection('Health details you saved', profileRows);
    if (profileSection) sections.push(profileSection);

    const medicines = state.medications.slice(0, 12).map(item => oneLine([
      item.name,
      item.dose,
      item.frequency,
      item.status === 'missed' ? 'Marked missed today' : ''
    ].filter(Boolean).join(' · '), 320)).filter(Boolean);
    sections.push(listSection('Saved medicines', medicines, 'No medicines saved yet.'));

    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const appointments = upcomingAppointments()
      .filter(item => item.date && item.date >= localToday)
      .slice(0, 6)
      .map(item => oneLine([formatDate(item.date), item.time ? formatTime(item.time) : '', item.title, item.provider, item.location].filter(Boolean).join(' · '), 320));
    sections.push(listSection('Upcoming appointments', appointments, 'No upcoming appointments saved.'));

    const sortNewest = items => items.slice().sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
    const symptoms = sortNewest(state.timeline.filter(item => item.type === 'symptom')).slice(0, 5).map(item => oneLine([
      formatDate(item.date),
      symptomName(item),
      symptomSeverity(item.severity) === null ? '' : `Intensity ${symptomSeverity(item.severity)}/10`,
      item.triggers ? `Context: ${item.triggers}` : '',
      item.notes || item.context
    ].filter(Boolean).join(' · '), 360));
    sections.push(listSection('Recent symptom notes', symptoms, 'No symptom notes saved yet.'));

    const measurements = sortNewest(state.measurements).slice(0, 5).map(item => oneLine([
      formatDate(item.date),
      String(item.type || 'Measurement').replace(/-/g, ' '),
      item.value,
      item.unit,
      item.note
    ].filter(Boolean).join(' · '), 300));
    sections.push(listSection('Recent measurements', measurements, 'No measurements saved yet.'));

    const otherNotes = sortNewest(state.timeline.filter(item => !['symptom', 'medication', 'appointment', 'result'].includes(item.type))).slice(0, 5).map(item => oneLine([
      formatDate(item.date), item.title, item.description
    ].filter(Boolean).join(' · '), 320));
    if (otherNotes.length) sections.push(listSection('Other recent notes', otherNotes, ''));

    const openTasks = state.tasks.filter(item => !item.done).slice(0, 6).map(item => oneLine([item.label, item.detail].filter(Boolean).join(' · '), 240));
    if (openTasks.length) sections.push(listSection('Reminders to review', openTasks, ''));

    const memorySummary = state.memoryEnabled
      ? `On · ${state.memoryDetails.length} approved detail${state.memoryDetails.length === 1 ? '' : 's'} may be used in new chats${state.memoryDetails.length ? `: ${state.memoryDetails.map(detail => oneLine(detail, 140)).join('; ')}` : ''}`
      : 'Off · saved Health Memory details are not used in chat';
    sections.push(detailSection('Health Memory', [['Status', memorySummary]]));

    const hasSavedDetails = Boolean(
      Object.values(state.profile).some(value => String(value || '').trim()) ||
      state.medications.length || upcomingAppointments().length || state.timeline.length || state.measurements.length || state.tasks.length
    );
    if (!hasSavedDetails) sections.unshift('<section class="personal-overview-section personal-overview-start"><h3>Your overview is ready to build</h3><p>Add only the health details you want to keep. They will appear here when saved.</p><button type="button" class="secondary-button" data-modal="health">Add health details</button></section>');

    setModal('Your personal overview', 'Private rundown', `<div class="personal-overview-dialog"><p class="personal-overview-intro">A quick view of the details saved in your Health Hub. This is based on your notes and may be incomplete or out of date.</p><p class="personal-overview-generated">Updated from your saved information · ${escapeHTML(today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</p><div class="personal-overview-sections">${sections.join('')}</div><p class="personal-overview-safety"><strong>Your record, for your reference.</strong> Check details with your healthcare professional. This overview does not identify causes, diagnose conditions or recommend treatment changes. Do not use it for emergencies.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Close overview</button><button type="button" class="primary-button" data-modal="health">Edit health details <span aria-hidden="true">→</span></button></div></div>`);
  }

  function openTodayPlan() {
    const oneLine = (value, limit = 240) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
    };
    const now = new Date();
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const currentMedications = state.medications.filter(item => (!item.startDate || item.startDate <= localToday) && (!item.endDate || item.endDate >= localToday)).slice(0, 8);
    const recentSymptoms = state.timeline.filter(item => item.type === 'symptom').sort((left, right) => symptomDateValue(right).localeCompare(symptomDateValue(left))).slice(0, 4);
    const nextAppointment = upcomingAppointments().find(item => !item.date || item.date >= localToday);
    const openTasks = state.tasks.filter(item => !item.done).slice(0, 3);
    const profileDetails = [
      ['Name', oneLine(state.profile.name, 100)],
      ['Blood type', oneLine(state.profile.bloodType, 60)],
      ['Conditions & history', oneLine(state.profile.conditions)],
      ['Allergies & reactions', oneLine(state.profile.allergies)],
      ['Important notes', oneLine(state.profile.notes, 360)]
    ].filter(([, value]) => value);
    const medicationMarkup = currentMedications.length
      ? `<ul class="today-dashboard-list">${currentMedications.map(item => {
          const status = item.status === 'taken' ? 'Taken today' : item.status === 'missed' ? 'Marked missed' : 'To review today';
          const details = [item.dose, item.frequency, item.time ? formatTime(item.time) : ''].filter(Boolean).join(' · ');
          return `<li><span class="today-dashboard-list-icon medicine" aria-hidden="true">+</span><span><b>${escapeHTML(oneLine(item.name, 100) || 'Saved medicine')}</b><small>${escapeHTML(details || 'Check the saved label instructions')}</small><em>${escapeHTML(status)}</em></span></li>`;
        }).join('')}</ul>`
      : '<div class="today-dashboard-empty"><p>No current medicines saved.</p><button type="button" class="secondary-button" data-modal="medication">＋ Add medication</button></div>';
    const symptomMarkup = recentSymptoms.length
      ? `<ul class="today-dashboard-list">${recentSymptoms.map(item => {
          const severity = symptomSeverity(item.severity);
          const details = [formatDate(item.date), severity === null ? '' : `${severity}/10 intensity`, oneLine(item.triggers || item.context || item.notes, 120)].filter(Boolean).join(' · ');
          return `<li><span class="today-dashboard-list-icon symptom" aria-hidden="true">≈</span><span><b>${escapeHTML(oneLine(symptomName(item), 100))}</b><small>${escapeHTML(details || 'Saved symptom note')}</small></span></li>`;
        }).join('')}</ul>`
      : '<div class="today-dashboard-empty"><p>No recent symptoms recorded.</p><button type="button" class="secondary-button" data-modal="symptom">＋ Log a symptom</button></div>';
    const profileMarkup = profileDetails.length
      ? `<dl class="today-dashboard-facts">${profileDetails.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>`
      : '<div class="today-dashboard-empty"><p>No personal health details saved yet.</p><button type="button" class="secondary-button" data-modal="health">Add health details</button></div>';
    const plan = [];
    if (currentMedications.length) {
      const due = currentMedications.filter(item => !['taken', 'missed'].includes(item.status)).length;
      plan.push(['medicines', 'Review your medicine routine', `${due ? `${due} saved ${due === 1 ? 'medicine is' : 'medicines are'} still to review today.` : 'Your saved medicine statuses are up to date.'} Take medicines only as directed on the prescription label or by your clinician.`]);
    }
    if (recentSymptoms.length) {
      const latest = recentSymptoms[0];
      plan.push(['symptoms', `Check in on ${oneLine(symptomName(latest), 80)}`, 'Record whether it changed and what was happening around it. This can help you describe a pattern without guessing the cause.']);
    }
    if (nextAppointment) plan.push(['appointment', 'Prepare for your next appointment', `${formatDate(nextAppointment.date)}${nextAppointment.time ? ` at ${formatTime(nextAppointment.time)}` : ''}. Add the main concern or question you want to remember.`]);
    if (openTasks.length) plan.push(['tasks', 'Finish one small health task', oneLine(openTasks[0].label || openTasks[0].detail, 180) || 'Review your next saved health task.']);
    plan.push(['wellbeing', 'Keep today manageable', 'Follow any advice already given by your healthcare team. Choose ordinary meals, fluids, rest or gentle activity only when appropriate for you and any restrictions you have.']);
    const planMarkup = plan.slice(0, 4).map(([tone, title, copy], index) => `<li class="today-dashboard-step ${escapeHTML(tone)}"><span>${index + 1}</span><div><b>${escapeHTML(title)}</b><p>${escapeHTML(copy)}</p></div></li>`).join('');
    const appointmentMarkup = nextAppointment
      ? `<div class="today-dashboard-appointment"><span aria-hidden="true">◷</span><div><b>${escapeHTML(nextAppointment.title || 'Upcoming appointment')}</b><small>${escapeHTML([formatDate(nextAppointment.date), nextAppointment.time ? formatTime(nextAppointment.time) : '', nextAppointment.provider].filter(Boolean).join(' · '))}</small></div></div>`
      : '<p class="today-dashboard-no-appointment">No upcoming appointment saved.</p>';
    const medicationGuidance = medicationGuidanceMarkup(currentMedications);
    const verifiedMedicationGuidance = verifiedMedicationEducationMarkup(currentMedications);
    const verifiedSymptomGuidance = verifiedSymptomEducationMarkup(recentSymptoms);
    const savedCount = currentMedications.length + recentSymptoms.length + profileDetails.length + (nextAppointment ? 1 : 0);
    setModal('Your health briefing', 'Private daily overview', `<div class="today-dashboard"><section class="today-dashboard-summary"><div><p>Updated ${escapeHTML(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h3>${savedCount ? 'Everything important, in one view' : 'Start building your health briefing'}</h3><span>${savedCount ? `${savedCount} saved detail${savedCount === 1 ? '' : 's'} brought together privately.` : 'Add the information you want DoctorAI to organise.'}</span></div><span class="today-dashboard-summary-mark" aria-hidden="true">✓</span></section><div class="today-dashboard-grid"><section class="today-dashboard-section"><div class="today-dashboard-heading"><div><p>Current routine</p><h3>Medications and timings</h3></div><button type="button" data-today-view="medications">View all</button></div>${medicationMarkup}</section><section class="today-dashboard-section"><div class="today-dashboard-heading"><div><p>Recent notes</p><h3>Symptoms</h3></div><button type="button" data-today-view="symptoms">View diary</button></div>${symptomMarkup}</section><section class="today-dashboard-section"><div class="today-dashboard-heading"><div><p>Your saved information</p><h3>About you</h3></div><button type="button" data-modal="health">Edit</button></div>${profileMarkup}</section><section class="today-dashboard-section"><div class="today-dashboard-heading"><div><p>Coming up</p><h3>Next appointment</h3></div><button type="button" data-today-view="appointments">View all</button></div>${appointmentMarkup}</section></div>${verifiedMedicationGuidance}${verifiedSymptomGuidance}<section class="today-dashboard-section today-ai-briefing"><div class="today-dashboard-heading"><div><p>DoctorAI briefing</p><h3>Personalised points to review</h3></div><span>AI assisted</span></div><div id="today-ai-output" class="today-ai-output loading" role="status" aria-live="polite"><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><p>Reviewing only the recent symptom notes you chose to save…</p></div></section><section class="today-dashboard-section today-medication-guidance"><div class="today-dashboard-heading"><div><p>Medication support</p><h3>Tips from your saved labels</h3></div><span>Review first</span></div>${medicationGuidance}</section><section class="today-dashboard-section today-dashboard-plan"><div class="today-dashboard-heading"><div><p>Your plan for today</p><h3>Small, useful next steps</h3></div><span>Ready now</span></div><ol>${planMarkup}</ol></section><p class="today-dashboard-safety"><strong>Education and organisation—not diagnosis or a treatment plan.</strong> DoctorAI does not prescribe, recommend starting medication, or confirm that medicines are safe together. Verify medicine advice and possible interactions with a pharmacist or prescriber. If a symptom is sudden, severe or rapidly worsening, contact an appropriate healthcare or emergency service.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Close</button><button type="button" class="primary-button" data-open-summary>Build a visit brief <span aria-hidden="true">→</span></button></div></div>`);
    void loadTodayIntelligence(recentSymptoms);
  }

  function buildTodayPlanPrompt(values) {
    const compact = (value, max = 220) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
    const context = [];
    if (values.useSymptoms) {
      const symptoms = state.timeline.filter(item => item.type === 'symptom').sort((left, right) => symptomDateValue(right).localeCompare(symptomDateValue(left))).slice(0, 4).map(item => {
        const severity = symptomSeverity(item.severity);
        return [formatDate(item.date), symptomName(item), severity === null ? '' : `intensity ${severity}/10`, compact(item.triggers || item.context || item.notes, 160)].filter(Boolean).join(' · ');
      });
      if (symptoms.length) context.push(`Recent symptom notes: ${symptoms.join(' | ')}`);
    }
    if (values.useMedications) {
      const medications = state.medications.slice(0, 8).map(item => [compact(item.name, 100), compact(item.dose, 60), compact(item.frequency, 60), item.time ? formatTime(item.time) : '', compact(item.status, 30)].filter(Boolean).join(' · '));
      if (medications.length) context.push(`Medication schedule for organisation only: ${medications.join(' | ')}`);
    }
    if (values.useAppointments) {
      const appointments = upcomingAppointments().slice(0, 3).map(item => [formatDate(item.date), item.time ? formatTime(item.time) : '', compact(item.title, 100), compact(item.provider, 100)].filter(Boolean).join(' · '));
      if (appointments.length) context.push(`Upcoming appointments: ${appointments.join(' | ')}`);
    }
    if (values.useResults) {
      const measurements = state.measurements.slice().sort((left, right) => String(right.date || '').localeCompare(String(left.date || ''))).slice(0, 5).map(item => [formatDate(item.date), compact(item.type, 60), compact(item.value, 80), compact(item.unit, 40)].filter(Boolean).join(' · '));
      const results = state.timeline.filter(item => item.type === 'result').sort((left, right) => String(right.date || '').localeCompare(String(left.date || ''))).slice(0, 4).map(item => [formatDate(item.date), compact(item.title, 120), compact(item.description, 180)].filter(Boolean).join(' · '));
      const savedResults = [...measurements, ...results].slice(0, 7);
      if (savedResults.length) context.push(`Recent saved results and measurements, without interpretation: ${savedResults.join(' | ')}`);
    }
    if (values.useMemory) {
      const memory = approvedChatMemory();
      if (memory.length) context.push(`Approved Health Memory: ${memory.join(' | ')}`);
    }
    const approvedContext = context.length ? context.join('\n') : 'No saved health details were approved for this request.';
    return `Create a gentle plan for today. I feel ${compact(values.feeling, 40)} and my chosen focus is ${compact(values.focus, 80)}.\n\nUse only this approved context:\n${approvedContext}\n\nGive me: (1) one supportive sentence, (2) up to three practical low-risk actions for today, (3) one useful thing I could record or prepare, and (4) a brief note about when professional advice may be appropriate. Keep it concise and easy to scan. You may suggest ordinary options such as regular meals, hydration, rest, gentle movement, taking medicines only as already directed, or appointment preparation. Do not diagnose, infer a cause, infer medicine effects, compare medicines, or assess medicine safety; the saved medicine schedule is for organisation only. Do not prescribe a diet, recommend supplements, fasting, strenuous exercise, medication changes, or claim that an activity is safe for a specific condition. If the saved information makes an activity or food suggestion uncertain, say that clearly and suggest checking with a qualified professional.`;
  }

  function createTodayPlan(form, values) {
    if (!values.feeling || !values.focus || !values.confirmTodayPlan) {
      showToast('Complete the check-in and confirm the safety note first.');
      form.querySelector(':invalid')?.focus();
      return;
    }
    const prompt = buildTodayPlanPrompt(values);
    closeModal();
    if (!authUser) {
      fillChat(prompt);
      showToast('Sign in to create your private Today plan. Your draft is ready to review.');
      openGoogleSignIn();
      return;
    }
    showView('ask', true, true);
    void sendChat(prompt);
  }

  function openCareSummary() {
    const latest = items => items.slice().sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0,100);
    const symptoms = latest(state.timeline.filter(item => item.type === 'symptom'));
    const measurements = latest(state.measurements);
    const notes = latest(state.timeline.filter(item => item.type === 'medication'));
    const groups = [
      { title: 'What I noticed', dates: symptoms.map(item => briefDate(item.date)), items: symptoms.map(item => [symptomName(item), item.date, item.time, symptomSeverity(item.severity) === null ? '' : `Intensity: ${symptomSeverity(item.severity)}/10`, item.duration, item.context, item.triggers, item.notes || item.description].filter(Boolean).join(' · ')) },
      { title: 'Current saved medicines (not date filtered)', items: state.medications.map(item => [item.name, item.dose, item.frequency, item.instructions].filter(Boolean).join(' · ')) },
      { title: 'Measurements recorded', dates: measurements.map(item => briefDate(item.date)), items: measurements.map(item => [item.type || item.label, item.value, item.unit, item.systolic ? `${item.systolic}/${item.diastolic}` : '', item.date, item.note].filter(value => value !== '' && value !== undefined && value !== null).join(' · ')) },
      { title: 'Medicine notes recorded', dates: notes.map(item => briefDate(item.date)), items: notes.map(item => [item.date, item.title, item.description].filter(Boolean).join(' · ')) }
    ];
    careSummaryDraft = { groups, appointments: state.appointments.slice(), html: '' };
    const today = briefLocalDate(new Date());
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    const lastVisit = state.appointments.map(item => briefDate(item.date)).filter(date => date && date < today).sort().at(-1);
    const since = lastVisit || briefLocalDate(monthAgo);
    setModal('Since my last visit', 'Your visit brief', `<form class="care-summary-form" data-care-summary-form>
      <p>Bring the important details together before your appointment. Choose what to include, review it, then copy or print your brief. It stays on this device until you choose to share.</p>
      <label>Show notes from<input type="date" name="since" value="${since}" max="${today}"></label>
      <p>${lastVisit ? 'Starts at your latest past appointment date. Change it if that visit did not take place.' : 'Starts with the last 30 days. Choose the date of your last visit, or clear it to see all available notes.'}</p>
      <p data-brief-count role="status"></p>
      <label>What matters most at this visit?<textarea name="focus" rows="2" maxlength="500" placeholder="The one thing I most want to discuss…"></textarea></label>
      <label>Appointment (optional)<select name="appointment"><option value="">No appointment selected</option>${careSummaryDraft.appointments.map((item,i) => `<option value="${i}">${escapeHTML([item.title,item.date].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>
      ${groups.map((group,g) => `<fieldset><legend>${escapeHTML(group.title)}</legend>${group.items.map((text,i) => `<label class="care-summary-choice"${group.dates ? ` data-brief-date="${group.dates[i]}"` : ''}><input type="checkbox" name="entry" value="${g}:${i}"><span>${escapeHTML(text || 'Saved entry — check details before sharing')}</span></label>`).join('')}<p data-brief-empty>No saved records in this date range. You can still add your main concern and questions.</p></fieldset>`).join('')}
      <p data-brief-empty-all>No saved records in this period yet. Start with what matters most and the questions you want to ask.</p>
      <p>Nothing is selected automatically. Up to 100 recent records per dated section are available. Clear the date to include records with missing or older date formats. Medicine details are your saved notes, not verified prescription instructions.</p>
      <label>Questions to ask<textarea name="questions" rows="3" maxlength="2000" placeholder="What would I like explained? What should I record before our next visit?"></textarea></label>
      <p>Check dates, names and doses before sharing. DoctorAI does not diagnose, prescribe or recommend treatment changes.</p>
      <div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Review my brief →</button></div></form>`);
    const form = $('[data-care-summary-form]');
    form.elements.since.addEventListener('change', () => updateBriefPeriod(form));
    updateBriefPeriod(form);
  }

  function reviewCareSummary(form) {
    if (!careSummaryDraft) return;
    const data = new FormData(form);
    updateBriefPeriod(form);
    const chosen = new Set([...form.querySelectorAll('.care-summary-choice:not([hidden]) input:checked')].map(input => input.value));
    const selectedAppointment = data.get('appointment');
    const appointment = selectedAppointment === '' ? null : careSummaryDraft.appointments[Number(selectedAppointment)];
    const sections = careSummaryDraft.groups.map((group,g) => {
      const lines = group.items.filter((_,i) => chosen.has(`${g}:${i}`));
      return lines.length ? `<section><h3>${escapeHTML(group.title)}</h3><ul>${lines.map(text => `<li>${escapeHTML(text)}</li>`).join('')}</ul></section>` : '';
    }).join('');
    const questions = String(data.get('questions') || '').trim().slice(0,2000);
    const focus = String(data.get('focus') || '').trim().slice(0,500);
    const since = briefDate(data.get('since'));
    if (!sections && !questions && !appointment && !focus) { showToast('Choose a record or add your main concern or a question first.'); return; }
    careSummaryDraft.form = form;
    careSummaryDraft.html = `<h1>My visit brief</h1><p>Prepared ${escapeHTML(new Date().toLocaleDateString('en-GB'))} · Personal record</p><p>${since ? `Notes from ${escapeHTML(since)} through ${briefLocalDate(new Date())}, inclusive.` : 'All available dated notes through today.'} Current saved medicines are not date filtered.</p>${focus ? `<section><h3>What matters most to me</h3><p>${escapeHTML(focus)}</p></section>` : ''}${appointment ? `<section><h3>Appointment</h3><p>${escapeHTML([appointment.title,appointment.provider,appointment.date,appointment.time,appointment.location,appointment.note || appointment.notes].filter(Boolean).join('\n'))}</p></section>` : ''}${sections}${questions ? `<section><h3>Questions to ask</h3><p>${escapeHTML(questions)}</p></section>` : ''}<hr><p>Selected, self-reported information only; this may not be a complete medical record. These are recorded observations, not a verified history of changes. Check all details with your clinician. DoctorAI does not diagnose, prescribe or recommend treatment changes.</p>`;
    setModal('Review before sharing', 'Your visit brief', `<div class="care-summary-review"><p><b>Check that this includes only what you intend to share.</b> If you need to change a saved detail, close this brief and edit the original entry.</p><article id="care-summary-reviewed">${careSummaryDraft.html}</article><div class="care-print-actions"><button type="button" class="primary-button" data-print-care-summary>Print / save as PDF</button><button type="button" class="secondary-button" data-copy-care-summary>Copy brief</button><button type="button" class="secondary-button" data-edit-care-summary>Back to edit</button><button type="button" class="secondary-button" data-close-modal>Close</button></div><p><small>PDF saving uses your browser’s print dialog. Copying places this selected information on your device’s clipboard.</small></p></div>`);
  }

  function printCareSummary() {
    if (!careSummaryDraft?.html) return;
    const old = $('#care-summary-print');
    if (old) old.remove();
    const printRoot = document.createElement('article');
    printRoot.id = 'care-summary-print'; printRoot.className = 'care-print-root';
    printRoot.innerHTML = careSummaryDraft.html;
    document.body.append(printRoot); document.body.classList.add('care-printing');
    const cleanup = () => { printRoot.remove(); document.body.classList.remove('care-printing'); };
    window.addEventListener('afterprint', cleanup, { once: true });
    try { window.print(); } catch { cleanup(); showToast('Printing is unavailable here. Please open DoctorAI in your browser.'); }
  }

  function setModal(title, eyebrow, body) {
    els.modal.classList.toggle('today-plan-modal', eyebrow === 'Your private daily check-in' || eyebrow === 'Private daily overview');
    els.modalTitle.textContent = title;
    els.modalEyebrow.textContent = eyebrow;
    els.modalBody.innerHTML = body;
    const modalFeatures = { medication: 'medications', appointment: 'appointments', symptom: 'symptoms', measurement: 'results', health: 'health' };
    els.modalBody.querySelectorAll('.modal-choice[data-modal]').forEach(button => {
      const name = modalFeatures[button.dataset.modal];
      const icon = button.querySelector(':scope > span:first-child');
      if (!name || !icon) return;
      icon.className = `feature-icon tone-${profileShortcutDefinition(name)?.tone || 'blue'}`;
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = profileShortcutIconMarkup(name);
    });
    if (!els.modal.open) els.modal.showModal();
  }

  function persistProfileShortcuts() {
    profileShortcuts = normaliseProfileShortcuts(profileShortcuts);
    write('profile-shortcuts', profileShortcuts);
  }

  function openProfileShortcutPicker() {
    const available = profileShortcutDefinitions.filter(item => !profileShortcuts.includes(item.id));
    if (!available.length) {
      showToast('All available shortcuts are already pinned.');
      return;
    }
    const options = available.map(item => `<button type="button" class="profile-shortcut-choice" data-profile-shortcut-choice="${escapeHTML(item.id)}"><span class="profile-shortcut-icon tone-${escapeHTML(item.tone)}" aria-hidden="true">${profileShortcutIconMarkup(item.iconName)}</span><span><b>${escapeHTML(item.label)}</b><small>${escapeHTML(item.description)}</small></span><span aria-hidden="true">＋</span></button>`).join('');
    setModal('Add a shortcut', 'Personal shortcuts', `<div class="profile-shortcut-picker" role="list">${options}</div><p class="profile-shortcut-picker-note">When device storage is enabled, shortcut choices are saved as a local preference. They never include health information.</p>`);
  }

  function activateProfileShortcut(id) {
    const item = profileShortcutDefinition(id);
    if (!item) return;
    if (profileShortcutEditing) return;
    if (item.action === 'privacy') { openPrivacy(); return; }
    if (item.view) showView(item.view, true, true);
  }

  function openAddMenu() {
    setModal('Add to your health hub', 'Quick add', '<div class="modal-choice-grid"><button class="modal-choice" type="button" data-modal="medication"><span>▣</span><b>Medication</b><small>Add a prescription reminder</small></button><button class="modal-choice" type="button" data-modal="appointment"><span>◷</span><b>Appointment</b><small>Save a visit or follow-up</small></button><button class="modal-choice" type="button" data-modal="symptom"><span>≈</span><b>Symptom</b><small>Add to your private diary</small></button><button class="modal-choice" type="button" data-modal="measurement"><span>⌁</span><b>Measurement</b><small>Log a health signal</small></button><button class="modal-choice" type="button" data-modal="health"><span>♡</span><b>Health detail</b><small>Update your profile</small></button><button class="modal-choice" type="button" data-close-modal><span>×</span><b>Cancel</b><small>Return to your hub</small></button></div>');
  }

  function openMedicationModal(prefill = {}) {
    const editId = String(prefill.__editId || '').trim();
    const editing = Boolean(editId);
    const savedRefill = editing ? String(prefill.refill || '').trim() : '';
    if (editing) prefill = { ...prefill, refill: '' };
    const frequency = String(prefill.frequency || '');
    const missing = Array.isArray(prefill.__missing) ? prefill.__missing.filter(Boolean) : [];
    const ingredientPrefill = Array.isArray(prefill.activeIngredients) ? prefill.activeIngredients.join('; ') : String(prefill.activeIngredients || '');
    const scanError = String(prefill.__scanError || '').trim();
    const scanNote = scanError
      ? '<div class="modal-help scan-result-note scan-result-error"><b>Photo scan not completed.</b><span>' + escapeHTML(scanError) + ' You can enter the details below or try another photo.</span></div>'
      : prefill.__scanned
        ? '<div class="modal-help scan-result-note"><b>Suggested details from the photo — not verified.</b><span>' + (missing.length ? 'Required fields not read clearly: ' + escapeHTML(missing.join(', ')) + '. ' : '') + 'Check all filled and empty fields against the original before saving.</span></div>'
        : '';
    const hasLegacyMatch = Boolean(prefill.nzfProduct || prefill.nzfProductConfirmed || (Array.isArray(prefill.resolvedIngredients) && prefill.resolvedIngredients.length));
    const editNote = editing ? '<div class="modal-help scan-result-note"><b>Update saved medication details.</b><span>Leave the refill field blank to keep its current value' + (savedRefill && savedRefill !== 'Not set' ? ' (' + escapeHTML(savedRefill) + ')' : '') + '. Check “Clear saved refill date” to remove it.' + (hasLegacyMatch ? ' Older provider match details stay in this private record and are not used by the current check.' : '') + '</span></div>' : '';
    const requiresScanReview = Boolean(prefill.__scanned);
    setModal('Add a medication', 'Medication manager', scanNote + '<form class="modal-form" data-modal-form="medication" data-scan-attempted="' + Boolean(prefill.__scanAttempted || prefill.__scanned) + '" data-scan-review-required="' + requiresScanReview + '"><div class="modal-form-grid"><label class="modal-field"><span>Medication name *</span><input name="name" required maxlength="120" autocomplete="off" list="manual-medicine-list" placeholder="Start typing a medicine name" value="' + escapeHTML(prefill.name || '') + '"><datalist id="manual-medicine-list"></datalist></label><label class="modal-field"><span>Strength / dosage *</span><input name="dose" required maxlength="80" autocomplete="off" placeholder="e.g. 10 mg per tablet" value="' + escapeHTML(prefill.dose || '') + '"></label><label class="modal-field"><span>Preferred time (optional)</span><input name="time" type="time" value="' + escapeHTML(prefill.time || '') + '"></label><label class="modal-field"><span>Frequency</span><select name="frequency"><option value="">Choose frequency</option><option ' + (frequency === 'Once daily' ? 'selected' : '') + '>Once daily</option><option ' + (frequency === 'Twice daily' ? 'selected' : '') + '>Twice daily</option><option ' + (frequency === 'As needed' ? 'selected' : '') + '>As needed</option><option ' + (frequency === 'Weekly' ? 'selected' : '') + '>Weekly</option></select></label><label class="modal-field"><span>Start date</span><input name="startDate" type="date" value="' + escapeHTML(prefill.startDate || '') + '"></label><label class="modal-field"><span>End date</span><input name="endDate" type="date" value="' + escapeHTML(prefill.endDate || '') + '"></label><label class="modal-field"><span>Remaining supply (optional)</span><input name="supply" type="number" min="0" max="999999" placeholder="30" value="' + escapeHTML(prefill.supply ?? '') + '"></label><label class="modal-field"><span>Refill date</span><input name="refill" type="date" value="' + escapeHTML(prefill.refill || '') + '"></label><label class="modal-field"><span>Prescription expiry</span><input name="prescriptionExpiry" type="date" value="' + escapeHTML(prefill.prescriptionExpiry || '') + '"></label><label class="modal-field"><span>Repeats</span><input name="repeats" maxlength="30" placeholder="e.g. 2 repeats" value="' + escapeHTML(prefill.repeats || '') + '"></label><label class="modal-field full"><span>Instructions from the label</span><textarea name="instructions" rows="2" maxlength="500" placeholder="Copy directions exactly">' + escapeHTML(prefill.instructions || '') + '</textarea></label></div><p class="modal-help">Leave remaining supply blank if you do not know it; DoctorAI will keep that amount as unknown. Check every extracted field against the medicine label or prescription before saving. DoctorAI does not prescribe or change treatment.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Save medication <span>→</span></button></div></form>');
    const medicationForm = document.querySelector('[data-modal-form="medication"]');
    if (medicationForm) attachLocalMedicineSuggestions(medicationForm);
    if (medicationForm && editing) {
      els.modalTitle.textContent = 'Edit medication';
      medicationForm.dataset.editMedicationId = editId;
      medicationForm.querySelector('button[type="submit"]')?.replaceChildren(document.createTextNode('Save changes'));
      medicationForm.insertAdjacentHTML('afterbegin', editNote);
      const refillInput = medicationForm.elements.refill;
      if (refillInput && savedRefill && savedRefill !== 'Not set') {
        refillInput.placeholder = 'Current saved date: ' + savedRefill;
        const clearRefillLabel = document.createElement('label');
        clearRefillLabel.className = 'modal-field full medication-clear-refill';
        const clearRefillInput = document.createElement('input');
        clearRefillInput.type = 'checkbox';
        clearRefillInput.name = 'clearRefill';
        const clearRefillText = document.createElement('span');
        clearRefillText.textContent = 'Clear saved refill date';
        clearRefillLabel.append(clearRefillInput, clearRefillText);
        medicationForm.querySelector('.modal-form-grid')?.append(clearRefillLabel);
        refillInput.addEventListener('input', () => { clearRefillInput.checked = false; });
      }
    }
    const medicationGrid = medicationForm?.querySelector('.modal-form-grid');
    if (medicationGrid) {
      if (requiresScanReview) {
        const scanReview = document.createElement('label');
        scanReview.className = 'modal-field full medication-scan-review-confirm';
        const scanReviewCheck = document.createElement('input');
        scanReviewCheck.type = 'checkbox';
        scanReviewCheck.name = 'scanFieldsReviewed';
        const scanReviewText = document.createElement('span');
        scanReviewText.textContent = 'I compared every extracted field — including the medicine name, strength, active ingredients, directions and dates — with the original label or prescription. I corrected anything that did not match.';
        scanReview.append(scanReviewCheck, scanReviewText);
        medicationGrid.append(scanReview);
        for (const fieldName of ['name', 'dose', 'activeIngredients', 'frequency', 'time', 'instructions', 'supply', 'refill', 'startDate', 'endDate', 'prescriptionExpiry', 'repeats']) {
          medicationForm.elements[fieldName]?.addEventListener('input', () => { scanReviewCheck.checked = false; });
        }
      }
      const ingredientField = document.createElement('label');
      ingredientField.className = 'modal-field full';
      const ingredientTitle = document.createElement('span');
      ingredientTitle.textContent = 'Active ingredient(s) from the label (optional)';
      const ingredientInput = document.createElement('textarea');
      ingredientInput.name = 'activeIngredients';
      ingredientInput.rows = 2;
      ingredientInput.maxLength = 600;
      ingredientInput.placeholder = 'Copy active ingredient names from the package; use commas between names';
      ingredientInput.value = ingredientPrefill;
      const ingredientHelp = document.createElement('small');
      ingredientHelp.className = 'modal-help medication-ingredient-help';
      ingredientHelp.id = 'medication-ingredient-help';
      ingredientHelp.textContent = 'Look for “active ingredient(s)” or “each tablet contains”; separate multiple names with commas. If you cannot find or read this section, leave it blank and ask a pharmacist. This checks only that your text matches the package; it is not clinical validation or a safety check.';
      ingredientInput.setAttribute('aria-describedby', ingredientHelp.id);
      ingredientField.append(ingredientTitle, ingredientInput, ingredientHelp);
      medicationGrid.append(ingredientField);
      ingredientInput.addEventListener('input', () => {
        if (medicationForm.elements.scanFieldsReviewed) medicationForm.elements.scanFieldsReviewed.checked = false;
      });

      const ingredientConfirm = document.createElement('label');
      ingredientConfirm.className = 'modal-field full medication-ingredient-confirm';
      const ingredientCheck = document.createElement('input');
      ingredientCheck.type = 'checkbox';
      ingredientCheck.name = 'ingredientsConfirmed';
      ingredientCheck.checked = editing && prefill.activeIngredientsManuallyConfirmed === true;
      const ingredientCheckText = document.createElement('span');
      ingredientCheckText.textContent = 'I copied every active ingredient listed on the original label. This checks my transcription only; it does not validate the medicine, dose, or safety.';
      ingredientConfirm.append(ingredientCheck, ingredientCheckText);
      medicationGrid.append(ingredientConfirm);
      for (const fieldName of ['name', 'dose', 'activeIngredients']) {
        medicationForm.elements[fieldName]?.addEventListener('input', () => { ingredientCheck.checked = false; });
      }

      if (hasLegacyMatch) {
        const legacyNote = document.createElement('p');
        legacyNote.className = 'modal-help medication-legacy-match-note';
        legacyNote.textContent = 'Older NZF or DrugBank match details remain in this private record and are not used by the current check.';
        medicationGrid.after(legacyNote);
      }
    }
  }

  let localMedicineNamesPromise;
  function attachLocalMedicineSuggestions(form) {
    const input = form.elements.name;
    const list = form.querySelector('#manual-medicine-list');
    if (!input || !list) return;
    const notice = document.createElement('small');
    notice.textContent = 'NZ names from Pharmac community and hospital schedules (October 2026). Confirm the medicine and every ingredient against your label. A name suggestion is not a safety check.';
    input.parentElement.append(notice);
    if (!localMedicineNamesPromise) localMedicineNamesPromise = fetch('/data/medication/nz-medicine-names.json?v=20261001', { credentials: 'omit' })
      .then(response => { if (!response.ok) throw new Error('Medicine names unavailable'); return response.json(); })
      .then(data => Array.isArray(data.names) ? data.names.filter(name => typeof name === 'string' && name.length <= 120) : [])
      .catch(() => { localMedicineNamesPromise = null; return []; });
    const update = names => {
      if (!form.isConnected) return;
      const query = input.value.toLocaleLowerCase().trim();
      list.replaceChildren();
      if (query.length < 2) return;
      const matches = names.filter(name => name.toLocaleLowerCase().includes(query));
      matches.sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(query)) - Number(!b.toLocaleLowerCase().startsWith(query)) || a.length - b.length || a.localeCompare(b));
      matches.slice(0, 80).forEach(name => { const option = document.createElement('option'); option.value = name; list.append(option); });
    };
    localMedicineNamesPromise.then(names => { update(names); input.addEventListener('input', () => update(names)); });
  }

  function prepareScanImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The photo could not be opened. Please try taking it again.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('This image format could not be read. Please use a JPG, PNG or WEBP photo.'));
        image.onload = () => {
          if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) {
            reject(new Error('That photo is too large to process safely. Please choose a smaller image.'));
            return;
          }
          const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) { reject(new Error('This browser could not prepare the photo. Please try another image.')); return; }
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          try { resolve(encodeScanCanvas(canvas)); } catch (error) { reject(error); }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const MAX_SCAN_DATA_URL = 3_750_000;
  function encodeScanCanvas(sourceCanvas) {
    let canvas = sourceCanvas;
    for (let sizeAttempt = 0; sizeAttempt < 3; sizeAttempt += 1) {
      for (const quality of [.78, .66, .54, .44]) {
        const image = canvas.toDataURL('image/jpeg', quality);
        if (image.length <= MAX_SCAN_DATA_URL) return image;
      }
      const longest = Math.max(canvas.width, canvas.height);
      if (longest <= 960) break;
      const scale = Math.max(960 / longest, .72);
      const reduced = document.createElement('canvas');
      reduced.width = Math.max(1, Math.round(canvas.width * scale));
      reduced.height = Math.max(1, Math.round(canvas.height * scale));
      const context = reduced.getContext('2d', { alpha: false });
      if (!context) break;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, reduced.width, reduced.height);
      context.drawImage(canvas, 0, 0, reduced.width, reduced.height);
      canvas = reduced;
    }
    throw new Error('That image is still too large to send. Move closer to the label and try again.');
  }

  function medicationScannerStatus(message, state = 'idle') {
    if (els.medicationScannerStatus) els.medicationScannerStatus.textContent = String(message || '');
    if (els.medicationCameraStage) {
      els.medicationCameraStage.dataset.cameraState = state;
      const placeholder = $('.medication-camera-placeholder b', els.medicationCameraStage);
      if (placeholder) placeholder.textContent = state === 'error' ? 'Camera unavailable' : state === 'found' ? 'Label ready' : 'Starting camera…';
    }
    if (els.medicationCaptureButton) els.medicationCaptureButton.disabled = state !== 'scanning' || medicationScanBusy || !medicationScannerStream;
  }

  function stopMedicationScannerCamera() {
    medicationScannerActive = false;
    if (medicationScannerStream) medicationScannerStream.getTracks().forEach(track => track.stop());
    medicationScannerStream = null;
    if (els.medicationCaptureButton) els.medicationCaptureButton.disabled = true;
    if (els.medicationScannerVideo) {
      els.medicationScannerVideo.pause();
      els.medicationScannerVideo.srcObject = null;
    }
  }

  function closeMedicationScanner() {
    stopMedicationScannerCamera();
    if (els.medicationScannerModal?.open) els.medicationScannerModal.close();
  }

  async function medicationScanAccess() {
    if (!accountSessionReady) await loadAccountSession();
    if (!entitlementReady) await loadEntitlement();
    if (!authUser) {
      closeMedicationScanner();
      openGoogleSignIn();
      showToast('Sign in before scanning a private medicine label.');
      return false;
    }
    if (!hasProAccess()) {
      showToast('Medicine scanning is included with DoctorAI Pro.');
      window.location.href = '/subscription#plans';
      return false;
    }
    return true;
  }

  function captureMedicationFrame(video) {
    const width = Number(video?.videoWidth || 0);
    const height = Number(video?.videoHeight || 0);
    if (!width || !height) throw new Error('The camera is not ready yet. Hold the label steady and try again.');
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser could not capture the camera frame. Use a label photo instead.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return encodeScanCanvas(canvas);
  }

  function setMedicationScanBusy(busy) {
    medicationScanBusy = Boolean(busy);
    $$('[data-open-medication-scanner]').forEach(button => {
      button.disabled = medicationScanBusy;
      button.setAttribute('aria-busy', String(medicationScanBusy));
    });
    if (els.medicationCaptureButton) els.medicationCaptureButton.disabled = Boolean(busy) || !medicationScannerActive || !medicationScannerStream;
  }

  async function submitMedicationScan(image) {
    if (medicationScanBusy) return;
    if (!image || image.length > MAX_SCAN_DATA_URL) {
      openMedicationModal({ __scanAttempted: true, __scanError: 'The prepared image was too large to send.' });
      return;
    }
    setMedicationScanBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 50_000);
    try {
      showToast('Reading only the visible medicine label…');
      const response = await fetch('/api/medication/scan', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ image, consent: true }), signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) { accountSessionReady = false; renderAccountSession(null); }
        if (response.status === 403) { entitlementReady = false; subscriptionTier = 'free'; applyBrandTheme(); renderEntitlementStatus(); }
        const error = new Error(String(payload.error || (response.status === 413 ? 'That image was too large to scan.' : 'Medication scanning is temporarily unavailable.')));
        error.status = response.status;
        throw error;
      }
      const medication = payload.medication && typeof payload.medication === 'object' ? payload.medication : {};
      const extracted = ['name', 'dose', 'activeIngredients', 'frequency', 'time', 'instructions', 'supply', 'refill', 'startDate', 'endDate', 'prescriptionExpiry', 'repeats'].some(key => Array.isArray(medication[key]) ? medication[key].length > 0 : String(medication[key] || '').trim().length > 0);
      openMedicationModal({ ...medication, __scanned: extracted, __scanAttempted: true, __missing: payload.review?.missing || [] });
      showToast(extracted ? 'Details copied. Check every field against the label.' : 'The label text was not clear. Enter the details from the label.');
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'The scan took too long. Please check your connection and try again.' : String(error?.message || 'The image could not be read.');
      openMedicationModal({ __scanAttempted: true, __scanError: message });
      showToast('Scan not completed. Manual entry is ready.');
    } finally {
      clearTimeout(timeout);
      setMedicationScanBusy(false);
    }
  }

  async function medicationPhotoCaptured() {
    if (!medicationScannerActive || medicationScanBusy) return;
    if (els.medicationImageConsent?.checked !== true) {
      medicationScannerStatus('Check the consent box before sending this label image. No image has been sent.', 'error');
      els.medicationImageConsent?.focus();
      return;
    }
    medicationScannerActive = false;
    try {
      medicationScannerStatus('Capturing the visible label…', 'found');
      const image = captureMedicationFrame(els.medicationScannerVideo);
      if (els.medicationImageConsent) els.medicationImageConsent.checked = false;
      stopMedicationScannerCamera();
      if (els.medicationScannerModal?.open) els.medicationScannerModal.close();
      await submitMedicationScan(image);
    } catch (error) {
      stopMedicationScannerCamera();
      medicationScannerStatus(error?.message || 'The camera frame could not be captured. Choose a label photo instead.', 'error');
    }
  }

  async function openMedicationScanner() {
    if (medicationScanBusy || !await medicationScanAccess()) return;
    closeMedicationScanner();
    if (!els.medicationScannerModal || !els.medicationScannerVideo) {
      document.getElementById('medication-scan')?.click();
      return;
    }
    els.medicationScannerModal.showModal();
    if (els.medicationImageConsent) els.medicationImageConsent.checked = false;
    medicationScannerStatus('Checking camera access…', 'starting');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      medicationScannerStatus('Live camera access is unavailable here. Choose a label photo instead.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (!els.medicationScannerModal.open) { stream.getTracks().forEach(track => track.stop()); return; }
      medicationScannerStream = stream;
      els.medicationScannerVideo.srcObject = stream;
      await els.medicationScannerVideo.play();
      medicationScannerActive = true;
      medicationScannerStatus('Camera ready. Frame the medicine label, then choose Capture label.', 'scanning');
    } catch (error) {
      stopMedicationScannerCamera();
      const message = error?.name === 'NotAllowedError'
        ? 'Camera permission is off. Allow camera access in your browser settings or choose a label photo.'
        : error?.name === 'NotFoundError'
          ? 'No camera was found on this device. Choose a label photo instead.'
          : 'The camera could not start. Choose a label photo instead.';
      medicationScannerStatus(message, 'error');
    }
  }

  async function scanMedicationPhoto(file) {
    if (!file || medicationScanBusy || !await medicationScanAccess()) return;
    if (els.medicationImageConsent?.checked !== true) {
      showToast('Check the image-sharing consent before sending a label photo. No image has been sent.');
      return;
    }
    if (els.medicationImageConsent) els.medicationImageConsent.checked = false;
    const supportedName = /\.(?:jpe?g|png|webp)$/i.test(String(file.name || ''));
    const supportedType = !file.type || /^image\/(?:jpeg|jpg|png|webp)$/i.test(file.type);
    if (!supportedName && !supportedType) { showToast('Choose a JPG, PNG or WEBP label photo.'); return; }
    if (file.size > 25 * 1024 * 1024) { showToast('That source photo is too large. Choose one under 25 MB.'); return; }
    try {
      showToast('Preparing a smaller private label image…');
      const image = await prepareScanImage(file);
      await submitMedicationScan(image);
    } catch (error) {
      const message = String(error?.message || 'The image could not be prepared.');
      openMedicationModal({ __scanError: message });
      showToast('Photo not read. Manual entry is ready.');
    }
  }

  function openAppointmentModal() {
    setModal('Add an appointment', 'Appointment manager', `<form class="modal-form" data-modal-form="appointment"><div class="modal-form-grid"><label class="modal-field"><span>Appointment reason *</span><input name="title" required placeholder="GP, dentist, review…"></label><label class="modal-field"><span>Provider</span><input name="provider" placeholder="Name or clinic"></label><label class="modal-field"><span>Date *</span><input name="date" type="date" required></label><label class="modal-field"><span>Time *</span><input name="time" type="time" required></label><label class="modal-field full"><span>Location</span><input name="location" placeholder="Clinic or address"></label><label class="modal-field full"><span>Questions or preparation</span><textarea name="note" rows="3" placeholder="What do you want to remember or ask?"></textarea></label></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Save appointment <span>→</span></button></div></form>`);
  }

  function openProviderModal(existing = {}) {
    setModal(existing.id ? 'Edit local doctor' : 'Add local doctor', 'Provider directory', `<form class="modal-form" data-modal-form="provider"><input type="hidden" name="id" value="${escapeHTML(existing.id || '')}"><div class="modal-form-grid"><label class="modal-field"><span>Doctor name *</span><input name="name" required maxlength="120" placeholder="e.g. Dr Alex Morgan" value="${escapeHTML(existing.name || '')}"></label><label class="modal-field"><span>Practice or clinic</span><input name="practice" maxlength="160" placeholder="Local surgery or clinic" value="${escapeHTML(existing.practice || '')}"></label><label class="modal-field"><span>Phone</span><input name="phone" type="tel" maxlength="40" autocomplete="tel" placeholder="Practice phone number" value="${escapeHTML(existing.phone || '')}"></label><label class="modal-field"><span>Email</span><input name="email" type="email" maxlength="160" autocomplete="email" placeholder="Practice email" value="${escapeHTML(existing.email || '')}"></label><label class="modal-field full"><span>Address</span><input name="address" maxlength="240" placeholder="Practice address" value="${escapeHTML(existing.address || '')}"></label><label class="modal-field full"><span>Notes</span><textarea name="notes" rows="2" maxlength="300" placeholder="Opening hours or anything useful to remember">${escapeHTML(existing.notes || '')}</textarea></label></div><p class="modal-help">Provider details are a private directory entry. They are not used to diagnose, prescribe or verify care.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Save doctor <span>→</span></button></div></form>`);
  }

  function openSymptomModal(entry = {}) {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const severity = symptomSeverity(entry.severity);
    const severityOptions = Array.from({ length: 10 }, (_, index) => {
      const value = index + 1;
      const label = value === 1 ? '1 — Very mild' : value === 5 ? '5 — Moderate' : value === 10 ? '10 — Most severe' : String(value);
      return `<option value="${value}" ${value === severity ? 'selected' : ''}>${label}</option>`;
    }).join('');
    const impactOptions = Object.entries(symptomImpactLabels).map(([value, label]) => `<option value="${value}" ${entry.impact === value ? 'selected' : ''}>${label}</option>`).join('');
    const notes = entry.notes || (entry.id && entry.source !== 'symptom-diary' ? entry.description : '') || '';
    const detailsOpen = ['location', 'frequency', 'quality', 'associatedSymptoms', 'impact', 'interventions', 'context', 'notes'].some(key => String(entry[key] || '').trim());
    const symptomPicks = commonSymptomPicks.map(label => `<button type="button" class="symptom-quick-chip" data-symptom-pick="${escapeHTML(label)}">${escapeHTML(label)}</button>`).join('');
    const contextPicks = commonContextPicks.map(label => `<button type="button" class="symptom-quick-chip" data-symptom-context="${escapeHTML(label)}">${escapeHTML(label)}</button>`).join('');
    setModal(entry.id ? 'Edit symptom entry' : 'Add a symptom', 'Private symptom diary', `<form class="modal-form" data-modal-form="symptom"><input type="hidden" name="id" value="${escapeHTML(entry.id || '')}"><div class="modal-form-grid"><label class="modal-field full"><span>What did you notice? *</span><input name="name" required maxlength="100" autocomplete="off" placeholder="Use your own words, e.g. headache" value="${escapeHTML(entry.id ? symptomName(entry) : '')}"></label><div class="symptom-quick-picks full"><span class="symptom-quick-label">Common symptoms <small>Tap one or write your own</small></span><div class="symptom-quick-chip-list" role="group" aria-label="Common symptoms">${symptomPicks}</div></div><label class="modal-field"><span>Intensity (optional)</span><select name="severity"><option value="" ${severity === null ? 'selected' : ''}>Not recorded / not sure</option>${severityOptions}</select></label><label class="modal-field"><span>Date *</span><input name="date" type="date" required max="${localDate}" value="${escapeHTML(entry.date || localDate)}"></label><label class="modal-field"><span>Approximate start time</span><input name="time" type="time" value="${escapeHTML(entry.time || '')}"></label><label class="modal-field"><span>How long? (optional)</span><input name="duration" maxlength="80" placeholder="e.g. 20 minutes or since Monday" value="${escapeHTML(entry.duration || '')}"></label><label class="modal-field full"><span>What was happening around it? <small>Optional · helps spot patterns</small></span><input name="triggers" maxlength="240" placeholder="e.g. after a workout" value="${escapeHTML(entry.triggers || '')}"></label><div class="symptom-quick-picks full"><span class="symptom-quick-label">Common context <small>Tap one to add it</small></span><div class="symptom-quick-chip-list" role="group" aria-label="Common context">${contextPicks}</div></div></div><details class="symptom-more-details" ${detailsOpen ? 'open' : ''}><summary>More detail <span>Optional · helps you describe patterns</span></summary><div class="modal-form-grid"><label class="modal-field"><span>Where did you feel it?</span><input name="location" maxlength="120" placeholder="e.g. left shoulder" value="${escapeHTML(entry.location || '')}"></label><label class="modal-field"><span>Pattern or frequency</span><input name="frequency" maxlength="120" placeholder="e.g. on and off" value="${escapeHTML(entry.frequency || '')}"></label><label class="modal-field"><span>How did it feel?</span><input name="quality" maxlength="120" placeholder="e.g. pressure, burning, tight" value="${escapeHTML(entry.quality || '')}"></label><label class="modal-field"><span>Other symptoms alongside it</span><input name="associatedSymptoms" maxlength="180" placeholder="Use your own words" value="${escapeHTML(entry.associatedSymptoms || '')}"></label><label class="modal-field"><span>Impact on normal activities</span><select name="impact"><option value="">Not recorded</option>${impactOptions}</select></label><label class="modal-field"><span>What did you try?</span><input name="interventions" maxlength="180" placeholder="e.g. rested, drank water" value="${escapeHTML(entry.interventions || '')}"></label><label class="modal-field full"><span>Context note</span><textarea name="context" rows="2" maxlength="240" placeholder="What else were you doing or noticing?">${escapeHTML(entry.context || '')}</textarea></label><label class="modal-field full"><span>Notes</span><textarea name="notes" rows="3" maxlength="500" placeholder="Anything else you want to remember">${escapeHTML(notes)}</textarea></label></div></details><p class="modal-help">Record observations in your own words; this diary cannot identify the cause. For severe, sudden or rapidly worsening symptoms, contact an appropriate healthcare or emergency service.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">${entry.id ? 'Save changes' : 'Add to diary'} <span>→</span></button></div></form>`);
  }

  function setSymptomGuidanceResult(result, tone, title, copy, note) {
    if (!result) return;
    result.hidden = false;
    result.className = `symptom-guidance-result ${tone}`;
    result.replaceChildren();
    const heading = document.createElement('b');
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = copy;
    const footnote = document.createElement('small');
    footnote.textContent = note;
    result.append(heading, paragraph, footnote);
  }

  function openSymptomGuidanceModal() {
    setModal('Check symptom urgency', 'Safety check', `<form class="modal-form symptom-guidance-form" data-modal-form="symptom-guidance"><div class="symptom-guidance-intro"><b>This is not a diagnosis.</b><p>Use this brief check to decide what to do next. If you may be in immediate danger, call your local emergency service now and do not wait for DoctorAI.</p></div><fieldset class="symptom-guidance-fieldset"><legend>Do you think you may be in immediate danger?</legend><div class="symptom-guidance-options"><label class="symptom-guidance-option"><input type="radio" name="guidance-immediate" value="yes" required><span>Yes</span></label><label class="symptom-guidance-option"><input type="radio" name="guidance-immediate" value="no"><span>No</span></label><label class="symptom-guidance-option"><input type="radio" name="guidance-immediate" value="unsure"><span>Not sure</span></label></div></fieldset><fieldset class="symptom-guidance-fieldset" data-guidance-worsening-fieldset hidden><legend>Is it sudden, severe, rapidly worsening, or stopping normal activities?</legend><div class="symptom-guidance-options"><label class="symptom-guidance-option"><input type="radio" name="guidance-worsening" value="yes"><span>Yes</span></label><label class="symptom-guidance-option"><input type="radio" name="guidance-worsening" value="no"><span>No</span></label><label class="symptom-guidance-option"><input type="radio" name="guidance-worsening" value="unsure"><span>Not sure</span></label></div></fieldset><div class="symptom-guidance-result" data-guidance-result role="status" aria-live="polite" hidden></div><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Close</button><button type="submit" class="primary-button">Show next step <span>→</span></button></div></form>`);
    const form = document.querySelector('[data-modal-form="symptom-guidance"]');
    const followup = form?.querySelector('[data-guidance-worsening-fieldset]');
    const syncFollowup = () => {
      const immediate = form?.elements?.['guidance-immediate']?.value || '';
      if (followup) followup.hidden = immediate !== 'no';
      followup?.querySelectorAll('input').forEach(input => { input.required = immediate === 'no'; });
    };
    form?.addEventListener('change', syncFollowup);
    syncFollowup();
  }

  function openMeasurementModal() {
    setModal('Log a measurement', 'Health tracking', `<form class="modal-form" data-modal-form="measurement"><div class="modal-form-grid"><label class="modal-field"><span>Measurement *</span><select name="type"><option value="blood-pressure">Blood pressure</option><option value="sleep">Sleep</option><option value="weight">Weight</option><option value="heart-rate">Heart rate</option><option value="temperature">Temperature</option><option value="mood">Mood / wellbeing</option></select></label><label class="modal-field"><span>Value *</span><input name="value" required placeholder="e.g. 118 / 76"></label><label class="modal-field"><span>Date *</span><input name="date" type="date" required></label><label class="modal-field"><span>Optional note</span><input name="note" placeholder="Anything useful to remember"></label></div><p class="modal-help">Tracking is optional. Trends are for your own context and should not replace clinical review.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Save measurement <span>→</span></button></div></form>`);
  }

  function openHealthModal() {
    setModal('Edit your health profile', 'My Health', `<form class="modal-form" data-modal-form="health"><div class="modal-form-grid"><label class="modal-field"><span>Name</span><input name="name" value="${escapeHTML(state.profile.name)}"></label><label class="modal-field"><span>Blood type</span><input name="bloodType" value="${escapeHTML(state.profile.bloodType)}" placeholder="e.g. O positive"></label><label class="modal-field full"><span>Conditions and history</span><input name="conditions" value="${escapeHTML(state.profile.conditions)}" placeholder="Only what you choose to save"></label><label class="modal-field full"><span>Allergies and adverse reactions</span><input name="allergies" value="${escapeHTML(state.profile.allergies)}" placeholder="Include reaction if useful"></label><label class="modal-field full"><span>Relevant health notes</span><textarea name="notes" rows="3">${escapeHTML(state.profile.notes)}</textarea></label></div><p class="modal-help">You can delete these details by clearing a field, or remove all locally saved hub data from your browser settings.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Save health profile <span>→</span></button></div></form>`);
  }

  function openTimelineModal() {
    setModal('Add a timeline entry', 'Health Timeline', `<form class="modal-form" data-modal-form="timeline"><div class="modal-form-grid"><label class="modal-field"><span>Entry type</span><select name="type"><option value="medication">Medication</option><option value="appointment">Appointment</option><option value="result">Test or result</option></select></label><label class="modal-field"><span>Date *</span><input name="date" type="date" required></label><label class="modal-field full"><span>Title *</span><input name="title" required maxlength="100" placeholder="What happened?"></label><label class="modal-field full"><span>Short note</span><textarea name="description" rows="3" maxlength="500" placeholder="Add useful context without identifying details"></textarea></label></div><p class="modal-help">Use the dedicated Symptom Diary to record intensity and context in your own words.</p><div class="modal-actions"><button type="button" class="secondary-button" data-close-modal>Cancel</button><button type="submit" class="primary-button">Add to timeline <span>→</span></button></div></form>`);
  }

  function openApiPermissions() {
    setModal('AI integrations', 'Privacy by design', `<div class="privacy-copy"><div class="privacy-highlight"><span>⌘</span><p><b>Authorised tools are off by default.</b> Future assistants will need authentication, explicit permission and a limited scope before they can access your health hub.</p></div><h3>What an integration could do</h3><p>Retrieve an upcoming appointment, read a medication schedule, add a timeline entry or prepare a visit summary — only for the specific account and data scope you approve.</p><h3>What it cannot do here</h3><p>No assistant can diagnose, prescribe, change treatment or access your documents without a separate permission check.</p><div class="privacy-actions"><button type="button" class="secondary-button" data-close-modal>Close</button><button type="button" class="primary-button" data-api-ack>Keep integrations off</button></div></div>`);
  }

  function fillChat(prompt) {
    showView('ask');
    if (prompt) {
      els.chatInput.value = prompt;
      updateChatCount();
    }
    window.setTimeout(() => els.chatInput?.focus(), 0);
  }

  function prepareAppointment(appointment) {
    if (!appointment) { showToast('Add an upcoming appointment first.'); return; }
    const prompt = `Help me prepare for my upcoming appointment. Appointment reason: ${appointment.title || 'Not added'}. Provider: ${appointment.provider || 'Not added'}. Date and time: ${formatDate(appointment.date)} at ${formatTime(appointment.time)}. Location: ${appointment.location || 'Not added'}. My saved questions or notes: ${appointment.note || 'None added'}. Use only this information and any health details I have explicitly approved. Create a short preparation checklist and questions to ask. Do not diagnose or recommend changing treatment.`;
    fillChat(prompt);
  }

  function addChatMessage(role, text, loading = false) {
    const node = document.createElement('article');
    node.className = `chat-message ${role}${loading ? ' loading' : ''}`;
    node.dataset.chatRole = role;
    node.setAttribute('aria-busy', String(Boolean(loading)));
    const avatar = role === 'assistant'
      ? '<img class="doctorai-head-icon" src="/doctorai-head-logo-transparent.png?v=10" alt="">'
      : '<span class="user-avatar-label">You</span>';
    const label = role === 'assistant' ? 'DoctorAI' : 'You';
    node.innerHTML = `<span class="chat-message-avatar">${avatar}</span><div class="chat-message-body"><small>${label}</small><p></p></div>`;
    if (loading) node.querySelector('p').innerHTML = '<span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">DoctorAI is thinking</span>';
    else node.querySelector('p').textContent = text;
    els.chatMessages.append(node);
    els.chatPanel?.classList.add('has-messages');
    els.chatWelcome.hidden = true;
    scrollConversation();
    return node;
  }

  function addChatAction(node, action, label) {
    const actions = node.querySelector('.chat-message-actions') || document.createElement('div');
    actions.className = 'chat-message-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.chatAction = action;
    button.textContent = label;
    actions.append(button);
    node.querySelector('.chat-message-body').append(actions);
  }

  function setChatAnswer(node, answer) {
    node.classList.remove('loading', 'streaming', 'chat-error');
    node.removeAttribute('aria-busy');
    const message = String(answer || '').trim();
    node.querySelector('p').textContent = message;
    addChatAction(node, 'copy', 'Copy answer');
  }

  function beginChatAnswer(node) {
    node.classList.remove('loading', 'chat-error');
    node.classList.add('streaming');
    node.setAttribute('aria-busy', 'true');
    node.querySelector('p').textContent = '';
    const sendButton = $('#chat-send');
    if (sendButton) {
      sendButton.setAttribute('aria-label', 'DoctorAI is typing');
      sendButton.innerHTML = 'Typing… <b aria-hidden="true">↑</b>';
    }
    setChatStatus('DoctorAI is writing the answer.', true);
  }

  function appendChatAnswer(node, answer) {
    if (node.classList.contains('loading')) beginChatAnswer(node);
    node.querySelector('p').textContent = answer;
    if (els.conversationScroll) els.conversationScroll.scrollTop = els.conversationScroll.scrollHeight;
  }

  async function readChatStream(response, node, requestId) {
    if (!response.body?.getReader) throw new Error('Live response is unavailable in this browser.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    const processBlock = block => {
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let payload;
      try { payload = JSON.parse(data); } catch { return; }
      if (payload.error) throw new Error(payload.error);
      if (typeof payload.replace === 'string') {
        answer = payload.replace.slice(0, 12000);
        if (requestId === chatRequestId) appendChatAnswer(node, answer);
      }
      if (typeof payload.delta === 'string' && payload.delta) {
        answer = (answer + payload.delta).slice(0, 12000);
        if (requestId === chatRequestId) appendChatAnswer(node, answer);
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        processBlock(block);
      }
      if (done || requestId !== chatRequestId) break;
    }
    if (buffer.trim()) processBlock(buffer.trim());
    if (!answer.trim()) throw new Error('DoctorAI returned an empty answer.');
    return answer;
  }

  async function typeChatAnswer(node, answer, requestId) {
    const text = String(answer || '');
    if (prefersReducedMotion()) {
      appendChatAnswer(node, text);
      return text;
    }
    const step = Math.max(2, Math.ceil(text.length / 180));
    beginChatAnswer(node);
    for (let index = step; index < text.length; index += step) {
      if (requestId !== chatRequestId) return text;
      appendChatAnswer(node, text.slice(0, index));
      await new Promise(resolve => window.setTimeout(resolve, 12));
    }
    appendChatAnswer(node, text);
    return text;
  }

  function setChatError(node, message, retryText, action = 'retry') {
    node.classList.remove('loading');
    node.classList.add('chat-error');
    node.removeAttribute('aria-busy');
    node.dataset.retryText = String(retryText || '').slice(0, 2000);
    node.dataset.chatErrorAction = action;
    node.querySelector('p').textContent = message;
    addChatAction(node, action, action === 'signin' ? 'Sign in again' : 'Try again');
  }

  function clearChat({ confirm = true, notify = true } = {}) {
    if (confirm && chatHistory.length && !window.confirm('Start a new conversation? The messages will be cleared from this browser session.')) return false;
    chatRequestId += 1;
    if (chatController) chatController.abort();
    chatController = null;
    chatBusy = false;
    chatHistory = [];
    els.chatMessages.innerHTML = '';
    els.chatPanel?.classList.remove('has-messages');
    els.chatWelcome.hidden = false;
    if (els.chatInput) {
      els.chatInput.disabled = false;
      els.chatInput.value = '';
      updateChatCount();
    }
    const sendButton = $('#chat-send');
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.removeAttribute('aria-busy');
      sendButton.setAttribute('aria-label', 'Send message');
      sendButton.innerHTML = 'Send <b aria-hidden="true">↑</b>';
    }
    setChatStatus('New conversation ready.', false);
    if (notify) showToast('Conversation cleared from this browser session.');
    return true;
  }

  function updateChatCount() {
    if (els.chatCount) els.chatCount.textContent = `${els.chatInput.value.length} / 2000`;
    els.chatInput.style.height = 'auto';
    els.chatInput.style.height = `${Math.min(150, Math.max(57, els.chatInput.scrollHeight))}px`;
  }

  function chatErrorMessage(error) {
    if (error?.name === 'AbortError') return 'DoctorAI took too long to respond. Check your connection and try again.';
    if (error?.status === 401) return 'Your private session has ended. Sign in again to continue.';
    return error?.message || 'DoctorAI could not answer right now. Your message was not saved to this conversation.';
  }

  async function sendChat(message, { retry = false } = {}) {
    const text = String(message ?? els.chatInput.value).trim();
    if (!text || chatBusy) return;
    if (!authUser) {
      showToast('Sign in with Google to keep your DoctorAI conversation private.');
      openGoogleSignIn();
      return;
    }
    const requestId = ++chatRequestId;
    chatBusy = true;
    const sendButton = $('#chat-send');
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.setAttribute('aria-busy', 'true');
      sendButton.setAttribute('aria-label', 'Sending message');
      sendButton.innerHTML = 'Sending… <b aria-hidden="true">↑</b>';
    }
    if (els.chatInput) {
      els.chatInput.disabled = true;
      els.chatInput.value = '';
    }
    updateChatCount();
    if (!retry) {
      chatHistory.push({ role: 'user', content: text });
      chatHistory = chatHistory.slice(-CHAT_MAX_MESSAGES);
      addChatMessage('user', text);
    }
    const loadingNode = addChatMessage('assistant', '', true);
    setChatStatus('DoctorAI is thinking through your question.', true);
    const controller = new AbortController();
    chatController = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
      const memory = approvedChatMemory();
      const requestBody = { messages: chatHistory.slice(-CHAT_MAX_MESSAGES), path: 'health-hub', responseLength: chatResponseLength, stream: true };
      if (memory.length) requestBody.memory = memory;
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody), signal: controller.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.error || 'DoctorAI is unavailable right now.');
        error.status = response.status;
        throw error;
      }
      let answer = '';
      if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
        answer = await readChatStream(response, loadingNode, requestId);
      } else {
        const data = await response.json().catch(() => ({}));
        answer = data.answer || data.reply || data.message || data.content || 'I received your question. Please discuss any important decisions with a qualified healthcare professional.';
        await typeChatAnswer(loadingNode, answer, requestId);
      }
      if (requestId !== chatRequestId) return;
      setChatAnswer(loadingNode, answer);
      chatHistory.push({ role: 'assistant', content: String(answer).slice(0, 6000) });
      chatHistory = chatHistory.slice(-CHAT_MAX_MESSAGES);
      setChatStatus('DoctorAI replied.', false);
    } catch (error) {
      if (requestId !== chatRequestId) return;
      setChatError(loadingNode, chatErrorMessage(error), error?.status === 401 ? '' : text, error?.status === 401 ? 'signin' : 'retry');
      setChatStatus('DoctorAI could not answer. You can try again.', false);
    } finally {
      window.clearTimeout(timeout);
      if (requestId !== chatRequestId) return;
      chatBusy = false;
      if (chatController === controller) chatController = null;
      if (els.chatInput) els.chatInput.disabled = false;
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.removeAttribute('aria-busy');
        sendButton.setAttribute('aria-label', 'Send message');
        sendButton.innerHTML = 'Send <b aria-hidden="true">↑</b>';
      }
      scrollConversation();
    }
  }

  async function copyChatAnswer(button) {
    const text = button.closest('.chat-message')?.querySelector('p')?.textContent?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Answer copied to your clipboard.');
      return;
    } catch {}
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed'; fallback.style.opacity = '0';
    document.body.append(fallback); fallback.select();
    try { document.execCommand('copy'); showToast('Answer copied to your clipboard.'); }
    catch { showToast('Copy is unavailable on this device.'); }
    fallback.remove();
  }

  const documentDetails = file => {
    const name = String(file?.name || 'Health document');
    const lower = name.toLowerCase();
    if (/prescription|script|rx/.test(lower)) return { category: 'prescription', type: 'Prescription' };
    if (/lab|blood|test|result/.test(lower)) return { category: 'result', type: 'Test or lab result' };
    if (/referral/.test(lower)) return { category: 'referral', type: 'Referral' };
    if (/discharge/.test(lower)) return { category: 'discharge', type: 'Discharge letter' };
    if (/specialist/.test(lower)) return { category: 'specialist', type: 'Specialist letter' };
    if (/certificate/.test(lower)) return { category: 'certificate', type: 'Medical certificate' };
    if (/imaging|xray|x-ray|scan|ultrasound|mri|ct/.test(lower)) return { category: 'imaging', type: 'Imaging report' };
    return { category: 'other', type: 'Medical document' };
  };
  const fileAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The file could not be read on this device.'));
    reader.readAsDataURL(file);
  });
  const formatFileSize = bytes => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  async function addDocument(file) {
    if (!file) return;
    if (!hasProAccess()) {
      showToast('File and photo uploads are only available with DoctorAI Pro.');
      window.location.href = '/subscription#plans';
      return;
    }
    if (!authUser) { openGoogleSignIn(); showToast('Sign in before uploading a private health document.'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('Choose a document smaller than 2 MB.'); return; }
    const details = documentDetails(file);
    showToast('Encrypting and storing your private document…');
    try {
      const data = await fileAsDataUrl(file);
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, category: details.category, type: details.type, data })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Secure document storage is unavailable right now.');
      const saved = payload.document || {};
      state.documents.unshift({
        id: saved.id,
        category: saved.category || details.category,
        type: saved.type || details.type,
        title: saved.name || file.name,
        description: 'Securely stored · review or download only when you choose',
        date: 'Added today',
        size: `${(file.name.split('.').pop() || 'FILE').toUpperCase()} · ${formatFileSize(saved.size || file.size)}`,
        createdAt: saved.createdAt || Date.now()
      });
      state.timeline.unshift({ id: `timeline-${Date.now()}`, source: 'document', type: 'result', date: new Date().toISOString().slice(0, 10), title: 'Health document uploaded', description: saved.name || file.name, icon: '▤' });
      saveState();
      renderResults(); renderDocuments(); renderTimeline(); renderActivity();
      showToast('Document encrypted and added to your private library.');
    } catch (error) {
      showToast(error?.message || 'Secure document storage is unavailable right now.');
    }
  }

  async function deleteDocument(id) {
    const document = state.documents.find(item => item.id === id);
    if (!document || !window.confirm(`Delete “${document.title}” from your private library? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The document could not be deleted.');
      state.documents = state.documents.filter(item => item.id !== id);
      state.timeline = state.timeline.filter(item => !(item.source === 'document' && item.description === document.title));
      saveState(); renderResults(); renderDocuments(); renderTimeline(); renderActivity();
      showToast('Document deleted from private storage.');
    } catch (error) { showToast(error?.message || 'The document could not be deleted.'); }
  }

  function exportHealthData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      notice: 'This export contains the health information you saved in DoctorAI. It does not include document files; download those individually from Documents.',
      data: serialiseHealthState()
    };
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `doctorai-health-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Your private hub data export has downloaded.');
  }

  async function deleteHealthData() {
    if (cloudSyncBusy) { showToast('A private save is finishing. Please try deletion again in a moment.'); return; }
    if (deleteHealthData.busy) return;
    if (!window.confirm('Delete all health hub data, including saved medications, symptom diary entries, appointments, measurements, timeline entries and documents? This cannot be undone.')) return;
    deleteHealthData.busy = true;
    window.clearTimeout(cloudSyncTimer);
    const syncWasEnabled = cloudSyncEnabled;
    cloudSyncEnabled = false;
    cloudSyncDirty = false;
    cloudSyncRevision += 1;
    let cloudDeletionFailed = false;
    showToast('Deleting health data… Please keep this page open.');
    if (authUser) {
      // Fetch the account inventory, including files uploaded on other devices.
      // Retain the local record on failure so the user can retry or export it.
      let documents = [];
      try {
        const response = await fetch('/api/documents', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.documents)) throw new Error('Document inventory unavailable');
        documents = payload.documents;
      } catch { cloudDeletionFailed = true; }
      for (const document of documents) {
        try {
          const response = await fetch(`/api/documents?id=${encodeURIComponent(document.id)}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 404) cloudDeletionFailed = true;
        } catch { cloudDeletionFailed = true; }
      }
      try {
        if (cloudDeletionFailed) throw new Error('Document deletion incomplete');
        const response = await fetch('/api/health/state', { method: 'DELETE' });
        if (!response.ok) cloudDeletionFailed = true;
      } catch { cloudDeletionFailed = true; }
    }
    deleteHealthData.busy = false;
    if (cloudDeletionFailed) {
      setSyncStatus('Deletion incomplete — retry in Privacy controls');
      showToast('Deletion could not finish. Some cloud files may already be removed. Your local record is kept; retry from Privacy controls when connected. Sync is paused until you reload.');
      return;
    }
    state.medications = []; state.appointments = []; state.providers = []; state.timeline = []; state.documents = []; state.measurements = []; state.tasks = []; state.profile = clone(emptyProfile); state.memoryEnabled = false; state.memoryDetails = [];
    write('medications', []); write('appointments', []); write('providers', []); write('timeline', []); write('documents', []); write('measurements', []); write('tasks', []); write('profile', state.profile); write('memory-enabled', false); write('memory-details', []); write('updated-at', Date.now());
    clearChat({ confirm: false, notify: false });
    cloudSyncEnabled = syncWasEnabled;
    renderAll(); closePrivacy();
    setSyncStatus('Health data deleted');
    showToast(authUser ? 'Your device and account health data have been deleted.' : 'Health data was deleted from this session/device. Sign in to delete any account copy.');
  }

  function handleModalSubmit(event) {
    if (event.target.matches('[data-care-summary-form]')) { event.preventDefault(); reviewCareSummary(event.target); return; }
    const form = event.target.closest('[data-modal-form]');
    if (!form) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.modalForm === 'today-checkin') { createTodayPlan(form, values); return; }
    const today = new Date().toISOString().slice(0, 10);
    let destinationView = '';
    let postSaveToast = '';
    let focusMedicationSafetyPanel = false;
    if (form.dataset.modalForm === 'symptom-guidance') {
      const result = form.querySelector('[data-guidance-result]');
      const immediate = String(values['guidance-immediate'] || '');
      if (!['yes', 'no', 'unsure'].includes(immediate)) {
        showToast('Choose an answer before continuing.');
        form.querySelector('input[name="guidance-immediate"]')?.focus();
        return;
      }
      if (immediate !== 'no') {
        setSymptomGuidanceResult(result, 'emergency', 'Seek emergency help now', 'Call your local emergency service now and do not wait for an AI response.', 'DoctorAI cannot assess or monitor emergencies.');
        return;
      }
      const worsening = String(values['guidance-worsening'] || '');
      if (!['yes', 'no', 'unsure'].includes(worsening)) {
        showToast('Choose an answer about how the symptom is changing.');
        form.querySelector('[data-guidance-worsening-fieldset] input')?.focus();
        return;
      }
      if (worsening !== 'no') {
        setSymptomGuidanceResult(result, 'urgent', 'Seek prompt professional advice', 'Contact an urgent-care service or your clinician today. If you may be in immediate danger, call your local emergency service.', 'This check cannot rule out a serious problem.');
        return;
      }
      setSymptomGuidanceResult(result, 'monitor', 'Keep tracking and arrange care if needed', 'Record changes in your diary and contact a qualified healthcare professional if the symptom persists, worsens or concerns you.', 'No serious problem has been ruled out.');
      return;
    }
    if (form.dataset.modalForm === 'medication') {
      const editingId = String(form.dataset.editMedicationId || '');
      const existingIndex = editingId ? state.medications.findIndex(item => String(item.id) === editingId) : -1;
      if (editingId && existingIndex < 0) { showToast('This saved medication is no longer in your list. Close this form and reopen the medication you want to edit.'); return; }
      const existingMedication = existingIndex >= 0 ? state.medications[existingIndex] : null;
      const name = String(values.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const dose = String(values.dose || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!name || !dose) { showToast('Add the medication name and strength exactly as shown on the label.'); (form.elements.name?.value ? form.elements.dose : form.elements.name)?.focus(); return; }
      const scanReviewRequired = form.dataset.scanReviewRequired === 'true';
      const scanFieldsReviewed = values.scanFieldsReviewed === 'on';
      if (scanReviewRequired && !scanFieldsReviewed) { showToast('Compare the extracted name, strength, ingredients and directions with the original label before saving.'); form.elements.scanFieldsReviewed?.focus(); return; }
      const activeIngredients = [...new Set(String(values.activeIngredients || '').split(/[;,\n]/).map(item => item.replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean))];
      if (activeIngredients.length > 8) { showToast('Add no more than eight active ingredient names, separated by commas or semicolons.'); form.elements.activeIngredients?.focus(); return; }
      const ingredientsManuallyConfirmed = values.ingredientsConfirmed === 'on';
      if (activeIngredients.length && !ingredientsManuallyConfirmed) { showToast('Check that every active ingredient on the original label appears above before saving.'); form.elements.ingredientsConfirmed?.focus(); return; }
      const frequency = ['Once daily', 'Twice daily', 'As needed', 'Weekly'].includes(values.frequency) ? values.frequency : '';
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(values.time || '')) ? String(values.time) : '';
      const supplyInput = String(values.supply ?? '').trim();
      const supplyAmount = supplyInput === '' ? null : Number(supplyInput);
      const supply = supplyAmount !== null && Number.isFinite(supplyAmount) && supplyAmount >= 0 ? Math.min(999999, supplyAmount) : null;
      const refill = values.refill ? formatDate(values.refill) : editingId && values.clearRefill !== 'on' ? String(existingMedication?.refill || 'Not set') : 'Not set';
      const existingScanDetailsUnchanged = existingMedication
        && existingMedication.name === name && existingMedication.dose === dose
        && JSON.stringify(existingMedication.activeIngredients || []) === JSON.stringify(activeIngredients)
        && existingMedication.instructions === String(values.instructions || 'Follow the prescription label').replace(/\s+/g, ' ').trim().slice(0, 500);
      const medicationRecord = { ...(existingMedication || {}), id: existingMedication?.id || ('med-' + Date.now()), name, dose, activeIngredients, activeIngredientsConfirmed: activeIngredients.length > 0 && ingredientsManuallyConfirmed, activeIngredientsManuallyConfirmed: activeIngredients.length > 0 && ingredientsManuallyConfirmed, scanFieldsReviewed: scanReviewRequired ? scanFieldsReviewed : Boolean(existingMedication?.scanFieldsReviewed === true && existingScanDetailsUnchanged), frequency, instructions: String(values.instructions || 'Follow the prescription label').replace(/\s+/g, ' ').trim().slice(0, 500), time, status: existingMedication?.status ?? 'due', supply, refill, startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(values.startDate || '')) ? values.startDate : '', endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(values.endDate || '')) ? values.endDate : '', prescriptionExpiry: /^\d{4}-\d{2}-\d{2}$/.test(String(values.prescriptionExpiry || '')) ? values.prescriptionExpiry : '', repeats: String(values.repeats || '').replace(/\s+/g, ' ').trim().slice(0, 30) };
      if (existingIndex >= 0) state.medications[existingIndex] = medicationRecord;
      else state.medications.push(medicationRecord);
      clearMedicationSafetyResults();
      state.timeline.unshift({ id: `timeline-${Date.now()}`, type: 'medication', date: values.startDate || existingMedication?.startDate || today, title: `${name} ${editingId ? 'updated' : 'added'}`, description: `${dose} · ${frequency || 'schedule needs review'}`, icon: '▣' });
      if (editingId) {
        destinationView = 'medications';
        postSaveToast = 'Medication updated. Review the details you saved; any local check has limited coverage.';
        focusMedicationSafetyPanel = true;
      } else if (form.dataset.scanAttempted === 'true') {
        destinationView = 'medications';
        postSaveToast = scanReviewRequired && scanFieldsReviewed ? 'Scanned medication saved after you checked it against the original label. Any local check has limited coverage.' : 'Medication saved. Check its details against the original label. Any local check has limited coverage.';
        focusMedicationSafetyPanel = true;
      } else {
        showToast('Medication reminder saved.');
      }
    } else if (form.dataset.modalForm === 'provider') {
      const clean = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
      const name = clean(values.name, 120);
      if (!name) { showToast('Add the doctor’s name.'); form.elements.name?.focus(); return; }
      const id = clean(values.id, 80) || `provider-${Date.now()}`;
      const provider = { id, name, practice: clean(values.practice, 160), phone: clean(values.phone, 40), email: clean(values.email, 160), address: clean(values.address, 240), notes: clean(values.notes, 300) };
      const existingIndex = state.providers.findIndex(item => item.id === id);
      if (existingIndex >= 0) state.providers[existingIndex] = provider; else state.providers.unshift(provider);
      saveState(); renderProfile(); showToast(existingIndex >= 0 ? 'Doctor details updated.' : 'Local doctor saved.');
    } else if (form.dataset.modalForm === 'appointment') {
      state.appointments.push({ id: `appt-${Date.now()}`, title: values.title, provider: values.provider || 'Provider to confirm', date: values.date, time: values.time, location: values.location || 'Location to confirm', note: values.note || '', status: 'upcoming' });
      state.timeline.unshift({ id: `timeline-${Date.now()}`, type: 'appointment', date: values.date, title: `${values.title} added`, description: `${values.provider || 'Provider to confirm'} · ${formatDate(values.date)}`, icon: '◷' });
      showToast('Appointment saved to your timeline.');
    } else if (form.dataset.modalForm === 'symptom') {
      const name = String(values.name || '').trim();
      if (!name) { showToast('Please describe the symptom in your own words.'); form.elements.name?.focus(); return; }
      const severity = symptomSeverity(values.severity);
      const beforePatternCounts = new Map(getSymptomPatternInsights(state.timeline).map(insight => [insight.key, insight.count]));
      const id = String(values.id || '').trim() || `symptom-${Date.now()}`;
      const existingIndex = state.timeline.findIndex(item => item.id === id && item.type === 'symptom');
      const existing = existingIndex >= 0 ? state.timeline[existingIndex] : null;
      const now = new Date();
      const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(values.date || '')) ? String(values.date) : '';
      if (!date || date > localToday) { showToast('Choose today or an earlier date.'); form.elements.date?.focus(); return; }
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(values.time || '')) ? String(values.time) : '';
      const compact = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
      const entry = { id, source: 'symptom-diary', type: 'symptom', name: name.slice(0, 100), title: `Symptom recorded: ${name.slice(0, 100)}`, severity, date, time, duration: compact(values.duration, 80), location: compact(values.location, 120), frequency: compact(values.frequency, 120), quality: compact(values.quality, 120), associatedSymptoms: compact(values.associatedSymptoms, 180), impact: Object.prototype.hasOwnProperty.call(symptomImpactLabels, values.impact) ? values.impact : '', interventions: compact(values.interventions, 180), triggers: compact(values.triggers, 240), context: compact(values.context, 240), notes: compact(values.notes, 500), createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), icon: '≈' };
      entry.description = symptomLogDescription(entry);
      if (existingIndex >= 0) state.timeline[existingIndex] = entry;
      else state.timeline.unshift(entry);
      clearMedicationSafetyResults();
      destinationView = 'symptoms';
      const newPattern = getSymptomPatternInsights(state.timeline).find(insight => insight.count > (beforePatternCounts.get(insight.key) || 0));
      postSaveToast = newPattern
        ? `Pattern hint: ${newPattern.family.label} is noted near ${newPattern.context.label} in ${newPattern.count} entries. This is a correlation to review, not a cause.`
        : (existing ? 'Symptom entry updated.' : 'Symptom added to your private diary.');
    } else if (form.dataset.modalForm === 'measurement') {
      state.measurements.unshift({ type: values.type, value: values.value, date: values.date, note: values.note || '' });
      state.timeline.unshift({ id: `timeline-${Date.now()}`, type: 'result', date: values.date, title: `${values.type.replace('-', ' ')} logged`, description: values.value, icon: '⌁' });
      renderMeasurement(values.type);
      showToast('Measurement added to your trends.');
    } else if (form.dataset.modalForm === 'health') {
      const oldProfile = state.profile;
      const nextAllergies = values.allergies || '';
      const nextConditions = values.conditions || '';
      state.profile = { ...oldProfile, name: values.name || '', bloodType: values.bloodType || '', conditions: nextConditions, allergies: nextAllergies, notes: values.notes || '' };
      state.memoryDetails = [state.profile.conditions, state.profile.allergies, state.profile.bloodType].filter(Boolean);
      clearMedicationSafetyResults();
      showToast('Health profile updated.');
    } else if (form.dataset.modalForm === 'timeline') {
      if (!['medication', 'appointment', 'result'].includes(values.type)) { showToast('Choose a valid timeline entry type.'); form.elements.type?.focus(); return; }
      state.timeline.unshift({ id: `timeline-${Date.now()}`, type: values.type, date: values.date, title: String(values.title || '').trim().slice(0, 100), description: String(values.description || 'Added by you').trim().slice(0, 500), icon: values.type === 'appointment' ? '◷' : values.type === 'medication' ? '▣' : '⌁' });
      showToast('Timeline entry added.');
    }
    saveState();
    renderAll();
    closeModal();
    if (destinationView) showView(destinationView, true, false);
    if (focusMedicationSafetyPanel) document.querySelector('.clash-panel')?.scrollIntoView({ block: 'nearest' });
    if (postSaveToast) showToast(postSaveToast);
  }

  function renderLocalMedicationDatabaseResult(container, result) {
    container.replaceChildren();
    const summary = document.createElement('p');
    const foundIssues = window.DoctorAIMedicationCheck.issues(result).length > 0;
    summary.className = 'medication-db-summary ' + (foundIssues ? 'is-warning' : 'is-incomplete');
    if (foundIssues) summary.textContent = 'Warning found in the limited check. Review the alert below with a pharmacist or prescriber.';
    else if (result.status === 'unknown' || result.coverage?.completeForRequest === false) summary.textContent = 'This is a limited check. Unmatched medicines and risks outside the curated rules could not be assessed. Matching every medicine does not confirm safety.';
    else summary.textContent = 'No alert was found in DoctorAI’s limited database. This does not mean these medicines are safe together.';
    container.append(summary);
    const alerts = [...(Array.isArray(result.alerts) ? result.alerts : [])];
    const rank = alert => ['high', 'critical'].includes(alert.severity) ? 0 : alert.severity === 'moderate' ? 1 : 2;
    alerts.sort((left, right) => rank(left) - rank(right)).forEach(alert => {
      const article = document.createElement('article');
      const warning = ['high', 'critical'].includes(alert.severity);
      const caution = alert.severity === 'moderate';
      article.className = 'safety-result-alert ' + (warning ? 'is-warning' : caution ? 'is-caution' : 'is-unknown');
      article.setAttribute('data-severity', String(alert.severity || 'unknown'));
      if (warning || caution) article.setAttribute('role', 'alert');
      const heading = document.createElement('h3');
      heading.textContent = alert.type === 'interaction' ? 'Interaction warning' : String(alert.title || 'Medicine check notice');
      const icon = document.createElement('span');
      icon.className = 'medication-warning-icon';
      icon.textContent = warning || caution ? '!' : 'i';
      icon.setAttribute('aria-hidden', 'true');
      heading.prepend(icon);
      const copy = document.createElement('p');
      copy.textContent = String(alert.message || 'Review this result with a pharmacist or prescriber.');
      article.append(heading, copy);
      if (alert.source?.publisher) {
        const source = document.createElement('small');
        source.textContent = 'Source: ' + String(alert.source.publisher) + (alert.source.title ? ' · ' + String(alert.source.title) : '') + (alert.recordVersion ? ' · rule record v' + String(alert.recordVersion) : '');
        article.append(source);
      }
      if (alert.evidenceSummary) {
        const evidence = document.createElement('small');
        evidence.className = 'medication-rule-evidence';
        evidence.textContent = 'Evidence summary: ' + String(alert.evidenceSummary);
        article.append(evidence);
      }
      if (alert.source?.currentnessNote) {
        const currentness = document.createElement('small');
        currentness.className = 'medication-rule-currentness';
        currentness.textContent = 'Source limitation: ' + String(alert.source.currentnessNote);
        article.append(currentness);
      }
      if (typeof alert.source?.url === 'string') {
        try {
          const sourceUrl = new URL(alert.source.url);
          const approvedHost = sourceUrl.protocol === 'https:' && (sourceUrl.hostname === 'medsafe.govt.nz' || sourceUrl.hostname.endsWith('.medsafe.govt.nz') || sourceUrl.hostname === 'accessdata.fda.gov' || sourceUrl.hostname.endsWith('.fda.gov'));
          if (approvedHost) {
            const link = document.createElement('a');
            link.href = sourceUrl.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Open source record';
            article.append(link);
          }
        } catch { /* Ignore an invalid source URL in local rule metadata. */ }
      }
      container.append(article);
    });

    const coverage = document.createElement('small');
    coverage.textContent = 'DoctorAI local database ' + (result.datasetVersion || 'version unavailable') + ' · ruleset ' + (result.ruleset?.version || 'version unavailable') + ' · ingredient match for ' + (result.coverage?.resolved ?? 0) + ' of ' + (result.coverage?.requested ?? result.resolved?.length ?? 0) + ' medicines · ' + (result.coverage?.unmatched ?? 0) + ' unmatched · ' + (result.coverage?.ambiguous ?? 0) + ' ambiguous/incomplete · ' + (result.coverage?.mismatched ?? 0) + ' name/label mismatches · ' + (result.coverage?.confirmedLabels ?? 0) + ' ingredient lists checked by you against the package (not clinically validated) · ' + (result.coverage?.strengthUnverified ?? 0) + ' strengths/doses unverified';
    container.append(coverage);
    if (result.catalogue) {
      const catalogue = document.createElement('p');
      catalogue.textContent = (result.catalogue.productFormulations || 0) + ' NZ product/formulation records · ' + (result.catalogue.brandNames || 0) + ' brand names · ' + (result.coverage?.interactionRuleCount || 0) + ' curated interaction rules. ' + String(result.catalogue.attribution || '') + ' ' + String(result.catalogue.disclaimer || '');
      const source = document.createElement('a');
      source.href = 'https://schedule.pharmac.govt.nz/pub/';
      source.textContent = 'Pharmac source files (CC BY 4.0)';
      catalogue.append(document.createTextNode(' '), source);
      container.append(catalogue);
    }
    (Array.isArray(result.resolved) ? result.resolved : []).forEach(item => {
      const line = document.createElement('p');
      const names = (Array.isArray(item.ingredients) ? item.ingredients : []).map(ingredient => ingredient.name).filter(Boolean);
      let matchText = 'not matched; clashes are unknown' + (item.reason ? ' (' + item.reason + ')' : '');
      if (item.status === 'resolved' && names.length) {
        matchText = item.basis === 'confirmed_label_only'
          ? 'ingredient text you checked against the package: ' + names.join(', ') + '; medicine name remains unverified; text matching only'
          : item.labelIngredientsConfirmed === true
            ? 'name mapping agrees with the ingredient text you checked against the package: ' + names.join(', ') + ' (text matching only)'
            : 'name terminology match: ' + names.join(', ') + '; active ingredients were not checked by you against the package';
      }
      if (item.strength?.status === 'unverified') matchText += '; strength/dose unverified — no dose check was performed';
      else if (item.strength?.status === 'listed_match') matchText += '; the numeric strength appears in the catalogue, but this is not a dose or treatment check';
      line.textContent = String(item.name || 'Saved medicine') + ': ' + matchText;
      container.append(line);
    });
    const disclaimer = document.createElement('p');
    disclaimer.className = 'medication-db-incomplete-note';
    disclaimer.textContent = foundIssues || result.coverage?.unknown > 0
      ? 'Coverage remains limited: other interactions and strength, dose, route, timing or treatment suitability are not assessed. Review your complete medicine list with a pharmacist or prescriber.'
      : 'No interaction alert found in the covered rules. This does not mean these medicines are safe together. Coverage remains limited; medicine decisions require a pharmacist or prescriber.';
    container.append(disclaimer);
  }

  function medicationCheckPayload() {
    return {
      medications: state.medications.map(item => {
        const confirmed = item?.activeIngredientsManuallyConfirmed === true && Array.isArray(item.activeIngredients) && item.activeIngredients.length > 0;
        return { name: String(item?.name || '').trim(), dose: String(item?.dose || '').trim(), ...(confirmed ? { activeIngredients: item.activeIngredients.map(name => String(name).trim()).filter(Boolean), activeIngredientsConfirmed: true } : {}) };
      }),
      allergies: splitDetails(state.profile?.allergies || ''), conditions: splitDetails(state.profile?.conditions || '')
    };
  }

  function refreshMedicationCheckContext() {
    medicationContextPromise = medicationCheckController.update({
      loginId: medicationLoginId,
      owner: authUser ? String(authUser.sub || '') + ':' + String(authUser.email || '').toLowerCase() : '',
      profileIdentity: String(state.profile?.id || '') + ':' + String(state.profile?.name || ''),
      payload: medicationCheckPayload(), allowed: Boolean(authUser && medicationLoginId && accountSessionReady && entitlementReady && hasProAccess() && medicationAccountDataReady && Number.isFinite(entitlementExpiresAt) && entitlementExpiresAt * 1000 > Date.now()),
      rulesVersion: medicationRulesVersion, storageAllowed: localStorageAllowed
    });
    return medicationContextPromise;
  }

  function renderMedicationCheckState() {
    const view = medicationCheckController.snapshot();
    const panel = document.querySelector('.clash-panel');
    if (!panel) return;
    const output = panel.querySelector('[data-local-medication-db-result]');
    const consent = panel.querySelector('[data-local-medication-db-consent]');
    const button = panel.querySelector('[data-run-local-medication-safety-check]');
    const checked = panel.querySelector('[data-medication-check-time]');
    const summary = panel.querySelector('.clash-status');
    if (summary) summary.textContent = view.status === 'complete' ? (window.DoctorAIMedicationCheck.issues(view.result).length ? 'Interaction or medicine warning found — review the result below.' : view.result.coverage?.unknown ? 'Check incomplete — some medicines could not be assessed.' : 'No interaction alert found within covered rules; this does not confirm safety.') : view.status === 'pending' ? (view.result ? 'Updating after login — previous warning shown; no fresh result yet.' : 'Checking the current medicine list…') : view.status === 'unavailable' ? 'Check unavailable — no current assessment.' : 'Interaction check not run.';
    if (consent) consent.checked = view.consent;
    if (button) { button.disabled = view.status === 'pending'; button.textContent = view.status === 'pending' ? 'Checking…' : 'Check saved medicines'; }
    if (checked) checked.textContent = view.checkedAt ? (view.status === 'pending' ? 'Previous check · updating: ' : 'Last checked: ') + new Date(view.checkedAt).toLocaleString() + ' · limited rules ' + medicationRulesVersion : 'Last checked: no current check';
    if (!output) return;
    output.setAttribute('aria-busy', String(view.status === 'pending'));
    if ((view.status === 'complete' || view.status === 'pending') && view.result) {
      renderLocalMedicationDatabaseResult(output, view.result);
      if (view.status === 'pending') {
        const updating = document.createElement('p'); updating.className = 'medication-db-summary is-incomplete';
        updating.textContent = 'Updating after login. This is the previous warning, not a fresh result. Wait for the new check and time.'; output.prepend(updating);
      }
      return;
    }
    output.replaceChildren();
    const notice = document.createElement('p'); notice.className = 'medication-db-summary is-incomplete';
    notice.textContent = view.status === 'pending' ? 'Checking the current saved list… No current result is available yet.'
      : view.status === 'unavailable' ? 'Check unavailable. ' + (view.error || 'No current result is available.')
      : view.error || 'Not checked. Consent and choose Check saved medicines. No interaction assessment is available.';
    output.append(notice);
  }

  async function runLocalMedicationSafetyCheck(button) {
    if (button.disabled) return;
    const panel = button.closest('.clash-panel');
    const output = panel?.querySelector('[data-local-medication-db-result]');
    const consent = panel?.querySelector('[data-local-medication-db-consent]');
    if (!output) return;
    if (!authUser) { output.textContent = 'Sign in to run this limited check.'; openGoogleSignIn(); return; }
    if (!hasProAccess()) { output.textContent = 'Medication database checks require DoctorAI Pro.'; return; }
    if (consent?.checked !== true) { output.textContent = 'Select consent before starting the limited check. No medicine terms were sent.'; consent?.focus(); return; }
    await medicationContextPromise;
    await medicationCheckController.setConsent(true);
    await medicationCheckController.run(true);
    document.querySelector('[data-local-medication-db-result]')?.scrollIntoView({ block: 'start' });
  }

  async function handleClick(event) {
    if (event.target.closest('[data-device-storage-allow]')) { event.preventDefault(); setDeviceStorage(true); return; }
    if (event.target.closest('[data-device-storage-session]')) { event.preventDefault(); setDeviceStorage(false); return; }
    const mobileMenu = event.target.closest('[data-mobile-menu]');
    if (mobileMenu) {
      event.preventDefault();
      const open = !document.body.classList.contains('mobile-category-open');
      setMobileMenuOpen(open);
      return;
    }
    const moreToggle = event.target.closest('[data-more-menu]');
    const moreMenu = document.querySelector('.category-more-menu');
    if (moreToggle) {
      event.preventDefault();
      const opening = moreMenu.hidden;
      moreMenu.hidden = !opening;
      moreToggle.setAttribute('aria-expanded', String(opening));
      return;
    }
    if (!event.target.closest('.category-more') && moreMenu && !moreMenu.hidden) {
      moreMenu.hidden = true;
      document.querySelector('[data-more-menu]')?.setAttribute('aria-expanded', 'false');
    }
    if (document.body.classList.contains('mobile-category-open') && !event.target.closest('#category-bar')) setMobileMenuOpen(false);
    const todayViewTarget = event.target.closest('[data-today-view]');
    if (todayViewTarget) {
      event.preventDefault();
      closeModal();
      showView(todayViewTarget.dataset.todayView, true, true);
      return;
    }
    const viewTarget = event.target.closest('[data-view]');
    if (viewTarget) {
      event.preventDefault();
      setMobileMenuOpen(false);
      const categoryMore = viewTarget.closest('.category-more');
      if (categoryMore) {
        categoryMore.querySelector('.category-more-menu').hidden = true;
        categoryMore.querySelector('[data-more-menu]').setAttribute('aria-expanded', 'false');
      }
      closeProfile();
      showView(viewTarget.dataset.view, true, true);
      if (viewTarget.dataset.chatPrompt) fillChat(viewTarget.dataset.chatPrompt);
      return;
    }
    if (event.target.closest('[data-open-today-plan]')) { event.preventDefault(); openTodayPlan(); return; }
    if (event.target.closest('[data-open-personal-overview]')) { event.preventDefault(); openPersonalOverview(); return; }
    const openChat = event.target.closest('[data-open-chat]');
    if (openChat) { event.preventDefault(); fillChat(openChat.dataset.chatPrompt || ''); return; }
    if (event.target.closest('[data-open-medication-scanner]')) { event.preventDefault(); await openMedicationScanner(); return; }
    if (event.target.closest('[data-close-medication-scanner]')) { event.preventDefault(); closeMedicationScanner(); return; }
    if (event.target.closest('[data-medication-capture]')) { event.preventDefault(); await medicationPhotoCaptured(); return; }
    if (event.target.closest('[data-medication-photo]')) {
      event.preventDefault();
      if (els.medicationImageConsent?.checked !== true) {
        medicationScannerStatus('Check the consent box before choosing a label image. No image has been sent.', 'error');
        els.medicationImageConsent?.focus();
        return;
      }
      closeMedicationScanner();
      document.getElementById('medication-scan')?.click();
      return;
    }
    const localSafetyCheck = event.target.closest('[data-run-local-medication-safety-check]');
    if (localSafetyCheck) { event.preventDefault(); await runLocalMedicationSafetyCheck(localSafetyCheck); return; }
    if (event.target.closest('[data-medication-manual]')) { event.preventDefault(); closeMedicationScanner(); openMedicationModal(); return; }
    const fileAction = event.target.closest('[data-file-action]');
    if (fileAction) {
      event.preventDefault();
      if (!entitlementReady) await loadEntitlement();
      if (!hasProAccess()) { window.location.href = '/subscription#plans'; return; }
      document.getElementById(fileAction.dataset.fileAction)?.click();
      return;
    }
    const shareTarget = event.target.closest('[data-share-document]');
    if (shareTarget) {
      event.preventDefault();
      if (!hasProAccess()) { window.location.href = '/subscription#plans'; return; }
      showToast('Secure sharing will ask for a recipient and permission before sending.');
      return;
    }
    const chatAction = event.target.closest('[data-chat-action]');
    if (chatAction) {
      event.preventDefault();
      if (chatAction.dataset.chatAction === 'copy') { copyChatAnswer(chatAction); return; }
      if (chatAction.dataset.chatAction === 'signin') {
        openGoogleSignIn();
        return;
      }
      if (chatAction.dataset.chatAction === 'retry') {
        const message = chatAction.closest('.chat-message');
        const retryText = message?.dataset.retryText || '';
        if (message && retryText) { message.remove(); sendChat(retryText, { retry: true }); }
        return;
      }
    }
    const promptTarget = event.target.closest('[data-chat-prompt]');
    if (promptTarget) { event.preventDefault(); fillChat(promptTarget.dataset.chatPrompt); return; }
    if (event.target.closest('[data-google-signout]')) { event.preventDefault(); signOut(); return; }
    if (event.target.closest('[data-google-signin]')) { event.preventDefault(); authUser ? openProfile() : openGoogleSignIn(); return; }
    if (event.target.closest('[data-google-start]')) { event.preventDefault(); configureGoogleSignIn(); return; }
    if (event.target.closest('[data-open-summary]')) { event.preventDefault(); openCareSummary(); return; }
    if (event.target.closest('[data-edit-care-summary]') && careSummaryDraft?.form) {
      event.preventDefault();
      setModal('Since my last visit', 'Your visit brief', '');
      els.modalBody.append(careSummaryDraft.form);
      return;
    }
    if (event.target.closest('[data-print-care-summary]')) { event.preventDefault(); printCareSummary(); return; }
    if (event.target.closest('[data-copy-care-summary]')) {
      event.preventDefault();
      const text = $('#care-summary-reviewed')?.innerText;
      if (!text) return;
      if (!navigator.clipboard?.writeText) { showToast('Copy is unavailable here. Use Print / save as PDF instead.'); return; }
      navigator.clipboard.writeText(text).then(() => showToast('Visit brief copied. Paste it only where you intend to share it.')).catch(() => showToast('Copy was blocked. Use Print / save as PDF instead.'));
      return;
    }
    if (event.target.closest('[data-open-profile]')) { event.preventDefault(); openProfile(); return; }
    if (event.target.closest('[data-close-profile]')) { event.preventDefault(); closeProfile(true); return; }
    if (event.target.closest('[data-profile-edit-shortcuts]')) {
      event.preventDefault();
      profileShortcutEditing = !profileShortcutEditing;
      renderProfileShortcuts();
      return;
    }
    const removeProfileShortcut = event.target.closest('[data-profile-shortcut-remove]');
    if (removeProfileShortcut) {
      event.preventDefault();
      const id = String(removeProfileShortcut.dataset.profileShortcutRemove || '').trim();
      const item = profileShortcutDefinition(id);
      if (!item) return;
      profileShortcuts = profileShortcuts.filter(shortcut => shortcut !== id);
      persistProfileShortcuts();
      renderProfileShortcuts();
      showToast(`${item.label} removed from your shortcuts.`);
      return;
    }
    if (event.target.closest('[data-profile-add-shortcut]')) { event.preventDefault(); openProfileShortcutPicker(); return; }
    const profileShortcutChoice = event.target.closest('[data-profile-shortcut-choice]');
    if (profileShortcutChoice) {
      event.preventDefault();
      const id = String(profileShortcutChoice.dataset.profileShortcutChoice || '').trim();
      const item = profileShortcutDefinition(id);
      if (!item || profileShortcuts.includes(id)) return;
      profileShortcuts = [...profileShortcuts, id];
      persistProfileShortcuts();
      closeModal();
      renderProfileShortcuts();
      showToast(`${item.label} added to your shortcuts.`);
      return;
    }
    const profileShortcut = event.target.closest('[data-profile-shortcut]');
    if (profileShortcut) { event.preventDefault(); activateProfileShortcut(profileShortcut.dataset.profileShortcut); return; }
    if (event.target.closest('[data-close-google-signin]')) { closeGoogleSignIn(); return; }
    if (event.target.closest('[data-show-privacy]')) { event.preventDefault(); openPrivacy(); return; }
    if (event.target.closest('[data-export-health]')) { event.preventDefault(); exportHealthData(); return; }
    if (event.target.closest('[data-delete-health]')) { event.preventDefault(); deleteHealthData(); return; }
    if (event.target.closest('[data-close-privacy]')) { closePrivacy(); return; }
    if (event.target.closest('[data-close-modal]')) { closeModal(); return; }
    if (event.target.closest('[data-symptom-guidance]')) { event.preventDefault(); openSymptomGuidanceModal(); return; }
    const symptomPick = event.target.closest('[data-symptom-pick]');
    if (symptomPick) {
      event.preventDefault();
      const form = symptomPick.closest('form');
      const input = form?.elements?.name;
      if (input) { input.value = symptomPick.dataset.symptomPick || ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
      return;
    }
    const symptomContextPick = event.target.closest('[data-symptom-context]');
    if (symptomContextPick) {
      event.preventDefault();
      const form = symptomContextPick.closest('form');
      const input = form?.elements?.triggers;
      const label = String(symptomContextPick.dataset.symptomContext || '').trim();
      if (input && label) {
        const current = String(input.value || '').trim();
        const alreadyAdded = current.toLocaleLowerCase().includes(label.toLocaleLowerCase());
        input.value = alreadyAdded ? current : current ? `${current}; ${label}` : label;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
      return;
    }
    const modalTarget = event.target.closest('[data-modal]');
    if (modalTarget) {
      event.preventDefault();
      const modalType = modalTarget.dataset.modal;
      if (modalType === 'medication') openMedicationModal();
      if (modalType === 'appointment') openAppointmentModal();
      if (modalType === 'provider') openProviderModal();
      if (modalType === 'symptom') openSymptomModal();
      if (modalType === 'measurement') openMeasurementModal();
      if (modalType === 'health') openHealthModal();
      if (modalType === 'timeline') openTimelineModal();
      return;
    }
    const editProvider = event.target.closest('[data-edit-provider]');
    if (editProvider) { event.preventDefault(); const provider = state.providers.find(item => item.id === editProvider.dataset.editProvider); if (provider) openProviderModal(provider); return; }
    const editSymptom = event.target.closest('[data-edit-symptom]');
    if (editSymptom) {
      event.preventDefault();
      const entry = state.timeline.find(item => item.id === editSymptom.dataset.editSymptom && item.type === 'symptom');
      if (entry) openSymptomModal(entry);
      return;
    }
    const deleteSymptom = event.target.closest('[data-delete-symptom]');
    if (deleteSymptom) {
      event.preventDefault();
      const entry = state.timeline.find(item => item.id === deleteSymptom.dataset.deleteSymptom && item.type === 'symptom');
      if (entry && window.confirm(`Delete the symptom entry “${symptomName(entry)}”?`)) {
        state.timeline = state.timeline.filter(item => item.id !== entry.id);
        clearMedicationSafetyResults();
        saveState(); renderAll(); showToast('Symptom entry deleted.');
      }
      return;
    }
    const prepareSymptom = event.target.closest('[data-prepare-symptom]');
    if (prepareSymptom) {
      event.preventDefault();
      const entry = state.timeline.find(item => item.id === prepareSymptom.dataset.prepareSymptom && item.type === 'symptom');
      if (entry) {
        const severity = symptomSeverity(entry.severity);
        const detail = [`Symptom: ${symptomName(entry)}`, severity === null ? '' : `Intensity: ${severity}/10`, `Date: ${formatDate(entry.date)}`, entry.time ? `Time: ${formatTime(entry.time)}` : '', entry.duration ? `Duration: ${entry.duration}` : '', entry.location ? `Location: ${entry.location}` : '', entry.frequency ? `Pattern: ${entry.frequency}` : '', entry.quality ? `How it felt: ${entry.quality}` : '', entry.associatedSymptoms ? `Other symptoms: ${entry.associatedSymptoms}` : '', entry.impact && symptomImpactLabels[entry.impact] ? `Impact: ${symptomImpactLabels[entry.impact]}` : '', entry.interventions ? `What I tried: ${entry.interventions}` : '', entry.triggers ? `Possible triggers: ${entry.triggers}` : '', entry.context ? `Context: ${entry.context}` : '', entry.notes ? `Notes: ${entry.notes}` : ''].filter(Boolean).join('. ');
        fillChat(`Help me turn this symptom diary entry into a concise note and questions for a qualified healthcare professional. ${detail}. Do not diagnose me, prescribe, or recommend changing treatment.`);
      }
      return;
    }
    const prepareTarget = event.target.closest('[data-prepare-appointment]');
    if (prepareTarget) {
      event.preventDefault();
      const appointment = state.appointments.find(item => item.id === prepareTarget.dataset.prepareAppointment) || upcomingAppointments()[0];
      prepareAppointment(appointment);
      return;
    }
    const editMedication = event.target.closest('[data-edit-medication]');
    if (editMedication) {
      event.preventDefault();
      const medication = state.medications.find(item => String(item.id) === editMedication.dataset.editMedication);
      if (medication) openMedicationModal({ ...medication, __editId: String(medication.id) });
      return;
    }
    const deleteMedication = event.target.closest('[data-delete-medication]');
    if (deleteMedication) {
      event.preventDefault();
      const medication = state.medications.find(item => item.id === deleteMedication.dataset.deleteMedication);
      if (medication && window.confirm(`Delete ${medication.name} ${medication.dose || ''} from your medication list?`)) {
        state.medications = state.medications.filter(item => item.id !== medication.id);
        clearMedicationSafetyResults();
        saveState(); renderAll(); showToast('Medication removed from your health hub.');
      }
      return;
    }
    const deleteAppointment = event.target.closest('[data-delete-appointment]');
    if (deleteAppointment) {
      event.preventDefault();
      const appointment = state.appointments.find(item => item.id === deleteAppointment.dataset.deleteAppointment);
      if (appointment && window.confirm(`Delete the appointment “${appointment.title}”?`)) {
        state.appointments = state.appointments.filter(item => item.id !== appointment.id);
        state.timeline = state.timeline.filter(item => !(item.type === 'appointment' && item.title === `${appointment.title} added`));
        saveState(); renderAll(); showToast('Appointment removed from your health hub.');
      }
      return;
    }
    if (event.target.closest('[data-add-menu]')) { event.preventDefault(); openAddMenu(); return; }
    if (event.target.closest('[data-api-permissions]')) { event.preventDefault(); openApiPermissions(); return; }
    const medToggle = event.target.closest('[data-med-toggle]');
    if (medToggle) {
      const medication = state.medications.find(item => item.id === medToggle.dataset.medToggle);
      if (medication) { medication.status = medication.status === 'taken' ? 'due' : 'taken'; saveState(); renderTodayMedications(); renderMedicationLibrary(); showToast(medication.status === 'taken' ? `${medication.name} marked as taken.` : `${medication.name} returned to due.`); }
      return;
    }
    const medMissed = event.target.closest('[data-med-missed]');
    if (medMissed) {
      const medication = state.medications.find(item => item.id === medMissed.dataset.medMissed);
      if (medication) { medication.status = 'missed'; saveState(); renderTodayMedications(); renderMedicationLibrary(); showToast(`${medication.name} marked as missed. Consider contacting a pharmacist if you are unsure what to do next.`); }
      return;
    }
    const taskToggle = event.target.closest('[data-task-toggle]');
    if (taskToggle) { const task = state.tasks.find(item => item.id === taskToggle.dataset.taskToggle); if (task) { task.done = !task.done; saveState(); renderTasks(); showToast(task.done ? 'Task complete.' : 'Task returned to today.'); } return; }
    const timelineFilterTarget = event.target.closest('[data-timeline-filter]');
    if (timelineFilterTarget) { timelineFilter = timelineFilterTarget.dataset.timelineFilter; $$('[data-timeline-filter]').forEach(button => button.classList.toggle('active', button === timelineFilterTarget)); renderTimeline(); return; }
    const symptomModeTarget = event.target.closest('[data-symptom-mode]');
    if (symptomModeTarget) {
      event.preventDefault();
      symptomMode = ['entries', 'triggers'].includes(symptomModeTarget.dataset.symptomMode) ? symptomModeTarget.dataset.symptomMode : 'entries';
      renderSymptoms();
      return;
    }
    const documentFilterTarget = event.target.closest('[data-document-filter]');
    if (documentFilterTarget) { documentFilter = documentFilterTarget.dataset.documentFilter; $$('[data-document-filter]').forEach(button => button.classList.toggle('active', button === documentFilterTarget)); renderDocuments(); return; }
    const trendTarget = event.target.closest('[data-range]');
    if (trendTarget) { renderMeasurement(trendTarget.dataset.range); return; }
    const resultExplain = event.target.closest('[data-explain-result]');
    if (resultExplain) { fillChat(`Please explain the medical terminology in “${resultExplain.dataset.explainResult}” in easy-to-understand language, and suggest questions I could ask my clinician. Do not diagnose me.`); return; }
    const documentExplain = event.target.closest('[data-explain-document]');
    if (documentExplain) { fillChat(`Help me organise and explain the health document “${documentExplain.dataset.explainDocument}” in plain language. Remind me that a clinician should interpret it in context.`); return; }
    const documentView = event.target.closest('[data-document-view]');
    if (documentView) {
      event.preventDefault();
      const id = documentView.dataset.documentView;
      const document = state.documents.find(item => item.id === id);
      if (!document) { showToast('This document is not available in your private library.'); return; }
      window.open(`/api/documents?id=${encodeURIComponent(id)}`, '_blank', 'noopener');
      return;
    }
    const documentDownload = event.target.closest('[data-document-download]');
    if (documentDownload) {
      event.preventDefault();
      const id = documentDownload.dataset.documentDownload;
      window.location.href = `/api/documents?id=${encodeURIComponent(id)}&download=1`;
      return;
    }
    const documentDelete = event.target.closest('[data-delete-document]');
    if (documentDelete) { event.preventDefault(); deleteDocument(documentDelete.dataset.deleteDocument); return; }
    const documentShare = event.target.closest('[data-share-document]');
    if (documentShare) {
      event.preventDefault();
      showToast('Sharing stays off by default. Download the document yourself or wait for an explicitly approved sharing flow.');
      return;
    }
    if (event.target.closest('[data-clear-chat]')) { clearChat(); return; }
    if (event.target.closest('[data-api-ack]')) { closeModal(); showToast('AI integrations remain off until you explicitly authorise one.'); return; }
  }

  function setupQuickAccessOrbit() {
    const orbit = document.getElementById('quick-access-orbit');
    const dropZone = document.getElementById('quick-access-drop-zone');
    const dropLabel = document.getElementById('orbit-drop-label');
    const instruction = document.getElementById('orbit-instruction');
    if (!orbit || !dropZone) return;

    const actions = Array.from(orbit.querySelectorAll('[data-orbit-action]'));
    const staticGrid = getComputedStyle(orbit).display === 'grid' || getComputedStyle(dropZone).display === 'none';
    if (staticGrid) {
      actions.forEach(action => action.removeAttribute('aria-grabbed'));
      if (instruction) instruction.setAttribute('aria-label', 'Choose a shortcut');
      return;
    }
    const supportsTouchDrag = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    if (!supportsTouchDrag && instruction) instruction.setAttribute('aria-label', 'Click any shortcut');

    actions.forEach(action => action.setAttribute('aria-grabbed', 'false'));

    let orbitRotation = 0;
    const orbitAngles = actions.map((_, index) => -Math.PI / 2 + (Math.PI * 2 * index / actions.length));
    const layoutOrbit = (rotation = orbitRotation, animate = true) => {
      const compact = window.matchMedia('(max-width: 800px)').matches;
      const maxActionWidth = Math.max(...actions.map(action => action.offsetWidth), 0);
      const maxActionHeight = Math.max(...actions.map(action => action.offsetHeight), 0);
      const safeHorizontalRadius = (orbit.clientWidth / 2) - (maxActionWidth / 2) - (compact ? 10 : 12);
      const safeVerticalRadius = (orbit.clientHeight / 2) - (maxActionHeight / 2) - (compact ? 10 : 12);
       const radiusX = Math.max(72, Math.min(compact ? 174 : 190, safeHorizontalRadius));
       const radiusY = Math.max(92, Math.min(compact ? 160 : 190, safeVerticalRadius));
      orbit.style.setProperty('--orb-rotation', `${rotation}rad`);
      actions.forEach((action, index) => {
        const angle = orbitAngles[index] + rotation;
        action.style.setProperty('--orbit-x', `${Math.cos(angle) * radiusX}px`);
        action.style.setProperty('--orbit-y', `${Math.sin(angle) * radiusY}px`);
        action.style.transitionDuration = animate ? '' : '0ms';
      });
      if (!animate) window.requestAnimationFrame(() => actions.forEach(action => { action.style.transitionDuration = ''; }));
    };
    layoutOrbit(0, false);
    const refreshOrbitLayout = () => layoutOrbit(orbitRotation, false);
    window.addEventListener('resize', refreshOrbitLayout, { passive: true });
    window.addEventListener('doctorai:view-shown', refreshOrbitLayout);
    if ('ResizeObserver' in window) {
      const orbitResizeObserver = new ResizeObserver(refreshOrbitLayout);
      orbitResizeObserver.observe(orbit);
    }
    if (document.fonts?.ready) document.fonts.ready.then(refreshOrbitLayout).catch(() => {});
    window.requestAnimationFrame(() => window.requestAnimationFrame(refreshOrbitLayout));

    const activate = action => {
      const targetView = action.dataset.view;
      if (targetView) {
        showView(targetView);
        return;
      }
      const href = action.getAttribute('href');
      if (href) window.location.href = href;
    };

    actions.forEach(action => {
      let startX = 0;
      let startY = 0;
      let moved = false;
      let activePointer = null;
      let suppressClick = false;
      let startRotation = 0;

      const reset = () => {
        action.classList.remove('is-dragging');
        action.setAttribute('aria-grabbed', 'false');
        action.style.setProperty('--drag-x', '0px');
        action.style.setProperty('--drag-y', '0px');
        orbitRotation = 0;
        layoutOrbit(orbitRotation);
        dropZone.classList.remove('is-drop-active');
        if (dropLabel) dropLabel.textContent = 'quick access';
        activePointer = null;
      };

      const isOverDropZone = event => {
        const rect = dropZone.getBoundingClientRect();
        const centreX = rect.left + rect.width / 2;
        const centreY = rect.top + rect.height / 2;
        const radius = rect.width * .55;
        return Math.hypot(event.clientX - centreX, event.clientY - centreY) <= radius;
      };

      action.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        activePointer = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        moved = false;
        startRotation = orbitRotation;
        action.setPointerCapture?.(event.pointerId);
      });

      action.addEventListener('pointermove', event => {
        if (activePointer !== event.pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 7) return;
        moved = true;
        action.classList.add('is-dragging');
        action.setAttribute('aria-grabbed', 'true');
        orbitRotation = startRotation + (dx / Math.max(180, orbit.clientWidth)) * .75;
        layoutOrbit(orbitRotation);
        action.style.setProperty('--drag-x', `${dx}px`);
        action.style.setProperty('--drag-y', `${dy}px`);
        const overDropZone = isOverDropZone(event);
        dropZone.classList.toggle('is-drop-active', overDropZone);
        if (dropLabel) dropLabel.textContent = overDropZone ? 'release to open' : 'quick access';
      });

      const finishDrag = event => {
        if (activePointer !== event.pointerId) return;
        const shouldOpen = moved && isOverDropZone(event);
        if (moved) {
          suppressClick = true;
          window.setTimeout(() => { suppressClick = false; }, 420);
        }
        reset();
        if (shouldOpen) {
          window.setTimeout(() => activate(action), 120);
          if (navigator.vibrate) navigator.vibrate(18);
        }
      };

      action.addEventListener('pointerup', finishDrag);
      action.addEventListener('pointercancel', reset);
      action.addEventListener('click', event => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    });
  }

  setupNavigationIcons();
  setupQuickAccessOrbit();
  els.responseLengthInputs.forEach(input => {
    input.checked = input.value === chatResponseLength;
    input.addEventListener('change', () => {
      if (!input.checked || !['short', 'medium', 'detailed'].includes(input.value)) return;
      chatResponseLength = input.value;
      write('chat-response-length', chatResponseLength);
      setChatStatus(`${input.value[0].toUpperCase()}${input.value.slice(1)} answers selected.`, false);
    });
  });
  document.addEventListener('click', handleClick);
  els.medicationAlertModal?.addEventListener('cancel', event => event.preventDefault());
  els.medicationAlertModal?.addEventListener('close', () => {
    if (!medicationAlertFingerprint || medicationAlertAcknowledged(medicationAlertFingerprint)) return;
    window.setTimeout(() => {
      if (!els.medicationAlertModal.open && medicationAlertFingerprint && !medicationAlertAcknowledged(medicationAlertFingerprint)) {
        els.medicationAlertModal.showModal();
        els.medicationAlertModal.scrollTop = 0;
        els.medicationAlertModal.focus({ preventScroll: true });
      }
    }, 0);
  });
  els.medicationAlertModal?.querySelector('[data-acknowledge-medication-alert]')?.addEventListener('click', () => closeMedicationSafetyAlert(true));
  els.medicationAlertModal?.querySelector('[data-review-medication-alert]')?.addEventListener('click', () => {
    closeMedicationSafetyAlert(true);
    showView('medications');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && !els.drawer.hidden) {
      const focusable = [...els.drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(item => !item.hidden);
      if (focusable.length) {
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key !== 'Escape') return;
    if (!els.drawer.hidden) { closeProfile(true); return; }
    const moreMenu = document.querySelector('.category-more-menu');
    if (moreMenu && !moreMenu.hidden) {
      moreMenu.hidden = true;
      document.querySelector('[data-more-menu]')?.setAttribute('aria-expanded', 'false');
    }
    if (document.body.classList.contains('mobile-category-open')) { setMobileMenuOpen(false, true); return; }
  });
  els.modalBody.addEventListener('submit', handleModalSubmit);
  els.chatForm.addEventListener('submit', event => { event.preventDefault(); sendChat(); });
  els.chatInput.addEventListener('input', updateChatCount);
  els.chatInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } });
  els.memoryToggle?.addEventListener('change', event => setMemory(event.target.checked));
  els.healthMemoryToggle?.addEventListener('change', event => setMemory(event.target.checked));
  $('#result-upload')?.addEventListener('change', event => { addDocument(event.target.files[0]); event.target.value = ''; });
  $('#document-upload')?.addEventListener('change', event => { addDocument(event.target.files[0]); event.target.value = ''; });
  $('#document-upload-inline')?.addEventListener('change', event => { addDocument(event.target.files[0]); event.target.value = ''; });
  $('#medication-scan')?.addEventListener('change', event => { scanMedicationPhoto(event.target.files[0]); event.target.value = ''; });
  els.modal.addEventListener('click', event => { if (event.target === els.modal) closeModal(); });
  els.medicationScannerModal?.addEventListener('click', event => { if (event.target === els.medicationScannerModal) closeMedicationScanner(); });
  els.medicationScannerModal?.addEventListener('cancel', () => stopMedicationScannerCamera());
  els.medicationScannerModal?.addEventListener('close', () => stopMedicationScannerCamera());
  els.privacyModal.addEventListener('click', event => { if (event.target === els.privacyModal) closePrivacy(); });
  els.googleSigninModal?.addEventListener('click', event => { if (event.target === els.googleSigninModal) closeGoogleSignIn(); });
  window.addEventListener('hashchange', () => {
    closeMedicationScanner();
    const hash = location.hash.slice(1);
    if (hash === 'privacy') { showView('today', false); openPrivacy(); return; }
    if (hash === 'summary') { showView('today', false); openCareSummary(); return; }
    if (hash === 'terms') { location.assign('/terms'); return; }
    showView(hash, false, true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && els.medicationScannerModal?.open) {
      stopMedicationScannerCamera();
      medicationScannerStatus('Scanner paused when DoctorAI moved to the background. Close and reopen it to continue.', 'idle');
    }
  });
  window.addEventListener('pagehide', stopMedicationScannerCamera);
  window.addEventListener('load', configureGoogleSignIn);

  const initialView = location.hash.slice(1);
  const termsQuery = new URLSearchParams(location.search).get('terms') === '1';
  renderAll();
  try { if (storageConsent && !localStorage.getItem(storageConsentKey)) storageConsent.hidden = false; } catch { if (storageConsent) storageConsent.hidden = false; }
  if (termsQuery || initialView === 'terms') location.replace('/terms');
  else if (initialView === 'privacy') { showView('today', false); openPrivacy(); }
  else if (initialView === 'summary') { showView('today', false); openCareSummary(); }
  else showView(viewNames.includes(initialView) ? initialView : 'today', false);
  document.addEventListener('change', event => {
    if (event.target.matches('[data-local-medication-db-consent]')) medicationCheckController.setConsent(event.target.checked).catch(() => {});
  });
  loadAccountSession();
  loadEntitlement();
})();
