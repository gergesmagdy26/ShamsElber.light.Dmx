/**
 * ============================================================================
 * ShamsElber light. DMX — Workspace UI Controller (workspace-ui.js)
 * - Right-side Collapsible Tools Drawer (`#shamsSidebarDrawer` on the RIGHT)
 * - Keeps `#equipmentDrawer` (Add to Plot) docked on the LEFT (`شمال`) as before
 * - Keeps `.scenes-bar` (Scenes) at the TOP (`فوق`) as before
 * - Fixes `Show Info` and `Power Load` popovers so they open reliably every time
 * - Compact Small Gear Icon (`⚙️`) for Project Settings
 * ============================================================================
 */
(function (global) {
    'use strict';

    const PINNABLE_ITEMS = [
        { id: 'pin_equipmentBtn', label: '🧰 Equipment' },
        { id: 'pin_showInfo', label: '👁️ Show Info' },
        { id: 'pin_displayMode', label: '🖥️ Display' },
        { id: 'pin_view3d', label: '🧊 3D View' },
        { id: 'pin_drawCable', label: '✏️ Draw DMX' },
        { id: 'pin_autoDmx', label: '🔌 Auto DMX' },
        { id: 'pin_venueEditor', label: '🏗️ Venue' },
        { id: 'pin_aimPad', label: '🔒 Control' },
        { id: 'pin_alignTools', label: '📏 محاذاة وتوزيع الكشافات' },
        { id: 'pin_crewDesigners', label: '🎬 Crew' },
        { id: 'pin_powerLoad', label: '⚡ Power' },
        { id: 'pin_reports', label: '📊 Export' }
    ];

    const DEFAULT_PROJECT_SETTINGS = {
        pinnedItems: ['pin_equipmentBtn', 'pin_showInfo', 'pin_view3d', 'pin_powerLoad', 'pin_reports'],
        iconScale: 1.0,
        labelScale: 1.0,
        autoSave: true,
        historyDepth: 30,
        quality3d: 'high'
    };

    function getApp() {
        return global.CineApp || global.CineLightApp || null;
    }

    const ShamsWorkspaceUI = {
        initialized: false,
        sidebarOpen: false,
        settings: JSON.parse(JSON.stringify(DEFAULT_PROJECT_SETTINGS)),
        undoStack: [],
        redoStack: [],
        isRestoringHistory: false,
        toolElements: {},

        init() {
            if (this.initialized) return;
            const wsScreen = document.getElementById('workspaceScreen');
            if (!wsScreen) return;
            this.initialized = true;

            this.loadSavedSettings();
            this.restructureWorkspaceDOM(wsScreen);
            this.buildProjectSettingsModal();
            this.bindKeyboardShortcuts();
            this.applyProjectSettings();
        },

        loadSavedSettings() {
            try {
                const raw = localStorage.getItem('shams_workspace_ui_settings_v2');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    this.settings = Object.assign({}, DEFAULT_PROJECT_SETTINGS, parsed);
                }
            } catch (e) {}
        },

        saveSettings() {
            try {
                localStorage.setItem('shams_workspace_ui_settings_v2', JSON.stringify(this.settings));
            } catch (e) {}
            const proj = getApp()?.getActiveProject?.();
            if (proj) {
                proj.projectSettings = JSON.parse(JSON.stringify(this.settings));
                if (this.settings.autoSave !== false) {
                    getApp()?.persistWorkspace?.();
                }
            }
        },

        syncFromProject(project) {
            if (project && project.projectSettings) {
                this.settings = Object.assign({}, DEFAULT_PROJECT_SETTINGS, project.projectSettings);
            }
            this.undoStack = [];
            this.redoStack = [];
            this.checkpoint('Initial State');
            this.applyProjectSettings();
        },

        restructureWorkspaceDOM(wsScreen) {
            const upperSection = document.getElementById('workspaceUpperSection');
            const origTopbar = upperSection?.querySelector('.workspace-topbar');
            const origScenesBar = upperSection?.querySelector('.scenes-bar');
            const viewport = wsScreen.querySelector('.viewport-container');

            if (!upperSection || !origTopbar || !viewport) return;
            viewport.id = viewport.id || 'viewportContainer';

            // Capture references to original interactive controls
            const btnDash = origTopbar.querySelector('button[onclick*="closeProjectToDashboard"]');
            const btnEquip = origTopbar.querySelector('button[onclick*="toggleEquipmentDrawer"]');
            const titleBadge = document.getElementById('activeProjectTitleBadge');
            const showInfoWrapper = document.getElementById('showInfoDropdownBtn')?.closest('.dropdown-wrapper');
            const btnDisplay = origTopbar.querySelector('button[onclick*="toggleDisplayMode(true)"]');
            const btn3D = document.getElementById('toggleViewModeBtn');
            const btnDrawCable = document.getElementById('drawDmxCableModeBtn');
            const btnAutoDmx = document.getElementById('toggleDmxWiringBtn');
            const btnVenue = document.getElementById('btnLiveVenueEditor');
            const btnAimPad = document.getElementById('topbarToggleDpadBtn');
            const btnCrew = document.getElementById('topbarCrewDesignersBtn');
            const btnTheme = origTopbar.querySelector('.topbar-right button[onclick*="toggleTheme"]');
            const powerWrapper = document.getElementById('powerLoadBadge')?.closest('.dropdown-wrapper');
            const btnReports = document.getElementById('topbarExportReportsBtn');

            this.toolElements = {
                pin_equipmentBtn: btnEquip,
                pin_showInfo: showInfoWrapper,
                pin_displayMode: btnDisplay,
                pin_view3d: btn3D,
                pin_drawCable: btnDrawCable,
                pin_autoDmx: btnAutoDmx,
                pin_venueEditor: btnVenue,
                pin_aimPad: btnAimPad,
                pin_crewDesigners: btnCrew,
                pin_powerLoad: powerWrapper,
                pin_reports: btnReports
            };

            // Hide original multi-row topbar (Scenes bar `.scenes-bar` stays visible right below slimBar!)
            origTopbar.classList.add('hidden');

            // Create Slim Top Header Bar (with Home stacked above Project Name, Right Drawer trigger & Small Gear icon ⚙️)
            const slimBar = document.createElement('header');
            slimBar.id = 'workspaceSlimHeader';
            slimBar.className = 'shams-slim-topbar';
            slimBar.innerHTML = `
                <div class="shams-slim-left">
                    <div id="slimTitleHost" class="shams-slim-title-stack"></div>
                </div>
                <div class="shams-pinned-tools-bar" id="pinnedToolsBar"></div>
                <div class="shams-slim-right">
                    <div class="shams-undo-redo-group">
                        <button type="button" id="btnWorkspaceUndo" class="shams-icon-btn is-disabled" aria-disabled="true" title="Undo (Ctrl+Z)">↩</button>
                        <button type="button" id="btnWorkspaceRedo" class="shams-icon-btn is-disabled" aria-disabled="true" title="Redo (Ctrl+Y)">↪</button>
                    </div>
                    <div id="slimThemeHost"></div>
                    <button type="button" id="btnTopbarProjectGear" class="shams-compact-gear-btn" title="Project Settings">⚙️</button>
                    <button type="button" id="btnToggleShamsSidebar" class="shams-sidebar-trigger-btn" title="Tools Menu">
                        <span>☰</span> <span>Tools</span>
                    </button>
                </div>
            `;

            upperSection.insertBefore(slimBar, origScenesBar || origTopbar);

            const titleHost = document.getElementById('slimTitleHost');
            if (titleHost) {
                if (btnDash) {
                    btnDash.classList.add('shams-home-btn');
                    titleHost.appendChild(btnDash);
                }
                if (titleBadge) titleHost.appendChild(titleBadge);
            }
            if (btnTheme) document.getElementById('slimThemeHost')?.appendChild(btnTheme);

            // Create Right-Side Collapsible Tools Drawer & Backdrop
            // Note: #equipmentDrawer (Add to Plot) remains untouched in .workspace-body on the LEFT!
            const backdrop = document.createElement('div');
            backdrop.id = 'shamsSidebarBackdrop';
            backdrop.className = 'shams-sidebar-backdrop';

            const sidebar = document.createElement('aside');
            sidebar.id = 'shamsSidebarDrawer';
            sidebar.className = 'shams-workspace-sidebar';
            sidebar.innerHTML = `
                <div class="shams-sidebar-header">
                    <div class="shams-sidebar-header-title">
                        <span>🎛️</span>
                        <span>قائمة أدوات المخطط</span>
                    </div>
                    <button type="button" class="modal-close-btn" id="btnCloseShamsSidebar" title="إغلاق القائمة">✕</button>
                </div>

                <div class="shams-sidebar-scroll">
                    <!-- 1. Main Workspace Tools Host -->
                    <div class="shams-sidebar-section">
                        <div class="shams-sidebar-sec-title">
                            <span>🛠️ أدوات التحكم والعرض</span>
                        </div>
                        <div class="shams-tools-grid" id="sidebarToolsHost"></div>
                    </div>

                    <!-- 2. Multi-Select & Truss Auto-Align Tools -->
                    <div class="shams-sidebar-section" id="sidebarAlignSection">
                        <div class="shams-sidebar-sec-title">
                            <span>📏 محاذاة وتوزيع الكشافات</span>
                        </div>
                        <div id="sidebarAlignHost">
                            <div class="shams-tools-grid" id="alignToolsGroup">
                                <button type="button" id="btnMultiSelectToggle" class="btn btn-secondary" title="تفعيل التحديد المتعدد للكشافات على الشاشات اللمسية">
                                    ☑️ تحديد متعدد
                                </button>
                                <button type="button" id="btnSyncRotSelected" class="btn btn-secondary" title="توحيد زاوية التوجيه لكل الكشافات المحددة">
                                    🧭 توحيد الزاوية
                                </button>
                                <button type="button" id="btnSyncBeamSelected" class="btn btn-secondary" title="توحيد طول وزاوية الشعاع لكل الكشافات المحددة مع أول كشاف تم تحديده">
                                    🔦 توحيد الشعاع
                                </button>
                                <button type="button" id="btnAlignHoriz" class="btn btn-secondary" title="محاذاة الكشافات المحددة في صف أفقي واحد">
                                    ═ محاذاة أفقية
                                </button>
                                <button type="button" id="btnAlignVert" class="btn btn-secondary" title="محاذاة الكشافات المحددة في عمود رأسي واحد">
                                    ║ محاذاة رأسية
                                </button>
                                <button type="button" id="btnDistHoriz" class="btn btn-secondary" title="توزيع مسافات متساوية أفقياً على التراس أو الماسورة">
                                    ↔️ توزيع أفقي متساوي
                                </button>
                                <button type="button" id="btnDistVert" class="btn btn-secondary" title="توزيع مسافات متساوية رأسياً">
                                    ↕️ توزيع رأسي متساوي
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Compact Small Gear Icon ⚙️ at bottom of Right Sidebar -->
                <div class="shams-sidebar-footer">
                    <button type="button" id="btnOpenProjectSettingsGear" class="shams-compact-gear-btn" title="إعدادات المشروع (⚙️)">⚙️</button>
                </div>
            `;

            wsScreen.appendChild(backdrop);
            wsScreen.appendChild(sidebar);

            this.toolElements.pin_alignTools = document.getElementById('alignToolsGroup');

            // Bind Sidebar & Tool Events
            document.getElementById('btnToggleShamsSidebar')?.addEventListener('click', () => this.toggleSidebar());
            document.getElementById('btnCloseShamsSidebar')?.addEventListener('click', () => this.toggleSidebar(false));
            backdrop.addEventListener('click', () => this.toggleSidebar(false));

            document.getElementById('btnWorkspaceUndo')?.addEventListener('click', () => this.undo());
            document.getElementById('btnWorkspaceRedo')?.addEventListener('click', () => this.redo());

            const openGear = () => {
                this.toggleSidebar(false);
                this.openProjectSettingsModal();
            };
            document.getElementById('btnOpenProjectSettingsGear')?.addEventListener('click', openGear);
            document.getElementById('btnTopbarProjectGear')?.addEventListener('click', openGear);

            // Bind Multi-Select & Auto-Align Buttons
            this.bindAlignmentButtons();
        },

        bindAlignmentButtons() {
            const getEngine = () => getApp()?.getCanvasEngine?.();

            document.getElementById('btnMultiSelectToggle')?.addEventListener('click', (e) => {
                const eng = getEngine();
                if (!eng) return;
                const next = !eng.multiSelectMode;
                eng.setMultiSelectMode(next);
                e.currentTarget.classList.toggle('btn-primary', next);
                e.currentTarget.classList.toggle('btn-secondary', !next);
                getApp()?.showToast?.(next
                    ? '☑️ تم تفعيل التحديد المتعدد: اضغط على أكثر من كشاف لتحديدهم معاً'
                    : 'تم إيقاف وضع التحديد المتعدد');
            });

            const runAlignOp = (fnName, arg, msg) => {
                const eng = getEngine();
                if (!eng) return;
                const count = eng.getMultiSelectedItems?.()?.length || 0;
                if (count < 2) {
                    getApp()?.showToast?.('⚠️ حدد كشافين أو أكثر أولاً (بزر التحديد المتعدد أو Shift+Click)');
                    return;
                }
                const ok = eng[fnName]?.(arg);
                if (ok !== false) {
                    if (global.ShamsThreeView?.active) global.ShamsThreeView.rebuildScene();
                    getApp()?.persistWorkspace?.();
                    this.checkpoint(msg);
                    getApp()?.showToast?.(`✅ ${msg}`);
                }
            };

            document.getElementById('btnAlignHoriz')?.addEventListener('click', () =>
                runAlignOp('alignSelected', 'horizontal', 'تمت المحاذاة الأفقية للكشافات'));
            document.getElementById('btnAlignVert')?.addEventListener('click', () =>
                runAlignOp('alignSelected', 'vertical', 'تمت المحاذاة الرأسية للكشافات'));
            document.getElementById('btnDistHoriz')?.addEventListener('click', () =>
                runAlignOp('distributeSelected', 'horizontal', 'تم توزيع المسافات أفقياً بالتساوي'));
            document.getElementById('btnDistVert')?.addEventListener('click', () =>
                runAlignOp('distributeSelected', 'vertical', 'تم توزيع المسافات رأسياً بالتساوي'));
            document.getElementById('btnSyncRotSelected')?.addEventListener('click', () =>
                runAlignOp('syncRotationSelected', undefined, 'تم توحيد زاوية التوجيه للكشافات المحددة'));
            document.getElementById('btnSyncBeamSelected')?.addEventListener('click', () =>
                runAlignOp('syncBeamSelected', undefined, 'تم توحيد الشعاع للكشافات المحددة مع أول كشاف'));
        },

        toggleSidebar(force) {
            this.sidebarOpen = force !== undefined ? !!force : !this.sidebarOpen;
            document.getElementById('shamsSidebarDrawer')?.classList.toggle('open', this.sidebarOpen);
            document.getElementById('shamsSidebarBackdrop')?.classList.toggle('open', this.sidebarOpen);
        },

        applyScreenPinning() {
            const pinnedSet = new Set(Array.isArray(this.settings.pinnedItems) ? this.settings.pinnedItems : []);
            const pinnedBar = document.getElementById('pinnedToolsBar');
            const sidebarToolsHost = document.getElementById('sidebarToolsHost');
            const sidebarAlignHost = document.getElementById('sidebarAlignHost');

            if (!pinnedBar || !sidebarToolsHost) return;

            PINNABLE_ITEMS.forEach(({ id }) => {
                const el = this.toolElements[id];
                if (!el) return;
                const isPinned = pinnedSet.has(id);

                if (id === 'pin_alignTools') {
                    if (isPinned) {
                        pinnedBar.appendChild(el);
                    } else if (sidebarAlignHost) {
                        sidebarAlignHost.appendChild(el);
                    }
                } else {
                    if (isPinned) {
                        pinnedBar.appendChild(el);
                    } else {
                        sidebarToolsHost.appendChild(el);
                    }
                }
            });
        },

        applyProjectSettings() {
            this.applyScreenPinning();
            getApp()?.applyUserPermissionsUI?.();

            const eng = getApp()?.getCanvasEngine?.();
            if (eng && typeof eng.setDisplayScales === 'function') {
                eng.setDisplayScales({
                    icon: Number(this.settings.iconScale) || 1.0,
                    label: Number(this.settings.labelScale) || 1.0
                });
            }

            if (global.ShamsThreeView) {
                global.ShamsThreeView.setQuality(this.settings.quality3d || 'high');
            }
        },

        buildProjectSettingsModal() {
            if (document.getElementById('shamsProjectSettingsModal')) return;
            const modal = document.createElement('div');
            modal.id = 'shamsProjectSettingsModal';
            modal.className = 'modal-backdrop hidden';
            modal.dir = 'rtl';
            modal.innerHTML = `
                <div class="modal-window" style="max-width:680px;">
                    <div class="modal-header">
                        <h3>⚙️ إعدادات المشروع وتخصيص الشاشة</h3>
                        <button type="button" class="modal-close-btn" id="btnCloseProjSettingsModal">✕</button>
                    </div>
                    <div class="modal-body" style="display:flex; flex-direction:column; gap:18px;">
                        <!-- 1. الظهور للشاشة (Pin to Screen) -->
                        <div class="item-card" style="padding:14px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h4 style="font-size:0.92rem; color:var(--accent-cyan);">📌 1. الظهور للشاشة (تثبيت الأدوات أعلى المخطط)</h4>
                                <div style="display:flex; gap:6px;">
                                    <button type="button" class="btn btn-secondary" id="btnPinAllTools" style="padding:3px 8px; font-size:0.72rem;">تثبيت الكل</button>
                                    <button type="button" class="btn btn-secondary" id="btnUnpinAllTools" style="padding:3px 8px; font-size:0.72rem;">نقل الكل للقائمة الجانبية</button>
                                </div>
                            </div>
                            <div class="shams-pin-checklist" id="projSettingsPinChecklist"></div>
                        </div>

                        <!-- 2. أحجام الخطوط والأيقونات -->
                        <div class="item-card" style="padding:14px;">
                            <h4 style="font-size:0.92rem; color:var(--accent-amber); margin-bottom:10px;">🔍 2. أحجام الأيقونات والخطوط على المخطط</h4>
                            <div class="form-grid-2">
                                <div class="form-group">
                                    <label style="display:flex; justify-content:space-between;">
                                        <span>حجم أيقونات الكشافات والكاميرات</span>
                                        <strong id="lblProjIconScale">1.0x</strong>
                                    </label>
                                    <input type="range" id="rngProjIconScale" min="0.5" max="2.0" step="0.05" value="1.0" class="form-control" />
                                </div>
                                <div class="form-group">
                                    <label style="display:flex; justify-content:space-between;">
                                        <span>حجم خطوط البيانات والأرقام</span>
                                        <strong id="lblProjLabelScale">1.0x</strong>
                                    </label>
                                    <input type="range" id="rngProjLabelScale" min="0.6" max="2.0" step="0.05" value="1.0" class="form-control" />
                                </div>
                            </div>
                        </div>

                        <!-- 3. الحفظ التلقائي وخطوات التراجع + جودة 3D -->
                        <div class="item-card" style="padding:14px;">
                            <h4 style="font-size:0.92rem; color:var(--accent-emerald); margin-bottom:10px;">⚡ 3. الحفظ التلقائي، التراجع (Undo/Redo)، وجودة الـ 3D</h4>
                            <div class="form-grid-3">
                                <div class="form-group">
                                    <label>الحفظ التلقائي (Auto-Save)</label>
                                    <select id="selProjAutoSave" class="form-control">
                                        <option value="true">مفعل تلقائياً (ON)</option>
                                        <option value="false">يدوي فقط (OFF)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>عدد خطوات التراجع (Undo Depth)</label>
                                    <select id="selProjHistoryDepth" class="form-control">
                                        <option value="15">15 خطوة</option>
                                        <option value="30">30 خطوة</option>
                                        <option value="50">50 خطوة</option>
                                        <option value="100">100 خطوة</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>جودة الجرافيك ثلاثي الأبعاد (3D Quality)</label>
                                    <select id="selProj3DQuality" class="form-control">
                                        <option value="medium">خفيفة وسريعة (Fast)</option>
                                        <option value="high">متوازنة (Balanced)</option>
                                        <option value="ultra">فائقة (Ultra)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="btnResetProjSettings">استعادة الافتراضي</button>
                        <button type="button" class="btn btn-primary" id="btnSaveProjSettings">💾 حفظ وتطبيق</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('btnCloseProjSettingsModal')?.addEventListener('click', () => {
                modal.classList.add('hidden');
            });

            document.getElementById('rngProjIconScale')?.addEventListener('input', (e) => {
                const v = Number(e.target.value) || 1.0;
                document.getElementById('lblProjIconScale').textContent = `${v.toFixed(2)}x`;
                this.settings.iconScale = v;
                this.applyProjectSettings();
            });

            document.getElementById('rngProjLabelScale')?.addEventListener('input', (e) => {
                const v = Number(e.target.value) || 1.0;
                document.getElementById('lblProjLabelScale').textContent = `${v.toFixed(2)}x`;
                this.settings.labelScale = v;
                this.applyProjectSettings();
            });

            document.getElementById('btnPinAllTools')?.addEventListener('click', () => {
                modal.querySelectorAll('input[name="pin_tool_chk"]').forEach(c => { c.checked = true; });
            });

            document.getElementById('btnUnpinAllTools')?.addEventListener('click', () => {
                modal.querySelectorAll('input[name="pin_tool_chk"]').forEach(c => { c.checked = false; });
            });

            document.getElementById('btnResetProjSettings')?.addEventListener('click', () => {
                this.settings = JSON.parse(JSON.stringify(DEFAULT_PROJECT_SETTINGS));
                this.populateProjectSettingsModal();
                this.applyProjectSettings();
                this.saveSettings();
            });

            document.getElementById('btnSaveProjSettings')?.addEventListener('click', () => {
                const checked = [];
                modal.querySelectorAll('input[name="pin_tool_chk"]:checked').forEach(c => checked.push(c.value));
                this.settings.pinnedItems = checked;
                this.settings.iconScale = Number(document.getElementById('rngProjIconScale').value) || 1.0;
                this.settings.labelScale = Number(document.getElementById('rngProjLabelScale').value) || 1.0;
                this.settings.autoSave = document.getElementById('selProjAutoSave').value === 'true';
                this.settings.historyDepth = parseInt(document.getElementById('selProjHistoryDepth').value, 10) || 30;
                this.settings.quality3d = document.getElementById('selProj3DQuality').value || 'high';

                this.applyProjectSettings();
                this.saveSettings();
                modal.classList.add('hidden');
                getApp()?.showToast?.('✅ تم حفظ إعدادات المشروع');
            });
        },

        populateProjectSettingsModal() {
            const list = document.getElementById('projSettingsPinChecklist');
            if (!list) return;
            const pinnedSet = new Set(this.settings.pinnedItems || []);
            list.innerHTML = PINNABLE_ITEMS.map(item => `
                <label class="shams-pin-item">
                    <input type="checkbox" name="pin_tool_chk" value="${item.id}" ${pinnedSet.has(item.id) ? 'checked' : ''} />
                    <span>${item.label}</span>
                </label>
            `).join('');

            const ic = Number(this.settings.iconScale) || 1.0;
            const lc = Number(this.settings.labelScale) || 1.0;
            document.getElementById('rngProjIconScale').value = ic;
            document.getElementById('lblProjIconScale').textContent = `${ic.toFixed(2)}x`;
            document.getElementById('rngProjLabelScale').value = lc;
            document.getElementById('lblProjLabelScale').textContent = `${lc.toFixed(2)}x`;
            document.getElementById('selProjAutoSave').value = String(this.settings.autoSave !== false);
            document.getElementById('selProjHistoryDepth').value = String(this.settings.historyDepth || 30);
            document.getElementById('selProj3DQuality').value = this.settings.quality3d || 'high';
        },

        openProjectSettingsModal() {
            const app = getApp();
            if (app?.canAccess && !app.canAccess('projectSettingsGear')) {
                app.showToast?.('🔒 غير مصرح لك بفتح إعدادات المشروع وتخصيص الشاشة');
                return;
            }
            this.buildProjectSettingsModal();
            this.populateProjectSettingsModal();
            document.getElementById('shamsProjectSettingsModal')?.classList.remove('hidden');
        },

        checkpoint(label = 'Change') {
            if (this.isRestoringHistory) return;
            const scene = getApp()?.getActiveScene?.();
            if (!scene) return;
            const snapshot = JSON.stringify({
                items: scene.items || [],
                customCables: scene.customCables || [],
                customDmxCables: scene.customDmxCables || []
            });
            if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1].snapshot === snapshot) {
                return;
            }
            this.undoStack.push({ label, snapshot });
            const maxDepth = Math.max(5, Number(this.settings.historyDepth) || 30);
            while (this.undoStack.length > maxDepth + 1) {
                this.undoStack.shift();
            }
            this.redoStack = [];
            this.updateUndoRedoButtons();
        },

        undo() {
            const app = getApp();
            if (app?.canAccess && !app.canAccess('projectSettingsGear')) {
                app.showToast?.('🔒 غير مصرح لك باستخدام التراجع');
                return;
            }
            if (this.undoStack.length <= 1) {
                app?.showToast?.('↩ لا توجد خطوات سابقة للتراجع');
                return;
            }
            const current = this.undoStack.pop();
            this.redoStack.push(current);
            const prev = this.undoStack[this.undoStack.length - 1];
            this.restoreSnapshot(prev.snapshot, '↩ تم التراجع عن آخر خطوة');
        },

        redo() {
            const app = getApp();
            if (app?.canAccess && !app.canAccess('projectSettingsGear')) {
                app.showToast?.('🔒 غير مصرح لك باستخدام الإعادة');
                return;
            }
            if (this.redoStack.length === 0) {
                app?.showToast?.('↪ لا توجد خطوات للإعادة');
                return;
            }
            const next = this.redoStack.pop();
            this.undoStack.push(next);
            this.restoreSnapshot(next.snapshot, '↪ تمت إعادة الخطوة');
        },

        restoreSnapshot(snapshotStr, toastMsg) {
            const app = getApp();
            const scene = app?.getActiveScene?.();
            if (!scene || !snapshotStr) return;
            try {
                this.isRestoringHistory = true;
                const data = JSON.parse(snapshotStr);
                scene.items = data.items || [];
                scene.customCables = data.customCables || [];
                scene.customDmxCables = data.customDmxCables || [];
                global.CineLightDB?.recalculateDMXAddresses?.(scene);
                const eng = app?.getCanvasEngine?.();
                if (eng) {
                    const sel = eng.getSelectedItem?.();
                    if (sel && !scene.items.some((it) => it.id === sel.id)) {
                        eng.selectItem(null, false, false);
                    }
                    eng.requestRender?.();
                }
                app?.updatePowerLoadUI?.();
                if (global.ShamsThreeView?.active) {
                    global.ShamsThreeView.rebuildScene();
                }
                if (this.settings.autoSave !== false) {
                    app?.persistWorkspace?.();
                }
                this.updateUndoRedoButtons();
                if (toastMsg) app?.showToast?.(toastMsg);
            } catch (e) {
            } finally {
                this.isRestoringHistory = false;
            }
        },

        updateUndoRedoButtons() {
            const uBtn = document.getElementById('btnWorkspaceUndo');
            const rBtn = document.getElementById('btnWorkspaceRedo');
            const canUndo = this.undoStack.length > 1;
            const canRedo = this.redoStack.length > 0;
            if (uBtn) {
                uBtn.disabled = false;
                uBtn.classList.toggle('is-disabled', !canUndo);
                uBtn.setAttribute('aria-disabled', String(!canUndo));
            }
            if (rBtn) {
                rBtn.disabled = false;
                rBtn.classList.toggle('is-disabled', !canRedo);
                rBtn.setAttribute('aria-disabled', String(!canRedo));
            }
        },

        bindKeyboardShortcuts() {
            global.addEventListener('keydown', (e) => {
                const wsScreen = document.getElementById('workspaceScreen');
                const isWsOpen = wsScreen && (wsScreen.classList.contains('active') || !wsScreen.classList.contains('hidden'));
                if (!isWsOpen) return;

                const activeEl = document.activeElement;
                if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) {
                    return;
                }

                const keyLower = (e.key || '').toLowerCase();
                const isZ = e.code === 'KeyZ' || keyLower === 'z' || e.key === 'ئ';
                const isY = e.code === 'KeyY' || keyLower === 'y' || e.key === 'غ';

                if ((e.ctrlKey || e.metaKey) && !e.altKey && isZ) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                } else if ((e.ctrlKey || e.metaKey) && !e.altKey && isY) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.redo();
                }
            }, true);
        }
    };

    global.ShamsWorkspaceUI = ShamsWorkspaceUI;
})(window);
