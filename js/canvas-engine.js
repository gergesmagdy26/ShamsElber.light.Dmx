/**
 * CineLight & DMX Stage Planner
 * High-Performance 60 FPS 2D & Overhauled 3D Perspective Viewport Engine
 * Includes:
 * - Item Scale (+ / -), Left D-Pad Hide/Show & Auto-Hide on Outside Click / Re-Tap
 * - Light Beam, Camera FOV Cone & Fixture Name Toggles
 * - Adjustable Truss Size & Structural Steel Thickness (2D & 3D)
 * - Interactive Manual DMX Cable Routing Tool (Any Order + Waypoints + Color/Style)
 * - Channel Filter for Plot Image / PDF Export
 * - High-Precision 60 FPS 3D Volumetric & Multi-Chord Truss Renderer
 * - Dark Mode & Light Mode Canvas Theme Support
 */

(function (global) {
  'use strict';

  const CHANNEL_COLORS = {
    'Channel A': '#38bdf8',
    'Channel B': '#10b981',
    'Channel C': '#f59e0b',
    'Channel D': '#a855f7',
    'Channel E': '#f43f5e',
    'Channel F': '#eab308',
    'Channel G': '#ec4899',
    'Channel H': '#14b8a6'
  };

  class StageCanvasEngine {
    constructor(canvasEl, callbacks) {
      this.canvas = canvasEl;
      this.ctx = canvasEl.getContext('2d', { alpha: false });
      this.callbacks = callbacks || {};

      // Theme ('dark' | 'light')
      this.theme = 'dark';

      // Viewport transform state (with smooth 60 FPS damping for 3D)
      this.ppm = 48;
      this.zoom = 1.0;
      this.panX = 120;
      this.panY = 80;

      // 2D vs 3D Perspective Mode
      this.viewMode = '2d'; // '2d' | '3d'
      this.orbitYaw = -0.62;
      this.orbitPitch = 0.56;
      this.targetYaw = -0.62;
      this.targetPitch = 0.56;
      this.dampingAnimId = null;

      // Project & Scene reference
      this.project = null;
      this.scene = null;

      // Export Channel Filter ('all' or 'Channel A', 'Channel B', etc.)
      this.exportChannelFilter = 'all';

      // Selection, Multi-Select & Left D-Pad state
      this.selectedItemId = null;
      this.multiSelectedIds = new Set();
      this.multiSelectMode = false;
      this.iconDisplayScale = 1.0;
      this.labelDisplayScale = 1.0;
      this.dragCheckpointed = false;
      this.controlPadEnabled = false; // Off by default; controlled via Control lock toggle
      this.dpadVisible = false;
      this.isPositionUnlocked = false;
      this.draggingMode = null; // null | 'pan' | 'orbit' | 'aim' | 'move_item'
      this.longPressTimer = null;
      this.longPressStartMs = 0;
      this.longPressTargetId = null;
      this.longPressDuration = 450;
      this.unlockedViaLongPress = false;
      this.animFrameId = null;

      this.pointerDownPos = { x: 0, y: 0 };
      this.lastPointerPos = { x: 0, y: 0 };
      this.pointerMovedSignificantly = false;
      this.tappedAlreadySelectedItem = false;
      this.pointerDownHitId = null;
      this.lastPointerType = 'mouse';
      this.lastTapTime = 0;
      this.lastTapItemId = null;
      this.lastTapUpTime = 0;
      this.lastTapUpItemId = null;
      this.lastTapUpPos = { x: 0, y: 0 };
      this.activePointers = new Map();
      this.initialPinchDist = null;
      this.initialPinchZoom = 1;

      // Manual Custom DMX Cable Routing Tool State (Section 6)
      this.dmxCableDrawMode = false;
      this.cableColor = '#38bdf8';
      this.cableStyle = 'dashed'; // 'solid' | 'dashed' | 'dotted'
      this.cableChannelTag = 'Channel A';
      this.activeCableDraft = null; // { id, color, style, channel, points: [] }
      this.cursorWorldPos = null;
      this.selectedCableId = null;

      // Static offscreen cache for 2D Venue
      this.staticCacheCanvas = document.createElement('canvas');
      this.staticCacheCtx = this.staticCacheCanvas.getContext('2d');
      this.staticCacheDirty = true;

      this.bindEvents();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('shams:settings-changed', () => this.requestRender());
      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          this.resize();
          this.fitToScreen();
        }, 120);
      });
      if (typeof ResizeObserver !== 'undefined' && this.canvas && this.canvas.parentElement) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.canvas.parentElement);
      }
    }

    setTheme(themeName) {
      this.theme = themeName === 'light' ? 'light' : 'dark';
      this.staticCacheDirty = true;
      this.requestRender();
    }

    setProjectAndScene(project, scene) {
      this.project = project;
      this.scene = scene;
      if (this.scene && !Array.isArray(this.scene.customDmxCables)) {
        this.scene.customDmxCables = [];
      }
      this.staticCacheDirty = true;
      this.requestRender();
    }

    invalidateVenueCache() {
      this.staticCacheDirty = true;
      this.requestRender();
    }

    setViewMode(mode) {
      this.viewMode = mode === '3d' ? '3d' : '2d';
      if (this.viewMode === '3d') {
        this.targetYaw = this.orbitYaw;
        this.targetPitch = this.orbitPitch;
      }
      this.requestRender();
    }

    resize() {
      if (!this.canvas || !this.canvas.parentElement) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // Keep the plot visually anchored when the viewport's top edge moves
      // (e.g. top bar auto-hides / minimizes on mobile)
      if (typeof this._lastRectTop === 'number' && Math.abs(this._lastRectTop - rect.top) < 400) {
        this.panY += this._lastRectTop - rect.top;
      }
      this._lastRectTop = rect.top;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(160, Math.floor(rect.width));
      this.height = Math.max(140, Math.floor(rect.height));
      this.dpr = dpr;
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';
      this.requestRender();
    }

    fitToScreen() {
      if (!this.project || !this.project.venueConfig) return;
      this.resize();
      const v = this.project.venueConfig;
      const vw = parseFloat(v.width) || 14;
      const vl = parseFloat(v.length) || 10;
      const isCompact = this.width < 680 || this.height < 520;
      const pad = isCompact ? Math.max(24, Math.min(this.width, this.height) * 0.08) : 92;
      const availW = Math.max(120, this.width - pad * 2);
      const availH = Math.max(120, this.height - pad * 2);
      const scaleX = availW / (vw * this.ppm);
      const scaleY = availH / (vl * this.ppm);
      this.zoom = Math.max(0.18, Math.min(2.5, Math.min(scaleX, scaleY)));
      this.panX = (this.width - vw * this.ppm * this.zoom) / 2;
      this.panY = (this.height - vl * this.ppm * this.zoom) / 2 + (this.viewMode === '3d' ? (isCompact ? 22 : 42) : (isCompact ? 6 : 12));
      this.requestRender();
    }

    /**
     * Coordinate Transform: World (x, y, z in meters) -> Screen (px, py, depth)
     * Uses high-precision 3D rotation + slight perspective foreshortening for crystal-clear 3D
     */
    worldToScreen(wx, wy, wz = 0) {
      const s = this.ppm * this.zoom;
      if (this.viewMode === '2d') {
        return {
          x: this.panX + wx * s,
          y: this.panY + wy * s,
          depth: 0
        };
      }

      const v = (this.project && this.project.venueConfig) || { width: 14, length: 10 };
      const cx = (parseFloat(v.width) || 14) / 2;
      const cy = (parseFloat(v.length) || 10) / 2;
      const dx = wx - cx;
      const dy = wy - cy;

      const cosY = Math.cos(this.orbitYaw);
      const sinY = Math.sin(this.orbitYaw);
      const sinP = Math.sin(this.orbitPitch);
      const cosP = Math.cos(this.orbitPitch);

      // Rotated horizontal coordinates
      const rx = dx * cosY - dy * sinY;
      const depthY = dx * sinY + dy * cosY;

      // Slight perspective factor so closer items look naturally larger and 3D depth is unmistakable
      const persp = 1 + depthY * 0.014;
      const ry = depthY * sinP - wz * cosP;

      const centerScreenX = this.panX + cx * s;
      const centerScreenY = this.panY + cy * s;

      return {
        x: centerScreenX + rx * s * persp,
        y: centerScreenY + ry * s,
        depth: depthY * cosP + wz * sinP,
        persp
      };
    }

    screenToWorldFloor(sx, sy, targetZ = 0) {
      const s = this.ppm * this.zoom;
      if (this.viewMode === '2d') {
        return {
          x: +((sx - this.panX) / s).toFixed(2),
          y: +((sy - this.panY) / s).toFixed(2)
        };
      }
      const v = (this.project && this.project.venueConfig) || { width: 14, length: 10 };
      const cx = (parseFloat(v.width) || 14) / 2;
      const cy = (parseFloat(v.length) || 10) / 2;
      const centerScreenX = this.panX + cx * s;
      const centerScreenY = this.panY + cy * s;

      const cosY = Math.cos(this.orbitYaw);
      const sinY = Math.sin(this.orbitYaw);
      const sinP = Math.max(0.22, Math.sin(this.orbitPitch));
      const cosP = Math.cos(this.orbitPitch);

      const rx = (sx - centerScreenX) / s;
      const ry = ((sy - centerScreenY) / s + targetZ * cosP) / sinP;

      const dx = rx * cosY + ry * sinY;
      const dy = -rx * sinY + ry * cosY;

      return {
        x: +(cx + dx).toFixed(2),
        y: +(cy + dy).toFixed(2)
      };
    }

    getSelectedItem() {
      if (!this.scene || !this.selectedItemId) return null;
      return this.scene.items.find((i) => i.id === this.selectedItemId) || null;
    }

    getItemById(id) {
      if (!this.scene || !id || !Array.isArray(this.scene.items)) return null;
      return this.scene.items.find((i) => i.id === id) || null;
    }

    setDisplayScales(scales = {}) {
      if (scales.icon !== undefined) {
        this.iconDisplayScale = Math.max(0.4, Math.min(2.5, parseFloat(scales.icon) || 1.0));
      }
      if (scales.label !== undefined) {
        this.labelDisplayScale = Math.max(0.5, Math.min(2.5, parseFloat(scales.label) || 1.0));
      }
      this.requestRender();
    }

    // ========================================================================
    // MULTI-SELECT, AUTO-ALIGN & DISTRIBUTE EVENLY (Section 8.2)
    // ========================================================================
    setMultiSelectMode(enabled) {
      this.multiSelectMode = !!enabled;
      if (!this.multiSelectMode && this.multiSelectedIds.size <= 1) {
        this.multiSelectedIds.clear();
      }
      if (this.callbacks.onMultiSelectionChange) {
        this.callbacks.onMultiSelectionChange(this.getMultiSelectedItems());
      }
      this.requestRender();
    }

    getMultiSelectedItems() {
      if (!this.scene || !Array.isArray(this.scene.items)) return [];
      if (this.multiSelectedIds.size > 0) {
        const byId = new Map(this.scene.items.map((i) => [i.id, i]));
        return Array.from(this.multiSelectedIds)
          .map((id) => byId.get(id))
          .filter(Boolean);
      }
      const sel = this.getSelectedItem();
      return sel ? [sel] : [];
    }

    clearMultiSelection() {
      this.multiSelectedIds.clear();
      if (this.callbacks.onMultiSelectionChange) {
        this.callbacks.onMultiSelectionChange([]);
      }
      this.requestRender();
    }

    toggleMultiSelectItem(itemId) {
      if (!itemId) return;
      if (this.selectedItemId && this.selectedItemId !== itemId && this.multiSelectedIds.size === 0) {
        this.multiSelectedIds.add(this.selectedItemId);
      }
      if (this.multiSelectedIds.has(itemId)) {
        this.multiSelectedIds.delete(itemId);
        if (this.selectedItemId === itemId) {
          const next = Array.from(this.multiSelectedIds)[0] || null;
          this.selectedItemId = next;
        }
      } else {
        this.multiSelectedIds.add(itemId);
        this.selectedItemId = itemId;
      }
      if (this.callbacks.onMultiSelectionChange) {
        this.callbacks.onMultiSelectionChange(this.getMultiSelectedItems());
      }
      if (this.callbacks.onSelectionChange) {
        this.callbacks.onSelectionChange(this.getSelectedItem(), this.isPositionUnlocked, this.dpadVisible);
      }
      this.requestRender();
    }

    alignSelected(axis = 'horizontal') {
      const items = this.getMultiSelectedItems();
      if (items.length < 2) {
        if (this.callbacks.onToast) {
          this.callbacks.onToast('اختر كشافين أو أكثر للمحاذاة (Ctrl+Click أو وضع التحديد المتعدد) / Select 2+ items to align');
        }
        return;
      }
      if (this.callbacks.onHistoryCheckpoint) {
        this.callbacks.onHistoryCheckpoint('Align ' + axis);
      }
      // Align all selected items to the FIRST selected fixture (items[0])
      const firstItem = items[0];
      if (axis === 'horizontal') {
        const targetY = +(parseFloat(firstItem.y) || 0).toFixed(2);
        items.forEach((it) => {
          it.y = targetY;
          this.syncAttachedAccessories(it);
          if (this.callbacks.onItemUpdated) this.callbacks.onItemUpdated(it, true);
        });
      } else {
        const targetX = +(parseFloat(firstItem.x) || 0).toFixed(2);
        items.forEach((it) => {
          it.x = targetX;
          this.syncAttachedAccessories(it);
          if (this.callbacks.onItemUpdated) this.callbacks.onItemUpdated(it, true);
        });
      }
      if (this.callbacks.onToast) {
        this.callbacks.onToast(
          axis === 'horizontal'
            ? '📏 تمت محاذاة كل الكشافات أفقياً مع أول كشاف تم تحديده'
            : '📏 تمت محاذاة كل الكشافات رأسياً مع أول كشاف تم تحديده'
        );
      }
      this.requestRender();
    }

    distributeSelected(axis = 'horizontal') {
      const items = this.getMultiSelectedItems();
      if (items.length < 3) {
        if (this.callbacks.onToast) {
          this.callbacks.onToast('اختر 3 كشافات أو أكثر للتوزيع المتساوي / Select 3+ items to distribute evenly');
        }
        return;
      }
      if (this.callbacks.onHistoryCheckpoint) {
        this.callbacks.onHistoryCheckpoint('Distribute ' + axis);
      }
      const prop = axis === 'horizontal' ? 'x' : 'y';
      const sorted = items.slice().sort((a, b) => (parseFloat(a[prop]) || 0) - (parseFloat(b[prop]) || 0));
      const minVal = parseFloat(sorted[0][prop]) || 0;
      const maxVal = parseFloat(sorted[sorted.length - 1][prop]) || 0;
      const step = (maxVal - minVal) / (sorted.length - 1);
      sorted.forEach((it, idx) => {
        it[prop] = +(minVal + step * idx).toFixed(2);
        this.syncAttachedAccessories(it);
        if (this.callbacks.onItemUpdated) this.callbacks.onItemUpdated(it, true);
      });
      if (this.callbacks.onToast) {
        this.callbacks.onToast('📐 تم التوزيع بمسافات متساوية / Distributed Evenly');
      }
      this.requestRender();
    }

    syncRotationSelected() {
      const items = this.getMultiSelectedItems();
      if (items.length < 2) {
        if (this.callbacks.onToast) {
          this.callbacks.onToast('اختر كشافين أو أكثر لتوحيد زاوية التوجيه / Select 2+ items to sync angle');
        }
        return;
      }
      if (this.callbacks.onHistoryCheckpoint) {
        this.callbacks.onHistoryCheckpoint('Sync Rotation');
      }
      const firstItem = items[0] || this.getSelectedItem();
      const targetRot = parseFloat(firstItem.rotation) || 90;
      items.forEach((it) => {
        it.rotation = targetRot;
        this.syncAttachedAccessories(it);
        if (this.callbacks.onItemUpdated) this.callbacks.onItemUpdated(it, true);
      });
      if (this.callbacks.onToast) {
        this.callbacks.onToast(`🧭 تم توحيد زاوية التوجيه (${Math.round(targetRot)}°) / Synced Rotation`);
      }
      this.requestRender();
    }

    syncBeamSelected() {
      const items = this.getMultiSelectedItems();
      if (items.length < 2) {
        if (this.callbacks.onToast) {
          this.callbacks.onToast('اختر كشافين أو أكثر لتوحيد الشعاع / Select 2+ items to sync beam');
        }
        return false;
      }
      const firstItem = items[0] || this.getSelectedItem();
      const targetBeamLen = parseFloat(firstItem.beamLength) || 4.0;
      const targetBeamAngle = parseFloat(firstItem.beamAngle) || 40;
      const targetBeamZ = firstItem.beamTargetZ;
      const targetFovDist = parseFloat(firstItem.fovDistance) || 5.0;

      items.forEach((it) => {
        if (it.itemType === 'fixture') {
          it.beamLength = targetBeamLen;
          it.beamAngle = targetBeamAngle;
          if (targetBeamZ !== undefined) {
            it.beamTargetZ = targetBeamZ;
          }
          if (this.scene && Array.isArray(this.scene.items)) {
            this.scene.items.forEach((acc) => {
              if ((acc.attachedTo === it.id || acc.attachedToFixtureId === it.id) && acc.itemType === 'accessory') {
                if (acc.zoomAngle !== undefined || String(acc.vectorShape || '').includes('fresnel')) {
                  acc.zoomAngle = targetBeamAngle;
                }
              }
            });
          }
        } else if (it.itemType === 'camera') {
          it.fovDistance = targetFovDist;
        }
        this.syncAttachedAccessories(it);
        if (this.callbacks.onItemUpdated) this.callbacks.onItemUpdated(it, true);
      });

      if (this.callbacks.onHistoryCheckpoint) {
        this.callbacks.onHistoryCheckpoint('Sync Beam');
      }
      if (this.callbacks.onToast) {
        this.callbacks.onToast(`🔦 تم توحيد الشعاع (${targetBeamLen}m • ${Math.round(targetBeamAngle)}°) مع أول كشاف تم تحديده`);
      }
      this.requestRender();
      return true;
    }

    // ========================================================================
    // MAGNETIC ACCESSORY & STAND SNAPPING + UNLOCK/DETACH (Sections 6.1 & User Update)
    // ========================================================================
    isStandItem(it) {
      if (!it) return false;
      const sh = String(it.vectorShape || '');
      return it.itemType === 'stand' || it.subtype === 'lighting_stand' || sh.startsWith('stand_');
    }

    getAccessoryFrontOffset(accItem) {
      if (!accItem) return 0.45;
      if (this.isStandItem(accItem)) return 0;
      if (typeof accItem.frontOffset === 'number' && accItem.frontOffset > 0) return accItem.frontOffset;
      const sh = accItem.vectorShape || '';
      if (sh === 'acc_para_gp4_120') return 0.62;
      if (sh === 'acc_octa90' || sh === 'acc_para_gp4_90') return 0.52;
      if (sh === 'acc_fresnel_lens') return 0.28;
      if (sh === 'acc_tube_grid') return 0.16;
      return 0.45;
    }

    syncAttachedAccessories(parentFixture) {
      if (!parentFixture || !this.scene || !Array.isArray(this.scene.items)) return;
      const rotRad = ((parseFloat(parentFixture.rotation) || 0) * Math.PI) / 180;
      const px = parseFloat(parentFixture.x) || 0;
      const py = parseFloat(parentFixture.y) || 0;
      const pz = parseFloat(parentFixture.z) || 2.4;

      this.scene.items.forEach((it) => {
        const parentId = it.attachedTo || it.attachedToFixtureId;
        if (parentId === parentFixture.id && (it.itemType === 'accessory' || this.isStandItem(it))) {
          it.attachedTo = parentFixture.id;
          it.attachedToFixtureId = parentFixture.id;
          if (this.isStandItem(it)) {
            it.x = px;
            it.y = py;
            it.z = 0;
          } else {
            const offset = this.getAccessoryFrontOffset(it) * (parseFloat(parentFixture.scale) || 1.0);
            it.x = +(px + Math.cos(rotRad) * offset).toFixed(2);
            it.y = +(py + Math.sin(rotRad) * offset).toFixed(2);
            it.z = pz;
            it.rotation = parentFixture.rotation;
          }
        }
      });
    }

    syncAllAccessories() {
      if (!this.scene || !Array.isArray(this.scene.items)) return;
      const fixturesById = new Map();
      this.scene.items.forEach((it) => {
        if (it.itemType === 'fixture' && !it.isSplitter) {
          fixturesById.set(it.id, it);
        }
      });
      this.scene.items.forEach((it) => {
        const parentId = it.attachedTo || it.attachedToFixtureId;
        if (parentId && (it.itemType === 'accessory' || this.isStandItem(it))) {
          const parent = fixturesById.get(parentId);
          if (!parent) {
            it.attachedTo = null;
            it.attachedToFixtureId = null;
            return;
          }
          it.attachedTo = parent.id;
          it.attachedToFixtureId = parent.id;
          if (this.isStandItem(it)) {
            it.x = parseFloat(parent.x) || 0;
            it.y = parseFloat(parent.y) || 0;
            it.z = 0;
          } else {
            const rotRad = ((parseFloat(parent.rotation) || 0) * Math.PI) / 180;
            const offset = this.getAccessoryFrontOffset(it) * (parseFloat(parent.scale) || 1.0);
            it.x = +((parseFloat(parent.x) || 0) + Math.cos(rotRad) * offset).toFixed(2);
            it.y = +((parseFloat(parent.y) || 0) + Math.sin(rotRad) * offset).toFixed(2);
            it.z = parseFloat(parent.z) || 2.4;
            it.rotation = parent.rotation;
          }
        }
      });
    }

    applyAccessoryMagneticSnap(accItem, wx, wy, maxSnapRadius = 0.95) {
      if (!this.scene || !Array.isArray(this.scene.items)) {
        return { x: wx, y: wy, rotation: accItem?.rotation || 90, attachedTo: null, attachedToFixtureId: null };
      }
      const v = (this.project && this.project.venueConfig) || { width: 14, length: 10 };
      const vw = parseFloat(v.width) || 14;
      const vl = parseFloat(v.length) || 10;
      const cx = Math.max(0.2, Math.min(vw - 0.2, wx));
      const cy = Math.max(0.2, Math.min(vl - 0.2, wy));

      // If user explicitly unlocked/detached this accessory or stand, allow free movement until re-locked or moved far
      if (accItem.attachmentUnlocked) {
        return { x: +cx.toFixed(2), y: +cy.toFixed(2), rotation: accItem.rotation || 90, attachedTo: null, attachedToFixtureId: null };
      }

      const isStand = this.isStandItem(accItem);
      let bestFix = null;
      let bestDist = maxSnapRadius; // Magnetic snap radius in meters
      this.scene.items.forEach((it) => {
        if (it.itemType !== 'fixture' || it.isSplitter) return;
        const rotRad = ((parseFloat(it.rotation) || 0) * Math.PI) / 180;
        const offset = this.getAccessoryFrontOffset(accItem) * (parseFloat(it.scale) || 1.0);
        const frontX = (parseFloat(it.x) || 0) + Math.cos(rotRad) * offset;
        const frontY = (parseFloat(it.y) || 0) + Math.sin(rotRad) * offset;
        const dFront = Math.hypot(cx - frontX, cy - frontY);
        const dBody = Math.hypot(cx - (parseFloat(it.x) || 0), cy - (parseFloat(it.y) || 0));
        const d = isStand ? dBody : Math.min(dFront, dBody);
        if (d < bestDist) {
          bestDist = d;
          bestFix = it;
        }
      });

      if (bestFix) {
        const rotRad = ((parseFloat(bestFix.rotation) || 0) * Math.PI) / 180;
        const offset = this.getAccessoryFrontOffset(accItem) * (parseFloat(bestFix.scale) || 1.0);
        const sx = isStand ? +(parseFloat(bestFix.x) || 0).toFixed(2) : +((parseFloat(bestFix.x) || 0) + Math.cos(rotRad) * offset).toFixed(2);
        const sy = isStand ? +(parseFloat(bestFix.y) || 0).toFixed(2) : +((parseFloat(bestFix.y) || 0) + Math.sin(rotRad) * offset).toFixed(2);
        const prevAttached = accItem.attachedTo || accItem.attachedToFixtureId;
        accItem.attachedTo = bestFix.id;
        accItem.attachedToFixtureId = bestFix.id;
        accItem.rotation = bestFix.rotation;
        accItem.z = isStand ? 0 : bestFix.z;
        if (isStand) {
          bestFix.mountType = accItem.nameEn || accItem.name || 'Silver Stand';
          bestFix.standLocked = true;
        }
        if (prevAttached !== bestFix.id && this.callbacks.onToast) {
          this.callbacks.onToast(
            isStand
              ? `🧲 تم تركيب الكشاف (${bestFix.name}) على الاستاند (${accItem.name})`
              : `🧲 التقط الإكسسوار (${accItem.name}) أمام الكشاف (${bestFix.name})`
          );
        }
        return { x: sx, y: sy, rotation: bestFix.rotation, attachedTo: bestFix.id, attachedToFixtureId: bestFix.id };
      }

      if ((accItem.attachedTo || accItem.attachedToFixtureId) && this.callbacks.onToast) {
        this.callbacks.onToast(`🔓 تم فصل (${accItem.name}) عن الكشاف`);
      }
      accItem.attachedTo = null;
      accItem.attachedToFixtureId = null;
      return { x: +cx.toFixed(2), y: +cy.toFixed(2), rotation: accItem.rotation || 90, attachedTo: null, attachedToFixtureId: null };
    }

    /**
     * Find any unattached accessories or stands positioned on/near a fixture
     */
    findNearbyUnattachedForFixture(fixtureItem, radiusM = 1.35) {
      if (!fixtureItem || fixtureItem.itemType !== 'fixture' || !this.scene || !Array.isArray(this.scene.items)) {
        return [];
      }
      const fx = parseFloat(fixtureItem.x) || 0;
      const fy = parseFloat(fixtureItem.y) || 0;
      const rotRad = ((parseFloat(fixtureItem.rotation) || 0) * Math.PI) / 180;
      const scale = parseFloat(fixtureItem.scale) || 1.0;

      return this.scene.items.filter((it) => {
        if (!it || it.id === fixtureItem.id) return false;
        const isAccOrStand = it.itemType === 'accessory' || this.isStandItem(it);
        if (!isAccOrStand) return false;
        if (it.attachedTo || it.attachedToFixtureId) return false;
        const ix = parseFloat(it.x) || 0;
        const iy = parseFloat(it.y) || 0;
        if (Math.hypot(ix - fx, iy - fy) <= radiusM) return true;
        if (!this.isStandItem(it)) {
          const offset = this.getAccessoryFrontOffset(it) * scale;
          const frontX = fx + Math.cos(rotRad) * offset;
          const frontY = fy + Math.sin(rotRad) * offset;
          if (Math.hypot(ix - frontX, iy - frontY) <= radiusM) return true;
        }
        return false;
      });
    }

    /**
     * Toggle Lock/Unlock Stand & Accessories on Fixture (or vice-versa) via Lock Accessory Button
     */
    unlockItemAttachments(targetItem) {
      const item = targetItem || this.getSelectedItem();
      if (!item || !this.scene || !Array.isArray(this.scene.items)) return { detached: false, locked: false, message: '' };

      const v = (this.project && this.project.venueConfig) || { width: 14, length: 10, height: 4.5 };
      const vw = parseFloat(v.width) || 14;
      const vl = parseFloat(v.length) || 10;

      // Case 1: Selected item is an Accessory or Stand
      if (item.itemType === 'accessory' || this.isStandItem(item)) {
        const parentId = item.attachedTo || item.attachedToFixtureId;
        if (parentId) {
          const parentFix = this.scene.items.find((i) => i.id === parentId);
          item.attachedTo = null;
          item.attachedToFixtureId = null;
          item.attachmentUnlocked = true;
          item.x = +Math.max(0.4, Math.min(vw - 0.4, (parseFloat(item.x) || 2) + 0.75)).toFixed(2);
          item.y = +Math.max(0.4, Math.min(vl - 0.4, (parseFloat(item.y) || 2) + 0.45)).toFixed(2);
          if (parentFix && this.isStandItem(item)) {
            parentFix.mountType = 'Ceiling Grid / Truss Clamp';
            parentFix.standLocked = false;
          }
          this.requestRender();
          return {
            detached: true,
            locked: false,
            message: `🔓 تم فك قفل وفصل (${item.name}) عن الكشاف — يمكنك تحريكه بحرية الآن`
          };
        } else {
          // Lock onto nearest fixture within range
          item.attachmentUnlocked = false;
          const snap = this.applyAccessoryMagneticSnap(item, item.x, item.y, 1.35);
          item.x = snap.x;
          item.y = snap.y;
          const isNowAttached = !!(item.attachedTo || item.attachedToFixtureId);
          this.requestRender();
          return {
            detached: false,
            locked: isNowAttached,
            message: isNowAttached
              ? `🔒 تم ربط وقفل (${item.name}) بالكشاف`
              : `🔓 لا يوجد كشاف قريب — ضع (${item.name}) عند الكشاف واضغط Lock Accessory`
          };
        }
      }

      // Case 2: Selected item is a Fixture -> if any nearby unattached stand/accessory exists, lock & attach them first; otherwise unlock existing ones
      if (item.itemType === 'fixture') {
        const nearbyUnattached = this.findNearbyUnattachedForFixture(item, 1.35);
        if (nearbyUnattached.length > 0) {
          nearbyUnattached.forEach((it) => {
            it.attachmentUnlocked = false;
            it.attachedTo = item.id;
            it.attachedToFixtureId = item.id;
            if (this.isStandItem(it)) {
              item.mountType = it.nameEn || it.name || 'Silver Stand';
              item.standLocked = true;
              item.snappedPipe = null;
            }
          });
          this.syncAttachedAccessories(item);
          this.requestRender();
          return {
            detached: false,
            locked: true,
            message: `🔒 تم قفل وربط (${nearbyUnattached.length}) ملحق/استاند بالكشاف (${item.name})`
          };
        }

        let detachedCount = 0;
        this.scene.items.forEach((it) => {
          if (it.attachedTo === item.id || it.attachedToFixtureId === item.id) {
            it.attachedTo = null;
            it.attachedToFixtureId = null;
            it.attachmentUnlocked = true;
            it.x = +Math.max(0.4, Math.min(vw - 0.4, (parseFloat(item.x) || 2) + 0.8)).toFixed(2);
            it.y = +Math.max(0.4, Math.min(vl - 0.4, (parseFloat(item.y) || 2) + 0.45)).toFixed(2);
            detachedCount++;
          }
        });

        const mount = item.mountType || '';
        const hasStandMount = mount.includes('Stand') || item.standLocked;
        if (hasStandMount) {
          item.mountType = 'Ceiling Grid / Truss Clamp';
          item.standLocked = false;
          item.z = +(parseFloat(v.height || 4.5) - 0.3).toFixed(1);
          detachedCount++;
        }

        this.requestRender();
        if (detachedCount > 0) {
          return {
            detached: true,
            locked: false,
            message: `🔓 تم فك قفل وفصل الكشاف (${item.name}) عن الاستاند والإكسسوارات بنجاح`
          };
        }
        return {
          detached: false,
          locked: false,
          message: `🔓 ضع الاستاند أو الإكسسوار بالقرب من (${item.name}) ثم اضغط Lock Accessory لقفله`
        };
      }

      return { detached: false, locked: false, message: '' };
    }

    isTouchDevice() {
      if (this.lastPointerType === 'touch' || this.lastPointerType === 'pen') return true;
      try {
        return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      } catch (e) {
        return false;
      }
    }

    selectItem(itemId, keepUnlocked = false) {
      this.selectedItemId = itemId;
      this.dpadVisible = !!(itemId && this.controlPadEnabled);
      this.unlockedViaLongPress = false;
      if (!itemId) {
        if (this.multiSelectedIds && this.multiSelectedIds.size > 0) {
          this.multiSelectedIds.clear();
          if (this.callbacks.onMultiSelectionChange) {
            this.callbacks.onMultiSelectionChange([]);
          }
        }
        if (this.multiSelectMode) {
          this.multiSelectMode = false;
          const msBtn = document.getElementById('btnMultiSelectToggle');
          if (msBtn) {
            msBtn.classList.remove('btn-primary', 'active');
            msBtn.classList.add('btn-secondary');
          }
        }
      }
      const sel = this.getSelectedItem();
      if (keepUnlocked) {
        this.isPositionUnlocked = true;
      } else if (sel && this.isTouchDevice()) {
        // Mobile/touch: always LOCKED by default -> long press to move
        this.isPositionUnlocked = false;
      } else if (sel) {
        this.isPositionUnlocked = !sel.positionLocked;
      } else {
        this.isPositionUnlocked = false;
      }
      if (this.callbacks.onSelectionChange) {
        this.callbacks.onSelectionChange(sel, this.isPositionUnlocked, this.dpadVisible);
      }
      this.requestRender();
    }

    setControlPadEnabled(enabled) {
      this.controlPadEnabled = !!enabled;
      this.dpadVisible = !!(this.selectedItemId && this.controlPadEnabled);
      if (this.callbacks.onSelectionChange) {
        this.callbacks.onSelectionChange(this.getSelectedItem(), this.isPositionUnlocked, this.dpadVisible);
      }
      this.requestRender();
    }

    setDpadVisibility(visible) {
      this.setControlPadEnabled(visible);
    }

    /**
     * Scale Selected Item (+ / - / 1x) from Left Directional Pad (Update #1)
     */
    scaleSelectedItem(delta, resetToOne = false) {
      const item = this.getSelectedItem();
      if (!item) return;
      if (resetToOne) {
        item.scale = 1.0;
      } else {
        const cur = parseFloat(item.scale) || 1.0;
        item.scale = +Math.max(0.4, Math.min(3.0, cur + delta)).toFixed(2);
      }
      this.syncAttachedAccessories(item);
      if (this.callbacks.onHistoryCheckpoint) {
        this.callbacks.onHistoryCheckpoint('Scale Item');
      }
      if (this.callbacks.onItemUpdated) {
        this.callbacks.onItemUpdated(item, true);
      }
      this.requestRender();
      return item.scale;
    }

    /**
     * Aim / Rotate Selected Item via Left 4-Arrow Directional Pad or Keyboard
     */
    nudgeSelectedAim(action, stepDeg = 5) {
      const item = this.getSelectedItem();
      if (!item) return;

      const isFloorFixture =
        item.itemType === 'fixture' &&
        (!!item.floorMounted || item.mountType === 'Floor / Ground' || (parseFloat(item.z) || 4.0) <= 1.2);

      if (action === 'left') {
        item.rotation = ((parseFloat(item.rotation) || 0) - stepDeg + 360) % 360;
      } else if (action === 'right') {
        item.rotation = ((parseFloat(item.rotation) || 0) + stepDeg + 360) % 360;
      } else if (action === 'up') {
        if (item.itemType === 'fixture') {
          if (isFloorFixture) {
            const curTargetZ = item.beamTargetZ !== undefined && item.beamTargetZ !== null
              ? parseFloat(item.beamTargetZ)
              : Math.max(0.6, (parseFloat(item.z) || 0.25) + 0.6);
            item.beamTargetZ = +Math.min(12.0, curTargetZ + 0.45).toFixed(2);
            item.beamLength = Math.min(18, +((parseFloat(item.beamLength) || 4.0) + 0.2).toFixed(1));
            if (this.callbacks.onToast) {
              this.callbacks.onToast(`⬆ رفع شعاع الإضاءة لأعلى (ارتفاع الهدف: ${item.beamTargetZ}m)`);
            }
          } else {
            item.beamLength = Math.min(18, +((parseFloat(item.beamLength) || 4.0) + 0.3).toFixed(1));
          }
        } else if (item.itemType === 'camera') {
          item.fovDistance = Math.min(20, +((parseFloat(item.fovDistance) || 5.0) + 0.3).toFixed(1));
        } else {
          item.rotation = -90;
        }
      } else if (action === 'down') {
        if (item.itemType === 'fixture') {
          if (isFloorFixture || (parseFloat(item.beamTargetZ) || 0) > 0) {
            const curTargetZ = parseFloat(item.beamTargetZ) || 0;
            if (curTargetZ > 0) {
              item.beamTargetZ = +Math.max(0, curTargetZ - 0.45).toFixed(2);
              if (this.callbacks.onToast) {
                this.callbacks.onToast(`⬇ خفض شعاع الإضاءة لأسفل (ارتفاع الهدف: ${item.beamTargetZ}m)`);
              }
            } else {
              item.beamLength = Math.max(1.0, +((parseFloat(item.beamLength) || 4.0) - 0.3).toFixed(1));
            }
          } else {
            item.beamLength = Math.max(1.0, +((parseFloat(item.beamLength) || 4.0) - 0.3).toFixed(1));
          }
        } else if (item.itemType === 'camera') {
          item.fovDistance = Math.max(1.2, +((parseFloat(item.fovDistance) || 5.0) - 0.3).toFixed(1));
        } else {
          item.rotation = 90;
        }
      } else if (action === 'aim_north') {
        item.rotation = -90;
      } else if (action === 'aim_south') {
        item.rotation = 90;
      } else if (action === 'aim_east') {
        item.rotation = 0;
      } else if (action === 'aim_west') {
        item.rotation = 180;
      }

      this.syncAttachedAccessories(item);
      if (this.callbacks.onHistoryCheckpoint) {
        this.callbacks.onHistoryCheckpoint('Nudge Aim');
      }
      if (this.callbacks.onItemUpdated) {
        this.callbacks.onItemUpdated(item, false);
      }
      this.requestRender();
    }

    // ========================================================================
    // MANUAL CUSTOM DMX CABLE ROUTING TOOL (Update #6)
    // ========================================================================
    setDmxCableDrawMode(enabled, opts = {}) {
      this.dmxCableDrawMode = !!enabled;
      if (opts.color) this.cableColor = opts.color;
      if (opts.style) this.cableStyle = opts.style;
      if (opts.channel) this.cableChannelTag = opts.channel;
      if (!enabled) {
        this.finishActiveCableDraft();
        this.selectedCableId = null;
      }
      this.canvas.style.cursor = enabled ? 'crosshair' : 'grab';
      this.requestRender();
    }

    finishActiveCableDraft() {
      if (this.activeCableDraft && this.activeCableDraft.points.length >= 2 && this.scene) {
        if (!Array.isArray(this.scene.customDmxCables)) {
          this.scene.customDmxCables = [];
        }
        this.scene.customDmxCables.push(this.activeCableDraft);
        if (this.callbacks.onCablesChanged) {
          this.callbacks.onCablesChanged(this.scene.customDmxCables);
        }
      }
      this.activeCableDraft = null;
      this.requestRender();
    }

    undoLastCableWaypoint() {
      if (this.activeCableDraft && this.activeCableDraft.points.length > 0) {
        this.activeCableDraft.points.pop();
        if (this.activeCableDraft.points.length === 0) {
          this.activeCableDraft = null;
        }
        this.requestRender();
        return;
      }
      if (this.scene && Array.isArray(this.scene.customDmxCables) && this.scene.customDmxCables.length > 0) {
        this.scene.customDmxCables.pop();
        if (this.callbacks.onCablesChanged) {
          this.callbacks.onCablesChanged(this.scene.customDmxCables);
        }
        this.requestRender();
      }
    }

    deleteCableById(cableId) {
      if (!this.scene || !Array.isArray(this.scene.customDmxCables)) return;
      this.scene.customDmxCables = this.scene.customDmxCables.filter((c) => c.id !== cableId);
      if (this.selectedCableId === cableId) this.selectedCableId = null;
      if (this.callbacks.onCablesChanged) {
        this.callbacks.onCablesChanged(this.scene.customDmxCables);
      }
      this.requestRender();
    }

    clearAllCustomCables() {
      if (!this.scene) return;
      this.scene.customDmxCables = [];
      this.activeCableDraft = null;
      this.selectedCableId = null;
      if (this.callbacks.onCablesChanged) {
        this.callbacks.onCablesChanged([]);
      }
      this.requestRender();
    }

    resolveCablePointWorld(pt) {
      if (pt.itemId && this.scene && Array.isArray(this.scene.items)) {
        const linked = this.scene.items.find((i) => i.id === pt.itemId);
        if (linked) {
          return {
            x: parseFloat(linked.x) || 0,
            y: parseFloat(linked.y) || 0,
            z: parseFloat(linked.z) || 0,
            label: linked.badge || linked.name
          };
        }
      }
      return {
        x: parseFloat(pt.x) || 0,
        y: parseFloat(pt.y) || 0,
        z: parseFloat(pt.z) || 0,
        label: pt.label || ''
      };
    }

    hitTestCustomCable(sx, sy) {
      if (!this.scene || !Array.isArray(this.scene.customDmxCables)) return null;
      for (const cable of this.scene.customDmxCables) {
        const pts = cable.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
          const wa = this.resolveCablePointWorld(pts[i]);
          const wb = this.resolveCablePointWorld(pts[i + 1]);
          const za = this.viewMode === '3d' ? wa.z : 0;
          const zb = this.viewMode === '3d' ? wb.z : 0;
          const pa = this.worldToScreen(wa.x, wa.y, za);
          const pb = this.worldToScreen(wb.x, wb.y, zb);
          const dist = distToSegment({ x: sx, y: sy }, pa, pb);
          if (dist <= 10) return cable;
        }
      }
      return null;
    }

    /**
     * Auto-Snap Logic for Studio Plateau Ceiling Grid, Truss & Crossbars, and Church Mounting Bars
     */
    applyVenueAutoSnap(item, wx, wy) {
      if (!this.project || !this.project.venueConfig) {
        return { x: wx, y: wy, snappedPipe: null };
      }
      const v = this.project.venueConfig;
      const vw = parseFloat(v.width) || 14;
      const vl = parseFloat(v.length) || 10;

      const clampedX = Math.max(0.3, Math.min(vw - 0.3, wx));
      const clampedY = Math.max(0.3, Math.min(vl - 0.3, wy));

      if (item.itemType !== 'fixture') {
        return { x: clampedX, y: clampedY, snappedPipe: null };
      }

      // Check if dragged near a standalone Floor Stand item on the plot
      if (this.scene && Array.isArray(this.scene.items)) {
        const nearStand = this.scene.items.find(
          (s) => this.isStandItem(s) && !s.attachmentUnlocked && Math.hypot(clampedX - (parseFloat(s.x) || 0), clampedY - (parseFloat(s.y) || 0)) < 0.65
        );
        if (nearStand) {
          nearStand.attachedTo = item.id;
          nearStand.attachedToFixtureId = item.id;
          item.mountType = nearStand.nameEn || nearStand.name || 'Silver Stand';
          item.standLocked = true;
          return { x: +(parseFloat(nearStand.x) || clampedX).toFixed(2), y: +(parseFloat(nearStand.y) || clampedY).toFixed(2), snappedPipe: nearStand.name };
        }
      }

      if (v.type === 'free' || item.standLocked) {
        return { x: clampedX, y: clampedY, snappedPipe: null };
      }

      const snapTol = Math.max(0.62, parseFloat(v.snapRadius) || 0.62);
      let bestX = clampedX;
      let bestY = clampedY;
      let snappedLabels = [];

      if (v.type === 'plateau' && v.gridConfig) {
        const hPipes = v.gridConfig.horizontalPipes || [];
        const vPipes = v.gridConfig.verticalPipes || [];

        let minDistY = snapTol;
        let snapHIdx = -1;
        hPipes.forEach((py, idx) => {
          const d = Math.abs(clampedY - py);
          if (d < minDistY) {
            minDistY = d;
            bestY = py;
            snapHIdx = idx;
          }
        });

        let minDistX = snapTol;
        let snapVIdx = -1;
        vPipes.forEach((px, idx) => {
          const d = Math.abs(clampedX - px);
          if (d < minDistX) {
            minDistX = d;
            bestX = px;
            snapVIdx = idx;
          }
        });

        if (snapHIdx !== -1) snappedLabels.push('H' + (snapHIdx + 1));
        if (snapVIdx !== -1) snappedLabels.push('V' + (snapVIdx + 1));
      } else if (v.type === 'truss' && v.trussConfig) {
        const tc = v.trussConfig;
        const tw = parseFloat(tc.trussWidth) || (vw - 3);
        const td = parseFloat(tc.trussDepth) || (vl - 2.5);
        const leftX = (vw - tw) / 2;
        const rightX = leftX + tw;
        const topY = (vl - td) / 2;
        const botY = topY + td;

        const hBars = [];
        const vBars = [];

        if (tc.shape === 'straight') {
          hBars.push({ y: vl * 0.35, minX: leftX, maxX: rightX, label: 'Main Truss' });
        } else if (tc.shape === 'l-shape') {
          hBars.push({ y: topY, minX: leftX, maxX: rightX, label: 'Truss Back' });
          vBars.push({ x: leftX, minY: topY, maxY: botY, label: 'Truss Left' });
        } else if (tc.shape === 'u-shape') {
          hBars.push({ y: topY, minX: leftX, maxX: rightX, label: 'Truss Back' });
          vBars.push({ x: leftX, minY: topY, maxY: botY, label: 'Truss Left' });
          vBars.push({ x: rightX, minY: topY, maxY: botY, label: 'Truss Right' });
        } else {
          hBars.push({ y: topY, minX: leftX, maxX: rightX, label: 'Truss North' });
          hBars.push({ y: botY, minX: leftX, maxX: rightX, label: 'Truss South' });
          vBars.push({ x: leftX, minY: topY, maxY: botY, label: 'Truss West' });
          vBars.push({ x: rightX, minY: topY, maxY: botY, label: 'Truss East' });
        }

        (tc.crossbars || []).forEach((cb, i) => {
          if (cb.orientation === 'horizontal') {
            hBars.push({
              y: topY + (parseFloat(cb.position) || 2),
              minX: leftX,
              maxX: rightX,
              label: cb.label || ('Pipe H' + (i + 1))
            });
          } else {
            vBars.push({
              x: leftX + (parseFloat(cb.position) || 2),
              minY: topY,
              maxY: botY,
              label: cb.label || ('Pipe V' + (i + 1))
            });
          }
        });

        let minH = snapTol;
        hBars.forEach((b) => {
          if (clampedX >= b.minX - snapTol && clampedX <= b.maxX + snapTol) {
            const d = Math.abs(clampedY - b.y);
            if (d < minH) {
              minH = d;
              bestY = +b.y.toFixed(2);
              bestX = Math.max(b.minX, Math.min(b.maxX, bestX));
              snappedLabels.push(b.label);
            }
          }
        });

        let minV = snapTol;
        vBars.forEach((b) => {
          if (clampedY >= b.minY - snapTol && clampedY <= b.maxY + snapTol) {
            const d = Math.abs(clampedX - b.x);
            if (d < minV) {
              minV = d;
              bestX = +b.x.toFixed(2);
              bestY = Math.max(b.minY, Math.min(b.maxY, bestY));
              snappedLabels.push(b.label);
            }
          }
        });
      } else if (v.type === 'church' && v.churchConfig) {
        const cc = v.churchConfig;
        const isExplicitFloor = !!item.floorMounted || item.mountType === 'Floor / Ground';
        if (!isExplicitFloor) {
          const mountY = cc.mountPipesY || [3.5, 6.5, 10.5, 14.5, 18.5];
          let minD = snapTol;
          mountY.forEach((py, idx) => {
            const d = Math.abs(clampedY - py);
            if (d < minD) {
              minD = d;
              bestY = py;
              snappedLabels = ['Church Bar #' + (idx + 1)];
            }
          });
        } else {
          const sancDepth = parseFloat(cc.sanctuaryDepth) || 5.0;
          const sancElev = parseFloat(cc.sanctuaryElevation) || 0.6;
          item.z = bestY <= sancDepth ? +(sancElev + 0.25).toFixed(2) : 0.25;
        }
      }

      if (snappedLabels.length > 0 && !item.floorMounted && item.mountType !== 'Floor / Ground') {
        item.mountType = 'Ceiling Grid / Truss Clamp';
        item.floorMounted = false;
        item.z = parseFloat(v.height) ? +(parseFloat(v.height) - 0.3).toFixed(1) : 4.2;
      }

      return {
        x: +bestX.toFixed(2),
        y: +bestY.toFixed(2),
        z: item.z,
        mountType: item.mountType,
        snappedPipe: snappedLabels.length ? snappedLabels.join(' / ') : null
      };
    }

    hitTestAimHandle(sx, sy) {
      const sel = this.getSelectedItem();
      if (!sel) return false;
      const handlePos = this.getAimHandleScreenPos(sel);
      if (!handlePos) return false;
      return Math.hypot(sx - handlePos.x, sy - handlePos.y) <= 28;
    }

    getAimHandleScreenPos(item) {
      if (!item) return null;
      const rotRad = ((parseFloat(item.rotation) || 0) * Math.PI) / 180;
      let reachM = 2.6;
      if (item.itemType === 'fixture') {
        if (item.isSplitter) return null;
        reachM = Math.max(1.5, Math.min(8.0, parseFloat(item.beamLength) || 3.8));
      } else if (item.itemType === 'camera') {
        reachM = Math.max(1.8, Math.min(8.5, parseFloat(item.fovDistance) || 4.5));
      } else {
        reachM = 1.4;
      }
      const hx = (parseFloat(item.x) || 0) + Math.cos(rotRad) * reachM;
      const hy = (parseFloat(item.y) || 0) + Math.sin(rotRad) * reachM;
      return this.worldToScreen(hx, hy, 0);
    }

    hitTestItem(sx, sy) {
      if (!this.scene || !Array.isArray(this.scene.items)) return null;
      const ordered = [...this.scene.items].reverse();
      for (const item of ordered) {
        if (!this.isItemVisibleUnderExportFilter(item)) continue;
        const itemZ = this.viewMode === '3d' ? (parseFloat(item.z) || 0) : 0;
        const pos = this.worldToScreen(item.x, item.y, itemZ);
        const itemScale = parseFloat(item.scale) || 1.0;
        const hitRadius = Math.max(26, 26 * Math.min(1.5, Math.max(0.75, this.zoom)) * Math.min(1.6, itemScale));
        if (Math.hypot(sx - pos.x, sy - pos.y) <= hitRadius) {
          return item;
        }
      }
      return null;
    }

    bindEvents() {
      const el = this.canvas;
      el.style.touchAction = 'none';

      // Prevent native contextmenu on long-press on mobile touch screens
      el.addEventListener('contextmenu', (e) => e.preventDefault());

      el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      el.addEventListener('pointermove', (e) => this.onPointerMove(e));
      el.addEventListener('pointerup', (e) => this.onPointerUp(e));
      el.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      el.addEventListener('lostpointercapture', (e) => this.onPointerUp(e));

      window.addEventListener('blur', () => {
        this.activePointers.clear();
        this.initialPinchDist = null;
        this.lastPinchCenter = null;
        this.clearLongPressTimer();
        this.draggingMode = null;
      });

      el.addEventListener('dblclick', (e) => {
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        if (this.dmxCableDrawMode) {
          this.finishActiveCableDraft();
          return;
        }

        const hit = this.hitTestItem(sx, sy);
        if (hit && this.callbacks.onOpenModal) {
          this.clearLongPressTimer();
          this.selectItem(hit.id, false);
          this.callbacks.onOpenModal(hit);
        }
      });

      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const nextZoom = Math.max(0.18, Math.min(3.5, this.zoom * factor));
        this.panX = mx - ((mx - this.panX) / this.zoom) * nextZoom;
        this.panY = my - ((my - this.panY) / this.zoom) * nextZoom;
        this.zoom = nextZoom;
        this.requestRender();
      }, { passive: false });
    }

    clearLongPressTimer() {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this.longPressTargetId = null;
      this.longPressStartMs = 0;
    }

    pruneStalePointers() {
      const now = Date.now();
      for (const [pid, pt] of this.activePointers.entries()) {
        if (now - (pt.t || now) > 4500) {
          this.activePointers.delete(pid);
        }
      }
    }

    onPointerDown(e) {
      this.pruneStalePointers();
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;

      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      this.activePointers.set(e.pointerId, { x: sx, y: sy, t: Date.now() });

      if (this.activePointers.size >= 2) {
        this.clearLongPressTimer();
        this.draggingMode = 'pinch';
        const pts = Array.from(this.activePointers.values());
        this.initialPinchDist = Math.max(12, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        this.initialPinchZoom = this.zoom;
        this.lastPinchCenter = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2
        };
        return;
      }

      this.pointerDownPos = { x: sx, y: sy };
      this.lastPointerPos = { x: sx, y: sy };
      this.pointerMovedSignificantly = false;
      this.tappedAlreadySelectedItem = false;
      this.pointerDownHitId = null;
      this.lastPointerType = e.pointerType || 'mouse';

      // --- MANUAL DMX CABLE DRAWING MODE (Update #6) ---
      if (this.dmxCableDrawMode) {
        const hitItem = this.hitTestItem(sx, sy);
        const wFloor = this.screenToWorldFloor(sx, sy, 0);

        if (!this.activeCableDraft) {
          if (!hitItem) {
            const hitCable = this.hitTestCustomCable(sx, sy);
            if (hitCable) {
              this.selectedCableId = hitCable.id;
              if (this.callbacks.onCableSelected) {
                this.callbacks.onCableSelected(hitCable);
              }
              this.requestRender();
              return;
            }
          }

          this.selectedCableId = null;
          this.activeCableDraft = {
            id: 'cable_' + Date.now(),
            color: this.cableColor || '#38bdf8',
            style: this.cableStyle || 'dashed',
            channel: (hitItem && hitItem.channel) || this.cableChannelTag || 'Channel A',
            points: []
          };
        }

        if (hitItem) {
          this.activeCableDraft.points.push({
            x: hitItem.x,
            y: hitItem.y,
            z: parseFloat(hitItem.z) || 0,
            itemId: hitItem.id,
            label: hitItem.badge || hitItem.name
          });
        } else {
          this.activeCableDraft.points.push({
            x: wFloor.x,
            y: wFloor.y,
            z: 0,
            itemId: null,
            label: ''
          });
        }
        this.requestRender();
        return;
      }

      // 1. Check 360° Aim Handle
      if (this.hitTestAimHandle(sx, sy)) {
        this.clearLongPressTimer();
        this.dragCheckpointed = false;
        this.draggingMode = 'aim';
        this.requestRender();
        return;
      }

      // 2. Check Scene Item
      const hit = this.hitTestItem(sx, sy);
      if (hit) {
        this.pointerDownHitId = hit.id;
        this.dragCheckpointed = false;
        const isTouchPointer = e.pointerType === 'touch' || e.pointerType === 'pen';

        // Multi-Select Toggle (Ctrl/Cmd/Shift+Click on Desktop OR Multi-Select Mode on Touch)
        if (this.multiSelectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
          this.toggleMultiSelectItem(hit.id);
          return;
        }

        if (this.selectedItemId === hit.id) {
          this.tappedAlreadySelectedItem = true;
        } else {
          if (!this.multiSelectedIds.has(hit.id)) {
            this.multiSelectedIds.clear();
            if (this.callbacks.onMultiSelectionChange) {
              this.callbacks.onMultiSelectionChange([]);
            }
          }
          // Protect against delayed synthetic click activating newly surfaced UI at the same coordinates
          if (isTouchPointer && this.controlPadEnabled) {
            global.__shamsBlockGhostClicksUntil = Date.now() + 360;
          }
          // On touch screens a newly selected item always starts LOCKED (long press to move)
          this.selectItem(hit.id, isTouchPointer ? false : !hit.positionLocked);
        }

        // Desktop mouse: if item is not explicitly locked, allow immediate dragging
        if (!isTouchPointer && (!hit.positionLocked || this.isPositionUnlocked)) {
          this.isPositionUnlocked = true;
          this.draggingMode = 'move_item';
          this.clearLongPressTimer();
          return;
        }

        // Touch: item already explicitly unlocked (via D-Pad "Unlock to Move") -> drag immediately
        if (isTouchPointer && this.isPositionUnlocked && this.selectedItemId === hit.id) {
          this.draggingMode = 'move_item';
          this.clearLongPressTimer();
          return;
        }

        // Touch (or locked item): normal drag pans the canvas; LONG PRESS (~450ms) unlocks & moves
        this.isPositionUnlocked = false;
        this.draggingMode = 'pan';
        this.clearLongPressTimer();
        this.longPressTargetId = hit.id;
        this.longPressStartMs = performance.now();
        this.animateLongPressRing();

        this.longPressTimer = setTimeout(() => {
          if (this.longPressTargetId === hit.id) {
            this.tappedAlreadySelectedItem = false;
            if (!isTouchPointer) hit.positionLocked = false;
            this.isPositionUnlocked = true;
            this.unlockedViaLongPress = isTouchPointer;
            this.draggingMode = 'move_item';
            this.longPressTargetId = null;
            this.longPressStartMs = 0;
            // Reset drag origin so the item follows the finger from the hold point
            this.pointerDownPos = { x: this.lastPointerPos.x, y: this.lastPointerPos.y };
            this.pointerMovedSignificantly = false;

            if (navigator && typeof navigator.vibrate === 'function') {
              try { navigator.vibrate(45); } catch (err) {}
            }

            if (this.callbacks.onSelectionChange) {
              this.callbacks.onSelectionChange(hit, true, this.dpadVisible);
            }
            if (this.callbacks.onToast) {
              this.callbacks.onToast('🔓 تم فك قفل المكان - اسحب لنقل المعدة / Unlocked: Drag to Move');
            }
            this.requestRender();
          }
        }, this.longPressDuration);
        return;
      }

      // 3. Empty stage space -> Immediately clear selection, then Pan or 3D Orbit
      this.clearLongPressTimer();
      if (this.selectedItemId || (this.multiSelectedIds && this.multiSelectedIds.size > 0) || this.multiSelectMode) {
        this.selectItem(null, false, false);
      }
      if (e.shiftKey || e.button === 2 || (this.viewMode === '3d' && this.orbitModeActive)) {
        this.draggingMode = 'orbit';
      } else {
        this.draggingMode = 'pan';
      }
    }

    animateLongPressRing() {
      if (!this.longPressTargetId) return;
      this.requestRender();
      requestAnimationFrame(() => this.animateLongPressRing());
    }

    onPointerMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (this.dmxCableDrawMode && this.activeCableDraft) {
        this.cursorWorldPos = this.screenToWorldFloor(sx, sy, 0);
        this.requestRender();
      }

      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: sx, y: sy, t: Date.now() });

      // 2-finger pinch zoom + simultaneous two-finger pan around pinch focal point
      if (this.activePointers.size >= 2 && this.initialPinchDist) {
        const pts = Array.from(this.activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const centerX = (pts[0].x + pts[1].x) / 2;
        const centerY = (pts[0].y + pts[1].y) / 2;

        if (this.lastPinchCenter) {
          this.panX += centerX - this.lastPinchCenter.x;
          this.panY += centerY - this.lastPinchCenter.y;
        }
        this.lastPinchCenter = { x: centerX, y: centerY };

        if (dist > 12) {
          const nextZoom = Math.max(0.18, Math.min(3.5, this.initialPinchZoom * (dist / this.initialPinchDist)));
          this.panX = centerX - ((centerX - this.panX) / this.zoom) * nextZoom;
          this.panY = centerY - ((centerY - this.panY) / this.zoom) * nextZoom;
          this.zoom = nextZoom;
        }
        this.requestRender();
        return;
      }

      const moveDist = Math.hypot(sx - this.pointerDownPos.x, sy - this.pointerDownPos.y);
      if (moveDist > 6) {
        this.pointerMovedSignificantly = true;
      }

      if (this.longPressTargetId) {
        if (moveDist > 12) {
          // Finger moved before long press completed -> cancel unlock and pan the canvas
          this.clearLongPressTimer();
          this.draggingMode = 'pan';
          this.requestRender();
        } else {
          // Hold still while waiting for the long press: ignore tiny finger jitter
          this.lastPointerPos = { x: sx, y: sy };
          return;
        }
      }

      const dx = sx - this.lastPointerPos.x;
      const dy = sy - this.lastPointerPos.y;
      this.lastPointerPos = { x: sx, y: sy };

      if (this.draggingMode === 'aim') {
        const sel = this.getSelectedItem();
        if (sel) {
          this.dragCheckpointed = true;
          const wPos = this.screenToWorldFloor(sx, sy, 0);
          const angleRad = Math.atan2(wPos.y - sel.y, wPos.x - sel.x);
          sel.rotation = Math.round((angleRad * 180) / Math.PI);
          const distM = Math.hypot(wPos.x - sel.x, wPos.y - sel.y);
          if (sel.itemType === 'fixture') {
            sel.beamLength = Math.max(1.2, Math.min(14, +distM.toFixed(1)));
          } else if (sel.itemType === 'camera') {
            sel.fovDistance = Math.max(1.5, Math.min(16, +distM.toFixed(1)));
          }
          this.syncAttachedAccessories(sel);
          if (this.callbacks.onItemUpdated) {
            this.callbacks.onItemUpdated(sel, false);
          }
          this.requestRender();
        }
      } else if (this.draggingMode === 'move_item' && this.isPositionUnlocked) {
        if (!this.pointerMovedSignificantly) return;
        const sel = this.getSelectedItem();
        if (sel) {
          this.dragCheckpointed = true;
          const itemZ = this.viewMode === '3d' ? (parseFloat(sel.z) || 0) : 0;
          const wPos = this.screenToWorldFloor(sx, sy, itemZ);
          const prevX = parseFloat(sel.x) || 0;
          const prevY = parseFloat(sel.y) || 0;

          if (sel.itemType === 'accessory' || this.isStandItem(sel)) {
            const snapAcc = this.applyAccessoryMagneticSnap(sel, wPos.x, wPos.y);
            sel.x = snapAcc.x;
            sel.y = snapAcc.y;
          } else {
            const snapped = this.applyVenueAutoSnap(sel, wPos.x, wPos.y);
            sel.x = snapped.x;
            sel.y = snapped.y;
            sel.snappedPipe = snapped.snappedPipe;
            this.syncAttachedAccessories(sel);
          }

          // Move any other multi-selected items by the same delta
          if (this.multiSelectedIds.size > 1 && this.multiSelectedIds.has(sel.id)) {
            const dX = (parseFloat(sel.x) || 0) - prevX;
            const dY = (parseFloat(sel.y) || 0) - prevY;
            this.getMultiSelectedItems().forEach((other) => {
              if (other.id === sel.id) return;
              other.x = +((parseFloat(other.x) || 0) + dX).toFixed(2);
              other.y = +((parseFloat(other.y) || 0) + dY).toFixed(2);
              this.syncAttachedAccessories(other);
              if (this.callbacks.onItemUpdated) this.callbacks.onItemUpdated(other, false);
            });
          }

          if (this.callbacks.onItemUpdated) {
            this.callbacks.onItemUpdated(sel, false);
          }
          this.requestRender();
        }
      } else if (this.draggingMode === 'orbit') {
        this.targetYaw += dx * 0.0075;
        this.targetPitch = Math.max(0.2, Math.min(1.38, this.targetPitch + dy * 0.0065));
        this.start3DDampingLoop();
      } else if (this.draggingMode === 'pan') {
        this.panX += dx;
        this.panY += dy;
        this.requestRender();
      }
    }

    start3DDampingLoop() {
      if (this.dampingAnimId) return;
      const step = () => {
        const dyaw = this.targetYaw - this.orbitYaw;
        const dpitch = this.targetPitch - this.orbitPitch;
        if (Math.abs(dyaw) < 0.0005 && Math.abs(dpitch) < 0.0005) {
          this.orbitYaw = this.targetYaw;
          this.orbitPitch = this.targetPitch;
          this.dampingAnimId = null;
          this.render();
          return;
        }
        this.orbitYaw += dyaw * 0.32;
        this.orbitPitch += dpitch * 0.32;
        this.render();
        this.dampingAnimId = requestAnimationFrame(step);
      };
      this.dampingAnimId = requestAnimationFrame(step);
    }

    onPointerUp(e) {
      try {
        if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.initialPinchDist = null;
        this.lastPinchCenter = null;
      }

      // If lifting 1 finger from a 2-finger pinch, smoothly continue panning with the remaining finger
      if (this.activePointers.size === 1) {
        const remaining = Array.from(this.activePointers.values())[0];
        this.lastPointerPos = { x: remaining.x, y: remaining.y };
        this.pointerDownPos = { x: remaining.x, y: remaining.y };
        this.draggingMode = (this.viewMode === '3d' && this.orbitModeActive) ? 'orbit' : 'pan';
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const upX = e.clientX !== undefined ? e.clientX - rect.left : this.lastPointerPos.x;
      const upY = e.clientY !== undefined ? e.clientY - rect.top : this.lastPointerPos.y;
      const downHitId = this.pointerDownHitId;
      const isTouchPointer = e.pointerType === 'touch' || e.pointerType === 'pen';
      const wasMovingItem = this.draggingMode === 'move_item' && this.pointerMovedSignificantly;
      const wasAiming = this.draggingMode === 'aim';
      const wasPanOrOrbit = (this.draggingMode === 'pan' || this.draggingMode === 'orbit') && !downHitId;
      this.clearLongPressTimer();
      this.draggingMode = null;
      this.pointerDownHitId = null;

      // Touch: re-lock after a long-press move so normal panning never moves fixtures accidentally
      if (this.unlockedViaLongPress) {
        this.unlockedViaLongPress = false;
        this.isPositionUnlocked = false;
        if (!wasMovingItem && this.callbacks.onSelectionChange) {
          this.callbacks.onSelectionChange(this.getSelectedItem(), false, this.dpadVisible);
        }
        this.requestRender();
      }

      // Double-tap on touch (or stationary click/tap): handle on pointerup so finger is lifted before modal opens
      if (!this.dmxCableDrawMode && !this.pointerMovedSignificantly) {
        if (wasPanOrOrbit && (this.selectedItemId || (this.multiSelectedIds && this.multiSelectedIds.size > 0) || this.multiSelectMode)) {
          this.selectItem(null, false);
          this.lastTapUpTime = 0;
          this.lastTapUpItemId = null;
        } else if (isTouchPointer && downHitId && !this.multiSelectMode) {
          const now = Date.now();
          const distFromPrevTap = Math.hypot(upX - (this.lastTapUpPos?.x || 0), upY - (this.lastTapUpPos?.y || 0));
          if (this.lastTapUpItemId === downHitId && now - this.lastTapUpTime < 480 && distFromPrevTap < 42) {
            this.lastTapUpTime = 0;
            this.lastTapUpItemId = null;
            const targetItem = this.scene && Array.isArray(this.scene.items)
              ? this.scene.items.find((it) => it.id === downHitId)
              : null;
            if (targetItem && this.callbacks.onOpenModal) {
              // Suppress browser's delayed synthetic click so it cannot fire inside the newly opened modal
              global.__shamsBlockGhostClicksUntil = Date.now() + 460;
              setTimeout(() => {
                if (this.callbacks.onOpenModal) {
                  this.callbacks.onOpenModal(targetItem);
                }
              }, 45);
            }
          } else {
            this.lastTapUpTime = now;
            this.lastTapUpItemId = downHitId;
            this.lastTapUpPos = { x: upX, y: upY };
          }
        } else if (!downHitId) {
          this.lastTapUpTime = 0;
          this.lastTapUpItemId = null;
        }
      } else {
        this.lastTapUpTime = 0;
        this.lastTapUpItemId = null;
      }
      this.tappedAlreadySelectedItem = false;

      if (wasMovingItem) {
        const sel = this.getSelectedItem();
        if (this.callbacks.onSelectionChange) {
          this.callbacks.onSelectionChange(sel, this.isPositionUnlocked, this.dpadVisible);
        }
        if (this.callbacks.onItemUpdated && sel) {
          this.callbacks.onItemUpdated(sel, true);
        }
        if (this.dragCheckpointed && this.callbacks.onHistoryCheckpoint) {
          this.callbacks.onHistoryCheckpoint('Move Item');
        }
      } else if (wasAiming) {
        const sel = this.getSelectedItem();
        if (this.callbacks.onItemUpdated && sel) {
          this.callbacks.onItemUpdated(sel, true);
        }
        if (this.dragCheckpointed && this.callbacks.onHistoryCheckpoint) {
          this.callbacks.onHistoryCheckpoint('Aim Item');
        }
      }
      this.dragCheckpointed = false;

      this.requestRender();
    }

    requestRender() {
      if (this.animFrameId) return;
      this.animFrameId = requestAnimationFrame(() => {
        this.animFrameId = null;
        this.render();
      });
    }

    isItemVisibleUnderExportFilter(item) {
      if (!this.exportChannelFilter || this.exportChannelFilter === 'all') return true;
      if (item.itemType === 'fixture') {
        return (item.channel || 'Channel A') === this.exportChannelFilter;
      }
      return true;
    }

    // ========================================================================
    // STATIC 2D VENUE CACHE (Supports Dark Mode & Light Mode + Truss Thickness)
    // ========================================================================
    rebuildStaticVenueCache() {
      if (!this.project || !this.project.venueConfig) return;
      const v = this.project.venueConfig;
      const vw = parseFloat(v.width) || 14;
      const vl = parseFloat(v.length) || 10;
      const margin = 65;
      const s = this.ppm;
      const scale = Math.max(2, Math.min(4, this.dpr || 2));
      const cw = Math.ceil((vw * s + margin * 2) * scale);
      const ch = Math.ceil((vl * s + margin * 2) * scale);

      this.staticCacheCanvas.width = cw;
      this.staticCacheCanvas.height = ch;
      this.staticCacheMargin = margin;
      this.staticCacheScale = scale;

      const isLight = this.theme === 'light';
      const ctx = this.staticCacheCtx;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(margin, margin);

      const W = vw * s;
      const L = vl * s;

      // Studio Floor Background
      ctx.fillStyle = isLight ? '#f8fafc' : '#0d1322';
      ctx.fillRect(0, 0, W, L);

      // Sub-meter 0.5m fine grid
      ctx.strokeStyle = isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(51, 65, 85, 0.28)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let x = 0.5; x < vw; x += 0.5) {
        ctx.moveTo(x * s, 0);
        ctx.lineTo(x * s, L);
      }
      for (let y = 0.5; y < vl; y += 0.5) {
        ctx.moveTo(0, y * s);
        ctx.lineTo(W, y * s);
      }
      ctx.stroke();

      // 1-Meter Primary Grid + Ruler Labels
      ctx.strokeStyle = isLight ? 'rgba(100, 116, 139, 0.45)' : 'rgba(71, 85, 105, 0.55)';
      ctx.lineWidth = 1;
      ctx.fillStyle = isLight ? '#334155' : '#64748b';
      ctx.font = 'bold 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.beginPath();
      for (let x = 0; x <= vw; x += 1) {
        ctx.moveTo(x * s, 0);
        ctx.lineTo(x * s, L);
        ctx.fillText(x + 'm', x * s, -10);
      }
      ctx.textAlign = 'right';
      for (let y = 0; y <= vl; y += 1) {
        ctx.moveTo(0, y * s);
        ctx.lineTo(W, y * s);
        ctx.fillText(y + 'm', -10, y * s + 3);
      }
      ctx.stroke();

      if (v.type === 'plateau') {
        this.drawPlateauGrid2D(ctx, v, s, W, L, isLight);
      } else if (v.type === 'truss') {
        this.drawTrussRig2D(ctx, v, s, W, L, isLight);
      } else if (v.type === 'church') {
        this.drawChurchVenue2D(ctx, v, s, W, L, isLight);
      }

      // Outer Studio/Stage Wall Perimeter
      ctx.strokeStyle = isLight ? '#0f172a' : '#94a3b8';
      ctx.lineWidth = 3.2;
      ctx.strokeRect(0, 0, W, L);

      // Venue Dimensions Header Label
      ctx.fillStyle = isLight ? '#b45309' : '#f59e0b';
      ctx.font = 'bold 12px "Segoe UI", Tahoma, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${v.name || 'Venue'}  [${vw}m × ${vl}m | H: ${v.height || 4.5}m]`,
        0,
        -28
      );

      ctx.restore();
      this.staticCacheDirty = false;
    }

    drawPlateauGrid2D(ctx, v, s, W, L, isLight) {
      const gc = v.gridConfig || {};
      const hPipes = gc.horizontalPipes || [];
      const vPipes = gc.verticalPipes || [];

      ctx.save();
      vPipes.forEach((px, idx) => {
        const x = px * s;
        ctx.strokeStyle = isLight ? 'rgba(71, 85, 105, 0.8)' : 'rgba(148, 163, 184, 0.72)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, L);
        ctx.stroke();

        ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.6)' : 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, L);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x - 14, L + 5, 28, 15);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(x - 14, L + 5, 28, 15);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('V' + (idx + 1), x, L + 16);
      });

      hPipes.forEach((py, idx) => {
        const y = py * s;
        ctx.strokeStyle = isLight ? 'rgba(71, 85, 105, 0.8)' : 'rgba(148, 163, 184, 0.72)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();

        ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.65)' : 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(W + 6, y - 8, 28, 16);
        ctx.strokeStyle = '#f59e0b';
        ctx.strokeRect(W + 6, y - 8, 28, 16);
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('H' + (idx + 1), W + 20, y + 3.5);
      });

      vPipes.forEach((px) => {
        hPipes.forEach((py) => {
          ctx.fillStyle = isLight ? '#334155' : '#e2e8f0';
          ctx.beginPath();
          ctx.arc(px * s, py * s, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      ctx.restore();
    }

    /**
     * Update #5: Adjustable Truss Thickness & Structural Size in 2D
     */
    drawTrussRig2D(ctx, v, s, W, L, isLight) {
      const tc = v.trussConfig || {};
      const vw = parseFloat(v.width) || 12;
      const vl = parseFloat(v.length) || 9;
      const tw = parseFloat(tc.trussWidth) || (vw - 3);
      const td = parseFloat(tc.trussDepth) || (vl - 2.5);
      const thicknessScale = Math.max(0.4, Math.min(3.0, parseFloat(tc.trussThickness) || 1.0));

      const leftX = ((vw - tw) / 2) * s;
      const rightX = leftX + tw * s;
      const topY = ((vl - td) / 2) * s;
      const botY = topY + td * s;

      const halfChordPx = 9 * thicknessScale;
      const chordStroke = 2.2 * Math.pow(thicknessScale, 0.65);
      const webStep = Math.max(12, 18 * Math.pow(thicknessScale, 0.5));

      const drawTrussBeam = (x1, y1, x2, y2, label) => {
        ctx.save();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const len = Math.hypot(x2 - x1, y2 - y1);
        ctx.translate(x1, y1);
        ctx.rotate(angle);

        ctx.fillStyle = isLight ? 'rgba(203, 213, 225, 0.85)' : 'rgba(30, 41, 59, 0.88)';
        ctx.fillRect(0, -halfChordPx, len, halfChordPx * 2);

        // Outer heavy steel chords
        ctx.strokeStyle = isLight ? '#1e293b' : '#cbd5e1';
        ctx.lineWidth = chordStroke;
        ctx.strokeRect(0, -halfChordPx, len, halfChordPx * 2);

        // Zig-zag diagonal truss webbing scaled by thickness
        ctx.strokeStyle = isLight ? '#475569' : '#64748b';
        ctx.lineWidth = 1.3 * Math.pow(thicknessScale, 0.6);
        ctx.beginPath();
        for (let p = 0; p < len; p += webStep) {
          ctx.moveTo(p, -halfChordPx);
          ctx.lineTo(Math.min(len, p + webStep / 2), halfChordPx);
          ctx.lineTo(Math.min(len, p + webStep), -halfChordPx);
        }
        ctx.stroke();

        if (label) {
          ctx.fillStyle = isLight ? '#0369a1' : '#38bdf8';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(label, 8, -halfChordPx - 5);
        }
        ctx.restore();
      };

      if (tc.shape === 'straight') {
        const y = vl * 0.35 * s;
        drawTrussBeam(leftX, y, rightX, y, `Straight Truss (${tw}m | ${thicknessScale}x)`);
      } else if (tc.shape === 'l-shape') {
        drawTrussBeam(leftX, topY, rightX, topY, 'Truss Back');
        drawTrussBeam(leftX, topY, leftX, botY, 'Truss Left');
      } else if (tc.shape === 'u-shape') {
        drawTrussBeam(leftX, topY, rightX, topY, 'Truss Back');
        drawTrussBeam(leftX, topY, leftX, botY, 'Truss Left');
        drawTrussBeam(rightX, topY, rightX, botY, 'Truss Right');
      } else {
        drawTrussBeam(leftX, topY, rightX, topY, 'North Truss');
        drawTrussBeam(leftX, botY, rightX, botY, 'South Truss');
        drawTrussBeam(leftX, topY, leftX, botY, 'West Truss');
        drawTrussBeam(rightX, topY, rightX, botY, 'East Truss');
      }

      // Custom Intersecting Steel Crossbars scaled by thickness
      (tc.crossbars || []).forEach((cb, i) => {
        ctx.save();
        const barWidth = 4.2 * Math.pow(thicknessScale, 0.75);
        if (cb.orientation === 'horizontal') {
          const y = topY + (parseFloat(cb.position) || 2) * s;
          ctx.strokeStyle = isLight ? '#d97706' : '#f59e0b';
          ctx.lineWidth = barWidth;
          ctx.beginPath();
          ctx.moveTo(leftX, y);
          ctx.lineTo(rightX, y);
          ctx.stroke();

          ctx.fillStyle = isLight ? '#b45309' : '#fbbf24';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(cb.label || ('Crossbar H' + (i + 1)), leftX + 10, y - barWidth - 3);
        } else {
          const x = leftX + (parseFloat(cb.position) || 2) * s;
          ctx.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
          ctx.lineWidth = barWidth;
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x, botY);
          ctx.stroke();

          ctx.fillStyle = isLight ? '#0369a1' : '#38bdf8';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(cb.label || ('Crossbar V' + (i + 1)), x + barWidth + 4, topY + 18);
        }
        ctx.restore();
      });
    }

    drawChurchVenue2D(ctx, v, s, W, L, isLight) {
      const cc = v.churchConfig || {};
      const vl = parseFloat(v.length) || 22;
      const sancDepth = (parseFloat(cc.sanctuaryDepth) || 5.0) * s;
      const sideOffset = (parseFloat(cc.sideAisleOffset) || 2.6) * s;
      const centerAisleW = (parseFloat(cc.centerAisleWidth) || 2.4) * s;
      const colCount = parseInt(cc.columnsPerSide, 10) >= 0 ? parseInt(cc.columnsPerSide, 10) : 5;
      const pewRows = cc.pewRows !== undefined ? Math.max(0, parseInt(cc.pewRows, 10)) : 6;
      const pewGapM = Math.max(0.4, parseFloat(cc.pewGap) || 1.8);
      const pewAltarOffsetM = Math.max(0.2, parseFloat(cc.pewAltarOffset ?? 1.8));

      ctx.save();
      ctx.fillStyle = isLight ? 'rgba(251, 191, 36, 0.2)' : 'rgba(120, 53, 15, 0.28)';
      ctx.fillRect(0, 0, W, sancDepth);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(0, 0, W, sancDepth);

      ctx.fillStyle = isLight ? '#b45309' : '#fbbf24';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('الهيكل / المنبر (Raised Sanctuary & Altar +0.6m)', W / 2, 22);

      ctx.fillStyle = 'rgba(217, 119, 6, 0.35)';
      ctx.strokeStyle = '#fbbf24';
      ctx.fillRect(W / 2 - 1.2 * s, sancDepth * 0.42, 2.4 * s, 1.1 * s);
      ctx.strokeRect(W / 2 - 1.2 * s, sancDepth * 0.42, 2.4 * s, 1.1 * s);

      ctx.fillStyle = isLight ? 'rgba(220, 38, 38, 0.14)' : 'rgba(153, 27, 27, 0.25)';
      ctx.fillRect(W / 2 - centerAisleW / 2, sancDepth, centerAisleW, L - sancDepth);

      const naveStart = sancDepth + pewAltarOffsetM * s;
      const pewStep = pewGapM * s;
      const leftPewX = sideOffset + 0.6 * s;
      const leftPewW = Math.max(1 * s, W / 2 - centerAisleW / 2 - leftPewX - 0.3 * s);
      const rightPewX = W / 2 + centerAisleW / 2 + 0.3 * s;

      ctx.fillStyle = isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(51, 65, 85, 0.45)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      for (let r = 0; r < pewRows; r++) {
        const py = naveStart + r * pewStep;
        if (py + 0.25 * s > L) break;
        ctx.fillRect(leftPewX, py, leftPewW, 0.55 * s);
        ctx.strokeRect(leftPewX, py, leftPewW, 0.55 * s);
        ctx.fillRect(rightPewX, py, leftPewW, 0.55 * s);
        ctx.strokeRect(rightPewX, py, leftPewW, 0.55 * s);
      }

      const colStart = sancDepth + 1.4 * s;
      const colSpan = L - colStart - 1.4 * s;
      const colSpacing = colCount > 1 ? colSpan / (colCount - 1) : 0;

      for (let c = 0; c < colCount; c++) {
        const cy = colStart + c * colSpacing;
        [sideOffset, W - sideOffset].forEach((cx, sideIdx) => {
          ctx.fillStyle = isLight ? '#475569' : '#334155';
          ctx.strokeStyle = isLight ? '#0f172a' : '#f8fafc';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 0.38 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText((sideIdx === 0 ? 'L' : 'R') + (c + 1), cx, cy + 3);
        });
      }

      (cc.mountPipesY || [3.5, 6.5, 10.5, 14.5, 18.5]).forEach((py, idx) => {
        if (py <= vl) {
          ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.7)' : 'rgba(56, 189, 248, 0.55)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 5]);
          ctx.beginPath();
          ctx.moveTo(sideOffset, py * s);
          ctx.lineTo(W - sideOffset, py * s);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = isLight ? '#0369a1' : '#38bdf8';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('Bar #' + (idx + 1) + ' (' + py + 'm)', sideOffset + 6, py * s - 5);
        }
      });

      ctx.restore();
    }

    // ========================================================================
    // UPDATE #8: OVERHAULED HIGH-PRECISION 3D PERSPECTIVE VIEWPORT
    // ========================================================================
    draw3DLine(ctx, x1, y1, z1, x2, y2, z2) {
      const a = this.worldToScreen(x1, y1, z1);
      const b = this.worldToScreen(x2, y2, z2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }

    /**
     * True 3D Multi-Chord Box Truss Beam with 3D Depth & Diagonal Bracing
     */
    draw3DBoxTrussSegment(ctx, x1, y1, x2, y2, trimZ, thicknessScale, isLight) {
      const halfW = 0.22 * thicknessScale;
      const halfH = 0.22 * thicknessScale;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 0.1) return;

      // Normal vector in XY plane
      const nx = (-dy / len) * halfW;
      const ny = (dx / len) * halfW;

      // 4 3D Chords: Top-Left, Top-Right, Bot-Left, Bot-Right
      const zTop = trimZ + halfH;
      const zBot = trimZ - halfH;

      ctx.save();
      // 1. Diagonal 3D Webbing Braces along length
      const stepM = Math.max(0.45, 0.65 * Math.pow(thicknessScale, 0.4));
      const steps = Math.max(2, Math.floor(len / stepM));
      ctx.strokeStyle = isLight ? 'rgba(71, 85, 105, 0.75)' : 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = Math.max(1.0, 1.3 * Math.pow(thicknessScale, 0.6));
      ctx.beginPath();
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 0.5) / steps;
        const t2 = (i + 1) / steps;

        const ax = x1 + dx * t0, ay = y1 + dy * t0;
        const mx = x1 + dx * t1, my = y1 + dy * t1;
        const bx = x1 + dx * t2, by = y1 + dy * t2;

        // Top webbing
        this.draw3DLine(ctx, ax - nx, ay - ny, zTop, mx + nx, my + ny, zTop);
        this.draw3DLine(ctx, mx + nx, my + ny, zTop, bx - nx, by - ny, zTop);
        // Side webbing
        this.draw3DLine(ctx, ax + nx, ay + ny, zBot, mx + nx, my + ny, zTop);
        this.draw3DLine(ctx, mx + nx, my + ny, zTop, bx + nx, by + ny, zBot);
      }
      ctx.stroke();

      // 2. 4 Main Structural Steel Chords
      ctx.strokeStyle = isLight ? '#1e293b' : '#e2e8f0';
      ctx.lineWidth = Math.max(1.8, 2.5 * Math.pow(thicknessScale, 0.7));
      ctx.beginPath();
      this.draw3DLine(ctx, x1 - nx, y1 - ny, zTop, x2 - nx, y2 - ny, zTop);
      this.draw3DLine(ctx, x1 + nx, y1 + ny, zTop, x2 + nx, y2 + ny, zTop);
      this.draw3DLine(ctx, x1 - nx, y1 - ny, zBot, x2 - nx, y2 - ny, zBot);
      this.draw3DLine(ctx, x1 + nx, y1 + ny, zBot, x2 + nx, y2 + ny, zBot);
      ctx.stroke();
      ctx.restore();
    }

    renderVenue3D(ctx) {
      if (!this.project || !this.project.venueConfig) return;
      const v = this.project.venueConfig;
      const vw = parseFloat(v.width) || 14;
      const vl = parseFloat(v.length) || 10;
      const vh = parseFloat(v.height) || 4.5;
      const isLight = this.theme === 'light';

      // 1. 3D Stage Floor Surface & Shadowed Base
      const p00 = this.worldToScreen(0, 0, 0);
      const p10 = this.worldToScreen(vw, 0, 0);
      const p11 = this.worldToScreen(vw, vl, 0);
      const p01 = this.worldToScreen(0, vl, 0);

      ctx.fillStyle = isLight ? '#f1f5f9' : '#0b1120';
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();

      // Sub-meter & 1m 3D Floor Grid + Coordinate Rulers
      ctx.strokeStyle = isLight ? 'rgba(100, 116, 139, 0.35)' : 'rgba(51, 65, 85, 0.5)';
      ctx.lineWidth = 1;
      ctx.fillStyle = isLight ? '#475569' : '#64748b';
      ctx.font = 'bold 9.5px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.beginPath();
      for (let x = 0; x <= vw; x += 1) {
        const a = this.worldToScreen(x, 0, 0);
        const b = this.worldToScreen(x, vl, 0);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (x % 2 === 0) ctx.fillText(x + 'm', b.x, b.y + 13);
      }
      for (let y = 0; y <= vl; y += 1) {
        const a = this.worldToScreen(0, y, 0);
        const b = this.worldToScreen(vw, y, 0);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (y % 2 === 0) ctx.fillText(y + 'm', a.x - 14, a.y + 3);
      }
      ctx.stroke();

      // Floor Perimeter Frame
      ctx.strokeStyle = isLight ? '#0f172a' : '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.stroke();

      // 4 Vertical Studio Corner Columns + Upper Ceiling Perimeter Frame
      const c00 = this.worldToScreen(0, 0, vh);
      const c10 = this.worldToScreen(vw, 0, vh);
      const c11 = this.worldToScreen(vw, vl, vh);
      const c01 = this.worldToScreen(0, vl, vh);

      ctx.strokeStyle = isLight ? 'rgba(71, 85, 105, 0.45)' : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      [[p00, c00], [p10, c10], [p11, c11], [p01, c01]].forEach(([bot, top]) => {
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(top.x, top.y);
      });
      ctx.moveTo(c00.x, c00.y);
      ctx.lineTo(c10.x, c10.y);
      ctx.lineTo(c11.x, c11.y);
      ctx.lineTo(c01.x, c01.y);
      ctx.closePath();
      ctx.stroke();

      // VENUE-SPECIFIC 3D GEOMETRY
      if (v.type === 'plateau' && v.gridConfig) {
        const gridZ = vh - 0.3;
        const vPipes = v.gridConfig.verticalPipes || [];
        const hPipes = v.gridConfig.horizontalPipes || [];

        // Lengthwise V-Pipes
        ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.85)' : 'rgba(56, 189, 248, 0.78)';
        ctx.lineWidth = 2.6;
        vPipes.forEach((px, idx) => {
          const a = this.worldToScreen(px, 0, gridZ);
          const b = this.worldToScreen(px, vl, gridZ);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText('V' + (idx + 1), a.x, a.y - 6);
        });

        // Widthwise H-Pipes
        ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.85)' : 'rgba(245, 158, 11, 0.78)';
        ctx.lineWidth = 2.6;
        hPipes.forEach((py, idx) => {
          const a = this.worldToScreen(0, py, gridZ);
          const b = this.worldToScreen(vw, py, gridZ);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText('H' + (idx + 1), b.x + 12, b.y);
        });

        // 3D Pipe Clamps & Ceiling Drop Hangers at Intersections
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        vPipes.forEach((px) => {
          hPipes.forEach((py) => {
            const pGrid = this.worldToScreen(px, py, gridZ);
            const pCeil = this.worldToScreen(px, py, vh);
            ctx.beginPath();
            ctx.moveTo(pGrid.x, pGrid.y);
            ctx.lineTo(pCeil.x, pCeil.y);
            ctx.stroke();
          });
        });
      } else if (v.type === 'truss' && v.trussConfig) {
        const tc = v.trussConfig;
        const trimZ = parseFloat(tc.trimHeight) || (vh - 0.5);
        const tw = parseFloat(tc.trussWidth) || (vw - 3);
        const td = parseFloat(tc.trussDepth) || (vl - 2.5);
        const thicknessScale = Math.max(0.4, Math.min(3.0, parseFloat(tc.trussThickness) || 1.0));

        const leftX = (vw - tw) / 2;
        const rightX = leftX + tw;
        const topY = (vl - td) / 2;
        const botY = topY + td;

        // 3D Support Towers at Active Corners
        const towers = tc.shape === 'straight'
          ? [[leftX, vl * 0.35], [rightX, vl * 0.35]]
          : [[leftX, topY], [rightX, topY], [rightX, botY], [leftX, botY]];

        towers.forEach(([tx, ty]) => {
          const b = this.worldToScreen(tx, ty, 0);
          const t = this.worldToScreen(tx, ty, trimZ);
          ctx.strokeStyle = isLight ? '#334155' : '#94a3b8';
          ctx.lineWidth = 3.5 * Math.pow(thicknessScale, 0.65);
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();

          // Tower floor baseplate
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4.5 * Math.pow(thicknessScale, 0.5), 0, Math.PI * 2);
          ctx.fill();
        });

        // 3D Multi-Chord Box Truss Spans
        if (tc.shape === 'straight') {
          const y = vl * 0.35;
          this.draw3DBoxTrussSegment(ctx, leftX, y, rightX, y, trimZ, thicknessScale, isLight);
        } else {
          this.draw3DBoxTrussSegment(ctx, leftX, topY, rightX, topY, trimZ, thicknessScale, isLight);
          this.draw3DBoxTrussSegment(ctx, leftX, topY, leftX, botY, trimZ, thicknessScale, isLight);
          if (tc.shape === 'u-shape' || tc.shape === 'box') {
            this.draw3DBoxTrussSegment(ctx, rightX, topY, rightX, botY, trimZ, thicknessScale, isLight);
          }
          if (tc.shape === 'box') {
            this.draw3DBoxTrussSegment(ctx, leftX, botY, rightX, botY, trimZ, thicknessScale, isLight);
          }
        }

        // 3D Intersecting Steel Crossbars at trimZ
        (tc.crossbars || []).forEach((cb) => {
          ctx.save();
          ctx.strokeStyle = cb.orientation === 'horizontal' ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 3.5 * Math.pow(thicknessScale, 0.75);
          ctx.beginPath();
          if (cb.orientation === 'horizontal') {
            const y = topY + (parseFloat(cb.position) || 2);
            this.draw3DLine(ctx, leftX, y, trimZ, rightX, y, trimZ);
          } else {
            const x = leftX + (parseFloat(cb.position) || 2);
            this.draw3DLine(ctx, x, topY, trimZ, x, botY, trimZ);
          }
          ctx.stroke();
          ctx.restore();
        });
      } else if (v.type === 'church' && v.churchConfig) {
        const cc = v.churchConfig;
        const sancD = parseFloat(cc.sanctuaryDepth) || 5.0;
        const sancZ = parseFloat(cc.sanctuaryElevation) || 0.6;

        // 3D Raised Sanctuary Platform Box
        const s00 = this.worldToScreen(0, 0, sancZ);
        const s10 = this.worldToScreen(vw, 0, sancZ);
        const s11 = this.worldToScreen(vw, sancD, sancZ);
        const s01 = this.worldToScreen(0, sancD, sancZ);
        const f01 = this.worldToScreen(0, sancD, 0);
        const f11 = this.worldToScreen(vw, sancD, 0);

        // Front riser step face
        ctx.fillStyle = 'rgba(180, 83, 9, 0.5)';
        ctx.beginPath();
        ctx.moveTo(s01.x, s01.y);
        ctx.lineTo(s11.x, s11.y);
        ctx.lineTo(f11.x, f11.y);
        ctx.lineTo(f01.x, f01.y);
        ctx.closePath();
        ctx.fill();

        // Top sanctuary floor
        ctx.fillStyle = 'rgba(217, 119, 6, 0.28)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(s00.x, s00.y);
        ctx.lineTo(s10.x, s10.y);
        ctx.lineTo(s11.x, s11.y);
        ctx.lineTo(s01.x, s01.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3D Church Columns with Base & Capital Rings
        const sideOffset = parseFloat(cc.sideAisleOffset) || 2.6;
        const colCount = parseInt(cc.columnsPerSide, 10) || 5;
        const colStart = sancD + 1.4;
        const colSpan = vl - colStart - 1.4;
        const colSpacing = colCount > 1 ? colSpan / (colCount - 1) : 0;

        for (let c = 0; c < colCount; c++) {
          const cy = colStart + c * colSpacing;
          [sideOffset, vw - sideOffset].forEach((cx) => {
            const b = this.worldToScreen(cx, cy, 0);
            const t = this.worldToScreen(cx, cy, vh * 0.88);
            ctx.strokeStyle = isLight ? '#475569' : '#cbd5e1';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
            ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
    }

    // ========================================================================
    // MAIN 60 FPS RENDER LOOP
    // ========================================================================
    render() {
      const ctx = this.ctx;
      const dpr = this.dpr || 1;
      const isLight = this.theme === 'light';
      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear background
      ctx.fillStyle = isLight ? '#e2e8f0' : '#070a12';
      ctx.fillRect(0, 0, this.width, this.height);

      if (!this.project || !this.scene) {
        ctx.restore();
        return;
      }

      // Ensure attached magnetic accessories stay locked to their parent fixture's front
      this.syncAllAccessories();

      // 1. Render Venue Base Layer (Cached 2D or Overhauled 3D)
      if (this.viewMode === '2d') {
        if (this.staticCacheDirty) {
          this.rebuildStaticVenueCache();
        }
        const m = this.staticCacheMargin || 65;
        const sc = this.staticCacheScale || 2;
        const destX = this.panX - m * this.zoom;
        const destY = this.panY - m * this.zoom;
        const destW = (this.staticCacheCanvas.width / sc) * this.zoom;
        const destH = (this.staticCacheCanvas.height / sc) * this.zoom;
        ctx.drawImage(this.staticCacheCanvas, destX, destY, destW, destH);
      } else {
        this.renderVenue3D(ctx);
      }

      // 2. Render Light Beams & Camera FOV Cones (Respecting `lightBeam` & `cameraCone` Checkboxes)
      this.renderConesAndBeams(ctx);

      // 3. Render DMX512 Cables (Both Manual Custom Cables & Auto Sequential Wiring if toggled)
      this.renderDMXWiring(ctx);

      // 4. Render Distance Measurement Lines (Camera / Light -> Subject)
      if (this.project.showDistanceLines !== false) {
        this.renderDistanceMeasurements(ctx);
      }

      // 5. Render All Scene Items (Depth-sorted in 3D mode, scaled by `item.scale`)
      this.renderSceneItems(ctx);

      // 6. Render Global Floating Info Boxes (`Show Info ▾` pills including `Fixture Name`)
      this.renderGlobalInfoPills(ctx);

      // 7. Render 360° Free Aim Handle & Long-Press Unlock Radial Ring on Selected Item
      this.renderSelectionGizmos(ctx);

      ctx.restore();
    }

    renderConesAndBeams(ctx) {
      const flags = (this.project && this.project.showInfoFlags) || {};
      const showLightBeams = flags.lightBeam !== false;
      const showCamCones = flags.cameraCone !== false;

      const items = this.scene.items || [];
      items.forEach((item) => {
        if (!this.isItemVisibleUnderExportFilter(item)) return;

        if (item.itemType === 'fixture' && !item.isSplitter) {
          if (!showLightBeams) return;
          const dimmer = Math.max(0, Math.min(100, parseFloat(item.dimmer) ?? 100));
          if (dimmer <= 0) return;

          const itemZ = this.viewMode === '3d' ? (parseFloat(item.z) || 4.0) : 0;
          const origin = this.worldToScreen(item.x, item.y, itemZ);
          const rotRad = ((parseFloat(item.rotation) || 0) * Math.PI) / 180;
          const beamAngleDeg = Math.max(6, Math.min(140, parseFloat(item.beamAngle) || 40));
          const halfAngle = ((beamAngleDeg / 2) * Math.PI) / 180;
          const lenM = Math.max(1.2, parseFloat(item.beamLength) || 4.0);

          const lx = item.x + Math.cos(rotRad - halfAngle) * lenM;
          const ly = item.y + Math.sin(rotRad - halfAngle) * lenM;
          const cx = item.x + Math.cos(rotRad) * lenM;
          const cy = item.y + Math.sin(rotRad) * lenM;
          const rx = item.x + Math.cos(rotRad + halfAngle) * lenM;
          const ry = item.y + Math.sin(rotRad + halfAngle) * lenM;

          const pLeft = this.worldToScreen(lx, ly, 0);
          const pCenter = this.worldToScreen(cx, cy, 0);
          const pRight = this.worldToScreen(rx, ry, 0);

          const baseColor = item.color || '#fff4e0';
          const alpha = (0.14 + (dimmer / 100) * 0.3).toFixed(2);

          ctx.save();
          const grad = ctx.createLinearGradient(origin.x, origin.y, pCenter.x, pCenter.y);
          grad.addColorStop(0, hexToRgba(baseColor, parseFloat(alpha)));
          grad.addColorStop(1, hexToRgba(baseColor, 0.02));

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.lineTo(pLeft.x, pLeft.y);
          ctx.quadraticCurveTo(pCenter.x, pCenter.y, pRight.x, pRight.y);
          ctx.closePath();
          ctx.fill();

          // In 3D mode, draw crisp 3D wireframe cone ribs + floor pool ellipse
          if (this.viewMode === '3d') {
            ctx.strokeStyle = hexToRgba(baseColor, 0.45);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(pLeft.x, pLeft.y);
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(pRight.x, pRight.y);
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(pCenter.x, pCenter.y);
            ctx.stroke();

            // Glowing light pool on studio floor (z = 0)
            const poolRadiusPx = Math.max(12, Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y) * 0.45);
            ctx.fillStyle = hexToRgba(baseColor, 0.16);
            ctx.beginPath();
            ctx.ellipse(pCenter.x, pCenter.y, poolRadiusPx, poolRadiusPx * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          if (this.selectedItemId === item.id) {
            ctx.strokeStyle = hexToRgba(baseColor, 0.75);
            ctx.lineWidth = 1.4;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        } else if (item.itemType === 'camera') {
          if (!showCamCones) return;
          const itemZ = this.viewMode === '3d' ? (parseFloat(item.z) || 1.5) : 0;
          const origin = this.worldToScreen(item.x, item.y, itemZ);
          const rotRad = ((parseFloat(item.rotation) || 0) * Math.PI) / 180;
          const fovDeg = global.CineLightDB.calculateHorizontalFOV(item.focalLengthMm || 35);
          const halfFov = ((fovDeg / 2) * Math.PI) / 180;
          const distM = Math.max(1.5, parseFloat(item.fovDistance) || 5.0);

          const targetZ = this.viewMode === '3d' ? 1.35 : 0;
          const pLeft = this.worldToScreen(
            item.x + Math.cos(rotRad - halfFov) * distM,
            item.y + Math.sin(rotRad - halfFov) * distM,
            targetZ
          );
          const pRight = this.worldToScreen(
            item.x + Math.cos(rotRad + halfFov) * distM,
            item.y + Math.sin(rotRad + halfFov) * distM,
            targetZ
          );

          ctx.save();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
          ctx.strokeStyle = this.selectedItemId === item.id ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = this.selectedItemId === item.id ? 1.8 : 1.2;
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.lineTo(pLeft.x, pLeft.y);
          ctx.lineTo(pRight.x, pRight.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      });
    }

    /**
     * Render Both Custom Manual DMX Cables (Update #6) & Optional Sequential DMX Wiring
     */
    renderDMXWiring(ctx) {
      // 1. Render User-Drawn Custom Manual DMX Cables
      const customCables = (this.scene && this.scene.customDmxCables) || [];
      customCables.forEach((cable) => {
        if (this.exportChannelFilter && this.exportChannelFilter !== 'all') {
          if (cable.channel && cable.channel !== this.exportChannelFilter) return;
        }
        this.drawSingleCustomCable(ctx, cable, cable.id === this.selectedCableId);
      });

      // 2. Render Active Draft Cable while in Draw Mode
      if (this.dmxCableDrawMode && this.activeCableDraft && this.activeCableDraft.points.length > 0) {
        this.drawSingleCustomCable(ctx, this.activeCableDraft, true, this.cursorWorldPos);
      }

      // 3. Render Auto Sequential Wiring if toggled on (Section 5.2: Skip 0-DMX channel fixtures)
      if (!this.project.showDmxWiring) return;

      const fixtures = (this.scene.items || []).filter(
        (i) =>
          i.itemType === 'fixture' &&
          !i.isSplitter &&
          (parseInt(i.footprint, 10) || 0) > 0 &&
          this.isItemVisibleUnderExportFilter(i)
      );
      const byChannel = {};
      fixtures.forEach((f) => {
        const ch = f.channel || 'Channel A';
        if (!byChannel[ch]) byChannel[ch] = [];
        byChannel[ch].push(f);
      });

      Object.keys(byChannel).sort().forEach((ch) => {
        const list = byChannel[ch].slice().sort((a, b) => (a.fixtureNum || 1) - (b.fixtureNum || 1));
        if (list.length < 2) return;
        const wireColor =
          (global.CineLightDB && typeof global.CineLightDB.getUniverseColor === 'function'
            ? global.CineLightDB.getUniverseColor(ch)
            : null) ||
          CHANNEL_COLORS[ch] ||
          '#38bdf8';

        ctx.save();
        ctx.strokeStyle = wireColor;
        ctx.lineWidth = 2.3;
        ctx.setLineDash([7, 4]);

        for (let i = 0; i < list.length - 1; i++) {
          const a = list[i];
          const b = list[i + 1];
          const za = this.viewMode === '3d' ? (parseFloat(a.z) || 4.0) : 0;
          const zb = this.viewMode === '3d' ? (parseFloat(b.z) || 4.0) : 0;
          const pa = this.worldToScreen(a.x, a.y, za);
          const pb = this.worldToScreen(b.x, b.y, zb);

          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();

          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
          ctx.save();
          ctx.setLineDash([]);
          ctx.translate(mx, my);
          ctx.rotate(ang);
          ctx.fillStyle = wireColor;
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-5, -4.5);
          ctx.lineTo(-5, 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      });
    }

    drawSingleCustomCable(ctx, cable, isSelected, liveCursorWorld = null) {
      const pts = cable.points || [];
      if (!pts.length) return;

      ctx.save();
      ctx.strokeStyle = cable.color || '#38bdf8';
      ctx.lineWidth = isSelected ? 3.8 : 2.8;
      if (cable.style === 'dashed') {
        ctx.setLineDash([8, 5]);
      } else if (cable.style === 'dotted') {
        ctx.setLineDash([3, 4]);
      } else {
        ctx.setLineDash([]);
      }

      const screenPts = pts.map((p) => {
        const w = this.resolveCablePointWorld(p);
        const z = this.viewMode === '3d' ? w.z : 0;
        return this.worldToScreen(w.x, w.y, z);
      });

      if (liveCursorWorld) {
        screenPts.push(this.worldToScreen(liveCursorWorld.x, liveCursorWorld.y, 0));
      }

      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw directional arrows & waypoint nodes
      for (let i = 0; i < screenPts.length; i++) {
        const sp = screenPts[i];
        ctx.fillStyle = cable.color || '#38bdf8';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (i < screenPts.length - 1) {
          const next = screenPts[i + 1];
          const mx = (sp.x + next.x) / 2;
          const my = (sp.y + next.y) / 2;
          const ang = Math.atan2(next.y - sp.y, next.x - sp.x);
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(ang);
          ctx.fillStyle = cable.color || '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-5, -4.5);
          ctx.lineTo(-5, 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    renderDistanceMeasurements(ctx) {
      const items = this.scene.items || [];
      const subjects = items.filter((i) => i.itemType === 'prop' && i.subtype === 'subject');
      if (!subjects.length) return;

      const activeAimer = this.getSelectedItem();
      const aimers = activeAimer && (activeAimer.itemType === 'camera' || activeAimer.itemType === 'fixture')
        ? [activeAimer]
        : items.filter((i) => (i.itemType === 'camera' || (i.itemType === 'fixture' && !i.isSplitter)) && this.isItemVisibleUnderExportFilter(i));

      aimers.forEach((src) => {
        const rotRad = ((parseFloat(src.rotation) || 0) * Math.PI) / 180;
        let closestSubj = null;
        let bestScore = Infinity;

        subjects.forEach((subj) => {
          const dx = subj.x - src.x;
          const dy = subj.y - src.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.2 || dist > 22) return;
          const angleToSubj = Math.atan2(dy, dx);
          const diff = Math.abs(Math.atan2(Math.sin(angleToSubj - rotRad), Math.cos(angleToSubj - rotRad)));
          if (diff <= 0.48 && diff * dist < bestScore) {
            bestScore = diff * dist;
            closestSubj = { subj, dist };
          }
        });

        if (closestSubj) {
          const { subj, dist } = closestSubj;
          const zSrc = this.viewMode === '3d' ? (parseFloat(src.z) || 1.5) : 0;
          const zSub = this.viewMode === '3d' ? (parseFloat(subj.z) || 1.5) : 0;
          const pA = this.worldToScreen(src.x, src.y, zSrc);
          const pB = this.worldToScreen(subj.x, subj.y, zSub);

          ctx.save();
          ctx.strokeStyle = src.itemType === 'camera' ? '#38bdf8' : '#fbbf24';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          ctx.stroke();
          ctx.setLineDash([]);

          const mx = (pA.x + pB.x) / 2;
          const my = (pA.y + pB.y) / 2;
          const label = `${dist.toFixed(1)}m`;
          ctx.font = 'bold 10.5px "Segoe UI", sans-serif';
          const tw = ctx.measureText(label).width + 12;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.beginPath();
          ctx.roundRect(mx - tw / 2, my - 9, tw, 18, 5);
          ctx.fill();
          ctx.strokeStyle = src.itemType === 'camera' ? '#38bdf8' : '#fbbf24';
          ctx.lineWidth = 1.1;
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, mx, my);
          ctx.restore();
        }
      });
    }

    renderSceneItems(ctx) {
      let items = (this.scene.items || []).filter((i) => this.isItemVisibleUnderExportFilter(i));
      const eqList = (this.project && this.project._equipmentList) || [];

      // Depth-sort in 3D mode so closer items render in front of background items
      if (this.viewMode === '3d') {
        items = items.slice().sort((a, b) => {
          const za = parseFloat(a.z) || (a.itemType === 'fixture' ? 4.0 : 1.5);
          const zb = parseFloat(b.z) || (b.itemType === 'fixture' ? 4.0 : 1.5);
          const pa = this.worldToScreen(a.x, a.y, za);
          const pb = this.worldToScreen(b.x, b.y, zb);
          return pa.depth - pb.depth;
        });
      }

      items.forEach((item) => {
        const isSelected = this.selectedItemId === item.id;
        const itemZ = this.viewMode === '3d' ? (parseFloat(item.z) || (item.itemType === 'fixture' ? 4.0 : 1.5)) : 0;
        const screenPos = this.worldToScreen(item.x, item.y, itemZ);
        const itemScale = parseFloat(item.scale) || 1.0;

        // In 3D mode, draw vertical floor stand pole or ceiling drop stem
        if (this.viewMode === '3d' && itemZ > 0.1) {
          const floorPos = this.worldToScreen(item.x, item.y, 0);
          ctx.save();
          const isCeilingHung = item.itemType === 'fixture' && (item.mountType || '').includes('Clamp');
          if (isCeilingHung && this.project.venueConfig) {
            const ceilZ = parseFloat(this.project.venueConfig.height) || 4.5;
            const ceilPos = this.worldToScreen(item.x, item.y, ceilZ);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(ceilPos.x, ceilPos.y);
            ctx.lineTo(screenPos.x, screenPos.y);
            ctx.stroke();
          } else {
            // Floor stand / tripod vertical pole + tripod legs at z=0
            ctx.strokeStyle = item.itemType === 'camera' ? '#38bdf8' : '#cbd5e1';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(floorPos.x, floorPos.y);
            ctx.lineTo(screenPos.x, screenPos.y);
            ctx.stroke();
          }

          // Floor reference shadow dot
          ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
          ctx.beginPath();
          ctx.arc(floorPos.x, floorPos.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        const eqMatch = eqList.find((e) => e.id === item.equipmentId);
        const customImg = item.customImage || (eqMatch && eqMatch.customImage) || null;

        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        const baseZoomScale = Math.max(0.65, Math.min(1.5, this.zoom * 0.92));
        const finalScale = baseZoomScale * itemScale * (this.iconDisplayScale || 1.0) * (screenPos.persp || 1);
        ctx.scale(finalScale, finalScale);

        const isMultiSel = this.multiSelectedIds && this.multiSelectedIds.has(item.id);
        if (isSelected || isMultiSel) {
          ctx.save();
          ctx.strokeStyle = isMultiSel && !isSelected ? '#38bdf8' : (this.isPositionUnlocked ? '#10b981' : '#f59e0b');
          ctx.lineWidth = 2.5;
          if (isMultiSel && !isSelected) ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, 27, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        const rotRad = ((parseFloat(item.rotation) || 0) * Math.PI) / 180;
        ctx.rotate(rotRad);

        // Fixtures & Cameras display their badge; Lighting Accessories drop without a name unless enabled in Show Info
        global.CineLightVectors.drawVectorShape(ctx, item.vectorShape, {
          color: item.color || '#f59e0b',
          badge: item.badge || item.camNumber || item.label || item.name,
          hideBadge: item.itemType === 'accessory',
          mountType: item.mountType,
          camNumber: item.camNumber,
          focalLengthMm: item.focalLengthMm,
          customImage: customImg,
          onImageLoad: () => this.requestRender()
        });

        ctx.restore();
      });
    }

    /**
     * Global On-Canvas Badges (`Show Info ▾` including `Fixture Name` - Update #4 & Section 5)
     */
    renderGlobalInfoPills(ctx) {
      const flags = (this.project && this.project.showInfoFlags) || {};
      const items = (this.scene.items || []).filter((i) => this.isItemVisibleUnderExportFilter(i));
      const lblScale = this.labelDisplayScale || 1.0;

      items.forEach((item) => {
        const pills = [];

        if (item.itemType === 'fixture') {
          const fp = parseInt(item.footprint, 10) || 0;
          const isDmxActive = !item.isSplitter && fp > 0 && item.startAddress >= 1;
          if (flags.fixtureName) {
            pills.push({ text: item.name || item.label || 'Fixture', border: '#e2e8f0', fg: '#ffffff' });
          }
          if (flags.fixtureNum && isDmxActive) {
            pills.push({ text: `#${item.fixtureNum || 1}`, border: '#f59e0b', fg: '#fef08a' });
          }
          if (flags.channel && isDmxActive && item.channel) {
            const chShort = item.channel.replace('Channel ', 'Ch ');
            const chCol =
              (global.CineLightDB && typeof global.CineLightDB.getUniverseColor === 'function'
                ? global.CineLightDB.getUniverseColor(item.channel)
                : null) ||
              CHANNEL_COLORS[item.channel] ||
              '#38bdf8';
            pills.push({ text: chShort, border: chCol, fg: chCol });
          }
          if (flags.address && isDmxActive) {
            const addrText = `Addr: ${item.startAddress}`;
            const borderCol = item.dmxOverflow ? '#ef4444' : '#10b981';
            pills.push({ text: addrText, border: borderCol, fg: item.dmxOverflow ? '#fca5a5' : '#6ee7b7' });
          }
          if (flags.dimmer && !item.isSplitter) {
            pills.push({ text: `Dim: ${item.dimmer ?? 100}%`, border: '#94a3b8', fg: '#f8fafc' });
          }
          if (flags.kelvin && !item.isSplitter) {
            pills.push({ text: item.kelvin || '5600K', border: '#fbbf24', fg: '#fde68a' });
          }
          if (flags.color && !item.isSplitter) {
            pills.push({
              text: item.colorName || item.color || 'Color',
              border: item.color || '#f59e0b',
              fg: '#ffffff',
              swatch: item.color || '#f59e0b'
            });
          }
        } else if (item.itemType === 'camera') {
          if (flags.camNum) {
            pills.push({ text: item.camNumber || 'Cam 1', border: '#38bdf8', fg: '#7dd3fc' });
          }
          if (flags.lensZoom) {
            const shortLens = (item.lensModel || 'GM').replace('mm GM', '');
            pills.push({ text: `${shortLens} @ ${item.focalLengthMm || 35}mm`, border: '#f97316', fg: '#fdba74' });
          }
          if (flags.fStop) {
            pills.push({ text: item.fStop || 'f/2.8', border: '#10b981', fg: '#6ee7b7' });
          }
          if (flags.iso) {
            pills.push({ text: `ISO ${item.iso || 800}`, border: '#a855f7', fg: '#d8b4fe' });
          }
          if (flags.camKelvin) {
            pills.push({ text: item.kelvin || '5600K', border: '#eab308', fg: '#fef08a' });
          }
          if (flags.stLook && item.stLook && (!global.CineApp?.canAccess || global.CineApp.canAccess('paperCameraStLook'))) {
            const st = item.stLook;
            pills.push({
              text: `ST(${st.contrast >= 0 ? '+' + st.contrast : st.contrast}/${st.highlights}/${st.shadows}/S${st.sharpness})`,
              border: '#ec4899',
              fg: '#f9a8d4'
            });
          }
        } else if (item.itemType === 'accessory') {
          if (flags.accessoryName) {
            pills.push({
              text: item.name || item.label || item.badge || 'Accessory',
              border: '#38bdf8',
              fg: '#e0f2fe'
            });
          }
        }

        if (!pills.length) return;

        const itemZ = this.viewMode === '3d' ? (parseFloat(item.z) || 1.5) : 0;
        const pos = this.worldToScreen(item.x, item.y, itemZ);
        const itemScale = (parseFloat(item.scale) || 1.0) * (this.iconDisplayScale || 1.0);

        ctx.save();
        const fontPx = +(9.5 * lblScale).toFixed(1);
        ctx.font = `bold ${fontPx}px "Segoe UI", Tahoma, sans-serif`;
        const pillH = Math.round(16 * lblScale);
        const gapX = 4;
        const gapY = 3;
        const cols = pills.length <= 2 ? pills.length : 2;
        const rows = Math.ceil(pills.length / cols);
        const baseOffsetY = -26 * itemScale - rows * (pillH + gapY);

        for (let r = 0; r < rows; r++) {
          const rowPills = pills.slice(r * cols, r * cols + cols);
          const widths = rowPills.map((p) => ctx.measureText(p.text).width + (p.swatch ? 20 : 12));
          const totalRowW = widths.reduce((a, b) => a + b, 0) + (rowPills.length - 1) * gapX;
          let curX = pos.x - totalRowW / 2;
          const curY = pos.y + baseOffsetY + r * (pillH + gapY);

          rowPills.forEach((p, idx) => {
            const pw = widths[idx];
            ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
            ctx.beginPath();
            ctx.roundRect(curX, curY, pw, pillH, 4);
            ctx.fill();

            ctx.strokeStyle = p.border || '#475569';
            ctx.lineWidth = 1.1;
            ctx.stroke();

            let textX = curX + pw / 2;
            if (p.swatch) {
              ctx.fillStyle = p.swatch;
              ctx.beginPath();
              ctx.arc(curX + 7, curY + pillH / 2, 3.5, 0, Math.PI * 2);
              ctx.fill();
              textX += 4;
            }

            ctx.fillStyle = p.fg || '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.text, textX, curY + pillH / 2 + 0.5);

            curX += pw + gapX;
          });
        }
        ctx.restore();
      });
    }

    renderSelectionGizmos(ctx) {
      const sel = this.getSelectedItem();
      if (!sel || !this.isItemVisibleUnderExportFilter(sel)) return;

      const itemZ = this.viewMode === '3d' ? (parseFloat(sel.z) || 1.5) : 0;
      const itemPos = this.worldToScreen(sel.x, sel.y, itemZ);
      const itemScale = parseFloat(sel.scale) || 1.0;

      if (this.longPressTargetId === sel.id && this.longPressStartMs > 0) {
        const elapsed = performance.now() - this.longPressStartMs;
        const progress = Math.min(1, elapsed / this.longPressDuration);
        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(itemPos.x, itemPos.y, 33 * itemScale, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Show the touch lock status badge on touch screens or when explicitly locked
      if (this.isTouchDevice() || sel.positionLocked || this.longPressTargetId === sel.id) {
        ctx.save();
        const statusText = this.isPositionUnlocked ? '🔓 UNLOCKED (DRAG TO MOVE)' : '🔒 LOCKED (LONG PRESS TO MOVE)';
        ctx.font = 'bold 9px "Segoe UI", sans-serif';
        const sw = ctx.measureText(statusText).width + 12;
        ctx.fillStyle = this.isPositionUnlocked ? 'rgba(6, 78, 59, 0.92)' : 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(itemPos.x - sw / 2, itemPos.y + 28 * itemScale, sw, 16, 4);
        ctx.fill();
        ctx.strokeStyle = this.isPositionUnlocked ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = this.isPositionUnlocked ? '#6ee7b7' : '#fde68a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(statusText, itemPos.x, itemPos.y + 28 * itemScale + 8);
        ctx.restore();
      }

      const handlePos = this.getAimHandleScreenPos(sel);
      if (handlePos) {
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(itemPos.x, itemPos.y);
        ctx.lineTo(handlePos.x, handlePos.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handlePos.x, handlePos.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⟳', handlePos.x, handlePos.y);
        ctx.restore();
      }
    }

    /**
     * Export Ultra-High-Resolution Plot Image (PNG DataURL)
     * Supports 2 modes:
     * - 'current': exact current viewport pan/zoom at 3x ultra-high DPI
     * - 'fit_venue': auto-fitted to exact building bounds + rulers at 3x ultra-high DPI
     */
    exportHighResPlotDataURL(channelFilter = 'all', mode = 'current', orientation = '', options = {}) {
      const prevSelected = this.selectedItemId;
      const prevMulti = new Set(this.multiSelectedIds);
      const prevFilter = this.exportChannelFilter;
      const prevWidth = this.width;
      const prevHeight = this.height;
      const prevDpr = this.dpr;
      const prevZoom = this.zoom;
      const prevPanX = this.panX;
      const prevPanY = this.panY;
      const prevViewMode = this.viewMode;
      const prevCanvasW = this.canvas.width;
      const prevCanvasH = this.canvas.height;

      const exportScale = 3; // 3x Supersampled Ultra-High Resolution
      this.selectedItemId = null;
      this.multiSelectedIds.clear();
      this.exportChannelFilter = channelFilter || 'all';

      const orient = orientation === 'landscape' || orientation === 'portrait' ? orientation : '';
      const fullPagePlot = !!(options && options.fullPagePlot);
      const forPrint = !!(options && options.forPrint);

      if (mode === 'fit_venue' && this.project && this.project.venueConfig) {
        const v = this.project.venueConfig;
        const vw = parseFloat(v.width) || 14;
        const vl = parseFloat(v.length) || 10;
        const worldMinX = -36;
        const worldMaxX = vw * this.ppm + 38;
        const worldMinY = -38;
        const worldMaxY = vl * this.ppm + 26;
        const contentW = worldMaxX - worldMinX;
        const contentH = worldMaxY - worldMinY;

        this.viewMode = '2d';
        const targetZoom = fullPagePlot ? 1.5 : 1.25;
        const padPx = fullPagePlot ? 6 : (forPrint ? 10 : 36);
        let fitW = Math.max(640, Math.ceil(contentW * targetZoom + padPx * 2));
        let fitH = Math.max(440, Math.ceil(contentH * targetZoom + padPx * 2));
        let offX = padPx - Math.round(worldMinX * targetZoom);
        let offY = padPx - Math.round(worldMinY * targetZoom);

        if (!fullPagePlot && !forPrint) {
          const a4Ratio = 1.4142;
          if (orient === 'portrait' && fitH < fitW * a4Ratio) {
            const newH = Math.ceil(fitW * a4Ratio);
            offY += Math.round((newH - fitH) / 2);
            fitH = newH;
          } else if (orient === 'landscape' && fitW < fitH * a4Ratio) {
            const newW = Math.ceil(fitH * a4Ratio);
            offX += Math.round((newW - fitW) / 2);
            fitW = newW;
          }
        }

        this.width = fitW;
        this.height = fitH;
        this.zoom = targetZoom;
        this.panX = offX;
        this.panY = offY;
      } else if (orient && !fullPagePlot && !forPrint) {
        const a4Ratio = 1.4142;
        let curW = prevWidth;
        let curH = prevHeight;
        let shiftX = 0;
        let shiftY = 0;
        if (orient === 'portrait' && curH < curW * a4Ratio) {
          const newH = Math.ceil(curW * a4Ratio);
          shiftY = Math.round((newH - curH) / 2);
          curH = newH;
        } else if (orient === 'landscape' && curW < curH * a4Ratio) {
          const newW = Math.ceil(curH * a4Ratio);
          shiftX = Math.round((newW - curW) / 2);
          curW = newW;
        }
        this.width = curW;
        this.height = curH;
        this.panX = prevPanX + shiftX;
        this.panY = prevPanY + shiftY;
      }

      this.dpr = exportScale;
      this.canvas.width = Math.round(this.width * exportScale);
      this.canvas.height = Math.round(this.height * exportScale);
      this.staticCacheDirty = true;

      this.render();
      const dataUrl = this.canvas.toDataURL('image/png', 1.0);

      // Restore viewport state seamlessly
      this.viewMode = prevViewMode;
      this.width = prevWidth;
      this.height = prevHeight;
      this.dpr = prevDpr;
      this.zoom = prevZoom;
      this.panX = prevPanX;
      this.panY = prevPanY;
      this.canvas.width = prevCanvasW;
      this.canvas.height = prevCanvasH;
      this.selectedItemId = prevSelected;
      this.multiSelectedIds = prevMulti;
      this.exportChannelFilter = prevFilter;
      this.staticCacheDirty = true;
      this.render();

      return dataUrl;
    }
  }

  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
      return `rgba(255, 244, 224, ${alpha})`;
    }
    let c = hex.slice(1);
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  global.StageCanvasEngine = StageCanvasEngine;
})(window);
