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
    const W = 1024, H = 512;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const h = (n) => { const x = Math.sin(n + 1) * 73856; return x - Math.floor(x); };

    // Deep night sky
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0,    '#04060f');
    sky.addColorStop(0.45, '#080d1e');
    sky.addColorStop(1,    '#141d38');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (let i = 0; i < 180; i++) {
      const sx = h(i * 6.1) * W, sy = h(i * 3.9) * H * 0.6;
      const sa = 0.35 + h(i * 5.3) * 0.65;
      const sr = h(i * 2.7) > 0.93 ? 1.4 : 0.6;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${sa.toFixed(2)})`;
      ctx.fill();
    }

    // Moon + halo
    const mx = W * 0.82, my = H * 0.13;
    ctx.save();
    ctx.shadowColor = 'rgba(180,210,255,0.8)';
    ctx.shadowBlur  = 45;
    ctx.beginPath();
    ctx.arc(mx, my, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f4ff';
    ctx.fill();
    ctx.restore();
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
    halo.addColorStop(0.15, 'rgba(180,210,255,0.10)');
    halo.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 90, my - 90, 180, 180);

    // Horizon city glow (light pollution)
    const cg = ctx.createLinearGradient(0, H * 0.56, 0, H * 0.82);
    cg.addColorStop(0, 'rgba(0,0,0,0)');
    cg.addColorStop(1, 'rgba(255,130,40,0.20)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, H * 0.56, W, H * 0.26);

    // Atmosphere haze
    const hz = ctx.createLinearGradient(0, H * 0.50, 0, H * 0.74);
    hz.addColorStop(0, 'rgba(20,30,60,0)');
    hz.addColorStop(1, 'rgba(30,40,70,0.32)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.50, W, H * 0.24);

    // Building helper (color, window fill fraction)
    const drawB = (x, top, w, bh, col, litFrac) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, top, w, bh);
      const wW = 4, wH = 6, gapX = 9, gapY = 11, padX = 5, padY = 6;
      const cols = Math.max(1, Math.floor((w - padX * 2) / gapX));
      const rows = Math.max(1, Math.floor((bh - padY * 2) / gapY));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (h(x * 0.31 + c * 11.7 + top * 0.19 + r * 7.3) < litFrac) {
            const warm = h(c * 4.1 + r * 3.7 + x * 0.1);
            ctx.fillStyle = warm > 0.72
              ? 'rgba(255,240,150,0.95)'
              : warm > 0.38 ? 'rgba(255,255,200,0.85)' : 'rgba(180,220,255,0.80)';
            ctx.fillRect(x + padX + c * gapX, top + padY + r * gapY, wW, wH);
          }
        }
      }
    };

    // Background buildings
    [[0,H,58,180],[58,H,42,150],[100,H,72,238],[172,H,48,170],
     [220,H,88,272],[308,H,52,190],[360,H,78,228],[440,H,44,165],
     [484,H,82,260],[566,H,62,205],[628,H,48,158],[676,H,96,288],
     [772,H,58,200],[830,H,68,244],[898,H,76,182],[974,H,44,170],
    ].forEach(([x,base,w,bh]) => drawB(x, base-bh, w, bh, '#090d18', 0.06));

    // Mid-ground buildings
    [[10,H,52,208],[62,H,60,268],[122,H,46,234],[168,H,82,308],
     [250,H,48,252],[298,H,72,292],[370,H,44,214],[414,H,90,362],
     [504,H,58,258],[562,H,52,238],[614,H,76,302],[690,H,46,198],
     [736,H,82,340],[818,H,54,222],[872,H,70,288],[942,H,56,212],
    ].forEach(([x,base,w,bh]) => drawB(x, base-bh, w, bh, '#0d1220', 0.18));

    // Foreground towers
    [[5,H,48,202,false],[53,H,62,292,false],[115,H,42,258,false],
     [157,H,80,372,true],[237,H,52,278,false],[289,H,70,328,false],
     [359,H,44,228,false],[403,H,90,428,true],[493,H,58,282,false],
     [551,H,48,252,false],[599,H,78,352,false],[677,H,44,212,false],
     [721,H,84,395,true],[805,H,52,262,false],[857,H,72,318,false],
     [929,H,58,238,false],[987,H,40,188,false],
    ].forEach(([x,base,w,bh,tower]) => {
      drawB(x, base-bh, w, bh, '#10141f', 0.42);
      if (tower) {
        ctx.fillStyle = '#0b0f1a';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.35, base - bh);
        ctx.lineTo(x + w / 2,    base - bh - 52);
        ctx.lineTo(x + w * 0.65, base - bh);
        ctx.fill();
        const bc = ctx.createRadialGradient(x+w/2, base-bh-52, 0, x+w/2, base-bh-52, 7);
        bc.addColorStop(0,   'rgba(255,55,55,1)');
        bc.addColorStop(0.5, 'rgba(255,70,70,0.5)');
        bc.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = bc;
        ctx.fillRect(x+w/2-7, base-bh-59, 14, 14);
      }
    });

    // Ground / wet street
    const st = ctx.createLinearGradient(0, H * 0.80, 0, H);
    st.addColorStop(0, '#0e1119');
    st.addColorStop(1, '#06080d');
    ctx.fillStyle = st;
    ctx.fillRect(0, H * 0.80, W, H * 0.20);

    // Wet-road light reflections
    for (let i = 0; i < 14; i++) {
      const rx = h(i * 8.3 + 100) * W, rl = 14 + h(i * 4.7) * 28;
      const rg = ctx.createRadialGradient(rx, H * 0.91, 0, rx, H * 0.91, rl);
      rg.addColorStop(0,   'rgba(255,200,80,0.38)');
      rg.addColorStop(0.4, 'rgba(255,160,40,0.14)');
      rg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(rx - rl, H * 0.86, rl * 2, H * 0.14);
    }

    return new THREE.CanvasTexture(cv);
  }

  /* ── Procedural plaster wall texture ─────────────────────────── */
  _buildWallTexture() {
    const W = 1024, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Warm off-white base
    ctx.fillStyle = '#f3f0eb';
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
    // Shared textured wall material
    const wallTex = this._buildWallTexture();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(2, 2);
    const wallMat = new THREE.MeshStandardMaterial({
      map:       wallTex,
      color:     0xf5f2ed,
      roughness: 0.92,
      metalness: 0.0,
    });

    // City skyline material (self-lit, used for both window views)
    const cityTex = this._buildCityTexture();
    const cityMat = new THREE.MeshBasicMaterial({ map: cityTex });

    // Window opening dimensions (world-space)
    const winW = 2.6, winH = 2.0;
    const winCY = 1.3, winCZ = -0.5;

    const wallTotH = 6.5, wallTotW = 14, wallCY = 1.2;
    const wallTop = wallCY + wallTotH / 2;  //  4.45
    const wallBot = wallCY - wallTotH / 2;  // -2.05
    const wallL   = winCZ  - wallTotW / 2;  // -7.5
    const wallR   = winCZ  + wallTotW / 2;  //  6.5

    const winTop = winCY + winH / 2;  //  2.3
    const winBot = winCY - winH / 2;  //  0.3
    const winL   = winCZ - winW / 2;  // -1.8
    const winR   = winCZ + winW / 2;  //  0.8

    const sidePW = (wallTotW - winW) / 2;   // 5.7
    const topPH  = wallTop - winTop;         // 2.15
    const botPH  = winBot  - wallBot;        // 2.35

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

    // City view plane behind left window (slightly offset outward)
    const lCity = new THREE.Mesh(new THREE.PlaneGeometry(winW + 0.6, winH + 0.5), cityMat.clone());
    lCity.rotation.y = lRot;
    lCity.position.set(-5.5, winCY, winCZ);
    this.scene.add(lCity);

    // ── RIGHT WALL — 4 panels around window ───────────────────────
    const rRot = -Math.PI / 2;
    addPanel(new THREE.PlaneGeometry(wallTotW, topPH), rRot,  5, winTop + topPH / 2, winCZ);          // top
    addPanel(new THREE.PlaneGeometry(wallTotW, botPH), rRot,  5, wallBot + botPH / 2, winCZ);         // bottom
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  rRot,  5, winCY, wallL + sidePW / 2);          // left side
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  rRot,  5, winCY, wallR - sidePW / 2);          // right side

    // City view plane behind right window
    const rCity = new THREE.Mesh(new THREE.PlaneGeometry(winW + 0.6, winH + 0.5), cityMat.clone());
    rCity.rotation.y = rRot;
    rCity.position.set(5.5, winCY, winCZ);
    this.scene.add(rCity);

    // ── Window frames (slim dark metal) ───────────────────────────
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.28, metalness: 0.72 });
    const fD = 0.06, fW = 0.07; // depth (into room), bar width

    const addFrame = (wx) => {
      const sx = wx < 0 ? 1 : -1; // sign toward room interior
      const ex = wx + sx * fD / 2;
      [
        // [x, y, z,  BoxGeometry(w, h, d)]
        [ex, winTop, winCZ,  winW + fW * 2, fW, fD],  // top bar
        [ex, winBot, winCZ,  winW + fW * 2, fW, fD],  // bottom bar
        [ex, winCY,  winL,   fD, winH + fW * 2, fW],  // left upright
        [ex, winCY,  winR,   fD, winH + fW * 2, fW],  // right upright
        [ex, winCY,  winCZ,  winW, fW, fD],            // mid horizontal
        [ex, winCY,  winCZ,  fD, winH, fW],            // mid vertical
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

    // Warm ambient
    this.scene.add(new THREE.AmbientLight(0xddd9d0, 3.0));

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
