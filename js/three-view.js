/**
 * ============================================================================
 * ShamsElber light. DMX — High-Speed 2D-Aligned Black Studio 3D Engine (three-view.js)
 * - Deep Black Studio Aesthetic + Thick Ceiling Iron Grid & Box Truss (2D-aligned look)
 * - Zero-Jump Ceiling-Plane Raycast Dragging (clicking a fixture never jumps forward)
 * - Full Magnetic Snapping in 3D (Ceiling Pipes H/V, Truss, Stands & Accessories)
 * - Properly Oriented & Mounted 3D Lighting Modifiers (Octabox, Parabolic, Fresnel, Grid)
 * - Crisp Floating 2D-Style Name Badges on Fixtures, Cameras & Props
 * ============================================================================
 */
(function (global) {
    'use strict';

    const DEG2RAD = Math.PI / 180;
    const RAD2DEG = 180 / Math.PI;

    function parseKelvinNumber(kVal) {
        if (!kVal) return 5600;
        const n = parseInt(String(kVal).replace(/[^0-9]/g, ''), 10);
        return isNaN(n) || n < 1000 ? 5600 : n;
    }

    function kelvinToRGB(kelvin) {
        const temp = Math.max(1000, Math.min(40000, parseKelvinNumber(kelvin))) / 100;
        let r, g, b;
        if (temp <= 66) {
            r = 255;
            g = 99.4708025861 * Math.log(temp) - 161.1195681661;
            b = temp <= 19 ? 0 : (138.5177312231 * Math.log(temp - 10) - 305.0447927307);
        } else {
            r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
            g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
            b = 255;
        }
        return {
            r: Math.max(0, Math.min(255, r)) / 255,
            g: Math.max(0, Math.min(255, g)) / 255,
            b: Math.max(0, Math.min(255, b)) / 255
        };
    }

    function hexToRGBNorm(hex) {
        if (!hex || typeof hex !== 'string') return null;
        const clean = hex.replace('#', '').trim();
        if (clean.length !== 6) return null;
        const num = parseInt(clean, 16);
        if (isNaN(num)) return null;
        return {
            r: ((num >> 16) & 255) / 255,
            g: ((num >> 8) & 255) / 255,
            b: (num & 255) / 255
        };
    }

    function getApp() {
        return global.CineApp || global.CineLightApp || null;
    }

    function getProjectVenueDims(proj) {
        const vc = proj?.venueConfig || proj?.stage || {};
        return {
            width: Number(vc.width) || 14,
            depth: Number(vc.length || vc.depth) || 10,
            height: Number(vc.height) || 4.5,
            type: vc.type || vc.venueType || 'plateau',
            vc
        };
    }

    function findEquipmentItem(eqId) {
        if (!eqId) return null;
        const ws = getApp()?.getWorkspace?.();
        if (ws && Array.isArray(ws.equipment)) {
            return ws.equipment.find(e => e.id === eqId) || null;
        }
        return null;
    }

    /**
     * Create a crisp 2D-style floating text badge Sprite for 3D items & ceiling pipes
     */
    function createTextBadgeSprite(text, opts = {}) {
        const THREE = global.THREE;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontPx = opts.fontSize || 26;
        const padX = 18;
        const padY = 10;
        ctx.font = `900 ${fontPx}px "Segoe UI", Tahoma, sans-serif`;
        const textW = Math.ceil(ctx.measureText(String(text || '')).width);
        const w = Math.max(64, textW + padX * 2);
        const h = fontPx + padY * 2;
        canvas.width = w;
        canvas.height = h;

        ctx.font = `900 ${fontPx}px "Segoe UI", Tahoma, sans-serif`;
        ctx.fillStyle = opts.bg || 'rgba(5, 8, 14, 0.94)';
        ctx.strokeStyle = opts.border || '#f59e0b';
        ctx.lineWidth = 3;

        const r = 10;
        ctx.beginPath();
        ctx.moveTo(r, 2);
        ctx.lineTo(w - r, 2);
        ctx.quadraticCurveTo(w - 2, 2, w - 2, r);
        ctx.lineTo(w - 2, h - r);
        ctx.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
        ctx.lineTo(r, h - 2);
        ctx.quadraticCurveTo(2, h - 2, 2, h - r);
        ctx.lineTo(2, r);
        ctx.quadraticCurveTo(2, 2, r, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = opts.fg || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(text || ''), w / 2, h / 2 + 1);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        const scaleFactor = opts.worldHeight || 0.42;
        sprite.scale.set((w / h) * scaleFactor, scaleFactor, 1);
        sprite.renderOrder = 999;
        return sprite;
    }

    const ShamsThreeView = {
        active: false,
        container: null,
        canvas: null,
        renderer: null,
        scene: null,
        perspCamera: null,
        orthoCamera: null,
        activeCamera: null,
        ambientLight: null,
        hemiLight: null,
        dirLight: null,
        stageGroup: null,
        itemsGroup: null,
        lightsGroup: null,

        // View & Navigation State (Default aligned with 2D orientation: theta = 0, phi = 30 deg)
        blackoutMode: false,
        viewPreset: 'perspective',
        cameraLensMode: false,
        selectedStageCameraId: null,
        quality: 'high',
        navDragMode: 'orbit', // 'orbit' | 'pan'

        orbit: {
            theta: 0,
            phi: 30 * DEG2RAD,
            radius: 15.5,
            target: { x: 7, y: 0.8, z: 5 }
        },
        currentOrbit: {
            theta: 0,
            phi: 30 * DEG2RAD,
            radius: 15.5,
            target: { x: 7, y: 0.8, z: 5 }
        },

        pointer: {
            isDown: false,
            button: 0,
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
            draggingItem: null,
            draggingAimItem: null,
            dragStarted: false,
            dragPlaneY: 0,
            dragOffsetX: 0,
            dragOffsetZ: 0,
            touchLocked: false,
            longPressTimer: null,
            pointers: new Map(),
            pinchDist: 0
        },

        itemMeshMap: new Map(),
        renderPending: false,

        init() {
            if (this.container) return;
            const viewport = document.getElementById('viewportContainer') || document.querySelector('.viewport-container');
            if (!viewport || !global.THREE) return;

            const overlay = document.createElement('div');
            overlay.id = 'shams3DOverlay';
            overlay.className = 'shams-3d-overlay-container hidden';
            overlay.innerHTML = `
                <div class="shams-3d-hud-top" id="shams3DHudTop">
                    <div class="shams-3d-hud-group">
                        <button type="button" class="shams-3d-btn active" data-preset="perspective" title="منظور 3D مطابق لزاوية الـ 2D">🎥 3D منظور</button>
                        <button type="button" class="shams-3d-btn" data-preset="top" title="مسقط علوي 2.5D">⬆️ علوي 2.5D</button>
                        <button type="button" class="shams-3d-btn" data-preset="front" title="مسقط أمامي">⏹️ أمامي</button>
                        <button type="button" class="shams-3d-btn" data-preset="side" title="مسقط جانبي">📐 جانبي</button>
                    </div>
                    <div class="shams-3d-hud-group">
                        <button type="button" class="shams-3d-btn" id="btn3DNavMode" title="التبديل بين تدوير الكاميرا وتحريك المخطط">🔄 دوران Orbit</button>
                        <button type="button" class="shams-3d-btn" id="btn3DResetCam" title="إعادة ضبط الكاميرا">🎯 توسيط</button>
                        <button type="button" class="shams-3d-btn" id="btn3DToggleFloorMount" title="وضع الكشاف المحدد على الأرض أو رفعه للسقف" onclick="window.CineApp && window.CineApp.toggleSelectedFloorGroundMount && window.CineApp.toggleSelectedFloorGroundMount()">⬇ كشاف أرضي / سقف</button>
                    </div>
                    <div class="shams-3d-hud-group">
                        <button type="button" class="shams-3d-btn blackout-btn" id="btn3DBlackout" title="وضع الاستوديو الأسود الكامل">🌑 إظلام</button>
                        <button type="button" class="shams-3d-btn camview-btn" id="btn3DCamLens" title="معاينة من داخل عدسة الكاميرا">🎬 كادر الكاميرا</button>
                        <select class="shams-3d-select hidden" id="sel3DStageCamera" title="اختر الكاميرا"></select>
                    </div>
                    <div class="shams-3d-hud-group">
                        <button type="button" class="shams-3d-btn" id="btn3DBackTo2D" title="العودة لمخطط 2D">📐 عودة لـ 2D</button>
                    </div>
                </div>

                <div class="shams-3d-cam-frame hidden" id="shams3DCamFrame">
                    <div class="shams-3d-cam-frame-top">
                        <span class="shams-3d-rec-badge"><span class="shams-3d-rec-dot"></span> CAM VIEWFINDER</span>
                        <span id="shams3DCamInfoLabel">35mm | FOV 54.4°</span>
                    </div>
                    <div class="shams-3d-cam-frame-bottom">
                        <span>FULL FRAME 36×24mm</span>
                        <span id="shams3DCamPosLabel">X: 0.0m Y: 0.0m H: 1.5m</span>
                    </div>
                </div>

                <div class="shams-3d-status-bar" id="shams3DStatusBar">
                    🧲 اسحب الكشاف للالتقاط المغناطيسي على المواسير • اسحب الدائرة البرتقالية (⟳) لتوجيه الكشاف • كليك يمين للتحريك
                </div>
            `;

            const canvas = document.createElement('canvas');
            canvas.className = 'shams-3d-canvas';
            overlay.appendChild(canvas);
            viewport.appendChild(overlay);

            this.container = overlay;
            this.canvas = canvas;

            this.setupThreeScene();
            this.bindEvents();
        },

        setupThreeScene() {
            const THREE = global.THREE;
            const renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                powerPreference: 'high-performance'
            });
            renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
            renderer.shadowMap.enabled = false;
            renderer.outputEncoding = THREE.sRGBEncoding;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.1;
            this.renderer = renderer;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x030508); // Deep obsidian black studio background
            this.scene = scene;

            this.perspCamera = new THREE.PerspectiveCamera(44, 16 / 9, 0.08, 250);
            this.orthoCamera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.15, 160);
            this.activeCamera = this.perspCamera;

            this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.55);
            scene.add(this.ambientLight);

            this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x05070b, 0.55);
            this.hemiLight.position.set(0, 22, 0);
            scene.add(this.hemiLight);

            this.dirLight = new THREE.DirectionalLight(0xffffff, 0.72);
            this.dirLight.position.set(12, 26, 16);
            scene.add(this.dirLight);

            this.stageGroup = new THREE.Group();
            this.itemsGroup = new THREE.Group();
            this.lightsGroup = new THREE.Group();

            scene.add(this.stageGroup);
            scene.add(this.itemsGroup);
            scene.add(this.lightsGroup);
        },

        setQuality(qualityLevel) {
            this.quality = String(qualityLevel || 'high').toLowerCase();
            if (!this.renderer) return;
            const dpr = global.devicePixelRatio || 1;
            if (this.quality === 'medium') {
                this.renderer.setPixelRatio(1);
            } else if (this.quality === 'ultra') {
                this.renderer.setPixelRatio(Math.min(dpr, 2.0));
            } else {
                this.renderer.setPixelRatio(Math.min(dpr, 1.5));
            }
            this.requestRender();
        },

        show() {
            this.init();
            if (!this.container) return;
            this.active = true;
            this.container.classList.remove('hidden');
            this.resize();
            this.centerOrbitOnStage(true);
            this.rebuildScene();
        },

        hide() {
            this.active = false;
            if (this.container) {
                this.container.classList.add('hidden');
            }
        },

        resize() {
            if (!this.renderer || !this.container) return;
            const w = Math.max(300, this.container.clientWidth || 800);
            const h = Math.max(240, this.container.clientHeight || 600);
            this.renderer.setSize(w, h, false);
            const aspect = w / h;
            if (this.perspCamera) {
                this.perspCamera.aspect = aspect;
                this.perspCamera.updateProjectionMatrix();
            }
            if (this.orthoCamera) {
                const frustum = this.currentOrbit.radius * 0.58;
                this.orthoCamera.left = -frustum * aspect;
                this.orthoCamera.right = frustum * aspect;
                this.orthoCamera.top = frustum;
                this.orthoCamera.bottom = -frustum;
                this.orthoCamera.updateProjectionMatrix();
            }
            this.requestRender();
        },

        centerOrbitOnStage(snapImmediate = false) {
            const proj = getApp()?.getActiveProject?.();
            const { width, depth, height } = getProjectVenueDims(proj);
            this.orbit.target.x = width / 2;
            this.orbit.target.y = Math.min(1.2, height * 0.22);
            this.orbit.target.z = depth / 2;
            this.orbit.radius = Math.max(width, depth) * 1.18;

            if (snapImmediate) {
                this.currentOrbit.theta = this.orbit.theta;
                this.currentOrbit.phi = this.orbit.phi;
                this.currentOrbit.radius = this.orbit.radius;
                this.currentOrbit.target.x = this.orbit.target.x;
                this.currentOrbit.target.y = this.orbit.target.y;
                this.currentOrbit.target.z = this.orbit.target.z;
            }
            this.requestRender();
        },

        clearGroup(group) {
            if (!group) return;
            while (group.children.length > 0) {
                group.remove(group.children[0]);
            }
        },

        rebuildScene() {
            if (!this.scene || !global.THREE || !this.active) return;
            const app = getApp();
            const proj = app?.getActiveProject?.();
            const sceneObj = app?.getActiveScene?.();
            if (!proj || !sceneObj) return;

            app?.getCanvasEngine?.()?.syncAllAccessories?.();

            this.clearGroup(this.stageGroup);
            this.clearGroup(this.itemsGroup);
            this.clearGroup(this.lightsGroup);
            this.itemMeshMap.clear();

            if (this.blackoutMode) {
                this.ambientLight.intensity = 0.1;
                this.hemiLight.intensity = 0.08;
                this.dirLight.intensity = 0.08;
                this.scene.background.setHex(0x010204);
            } else {
                this.ambientLight.intensity = 0.58;
                this.hemiLight.intensity = 0.52;
                this.dirLight.intensity = 0.72;
                this.scene.background.setHex(0x030508);
            }

            this.buildVenueArchitecture(proj);
            this.buildStageItems(proj, sceneObj);
            this.updateStageCameraDropdown(sceneObj);
            this.requestRender();
        },

        buildVenueArchitecture(proj) {
            const THREE = global.THREE;
            const { width: W, depth: D, height: H, type: venueType, vc } = getProjectVenueDims(proj);

            // 1. Matte Obsidian Black Stage Floor Deck (Matches 2D Studio Canvas!)
            const deckThickness = 0.24;
            const deckGeo = new THREE.BoxGeometry(W, deckThickness, D);
            const deckMat = new THREE.MeshStandardMaterial({
                color: 0x070a10,
                roughness: 0.82,
                metalness: 0.12
            });
            const deckMesh = new THREE.Mesh(deckGeo, deckMat);
            deckMesh.position.set(W / 2, -deckThickness / 2, D / 2);
            deckMesh.name = 'stageFloor';
            this.stageGroup.add(deckMesh);

            // Crisp 2D-Style Stage Perimeter Border
            const borderPts = [
                new THREE.Vector3(0, 0.015, 0), new THREE.Vector3(W, 0.015, 0),
                new THREE.Vector3(W, 0.015, 0), new THREE.Vector3(W, 0.015, D),
                new THREE.Vector3(W, 0.015, D), new THREE.Vector3(0, 0.015, D),
                new THREE.Vector3(0, 0.015, D), new THREE.Vector3(0, 0.015, 0)
            ];
            const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
            this.stageGroup.add(new THREE.LineSegments(
                borderGeo,
                new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.85 })
            ));

            // 0.5m Sub-Grid + 1.0m Main Grid Lines on Black Floor (Exact 2D Look!)
            const subGridPts = [];
            for (let x = 0.5; x < W; x += 1) {
                subGridPts.push(new THREE.Vector3(x, 0.004, 0), new THREE.Vector3(x, 0.004, D));
            }
            for (let z = 0.5; z < D; z += 1) {
                subGridPts.push(new THREE.Vector3(0, 0.004, z), new THREE.Vector3(W, 0.004, z));
            }
            this.stageGroup.add(new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(subGridPts),
                new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.55 })
            ));

            const mainGridPts = [];
            for (let x = 1; x < W; x += 1) {
                mainGridPts.push(new THREE.Vector3(x, 0.006, 0), new THREE.Vector3(x, 0.006, D));
            }
            for (let z = 1; z < D; z += 1) {
                mainGridPts.push(new THREE.Vector3(0, 0.006, z), new THREE.Vector3(W, 0.006, z));
            }
            this.stageGroup.add(new THREE.LineSegments(
                new THREE.BufferGeometry().setFromPoints(mainGridPts),
                new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.78 })
            ));

            // 4 Heavy Black Steel Corner Columns
            const colMat = new THREE.MeshStandardMaterial({ color: 0x1e2530, metalness: 0.75, roughness: 0.32 });
            [[0, 0], [W, 0], [W, D], [0, D]].forEach(([cx, cz]) => {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, H, 12), colMat);
                post.position.set(cx, H / 2, cz);
                this.stageGroup.add(post);
            });

            // Venue-specific Overhead Rigging (Much Thicker Dark Steel Iron Pipes & Truss!)
            if (venueType === 'plateau') {
                const gc = vc.gridConfig || {};
                const hPipeMat = new THREE.MeshStandardMaterial({ color: 0x222938, metalness: 0.78, roughness: 0.28 });
                const vPipeMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, metalness: 0.82, roughness: 0.25 });
                const clampNodeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.7, roughness: 0.3 });

                const hPipes = Array.isArray(gc.horizontalPipes) && gc.horizontalPipes.length
                    ? gc.horizontalPipes
                    : [2, 4, 6, 8].filter(y => y < D);
                const vPipes = Array.isArray(gc.verticalPipes) && gc.verticalPipes.length
                    ? gc.verticalPipes
                    : [2, 5, 8, 11].filter(x => x < W);

                const gridZ = H - 0.25;
                const pipeRadius = 0.092; // Thick, heavy studio ceiling iron pipe!

                hPipes.forEach((zPos, idx) => {
                    const pz = Number(zPos) || 2;
                    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(pipeRadius, pipeRadius, W, 14), hPipeMat);
                    pipe.rotation.z = Math.PI / 2;
                    pipe.position.set(W / 2, gridZ, pz);
                    this.stageGroup.add(pipe);

                    // Top highlight line along horizontal pipe (matches 2D amber dashed line)
                    const lineGeo = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(0, gridZ + pipeRadius + 0.01, pz),
                        new THREE.Vector3(W, gridZ + pipeRadius + 0.01, pz)
                    ]);
                    this.stageGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf59e0b })));

                    // H1, H2... Badge on right edge (matches 2D!)
                    const hBadge = createTextBadgeSprite(`H${idx + 1}`, {
                        border: '#f59e0b',
                        fg: '#fbbf24',
                        worldHeight: 0.36
                    });
                    hBadge.position.set(W + 0.42, gridZ, pz);
                    this.stageGroup.add(hBadge);
                });

                vPipes.forEach((xPos, idx) => {
                    const px = Number(xPos) || 2;
                    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(pipeRadius, pipeRadius, D, 14), vPipeMat);
                    pipe.rotation.x = Math.PI / 2;
                    pipe.position.set(px, gridZ + pipeRadius * 1.15, D / 2);
                    this.stageGroup.add(pipe);

                    // Top highlight line along vertical pipe (matches 2D cyan dashed line)
                    const lineGeo = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(px, gridZ + pipeRadius * 2.2, 0),
                        new THREE.Vector3(px, gridZ + pipeRadius * 2.2, D)
                    ]);
                    this.stageGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8 })));

                    // V1, V2... Badge on front edge (matches 2D!)
                    const vBadge = createTextBadgeSprite(`V${idx + 1}`, {
                        border: '#38bdf8',
                        fg: '#38bdf8',
                        worldHeight: 0.36
                    });
                    vBadge.position.set(px, gridZ, D + 0.42);
                    this.stageGroup.add(vBadge);
                });

                // Heavy Coupler Clamps at every Pipe Intersection
                vPipes.forEach(xPos => {
                    hPipes.forEach(zPos => {
                        const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), clampNodeMat);
                        coupler.position.set(Number(xPos) || 2, gridZ + pipeRadius * 0.6, Number(zPos) || 2);
                        this.stageGroup.add(coupler);
                    });
                });
            } else if (venueType === 'truss') {
                const tc = vc.trussConfig || {};
                const tw = Number(tc.trussWidth) || (W - 3);
                const td = Number(tc.trussDepth) || (D - 2.5);
                const hz = Number(tc.trimHeight) || (H - 0.35);
                const thickness = Math.max(0.6, Math.min(3.0, Number(tc.trussThickness) || 1.15));
                const leftX = (W - tw) / 2;
                const topZ = (D - td) / 2;

                // 4 Heavy Black Corner Truss Towers
                [[leftX, topZ], [leftX + tw, topZ], [leftX + tw, topZ + td], [leftX, topZ + td]].forEach(([tx, tz]) => {
                    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.34 * thickness, hz, 0.34 * thickness), colMat);
                    tower.position.set(tx, hz / 2, tz);
                    this.stageGroup.add(tower);
                });

                this.buildBoxTruss3D({ x: leftX, y: topZ, length: tw, orientation: 'horizontal', heightZ: hz, thickness }, H);
                this.buildBoxTruss3D({ x: leftX, y: topZ + td, length: tw, orientation: 'horizontal', heightZ: hz, thickness }, H);
                this.buildBoxTruss3D({ x: leftX, y: topZ, length: td, orientation: 'vertical', heightZ: hz, thickness }, H);
                this.buildBoxTruss3D({ x: leftX + tw, y: topZ, length: td, orientation: 'vertical', heightZ: hz, thickness }, H);

                // Intersecting Steel Crossbars inside Truss
                const barMat = new THREE.MeshStandardMaterial({ color: 0x262f3f, metalness: 0.82, roughness: 0.25 });
                (tc.crossbars || []).forEach(cb => {
                    const barRad = 0.088 * thickness;
                    if (cb.orientation === 'horizontal') {
                        const zPos = topZ + (Number(cb.position) || 2);
                        const bar = new THREE.Mesh(new THREE.CylinderGeometry(barRad, barRad, tw, 12), barMat);
                        bar.rotation.z = Math.PI / 2;
                        bar.position.set(leftX + tw / 2, hz, zPos);
                        this.stageGroup.add(bar);
                    } else {
                        const xPos = leftX + (Number(cb.position) || 2);
                        const bar = new THREE.Mesh(new THREE.CylinderGeometry(barRad, barRad, td, 12), barMat);
                        bar.rotation.x = Math.PI / 2;
                        bar.position.set(xPos, hz, topZ + td / 2);
                        this.stageGroup.add(bar);
                    }
                });
            } else if (venueType === 'church') {
                const cc = vc.churchConfig || {};
                const colPairs = cc.columnsPerSide !== undefined ? Number(cc.columnsPerSide) : (Number(vc.churchColumns) || 5);
                const altarDepth = Number(cc.sanctuaryDepth || vc.altarDepth) || 5.0;
                const sideOffset = Number(cc.sideAisleOffset) || 2.6;
                const centerAisleW = Number(cc.centerAisleWidth) || 2.4;
                const pewRows = cc.pewRows !== undefined ? Math.max(0, parseInt(cc.pewRows, 10)) : 6;
                const pewGap = Math.max(0.4, parseFloat(cc.pewGap) || 1.8);
                const pewAltarOffset = Math.max(0.2, parseFloat(cc.pewAltarOffset ?? 1.8));

                const altarMesh = new THREE.Mesh(
                    new THREE.BoxGeometry(W * 0.76, 0.5, altarDepth),
                    new THREE.MeshStandardMaterial({ color: 0x161e2e, roughness: 0.65 })
                );
                altarMesh.position.set(W / 2, 0.25, altarDepth / 2);
                this.stageGroup.add(altarMesh);

                // 3D Church Pews / Chairs
                if (pewRows > 0) {
                    const leftPewX = sideOffset + 0.6;
                    const pewW = Math.max(1.0, W / 2 - centerAisleW / 2 - leftPewX - 0.3);
                    const leftCenterX = leftPewX + pewW / 2;
                    const rightCenterX = W / 2 + centerAisleW / 2 + 0.3 + pewW / 2;
                    const pewMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.7, metalness: 0.1 });
                    const seatGeo = new THREE.BoxGeometry(pewW, 0.45, 0.52);
                    const backGeo = new THREE.BoxGeometry(pewW, 0.48, 0.1);
                    for (let r = 0; r < pewRows; r++) {
                        const pz = altarDepth + pewAltarOffset + r * pewGap + 0.26;
                        if (pz + 0.25 > D) break;
                        [leftCenterX, rightCenterX].forEach(px => {
                            const seat = new THREE.Mesh(seatGeo, pewMat);
                            seat.position.set(px, 0.225, pz);
                            this.stageGroup.add(seat);
                            const back = new THREE.Mesh(backGeo, pewMat);
                            back.position.set(px, 0.65, pz + 0.21);
                            this.stageGroup.add(back);
                        });
                    }
                }

                const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.3 });
                const colStart = altarDepth + 1.4;
                const colSpan = Math.max(1, D - colStart - 1.4);
                const stepZ = colPairs > 1 ? colSpan / (colPairs - 1) : 0;
                for (let i = 0; i < colPairs; i++) {
                    const zPos = colStart + i * stepZ;
                    [sideOffset, W - sideOffset].forEach(xPos => {
                        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, H, 16), pillarMat);
                        col.position.set(xPos, H / 2, zPos);
                        this.stageGroup.add(col);
                    });
                }

                // Thick Church Overhead Mounting Bars
                const barMat = new THREE.MeshStandardMaterial({ color: 0x222938, metalness: 0.8, roughness: 0.25 });
                (cc.mountPipesY || [3.5, 6.5, 10.5, 14.5, 18.5]).forEach(py => {
                    if (py <= D) {
                        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, W * 0.68, 12), barMat);
                        bar.rotation.z = Math.PI / 2;
                        bar.position.set(W / 2, H - 0.3, py);
                        this.stageGroup.add(bar);
                    }
                });
            }
        },

        buildBoxTruss3D(t, defaultH) {
            const THREE = global.THREE;
            const len = Number(t.length) || 8;
            const isVert = t.orientation === 'vertical';
            const hz = Number(t.heightZ) || (defaultH - 0.3);
            const startX = Number(t.x) || 1.5;
            const startZ = Number(t.y) || 1.5;
            const th = Number(t.thickness) || 1.15;

            const trussGroup = new THREE.Group();
            const chordMat = new THREE.MeshStandardMaterial({ color: 0x1e2636, metalness: 0.82, roughness: 0.25 });
            const braceMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75, roughness: 0.3 });
            const span = 0.19 * th;
            const chordRad = 0.052 * th;
            const offsets = [-span, span];

            offsets.forEach(oy => {
                offsets.forEach(oz => {
                    const chord = new THREE.Mesh(new THREE.CylinderGeometry(chordRad, chordRad, len, 10), chordMat);
                    chord.rotation.z = Math.PI / 2;
                    chord.position.set(len / 2, oy, oz);
                    trussGroup.add(chord);
                });
            });

            // Thick 3D Diagonal Webbing Tubes
            const steps = Math.max(4, Math.floor(len * 1.6));
            const stepLen = len / steps;
            for (let i = 0; i < steps; i++) {
                const xMid = (i + 0.5) * stepLen;
                const diagLen = Math.hypot(stepLen, span * 2);
                const ang = Math.atan2(span * 2, stepLen) * (i % 2 === 0 ? 1 : -1);

                [-span, span].forEach(zSide => {
                    const brace = new THREE.Mesh(new THREE.CylinderGeometry(chordRad * 0.55, chordRad * 0.55, diagLen, 6), braceMat);
                    brace.rotation.z = Math.PI / 2 - ang;
                    brace.position.set(xMid, 0, zSide);
                    trussGroup.add(brace);
                });
            }

            if (isVert) {
                trussGroup.rotation.y = -Math.PI / 2;
                trussGroup.position.set(startX, hz, startZ);
            } else {
                trussGroup.position.set(startX, hz, startZ);
            }
            this.stageGroup.add(trussGroup);
        },

        buildStageItems(proj, sceneObj) {
            const items = Array.isArray(sceneObj.items) ? sceneObj.items : [];
            const selectedId = getApp()?.getCanvasEngine?.()?.selectedItemId || null;

            // Find which fixtures have an accessory attached so we hide their open barn doors cleanly
            const fixturesWithAcc = new Set();
            items.forEach(it => {
                if (it.itemType === 'accessory' && it.visible !== false) {
                    const pid = it.attachedTo || it.attachedToFixtureId;
                    if (pid) fixturesWithAcc.add(pid);
                }
            });

            items.forEach(item => {
                if (item.visible === false || item.itemType === 'accessory') return;
                if (item.itemType === 'fixture') {
                    this.buildFixture3D(item, proj, item.id === selectedId, fixturesWithAcc.has(item.id));
                } else if (item.itemType === 'camera') {
                    this.buildCamera3D(item, item.id === selectedId);
                } else {
                    this.buildProp3D(item, item.id === selectedId);
                }
            });

            items.forEach(item => {
                if (item.visible === false) return;
                if (item.itemType === 'accessory') {
                    this.buildAccessory3D(item, items, item.id === selectedId);
                }
            });
        },

        computeFixtureAimTarget3D(item) {
            const fx = Number(item.x) || 0;
            const fy = Number(item.z) !== undefined ? Number(item.z) : 4.2;
            const fz = Number(item.y) || 0;
            const rotRad = (Number(item.rotation) || 0) * DEG2RAD;
            const horizDist = Math.max(0.5, Number(item.beamLength) || 4.0);
            const tx = fx + Math.cos(rotRad) * horizDist;
            const tz = fz + Math.sin(rotRad) * horizDist;
            const isFloor = item.mountType === 'Floor / Ground' || !!item.floorMounted || fy <= 1.2;
            const defaultTy = isFloor ? Math.max(0.6, fy + 0.6) : 0;
            const ty = item.beamTargetZ !== undefined && item.beamTargetZ !== null
                ? Math.max(0, Number(item.beamTargetZ))
                : defaultTy;
            return { fx, fy, fz, tx, ty, tz, horizDist };
        },

        buildFixture3D(item, proj, isSelected, hasAttachedAccessory = false) {
            const THREE = global.THREE;
            const eq = findEquipmentItem(item.equipmentId);
            const { fx, fy, fz, tx, ty, tz } = this.computeFixtureAimTarget3D(item);

            const dimmerPct = item.dimmer !== undefined ? Number(item.dimmer) : 100;
            const isOn = !item.isSplitter && item.powerOn !== false && dimmerPct > 0;
            const showBeam = proj?.showInfoFlags?.lightBeam !== false;
            const kRGB = kelvinToRGB(item.kelvin || eq?.defaultKelvin || '5600K');
            const hexVal = (item.color && String(item.color).startsWith('#'))
                ? item.color
                : ((item.colorName && String(item.colorName).startsWith('#')) ? item.colorName : (item.colorHex || ''));
            const customHex = (hexVal && hexVal.toLowerCase() !== '#ffffff' && hexVal.toLowerCase() !== '#fff3d6')
                ? hexToRGBNorm(hexVal)
                : null;

            const lightColor = customHex
                ? new THREE.Color(customHex.r, customHex.g, customHex.b)
                : new THREE.Color(kRGB.r, kRGB.g, kRGB.b);

            const root = new THREE.Group();
            root.position.set(fx, fy, fz);
            root.userData = { itemId: item.id, itemType: 'fixture' };

            // Matte Black Yoke Arms & Heavy C-Clamp
            const metalMat = new THREE.MeshStandardMaterial({
                color: isSelected ? 0xf59e0b : 0x161c26,
                metalness: 0.78,
                roughness: 0.28
            });
            const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12), metalMat);
            clamp.position.set(0, 0.36, 0);
            root.add(clamp);

            const yokeTop = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.055, 0.065), metalMat);
            yokeTop.position.set(0, 0.26, 0);
            root.add(yokeTop);

            [-0.24, 0.24].forEach(xOff => {
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.28, 0.065), metalMat);
                arm.position.set(xOff, 0.12, 0);
                root.add(arm);
            });

            // Floor Stand Pole + 3 Tripod Legs if mounted on a Floor Stand or placed on Floor
            const isFloorMount = item.mountType === 'Floor / Ground' || !!item.floorMounted;
            const isFloorStand = (item.mountType || '').includes('Stand') || !!item.standLocked;
            if (isFloorStand && fy > 0.3) {
                const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, fy, 10), metalMat);
                standPole.position.set(0, -fy / 2, 0);
                root.add(standPole);

                [0, 120, 240].forEach(deg => {
                    const a = deg * DEG2RAD;
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 8), metalMat);
                    leg.position.set(Math.cos(a) * 0.24, -fy + 0.18, Math.sin(a) * 0.24);
                    leg.rotation.z = -Math.cos(a) * 0.55;
                    leg.rotation.x = Math.sin(a) * 0.55;
                    root.add(leg);
                });
            } else if (isFloorMount) {
                const floorBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.05, 16), metalMat);
                floorBase.position.set(0, -0.22, 0);
                root.add(floorBase);
            }

            // Floating 2D-Style Name Badge above Fixture!
            const badgeText = item.badge || item.label || item.name || 'Fixture';
            const badgeSprite = createTextBadgeSprite(badgeText, {
                bg: 'rgba(5, 8, 14, 0.95)',
                border: isSelected ? '#10b981' : '#f59e0b',
                fg: '#ffffff',
                worldHeight: 0.38
            });
            badgeSprite.position.set(0, 0.64, 0);
            root.add(badgeSprite);

            // Matte Carbon Black Head Group (+Z = Front Lens)
            const headGroup = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({
                color: isSelected ? 0x1e293b : 0x0b0e14,
                metalness: 0.6,
                roughness: 0.35
            });
            const darkTrimMat = new THREE.MeshStandardMaterial({
                color: 0x05070b,
                metalness: 0.75,
                roughness: 0.28,
                side: THREE.DoubleSide
            });

            const shape = String(item.vectorShape || eq?.vectorShape || '');
            if (shape.includes('panel') || shape.includes('p60') || shape.includes('ld150')) {
                const housing = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.44, 0.14), bodyMat);
                headGroup.add(housing);

                const diffuser = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.58, 0.36),
                    new THREE.MeshBasicMaterial({ color: isOn ? lightColor : 0x1e293b })
                );
                diffuser.position.set(0, 0, 0.075);
                headGroup.add(diffuser);

                if (!hasAttachedAccessory) {
                    const topFlap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.15, 0.016), darkTrimMat);
                    topFlap.position.set(0, 0.26, 0.13);
                    topFlap.rotation.x = -0.45;
                    headGroup.add(topFlap);

                    const botFlap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.15, 0.016), darkTrimMat);
                    botFlap.position.set(0, -0.26, 0.13);
                    botFlap.rotation.x = 0.45;
                    headGroup.add(botFlap);
                }
            } else if (shape.includes('tube') || shape.includes('pavotube') || shape.includes('tl')) {
                const tube = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.055, 0.055, 1.25, 16),
                    new THREE.MeshBasicMaterial({ color: isOn ? lightColor : 0x334155 })
                );
                tube.rotation.z = Math.PI / 2;
                headGroup.add(tube);

                [-0.62, 0.62].forEach(endX => {
                    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.09, 12), darkTrimMat);
                    cap.rotation.z = Math.PI / 2;
                    cap.position.set(endX, 0, 0);
                    headGroup.add(cap);
                });
            } else {
                // Matte Black Cylindrical COB / Fresnel Spot with Gold/Amber Accent Ring
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.44, 20), bodyMat);
                barrel.rotation.x = Math.PI / 2;
                headGroup.add(barrel);

                const accentRing = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.195, 0.195, 0.03, 20),
                    new THREE.MeshBasicMaterial({ color: isSelected ? 0x10b981 : 0xf59e0b })
                );
                accentRing.rotation.x = Math.PI / 2;
                accentRing.position.set(0, 0, 0.14);
                headGroup.add(accentRing);

                const frontLens = new THREE.Mesh(
                    new THREE.CircleGeometry(0.155, 24),
                    new THREE.MeshBasicMaterial({ color: isOn ? lightColor : 0x1e293b })
                );
                frontLens.position.set(0, 0, 0.225);
                headGroup.add(frontLens);

                if (!hasAttachedAccessory) {
                    const flapGeo = new THREE.BoxGeometry(0.24, 0.13, 0.014);
                    const topDoor = new THREE.Mesh(flapGeo, darkTrimMat);
                    topDoor.position.set(0, 0.2, 0.27);
                    topDoor.rotation.x = -0.52;
                    headGroup.add(topDoor);

                    const botDoor = new THREE.Mesh(flapGeo, darkTrimMat);
                    botDoor.position.set(0, -0.2, 0.27);
                    botDoor.rotation.x = 0.52;
                    headGroup.add(botDoor);

                    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.014), darkTrimMat);
                    leftDoor.position.set(-0.2, 0, 0.27);
                    leftDoor.rotation.y = 0.52;
                    headGroup.add(leftDoor);

                    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.014), darkTrimMat);
                    rightDoor.position.set(0.2, 0, 0.27);
                    rightDoor.rotation.y = -0.52;
                    headGroup.add(rightDoor);
                }
            }

            root.add(headGroup);
            this.itemsGroup.add(root);

            const worldAimTarget = new THREE.Vector3(tx, ty, tz);
            headGroup.lookAt(worldAimTarget);

            const beamGroup = new THREE.Group();
            this.lightsGroup.add(beamGroup);

            const entry = { root, headGroup, beamGroup, item, lightColor, isOn, showBeam, hasCustomColor: !!customHex, dimmerPct, eq, isSelected };
            this.itemMeshMap.set(item.id, entry);
            this.updateFixtureBeamGeometry(entry);
        },

        updateFixtureBeamGeometry(entry) {
            const THREE = global.THREE;
            const { item, headGroup, beamGroup, lightColor, isOn, showBeam, hasCustomColor, dimmerPct, eq, isSelected } = entry;
            this.clearGroup(beamGroup);

            const { fx, fy, fz, tx, ty, tz } = this.computeFixtureAimTarget3D(item);
            entry.root.position.set(fx, fy, fz);
            headGroup.lookAt(new THREE.Vector3(tx, ty, tz));

            if (!isOn || showBeam === false) return;

            const beamDeg = Math.max(10, Math.min(115, Number(item.beamAngle) || Number(eq?.beamAngle) || 40));
            const beamRad = (beamDeg * DEG2RAD) / 2;
            const beamVec = new THREE.Vector3(tx - fx, ty - fy, tz - fz);
            const beamLen = Math.max(0.5, beamVec.length());
            const endRadius = Math.min(5.5, Math.tan(beamRad) * beamLen);

            // Volumetric 3D Cone (vivid color support)
            const coneGeo = new THREE.ConeGeometry(endRadius, beamLen, 24, 1, true);
            const baseConeAlpha = hasCustomColor ? (this.blackoutMode ? 0.34 : 0.24) : (this.blackoutMode ? 0.25 : 0.14);
            const coneMat = new THREE.MeshBasicMaterial({
                color: lightColor,
                transparent: true,
                opacity: Math.min(0.42, (dimmerPct / 100) * baseConeAlpha),
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const coneMesh = new THREE.Mesh(coneGeo, coneMat);
            coneMesh.position.set((fx + tx) / 2, (fy + ty) / 2, (fz + tz) / 2);

            const dirNorm = beamVec.clone().normalize();
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirNorm);
            coneMesh.quaternion.copy(quat);
            beamGroup.add(coneMesh);

            // Light Pool Hotspot (on Floor when aimed down, or in 3D space when aimed up from floor)
            const poolGeo = new THREE.CircleGeometry(Math.max(0.45, endRadius * 0.85), 28);
            const poolMat = new THREE.MeshBasicMaterial({
                color: lightColor,
                transparent: true,
                opacity: Math.min(0.55, (dimmerPct / 100) * (hasCustomColor ? 0.44 : 0.32)),
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const poolMesh = new THREE.Mesh(poolGeo, poolMat);
            if (ty <= 0.15) {
                poolMesh.rotation.x = -Math.PI / 2;
                poolMesh.position.set(tx, 0.015, tz);
            } else {
                poolMesh.position.set(tx, ty, tz);
                poolMesh.lookAt(new THREE.Vector3(fx, fy, fz));
            }
            beamGroup.add(poolMesh);

            // Interactive 3D Aim Handle Ring when Selected!
            if (isSelected) {
                const aimY = Math.max(0.04, ty);
                const aimLineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(fx, fy, fz),
                    new THREE.Vector3(tx, aimY, tz)
                ]);
                beamGroup.add(new THREE.Line(
                    aimLineGeo,
                    new THREE.LineBasicMaterial({ color: 0xf59e0b })
                ));

                const handleMesh = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20),
                    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
                );
                handleMesh.position.set(tx, aimY, tz);
                handleMesh.userData = { aimForItemId: item.id };
                beamGroup.add(handleMesh);
            }
        },

        /**
         * Properly Oriented & Mounted 3D Lighting Accessories (Octabox, Parabolic, Fresnel, Tube Grid)
         * Point 4 Fix: Checks both `attachedTo` and `attachedToFixtureId` (plus nearest fixture fallback)
         * and rotates the ConeGeometry with `+Math.PI / 2` so the speedring attaches to the fixture lens
         * and the wide octagonal/parabolic mouth opens forward along the beam!
         */
        buildAccessory3D(accItem, allItems, isSelected) {
            const THREE = global.THREE;
            const parentId = accItem.attachedTo || accItem.attachedToFixtureId;
            let parent = parentId
                ? allItems.find(i => i.id === parentId && i.itemType === 'fixture')
                : null;

            // Auto-detect closest fixture if placed in front of one in 2D
            if (!parent && !accItem.attachmentUnlocked) {
                let bestD = 0.95;
                allItems.forEach(i => {
                    if (i.itemType !== 'fixture' || i.isSplitter) return;
                    const d = Math.hypot((Number(accItem.x) || 0) - (Number(i.x) || 0), (Number(accItem.y) || 0) - (Number(i.y) || 0));
                    if (d < bestD) {
                        bestD = d;
                        parent = i;
                    }
                });
            }

            const accGroup = new THREE.Group();
            accGroup.userData = { itemId: accItem.id, itemType: 'accessory' };

            const outerBlackMat = new THREE.MeshStandardMaterial({
                color: isSelected ? 0x0284c7 : 0x090c12,
                roughness: 0.45,
                metalness: 0.55,
                side: THREE.DoubleSide
            });
            const speedringMat = new THREE.MeshStandardMaterial({
                color: 0xf59e0b,
                roughness: 0.25,
                metalness: 0.85
            });

            const parentEntry = parent ? this.itemMeshMap.get(parent.id) : null;
            const diffColor = parentEntry && parentEntry.isOn ? parentEntry.lightColor : new THREE.Color(0xf8fafc);
            const diffMat = new THREE.MeshBasicMaterial({
                color: diffColor,
                transparent: true,
                opacity: 0.88,
                side: THREE.DoubleSide
            });

            const eqId = String(accItem.equipmentId || accItem.vectorShape || '').toLowerCase();
            if (eqId.includes('octa') || eqId.includes('para')) {
                const radius = eqId.includes('120') ? 0.62 : 0.46;
                const depth = eqId.includes('para') ? 0.52 : 0.36;
                const segments = eqId.includes('para') ? 16 : 8;

                // Bowens Mount Speedring at z = 0
                const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16), speedringMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.z = 0.02;
                accGroup.add(ring);

                // +Math.PI / 2 puts apex at z=0 (fixture lens) and wide mouth at z=+depth (front)!
                const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, depth, segments, 1, true), outerBlackMat);
                cone.rotation.x = Math.PI / 2;
                cone.position.z = depth / 2 + 0.03;
                accGroup.add(cone);

                // Glowing Front Diffuser Cloth + Grid Rim
                const frontFace = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, segments), diffMat);
                frontFace.position.z = depth + 0.032;
                accGroup.add(frontFace);
            } else if (eqId.includes('fresnel')) {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.24, 20), outerBlackMat);
                barrel.rotation.x = Math.PI / 2;
                barrel.position.z = 0.12;
                accGroup.add(barrel);

                const lens = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), diffMat);
                lens.position.z = 0.242;
                accGroup.add(lens);
            } else {
                // Tube Eggcrate Grid
                const gridBox = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.15, 0.12), outerBlackMat);
                gridBox.position.z = 0.08;
                accGroup.add(gridBox);
            }

            const proj = getApp()?.getActiveProject?.();
            if (proj?.showInfoFlags?.accessoryName) {
                const accBadge = createTextBadgeSprite(accItem.name || accItem.label || accItem.badge || 'Accessory', {
                    bg: 'rgba(5, 8, 14, 0.95)',
                    border: '#38bdf8',
                    fg: '#e0f2fe',
                    worldHeight: 0.32
                });
                accBadge.position.set(0, 0.56, 0.25);
                accGroup.add(accBadge);
            }

            if (parentEntry) {
                // Attach directly onto the front mount of the fixture's 3D headGroup!
                accGroup.position.set(0, 0, 0.21);
                parentEntry.headGroup.add(accGroup);
                this.itemMeshMap.set(accItem.id, { root: accGroup, item: accItem, attachedToParentId: parent.id });
            } else {
                const ax = Number(accItem.x) || 0;
                const ay = Number(accItem.z) || 2.0;
                const az = Number(accItem.y) || 0;
                const rotRad = (Number(accItem.rotation) || 0) * DEG2RAD;
                accGroup.position.set(ax, ay, az);
                accGroup.lookAt(new THREE.Vector3(ax + Math.cos(rotRad) * 2, ay, az + Math.sin(rotRad) * 2));
                this.itemsGroup.add(accGroup);
                this.itemMeshMap.set(accItem.id, { root: accGroup, item: accItem, attachedToParentId: null });
            }
        },

        buildCamera3D(item, isSelected) {
            const THREE = global.THREE;
            const cx = Number(item.x) || 0;
            const rawZ = Number(item.z);
            const cy = Number.isFinite(rawZ) ? rawZ : 1.5;
            const cz = Number(item.y) || 0;
            const rotRad = (Number(item.rotation) || 0) * DEG2RAD;
            const focalMm = Math.max(12, Math.min(200, Number(item.focalLengthMm) || 35));
            const fovRange = Math.max(2, Number(item.fovDistance || item.fovRange) || 5.0);
            const hFovRad = 2 * Math.atan(18 / focalMm);

            const camGroup = new THREE.Group();
            camGroup.position.set(cx, cy, cz);
            camGroup.userData = { itemId: item.id, itemType: 'camera' };
            if (this.cameraLensMode && item.id === this.selectedStageCameraId) {
                camGroup.visible = false;
            }

            const legMat = new THREE.MeshStandardMaterial({ color: 0x161c26, metalness: 0.78, roughness: 0.28 });
            [0, 120, 240].forEach(angDeg => {
                const a = angDeg * DEG2RAD;
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, cy * 1.05, 8), legMat);
                leg.position.set(Math.cos(a) * 0.2, -cy / 2, Math.sin(a) * 0.2);
                leg.rotation.z = -Math.cos(a) * 0.22;
                leg.rotation.x = Math.sin(a) * 0.22;
                camGroup.add(leg);
            });

            // Floating 2D-Style Camera Badge
            const camBadge = createTextBadgeSprite(`${item.camNumber || 'Cam 1'} (${focalMm}mm)`, {
                border: '#38bdf8',
                fg: '#7dd3fc',
                worldHeight: 0.36
            });
            camBadge.position.set(0, 0.52, 0);
            camGroup.add(camBadge);

            const head = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({
                color: isSelected ? 0x0284c7 : 0x0b0e14,
                metalness: 0.65,
                roughness: 0.3
            });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.23, 0.38), bodyMat);
            head.add(body);

            const topHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.24), legMat);
            topHandle.position.set(0, 0.15, 0);
            head.add(topHandle);

            const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 16), legMat);
            lensBarrel.rotation.x = Math.PI / 2;
            lensBarrel.position.set(0, 0, 0.25);
            head.add(lensBarrel);

            const matteBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.23, 0.1), bodyMat);
            matteBox.position.set(0, 0, 0.36);
            head.add(matteBox);

            // 3D FOV Frustum Wireframe Cone (respects Show Info -> Camera Cone)
            const proj = getApp()?.getActiveProject?.();
            if (proj?.showInfoFlags?.cameraCone !== false) {
                const halfW = Math.tan(hFovRad / 2) * fovRange;
                const halfH = halfW * (9 / 16);
                const pts = [
                    new THREE.Vector3(0, 0, 0.36), new THREE.Vector3(-halfW, halfH, fovRange),
                    new THREE.Vector3(0, 0, 0.36), new THREE.Vector3(halfW, halfH, fovRange),
                    new THREE.Vector3(0, 0, 0.36), new THREE.Vector3(halfW, -halfH, fovRange),
                    new THREE.Vector3(0, 0, 0.36), new THREE.Vector3(-halfW, -halfH, fovRange),
                    new THREE.Vector3(-halfW, halfH, fovRange), new THREE.Vector3(halfW, halfH, fovRange),
                    new THREE.Vector3(halfW, halfH, fovRange), new THREE.Vector3(halfW, -halfH, fovRange),
                    new THREE.Vector3(halfW, -halfH, fovRange), new THREE.Vector3(-halfW, -halfH, fovRange),
                    new THREE.Vector3(-halfW, -halfH, fovRange), new THREE.Vector3(-halfW, halfH, fovRange)
                ];
                const frustumGeo = new THREE.BufferGeometry().setFromPoints(pts);
                head.add(new THREE.LineSegments(
                    frustumGeo,
                    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72 })
                ));
            }

            camGroup.add(head);
            this.itemsGroup.add(camGroup);

            const targetX = cx + Math.cos(rotRad) * fovRange;
            const targetZ = cz + Math.sin(rotRad) * fovRange;
            head.lookAt(new THREE.Vector3(targetX, cy, targetZ));

            this.itemMeshMap.set(item.id, { root: camGroup, headGroup: head, item });
        },

        buildProp3D(item, isSelected) {
            const THREE = global.THREE;
            const px = Number(item.x) || 0;
            const pz = Number(item.y) || 0;
            const rotRad = (Number(item.rotation) || 0) * DEG2RAD;
            const eqId = String(item.equipmentId || item.vectorShape || '');

            const group = new THREE.Group();
            group.position.set(px, 0, pz);
            group.rotation.y = -rotRad + Math.PI / 2;
            group.userData = { itemId: item.id, itemType: item.itemType || 'prop' };

            const matPrimary = new THREE.MeshStandardMaterial({
                color: isSelected ? 0x38bdf8 : 0x1e293b,
                roughness: 0.55,
                metalness: 0.3
            });
            const matSkin = new THREE.MeshStandardMaterial({ color: 0xeab68c, roughness: 0.55 });
            const matCloth = new THREE.MeshStandardMaterial({ color: isSelected ? 0x0ea5e9 : 0x1d4ed8, roughness: 0.65 });
            const matPants = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
            const matWood = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.6 });

            if (eqId.includes('person') || item.subtype === 'person' || item.subtype === 'subject') {
                const isSeated = eqId.includes('seated');
                if (isSeated) {
                    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), matPrimary);
                    chairSeat.position.y = 0.46;
                    group.add(chairSeat);
                    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.06), matPrimary);
                    chairBack.position.set(0, 0.75, -0.23);
                    group.add(chairBack);
                }

                const legH = isSeated ? 0.46 : 0.82;
                [-0.1, 0.1].forEach(lx => {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, legH, 12), matPants);
                    leg.position.set(lx, legH / 2, isSeated ? 0.16 : 0);
                    group.add(leg);
                });

                const torsoH = 0.62;
                const torsoY = (isSeated ? 0.48 : 0.82) + torsoH / 2;
                const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, torsoH, 0.24), matCloth);
                torso.position.y = torsoY;
                group.add(torso);

                [-0.26, 0.26].forEach(ax => {
                    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.54, 10), matCloth);
                    arm.position.set(ax, torsoY - 0.03, 0);
                    group.add(arm);
                });

                const headY = torsoY + torsoH / 2 + 0.18;
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 18), matSkin);
                head.position.y = headY;
                group.add(head);

                const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 10), matSkin);
                nose.rotation.x = Math.PI / 2;
                nose.position.set(0, headY, 0.16);
                group.add(nose);
            } else if (eqId.startsWith('stand_')) {
                // Standalone Lighting Floor Stand 3D Model
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 10), matPrimary);
                pole.position.y = 1.1;
                group.add(pole);
                [0, 120, 240].forEach(deg => {
                    const a = deg * DEG2RAD;
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), matPrimary);
                    leg.position.set(Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25);
                    leg.rotation.z = -Math.cos(a) * 0.55;
                    leg.rotation.x = Math.sin(a) * 0.55;
                    group.add(leg);
                });
            } else if (eqId.includes('podcast_table')) {
                const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.1), matWood);
                top.position.y = 0.76;
                group.add(top);

                [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].forEach(([lx, lz]) => {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.74, 10), matPrimary);
                    leg.position.set(lx, 0.37, lz);
                    group.add(leg);
                });
            } else if (eqId.includes('sofa')) {
                const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 0.9), matCloth);
                seat.position.y = 0.21;
                group.add(seat);

                const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 0.22), matCloth);
                back.position.set(0, 0.62, -0.34);
                group.add(back);

                [-0.96, 0.96].forEach(ax => {
                    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.58, 0.9), matCloth);
                    arm.position.set(ax, 0.29, 0);
                    group.add(arm);
                });
            } else {
                const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.82, 0.8), matPrimary);
                box.position.y = 0.41;
                group.add(box);
            }

            const propBadge = createTextBadgeSprite(item.label || item.name || 'Prop', {
                border: '#94a3b8',
                fg: '#f8fafc',
                worldHeight: 0.32
            });
            propBadge.position.set(0, 2.05, 0);
            group.add(propBadge);

            this.itemsGroup.add(group);
            this.itemMeshMap.set(item.id, { root: group, item });
        },

        updateStageCameraDropdown(sceneObj) {
            const sel = document.getElementById('sel3DStageCamera');
            if (!sel) return;
            const cameras = (sceneObj?.items || []).filter(i => i.itemType === 'camera' && i.visible !== false);
            if (cameras.length === 0) {
                sel.classList.add('hidden');
                if (this.cameraLensMode) this.setCameraLensMode(false);
                return;
            }
            if (!this.selectedStageCameraId || !cameras.some(c => c.id === this.selectedStageCameraId)) {
                this.selectedStageCameraId = cameras[0].id;
            }
            sel.innerHTML = cameras.map(c => `<option value="${c.id}" ${c.id === this.selectedStageCameraId ? 'selected' : ''}>🎥 ${c.camNumber || c.label || 'Cam'} (${c.focalLengthMm || 35}mm)</option>`).join('');
            sel.classList.toggle('hidden', !this.cameraLensMode);
        },

        syncStageCameraMeshVisibility() {
            this.itemMeshMap.forEach((rec, id) => {
                if (rec && rec.item && rec.item.itemType === 'camera' && rec.root) {
                    rec.root.visible = !(this.cameraLensMode && id === this.selectedStageCameraId);
                }
            });
        },

        setViewPreset(preset) {
            this.viewPreset = preset || 'perspective';
            this.cameraLensMode = false;
            this.syncStageCameraMeshVisibility();
            this.centerOrbitOnStage(false);

            if (preset === 'top') {
                this.orbit.phi = 0.04;
                this.orbit.theta = 0;
                this.activeCamera = this.orthoCamera;
            } else if (preset === 'front') {
                this.orbit.phi = Math.PI / 2 - 0.04;
                this.orbit.theta = 0;
                this.activeCamera = this.orthoCamera;
            } else if (preset === 'side') {
                this.orbit.phi = Math.PI / 2 - 0.04;
                this.orbit.theta = Math.PI / 2;
                this.activeCamera = this.orthoCamera;
            } else {
                this.orbit.phi = 30 * DEG2RAD;
                this.orbit.theta = 0;
                this.activeCamera = this.perspCamera;
            }

            this.syncHudButtons();
            this.requestRender();
        },

        setCameraLensMode(enabled) {
            const sceneObj = getApp()?.getActiveScene?.();
            const cameras = (sceneObj?.items || []).filter(i => i.itemType === 'camera' && i.visible !== false);
            if (enabled && cameras.length === 0) {
                getApp()?.showToast?.('🎥 أضف كاميرا أولاً على المخطط لمعاينة كادر العدسة في 3D');
                return;
            }
            this.cameraLensMode = !!enabled;
            if (this.cameraLensMode) {
                this.activeCamera = this.perspCamera;
                if (!this.selectedStageCameraId || !cameras.some(c => c.id === this.selectedStageCameraId)) {
                    this.selectedStageCameraId = cameras[0] ? cameras[0].id : null;
                }
            } else {
                this.perspCamera.fov = 44;
                this.perspCamera.updateProjectionMatrix();
            }
            this.syncStageCameraMeshVisibility();
            this.updateStageCameraDropdown(sceneObj);
            this.syncHudButtons();
            this.updateCameraTransform();
            this.requestRender();
        },

        syncHudButtons() {
            if (!this.container) return;
            this.container.querySelectorAll('[data-preset]').forEach(btn => {
                btn.classList.toggle('active', !this.cameraLensMode && btn.dataset.preset === this.viewPreset);
            });
            document.getElementById('btn3DBlackout')?.classList.toggle('active', this.blackoutMode);
            document.getElementById('btn3DCamLens')?.classList.toggle('active', this.cameraLensMode);
            document.getElementById('shams3DCamFrame')?.classList.toggle('hidden', !this.cameraLensMode);

            const navBtn = document.getElementById('btn3DNavMode');
            if (navBtn) {
                navBtn.textContent = this.navDragMode === 'pan' ? '✋ تحريك Pan' : '🔄 دوران Orbit';
                navBtn.classList.toggle('active', this.navDragMode === 'pan');
            }
        },

        stepCameraDamping() {
            const lerp = 0.36;
            let moving = false;
            const diff = (a, b) => Math.abs(a - b) > 0.0008;

            if (diff(this.currentOrbit.theta, this.orbit.theta)) {
                this.currentOrbit.theta += (this.orbit.theta - this.currentOrbit.theta) * lerp;
                moving = true;
            } else {
                this.currentOrbit.theta = this.orbit.theta;
            }

            if (diff(this.currentOrbit.phi, this.orbit.phi)) {
                this.currentOrbit.phi += (this.orbit.phi - this.currentOrbit.phi) * lerp;
                moving = true;
            } else {
                this.currentOrbit.phi = this.orbit.phi;
            }

            if (diff(this.currentOrbit.radius, this.orbit.radius)) {
                this.currentOrbit.radius += (this.orbit.radius - this.currentOrbit.radius) * lerp;
                moving = true;
                if (this.activeCamera === this.orthoCamera && this.container) {
                    const aspect = Math.max(300, this.container.clientWidth) / Math.max(240, this.container.clientHeight);
                    const frustum = this.currentOrbit.radius * 0.58;
                    this.orthoCamera.left = -frustum * aspect;
                    this.orthoCamera.right = frustum * aspect;
                    this.orthoCamera.top = frustum;
                    this.orthoCamera.bottom = -frustum;
                    this.orthoCamera.updateProjectionMatrix();
                }
            } else {
                this.currentOrbit.radius = this.orbit.radius;
            }

            ['x', 'y', 'z'].forEach(k => {
                if (diff(this.currentOrbit.target[k], this.orbit.target[k])) {
                    this.currentOrbit.target[k] += (this.orbit.target[k] - this.currentOrbit.target[k]) * lerp;
                    moving = true;
                } else {
                    this.currentOrbit.target[k] = this.orbit.target[k];
                }
            });

            this.updateCameraTransform();
            return moving;
        },

        updateCameraTransform() {
            const THREE = global.THREE;
            if (!this.activeCamera || !THREE) return;

            if (this.cameraLensMode) {
                const sceneObj = getApp()?.getActiveScene?.();
                const cameras = (sceneObj?.items || []).filter(i => i.itemType === 'camera' && i.visible !== false);
                const camItem = cameras.find(i => i.id === this.selectedStageCameraId) || cameras[0];
                if (camItem) {
                    if (this.selectedStageCameraId !== camItem.id) {
                        this.selectedStageCameraId = camItem.id;
                        this.syncStageCameraMeshVisibility();
                    }
                    const cx = Number(camItem.x) || 0;
                    const rawZ = Number(camItem.z);
                    const cy = Number.isFinite(rawZ) ? rawZ : 1.5;
                    const cz = Number(camItem.y) || 0;
                    const rotRad = (Number(camItem.rotation) || 0) * DEG2RAD;
                    const focalMm = Math.max(12, Math.min(200, Number(camItem.focalLengthMm) || 35));
                    const aspect = Math.max(0.45, this.perspCamera.aspect || (16 / 9));
                    const hFovRad = 2 * Math.atan(18 / focalMm);
                    const hFovDeg = hFovRad * RAD2DEG;
                    const vFovDeg = Math.max(16, Math.min(115, 2 * Math.atan(Math.tan(hFovRad / 2) / aspect) * RAD2DEG));

                    if (Math.abs(this.perspCamera.fov - vFovDeg) > 0.05) {
                        this.perspCamera.fov = vFovDeg;
                        this.perspCamera.updateProjectionMatrix();
                    }
                    const lensOffset = 0.28;
                    this.perspCamera.position.set(
                        cx + Math.cos(rotRad) * lensOffset,
                        cy,
                        cz + Math.sin(rotRad) * lensOffset
                    );

                    const lookDist = Math.max(4, Number(camItem.fovDistance || camItem.fovRange) || 5.0);
                    const tx = cx + Math.cos(rotRad) * lookDist;
                    const tz = cz + Math.sin(rotRad) * lookDist;
                    this.perspCamera.lookAt(tx, cy, tz);

                    const infoLbl = document.getElementById('shams3DCamInfoLabel');
                    if (infoLbl) infoLbl.textContent = `${camItem.camNumber || 'CAM'} | ${focalMm}mm | FOV ${hFovDeg.toFixed(1)}°`;
                    const posLbl = document.getElementById('shams3DCamPosLabel');
                    if (posLbl) posLbl.textContent = `X: ${cx.toFixed(1)}m  Y: ${cz.toFixed(1)}m  H: ${cy.toFixed(1)}m`;
                    return;
                }
            }

            const { radius, phi, theta, target } = this.currentOrbit;
            const sinPhi = Math.sin(phi);
            const x = target.x + radius * sinPhi * Math.sin(theta);
            const y = target.y + radius * Math.cos(phi);
            const z = target.z + radius * sinPhi * Math.cos(theta);

            this.activeCamera.position.set(x, y, z);
            this.activeCamera.lookAt(target.x, target.y, target.z);
        },

        requestRender() {
            if (!this.active || this.renderPending) return;
            this.renderPending = true;
            requestAnimationFrame(() => {
                this.renderPending = false;
                if (!this.active || !this.renderer || !this.scene || !this.activeCamera) return;
                const stillMoving = this.stepCameraDamping();
                this.renderer.render(this.scene, this.activeCamera);
                if (stillMoving) {
                    this.requestRender();
                }
            });
        },

        bindEvents() {
            if (!this.container || !this.canvas) return;

            this.container.querySelectorAll('[data-preset]').forEach(btn => {
                btn.addEventListener('click', () => this.setViewPreset(btn.dataset.preset));
            });

            document.getElementById('btn3DNavMode')?.addEventListener('click', () => {
                this.navDragMode = this.navDragMode === 'orbit' ? 'pan' : 'orbit';
                this.syncHudButtons();
            });

            document.getElementById('btn3DResetCam')?.addEventListener('click', () => {
                this.setViewPreset('perspective');
            });

            document.getElementById('btn3DBlackout')?.addEventListener('click', () => {
                this.blackoutMode = !this.blackoutMode;
                this.syncHudButtons();
                this.rebuildScene();
            });

            document.getElementById('btn3DCamLens')?.addEventListener('click', () => {
                this.setCameraLensMode(!this.cameraLensMode);
            });

            document.getElementById('sel3DStageCamera')?.addEventListener('change', (e) => {
                this.selectedStageCameraId = e.target.value;
                this.syncStageCameraMeshVisibility();
                this.updateCameraTransform();
                this.requestRender();
            });

            document.getElementById('btn3DBackTo2D')?.addEventListener('click', () => {
                getApp()?.toggle2D3DMode?.();
            });

            global.addEventListener('resize', () => {
                if (this.active) this.resize();
            });

            this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
            this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
            this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
            this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
            this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
            this.canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 1.09 : 0.91;
                this.orbit.radius = Math.max(3.5, Math.min(75, this.orbit.radius * delta));
                this.requestRender();
            }, { passive: false });
        },

        raycastAimHandle(clientX, clientY) {
            const THREE = global.THREE;
            if (!THREE || !this.activeCamera || !this.canvas) return null;
            const rect = this.canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ndc, this.activeCamera);
            const hits = raycaster.intersectObjects(this.lightsGroup.children, true);
            for (const h of hits) {
                if (h.object?.userData?.aimForItemId) {
                    return h.object.userData.aimForItemId;
                }
            }
            return null;
        },

        raycastStageItem(clientX, clientY) {
            const THREE = global.THREE;
            if (!THREE || !this.activeCamera || !this.canvas) return null;
            const rect = this.canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ndc, this.activeCamera);
            const hits = raycaster.intersectObjects(this.itemsGroup.children, true);
            if (!hits.length) return null;
            let obj = hits[0].object;
            while (obj && !obj.userData?.itemId) {
                obj = obj.parent;
            }
            return obj?.userData?.itemId || null;
        },

        /**
         * Intersect mouse ray with horizontal plane at exact height `planeY` (e.g. ceiling fixture height 4.2m)
         * Prevents any forward-jumping when clicking or dragging a ceiling fixture in 3D!
         */
        raycastHorizontalPlane(clientX, clientY, planeY = 0) {
            const THREE = global.THREE;
            const rect = this.canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(ndc, this.activeCamera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
            const target = new THREE.Vector3();
            return raycaster.ray.intersectPlane(plane, target);
        },

        onPointerDown(e) {
            this.canvas.setPointerCapture?.(e.pointerId);
            this.pointer.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this.pointer.pointers.size === 2) {
                const pts = Array.from(this.pointer.pointers.values());
                this.pointer.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                clearTimeout(this.pointer.longPressTimer);
                this.pointer.draggingItem = null;
                this.pointer.draggingAimItem = null;
                return;
            }

            this.pointer.isDown = true;
            this.pointer.button = e.button;
            this.pointer.startX = e.clientX;
            this.pointer.startY = e.clientY;
            this.pointer.lastX = e.clientX;
            this.pointer.lastY = e.clientY;
            this.pointer.dragStarted = false;
            this.pointer.draggingAimItem = null;

            // 1. Check 3D Floor Aim Handle first
            if (e.button === 0) {
                const aimItemId = this.raycastAimHandle(e.clientX, e.clientY);
                if (aimItemId) {
                    const sceneObj = getApp()?.getActiveScene?.();
                    const aimItem = (sceneObj?.items || []).find(i => i.id === aimItemId);
                    if (aimItem) {
                        this.pointer.draggingAimItem = aimItem;
                        return;
                    }
                }
            }

            // 2. Check Stage Item (Fixture / Camera / Accessory / Prop)
            const hitId = this.raycastStageItem(e.clientX, e.clientY);
            if (hitId && e.button === 0) {
                const engine = getApp()?.getCanvasEngine?.();
                const prevSelectedId = engine?.selectedItemId;
                if (engine) {
                    engine.selectItem(hitId, false, true);
                }
                const sceneObj = getApp()?.getActiveScene?.();
                const hitItem = (sceneObj?.items || []).find(i => i.id === hitId);

                if (hitItem) {
                    // Use item's actual height plane (z) so clicking never jumps forward!
                    const planeY = hitItem.itemType === 'fixture' || hitItem.itemType === 'camera' || hitItem.itemType === 'accessory'
                        ? (Number(hitItem.z) || 0)
                        : 0;
                    this.pointer.dragPlaneY = planeY;
                    const hitPt = this.raycastHorizontalPlane(e.clientX, e.clientY, planeY);
                    if (hitPt) {
                        this.pointer.dragOffsetX = (Number(hitItem.x) || 0) - hitPt.x;
                        this.pointer.dragOffsetZ = (Number(hitItem.y) || 0) - hitPt.z;
                    } else {
                        this.pointer.dragOffsetX = 0;
                        this.pointer.dragOffsetZ = 0;
                    }
                }

                if (prevSelectedId !== hitId) {
                    this.rebuildScene();
                }

                if (e.pointerType === 'touch') {
                    this.pointer.touchLocked = true;
                    this.pointer.draggingItem = null;
                    const statusBar = document.getElementById('shams3DStatusBar');
                    if (statusBar) statusBar.textContent = '🔒 LOCKED - اضغط مطولاً لتحريك العنصر في 3D';
                    clearTimeout(this.pointer.longPressTimer);
                    this.pointer.longPressTimer = setTimeout(() => {
                        this.pointer.touchLocked = false;
                        this.pointer.draggingItem = hitItem || null;
                        if (statusBar) statusBar.textContent = '🔓 UNLOCKED - اسحب الآن لتحريك العنصر في 3D';
                    }, 420);
                } else {
                    this.pointer.draggingItem = hitItem || null;
                }
                this.requestRender();
            } else {
                this.pointer.draggingItem = null;
                const engine = getApp()?.getCanvasEngine?.();
                if (engine && (engine.selectedItemId || (engine.multiSelectedIds && engine.multiSelectedIds.size > 0) || engine.multiSelectMode)) {
                    engine.selectItem(null, false, false);
                    this.rebuildScene();
                }
            }
        },

        onPointerMove(e) {
            if (this.pointer.pointers.has(e.pointerId)) {
                this.pointer.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }

            if (this.pointer.pointers.size === 2) {
                const pts = Array.from(this.pointer.pointers.values());
                const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                if (this.pointer.pinchDist > 10) {
                    const ratio = this.pointer.pinchDist / Math.max(10, dist);
                    this.orbit.radius = Math.max(3.5, Math.min(75, this.orbit.radius * ratio));
                    this.requestRender();
                }
                this.pointer.pinchDist = dist;
                return;
            }

            if (!this.pointer.isDown) return;

            const dx = e.clientX - this.pointer.lastX;
            const dy = e.clientY - this.pointer.lastY;
            this.pointer.lastX = e.clientX;
            this.pointer.lastY = e.clientY;

            const totalMovePx = Math.hypot(e.clientX - this.pointer.startX, e.clientY - this.pointer.startY);
            if (totalMovePx > 10) {
                clearTimeout(this.pointer.longPressTimer);
            }

            // 1. Dragging 3D Floor Aim Handle
            if (this.pointer.draggingAimItem) {
                const floorPt = this.raycastHorizontalPlane(e.clientX, e.clientY, 0);
                if (floorPt) {
                    const item = this.pointer.draggingAimItem;
                    const angleRad = Math.atan2(floorPt.z - (Number(item.y) || 0), floorPt.x - (Number(item.x) || 0));
                    item.rotation = Math.round(angleRad * RAD2DEG);
                    const distM = Math.hypot(floorPt.x - (Number(item.x) || 0), floorPt.z - (Number(item.y) || 0));
                    item.beamLength = Math.max(1.2, Math.min(14, Number(distM.toFixed(1))));

                    const engine = getApp()?.getCanvasEngine?.();
                    engine?.syncAttachedAccessories?.(item);
                    const entry = this.itemMeshMap.get(item.id);
                    if (entry) this.updateFixtureBeamGeometry(entry);
                    engine?.requestRender?.();
                    this.requestRender();
                }
                return;
            }

            // 2. Zero-Jump Horizontal Dragging + Shift+Drag Vertical (Up/Down) Movement in 3D!
            if (this.pointer.draggingItem && !this.pointer.touchLocked) {
                if (totalMovePx < 4 && !this.pointer.dragStarted) {
                    return; // Do not move on a simple click!
                }
                this.pointer.dragStarted = true;

                const proj = getApp()?.getActiveProject?.();
                const { width: W, depth: D, height: H } = getProjectVenueDims(proj);
                const item = this.pointer.draggingItem;
                const engine = getApp()?.getCanvasEngine?.();

                // Shift + Drag: Move Item Vertically Up / Down (Ceiling <-> Floor)
                if (e.shiftKey) {
                    const vc = proj?.venueConfig || {};
                    let minFloorZ = 0.25;
                    if (vc.type === 'church') {
                        const sancDepth = Number(vc.churchConfig?.sanctuaryDepth || vc.altarDepth) || 5.0;
                        const sancElev = Number(vc.churchConfig?.sanctuaryElevation) || 0.5;
                        if ((Number(item.y) || 0) <= sancDepth) {
                            minFloorZ = +(sancElev + 0.25).toFixed(2);
                        }
                    }
                    const curZ = Number(item.z) !== undefined ? Number(item.z) : (H - 0.3);
                    const nextZ = Math.max(minFloorZ, Math.min(H - 0.2, curZ - dy * 0.025));
                    item.z = Number(nextZ.toFixed(2));

                    if (item.itemType === 'fixture') {
                        const wasFloor = !!item.floorMounted || item.mountType === 'Floor / Ground';
                        if (item.z <= minFloorZ + 0.35) {
                            item.floorMounted = true;
                            item.mountType = 'Floor / Ground';
                            item.snappedPipe = null;
                            if (!wasFloor && (item.beamTargetZ === undefined || item.beamTargetZ <= 0.2)) {
                                item.beamTargetZ = 1.6;
                            }
                        } else if (wasFloor) {
                            item.floorMounted = false;
                            item.mountType = 'Ceiling Grid / Truss Clamp';
                            if (item.z >= H - 1.2) {
                                item.beamTargetZ = 0;
                            }
                        }
                        engine?.syncAttachedAccessories?.(item);
                    }

                    // Keep horizontal drag plane synced to the new Z height so releasing Shift never jumps!
                    this.pointer.dragPlaneY = item.z;
                    const reHitPt = this.raycastHorizontalPlane(e.clientX, e.clientY, this.pointer.dragPlaneY);
                    if (reHitPt) {
                        this.pointer.dragOffsetX = (Number(item.x) || 0) - reHitPt.x;
                        this.pointer.dragOffsetZ = (Number(item.y) || 0) - reHitPt.z;
                    }

                    const statusBar = document.getElementById('shams3DStatusBar');
                    if (statusBar) {
                        statusBar.textContent = item.floorMounted
                            ? `⬇ كشاف على الأرض (Shift+سحب): ${item.name} • الارتفاع Z: ${item.z}m`
                            : `↕️ تحريك رأسي (Shift+سحب): ${item.name} • الارتفاع Z: ${item.z}m`;
                    }

                    const entry = this.itemMeshMap.get(item.id);
                    if (entry) {
                        if (item.itemType === 'fixture') {
                            this.updateFixtureBeamGeometry(entry);
                        } else if (item.itemType === 'camera') {
                            entry.root.position.set(item.x, item.z, item.y);
                        } else if (!entry.attachedToParentId) {
                            entry.root.position.set(item.x, item.z, item.y);
                        }
                    }

                    engine?.requestRender?.();
                    this.requestRender();
                    return;
                }

                // Normal Drag (without Shift): Smooth Horizontal Movement on current plane
                const planePt = this.raycastHorizontalPlane(e.clientX, e.clientY, this.pointer.dragPlaneY);
                if (planePt) {
                    const rawX = Math.max(0.2, Math.min(W - 0.2, planePt.x + this.pointer.dragOffsetX));
                    const rawY = Math.max(0.2, Math.min(D - 0.2, planePt.z + this.pointer.dragOffsetZ));

                    if (item.itemType === 'fixture' && engine?.applyVenueAutoSnap) {
                        const snapped = engine.applyVenueAutoSnap(item, rawX, rawY);
                        item.x = snapped.x;
                        item.y = snapped.y;
                        item.snappedPipe = snapped.snappedPipe;
                        if (snapped.z !== undefined) item.z = snapped.z;
                        if (snapped.mountType) item.mountType = snapped.mountType;
                        engine.syncAttachedAccessories?.(item);

                        const statusBar = document.getElementById('shams3DStatusBar');
                        if (statusBar) {
                            const isFloor = item.mountType === 'Floor / Ground' || !!item.floorMounted;
                            statusBar.textContent = snapped.snappedPipe
                                ? `🧲 تم الالتقاط المغناطيسي على الماسورة (${snapped.snappedPipe}) • X:${item.x}m Y:${item.y}m (Shift+سحب للنزول للأرض)`
                                : (isFloor ? `⬇ كشاف على الأرض: ${item.name} • X:${item.x}m Y:${item.y}m (Shift+سحب للرفع)` : `تحريك حر: ${item.name} • X:${item.x}m Y:${item.y}m (Shift+سحب للنزول للأرض)`);
                        }
                    } else if ((item.itemType === 'accessory' || engine?.isStandItem?.(item)) && engine?.applyAccessoryMagneticSnap) {
                        const snapAcc = engine.applyAccessoryMagneticSnap(item, rawX, rawY);
                        item.x = snapAcc.x;
                        item.y = snapAcc.y;
                    } else {
                        item.x = Number(rawX.toFixed(2));
                        item.y = Number(rawY.toFixed(2));
                    }

                    const entry = this.itemMeshMap.get(item.id);
                    if (entry) {
                        if (item.itemType === 'fixture') {
                            this.updateFixtureBeamGeometry(entry);
                        } else if (item.itemType === 'camera') {
                            const cy = Number(item.z) !== undefined ? Number(item.z) : 1.5;
                            entry.root.position.set(item.x, cy, item.y);
                        } else if (!entry.attachedToParentId) {
                            entry.root.position.set(item.x, item.itemType === 'accessory' ? (Number(item.z) || 2) : 0, item.y);
                        }
                    }

                    engine?.requestRender?.();
                    this.requestRender();
                }
                return;
            }

            if (this.cameraLensMode) return;

            // Pan with Right-Click, Middle-Click, Shift+Drag, or when Pan Mode is active
            if (this.pointer.button === 2 || this.pointer.button === 1 || e.shiftKey || this.navDragMode === 'pan') {
                const panSpeed = this.orbit.radius * 0.0014;
                const cosT = Math.cos(this.orbit.theta);
                const sinT = Math.sin(this.orbit.theta);
                this.orbit.target.x -= (dx * cosT + dy * sinT) * panSpeed;
                this.orbit.target.z -= (-dx * sinT + dy * cosT) * panSpeed;
            } else {
                this.orbit.theta -= dx * 0.0065;
                this.orbit.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.03, this.orbit.phi - dy * 0.0055));
            }
            this.requestRender();
        },

        onPointerUp(e) {
            this.pointer.pointers.delete(e.pointerId);
            clearTimeout(this.pointer.longPressTimer);
            if ((this.pointer.draggingItem && this.pointer.dragStarted) || this.pointer.draggingAimItem) {
                getApp()?.persistWorkspace?.();
                global.ShamsWorkspaceUI?.checkpoint?.('3D Move');
                if (this.pointer.draggingItem?.itemType === 'accessory') {
                    this.rebuildScene();
                }
            }
            this.pointer.isDown = false;
            this.pointer.draggingItem = null;
            this.pointer.draggingAimItem = null;
            this.pointer.dragStarted = false;
            this.pointer.touchLocked = false;
        }
    };

    global.ShamsThreeView = ShamsThreeView;
})(window);
