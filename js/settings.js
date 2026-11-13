/**
 * ShamsElber light. DMX — Main Dashboard Settings Gear (⚙️ الإعدادات العامة)
 * Implements Section 2.1:
 * 1. User Management (إدارة المستخدمين) inside Settings Modal
 * 2. Change Password (تغيير كلمة المرور) inside Settings Modal (master Admin is gerges / gerges)
 * 3. App Logo Upload (لوجو البرنامج الرئيسي) shown in header & all exports
 * 4. Default Header Info (Company / DOP / Lighting Designer)
 * 5. Max Amps Breaker Limit (سعة الأمبير القصوى: 16A / 32A / 63A / custom)
 * 6. DMX Universe Color Coding (تخصيص ألوان مخارج الـ DMX: A, B, C, D)
 * 7. Default Print Format (A4 / Thermal Receipt 80mm / Thermal Receipt 58mm)
 * 8. Full Database Backup & Restore (JSON Export / Import)
 */
(function (global) {
  'use strict';

  let activeTab = 'general';

  async function init() {
    if (!global.CineLightDB) return;
    const settings = await global.CineLightDB.getAppSettings();
    injectDashboardGearButton();
    injectSettingsModalDOM();
    applyBrandingAndSettingsToDOM(settings);

    window.addEventListener('shams:settings-changed', (e) => {
      applyBrandingAndSettingsToDOM((e && e.detail) || global.CineLightDB.getAppSettingsSync());
    });
  }

  function injectDashboardGearButton() {
    const userBar = document.querySelector('.dash-header .dash-user-bar');
    if (userBar && !document.getElementById('mainSettingsGearBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'mainSettingsGearBtn';
      btn.className = 'shams-compact-gear-btn';
      btn.innerHTML = '⚙️';
      btn.title = 'الإعدادات العامة، إدارة المستخدمين، اللوجو، الأمبير، والنسخ الاحتياطي';
      btn.onclick = () => openModal('general');
      userBar.insertBefore(btn, userBar.firstChild);
    }

    // Keep User Management strictly inside Settings ⚙️ rather than in the main Dashboard nav grid
    const navBtnUsers = document.getElementById('navBtnUsers');
    if (navBtnUsers) {
      navBtnUsers.style.display = 'none';
    }
  }

  function injectSettingsModalDOM() {
    if (document.getElementById('mainAppSettingsModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'mainAppSettingsModal';
    wrap.className = 'modal-backdrop hidden';
    wrap.innerHTML = `
      <div class="modal-window modal-xl shams-settings-window" dir="rtl">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.35rem;">⚙️</span>
            <div>
              <h3 style="margin:0;">الإعدادات العامة للبرنامج (Main Suite Settings)</h3>
              <div style="font-size:0.74rem;color:var(--text-muted);">الشعار • الهيدر • سعة الأمبير • ألوان الـ DMX • مقاس الطباعة • إدارة المستخدمين • النسخ الاحتياطي</div>
            </div>
          </div>
          <button type="button" class="modal-close-btn" onclick="ShamsSettings.closeModal()">✕</button>
        </div>

        <div class="shams-settings-tabs" id="mainSettingsTabsBar">
          <button type="button" class="shams-tab-btn active" data-tab="general" onclick="ShamsSettings.switchTab('general')">🎨 اللوجو والهيدر والطباعة</button>
          <button type="button" class="shams-tab-btn" data-tab="dmx_power" onclick="ShamsSettings.switchTab('dmx_power')">⚡ الأمبير وألوان DMX</button>
          <button type="button" class="shams-tab-btn" data-tab="users" id="settingsTabUsersBtn" onclick="ShamsSettings.switchTab('users')">👥 إدارة المستخدمين</button>
          <button type="button" class="shams-tab-btn" data-tab="password" onclick="ShamsSettings.switchTab('password')">🔑 كلمة المرور</button>
          <button type="button" class="shams-tab-btn" data-tab="backup" onclick="ShamsSettings.switchTab('backup')">💾 النسخ الاحتياطي</button>
        </div>

        <div class="modal-body shams-settings-body">
          <!-- TAB 1: BRANDING, HEADER & PRINT FORMAT -->
          <div id="settingsPane_general" class="shams-settings-pane">
            <div class="shams-settings-grid">
              <div class="shams-settings-card">
                <h4>🖼️ لوجو البرنامج الرئيسي (App Logo Upload)</h4>
                <p class="shams-hint">يظهر في الهيدر الرئيسي وفي جميع تقارير الطباعة والتصدير (PDF / صور / ريسيت).</p>
                <div style="display:flex;align-items:center;gap:14px;margin-top:10px;flex-wrap:wrap;">
                  <img id="settingsLogoPreview" src="./FB_IMG_1794520985975.jpg" alt="App Logo" style="width:68px;height:68px;object-fit:contain;border-radius:12px;border:1px solid var(--border-subtle);background:#ffffff;padding:4px;" />
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    <label class="btn btn-primary" style="cursor:pointer;margin:0;">
                      📤 رفع لوجو جديد (PNG / JPG / SVG)
                      <input type="file" id="settingsLogoFileInput" accept="image/*" style="display:none;" onchange="ShamsSettings.onLogoFileSelected(event)" />
                    </label>
                    <button type="button" class="btn btn-secondary" onclick="ShamsSettings.resetLogo()">↺ استعادة اللوجو الافتراضي</button>
                  </div>
                </div>
              </div>

              <div class="shams-settings-card">
                <h4>🖨️ مقاس الطباعة الافتراضي (Default Print Format)</h4>
                <p class="shams-hint">اختر مقاس الورق الافتراضي عند طباعة البلان أو المشروع الورقي أو ماكينة الريسيت الحرارية.</p>
                <div class="form-group" style="margin-top:10px;">
                  <label>نوع ومقاس الطباعة:</label>
                  <select id="settingsPrintFormat" class="form-control">
                    <option value="A4">📄 ورق قياسي A4 (Standard A4 Sheet)</option>
                    <option value="thermal80">🧾 ماكينة ريسيت حراري 80mm (Thermal Receipt 80mm)</option>
                    <option value="thermal58">🧾 ماكينة ريسيت حراري 58mm (Thermal Receipt 58mm)</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="shams-settings-card" style="margin-top:14px;">
              <h4>📋 بيانات الهيدر الافتراضية على الشيتات والتقارير (Default Export Header Info)</h4>
              <div class="form-grid-3" style="margin-top:10px;">
                <div class="form-group">
                  <label>اسم الشركة / الجهة (Company / Studio)</label>
                  <input type="text" id="settingsCompanyName" class="form-control" placeholder="مثال: ShamsElber Studio" />
                </div>
                <div class="form-group">
                  <label>مدير التصوير الافتراضي (Default DOP)</label>
                  <input type="text" id="settingsDopName" class="form-control" placeholder="مثال: Gerges" />
                </div>
                <div class="form-group">
                  <label>مصمم الإضاءة / مبرمج DMX (Lighting Designer)</label>
                  <input type="text" id="settingsDesignerName" class="form-control" placeholder="مثال: Lighting Lead" />
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: MAX AMPS BREAKER & DMX UNIVERSE COLORS -->
          <div id="settingsPane_dmx_power" class="shams-settings-pane hidden">
            <div class="shams-settings-grid">
              <div class="shams-settings-card">
                <h4>⚡ سعة الأمبير القصوى للقاطع (Max Amps Breaker Limit)</h4>
                <p class="shams-hint">يتحول عداد الأحمال إلى اللون الأحمر التحذيري فور تجاوز سعة الأمبير المحددة (بدون تعقيد فولت).</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
                  <button type="button" class="btn btn-secondary" onclick="ShamsSettings.setQuickAmps(16)">16A</button>
                  <button type="button" class="btn btn-secondary" onclick="ShamsSettings.setQuickAmps(32)">32A</button>
                  <button type="button" class="btn btn-secondary" onclick="ShamsSettings.setQuickAmps(63)">63A</button>
                  <button type="button" class="btn btn-secondary" onclick="ShamsSettings.setQuickAmps(125)">125A</button>
                </div>
                <div class="form-group">
                  <label>الحد الأقصى للأمبير (Amps):</label>
                  <input type="number" id="settingsMaxAmps" class="form-control" min="1" max="1000" step="1" value="32" />
                </div>
              </div>

              <div class="shams-settings-card">
                <h4>🎨 تخصيص ألوان مخارج الـ DMX (DMX Universe Color Coding)</h4>
                <p class="shams-hint">تُستخدم هذه الألوان في كابلات الـ DMX والشارات وجداول الباتش لكل مخرج (A / B / C / D).</p>
                <div class="form-grid-2" style="margin-top:10px;">
                  <div class="form-group">
                    <label>Universe / Channel A</label>
                    <input type="color" id="settingsColorA" class="form-control" style="height:40px;padding:3px;" value="#f59e0b" />
                  </div>
                  <div class="form-group">
                    <label>Universe / Channel B</label>
                    <input type="color" id="settingsColorB" class="form-control" style="height:40px;padding:3px;" value="#38bdf8" />
                  </div>
                  <div class="form-group">
                    <label>Universe / Channel C</label>
                    <input type="color" id="settingsColorC" class="form-control" style="height:40px;padding:3px;" value="#10b981" />
                  </div>
                  <div class="form-group">
                    <label>Universe / Channel D</label>
                    <input type="color" id="settingsColorD" class="form-control" style="height:40px;padding:3px;" value="#e879f9" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: USER MANAGEMENT (Embedded inside Settings) -->
          <div id="settingsPane_users" class="shams-settings-pane hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
              <div>
                <h4 style="margin:0;">👥 إدارة المستخدمين وصلاحيات الأقسام (User Management &amp; RBAC)</h4>
                <div style="font-size:0.76rem;color:var(--text-muted);">حساب المدير الرئيسي الافتراضي: <code>gerges</code> / كلمة المرور: <code>gerges</code></div>
              </div>
              <button type="button" class="btn btn-primary" onclick="CineApp.openUserCrudModal(null)">➕ إضافة مستخدم جديد (Add New User)</button>
            </div>
            <div id="settingsUsersHost"></div>
          </div>

          <!-- TAB 4: CHANGE PASSWORD -->
          <div id="settingsPane_password" class="shams-settings-pane hidden">
            <div class="shams-settings-card" style="max-width:480px;margin:0 auto;">
              <h4>🔑 تغيير كلمة المرور (Change Password)</h4>
              <p class="shams-hint">ملاحظة: حساب المدير الرئيسي (<code>gerges</code> / <code>gerges</code>) ثابت لحماية النظام، ويمكن للمستخدمين الآخرين تغيير كلمات مرورهم من هنا.</p>
              <div class="form-group" style="margin-top:10px;">
                <label>كلمة المرور الحالية</label>
                <input type="password" id="settingsCurrPass" class="form-control" placeholder="••••••••" />
              </div>
              <div class="form-group">
                <label>كلمة المرور الجديدة</label>
                <input type="password" id="settingsNewPass" class="form-control" placeholder="••••••••" />
              </div>
              <button type="button" class="btn btn-primary" style="margin-top:8px;" onclick="ShamsSettings.changeOwnPassword()">💾 تحديث كلمة المرور</button>
            </div>
          </div>

          <!-- TAB 5: DATABASE BACKUP & PROJECT FOLDER SYNC -->
          <div id="settingsPane_backup" class="shams-settings-pane hidden">
            <div class="shams-settings-card" style="margin-bottom:14px;">
              <h4>📁 مجلد بيانات المشاريع (<code>project/data.json</code>)</h4>
              <p class="shams-hint" style="margin-top:4px;">
                يحفظ جميع مشاريعك ومعداتك وأماكنك ومستخدميك داخل مجلد <code>project/data.json</code> حتى تنتقل معك عند نسخ مجلد <code>app</code> لأي جهاز آخر أو عند رفعه على الإنترنت.
              </p>
              <div id="projectFolderSyncStatus" style="margin-top:10px;padding:9px 12px;border-radius:10px;background:rgba(15,23,42,0.45);border:1px solid var(--border-subtle);font-size:0.8rem;">
                جاري فحص حالة المزامنة...
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                <button type="button" class="btn btn-primary" onclick="ShamsSettings.syncSaveProjectFolder()">💾 حفظ في مجلد project الآن</button>
                <button type="button" class="btn btn-emerald" onclick="ShamsSettings.downloadProjectDataFile()">⬇️ تحميل data.json لمجلد project</button>
                <button type="button" class="btn btn-secondary" onclick="ShamsSettings.syncLoadProjectFolder()">🔄 استيراد من مجلد project/data.json</button>
              </div>
            </div>

            <div class="shams-settings-grid">
              <div class="shams-settings-card">
                <h4>📥 تصدير نسخة احتياطية كاملة (Full JSON Backup)</h4>
                <p class="shams-hint">يحفظ جميع المشاريع، المشاريع الورقية، المعدات، الأماكن، المستخدمين، والإعدادات في ملف JSON واحد على جهازك.</p>
                <button type="button" class="btn btn-emerald" style="margin-top:12px;" onclick="ShamsSettings.exportBackupJSON()">⬇️ تحميل ملف النسخة الاحتياطية (.json)</button>
              </div>

              <div class="shams-settings-card">
                <h4>📤 استعادة نسخة احتياطية (Restore JSON Backup)</h4>
                <p class="shams-hint">استرجاع كافة بيانات البرنامج من ملف نسخة احتياطية محفوظ مسبقاً.</p>
                <label class="btn btn-primary" style="margin-top:12px;cursor:pointer;display:inline-flex;">
                  📂 اختيار ملف النسخة الاحتياطية (.json)
                  <input type="file" accept=".json,application/json" style="display:none;" onchange="ShamsSettings.importBackupJSON(event)" />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="ShamsSettings.closeModal()">إغلاق (Close)</button>
          <button type="button" class="btn btn-primary" onclick="ShamsSettings.saveFromUI()">💾 حفظ الإعدادات العامة (Save Settings)</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    // Move existing #usersManagerGrid into #settingsUsersHost so CineApp.renderUsersManagerSection renders inside Settings
    const existingGrid = document.getElementById('usersManagerGrid');
    const host = document.getElementById('settingsUsersHost');
    if (existingGrid && host) {
      host.appendChild(existingGrid);
    }
  }

  async function openModal(defaultTab = 'general') {
    injectSettingsModalDOM();
    const canAppSettings =
      global.CineApp && typeof global.CineApp.canAccess === 'function'
        ? global.CineApp.canAccess('appGeneralSettings')
        : true;
    const isAdm = global.CineApp && typeof global.CineApp.isAdminUser === 'function' ? global.CineApp.isAdminUser() : true;
    if (!canAppSettings && !isAdm) {
      if (global.CineApp && typeof global.CineApp.showToast === 'function') {
        global.CineApp.showToast('🔒 غير مصرح لك بفتح الإعدادات العامة للبرنامج');
      }
      return;
    }

    const settings = await global.CineLightDB.getAppSettings();
    document.getElementById('settingsLogoPreview').src = settings.logoDataURL || './FB_IMG_1794520985975.jpg';
    document.getElementById('settingsPrintFormat').value = settings.printFormat || 'A4';
    document.getElementById('settingsCompanyName').value = settings.companyName || '';
    document.getElementById('settingsDopName').value = settings.dopName || '';
    document.getElementById('settingsDesignerName').value = settings.designerName || '';
    document.getElementById('settingsMaxAmps').value = settings.maxAmps || 32;

    const uc = settings.universeColors || {};
    document.getElementById('settingsColorA').value = uc.A || '#f59e0b';
    document.getElementById('settingsColorB').value = uc.B || '#38bdf8';
    document.getElementById('settingsColorC').value = uc.C || '#10b981';
    document.getElementById('settingsColorD').value = uc.D || '#e879f9';

    const usersTabBtn = document.getElementById('settingsTabUsersBtn');
    if (usersTabBtn) usersTabBtn.classList.toggle('hidden', !isAdm);

    if (global.CineApp && typeof global.CineApp.renderUsersManagerSection === 'function' && isAdm) {
      await global.CineApp.renderUsersManagerSection();
    }

    switchTab(defaultTab);
    refreshProjectFolderSyncStatus();
    document.getElementById('mainAppSettingsModal').classList.remove('hidden');
  }

  function closeModal() {
    const m = document.getElementById('mainAppSettingsModal');
    if (m) m.classList.add('hidden');
  }

  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('#mainSettingsTabsBar .shams-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    ['general', 'dmx_power', 'users', 'password', 'backup'].forEach((id) => {
      const pane = document.getElementById('settingsPane_' + id);
      if (pane) pane.classList.toggle('hidden', id !== tabId);
    });
    if (tabId === 'backup') {
      refreshProjectFolderSyncStatus();
    }
  }

  function setQuickAmps(amps) {
    const inp = document.getElementById('settingsMaxAmps');
    if (inp) inp.value = amps;
  }

  function onLogoFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        let w = img.width || 192;
        let h = img.height || 192;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/png');
        document.getElementById('settingsLogoPreview').src = dataUrl;
        document.getElementById('settingsLogoPreview').dataset.pendingLogo = dataUrl;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    const prev = document.getElementById('settingsLogoPreview');
    if (prev) {
      prev.src = './FB_IMG_1794520985975.jpg';
      prev.dataset.pendingLogo = '';
    }
  }

  async function saveFromUI() {
    const prev = document.getElementById('settingsLogoPreview');
    const curSettings = await global.CineLightDB.getAppSettings();
    const logoDataURL =
      prev && prev.dataset.pendingLogo !== undefined ? prev.dataset.pendingLogo : curSettings.logoDataURL;

    const updated = await global.CineLightDB.saveAppSettings({
      logoDataURL,
      printFormat: document.getElementById('settingsPrintFormat').value || 'A4',
      companyName: document.getElementById('settingsCompanyName').value.trim(),
      dopName: document.getElementById('settingsDopName').value.trim(),
      designerName: document.getElementById('settingsDesignerName').value.trim(),
      maxAmps: Math.max(1, parseFloat(document.getElementById('settingsMaxAmps').value) || 32),
      universeColors: {
        A: document.getElementById('settingsColorA').value || '#f59e0b',
        B: document.getElementById('settingsColorB').value || '#38bdf8',
        C: document.getElementById('settingsColorC').value || '#10b981',
        D: document.getElementById('settingsColorD').value || '#e879f9'
      }
    });

    applyBrandingAndSettingsToDOM(updated);
    if (global.CineApp && global.CineApp.showToast) {
      global.CineApp.showToast('✅ تم حفظ الإعدادات العامة بنجاح');
    }
    closeModal();
  }

  function applyBrandingAndSettingsToDOM(settings) {
    if (!settings) return;
    const logoSrc = settings.logoDataURL || './FB_IMG_1794520985975.jpg';
    document.querySelectorAll('.auth-logo-wrap img, .auth-brand img, .dash-brand img, .app-logo-img').forEach((img) => {
      img.src = logoSrc;
    });
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((lnk) => {
      lnk.href = logoSrc;
    });
    if (global.ShamsWorkspaceUI && typeof global.ShamsWorkspaceUI.refreshPowerUI === 'function') {
      global.ShamsWorkspaceUI.refreshPowerUI();
    }
  }

  async function changeOwnPassword() {
    const user = global.CineApp && global.CineApp.getCurrentUser ? global.CineApp.getCurrentUser() : null;
    if (!user) return;
    const curP = document.getElementById('settingsCurrPass').value;
    const newP = document.getElementById('settingsNewPass').value;
    const res = await global.CineLightDB.changeUserPassword(user.username, curP, newP, false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    document.getElementById('settingsCurrPass').value = '';
    document.getElementById('settingsNewPass').value = '';
    if (global.CineApp && global.CineApp.showToast) {
      global.CineApp.showToast('🔑 تم تحديث كلمة المرور بنجاح');
    }
  }

  async function exportBackupJSON() {
    const backup = await global.CineLightDB.exportFullBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const fname = `ShamsElber_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    global.ShamsExport.triggerDownloadBlob(blob, fname);
    if (global.CineApp && global.CineApp.showToast) {
      global.CineApp.showToast('💾 تم تصدير النسخة الاحتياطية الكاملة');
    }
  }

  async function importBackupJSON(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await global.CineLightDB.importFullBackup(json);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      if (global.CineApp && global.CineApp.showToast) {
        global.CineApp.showToast('✅ تمت استعادة النسخة الاحتياطية — جاري تحديث البرنامج...');
      }
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      alert('ملف JSON غير صالح / Invalid JSON backup file.');
    }
  }

  function refreshProjectFolderSyncStatus() {
    const el = document.getElementById('projectFolderSyncStatus');
    if (!el || !global.CineLightDB || typeof global.CineLightDB.getProjectFolderSyncInfo !== 'function') return;
    const info = global.CineLightDB.getProjectFolderSyncInfo();
    const timeStr = info.lastSyncedAt ? new Date(info.lastSyncedAt).toLocaleString('ar-EG') : 'لم يتم بعد';
    if (info.isLocalDiskServer) {
      el.innerHTML =
        `<div style="color:#34d399;font-weight:700;">🟢 متصل بالسيرفر المحلي — المزامنة التلقائية مع <code>project/data.json</code> مفعّلة</div>` +
        `<div style="color:var(--text-muted);margin-top:4px;">آخر حفظ داخل المجلد: ${timeStr}</div>`;
    } else {
      el.innerHTML =
        `<div style="color:#38bdf8;font-weight:700;">🌐 وضع الويب / الاستضافة — يتم تحميل البيانات تلقائياً من <code>project/data.json</code> عند الفتح</div>` +
        `<div style="color:var(--text-muted);margin-top:4px;">لتحديث المجلد قبل إعادة الرفع أو النقل، اضغط <strong>تحميل data.json</strong> واستبدله داخل مجلد <code>project/</code>.</div>`;
    }
  }

  async function syncSaveProjectFolder() {
    if (!global.CineLightDB || typeof global.CineLightDB.saveToProjectFolderNow !== 'function') return;
    const info = global.CineLightDB.getProjectFolderSyncInfo();
    if (!info.isLocalDiskServer) {
      await downloadProjectDataFile();
      return;
    }
    const res = await global.CineLightDB.saveToProjectFolderNow();
    refreshProjectFolderSyncStatus();
    if (res && res.ok) {
      global.CineApp?.showToast?.('💾 تم حفظ جميع المشاريع داخل project/data.json بنجاح');
    } else {
      alert('تعذر الكتابة المباشرة في مجلد project — سيتم تحميل ملف data.json بدلاً من ذلك.');
      await downloadProjectDataFile();
    }
  }

  async function downloadProjectDataFile() {
    if (!global.CineLightDB || typeof global.CineLightDB.buildPortableProjectBundle !== 'function') return;
    const bundle = await global.CineLightDB.buildPortableProjectBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    global.ShamsExport.triggerDownloadBlob(blob, 'data.json');
    global.CineApp?.showToast?.('⬇️ تم تحميل ملف data.json — ضعه داخل مجلد project/');
  }

  async function syncLoadProjectFolder() {
    if (!global.CineLightDB || typeof global.CineLightDB.forceImportFromProjectFolder !== 'function') return;
    if (!confirm('سيتم تحديث بيانات البرنامج من ملف project/data.json الموجود داخل المجلد. هل تريد المتابعة؟')) {
      return;
    }
    const res = await global.CineLightDB.forceImportFromProjectFolder();
    if (!res.ok) {
      alert(res.error);
      return;
    }
    global.CineApp?.showToast?.('✅ تم تحميل البيانات من مجلد project/data.json — جاري التحديث...');
    setTimeout(() => window.location.reload(), 650);
  }

  global.ShamsSettings = {
    init,
    openModal,
    closeModal,
    switchTab,
    setQuickAmps,
    onLogoFileSelected,
    resetLogo,
    saveFromUI,
    changeOwnPassword,
    exportBackupJSON,
    importBackupJSON,
    syncSaveProjectFolder,
    downloadProjectDataFile,
    syncLoadProjectFolder,
    refreshProjectFolderSyncStatus,
    applyBrandingAndSettingsToDOM
  };
})(window);
