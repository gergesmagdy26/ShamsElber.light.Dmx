/**
 * CineLight & DMX Stage Planner
 * Distinct Custom Vector Schematic Renderer (Canvas 2D + SVG Preview Generator)
 * Every fixture, camera, lens, stand, and prop has its own recognizable engineering icon.
 */

(function (global) {
  'use strict';

  const imageCache = {};

  function getCachedImage(dataUrl, onLoadCallback) {
    if (!dataUrl) return null;
    if (imageCache[dataUrl]) {
      return imageCache[dataUrl].complete ? imageCache[dataUrl] : null;
    }
    const img = new Image();
    img.onload = () => {
      if (typeof onLoadCallback === 'function') onLoadCallback();
    };
    img.src = dataUrl;
    imageCache[dataUrl] = img;
    return img.complete ? img : null;
  }

  /**
   * Draw any Equipment / Scene Item onto Canvas 2D context centered at (0,0) facing +X (angle 0)
   * Base unit: pixels (where ~36px = 1 meter at 1x scale, or scaled dynamically)
   */
  function drawVectorShape(ctx, shape, opts) {
    const color = (opts && opts.color) || '#f59e0b';
    const hideBadge = !!(opts && opts.hideBadge);
    const badge = hideBadge ? '' : ((opts && opts.badge) || '');
    const mountType = (opts && opts.mountType) || '';
    const customImage = opts && opts.customImage;

    // Draw floor stand base under fixture if mounted on Silver Stand, Black Stand, or C-Stand
    if (mountType && !mountType.includes('Clamp') && !mountType.includes('Grid') && !mountType.includes('Truss')) {
      drawUnderFixtureStand(ctx, mountType);
    }

    // If user uploaded a custom PNG/JPG image for this item, draw it inside a broadcast frame
    if (customImage) {
      const img = getCachedImage(customImage, opts && opts.onImageLoad);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-24, -24, 48, 48, 8);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.clip();
        ctx.drawImage(img, -24, -24, 48, 48);
        ctx.restore();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(-24, -24, 48, 48, 8);
        ctx.stroke();
        drawBadgeLabel(ctx, badge, 0, 30, '#0f172a', '#f8fafc');
        return;
      }
    }

    switch (shape) {
      case 'godox_sz200bi':
        drawGodoxSZ200Bi(ctx, color, hideBadge ? '' : (badge || 'SZ200Bi'));
        break;
      case 'godox_sz150r':
        drawGodoxSZ150R(ctx, color, hideBadge ? '' : (badge || 'SZ150R'));
        break;
      case 'godox_s30':
        drawGodoxS30(ctx, color, hideBadge ? '' : (badge || 'S30'));
        break;
      case 'nanlite_f500':
        drawNanliteForza(ctx, color, hideBadge ? '' : (badge || 'F500'), 1.15);
        break;
      case 'nanlite_f300':
        drawNanliteForza(ctx, color, hideBadge ? '' : (badge || 'F300'), 0.92);
        break;
      case 'pavotube_30c':
        drawPavoTube30C(ctx, color, hideBadge ? '' : (badge || '30C'));
        break;
      case 'godox_tl120':
        drawGodoxTube(ctx, color, hideBadge ? '' : (badge || 'TL120'), 46);
        break;
      case 'godox_tl30':
        drawGodoxTube(ctx, color, hideBadge ? '' : (badge || 'TL30'), 22);
        break;
      case 'godox_6r':
        drawGodoxLED6R(ctx, color, hideBadge ? '' : (badge || '6R'));
        break;
      case 'beam_sr300':
        drawBeamSR300(ctx, color, hideBadge ? '' : (badge || 'SR300'));
        break;
      case 'blinder_4way':
        drawBlinder4Way(ctx, color, hideBadge ? '' : (badge || 'Blinder 4'));
        break;
      case 'wash_37x15':
        drawWash37x15(ctx, color, hideBadge ? '' : (badge || 'Wash 37x15'));
        break;
      case 'par_led_rgb':
        drawParLedRGB(ctx, color, hideBadge ? '' : (badge || 'PAR RGB'));
        break;
      case 'dmx_splitter':
        drawDMXSplitter(ctx, hideBadge ? '' : (badge || 'SPLIT'));
        break;
      case 'sony_alpha':
        drawSonyCamera(ctx, Object.assign({}, opts, { camNumber: hideBadge ? '' : ((opts && opts.camNumber) || 'Cam 1') }));
        break;
      case 'stand_silver':
      case 'stand_black':
      case 'stand_cstand':
      case 'stand_clamp':
      case 'tripod_608':
      case 'tripod_504':
      case 'tripod_vinten':
        drawStandaloneStand(ctx, shape, badge);
        break;
      // --- Magnetic Lighting Accessories (إكسسوارات إضاءة) ---
      case 'acc_octa90':
        drawAccOcta90(ctx, badge);
        break;
      case 'acc_fresnel_lens':
        drawAccFresnelLens(ctx, badge);
        break;
      case 'acc_para_gp4_120':
        drawAccParabolicGP4(ctx, 1.18, badge);
        break;
      case 'acc_para_gp4_90':
        drawAccParabolicGP4(ctx, 0.92, badge);
        break;
      case 'acc_tube_grid':
        drawAccTubeGrid(ctx, badge);
        break;
      // --- Subjects & Set/Decor Props (أشخاص وديكور) ---
      case 'prop_person_standing':
      case 'prop_presenter':
        drawPersonStanding(ctx, shape === 'prop_presenter', badge);
        break;
      case 'prop_person_seated':
        drawPersonSeated(ctx, badge);
        break;
      case 'prop_choir':
        drawChoirGroup(ctx, badge);
        break;
      case 'prop_podcast_table':
        drawPodcastTableProp(ctx, badge);
        break;
      case 'prop_interview_chairs':
        drawInterviewChairsProp(ctx, badge);
        break;
      case 'prop_sofa':
        drawSofaProp(ctx, badge);
        break;
      case 'prop_presenter_desk':
        drawPresenterDeskProp(ctx, badge);
        break;
      case 'prop_table':
        drawTableProp(ctx, badge);
        break;
      case 'prop_chair':
        drawChairProp(ctx, badge);
        break;
      case 'prop_stage_podium':
        drawStagePodiumProp(ctx, badge);
        break;
      case 'prop_altar':
        drawAltarProp(ctx, badge);
        break;
      case 'prop_cyc':
        drawCycProp(ctx, badge);
        break;
      case 'prop_drum_riser':
        drawDrumRiserProp(ctx, badge);
        break;
      default:
        drawGodoxSZ200Bi(ctx, color, hideBadge ? '' : (badge || 'FIX'));
        break;
    }
  }

  function drawUnderFixtureStand(ctx, mountType) {
    ctx.save();
    const isSilver = mountType.includes('Silver');
    const isCStand = mountType.includes('C-Stand');
    ctx.strokeStyle = isSilver ? '#cbd5e1' : isCStand ? '#94a3b8' : '#475569';
    ctx.lineWidth = 2.2;
    if (isCStand) {
      // Turtle C-stand curved legs
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 + 0.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a + 0.3) * 18, Math.sin(a + 0.3) * 18, Math.cos(a) * 28, Math.sin(a) * 28);
        ctx.stroke();
      }
      // Gobo knuckle dot
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(-4, 14, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Tripod legs
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 1. Godox SZ200Bi: Bi-Color Zoom COB with side zoom dial & Bowens reflector
  function drawGodoxSZ200Bi(ctx, color, badge) {
    ctx.save();
    // U-Bracket Yoke
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-4, -20);
    ctx.lineTo(-4, 20);
    ctx.stroke();

    // Main cylindrical stepped housing
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-18, -14, 28, 28, 5);
    ctx.fill();
    ctx.stroke();

    // Bi-color Gold/Amber accent stripe
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-13, -14, 5, 28);

    // Side Zoom Dial Knob (Distinctive SZ feature)
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-2, 14, 9, 6, 2);
    ctx.fill();
    ctx.stroke();

    // Front Bowens Zoom Reflector Cone
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(10, -11);
    ctx.lineTo(22, -17);
    ctx.lineTo(22, 17);
    ctx.lineTo(10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing Bi-color COB emitter face
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(21, 0, 3.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    drawFixtureBadgeInside(ctx, badge, -4, 0, '#f8fafc');
    ctx.restore();
  }

  // 2. Godox SZ150R: RGB Zoom COB shape with RGB indicator & side zoom dial
  function drawGodoxSZ150R(ctx, color, badge) {
    ctx.save();
    // Yoke
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-4, -19);
    ctx.lineTo(-4, 19);
    ctx.stroke();

    // Body
    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-17, -13, 27, 26, 5);
    ctx.fill();
    ctx.stroke();

    // RGB 3-band indicator on top of housing
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-14, -13, 4, 8);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-14, -4, 4, 8);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-14, 5, 4, 8);

    // Side Zoom Dial Knob (Cyan/Silver)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-2, 13, 8, 6, 2);
    ctx.fill();

    // Reflector
    ctx.fillStyle = '#27272a';
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(10, -10);
    ctx.lineTo(21, -16);
    ctx.lineTo(21, 16);
    ctx.lineTo(10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing RGB Emitter
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(20, 0, 3.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    drawFixtureBadgeInside(ctx, badge, -2, 0, '#38bdf8');
    ctx.restore();
  }

  // 3. Godox S30: Compact Focusing Spot shape with long narrow barn doors
  function drawGodoxS30(ctx, color, badge) {
    ctx.save();
    // Compact cylindrical barrel
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-14, -9, 24, 18, 3);
    ctx.fill();
    ctx.stroke();

    // Focus slider knob at rear
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(-15, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Aspherical lens ring
    ctx.fillStyle = color;
    ctx.fillRect(10, -7, 4, 14);

    // Long narrow 4-leaf Barn Doors extending forward
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(13, -7);
    ctx.lineTo(25, -13);
    ctx.moveTo(13, 7);
    ctx.lineTo(25, 13);
    ctx.stroke();

    drawFixtureBadgeInside(ctx, badge, -2, 0, '#fef08a');
    ctx.restore();
  }

  // 4 & 5. Nanlite Forza 500 & Forza 300: Polygonal carbon-style body with angled yoke
  function drawNanliteForza(ctx, color, badge, scale) {
    ctx.save();
    ctx.scale(scale, scale);

    // Signature Nanlite Angled Yoke (Swept-back U-bracket)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(2, -21);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-10, 14);
    ctx.lineTo(2, 21);
    ctx.stroke();

    // Polygonal hexagonal/octagonal carbon-weave housing
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-20, -10);
    ctx.lineTo(-12, -16);
    ctx.lineTo(10, -16);
    ctx.lineTo(14, -11);
    ctx.lineTo(14, 11);
    ctx.lineTo(10, 16);
    ctx.lineTo(-12, 16);
    ctx.lineTo(-20, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Carbon-style diagonal accents
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-14, -15);
    ctx.lineTo(-6, 15);
    ctx.moveTo(-4, -15);
    ctx.lineTo(4, 15);
    ctx.stroke();

    // Deep parabolic reflector dish
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(14, -11);
    ctx.lineTo(25, -18);
    ctx.lineTo(25, 18);
    ctx.lineTo(14, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // High-output COB lens
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(24, 0, 4, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    drawFixtureBadgeInside(ctx, badge, -4, 0, '#38bdf8');
    ctx.restore();
  }

  // 6. Nanlite PavoTube 30C: 120cm long tube with octagonal ends
  function drawPavoTube30C(ctx, color, badge) {
    ctx.save();
    // Tube aligned perpendicular to beam (along Y axis from -38 to +38 so light projects toward +X)
    // Octagonal End Caps (Nanlite teal/slate ends)
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.4;

    // Top octagonal cap
    ctx.beginPath();
    ctx.moveTo(-6, -42);
    ctx.lineTo(6, -42);
    ctx.lineTo(8, -34);
    ctx.lineTo(-8, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom octagonal cap
    ctx.beginPath();
    ctx.moveTo(-8, 34);
    ctx.lineTo(8, 34);
    ctx.lineTo(6, 42);
    ctx.lineTo(-6, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rear housing spine
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-7, -34, 7, 68);

    // Glowing Diffusion Tube Face (+X side)
    ctx.fillStyle = color;
    ctx.fillRect(0, -34, 7, 68);

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(-7, -34, 14, 68);

    drawFixtureBadgeInside(ctx, badge, 0, 0, '#0f172a', color);
    ctx.restore();
  }

  // 7 & 8. Godox TL120 (long) & TL30 (short) cylindrical RGB tubes
  function drawGodoxTube(ctx, color, badge, halfLen) {
    ctx.save();
    // Rounded cylindrical caps
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.roundRect(-6, -halfLen - 6, 12, 8, 4);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(-6, halfLen - 2, 12, 8, 4);
    ctx.fill();
    ctx.stroke();

    // Cylindrical body
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, -halfLen, 6, halfLen * 2);
    ctx.fillStyle = color;
    ctx.fillRect(0, -halfLen, 6, halfLen * 2);

    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(-6, -halfLen, 12, halfLen * 2);

    drawFixtureBadgeInside(ctx, badge, 0, 0, '#0f172a', '#f8fafc');
    ctx.restore();
  }

  // 9. Godox LED 6R: Compact rectangular pocket RGB panel
  function drawGodoxLED6R(ctx, color, badge) {
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-11, -15, 18, 30, 4);
    ctx.fill();
    ctx.stroke();

    // Glowing front diffuser strip
    ctx.fillStyle = color;
    ctx.fillRect(4, -12, 5, 24);

    drawFixtureBadgeInside(ctx, badge, -2, 0, '#f8fafc');
    ctx.restore();
  }

  // 10. Beam SR300: Moving Head base + yoke + narrow sharp beam lens head
  function drawBeamSR300(ctx, color, badge) {
    ctx.save();
    // Rectangular Moving Head Base with LCD screen indicator
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-20, -18, 32, 36, 5);
    ctx.fill();
    ctx.stroke();

    // LCD display on base
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(-17, -6, 5, 12);

    // Moving Head Yoke Arms
    ctx.fillStyle = '#334155';
    ctx.fillRect(-8, -21, 20, 4);
    ctx.fillRect(-8, 17, 20, 4);

    // Rotating Barrel Head + Large Front Collimator Lens
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-10, -13, 28, 26, 8);
    ctx.fill();
    ctx.stroke();

    // Sharp Concentrated Front Beam Lens
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(14, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    drawFixtureBadgeInside(ctx, badge, -3, 0, '#f8fafc');
    ctx.restore();
  }

  // 11. Blinder 4-Way: Rectangular housing with 4 distinct circular lamp cells (2x2 or 1x4)
  function drawBlinder4Way(ctx, color, badge) {
    ctx.save();
    // Heavy duty rectangular blinder matrix housing
    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-16, -22, 30, 44, 4);
    ctx.fill();
    ctx.stroke();

    // 4 distinct circular PAR36 lamp cells in a 2x2 grid
    const cellCoords = [
      [-5, -11],
      [6, -11],
      [-5, 11],
      [6, 11]
    ];
    cellCoords.forEach(([cx, cy]) => {
      ctx.fillStyle = '#27272a';
      ctx.beginPath();
      ctx.arc(cx, cy, 7.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + 1, cy, 5.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    drawBadgeLabel(ctx, badge, 0, 29, '#0f172a', '#fbbf24');
    ctx.restore();
  }

  // 12. MeanReal Wash 37x15: Large Moving Head Wash with multi-cell 37 LED honeycomb lens pattern
  function drawWash37x15(ctx, color, badge) {
    ctx.save();
    // Moving Head Base
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-22, -20, 36, 40, 6);
    ctx.fill();
    ctx.stroke();

    // Yoke shoulders
    ctx.fillStyle = '#334155';
    ctx.fillRect(-10, -23, 22, 4);
    ctx.fillRect(-10, 19, 22, 4);

    // Large Circular Wash Head
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(2, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Multi-cell Honeycomb LED matrix inside head
    ctx.fillStyle = color;
    const rings = [
      [2, 0],
      [2, -6], [2, 6], [7, -3], [7, 3], [-3, -3], [-3, 3],
      [2, -12], [2, 12], [12, 0], [-8, 0], [9, -9], [9, 9], [-5, -9], [-5, 9]
    ];
    rings.forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.arc(lx, ly, 2.3, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBadgeLabel(ctx, badge, 0, 30, '#0f172a', '#34d399');
    ctx.restore();
  }

  // 13. PAR LED RGB: Classic round PAR Can silhouette with multi-LED face
  function drawParLedRGB(ctx, color, badge) {
    ctx.save();
    // Double Mounting Yoke
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -18);
    ctx.lineTo(-4, 18);
    ctx.stroke();

    // Classic Round PAR Can Barrel
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.quadraticCurveTo(-19, 0, -14, 12);
    ctx.lineTo(14, 15);
    ctx.lineTo(14, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Multi-LED RGB Face on front rim
    const rgbDots = [
      { y: -9, c: '#ef4444' },
      { y: -3, c: '#22c55e' },
      { y: 3, c: '#3b82f6' },
      { y: 9, c: color }
    ];
    rgbDots.forEach((d) => {
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(14, d.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    drawFixtureBadgeInside(ctx, badge, -2, 0, '#f8fafc');
    ctx.restore();
  }

  // 14. DMX Splitter: Signal distribution box with 1 DMX IN and multiple isolated OUT ports
  function drawDMXSplitter(ctx, badge) {
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-20, -14, 40, 28, 4);
    ctx.fill();
    ctx.stroke();

    // 1 Input Port on Left
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(-20, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // 4 Isolated Output Ports on Right
    [-9, -3, 3, 9].forEach((py) => {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(20, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    drawFixtureBadgeInside(ctx, badge || 'DMX SPLIT', 0, 0, '#38bdf8');
    ctx.restore();
  }

  // Sony Alpha Camera + G-Master Lens + Tripod Base
  function drawSonyCamera(ctx, opts) {
    ctx.save();
    const camNum = (opts && opts.camNumber) || 'Cam 1';
    const focal = (opts && opts.focalLengthMm) || 35;
    // Lens barrel length scales slightly with focal length (16mm short, 200mm long white GM barrel)
    const isTele = focal >= 70;
    const barrelLen = isTele ? 24 : 15;

    // Tripod legs underneath
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.stroke();
    }

    // Sony Alpha Mirrorless Body
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-14, -15, 16, 30, 3);
    ctx.fill();
    ctx.stroke();

    // Sony EVF hump & Grip
    ctx.fillStyle = '#334155';
    ctx.fillRect(-18, -6, 4, 12);
    ctx.fillStyle = '#ef4444'; // REC tally dot
    ctx.beginPath();
    ctx.arc(-8, -10, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // Sony G-Master Lens Barrel (White/Off-white for 70-200 GM, Matte Black for 16-35/24-70/50/85 GM)
    ctx.fillStyle = isTele ? '#e2e8f0' : '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(2, -9, barrelLen, 18, 2);
    ctx.fill();
    ctx.stroke();

    // Sony Cinnabar Orange Mount Ring + Red G-Master Badge
    ctx.fillStyle = '#f97316';
    ctx.fillRect(2, -9, 2.5, 18);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(8, -7, 4, 4);

    // Front Glass Element
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(2 + barrelLen - 3, -8, 3, 16);

    drawFixtureBadgeInside(ctx, camNum, -5, 2, '#38bdf8');
    ctx.restore();
  }

  // Standalone Stands & Tripods
  function drawStandaloneStand(ctx, shape, badge) {
    ctx.save();
    const isSilver = shape === 'stand_silver';
    const isCStand = shape === 'stand_cstand';
    const isClamp = shape === 'stand_clamp';
    const isTripod = shape.startsWith('tripod_');

    const stroke = isSilver ? '#e2e8f0' : isCStand ? '#38bdf8' : isTripod ? '#ef4444' : '#94a3b8';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;

    if (isClamp) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-12, -12, 24, 24, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
        ctx.stroke();
      }
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawBadgeLabel(ctx, badge || 'Stand', 0, 24, '#0f172a', stroke);
    ctx.restore();
  }

  // Subjects & Set Props
  function drawPersonStanding(ctx, isHost, badge) {
    ctx.save();
    // Shoulders ellipse (facing +X)
    ctx.fillStyle = isHost ? '#0284c7' : '#059669';
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Nose/Face direction indicator pointing toward +X
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(16, 0);
    ctx.lineTo(10, 4);
    ctx.closePath();
    ctx.fill();

    // Head circle
    ctx.fillStyle = '#fcd34d';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawBadgeLabel(ctx, badge || (isHost ? 'Host' : 'Person'), 0, 25, '#0f172a', '#fde68a');
    ctx.restore();
  }

  function drawPersonSeated(ctx, badge) {
    ctx.save();
    // Chair seat outline
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-14, -15, 28, 30, 5);
    ctx.fill();
    ctx.stroke();

    // Seated person shoulders & head
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 9, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose direction (+X)
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(14, 0);
    ctx.lineTo(8, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(-1, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    drawBadgeLabel(ctx, badge || 'Seated', 0, 24, '#0f172a', '#c4b5fd');
    ctx.restore();
  }

  function drawChoirGroup(ctx, badge) {
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-24, -42, 48, 84, 8);
    ctx.fill();
    ctx.stroke();

    // 6 choir members in 2 rows
    const coords = [
      [-8, -26], [-8, 0], [-8, 26],
      [8, -26], [8, 0], [8, 26]
    ];
    coords.forEach(([px, py]) => {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.ellipse(px, py, 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    drawBadgeLabel(ctx, badge || 'Choir', 0, 50, '#0f172a', '#38bdf8');
    ctx.restore();
  }

  function drawTableProp(ctx, badge) {
    ctx.save();
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-34, -18, 68, 36, 6);
    ctx.fill();
    ctx.stroke();
    drawFixtureBadgeInside(ctx, badge || 'Table', 0, 0, '#fde68a');
    ctx.restore();
  }

  function drawChairProp(ctx, badge) {
    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-12, -12, 24, 24, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.fillRect(-12, -12, 5, 24);
    drawFixtureBadgeInside(ctx, badge || 'Chair', 2, 0, '#e2e8f0');
    ctx.restore();
  }

  function drawAltarProp(ctx, badge) {
    ctx.save();
    ctx.fillStyle = '#3f2e1e';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(-38, -20, 76, 40, 6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fde68a';
    ctx.strokeRect(-30, -12, 60, 24);
    drawFixtureBadgeInside(ctx, badge || 'Altar / Podium', 0, 0, '#fbbf24');
    ctx.restore();
  }

  function drawCycProp(ctx, badge) {
    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-80, 16);
    ctx.quadraticCurveTo(-80, -14, -50, -14);
    ctx.lineTo(50, -14);
    ctx.quadraticCurveTo(80, -14, 80, 16);
    ctx.stroke();
    drawBadgeLabel(ctx, badge, 0, -24, '#0f172a', '#10b981');
    ctx.restore();
  }

  // ==========================================================================
  // MAGNETIC LIGHTING ACCESSORIES (إكسسوارات إضاءة)
  // Oriented with Bowens speedring at -X and light emission facing +X
  // ==========================================================================
  function drawAccOcta90(ctx, badge) {
    ctx.save();
    // Rear Bowens speedring collar
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-18, -7, 7, 14, 2);
    ctx.fill();
    ctx.stroke();

    // Octagonal Softbox Canopy (flaring from -11 to +14, width 44px)
    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-11, -7);
    ctx.lineTo(3, -19);
    ctx.lineTo(13, -22);
    ctx.lineTo(13, 22);
    ctx.lineTo(3, 19);
    ctx.lineTo(-11, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 8 radial tension ribs
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    [-16, -9, 0, 9, 16].forEach((ry) => {
      ctx.beginPath();
      ctx.moveTo(-11, ry * 0.35);
      ctx.lineTo(12, ry * 1.25);
      ctx.stroke();
    });

    // Glowing White Front Silk Diffuser + Honeycomb Grid Edge
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(11, -21, 4, 42);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(11, -21, 4, 42);

    drawBadgeLabel(ctx, badge, -1, 28, '#0f172a', '#38bdf8');
    ctx.restore();
  }

  function drawAccFresnelLens(ctx, badge) {
    ctx.save();
    // Bowens mount ring
    ctx.fillStyle = '#475569';
    ctx.fillRect(-14, -9, 5, 18);

    // Focusing Barrel Housing
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-9, -13, 18, 26, 3);
    ctx.fill();
    ctx.stroke();

    // Concentric stepped Fresnel glass rings on front (+X)
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.ellipse(9, 0, 4.2, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1;
    [4, 7.5, 11].forEach((ry) => {
      ctx.beginPath();
      ctx.ellipse(9, 0, ry * 0.32, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Open 4-leaf Barn Doors
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(11, -11);
    ctx.lineTo(20, -17);
    ctx.moveTo(11, 11);
    ctx.lineTo(20, 17);
    ctx.stroke();

    drawBadgeLabel(ctx, badge, 0, 23, '#0f172a', '#fde68a');
    ctx.restore();
  }

  function drawAccParabolicGP4(ctx, scaleFactor, badge) {
    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);
    // Heavy-duty GP4 Alloy Speedring
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-20, -8, 7, 16, 2);
    ctx.fill();
    ctx.stroke();

    // Deep Parabolic Bowl Silhouette
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-13, -7);
    ctx.quadraticCurveTo(-2, -22, 15, -24);
    ctx.lineTo(15, 24);
    ctx.quadraticCurveTo(-2, 22, -13, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 16-rib silver interior reflection lines
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.9;
    [-18, -12, -6, 0, 6, 12, 18].forEach((yEnd) => {
      ctx.beginPath();
      ctx.moveTo(-12, yEnd * 0.28);
      ctx.lineTo(14, yEnd * 1.2);
      ctx.stroke();
    });

    // Front Diffusion + Grid Rim
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(13, -23, 3.5, 46);

    drawBadgeLabel(ctx, badge, 0, 30, '#0f172a', '#f59e0b');
    ctx.restore();
  }

  function drawAccTubeGrid(ctx, badge) {
    ctx.save();
    // Long narrow egg-crate louver grid that snaps onto the front of PavoTube / TL120
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-6, -34, 12, 68, 3);
    ctx.fill();
    ctx.stroke();

    // Eggcrate honeycomb cells along the length
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.1;
    for (let y = -28; y <= 28; y += 7) {
      ctx.beginPath();
      ctx.moveTo(-5, y);
      ctx.lineTo(5, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(0, 32);
    ctx.stroke();

    drawBadgeLabel(ctx, badge, 0, 42, '#0f172a', '#38bdf8');
    ctx.restore();
  }

  // ==========================================================================
  // EXPANDED STUDIO & STAGE DECOR SHAPES (أشخاص وديكور)
  // ==========================================================================
  function drawPodcastTableProp(ctx, badge) {
    ctx.save();
    // Oval walnut podcast table
    ctx.fillStyle = '#3f2305';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center cable hub
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // 4 Broadcast Boom Arms & Microphones
    const mics = [
      [-22, -11, -12, -5],
      [22, -11, 12, -5],
      [-22, 11, -12, 5],
      [22, 11, 12, 5]
    ];
    mics.forEach(([bx, by, mx, my]) => {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBadgeLabel(ctx, badge, 0, 30, '#0f172a', '#fde68a');
    ctx.restore();
  }

  function drawInterviewChairsProp(ctx, badge) {
    ctx.save();
    // Left angled armchair
    ctx.save();
    ctx.translate(-20, 0);
    ctx.rotate(0.28);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-11, -11, 22, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.fillRect(-11, -11, 6, 22);
    ctx.restore();

    // Center small coffee table
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right angled armchair
    ctx.save();
    ctx.translate(20, 0);
    ctx.rotate(-0.28);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-11, -11, 22, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.fillRect(5, -11, 6, 22);
    ctx.restore();

    drawBadgeLabel(ctx, badge, 0, 22, '#0f172a', '#38bdf8');
    ctx.restore();
  }

  function drawSofaProp(ctx, badge) {
    ctx.save();
    // 3-seater studio couch facing +X
    ctx.fillStyle = '#312e81';
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-16, -38, 32, 76, 7);
    ctx.fill();
    ctx.stroke();

    // Backrest (-X) & Armrests
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(-16, -38, 9, 76);
    ctx.fillRect(-16, -38, 32, 8);
    ctx.fillRect(-16, 30, 32, 8);

    // 3 seat cushion dividers
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-7, -10);
    ctx.lineTo(15, -10);
    ctx.moveTo(-7, 10);
    ctx.lineTo(15, 10);
    ctx.stroke();

    drawBadgeLabel(ctx, badge, 0, 46, '#0f172a', '#a5b4fc');
    ctx.restore();
  }

  function drawPresenterDeskProp(ctx, badge) {
    ctx.save();
    // Curved broadcast news desk facing +X
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, -38);
    ctx.quadraticCurveTo(22, -32, 22, 0);
    ctx.quadraticCurveTo(22, 32, -16, 38);
    ctx.lineTo(-16, 20);
    ctx.quadraticCurveTo(4, 16, 4, 0);
    ctx.quadraticCurveTo(4, -16, -16, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Embedded prompter laptop monitor
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(6, -9, 5, 18);

    drawBadgeLabel(ctx, badge, 0, 46, '#0f172a', '#38bdf8');
    ctx.restore();
  }

  function drawStagePodiumProp(ctx, badge) {
    ctx.save();
    ctx.fillStyle = '#292524';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-15, -18, 30, 36, 4);
    ctx.fill();
    ctx.stroke();

    // Slanted reading ledge + dual gooseneck mics
    ctx.fillStyle = '#44403c';
    ctx.fillRect(-10, -14, 16, 28);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(8, -6, 2.5, 0, Math.PI * 2);
    ctx.arc(8, 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    drawBadgeLabel(ctx, badge, 0, 26, '#0f172a', '#f59e0b');
    ctx.restore();
  }

  function drawDrumRiserProp(ctx, badge) {
    ctx.save();
    // Riser Deck Platform
    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(-40, -34, 80, 68, 6);
    ctx.fill();
    ctx.stroke();

    // Kick drum + Snare + 3 Toms
    const drums = [
      { x: 10, y: 0, r: 12, fill: '#dc2626', stroke: '#f8fafc' }, // Kick
      { x: -6, y: 10, r: 8, fill: '#e2e8f0', stroke: '#475569' }, // Snare
      { x: 0, y: -9, r: 7, fill: '#f8fafc', stroke: '#475569' },  // Rack Tom 1
      { x: 0, y: 2, r: 7.5, fill: '#f8fafc', stroke: '#475569' }, // Rack Tom 2
      { x: -12, y: -12, r: 9.5, fill: '#f8fafc', stroke: '#475569' } // Floor Tom
    ];
    drums.forEach((d) => {
      ctx.fillStyle = d.fill;
      ctx.strokeStyle = d.stroke;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Brass Cymbals (Hi-hat, Crash, Ride)
    const cymbals = [
      [-10, 21, 7],
      [14, -20, 9],
      [12, 20, 9.5]
    ];
    cymbals.forEach(([cx, cy, cr]) => {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.88)';
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Drummer Stool (Throne)
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(-24, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();

    drawBadgeLabel(ctx, badge, 0, 42, '#0f172a', '#fbbf24');
    ctx.restore();
  }

  function drawFixtureBadgeInside(ctx, text, x, y, textColor, bgOverride) {
    if (!text) return;
    ctx.save();
    ctx.font = 'bold 8.5px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (bgOverride) {
      const w = ctx.measureText(text).width + 6;
      ctx.fillStyle = bgOverride;
      ctx.fillRect(x - w / 2, y - 6, w, 12);
    }
    ctx.fillStyle = textColor || '#ffffff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawBadgeLabel(ctx, text, x, y, bg, fg) {
    if (!text) return;
    ctx.save();
    ctx.font = 'bold 9px "Segoe UI", Tahoma, sans-serif';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg || 'rgba(15,23,42,0.9)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 7, w, 14, 4);
    ctx.fill();
    ctx.strokeStyle = fg || '#cbd5e1';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = fg || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Generate a data-url thumbnail or inline Canvas preview for Equipment Manager & Sidebar cards
   */
  function generateEquipmentThumbnailDataURL(eq) {
    if (eq && eq.customImage) return eq.customImage;
    const c = document.createElement('canvas');
    c.width = 110;
    c.height = 84;
    const ctx = c.getContext('2d');
    ctx.translate(55, 40);
    if (eq.type === 'lens') {
      // Draw GM lens schematic
      const isTele = (eq.maxMm || 50) >= 70;
      ctx.fillStyle = isTele ? '#e2e8f0' : '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-24, -14, 48, 28, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f97316';
      ctx.fillRect(-24, -14, 4, 28);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-10, -10, 8, 8);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(20, -12, 4, 24);
      drawBadgeLabel(ctx, eq.badge || eq.name, 0, 26, '#0f172a', '#f8fafc');
    } else {
      const scale = (eq.vectorShape === 'pavotube_30c' || eq.vectorShape === 'godox_tl120' || eq.vectorShape === 'prop_choir' || eq.vectorShape === 'prop_cyc') ? 0.65 : 0.95;
      ctx.scale(scale, scale);
      drawVectorShape(ctx, eq.vectorShape, {
        color: eq.defaultColor || '#f59e0b',
        badge: eq.badge || eq.name.slice(0, 8),
        camNumber: eq.badge || 'CAM',
        focalLengthMm: 50
      });
    }
    return c.toDataURL('image/png');
  }

  global.CineLightVectors = {
    drawVectorShape,
    generateEquipmentThumbnailDataURL,
    getCachedImage
  };
})(window);
