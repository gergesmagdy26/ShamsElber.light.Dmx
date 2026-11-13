/**
 * CineLight & DMX Stage Planner
 * Main Application Controller (Auth, Dashboard, CRUD Managers, Inspector Modals,
 * Manual DMX Cable Tool, Truss Thickness, Scale Controls, Theme Toggle & Reports)
 */

(function (global) {
  'use strict';

  const state = {
    theme: 'dark',
    authMode: 'login',
    currentUser: null,
    workspace: null,
    dashSection: 'new_project',
    activeEqCategoryFilter: 'all',
    drawerCategoryFilter: 'cat_fixtures',
    activeProject: null,
    activeScene: null,
    canvasEngine: null,
    tempCustomImage: null,
    tempCrossbars: [],
    deferredInstallPrompt: null,
    exportChannelFilter: 'all',
    exportContentScope: 'sheet',
    lastSelectedDmxChannel: '',
    newProjectDraftCrew: null,
    crewModalMode: 'project'
  };

  // ==========================================================================
  // INITIALIZATION, THEME & PWA SETUP
  // ==========================================================================
  let _authUserTouched = false;

  function isDesktopDeviceForAuth() {
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');
    return !coarse && !uaMobile && window.innerWidth > 920;
  }

  function focusDesktopAuthUsername() {
    if (!isDesktopDeviceForAuth()) return;
    const authScreen = document.getElementById('authScreen');
    const authUserEl = document.getElementById('authUsername');
    if (!authScreen || authScreen.classList.contains('hidden') || !authUserEl) return;
    requestAnimationFrame(() => {
      try {
        authUserEl.focus({ preventScroll: true });
      } catch (e) {}
    });
  }

  async function init() {
    initTheme();
    registerServiceWorker();
    setupPWAInstallPrompt();
    setupGlobalDismissListeners();

    const authScreenEl = document.getElementById('authScreen');
    if (authScreenEl) {
      ['pointerdown', 'touchstart', 'focusin'].forEach((evt) => {
        authScreenEl.addEventListener(evt, (ev) => {
          if (ev.target && (ev.target.id === 'authUsername' || ev.target.id === 'authPassword')) {
            _authUserTouched = true;
          }
        }, true);
      });
    }

    focusDesktopAuthUsername();

    // Sync portable project folder (project/data.json) before initializing auth/settings
    try {
      if (global.CineLightDB && typeof global.CineLightDB.syncWithProjectFolderOnBoot === 'function') {
        await global.CineLightDB.syncWithProjectFolderOnBoot();
      }
    } catch (e) {}

    // Ensure stored admin credentials are migrated to 'gerges' / 'gerges' immediately on load
    try {
      await global.CineLightDB.getAllUsers();
      await global.CineLightDB.getAppSettings();
    } catch (e) {}

    try {
      await global.ShamsSettings?.init();
      global.ShamsWorkspaceUI?.init();
    } catch (e) {}

    // Always require username & password login every time the application is opened,
    // without stealing focus or clearing fields if the user already tapped/typed during boot.
    try {
      await global.CineLightDB.logoutUser();
    } catch (e) {}
    state.currentUser = null;
    const authUserEl = document.getElementById('authUsername');
    const authPassEl = document.getElementById('authPassword');
    const activeEl = document.activeElement;
    const userInteractingWithAuth = !!(
      _authUserTouched ||
      (activeEl && (activeEl.id === 'authUsername' || activeEl.id === 'authPassword')) ||
      (authUserEl && authUserEl.value.length > 0) ||
      (authPassEl && authPassEl.value.length > 0)
    );
    if (!userInteractingWithAuth) {
      if (authUserEl) authUserEl.value = '';
      if (authPassEl) authPassEl.value = '';
      showScreen('authScreen');
    } else if (authScreenEl) {
      authScreenEl.classList.remove('hidden');
    }
    focusDesktopAuthUsername();
  }

  function initTheme() {
    try {
      const saved = localStorage.getItem('cinelight_theme');
      state.theme = saved === 'light' ? 'light' : 'dark';
    } catch (e) {
      state.theme = 'dark';
    }
    applyThemeUI();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('cinelight_theme', state.theme);
    } catch (e) {}
    applyThemeUI();
    showToast(state.theme === 'light' ? '☀️ تم تفعيل الوضع النهاري (Light Mode)' : '🌙 تم تفعيل الوضع الليلي (Dark Mode)');
  }

  function applyThemeUI() {
    const isLight = state.theme === 'light';
    document.body.classList.toggle('light-theme', isLight);
    document.querySelectorAll('.theme-toggle-icon').forEach((el) => {
      el.textContent = isLight ? '🌙' : '☀️';
    });
    if (state.canvasEngine) {
      state.canvasEngine.setTheme(state.theme);
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      const hadController = !!navigator.serviceWorker.controller;
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const ae = document.activeElement;
        const typingInAuth = ae && (ae.id === 'authUsername' || ae.id === 'authPassword');
        if (hadController && !refreshing && !typingInAuth) {
          refreshing = true;
          window.location.reload();
        }
      });
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
        reg.update().catch(() => {});
      }).catch(() => {});
    }
  }

  function setupPWAInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      const btn = document.getElementById('pwaInstallBtn');
      if (btn) btn.classList.remove('hidden');
    });
  }

  async function installPWA() {
    if (!state.deferredInstallPrompt) {
      showToast('التطبيق جاهز للتثبيت من قائمة المتصفح (Add to Home Screen / Install App)');
      return;
    }
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    document.getElementById('pwaInstallBtn').classList.add('hidden');
  }

  function closeAllPrintMenus() {
    document.querySelectorAll('.print-dropdown-menu').forEach((m) => m.classList.add('hidden'));
  }

  function toggleReportPrintMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('reportPrintDropdownMenu');
    const btn = document.getElementById('reportPrintMenuBtn');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    closeAllPrintMenus();
    if (willOpen) {
      menu.classList.remove('hidden', 'align-right');
      if (btn) {
        const bRect = btn.getBoundingClientRect();
        const mRect = menu.getBoundingClientRect();
        if (bRect.left + mRect.width > window.innerWidth - 12) {
          menu.classList.add('align-right');
        }
      }
    }
  }

  let _fixtureLiveSaveTimer = null;
  let _fixture3dRebuildTimer = null;
  let _isPopulatingFixtureModal = false;

  function setupGlobalDismissListeners() {
    document.addEventListener('click', (ev) => {
      const shieldUntil = Number(global.__shamsBlockGhostClicksUntil || 0);
      if (shieldUntil > Date.now()) {
        const target = ev.target;
        const insideOverlayOrPad = target && (
          target.closest('.modal-backdrop') ||
          target.closest('#leftAimDpad') ||
          target.closest('#reopenDpadPill')
        );
        if (insideOverlayOrPad) {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          return;
        }
      }
    }, true);

    document.addEventListener('click', () => {
      const infoMenu = document.getElementById('showInfoDropdownMenu');
      if (infoMenu) infoMenu.classList.add('hidden');
      const pwrPop = document.getElementById('powerLoadPopover');
      if (pwrPop) pwrPop.classList.add('hidden');
      closeAllPrintMenus();
    });

    const fixForm = document.getElementById('fixtureInspectorForm');
    if (fixForm) {
      fixForm.addEventListener('input', (ev) => {
        if (_isPopulatingFixtureModal) return;
        const id = ev.target && ev.target.id;
        if (id === 'fixModalDimmerRange' || id === 'fixModalDimmerNum' || id === 'fixModalColorHex') return;
        applyFixtureInspectorLive({ immediatePersist: false });
      });
      fixForm.addEventListener('change', (ev) => {
        if (_isPopulatingFixtureModal) return;
        const id = ev.target && ev.target.id;
        if (id === 'fixModalDimmerRange' || id === 'fixModalColorHex') return;
        applyFixtureInspectorLive({ immediatePersist: true });
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllPrintMenus();
      }
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (!state.activeProject || !state.canvasEngine) return;

      if (e.key === 'Escape') {
        if (document.body.classList.contains('display-mode-active')) {
          toggleDisplayMode(false);
        } else if (state.canvasEngine.dmxCableDrawMode) {
          finishCurrentDmxCable();
        } else {
          state.canvasEngine.selectItem(null, false, false);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.canvasEngine.selectedCableId) {
          deleteSelectedCustomCable();
        } else if (state.canvasEngine.getSelectedItem()) {
          deleteSelectedItem();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dpadAction('left', 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        dpadAction('right', 5);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dpadAction('up', 5);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        dpadAction('down', 5);
      } else if (e.key === '+' || e.key === '=') {
        if (state.canvasEngine.getSelectedItem()) {
          scaleSelected(0.15);
        }
      } else if (e.key === '-') {
        if (state.canvasEngine.getSelectedItem()) {
          scaleSelected(-0.15);
        }
      }
    });
  }

  function showScreen(screenId) {
    ['authScreen', 'dashboardScreen', 'workspaceScreen'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== screenId);
    });
  }

  function showToast(msg, duration = 2900) {
    const el = document.getElementById('toastBanner');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.add('hidden');
    }, duration);
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(id) {
    if (id === 'fixtureInspectorModal' && _fixtureLiveSaveTimer) {
      clearTimeout(_fixtureLiveSaveTimer);
      _fixtureLiveSaveTimer = null;
      persistWorkspace();
    }
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  // ==========================================================================
  // 2. ROLE-BASED AUTHENTICATION, ADMIN CREDENTIALS & SECTION PERMISSIONS
  // ==========================================================================
  function isAdminUser(user) {
    const u = user || state.currentUser;
    if (!u) return false;
    return u.role === 'Admin' || global.CineLightDB.normalizeUserKey(u.username) === 'gerges';
  }

  function canAccess(permKey) {
    return global.CineLightDB.hasPermission(state.currentUser, permKey);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const u = document.getElementById('authUsername').value;
    const p = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authErrorMsg');

    const res = await global.CineLightDB.loginUser(u, p);
    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');
    document.getElementById('authPassword').value = '';
    await enterUserWorkspace(res.user);
  }

  async function handleLogout() {
    await global.CineLightDB.logoutUser();
    state.currentUser = null;
    state.workspace = null;
    state.activeProject = null;
    state.activeScene = null;
    showScreen('authScreen');
    focusDesktopAuthUsername();
  }

  async function enterUserWorkspace(user) {
    state.currentUser = user;
    state.workspace = await global.CineLightDB.ensureUserWorkspace(user.username);
    const isAdm = isAdminUser(user);
    document.getElementById('dashUserBadge').textContent = `${isAdm ? '' : '👤 '}${user.displayName || user.username} (${isAdm ? 'Admin' : 'Regular User'})`;
    showScreen('dashboardScreen');
    applyUserPermissionsUI();
    await refreshDashboardAll();

    // Select the first permitted section on login
    if (canAccess('newProjectVenues')) {
      switchDashboardSection('new_project');
    } else if (canAccess('savedProjects')) {
      switchDashboardSection('saved_projects');
    } else if (canAccess('paperProject')) {
      switchDashboardSection('paper_project');
    } else if (canAccess('equipmentManager')) {
      switchDashboardSection('equipment_manager');
    } else if (canAccess('venuesManager')) {
      switchDashboardSection('venues_manager');
    } else {
      switchDashboardSection('saved_projects');
    }
  }

  function applyUserPermissionsUI() {
    if (!state.currentUser) return;
    const isAdm = isAdminUser();
    const pNewProj = canAccess('newProjectVenues');
    const pSavedProj = canAccess('savedProjects');
    const pManageSaved = canAccess('manageSavedProjects');
    const pVenues = canAccess('venuesManager');
    const pEquip = canAccess('equipmentManager');
    const pPaper = canAccess('paperProject');
    const pPlot = canAccess('stagePlotCanvas');
    const p3d = canAccess('view3dMode');
    const pDmx = canAccess('dmxPatching');
    const pCam = canAccess('cameraSettings');
    const pAimAlign = canAccess('aimAndAlignTools');
    const pShowInfo = canAccess('showInfoAndDisplay');
    const pPower = canAccess('powerLoadMonitor');
    const pProjGear = canAccess('projectSettingsGear');
    const pExport = canAccess('exportReports');
    const pAppSettings = canAccess('appGeneralSettings');

    // 1. Dashboard Navigation Tabs (User Management stays inside Settings ⚙️, never on main nav grid)
    const navNew = document.getElementById('navBtnNewProject');
    const navSaved = document.getElementById('navBtnSavedProjects');
    const navVenues = document.getElementById('navBtnVenues');
    const navEq = document.getElementById('navBtnEquipment');
    const navPaper = document.getElementById('navBtnPaperProject');
    const navUsers = document.getElementById('navBtnUsers');
    const mainGearBtn = document.getElementById('mainSettingsGearBtn');

    if (navNew) navNew.classList.toggle('hidden', !pNewProj);
    if (navSaved) navSaved.classList.toggle('hidden', !pSavedProj);
    if (navVenues) navVenues.classList.toggle('hidden', !pVenues);
    if (navEq) navEq.classList.toggle('hidden', !pEquip);
    if (navPaper) navPaper.classList.toggle('hidden', !pPaper);
    if (navUsers) navUsers.style.display = 'none';
    if (mainGearBtn) mainGearBtn.classList.toggle('hidden', !(isAdm || pAppSettings));

    // 2. Saved Projects Header Buttons
    const btnSavedNew = document.getElementById('btnSavedProjNew');
    const btnSavedImport = document.getElementById('btnSavedProjImportJson');
    if (btnSavedNew) btnSavedNew.classList.toggle('hidden', !pNewProj);
    if (btnSavedImport) btnSavedImport.classList.toggle('hidden', !pManageSaved);

    // 3. Stage Plot Topbar, Sidebar & Dropdown Controls
    const btnLiveVenue = document.getElementById('btnLiveVenueEditor');
    const btn3d = document.getElementById('toggleViewModeBtn');
    const btnDrawDmx = document.getElementById('drawDmxCableModeBtn');
    const btnAutoDmx = document.getElementById('toggleDmxWiringBtn');
    const btnAimPad = document.getElementById('topbarToggleDpadBtn');
    const sidebarAlignSec = document.getElementById('sidebarAlignSection');
    const btnShowInfo = document.getElementById('showInfoDropdownBtn')?.closest('.dropdown-wrapper');
    const btnDisplay = document.getElementById('topbarDisplayModeBtn');
    const pwrWrapper = document.getElementById('powerLoadBadge')?.closest('.dropdown-wrapper');
    const btnProjGearTop = document.getElementById('btnTopbarProjectGear');
    const btnProjGearSide = document.getElementById('btnOpenProjectSettingsGear');
    const undoRedoGrp = document.querySelector('.shams-undo-redo-group');
    const chkChannelRow = document.getElementById('chkRow_channel');
    const chkAddrRow = document.getElementById('chkRow_address');
    const showInfoCamCol = document.getElementById('showInfoCameraCol');
    const btnExportReports = document.getElementById('topbarExportReportsBtn');

    if (btnLiveVenue) btnLiveVenue.classList.toggle('hidden', !pVenues);
    if (btn3d) btn3d.classList.toggle('hidden', !p3d);
    if (btnDrawDmx) btnDrawDmx.classList.toggle('hidden', !pDmx);
    if (btnAutoDmx) btnAutoDmx.classList.toggle('hidden', !pDmx);
    if (btnAimPad) btnAimPad.classList.toggle('hidden', !pAimAlign);
    if (sidebarAlignSec) sidebarAlignSec.classList.toggle('hidden', !pAimAlign);
    if (state.canvasEngine) {
      updateLeftAimDpadUI(state.canvasEngine.getSelectedItem(), state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    } else {
      const reopenPill = document.getElementById('reopenDpadPill');
      if (reopenPill) reopenPill.classList.toggle('hidden', !pAimAlign);
    }
    if (btnShowInfo) btnShowInfo.classList.toggle('hidden', !pShowInfo);
    if (btnDisplay) btnDisplay.classList.toggle('hidden', !pShowInfo);
    if (pwrWrapper) pwrWrapper.classList.toggle('hidden', !pPower);
    if (btnProjGearTop) btnProjGearTop.classList.toggle('hidden', !pProjGear);
    if (btnProjGearSide) btnProjGearSide.classList.toggle('hidden', !pProjGear);
    if (undoRedoGrp) undoRedoGrp.classList.toggle('hidden', !pProjGear);
    if (chkChannelRow) chkChannelRow.classList.toggle('hidden', !pDmx);
    if (chkAddrRow) chkAddrRow.classList.toggle('hidden', !pDmx);
    if (showInfoCamCol) showInfoCamCol.classList.toggle('hidden', !pCam);
    const pStLook = canAccess('paperCameraStLook');
    const chkStRow = document.getElementById('chk_stLook')?.closest('label');
    const camStBox = document.querySelector('#cameraInspectorModal .st-look-box');
    if (chkStRow) chkStRow.classList.toggle('hidden', !pStLook);
    if (camStBox) camStBox.classList.toggle('hidden', !pStLook);
    if (btnExportReports) btnExportReports.classList.toggle('hidden', !(pExport || pDmx || pCam));

    // 4. Fixture Inspector DMX Section
    const fixDmxBox = document.getElementById('fixModalDmxBox');
    const fixDmxRow = document.getElementById('fixModalDmxFieldsRow');
    if (fixDmxBox) fixDmxBox.classList.toggle('hidden', !pDmx);
    if (fixDmxRow) fixDmxRow.classList.toggle('hidden', !pDmx);

    // 5. Reports & Export Modal Sections
    const repExportBar = document.getElementById('reportExportActionsBar');
    const repDmxWrap = document.getElementById('reportDmxSectionWrap');
    const repCamWrap = document.getElementById('reportCameraSectionWrap');
    if (repExportBar) repExportBar.classList.toggle('hidden', !pExport);
    if (repDmxWrap) repDmxWrap.classList.toggle('hidden', !pDmx);
    if (repCamWrap) repCamWrap.classList.toggle('hidden', !pCam);

    // Protect current screen if Stage Plot is not permitted
    if (!pPlot && !document.getElementById('workspaceScreen').classList.contains('hidden')) {
      closeProjectToDashboard();
    }
  }

  async function persistWorkspace() {
    if (!state.currentUser || !state.workspace) return;
    global.ShamsWorkspaceUI?.checkpoint?.('Edit');
    await global.CineLightDB.saveUserWorkspace(state.currentUser.username, state.workspace);
  }

  // ==========================================================================
  // 3. MAIN DASHBOARD NAVIGATION & ADMIN USERS MANAGER
  // ==========================================================================
  function getFirstAllowedDashSection() {
    if (canAccess('newProjectVenues')) return 'new_project';
    if (canAccess('savedProjects')) return 'saved_projects';
    if (canAccess('paperProject')) return 'paper_project';
    if (canAccess('equipmentManager')) return 'equipment_manager';
    if (canAccess('venuesManager')) return 'venues_manager';
    return 'saved_projects';
  }

  function switchDashboardSection(sec) {
    // Enforce section permissions before switching
    if (sec === 'new_project' && !canAccess('newProjectVenues')) {
      showToast('🔒 غير مصرح لك بإنشاء مشاريع جديدة');
      sec = getFirstAllowedDashSection();
    } else if (sec === 'saved_projects' && !canAccess('savedProjects')) {
      showToast('🔒 غير مصرح لك بعرض المشاريع المحفوظة');
      sec = getFirstAllowedDashSection();
    } else if (sec === 'venues_manager' && !canAccess('venuesManager')) {
      showToast('🔒 غير مصرح لك بقائمة وتعديل الأماكن');
      sec = getFirstAllowedDashSection();
    } else if (sec === 'equipment_manager' && !canAccess('equipmentManager')) {
      showToast('🔒 غير مصرح لك بإدارة قائمة المعدات');
      sec = getFirstAllowedDashSection();
    } else if (sec === 'paper_project' && !canAccess('paperProject')) {
      showToast('🔒 غير مصرح لك بقسم المشروع الورقي');
      sec = getFirstAllowedDashSection();
    } else if (sec === 'users_manager') {
      if (isAdminUser() && global.ShamsSettings?.openModal) {
        global.ShamsSettings.openModal('users');
        return;
      }
      showToast('🔒 إدارة المستخدمين متاحة للـ Admin من داخل الإعدادات (⚙️)');
      sec = getFirstAllowedDashSection();
    }

    state.dashSection = sec;
    const map = {
      new_project: ['navBtnNewProject', 'secNewProject'],
      saved_projects: ['navBtnSavedProjects', 'secSavedProjects'],
      equipment_manager: ['navBtnEquipment', 'secEquipmentManager'],
      venues_manager: ['navBtnVenues', 'secVenuesManager'],
      paper_project: ['navBtnPaperProject', 'secPaperProject'],
      users_manager: ['navBtnUsers', 'secUsersManager']
    };
    Object.keys(map).forEach((k) => {
      const [btnId, secId] = map[k];
      const btnEl = document.getElementById(btnId);
      const secEl = document.getElementById(secId);
      if (btnEl) btnEl.classList.toggle('active', k === sec);
      if (secEl) secEl.classList.toggle('hidden', k !== sec);
    });
    const dashScreen = document.getElementById('dashboardScreen');
    if (dashScreen) {
      dashScreen.classList.toggle('paper-fullscreen', sec === 'paper_project');
    }
    if (sec === 'paper_project') {
      global.ShamsPaper?.renderSection();
    }
    refreshDashboardAll();
  }

  function exitPaperProjectToDashboard() {
    const dashScreen = document.getElementById('dashboardScreen');
    if (dashScreen) dashScreen.classList.remove('paper-fullscreen');

    const fallbackSec = canAccess('newProjectVenues')
      ? 'new_project'
      : canAccess('savedProjects')
      ? 'saved_projects'
      : canAccess('equipmentManager')
      ? 'equipment_manager'
      : canAccess('venuesManager')
      ? 'venues_manager'
      : null;

    if (fallbackSec) {
      switchDashboardSection(fallbackSec);
    }
  }

  async function refreshDashboardAll() {
    if (!state.workspace) return;
    applyUserPermissionsUI();
    document.getElementById('savedProjectsCount').textContent = (state.workspace.projects || []).length;
    renderNewProjectVenueTemplates();
    renderSavedProjectsSection();
    renderEquipmentManagerSection();
    renderVenuesManagerSection();
    if (state.dashSection === 'paper_project') {
      global.ShamsPaper?.renderSection();
    }
    if (isAdminUser()) {
      await renderUsersManagerSection();
    }
  }

  function renderNewProjectVenueTemplates() {
    const sel = document.getElementById('newProjVenueSelect');
    if (!sel || !state.workspace) return;
    const prevVal = sel.value;
    const venues = state.workspace.venues || [];
    sel.innerHTML = venues
      .map((v) => `<option value="${v.id}">${escapeHtml(v.name)} (${v.width}m × ${v.length}m)</option>`)
      .concat([`<option value="__custom__">-- تخصيص أبعاد جديدة يدوياً (Custom Venue) --</option>`])
      .join('');

    if (prevVal && Array.from(sel.options).some((o) => o.value === prevVal)) {
      sel.value = prevVal;
    } else if (venues.length > 0) {
      sel.value = venues[0].id;
      onNewProjVenueTemplateChange(venues[0].id);
    }
  }

  function onNewProjVenueTemplateChange(venueId) {
    if (!state.workspace) return;
    const v = (state.workspace.venues || []).find((x) => x.id === venueId);
    if (v) {
      document.getElementById('newProjVenueType').value = v.type;
      document.getElementById('newProjWidth').value = v.width;
      document.getElementById('newProjLength').value = v.length;
      document.getElementById('newProjHeight').value = v.height || 4.5;
      updateNewProjVenueHint(v.type);
    }
  }

  function onNewProjVenueTypeChange(type) {
    updateNewProjVenueHint(type);
  }

  function updateNewProjVenueHint(type) {
    const hint = document.getElementById('newProjVenueHint');
    if (!hint) return;
    const descriptions = {
      plateau: 'بلاتوه (Studio / Plateau): يحتوي على شبكة مواسير حديدية في السقف بالطول وبالعرض مع الترقيم وخاصية الـ Auto-Snap لتعليق الكشافات تلقائياً.',
      truss: 'تراس (Truss Rig): يدعم الأشكال (Straight, L-Shape, U-Shape, Closed Box) مع التحكم في حجم التراس وسمك الحديد وإضافة مواسير تقطع التراس بالطول أو بالعرض.',
      church: 'كنيسة الملاك (Church): يشمل صحن الكنيسة (Nave)، الهيكل المرتفع (Sanctuary/Altar)، التحكم في عدد صفوف الكراسي والفرق بينها وبُعدها عن الهيكل، والأعمدة الجانبية ونقاط التعليق.',
      free: 'لوكيشن حر (Free Location): مساحة مفتوحة مقسمة بالمتر يتم فيها وضع جميع الكشافات على استاندات أرضية والكاميرات على ترايبود.'
    };
    hint.textContent = descriptions[type] || descriptions.plateau;
  }

  async function handleCreateNewProject(e) {
    e.preventDefault();
    const name = document.getElementById('newProjName').value.trim() || 'New Lighting Plot';
    const templateId = document.getElementById('newProjVenueSelect').value;
    const type = document.getElementById('newProjVenueType').value;
    const width = parseFloat(document.getElementById('newProjWidth').value) || 14;
    const length = parseFloat(document.getElementById('newProjLength').value) || 10;
    const height = parseFloat(document.getElementById('newProjHeight').value) || 4.5;
    const dop = document.getElementById('newProjDop').value.trim();
    const programmer = document.getElementById('newProjProgrammer').value.trim();
    const draftCrew = state.newProjectDraftCrew ? { ...state.newProjectDraftCrew } : null;
    const finalDop = dop || (draftCrew ? draftCrew.dop : '');
    const finalProgrammer = programmer || (draftCrew ? draftCrew.lightingProgrammer : '');
    if (draftCrew) {
      draftCrew.dop = finalDop;
      draftCrew.lightingProgrammer = finalProgrammer;
    }

    let baseTemplate = (state.workspace.venues || []).find((v) => v.id === templateId);
    if (!baseTemplate || baseTemplate.type !== type) {
      baseTemplate = global.CineLightDB.getInitialVenues().find((v) => v.type === type) || global.CineLightDB.getInitialVenues()[0];
    }

    const venueConfig = JSON.parse(JSON.stringify(baseTemplate));
    venueConfig.type = type;
    venueConfig.width = width;
    venueConfig.length = length;
    venueConfig.height = height;

    if (type === 'plateau' && (!venueConfig.gridConfig || templateId === '__custom__')) {
      venueConfig.gridConfig = buildAutoGridPipes(width, length);
    }

    const sceneId = 'scene_' + Date.now();
    const newProj = {
      id: 'proj_' + Date.now(),
      name,
      dop: finalDop,
      programmer: finalProgrammer,
      crew: draftCrew || (finalDop || finalProgrammer ? {
        dop: finalDop,
        lightingProgrammer: finalProgrammer,
        director: '',
        equipmentManager: '',
        cameraOperators: {},
        technicians: []
      } : null),
      venueId: venueConfig.id,
      venueType: type,
      venueName: venueConfig.name,
      venueConfig,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeSceneId: sceneId,
      showDmxWiring: false,
      showDistanceLines: true,
      showInfoFlags: {
        lightBeam: true,
        fixtureName: false,
        fixtureNum: false,
        channel: false,
        address: false,
        dimmer: false,
        kelvin: false,
        color: false,
        cameraCone: true,
        camNum: true,
        lensZoom: true,
        fStop: false,
        iso: false,
        camKelvin: false,
        stLook: false
      },
      _v2CleanInfoFlags: true,
      scenes: [
        {
          id: sceneId,
          name: 'Scene 1 - Main Setup',
          customDmxCables: [],
          items: []
        }
      ]
    };

    state.workspace.projects.unshift(newProj);
    await persistWorkspace();
    document.getElementById('newProjName').value = '';
    if (document.getElementById('newProjDop')) document.getElementById('newProjDop').value = '';
    if (document.getElementById('newProjProgrammer')) document.getElementById('newProjProgrammer').value = '';
    state.newProjectDraftCrew = null;
    updateNewProjCrewButtonLabel();
    openProjectInWorkspace(newProj.id);
  }

  function buildAutoGridPipes(width, length) {
    const hPipes = [];
    const vPipes = [];
    for (let y = 1.5; y <= length - 1.0; y += 1.8) {
      hPipes.push(+y.toFixed(1));
    }
    for (let x = 2.0; x <= width - 1.2; x += 2.0) {
      vPipes.push(+x.toFixed(1));
    }
    return { mode: 'custom', horizontalPipes: hPipes, verticalPipes: vPipes };
  }

  function renderSavedProjectsSection() {
    const grid = document.getElementById('savedProjectsGrid');
    if (!grid || !state.workspace) return;
    const projects = state.workspace.projects || [];
    const pNewVenue = canAccess('newProjectVenues');
    const pManageSaved = canAccess('manageSavedProjects');
    const pPlot = canAccess('stagePlotCanvas');
    const pExport = canAccess('exportReports');
    const pDmx = canAccess('dmxPatching');
    const pCam = canAccess('cameraSettings');

    if (!projects.length) {
      grid.innerHTML = `<div class="item-card" style="grid-column:1/-1; text-align:center; padding:32px;">
        <p style="color:var(--text-muted); margin-bottom:12px;">لا توجد مشاريع محفوظة حتى الآن / No saved projects yet.</p>
        ${pNewVenue ? `<button class="btn btn-primary" onclick="CineApp.switchDashboardSection('new_project')">➕ إنشاء مشروع جديد</button>` : ''}
      </div>`;
      return;
    }

    const typeLabels = {
      plateau: 'بلاتوه (Studio Plateau)',
      truss: 'تراس (Truss Rig)',
      church: 'كنيسة الملاك (Church)',
      free: 'لوكيشن حر (Free Location)'
    };

    grid.innerHTML = projects
      .map((p) => {
        const sc = (p.scenes && p.scenes[0]) || { items: [] };
        const fixCount = (sc.items || []).filter((i) => i.itemType === 'fixture').length;
        const camCount = (sc.items || []).filter((i) => i.itemType === 'camera').length;
        const dateStr = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '';
        const v = p.venueConfig || { width: 14, length: 10 };

        return `<div class="item-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
              <h3 style="font-size:1rem; font-weight:800;">${escapeHtml(p.name)}</h3>
              <span class="badge-tag">${typeLabels[p.venueType] || p.venueType}</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">
              الأبعاد: ${v.width}m × ${v.length}m • المشاهد: ${(p.scenes || []).length} • 💡 ${fixCount} كشاف • 🎥 ${camCount} كاميرا
            </p>
            <p style="font-size:0.74rem; color:var(--text-muted);">
              ${p.dop ? `DOP: ${escapeHtml(p.dop)} • ` : ''}آخر تحديث: ${dateStr}
            </p>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px; padding-top:10px; border-top:1px solid var(--border-subtle);">
            ${pPlot ? `<button type="button" class="btn btn-primary" style="flex:1;" onclick="CineApp.openProjectInWorkspace('${p.id}')">
              🚀 فتح المخطط (Open Plot)
            </button>` : ''}
            ${(pExport || pDmx || pCam) ? `<button type="button" class="btn btn-emerald" onclick="CineApp.openProjectReportsFromDashboard('${p.id}')" title="Open DMX / Camera / Export Sheets">
              📊 الشيتات والتقارير
            </button>` : ''}
            ${pExport ? `<button type="button" class="btn btn-cyan" onclick="CineApp.shareOrExportProjectJSON('${p.id}')" title="Share via WhatsApp / Download .json">
              📤 مشاركة (.json)
            </button>` : ''}
            ${pManageSaved ? `<button type="button" class="btn btn-secondary" onclick="CineApp.duplicateProject('${p.id}')" title="Duplicate">
              ⧉ نسخ
            </button>
            <button type="button" class="btn btn-secondary" onclick="CineApp.renameProjectPrompt('${p.id}')" title="Rename">
              ✎
            </button>
            <button type="button" class="btn btn-danger" onclick="CineApp.deleteProject('${p.id}')" title="Delete">
              🗑
            </button>` : ''}
          </div>
        </div>`;
      })
      .join('');
  }

  function openProjectReportsFromDashboard(projId) {
    const proj = (state.workspace.projects || []).find((p) => p.id === projId);
    if (!proj) return;
    state.activeProject = proj;
    state.activeProject._equipmentList = state.workspace.equipment;
    state.activeScene = (proj.scenes && proj.scenes.find((s) => s.id === proj.activeSceneId)) || (proj.scenes && proj.scenes[0]);
    if (state.activeScene) {
      global.CineLightDB.recalculateDMXAddresses(state.activeScene);
    }
    openReportsModal();
  }

  async function duplicateProject(projId) {
    const orig = (state.workspace.projects || []).find((p) => p.id === projId);
    if (!orig) return;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = 'proj_' + Date.now();
    copy.name = orig.name + ' (Copy)';
    copy.updatedAt = new Date().toISOString();
    state.workspace.projects.unshift(copy);
    await persistWorkspace();
    refreshDashboardAll();
    showToast('تم نسخ المشروع بنجاح / Project duplicated');
  }

  async function renameProjectPrompt(projId) {
    const proj = (state.workspace.projects || []).find((p) => p.id === projId);
    if (!proj) return;
    const nextName = prompt('أدخل الاسم الجديد للمشروع / Enter new project name:', proj.name);
    if (nextName && nextName.trim()) {
      proj.name = nextName.trim();
      proj.updatedAt = new Date().toISOString();
      await persistWorkspace();
      refreshDashboardAll();
    }
  }

  async function deleteProject(projId) {
    if (!confirm('هل أنت متأكد من حذف هذا المشروع؟ / Delete this project?')) return;
    state.workspace.projects = (state.workspace.projects || []).filter((p) => p.id !== projId);
    await persistWorkspace();
    refreshDashboardAll();
    showToast('تم حذف المشروع / Project deleted');
  }

  async function shareOrExportProjectJSON(projId) {
    const proj = (state.workspace.projects || []).find((p) => p.id === projId);
    if (!proj) return;
    const payload = {
      app: 'CineLight_DMX_Stage_Planner',
      version: '1.3',
      exportedAt: new Date().toISOString(),
      project: proj
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const safeFileName = (proj.name || 'cinelight_project').replace(/[^\w\u0600-\u06FF\-]+/g, '_') + '.json';

    if (navigator.canShare && window.File) {
      try {
        const file = new File([jsonStr], safeFileName, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: proj.name,
            text: `CineLight & DMX Project: ${proj.name}`,
            files: [file]
          });
          return;
        }
      } catch (err) {}
    }

    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    triggerDownloadBlob(blob, safeFileName);
    showToast('تم تحميل ملف المشروع (.json) لمشاركته عبر واتساب أو الإيميل');
  }

  function handleImportProjectFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const importedProj = parsed.project || parsed;
        if (!importedProj || !importedProj.scenes || !importedProj.venueConfig) {
          alert('ملف المشروع غير صالح / Invalid project JSON file.');
          return;
        }
        importedProj.id = 'proj_' + Date.now();
        importedProj.name = (importedProj.name || 'Imported Project') + ' (Imported)';
        importedProj.updatedAt = new Date().toISOString();
        state.workspace.projects.unshift(importedProj);
        await persistWorkspace();
        refreshDashboardAll();
        showToast('✅ تم استيراد المشروع بنجاح / Project imported successfully!');
      } catch (err) {
        alert('تعذر قراءة ملف JSON / Failed to parse JSON project file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // --- SECTION 3: قائمة المعدات (Equipment & Categories Manager) ---
  function renderEquipmentManagerSection() {
    const catBar = document.getElementById('eqCategoriesBar');
    const grid = document.getElementById('equipmentManagerGrid');
    if (!catBar || !grid || !state.workspace) return;

    const cats = state.workspace.categories || [];
    const eqList = state.workspace.equipment || [];

    catBar.innerHTML =
      `<div class="cat-pill ${state.activeEqCategoryFilter === 'all' ? 'active' : ''}" onclick="CineApp.filterEqManagerCategory('all')">
        🌟 الكل (All: ${eqList.length})
      </div>` +
      cats
        .map((c) => {
          const count = eqList.filter((e) => e.categoryId === c.id).length;
          const isActive = state.activeEqCategoryFilter === c.id;
          return `<div class="cat-pill ${isActive ? 'active' : ''}" onclick="CineApp.filterEqManagerCategory('${c.id}')">
            <span>${c.icon || '📁'} ${escapeHtml(c.nameAr)} (${escapeHtml(c.nameEn)}) [${count}]</span>
            <span style="margin-right:6px; opacity:0.8;" onclick="event.stopPropagation(); CineApp.openCategoryModal('${c.id}')" title="Edit Category">✎</span>
            <span style="opacity:0.8;" onclick="event.stopPropagation(); CineApp.deleteCategory('${c.id}')" title="Delete Category">🗑</span>
          </div>`;
        })
        .join('');

    const filtered = state.activeEqCategoryFilter === 'all'
      ? eqList
      : eqList.filter((e) => e.categoryId === state.activeEqCategoryFilter);

    grid.innerHTML = filtered
      .map((eq) => {
        const thumbUrl = global.CineLightVectors.generateEquipmentThumbnailDataURL(eq);
        const catObj = cats.find((c) => c.id === eq.categoryId);
        let specsHtml = '';
        if (eq.type === 'fixture') {
          specsHtml = `<span class="badge-tag">DMX: ${eq.footprint || 0} Ch</span>
            <span class="badge-tag badge-cyan">${eq.watts || 0}W</span>
            <span class="badge-tag">${escapeHtml(eq.defaultKelvin || '5600K')}</span>`;
        } else if (eq.type === 'lens') {
          specsHtml = `<span class="badge-tag badge-cyan">${eq.minMm === eq.maxMm ? `Prime ${eq.minMm}mm` : `Zoom ${eq.minMm}-${eq.maxMm}mm`}</span>
            <span class="badge-tag">${escapeHtml(eq.maxAperture || 'f/2.8')}</span>`;
        } else {
          specsHtml = `<span class="badge-tag">${escapeHtml(catObj ? catObj.nameEn : eq.type)}</span>`;
        }

        return `<div class="item-card" dir="ltr">
          <div class="eq-card-top">
            <img class="eq-thumb" src="${thumbUrl}" alt="${escapeHtml(eq.name)}" />
            <div style="flex:1;">
              <h4 style="font-size:0.95rem; font-weight:800; margin-bottom:4px;">${escapeHtml(eq.name)}</h4>
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:5px;">${specsHtml}</div>
              <p style="font-size:0.74rem; color:var(--text-muted);">${escapeHtml(eq.description || '')}</p>
            </div>
          </div>
          <div style="display:flex; gap:6px; justify-content:flex-end; border-top:1px solid var(--border-subtle); padding-top:8px;">
            <button type="button" class="btn btn-secondary" style="padding:5px 10px; font-size:0.76rem;" onclick="CineApp.openEquipmentModal('${eq.id}')">
              ✎ Edit / Upload Image
            </button>
            <button type="button" class="btn btn-danger" style="padding:5px 10px; font-size:0.76rem;" onclick="CineApp.deleteEquipmentItem('${eq.id}')">
              🗑 Delete
            </button>
          </div>
        </div>`;
      })
      .join('');
  }

  function filterEqManagerCategory(catId) {
    state.activeEqCategoryFilter = catId;
    renderEquipmentManagerSection();
  }

  function openCategoryModal(catId) {
    const cats = state.workspace.categories || [];
    const existing = catId ? cats.find((c) => c.id === catId) : null;
    document.getElementById('catCrudId').value = existing ? existing.id : '';
    document.getElementById('catCrudNameAr').value = existing ? existing.nameAr : '';
    document.getElementById('catCrudNameEn').value = existing ? existing.nameEn : '';
    document.getElementById('catCrudType').value = existing ? existing.type : 'fixture';
    document.getElementById('catCrudIcon').value = existing ? existing.icon || '📁' : '✨';
    openModal('categoryCrudModal');
  }

  async function saveCategoryCrud(e) {
    e.preventDefault();
    const id = document.getElementById('catCrudId').value;
    const nameAr = document.getElementById('catCrudNameAr').value.trim();
    const nameEn = document.getElementById('catCrudNameEn').value.trim();
    const type = document.getElementById('catCrudType').value;
    const icon = document.getElementById('catCrudIcon').value.trim() || '📁';

    if (id) {
      const cat = state.workspace.categories.find((c) => c.id === id);
      if (cat) {
        cat.nameAr = nameAr;
        cat.nameEn = nameEn;
        cat.type = type;
        cat.icon = icon;
      }
    } else {
      state.workspace.categories.push({
        id: 'cat_' + Date.now(),
        nameAr,
        nameEn,
        type,
        icon
      });
    }
    await persistWorkspace();
    closeModal('categoryCrudModal');
    renderEquipmentManagerSection();
    showToast('تم حفظ الفئة بنجاح / Category saved');
  }

  async function deleteCategory(catId) {
    if (!confirm('حذف هذه الفئة وجميع معداتها؟ / Delete this category and its items?')) return;
    state.workspace.categories = state.workspace.categories.filter((c) => c.id !== catId);
    state.workspace.equipment = state.workspace.equipment.filter((e) => e.categoryId !== catId);
    if (state.activeEqCategoryFilter === catId) state.activeEqCategoryFilter = 'all';
    await persistWorkspace();
    renderEquipmentManagerSection();
  }

  function openEquipmentModal(eqId) {
    const cats = state.workspace.categories || [];
    const catSelect = document.getElementById('eqCrudCategory');
    catSelect.innerHTML = cats
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nameEn)} (${escapeHtml(c.nameAr)})</option>`)
      .join('');

    const existing = eqId ? state.workspace.equipment.find((e) => e.id === eqId) : null;
    document.getElementById('eqCrudId').value = existing ? existing.id : '';
    document.getElementById('eqCrudCategory').value = existing
      ? existing.categoryId
      : state.activeEqCategoryFilter !== 'all'
      ? state.activeEqCategoryFilter
      : (cats[0] && cats[0].id) || 'cat_fixtures';

    document.getElementById('eqCrudName').value = existing ? existing.name : '';
    document.getElementById('eqCrudBadge').value = existing ? existing.badge || '' : '';
    document.getElementById('eqCrudVectorShape').value = existing ? existing.vectorShape || 'godox_sz200bi' : 'godox_sz200bi';
    document.getElementById('eqCrudFootprint').value = existing ? existing.footprint ?? 4 : 4;
    document.getElementById('eqCrudWatts').value = existing ? existing.watts ?? 200 : 200;
    document.getElementById('eqCrudKelvin').value = existing ? existing.defaultKelvin || '5600K' : '5600K';
    document.getElementById('eqCrudColor').value = existing && existing.defaultColor ? existing.defaultColor : '#fff3d6';
    document.getElementById('eqCrudMinMm').value = existing ? existing.minMm || 24 : 24;
    document.getElementById('eqCrudMaxMm').value = existing ? existing.maxMm || 70 : 70;
    document.getElementById('eqCrudAperture').value = existing ? existing.maxAperture || 'f/2.8' : 'f/2.8';
    document.getElementById('eqCrudDesc').value = existing ? existing.description || '' : '';
    document.getElementById('eqCrudImageInput').value = '';

    state.tempCustomImage = existing ? existing.customImage || null : null;
    updateEqImagePreviewUI();
    onEqCrudCategoryChange(document.getElementById('eqCrudCategory').value);
    openModal('equipmentCrudModal');
  }

  function onEqCrudCategoryChange(catId) {
    const cat = (state.workspace.categories || []).find((c) => c.id === catId);
    const type = cat ? cat.type : 'fixture';
    document.getElementById('eqCrudFixtureFields').classList.toggle('hidden', type !== 'fixture');
    document.getElementById('eqCrudLensFields').classList.toggle('hidden', type !== 'lens');
  }

  function handleEqImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const maxDim = 220;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        state.tempCustomImage = c.toDataURL('image/png');
        updateEqImagePreviewUI();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function clearEqCustomImage() {
    state.tempCustomImage = null;
    document.getElementById('eqCrudImageInput').value = '';
    updateEqImagePreviewUI();
  }

  function updateEqImagePreviewUI() {
    const row = document.getElementById('eqCrudImagePreviewRow');
    const img = document.getElementById('eqCrudPreviewImg');
    if (state.tempCustomImage) {
      img.src = state.tempCustomImage;
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  }

  async function saveEquipmentCrud(e) {
    e.preventDefault();
    const id = document.getElementById('eqCrudId').value;
    const categoryId = document.getElementById('eqCrudCategory').value;
    const cat = (state.workspace.categories || []).find((c) => c.id === categoryId);
    const type = cat ? cat.type : 'fixture';

    const name = document.getElementById('eqCrudName').value.trim();
    const badge = document.getElementById('eqCrudBadge').value.trim() || name.slice(0, 8);
    const vectorShape = document.getElementById('eqCrudVectorShape').value;
    const footprint = parseInt(document.getElementById('eqCrudFootprint').value, 10) || 0;
    const watts = parseFloat(document.getElementById('eqCrudWatts').value) || 0;
    const defaultKelvin = document.getElementById('eqCrudKelvin').value.trim() || '5600K';
    const defaultColor = document.getElementById('eqCrudColor').value || '#fff3d6';
    const minMm = parseInt(document.getElementById('eqCrudMinMm').value, 10) || 24;
    const maxMm = parseInt(document.getElementById('eqCrudMaxMm').value, 10) || 70;
    const maxAperture = document.getElementById('eqCrudAperture').value.trim() || 'f/2.8';
    const description = document.getElementById('eqCrudDesc').value.trim();

    const itemData = {
      id: id || 'eq_' + Date.now(),
      categoryId,
      type,
      name,
      badge,
      vectorShape,
      footprint,
      _userEditedFootprint: true,
      watts,
      defaultKelvin,
      defaultColor,
      minMm,
      maxMm,
      defaultMm: minMm,
      maxAperture,
      isPrime: minMm === maxMm,
      customImage: state.tempCustomImage,
      description,
      subtype: vectorShape.includes('person') || vectorShape.includes('presenter') || vectorShape.includes('choir')
        ? 'subject'
        : vectorShape.startsWith('tripod_')
        ? 'camera_tripod'
        : vectorShape.startsWith('stand_')
        ? 'lighting_stand'
        : 'prop'
    };

    if (id) {
      const idx = state.workspace.equipment.findIndex((x) => x.id === id);
      if (idx !== -1) {
        state.workspace.equipment[idx] = Object.assign({}, state.workspace.equipment[idx], itemData);
      }
    } else {
      state.workspace.equipment.push(itemData);
    }

    await persistWorkspace();
    closeModal('equipmentCrudModal');
    renderEquipmentManagerSection();
    if (state.activeProject) {
      renderWorkspaceEquipmentDrawer();
      state.canvasEngine.requestRender();
    }
    showToast('✅ تم حفظ المعدة بنجاح / Equipment saved');
  }

  async function deleteEquipmentItem(eqId) {
    if (!confirm('حذف هذه المعدة من قاعدة البيانات؟ / Delete this equipment item?')) return;
    state.workspace.equipment = state.workspace.equipment.filter((e) => e.id !== eqId);
    await persistWorkspace();
    renderEquipmentManagerSection();
  }

  // --- SECTION 4: قائمة الأماكن (Venues / Locations Manager) ---
  function renderVenuesManagerSection() {
    const grid = document.getElementById('venuesManagerGrid');
    if (!grid || !state.workspace) return;
    const venues = state.workspace.venues || [];

    const typeNames = {
      plateau: '1. بلاتوه (شبكة مواسير سقف)',
      truss: '2. تراس (هيكل حديدي)',
      church: '3. كنيسة الملاك',
      free: '4. لوكيشن حر مفتوح'
    };

    grid.innerHTML = venues
      .map((v) => {
        let extraDetails = '';
        if (v.type === 'plateau' && v.gridConfig) {
          const hCount = (v.gridConfig.horizontalPipes || []).length;
          const vCount = (v.gridConfig.verticalPipes || []).length;
          extraDetails = `الشبكة العلوية: ${hCount} مواسير بالعرض × ${vCount} مواسير بالطول (التثبيت المغناطيسي مفعل)`;
        } else if (v.type === 'truss' && v.trussConfig) {
          const cbCount = (v.trussConfig.crossbars || []).length;
          const thk = v.trussConfig.trussThickness || 1.0;
          const shapeAr = { straight: 'مستقيم', 'l-shape': 'حرف L', 'u-shape': 'حرف U', box: 'مربع مغلق' }[v.trussConfig.shape || 'box'] || 'مربع';
          extraDetails = `شكل التراس: ${shapeAr} • سمك الحديد: ${thk} • مواسير قاطعة: ${cbCount}`;
        } else if (v.type === 'church' && v.churchConfig) {
          const pRows = v.churchConfig.pewRows ?? 6;
          const pGap = v.churchConfig.pewGap ?? 1.8;
          const pOff = v.churchConfig.pewAltarOffset ?? 1.8;
          extraDetails = `عمق الهيكل: ${v.churchConfig.sanctuaryDepth} متر • الكراسي: ${pRows} صفوف (المسافة ${pGap} متر • البُعد عن الهيكل ${pOff} متر) • الأعمدة: ${v.churchConfig.columnsPerSide} لكل جانب`;
        } else {
          extraDetails = `أرضية مفتوحة مقسمة بالمتر`;
        }

        return `<div class="item-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
              <h3 style="font-size:1rem; font-weight:800;">${escapeHtml(v.name)}</h3>
              <span class="badge-tag badge-cyan">${typeNames[v.type] || v.type}</span>
            </div>
            <p style="font-size:0.84rem; color:var(--accent-amber); font-weight:700; margin-bottom:6px;">
              المقاسات: العرض ${v.width} متر × الطول ${v.length} متر × الارتفاع ${v.height || 4.5} متر
            </p>
            <p style="font-size:0.78rem; color:var(--text-muted);">${extraDetails}</p>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; border-top:1px solid var(--border-subtle); padding-top:10px;">
            <button type="button" class="btn btn-primary" onclick="CineApp.useVenueForNewProject('${v.id}')">
              🚀 مشروع جديد بهذا المكان
            </button>
            <button type="button" class="btn btn-secondary" onclick="CineApp.openVenueModal('${v.id}', false)">
              ✎ تعديل المقاسات والمسافات
            </button>
            <button type="button" class="btn btn-danger" onclick="CineApp.deleteVenueTemplate('${v.id}')">
              🗑
            </button>
          </div>
        </div>`;
      })
      .join('');
  }

  function useVenueForNewProject(venueId) {
    switchDashboardSection('new_project');
    const sel = document.getElementById('newProjVenueSelect');
    if (sel) {
      sel.value = venueId;
      onNewProjVenueTemplateChange(venueId);
    }
    document.getElementById('newProjName').focus();
  }

  function openVenueModal(venueId, isLiveProject = false) {
    document.getElementById('venueCrudIsLiveProject').value = isLiveProject ? 'true' : 'false';
    let v = null;
    if (isLiveProject && state.activeProject) {
      v = state.activeProject.venueConfig;
    } else if (venueId) {
      v = (state.workspace.venues || []).find((x) => x.id === venueId);
    }

    document.getElementById('venueCrudId').value = v ? v.id : '';
    document.getElementById('venueCrudName').value = v ? v.name : 'بلاتوه / مكان جديد';
    document.getElementById('venueCrudType').value = v ? v.type : 'plateau';
    document.getElementById('venueCrudWidth').value = v ? v.width : 14;
    document.getElementById('venueCrudLength').value = v ? v.length : 10;
    document.getElementById('venueCrudHeight').value = v ? v.height || 4.5 : 4.5;

    const gc = (v && v.gridConfig) || { horizontalPipes: [1.5, 3.0, 4.5, 6.0, 7.5], verticalPipes: [2.0, 4.0, 6.0, 8.0, 10.0, 12.0] };
    document.getElementById('venueHorizontalPipes').value = (gc.horizontalPipes || []).join(', ');
    document.getElementById('venueVerticalPipes').value = (gc.verticalPipes || []).join(', ');

    const tc = (v && v.trussConfig) || { shape: 'box', trussWidth: 9, trussDepth: 6.5, trussThickness: 1.0, crossbars: [] };
    document.getElementById('venueTrussShape').value = tc.shape || 'box';
    document.getElementById('venueTrussWidth').value = tc.trussWidth || 9;
    document.getElementById('venueTrussDepth').value = tc.trussDepth || 6.5;
    const thk = tc.trussThickness || 1.0;
    document.getElementById('venueTrussThickness').value = thk;
    document.getElementById('venueTrussThicknessVal').textContent = thk + 'x';
    state.tempCrossbars = JSON.parse(JSON.stringify(tc.crossbars || []));
    renderTrussCrossbarsEditor();

    const cc = (v && v.churchConfig) || {
      sanctuaryDepth: 5.0,
      columnsPerSide: 5,
      sideAisleOffset: 2.6,
      centerAisleWidth: 2.4,
      pewRows: 6,
      pewGap: 1.8,
      pewAltarOffset: 1.8,
      mountPipesY: [3.5, 6.5, 10.5, 14.5, 18.5]
    };
    document.getElementById('venueChurchSancDepth').value = cc.sanctuaryDepth ?? 5.0;
    document.getElementById('venueChurchCols').value = cc.columnsPerSide ?? 5;
    document.getElementById('venueChurchColOffset').value = cc.sideAisleOffset ?? 2.6;
    document.getElementById('venueChurchAisleW').value = cc.centerAisleWidth ?? 2.4;
    const pewRowsEl = document.getElementById('venueChurchPewRows');
    const pewGapEl = document.getElementById('venueChurchPewGap');
    const pewOffsetEl = document.getElementById('venueChurchPewAltarOffset');
    if (pewRowsEl) pewRowsEl.value = cc.pewRows ?? 6;
    if (pewGapEl) pewGapEl.value = cc.pewGap ?? 1.8;
    if (pewOffsetEl) pewOffsetEl.value = cc.pewAltarOffset ?? 1.8;
    document.getElementById('venueChurchMountPipes').value = (cc.mountPipesY || []).join(', ');

    onVenueCrudTypeChange(document.getElementById('venueCrudType').value);
    openModal('venueCrudModal');
  }

  function onVenueCrudTypeChange(type) {
    document.getElementById('venuePlateauBox').classList.toggle('hidden', type !== 'plateau');
    document.getElementById('venueTrussBox').classList.toggle('hidden', type !== 'truss');
    document.getElementById('venueChurchBox').classList.toggle('hidden', type !== 'church');
  }

  function autoSpacePlateauPipes() {
    const w = parseFloat(document.getElementById('venueCrudWidth').value) || 14;
    const l = parseFloat(document.getElementById('venueCrudLength').value) || 10;
    const grid = buildAutoGridPipes(w, l);
    document.getElementById('venueHorizontalPipes').value = grid.horizontalPipes.join(', ');
    document.getElementById('venueVerticalPipes').value = grid.verticalPipes.join(', ');
  }

  function renderTrussCrossbarsEditor() {
    const container = document.getElementById('venueTrussCrossbarsList');
    if (!container) return;
    if (!state.tempCrossbars.length) {
      container.innerHTML = `<div style="font-size:0.76rem; color:var(--text-muted); padding:4px;">لا توجد مواسير إضافية حالياً. اضغط "+ إضافة ماسورة بالعرض / بالطول" بالأعلى.</div>`;
      return;
    }
    container.innerHTML = state.tempCrossbars
      .map(
        (cb, idx) => `<div style="display:flex; gap:6px; align-items:center;">
          <span class="badge-tag ${cb.orientation === 'horizontal' ? '' : 'badge-cyan'}" style="min-width:110px; text-align:center;">
            ${cb.orientation === 'horizontal' ? '━ ماسورة بالعرض' : '┃ ماسورة بالطول'}
          </span>
          <input type="text" class="form-control" style="padding:5px 8px; font-size:0.8rem;" value="${escapeHtml(cb.label || '')}" placeholder="اسم الماسورة" oninput="CineApp.updateTrussCrossbarField(${idx}, 'label', this.value)" />
          <input type="number" step="any" class="form-control" style="width:90px; padding:5px 8px; font-size:0.8rem;" value="${cb.position || 2.0}" title="المسافة بالمتر" oninput="CineApp.updateTrussCrossbarField(${idx}, 'position', this.value)" />
          <span style="font-size:0.75rem; color:var(--text-muted);">متر</span>
          <button type="button" class="btn btn-danger" style="padding:4px 8px;" onclick="CineApp.removeTrussCrossbarRow(${idx})">✕</button>
        </div>`
      )
      .join('');
  }

  function addTrussCrossbarRow(orientation) {
    const idx = state.tempCrossbars.length + 1;
    state.tempCrossbars.push({
      id: 'cb_' + Date.now() + '_' + idx,
      orientation,
      position: +(idx * 1.8).toFixed(1),
      label: (orientation === 'horizontal' ? 'عارضة ' : 'طولية ') + idx
    });
    renderTrussCrossbarsEditor();
  }

  function updateTrussCrossbarField(idx, field, val) {
    if (!state.tempCrossbars[idx]) return;
    state.tempCrossbars[idx][field] = field === 'position' ? parseFloat(val) || 0 : val;
  }

  function removeTrussCrossbarRow(idx) {
    state.tempCrossbars.splice(idx, 1);
    renderTrussCrossbarsEditor();
  }

  async function saveVenueCrud(e) {
    e.preventDefault();
    const isLive = document.getElementById('venueCrudIsLiveProject').value === 'true';
    const id = document.getElementById('venueCrudId').value || 'venue_' + Date.now();
    const name = document.getElementById('venueCrudName').value.trim();
    const type = document.getElementById('venueCrudType').value;
    const width = parseFloat(document.getElementById('venueCrudWidth').value) || 14;
    const length = parseFloat(document.getElementById('venueCrudLength').value) || 10;
    const height = parseFloat(document.getElementById('venueCrudHeight').value) || 4.5;

    const parseNumArray = (str) =>
      (str || '')
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);

    const venueObj = {
      id,
      name,
      type,
      width,
      length,
      height,
      snapRadius: 0.48,
      gridConfig: {
        mode: 'custom',
        horizontalPipes: parseNumArray(document.getElementById('venueHorizontalPipes').value),
        verticalPipes: parseNumArray(document.getElementById('venueVerticalPipes').value)
      },
      trussConfig: {
        shape: document.getElementById('venueTrussShape').value,
        trussWidth: parseFloat(document.getElementById('venueTrussWidth').value) || width - 3,
        trussDepth: parseFloat(document.getElementById('venueTrussDepth').value) || length - 2.5,
        trimHeight: height - 0.3,
        trussThickness: parseFloat(document.getElementById('venueTrussThickness').value) || 1.0,
        crossbars: JSON.parse(JSON.stringify(state.tempCrossbars))
      },
      churchConfig: {
        sanctuaryDepth: parseFloat(document.getElementById('venueChurchSancDepth').value) || 5.0,
        sanctuaryElevation: 0.6,
        columnsPerSide: parseInt(document.getElementById('venueChurchCols').value, 10) >= 0 ? parseInt(document.getElementById('venueChurchCols').value, 10) : 5,
        sideAisleOffset: parseFloat(document.getElementById('venueChurchColOffset').value) || 2.6,
        centerAisleWidth: parseFloat(document.getElementById('venueChurchAisleW').value) || 2.4,
        pewRows: Math.max(0, parseInt(document.getElementById('venueChurchPewRows')?.value ?? '6', 10)),
        pewGap: Math.max(0.4, parseFloat(document.getElementById('venueChurchPewGap')?.value) || 1.8),
        pewAltarOffset: Math.max(0.2, parseFloat(document.getElementById('venueChurchPewAltarOffset')?.value ?? '1.8')),
        mountPipesY: parseNumArray(document.getElementById('venueChurchMountPipes').value)
      }
    };

    if (isLive && state.activeProject) {
      state.activeProject.venueConfig = venueObj;
      state.activeProject.venueType = type;
      state.activeProject.venueName = name;
      state.activeProject.updatedAt = new Date().toISOString();
      const savedIdx = (state.workspace.venues || []).findIndex((v) => v.id === id);
      if (savedIdx !== -1) {
        state.workspace.venues[savedIdx] = JSON.parse(JSON.stringify(venueObj));
      }
      await persistWorkspace();
      closeModal('venueCrudModal');
      if (state.canvasEngine) {
        state.canvasEngine.invalidateVenueCache();
        state.canvasEngine.fitToScreen();
      }
      if (global.ShamsThreeView?.active) {
        global.ShamsThreeView.rebuildScene();
      }
      showToast('✅ تم تحديث أبعاد المكان وإعدادات الكراسي والمواسير / Venue updated');
      return;
    }

    const existingIdx = (state.workspace.venues || []).findIndex((v) => v.id === id);
    if (existingIdx !== -1) {
      state.workspace.venues[existingIdx] = venueObj;
    } else {
      state.workspace.venues.push(venueObj);
    }

    await persistWorkspace();
    closeModal('venueCrudModal');
    refreshDashboardAll();
    showToast('✅ تم حفظ المكان في قائمة الأماكن / Venue template saved');
  }

  async function deleteVenueTemplate(venueId) {
    if ((state.workspace.venues || []).length <= 1) {
      alert('يجب الإبقاء على مكان واحد على الأقل في القائمة.');
      return;
    }
    if (!confirm('حذف هذا المكان من قائمة الأماكن؟')) return;
    state.workspace.venues = state.workspace.venues.filter((v) => v.id !== venueId);
    await persistWorkspace();
    refreshDashboardAll();
  }

  function openLiveVenueEditor() {
    if (!state.activeProject) return;
    if (!canAccess('venuesManager')) {
      showToast('🔒 غير مصرح لك بتعديل الأماكن / Permission required: Venues Manager');
      return;
    }
    openVenueModal(state.activeProject.venueConfig.id, true);
  }

  // --- SECTION 5: إدارة المستخدمين وصلاحيات الأقسام (Admin Users & Permissions Manager inside Settings) ---
  const PERMISSION_GROUPS = [
    { id: 'dash', title: '🏠 الأقسام الرئيسية والمشروع الورقي (Dashboard & Paper Project)' },
    { id: 'workspace', title: '🎬 مساحة العمل والـ 2D / 3D والأدوات (Workspace Tools)' },
    { id: 'reports', title: '📊 التقارير والتصدير والإعدادات (Exports & App Settings)' },
    { id: 'st_only', title: '🎨 Creative Look ST' }
  ];

  const PERMISSION_META = [
    // Group 1: Dashboard & Paper Project
    { key: 'newProjectVenues', group: 'dash', labelEn: '1. مشروع جديد', labelAr: 'إنشاء مشاريع جديدة (New Project)' },
    { key: 'savedProjects', group: 'dash', labelEn: '2. سجل المشاريع', labelAr: 'عرض وفتح سجل المشاريع المحفوظة' },
    { key: 'manageSavedProjects', group: 'dash', labelEn: 'إدارة المشاريع', labelAr: 'نسخ / تسمية / حذف / استيراد المشاريع' },
    { key: 'equipmentManager', group: 'dash', labelEn: '3. قائمة المعدات', labelAr: 'إضافة وتعديل وحذف المعدات والفئات' },
    { key: 'venuesManager', group: 'dash', labelEn: '4. قائمة الأماكن', labelAr: 'تعديل مقاسات البلاتوه والتراس والكنيسة' },
    { key: 'paperProject', group: 'dash', labelEn: '5. المشروع الورقي', labelAr: 'فتح وإدارة قسم المشروع الورقي السريع' },
    { key: 'paperLightSheet', group: 'dash', labelEn: 'ورقي: ورقة Light', labelAr: 'تعديل ورقة الإضاءة والكاميرات بالمشروع الورقي' },
    { key: 'paperDmxSheet', group: 'dash', labelEn: 'ورقي: ورقة DMX', labelAr: 'تعديل ورقة الـ DMX والمخارج A/B بالمشروع الورقي' },

    // Group 2: Workspace & 2D/3D Tools
    { key: 'stagePlotCanvas', group: 'workspace', labelEn: 'شاشة المخطط 2D', labelAr: 'فتح الرسم والبلان وتحريك المعدات والمشاهد' },
    { key: 'view3dMode', group: 'workspace', labelEn: 'منظور 3D View', labelAr: 'فتح العرض ثلاثي الأبعاد والتحكم بالاضاءة في 3D' },
    { key: 'dmxPatching', group: 'workspace', labelEn: 'حسابات وكابلات DMX', labelAr: 'تعديل Channel / Light Number والأدريس وكابلات DMX' },
    { key: 'cameraSettings', group: 'workspace', labelEn: 'إعدادات الكاميرات والعدسات', labelAr: 'الكاميرات والعدسات' },
    { key: 'aimAndAlignTools', group: 'workspace', labelEn: 'لوحة التوجيه والمحاذاة', labelAr: 'الأسهم Aim Pad والمحاذاة وتوحيد الزاوية والشعاع' },
    { key: 'showInfoAndDisplay', group: 'workspace', labelEn: 'Show Info & Display', labelAr: 'إظهار البيانات على المخطط ووضع العرض الكامل' },
    { key: 'powerLoadMonitor', group: 'workspace', labelEn: 'عداد الكهرباء والأمبير', labelAr: 'مؤشر الأحمال الكهربائية والإنذار لكل خط' },
    { key: 'projectSettingsGear', group: 'workspace', labelEn: 'إعدادات المشروع', labelAr: 'ترس إعدادات المخطط وتثبيت الأدوات و Undo/Redo' },

    // Group 3: Exports & App Settings
    { key: 'exportReports', group: 'reports', labelEn: 'التقارير والطباعة والتصدير', labelAr: 'طباعة و Word و Excel و PNG/JPG ومشاركة JSON' },
    { key: 'appGeneralSettings', group: 'reports', labelEn: 'الإعدادات العامة (⚙️)', labelAr: 'اللوجو، سعة الأمبير، ألوان DMX، والنسخ الاحتياطي' },

    // Group 4 (Bottom Standalone): Creative Look ST
    { key: 'paperCameraStLook', group: 'st_only', labelEn: 'Creative Look ST', labelAr: 'إظهار وتعديل خانة ST للكاميرا' }
  ];

  function buildGroupedPermissionsHTML(perms, onChangeBuilder) {
    return PERMISSION_GROUPS.map((grp) => {
      const items = PERMISSION_META.filter((pm) => pm.group === grp.id);
      const isStOnly = grp.id === 'st_only';
      const boxStyle = isStOnly
        ? 'background:rgba(56,189,248,0.1); border:1.5px solid var(--accent-cyan); border-radius:8px; padding:9px 11px;'
        : 'background:rgba(15,23,42,0.35); border:1px solid var(--border-subtle); border-radius:8px; padding:8px 10px;';
      const titleColor = isStOnly ? 'var(--accent-cyan)' : 'var(--accent-amber)';
      return `<div style="${boxStyle}">
        <div style="font-size:0.75rem; font-weight:800; color:${titleColor}; margin-bottom:6px; border-bottom:1px solid var(--border-subtle); padding-bottom:4px;">
          ${grp.title}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:6px 10px;">
          ${items
            .map((pm) => {
              const checked = perms[pm.key] !== false ? 'checked' : '';
              const extraAttr = onChangeBuilder ? onChangeBuilder(pm) : `id="perm_${pm.key}"`;
              return `<label style="display:flex; align-items:flex-start; gap:7px; font-size:0.77rem; cursor:pointer; line-height:1.3;">
                <input type="checkbox" ${extraAttr} ${checked} style="width:15px; height:15px; margin-top:2px; flex-shrink:0; accent-color:var(--accent-amber);" />
                <span><strong>${pm.labelEn}</strong> <span style="color:var(--text-muted); font-size:0.72rem;">(${pm.labelAr})</span></span>
              </label>`;
            })
            .join('')}
        </div>
      </div>`;
    }).join('');
  }

  async function renderUsersManagerSection() {
    const grid = document.getElementById('usersManagerGrid');
    if (!grid) return;
    const allUsers = await global.CineLightDB.getAllUsers();
    const countEl = document.getElementById('usersTotalCount');
    if (countEl) countEl.textContent = allUsers.length;

    const defPerms = global.CineLightDB.getDefaultPermissions();

    grid.innerHTML = allUsers
      .map((u) => {
        const uKey = u.key || global.CineLightDB.normalizeUserKey(u.username);
        const isPrimaryAdmin = uKey === 'gerges';
        const isAdm = u.role === 'Admin' || isPrimaryAdmin;
        const perms = Object.assign({}, defPerms, u.permissions || {});

        const permsCheckboxesHtml = isAdm
          ? `<div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.35); border-radius:8px; padding:10px; font-size:0.8rem; color:var(--accent-emerald); font-weight:700;">
              👑 حساب Admin: يمتلك صلاحيات مطلقة وكاملة لجميع الأقسام وإدارة المستخدمين.
            </div>`
          : `<div style="background:var(--bg-input); border:1px solid var(--border-subtle); border-radius:8px; padding:8px; display:flex; flex-direction:column; gap:6px; max-height:260px; overflow-y:auto;">
              ${buildGroupedPermissionsHTML(
                perms,
                (pm) => `onchange="CineApp.onUserCardPermToggle('${escapeHtml(uKey)}', '${pm.key}', this.checked)"`
              )}
            </div>`;

        return `<div class="item-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
              <div>
                <h3 style="font-size:1rem; font-weight:800;">${escapeHtml(u.username)}</h3>
                <span style="font-size:0.76rem; color:var(--text-muted);">${escapeHtml(u.displayName || u.username)}</span>
              </div>
              <span class="badge-tag ${isAdm ? '' : 'badge-cyan'}">${isAdm ? 'Admin' : '👤 Regular User'}</span>
            </div>

            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
              <label style="font-size:0.76rem; color:var(--text-muted);">Role:</label>
              <select class="form-control" style="padding:4px 8px; font-size:0.78rem; flex:1;" ${isPrimaryAdmin ? 'disabled' : ''}
                onchange="CineApp.onUserCardRoleChange('${escapeHtml(uKey)}', this.value)">
                <option value="Regular User" ${!isAdm ? 'selected' : ''}>Regular User (مستخدم عادي)</option>
                <option value="Admin" ${isAdm ? 'selected' : ''}>Admin (مدير)</option>
              </select>
            </div>

            ${permsCheckboxesHtml}
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px; border-top:1px solid var(--border-subtle); padding-top:10px;">
            <button type="button" class="btn btn-secondary" style="flex:1; font-size:0.76rem;" onclick="CineApp.openUserCrudModal('${escapeHtml(uKey)}')">
              ✎ تعديل الصلاحيات
            </button>
            <button type="button" class="btn btn-cyan" style="font-size:0.76rem;" onclick="CineApp.openChangePasswordModal('${escapeHtml(uKey)}')">
              🔑 تغيير الباسورد
            </button>
            ${!isPrimaryAdmin ? `<button type="button" class="btn btn-danger" style="font-size:0.76rem;" onclick="CineApp.deleteUserAccount('${escapeHtml(uKey)}')">
              🗑 حذف
            </button>` : ''}
          </div>
        </div>`;
      })
      .join('');
  }

  function setAllUserModalPerms(checked) {
    PERMISSION_META.forEach((pm) => {
      const chk = document.getElementById('perm_' + pm.key);
      if (chk) chk.checked = !!checked;
    });
  }

  async function onUserCardPermToggle(userKey, permKey, isChecked) {
    if (!isAdminUser()) return;
    const allUsers = await global.CineLightDB.getAllUsers();
    const target = allUsers.find((u) => (u.key || global.CineLightDB.normalizeUserKey(u.username)) === userKey);
    if (!target) return;
    const nextPerms = Object.assign({}, global.CineLightDB.getDefaultPermissions(), target.permissions || {});
    nextPerms[permKey] = !!isChecked;
    await global.CineLightDB.adminUpdateUser(userKey, { permissions: nextPerms });
    showToast(`✅ تم تحديث صلاحيات ${target.username}`);
  }

  async function onUserCardRoleChange(userKey, newRole) {
    if (!isAdminUser()) return;
    const res = await global.CineLightDB.adminUpdateUser(userKey, { role: newRole });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    await renderUsersManagerSection();
    showToast(`✅ تم تغيير نوع حساب ${res.user.username} إلى ${res.user.role}`);
  }

  async function openUserCrudModal(userKey) {
    if (!isAdminUser()) return;
    const errEl = document.getElementById('userCrudErrorMsg');
    if (errEl) errEl.classList.add('hidden');

    let existing = null;
    if (userKey) {
      const allUsers = await global.CineLightDB.getAllUsers();
      existing = allUsers.find((u) => (u.key || global.CineLightDB.normalizeUserKey(u.username)) === userKey);
    }

    document.getElementById('userCrudExistingKey').value = existing ? existing.key : '';
    const uInput = document.getElementById('userCrudUsername');
    uInput.value = existing ? existing.username : '';
    uInput.readOnly = !!existing;

    document.getElementById('userCrudDisplayName').value = existing ? existing.displayName || existing.username : '';
    const pInput = document.getElementById('userCrudPassword');
    pInput.value = '';
    pInput.required = !existing;
    document.getElementById('userCrudPasswordLabel').textContent = existing
      ? 'كلمة مرور جديدة (اختياري - اتركها فارغة للإبقاء على الحالية)'
      : 'كلمة المرور (Password)';

    const roleSel = document.getElementById('userCrudRole');
    roleSel.value = existing ? existing.role : 'Regular User';
    roleSel.disabled = !!(existing && existing.key === 'gerges');

    const perms = Object.assign({}, global.CineLightDB.getDefaultPermissions(), (existing && existing.permissions) || {});
    const checklistHost = document.getElementById('userCrudPermChecklist');
    if (checklistHost) {
      checklistHost.innerHTML = buildGroupedPermissionsHTML(perms, null);
    }

    onUserCrudRoleChange(roleSel.value);
    openModal('userCrudModal');
  }

  function onUserCrudRoleChange(roleVal) {
    const box = document.getElementById('userCrudPermissionsBox');
    if (box) box.classList.toggle('hidden', roleVal === 'Admin');
  }

  async function saveUserCrud(e) {
    e.preventDefault();
    if (!isAdminUser()) return;

    const existingKey = document.getElementById('userCrudExistingKey').value.trim();
    const username = document.getElementById('userCrudUsername').value.trim();
    const displayName = document.getElementById('userCrudDisplayName').value.trim() || username;
    const password = document.getElementById('userCrudPassword').value;
    const role = document.getElementById('userCrudRole').value;
    const errEl = document.getElementById('userCrudErrorMsg');

    const permissions = {};
    PERMISSION_META.forEach((pm) => {
      const chk = document.getElementById('perm_' + pm.key);
      permissions[pm.key] = chk ? !!chk.checked : true;
    });

    let res;
    if (existingKey) {
      res = await global.CineLightDB.adminUpdateUser(existingKey, {
        displayName,
        password,
        role,
        permissions
      });
    } else {
      res = await global.CineLightDB.adminCreateUser({
        username,
        displayName,
        password,
        role,
        permissions
      });
    }

    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.remove('hidden');
      return;
    }

    errEl.classList.add('hidden');
    closeModal('userCrudModal');
    await renderUsersManagerSection();
    showToast(`✅ تم حفظ حساب وصلاحيات ${res.user.username} بنجاح`);
  }

  async function deleteUserAccount(userKey) {
    if (!isAdminUser()) return;
    if (userKey === 'gerges') {
      alert('لا يمكن حذف حساب المدير الرئيسي gerges.');
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ / Delete this user account?')) return;
    const res = await global.CineLightDB.adminDeleteUser(userKey);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    await renderUsersManagerSection();
    showToast('🗑 تم حذف حساب المستخدم بنجاح');
  }

  async function openChangePasswordModal(targetUserKey) {
    if (!state.currentUser) return;
    const isAdm = isAdminUser();
    const myKey = state.currentUser.key || global.CineLightDB.normalizeUserKey(state.currentUser.username);
    const effectiveKey = targetUserKey || myKey;

    const allUsers = await global.CineLightDB.getAllUsers();
    const targetUser = allUsers.find((u) => (u.key || global.CineLightDB.normalizeUserKey(u.username)) === effectiveKey) || state.currentUser;

    document.getElementById('changePassTargetKey').value = effectiveKey;
    document.getElementById('changePassUserLabel').textContent = `الحساب: ${targetUser.username} (${targetUser.role})`;
    document.getElementById('changePassCurrentInput').value = '';
    document.getElementById('changePassNewInput').value = '';
    document.getElementById('changePassErrorMsg').classList.add('hidden');

    // Admin can reset any password directly without needing old password; regular user changing own password enters current password
    const currentGroup = document.getElementById('changePassCurrentGroup');
    const currentInput = document.getElementById('changePassCurrentInput');
    if (isAdm) {
      currentGroup.classList.add('hidden');
      currentInput.required = false;
    } else {
      currentGroup.classList.remove('hidden');
      currentInput.required = true;
    }

    openModal('changePasswordModal');
  }

  async function saveChangePassword(e) {
    e.preventDefault();
    if (!state.currentUser) return;
    const targetKey = document.getElementById('changePassTargetKey').value;
    const currentPass = document.getElementById('changePassCurrentInput').value;
    const newPass = document.getElementById('changePassNewInput').value;
    const errEl = document.getElementById('changePassErrorMsg');
    const isAdm = isAdminUser();

    const res = await global.CineLightDB.changeUserPassword(targetKey, currentPass, newPass, isAdm);
    if (!res.ok) {
      errEl.textContent = res.error;
      errEl.classList.remove('hidden');
      return;
    }

    if (targetKey === (state.currentUser.key || global.CineLightDB.normalizeUserKey(state.currentUser.username))) {
      state.currentUser = res.user;
    }
    errEl.classList.add('hidden');
    closeModal('changePasswordModal');
    if (isAdm) {
      await renderUsersManagerSection();
    }
    showToast(`🔑 تم تغيير كلمة المرور لحساب ${res.user.username} بنجاح`);
  }

  // ==========================================================================
  // 4. INTERACTIVE STAGE PLANNER WORKSPACE CONTROLLER
  // ==========================================================================
  function openProjectInWorkspace(projectId) {
    if (!canAccess('stagePlotCanvas')) {
      showToast('🔒 غير مصرح لك بفتح شاشة الرسم والبلان / Permission required: Stage & Lighting Plot Canvas');
      return;
    }
    const proj = (state.workspace.projects || []).find((p) => p.id === projectId);
    if (!proj) return;

    state.activeProject = proj;
    state.activeProject._equipmentList = state.workspace.equipment;

    // Ensure showInfoFlags defaults for newly added checkboxes & disable auto-showing Address/Channel/Fixture# unless explicitly enabled
    if (!proj.showInfoFlags) proj.showInfoFlags = {};
    if (proj.showInfoFlags.lightBeam === undefined) proj.showInfoFlags.lightBeam = true;
    if (proj.showInfoFlags.cameraCone === undefined) proj.showInfoFlags.cameraCone = true;
    if (proj.showInfoFlags.fixtureName === undefined) proj.showInfoFlags.fixtureName = false;
    if (!proj._v2CleanInfoFlags) {
      proj.showInfoFlags.fixtureNum = false;
      proj.showInfoFlags.channel = false;
      proj.showInfoFlags.address = false;
      proj._v2CleanInfoFlags = true;
    }

    if (!proj.scenes || !proj.scenes.length) {
      proj.scenes = [{ id: 'scene_' + Date.now(), name: 'Scene 1', customDmxCables: [], items: [] }];
    }
    state.activeScene = proj.scenes.find((s) => s.id === proj.activeSceneId) || proj.scenes[0];
    proj.activeSceneId = state.activeScene.id;
    if (!Array.isArray(state.activeScene.customDmxCables)) {
      state.activeScene.customDmxCables = [];
    }

    global.CineLightDB.recalculateDMXAddresses(state.activeScene);

    showScreen('workspaceScreen');
    document.getElementById('activeProjectTitleBadge').textContent = proj.name;
    try {
      global.ShamsThreeView?.init();
    } catch (e) {}

    if (!state.canvasEngine) {
      const canvasEl = document.getElementById('stageCanvas');
      state.canvasEngine = new global.StageCanvasEngine(canvasEl, {
        onSelectionChange: (item, isUnlocked, dpadVisible) => updateLeftAimDpadUI(item, isUnlocked, dpadVisible),
        onItemUpdated: (item, shouldPersist) => {
          updateLeftAimDpadUI(item, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
          updatePowerLoadUI();
          if (shouldPersist) {
            state.activeProject.updatedAt = new Date().toISOString();
            persistWorkspace();
          }
        },
        onOpenModal: (item) => openItemSettingsModal(item),
        onCablesChanged: () => {
          state.activeProject.updatedAt = new Date().toISOString();
          persistWorkspace();
        },
        onCableSelected: (cable) => {
          const delBtn = document.getElementById('deleteSelectedCableBtn');
          if (delBtn) delBtn.classList.toggle('hidden', !cable);
        },
        onHistoryCheckpoint: (lbl) => {
          global.ShamsWorkspaceUI?.checkpoint(lbl);
          if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
        },
        onToast: (msg) => showToast(msg)
      });
    }

    setWorkspaceUpperHidden(false);

    state.canvasEngine.setTheme(state.theme);
    state.canvasEngine.resize();
    state.canvasEngine.setProjectAndScene(state.activeProject, state.activeScene);
    state.canvasEngine.selectItem(null, false, false);
    state.canvasEngine.fitToScreen();
    requestAnimationFrame(() => {
      if (state.canvasEngine) {
        state.canvasEngine.resize();
        state.canvasEngine.fitToScreen();
      }
    });

    syncTopbarFlagsUI();
    applyUserPermissionsUI();
    renderScenesBarUI();
    renderWorkspaceEquipmentDrawer();
    updatePowerLoadUI();
    global.ShamsWorkspaceUI?.syncFromProject(state.activeProject);
    if (global.ShamsThreeView?.active) {
      global.ShamsThreeView.rebuildScene();
    }
  }

  function closeProjectToDashboard() {
    toggleDisplayMode(false);
    global.ShamsThreeView?.hide();
    global.ShamsWorkspaceUI?.toggleSidebar(false);
    if (state.canvasEngine) {
      state.canvasEngine.setDmxCableDrawMode(false);
    }
    document.getElementById('dmxCableToolbar').classList.add('hidden');
    state.activeProject = null;
    state.activeScene = null;
    showScreen('dashboardScreen');
    refreshDashboardAll();
  }

  function toggleEquipmentDrawer(forceOpen) {
    const dr = document.getElementById('equipmentDrawer');
    if (!dr) return;
    const willOpen = typeof forceOpen === 'boolean' ? forceOpen : dr.classList.contains('collapsed');
    dr.classList.toggle('collapsed', !willOpen);
    if (willOpen && window.innerWidth <= 900 && global.ShamsWorkspaceUI && typeof global.ShamsWorkspaceUI.toggleSidebar === 'function') {
      global.ShamsWorkspaceUI.toggleSidebar(false);
    }
    setTimeout(() => {
      if (state.canvasEngine) {
        state.canvasEngine.resize();
        state.canvasEngine.fitToScreen();
      }
    }, 220);
  }

  function renderWorkspaceEquipmentDrawer() {
    if (!state.workspace) return;
    const catTabs = document.getElementById('drawerCategoryTabs');
    const listEl = document.getElementById('drawerEquipmentList');
    const pCam = canAccess('cameraSettings');
    const cats = (state.workspace.categories || []).filter((c) => {
      if (!pCam && (c.type === 'camera' || c.type === 'lens')) return false;
      return true;
    });
    const eqs = state.workspace.equipment || [];

    if (!cats.some((c) => c.id === state.drawerCategoryFilter) && cats.length > 0) {
      state.drawerCategoryFilter = cats[0].id;
    }

    catTabs.innerHTML = cats
      .map(
        (c) => `<button type="button" class="drawer-cat-btn ${c.id === state.drawerCategoryFilter ? 'active' : ''}" onclick="CineApp.switchDrawerCategory('${c.id}')">
          ${c.icon || ''} ${escapeHtml(c.nameAr)}
        </button>`
      )
      .join('');

    const items = eqs.filter((e) => e.categoryId === state.drawerCategoryFilter);
    listEl.innerHTML = items
      .map((eq) => {
        const thumb = global.CineLightVectors.generateEquipmentThumbnailDataURL(eq);
        let subMeta = '';
        if (eq.type === 'fixture') {
          subMeta = `${eq.footprint || 0} Ch • ${eq.watts || 0}W`;
        } else if (eq.type === 'lens') {
          subMeta = eq.minMm === eq.maxMm ? `Prime ${eq.minMm}mm` : `${eq.minMm}-${eq.maxMm}mm`;
        } else {
          subMeta = eq.badge || '';
        }
        return `<div class="palette-item" onclick="CineApp.placeEquipmentOnStage('${eq.id}')">
          <img src="${thumb}" alt="${escapeHtml(eq.name)}" />
          <div class="palette-item-name">${escapeHtml(eq.name)}</div>
          <div class="palette-item-meta">${escapeHtml(subMeta)}</div>
        </div>`;
      })
      .join('');
  }

  function switchDrawerCategory(catId) {
    state.drawerCategoryFilter = catId;
    renderWorkspaceEquipmentDrawer();
  }

  async function placeEquipmentOnStage(eqId) {
    if (!state.activeProject || !state.activeScene || !state.canvasEngine) return;
    const eq = (state.workspace.equipment || []).find((x) => x.id === eqId);
    if (!eq) return;

    const sel = state.canvasEngine.getSelectedItem();

    if (eq.type === 'lens' && sel && sel.itemType === 'camera') {
      sel.lensModel = eq.name;
      sel.minMm = eq.minMm || 24;
      sel.maxMm = eq.maxMm || 70;
      sel.focalLengthMm = Math.max(sel.minMm, Math.min(sel.maxMm, sel.focalLengthMm || eq.defaultMm || sel.minMm));
      await persistWorkspace();
      state.canvasEngine.requestRender();
      showToast(`🔭 Equipped ${eq.name} (${sel.focalLengthMm}mm) on ${sel.camNumber}`);
      return;
    }

    if (eq.type === 'stand' && sel) {
      if (sel.itemType === 'fixture') {
        sel.mountType = eq.nameEn || eq.name;
        if (!sel.mountType.includes('Clamp') && !sel.mountType.includes('Grid')) {
          sel.snappedPipe = null;
          sel.standLocked = true;
          sel.z = eq.defaultHeight || 2.4;
        } else {
          sel.standLocked = false;
        }
        await persistWorkspace();
        updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
        state.canvasEngine.requestRender();
        if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
        showToast(`🗼 تم تركيب الكشاف (${sel.name}) على (${eq.nameEn || eq.name}) — اضغط (Lock Accessory) في لوحة التحكم لفك أو قفل الربط`);
        return;
      } else if (sel.itemType === 'camera') {
        sel.tripodModel = eq.nameEn || eq.name;
        await persistWorkspace();
        state.canvasEngine.requestRender();
        if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
        showToast(`🗼 Mounted ${sel.camNumber} on ${eq.nameEn || eq.name}`);
        return;
      }
    }

    const v = state.activeProject.venueConfig || { width: 14, length: 10, height: 4.5 };
    const vw = parseFloat(v.width) || 14;
    const vl = parseFloat(v.length) || 10;
    const count = (state.activeScene.items || []).length;
    const offsetX = ((count % 5) - 2) * 0.65;
    const offsetY = ((Math.floor(count / 5) % 4) - 1.5) * 0.65;
    let baseCenter = { x: vw / 2, y: vl / 2 };
    if (state.canvasEngine && state.canvasEngine.width > 0 && state.canvasEngine.height > 0) {
      const viewCenter = state.canvasEngine.screenToWorldFloor(
        state.canvasEngine.width / 2,
        state.canvasEngine.height / 2,
        0
      );
      if (
        Number.isFinite(viewCenter.x) &&
        Number.isFinite(viewCenter.y) &&
        viewCenter.x >= 0.5 &&
        viewCenter.x <= vw - 0.5 &&
        viewCenter.y >= 0.5 &&
        viewCenter.y <= vl - 0.5
      ) {
        baseCenter = viewCenter;
      }
    }
    const rawX = +Math.max(0.8, Math.min(vw - 0.8, baseCenter.x + offsetX)).toFixed(2);
    const rawY = +Math.max(0.8, Math.min(vl - 0.8, baseCenter.y + offsetY)).toFixed(2);

    let newItem = null;

    if (eq.type === 'fixture') {
      const stickyChannel =
        state.activeProject && state.activeProject.lastSelectedDmxChannel !== undefined
          ? state.activeProject.lastSelectedDmxChannel
          : (state.lastSelectedDmxChannel || '');
      const existingFixtures = state.activeScene.items.filter(
        (i) => i.itemType === 'fixture' && (i.channel || '') === stickyChannel && (parseInt(i.fixtureNum, 10) || 0) > 0
      );
      const maxOrder = existingFixtures.reduce((m, i) => Math.max(m, parseInt(i.fixtureNum, 10) || 0), 0);
      const nextNum = maxOrder + 1;
      const defaultMount = v.type === 'free' ? 'Silver Stand' : 'Ceiling Grid / Truss Clamp';

      newItem = {
        id: 'item_fix_' + Date.now(),
        itemType: 'fixture',
        equipmentId: eq.id,
        isSplitter: !!eq.isSplitter,
        name: eq.name,
        label: eq.name,
        badge: eq.badge || eq.name.slice(0, 8),
        vectorShape: eq.vectorShape || 'godox_sz200bi',
        scale: 1.0,
        x: rawX,
        y: rawY,
        z: v.type === 'free' ? 2.4 : +(parseFloat(v.height || 4.5) - 0.3).toFixed(1),
        rotation: 90,
        channel: stickyChannel,
        fixtureNum: nextNum,
        footprint: eq.footprint ?? 4,
        startAddress: 1,
        endAddress: eq.footprint || 1,
        manualAddress: false,
        dimmer: 100,
        kelvin: '',
        color: '',
        colorName: '',
        location: '',
        notes: '',
        watts: eq.watts ?? 200,
        beamAngle: eq.beamAngle || 40,
        beamLength: eq.beamLength || 4.0,
        mountType: defaultMount,
        powerLine: 'Power Line 1'
      };

      const snapped = state.canvasEngine.applyVenueAutoSnap(newItem, rawX, rawY);
      newItem.x = snapped.x;
      newItem.y = snapped.y;
      newItem.snappedPipe = snapped.snappedPipe;
      if (snapped.z !== undefined) newItem.z = snapped.z;
      if (snapped.mountType) newItem.mountType = snapped.mountType;
    } else if (eq.type === 'camera' || eq.type === 'lens') {
      const camCount = state.activeScene.items.filter((i) => i.itemType === 'camera').length + 1;
      const isLens = eq.type === 'lens';
      newItem = {
        id: 'item_cam_' + Date.now(),
        itemType: 'camera',
        equipmentId: isLens ? 'eq_cam_a7s3' : eq.id,
        camNumber: 'Cam ' + camCount,
        cameraBody: isLens ? 'Sony A7S III' : eq.name,
        lensModel: isLens ? eq.name : '24-70mm GM',
        minMm: isLens ? eq.minMm : 24,
        maxMm: isLens ? eq.maxMm : 70,
        focalLengthMm: isLens ? eq.defaultMm || eq.minMm : 35,
        tripodModel: 'Manfrotto 608',
        fStop: isLens ? eq.maxAperture || 'f/2.8' : 'f/2.8',
        iso: '800',
        shutter: '1/50',
        kelvin: '5600K',
        scale: 1.0,
        stLook: {
          contrast: 0,
          highlights: 0,
          shadows: 0,
          fade: 0,
          saturation: 0,
          sharpness: 4,
          clarity: 0
        },
        x: rawX,
        y: +(vl * 0.78).toFixed(2),
        z: 1.5,
        rotation: -90,
        fovDistance: 5.0
      };
    } else if (eq.type === 'accessory') {
      newItem = {
        id: 'item_acc_' + Date.now(),
        itemType: 'accessory',
        equipmentId: eq.id,
        subtype: eq.subtype || 'modifier',
        name: eq.name,
        label: eq.name,
        badge: eq.badge || eq.name,
        vectorShape: eq.vectorShape || 'acc_octa90',
        scale: 1.0,
        x: sel && sel.itemType === 'fixture' ? sel.x : rawX,
        y: sel && sel.itemType === 'fixture' ? sel.y : rawY,
        z: sel && sel.itemType === 'fixture' ? (sel.z || 2.4) : 2.4,
        rotation: sel && sel.itemType === 'fixture' ? (sel.rotation || 90) : 90,
        attachedTo: sel && sel.itemType === 'fixture' ? sel.id : null,
        attachedToFixtureId: sel && sel.itemType === 'fixture' ? sel.id : null
      };
      if (typeof state.canvasEngine.applyAccessoryMagneticSnap === 'function') {
        const snapRes = state.canvasEngine.applyAccessoryMagneticSnap(newItem, newItem.x, newItem.y);
        newItem.x = snapRes.x;
        newItem.y = snapRes.y;
        newItem.rotation = snapRes.rotation ?? newItem.rotation;
        newItem.attachedTo = snapRes.attachedTo || snapRes.attachedToFixtureId || null;
        newItem.attachedToFixtureId = newItem.attachedTo;
      }
    } else {
      newItem = {
        id: 'item_prop_' + Date.now(),
        itemType: 'prop',
        equipmentId: eq.id,
        subtype: eq.subtype || 'prop',
        name: eq.nameEn || eq.name,
        label: eq.nameEn || eq.badge || eq.name,
        badge: eq.badge || eq.nameEn || eq.name,
        vectorShape: eq.vectorShape || 'prop_person_standing',
        scale: 1.0,
        x: rawX,
        y: rawY,
        z: eq.defaultHeight || 1.75,
        rotation: 90
      };
    }

    newItem.positionLocked = false;
    state.activeScene.items.push(newItem);
    global.CineLightDB.recalculateDMXAddresses(state.activeScene, newItem.id);
    state.activeProject.updatedAt = new Date().toISOString();
    await persistWorkspace();

    state.canvasEngine.selectItem(newItem.id, !state.canvasEngine.isTouchDevice(), true);
    updatePowerLoadUI();
    state.canvasEngine.requestRender();
    global.ShamsWorkspaceUI?.checkpoint('Add ' + (newItem.name || newItem.label));
    if (global.ShamsThreeView?.active) {
      global.ShamsThreeView.rebuildScene();
    }

    if (newItem.itemType === 'fixture') {
      if ((Number(newItem.footprint) || 0) <= 0 || newItem.isNonDmx) {
        showToast(`💡 Added ${newItem.name} (Non-DMX / 0 Ch • ${newItem.watts || 0}W)`);
      } else {
        const chTag = newItem.channel ? `${newItem.channel} • ` : '';
        showToast(`💡 Added ${newItem.name} (${chTag}#${newItem.fixtureNum} • Addr: ${newItem.startAddress})`);
      }
    } else if (newItem.itemType === 'accessory') {
      showToast(newItem.attachedToFixtureId
        ? `🧲 تم تركيب الإكسسوار (${newItem.name}) مغناطيسياً على مقدمة الكشاف`
        : `🧲 تمت إضافة الإكسسوار (${newItem.name}) — قربه من أي كشاف للالتصاق المغناطيسي`);
    } else if (newItem.itemType === 'camera') {
      showToast(`🎥 Added ${newItem.camNumber} (${newItem.cameraBody} + ${newItem.lensModel})`);
    } else {
      showToast(`➕ Added ${newItem.label}`);
    }
  }

  function isFresnelAccessoryItem(it) {
    if (!it || it.itemType !== 'accessory') return false;
    return (
      it.equipmentId === 'eq_acc_fresnel_lens' ||
      it.vectorShape === 'acc_fresnel_lens' ||
      String(it.name || '').toLowerCase().includes('fresnel')
    );
  }

  function getAttachedFresnelAccessory(fixItem) {
    if (!fixItem || !state.activeScene) return null;
    return (state.activeScene.items || []).find(
      (it) => isFresnelAccessoryItem(it) && (it.attachedTo === fixItem.id || it.attachedToFixtureId === fixItem.id)
    ) || null;
  }

  function getParentFixtureForAccessory(accItem) {
    if (!accItem || !state.activeScene) return null;
    const pid = accItem.attachedTo || accItem.attachedToFixtureId;
    if (!pid) return null;
    return (state.activeScene.items || []).find((it) => it.id === pid && it.itemType === 'fixture') || null;
  }

  function onFresnelZoomChange(val) {
    const angle = Math.max(8, Math.min(90, parseFloat(val) || 35));
    const sel = state.canvasEngine && state.canvasEngine.getSelectedItem();
    if (!sel) return;

    if (sel.itemType === 'fixture') {
      sel.beamAngle = angle;
      const fresnelAcc = getAttachedFresnelAccessory(sel);
      if (fresnelAcc) fresnelAcc.zoomAngle = angle;
    } else if (isFresnelAccessoryItem(sel)) {
      sel.zoomAngle = angle;
      const parentFix = getParentFixtureForAccessory(sel);
      if (parentFix) parentFix.beamAngle = angle;
    }

    const dpadVal = document.getElementById('dpadFresnelZoomVal');
    const dpadRange = document.getElementById('dpadFresnelZoomRange');
    if (dpadVal) dpadVal.textContent = `${Math.round(angle)}°`;
    if (dpadRange) dpadRange.value = Math.round(angle);

    const fixVal = document.getElementById('fixModalFresnelZoomVal');
    const fixRange = document.getElementById('fixModalFresnelZoomRange');
    const fixBeam = document.getElementById('fixModalBeamAngle');
    if (fixVal) fixVal.textContent = `${Math.round(angle)}°`;
    if (fixRange) fixRange.value = Math.round(angle);
    if (fixBeam) fixBeam.value = Math.round(angle);

    const propVal = document.getElementById('propModalFresnelZoomVal');
    const propRange = document.getElementById('propModalFresnelZoomRange');
    if (propVal) propVal.textContent = `${Math.round(angle)}°`;
    if (propRange) propRange.value = Math.round(angle);

    persistWorkspace();
    if (state.canvasEngine) state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
  }

  async function toggleSelectedFloorGroundMount() {
    if (!state.canvasEngine || !state.activeProject) return;
    const sel = state.canvasEngine.getSelectedItem();
    if (!sel || sel.itemType !== 'fixture') return;
    const v = state.activeProject.venueConfig || {};
    const isCurrentlyFloor = sel.mountType === 'Floor / Ground' || !!sel.floorMounted || (sel.z !== undefined && parseFloat(sel.z) <= 0.95);

    if (isCurrentlyFloor) {
      sel.floorMounted = false;
      sel.beamTargetZ = 0;
      sel.mountType = v.type === 'free' ? 'Silver Stand' : 'Ceiling Grid / Truss Clamp';
      sel.z = v.type === 'free' ? 2.4 : (v.type === 'church' ? 7.2 : +(parseFloat(v.height || 4.5) - 0.3).toFixed(1));
      const snapped = state.canvasEngine.applyVenueAutoSnap(sel, sel.x, sel.y);
      sel.x = snapped.x;
      sel.y = snapped.y;
      sel.snappedPipe = snapped.snappedPipe;
      showToast('⬆ تم رفع الكشاف للتعليق العلوي / Overhead Mount');
    } else {
      sel.floorMounted = true;
      sel.mountType = 'Floor / Ground';
      sel.snappedPipe = null;
      const sancDepth = v.churchConfig?.sanctuaryDepth || 5.0;
      const sancElev = v.churchConfig?.sanctuaryElevation || 0.6;
      sel.z = (v.type === 'church' && sel.y <= sancDepth) ? +(sancElev + 0.25).toFixed(2) : 0.25;
      if (!sel.beamTargetZ || sel.beamTargetZ <= 0.2) {
        sel.beamTargetZ = +(sel.z + 1.4).toFixed(2);
      }
      showToast('⬇ تم وضع الكشاف على الأرض مباشرة (استخدم سهم ▲ لرفع اتجاه النور لأعلى)');
    }

    await persistWorkspace();
    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) {
      global.ShamsThreeView.rebuildScene();
    }
  }

  function onFixModalMountChange(mountVal) {
    const zInput = document.getElementById('fixModalHeightZ');
    if (!zInput) return;
    if (mountVal === 'Floor / Ground') {
      zInput.value = 0.25;
    } else if (mountVal && mountVal.includes('Stand') && parseFloat(zInput.value) < 1.0) {
      zInput.value = 2.2;
    } else if (mountVal === 'Ceiling Grid / Truss Clamp' && parseFloat(zInput.value) < 1.5) {
      const v = state.activeProject?.venueConfig || {};
      zInput.value = v.type === 'church' ? 7.2 : +(parseFloat(v.height || 4.5) - 0.3).toFixed(1);
    }
  }

  // ==========================================================================
  // 5. LEFT DIRECTIONAL PAD + SCALE (+ / -) + HIDE/SHOW CONTROLS
  // ==========================================================================
  function getControlLockSvgHTML(isOpen) {
    if (isOpen) {
      return `<svg class="ctrl-lock-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2.5" ry="2.5"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path><circle cx="12" cy="16.5" r="1.2" fill="currentColor" stroke="none"></circle></svg>`;
    }
    return `<svg class="ctrl-lock-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2.5" ry="2.5"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path><circle cx="12" cy="16.5" r="1.2" fill="currentColor" stroke="none"></circle></svg>`;
  }

  function updateLeftAimDpadUI(item, isUnlocked, dpadVisible = false) {
    const pad = document.getElementById('leftAimDpad');
    const reopenPill = document.getElementById('reopenDpadPill');
    const topBtn = document.getElementById('topbarToggleDpadBtn');
    const controlEnabled = !!(state.canvasEngine && state.canvasEngine.controlPadEnabled);
    const lockMarkup = `${getControlLockSvgHTML(controlEnabled)}<span>Control</span>`;

    if (reopenPill) {
      if (!canAccess('aimAndAlignTools')) {
        reopenPill.classList.add('hidden');
      } else {
        reopenPill.classList.remove('hidden');
        reopenPill.innerHTML = lockMarkup;
        reopenPill.classList.toggle('is-open', controlEnabled);
        reopenPill.classList.toggle('is-locked', !controlEnabled);
        reopenPill.title = controlEnabled
          ? 'قائمة التحكم مفتوحة لكل الكشافات — اضغط لقفلها وإغلاقها'
          : 'قائمة التحكم مقفلة — اضغط لفتحها وتشغيلها عند اختيار أي كشاف';
      }
    }

    if (topBtn) {
      topBtn.innerHTML = lockMarkup;
      topBtn.classList.toggle('btn-primary', controlEnabled);
      topBtn.classList.toggle('btn-secondary', !controlEnabled);
      topBtn.classList.toggle('is-open', controlEnabled);
      topBtn.classList.toggle('is-locked', !controlEnabled);
    }

    if (!pad) return;

    if (!canAccess('aimAndAlignTools') || !item || !dpadVisible || !controlEnabled) {
      pad.classList.add('hidden');
      return;
    }

    pad.classList.remove('hidden');

    const titleEl = document.getElementById('dpadItemTitle');
    const lockBadge = document.getElementById('dpadLockBadge');
    const degEl = document.getElementById('dpadCenterAngle');
    const scaleEl = document.getElementById('dpadScaleReadout');
    const unlockBtn = document.getElementById('dpadToggleUnlockBtn');

    if (item.itemType === 'fixture') {
      const numLabel = (item.fixtureNum === 0 || item.isNonDmx) ? 'Non-DMX' : `#${item.fixtureNum || 1}`;
      titleEl.textContent = `${numLabel} ${item.badge || item.name}`;
    } else if (item.itemType === 'camera') {
      titleEl.textContent = `${item.camNumber} (${item.focalLengthMm}mm)`;
    } else {
      titleEl.textContent = item.label || item.name;
    }

    // Show Nanlite Fresnel Lens Zoom slider on D-Pad when Fresnel Lens is selected or attached to this fixture
    const fresnelRow = document.getElementById('dpadFresnelZoomRow');
    if (fresnelRow) {
      const attachedFresnel = item.itemType === 'fixture' ? getAttachedFresnelAccessory(item) : null;
      const isFresnelSelf = isFresnelAccessoryItem(item);
      if (attachedFresnel || isFresnelSelf) {
        fresnelRow.classList.remove('hidden');
        const parentFix = isFresnelSelf ? getParentFixtureForAccessory(item) : item;
        const curZoom = Math.round(parentFix ? (parentFix.beamAngle || 35) : (item.zoomAngle || 35));
        const rEl = document.getElementById('dpadFresnelZoomRange');
        const vEl = document.getElementById('dpadFresnelZoomVal');
        if (rEl) rEl.value = curZoom;
        if (vEl) vEl.textContent = `${curZoom}°`;
      } else {
        fresnelRow.classList.add('hidden');
      }
    }

    // Floor / Ground mount quick button on D-Pad for fixtures
    const floorBtn = document.getElementById('dpadFloorMountToggleBtn');
    if (floorBtn) {
      if (item.itemType === 'fixture') {
        floorBtn.classList.remove('hidden');
        const isFloor = item.mountType === 'Floor / Ground' || !!item.floorMounted || (item.z !== undefined && parseFloat(item.z) <= 0.95);
        floorBtn.textContent = isFloor ? '⬆ رفع الكشاف للسقف' : '⬇ وضع الكشاف على الأرض';
      } else {
        floorBtn.classList.add('hidden');
      }
    }

    const normDeg = (((Math.round(item.rotation || 0) % 360) + 360) % 360);
    degEl.textContent = `${normDeg}°`;

    const sc = (parseFloat(item.scale) || 1.0).toFixed(2).replace(/\.00$/, '.0');
    if (scaleEl) scaleEl.textContent = `الحجم: ${sc}x`;

    if (isUnlocked) {
      lockBadge.textContent = '🔓 حر الحركة (اسحب)';
      lockBadge.classList.add('unlocked');
      unlockBtn.textContent = '🔒 تثبيت الموقع';
    } else {
      lockBadge.textContent = '🔒 مثبت (اضغط مطولاً للتحريك)';
      lockBadge.classList.remove('unlocked');
      unlockBtn.textContent = '🔓 فك قفل الموقع';
    }

    const detachBtn = document.getElementById('dpadDetachAccessoryStandBtn');
    if (detachBtn && state.activeScene) {
      const isStandOrAcc = item.itemType === 'accessory' || (state.canvasEngine && state.canvasEngine.isStandItem(item));
      if (isStandOrAcc) {
        detachBtn.classList.remove('hidden');
        const hasParent = !!(item.attachedTo || item.attachedToFixtureId);
        detachBtn.textContent = hasParent ? '🔒 قفل الإكسسوار' : '🔓 قفل الإكسسوار';
        detachBtn.classList.toggle('is-locked', hasParent);
        detachBtn.classList.toggle('is-unlocked', !hasParent);
        detachBtn.title = hasParent
          ? 'مقفل بالكشاف — اضغط لفك القفل'
          : 'غير مربوط — اضغط لقفل الربط بأقرب كشاف';
      } else if (item.itemType === 'fixture') {
        detachBtn.classList.remove('hidden');
        const hasAttachedItems = (state.activeScene.items || []).some(
          (it) => it.attachedTo === item.id || it.attachedToFixtureId === item.id
        );
        const nearbyUnattached =
          state.canvasEngine && typeof state.canvasEngine.findNearbyUnattachedForFixture === 'function'
            ? state.canvasEngine.findNearbyUnattachedForFixture(item)
            : [];
        const hasStandMount = (item.mountType || '').includes('Stand') || !!item.standLocked;
        const isLocked = (hasAttachedItems || hasStandMount) && nearbyUnattached.length === 0;
        detachBtn.textContent = isLocked ? '🔒 قفل الإكسسوار' : '🔓 قفل الإكسسوار';
        detachBtn.classList.toggle('is-locked', isLocked);
        detachBtn.classList.toggle('is-unlocked', !isLocked);
        detachBtn.title = isLocked
          ? 'مقفل ومربوط — اضغط لفك القفل'
          : (nearbyUnattached.length > 0
            ? 'يوجد إكسسوار أو استاند غير مربوط على الكشاف — اضغط لقفله وربطه'
            : 'غير مربوط — اضغط لقفل الإكسسوار / الاستاند القريب');
      } else {
        detachBtn.classList.add('hidden');
      }
    }
  }

  async function unlockSelectedAttachments() {
    if (!state.canvasEngine) return;
    const sel = state.canvasEngine.getSelectedItem();
    if (!sel) return;
    const res = state.canvasEngine.unlockItemAttachments(sel);
    await persistWorkspace();
    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) {
      global.ShamsThreeView.rebuildScene();
    }
    if (res && res.message) {
      showToast(res.message);
    }
  }

  function toggleControlPadLock(force) {
    if (!canAccess('aimAndAlignTools')) {
      showToast('🔒 غير مصرح لك باستخدام أدوات التوجيه والمحاذاة');
      return;
    }
    if (!state.canvasEngine) return;
    const next = typeof force === 'boolean' ? force : !state.canvasEngine.controlPadEnabled;
    state.canvasEngine.setControlPadEnabled(next);
    const sel = state.canvasEngine.getSelectedItem();
    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    if (next && !sel) {
      showToast('🔓 Control مفتوح — اضغط على أي كشاف أو كاميرا لإظهار الأسهم');
    } else if (!next) {
      showToast('🔒 Control مقفول');
    }
  }

  function hideLeftDpad() {
    toggleControlPadLock(false);
  }

  function showLeftDpad() {
    toggleControlPadLock(true);
  }

  function toggleLeftDpadFromToolbar() {
    toggleControlPadLock();
  }

  function scaleSelected(delta, resetToOne = false) {
    if (!state.canvasEngine) return;
    const newScale = state.canvasEngine.scaleSelectedItem(delta, resetToOne);
    const sel = state.canvasEngine.getSelectedItem();
    if (sel) {
      updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
      persistWorkspace();
      showToast(`🔍 Item Size: ${newScale}x`);
    }
  }

  function dpadAction(action, step = 5) {
    if (!state.canvasEngine) return;
    state.canvasEngine.nudgeSelectedAim(action, step);
    const sel = state.canvasEngine.getSelectedItem();
    if (sel) {
      updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
      persistWorkspace();
      if (global.ShamsThreeView?.active) {
        global.ShamsThreeView.rebuildScene();
      }
    }
  }

  function toggleSelectedPositionLock() {
    if (!state.canvasEngine) return;
    const sel = state.canvasEngine.getSelectedItem();
    if (!sel) return;
    state.canvasEngine.isPositionUnlocked = !state.canvasEngine.isPositionUnlocked;
    sel.positionLocked = !state.canvasEngine.isPositionUnlocked;
    if (state.canvasEngine.isPositionUnlocked) {
      state.canvasEngine.draggingMode = 'move_item';
      showToast('🔓 تم فك قفل المكان - اسحب المعدة لنقلها / Unlocked: Drag item to move');
    } else {
      state.canvasEngine.draggingMode = null;
      showToast('🔒 تم قفل مكان المعدة / Position Locked');
    }
    persistWorkspace();
    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    state.canvasEngine.requestRender();
  }

  function openSelectedSettingsModal() {
    if (!state.canvasEngine) return;
    const sel = state.canvasEngine.getSelectedItem();
    if (sel) openItemSettingsModal(sel);
  }

  async function duplicateSelectedItem() {
    if (!state.canvasEngine || !state.activeScene) return;
    const sel = state.canvasEngine.getSelectedItem();
    if (!sel) return;
    const copy = JSON.parse(JSON.stringify(sel));
    copy.id = sel.itemType + '_' + Date.now();
    copy.x = +(parseFloat(sel.x) + 0.8).toFixed(2);
    copy.y = +(parseFloat(sel.y) + 0.5).toFixed(2);
    if (copy.itemType === 'fixture') {
      const sameCh = state.activeScene.items.filter(
        (i) => i.itemType === 'fixture' && (i.channel || '') === (copy.channel || '') && (parseInt(i.fixtureNum, 10) || 0) > 0
      );
      const maxNum = sameCh.reduce((m, i) => Math.max(m, parseInt(i.fixtureNum, 10) || 0), 0);
      copy.fixtureNum = maxNum + 1;
    } else if (copy.itemType === 'camera') {
      const cams = state.activeScene.items.filter((i) => i.itemType === 'camera').length + 1;
      copy.camNumber = 'Cam ' + cams;
    }
    state.activeScene.items.push(copy);
    global.CineLightDB.recalculateDMXAddresses(state.activeScene, copy.id);
    await persistWorkspace();
    state.canvasEngine.selectItem(copy.id, false, true);
    updatePowerLoadUI();
    state.canvasEngine.requestRender();
    showToast('⧉ تم نسخ المعدة بنجاح / Item duplicated');
  }

  async function deleteSelectedItem() {
    if (!state.canvasEngine || !state.activeScene) return;
    const sel = state.canvasEngine.getSelectedItem();
    if (!sel) return;
    state.activeScene.items = state.activeScene.items.filter((i) => i.id !== sel.id);
    global.CineLightDB.recalculateDMXAddresses(state.activeScene);
    state.canvasEngine.selectItem(null, false, false);
    updatePowerLoadUI();
    await persistWorkspace();
    state.canvasEngine.requestRender();
    showToast('🗑 تم حذف المعدة / Item removed');
  }

  // ==========================================================================
  // 6. MANUAL CUSTOM DMX CABLE ROUTING TOOL (Update #6)
  // ==========================================================================
  function toggleDmxCableDrawMode(forceState) {
    if (!state.canvasEngine) return;
    const next = forceState !== undefined ? !!forceState : !state.canvasEngine.dmxCableDrawMode;
    const color = document.getElementById('dmxCableColorPicker').value || '#38bdf8';
    const style = document.getElementById('dmxCableStyleSelect').value || 'dashed';
    const channel = document.getElementById('dmxCableChannelTag').value || 'Channel A';

    state.canvasEngine.setDmxCableDrawMode(next, { color, style, channel });
    document.getElementById('dmxCableToolbar').classList.toggle('hidden', !next);
    const btn = document.getElementById('drawDmxCableModeBtn');
    if (btn) {
      btn.classList.toggle('btn-primary', next);
      btn.classList.toggle('btn-secondary', !next);
    }
    if (next) {
      showToast('✏️ وضع توصيل كابلات DMX اليدوي: اضغط على أي كشاف أو نقطة في أي ترتيب (Double-Click لإنهاء الكابل)');
    }
  }

  function setDmxCableColor(hex, swatchEl) {
    document.getElementById('dmxCableColorPicker').value = hex;
    document.querySelectorAll('.color-swatch-btn').forEach((b) => b.classList.remove('active'));
    if (swatchEl) swatchEl.classList.add('active');
    if (state.canvasEngine) {
      state.canvasEngine.cableColor = hex;
      if (state.canvasEngine.activeCableDraft) {
        state.canvasEngine.activeCableDraft.color = hex;
        state.canvasEngine.requestRender();
      }
    }
  }

  function setDmxCableStyle(style) {
    if (state.canvasEngine) {
      state.canvasEngine.cableStyle = style;
      if (state.canvasEngine.activeCableDraft) {
        state.canvasEngine.activeCableDraft.style = style;
        state.canvasEngine.requestRender();
      }
    }
  }

  function setDmxCableChannelTag(ch) {
    if (state.canvasEngine) {
      state.canvasEngine.cableChannelTag = ch;
      if (state.canvasEngine.activeCableDraft) {
        state.canvasEngine.activeCableDraft.channel = ch;
      }
    }
  }

  function finishCurrentDmxCable() {
    if (!state.canvasEngine) return;
    state.canvasEngine.finishActiveCableDraft();
    persistWorkspace();
    showToast('✅ تم تثبيت مسار كابل الـ DMX / Cable path saved');
  }

  function undoDmxCablePoint() {
    if (!state.canvasEngine) return;
    state.canvasEngine.undoLastCableWaypoint();
    persistWorkspace();
  }

  function deleteSelectedCustomCable() {
    if (!state.canvasEngine || !state.canvasEngine.selectedCableId) return;
    state.canvasEngine.deleteCableById(state.canvasEngine.selectedCableId);
    document.getElementById('deleteSelectedCableBtn').classList.add('hidden');
    persistWorkspace();
    showToast('🗑 تم حذف كابل الـ DMX المحدد');
  }

  function clearAllDmxCables() {
    if (!state.canvasEngine) return;
    if (!confirm('حذف جميع كابلات الـ DMX المرسومة يدوياً في هذا المشهد؟ / Clear all manual DMX cables?')) return;
    state.canvasEngine.clearAllCustomCables();
    document.getElementById('deleteSelectedCableBtn').classList.add('hidden');
    persistWorkspace();
    showToast('🧹 تم مسح جميع الكابلات اليدوية');
  }

  // ==========================================================================
  // 7. AUTOMATED DMX512 & CAMERA INSPECTOR MODALS
  // ==========================================================================
  function openItemSettingsModal(item) {
    if (!item) return;
    if (item.itemType === 'fixture') {
      openFixtureInspectorModal(item);
    } else if (item.itemType === 'camera') {
      if (!canAccess('cameraSettings')) {
        showToast('🔒 غير مصرح لك بتعديل إعدادات الكاميرات والعدسات / Permission required: Camera Settings & Creative Look ST');
        return;
      }
      openCameraInspectorModal(item);
    } else {
      openPropInspectorModal(item);
    }
  }

  function openFixtureInspectorModal(item) {
    applyUserPermissionsUI();
    _isPopulatingFixtureModal = true;
    try {
    const fixturesEq = (state.workspace.equipment || []).filter((e) => e.type === 'fixture');
    const modelSel = document.getElementById('fixModalModelSelect');
    modelSel.innerHTML = fixturesEq
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${e.footprint} Ch / ${e.watts}W)</option>`)
      .join('');
    if (fixturesEq.some((e) => e.id === item.equipmentId)) {
      modelSel.value = item.equipmentId;
    }

    document.getElementById('fixModalLabel').value = item.label || item.name || '';
    document.getElementById('fixModalFootprint').value = item.footprint ?? 4;
    const itemCh =
      item.channel !== undefined && item.channel !== null
        ? item.channel
        : ((state.activeProject && state.activeProject.lastSelectedDmxChannel) || state.lastSelectedDmxChannel || '');
    document.getElementById('fixModalChannel').value = itemCh;
    const rawOrderNum = (item.fixtureNum !== undefined && item.fixtureNum !== null && item.fixtureNum !== '') ? parseInt(item.fixtureNum, 10) : 1;
    document.getElementById('fixModalOrderNum').value = isNaN(rawOrderNum) ? 1 : Math.max(0, rawOrderNum);
    document.getElementById('fixModalManualAddrToggle').checked = !!item.manualAddress;
    document.getElementById('fixModalStartAddr').readOnly = !item.manualAddress;
    document.getElementById('fixModalStartAddr').value = item.startAddress || 1;

    const dim = item.dimmer ?? 100;
    document.getElementById('fixModalDimmerRange').value = dim;
    document.getElementById('fixModalDimmerNum').value = dim;
    document.getElementById('fixModalDimmerVal').textContent = dim;

    const isLegacyDefaultKelvin = item.kelvin === '5600K' && (item.colorName === 'Default' || !item.colorName) && !item._userEditedLighting;
    document.getElementById('fixModalKelvin').value = isLegacyDefaultKelvin ? '' : (item.kelvin || '');
    document.getElementById('fixModalColorHex').value = item.color && item.color.startsWith('#') ? item.color : '#fff3d6';
    document.getElementById('fixModalColorName').value = item.colorName === 'Default' ? '' : (item.colorName || '');
    const locEl = document.getElementById('fixModalLocation');
    const notesEl = document.getElementById('fixModalNotes');
    if (locEl) locEl.value = item.location || '';
    if (notesEl) notesEl.value = item.notes || '';

    document.getElementById('fixModalMount').value = item.mountType || 'Ceiling Grid / Truss Clamp';
    document.getElementById('fixModalPowerLine').value = item.powerLine || 'Power Line 1';
    document.getElementById('fixModalWatts').value = item.watts ?? 200;
    document.getElementById('fixModalHeightZ').value = item.z ?? 4.2;
    document.getElementById('fixModalBeamAngle').value = item.beamAngle ?? 40;
    document.getElementById('fixModalRotation').value = Math.round(item.rotation || 0);

    const fresnelBox = document.getElementById('fixModalFresnelZoomBox');
    if (fresnelBox) {
      const hasFresnel = !!getAttachedFresnelAccessory(item);
      fresnelBox.classList.toggle('hidden', !hasFresnel);
      const curBeam = Math.round(item.beamAngle ?? 40);
      const rEl = document.getElementById('fixModalFresnelZoomRange');
      const vEl = document.getElementById('fixModalFresnelZoomVal');
      if (rEl) rEl.value = curBeam;
      if (vEl) vEl.textContent = `${curBeam}°`;
    }

    onFixtureModalFieldChange();
    } finally {
      _isPopulatingFixtureModal = false;
    }
    openModal('fixtureInspectorModal');
  }

  function onFixtureModalModelSwitch(eqId) {
    const eq = (state.workspace.equipment || []).find((e) => e.id === eqId);
    if (!eq) return;
    document.getElementById('fixModalFootprint').value = eq.footprint ?? 4;
    document.getElementById('fixModalWatts').value = eq.watts ?? 200;
    if (eq.beamAngle) document.getElementById('fixModalBeamAngle').value = eq.beamAngle;
    onFixtureModalFieldChange();
    if (!_isPopulatingFixtureModal) {
      applyFixtureInspectorLive({ immediatePersist: true });
    }
  }

  function onFixtureModalChannelSwitch(newChannel) {
    const cleanCh = newChannel || '';
    state.lastSelectedDmxChannel = cleanCh;
    if (state.activeProject) state.activeProject.lastSelectedDmxChannel = cleanCh;

    const sel = state.canvasEngine && state.canvasEngine.getSelectedItem();
    if (!sel || !state.activeScene) return;
    const currentOrder = parseInt(document.getElementById('fixModalOrderNum').value, 10);
    if (currentOrder !== 0) {
      const othersOnCh = state.activeScene.items.filter(
        (i) => i.itemType === 'fixture' && i.id !== sel.id && (i.channel || '') === cleanCh && (parseInt(i.fixtureNum, 10) || 0) > 0
      );
      const maxNum = othersOnCh.reduce((m, i) => Math.max(m, parseInt(i.fixtureNum, 10) || 0), 0);
      document.getElementById('fixModalOrderNum').value = maxNum + 1;
    }
    onFixtureModalFieldChange();
    if (!_isPopulatingFixtureModal) {
      applyFixtureInspectorLive({ immediatePersist: true });
    }
  }

  function syncFixtureDimmer(val, source = 'range', flushSave = false) {
    const rawStr = String(val ?? '').trim();
    const parsed = rawStr === '' ? 0 : parseInt(rawStr, 10);
    const v = Math.max(0, Math.min(100, isNaN(parsed) ? 0 : parsed));
    document.getElementById('fixModalDimmerRange').value = v;
    if (source !== 'num') {
      document.getElementById('fixModalDimmerNum').value = v;
    }
    document.getElementById('fixModalDimmerVal').textContent = v;
    if (!_isPopulatingFixtureModal) {
      applyFixtureInspectorLive({ immediatePersist: !!flushSave });
    }
  }

  function onFixtureModalFieldChange() {
    const sel = state.canvasEngine && state.canvasEngine.getSelectedItem();
    if (!sel || !state.activeScene) return;

    const ch = document.getElementById('fixModalChannel').value || '';
    const chLabel = ch || 'بدون Channel';
    const rawOrder = document.getElementById('fixModalOrderNum').value;
    const parsedOrder = rawOrder !== '' && rawOrder !== null && rawOrder !== undefined ? parseInt(rawOrder, 10) : 1;
    const orderNum = isNaN(parsedOrder) ? 1 : Math.max(0, parsedOrder);
    const footprint = Math.max(0, parseInt(document.getElementById('fixModalFootprint').value, 10) || 0);
    const isManual = document.getElementById('fixModalManualAddrToggle').checked;
    const startInput = document.getElementById('fixModalStartAddr');
    startInput.readOnly = !isManual || orderNum === 0;

    if (orderNum === 0) {
      startInput.value = '';
      document.getElementById('fixModalDmxDisplay').textContent =
        `${chLabel} • Light Number: 0 • بدون توصيل DMX (Non-DMX)`;
      document.getElementById('fixModalDmxBox').classList.remove('overflow');
      document.getElementById('fixModalDmxWarning').classList.add('hidden');
      return;
    }

    const simItems = state.activeScene.items
      .filter((i) => {
        if (i.itemType !== 'fixture') return false;
        if (i.id === sel.id) return true;
        const iNum = i.fixtureNum !== undefined && i.fixtureNum !== null ? parseInt(i.fixtureNum, 10) : 1;
        return (i.channel || '') === ch && iNum > 0 && (parseInt(i.footprint, 10) || 0) > 0 && !i.isSplitter;
      })
      .map((i) =>
        i.id === sel.id
          ? { id: sel.id, fixtureNum: orderNum, footprint }
          : { id: i.id, fixtureNum: parseInt(i.fixtureNum, 10) || 1, footprint: parseInt(i.footprint, 10) || 0 }
      );

    simItems.sort((a, b) => {
      if (a.fixtureNum !== b.fixtureNum) return a.fixtureNum - b.fixtureNum;
      return a.id === sel.id ? 1 : -1;
    });

    // Deduplicate shared Light Numbers so fixtures with the same Light Number share the same start address
    const sharedGroups = new Map();
    for (const sim of simItems) {
      const existing = sharedGroups.get(sim.fixtureNum);
      if (!existing) {
        sharedGroups.set(sim.fixtureNum, { fixtureNum: sim.fixtureNum, maxFootprint: sim.footprint, hasSelected: sim.id === sel.id });
      } else {
        existing.maxFootprint = Math.max(existing.maxFootprint, sim.footprint);
        if (sim.id === sel.id) existing.hasSelected = true;
      }
    }

    let calcStart = 1;
    for (const grp of sharedGroups.values()) {
      if (grp.hasSelected || grp.fixtureNum === orderNum) break;
      calcStart += grp.maxFootprint;
    }

    if (!isManual) {
      startInput.value = calcStart;
    } else {
      calcStart = Math.max(1, parseInt(startInput.value, 10) || 1);
    }

    const calcEnd = footprint > 0 ? calcStart + footprint - 1 : calcStart;
    const overflow = calcEnd > 512;

    document.getElementById('fixModalDmxDisplay').textContent =
      footprint > 0 ? `${chLabel} • Light #${orderNum} • Addr: ${calcStart} (${footprint} Ch)` : `${chLabel} • Passive Splitter (0 Ch)`;
    document.getElementById('fixModalDmxBox').classList.toggle('overflow', overflow);
    document.getElementById('fixModalDmxWarning').classList.toggle('hidden', !overflow);
  }

  function applyFixtureInspectorLive({ closeModalAfter = false, immediatePersist = false } = {}) {
    const sel = state.canvasEngine && state.canvasEngine.getSelectedItem();
    if (!sel || sel.itemType !== 'fixture' || !state.activeScene || !state.activeProject) {
      return { hasOverflow: false, sel: null };
    }

    const eqId = document.getElementById('fixModalModelSelect').value;
    const eq = (state.workspace.equipment || []).find((x) => x.id === eqId);
    if (eq) {
      sel.equipmentId = eq.id;
      sel.name = eq.name;
      sel.badge = eq.badge || eq.name.slice(0, 8);
      sel.vectorShape = eq.vectorShape;
      sel.isSplitter = !!eq.isSplitter;
    }

    sel.label = document.getElementById('fixModalLabel').value.trim() || sel.name;
    sel.footprint = Math.max(0, parseInt(document.getElementById('fixModalFootprint').value, 10) || 0);
    sel.channel = document.getElementById('fixModalChannel').value || '';
    state.lastSelectedDmxChannel = sel.channel;
    state.activeProject.lastSelectedDmxChannel = sel.channel;

    const rawOrder = document.getElementById('fixModalOrderNum').value;
    const parsedOrder = rawOrder !== '' && rawOrder !== null && rawOrder !== undefined ? parseInt(rawOrder, 10) : 1;
    sel.fixtureNum = isNaN(parsedOrder) ? 1 : Math.max(0, parsedOrder);
    sel.isNonDmx = sel.fixtureNum === 0 || sel.footprint <= 0;

    sel.manualAddress = document.getElementById('fixModalManualAddrToggle').checked && sel.fixtureNum > 0;
    if (sel.manualAddress) {
      sel.manualStartAddress = Math.max(1, parseInt(document.getElementById('fixModalStartAddr').value, 10) || 1);
    }

    const rawDim = document.getElementById('fixModalDimmerNum').value;
    const fallbackRange = document.getElementById('fixModalDimmerRange').value;
    const parsedDim = rawDim !== '' ? parseInt(rawDim, 10) : parseInt(fallbackRange, 10);
    sel.dimmer = Math.max(0, Math.min(100, isNaN(parsedDim) ? 0 : parsedDim));

    sel.kelvin = document.getElementById('fixModalKelvin').value.trim();
    const enteredColorName = document.getElementById('fixModalColorName').value.trim();
    const enteredColorHex = document.getElementById('fixModalColorHex').value || '';
    const hasCustomHex = enteredColorHex && enteredColorHex.toLowerCase() !== '#fff3d6';
    sel.colorName = enteredColorName || (hasCustomHex ? enteredColorHex : '');
    sel.color = sel.colorName ? (enteredColorHex || '#fff3d6') : '';
    const locEl = document.getElementById('fixModalLocation');
    const notesEl = document.getElementById('fixModalNotes');
    sel.location = locEl ? locEl.value.trim() : (sel.location || '');
    sel.notes = notesEl ? notesEl.value.trim() : (sel.notes || '');
    sel._userEditedLighting = true;
    sel.mountType = document.getElementById('fixModalMount').value;
    sel.floorMounted = sel.mountType === 'Floor / Ground';
    if (sel.floorMounted) sel.snappedPipe = null;
    sel.powerLine = document.getElementById('fixModalPowerLine').value;
    sel.watts = parseFloat(document.getElementById('fixModalWatts').value) || 0;
    const parsedZ = parseFloat(document.getElementById('fixModalHeightZ').value);
    sel.z = !isNaN(parsedZ) ? parsedZ : (sel.floorMounted ? 0.25 : 4.0);
    sel.beamAngle = parseFloat(document.getElementById('fixModalBeamAngle').value) || 40;
    const attachedFresnel = getAttachedFresnelAccessory(sel);
    if (attachedFresnel) attachedFresnel.zoomAngle = sel.beamAngle;
    sel.rotation = parseFloat(document.getElementById('fixModalRotation').value) || 0;

    const dmxRes = global.CineLightDB.recalculateDMXAddresses(state.activeScene, sel.id);
    state.activeProject.updatedAt = new Date().toISOString();

    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    updatePowerLoadUI();
    state.canvasEngine.requestRender();

    if (global.ShamsThreeView?.active) {
      if (_fixture3dRebuildTimer) clearTimeout(_fixture3dRebuildTimer);
      _fixture3dRebuildTimer = setTimeout(() => {
        _fixture3dRebuildTimer = null;
        if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
      }, immediatePersist || closeModalAfter ? 0 : 120);
    }

    if (immediatePersist || closeModalAfter) {
      if (_fixtureLiveSaveTimer) {
        clearTimeout(_fixtureLiveSaveTimer);
        _fixtureLiveSaveTimer = null;
      }
      persistWorkspace();
    } else {
      if (_fixtureLiveSaveTimer) clearTimeout(_fixtureLiveSaveTimer);
      _fixtureLiveSaveTimer = setTimeout(() => {
        _fixtureLiveSaveTimer = null;
        persistWorkspace();
      }, 240);
    }

    return { hasOverflow: !!dmxRes.hasOverflow, sel };
  }

  async function saveFixtureInspector(e) {
    if (e) e.preventDefault();
    const res = applyFixtureInspectorLive({ closeModalAfter: true, immediatePersist: true });
    if (!res || !res.sel) return;
    const sel = res.sel;
    closeModal('fixtureInspectorModal');

    if (res.hasOverflow) {
      showToast('⚠️ Warning: DMX Channel exceeds 512 addresses!', 4000);
    } else if (sel.fixtureNum === 0 || sel.isNonDmx) {
      showToast(`✅ Saved ${sel.name} -> Light Number: 0 (بدون DMX)`);
    } else {
      const chTag = sel.channel ? `${sel.channel} • ` : '';
      showToast(`✅ Saved ${sel.name} -> ${chTag}Light #${sel.fixtureNum} (Addr: ${sel.startAddress})`);
    }
  }

  function openCameraInspectorModal(item) {
    const eqList = state.workspace.equipment || [];
    const cams = eqList.filter((e) => e.type === 'camera');
    const lenses = eqList.filter((e) => e.type === 'lens');
    const tripods = eqList.filter((e) => e.type === 'stand' && (e.subtype === 'camera_tripod' || e.vectorShape.startsWith('tripod_')));

    document.getElementById('camModalId').value = item.camNumber || 'Cam 1';

    const bodySel = document.getElementById('camModalBody');
    bodySel.innerHTML = cams.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    bodySel.value = item.cameraBody || 'Sony A7S III';

    const tripodSel = document.getElementById('camModalTripod');
    tripodSel.innerHTML = tripods
      .map((t) => `<option value="${escapeHtml(t.nameEn || t.name)}">${escapeHtml(t.nameEn || t.name)}</option>`)
      .join('');
    tripodSel.value = item.tripodModel || 'Manfrotto 608';

    const lensSel = document.getElementById('camModalLens');
    lensSel.innerHTML = lenses
      .map((l) => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)} (${l.minMm === l.maxMm ? 'Prime ' + l.minMm + 'mm' : l.minMm + '-' + l.maxMm + 'mm'})</option>`)
      .join('');
    lensSel.value = item.lensModel || '24-70mm GM';

    onCameraModalLensChange(lensSel.value, item.focalLengthMm);

    document.getElementById('camModalFStop').value = item.fStop || 'f/2.8';
    document.getElementById('camModalIso').value = item.iso || '800';
    document.getElementById('camModalShutter').value = item.shutter || '1/50';
    document.getElementById('camModalKelvin').value = item.kelvin || '5600K';

    const st = item.stLook || {
      contrast: 0,
      highlights: 0,
      shadows: 0,
      fade: 0,
      saturation: 0,
      sharpness: 4,
      clarity: 0
    };
    ['contrast', 'highlights', 'shadows', 'fade', 'saturation', 'sharpness', 'clarity'].forEach((k) => {
      const val = st[k] ?? 0;
      const input = document.getElementById('st_' + k);
      if (input) input.value = val;
      updateSTLabel(k, val);
    });

    openModal('cameraInspectorModal');
  }

  function onCameraModalLensChange(lensName, preferredFocal) {
    const lenses = (state.workspace.equipment || []).filter((e) => e.type === 'lens');
    const lensObj = lenses.find((l) => l.name === lensName) || { minMm: 24, maxMm: 70, defaultMm: 35 };
    const minMm = lensObj.minMm || 16;
    const maxMm = lensObj.maxMm || 200;
    const rangeEl = document.getElementById('camModalFocalRange');
    const numEl = document.getElementById('camModalFocalNum');

    rangeEl.min = minMm;
    rangeEl.max = maxMm;
    rangeEl.disabled = minMm === maxMm;

    numEl.min = minMm;
    numEl.max = maxMm;
    numEl.readOnly = minMm === maxMm;

    const clamped = Math.max(minMm, Math.min(maxMm, parseInt(preferredFocal || rangeEl.value || lensObj.defaultMm || minMm, 10)));
    syncCameraFocalLength(clamped);
  }

  function syncCameraFocalLength(val) {
    const rangeEl = document.getElementById('camModalFocalRange');
    const numEl = document.getElementById('camModalFocalNum');
    const min = parseInt(rangeEl.min, 10) || 16;
    const max = parseInt(rangeEl.max, 10) || 200;
    const clamped = Math.max(min, Math.min(max, parseInt(val, 10) || min));

    rangeEl.value = clamped;
    numEl.value = clamped;
    const fov = global.CineLightDB.calculateHorizontalFOV(clamped);
    document.getElementById('camModalFocalLabel').textContent = `${clamped}mm (Horizontal FOV: ${fov}°)`;
  }

  function updateSTLabel(key, val) {
    const v = parseInt(val, 10) || 0;
    const el = document.getElementById('val_st_' + key);
    if (el) {
      const signed = ['contrast', 'highlights', 'shadows', 'saturation'].includes(key) && v > 0 ? `+${v}` : `${v}`;
      el.textContent = signed;
    }
  }

  function resetSonySTLook() {
    const defaults = {
      contrast: 0,
      highlights: 0,
      shadows: 0,
      fade: 0,
      saturation: 0,
      sharpness: 4,
      clarity: 0
    };
    Object.keys(defaults).forEach((k) => {
      const el = document.getElementById('st_' + k);
      if (el) el.value = defaults[k];
      updateSTLabel(k, defaults[k]);
    });
  }

  async function saveCameraInspector(e) {
    e.preventDefault();
    const sel = state.canvasEngine && state.canvasEngine.getSelectedItem();
    if (!sel || sel.itemType !== 'camera') return;

    sel.camNumber = document.getElementById('camModalId').value.trim() || 'Cam 1';
    sel.cameraBody = document.getElementById('camModalBody').value;
    sel.tripodModel = document.getElementById('camModalTripod').value;
    sel.lensModel = document.getElementById('camModalLens').value;
    sel.focalLengthMm = parseInt(document.getElementById('camModalFocalNum').value, 10) || 35;
    sel.fStop = document.getElementById('camModalFStop').value.trim() || 'f/2.8';
    sel.iso = document.getElementById('camModalIso').value.trim() || '800';
    sel.shutter = document.getElementById('camModalShutter').value.trim() || '1/50';
    sel.kelvin = document.getElementById('camModalKelvin').value.trim() || '5600K';

    sel.stLook = {
      contrast: parseInt(document.getElementById('st_contrast').value, 10) || 0,
      highlights: parseInt(document.getElementById('st_highlights').value, 10) || 0,
      shadows: parseInt(document.getElementById('st_shadows').value, 10) || 0,
      fade: parseInt(document.getElementById('st_fade').value, 10) || 0,
      saturation: parseInt(document.getElementById('st_saturation').value, 10) || 0,
      sharpness: parseInt(document.getElementById('st_sharpness').value, 10) || 0,
      clarity: parseInt(document.getElementById('st_clarity').value, 10) || 0
    };

    state.activeProject.updatedAt = new Date().toISOString();
    await persistWorkspace();
    closeModal('cameraInspectorModal');
    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) {
      global.ShamsThreeView.rebuildScene();
    }
    showToast(`✅ Saved ${sel.camNumber} (${sel.cameraBody} • ${sel.lensModel} @ ${sel.focalLengthMm}mm)`);
  }

  function openPropInspectorModal(item) {
    document.getElementById('propModalLabel').value = item.label || item.name || '';
    document.getElementById('propModalRotation').value = Math.round(item.rotation || 0);
    document.getElementById('propModalHeightZ').value = item.z || 1.75;

    const fresnelBox = document.getElementById('propModalFresnelZoomBox');
    if (fresnelBox) {
      const isFresnel = isFresnelAccessoryItem(item);
      fresnelBox.classList.toggle('hidden', !isFresnel);
      if (isFresnel) {
        const parentFix = getParentFixtureForAccessory(item);
        const curZoom = Math.round(parentFix ? (parentFix.beamAngle || 35) : (item.zoomAngle || 35));
        const rEl = document.getElementById('propModalFresnelZoomRange');
        const vEl = document.getElementById('propModalFresnelZoomVal');
        if (rEl) rEl.value = curZoom;
        if (vEl) vEl.textContent = `${curZoom}°`;
      }
    }

    openModal('propInspectorModal');
  }

  async function savePropInspector(e) {
    e.preventDefault();
    const sel = state.canvasEngine && state.canvasEngine.getSelectedItem();
    if (!sel) return;
    sel.label = document.getElementById('propModalLabel').value.trim() || sel.name;
    sel.badge = sel.label;
    sel.rotation = parseFloat(document.getElementById('propModalRotation').value) || 0;
    sel.z = parseFloat(document.getElementById('propModalHeightZ').value) || 1.75;
    if (isFresnelAccessoryItem(sel)) {
      const rEl = document.getElementById('propModalFresnelZoomRange');
      if (rEl) {
        const zAngle = Math.max(8, Math.min(90, parseFloat(rEl.value) || 35));
        sel.zoomAngle = zAngle;
        const parentFix = getParentFixtureForAccessory(sel);
        if (parentFix) parentFix.beamAngle = zAngle;
      }
    }
    await persistWorkspace();
    closeModal('propInspectorModal');
    updateLeftAimDpadUI(sel, state.canvasEngine.isPositionUnlocked, state.canvasEngine.dpadVisible);
    state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) {
      global.ShamsThreeView.rebuildScene();
    }
  }

  // ==========================================================================
  // 8. TOP TOOLBAR: `Show Info ▾` (Updates #2 & #4), `Display` MODE, 2D/3D
  // ==========================================================================
  function positionFloatingPopover(btnEl, popEl) {
    if (!btnEl || !popEl) return;
    const rect = btnEl.getBoundingClientRect();
    popEl.style.position = 'fixed';
    popEl.style.zIndex = '99999';
    const top = Math.min(window.innerHeight - 320, Math.max(8, rect.bottom + 8));
    const popWidth = popEl.offsetWidth || 310;
    const left = Math.max(10, Math.min(window.innerWidth - popWidth - 10, rect.right - popWidth));
    popEl.style.top = `${top}px`;
    popEl.style.left = `${left}px`;
    popEl.style.right = 'auto';
  }

  function toggleShowInfoMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!canAccess('showInfoAndDisplay')) {
      showToast('🔒 غير مصرح لك بقائمة إظهار البيانات (Show Info)');
      return;
    }
    const menu = document.getElementById('showInfoDropdownMenu');
    const pwr = document.getElementById('powerLoadPopover');
    if (pwr) pwr.classList.add('hidden');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    if (willOpen) {
      const btn = document.getElementById('showInfoDropdownBtn') || (e && e.currentTarget);
      positionFloatingPopover(btn, menu);
    }
  }

  function syncTopbarFlagsUI() {
    if (!state.activeProject) return;
    const flags = state.activeProject.showInfoFlags || {};
    const keys = [
      'lightBeam', 'fixtureName', 'accessoryName', 'fixtureNum', 'channel', 'address', 'dimmer', 'kelvin', 'color',
      'cameraCone', 'camNum', 'lensZoom', 'fStop', 'iso', 'camKelvin', 'stLook'
    ];
    keys.forEach((k) => {
      const el = document.getElementById('chk_' + k);
      if (el) {
        if (k === 'lightBeam' || k === 'cameraCone') {
          el.checked = flags[k] !== false;
        } else {
          el.checked = !!flags[k];
        }
      }
    });

    const wireBtn = document.getElementById('toggleDmxWiringBtn');
    if (wireBtn) {
      wireBtn.classList.toggle('btn-primary', !!state.activeProject.showDmxWiring);
      wireBtn.classList.toggle('btn-secondary', !state.activeProject.showDmxWiring);
    }
  }

  function onShowInfoFlagChange(flagKey, isChecked) {
    if (!state.activeProject) return;
    if (!state.activeProject.showInfoFlags) state.activeProject.showInfoFlags = {};
    state.activeProject.showInfoFlags[flagKey] = !!isChecked;
    persistWorkspace();
    if (state.canvasEngine) state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
  }

  function setAllInfoFlags(val) {
    if (!state.activeProject) return;
    const keys = [
      'lightBeam', 'fixtureName', 'accessoryName', 'fixtureNum', 'channel', 'address', 'dimmer', 'kelvin', 'color',
      'cameraCone', 'camNum', 'lensZoom', 'fStop', 'iso', 'camKelvin', 'stLook'
    ];
    if (!state.activeProject.showInfoFlags) state.activeProject.showInfoFlags = {};
    keys.forEach((k) => {
      state.activeProject.showInfoFlags[k] = val;
    });
    syncTopbarFlagsUI();
    persistWorkspace();
    if (state.canvasEngine) state.canvasEngine.requestRender();
    if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
  }

  // ==========================================================================
  // MOBILE AUTO-HIDE TOP BAR (SWIPE UP / DOWN) + MINIMIZE UPPER SECTION
  // ==========================================================================
  function isMobileLayout() {
    try {
      return window.innerWidth <= 900 || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) {
      return window.innerWidth <= 900;
    }
  }

  function setCollapsibleHidden(el, hidden) {
    if (!el) return;
    const wantHidden = !!hidden;
    if (el.classList.contains('is-collapsed') === wantHidden) return;
    el.style.marginTop = wantHidden ? `-${el.offsetHeight}px` : '0px';
    el.classList.toggle('is-collapsed', wantHidden);
  }

  function setWorkspaceUpperHidden(hidden) {
    const upper = document.getElementById('workspaceUpperSection');
    if (!upper) return;
    const wantHidden = !!hidden;
    if (wantHidden) {
      const infoMenu = document.getElementById('showInfoDropdownMenu');
      const pwrPop = document.getElementById('powerLoadPopover');
      if (infoMenu) infoMenu.classList.add('hidden');
      if (pwrPop) pwrPop.classList.add('hidden');
    }
    setCollapsibleHidden(upper, wantHidden);
    state.upperSectionHidden = wantHidden;

    const btn = document.getElementById('upperToggleBtn');
    if (btn) {
      btn.classList.toggle('is-collapsed', wantHidden);
      const icon = btn.querySelector('.upper-toggle-icon');
      const label = btn.querySelector('.upper-toggle-label');
      if (icon) icon.textContent = wantHidden ? '▾' : '—';
      if (label) label.textContent = wantHidden ? 'إظهار الجزء العلوي' : 'إخفاء الجزء العلوي';
      btn.title = wantHidden ? 'Restore Top Section' : 'Minimize Top Section';
    }
    setTimeout(() => {
      if (state.canvasEngine) state.canvasEngine.resize();
    }, 320);
  }

  function toggleUpperSection() {
    setWorkspaceUpperHidden(!state.upperSectionHidden);
  }

  function bindVerticalSwipe(root, onSwipe) {
    if (!root) return;
    const THRESHOLD = 38;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    root.addEventListener('touchstart', (e) => {
      if (!isMobileLayout() || e.touches.length !== 1) {
        tracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true, capture: true });

    root.addEventListener('touchmove', (e) => {
      if (!tracking || e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) < THRESHOLD || Math.abs(dy) < Math.abs(dx) * 1.3) return;
      // Finger moving UP => 'up' (hide), finger moving DOWN => 'down' (show)
      onSwipe(dy < 0 ? 'up' : 'down', e);
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true, capture: true });

    const stop = () => { tracking = false; };
    root.addEventListener('touchend', stop, { passive: true, capture: true });
    root.addEventListener('touchcancel', stop, { passive: true, capture: true });
  }

  function isCanvasInteractionBusy() {
    const eng = state.canvasEngine;
    if (!eng) return false;
    return (
      eng.draggingMode === 'move_item' ||
      eng.draggingMode === 'aim' ||
      eng.draggingMode === 'pinch' ||
      !!eng.longPressTargetId ||
      !!eng.dmxCableDrawMode ||
      (eng.activePointers && eng.activePointers.size > 1)
    );
  }

  function setupAutoHideHeaders() {
    const wsScreen = document.getElementById('workspaceScreen');
    const dashScreen = document.getElementById('dashboardScreen');
    const dashHeader = dashScreen ? dashScreen.querySelector('.dash-header') : null;
    const dashContent = dashScreen ? dashScreen.querySelector('.dash-content') : null;

    // Workspace: swipe UP hides the top bars, swipe DOWN restores them
    bindVerticalSwipe(wsScreen, (dir, e) => {
      if (document.body.classList.contains('display-mode-active')) return;
      if (e.target && e.target.closest && e.target.closest('.show-info-menu, .power-popover, .left-aim-dpad, .dmx-cable-toolbar, .equipment-drawer .drawer-cats')) return;
      if (isCanvasInteractionBusy()) return;
      setWorkspaceUpperHidden(dir === 'up');
    });

    // Dashboard: swipe / scroll UP hides the header, DOWN restores it
    bindVerticalSwipe(dashScreen, (dir, e) => {
      if (e.target && e.target.closest && e.target.closest('.dash-nav-grid, .modal-backdrop')) return;
      if (dir === 'down' && dashContent && dashContent.scrollTop > 4 && e.target.closest && e.target.closest('.dash-content')) {
        // Still scrolling back up through content: reveal header right away for quick access
        setCollapsibleHidden(dashHeader, false);
        return;
      }
      setCollapsibleHidden(dashHeader, dir === 'up');
    });

    if (dashContent) {
      let lastTop = 0;
      dashContent.addEventListener('scroll', () => {
        if (!isMobileLayout()) return;
        const top = dashContent.scrollTop;
        if (top <= 2) {
          setCollapsibleHidden(dashHeader, false);
        } else if (top - lastTop > 24) {
          setCollapsibleHidden(dashHeader, true);
        } else if (lastTop - top > 24) {
          setCollapsibleHidden(dashHeader, false);
        } else {
          return;
        }
        lastTop = top;
      }, { passive: true });
    }

    window.addEventListener('resize', () => {
      if (!isMobileLayout()) setCollapsibleHidden(dashHeader, false);
      const upper = document.getElementById('workspaceUpperSection');
      if (upper && upper.classList.contains('is-collapsed')) {
        upper.style.marginTop = `-${upper.offsetHeight}px`;
      }
      if (dashHeader && dashHeader.classList.contains('is-collapsed')) {
        dashHeader.style.marginTop = `-${dashHeader.offsetHeight}px`;
      }
    });
  }

  function toggleDisplayMode(enable) {
    if (enable && !canAccess('showInfoAndDisplay')) {
      showToast('🔒 غير مصرح لك بوضع العرض الكامل (Display)');
      return;
    }
    document.body.classList.toggle('display-mode-active', !!enable);
    document.getElementById('exitDisplayModeBtn').classList.toggle('hidden', !enable);
    if (enable && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!enable && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setTimeout(() => {
      if (state.canvasEngine) {
        state.canvasEngine.resize();
        state.canvasEngine.fitToScreen();
      }
    }, 100);
  }

  function toggle2D3DMode() {
    if (!state.canvasEngine) return;
    if (!canAccess('view3dMode')) {
      showToast('🔒 غير مصرح لك بفتح المنظور ثلاثي الأبعاد (3D View)');
      return;
    }
    const isCurrently3D = (global.ShamsThreeView && global.ShamsThreeView.active) || state.canvasEngine.viewMode === '3d';
    const next = isCurrently3D ? '2d' : '3d';
    const btn = document.getElementById('toggleViewModeBtn');
    const orbitBtn = document.getElementById('hudOrbitToggleBtn');

    if (next === '3d') {
      if (global.ShamsThreeView && global.THREE) {
        state.canvasEngine.setViewMode('2d');
        global.ShamsThreeView.show();
      } else {
        state.canvasEngine.setViewMode('3d');
        state.canvasEngine.orbitModeActive = true;
      }
      if (btn) {
        btn.textContent = '📐 2D View';
        btn.classList.replace('btn-cyan', 'btn-primary');
      }
      if (orbitBtn && !global.ShamsThreeView) orbitBtn.classList.remove('hidden');
      showToast('🧊 تم تفعيل المنظور ثلاثي الأبعاد WebGL 3D مع أشعة الإضاءة والظلال الحية');
    } else {
      global.ShamsThreeView?.hide();
      state.canvasEngine.setViewMode('2d');
      state.canvasEngine.orbitModeActive = false;
      if (btn) {
        btn.textContent = '🧊 3D View';
        btn.classList.replace('btn-primary', 'btn-cyan');
      }
      if (orbitBtn) orbitBtn.classList.add('hidden');
    }
  }

  function toggle3DOrbitDrag() {
    if (!state.canvasEngine) return;
    state.canvasEngine.orbitModeActive = !state.canvasEngine.orbitModeActive;
    const btn = document.getElementById('hudOrbitToggleBtn');
    btn.textContent = state.canvasEngine.orbitModeActive ? '🔄 تدوير 3D: مفعل' : '✋ تحريك 2D: مفعل';
  }

  function toggleDmxWiring() {
    if (!state.activeProject) return;
    state.activeProject.showDmxWiring = !state.activeProject.showDmxWiring;
    syncTopbarFlagsUI();
    persistWorkspace();
    if (state.canvasEngine) state.canvasEngine.requestRender();
  }

  function zoomViewport(factor) {
    if (!state.canvasEngine) return;
    state.canvasEngine.zoom = Math.max(0.3, Math.min(3.5, state.canvasEngine.zoom * factor));
    state.canvasEngine.requestRender();
  }

  function fitViewport() {
    if (state.canvasEngine) state.canvasEngine.fitToScreen();
  }

  function togglePowerPopover(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!canAccess('powerLoadMonitor')) {
      showToast('🔒 غير مصرح لك بعرض مراقب أحمال الكهرباء');
      return;
    }
    const pop = document.getElementById('powerLoadPopover');
    const menu = document.getElementById('showInfoDropdownMenu');
    if (menu) menu.classList.add('hidden');
    if (!pop) return;
    updatePowerLoadUI();
    const willOpen = pop.classList.contains('hidden');
    pop.classList.toggle('hidden', !willOpen);
    if (willOpen) {
      const btn = document.getElementById('powerLoadBadge') || (e && e.currentTarget);
      positionFloatingPopover(btn, pop);
    }
  }

  function updatePowerLoadUI() {
    if (!state.activeScene) return;
    const pwr = global.CineLightDB.calculatePowerLoad(state.activeScene);
    const appSettings = global.CineLightDB.getAppSettingsSync ? global.CineLightDB.getAppSettingsSync() : {};
    const maxAmps = parseFloat(appSettings.maxAmps) || 32;

    const lineKeys = Object.keys(pwr.lines);
    const overloadedLines = lineKeys.filter((lineName) => parseFloat(pwr.lines[lineName].amps) > maxAmps);
    const isAnyLineOverload = overloadedLines.length > 0;

    // Trigger toast alarm only when a line newly crosses the breaker limit
    const overloadSig = overloadedLines.map((ln) => `${ln}:${pwr.lines[ln].amps}`).join('|');
    if (isAnyLineOverload && state._lastOverloadSig !== overloadSig) {
      state._lastOverloadSig = overloadSig;
      const firstOver = overloadedLines[0];
      showToast(`⚠️ إنذار حمل كهرباء زائد في (${firstOver}): ${pwr.lines[firstOver].amps}A تجاوز الحد المسموح (${maxAmps}A)!`, 4500);
    } else if (!isAnyLineOverload) {
      state._lastOverloadSig = '';
    }

    const activeLines = lineKeys.filter((k) => pwr.lines[k].count > 0 || pwr.lines[k].watts > 0);
    const badge = document.getElementById('powerLoadBadge');
    if (badge) {
      badge.classList.toggle('overload-danger', isAnyLineOverload);
      if (isAnyLineOverload) {
        const overSummary = overloadedLines
          .map((ln) => `${ln.replace('Power Line ', 'L')}: ${pwr.lines[ln].watts}W (${pwr.lines[ln].amps}A/${maxAmps}A!)`)
          .join(' | ');
        badge.textContent = `⚠️⚡ إنذار: ${overSummary}`;
      } else if (activeLines.length > 0) {
        const linesSummary = activeLines
          .map((ln) => `${ln.replace('Power Line ', 'L')}: ${pwr.lines[ln].watts}W (${pwr.lines[ln].amps}A)`)
          .join(' • ');
        badge.textContent = `⚡ ${linesSummary}`;
      } else {
        badge.textContent = `⚡ L1: 0W (0A / ${maxAmps}A)`;
      }
    }

    const breakdown = document.getElementById('powerLoadBreakdown');
    if (breakdown) {
      const overloadAlert = overloadedLines.map((ln) => {
        const l = pwr.lines[ln];
        return `<div style="background:rgba(220,38,38,0.22); border:1.5px solid #ef4444; color:#fca5a5; padding:6px 8px; border-radius:6px; font-weight:800; font-size:0.75rem;">
          ⚠️ إنذار: ${ln} وصل إلى (${l.amps}A / ${l.watts}W) وتجاوز سعة القاطع للخط (${maxAmps}A)!
        </div>`;
      });

      const lineRows = lineKeys.map((lineName) => {
        const l = pwr.lines[lineName];
        const lineOver = parseFloat(l.amps) > maxAmps;
        const pct = Math.min(100, Math.round((parseFloat(l.amps) / maxAmps) * 100));
        return `<div style="border:1px solid ${lineOver ? '#ef4444' : 'var(--border-subtle)'}; background:${lineOver ? 'rgba(239,68,68,0.12)' : 'rgba(15,23,42,0.4)'}; border-radius:7px; padding:6px 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="color:${lineOver ? '#fca5a5' : 'var(--text-secondary)'}; font-weight:800;">
              ${lineOver ? '⚠️ ' : '🔌 '}${lineName} (${l.count} كشاف)
            </span>
            <strong style="color:${lineOver ? '#ef4444' : 'var(--accent-amber)'}; direction:ltr;">
              ${l.watts}W • ${l.amps}A / ${maxAmps}A
            </strong>
          </div>
          <div style="height:5px; background:rgba(148,163,184,0.2); border-radius:999px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${lineOver ? '#ef4444' : (pct > 80 ? '#f59e0b' : '#10b981')};"></div>
          </div>
        </div>`;
      });

      breakdown.innerHTML = overloadAlert.concat(lineRows).join('');
    }
  }

  // --- SCENES / CUES TABS ---
  function renderScenesBarUI() {
    const container = document.getElementById('scenesTabsContainer');
    if (!container || !state.activeProject) return;
    container.innerHTML = (state.activeProject.scenes || [])
      .map((sc) => {
        const isAct = sc.id === state.activeScene.id;
        return `<button type="button" class="scene-tab ${isAct ? 'active' : ''}" onclick="CineApp.switchScene('${sc.id}')">
          🎬 ${escapeHtml(sc.name)}
        </button>`;
      })
      .join('');
  }

  function switchScene(sceneId) {
    if (!state.activeProject) return;
    const sc = state.activeProject.scenes.find((s) => s.id === sceneId);
    if (!sc) return;
    state.activeScene = sc;
    state.activeProject.activeSceneId = sc.id;
    if (!Array.isArray(state.activeScene.customDmxCables)) {
      state.activeScene.customDmxCables = [];
    }
    global.CineLightDB.recalculateDMXAddresses(state.activeScene);
    state.canvasEngine.setProjectAndScene(state.activeProject, state.activeScene);
    state.canvasEngine.selectItem(null, false, false);
    renderScenesBarUI();
    updatePowerLoadUI();
    global.ShamsWorkspaceUI?.syncFromProject?.(state.activeProject);
    persistWorkspace();
  }

  async function addNewScene() {
    if (!state.activeProject) return;
    const num = state.activeProject.scenes.length + 1;
    const sc = {
      id: 'scene_' + Date.now(),
      name: `مشهد ${num}`,
      customDmxCables: [],
      items: []
    };
    state.activeProject.scenes.push(sc);
    switchScene(sc.id);
    showToast(`🎬 تم إنشاء ${sc.name}`);
  }

  async function duplicateActiveScene() {
    if (!state.activeProject || !state.activeScene) return;
    const copy = JSON.parse(JSON.stringify(state.activeScene));
    copy.id = 'scene_' + Date.now();
    copy.name = state.activeScene.name + ' (نسخة)';
    state.activeProject.scenes.push(copy);
    switchScene(copy.id);
    showToast('🎬 تم نسخ المشهد الحالي');
  }

  async function renameActiveScene() {
    if (!state.activeScene) return;
    const next = prompt('تعديل اسم المشهد:', state.activeScene.name);
    if (next && next.trim()) {
      state.activeScene.name = next.trim();
      renderScenesBarUI();
      await persistWorkspace();
    }
  }

  // ==========================================================================
  // 9. EXPORT DMX & CAMERA REPORTS MODULE (3 Selectable Layouts + Auto-Hide Empty Columns)
  // ==========================================================================
  function getCleanFixtureKelvin(f) {
    if (!f) return '';
    if (!f._userEditedLighting && f.kelvin === '5600K' && (!f.colorName || f.colorName === 'Default')) {
      return '';
    }
    return String(f.kelvin || '').trim();
  }

  function getCleanFixtureColor(f) {
    if (!f) return '';
    if (!f._userEditedLighting && (!f.colorName || f.colorName === 'Default')) {
      return '';
    }
    return String(f.colorName || '').trim();
  }

  function getSortedFixturesForReport(channelFilter = 'all', layoutMode = null) {
    if (!state.activeScene) return [];
    global.CineLightDB.recalculateDMXAddresses(state.activeScene);
    const mode = layoutMode || state.exportReportLayout || 'dmx';
    let fixtures = (state.activeScene.items || []).filter((i) => {
      if (i.itemType !== 'fixture') return false;
      if (mode === 'lights') return !i.isSplitter;
      return (Number(i.footprint) || 0) > 0 && !i.isNonDmx;
    });
    if (channelFilter && channelFilter !== 'all') {
      fixtures = fixtures.filter((f) => (f.channel || '') === channelFilter);
    }
    const sorted = fixtures.slice().sort((a, b) => {
      const chA = a.channel || '';
      const chB = b.channel || '';
      if (chA !== chB) return chA.localeCompare(chB);
      return (a.fixtureNum || 1) - (b.fixtureNum || 1);
    });

    // Merge fixtures that share the exact same Light Number (fixtureNum > 0) on the same channel into a single row
    const merged = [];
    const seenByLightNum = new Map();
    for (const f of sorted) {
      const num = parseInt(f.fixtureNum, 10) || 0;
      const chKey = String(f.channel || '').trim();
      if (num > 0) {
        const groupKey = `${chKey}__#${num}`;
        const existing = seenByLightNum.get(groupKey);
        if (existing) {
          // Merge any filled fields from duplicate light into the primary row without adding a second row
          if (!existing.location && f.location) existing.location = f.location;
          if (!existing.notes && f.notes) existing.notes = f.notes;
          if (!getCleanFixtureKelvin(existing) && getCleanFixtureKelvin(f)) {
            existing.kelvin = f.kelvin;
            existing._userEditedLighting = true;
          }
          if (!getCleanFixtureColor(existing) && getCleanFixtureColor(f)) {
            existing.colorName = f.colorName;
            existing.color = f.color;
            existing._userEditedLighting = true;
          }
          continue;
        }
        const clone = Object.assign({}, f);
        seenByLightNum.set(groupKey, clone);
        merged.push(clone);
      } else {
        merged.push(Object.assign({}, f));
      }
    }
    return merged;
  }

  function getActiveFixtureReportColumns(fixtures, layoutMode = null) {
    const mode = layoutMode || state.exportReportLayout || 'dmx';
    const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '—';

    const colDefs = {
      fixtureNum: {
        key: 'fixtureNum',
        label: 'Light Number',
        alwaysShow: true,
        text: (f) => ((f.fixtureNum === 0 || f.isNonDmx) ? '0 (بدون DMX)' : `#${f.fixtureNum || 1}`),
        html: (f) => `<strong>${(f.fixtureNum === 0 || f.isNonDmx) ? '0' : `#${f.fixtureNum || 1}`}</strong>`
      },
      name: {
        key: 'name',
        label: mode === 'full' ? 'Fixture Model' : 'اسم الكشاف (Fixture)',
        alwaysShow: true,
        text: (f) => f.name + (f.label && f.label !== f.name ? ` (${f.label})` : ''),
        html: (f) => `<strong>${escapeHtml(f.name)}</strong>${f.label && f.label !== f.name ? ` <span style="color:var(--text-muted);">(${escapeHtml(f.label)})</span>` : ''}`
      },
      location: {
        key: 'location',
        label: 'المكان (Location)',
        alwaysShow: false,
        raw: (f) => String(f.location || '').trim(),
        text: (f) => String(f.location || '').trim(),
        html: (f) => escapeHtml(f.location || '')
      },
      channel: {
        key: 'channel',
        label: 'Channel',
        alwaysShow: false,
        raw: (f) => String(f.channel || '').trim(),
        text: (f) => String(f.channel || '').trim(),
        html: (f) => f.channel ? `<strong style="color:var(--accent-cyan);">${escapeHtml(f.channel)}</strong>` : ''
      },
      fixtureAddr: {
        key: 'fixtureAddr',
        label: 'Fixture (Address)',
        alwaysShow: true,
        text: (f) => ((Number(f.footprint) || 0) > 0 ? `${f.startAddress}` : 'بدون DMX'),
        html: (f) =>
          (Number(f.footprint) || 0) > 0
            ? `<strong style="color:var(--accent-emerald); direction:ltr; display:inline-block;">${f.startAddress}</strong>`
            : `<span style="color:var(--text-muted);">بدون DMX</span>`
      },
      footprint: {
        key: 'footprint',
        label: 'Footprint (Ch)',
        alwaysShow: true,
        text: (f) => `${f.footprint || 0}`,
        html: (f) => `${f.footprint || 0}`
      },
      startAddress: {
        key: 'startAddress',
        label: 'Address',
        alwaysShow: true,
        text: (f) => ((Number(f.footprint) || 0) > 0 ? `${f.startAddress}` : 'N/A'),
        html: (f) => `<strong style="color:var(--accent-emerald);">${(Number(f.footprint) || 0) > 0 ? f.startAddress : 'N/A'}</strong>`
      },
      dimmer: {
        key: 'dimmer',
        label: mode === 'lights' ? 'الديمر (Dimmer)' : 'Dimmer %',
        alwaysShow: true,
        text: (f) => `${f.dimmer ?? 100}%`,
        html: (f) => `<strong>${f.dimmer ?? 100}%</strong>`
      },
      kelvin: {
        key: 'kelvin',
        label: mode === 'lights' ? 'الكيلفين (Kelvin)' : 'Kelvin',
        alwaysShow: false,
        raw: (f) => getCleanFixtureKelvin(f),
        text: (f) => getCleanFixtureKelvin(f),
        html: (f) => escapeHtml(getCleanFixtureKelvin(f))
      },
      color: {
        key: 'color',
        label: mode === 'lights' ? 'الكلر (Color)' : 'Color',
        alwaysShow: false,
        raw: (f) => getCleanFixtureColor(f),
        text: (f) => getCleanFixtureColor(f),
        html: (f) => {
          const cName = getCleanFixtureColor(f);
          if (!cName) return '';
          const hex = f.color && f.color.startsWith('#') ? f.color : '#fff3d6';
          return `<span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${escapeHtml(hex)}; margin-right:5px; border:1px solid rgba(0,0,0,0.25);"></span>${escapeHtml(cName)}`;
        }
      },
      watts: {
        key: 'watts',
        label: 'Watts',
        alwaysShow: true,
        text: (f) => `${f.watts || 0}W`,
        html: (f) => `${f.watts || 0}W`
      },
      notes: {
        key: 'notes',
        label: 'الملاحظات (Notes)',
        alwaysShow: false,
        raw: (f) => String(f.notes || '').trim(),
        text: (f) => String(f.notes || '').trim(),
        html: (f) => escapeHtml(f.notes || '')
      }
    };

    let sequence;
    if (mode === 'dmx') {
      // 1. DMX: رقم الكشاف -> اسم الكشاف -> المكان -> Channel -> Fixture -> الملاحظات
      sequence = [colDefs.fixtureNum, colDefs.name, colDefs.location, colDefs.channel, colDefs.fixtureAddr, colDefs.notes];
    } else if (mode === 'lights') {
      // 2. Lights: رقم الكشاف -> اسم الكشاف -> المكان -> الديمر -> الكيلفين -> الكلر -> الملاحظات
      sequence = [colDefs.fixtureNum, colDefs.name, colDefs.location, colDefs.dimmer, colDefs.kelvin, colDefs.color, colDefs.notes];
    } else {
      // 3. Full:
      sequence = [
        colDefs.channel,
        colDefs.fixtureNum,
        colDefs.name,
        colDefs.location,
        colDefs.footprint,
        colDefs.startAddress,
        colDefs.dimmer,
        colDefs.kelvin,
        colDefs.color,
        colDefs.watts,
        colDefs.notes
      ];
    }

    return sequence.filter((col) => {
      if (col.alwaysShow) return true;
      return (fixtures || []).some((f) => hasVal(col.raw ? col.raw(f) : col.text(f)));
    });
  }

  function getSortedCamerasForReport() {
    if (!state.activeScene) return [];
    const cams = (state.activeScene.items || []).filter((i) => i.itemType === 'camera');
    return cams.slice().sort((a, b) => (a.camNumber || '').localeCompare(b.camNumber || '', undefined, { numeric: true }));
  }

  function formatSTLookSummary(st) {
    if (!st) return 'ST(0/0/0/0/0/4/0)';
    const sign = (n) => (n > 0 ? `+${n}` : `${n ?? 0}`);
    return `Con:${sign(st.contrast)} | Hi:${sign(st.highlights)} | Shd:${sign(st.shadows)} | Fade:${st.fade ?? 0} | Sat:${sign(st.saturation)} | Shp:${st.sharpness ?? 4} | Clr:${st.clarity ?? 0}`;
  }

  function openReportsModal() {
    if (!state.activeProject || !state.activeScene) return;
    if (!canAccess('exportReports') && !canAccess('dmxPatching') && !canAccess('cameraSettings')) {
      showToast('🔒 غير مصرح لك بفتح الشيتات والتقارير / Permission required');
      return;
    }
    applyUserPermissionsUI();

    if (!state.exportReportLayout) state.exportReportLayout = 'dmx';
    const layoutSel = document.getElementById('exportReportLayoutSelect');
    if (layoutSel) layoutSel.value = state.exportReportLayout;

    // Populate dynamic Channel Filter dropdown with only currently active/used DMX Channels (Update #7)
    const allFixtures = getSortedFixturesForReport('all', state.exportReportLayout);
    const usedChannels = Array.from(new Set(allFixtures.map((f) => f.channel || 'Channel A'))).sort();
    const filterSel = document.getElementById('exportChannelFilter');
    if (filterSel) {
      filterSel.innerHTML =
        `<option value="all">Export All (الكل)</option>` +
        usedChannels.map((ch) => `<option value="${escapeHtml(ch)}">${escapeHtml(ch)} Only</option>`).join('');
      state.exportChannelFilter = 'all';
      filterSel.value = 'all';
    }

    const orient = (state.activeProject.reportOrientation === 'landscape' || state.exportOrientation === 'landscape') ? 'landscape' : 'portrait';
    state.exportOrientation = orient;
    const orientSel = document.getElementById('exportOrientationSelect');
    if (orientSel) orientSel.value = orient;

    const scope = state.exportContentScope || 'sheet';
    state.exportContentScope = scope;
    const scopeSel = document.getElementById('exportContentScopeSelect');
    if (scopeSel) scopeSel.value = scope;

    renderReportsModalTables(state.exportChannelFilter || 'all');
    openModal('reportsModal');
    requestAnimationFrame(() => updateProjectReportLivePreview());
  }

  function getActiveReportOrientation() {
    const sel = document.getElementById('exportOrientationSelect');
    const val = (sel && sel.value) || state.exportOrientation || (state.activeProject && state.activeProject.reportOrientation) || 'portrait';
    return val === 'landscape' ? 'landscape' : 'portrait';
  }

  function getActiveReportContentScope() {
    const sel = document.getElementById('exportContentScopeSelect');
    const val = (sel && sel.value) || state.exportContentScope || 'sheet';
    if (val === 'all' || val === 'plot') return val;
    return 'sheet';
  }

  function onExportOrientationChange(orientVal) {
    const orient = orientVal === 'landscape' ? 'landscape' : 'portrait';
    state.exportOrientation = orient;
    if (state.activeProject) {
      state.activeProject.reportOrientation = orient;
      persistWorkspace();
    }
    updateProjectReportLivePreview();
    showToast(
      orient === 'landscape'
        ? '📃 تم قلب الورقة بالعرض (Landscape) في المعاينة والطباعة والصور والتصدير'
        : '📄 تم قلب الورقة بالطول (Portrait) في المعاينة والطباعة والصور والتصدير'
    );
  }

  function onExportContentScopeChange(scopeVal) {
    state.exportContentScope = (scopeVal === 'all' || scopeVal === 'plot') ? scopeVal : 'sheet';
    updateProjectReportLivePreview();
  }

  function onExportPlotModeChange() {
    updateProjectReportLivePreview();
  }

  function updateProjectReportLivePreview() {
    const surface = document.getElementById('projectLiveSheetSurface');
    const stage = document.getElementById('projectReportZoomStage');
    const viewport = document.getElementById('projectReportPreviewViewport');
    const badge = document.getElementById('projectPreviewOrientBadge');
    if (!surface || !state.activeProject || !state.activeScene || !state.canvasEngine) return;

    const orient = getActiveReportOrientation();
    surface.classList.toggle('paper-orientation-landscape', orient === 'landscape');
    surface.classList.toggle('paper-orientation-portrait', orient !== 'landscape');
    if (badge) {
      badge.textContent = orient === 'landscape' ? 'Landscape' : 'Portrait';
    }

    surface.innerHTML = buildPrintableReportHTML();

    const applyScale = () => {
      if (!viewport || !stage) return;
      const baseW = orient === 'landscape' ? 1123 : 794;
      const availW = Math.max(260, (viewport.clientWidth || 720) - 24);
      const scale = Math.min(1, availW / baseW);
      surface.style.transform = `scale(${scale.toFixed(4)})`;
      surface.style.transformOrigin = 'top left';
      stage.style.width = `${Math.round(baseW * scale)}px`;
      stage.style.height = `${Math.round(surface.scrollHeight * scale)}px`;
    };

    requestAnimationFrame(() => {
      applyScale();
      setTimeout(applyScale, 120);
    });
  }

  function onExportReportLayoutChange(layoutVal) {
    state.exportReportLayout = layoutVal || 'dmx';
    renderReportsModalTables(state.exportChannelFilter || 'all');
    updateProjectReportLivePreview();
  }

  function onExportChannelFilterChange(channelVal) {
    state.exportChannelFilter = channelVal || 'all';
    renderReportsModalTables(state.exportChannelFilter);
    updateProjectReportLivePreview();
  }

  function getBannerContrastColor(hex) {
    const clean = String(hex || '').replace('#', '');
    if (clean.length !== 6) return '#0f172a';
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.52 ? '#ffffff' : '#0f172a';
  }

  function getProjectPaperAdaptiveMetrics(rowCount, colCount, isSplit = false, orientation = 'portrait') {
    const r = Math.max(1, parseInt(rowCount, 10) || 1);
    const c = Math.max(2, parseInt(colCount, 10) || 2);
    const isPortrait = orientation !== 'landscape';
    const manyCols = c >= 7;
    const ultraWideCols = c >= 9;

    if (isSplit) {
      if (isPortrait) {
        if (r <= 5) return { fontSize: '8.4pt', cellPad: '5px 4px', lineHeight: '1.34', bannerPad: '5px 7px', bannerFont: '9pt' };
        if (r <= 11) return { fontSize: '7.8pt', cellPad: '4px 3px', lineHeight: '1.3', bannerPad: '4px 6px', bannerFont: '8.5pt' };
        return { fontSize: '7.3pt', cellPad: '3px 3px', lineHeight: '1.25', bannerPad: '4px 5px', bannerFont: '8pt' };
      }
      if (r <= 6) return { fontSize: '8.8pt', cellPad: '5px 5px', lineHeight: '1.34', bannerPad: '5px 8px', bannerFont: '9.4pt' };
      if (r <= 12) return { fontSize: '8.2pt', cellPad: '4px 4px', lineHeight: '1.3', bannerPad: '4px 7px', bannerFont: '8.8pt' };
      return { fontSize: '7.6pt', cellPad: '3px 4px', lineHeight: '1.25', bannerPad: '4px 6px', bannerFont: '8.2pt' };
    }

    const fewColsBonus = c <= 4 ? 0.5 : 0;
    if (isPortrait) {
      if (ultraWideCols) {
        return {
          fontSize: r <= 8 ? '7.2pt' : '6.8pt',
          cellPad: '4px 3px',
          lineHeight: '1.25',
          bannerPad: '5px 7px',
          bannerFont: '9pt',
          tableMargin: '2px 0 8px 0'
        };
      }
      if (r <= 6) {
        return {
          fontSize: manyCols ? '8.2pt' : `${(9.2 + fewColsBonus).toFixed(1)}pt`,
          cellPad: manyCols ? '5px 4px' : '6px 7px',
          lineHeight: '1.34',
          bannerPad: '5px 8px',
          bannerFont: '9.5pt',
          tableMargin: '2px 0 8px 0'
        };
      }
      if (r <= 14) {
        return {
          fontSize: manyCols ? '7.6pt' : `${(8.4 + fewColsBonus).toFixed(1)}pt`,
          cellPad: manyCols ? '4px 3px' : '5px 6px',
          lineHeight: '1.28',
          bannerPad: '5px 7px',
          bannerFont: '9pt',
          tableMargin: '2px 0 8px 0'
        };
      }
      return {
        fontSize: manyCols ? '7.1pt' : '7.9pt',
        cellPad: '4px 3px',
        lineHeight: '1.24',
        bannerPad: '4px 6px',
        bannerFont: '8.5pt',
        tableMargin: '0 0 6px 0'
      };
    }

    if (r <= 8) {
      return {
        fontSize: ultraWideCols ? '8.1pt' : (manyCols ? '8.6pt' : '9.4pt'),
        cellPad: manyCols ? '5px 5px' : '6px 8px',
        lineHeight: '1.34',
        bannerPad: '5px 8px',
        bannerFont: '9.8pt',
        tableMargin: '4px 0 8px 0'
      };
    }
    return {
      fontSize: ultraWideCols ? '7.5pt' : (manyCols ? '8pt' : '8.6pt'),
      cellPad: '4px 5px',
      lineHeight: '1.28',
      bannerPad: '5px 8px',
      bannerFont: '9.2pt',
      tableMargin: '0 0 6px 0'
    };
  }

  function buildProjectDmxPaperHTML(fixtures, orientationOverride) {
    if (!fixtures || !fixtures.length) {
      return `<div style="text-align:center; padding:18px; color:#64748b; font-weight:700;">لا توجد كشافات مضافة في هذا التحديد / No lighting fixtures placed.</div>`;
    }

    const orient = orientationOverride || getActiveReportOrientation();
    const channelMap = new Map();
    fixtures.forEach((f) => {
      const ch = String(f.channel || 'Channel A').trim() || 'Channel A';
      if (!channelMap.has(ch)) channelMap.set(ch, []);
      channelMap.get(ch).push(f);
    });

    const channelNames = Array.from(channelMap.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const isSplit = channelNames.length >= 2;

    const buildChannelBlock = (chName) => {
      const rows = channelMap.get(chName) || [];
      const hasLocation = rows.some((f) => String(f.location || '').trim() !== '');
      const hasNotes = rows.some((f) => String(f.notes || '').trim() !== '');
      const showChannelCol = !isSplit;
      const colCount = 3 + (hasLocation ? 1 : 0) + (showChannelCol ? 1 : 0) + (hasNotes ? 1 : 0);
      const metrics = getProjectPaperAdaptiveMetrics(rows.length, colCount, isSplit, orient);

      const univColor = global.CineLightDB?.getUniverseColor
        ? global.CineLightDB.getUniverseColor(chName)
        : '#f59e0b';
      const txtColor = getBannerContrastColor(univColor);

      const rowsHtml = rows
        .map((f, idx) => {
          const rowBg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
          const isNonDmx = f.fixtureNum === 0 || f.isNonDmx || (Number(f.footprint) || 0) <= 0;
          const numText = isNonDmx && (f.fixtureNum === 0 || f.isNonDmx) ? '0' : `#${f.fixtureNum || 1}`;
          const nameText = `${escapeHtml(f.name || '')}${f.label && f.label !== f.name ? ` <span style="color:#475569; font-weight:600;">(${escapeHtml(f.label)})</span>` : ''}`;
          const addrText = (Number(f.footprint) || 0) > 0 ? String(f.startAddress || '') : 'بدون DMX';
          return `<tr>
            <td style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:center;font-weight:800;box-sizing:border-box;word-break:break-word;${rowBg}">${numText}</td>
            <td style="padding:${metrics.cellPad};font-size:${metrics.fontSize};font-weight:700;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;${rowBg}">${nameText}</td>
            ${hasLocation ? `<td style="padding:${metrics.cellPad};font-size:${metrics.fontSize};box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;${rowBg}">${escapeHtml(f.location || '')}</td>` : ''}
            ${showChannelCol ? `<td style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:center;font-weight:800;box-sizing:border-box;${rowBg}">${escapeHtml(chName)}</td>` : ''}
            <td style="padding:${metrics.cellPad};font-size:${metrics.fontSize};direction:ltr;text-align:center;font-weight:900;box-sizing:border-box;word-break:break-word;${rowBg}">${escapeHtml(addrText)}</td>
            ${hasNotes ? `<td style="padding:${metrics.cellPad};font-size:${metrics.fontSize};box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;${rowBg}">${escapeHtml(f.notes || '')}</td>` : ''}
          </tr>`;
        })
        .join('');

      return `
        <div class="dmx-universe-block" style="${!isSplit && metrics.tableMargin ? `margin:${metrics.tableMargin};` : ''}">
          <div class="dmx-universe-banner" style="background:${univColor};color:${txtColor};font-weight:900;padding:${metrics.bannerPad};border:1.5px solid #0f172a;border-bottom:none;display:flex;justify-content:space-between;align-items:center;font-size:${metrics.bannerFont};">
            <span>🔌 ${escapeHtml(chName)}</span>
            <span>(${rows.length})</span>
          </div>
          <table class="dmx-inner-table" dir="rtl" border="1" cellspacing="0" cellpadding="${isSplit ? '3' : '5'}" style="width:100%;max-width:100%;table-layout:fixed;box-sizing:border-box;border-collapse:collapse;margin-bottom:0;font-size:${metrics.fontSize};line-height:${metrics.lineHeight};">
            <thead>
              <tr>
                <th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};width:${isSplit ? '10%' : '11%'};text-align:center;box-sizing:border-box;white-space:normal;word-break:break-word;">#</th>
                <th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:right;box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">الكشاف</th>
                ${hasLocation ? `<th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:right;box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">المكان</th>` : ''}
                ${showChannelCol ? `<th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};width:14%;text-align:center;box-sizing:border-box;white-space:normal;word-break:break-word;">Channel</th>` : ''}
                <th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};width:${isSplit ? '18%' : '15%'};text-align:center;box-sizing:border-box;white-space:normal;word-break:break-word;">Address</th>
                ${hasNotes ? `<th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:right;box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">ملاحظات</th>` : ''}
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    };

    if (!isSplit) {
      return buildChannelBlock(channelNames[0]);
    }

    const pairs = [];
    for (let i = 0; i < channelNames.length; i += 2) {
      const leftBlock = buildChannelBlock(channelNames[i]);
      const rightBlock = i + 1 < channelNames.length ? buildChannelBlock(channelNames[i + 1]) : '';
      pairs.push(`
        <table class="dmx-split-table" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:100%;table-layout:fixed;box-sizing:border-box;border-collapse:separate;border-spacing:6px 0;border:none;margin-bottom:10px;">
          <tr>
            <td class="dmx-split-col" style="width:${rightBlock ? '50%' : '100%'};vertical-align:top;padding:5px;border:2px solid #0f172a;background:#ffffff;box-sizing:border-box;overflow:hidden;">${leftBlock}</td>
            ${rightBlock ? `<td class="dmx-split-col" style="width:50%;vertical-align:top;padding:5px;border:2px solid #0f172a;background:#ffffff;box-sizing:border-box;overflow:hidden;">${rightBlock}</td>` : ''}
          </tr>
        </table>
      `);
    }
    return pairs.join('');
  }

  function renderReportsModalTables(channelFilter) {
    const layoutMode = state.exportReportLayout || 'dmx';
    const fixtures = getSortedFixturesForReport(channelFilter, layoutMode);
    const activeCols = getActiveFixtureReportColumns(fixtures, layoutMode);
    const cameras = getSortedCamerasForReport();
    const pwr = global.CineLightDB.calculatePowerLoad(state.activeScene);

    document.getElementById('reportModalProjTitle').textContent =
      `${state.activeProject.name} — ${state.activeScene.name}` + (channelFilter !== 'all' ? ` [${channelFilter} Only]` : '');
    document.getElementById('reportModalSummarySub').textContent =
      `Venue: ${state.activeProject.venueConfig.name} (${state.activeProject.venueConfig.width}m × ${state.activeProject.venueConfig.length}m) • Fixtures Shown: ${fixtures.length} • Cameras: ${cameras.length} • Total Power: ${pwr.totalWatts}W (${pwr.totalAmps}A @ 220V)`;

    const headingEl = document.getElementById('reportDmxSectionHeading');
    if (headingEl) {
      const titleMap = {
        dmx: 'DMX Patch Sheet',
        lights: 'Lights Sheet',
        full: 'Lights & DMX Sheet'
      };
      headingEl.textContent = titleMap[layoutMode] || titleMap.dmx;
    }

    const headRow = document.getElementById('reportDmxTableHeadRow');
    if (headRow) {
      headRow.innerHTML = activeCols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    }

    const dmxTbody = document.getElementById('reportDmxTableBody');
    if (!fixtures.length) {
      dmxTbody.innerHTML = `<tr><td colspan="${activeCols.length}" style="text-align:center; color:var(--text-muted);">No lighting fixtures placed for this selection.</td></tr>`;
    } else {
      dmxTbody.innerHTML = fixtures
        .map((f) => `<tr>${activeCols.map((c) => `<td>${c.html(f)}</td>`).join('')}</tr>`)
        .join('');
    }

    const paperPreviewEl = document.getElementById('reportDmxPaperPreview');
    const stdTableWrap = document.getElementById('reportDmxStandardWrap');
    if (paperPreviewEl && stdTableWrap) {
      if (layoutMode === 'dmx') {
        paperPreviewEl.innerHTML = buildProjectDmxPaperHTML(fixtures);
        paperPreviewEl.classList.remove('hidden');
        stdTableWrap.classList.add('hidden');
      } else {
        paperPreviewEl.classList.add('hidden');
        stdTableWrap.classList.remove('hidden');
      }
    }

    const camTbody = document.getElementById('reportCameraTableBody');
    if (!cameras.length) {
      camTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted);">No cameras placed in this scene.</td></tr>`;
    } else {
      camTbody.innerHTML = cameras
        .map(
          (c) => `<tr>
            <td><strong style="color:var(--accent-cyan);">${escapeHtml(c.camNumber)}</strong></td>
            <td>${escapeHtml(c.cameraBody)}</td>
            <td>${escapeHtml(c.lensModel)}</td>
            <td><strong>${c.focalLengthMm}mm</strong> (${global.CineLightDB.calculateHorizontalFOV(c.focalLengthMm)}°)</td>
            <td>${escapeHtml(c.tripodModel)}</td>
            <td>${escapeHtml(c.fStop)}</td>
            <td>${escapeHtml(c.iso)}</td>
            <td>${escapeHtml(c.shutter)}</td>
            <td>${escapeHtml(c.kelvin)}</td>
            <td style="font-family:monospace; font-size:0.76rem; color:var(--accent-amber);">${escapeHtml(formatSTLookSummary(c.stLook))}</td>
          </tr>`
        )
        .join('');
    }
    updateProjectReportLivePreview();
  }

  /**
   * Export to Excel (.xls / .xlsx compatible XML Workbook) — respects layout & hides empty columns
   */
  function exportExcelWorkbook() {
    if (!state.activeProject || !state.activeScene) return;
    const layoutMode = state.exportReportLayout || 'dmx';
    const fixtures = getSortedFixturesForReport(state.exportChannelFilter, layoutMode);
    const activeCols = getActiveFixtureReportColumns(fixtures, layoutMode);
    const cameras = getSortedCamerasForReport();

    const xmlEscape = (v) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const dmxHeaderXml = activeCols
      .map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c.label)}</Data></Cell>`)
      .join('');

    const dmxRowsXml = fixtures
      .map(
        (f) => `<Row>${activeCols
          .map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c.text(f))}</Data></Cell>`)
          .join('')}</Row>`
      )
      .join('');

    const camRowsXml = cameras
      .map(
        (c) => `<Row>
          <Cell><Data ss:Type="String">${xmlEscape(c.camNumber)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.cameraBody)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.lensModel)}</Data></Cell>
          <Cell><Data ss:Type="Number">${c.focalLengthMm || 35}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.tripodModel)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.fStop)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.iso)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.shutter)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(c.kelvin)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlEscape(formatSTLookSummary(c.stLook))}</Data></Cell>
        </Row>`
      )
      .join('');

    const xlsOrient = getActiveReportOrientation() === 'landscape' ? 'Landscape' : 'Portrait';
    const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Fixtures Sheet">
  <Table>
   <Row>${dmxHeaderXml}</Row>
   ${dmxRowsXml}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup><Layout x:Orientation="${xlsOrient}"/></PageSetup>
  </WorksheetOptions>
 </Worksheet>
 <Worksheet ss:Name="Camera and ST Report">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Cam #</Data></Cell>
    <Cell><Data ss:Type="String">Camera Body</Data></Cell>
    <Cell><Data ss:Type="String">Lens</Data></Cell>
    <Cell><Data ss:Type="String">Zoom (mm)</Data></Cell>
    <Cell><Data ss:Type="String">Tripod</Data></Cell>
    <Cell><Data ss:Type="String">F-Stop</Data></Cell>
    <Cell><Data ss:Type="String">ISO</Data></Cell>
    <Cell><Data ss:Type="String">Shutter</Data></Cell>
    <Cell><Data ss:Type="String">Kelvin</Data></Cell>
    <Cell><Data ss:Type="String">ST Look (Con/Hi/Shd/Fade/Sat/Shp/Clr)</Data></Cell>
   </Row>
   ${camRowsXml}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup><Layout x:Orientation="${xlsOrient}"/></PageSetup>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const fileName = (state.activeProject.name || 'CineLight_Report').replace(/[^\w\u0600-\u06FF\-]+/g, '_') + `_${layoutMode.toUpperCase()}_Report.xls`;
    triggerDownloadBlob(blob, fileName);
    showToast('📗 تم تصدير ملف الإكسيل بنجاح');
  }

  /**
   * Export to CSV (.csv) — respects layout & hides empty columns
   */
  function exportCSVReport() {
    if (!state.activeProject || !state.activeScene) return;
    const layoutMode = state.exportReportLayout || 'dmx';
    const fixtures = getSortedFixturesForReport(state.exportChannelFilter, layoutMode);
    const activeCols = getActiveFixtureReportColumns(fixtures, layoutMode);
    const cameras = getSortedCamerasForReport();

    const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [];

    lines.push([`=== FIXTURES SHEET (${layoutMode.toUpperCase()}) ===`].map(csvCell).join(','));
    lines.push(activeCols.map((c) => csvCell(c.label)).join(','));
    fixtures.forEach((f) => {
      lines.push(activeCols.map((c) => csvCell(c.text(f))).join(','));
    });

    lines.push('');
    lines.push(['=== CAMERA & SONY CREATIVE LOOK (ST) REPORT ==='].map(csvCell).join(','));
    lines.push(['Cam #', 'Camera Body', 'Lens', 'Zoom (mm)', 'Tripod', 'F-Stop', 'ISO', 'Shutter', 'Kelvin', 'ST Look (Con/Hi/Shd/Fade/Sat/Shp/Clr)'].map(csvCell).join(','));
    cameras.forEach((c) => {
      lines.push(
        [
          c.camNumber,
          c.cameraBody,
          c.lensModel,
          c.focalLengthMm,
          c.tripodModel,
          c.fStop,
          c.iso,
          c.shutter,
          c.kelvin,
          formatSTLookSummary(c.stLook)
        ]
          .map(csvCell)
          .join(',')
      );
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const fileName = (state.activeProject.name || 'CineLight').replace(/[^\w\u0600-\u06FF\-]+/g, '_') + `_${layoutMode.toUpperCase()}_Report.csv`;
    triggerDownloadBlob(blob, fileName);
    showToast('📄 تم تحميل ملف الـ CSV بنجاح');
  }

  /**
   * Build shared Print / Word HTML report (with Plot Image + exact Table Layout)
   */
  // ==========================================================================
  // PROJECT CREW & DESIGNERS MODAL ("المصممين" - Conditional Printable Sheet)
  // ==========================================================================
  function getActiveSceneCamerasSorted() {
    if (!state.activeScene || !Array.isArray(state.activeScene.items)) return [];
    const cams = state.activeScene.items.filter((i) => i.itemType === 'camera');
    return cams.sort((a, b) => {
      const na = parseInt(String(a.camNumber || '').replace(/\D+/g, ''), 10) || 999;
      const nb = parseInt(String(b.camNumber || '').replace(/\D+/g, ''), 10) || 999;
      return na - nb;
    });
  }

  function getProjectCrewNormalized() {
    const p = state.activeProject;
    if (!p) {
      return {
        dop: '',
        lightingProgrammer: '',
        director: '',
        equipmentManager: '',
        cameraOperators: {},
        technicians: []
      };
    }
    const c = p.crew || {};
    const hasSavedCrewObj = !!p.crew;
    return {
      dop: (hasSavedCrewObj ? (c.dop || '') : (c.dop || p.dop || '')).trim(),
      lightingProgrammer: (hasSavedCrewObj ? (c.lightingProgrammer || '') : (c.lightingProgrammer || p.programmer || '')).trim(),
      director: String(c.director || '').trim(),
      equipmentManager: String(c.equipmentManager || '').trim(),
      cameraOperators: c.cameraOperators && typeof c.cameraOperators === 'object' ? { ...c.cameraOperators } : {},
      technicians: Array.isArray(c.technicians) ? c.technicians.map((t) => String(t || '').trim()).filter(Boolean) : []
    };
  }

  function appendTechnicianInputRow(container, value = '') {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'crew-tech-row';
    row.style.cssText = 'display:flex; gap:6px; align-items:center;';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control crew-tech-input';
    input.placeholder = 'اسم الفني...';
    input.value = value || '';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger';
    delBtn.style.cssText = 'padding:6px 10px; font-size:0.78rem; flex-shrink:0;';
    delBtn.textContent = '✕';
    delBtn.title = 'حذف';
    delBtn.onclick = () => removeCrewTechnicianRow(delBtn);

    row.appendChild(input);
    row.appendChild(delBtn);
    container.appendChild(row);
  }

  function addCrewTechnicianRow(initialValue = '') {
    const list = document.getElementById('crewTechniciansList');
    if (!list) return;
    appendTechnicianInputRow(list, initialValue);
    const inputs = list.querySelectorAll('.crew-tech-input');
    if (inputs.length > 0 && !initialValue) {
      inputs[inputs.length - 1].focus();
    }
  }

  function removeCrewTechnicianRow(btnEl) {
    const list = document.getElementById('crewTechniciansList');
    const row = btnEl?.closest('.crew-tech-row');
    if (!list || !row) return;
    row.remove();
    if (list.querySelectorAll('.crew-tech-row').length === 0) {
      appendTechnicianInputRow(list, '');
    }
  }

  function updateNewProjCrewButtonLabel() {
    const btn = document.getElementById('newProjCrewBtn');
    if (!btn) return;
    const c = state.newProjectDraftCrew;
    if (!c) {
      btn.textContent = '🎬 Crew';
      return;
    }
    let count = 0;
    if (c.dop) count++;
    if (c.lightingProgrammer) count++;
    if (c.director) count++;
    if (c.equipmentManager) count++;
    if (Array.isArray(c.technicians) && c.technicians.length > 0) count += c.technicians.length;
    btn.textContent = count > 0 ? `🎬 Crew (${count})` : '🎬 Crew';
  }

  function openCrewModal(mode) {
    const useDraft = mode === 'draft' || !state.activeProject;
    if (!useDraft && !state.activeProject) return;
    state.crewModalMode = useDraft ? 'draft' : 'project';
    if (!useDraft) {
      global.ShamsWorkspaceUI?.toggleSidebar?.(false);
    }

    const crew = useDraft
      ? (() => {
          const d = state.newProjectDraftCrew || {};
          const formDop = (document.getElementById('newProjDop')?.value || '').trim();
          const formProg = (document.getElementById('newProjProgrammer')?.value || '').trim();
          return {
            dop: (d.dop !== undefined ? d.dop : formDop).trim(),
            lightingProgrammer: (d.lightingProgrammer !== undefined ? d.lightingProgrammer : formProg).trim(),
            director: String(d.director || '').trim(),
            equipmentManager: String(d.equipmentManager || '').trim(),
            cameraOperators: {},
            technicians: Array.isArray(d.technicians) ? d.technicians.map((t) => String(t || '').trim()).filter(Boolean) : []
          };
        })()
      : getProjectCrewNormalized();
    const dopEl = document.getElementById('crewDopInput');
    const progEl = document.getElementById('crewProgrammerInput');
    const dirEl = document.getElementById('crewDirectorInput');
    const eqMgrEl = document.getElementById('crewEquipMgrInput');

    if (dopEl) dopEl.value = crew.dop;
    if (progEl) progEl.value = crew.lightingProgrammer;
    if (dirEl) dirEl.value = crew.director;
    if (eqMgrEl) eqMgrEl.value = crew.equipmentManager;

    // 1. Dynamic Camera Operators (exactly matching placed cameras in current scene)
    const opWrap = document.getElementById('crewOperatorsList');
    if (opWrap) {
      if (useDraft) {
        opWrap.innerHTML =
          '<p class="muted-text" style="font-size:0.8rem; margin:0; padding:8px 10px; border-radius:8px; background:rgba(148,163,184,0.09);">سيتم إظهار خانات المصورين تلقائياً بعد إنشاء المشروع وإضافة الكاميرات داخل المشهد.</p>';
      } else {
        const cams = getActiveSceneCamerasSorted();
        if (cams.length === 0) {
          opWrap.innerHTML =
            '<p class="muted-text" style="font-size:0.8rem; margin:0; padding:8px 10px; border-radius:8px; background:rgba(148,163,184,0.09);">لا توجد كاميرات مضافة في هذا المشهد حالياً — أضف كاميرا لتظهر خانة المصور تلقائياً.</p>';
        } else {
          opWrap.innerHTML = '';
          cams.forEach((cam, idx) => {
            const camNum = cam.camNumber || `Cam ${idx + 1}`;
            const camModel = cam.name || cam.label || '';
            const savedName = crew.cameraOperators[cam.id] || crew.cameraOperators[camNum] || '';

            const fieldWrap = document.createElement('div');
            fieldWrap.className = 'form-group';
            fieldWrap.style.margin = '0';

            const lbl = document.createElement('label');
            lbl.textContent = `📷 مصور ${camNum}${camModel ? ` (${camModel})` : ''}`;

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'form-control crew-operator-input';
            inp.dataset.camId = cam.id;
            inp.dataset.camNum = camNum;
            inp.placeholder = `اسم مصور ${camNum}...`;
            inp.value = savedName;

            fieldWrap.appendChild(lbl);
            fieldWrap.appendChild(inp);
            opWrap.appendChild(fieldWrap);
          });
        }
      }
    }

    // 2. Dynamic Technicians list
    const techList = document.getElementById('crewTechniciansList');
    if (techList) {
      techList.innerHTML = '';
      if (crew.technicians.length > 0) {
        crew.technicians.forEach((name) => appendTechnicianInputRow(techList, name));
      } else {
        appendTechnicianInputRow(techList, '');
      }
    }

    openModal('projectCrewModal');
  }

  async function saveCrewModal(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const isDraft = state.crewModalMode === 'draft' || !state.activeProject;

    const dop = (document.getElementById('crewDopInput')?.value || '').trim();
    const lightingProgrammer = (document.getElementById('crewProgrammerInput')?.value || '').trim();
    const director = (document.getElementById('crewDirectorInput')?.value || '').trim();
    const equipmentManager = (document.getElementById('crewEquipMgrInput')?.value || '').trim();

    const technicians = [];
    document.querySelectorAll('#crewTechniciansList .crew-tech-input').forEach((inp) => {
      const val = (inp.value || '').trim();
      if (val) technicians.push(val);
    });

    if (isDraft) {
      state.newProjectDraftCrew = {
        dop,
        lightingProgrammer,
        director,
        equipmentManager,
        cameraOperators: {},
        technicians
      };
      const formDopEl = document.getElementById('newProjDop');
      const formProgEl = document.getElementById('newProjProgrammer');
      if (formDopEl) formDopEl.value = dop;
      if (formProgEl) formProgEl.value = lightingProgrammer;
      updateNewProjCrewButtonLabel();
      closeModal('projectCrewModal');
      showToast('✅ تم حفظ بيانات Crew للمشروع الجديد');
      return;
    }

    const prevOps = (state.activeProject.crew && state.activeProject.crew.cameraOperators) || {};
    const cameraOperators = { ...prevOps };
    document.querySelectorAll('#crewOperatorsList .crew-operator-input').forEach((inp) => {
      const camId = inp.dataset.camId;
      const camNum = inp.dataset.camNum;
      const val = (inp.value || '').trim();
      if (camId) cameraOperators[camId] = val;
      if (camNum) cameraOperators[camNum] = val;
    });

    state.activeProject.crew = {
      dop,
      lightingProgrammer,
      director,
      equipmentManager,
      cameraOperators,
      technicians
    };
    state.activeProject.dop = dop;
    state.activeProject.programmer = lightingProgrammer;

    await persistWorkspace();
    closeModal('projectCrewModal');

    // Refresh live report preview if Reports Modal is already open
    const repModal = document.getElementById('reportsModal');
    if (repModal && !repModal.classList.contains('hidden')) {
      renderProjectLiveSheetPreview();
    }
    showToast('✅ تم حفظ بيانات Crew');
  }

  function buildCrewReportBlockHTML() {
    if (!state.activeProject) return '';
    const crew = getProjectCrewNormalized();
    const items = [];

    if (crew.dop) {
      items.push({ label: 'DOP', value: crew.dop, dir: 'ltr' });
    }
    if (crew.lightingProgrammer) {
      items.push({ label: 'Lighting Programmer', value: crew.lightingProgrammer, dir: 'ltr' });
    }
    if (crew.director) {
      items.push({ label: 'المخرج', value: crew.director, dir: 'rtl' });
    }
    if (crew.equipmentManager) {
      items.push({ label: 'مسؤول المعدات', value: crew.equipmentManager, dir: 'rtl' });
    }

    const cams = getActiveSceneCamerasSorted();
    const opsPairs = [];
    cams.forEach((cam, idx) => {
      const camNum = cam.camNumber || `Cam ${idx + 1}`;
      const opName = String(crew.cameraOperators[cam.id] || crew.cameraOperators[camNum] || '').trim();
      if (opName) {
        opsPairs.push(`${camNum}: ${opName}`);
      }
    });
    if (opsPairs.length > 0) {
      items.push({ label: 'المصورين', value: opsPairs.join('  •  '), dir: 'rtl' });
    }

    if (crew.technicians.length > 0) {
      items.push({ label: 'الفنيين', value: crew.technicians.join(' ، '), dir: 'rtl' });
    }

    if (items.length === 0) return '';

    const rows = [];
    let idx = 0;
    while (idx < items.length) {
      const rem = items.length - idx;
      const take = rem === 4 || rem === 2 ? 2 : (rem === 1 ? 1 : 3);
      rows.push(items.slice(idx, idx + take));
      idx += take;
    }

    const tablesHtml = rows
      .map((row) => {
        const colPct = (100 / row.length).toFixed(2);
        const cells = row
          .map(
            (item) => `
              <td style="width:${colPct}%;border:1.2px solid #94a3b8;background:#f8fafc;padding:5px 8px;text-align:center;vertical-align:middle;">
                <div style="font-size:7.3pt;font-weight:800;color:#475569;margin-bottom:2px;letter-spacing:0.2px;" dir="${item.dir}">${escapeHtml(item.label)}</div>
                <div style="font-size:8.9pt;font-weight:900;color:#0f172a;line-height:1.28;word-break:break-word;" dir="${item.dir}">${escapeHtml(item.value)}</div>
              </td>`
          )
          .join('');
        return `
          <table class="print-crew-table" dir="rtl" style="width:100%;table-layout:fixed;border-collapse:collapse;margin-bottom:4px;">
            <tr>${cells}</tr>
          </table>`;
      })
      .join('');

    return `<div class="print-crew-wrap" dir="rtl" style="margin:0 0 10px 0;">${tablesHtml}</div>`;
  }

  function buildProjectBalancedTableHTML(rows, candidateCols, orientation) {
    const hasVal = (v) => {
      const s = String(v === undefined || v === null ? '' : v).trim();
      return s !== '' && s !== '—' && s !== '-';
    };
    const activeCols = candidateCols.filter((col) => {
      if (col.alwaysShow) return true;
      return (rows || []).some((r, idx) => {
        const val = typeof col.raw === 'function' ? col.raw(r, idx) : (typeof col.getter === 'function' ? col.getter(r, idx) : r[col.key]);
        return hasVal(val);
      });
    });

    const metrics = getProjectPaperAdaptiveMetrics(rows.length, activeCols.length, false, orientation);
    const totalWeight = activeCols.reduce((sum, c) => sum + (Number(c.weight) || 12), 0) || 100;
    const colWidths = activeCols.map((c) => `${(((Number(c.weight) || 12) / totalWeight) * 100).toFixed(2)}%`);

    const rowsHtml = rows
      .map((row, idx) => {
        const rowBg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
        const tds = activeCols
          .map((col, ci) => {
            const v = typeof col.getter === 'function' ? col.getter(row, idx) : row[col.key];
            const cellContent = col.allowHtml ? (v || '—') : escapeHtml(v || '—');
            const tdStyle = `padding:${metrics.cellPad};font-size:${metrics.fontSize};line-height:${metrics.lineHeight};text-align:${col.align || 'right'};width:${colWidths[ci]};box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;white-space:normal;${col.bold || col.key === 'idx' ? 'font-weight:700;' : ''}${col.dir ? `direction:${col.dir};` : ''}${rowBg}`;
            return `<td style="${tdStyle}">${cellContent}</td>`;
          })
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');

    return `
      <table class="paper-balanced-table" dir="rtl" border="1" cellspacing="0" cellpadding="4" style="width:100%;max-width:100%;table-layout:fixed;box-sizing:border-box;border-collapse:collapse;margin:${metrics.tableMargin};font-size:${metrics.fontSize};line-height:${metrics.lineHeight};">
        <thead>
          <tr>${activeCols.map((c, ci) => `<th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:${c.align || 'right'};width:${colWidths[ci]};box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(c.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  function buildProjectLightPaperHTML(fixtures, cameras, layoutMode, orient) {
    const parts = [];
    const sceneItems = (state.activeScene && Array.isArray(state.activeScene.items)) ? state.activeScene.items : [];
    const getAttachedAccNames = (fix) =>
      sceneItems
        .filter((it) => it.id !== fix.id && (it.attachedTo === fix.id || it.attachedToFixtureId === fix.id))
        .map((it) => it.name || it.label || '')
        .filter(Boolean)
        .join(' + ');

    if (fixtures.length > 0) {
      parts.push(`<div style="font-size:10pt;font-weight:800;color:#0f172a;margin:2px 0 5px;direction:rtl;text-align:right;">💡 Fixtures</div>`);
      const fixtureCols = [
        {
          key: 'idx',
          label: '#',
          alwaysShow: true,
          align: 'center',
          weight: 7,
          getter: (f) => (f.fixtureNum === 0 || f.isNonDmx ? '0' : `#${f.fixtureNum || 1}`)
        },
        {
          key: 'name',
          label: 'Fixture',
          alwaysShow: true,
          align: 'right',
          bold: true,
          weight: 21,
          getter: (f) => `${f.name || ''}${f.label && f.label !== f.name ? ` (${f.label})` : ''}`
        },
        { key: 'location', label: 'Location', align: 'right', weight: 14 },
        ...(layoutMode === 'full'
          ? [
              { key: 'channel', label: 'Channel', align: 'center', dir: 'ltr', weight: 10 },
              {
                key: 'startAddress',
                label: 'Address',
                align: 'center',
                dir: 'ltr',
                bold: true,
                weight: 9,
                getter: (f) => ((Number(f.footprint) || 0) > 0 ? String(f.startAddress || '') : '')
              }
            ]
          : []),
        {
          key: 'dimmer',
          label: 'Dimmer',
          alwaysShow: true,
          align: 'center',
          dir: 'ltr',
          weight: 9,
          getter: (f) => `${f.dimmer ?? 100}%`
        },
        {
          key: 'kelvin',
          label: 'Kelvin',
          align: 'center',
          dir: 'ltr',
          weight: 9,
          raw: (f) => getCleanFixtureKelvin(f),
          getter: (f) => getCleanFixtureKelvin(f)
        },
        {
          key: 'color',
          label: 'Color',
          align: 'center',
          allowHtml: true,
          weight: 10,
          raw: (f) => getCleanFixtureColor(f),
          getter: (f) => {
            const cName = getCleanFixtureColor(f);
            if (!cName) return '';
            const hex = f.color && f.color.startsWith('#') ? f.color : '#fff3d6';
            return `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${escapeHtml(hex)};margin-left:4px;border:1px solid rgba(0,0,0,0.28);vertical-align:middle;"></span>${escapeHtml(cName)}`;
          }
        },
        {
          key: 'accessory',
          label: 'Accessory',
          align: 'right',
          weight: 12,
          raw: (f) => getAttachedAccNames(f),
          getter: (f) => getAttachedAccNames(f)
        },
        { key: 'notes', label: 'Notes', align: 'right', weight: 12 }
      ];
      parts.push(buildProjectBalancedTableHTML(fixtures, fixtureCols, orient));
    } else {
      parts.push(`<p style="text-align:center;padding:12px;color:#64748b;">No lighting fixtures placed.</p>`);
    }

    if (cameras.length > 0) {
      parts.push(`<div style="font-size:10pt;font-weight:800;color:#0f172a;margin:${fixtures.length > 0 ? '10px' : '2px'} 0 5px;direction:rtl;text-align:right;">🎥 Cameras</div>`);
      const canStLook = canAccess('cameraSettings') && canAccess('paperCameraStLook');
      const isCamSTModified = (st) => {
        if (!st || typeof st !== 'object') return false;
        return (
          (Number(st.contrast) || 0) !== 0 ||
          (Number(st.highlights) || 0) !== 0 ||
          (Number(st.shadows) || 0) !== 0 ||
          (Number(st.fade) || 0) !== 0 ||
          (Number(st.saturation) || 0) !== 0 ||
          (st.sharpness !== undefined && Number(st.sharpness) !== 4) ||
          (Number(st.clarity) || 0) !== 0
        );
      };
      const cameraCols = [
        { key: 'camNumber', label: '#', alwaysShow: true, align: 'center', dir: 'ltr', bold: true, weight: 8 },
        { key: 'cameraBody', label: 'Camera', alwaysShow: true, align: 'right', bold: true, weight: 15 },
        {
          key: 'lensModel',
          label: 'Lens',
          alwaysShow: true,
          align: 'center',
          dir: 'ltr',
          weight: 14,
          getter: (c) => `${c.lensModel || ''}${c.focalLengthMm ? ` (${c.focalLengthMm}mm)` : ''}`
        },
        { key: 'tripodModel', label: 'Location / Mount', align: 'right', weight: 11 },
        { key: 'kelvin', label: 'Kelvin', align: 'center', dir: 'ltr', weight: 8 },
        { key: 'iso', label: 'ISO', align: 'center', dir: 'ltr', weight: 8 },
        { key: 'fStop', label: 'F-Stop', align: 'center', dir: 'ltr', weight: 7 },
        { key: 'shutter', label: 'Shutter', align: 'center', dir: 'ltr', weight: 8 }
      ];
      if (canStLook) {
        cameraCols.push({
          key: 'stLook',
          label: 'ST Look',
          alwaysShow: false,
          align: 'center',
          dir: 'ltr',
          weight: 15,
          raw: (c) => (isCamSTModified(c.stLook) ? formatSTLookSummary(c.stLook) : ''),
          getter: (c) => (isCamSTModified(c.stLook) ? formatSTLookSummary(c.stLook) : '')
        });
      }
      cameraCols.push({ key: 'notes', label: 'Notes', align: 'right', weight: 9 });
      parts.push(buildProjectBalancedTableHTML(cameras, cameraCols, orient));
    }

    return parts.join('');
  }

  function buildPrintableReportHTML(plotModeOverride) {
    if (!state.activeProject || !state.activeScene || !state.canvasEngine) return '';
    const filter = state.exportChannelFilter || 'all';
    const layoutMode = state.exportReportLayout || 'dmx';
    const orient = getActiveReportOrientation();
    const scope = getActiveReportContentScope();
    const plotMode = plotModeOverride || document.getElementById('exportPlotModeSelect')?.value || 'fit_venue';

    const includePlot = scope === 'all' || scope === 'plot';
    const includeSheet = scope === 'all' || scope === 'sheet';
    const isFullPagePlot = includePlot && !includeSheet;

    const fixtures = getSortedFixturesForReport(filter, layoutMode);
    const cameras = getSortedCamerasForReport();
    const plotImgUrl = includePlot
      ? state.canvasEngine.exportHighResPlotDataURL(filter, plotMode, orient, {
          fullPagePlot: isFullPagePlot,
          forPrint: true
        })
      : '';
    const pwr = global.CineLightDB.calculatePowerLoad(state.activeScene);
    const v = state.activeProject.venueConfig || {};
    const appSettings = global.CineLightDB?.getAppSettingsSync?.() || {};
    const reportLogoSrc = appSettings.logoDataURL || appSettings.appLogoDataUrl || './FB_IMG_1794520985975.jpg';
    const crewBlockHtml = buildCrewReportBlockHTML();

    const venueSub = v.name ? ` — المكان: ${escapeHtml(v.name)}` : '';

    return `
      <table class="sheet-header-table" dir="rtl" style="width:100%;border-collapse:collapse;border:none;border-bottom:2.5px solid #0f172a;margin-bottom:12px;">
        <tr>
          <td style="border:none;padding:0 0 8px 0;text-align:right;vertical-align:middle;">
            <img src="${escapeHtml(reportLogoSrc)}" alt="Logo" style="width:40px;height:40px;object-fit:contain;background:#fff;padding:2px;border-radius:6px;vertical-align:middle;margin-left:8px;" />
            <span style="font-size:15pt;font-weight:900;color:#0f172a;vertical-align:middle;">
              ${escapeHtml(state.activeProject.name)}${filter !== 'all' ? ` (${escapeHtml(filter)})` : ''}
            </span>
            <div style="margin-top:4px;font-size:9pt;font-weight:700;color:#334155;">
              ${escapeHtml(state.activeScene.name)}${venueSub}
            </div>
          </td>
          <td style="border:none;padding:0 0 8px 0;text-align:left;vertical-align:middle;direction:ltr;">
            <strong style="font-size:13pt;font-weight:900;color:#0f172a;letter-spacing:0.4px;">ShamsElber DMX</strong><br/>
            <span style="font-size:7.8pt;color:#475569;font-weight:700;">Total Power: ${pwr.totalWatts}W (${pwr.totalAmps}A) • ${new Date().toLocaleDateString()}</span>
          </td>
        </tr>
      </table>

      ${crewBlockHtml}

      ${
        includePlot
          ? `<div style="font-size:10pt;font-weight:800;color:#0f172a;margin:2px 0 6px;direction:rtl;text-align:right;">
              Stage Plot ${filter !== 'all' ? `[${escapeHtml(filter)}]` : ''}
            </div>
            <img class="print-plot-img${isFullPagePlot ? ' print-plot-img-full' : ''}" src="${plotImgUrl}" alt="Stage Plot" />`
          : ''
      }

      ${
        includeSheet
          ? (layoutMode === 'dmx'
              ? buildProjectDmxPaperHTML(fixtures, orient)
              : buildProjectLightPaperHTML(fixtures, cameras, layoutMode, orient))
          : ''
      }
    `;
  }

  /**
   * Export to Word (.doc) with exact same table & header layout as Print
   */
  function exportWordReport() {
    if (!state.activeProject || !state.activeScene || !state.canvasEngine) return;
    const layoutMode = state.exportReportLayout || 'dmx';
    const orient = getActiveReportOrientation();
    const reportHtml = buildPrintableReportHTML();
    const fileName = (state.activeProject.name || 'ShamsElber_Report').replace(/[^\w\u0600-\u06FF\-]+/g, '_') + `_${layoutMode.toUpperCase()}_${orient}.doc`;
    if (global.ShamsExport && typeof global.ShamsExport.exportWord === 'function') {
      global.ShamsExport.exportWord(
        reportHtml,
        fileName,
        `${state.activeProject.name} - ${state.activeScene.name}`,
        { orientation: orient }
      );
      showToast('📘 تم حفظ ملف الـ Word بنفس جدول واتجاه الورقة المختار');
      return;
    }
    const blob = new Blob(['\ufeff' + reportHtml], { type: 'application/msword;charset=utf-8' });
    triggerDownloadBlob(blob, fileName);
    showToast('📘 تم حفظ ملف الـ Word بنجاح');
  }

  /**
   * Print / Export PDF (Respects Layout Selector, Channel Filter, Orientation & Hides Empty Columns)
   */
  function printOrExportPDF() {
    if (!state.activeProject || !state.activeScene || !state.canvasEngine) return;
    const fmtSel = document.getElementById('exportPrintFormatSelect');
    const printFormat = fmtSel ? fmtSel.value : (global.CineLightDB?.getAppSettingsSync?.()?.defaultPrintFormat || 'A4');
    const orient = getActiveReportOrientation();
    const reportHtml = buildPrintableReportHTML();

    if (global.ShamsExport && typeof global.ShamsExport.print === 'function') {
      global.ShamsExport.print(reportHtml, {
        format: printFormat,
        orientation: orient,
        dir: 'rtl',
        title: `${state.activeProject.name} - ${state.activeScene.name}`
      });
      return;
    }

    let orientStyle = document.getElementById('shamsDynamicPrintOrient');
    if (!orientStyle) {
      orientStyle = document.createElement('style');
      orientStyle.id = 'shamsDynamicPrintOrient';
      document.head.appendChild(orientStyle);
    }
    orientStyle.textContent = `@media print { @page { size: A4 ${orient}; margin: 9mm; } }`;

    const printArea = document.getElementById('printableReportArea');
    printArea.classList.toggle('print-orient-landscape', orient === 'landscape');
    printArea.classList.toggle('print-orient-portrait', orient !== 'landscape');
    printArea.innerHTML = reportHtml;
    window.print();
  }

  /**
   * Export Plot Image (.png) with 2 Modes + Orientation:
   * - 'current': exact current viewport pan/zoom at ultra-high resolution
   * - 'fit_venue': auto-fitted to exact building bounds at ultra-high resolution
   */
  function exportPlotPNG(mode = 'current') {
    if (!state.canvasEngine || !state.activeProject) return;
    const filter = state.exportChannelFilter || 'all';
    const exportMode = mode === 'fit_venue' ? 'fit_venue' : 'current';
    const orient = getActiveReportOrientation();
    const dataUrl = state.canvasEngine.exportHighResPlotDataURL(filter, exportMode, orient);
    const chSuffix = filter !== 'all' ? '_' + filter.replace(/\s+/g, '_') : '_All_Channels';
    const modeSuffix = exportMode === 'fit_venue' ? '_Fit_Building' : '_Current_View';
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = (state.activeProject.name || 'Stage_Plot').replace(/[^\w\u0600-\u06FF\-]+/g, '_') + chSuffix + modeSuffix + '_' + orient + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    const orientLbl = orient === 'landscape' ? 'بالعرض' : 'بالطول';
    showToast(
      exportMode === 'fit_venue'
        ? `🏛️ تم تصدير صورة المخطط (${orientLbl}) مضبوطة على مقاس المبنى بدقة فائقة`
        : `🖼️ تم تصدير صورة المخطط (${orientLbl}) على الوضع الحالي بدقة فائقة`
    );
  }

  function triggerDownloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Expose Public API
  global.CineApp = {
    // ---- Shared accessors for modules (settings.js, paper-project.js, workspace-ui.js, three-view.js, export-utils.js) ----
    getState: () => state,
    getWorkspace: () => state.workspace,
    getCurrentUser: () => state.currentUser,
    getActiveProject: () => state.activeProject,
    getCurrentProject: () => state.activeProject,
    getActiveScene: () => state.activeScene,
    getCanvasEngine: () => state.canvasEngine,
    persistWorkspace: () => persistWorkspace(),
    saveCurrentProject: () => persistWorkspace(),
    showToast: (msg, duration) => showToast(msg, duration),
    notify: (msg, duration) => showToast(msg, duration),
    escapeHtml: (s) => escapeHtml(s),
    isAdminUser: (u) => isAdminUser(u),
    canAccess: (k) => canAccess(k),
    updatePowerLoadUI: () => updatePowerLoadUI(),
    renderUsersManagerSection: () => renderUsersManagerSection(),
    refreshDashboardAll: () => refreshDashboardAll(),
    // ---------------------------------------------------------------------------------------------------------------
    init,
    toggleTheme,
    installPWA,
    handleAuthSubmit,
    handleLogout,
    switchDashboardSection,
    exitPaperProjectToDashboard,
    onNewProjVenueTemplateChange,
    onNewProjVenueTypeChange,
    handleCreateNewProject,
    openProjectInWorkspace,
    openProjectReportsFromDashboard,
    closeProjectToDashboard,
    applyUserPermissionsUI,
    duplicateProject,
    renameProjectPrompt,
    deleteProject,
    shareOrExportProjectJSON,
    handleImportProjectFile,
    filterEqManagerCategory,
    openCategoryModal,
    saveCategoryCrud,
    deleteCategory,
    openEquipmentModal,
    onEqCrudCategoryChange,
    handleEqImageUpload,
    clearEqCustomImage,
    saveEquipmentCrud,
    deleteEquipmentItem,
    useVenueForNewProject,
    openVenueModal,
    onVenueCrudTypeChange,
    autoSpacePlateauPipes,
    addTrussCrossbarRow,
    updateTrussCrossbarField,
    removeTrussCrossbarRow,
    saveVenueCrud,
    deleteVenueTemplate,
    openLiveVenueEditor,
    openUserCrudModal,
    setAllUserModalPerms,
    onUserCrudRoleChange,
    saveUserCrud,
    onUserCardPermToggle,
    onUserCardRoleChange,
    deleteUserAccount,
    openChangePasswordModal,
    saveChangePassword,
    toggleEquipmentDrawer,
    switchDrawerCategory,
    placeEquipmentOnStage,
    hideLeftDpad,
    showLeftDpad,
    toggleLeftDpadFromToolbar,
    toggleControlPadLock,
    scaleSelected,
    dpadAction,
    toggleSelectedPositionLock,
    toggleSelectedFloorGroundMount,
    onFresnelZoomChange,
    onFixModalMountChange,
    unlockSelectedAttachments,
    openSelectedSettingsModal,
    duplicateSelectedItem,
    deleteSelectedItem,
    toggleDmxCableDrawMode,
    setDmxCableColor,
    setDmxCableStyle,
    setDmxCableChannelTag,
    finishCurrentDmxCable,
    undoDmxCablePoint,
    deleteSelectedCustomCable,
    clearAllDmxCables,
    onFixtureModalModelSwitch,
    onFixtureModalChannelSwitch,
    syncFixtureDimmer,
    onFixtureModalFieldChange,
    saveFixtureInspector,
    applyFixtureInspectorLive,
    onCameraModalLensChange,
    syncCameraFocalLength,
    updateSTLabel,
    resetSonySTLook,
    saveCameraInspector,
    savePropInspector,
    toggleShowInfoMenu,
    onShowInfoFlagChange,
    setAllInfoFlags,
    toggleDisplayMode,
    toggleUpperSection,
    toggle2D3DMode,
    toggle3DOrbitDrag,
    toggleDmxWiring,
    zoomViewport,
    fitViewport,
    togglePowerPopover,
    switchScene,
    addNewScene,
    duplicateActiveScene,
    renameActiveScene,
    openCrewModal,
    addCrewTechnicianRow,
    removeCrewTechnicianRow,
    saveCrewModal,
    openReportsModal,
    onExportReportLayoutChange,
    onExportChannelFilterChange,
    onExportOrientationChange,
    onExportContentScopeChange,
    onExportPlotModeChange,
    exportExcelWorkbook,
    exportWordReport,
    exportCSVReport,
    printOrExportPDF,
    exportPlotPNG,
    toggleReportPrintMenu,
    closeAllPrintMenus,
    closeModal
  };

  window.addEventListener('DOMContentLoaded', init);
})(window);
