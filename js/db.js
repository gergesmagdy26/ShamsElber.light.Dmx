/**
 * CineLight & DMX Stage Planner
 * Database, Auth, Pre-Loaded Equipment & Venues, and Automated DMX512 Engine
 */

(function (global) {
  'use strict';

  const DB_NAME = 'CineLightDMX_IndexedDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'app_state';
  const LS_PREFIX = 'cinelight_dmx_v1_';

  // Default Pre-Loaded Categories
  function getInitialCategories() {
    return [
      { id: 'cat_fixtures', nameAr: 'كشافات', nameEn: 'Lighting Fixtures', type: 'fixture', icon: '💡' },
      { id: 'cat_light_accessories', nameAr: 'إكسسوارات إضاءة', nameEn: 'Lighting Accessories', type: 'accessory', icon: '🔆' },
      { id: 'cat_cameras', nameAr: 'كاميرات', nameEn: 'Cameras', type: 'camera', icon: '🎥' },
      { id: 'cat_lenses', nameAr: 'عدسات', nameEn: 'Lenses', type: 'lens', icon: '🔭' },
      { id: 'cat_stands', nameAr: 'استاندات وترايبود', nameEn: 'Stands & Tripods', type: 'stand', icon: '🗼' },
      { id: 'cat_props', nameAr: 'أشخاص وديكور', nameEn: 'People & Set/Decor', type: 'prop', icon: '🧍' }
    ];
  }

  // Default Pre-Loaded Equipment (All required models from Section 4)
  function getInitialEquipment() {
    return [
      // --- A. LIGHTING FIXTURES (15 models) ---
      {
        id: 'eq_sz200bi',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Godox SZ200Bi',
        badge: 'SZ200Bi',
        vectorShape: 'godox_sz200bi',
        footprint: 16,
        watts: 200,
        defaultKelvin: '5600K',
        defaultColor: '#fff3d6',
        defaultColorName: 'Bi-Color 5600K',
        beamAngle: 35,
        beamLength: 4.5,
        customImage: null,
        description: 'Bi-Color Zoom COB (2800K-6500K) with side zoom dial'
      },
      {
        id: 'eq_sz150r',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Godox SZ150R',
        badge: 'SZ150R',
        vectorShape: 'godox_sz150r',
        footprint: 16,
        watts: 150,
        defaultKelvin: '5600K',
        defaultColor: '#38bdf8',
        defaultColorName: 'RGB Cyan',
        beamAngle: 36,
        beamLength: 4.2,
        customImage: null,
        description: 'RGBBi Zoom COB with RGB indicator & zoom knob'
      },
      {
        id: 'eq_s30',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Godox S30',
        badge: 'S30',
        vectorShape: 'godox_s30',
        footprint: 0,
        watts: 30,
        defaultKelvin: '5600K',
        defaultColor: '#fef08a',
        defaultColorName: 'Daylight Spot',
        beamAngle: 18,
        beamLength: 3.8,
        customImage: null,
        description: 'Compact Focusing LED Spot with narrow barn doors'
      },
      {
        id: 'eq_forza500',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Nanlite Forza 500',
        badge: 'F500',
        vectorShape: 'nanlite_f500',
        footprint: 16,
        watts: 500,
        defaultKelvin: '5600K',
        defaultColor: '#ffffff',
        defaultColorName: 'Daylight 5600K',
        beamAngle: 48,
        beamLength: 6.0,
        customImage: null,
        description: 'Large polygonal carbon-style monolayer COB with angled yoke'
      },
      {
        id: 'eq_forza300',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Nanlite Forza 300',
        badge: 'F300',
        vectorShape: 'nanlite_f300',
        footprint: 16,
        watts: 300,
        defaultKelvin: '5600K',
        defaultColor: '#fffbeb',
        defaultColorName: 'Daylight 5600K',
        beamAngle: 44,
        beamLength: 5.0,
        customImage: null,
        description: 'Medium polygonal carbon-style body with angled yoke'
      },
      {
        id: 'eq_pavotube30c',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Nanlite PavoTube 30C',
        badge: '30C',
        vectorShape: 'pavotube_30c',
        footprint: 0,
        watts: 32,
        defaultKelvin: '5600K',
        defaultColor: '#22d3ee',
        defaultColorName: 'Ice Cyan',
        beamAngle: 110,
        beamLength: 2.6,
        customImage: null,
        description: '120cm RGBWW Tube with octagonal T12 ends'
      },
      {
        id: 'eq_tl120',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Godox TL120',
        badge: 'TL120',
        vectorShape: 'godox_tl120',
        footprint: 0,
        watts: 30,
        defaultKelvin: '5600K',
        defaultColor: '#a855f7',
        defaultColorName: 'RGB Purple',
        beamAngle: 110,
        beamLength: 2.6,
        customImage: null,
        description: '120cm long cylindrical RGB tube light'
      },
      {
        id: 'eq_tl30',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Godox TL30',
        badge: 'TL30',
        vectorShape: 'godox_tl30',
        footprint: 0,
        watts: 8,
        defaultKelvin: '5600K',
        defaultColor: '#fb923c',
        defaultColorName: 'Warm Amber',
        beamAngle: 100,
        beamLength: 1.8,
        customImage: null,
        description: 'Short 30cm magnetic cylindrical RGB tube'
      },
      {
        id: 'eq_led6r',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Godox LED 6R',
        badge: '6R',
        vectorShape: 'godox_6r',
        footprint: 0,
        watts: 6,
        defaultKelvin: '5600K',
        defaultColor: '#f43f5e',
        defaultColorName: 'Accent Red',
        beamAngle: 75,
        beamLength: 1.6,
        customImage: null,
        description: 'Compact rectangular pocket RGB panel'
      },
      {
        id: 'eq_beamsr300',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Beam SR300',
        badge: 'SR300',
        vectorShape: 'beam_sr300',
        footprint: 16,
        watts: 300,
        defaultKelvin: '6500K',
        defaultColor: '#60a5fa',
        defaultColorName: 'Sharp Beam Blue',
        beamAngle: 8,
        beamLength: 7.5,
        customImage: null,
        description: 'Moving Head base + yoke + narrow sharp beam lens head'
      },
      {
        id: 'eq_blinder4',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'Blinder 4-Way',
        badge: 'Blinder 4',
        vectorShape: 'blinder_4way',
        footprint: 16,
        watts: 400,
        defaultKelvin: '3200K',
        defaultColor: '#fbbf24',
        defaultColorName: 'Tungsten Warm',
        beamAngle: 68,
        beamLength: 4.5,
        customImage: null,
        description: 'Rectangular housing with 4 circular lamp cells in 2x2 grid'
      },
      {
        id: 'eq_wash37x15',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'MeanReal Wash 37x15',
        badge: 'Wash 37x15',
        vectorShape: 'wash_37x15',
        footprint: 37,
        watts: 600,
        defaultKelvin: '5600K',
        defaultColor: '#34d399',
        defaultColorName: 'Emerald Wash',
        beamAngle: 52,
        beamLength: 5.5,
        customImage: null,
        description: 'Large Moving Head Wash with multi-cell 37 LED honeycomb lens'
      },
      {
        id: 'eq_par',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'PAR',
        badge: 'PAR',
        vectorShape: 'par_led_rgb',
        footprint: 16,
        watts: 180,
        defaultKelvin: '3200K',
        defaultColor: '#fbbf24',
        defaultColorName: 'Warm PAR',
        beamAngle: 30,
        beamLength: 4.0,
        customImage: null,
        description: 'Standard Stage PAR Can (16 Ch Default)'
      },
      {
        id: 'eq_parled',
        categoryId: 'cat_fixtures',
        type: 'fixture',
        name: 'PAR LED RGB',
        badge: 'PAR RGB',
        vectorShape: 'par_led_rgb',
        footprint: 16,
        watts: 180,
        defaultKelvin: '5600K',
        defaultColor: '#818cf8',
        defaultColorName: 'Indigo RGB',
        beamAngle: 30,
        beamLength: 4.0,
        customImage: null,
        description: 'Classic round PAR Can silhouette with multi-LED face'
      },
      {
        id: 'eq_dmx_splitter',
        categoryId: 'cat_fixtures',
        type: 'fixture',
         isSplitter: true,
        name: 'DMX Splitter',
        badge: 'SPLIT',
        vectorShape: 'dmx_splitter',
        footprint: 0,
        watts: 15,
        defaultKelvin: 'N/A',
        defaultColor: '#94a3b8',
        defaultColorName: 'DMX Opto Iso',
        beamAngle: 0,
        beamLength: 0,
        customImage: null,
        description: 'Signal distribution box with 1 DMX Input and isolated outputs'
      },

      // --- B. CAMERAS (2 models) ---
      {
        id: 'eq_cam_a7s3',
        categoryId: 'cat_cameras',
        type: 'camera',
        name: 'Sony A7S III',
        badge: 'A7S III',
        vectorShape: 'sony_alpha',
        defaultIso: 12800,
        defaultShutter: '1/50',
        defaultKelvin: '5600K',
        customImage: null,
        description: 'Full-Frame 4K120p Cinema Mirrorless (Dual Base ISO 640 / 12800)'
      },
      {
        id: 'eq_cam_a73',
        categoryId: 'cat_cameras',
        type: 'camera',
        name: 'Sony A7 III',
        badge: 'A7 III',
        vectorShape: 'sony_alpha',
        defaultIso: 800,
        defaultShutter: '1/50',
        defaultKelvin: '5600K',
        customImage: null,
        description: 'Full-Frame 24.2MP Hybrid Mirrorless Camera'
      },

      // --- C. LENSES (Sony G-Master Series - 6 models) ---
      {
        id: 'eq_lens_16_35',
        categoryId: 'cat_lenses',
        type: 'lens',
        name: '16-35mm GM',
        badge: '16-35 GM',
        minMm: 16,
        maxMm: 35,
        defaultMm: 24,
        maxAperture: 'f/2.8',
        isPrime: false,
        description: 'Sony FE 16-35mm f/2.8 GM Wide-Angle Zoom'
      },
      {
        id: 'eq_lens_24_70',
        categoryId: 'cat_lenses',
        type: 'lens',
        name: '24-70mm GM',
        badge: '24-70 GM',
        minMm: 24,
        maxMm: 70,
        defaultMm: 35,
        maxAperture: 'f/2.8',
        isPrime: false,
        description: 'Sony FE 24-70mm f/2.8 GM Standard Zoom'
      },
      {
        id: 'eq_lens_50',
        categoryId: 'cat_lenses',
        type: 'lens',
        name: '50mm GM',
        badge: '50mm GM',
        minMm: 50,
        maxMm: 50,
        defaultMm: 50,
        maxAperture: 'f/1.2',
        isPrime: true,
        description: 'Sony FE 50mm f/1.2 GM Prime Lens'
      },
      {
        id: 'eq_lens_85',
        categoryId: 'cat_lenses',
        type: 'lens',
        name: '85mm GM',
        badge: '85mm GM',
        minMm: 85,
        maxMm: 85,
        defaultMm: 85,
        maxAperture: 'f/1.4',
        isPrime: true,
        description: 'Sony FE 85mm f/1.4 GM Portrait Prime Lens'
      },
      {
        id: 'eq_lens_70_200',
        categoryId: 'cat_lenses',
        type: 'lens',
        name: '70-200mm GM',
        badge: '70-200 GM',
        minMm: 70,
        maxMm: 200,
        defaultMm: 105,
        maxAperture: 'f/2.8',
        isPrime: false,
        description: 'Sony FE 70-200mm f/2.8 GM OSS Telephoto Zoom'
      },
      {
        id: 'eq_lens_70_200_2',
        categoryId: 'cat_lenses',
        type: 'lens',
        name: '70-200mm GM II',
        badge: '70-200 GM II',
        minMm: 70,
        maxMm: 200,
        defaultMm: 135,
        maxAperture: 'f/2.8',
        isPrime: false,
        description: 'Sony FE 70-200mm f/2.8 GM OSS II Lightweight Telephoto'
      },

      // --- D. STANDS & TRIPODS (7 models) ---
      {
        id: 'eq_stand_silver',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'lighting_stand',
        name: 'Silver Stand (استاند فضي)',
        nameEn: 'Silver Stand',
        badge: 'Silver St',
        vectorShape: 'stand_silver',
        defaultHeight: 2.4,
        description: 'Heavy-Duty Chrome/Silver Lighting Floor Stand'
      },
      {
        id: 'eq_stand_black',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'lighting_stand',
        name: 'Black Stand (استاند أسود)',
        nameEn: 'Black Stand',
        badge: 'Black St',
        vectorShape: 'stand_black',
        defaultHeight: 2.2,
        description: 'Matte Black Studio Aluminum Lighting Stand'
      },
      {
        id: 'eq_stand_cstand',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'lighting_stand',
        name: 'C-Stand (سي استاند)',
        nameEn: 'C-Stand',
        badge: 'C-Stand',
        vectorShape: 'stand_cstand',
        defaultHeight: 2.6,
        description: 'Century Stand with Turtle Base & Gobo Arm'
      },
      {
        id: 'eq_stand_clamp',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'lighting_clamp',
        name: 'Ceiling Grid / Truss Clamp (تعليق مباشر)',
        nameEn: 'Ceiling Grid / Truss Clamp',
        badge: 'Grid/Truss',
        vectorShape: 'stand_clamp',
        defaultHeight: 4.5,
        description: 'Overhead Pipe Clamp / Pantograph Direct Suspension'
      },
      {
        id: 'eq_tripod_608',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'camera_tripod',
        name: 'Manfrotto 608',
        nameEn: 'Manfrotto 608',
        badge: 'M-608',
        vectorShape: 'tripod_608',
        defaultHeight: 1.5,
        description: 'Manfrotto Nitrotech 608 Fluid Video Head & Carbon Tripod'
      },
      {
        id: 'eq_tripod_504',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'camera_tripod',
        name: 'Manfrotto 504',
        nameEn: 'Manfrotto 504',
        badge: 'M-504',
        vectorShape: 'tripod_504',
        defaultHeight: 1.5,
        description: 'Manfrotto 504X Fluid Video Head & Twin Leg Tripod'
      },
      {
        id: 'eq_tripod_vinten',
        categoryId: 'cat_stands',
        type: 'stand',
        subtype: 'camera_tripod',
        name: 'Vinten',
        nameEn: 'Vinten',
        badge: 'Vinten',
        vectorShape: 'tripod_vinten',
        defaultHeight: 1.6,
        description: 'Vinten Vision Broadcast Pedestal / Fluid Tripod'
      },

      // --- E. MAGNETIC LIGHTING ACCESSORIES (إكسسوارات إضاءة - 5 models) ---
      {
        id: 'eq_acc_octa90',
        categoryId: 'cat_light_accessories',
        type: 'accessory',
        name: 'Octa 90',
        nameEn: 'Octa 90 Softbox',
        badge: 'Octa 90',
        vectorShape: 'acc_octa90',
        footprint: 0,
        watts: 0,
        frontOffset: 0.55,
        diameter: 0.9,
        size: { w: 0.9, d: 0.6, h: 0.9 },
        model3d: 'octabox',
        description: '90cm Octagonal Softbox with Grid & Diffuser (Magnetic Front Snap)'
      },
      {
        id: 'eq_acc_fresnel_lens',
        categoryId: 'cat_light_accessories',
        type: 'accessory',
        name: 'Nanlite Fresnel Lens',
        nameEn: 'Nanlite Fresnel Lens',
        badge: 'Fresnel',
        vectorShape: 'acc_fresnel_lens',
        footprint: 0,
        watts: 0,
        frontOffset: 0.28,
        diameter: 0.34,
        size: { w: 0.36, d: 0.28, h: 0.36 },
        model3d: 'fresnel_lens',
        description: 'Bowens Mount Focusing Fresnel Lens with Barn Doors (Magnetic Front Snap)'
      },
      {
        id: 'eq_acc_para_gp4_120',
        categoryId: 'cat_light_accessories',
        type: 'accessory',
        name: 'Parabolic GP4 120',
        nameEn: 'Parabolic GP4 120',
        badge: 'GP4 120',
        vectorShape: 'acc_para_gp4_120',
        footprint: 0,
        watts: 0,
        frontOffset: 0.62,
        diameter: 1.2,
        size: { w: 1.2, d: 0.85, h: 1.2 },
        model3d: 'parabolic',
        description: '120cm Deep 16-Rod Parabolic Softbox Modifier (Magnetic Front Snap)'
      },
      {
        id: 'eq_acc_para_gp4_90',
        categoryId: 'cat_light_accessories',
        type: 'accessory',
        name: 'Parabolic GP4 90',
        nameEn: 'Parabolic GP4 90',
        badge: 'GP4 90',
        vectorShape: 'acc_para_gp4_90',
        footprint: 0,
        watts: 0,
        frontOffset: 0.52,
        diameter: 0.9,
        size: { w: 0.9, d: 0.65, h: 0.9 },
        model3d: 'parabolic',
        description: '90cm Deep 16-Rod Parabolic Softbox Modifier (Magnetic Front Snap)'
      },
      {
        id: 'eq_acc_tube_grid',
        categoryId: 'cat_light_accessories',
        type: 'accessory',
        name: 'جريد تيوب (Tube Grid)',
        nameEn: 'Tube Grid',
        badge: 'Tube Grid',
        vectorShape: 'acc_tube_grid',
        footprint: 0,
        watts: 0,
        frontOffset: 0.16,
        diameter: 1.2,
        size: { w: 1.2, d: 0.18, h: 0.18 },
        model3d: 'tube_grid',
        description: '45° Eggcrate Fabric Louver Grid for LED Tube Lights (Magnetic Front Snap)'
      },

      // --- F. SUBJECTS & SET PROPS (أشخاص وديكور - Expanded 14 models) ---
      {
        id: 'eq_prop_standing',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'subject',
        name: 'Standing Talent (شخص واقف)',
        nameEn: 'Standing Talent',
        badge: 'Subject',
        vectorShape: 'prop_person_standing',
        model3d: 'person_standing',
        defaultHeight: 1.75,
        widthM: 0.6,
        depthM: 0.5,
        size: { w: 0.6, d: 0.5, h: 1.75 },
        description: 'Talent / Subject Standing (Target for Distance Meter)'
      },
      {
        id: 'eq_prop_seated',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'subject',
        name: 'Seated Talent (شخص جالس)',
        nameEn: 'Seated Talent',
        badge: 'Seated',
        vectorShape: 'prop_person_seated',
        model3d: 'person_seated',
        defaultHeight: 1.3,
        widthM: 0.65,
        depthM: 0.65,
        size: { w: 0.65, d: 0.65, h: 1.3 },
        description: 'Talent / Guest Seated on Chair'
      },
      {
        id: 'eq_prop_presenter',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'subject',
        name: 'Presenter/Host (مذيع / مقدم)',
        nameEn: 'Presenter/Host',
        badge: 'Host',
        vectorShape: 'prop_presenter',
        model3d: 'person_standing',
        defaultHeight: 1.78,
        widthM: 0.65,
        depthM: 0.55,
        size: { w: 0.65, d: 0.55, h: 1.78 },
        description: 'Main Anchor / Host / Priest / Speaker'
      },
      {
        id: 'eq_prop_choir',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'subject',
        name: 'Choir/Group (كورال / مجموعة)',
        nameEn: 'Choir/Group',
        badge: 'Choir',
        vectorShape: 'prop_choir',
        model3d: 'choir',
        defaultHeight: 1.75,
        widthM: 3.0,
        depthM: 1.4,
        size: { w: 3.0, d: 1.4, h: 1.75 },
        description: 'Choir Ensemble / Group Riser Block'
      },
      {
        id: 'eq_prop_podcast_table',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Podcast Table with Mics (طاولة بودكاست بمايكات)',
        nameEn: 'Podcast Table with Mics',
        badge: 'Podcast',
        vectorShape: 'prop_podcast_table',
        model3d: 'podcast_table',
        defaultHeight: 0.85,
        widthM: 2.0,
        depthM: 1.1,
        size: { w: 2.0, d: 1.1, h: 0.85 },
        description: 'Round/Oval Studio Podcast Table with 4 Broadcast Boom Microphones'
      },
      {
        id: 'eq_prop_interview_chairs',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Interview Chairs (كراسي حوار مزدوجة)',
        nameEn: 'Interview Chairs',
        badge: '2 Chairs',
        vectorShape: 'prop_interview_chairs',
        model3d: 'interview_chairs',
        defaultHeight: 0.92,
        widthM: 1.7,
        depthM: 0.85,
        size: { w: 1.7, d: 0.85, h: 0.92 },
        description: 'Angled Pair of Studio Armchairs with Side Accent Table'
      },
      {
        id: 'eq_prop_sofa',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Sofa / Couch (كنبة استوديو)',
        nameEn: 'Sofa / Couch',
        badge: 'Sofa',
        vectorShape: 'prop_sofa',
        model3d: 'sofa',
        defaultHeight: 0.88,
        widthM: 2.2,
        depthM: 0.95,
        size: { w: 2.2, d: 0.95, h: 0.88 },
        description: '3-Seater Talk Show Studio Lounge Sofa / Couch'
      },
      {
        id: 'eq_prop_presenter_desk',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Presenter Desk (مكتب مذيع أخبار)',
        nameEn: 'Presenter Desk',
        badge: 'Anchor Desk',
        vectorShape: 'prop_presenter_desk',
        model3d: 'desk',
        defaultHeight: 0.95,
        widthM: 2.2,
        depthM: 1.05,
        size: { w: 2.2, d: 1.05, h: 0.95 },
        description: 'Curved Broadcast News Anchor / Presenter Desk with Monitor & Mic'
      },
      {
        id: 'eq_prop_table',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Table (طاولة)',
        nameEn: 'Table',
        badge: 'Table',
        vectorShape: 'prop_table',
        model3d: 'desk',
        defaultHeight: 0.8,
        widthM: 1.8,
        depthM: 0.9,
        size: { w: 1.8, d: 0.9, h: 0.8 },
        description: 'Studio Desk / Interview Table'
      },
      {
        id: 'eq_prop_chair',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Chair (كرسي)',
        nameEn: 'Chair',
        badge: 'Chair',
        vectorShape: 'prop_chair',
        model3d: 'chair',
        defaultHeight: 0.9,
        widthM: 0.6,
        depthM: 0.6,
        size: { w: 0.6, d: 0.6, h: 0.9 },
        description: 'Studio Armchair / Guest Seat'
      },
      {
        id: 'eq_prop_stage_podium',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Stage Podium (منصة خطابة / بوديوم)',
        nameEn: 'Stage Podium',
        badge: 'Podium',
        vectorShape: 'prop_stage_podium',
        model3d: 'podium',
        defaultHeight: 1.25,
        widthM: 0.9,
        depthM: 0.75,
        size: { w: 0.9, d: 0.75, h: 1.25 },
        description: 'Conference / Stage Speaker Lectern Podium with Gooseneck Mics'
      },
      {
        id: 'eq_prop_altar',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Altar/Podium (منبر / هيكل)',
        nameEn: 'Altar/Podium',
        badge: 'Altar',
        vectorShape: 'prop_altar',
        model3d: 'podium',
        defaultHeight: 1.2,
        widthM: 2.2,
        depthM: 1.1,
        size: { w: 2.2, d: 1.1, h: 1.2 },
        description: 'Sanctuary Altar / Lectern / Podium'
      },
      {
        id: 'eq_prop_cyc',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Cyclorama / Green Screen Wall (سايكلوراما / كروما)',
        nameEn: 'Cyclorama / Green Screen Wall',
        badge: 'Cyc Wall',
        vectorShape: 'prop_cyc',
        model3d: 'cyclorama',
        defaultHeight: 4.2,
        widthM: 6.0,
        depthM: 0.8,
        size: { w: 6.0, d: 0.8, h: 4.2 },
        description: 'Curved Studio Cyclorama / Green Screen Backdrop Wall'
      },
      {
        id: 'eq_prop_drum_riser',
        categoryId: 'cat_props',
        type: 'prop',
        subtype: 'prop',
        name: 'Drum Kit / Band Riser (طقم درامز ورايزر فرقة)',
        nameEn: 'Drum Kit / Band Riser',
        badge: 'Drum Kit',
        vectorShape: 'prop_drum_riser',
        model3d: 'drum_riser',
        defaultHeight: 1.45,
        widthM: 2.6,
        depthM: 2.2,
        size: { w: 2.6, d: 2.2, h: 1.45 },
        description: 'Elevated Band Riser Platform with Acoustic Drum Kit & Cymbals'
      }
    ];
  }

  // Default Pre-Loaded Fixed Venue Templates (Section 5)
  function getInitialVenues() {
    return [
      {
        id: 'venue_plateau_default',
        name: 'بلاتوه الاستوديو الرئيسي (Main TV Studio Plateau)',
        type: 'plateau',
        width: 14, // X dimension in meters
        length: 10, // Y dimension in meters
        height: 4.5, // Ceiling height in meters
        snapRadius: 0.45,
        gridConfig: {
          mode: 'custom',
          // Widthwise horizontal pipes (Y positions in meters from top wall)
          horizontalPipes: [1.5, 3.0, 4.5, 6.0, 7.5, 8.8],
          // Lengthwise vertical pipes (X positions in meters from left wall)
          verticalPipes: [2.0, 4.0, 6.0, 8.0, 10.0, 12.0]
        },
        notes: 'Fixed Studio Ceiling Grid with 6 horizontal and 6 vertical numbered steel pipes.'
      },
      {
        id: 'venue_church_default',
        name: 'كنيسة الملاك',
        type: 'church',
        width: 16,
        length: 22,
        height: 7.5,
        snapRadius: 0.5,
        churchConfig: {
          sanctuaryDepth: 5.0, // Raised altar/sanctuary at front (top)
          sanctuaryElevation: 0.6,
          naveWidth: 16,
          sideAisleOffset: 2.6, // Distance of left/right column rows from side walls
          columnsPerSide: 5, // 5 columns left, 5 columns right with exact spacing
          centerAisleWidth: 2.4,
          pewRows: 6,
          pewGap: 1.8,
          pewAltarOffset: 1.8,
          mountPipesY: [3.5, 6.5, 10.5, 14.5, 18.5] // Fixed overhead / cross-beam mounting bars
        },
        notes: 'Saved Church preset (كنيسة الملاك) with raised Sanctuary/Altar, side Pillars/Columns, configurable pews/chairs count, row spacing, altar offset, and mounting points.'
      },
      {
        id: 'venue_truss_default',
        name: 'تراس مسرح وحفلات (Stage Box Truss + Crossbars)',
        type: 'truss',
        width: 12,
        length: 9,
        height: 5.5,
        snapRadius: 0.45,
        trussConfig: {
          shape: 'box', // 'straight' | 'l-shape' | 'u-shape' | 'box'
          trussWidth: 9.0,
          trussDepth: 6.5,
          trimHeight: 5.0,
          trussThickness: 1.0,
          // Custom intersecting steel pipes cutting across the truss horizontally or vertically
          crossbars: [
            { id: 'cb_1', orientation: 'horizontal', position: 2.2, label: 'Crossbar H1' },
            { id: 'cb_2', orientation: 'horizontal', position: 4.3, label: 'Crossbar H2' },
            { id: 'cb_3', orientation: 'vertical', position: 4.5, label: 'Center Spine V1' }
          ]
        },
        notes: 'Closed Box Truss rig with intersecting horizontal & vertical steel pipes.'
      },
      {
        id: 'venue_free_default',
        name: 'لوكيشن تصوير حر (Open Free Location)',
        type: 'free',
        width: 12,
        length: 10,
        height: 3.5,
        snapRadius: 0.35,
        notes: 'Open meter-grid floor where all fixtures use floor stands and cameras use tripods.'
      }
    ];
  }

  // Create a sample starter project so a new user can also inspect a ready-made plot immediately
  function createStarterProject() {
    const venue = JSON.parse(JSON.stringify(getInitialVenues()[0]));
    const sceneId = 'scene_' + Date.now();
    const project = {
      id: 'proj_starter_1',
      name: 'إضاءة برنامج حواري - بلاتوه 1 (Talk Show Studio Setup)',
      dop: 'DOP Studio Lead',
      programmer: 'DMX Lead Programmer',
      venueId: venue.id,
      venueType: venue.type,
      venueName: venue.name,
      venueConfig: venue,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeSceneId: sceneId,
      showDmxWiring: true,
      showDistanceLines: true,
      showInfoFlags: {
        // Fixtures (Section 5.1: Do NOT auto-display DMX Address, Channel, or Fixture # by default)
        lightBeam: true,
        fixtureName: false,
        fixtureNum: false,
        channel: false,
        address: false,
        dimmer: false,
        kelvin: false,
        color: false,
        // Cameras
        cameraCone: true,
        camNum: false,
        lensZoom: false,
        fStop: false,
        iso: false,
        camKelvin: false,
        stLook: false
      },
      scenes: [
        {
          id: sceneId,
          name: 'Scene 1 - Main Interview Look',
          customDmxCables: [],
          items: [
            // Props & Subjects
            {
              id: 'item_prop_table_1',
              itemType: 'prop',
              equipmentId: 'eq_prop_table',
              subtype: 'prop',
              name: 'Table',
              label: 'Interview Desk',
              vectorShape: 'prop_table',
              x: 7.0,
              y: 4.2,
              z: 0.8,
              rotation: 0,
              widthM: 1.8,
              depthM: 0.9
            },
            {
              id: 'item_subj_host',
              itemType: 'prop',
              equipmentId: 'eq_prop_presenter',
              subtype: 'subject',
              name: 'Presenter/Host',
              label: 'Host (المذيع)',
              vectorShape: 'prop_presenter',
              x: 6.1,
              y: 3.5,
              z: 1.75,
              rotation: 75,
              widthM: 0.65,
              depthM: 0.55
            },
            {
              id: 'item_subj_guest',
              itemType: 'prop',
              equipmentId: 'eq_prop_seated',
              subtype: 'subject',
              name: 'Seated Person',
              label: 'Guest (الضيف)',
              vectorShape: 'prop_person_seated',
              x: 7.9,
              y: 3.5,
              z: 1.35,
              rotation: 105,
              widthM: 0.65,
              depthM: 0.65
            },
            // Fixtures on Channel A
            {
              id: 'item_fix_1',
              itemType: 'fixture',
              equipmentId: 'eq_forza500',
              name: 'Nanlite Forza 500',
              label: 'Key Light Host',
              badge: 'F500',
              vectorShape: 'nanlite_f500',
              x: 4.0,
              y: 6.0,
              z: 4.2,
              rotation: -52,
              channel: 'Channel A',
              fixtureNum: 1,
              footprint: 16,
              startAddress: 1,
              endAddress: 16,
              manualAddress: false,
              dimmer: 85,
              kelvin: '5600K',
              color: '#fff8e7',
              colorName: '5600K Clean',
              watts: 500,
              beamAngle: 45,
              beamLength: 4.0,
              mountType: 'Ceiling Grid / Truss Clamp',
              powerLine: 'Power Line 1',
              snappedPipe: 'H4 / V2'
            },
            {
              id: 'item_fix_2',
              itemType: 'fixture',
              equipmentId: 'eq_forza300',
              name: 'Nanlite Forza 300',
              label: 'Key Light Guest',
              badge: 'F300',
              vectorShape: 'nanlite_f300',
              x: 10.0,
              y: 6.0,
              z: 4.2,
              rotation: -128,
              channel: 'Channel A',
              fixtureNum: 2,
              footprint: 16,
              startAddress: 17,
              endAddress: 32,
              manualAddress: false,
              dimmer: 80,
              kelvin: '5600K',
              color: '#fff8e7',
              colorName: '5600K Clean',
              watts: 300,
              beamAngle: 42,
              beamLength: 4.0,
              mountType: 'Ceiling Grid / Truss Clamp',
              powerLine: 'Power Line 1',
              snappedPipe: 'H4 / V5'
            },
            {
              id: 'item_fix_3',
              itemType: 'fixture',
              equipmentId: 'eq_sz150r',
              name: 'Godox SZ150R',
              label: 'Back Rim Host',
              badge: 'SZ150R',
              vectorShape: 'godox_sz150r',
              x: 6.0,
              y: 1.5,
              z: 4.2,
              rotation: 88,
              channel: 'Channel A',
              fixtureNum: 3,
              footprint: 16,
              startAddress: 33,
              endAddress: 48,
              manualAddress: false,
              dimmer: 65,
              kelvin: '4300K',
              color: '#38bdf8',
              colorName: 'Steel Blue Rim',
              watts: 150,
              beamAngle: 34,
              beamLength: 3.0,
              mountType: 'Ceiling Grid / Truss Clamp',
              powerLine: 'Power Line 2',
              snappedPipe: 'H1 / V3'
            },
            {
              id: 'item_fix_4',
              itemType: 'fixture',
              equipmentId: 'eq_sz200bi',
              name: 'Godox SZ200Bi',
              label: 'Back Rim Guest',
              badge: 'SZ200Bi',
              vectorShape: 'godox_sz200bi',
              x: 8.0,
              y: 1.5,
              z: 4.2,
              rotation: 92,
              channel: 'Channel A',
              fixtureNum: 4,
              footprint: 16,
              startAddress: 49,
              endAddress: 64,
              manualAddress: false,
              dimmer: 70,
              kelvin: '3200K',
              color: '#fde68a',
              colorName: 'Warm CTO Rim',
              watts: 200,
              beamAngle: 35,
              beamLength: 3.0,
              mountType: 'Ceiling Grid / Truss Clamp',
              powerLine: 'Power Line 2',
              snappedPipe: 'H1 / V4'
            },
            // Fixtures on Channel B
            {
              id: 'item_fix_5',
              itemType: 'fixture',
              equipmentId: 'eq_wash37x15',
              name: 'MeanReal Wash 37x15',
              label: 'Set Wash Left',
              badge: 'Wash 37x15',
              vectorShape: 'wash_37x15',
              x: 4.0,
              y: 3.0,
              z: 4.2,
              rotation: -60,
              channel: 'Channel B',
              fixtureNum: 1,
              footprint: 37,
              startAddress: 1,
              endAddress: 37,
              manualAddress: false,
              dimmer: 60,
              kelvin: '5600K',
              color: '#34d399',
              colorName: 'Teal BG Wash',
              watts: 600,
              beamAngle: 50,
              beamLength: 3.5,
              mountType: 'Ceiling Grid / Truss Clamp',
              powerLine: 'Power Line 3',
              snappedPipe: 'H2 / V2'
            },
            {
              id: 'item_fix_6',
              itemType: 'fixture',
              equipmentId: 'eq_beamsr300',
              name: 'Beam SR300',
              label: 'Accent Beam R',
              badge: 'SR300',
              vectorShape: 'beam_sr300',
              x: 10.0,
              y: 3.0,
              z: 4.2,
              rotation: -120,
              channel: 'Channel B',
              fixtureNum: 2,
              footprint: 16,
              startAddress: 38,
              endAddress: 53,
              manualAddress: false,
              dimmer: 75,
              kelvin: '6500K',
              color: '#60a5fa',
              colorName: 'Royal Blue',
              watts: 300,
              beamAngle: 10,
              beamLength: 4.5,
              mountType: 'Ceiling Grid / Truss Clamp',
              powerLine: 'Power Line 3',
              snappedPipe: 'H2 / V5'
            },
            // Cameras
            {
              id: 'item_cam_1',
              itemType: 'camera',
              equipmentId: 'eq_cam_a7s3',
              camNumber: 'Cam 1',
              cameraBody: 'Sony A7S III',
              lensModel: '24-70mm GM',
              minMm: 24,
              maxMm: 70,
              focalLengthMm: 35,
              tripodModel: 'Manfrotto 608',
              fStop: 'f/2.8',
              iso: '800',
              shutter: '1/50',
              kelvin: '5600K',
              stLook: {
                contrast: 2,
                highlights: -2,
                shadows: -1,
                fade: 0,
                saturation: 1,
                sharpness: 4,
                sharpnessRange: 3,
                clarity: 2
              },
              x: 7.0,
              y: 8.2,
              z: 1.5,
              rotation: -90,
              fovDistance: 4.7
            },
            {
              id: 'item_cam_2',
              itemType: 'camera',
              equipmentId: 'eq_cam_a7s3',
              camNumber: 'Cam 2',
              cameraBody: 'Sony A7S III',
              lensModel: '70-200mm GM II',
              minMm: 70,
              maxMm: 200,
              focalLengthMm: 85,
              tripodModel: 'Vinten',
              fStop: 'f/2.8',
              iso: '800',
              shutter: '1/50',
              kelvin: '5600K',
              stLook: {
                contrast: 1,
                highlights: -3,
                shadows: 0,
                fade: 0,
                saturation: 0,
                sharpness: 3,
                sharpnessRange: 2,
                clarity: 1
              },
              x: 4.2,
              y: 7.8,
              z: 1.55,
              rotation: -52,
              fovDistance: 5.5
            },
            {
              id: 'item_cam_3',
              itemType: 'camera',
              equipmentId: 'eq_cam_a73',
              camNumber: 'Cam 3',
              cameraBody: 'Sony A7 III',
              lensModel: '85mm GM',
              minMm: 85,
              maxMm: 85,
              focalLengthMm: 85,
              tripodModel: 'Manfrotto 504',
              fStop: 'f/1.8',
              iso: '800',
              shutter: '1/50',
              kelvin: '5600K',
              stLook: {
                contrast: 2,
                highlights: -2,
                shadows: -1,
                fade: 0,
                saturation: 1,
                sharpness: 4,
                sharpnessRange: 3,
                clarity: 2
              },
              x: 9.8,
              y: 7.8,
              z: 1.5,
              rotation: -128,
              fovDistance: 5.5
            }
          ]
        }
      ]
    };
    recalculateDMXAddresses(project.scenes[0]);
    return project;
  }

  /**
   * CRITICAL DMX512 CALCULATION ENGINE (Section 7.A.5)
   * - Each Output Channel (Channel A, Channel B, Channel C, Channel D... H) starts independently from 1 to 512.
   * - On any given Channel, fixtures are sorted by their `Fixture #` (1, 2, 3...).
   * - Start Address of Fixture #N = 1 + Sum of (DMX Footprints of Fixtures #1 through #(N-1) on the SAME Channel).
   */
  function recalculateDMXAddresses(scene, priorityItemId) {
    if (!scene || !Array.isArray(scene.items)) return { channels: {}, hasOverflow: false };

    const fixtures = scene.items.filter((it) => it.itemType === 'fixture');
    const byChannel = {};

    fixtures.forEach((fix) => {
      const ch = fix.channel !== undefined && fix.channel !== null ? String(fix.channel).trim() : '';
      fix.channel = ch;
      if (!byChannel[ch]) byChannel[ch] = [];
      byChannel[ch].push(fix);
    });

    let hasOverflow = false;
    const channelStats = {};

    Object.keys(byChannel).sort().forEach((ch) => {
      const list = byChannel[ch];

      // Sort by fixtureNum (Light Number); 0 goes to the end (non-DMX). If two items have the same Light Number, prioritize the recently edited item
      list.sort((a, b) => {
        const rawA = a.fixtureNum !== undefined && a.fixtureNum !== null && a.fixtureNum !== '' ? parseInt(a.fixtureNum, 10) : 1;
        const rawB = b.fixtureNum !== undefined && b.fixtureNum !== null && b.fixtureNum !== '' ? parseInt(b.fixtureNum, 10) : 1;
        const numA = isNaN(rawA) ? 1 : rawA;
        const numB = isNaN(rawB) ? 1 : rawB;
        if (numA === 0 && numB !== 0) return 1;
        if (numB === 0 && numA !== 0) return -1;
        if (numA !== numB) return numA - numB;
        if (a.id === priorityItemId) return -1;
        if (b.id === priorityItemId) return 1;
        return 0;
      });

      // Calculate DMX Start Address sequentially in Light Number order.
      // Fixtures with the SAME Light Number share the EXACT SAME Start Address as one unit!
      let runningAddress = 1;
      let seqNumber = 1;
      let patchedCount = 0;
      const sharedByLightNum = new Map();

      list.forEach((fix) => {
        const footprint = Math.max(0, parseInt(fix.footprint, 10) || 0);
        fix.footprint = footprint;

        const parsedNum = (fix.fixtureNum !== undefined && fix.fixtureNum !== null && fix.fixtureNum !== '')
          ? parseInt(fix.fixtureNum, 10)
          : NaN;

        // Light Number = 0 means disconnected from DMX (Non-DMX)
        if (!isNaN(parsedNum) && parsedNum <= 0) {
          fix.fixtureNum = 0;
          fix.isNonDmx = true;
          fix.startAddress = null;
          fix.endAddress = null;
          fix.dmxOverflow = false;
          return;
        }

        if (fix.isSplitter || footprint <= 0) {
          fix.isNonDmx = !fix.isSplitter && footprint <= 0;
          if (isNaN(parsedNum)) fix.fixtureNum = 0;
          fix.startAddress = null;
          fix.endAddress = null;
          fix.dmxOverflow = false;
          return;
        }

        fix.isNonDmx = false;
        if (!isNaN(parsedNum) && parsedNum >= 1) {
          fix.fixtureNum = parsedNum;
          seqNumber = Math.max(seqNumber, parsedNum + 1);
        } else {
          fix.fixtureNum = seqNumber++;
        }

        const existingGroup = sharedByLightNum.get(fix.fixtureNum);
        if (existingGroup) {
          // Same Light Number => exact same DMX Start Address & treated as one shared DMX unit
          fix.startAddress = existingGroup.startAddress;
          fix.endAddress = fix.startAddress + footprint - 1;
          fix.dmxOverflow = fix.endAddress > 512;
          if (fix.dmxOverflow) hasOverflow = true;
          if (footprint > existingGroup.maxFootprint) {
            existingGroup.maxFootprint = footprint;
            runningAddress = Math.max(runningAddress, existingGroup.startAddress + existingGroup.maxFootprint);
          }
          return;
        }

        patchedCount++;
        if (fix.manualAddress && fix.manualStartAddress >= 1) {
          fix.startAddress = parseInt(fix.manualStartAddress, 10);
        } else {
          fix.startAddress = runningAddress;
        }

        fix.endAddress = fix.startAddress + footprint - 1;
        fix.dmxOverflow = fix.endAddress > 512;
        if (fix.dmxOverflow) hasOverflow = true;

        sharedByLightNum.set(fix.fixtureNum, {
          startAddress: fix.startAddress,
          maxFootprint: footprint
        });

        runningAddress = fix.startAddress + footprint;
      });

      const usedAddresses = Math.max(0, runningAddress - 1);
      channelStats[ch] = {
        count: patchedCount,
        usedAddresses: usedAddresses,
        remainingAddresses: Math.max(0, 512 - usedAddresses),
        overflow: usedAddresses > 512
      };
    });

    return { channels: channelStats, hasOverflow };
  }

  /**
   * Calculate Power Load (Watts & Amps at 220V) per Power Line & Total
   */
  function calculatePowerLoad(scene) {
    const lines = {
      'Power Line 1': { watts: 0, amps: 0, count: 0 },
      'Power Line 2': { watts: 0, amps: 0, count: 0 },
      'Power Line 3': { watts: 0, amps: 0, count: 0 }
    };
    let totalWatts = 0;

    if (scene && Array.isArray(scene.items)) {
      scene.items.forEach((it) => {
        if (it.itemType === 'fixture') {
          const w = parseFloat(it.watts) || 0;
          const pLine = it.powerLine && lines[it.powerLine] ? it.powerLine : 'Power Line 1';
          lines[pLine].watts += w;
          lines[pLine].count += 1;
          totalWatts += w;
        }
      });
    }

    Object.keys(lines).forEach((k) => {
      lines[k].amps = +(lines[k].watts / 220).toFixed(2);
    });

    return {
      totalWatts: Math.round(totalWatts),
      totalAmps: +(totalWatts / 220).toFixed(2),
      lines
    };
  }

  /**
   * Calculate Horizontal Field of View (FOV in degrees) for Full Frame 36mm sensor
   */
  function calculateHorizontalFOV(focalLengthMm) {
    const f = Math.max(8, Math.min(600, parseFloat(focalLengthMm) || 35));
    const radians = 2 * Math.atan(36 / (2 * f));
    return +(radians * (180 / Math.PI)).toFixed(1);
  }

  // IndexedDB Helper with LocalStorage Mirror
  let idbPromise = null;

  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve) => {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      try {
        const req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
    return idbPromise;
  }

  async function idbGet(key) {
    const db = await openIDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => {
            if (req.result !== undefined) {
              resolve(req.result);
            } else {
              resolve(lsGet(key));
            }
          };
          req.onerror = () => resolve(lsGet(key));
        } catch (e) {
          resolve(lsGet(key));
        }
      });
    }
    return lsGet(key);
  }

  const SYNC_TRACKED_META_KEYS = {
    SYNCED_AT: 'project_folder_synced_at',
    MODIFIED_AT: 'project_local_modified_at'
  };

  const projectSyncState = {
    isLocalDiskServer: false,
    serverChecked: false,
    isImporting: false,
    isSaving: false,
    lastSyncedAt: null,
    lastError: null,
    debounceTimer: null,
    pendingFlush: false
  };

  function isSyncTrackedKey(key) {
    return key === 'users' || key === 'app_settings' || String(key || '').indexOf('workspace_') === 0;
  }

  async function rawIdbSet(key, val) {
    lsSet(key, val);
    const db = await openIDB();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(val, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }
    return true;
  }

  async function idbSet(key, val) {
    const ok = await rawIdbSet(key, val);
    if (!projectSyncState.isImporting && isSyncTrackedKey(key)) {
      const nowIso = new Date().toISOString();
      await rawIdbSet(SYNC_TRACKED_META_KEYS.MODIFIED_AT, nowIso);
      scheduleProjectFolderAutoSave();
    }
    return ok;
  }

  function lsGet(key) {
    try {
      const raw = global.localStorage.getItem(LS_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, val) {
    try {
      global.localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
    } catch (e) {
      // Quota exceeded in LocalStorage is safely handled by IndexedDB
    }
  }

  // Default Granular Section & Feature Permissions (covering all sections and tools in the program)
  function getDefaultPermissions() {
    return {
      // 1. Dashboard Sections
      newProjectVenues: true,      // 1. مشروع جديد (إنشاء مشاريع جديدة)
      savedProjects: true,         // 2. المشاريع القديمة (فتح واستعراض المشاريع المحفوظة)
      manageSavedProjects: true,   // نسخ / تسمية / حذف المشاريع المحفوظة
      equipmentManager: true,      // 3. قائمة المعدات والفئات (إضافة وتعديل وحذف المعدات)
      venuesManager: true,         // 4. قائمة الأماكن المحفوظة (إضافة وتعديل مقاسات البلاتوه والتراس والكنيسة)
      paperProject: true,          // 5. المشروع الورقي السريع (فتح وإدارة المشاريع الورقية)
      paperLightSheet: true,       // المشروع الورقي: 1. ورقة الإضاءة والكاميرات (Light Sheet)
      paperDmxSheet: true,         // المشروع الورقي: 2. ورقة الـ DMX وتقسيم المخارج (DMX Sheet)
      paperCameraStLook: true,     // المشروع الورقي: السماح بتعديل وإظهار خانة ST للكاميرا

      // 2. Stage Plot & 2D/3D Workspace Tools
      stagePlotCanvas: true,       // شاشة الرسم والبلان 2D (فتح المخطط وتوزيع وتحريك المعدات)
      view3dMode: true,            // المنظور ثلاثي الأبعاد (3D View & 3D Simulation)
      dmxPatching: true,           // حسابات وأدريسات وكابلات الـ DMX
      cameraSettings: true,        // إعدادات الكاميرات والعدسات و Sony Creative Look ST
      aimAndAlignTools: true,      // لوحة التوجيه (Aim Pad) وأدوات المحاذاة وتوحيد الزاوية والشعاع
      showInfoAndDisplay: true,    // قائمة إظهار البيانات (Show Info) ووضع العرض الكامل (Display)
      powerLoadMonitor: true,      // عداد الأحمال الكهربائية والأمبير لكل خط
      projectSettingsGear: true,   // إعدادات المشروع وتخصيص الشاشة والـ Undo/Redo

      // 3. Exports, Reports & General App Settings
      exportReports: true,         // التصدير والتقارير والطباعة (Print / Word / Excel / PNG / JPG / JSON)
      appGeneralSettings: true     // الإعدادات العامة للبرنامج والنسخ الاحتياطي (اللوجو، الأمبير، ألوان DMX، Backup)
    };
  }

  function normalizeUserKey(username) {
    return String(username || '').trim().toLowerCase();
  }

  // Primary Admin credentials (strict): username 'gerges' / password 'gerges'
  const PRIMARY_ADMIN_KEY = 'gerges';
  const PRIMARY_ADMIN_PASSWORD = 'gerges';
  const LEGACY_ADMIN_KEYS = ['gerges magdy'];

  function isPrimaryAdminKey(key) {
    return normalizeUserKey(key) === PRIMARY_ADMIN_KEY;
  }

  function hasPermission(user, permKey) {
    if (!user) return false;
    if (user.role === 'Admin' || isPrimaryAdminKey(user.username)) {
      return true;
    }
    const defaults = getDefaultPermissions();
    const perms = Object.assign({}, defaults, user.permissions || {});
    return !!perms[permKey];
  }

  // Migrates legacy admin accounts ('Gerges Magdy') to the strict 'gerges' admin,
  // carrying over the old admin's workspace (projects/equipment/venues) if needed.
  async function migrateLegacyAdmin(users) {
    let changed = false;
    for (const legacyKey of LEGACY_ADMIN_KEYS) {
      if (!users[legacyKey]) continue;
      const legacyWsKey = 'workspace_' + legacyKey;
      const newWsKey = 'workspace_' + PRIMARY_ADMIN_KEY;
      const legacyWs = await idbGet(legacyWsKey);
      const newWs = await idbGet(newWsKey);
      if (legacyWs && !newWs) {
        legacyWs.username = PRIMARY_ADMIN_KEY;
        await idbSet(newWsKey, legacyWs);
      }
      if (!users[PRIMARY_ADMIN_KEY]) {
        users[PRIMARY_ADMIN_KEY] = Object.assign({}, users[legacyKey]);
      }
      delete users[legacyKey];
      changed = true;
    }
    const activeKey = normalizeUserKey(await idbGet('activeUser'));
    if (LEGACY_ADMIN_KEYS.includes(activeKey)) {
      await idbSet('activeUser', PRIMARY_ADMIN_KEY);
    }
    return changed;
  }

  // User Authentication, Default Admin ('gerges' / 'gerges') & RBAC Management
  async function initAuthStore() {
    let users = await idbGet('users');
    if (!users || typeof users !== 'object') {
      users = {};
    }

    const adminKey = PRIMARY_ADMIN_KEY;
    let modified = await migrateLegacyAdmin(users);

    if (!users[adminKey]) {
      users[adminKey] = {
        key: adminKey,
        username: 'gerges',
        displayName: 'admin program Gerges',
        password: PRIMARY_ADMIN_PASSWORD,
        role: 'Admin',
        permissions: getDefaultPermissions(),
        createdAt: new Date().toISOString()
      };
      modified = true;
      await ensureUserWorkspace(adminKey);
    }

    // Force primary Admin credentials to strictly 'gerges' / 'gerges' on every load
    const adm = users[adminKey];
    if (
      adm.key !== adminKey ||
      adm.username !== 'gerges' ||
      adm.password !== PRIMARY_ADMIN_PASSWORD ||
      adm.role !== 'Admin'
    ) {
      modified = true;
    }
    adm.key = adminKey;
    adm.username = 'gerges';
    adm.displayName = 'admin program Gerges';
    adm.password = PRIMARY_ADMIN_PASSWORD;
    adm.role = 'Admin';
    adm.permissions = getDefaultPermissions();

    // Normalize any existing user records so they have key, role, and permissions
    Object.keys(users).forEach((k) => {
      const u = users[k];
      if (!u.key) { u.key = k; modified = true; }
      if (!u.role || (u.role !== 'Admin' && u.role !== 'Regular User')) {
        u.role = k === adminKey ? 'Admin' : 'Regular User';
        modified = true;
      }
      if (!u.permissions) {
        u.permissions = getDefaultPermissions();
        modified = true;
      }
    });
    if (modified) {
      await idbSet('users', users);
    }
    return users;
  }

  async function loginUser(username, password) {
    const cleanKey = normalizeUserKey(username);
    if (!cleanKey || !password) {
      return { ok: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور / Please enter username and password.' };
    }
    const users = await initAuthStore();
    const user = users[cleanKey];
    if (!user || user.password !== password) {
      return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة / Invalid username or password.' };
    }
    await ensureUserWorkspace(cleanKey);
    await idbSet('activeUser', cleanKey);
    return { ok: true, user };
  }

  async function logoutUser() {
    await idbSet('activeUser', null);
  }

  async function getActiveUser() {
    const users = await initAuthStore();
    const usernameKey = await idbGet('activeUser');
    if (!usernameKey) return null;
    return users[normalizeUserKey(usernameKey)] || null;
  }

  async function getAllUsers() {
    const users = await initAuthStore();
    return Object.values(users).sort((a, b) => {
      if (isPrimaryAdminKey(a.username)) return -1;
      if (isPrimaryAdminKey(b.username)) return 1;
      return (a.username || '').localeCompare(b.username || '');
    });
  }

  async function adminCreateUser({ username, displayName, password, role, permissions }) {
    const rawName = String(username || '').trim();
    const cleanKey = normalizeUserKey(rawName);
    if (!cleanKey || !password) {
      return { ok: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور / Username and password are required.' };
    }
    const users = await initAuthStore();
    if (users[cleanKey]) {
      return { ok: false, error: 'اسم المستخدم موجود بالفعل / Username already exists.' };
    }
    const assignedRole = role === 'Admin' ? 'Admin' : 'Regular User';
    users[cleanKey] = {
      key: cleanKey,
      username: rawName,
      displayName: (displayName || rawName).trim(),
      password: String(password),
      role: assignedRole,
      permissions: assignedRole === 'Admin' ? getDefaultPermissions() : Object.assign(getDefaultPermissions(), permissions || {}),
      createdAt: new Date().toISOString()
    };
    await idbSet('users', users);
    await ensureUserWorkspace(cleanKey);
    return { ok: true, user: users[cleanKey] };
  }

  async function adminUpdateUser(userKey, updates) {
    const cleanKey = normalizeUserKey(userKey);
    const users = await initAuthStore();
    const u = users[cleanKey];
    if (!u) return { ok: false, error: 'المستخدم غير موجود / User not found.' };

    if (updates.displayName !== undefined) {
      u.displayName = String(updates.displayName).trim() || u.username;
    }
    if (updates.password !== undefined && String(updates.password).trim() !== '' && !isPrimaryAdminKey(cleanKey)) {
      u.password = String(updates.password);
    }
    if (!isPrimaryAdminKey(cleanKey) && updates.role) {
      u.role = updates.role === 'Admin' ? 'Admin' : 'Regular User';
    }
    if (updates.permissions) {
      u.permissions = u.role === 'Admin'
        ? getDefaultPermissions()
        : Object.assign({}, u.permissions || getDefaultPermissions(), updates.permissions);
    }
    await idbSet('users', users);
    return { ok: true, user: u };
  }

  async function changeUserPassword(userKey, currentPassword, newPassword, isAdminOverride = false) {
    const cleanKey = normalizeUserKey(userKey);
    if (isPrimaryAdminKey(cleanKey)) {
      return { ok: false, error: 'كلمة مرور المدير الرئيسي ثابتة (gerges) / The primary Admin password is fixed to "gerges".' };
    }
    if (!newPassword || String(newPassword).trim().length < 3) {
      return { ok: false, error: 'كلمة المرور الجديدة قصيرة جداً / New password is too short.' };
    }
    const users = await initAuthStore();
    const u = users[cleanKey];
    if (!u) return { ok: false, error: 'المستخدم غير موجود / User not found.' };

    if (!isAdminOverride && u.password !== currentPassword) {
      return { ok: false, error: 'كلمة المرور الحالية غير صحيحة / Current password is incorrect.' };
    }
    u.password = String(newPassword);
    await idbSet('users', users);
    return { ok: true, user: u };
  }

  async function adminDeleteUser(userKey) {
    const cleanKey = normalizeUserKey(userKey);
    if (isPrimaryAdminKey(cleanKey)) {
      return { ok: false, error: 'لا يمكن حذف حساب المدير الرئيسي gerges / Cannot delete the primary Admin account.' };
    }
    const users = await initAuthStore();
    if (!users[cleanKey]) {
      return { ok: false, error: 'المستخدم غير موجود / User not found.' };
    }
    delete users[cleanKey];
    await idbSet('users', users);
    return { ok: true };
  }

  async function ensureUserWorkspace(username) {
    const key = 'workspace_' + normalizeUserKey(username);
    let ws = await idbGet(key);
    const defaultCats = getInitialCategories();
    const defaultEqs = getInitialEquipment();
    if (!ws) {
      ws = {
        username: normalizeUserKey(username),
        categories: defaultCats,
        equipment: defaultEqs,
        venues: getInitialVenues(),
        projects: [createStarterProject()],
        paperProjects: []
      };
      await idbSet(key, ws);
    } else {
      let dirty = false;
      if (!ws.categories || !ws.categories.length) {
        ws.categories = defaultCats;
        dirty = true;
      } else {
        // Non-destructively merge any newly added default categories (e.g. 'cat_light_accessories')
        const existingCatIds = new Set(ws.categories.map((c) => c.id));
        defaultCats.forEach((dc, idx) => {
          if (!existingCatIds.has(dc.id)) {
            ws.categories.splice(Math.min(idx, ws.categories.length), 0, dc);
            dirty = true;
          } else if (dc.id === 'cat_props') {
            const catObj = ws.categories.find((c) => c.id === 'cat_props');
            if (catObj && catObj.nameAr === 'أشخاص وديكور وموزعات') {
              catObj.nameAr = dc.nameAr;
              catObj.nameEn = dc.nameEn;
              dirty = true;
            }
          }
        });
      }
      if (!ws.equipment || !ws.equipment.length) {
        ws.equipment = defaultEqs;
        ws._defaultFootprintsV2 = true;
        dirty = true;
      } else {
        // Non-destructively merge any newly added default equipment (accessories + expanded decor)
        const existingEqIds = new Set(ws.equipment.map((e) => e.id));
        const applyDefaultFootprints = !ws._defaultFootprintsV2;
        defaultEqs.forEach((de) => {
          if (!existingEqIds.has(de.id)) {
            ws.equipment.push(de);
            dirty = true;
          } else {
            // Backfill model3d / size hints on existing default items if missing
            const cur = ws.equipment.find((e) => e.id === de.id);
            if (cur) {
              if (de.model3d && !cur.model3d) { cur.model3d = de.model3d; dirty = true; }
              if (de.size && !cur.size) { cur.size = de.size; dirty = true; }
              if (de.frontOffset && !cur.frontOffset) { cur.frontOffset = de.frontOffset; dirty = true; }
              if (applyDefaultFootprints && de.type === 'fixture' && !cur._userEditedFootprint) {
                cur.footprint = de.footprint;
                dirty = true;
              }
            }
          }
        });
        if (applyDefaultFootprints) {
          ws._defaultFootprintsV2 = true;
          dirty = true;
        }
      }
      if (!ws.venues || !ws.venues.length) {
        ws.venues = getInitialVenues();
        dirty = true;
      } else {
        ws.venues.forEach((v) => {
          if (v.id === 'venue_church_default' || (v.type === 'church' && v.name && v.name.includes('Main Church'))) {
            if (v.name !== 'كنيسة الملاك') {
              v.name = 'كنيسة الملاك';
              dirty = true;
            }
          }
          if (v.type === 'church') {
            if (!v.churchConfig) {
              v.churchConfig = {
                sanctuaryDepth: 5.0,
                sanctuaryElevation: 0.6,
                naveWidth: v.width || 16,
                sideAisleOffset: 2.6,
                columnsPerSide: 5,
                centerAisleWidth: 2.4,
                pewRows: 6,
                pewGap: 1.8,
                pewAltarOffset: 1.8,
                mountPipesY: [3.5, 6.5, 10.5, 14.5, 18.5]
              };
              dirty = true;
            } else {
              if (v.churchConfig.pewRows === undefined) { v.churchConfig.pewRows = 6; dirty = true; }
              if (v.churchConfig.pewGap === undefined) { v.churchConfig.pewGap = 1.8; dirty = true; }
              if (v.churchConfig.pewAltarOffset === undefined) { v.churchConfig.pewAltarOffset = 1.8; dirty = true; }
            }
          }
        });
      }
      if (!ws.projects) {
        ws.projects = [];
        dirty = true;
      } else {
        ws.projects.forEach((p) => {
          if (p.venueType === 'church' && p.venueConfig) {
            if (p.venueName && p.venueName.includes('Main Church')) {
              p.venueName = 'كنيسة الملاك';
              dirty = true;
            }
            if (p.venueConfig.name && p.venueConfig.name.includes('Main Church')) {
              p.venueConfig.name = 'كنيسة الملاك';
              dirty = true;
            }
            if (p.venueConfig.churchConfig) {
              if (p.venueConfig.churchConfig.pewRows === undefined) { p.venueConfig.churchConfig.pewRows = 6; dirty = true; }
              if (p.venueConfig.churchConfig.pewGap === undefined) { p.venueConfig.churchConfig.pewGap = 1.8; dirty = true; }
              if (p.venueConfig.churchConfig.pewAltarOffset === undefined) { p.venueConfig.churchConfig.pewAltarOffset = 1.8; dirty = true; }
            }
          }
        });
      }
      if (!Array.isArray(ws.paperProjects)) { ws.paperProjects = []; dirty = true; }
      if (dirty) {
        await idbSet(key, ws);
      }
    }
    return ws;
  }

  async function saveUserWorkspace(username, ws) {
    const key = 'workspace_' + normalizeUserKey(username);
    await idbSet(key, ws);
  }

  // ==========================================================================
  // GLOBAL APP SETTINGS (Main Dashboard Gear ⚙️) — shared contract for all modules
  // Stored under IndexedDB/LocalStorage key 'app_settings' (device-wide, offline).
  // ==========================================================================
  function getDefaultAppSettings() {
    return {
      logoDataURL: '',            // uploaded app logo (data URL) shown in header + exports
      companyName: '',            // Default header info on exports
      dopName: '',
      designerName: '',
      maxAmps: 32,                // breaker limit (A) — power counter turns red when exceeded
      universeColors: {           // DMX Universe/Output color coding
        A: '#f59e0b',
        B: '#38bdf8',
        C: '#10b981',
        D: '#e879f9'
      },
      printFormat: 'A4'           // 'A4' | 'thermal80' | 'thermal58'
    };
  }

  let appSettingsCache = null;

  async function getAppSettings() {
    const saved = (await idbGet('app_settings')) || {};
    const def = getDefaultAppSettings();
    appSettingsCache = Object.assign({}, def, saved, {
      universeColors: Object.assign({}, def.universeColors, saved.universeColors || {})
    });
    return appSettingsCache;
  }

  // Synchronous accessor (returns last loaded settings or defaults) for render loops
  function getAppSettingsSync() {
    return appSettingsCache || getDefaultAppSettings();
  }

  async function saveAppSettings(partial) {
    const cur = await getAppSettings();
    const next = Object.assign({}, cur, partial || {});
    if (partial && partial.universeColors) {
      next.universeColors = Object.assign({}, cur.universeColors, partial.universeColors);
    }
    await idbSet('app_settings', next);
    appSettingsCache = next;
    try {
      global.dispatchEvent(new CustomEvent('shams:settings-changed', { detail: next }));
    } catch (e) {}
    return next;
  }

  // Universe color helper: accepts 'A' | 'Channel A' | 'Universe A'
  function getUniverseColor(channelOrLetter) {
    const s = getAppSettingsSync();
    const letter = String(channelOrLetter || 'A').trim().slice(-1).toUpperCase();
    return (s.universeColors && s.universeColors[letter]) || '#94a3b8';
  }

  // Full database backup / restore (all IndexedDB keys of the app store)
  async function exportFullBackup() {
    const db = await openIDB();
    const data = {};
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cur = e.target.result;
            if (cur) {
              data[cur.key] = cur.value;
              cur.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => resolve();
        } catch (err) {
          resolve();
        }
      });
    }
    try {
      for (let i = 0; i < global.localStorage.length; i++) {
        const k = global.localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) {
          const shortKey = k.slice(LS_PREFIX.length);
          if (!(shortKey in data)) data[shortKey] = lsGet(shortKey);
        }
      }
    } catch (e) {}
    return {
      app: 'ShamsElber light. DMX',
      format: 'shams-backup-v1',
      exportedAt: new Date().toISOString(),
      data
    };
  }

  async function importFullBackup(backup) {
    if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
      return { ok: false, error: 'ملف النسخة الاحتياطية غير صالح / Invalid backup file.' };
    }
    const keys = Object.keys(backup.data);
    projectSyncState.isImporting = true;
    try {
      for (const k of keys) {
        await rawIdbSet(k, backup.data[k]);
      }
      const nowIso = new Date().toISOString();
      await rawIdbSet(SYNC_TRACKED_META_KEYS.MODIFIED_AT, nowIso);
      appSettingsCache = null;
      await getAppSettings();
      await initAuthStore();
    } finally {
      projectSyncState.isImporting = false;
    }
    if (projectSyncState.isLocalDiskServer) {
      await saveToProjectFolderNow();
    }
    return { ok: true, count: keys.length };
  }

  async function buildPortableProjectBundle() {
    const backup = await exportFullBackup();
    const portableData = {};
    let usersCount = 0;
    let projectsCount = 0;
    let paperProjectsCount = 0;

    Object.keys(backup.data || {}).forEach((k) => {
      if (
        k === 'activeUser' ||
        k === SYNC_TRACKED_META_KEYS.SYNCED_AT ||
        k === SYNC_TRACKED_META_KEYS.MODIFIED_AT
      ) {
        return;
      }
      portableData[k] = backup.data[k];
      if (k === 'users' && backup.data[k] && typeof backup.data[k] === 'object') {
        usersCount = Object.keys(backup.data[k]).length;
      }
      if (k.indexOf('workspace_') === 0 && backup.data[k] && typeof backup.data[k] === 'object') {
        if (Array.isArray(backup.data[k].projects)) {
          projectsCount += backup.data[k].projects.length;
        }
        if (Array.isArray(backup.data[k].paperProjects)) {
          paperProjectsCount += backup.data[k].paperProjects.length;
        }
      }
    });

    const nowIso = new Date().toISOString();
    return {
      app: 'ShamsElber light. DMX',
      format: 'shams-project-folder-v1',
      isSeedTemplate: false,
      savedAt: nowIso,
      exportedAt: nowIso,
      summary: {
        usersCount,
        projectsCount,
        paperProjectsCount
      },
      data: portableData
    };
  }

  async function saveToProjectFolderNow() {
    if (!projectSyncState.isLocalDiskServer) {
      return { ok: false, reason: 'static-web' };
    }
    if (projectSyncState.debounceTimer) {
      clearTimeout(projectSyncState.debounceTimer);
      projectSyncState.debounceTimer = null;
    }
    projectSyncState.pendingFlush = false;
    projectSyncState.isSaving = true;
    try {
      const bundle = await buildPortableProjectBundle();
      const res = await fetch('./api/project-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(bundle, null, 2)
      });
      if (!res.ok) {
        projectSyncState.lastError = 'HTTP ' + res.status;
        return { ok: false, reason: projectSyncState.lastError };
      }
      const json = await res.json();
      if (json && json.ok) {
        projectSyncState.lastSyncedAt = bundle.savedAt;
        projectSyncState.lastError = null;
        await rawIdbSet(SYNC_TRACKED_META_KEYS.SYNCED_AT, bundle.savedAt);
        try {
          global.dispatchEvent(new CustomEvent('shams:project-synced', { detail: getProjectFolderSyncInfo() }));
        } catch (e) {}
        return { ok: true, savedAt: bundle.savedAt, bytes: json.bytes };
      }
      return { ok: false, reason: 'write_failed' };
    } catch (err) {
      projectSyncState.lastError = err && err.message ? err.message : 'network_error';
      return { ok: false, reason: projectSyncState.lastError };
    } finally {
      projectSyncState.isSaving = false;
    }
  }

  function scheduleProjectFolderAutoSave() {
    if (!projectSyncState.isLocalDiskServer) return;
    projectSyncState.pendingFlush = true;
    if (projectSyncState.debounceTimer) {
      clearTimeout(projectSyncState.debounceTimer);
    }
    projectSyncState.debounceTimer = setTimeout(() => {
      projectSyncState.debounceTimer = null;
      saveToProjectFolderNow();
    }, 450);
  }

  async function detectLocalDiskServer() {
    if (projectSyncState.serverChecked) return projectSyncState.isLocalDiskServer;
    projectSyncState.serverChecked = true;
    try {
      const res = await fetch('./api/project-status?t=' + Date.now(), { cache: 'no-store' });
      const ct = (res.headers && res.headers.get('content-type')) || '';
      if (res.ok && ct.toLowerCase().indexOf('application/json') !== -1) {
        const info = await res.json();
        projectSyncState.isLocalDiskServer = !!(info && info.ok === true && info.mode === 'local-disk');
      }
    } catch (e) {
      projectSyncState.isLocalDiskServer = false;
    }
    return projectSyncState.isLocalDiskServer;
  }

  async function fetchProjectFolderDataFile() {
    const endpoint = projectSyncState.isLocalDiskServer
      ? './api/project-data?t=' + Date.now()
      : './project/data.json?t=' + Date.now();
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      if (json && typeof json === 'object' && json.data && typeof json.data === 'object') {
        return json;
      }
    } catch (e) {}
    if (projectSyncState.isLocalDiskServer) {
      try {
        const fallback = await fetch('./project/data.json?t=' + Date.now(), { cache: 'no-store' });
        if (fallback.ok) {
          const json = await fallback.json();
          if (json && typeof json === 'object' && json.data && typeof json.data === 'object') {
            return json;
          }
        }
      } catch (e) {}
    }
    return null;
  }

  async function applyPortableBundleToLocalDB(fileData) {
    if (!fileData || !fileData.data || typeof fileData.data !== 'object') return false;
    const keys = Object.keys(fileData.data);
    if (!keys.length) return false;
    projectSyncState.isImporting = true;
    try {
      for (const k of keys) {
        if (k === 'activeUser') continue;
        await rawIdbSet(k, fileData.data[k]);
      }
      const syncedTs = fileData.savedAt || fileData.exportedAt || new Date().toISOString();
      await rawIdbSet(SYNC_TRACKED_META_KEYS.SYNCED_AT, syncedTs);
      await rawIdbSet(SYNC_TRACKED_META_KEYS.MODIFIED_AT, syncedTs);
      projectSyncState.lastSyncedAt = syncedTs;
      appSettingsCache = null;
      await getAppSettings();
    } finally {
      projectSyncState.isImporting = false;
    }
    return true;
  }

  async function syncWithProjectFolderOnBoot() {
    await detectLocalDiskServer();
    const localSnapshot = await exportFullBackup();
    const localKeys = Object.keys(localSnapshot.data || {}).filter((k) => isSyncTrackedKey(k));
    const hasLocalData = localKeys.length > 0;
    const localSyncAt = await idbGet(SYNC_TRACKED_META_KEYS.SYNCED_AT);
    const localModAt = await idbGet(SYNC_TRACKED_META_KEYS.MODIFIED_AT);
    const localSyncTs = Date.parse(localSyncAt || 0) || 0;
    const localModTs = Date.parse(localModAt || 0) || 0;
    projectSyncState.lastSyncedAt = localSyncAt || null;

    const fileData = await fetchProjectFolderDataFile();
    if (fileData && !fileData.isSeedTemplate && Object.keys(fileData.data || {}).length > 0) {
      const fileTs = Date.parse(fileData.savedAt || fileData.exportedAt || 0) || 0;
      const shouldImportFromFolder =
        !hasLocalData ||
        (fileTs > localSyncTs && fileTs >= localModTs);

      if (shouldImportFromFolder) {
        await applyPortableBundleToLocalDB(fileData);
        return { action: 'imported', savedAt: fileData.savedAt || fileData.exportedAt };
      }

      if (projectSyncState.isLocalDiskServer && hasLocalData && localModTs > fileTs) {
        await saveToProjectFolderNow();
        return { action: 'pushed', savedAt: projectSyncState.lastSyncedAt };
      }

      return { action: 'in_sync', savedAt: projectSyncState.lastSyncedAt };
    }

    // First-time bridge: local browser already has projects, disk project/data.json is still empty seed template
    if (projectSyncState.isLocalDiskServer && hasLocalData) {
      await saveToProjectFolderNow();
      return { action: 'seeded_from_local', savedAt: projectSyncState.lastSyncedAt };
    }

    return { action: 'none', savedAt: projectSyncState.lastSyncedAt };
  }

  async function forceImportFromProjectFolder() {
    await detectLocalDiskServer();
    const fileData = await fetchProjectFolderDataFile();
    if (!fileData || fileData.isSeedTemplate || !Object.keys(fileData.data || {}).length) {
      return { ok: false, error: 'لا توجد بيانات مشاريع محفوظة داخل مجلد project/data.json بعد.' };
    }
    const ok = await applyPortableBundleToLocalDB(fileData);
    return ok
      ? { ok: true, savedAt: fileData.savedAt || fileData.exportedAt }
      : { ok: false, error: 'تعذر قراءة بيانات مجلد project.' };
  }

  function getProjectFolderSyncInfo() {
    return {
      mode: projectSyncState.isLocalDiskServer ? 'local-disk' : 'static-web',
      isLocalDiskServer: projectSyncState.isLocalDiskServer,
      lastSyncedAt: projectSyncState.lastSyncedAt,
      lastError: projectSyncState.lastError
    };
  }

  if (typeof global.addEventListener === 'function') {
    const flushPending = () => {
      if (projectSyncState.pendingFlush && projectSyncState.isLocalDiskServer) {
        saveToProjectFolderNow();
      }
    };
    global.addEventListener('pagehide', flushPending);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPending();
      });
    }
  }

  global.CineLightDB = {
    getDefaultAppSettings,
    getAppSettings,
    getAppSettingsSync,
    saveAppSettings,
    getUniverseColor,
    exportFullBackup,
    importFullBackup,
    syncWithProjectFolderOnBoot,
    saveToProjectFolderNow,
    forceImportFromProjectFolder,
    buildPortableProjectBundle,
    getProjectFolderSyncInfo,
    getInitialCategories,
    getInitialEquipment,
    getInitialVenues,
    createStarterProject,
    recalculateDMXAddresses,
    calculatePowerLoad,
    calculateHorizontalFOV,
    getDefaultPermissions,
    normalizeUserKey,
    isPrimaryAdminKey,
    PRIMARY_ADMIN_KEY,
    hasPermission,
    loginUser,
    logoutUser,
    getActiveUser,
    getAllUsers,
    adminCreateUser,
    adminUpdateUser,
    changeUserPassword,
    adminDeleteUser,
    ensureUserWorkspace,
    saveUserWorkspace
  };
})(window);
