/* ================================================================
   ACT 2 · THE ROOM & THE BLACK SPHERE
   Dark minimal room, interactive glossy sphere, holographic labels.
   ================================================================ */

class RoomScene {
  constructor() {
    this.canvas    = document.getElementById('room-canvas');
    this.overlay   = document.getElementById('act2-overlay');
    this.labelsCtn = document.getElementById('labels-container');
    this.prompt    = document.getElementById('sphere-prompt');
    this.hint      = document.getElementById('sphere-hint');

    this._animId      = null;
    this._startTime   = null;
    this._disposed    = false;
    this._activated   = false;  // has the sphere been clicked?
    this._hovering    = false;
    this._inTransition = false;

    // Camera orbit state
    this._theta    = 0.0;
    this._phi      = 1.38;          // ~79° from top
    this._radius   = 4.2;
    this._thetaTarget = 0.0;
    this._phiTarget   = 1.38;
    this._isDragging  = false;
    this._prevMouse   = { x: 0, y: 0 };

    // Mouse (for raycasting)
    this._mouse = new THREE.Vector2();

    // Gallery selection callback
    this.onGallerySelect = null;

    this._setupRenderer();
    this._setupScene();
    this._buildRoom();
    this._buildSphere();
    this._buildParticles();
    this._buildLights();
    this._buildLabels();
    // _buildEnvMap() is deferred to start() so it runs on a visible canvas

    this._setupEvents();
    window.addEventListener('resize', this._onResize.bind(this));
  }

  /* ── Renderer ─────────────────────────────────────────────────── */
  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas:    this.canvas,
      antialias: true,
      alpha:     false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xf2f0e8, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  /* ── Scene & camera ───────────────────────────────────────────── */
  _setupScene() {
    this.scene  = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2f0e8, 8, 22);

    this.camera = new THREE.PerspectiveCamera(
      42, window.innerWidth / window.innerHeight, 0.1, 100
    );
    this._updateCamera();

    this._raycaster = new THREE.Raycaster();
  }

  /* ── Environment map for sphere reflections ───────────────────── */
  _buildEnvMap() {
    // Create a subtle equirectangular environment via canvas
    const W = 2048, H = 1024;
    const ec = document.createElement('canvas');
    ec.width = W; ec.height = H;
    const ectx = ec.getContext('2d');

    // Warm white base — gallery room
    ectx.fillStyle = '#eeece6';
    ectx.fillRect(0, 0, W, H);

    // Bright skylight band at the very top
    const skylight = ectx.createLinearGradient(0, 0, 0, H * 0.2);
    skylight.addColorStop(0,   'rgba(255, 252, 244, 1.0)');
    skylight.addColorStop(0.6, 'rgba(255, 252, 244, 0.6)');
    skylight.addColorStop(1,   'rgba(0,   0,   0,   0)');
    ectx.fillStyle = skylight;
    ectx.fillRect(0, 0, W, H * 0.2);

    // Warm wooden floor reflection at the bottom
    const botLight = ectx.createRadialGradient(W / 2, H, 0, W / 2, H, W * 0.4);
    botLight.addColorStop(0,   'rgba(160, 120, 70, 0.45)');
    botLight.addColorStop(0.5, 'rgba(140, 100, 55, 0.15)');
    botLight.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ectx.fillStyle = botLight;
    ectx.fillRect(0, H * 0.55, W, H * 0.45);

    // Soft side walls (cool-neutral)
    const sideLight = ectx.createRadialGradient(W * 0.1, H * 0.5, 0, W * 0.1, H * 0.5, W * 0.3);
    sideLight.addColorStop(0, 'rgba(210, 210, 215, 0.5)');
    sideLight.addColorStop(1, 'rgba(0,   0,   0,   0)');
    ectx.fillStyle = sideLight;
    ectx.fillRect(0, 0, W * 0.4, H);

    const envTexture = new THREE.CanvasTexture(ec);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this._envMap = pmrem.fromEquirectangular(envTexture).texture;
    pmrem.dispose();
    envTexture.dispose();

    this.scene.environment = this._envMap;
  }

  /* ── Procedural city night skyline texture ────────────────────── */
  _buildCityTexture() {
    const W = 2048, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    // Deterministic hash
    const hsh = (n) => { const x = Math.sin(n + 1.3) * 92341; return x - Math.floor(x); };

    // ── Sky ──────────────────────────────────────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0,    '#030509');
    sky.addColorStop(0.4,  '#060b18');
    sky.addColorStop(0.75, '#0e1630');
    sky.addColorStop(1,    '#1a253e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars (varied sizes, some brighter)
    for (let i = 0; i < 260; i++) {
      const sx = hsh(i * 5.9) * W, sy = hsh(i * 4.1) * H * 0.58;
      const bright = hsh(i * 2.3) > 0.92;
      ctx.beginPath();
      ctx.arc(sx, sy, bright ? 1.5 : 0.7, 0, Math.PI * 2);
      ctx.fillStyle = bright ? `rgba(255,255,240,${(0.7 + hsh(i) * 0.3).toFixed(2)})`
                             : `rgba(200,210,255,${(0.3 + hsh(i * 3.1) * 0.5).toFixed(2)})`;
      ctx.fill();
    }

    // Moon
    const mx = W * 0.80, my = H * 0.10;
    ctx.save();
    ctx.shadowColor = 'rgba(160,200,255,0.9)'; ctx.shadowBlur = 55;
    ctx.beginPath(); ctx.arc(mx, my, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#eef2ff'; ctx.fill();
    ctx.restore();
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 120);
    halo.addColorStop(0.18, 'rgba(160,200,255,0.09)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(mx-120, my-120, 240, 240);

    // Warm horizon city-glow
    const glow = ctx.createLinearGradient(0, H * 0.52, 0, H * 0.82);
    glow.addColorStop(0, 'rgba(0,0,0,0)');
    glow.addColorStop(1, 'rgba(255,120,35,0.22)');
    ctx.fillStyle = glow; ctx.fillRect(0, H * 0.52, W, H * 0.30);

    // Atmosphere haze band
    const hz = ctx.createLinearGradient(0, H * 0.56, 0, H * 0.74);
    hz.addColorStop(0, 'rgba(18,28,55,0)');
    hz.addColorStop(1, 'rgba(28,38,65,0.38)');
    ctx.fillStyle = hz; ctx.fillRect(0, H * 0.56, W, H * 0.18);

    // ── Building helpers ─────────────────────────────────────────
    // Draw a rectangular building with lit windows
    const drawFlat = (x, top, w, bh, col, litFrac) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, top, w, bh);
      const gX = 10, gY = 13, padX = 6, padY = 7, wW = 5, wH = 8;
      const cols = Math.max(1, Math.floor((w - padX * 2) / gX));
      const rows = Math.max(1, Math.floor((bh - padY * 2) / gY));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hsh(x * 0.28 + c * 13.1 + top * 0.17 + r * 8.9) < litFrac) {
            const warm = hsh(c * 5.3 + r * 4.1 + x * 0.07);
            ctx.fillStyle = warm > 0.68 ? 'rgba(255,235,140,0.95)'
                          : warm > 0.35 ? 'rgba(255,250,195,0.85)'
                                        : 'rgba(175,215,255,0.78)';
            ctx.fillRect(x + padX + c * gX, top + padY + r * gY, wW, wH);
          }
        }
      }
    };

    // Draw an art-deco stepped tower (3 tiers, each narrower)
    const drawTower = (x, base, w, totalH, col, litFrac) => {
      // Tier proportions: bottom 50%, mid 30%, top 20% of height
      const t1h = Math.floor(totalH * 0.52), t2h = Math.floor(totalH * 0.30), t3h = totalH - t1h - t2h;
      const t1w = w, t2w = Math.floor(w * 0.72), t3w = Math.floor(w * 0.48);
      const t1x = x, t2x = x + (w - t2w) / 2, t3x = x + (w - t3w) / 2;
      drawFlat(t1x, base - t1h,         t1w, t1h, col, litFrac);
      drawFlat(t2x, base - t1h - t2h,   t2w, t2h, col, litFrac);
      drawFlat(t3x, base - totalH,       t3w, t3h, col, litFrac * 0.6);
      // Spire
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(t3x + t3w * 0.3, base - totalH);
      ctx.lineTo(t3x + t3w / 2,   base - totalH - Math.floor(totalH * 0.14));
      ctx.lineTo(t3x + t3w * 0.7, base - totalH);
      ctx.fill();
      // Red beacon
      const bx = t3x + t3w / 2, by = base - totalH - Math.floor(totalH * 0.14);
      const bc = ctx.createRadialGradient(bx, by, 0, bx, by, 9);
      bc.addColorStop(0, 'rgba(255,50,50,1)'); bc.addColorStop(0.5, 'rgba(255,60,60,0.5)'); bc.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bc; ctx.fillRect(bx - 9, by - 9, 18, 18);
    };

    // Draw a glass-curtain tower (slight blue-green tint, no individual windows — grid of glowing panels)
    const drawGlass = (x, base, w, totalH, litFrac) => {
      const grad = ctx.createLinearGradient(x, base - totalH, x + w, base);
      grad.addColorStop(0, '#0e1a28'); grad.addColorStop(1, '#121f30');
      ctx.fillStyle = grad; ctx.fillRect(x, base - totalH, w, totalH);
      // Floor-to-floor bands
      const bandH = 12, bandGap = 3;
      for (let fy = base - totalH; fy < base; fy += bandH + bandGap) {
        if (hsh(x * 0.12 + fy * 0.09) < litFrac) {
          ctx.fillStyle = 'rgba(140,210,230,0.22)';
          ctx.fillRect(x + 2, fy + 2, w - 4, bandH - 2);
        }
      }
    };

    // ── Background layer (most distant, smallest, darkest) ────────
    // Heights very varied: short (60-140) and a few medium (200-260)
    const bg = [
      [0,H,62,95],[62,H,45,130],[107,H,80,78],[187,H,50,185],[237,H,38,64],
      [275,H,95,210],[370,H,44,88],[414,H,68,145],[482,H,55,230],[537,H,42,75],
      [579,H,88,195],[667,H,48,110],[715,H,72,250],[787,H,40,82],[827,H,90,170],
      [917,H,55,135],[972,H,48,90],[1020,H,75,200],[1095,H,50,68],[1145,H,85,155],
      [1230,H,46,195],[1276,H,62,78],[1338,H,90,230],[1428,H,44,100],[1472,H,70,145],
      [1542,H,52,88],[1594,H,80,215],[1674,H,45,125],[1719,H,65,72],[1784,H,92,185],
      [1876,H,48,130],[1924,H,70,95],[1994,H,60,165],
    ];
    bg.forEach(([x,base,w,bh]) => drawFlat(x, base-bh, w, bh, '#080c15', 0.04));

    // ── Mid-ground layer — more varied, some taller ───────────────
    // Heights: short (80-150), medium (200-280), occasional tall (340-380)
    const mid = [
      [0,H,58,130],[58,H,72,190],[130,H,44,82],[174,H,88,245],[262,H,50,145],
      [312,H,65,300],[377,H,42,88],[419,H,95,265],[514,H,55,160],[569,H,78,340],
      [647,H,46,105],[693,H,85,220],[778,H,52,370],[830,H,68,150],[898,H,46,92],
      [944,H,80,280],[1024,H,55,195],[1079,H,70,120],[1149,H,88,350],[1237,H,50,145],
      [1287,H,65,230],[1352,H,45,88],[1397,H,82,295],[1479,H,55,165],[1534,H,72,110],
      [1606,H,90,320],[1696,H,48,185],[1744,H,65,100],[1809,H,85,255],[1894,H,55,135],
      [1949,H,70,200],[2019,H,50,92],
    ];
    mid.forEach(([x,base,w,bh]) => drawFlat(x, base-bh, w, bh, '#0c1122', 0.16));

    // ── Foreground — the main dramatic skyline ────────────────────
    // Hand-crafted Manhattan-inspired profile with dramatic height variation
    // Short buildings: 90-160px | Medium: 220-300px | Tall: 370-430px | Supertall: 460-490px
    const fgBuildings = [
      // Left edge — lower density, shorter
      { x:0,   w:50,  h:145, type:'flat'  },
      { x:50,  w:38,  h:92,  type:'flat'  },
      { x:88,  w:72,  h:205, type:'flat'  },
      { x:160, w:42,  h:118, type:'flat'  },
      // First tall cluster
      { x:202, w:60,  h:255, type:'flat'  },
      { x:262, w:85,  h:420, type:'tower' }, // ← landmark tower
      { x:347, w:46,  h:170, type:'flat'  },
      { x:393, w:70,  h:285, type:'flat'  },
      { x:463, w:38,  h:102, type:'flat'  },
      // Dense midtown — very tall cluster
      { x:501, w:55,  h:310, type:'flat'  },
      { x:556, w:48,  h:385, type:'glass' }, // glass tower
      { x:604, w:90,  h:478, type:'tower' }, // ← supertall (Empire State scale)
      { x:694, w:52,  h:455, type:'tower' }, // ← second supertall
      { x:746, w:44,  h:330, type:'glass' },
      { x:790, w:78,  h:255, type:'flat'  },
      // Slight dip
      { x:868, w:42,  h:138, type:'flat'  },
      { x:910, w:65,  h:195, type:'flat'  },
      { x:975, w:38,  h:102, type:'flat'  },
      // Right tall cluster
      { x:1013,w:72,  h:290, type:'flat'  },
      { x:1085,w:55,  h:395, type:'tower' }, // ← tall landmark
      { x:1140,w:48,  h:350, type:'glass' },
      { x:1188,w:80,  h:430, type:'tower' }, // ← major tower
      { x:1268,w:46,  h:280, type:'flat'  },
      { x:1314,w:60,  h:205, type:'flat'  },
      { x:1374,w:38,  h:125, type:'flat'  },
      // Lower right
      { x:1412,w:75,  h:245, type:'flat'  },
      { x:1487,w:50,  h:370, type:'tower' },
      { x:1537,w:44,  h:160, type:'flat'  },
      { x:1581,w:68,  h:220, type:'flat'  },
      { x:1649,w:42,  h:95,  type:'flat'  },
      { x:1691,w:80,  h:300, type:'flat'  },
      { x:1771,w:55,  h:185, type:'flat'  },
      // Right edge tapers
      { x:1826,w:65,  h:265, type:'tower' },
      { x:1891,w:48,  h:142, type:'flat'  },
      { x:1939,w:70,  h:198, type:'flat'  },
      { x:2009,w:45,  h:110, type:'flat'  },
    ];

    fgBuildings.forEach(({ x, w, h, type }) => {
      if      (type === 'tower') drawTower(x, H, w, h, '#0f1320', 0.40);
      else if (type === 'glass') drawGlass(x, H, w, h, 0.55);
      else                       drawFlat (x, H - h, w, h, '#0d1118', 0.38);
    });

    // ── Street level ─────────────────────────────────────────────
    const st = ctx.createLinearGradient(0, H * 0.82, 0, H);
    st.addColorStop(0, '#0c0f16'); st.addColorStop(1, '#060709');
    ctx.fillStyle = st; ctx.fillRect(0, H * 0.82, W, H * 0.18);

    // Wet road reflections (orange/yellow puddle glows)
    for (let i = 0; i < 22; i++) {
      const rx = hsh(i * 7.7 + 30) * W, rl = 18 + hsh(i * 5.1) * 40;
      const rg = ctx.createRadialGradient(rx, H * 0.92, 0, rx, H * 0.92, rl);
      const warm = hsh(i * 3.3) > 0.5;
      rg.addColorStop(0, warm ? 'rgba(255,195,70,0.42)' : 'rgba(150,200,255,0.30)');
      rg.addColorStop(0.4, warm ? 'rgba(255,150,30,0.15)' : 'rgba(100,160,230,0.10)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(rx - rl, H * 0.87, rl * 2, H * 0.13);
    }

    return new THREE.CanvasTexture(cv);
  }

  /* ── Procedural plaster wall texture ─────────────────────────── */
  _buildWallTexture() {
    const W = 1024, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Warm greige base — matches wallMat color tint
    ctx.fillStyle = '#d4ccc0';
    ctx.fillRect(0, 0, W, H);

    // Micro plaster variation via layered sine noise
    const noise = (x, y) =>
      Math.sin(x * 0.038 + y * 0.029) * Math.cos(x * 0.021 - y * 0.043)
      + Math.sin(x * 0.082 + y * 0.071) * 0.45;

    const step = 4;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const n = noise(x, y);
        if (n > 0.28) {
          ctx.fillStyle = `rgba(0,0,0,${((n - 0.28) * 0.045).toFixed(3)})`;
          ctx.fillRect(x, y, step, step);
        } else if (n < -0.55) {
          ctx.fillStyle = `rgba(255,255,255,${((-n - 0.55) * 0.06).toFixed(3)})`;
          ctx.fillRect(x, y, step, step);
        }
      }
    }

    // Very faint vertical brush strokes (typical of roller-painted walls)
    for (let x = 0; x < W; x += 18) {
      const a = (Math.sin(x * 0.41) * 0.3 + 0.5) * 0.012;
      ctx.strokeStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(x * 0.07) * 6, 0);
      ctx.lineTo(x + Math.sin(x * 0.07 + 3) * 8, H);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(cv);
  }

  /* ── Procedural wood floor texture ───────────────────────────── */
  _buildWoodTexture() {
    const W = 2048, H = 2048;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const plankH  = 160;
    const numPlanks = Math.ceil(H / plankH);
    // Per-plank tone palette (warm oaks)
    const tones = [172, 154, 186, 162, 176, 148, 182, 158, 168];

    for (let row = 0; row < numPlanks; row++) {
      const y0 = row * plankH;
      const base = tones[row % tones.length] + Math.floor(Math.sin(row * 2.3) * 14);

      // Plank base colour
      ctx.fillStyle = `rgb(${base},${Math.floor(base * 0.64)},${Math.floor(base * 0.37)})`;
      ctx.fillRect(0, y0 + 3, W, plankH - 3);

      // Subtle highlight band across plank (simulates lacquer sheen)
      const hl = ctx.createLinearGradient(0, y0 + plankH * 0.12, 0, y0 + plankH * 0.45);
      hl.addColorStop(0,   'rgba(255,248,220,0)');
      hl.addColorStop(0.5, 'rgba(255,248,220,0.07)');
      hl.addColorStop(1,   'rgba(255,248,220,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(0, y0, W, plankH);

      // Grain lines — multi-frequency bezier curves
      for (let g = y0 + 10; g < y0 + plankH - 8; g += 2 + (row * 11 % 4)) {
        const f1 = 0.003 + (row * 7  % 3) * 0.0012;
        const f2 = 0.007 + (row * 13 % 4) * 0.0018;
        const al = 0.018 + (g % 6) * 0.005;
        ctx.strokeStyle = `rgba(0,0,0,${al.toFixed(3)})`;
        ctx.lineWidth = (g % 9 === 0) ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, g);
        ctx.bezierCurveTo(
          W * 0.25, g + Math.sin(g * f1) * 4 + Math.cos(g * f2) * 2,
          W * 0.75, g - Math.sin(g * f1 + 1) * 3.5 + Math.sin(g * f2 * 1.6) * 1.5,
          W,        g + Math.cos(g * f1 * 0.8) * 3
        );
        ctx.stroke();
      }

      // Knot (every 5th plank, offset)
      if (row % 5 === 2) {
        const kx = W * (0.22 + (row * 0.29 % 0.56));
        const ky = y0 + plankH * 0.48;
        const kr = 10 + (row % 8);
        const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr * 2.8);
        kg.addColorStop(0,   'rgba(50,24,8,0.92)');
        kg.addColorStop(0.3, 'rgba(72,40,16,0.55)');
        kg.addColorStop(0.7, 'rgba(95,58,24,0.22)');
        kg.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = kg;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr, kr * 0.65, 0.35, 0, Math.PI * 2);
        ctx.fill();
        // Grain rings around knot
        for (let ri = 1; ri <= 3; ri++) {
          ctx.strokeStyle = `rgba(0,0,0,${(0.08 - ri * 0.02).toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(kx, ky, kr * (1 + ri * 0.6), kr * (0.65 + ri * 0.4), 0.35, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Plank gap (dark seam)
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(0, y0, W, 3);

      // Staggered vertical board seams
      const seamOff = (row % 4) * Math.floor(W / 4);
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      [0, W / 3, (W * 2) / 3].forEach(s => {
        const sx = (s + seamOff) % W;
        ctx.fillRect(sx, y0 + 3, 2, plankH - 3);
      });
    }

    return new THREE.CanvasTexture(cv);
  }

  /* ── Room geometry ────────────────────────────────────────────── */
  _buildRoom() {
    // Shared textured wall material — warm greige (not white)
    const wallTex = this._buildWallTexture();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(2, 2);
    const wallMat = new THREE.MeshStandardMaterial({
      map:       wallTex,
      color:     0xc8bfb2,   // warm greige — clearly not white
      roughness: 0.94,
      metalness: 0.0,
    });

    // City skyline material (self-lit, used for both window views)
    const cityTex = this._buildCityTexture();
    const cityMat = new THREE.MeshBasicMaterial({ map: cityTex });

    // Window opening dimensions — large balcony-style (world-space)
    const winW = 3.6, winH = 4.2;
    const winCY = 1.1, winCZ = -0.5;  // centred slightly below mid-height

    const wallTotH = 6.5, wallTotW = 14, wallCY = 1.2;
    const wallTop = wallCY + wallTotH / 2;  //  4.45
    const wallBot = wallCY - wallTotH / 2;  // -2.05
    const wallL   = winCZ  - wallTotW / 2;  // -7.5
    const wallR   = winCZ  + wallTotW / 2;  //  6.5

    const winTop = winCY + winH / 2;   //  3.2
    const winBot = winCY - winH / 2;   // -1.0
    const winL   = winCZ - winW / 2;   // -2.3
    const winR   = winCZ + winW / 2;   //  1.3

    const sidePW = (wallTotW - winW) / 2;   // 5.2
    const topPH  = wallTop - winTop;         // 1.25
    const botPH  = winBot  - wallBot;        // 1.05

    // Helper: add a wall panel
    const addPanel = (geo, rotY, x, y, z, mat) => {
      const m = new THREE.Mesh(geo, (mat || wallMat).clone());
      m.rotation.y = rotY;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };

    // ── Wood floor ────────────────────────────────────────────────
    const woodTex = this._buildWoodTexture();
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(3, 3);
    const floorMat = new THREE.MeshStandardMaterial({
      map:       woodTex,
      roughness: 0.58,
      metalness: 0.04,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ── Ceiling ────────────────────────────────────────────────────
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), wallMat.clone());
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 4.5;
    this.scene.add(ceil);

    // ── Back wall ──────────────────────────────────────────────────
    addPanel(new THREE.PlaneGeometry(14, 7), 0, 0, 1.2, -6, wallMat);

    // ── LEFT WALL — 4 panels around window ────────────────────────
    const lRot = Math.PI / 2;
    addPanel(new THREE.PlaneGeometry(wallTotW, topPH), lRot, -5, winTop + topPH / 2, winCZ);          // top
    addPanel(new THREE.PlaneGeometry(wallTotW, botPH), lRot, -5, wallBot + botPH / 2, winCZ);         // bottom
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  lRot, -5, winCY, wallL + sidePW / 2);          // left side
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  lRot, -5, winCY, wallR - sidePW / 2);          // right side

    // City view plane behind left window — exactly matches opening
    const lCity = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), cityMat.clone());
    lCity.rotation.y = lRot;
    lCity.position.set(-5.6, winCY, winCZ);
    this.scene.add(lCity);

    // ── RIGHT WALL — 4 panels around window ───────────────────────
    const rRot = -Math.PI / 2;
    addPanel(new THREE.PlaneGeometry(wallTotW, topPH), rRot,  5, winTop + topPH / 2, winCZ);
    addPanel(new THREE.PlaneGeometry(wallTotW, botPH), rRot,  5, wallBot + botPH / 2, winCZ);
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  rRot,  5, winCY, wallL + sidePW / 2);
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  rRot,  5, winCY, wallR - sidePW / 2);

    // City view plane behind right window
    const rCity = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), cityMat.clone());
    rCity.rotation.y = rRot;
    rCity.position.set(5.6, winCY, winCZ);
    this.scene.add(rCity);

    // ── Window reveals / embrasure (wall thickness cross-section) ─
    // Gives each window physical depth (0.6m wall thickness)
    const revealMat = new THREE.MeshStandardMaterial({ color: 0xddd4c8, roughness: 0.88, metalness: 0.0 });

    // Window reveals — wall cross-section visible inside the opening
    const addRevealPieces = (wx) => {
      const depth = 0.6;
      const cx = wx < 0 ? wx - depth / 2 : wx + depth / 2;
      const pieces = [
        [depth, 0.04, winW,        cx, winTop,  winCZ],  // soffit
        [depth, 0.10, winW + 0.08, cx, winBot,  winCZ],  // sill
        [depth, winH, 0.04,        cx, winCY,   winL ],  // left jamb
        [depth, winH, 0.04,        cx, winCY,   winR ],  // right jamb
      ];
      pieces.forEach(([bw, bh, bd, px, py, pz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), revealMat);
        m.position.set(px, py, pz);
        this.scene.add(m);
      });
    };
    addRevealPieces(-5);
    addRevealPieces( 5);

    // ── Window frames (slim dark metal) ───────────────────────────
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.25, metalness: 0.80 });
    const fD = 0.05, fW = 0.055;

    const addFrame = (wx) => {
      const sx = wx < 0 ? 1 : -1;
      const ex = wx + sx * fD / 2;
      [
        [ex, winTop, winCZ,  winW + fW * 2, fW, fD],   // top rail
        [ex, winBot, winCZ,  winW + fW * 2, fW, fD],   // bottom rail
        [ex, winCY,  winL,   fD, winH + fW * 2, fW],   // left post
        [ex, winCY,  winR,   fD, winH + fW * 2, fW],   // right post
        // Three horizontal rails dividing into 4 panes
        [ex, winBot + winH * 0.33, winCZ,  winW, fW * 0.8, fD],
        [ex, winBot + winH * 0.66, winCZ,  winW, fW * 0.8, fD],
        // One vertical mullion
        [ex, winCY, winCZ,  fD, winH, fW * 0.8],
      ].forEach(([fx, fy, fz, bw, bh, bd]) => {
        const fb = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), frameMat);
        fb.position.set(fx, fy, fz);
        this.scene.add(fb);
      });
    };
    addFrame(-5);
    addFrame( 5);

    // ── Ceiling skylight ──────────────────────────────────────────
    const slW = 3.0, slD = 2.2, ceilY = 4.48;
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xfff9f0 });
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(slW, slD), glassMat);
    glassPane.rotation.x = Math.PI / 2;
    glassPane.position.set(0, ceilY, -0.5);
    this.scene.add(glassPane);

    const slFrMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5, metalness: 0.6 });
    const fw = 0.07, fh = 0.12;
    [
      { pos: [0, ceilY + 0.01, -0.5 + slD / 2], size: [slW + fw * 2, fh, fw] },
      { pos: [0, ceilY + 0.01, -0.5 - slD / 2], size: [slW + fw * 2, fh, fw] },
      { pos: [ slW / 2, ceilY + 0.01, -0.5],    size: [fw, fh, slD] },
      { pos: [-slW / 2, ceilY + 0.01, -0.5],    size: [fw, fh, slD] },
      { pos: [0,         ceilY + 0.01, -0.5],    size: [slW, fh, fw] },
    ].forEach(({ pos, size }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), slFrMat);
      m.position.set(...pos);
      this.scene.add(m);
    });

    const housingMat = new THREE.MeshStandardMaterial({ color: 0xd8d4ce, roughness: 0.9 });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(slW + 0.4, 0.18, slD + 0.4), housingMat);
    housing.position.set(0, ceilY + 0.09, -0.5);
    this.scene.add(housing);
  }

  /* ── The sphere ───────────────────────────────────────────────── */
  _buildSphere() {
    const geo = new THREE.SphereGeometry(1, 64, 64);

    this._sphereMat = new THREE.MeshStandardMaterial({
      color:            0x060606,
      metalness:        0.12,
      roughness:        0.68,
      envMapIntensity:  0.5,
      emissive:         new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });

    this._sphere = new THREE.Mesh(geo, this._sphereMat);
    this._sphere.castShadow    = true;
    this._sphere.receiveShadow = false;
    // Sphere radius = 1, floor at y = -1.6 → sit on floor
    this._sphere.position.set(0, -0.6, 0);
    this.scene.add(this._sphere);

    // Outer glow sprite
    const glowC = document.createElement('canvas');
    glowC.width = glowC.height = 256;
    const gctx = glowC.getContext('2d');
    const gg   = gctx.createRadialGradient(128, 128, 85, 128, 128, 128);
    gg.addColorStop(0,    'rgba(179,0,0,0)');
    gg.addColorStop(0.55, 'rgba(179,0,0,0.04)');
    gg.addColorStop(0.8,  'rgba(179,0,0,0.12)');
    gg.addColorStop(1,    'rgba(179,0,0,0)');
    gctx.fillStyle = gg;
    gctx.fillRect(0, 0, 256, 256);

    this._glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:         new THREE.CanvasTexture(glowC),
      transparent:  true,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
      opacity:      0,
    }));
    this._glowSprite.scale.set(3.2, 3.2, 1);
    this.scene.add(this._glowSprite);
  }

  /* ── Ambient dust particles ───────────────────────────────────── */
  _buildParticles() {
    const COUNT     = 220;
    const positions = new Float32Array(COUNT * 3);
    const speeds    = new Float32Array(COUNT);
    const offsets   = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      speeds[i]    = 0.06 + Math.random() * 0.1;
      offsets[i]   = Math.random() * Math.PI * 2;
    }

    this._particlePositions = positions;
    this._particleSpeeds    = speeds;
    this._particleOffsets   = offsets;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:           0x9896a4,
      size:            0.035,
      transparent:     true,
      opacity:         0.55,
      sizeAttenuation: true,
      depthWrite:      false,
    });

    this._particles = new THREE.Points(geo, mat);
    this.scene.add(this._particles);
  }

  /* ── Lights ───────────────────────────────────────────────────── */
  _buildLights() {
    // Skylight spot — tight cone directly below the ceiling panel
    this._keyLight = new THREE.SpotLight(0xfff8f0, 3.5, 14, Math.PI / 7, 0.35, 1.2);
    this._keyLight.position.set(0, 4.4, -0.5);
    this._keyLight.target.position.set(0, -0.6, 0);
    this._keyLight.castShadow = true;
    this._keyLight.shadow.mapSize.set(2048, 2048);
    this._keyLight.shadow.camera.near = 0.5;
    this._keyLight.shadow.camera.far  = 12;
    this.scene.add(this._keyLight);
    this.scene.add(this._keyLight.target);

    // Soft fill from front — simulates bounce off walls
    this._fillLight = new THREE.PointLight(0xe8e4dc, 1.0, 12, 2);
    this._fillLight.position.set(0, 2, 5);
    this.scene.add(this._fillLight);

    // Side fill — cool-neutral from left wall
    const sideFill = new THREE.PointLight(0xd0d8e8, 0.6, 10, 2);
    sideFill.position.set(-4, 1.5, 0);
    this.scene.add(sideFill);

    // Warm ambient — kept low so walls show their actual colour
    this.scene.add(new THREE.AmbientLight(0xd8d0c4, 1.6));

    // Cool moonlight bleeding in from side windows
    const lWin = new THREE.PointLight(0x5878b8, 1.1, 8, 2);
    lWin.position.set(-4.0, 1.3, -0.5);
    this.scene.add(lWin);

    const rWin = new THREE.PointLight(0x5878b8, 1.1, 8, 2);
    rWin.position.set( 4.0, 1.3, -0.5);
    this.scene.add(rWin);
  }

  /* ── Holographic labels ───────────────────────────────────────── */
  _buildLabels() {
    this._labelData = [
      { name: 'Tokyo',      id: 'tokyo',     pos: new THREE.Vector3( 1.85,  0.75,  0.3) },
      { name: 'Sahara',     id: 'sahara',    pos: new THREE.Vector3(-1.65,  0.18,  1.1) },
      { name: 'Rio',        id: 'rio',       pos: new THREE.Vector3(-1.15, -0.85,  1.0) },
      { name: 'Paris',      id: 'paris',     pos: new THREE.Vector3( 0.4,   1.55, -1.4) },
      { name: 'Portraits',  id: 'portraits', pos: new THREE.Vector3( 1.6,  -0.6,  -1.05) },
      { name: 'Mountains',  id: 'mountains', pos: new THREE.Vector3(-0.3,   1.2,   1.85) },
      { name: 'Ocean',      id: 'ocean',     pos: new THREE.Vector3( 0.1,  -1.6,  -1.5) },
    ];

    // Build DOM elements
    this._labelData.forEach(label => {
      const el = document.createElement('div');
      el.className       = 'holo-label';
      el.dataset.gallery = label.id;

      el.innerHTML = `
        <div class="holo-label-inner">
          <div class="holo-dot"></div>
          <div class="holo-line"></div>
          <span class="holo-text">${label.name}</span>
        </div>`;

      el.addEventListener('click', () => {
        if (!this._activated || this._inTransition) return;
        this._triggerGallery(label.id);
      });

      this.labelsCtn.appendChild(el);
      label.el = el;
    });
  }

  /* ── Input events ─────────────────────────────────────────────── */
  _setupEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown', e => {
      this._isDragging = true;
      this._prevMouse  = { x: e.clientX, y: e.clientY };
      c.style.cursor   = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
      // Update mouse for raycasting
      this._mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
      this._mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (!this._isDragging) return;
      const dx = e.clientX - this._prevMouse.x;
      const dy = e.clientY - this._prevMouse.y;
      this._thetaTarget -= dx * 0.006;
      this._phiTarget    = Math.max(0.3, Math.min(Math.PI - 0.3,
        this._phiTarget - dy * 0.006));
      this._prevMouse    = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this._isDragging   = false;
      this.canvas.style.cursor = 'default';
    });

    // Touch support
    c.addEventListener('touchstart', e => {
      const t = e.touches[0];
      this._isDragging = true;
      this._prevMouse  = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (!this._isDragging) return;
      const t  = e.touches[0];
      const dx = t.clientX - this._prevMouse.x;
      const dy = t.clientY - this._prevMouse.y;
      this._thetaTarget -= dx * 0.006;
      this._phiTarget    = Math.max(0.3, Math.min(Math.PI - 0.3,
        this._phiTarget - dy * 0.006));
      this._prevMouse    = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    window.addEventListener('touchend', () => { this._isDragging = false; });

    // Sphere click
    c.addEventListener('click', e => {
      if (this._inTransition) return;
      this._checkSphereClick();
    });
  }

  /* ── Camera helpers ───────────────────────────────────────────── */
  _updateCamera() {
    const r   = this._radius;
    const phi = this._phi;
    const th  = this._theta;
    this.camera.position.set(
      r * Math.sin(phi) * Math.sin(th),
      r * Math.cos(phi) - 0.3,
      r * Math.sin(phi) * Math.cos(th)
    );
    this.camera.lookAt(0, -0.6, 0);
  }

  /* ── Sphere click check ───────────────────────────────────────── */
  _checkSphereClick() {
    this._raycaster.setFromCamera(this._mouse, this.camera);
    const hits = this._raycaster.intersectObject(this._sphere);
    if (hits.length > 0 && !this._activated) {
      this._activateSphere();
    }
  }

  /* ── Sphere activation ────────────────────────────────────────── */
  _activateSphere() {
    this._activated = true;

    // Pulse scale only — sphere stays matte black
    gsap.timeline()
      .to(this._sphere.scale, { x: 1.18, y: 1.18, z: 1.18, duration: 0.22, ease: 'power2.out' })
      .to(this._sphere.scale, { x: 1.00, y: 1.00, z: 1.00, duration: 0.35, ease: 'elastic.out(1.2, 0.5)' });

    // Show labels with stagger
    gsap.delayedCall(0.4, () => {
      this._labelData.forEach((label, i) => {
        gsap.to(label.el, { opacity: 1, duration: 0.6, delay: i * 0.12, ease: 'power2.out' });
      });
      // Show prompt
      this.prompt.classList.remove('hidden');
      gsap.from(this.prompt, { opacity: 0, y: -10, duration: 0.8, ease: 'power2.out' });
    });

    // Hide hint
    gsap.to(this.hint, { opacity: 0, duration: 0.5 });
  }

  /* ── Gallery transition ───────────────────────────────────────── */
  _triggerGallery(galleryId) {
    if (this._inTransition) return;
    this._inTransition = true;

    // Sphere pulse + zoom — no color change
    gsap.timeline()
      .to(this._sphere.scale, { x: 1.25, y: 1.25, z: 1.25, duration: 0.3, ease: 'power3.out' })
      .to(this._sphere.scale, { x: 1.00, y: 1.00, z: 1.00, duration: 0.2 });

    // Camera rushes toward sphere
    const rProxy = { r: this._radius };
    gsap.to(rProxy, {
      r:        0.4,
      duration: 1.2,
      ease:     'power3.inOut',
      onUpdate: () => {
        this._radius = rProxy.r;
        this._updateCamera();
      },
    });

    // Chromatic aberration flash via canvas filter
    this._chromaFlash();

    // Fade overlay to black → call onGallerySelect
    gsap.to(this.overlay, {
      opacity:  1,
      duration: 1.0,
      delay:    0.55,
      ease:     'power2.inOut',
      onComplete: () => {
        if (this.onGallerySelect) this.onGallerySelect(galleryId);
      },
    });
  }

  /* ── Chromatic aberration flash ───────────────────────────────── */
  _chromaFlash() {
    const cv = document.createElement('canvas');
    cv.id     = 'chroma-canvas';
    cv.style.cssText = `
      position:fixed;inset:0;width:100%;height:100%;
      pointer-events:none;z-index:50;mix-blend-mode:screen;
    `;
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
    document.body.appendChild(cv);

    const ctx = cv.getContext('2d');
    let frame = 0;
    const frames = 12;

    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const alpha = Math.max(0, 1 - frame / frames) * 0.35;
      const off   = (frames - frame) * 3;

      // Red channel shifted right
      ctx.fillStyle = `rgba(255,0,0,${alpha})`;
      ctx.fillRect(off, 0, cv.width, cv.height);

      // Blue channel shifted left
      ctx.fillStyle = `rgba(0,0,255,${alpha * 0.7})`;
      ctx.fillRect(-off * 0.6, 0, cv.width, cv.height);

      if (frame < frames) {
        frame++;
        requestAnimationFrame(draw);
      } else {
        cv.remove();
      }
    };

    draw();
  }

  /* ── Project 3D label positions to 2D screen ─────────────────── */
  _updateLabelPositions() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this._labelData.forEach(label => {
      if (!label.el) return;

      const p = label.pos.clone().project(this.camera);

      // Behind camera → hide
      if (p.z > 1) {
        label.el.style.visibility = 'hidden';
        return;
      }
      label.el.style.visibility = 'visible';

      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-p.y * 0.5 + 0.5) * h;
      label.el.style.left = x + 'px';
      label.el.style.top  = y + 'px';
    });
  }

  /* ── Hover detection ──────────────────────────────────────────── */
  _checkHover() {
    this._raycaster.setFromCamera(this._mouse, this.camera);
    const hits    = this._raycaster.intersectObject(this._sphere);
    const hovered = hits.length > 0;

    if (hovered !== this._hovering) {
      this._hovering = hovered;
      this.canvas.style.cursor = hovered ? 'pointer' : 'default';
    }
  }

  /* ── Animate dust particles ───────────────────────────────────── */
  _animateParticles(t) {
    const pos = this._particles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i,
        this._particlePositions[i * 3 + 1]
        + Math.sin(t * this._particleSpeeds[i] + this._particleOffsets[i]) * 0.08
      );
    }
    pos.needsUpdate = true;
  }

  /* ── Resize ───────────────────────────────────────────────────── */
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ── Start (called when scene becomes visible) ────────────────── */
  start() {
    this._startTime = Date.now();
    // Env map is best-effort — sphere renders fine without it
    try {
      if (!this._envMap) this._buildEnvMap();
    } catch (e) {
      console.warn('[Portfolio] env map skipped:', e.message);
    }
    // Force one immediate render before the loop so the canvas isn't blank
    this.renderer.render(this.scene, this.camera);
    this._animate();
  }

  /* ── Animation loop ───────────────────────────────────────────── */
  _animate() {
    if (this._disposed) return;
    this._animId = requestAnimationFrame(this._animate.bind(this));

    const t = (Date.now() - this._startTime) * 0.001;

    // Smooth camera orbit (inertia)
    if (!this._isDragging) {
      // Very slow auto-rotation when idle
      this._thetaTarget += 0.0018;
    }
    this._theta += (this._thetaTarget - this._theta) * 0.08;
    this._phi   += (this._phiTarget   - this._phi)   * 0.08;
    this._updateCamera();

    // Sphere breathing
    if (this._sphere && !this._inTransition) {
      const breathe = 1 + Math.sin(t * 1.2) * 0.006;
      this._sphere.scale.set(breathe, breathe, breathe);
    }

    // Particles drift
    this._animateParticles(t);

    // Hover detection
    this._checkHover();

    // Update label 2D positions
    if (this._activated) {
      this._updateLabelPositions();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ── Transition back in (from gallery) ────────────────────────── */
  transitionIn(onComplete) {
    this._inTransition = false;
    this._radius       = 4.2;
    this._updateCamera();

    // Reset sphere scale (position stays at floor level)
    this._sphere.scale.set(1, 1, 1);

    gsap.to(this.overlay, {
      opacity:  0,
      duration: 1.2,
      ease:     'power2.out',
      onComplete,
    });
  }

  /* ── Teardown ─────────────────────────────────────────────────── */
  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._animId);
    window.removeEventListener('resize', this._onResize.bind(this));
  }
}
