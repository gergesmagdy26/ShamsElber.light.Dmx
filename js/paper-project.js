/**
 * ShamsElber light. DMX — "مشروع ورقي" (Paper Project) Module (Section 3)
 * Quick Tabular Sheets without drawing a 2D plot:
 * - Tab 1: Light (ورقة الإضاءة والكاميرات) with Dynamic Active-Data Filtering & Notes
 * - Tab 2: DMX (ورقة الـ DMX) with Auto Fixture #, Universe A/B/C/D, Sequential DMX Address
 *          Calculation per Output, Editable Location ("المكان"), and Vertical Split (تقسيم الورقة بالطول)
 *          when multiple outputs (e.g., A & B) are used.
 * - Full Exports: Image (PNG / JPG), Print (A4 / Thermal 80mm / Thermal 58mm), Excel (.xls & .csv), Word (.doc)
 */
(function (global) {
  'use strict';

  let activePaperProjectId = null;
  let activeSubTab = 'light'; // 'light' | 'dmx'
  let printFormatOverride = null;
  let previewZoom = null; // auto-fits on mobile when null, preserved across re-renders once set

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getWorkspace() {
    return global.CineApp && typeof global.CineApp.getWorkspace === 'function'
      ? global.CineApp.getWorkspace()
      : null;
  }

  async function saveWorkspace() {
    if (global.CineApp && typeof global.CineApp.persistWorkspace === 'function') {
      await global.CineApp.persistWorkspace();
    }
  }

  function ensurePaperProjectsList() {
    const ws = getWorkspace();
    if (!ws) return [];
    if (!Array.isArray(ws.paperProjects)) {
      ws.paperProjects = [];
    }
    if (ws.paperProjects.length === 0) {
      ws.paperProjects.push(createDefaultPaperProject('مشروع ورقي 1 (Studio Sheet)'));
      saveWorkspace();
    }
    if (!activePaperProjectId || !ws.paperProjects.some((p) => p.id === activePaperProjectId)) {
      activePaperProjectId = ws.paperProjects[0].id;
    }
    return ws.paperProjects;
  }

  function resolvePaperMeta(active) {
    const appSettings = (global.CineLightDB && typeof global.CineLightDB.getAppSettingsSync === 'function')
      ? global.CineLightDB.getAppSettingsSync()
      : {};
    const ws = getWorkspace();
    const progVal = active && active.programmer !== undefined
      ? String(active.programmer)
      : String((ws && ws.lastPaperProgrammer) || appSettings.designerName || '');
    const dopVal = active && active.dop !== undefined ? String(active.dop) : '';
    const pageOrientation = active && active.pageOrientation === 'landscape' ? 'landscape' : 'portrait';
    return { appSettings, progVal, dopVal, pageOrientation };
  }

  function createDefaultPaperProject(title) {
    const ws = getWorkspace();
    const appSettings = (global.CineLightDB && typeof global.CineLightDB.getAppSettingsSync === 'function')
      ? global.CineLightDB.getAppSettingsSync()
      : {};
    return {
      id: 'paper_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      name: title || 'مشروع ورقي جديد',
      programmer: (ws && ws.lastPaperProgrammer) || appSettings.designerName || '',
      dop: '',
      pageOrientation: 'portrait',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lightRows: [],
      dmxRows: []
    };
  }

  function getActivePaperProject() {
    const list = ensurePaperProjectsList();
    return list.find((p) => p.id === activePaperProjectId) || list[0] || null;
  }

  /**
   * Recalculates DMX Addresses sequentially per Output Universe (or default empty channel)
   * based on each fixture's DMX footprint, respecting 0-channel non-DMX fixtures
   * and sharing the same startAddress when two or more fixtures have the same Light Number.
   */
  function recalculatePaperDmx(paperProj) {
    if (!paperProj || !Array.isArray(paperProj.dmxRows)) return;
    const byOut = {};
    paperProj.dmxRows.forEach((row) => {
      const out = String(row.output !== undefined && row.output !== null ? row.output : '').trim().toUpperCase();
      row.output = out;
      if (!byOut[out]) byOut[out] = [];
      byOut[out].push(row);
    });

    Object.keys(byOut).sort().forEach((out) => {
      const rows = byOut[out];

      // Auto-sequence Light Numbers per Output starting from 1 (in top-to-bottom table order)
      // unless the user manually edited Light Numbers in this output universe.
      if (!rows.some((r) => r.manualFixtureNum)) {
        const renumberMap = new Map();
        let nextSeq = 1;
        rows.forEach((r) => {
          const n = r.fixtureNum !== undefined && r.fixtureNum !== null && r.fixtureNum !== '' ? parseInt(r.fixtureNum, 10) : NaN;
          if ((!isNaN(n) && n <= 0) || r.isNonDmx) {
            r.fixtureNum = 0;
            r.isNonDmx = true;
            return;
          }
          if (!isNaN(n) && n > 0) {
            if (!renumberMap.has(n)) {
              renumberMap.set(n, nextSeq++);
            }
            r.fixtureNum = renumberMap.get(n);
          } else {
            r.fixtureNum = nextSeq++;
          }
        });
      }

      // Sort by user-assigned Light Number (fixtureNum); 0 goes to the end (Non-DMX), preserving array order for ties
      rows.sort((a, b) => {
        const rawA = a.fixtureNum !== undefined && a.fixtureNum !== null && a.fixtureNum !== '' ? parseInt(a.fixtureNum, 10) : 1;
        const rawB = b.fixtureNum !== undefined && b.fixtureNum !== null && b.fixtureNum !== '' ? parseInt(b.fixtureNum, 10) : 1;
        const numA = isNaN(rawA) ? 1 : rawA;
        const numB = isNaN(rawB) ? 1 : rawB;
        if (numA === 0 && numB !== 0) return 1;
        if (numB === 0 && numA !== 0) return -1;
        return numA - numB;
      });

      let runningAddr = 1;
      const sharedByLightNum = new Map();

      rows.forEach((r, idx) => {
        const fp = Math.max(0, parseInt(r.footprint, 10) || 0);
        r.footprint = fp;
        const parsedNum = (r.fixtureNum !== undefined && r.fixtureNum !== null && r.fixtureNum !== '') ? parseInt(r.fixtureNum, 10) : NaN;
        if (!isNaN(parsedNum) && parsedNum <= 0) {
          r.fixtureNum = 0;
          r.isNonDmx = true;
          r.startAddress = null;
          r.endAddress = null;
          r.overflow = false;
          return;
        }
        r.isNonDmx = false;
        if (isNaN(parsedNum)) {
          r.fixtureNum = idx + 1;
        } else {
          r.fixtureNum = parsedNum;
        }
        if (fp <= 0) {
          r.startAddress = null;
          r.endAddress = null;
          r.overflow = false;
          return;
        }

        const existingGroup = sharedByLightNum.get(r.fixtureNum);
        if (existingGroup) {
          if (r.manualAddress && parseInt(r.manualAddress, 10) >= 1) {
            r.startAddress = parseInt(r.manualAddress, 10);
            existingGroup.startAddress = r.startAddress;
          } else {
            r.startAddress = existingGroup.startAddress;
          }
          r.endAddress = r.startAddress + fp - 1;
          r.overflow = r.endAddress > 512;
          if (fp > existingGroup.maxFootprint) {
            existingGroup.maxFootprint = fp;
          }
          runningAddr = Math.max(runningAddr, existingGroup.startAddress + existingGroup.maxFootprint);
          return;
        }

        if (r.manualAddress && parseInt(r.manualAddress, 10) >= 1) {
          r.startAddress = parseInt(r.manualAddress, 10);
        } else {
          r.startAddress = runningAddr;
        }
        r.endAddress = r.startAddress + fp - 1;
        r.overflow = r.endAddress > 512;
        sharedByLightNum.set(r.fixtureNum, {
          startAddress: r.startAddress,
          maxFootprint: fp
        });
        runningAddr = r.startAddress + fp;
      });
    });
  }

  function hasPaperPerm(key) {
    if (global.CineApp && typeof global.CineApp.canAccess === 'function') {
      return global.CineApp.canAccess(key);
    }
    return true;
  }

  function renderSection() {
    const host = document.getElementById('secPaperProject');
    if (!host) return;
    if (!hasPaperPerm('paperProject')) {
      host.innerHTML = `<div class="glass-panel" style="padding:28px;text-align:center;color:var(--text-muted);">🔒 غير مصرح لك بالوصول إلى قسم المشروع الورقي</div>`;
      return;
    }

    const canLight = hasPaperPerm('paperLightSheet');
    const canDmx = hasPaperPerm('paperDmxSheet');
    const canExport = hasPaperPerm('exportReports');

    if (activeSubTab === 'light' && !canLight && canDmx) activeSubTab = 'dmx';
    if (activeSubTab === 'dmx' && !canDmx && canLight) activeSubTab = 'light';

    const list = ensurePaperProjectsList();
    const active = getActivePaperProject();
    if (!active) return;
    recalculatePaperDmx(active);

    const ws = getWorkspace();
    const eqs = (ws && ws.equipment) || [];
    const lightAndCamEqs = eqs.filter((e) => e.type === 'fixture' || e.type === 'camera');
    const dmxFixtureEqs = eqs.filter((e) => e.type === 'fixture' && !e.isSplitter && (parseInt(e.footprint, 10) || 0) > 0);

    const settings = global.CineLightDB ? global.CineLightDB.getAppSettingsSync() : {};
    const curFormat = printFormatOverride || settings.printFormat || 'A4';
    const { pageOrientation: curOrientation } = resolvePaperMeta(active);

    const tabContentHtml =
      !canLight && !canDmx
        ? `<div class="glass-panel" style="padding:28px;text-align:center;color:var(--text-muted);">🔒 غير مصرح لك بعرض أوراق الـ Light أو الـ DMX</div>`
        : activeSubTab === 'light'
        ? renderLightTabHTML(active, lightAndCamEqs)
        : renderDmxTabHTML(active, dmxFixtureEqs);

    host.innerHTML = `
      <div class="paper-suite-wrap">
        <!-- Top Project Selector & Actions Bar -->
        <div class="paper-top-header glass-panel">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="paperProjSelect" class="form-control" style="min-width:210px;" onchange="ShamsPaper.selectProject(this.value)">
              ${list.map((p) => `<option value="${esc(p.id)}" ${p.id === active.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-primary" onclick="ShamsPaper.createNewProject()">➕ مشروع ورقي جديد</button>
            <button type="button" class="btn btn-secondary" onclick="ShamsPaper.renameCurrentProject()">✎ تسمية</button>
            <div class="dropdown-wrapper print-dropdown-wrap">
              <button type="button" id="paperBackupMenuBtn" class="btn btn-emerald print-dropdown-btn" onclick="ShamsPaper.toggleBackupMenu(event)">
                <span>Backup</span>
                <span class="print-caret">▾</span>
              </button>
              <div id="paperBackupDropdownMenu" class="print-dropdown-menu hidden" onclick="event.stopPropagation()">
                <button type="button" class="print-dropdown-item" onclick="ShamsPaper.closeBackupMenu(); ShamsPaper.exportProjectFile()">
                  <span>📤 أخذ نسخة ملف</span>
                  <span class="print-fmt-tag">.json</span>
                </button>
                <label class="print-dropdown-item" style="cursor:pointer;margin:0;" title="استيراد نسخة ملف مشروع ورقي من جهاز آخر (.json)">
                  <span>📥 استيراد نسخة</span>
                  <span class="print-fmt-tag">.json</span>
                  <input type="file" id="paperImportFileInput" accept=".json,application/json" style="display:none;" onchange="ShamsPaper.closeBackupMenu(); ShamsPaper.importProjectFile(event)" />
                </label>
              </div>
            </div>
            <button type="button" class="btn btn-danger" onclick="ShamsPaper.deleteCurrentProject()">🗑 حذف</button>
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:1.4rem;">📑</span>
            <div>
              <h2 style="margin:0;font-size:1.1rem;">مشروع ورقي سريع (Paper Project — Light &amp; DMX Sheets)</h2>
              <span style="font-size:0.75rem;color:var(--text-muted);">إنشاء وتصدير جداول الإضاءة والكاميرات وباتش الـ DMX مباشرة بدون رسم بلان</span>
            </div>
            <button type="button" class="btn btn-secondary" onclick="CineApp.exitPaperProjectToDashboard()" title="Back to Home">
              🏠 Home
            </button>
          </div>
        </div>

        <!-- Sub-Tabs (Light | DMX) + Export Toolbar -->
        <div class="paper-subtabs-bar glass-panel">
          <div class="paper-subtabs-left">
            ${canLight ? `<button type="button" class="paper-subtab-btn ${activeSubTab === 'light' ? 'active' : ''}" onclick="ShamsPaper.switchSubTab('light')">
              Light &amp; Camera
              <span class="paper-count-pill">${active.lightRows.length}</span>
            </button>` : ''}
            ${canDmx ? `<button type="button" class="paper-subtab-btn ${activeSubTab === 'dmx' ? 'active' : ''}" onclick="ShamsPaper.switchSubTab('dmx')">
              DMX
              <span class="paper-count-pill">${active.dmxRows.length}</span>
            </button>` : ''}
          </div>

          ${canExport ? `<div class="paper-export-actions">
            <select id="paperPrintFormatSel" class="form-control" style="width:auto;min-width:145px;font-size:0.76rem;" onchange="ShamsPaper.onFormatChange(this.value)">
              <option value="A4" ${curFormat === 'A4' ? 'selected' : ''}>🖨️ طباعة A4</option>
              <option value="thermal80" ${curFormat === 'thermal80' ? 'selected' : ''}>🧾 ريسيت 80mm</option>
              <option value="thermal58" ${curFormat === 'thermal58' ? 'selected' : ''}>🧾 ريسيت 58mm</option>
            </select>
            <select id="paperOrientationSel" class="form-control" style="width:auto;min-width:125px;font-size:0.76rem;" onchange="ShamsPaper.onOrientationChange(this.value)" title="Page Orientation">
              <option value="portrait" ${curOrientation === 'portrait' ? 'selected' : ''}>Portrait</option>
              <option value="landscape" ${curOrientation === 'landscape' ? 'selected' : ''}>Landscape</option>
            </select>
            <div class="dropdown-wrapper print-dropdown-wrap">
              <button type="button" id="paperPrintMenuBtn" class="btn btn-primary print-dropdown-btn" onclick="ShamsPaper.togglePrintMenu(event)">
                <span>🖨️ Print</span>
                <span class="print-caret">▾</span>
              </button>
              <div id="paperPrintDropdownMenu" class="print-dropdown-menu hidden" onclick="event.stopPropagation()">
                <button type="button" class="print-dropdown-item" onclick="ShamsPaper.closePrintMenu(); ShamsPaper.printCurrentSheet()">
                  <span>🖨️ Print / PDF (مباشر)</span>
                  <span class="print-fmt-tag">Print</span>
                </button>
                <button type="button" class="print-dropdown-item" onclick="ShamsPaper.closePrintMenu(); ShamsPaper.exportCurrentWord()">
                  <span>📘 Word Document</span>
                  <span class="print-fmt-tag">.doc</span>
                </button>
                <button type="button" class="print-dropdown-item" onclick="ShamsPaper.closePrintMenu(); ShamsPaper.exportCurrentExcel()">
                  <span>📗 Excel Workbook</span>
                  <span class="print-fmt-tag">.xls</span>
                </button>
                <div class="print-dropdown-divider"></div>
                <button type="button" class="print-dropdown-item" onclick="ShamsPaper.closePrintMenu(); ShamsPaper.exportCurrentImage('png')">
                  <span>🖼️ صورة PNG</span>
                  <span class="print-fmt-tag">.png</span>
                </button>
                <button type="button" class="print-dropdown-item" onclick="ShamsPaper.closePrintMenu(); ShamsPaper.exportCurrentImage('jpg')">
                  <span>🖼️ صورة JPG</span>
                  <span class="print-fmt-tag">.jpg</span>
                </button>
              </div>
            </div>
          </div>` : ''}
        </div>

        ${tabContentHtml}
      </div>
    `;
    setupPreviewPinchZoom();
  }

  function renderPreviewZoomControlsHTML() {
    return `
      <div class="paper-zoom-controls" title="كبر وصغر الورقة بصباعين على الموبايل أو بالأزرار">
        <button type="button" class="btn btn-secondary paper-zoom-btn" onclick="ShamsPaper.adjustPreviewZoom(-0.15)">➖</button>
        <span id="paperPreviewZoomBadge" class="paper-zoom-badge">100%</span>
        <button type="button" class="btn btn-secondary paper-zoom-btn" onclick="ShamsPaper.adjustPreviewZoom(0.15)">➕</button>
        <button type="button" class="btn btn-secondary paper-zoom-btn" onclick="ShamsPaper.resetPreviewZoom()" title="ضبط الحجم تلقائياً">↺</button>
      </div>
    `;
  }

  function getFitPreviewZoom(viewport, sheet) {
    if (!viewport || !sheet) return 1;
    const availW = Math.max(240, viewport.clientWidth - 20);
    const natW = sheet.offsetWidth || (sheet.classList.contains('paper-orientation-landscape') ? 1123 : 794);
    if (natW <= availW) return 1;
    return Math.max(0.35, Math.min(1, +(availW / natW).toFixed(3)));
  }

  function applyPreviewZoomLayout() {
    const viewport = document.getElementById('paperPreviewViewport');
    const stage = document.getElementById('paperPreviewZoomStage');
    const sheet = document.getElementById('paperLiveSheetContainer');
    const badge = document.getElementById('paperPreviewZoomBadge');
    if (!viewport || !stage || !sheet) return;

    if (previewZoom === null || isNaN(previewZoom)) {
      previewZoom = getFitPreviewZoom(viewport, sheet);
    }
    const z = Math.max(0.35, Math.min(2.6, previewZoom));
    previewZoom = z;

    const natW = sheet.offsetWidth || (sheet.classList.contains('paper-orientation-landscape') ? 1123 : 794);
    const natH = sheet.offsetHeight || 900;

    sheet.style.transformOrigin = 'top left';
    sheet.style.transform = `scale(${z})`;
    stage.style.width = `${Math.ceil(natW * z)}px`;
    stage.style.height = `${Math.ceil(natH * z)}px`;
    if (badge) badge.textContent = `${Math.round(z * 100)}%`;
  }

  function adjustPreviewZoom(delta) {
    const viewport = document.getElementById('paperPreviewViewport');
    const sheet = document.getElementById('paperLiveSheetContainer');
    if (previewZoom === null && viewport && sheet) {
      previewZoom = getFitPreviewZoom(viewport, sheet);
    }
    previewZoom = Math.max(0.35, Math.min(2.6, (previewZoom || 1) + delta));
    applyPreviewZoomLayout();
  }

  function resetPreviewZoom() {
    previewZoom = null;
    applyPreviewZoomLayout();
  }

  function setupPreviewPinchZoom() {
    const viewport = document.getElementById('paperPreviewViewport');
    if (!viewport) return;
    requestAnimationFrame(() => applyPreviewZoomLayout());

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchMidRelX = 0;
    let pinchMidRelY = 0;
    let isPinching = false;

    const getTouchDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    viewport.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 2) {
        const sheet = document.getElementById('paperLiveSheetContainer');
        if (previewZoom === null && sheet) previewZoom = getFitPreviewZoom(viewport, sheet);
        isPinching = true;
        pinchStartDist = Math.max(10, getTouchDist(e.touches[0], e.touches[1]));
        pinchStartZoom = previewZoom || 1;
        const rect = viewport.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        pinchMidRelX = (viewport.scrollLeft + midX) / pinchStartZoom;
        pinchMidRelY = (viewport.scrollTop + midY) / pinchStartZoom;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (!isPinching || !e.touches || e.touches.length !== 2) return;
      e.preventDefault();
      const curDist = getTouchDist(e.touches[0], e.touches[1]);
      const nextZoom = Math.max(0.35, Math.min(2.6, pinchStartZoom * (curDist / pinchStartDist)));
      previewZoom = nextZoom;
      applyPreviewZoomLayout();

      const rect = viewport.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      viewport.scrollLeft = Math.max(0, pinchMidRelX * nextZoom - midX);
      viewport.scrollTop = Math.max(0, pinchMidRelY * nextZoom - midY);
    }, { passive: false });

    const stopPinch = (e) => {
      if (!e.touches || e.touches.length < 2) {
        isPinching = false;
      }
    };
    viewport.addEventListener('touchend', stopPinch, { passive: true });
    viewport.addEventListener('touchcancel', stopPinch, { passive: true });
  }

  // ==========================================================================
  // TAB 1: LIGHT & CAMERAS SHEET (Section 3.1)
  // ==========================================================================
  const DEFAULT_PAPER_ST = {
    contrast: 0,
    highlights: 0,
    shadows: 0,
    fade: 0,
    saturation: 0,
    sharpness: 4,
    clarity: 0
  };
  let editingStRowId = null;

  function isCameraRow(r, ws) {
    if (!r) return false;
    if (String(r.itemType || '').toLowerCase() === 'camera') return true;
    const eq = (ws?.equipment || []).find((e) => e.id === r.equipmentId);
    return !!(eq && eq.type === 'camera');
  }

  function normalizePaperST(stVal) {
    const out = Object.assign({ customized: false }, DEFAULT_PAPER_ST);
    if (!stVal) return out;
    if (typeof stVal === 'object') {
      Object.keys(DEFAULT_PAPER_ST).forEach((k) => {
        if (stVal[k] !== undefined && stVal[k] !== null && stVal[k] !== '') {
          out[k] = parseInt(stVal[k], 10) || 0;
        }
      });
      const differsFromDefault = Object.keys(DEFAULT_PAPER_ST).some((k) => out[k] !== DEFAULT_PAPER_ST[k]);
      out.customized = Boolean(stVal.customized || differsFromDefault);
      return out;
    }
    const raw = String(stVal).trim();
    const slashMatch = raw.match(/ST\(\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\)/i);
    if (slashMatch) {
      ['contrast', 'highlights', 'shadows', 'fade', 'saturation', 'sharpness', 'clarity'].forEach((k, idx) => {
        out[k] = parseInt(slashMatch[idx + 1], 10) || 0;
      });
      out.customized = Object.keys(DEFAULT_PAPER_ST).some((k) => out[k] !== DEFAULT_PAPER_ST[k]);
    }
    return out;
  }

  function isPaperSTModified(stVal) {
    if (!stVal || typeof stVal !== 'object') {
      if (!stVal) return false;
      return normalizePaperST(stVal).customized;
    }
    if (stVal.customized === true) return true;
    return Object.keys(DEFAULT_PAPER_ST).some((k) => {
      if (stVal[k] === undefined || stVal[k] === null || stVal[k] === '') return false;
      return (parseInt(stVal[k], 10) || 0) !== DEFAULT_PAPER_ST[k];
    });
  }

  function fmtSignedST(val, allowPlus = false) {
    const n = parseInt(val, 10) || 0;
    return allowPlus && n > 0 ? `+${n}` : `${n}`;
  }

  function formatPaperSTInline(stVal) {
    const s = normalizePaperST(stVal);
    return `Con:${fmtSignedST(s.contrast, true)} Hi:${fmtSignedST(s.highlights, true)} Shd:${fmtSignedST(s.shadows, true)} Fade:${s.fade} Sat:${fmtSignedST(s.saturation, true)} Shp:${s.sharpness} Clr:${s.clarity}`;
  }

  function formatPaperSTHtml(stVal) {
    const s = normalizePaperST(stVal);
    const l1 = `Con:${fmtSignedST(s.contrast, true)} • Hi:${fmtSignedST(s.highlights, true)} • Shd:${fmtSignedST(s.shadows, true)}`;
    const l2 = `Fade:${s.fade} • Sat:${fmtSignedST(s.saturation, true)} • Shp:${s.sharpness} • Clr:${s.clarity}`;
    return `<div style="direction:ltr;text-align:center;line-height:1.22;font-size:0.88em;font-family:monospace;">${esc(l1)}<br/>${esc(l2)}</div>`;
  }

  const FSTOP_SCALE = [
    'f/1.0', 'f/1.2', 'f/1.4', 'f/1.8', 'f/2', 'f/2.2', 'f/2.5', 'f/2.8',
    'f/3.2', 'f/3.5', 'f/4', 'f/4.5', 'f/5', 'f/5.6', 'f/6.3', 'f/7.1',
    'f/8', 'f/9', 'f/10', 'f/11', 'f/13', 'f/14', 'f/16', 'f/18', 'f/20', 'f/22'
  ];

  function parseFStopNumber(val) {
    const m = String(val || '').match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : NaN;
  }

  function getLensMinApertureNum(lensName, eqLenses = []) {
    const cleanName = String(lensName || '').trim();
    if (cleanName) {
      const matchEq = (eqLenses || []).find((l) => l.name === cleanName);
      if (matchEq && matchEq.maxAperture) {
        const parsed = parseFStopNumber(matchEq.maxAperture);
        if (Number.isFinite(parsed)) return parsed;
      }
      const inName = cleanName.match(/f\s*\/?\s*(\d+(?:\.\d+)?)/i);
      if (inName) {
        const parsed = parseFloat(inName[1]);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return 1.4;
  }

  function getApertureStopsForLens(lensName, eqLenses = [], currentFStop = '') {
    const minNum = getLensMinApertureNum(lensName, eqLenses);
    const filtered = FSTOP_SCALE.filter((s) => parseFStopNumber(s) >= minNum - 0.01);
    const cur = String(currentFStop || '').trim();
    if (cur && !filtered.includes(cur)) {
      const curNum = parseFStopNumber(cur);
      if (Number.isFinite(curNum)) {
        const out = filtered.slice();
        out.push(cur);
        out.sort((a, b) => (parseFStopNumber(a) || 99) - (parseFStopNumber(b) || 99));
        return out;
      }
      return [cur, ...filtered];
    }
    return filtered;
  }

  function renderLightEditorRowHTML(r, idx, isCam, eqLenses = []) {
    const canStLook = hasPaperPerm('paperCameraStLook');
    if (isCam) {
      const curLens = String(r.modifierOrLens || '').trim();
      const matchesEqLens = curLens && eqLenses.some((l) => l.name === curLens);
      const isManualLens = Boolean(r._manualLens || (curLens && !matchesEqLens));
      const lensSelectVal = isManualLens ? '__MANUAL__' : (matchesEqLens ? curLens : '');
      const stModified = isPaperSTModified(r.stLook);
      const curFStop = String(r.dimmerOrAperture || '').trim() || 'f/2.8';
      const fStopStops = getApertureStopsForLens(curLens, eqLenses, curFStop);

      return `
        <tr>
          <td><strong dir="ltr">Cam ${idx + 1}</strong></td>
          <td class="paper-fixture-name-cell">
            <span class="paper-type-badge cam">🎥 Camera</span>
            <input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="name" value="${esc(r.name)}" oninput="ShamsPaper.updateLightRow('${r.id}','name',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'name')" />
          </td>
          <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="roleOrLocation" placeholder="Location / Angle" value="${esc(r.roleOrLocation)}" oninput="ShamsPaper.updateLightRow('${r.id}','roleOrLocation',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'roleOrLocation')" /></td>
          <td>
            <div class="paper-lens-cell">
              <select class="form-control paper-cell-input paper-lens-select" data-row-idx="${idx}" data-col-field="modifierOrLens" onchange="ShamsPaper.onCameraLensSelectChange('${r.id}', this.value)">
                <option value="">— Lens —</option>
                ${eqLenses.map((l) => `<option value="${esc(l.name)}" ${lensSelectVal === l.name ? 'selected' : ''}>${esc(l.name)}${l.maxAperture ? ` (${esc(l.maxAperture)})` : ''}</option>`).join('')}
                <option value="__MANUAL__" ${lensSelectVal === '__MANUAL__' ? 'selected' : ''}>✍️ Manual / إدخال يدوي</option>
              </select>
              <input type="text" class="form-control paper-cell-input paper-lens-manual-input ${isManualLens ? '' : 'hidden'}" data-lens-manual-id="${r.id}" placeholder="Type custom lens..." value="${esc(curLens)}" oninput="ShamsPaper.onCameraManualLensInput('${r.id}', this.value)" />
            </div>
          </td>
          <td><input type="text" class="form-control paper-cell-input" dir="ltr" data-row-idx="${idx}" data-col-field="kelvin" placeholder="5600K" value="${esc(r.kelvin)}" oninput="ShamsPaper.updateLightRow('${r.id}','kelvin',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'kelvin')" /></td>
          <td><input type="text" class="form-control paper-cell-input" dir="ltr" data-row-idx="${idx}" data-col-field="colorOrIso" placeholder="ISO 800" value="${esc(r.colorOrIso)}" oninput="ShamsPaper.updateLightRow('${r.id}','colorOrIso',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'colorOrIso')" /></td>
          <td>
            <div class="paper-fstop-stepper" dir="ltr">
              <select class="form-control paper-cell-input paper-fstop-select" data-row-idx="${idx}" data-col-field="dimmerOrAperture" data-fstop-select="${r.id}" onchange="ShamsPaper.updateLightRow('${r.id}','dimmerOrAperture',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'dimmerOrAperture')">
                ${fStopStops.map((st) => `<option value="${esc(st)}" ${curFStop === st ? 'selected' : ''}>${esc(st)}</option>`).join('')}
              </select>
              <div class="paper-fstop-arrows">
                <button type="button" class="paper-step-btn" onclick="ShamsPaper.stepCameraFStop('${r.id}', 1)" title="أضيق درجة (▲)">▲</button>
                <button type="button" class="paper-step-btn" onclick="ShamsPaper.stepCameraFStop('${r.id}', -1)" title="أوسع درجة (▼)">▼</button>
              </div>
            </div>
          </td>
          <td><input type="text" class="form-control paper-cell-input" dir="ltr" data-row-idx="${idx}" data-col-field="shutter" placeholder="1/50" value="${esc(r.shutter || '')}" oninput="ShamsPaper.updateLightRow('${r.id}','shutter',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'shutter')" /></td>
          ${
            canStLook
              ? `<td>
                  <button type="button" class="btn btn-secondary paper-st-btn ${stModified ? 'is-modified' : ''}" data-st-row="${r.id}" onclick="ShamsPaper.openCameraStModal('${r.id}')" title="Edit Contrast / Highlights / Shadows / Fade / Saturation / Sharpness / Clarity">
                    ${stModified ? '🎛️ ST (Active)' : '🎛️ ST Look'}
                    <span class="paper-st-mini">${esc(stModified ? formatPaperSTInline(r.stLook) : 'Default (Hidden in Sheet)')}</span>
                  </button>
                </td>`
              : ''
          }
          <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="notes" placeholder="Notes..." value="${esc(r.notes)}" oninput="ShamsPaper.updateLightRow('${r.id}','notes',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'notes')" /></td>
          <td><button type="button" class="btn btn-danger" style="padding:4px 8px;" onclick="ShamsPaper.deleteLightRow('${r.id}')">✕</button></td>
        </tr>
      `;
    }
    return `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td class="paper-fixture-name-cell">
          <span class="paper-type-badge fix">💡 Fixture</span>
          <input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="name" value="${esc(r.name)}" oninput="ShamsPaper.updateLightRow('${r.id}','name',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'name')" />
        </td>
        <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="roleOrLocation" placeholder="Key Light / Front" value="${esc(r.roleOrLocation)}" oninput="ShamsPaper.updateLightRow('${r.id}','roleOrLocation',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'roleOrLocation')" /></td>
        <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="dimmerOrAperture" placeholder="80%" value="${esc(r.dimmerOrAperture)}" oninput="ShamsPaper.updateLightRow('${r.id}','dimmerOrAperture',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'dimmerOrAperture')" /></td>
        <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="kelvin" placeholder="5600K" value="${esc(r.kelvin)}" oninput="ShamsPaper.updateLightRow('${r.id}','kelvin',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'kelvin')" /></td>
        <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="colorOrIso" placeholder="Warm / RGB" value="${esc(r.colorOrIso)}" oninput="ShamsPaper.updateLightRow('${r.id}','colorOrIso',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'colorOrIso')" /></td>
        <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="modifierOrLens" placeholder="Octa 90 / Stand" value="${esc(r.modifierOrLens)}" oninput="ShamsPaper.updateLightRow('${r.id}','modifierOrLens',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'modifierOrLens')" /></td>
        <td><input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="notes" placeholder="Notes..." value="${esc(r.notes)}" oninput="ShamsPaper.updateLightRow('${r.id}','notes',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'notes')" /></td>
        <td><button type="button" class="btn btn-danger" style="padding:4px 8px;" onclick="ShamsPaper.deleteLightRow('${r.id}')">✕</button></td>
      </tr>
    `;
  }

  function renderLightTabHTML(active, eqs) {
    const savedQuery = String(active.lastLightSearchQuery || '').trim();
    const qLower = savedQuery.toLowerCase();
    const filteredEqs = qLower
      ? eqs.filter((e) => `${e.name || ''} ${e.badge || ''} ${e.watts || ''}`.toLowerCase().includes(qLower))
      : eqs;
    const fixtures = filteredEqs.filter((e) => e.type === 'fixture' && !e.isSplitter);
    const cameras = filteredEqs.filter((e) => e.type === 'camera');
    const stickyId = active.lastSelectedLightEqId || '';
    const { dopVal, pageOrientation } = resolvePaperMeta(active);

    const ws = getWorkspace();
    const eqLenses = (ws?.equipment || []).filter((e) => e.type === 'lens');
    const canStLook = hasPaperPerm('paperCameraStLook');
    const fixtureRows = active.lightRows.filter((r) => !isCameraRow(r, ws));
    const cameraRows = active.lightRows.filter((r) => isCameraRow(r, ws));

    return `
      <div class="paper-work-grid">
        <!-- Entry & Editable Rows Panel -->
        <div class="glass-panel paper-editor-panel">
          <div class="paper-meta-bar">
            <div class="paper-meta-field">
              <label for="paperMetaDopInput" dir="ltr" style="text-align:left;">DOP</label>
              <input type="text" id="paperMetaDopInput" class="form-control" value="${esc(dopVal)}" placeholder="DOP..." oninput="ShamsPaper.updateProjectMetaField('dop', this.value)" />
            </div>
          </div>

          <div class="paper-add-bar">
            <div style="flex:1;min-width:210px;">
              <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Select Fixture or Camera to add to sheet:</label>
              <input type="search" id="paperLightSearchInput" class="form-control" style="margin-bottom:6px;padding:6px 10px;font-size:0.8rem;" value="${esc(savedQuery)}" placeholder="🔍 Search fixture or camera... (Enter to add)" oninput="ShamsPaper.filterLightSelect(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();ShamsPaper.addLightRow('paperLightSearchInput');}" />
              <select id="paperLightAddSelect" class="form-control" onchange="ShamsPaper.onLightFixtureSelectChange(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();ShamsPaper.addLightRow('paperLightAddSelect');}">
                ${
                  fixtures.length === 0 && cameras.length === 0
                    ? `<option value="">— No matching results —</option>`
                    : `
                      ${
                        fixtures.length > 0
                          ? `<optgroup label="💡 Fixtures">
                              ${fixtures.map((f) => `<option value="${esc(f.id)}" ${f.id === stickyId ? 'selected' : ''}>💡 ${esc(f.name)} (${f.watts || 0}W)</option>`).join('')}
                            </optgroup>`
                          : ''
                      }
                      ${
                        cameras.length > 0
                          ? `<optgroup label="🎥 Cameras">
                              ${cameras.map((c) => `<option value="${esc(c.id)}" ${c.id === stickyId ? 'selected' : ''}>🎥 ${esc(c.name)}</option>`).join('')}
                            </optgroup>`
                          : ''
                      }
                    `
                }
              </select>
            </div>
            <button type="button" class="btn btn-primary" style="align-self:flex-end;" onclick="ShamsPaper.addLightRow()">➕ Add Row</button>
          </div>

          <!-- 1. Fixtures Editor Table -->
          <div style="font-size:0.84rem;font-weight:800;color:var(--accent-amber);margin-bottom:6px;text-align:right;" dir="rtl">💡 Fixtures</div>
          <div class="paper-rows-table-wrap" style="margin-bottom:14px;">
            <table class="data-table paper-edit-table" dir="rtl">
              <thead>
                <tr>
                  <th style="width:42px;">#</th>
                  <th>Fixture</th>
                  <th>Location</th>
                  <th>Dimmer</th>
                  <th>Kelvin</th>
                  <th>Color</th>
                  <th>Accessory</th>
                  <th>Notes</th>
                  <th style="width:48px;">Del</th>
                </tr>
              </thead>
              <tbody>
                ${
                  fixtureRows.length === 0
                    ? `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-muted);">No fixtures added yet.</td></tr>`
                    : fixtureRows.map((r, idx) => renderLightEditorRowHTML(r, idx, false, eqLenses)).join('')
                }
              </tbody>
            </table>
          </div>

          <!-- 2. Cameras Editor Table -->
          <div style="font-size:0.84rem;font-weight:800;color:var(--accent-cyan);margin:14px 0 6px;text-align:right;" dir="rtl">🎥 Cameras</div>
          <div class="paper-rows-table-wrap">
            <table class="data-table paper-edit-table" dir="rtl">
              <thead>
                <tr>
                  <th style="width:58px;">#</th>
                  <th>Camera</th>
                  <th>Location</th>
                  <th>Lens</th>
                  <th>Kelvin</th>
                  <th>ISO</th>
                  <th>F-Stop</th>
                  <th>Shutter</th>
                  ${canStLook ? '<th>ST Look</th>' : ''}
                  <th>Notes</th>
                  <th style="width:48px;">Del</th>
                </tr>
              </thead>
              <tbody>
                ${
                  cameraRows.length === 0
                    ? `<tr><td colspan="${canStLook ? 11 : 10}" style="text-align:center;padding:14px;color:var(--text-muted);">No cameras added yet.</td></tr>`
                    : cameraRows.map((r, idx) => renderLightEditorRowHTML(r, idx, true, eqLenses)).join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Live Filtered Sheet Preview -->
        <div class="glass-panel paper-preview-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            <div>
              <h4 style="margin:0;color:var(--accent-amber);">👁️ معاينة الشيت المفلتر الجاهز للطباعة والتصدير</h4>
            </div>
            ${renderPreviewZoomControlsHTML()}
          </div>
          <div id="paperPreviewViewport" class="paper-preview-viewport">
            <div id="paperPreviewZoomStage" class="paper-preview-zoom-stage">
              <div id="paperLiveSheetContainer" class="paper-sheet-surface paper-orientation-${pageOrientation}" dir="rtl">
                ${buildLightPrintableHTML(active)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildCleanPaperHeaderHTML(projOrTitle, opts = {}) {
    const isObj = projOrTitle && typeof projOrTitle === 'object';
    const active = isObj ? projOrTitle : null;
    const projectName = isObj ? (projOrTitle.name || '') : String(projOrTitle || '');
    const { appSettings, progVal, dopVal } = resolvePaperMeta(active);
    const logoSrc = appSettings.logoDataURL || appSettings.appLogoDataUrl || './FB_IMG_1794520985975.jpg';
    const cleanProg = opts.includeProgrammer ? progVal.trim() : '';
    const cleanDop = opts.includeDop ? dopVal.trim() : '';

    return `
      <table class="sheet-header-table" style="width:100%;border-collapse:collapse;border:none;border-bottom:2.5px solid #0f172a;margin-bottom:12px;">
        <tr>
          <td style="border:none;padding:0 0 8px 0;text-align:right;vertical-align:middle;">
            <img src="${esc(logoSrc)}" alt="Logo" style="width:40px;height:40px;object-fit:contain;background:#fff;padding:2px;border-radius:6px;vertical-align:middle;margin-left:8px;" />
            <span style="font-size:15pt;font-weight:900;color:#0f172a;vertical-align:middle;">${esc(projectName)}</span>
            ${
              cleanDop || cleanProg
                ? `<div style="margin-top:5px;font-size:9.5pt;font-weight:700;color:#1e293b;">
                    ${cleanDop ? `<span style="margin-left:14px;"><strong>DOP:</strong> ${esc(cleanDop)}</span>` : ''}
                    ${cleanProg ? `<span><strong>Lighting Programmer:</strong> ${esc(cleanProg)}</span>` : ''}
                  </div>`
                : ''
            }
          </td>
          <td style="border:none;padding:0 0 8px 0;text-align:left;vertical-align:middle;direction:ltr;">
            <strong style="font-size:13pt;font-weight:900;color:#0f172a;letter-spacing:0.4px;">ShamsElber DMX</strong>
          </td>
        </tr>
      </table>
    `;
  }

  function getAdaptiveTableMetrics(rowCount, colCount, isSplit = false, orientation = 'portrait') {
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

  function buildPrintableSubTableHTML(rows, candidateCols, orientation) {
    const activeCols = global.ShamsExport.filterEmptyColumns(candidateCols, rows);
    const metrics = getAdaptiveTableMetrics(rows.length, activeCols.length, false, orientation);
    const totalWeight = activeCols.reduce((sum, c) => sum + (Number(c.weight) || 12), 0) || 100;
    const colWidths = activeCols.map((c) => `${(((Number(c.weight) || 12) / totalWeight) * 100).toFixed(2)}%`);

    const rowsHtml = rows
      .map((row, idx) => {
        const rowBg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
        const tds = activeCols
          .map((col, ci) => {
            const v = typeof col.getter === 'function' ? col.getter(row, idx) : row[col.key];
            const cellContent = col.allowHtml ? (v || '—') : esc(v || '—');
            const tdStyle = `padding:${metrics.cellPad};font-size:${metrics.fontSize};line-height:${metrics.lineHeight};text-align:${col.align || 'right'};width:${colWidths[ci]};box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;white-space:normal;${col.bold || col.key === 'idx' ? 'font-weight:700;' : ''}${col.dir ? `direction:${col.dir};` : ''}${rowBg}`;
            return `<td style="${tdStyle}">${cellContent}</td>`;
          })
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');

    return `
      <table class="paper-balanced-table" border="1" cellspacing="0" cellpadding="4" style="width:100%;max-width:100%;table-layout:fixed;box-sizing:border-box;border-collapse:collapse;margin:${metrics.tableMargin};font-size:${metrics.fontSize};line-height:${metrics.lineHeight};">
        <thead>
          <tr>${activeCols.map((c, ci) => `<th style="padding:${metrics.cellPad};font-size:${metrics.fontSize};text-align:${c.align || 'right'};width:${colWidths[ci]};box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">${esc(c.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  function buildLightPrintableHTML(active) {
    const headerHtml = buildCleanPaperHeaderHTML(active, { includeDop: true, includeProgrammer: false });
    const orientation = resolvePaperMeta(active).pageOrientation;

    if (!active.lightRows || active.lightRows.length === 0) {
      return `${headerHtml}<p style="text-align:center;padding:18px;color:#64748b;">لا توجد بيانات مدخلة بعد.</p>`;
    }

    const ws = getWorkspace();
    const fixtureRows = active.lightRows.filter((r) => !isCameraRow(r, ws));
    const cameraRows = active.lightRows.filter((r) => isCameraRow(r, ws));
    const parts = [headerHtml];

    const canStLook = hasPaperPerm('paperCameraStLook');

    if (fixtureRows.length > 0) {
      parts.push(`<div style="font-size:10pt;font-weight:800;color:#0f172a;margin:2px 0 5px;direction:rtl;text-align:right;">💡 Fixtures</div>`);
      const fixtureCols = [
        { key: 'idx', label: '#', alwaysShow: true, align: 'center', weight: 6, getter: (r, i) => i + 1 },
        { key: 'name', label: 'Fixture', alwaysShow: true, align: 'right', bold: true, weight: 22 },
        { key: 'roleOrLocation', label: 'Location', align: 'right', weight: 16 },
        { key: 'dimmerOrAperture', label: 'Dimmer', align: 'center', weight: 10 },
        { key: 'kelvin', label: 'Kelvin', align: 'center', weight: 10 },
        { key: 'colorOrIso', label: 'Color', align: 'center', weight: 10 },
        { key: 'modifierOrLens', label: 'Accessory', align: 'right', weight: 13 },
        { key: 'notes', label: 'Notes', align: 'right', weight: 13 }
      ];
      parts.push(buildPrintableSubTableHTML(fixtureRows, fixtureCols, orientation));
    }

    if (cameraRows.length > 0) {
      parts.push(`<div style="font-size:10pt;font-weight:800;color:#0f172a;margin:${fixtureRows.length > 0 ? '10px' : '2px'} 0 5px;direction:rtl;text-align:right;">🎥 Cameras</div>`);
      const cameraCols = [
        { key: 'idx', label: '#', alwaysShow: true, align: 'center', dir: 'ltr', weight: 8, getter: (r, i) => `Cam ${i + 1}` },
        { key: 'name', label: 'Camera', alwaysShow: true, align: 'right', bold: true, weight: 14 },
        { key: 'roleOrLocation', label: 'Location', align: 'right', weight: 11 },
        { key: 'modifierOrLens', label: 'Lens', align: 'center', dir: 'ltr', weight: 13 },
        { key: 'kelvin', label: 'Kelvin', align: 'center', dir: 'ltr', weight: 8 },
        { key: 'colorOrIso', label: 'ISO', align: 'center', dir: 'ltr', weight: 8 },
        { key: 'dimmerOrAperture', label: 'F-Stop', align: 'center', dir: 'ltr', weight: 7 },
        { key: 'shutter', label: 'Shutter', align: 'center', dir: 'ltr', weight: 8 }
      ];
      if (canStLook) {
        cameraCols.push({
          key: 'stLook',
          label: 'ST Look',
          alwaysShow: false,
          allowHtml: true,
          align: 'center',
          dir: 'ltr',
          weight: 14,
          getter: (r) => (isPaperSTModified(r.stLook) ? formatPaperSTHtml(r.stLook) : '')
        });
      }
      cameraCols.push({ key: 'notes', label: 'Notes', align: 'right', weight: 9 });
      parts.push(buildPrintableSubTableHTML(cameraRows, cameraCols, orientation));
    }

    return parts.join('');
  }

  // ==========================================================================
  // TAB 2: DMX PATCH SHEET WITH MULTI-OUTPUT VERTICAL SPLIT (Section 3.2)
  // ==========================================================================
  function renderDmxTabHTML(active, dmxFixtures) {
    const savedQuery = String(active.lastDmxSearchQuery || '').trim();
    const qLower = savedQuery.toLowerCase();
    const filteredDmx = qLower
      ? dmxFixtures.filter((f) => `${f.name || ''} ${f.badge || ''} ${f.footprint || ''}`.toLowerCase().includes(qLower))
      : dmxFixtures;
    const stickyId = active.lastSelectedDmxEqId || '';
    const { progVal, pageOrientation } = resolvePaperMeta(active);

    return `
      <div class="paper-work-grid">
        <div class="glass-panel paper-editor-panel">
          <div class="paper-meta-bar">
            <div class="paper-meta-field">
              <label for="paperMetaProgInputDmx" dir="ltr" style="text-align:left;">Lighting Programmer</label>
              <input type="text" id="paperMetaProgInputDmx" class="form-control" value="${esc(progVal)}" placeholder="Lighting Programmer..." oninput="ShamsPaper.updateProjectMetaField('programmer', this.value)" />
            </div>
          </div>

          <div class="paper-add-bar">
            <div style="flex:1;min-width:200px;">
              <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">اختر الكشاف من قاعدة البيانات (يقرأ عدد القنوات تلقائياً):</label>
              <input type="search" id="paperDmxSearchInput" class="form-control" style="margin-bottom:6px;padding:6px 10px;font-size:0.8rem;" value="${esc(savedQuery)}" placeholder="🔍 ابحث عن اسم الكشاف فوراً... (Enter للإضافة)" oninput="ShamsPaper.filterDmxSelect(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();ShamsPaper.addDmxRow('paperDmxSearchInput');}" />
              <select id="paperDmxAddFixtureSelect" class="form-control" onchange="ShamsPaper.onDmxFixtureSelectChange(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();ShamsPaper.addDmxRow('paperDmxAddFixtureSelect');}">
                ${
                  filteredDmx.length > 0
                    ? filteredDmx.map((f) => `<option value="${esc(f.id)}" ${f.id === stickyId ? 'selected' : ''}>💡 ${esc(f.name)} (${f.footprint} Ch)</option>`).join('')
                    : `<option value="">— لا توجد كشافات مطابقة للبحث —</option>`
                }
              </select>
            </div>
            <div style="width:150px;">
              <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">المخرج (Channel):</label>
              <select id="paperDmxAddOutputSelect" class="form-control" onchange="ShamsPaper.onOutputSelectChange(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();ShamsPaper.addDmxRow('paperDmxAddOutputSelect');}">
                <option value="" ${!active.lastSelectedDmxOutput ? 'selected' : ''}>— بدون تحديد (فارغ) —</option>
                ${['A', 'B', 'C', 'D']
                  .map((o) => `<option value="${o}" ${(active.lastSelectedDmxOutput || '') === o ? 'selected' : ''}>Channel ${o}</option>`)
                  .join('')}
              </select>
            </div>
            <div style="width:170px;">
              <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">المكان (Location):</label>
              <input type="text" id="paperDmxAddLocationInput" class="form-control" placeholder="مثال: Front Truss" onkeydown="if(event.key==='Enter'){event.preventDefault();ShamsPaper.addDmxRow('paperDmxAddLocationInput');}" />
            </div>
            <button type="button" class="btn btn-primary" style="align-self:flex-end;" onclick="ShamsPaper.addDmxRow()">➕ إضافة كشاف للـ DMX</button>
          </div>

          <div class="paper-rows-table-wrap">
            <table class="data-table paper-edit-table">
              <thead>
                <tr>
                  <th style="width:88px;">Light Number</th>
                  <th>اسم الكشاف (Fixture)</th>
                  <th style="width:95px;">المخرج (Output)</th>
                  <th style="width:82px;">القنوات (Ch)</th>
                  <th style="width:130px;">الأدريس (DMX Addr)</th>
                  <th>المكان (Location)</th>
                  <th>ملاحظات (Notes)</th>
                  <th style="width:52px;">حذف</th>
                </tr>
              </thead>
              <tbody>
                ${
                  active.dmxRows.length === 0
                    ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">لا توجد كشافات مضافة بعد — اختر الكشاف واضغط "إضافة كشاف للـ DMX"</td></tr>`
                    : active.dmxRows
                        .map((r, idx) => {
                          const uCol = global.CineLightDB.getUniverseColor(r.output);
                          const isZeroNonDmx = r.fixtureNum === 0 || r.isNonDmx;
                          const addrBadge =
                            !isZeroNonDmx && r.footprint > 0
                              ? `${r.startAddress}`
                              : 'بدون DMX';
                          return `
                          <tr>
                            <td>
                              <input type="number" min="0" max="999" step="1" class="form-control paper-cell-input paper-num-input" data-row-idx="${idx}" data-col-field="fixtureNum" style="font-weight:800;text-align:center;" value="${r.fixtureNum !== undefined && r.fixtureNum !== null ? r.fixtureNum : 1}" onchange="ShamsPaper.updateDmxRow('${r.id}','fixtureNum',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'fixtureNum', '${r.id}')" />
                            </td>
                            <td class="paper-fixture-name-cell">
                              <strong>${esc(r.name)}</strong>
                            </td>
                            <td>
                              <select class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="output" style="border-color:${r.output ? uCol : 'var(--border-subtle)'};color:${r.output ? uCol : 'var(--text-muted)'};font-weight:800;" onchange="ShamsPaper.updateDmxRow('${r.id}','output',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'output', '${r.id}')">
                                <option value="" ${!r.output ? 'selected' : ''}>— فارغ —</option>
                                ${['A', 'B', 'C', 'D']
                                  .map((o) => `<option value="${o}" ${r.output === o ? 'selected' : ''}>Channel ${o}</option>`)
                                  .join('')}
                              </select>
                            </td>
                            <td style="text-align:center;">
                              <span class="badge">${r.footprint} Ch</span>
                            </td>
                            <td style="direction:ltr;text-align:center;">
                              <span class="paper-addr-pill ${r.overflow ? 'overflow' : ''}" style="border-color:${uCol};">
                                ${addrBadge}
                              </span>
                            </td>
                            <td>
                              <input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="location" placeholder="مثال: Front Truss / Key" value="${esc(r.location)}" oninput="ShamsPaper.updateDmxRow('${r.id}','location',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'location', '${r.id}')" />
                            </td>
                            <td>
                              <input type="text" class="form-control paper-cell-input" data-row-idx="${idx}" data-col-field="notes" placeholder="ملاحظات..." value="${esc(r.notes)}" oninput="ShamsPaper.updateDmxRow('${r.id}','notes',this.value)" onkeydown="ShamsPaper.onCellKeyDown(event, ${idx}, 'notes', '${r.id}')" />
                            </td>
                            <td>
                              <button type="button" class="btn btn-danger" style="padding:4px 8px;" onclick="ShamsPaper.deleteDmxRow('${r.id}')">✕</button>
                            </td>
                          </tr>
                        `;
                        })
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Live DMX Sheet Preview (with automatic Vertical Split when 2+ outputs are used) -->
        <div class="glass-panel paper-preview-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            <div>
              <h4 style="margin:0;color:var(--accent-cyan);">👁️ معاينة شيت الـ DMX الجاهز للطباعة والـ Word</h4>
            </div>
            ${renderPreviewZoomControlsHTML()}
          </div>
          <div id="paperPreviewViewport" class="paper-preview-viewport">
            <div id="paperPreviewZoomStage" class="paper-preview-zoom-stage">
              <div id="paperLiveSheetContainer" class="paper-sheet-surface paper-orientation-${pageOrientation}" dir="rtl">
                ${buildDmxPrintableHTML(active)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildSingleUniverseTableHTML(outputLetter, rows, isSplit = false, orientation = 'portrait') {
    const cleanOut = String(outputLetter || '').trim();
    const uCol = cleanOut && global.CineLightDB ? global.CineLightDB.getUniverseColor(cleanOut) : '#0f172a';

    const sorted = rows.slice().sort((a, b) => {
      const nA = a.fixtureNum !== undefined && a.fixtureNum !== null ? parseInt(a.fixtureNum, 10) : 1;
      const nB = b.fixtureNum !== undefined && b.fixtureNum !== null ? parseInt(b.fixtureNum, 10) : 1;
      if (nA === 0 && nB !== 0) return 1;
      if (nB === 0 && nA !== 0) return -1;
      return nA - nB;
    });

    // Merge rows with the exact same Light Number (fixtureNum > 0) into a single row in the sheet
    const mergedRows = [];
    const seenByNum = new Map();
    for (const r of sorted) {
      const num = parseInt(r.fixtureNum, 10) || 0;
      if (num > 0 && !r.isNonDmx) {
        const existing = seenByNum.get(num);
        if (existing) {
          if (!existing.location && r.location) existing.location = r.location;
          if (!existing.notes && r.notes) existing.notes = r.notes;
          continue;
        }
        const clone = Object.assign({}, r);
        seenByNum.set(num, clone);
        mergedRows.push(clone);
      } else {
        mergedRows.push(Object.assign({}, r));
      }
    }

    const hasLocation = mergedRows.some((r) => global.ShamsExport.isValuePopulated(r.location));
    const hasNotes = mergedRows.some((r) => global.ShamsExport.isValuePopulated(r.notes));
    const showChannelCol = !!cleanOut && !isSplit;
    const colCount = 3 + (hasLocation ? 1 : 0) + (showChannelCol ? 1 : 0) + (hasNotes ? 1 : 0);
    const metrics = getAdaptiveTableMetrics(mergedRows.length, colCount, isSplit, orientation);
    const cellPad = metrics.cellPad;
    const fontSize = metrics.fontSize;

    const universeHeaderBar = cleanOut
      ? `<div class="dmx-universe-banner" style="background:${uCol};color:#0f172a;font-weight:900;padding:${metrics.bannerPad};border:1.5px solid #0f172a;border-bottom:none;display:flex;justify-content:space-between;align-items:center;font-size:${metrics.bannerFont};">
          <span>🔌 Channel ${esc(cleanOut)}</span>
          <span>(${mergedRows.length})</span>
        </div>`
      : '';

    return `
      <div class="dmx-universe-block" style="${!isSplit && metrics.tableMargin ? `margin:${metrics.tableMargin};` : ''}">
        ${universeHeaderBar}
        <table class="dmx-inner-table" border="1" cellspacing="0" cellpadding="${isSplit ? '3' : '5'}" style="width:100%;max-width:100%;table-layout:fixed;box-sizing:border-box;border-collapse:collapse;margin-bottom:0;font-size:${fontSize};line-height:${metrics.lineHeight};">
          <thead>
            <tr>
              <th style="padding:${cellPad};font-size:${fontSize};width:${isSplit ? '10%' : '11%'};text-align:center;box-sizing:border-box;white-space:normal;word-break:break-word;">#</th>
              <th style="padding:${cellPad};font-size:${fontSize};text-align:right;box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">الكشاف</th>
              ${hasLocation ? `<th style="padding:${cellPad};font-size:${fontSize};text-align:right;box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">المكان</th>` : ''}
              ${showChannelCol ? `<th style="padding:${cellPad};font-size:${fontSize};width:12%;text-align:center;box-sizing:border-box;white-space:normal;word-break:break-word;">Channel</th>` : ''}
              <th style="padding:${cellPad};font-size:${fontSize};width:${isSplit ? '18%' : '15%'};text-align:center;box-sizing:border-box;white-space:normal;word-break:break-word;">Address</th>
              ${hasNotes ? `<th style="padding:${cellPad};font-size:${fontSize};text-align:right;box-sizing:border-box;white-space:normal;word-break:break-word;overflow-wrap:anywhere;">ملاحظات</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${mergedRows
              .map(
                (r, idx) => {
                  const rowBg = idx % 2 === 1 ? 'background:#f8fafc;' : '';
                  return `
                <tr>
                  <td style="padding:${cellPad};font-size:${fontSize};text-align:center;font-weight:800;box-sizing:border-box;word-break:break-word;${rowBg}">${r.fixtureNum === 0 || r.isNonDmx ? '0' : `#${esc(r.fixtureNum)}`}</td>
                  <td style="padding:${cellPad};font-size:${fontSize};font-weight:700;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;${rowBg}">${esc(r.name)}</td>
                  ${hasLocation ? `<td style="padding:${cellPad};font-size:${fontSize};box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;${rowBg}">${esc(r.location || '')}</td>` : ''}
                  ${showChannelCol ? `<td style="padding:${cellPad};font-size:${fontSize};text-align:center;font-weight:800;box-sizing:border-box;${rowBg}">${esc(cleanOut)}</td>` : ''}
                  <td style="padding:${cellPad};font-size:${fontSize};direction:ltr;text-align:center;font-weight:900;box-sizing:border-box;word-break:break-word;${rowBg}">${
                    r.fixtureNum === 0 || r.isNonDmx ? 'بدون DMX' : (r.footprint > 0 ? `${r.startAddress}` : '—')
                  }</td>
                  ${hasNotes ? `<td style="padding:${cellPad};font-size:${fontSize};box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;${rowBg}">${esc(r.notes || '')}</td>` : ''}
                </tr>
              `;
                }
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function buildDmxPrintableHTML(active) {
    recalculatePaperDmx(active);
    const headerHtml = buildCleanPaperHeaderHTML(active, { includeDop: false, includeProgrammer: true });

    const validRows = (active.dmxRows || []).filter((r) => (parseInt(r.footprint, 10) || 0) > 0);
    if (validRows.length === 0) {
      return `${headerHtml}<p style="text-align:center;padding:18px;color:#64748b;">لا توجد كشافات DMX مضافة بعد.</p>`;
    }

    const byOut = {};
    validRows.forEach((r) => {
      const out = String(r.output !== undefined && r.output !== null ? r.output : '').trim();
      if (!byOut[out]) byOut[out] = [];
      byOut[out].push(r);
    });

    const outputs = Object.keys(byOut).sort((a, b) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b);
    });

    const orientation = resolvePaperMeta(active).pageOrientation;

    // Section 3.2: Vertical Split for Multi-Output — use HTML table layout so BOTH Print AND Word (.doc) render identical side-by-side columns
    if (outputs.length >= 2) {
      const pairs = [];
      for (let i = 0; i < outputs.length; i += 2) {
        const leftOut = outputs[i];
        const rightOut = outputs[i + 1];
        pairs.push(`
          <table class="dmx-split-table" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:100%;table-layout:fixed;box-sizing:border-box;border-collapse:separate;border-spacing:6px 0;border:none;margin-bottom:10px;">
            <tr>
              <td class="dmx-split-col" style="width:${rightOut !== undefined ? '50%' : '100%'};vertical-align:top;padding:5px;border:2px solid #0f172a;background:#ffffff;box-sizing:border-box;overflow:hidden;">
                ${buildSingleUniverseTableHTML(leftOut, byOut[leftOut], true, orientation)}
              </td>
              ${
                rightOut !== undefined
                  ? `<td class="dmx-split-col" style="width:50%;vertical-align:top;padding:5px;border:2px solid #0f172a;background:#ffffff;box-sizing:border-box;overflow:hidden;">
                      ${buildSingleUniverseTableHTML(rightOut, byOut[rightOut], true, orientation)}
                    </td>`
                  : ''
              }
            </tr>
          </table>
        `);
      }
      return `${headerHtml}${pairs.join('')}`;
    }

    const onlyOut = outputs[0];
    return `${headerHtml}${buildSingleUniverseTableHTML(onlyOut, byOut[onlyOut], false, orientation)}`;
  }

  // ==========================================================================
  // CRUD ACTIONS FOR PAPER PROJECTS & ROWS
  // ==========================================================================
  function selectProject(id) {
    activePaperProjectId = id;
    renderSection();
  }

  async function createNewProject() {
    const name = prompt('اسم المشروع الورقي الجديد (Paper Project Name):', 'مشروع ورقي جديد');
    if (!name || !name.trim()) return;
    const list = ensurePaperProjectsList();
    const proj = createDefaultPaperProject(name.trim());
    list.unshift(proj);
    activePaperProjectId = proj.id;
    await saveWorkspace();
    renderSection();
  }

  async function renameCurrentProject() {
    const active = getActivePaperProject();
    if (!active) return;
    const name = prompt('تعديل اسم المشروع الورقي:', active.name);
    if (!name || !name.trim()) return;
    active.name = name.trim();
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    renderSection();
  }

  async function deleteCurrentProject() {
    const list = ensurePaperProjectsList();
    const active = getActivePaperProject();
    if (!active) return;
    if (!confirm(`هل تريد حذف المشروع الورقي "${active.name}"؟`)) return;
    const idx = list.findIndex((p) => p.id === active.id);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) {
      list.push(createDefaultPaperProject('مشروع ورقي 1'));
    }
    activePaperProjectId = list[0].id;
    await saveWorkspace();
    renderSection();
  }

  function switchSubTab(tab) {
    const want = tab === 'dmx' ? 'dmx' : 'light';
    if (want === 'light' && !hasPaperPerm('paperLightSheet')) return;
    if (want === 'dmx' && !hasPaperPerm('paperDmxSheet')) return;
    activeSubTab = want;
    renderSection();
  }

  function onFormatChange(fmt) {
    printFormatOverride = fmt;
  }

  async function onOrientationChange(orient) {
    const active = getActivePaperProject();
    if (!active) return;
    active.pageOrientation = orient === 'landscape' ? 'landscape' : 'portrait';
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    const preview = document.getElementById('paperLiveSheetContainer');
    if (preview) {
      preview.classList.remove('paper-orientation-portrait', 'paper-orientation-landscape');
      preview.classList.add(`paper-orientation-${active.pageOrientation}`);
    }
    refreshLivePreview();
    previewZoom = null;
    requestAnimationFrame(() => applyPreviewZoomLayout());
    if (global.CineApp && typeof global.CineApp.showToast === 'function') {
      global.CineApp.showToast(
        active.pageOrientation === 'landscape'
          ? '📃 تم ضبط الورقة بالعرض (Landscape) للطباعة والصور والتصدير'
          : '📄 تم ضبط الورقة بالطول (Portrait) للطباعة والصور والتصدير'
      );
    }
  }

  function refreshLivePreview() {
    const active = getActivePaperProject();
    const live = document.getElementById('paperLiveSheetContainer');
    if (active && live) {
      live.innerHTML = activeSubTab === 'light' ? buildLightPrintableHTML(active) : buildDmxPrintableHTML(active);
      requestAnimationFrame(() => applyPreviewZoomLayout());
    }
  }

  function updateProjectMetaField(field, value) {
    const active = getActivePaperProject();
    if (!active) return;
    if (field !== 'dop' && field !== 'programmer') return;
    active[field] = String(value ?? '');
    if (field === 'programmer') {
      const ws = getWorkspace();
      if (ws) ws.lastPaperProgrammer = active.programmer;
    }
    active.updatedAt = new Date().toISOString();
    saveWorkspace();
    refreshLivePreview();
  }

  if (global.addEventListener) {
    global.addEventListener('shams:settings-changed', () => {
      refreshLivePreview();
    });
  }

  function onLightFixtureSelectChange(eqId) {
    const active = getActivePaperProject();
    if (active && eqId) {
      active.lastSelectedLightEqId = eqId;
      saveWorkspace();
    }
  }

  function onDmxFixtureSelectChange(eqId) {
    const active = getActivePaperProject();
    if (active && eqId) {
      active.lastSelectedDmxEqId = eqId;
      saveWorkspace();
    }
  }

  function filterLightSelect(query) {
    const sel = document.getElementById('paperLightAddSelect');
    const ws = getWorkspace();
    const active = getActivePaperProject();
    if (!sel || !ws) return;
    if (active) {
      active.lastLightSearchQuery = query || '';
    }
    const q = String(query || '').trim().toLowerCase();
    const eqs = (ws.equipment || []).filter((e) => (e.type === 'fixture' && !e.isSplitter) || e.type === 'camera');
    const matched = q
      ? eqs.filter((e) => {
          const hay = `${e.name || ''} ${e.badge || ''} ${e.watts || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : eqs;
    const fixtures = matched.filter((e) => e.type === 'fixture');
    const cameras = matched.filter((e) => e.type === 'camera');
    const stickyId = active ? active.lastSelectedLightEqId : '';

    const groups = [];
    if (fixtures.length > 0) {
      groups.push(
        `<optgroup label="💡 الكشافات (Lighting Fixtures)">${fixtures
          .map((f) => `<option value="${esc(f.id)}" ${f.id === stickyId ? 'selected' : ''}>💡 ${esc(f.name)} (${f.watts || 0}W)</option>`)
          .join('')}</optgroup>`
      );
    }
    if (cameras.length > 0) {
      groups.push(
        `<optgroup label="🎥 الكاميرات (Cameras)">${cameras
          .map((c) => `<option value="${esc(c.id)}" ${c.id === stickyId ? 'selected' : ''}>🎥 ${esc(c.name)}</option>`)
          .join('')}</optgroup>`
      );
    }
    sel.innerHTML =
      groups.length > 0
        ? groups.join('')
        : `<option value="">— لا توجد نتائج مطابقة للبحث —</option>`;

    if (active && sel.value) {
      active.lastSelectedLightEqId = sel.value;
      saveWorkspace();
    }
  }

  function filterDmxSelect(query) {
    const sel = document.getElementById('paperDmxAddFixtureSelect');
    const ws = getWorkspace();
    const active = getActivePaperProject();
    if (!sel || !ws) return;
    if (active) {
      active.lastDmxSearchQuery = query || '';
    }
    const q = String(query || '').trim().toLowerCase();
    const dmxFixtures = (ws.equipment || []).filter(
      (e) => e.type === 'fixture' && !e.isSplitter && (parseInt(e.footprint, 10) || 0) > 0
    );
    const matched = q
      ? dmxFixtures.filter((f) => {
          const hay = `${f.name || ''} ${f.badge || ''} ${f.footprint || ''}`.toLowerCase();
          return hay.includes(q);
        })
      : dmxFixtures;
    const stickyId = active ? active.lastSelectedDmxEqId : '';

    sel.innerHTML =
      matched.length > 0
        ? matched.map((f) => `<option value="${esc(f.id)}" ${f.id === stickyId ? 'selected' : ''}>💡 ${esc(f.name)} (${f.footprint} Ch)</option>`).join('')
        : `<option value="">— لا توجد كشافات مطابقة للبحث —</option>`;

    if (active && sel.value) {
      active.lastSelectedDmxEqId = sel.value;
      saveWorkspace();
    }
  }

  function restoreElementFocus(targetId) {
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof el.setSelectionRange === 'function' && (el.type === 'search' || el.type === 'text')) {
      const len = (el.value || '').length;
      try {
        el.setSelectionRange(len, len);
      } catch (e) {}
    }
  }

  async function addLightRow(keepFocusId) {
    const active = getActivePaperProject();
    const ws = getWorkspace();
    const selEl = document.getElementById('paperLightAddSelect');
    const searchEl = document.getElementById('paperLightSearchInput');
    if (!active || !ws || !selEl) return;
    const targetFocusId = keepFocusId || (document.activeElement && document.activeElement.id) || 'paperLightAddSelect';
    const eq = (ws.equipment || []).find((e) => e.id === selEl.value);
    if (!eq) return;

    active.lastSelectedLightEqId = eq.id;
    if (searchEl) active.lastLightSearchQuery = searchEl.value || '';

    const isCam = eq.type === 'camera';
    active.lightRows.push({
      id: 'lrow_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      equipmentId: eq.id,
      itemType: isCam ? 'camera' : 'fixture',
      name: eq.name,
      roleOrLocation: '',
      dimmerOrAperture: isCam ? 'f/2.8' : '100%',
      kelvin: '',
      colorOrIso: isCam ? `ISO ${eq.defaultIso || 800}` : '',
      modifierOrLens: '',
      shutter: isCam ? '1/50' : '',
      stLook: isCam ? Object.assign({ customized: false }, DEFAULT_PAPER_ST) : '',
      notes: ''
    });
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    renderSection();
    restoreElementFocus(targetFocusId);
  }

  function syncCameraFStopSelectUI(row, eqLenses) {
    if (!row) return;
    const sel = document.querySelector(`[data-fstop-select="${row.id}"]`);
    const stops = getApertureStopsForLens(row.modifierOrLens, eqLenses, row.dimmerOrAperture);
    const minNum = getLensMinApertureNum(row.modifierOrLens, eqLenses);
    const curNum = parseFStopNumber(row.dimmerOrAperture);
    if (!row.dimmerOrAperture || (Number.isFinite(curNum) && curNum < minNum - 0.01)) {
      row.dimmerOrAperture = stops[0] || `f/${minNum}`;
    }
    const finalStops = getApertureStopsForLens(row.modifierOrLens, eqLenses, row.dimmerOrAperture);
    if (sel) {
      sel.innerHTML = finalStops
        .map((st) => `<option value="${esc(st)}" ${row.dimmerOrAperture === st ? 'selected' : ''}>${esc(st)}</option>`)
        .join('');
      sel.value = row.dimmerOrAperture;
    }
  }

  async function onCameraLensSelectChange(rowId, value) {
    const active = getActivePaperProject();
    if (!active) return;
    const ws = getWorkspace();
    const eqLenses = (ws?.equipment || []).filter((e) => e.type === 'lens');
    const row = (active.lightRows || []).find((r) => r.id === rowId);
    if (!row) return;
    const manualInp = document.querySelector(`[data-lens-manual-id="${rowId}"]`);

    if (value === '__MANUAL__') {
      row._manualLens = true;
      if (manualInp) {
        manualInp.classList.remove('hidden');
        manualInp.focus();
      }
      syncCameraFStopSelectUI(row, eqLenses);
      active.updatedAt = new Date().toISOString();
      await saveWorkspace();
      return;
    }

    row._manualLens = false;
    row.modifierOrLens = value;
    if (manualInp) {
      manualInp.value = value;
      manualInp.classList.add('hidden');
    }
    syncCameraFStopSelectUI(row, eqLenses);
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    refreshLivePreview();
  }

  async function onCameraManualLensInput(rowId, value) {
    const active = getActivePaperProject();
    if (!active) return;
    const ws = getWorkspace();
    const eqLenses = (ws?.equipment || []).filter((e) => e.type === 'lens');
    const row = (active.lightRows || []).find((r) => r.id === rowId);
    if (!row) return;
    row.modifierOrLens = value;
    syncCameraFStopSelectUI(row, eqLenses);
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    refreshLivePreview();
  }

  async function stepCameraFStop(rowId, delta) {
    const active = getActivePaperProject();
    if (!active) return;
    const ws = getWorkspace();
    const eqLenses = (ws?.equipment || []).filter((e) => e.type === 'lens');
    const row = (active.lightRows || []).find((r) => r.id === rowId);
    if (!row) return;
    const stops = getApertureStopsForLens(row.modifierOrLens, eqLenses, row.dimmerOrAperture);
    if (!stops.length) return;
    let idx = stops.indexOf(String(row.dimmerOrAperture || '').trim());
    if (idx === -1) {
      const curNum = parseFStopNumber(row.dimmerOrAperture) || 2.8;
      idx = stops.findIndex((s) => parseFStopNumber(s) >= curNum - 0.01);
      if (idx === -1) idx = 0;
    }
    const nextIdx = Math.max(0, Math.min(stops.length - 1, idx + (delta > 0 ? 1 : -1)));
    row.dimmerOrAperture = stops[nextIdx];
    const sel = document.querySelector(`[data-fstop-select="${rowId}"]`);
    if (sel) sel.value = row.dimmerOrAperture;
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    refreshLivePreview();
  }

  function openCameraStModal(rowId) {
    if (!hasPaperPerm('paperCameraStLook')) {
      showToast('ليس لديك صلاحية تعديل ST Look للكاميرا', 'error');
      return;
    }
    const active = getActivePaperProject();
    if (!active) return;
    const row = (active.lightRows || []).find((r) => r.id === rowId);
    if (!row) return;
    editingStRowId = rowId;
    const st = normalizePaperST(row.stLook);
    row.stLook = st;
    const titleEl = document.getElementById('paperStCamTitle');
    if (titleEl) {
      titleEl.textContent = `🎥 ${row.name || 'Camera'}${row.roleOrLocation ? ` — ${row.roleOrLocation}` : ''}`;
    }
    Object.keys(DEFAULT_PAPER_ST).forEach((k) => {
      const inp = document.getElementById('paper_st_' + k);
      const lbl = document.getElementById('paper_val_st_' + k);
      const val = st[k] ?? DEFAULT_PAPER_ST[k];
      if (inp) inp.value = val;
      if (lbl) lbl.textContent = fmtSignedST(val, ['contrast', 'highlights', 'shadows', 'saturation'].includes(k));
    });
    const modal = document.getElementById('paperCameraStModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeCameraStModal() {
    editingStRowId = null;
    const modal = document.getElementById('paperCameraStModal');
    if (modal) modal.classList.add('hidden');
  }

  async function updatePaperSTField(key, val) {
    if (!hasPaperPerm('paperCameraStLook')) return;
    const active = getActivePaperProject();
    if (!active || !editingStRowId) return;
    const row = (active.lightRows || []).find((r) => r.id === editingStRowId);
    if (!row) return;
    const st = normalizePaperST(row.stLook);
    const num = parseInt(val, 10) || 0;
    st[key] = num;
    st.customized = true;
    row.stLook = st;
    const lbl = document.getElementById('paper_val_st_' + key);
    if (lbl) lbl.textContent = fmtSignedST(num, ['contrast', 'highlights', 'shadows', 'saturation'].includes(key));
    const stBtn = document.querySelector(`[data-st-row="${editingStRowId}"]`);
    if (stBtn) {
      stBtn.classList.add('is-modified');
      if (stBtn.firstChild) stBtn.firstChild.textContent = '🎛️ ST (Active)\n                    ';
      const btnMini = stBtn.querySelector('.paper-st-mini');
      if (btnMini) btnMini.textContent = formatPaperSTInline(st);
    }
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    refreshLivePreview();
  }

  async function resetPaperCameraST() {
    if (!hasPaperPerm('paperCameraStLook')) return;
    const active = getActivePaperProject();
    if (!active || !editingStRowId) return;
    const row = (active.lightRows || []).find((r) => r.id === editingStRowId);
    if (!row) return;
    row.stLook = Object.assign({ customized: false }, DEFAULT_PAPER_ST);
    Object.keys(DEFAULT_PAPER_ST).forEach((k) => {
      const inp = document.getElementById('paper_st_' + k);
      const lbl = document.getElementById('paper_val_st_' + k);
      const val = DEFAULT_PAPER_ST[k];
      if (inp) inp.value = val;
      if (lbl) lbl.textContent = fmtSignedST(val, ['contrast', 'highlights', 'shadows', 'saturation'].includes(k));
    });
    const stBtn = document.querySelector(`[data-st-row="${editingStRowId}"]`);
    if (stBtn) {
      stBtn.classList.remove('is-modified');
      if (stBtn.firstChild) stBtn.firstChild.textContent = '🎛️ ST Look\n                    ';
      const btnMini = stBtn.querySelector('.paper-st-mini');
      if (btnMini) btnMini.textContent = 'Default (Hidden in Sheet)';
    }
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    refreshLivePreview();
  }

  async function updateLightRow(rowId, field, value) {
    const active = getActivePaperProject();
    if (!active) return;
    const row = active.lightRows.find((r) => r.id === rowId);
    if (!row) return;
    row[field] = value;
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    refreshLivePreview();
  }

  async function deleteLightRow(rowId) {
    const active = getActivePaperProject();
    if (!active) return;
    active.lightRows = active.lightRows.filter((r) => r.id !== rowId);
    await saveWorkspace();
    renderSection();
  }

  function onOutputSelectChange(val) {
    const active = getActivePaperProject();
    if (active) {
      active.lastSelectedDmxOutput = val || '';
      saveWorkspace();
    }
  }

  async function addDmxRow(keepFocusId) {
    const active = getActivePaperProject();
    const ws = getWorkspace();
    const eqSel = document.getElementById('paperDmxAddFixtureSelect');
    const searchEl = document.getElementById('paperDmxSearchInput');
    const outSel = document.getElementById('paperDmxAddOutputSelect');
    const locInp = document.getElementById('paperDmxAddLocationInput');
    if (!active || !ws || !eqSel) return;
    const targetFocusId = keepFocusId || (document.activeElement && document.activeElement.id) || 'paperDmxAddFixtureSelect';

    const eq = (ws.equipment || []).find((e) => e.id === eqSel.value);
    if (!eq) return;
    active.lastSelectedDmxEqId = eq.id;
    if (searchEl) active.lastDmxSearchQuery = searchEl.value || '';
    const output = String(outSel ? (outSel.value || '') : (active.lastSelectedDmxOutput || '')).trim().toUpperCase();
    active.lastSelectedDmxOutput = output;
    const location = (locInp && locInp.value.trim()) || '';

    const sameOutputRows = active.dmxRows.filter(
      (r) => String(r.output || '').trim().toUpperCase() === output && (parseInt(r.fixtureNum, 10) || 0) > 0 && !r.isNonDmx
    );
    const maxNum = sameOutputRows.reduce((m, r) => Math.max(m, parseInt(r.fixtureNum, 10) || 0), 0);

    active.dmxRows.push({
      id: 'drow_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      equipmentId: eq.id,
      name: eq.name,
      output,
      fixtureNum: maxNum + 1,
      manualFixtureNum: false,
      footprint: Math.max(0, parseInt(eq.footprint, 10) || 0),
      startAddress: 1,
      endAddress: Math.max(1, parseInt(eq.footprint, 10) || 1),
      location,
      notes: ''
    });
    recalculatePaperDmx(active);
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();
    renderSection();
    restoreElementFocus(targetFocusId);
  }

  async function updateDmxRow(rowId, field, value) {
    const active = getActivePaperProject();
    if (!active) return;
    const row = active.dmxRows.find((r) => r.id === rowId);
    if (!row) return;
    if (field === 'fixtureNum') {
      const parsed = (value !== '' && value !== null && value !== undefined) ? parseInt(value, 10) : 1;
      const nextNum = isNaN(parsed) ? 1 : Math.max(0, parsed);
      if (row.fixtureNum !== nextNum) {
        row.fixtureNum = nextNum;
        row.isNonDmx = row.fixtureNum === 0;
        row.manualFixtureNum = true;
      }
    } else if (field === 'output') {
      const prevOut = String(row.output || '').trim().toUpperCase();
      const nextOut = String(value || '').trim().toUpperCase();
      row.output = nextOut;
      active.lastSelectedDmxOutput = nextOut;
      if (prevOut !== nextOut && row.fixtureNum !== 0 && !row.isNonDmx) {
        const othersInNext = active.dmxRows.filter(
          (r) =>
            r.id !== row.id &&
            String(r.output || '').trim().toUpperCase() === nextOut &&
            (parseInt(r.fixtureNum, 10) || 0) > 0 &&
            !r.isNonDmx
        );
        const maxInNext = othersInNext.reduce((m, r) => Math.max(m, parseInt(r.fixtureNum, 10) || 0), 0);
        row.fixtureNum = maxInNext + 1;
        row.manualFixtureNum = false;
      }
    } else {
      row[field] = value;
    }
    recalculatePaperDmx(active);
    active.updatedAt = new Date().toISOString();
    await saveWorkspace();

    if (field === 'location' || field === 'notes') {
      refreshLivePreview();
    } else {
      const rowIdx = active.dmxRows.findIndex((r) => r.id === rowId);
      renderSection();
      if (rowIdx >= 0) {
        const sameCell = document.querySelector(`.paper-edit-table [data-row-idx="${rowIdx}"][data-col-field="${field}"]`);
        if (sameCell) sameCell.focus({ preventScroll: true });
      }
    }
  }

  /**
   * Vertical Column Navigation on Tab / ArrowDown / ArrowUp / Enter inside Paper Project Tables
   */
  async function onCellKeyDown(e, rowIdx, field, rowId) {
    const isSelect = e.target && e.target.tagName === 'SELECT';
    if (isSelect && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      return;
    }
    const isDown = (e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowDown' || e.key === 'Enter';
    const isUp = (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowUp';
    if (!isDown && !isUp) return;

    e.preventDefault();
    const nextIdx = isDown ? rowIdx + 1 : rowIdx - 1;
    if (nextIdx < 0) return;

    // If editing fixtureNum or output in DMX table, commit the current input value before navigating
    if (rowId && (field === 'fixtureNum' || field === 'output') && e.target) {
      await updateDmxRow(rowId, field, e.target.value);
    }

    const nextCell = document.querySelector(`.paper-edit-table [data-row-idx="${nextIdx}"][data-col-field="${field}"]`);
    if (nextCell) {
      nextCell.focus();
      if (typeof nextCell.select === 'function' && nextCell.tagName === 'INPUT') {
        try {
          nextCell.select();
        } catch (err) {}
      }
    }
  }

  async function deleteDmxRow(rowId) {
    const active = getActivePaperProject();
    if (!active) return;
    active.dmxRows = active.dmxRows.filter((r) => r.id !== rowId);
    recalculatePaperDmx(active);
    await saveWorkspace();
    renderSection();
  }

  // ==========================================================================
  // EXPORT ACTIONS (IMAGE PNG/JPG, PRINT A4/THERMAL, EXCEL, CSV, WORD)
  // ==========================================================================
  function getCurrentPrintableHTML() {
    const active = getActivePaperProject();
    if (!active) return '';
    return activeSubTab === 'light' ? buildLightPrintableHTML(active) : buildDmxPrintableHTML(active);
  }

  function toggleDropdownByIds(btnId, menuId, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById(menuId);
    const btn = document.getElementById(btnId);
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    document.querySelectorAll('.print-dropdown-menu').forEach((m) => m.classList.add('hidden'));
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

  function closePrintMenu() {
    const m = document.getElementById('paperPrintDropdownMenu');
    if (m) m.classList.add('hidden');
  }

  function togglePrintMenu(e) {
    toggleDropdownByIds('paperPrintMenuBtn', 'paperPrintDropdownMenu', e);
  }

  function closeBackupMenu() {
    const m = document.getElementById('paperBackupDropdownMenu');
    if (m) m.classList.add('hidden');
  }

  function toggleBackupMenu(e) {
    toggleDropdownByIds('paperBackupMenuBtn', 'paperBackupDropdownMenu', e);
  }

  function printCurrentSheet() {
    const active = getActivePaperProject();
    if (!active) return;
    const fmt =
      printFormatOverride ||
      (global.CineLightDB ? global.CineLightDB.getAppSettingsSync().printFormat : 'A4');
    const orientation = resolvePaperMeta(active).pageOrientation;
    global.ShamsExport.print(getCurrentPrintableHTML(), {
      format: fmt,
      orientation,
      title: `${active.name} (${activeSubTab.toUpperCase()})`
    });
  }

  function exportCurrentImage(imgType = 'png') {
    const active = getActivePaperProject();
    if (!active) return;
    const safeName = active.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const orientation = resolvePaperMeta(active).pageOrientation;
    global.ShamsExport.exportImage(getCurrentPrintableHTML(), {
      type: imgType,
      orientation,
      width: orientation === 'landscape' ? 1160 : 810,
      filename: `${safeName}_${activeSubTab}_${orientation}.${imgType}`
    });
  }

  function exportCurrentExcel() {
    const active = getActivePaperProject();
    if (!active) return;
    const safeName = active.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const orientation = resolvePaperMeta(active).pageOrientation;
    global.ShamsExport.exportExcel(
      getCurrentPrintableHTML(),
      `${safeName}_${activeSubTab}.xls`,
      { orientation }
    );
  }

  function exportCurrentCSV() {
    const active = getActivePaperProject();
    if (!active) return;
    const ws = getWorkspace();
    const safeName = active.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const rows = [];
    if (activeSubTab === 'light') {
      const fixtureRows = active.lightRows.filter((r) => !isCameraRow(r, ws));
      const cameraRows = active.lightRows.filter((r) => isCameraRow(r, ws));
      if (fixtureRows.length > 0) {
        rows.push(['=== Fixtures ===']);
        rows.push(['#', 'Fixture', 'Location', 'Dimmer', 'Kelvin', 'Color', 'Accessory', 'Notes']);
        fixtureRows.forEach((r, i) => {
          rows.push([
            i + 1,
            r.name,
            r.roleOrLocation,
            r.dimmerOrAperture,
            r.kelvin,
            r.colorOrIso,
            r.modifierOrLens,
            r.notes
          ]);
        });
      }
      if (cameraRows.length > 0) {
        const canStLook = hasPaperPerm('paperCameraStLook');
        const hasAnySt = canStLook && cameraRows.some((r) => isPaperSTModified(r.stLook));
        if (rows.length > 0) rows.push([]);
        rows.push(['=== Cameras ===']);
        const camHeaders = ['#', 'Camera', 'Location', 'Lens', 'Kelvin', 'ISO', 'F-Stop', 'Shutter'];
        if (hasAnySt) camHeaders.push('ST Look');
        camHeaders.push('Notes');
        rows.push(camHeaders);
        cameraRows.forEach((r, i) => {
          const line = [
            `Cam ${i + 1}`,
            r.name,
            r.roleOrLocation,
            r.modifierOrLens,
            r.kelvin,
            r.colorOrIso,
            r.dimmerOrAperture,
            r.shutter || ''
          ];
          if (hasAnySt) line.push(isPaperSTModified(r.stLook) ? formatPaperSTInline(r.stLook) : '');
          line.push(r.notes);
          rows.push(line);
        });
      }
    } else {
      recalculatePaperDmx(active);
      rows.push(['Fixture #', 'Fixture', 'Output Universe', 'Channels', 'Address', 'Location', 'Notes']);
      active.dmxRows.forEach((r) => {
        rows.push([
          r.fixtureNum,
          r.name,
          r.output,
          r.footprint,
          r.startAddress || '',
          r.location,
          r.notes
        ]);
      });
    }
    global.ShamsExport.exportCSV(rows, `${safeName}_${activeSubTab}.csv`);
  }

  function exportCurrentWord() {
    const active = getActivePaperProject();
    if (!active) return;
    const safeName = active.name.replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const orientation = resolvePaperMeta(active).pageOrientation;
    global.ShamsExport.exportWord(
      getCurrentPrintableHTML(),
      `${safeName}_${activeSubTab}.doc`,
      active.name,
      { orientation }
    );
  }

  function exportProjectFile() {
    const active = getActivePaperProject();
    if (!active) return;
    recalculatePaperDmx(active);
    const payload = {
      app: 'ShamsElber_Paper_Project',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      paperProject: JSON.parse(JSON.stringify(active))
    };
    const safeName = (active.name || 'Paper_Project').replace(/[^\w\u0600-\u06FF-]+/g, '_');
    const filename = `${safeName}_Paper.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    if (global.ShamsExport && typeof global.ShamsExport.triggerDownloadBlob === 'function') {
      global.ShamsExport.triggerDownloadBlob(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (global.CineApp && typeof global.CineApp.showToast === 'function') {
      global.CineApp.showToast(`📤 تم أخذ نسخة ملف المشروع الورقي: ${filename}`);
    }
  }

  async function importProjectFile(e) {
    const input = e && e.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const raw = (parsed && parsed.paperProject) || parsed;
      if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.lightRows) && !Array.isArray(raw.dmxRows))) {
        alert('ملف المشروع الورقي غير صالح / Invalid Paper Project JSON file.');
        return;
      }

      const list = ensurePaperProjectsList();
      const baseName = String(raw.name || file.name.replace(/\.json$/i, '') || 'مشروع ورقي مستورد').trim();
      const nameExists = list.some((p) => String(p.name || '').trim() === baseName);

      const importedProj = {
        id: 'paper_' + Date.now() + '_' + Math.floor(Math.random() * 999),
        name: nameExists ? `${baseName} (مستورد)` : baseName,
        programmer: raw.programmer !== undefined ? String(raw.programmer) : '',
        dop: raw.dop !== undefined ? String(raw.dop) : '',
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLightSearchQuery: raw.lastLightSearchQuery || '',
        lastDmxSearchQuery: raw.lastDmxSearchQuery || '',
        lastSelectedLightEqId: raw.lastSelectedLightEqId || '',
        lastSelectedDmxEqId: raw.lastSelectedDmxEqId || '',
        lastSelectedDmxOutput: raw.lastSelectedDmxOutput || '',
        lightRows: Array.isArray(raw.lightRows) ? JSON.parse(JSON.stringify(raw.lightRows)) : [],
        dmxRows: Array.isArray(raw.dmxRows) ? JSON.parse(JSON.stringify(raw.dmxRows)) : []
      };

      recalculatePaperDmx(importedProj);
      list.unshift(importedProj);
      activePaperProjectId = importedProj.id;
      await saveWorkspace();
      renderSection();
      if (global.CineApp && typeof global.CineApp.showToast === 'function') {
        global.CineApp.showToast(`✅ تم استيراد المشروع الورقي بنجاح: ${importedProj.name}`);
      }
    } catch (err) {
      alert('تعذر قراءة ملف المشروع الورقي / Failed to parse JSON file.');
    } finally {
      if (input) input.value = '';
    }
  }

  global.ShamsPaper = {
    renderSection,
    selectProject,
    createNewProject,
    renameCurrentProject,
    deleteCurrentProject,
    switchSubTab,
    onFormatChange,
    onOrientationChange,
    updateProjectMetaField,
    onLightFixtureSelectChange,
    onDmxFixtureSelectChange,
    filterLightSelect,
    filterDmxSelect,
    onOutputSelectChange,
    addLightRow,
    updateLightRow,
    onCameraLensSelectChange,
    onCameraManualLensInput,
    stepCameraFStop,
    deleteLightRow,
    openCameraStModal,
    closeCameraStModal,
    updatePaperSTField,
    resetPaperCameraST,
    addDmxRow,
    updateDmxRow,
    onCellKeyDown,
    deleteDmxRow,
    printCurrentSheet,
    togglePrintMenu,
    closePrintMenu,
    toggleBackupMenu,
    closeBackupMenu,
    exportCurrentImage,
    exportCurrentExcel,
    exportCurrentCSV,
    exportCurrentWord,
    exportProjectFile,
    importProjectFile,
    adjustPreviewZoom,
    resetPreviewZoom
  };
})(window);
