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

  /* ── Daytime window view — frame baked directly into texture ─── */
  _buildWindowTexture() {
    const W = 1024, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const hsh = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5; return x - Math.floor(x); };

    // ── Overcast daytime sky ──────────────────────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.42);
    sky.addColorStop(0,   '#9aa5b2');
    sky.addColorStop(0.5, '#aeb8c2');
    sky.addColorStop(1,   '#c2cad0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Horizon atmospheric haze
    const haze = ctx.createLinearGradient(0, H * 0.24, 0, H * 0.44);
    haze.addColorStop(0, 'rgba(190,202,212,0)');
    haze.addColorStop(1, 'rgba(190,202,212,0.70)');
    ctx.fillStyle = haze; ctx.fillRect(0, H * 0.24, W, H * 0.20);

    // ── Building helper ───────────────────────────────────────────
    const drawB = (x, top, w, bh, col) => {
      ctx.fillStyle = col; ctx.fillRect(x, top, w, bh);
      const gX = 8, gY = 10, pad = 4, wW = 3, wH = 6;
      const nC = Math.max(1, Math.floor((w - pad * 2) / gX));
      const nR = Math.max(1, Math.floor((bh - pad * 2) / gY));
      for (let r = 0; r < nR; r++) {
        for (let c = 0; c < nC; c++) {
          const v = hsh(x * 0.09 + c * 7.4 + top * 0.07 + r * 5.2);
          if (v < 0.18) {
            ctx.fillStyle = 'rgba(185,200,215,0.60)'; // glass reflection
            ctx.fillRect(x + pad + c * gX, top + pad + r * gY, wW, wH);
          } else if (v < 0.36) {
            ctx.fillStyle = 'rgba(45,50,55,0.50)';    // dark interior
            ctx.fillRect(x + pad + c * gX, top + pad + r * gY, wW, wH);
          }
        }
      }
    };

    // Far silhouette (heavily hazed)
    [[0,62,78],[62,40,55],[102,75,108],[177,44,68],[221,90,130],[311,50,82],
     [361,68,98],[429,38,60],[467,82,115],[549,55,84],[604,70,102],[674,42,65],
     [716,85,128],[801,48,75],[849,62,92],[911,50,72],[961,68,100],[1029,40,58],
    ].forEach(([x,w,h]) => {
      const t = 168 + Math.floor(hsh(x * 0.04) * 14);
      drawB(x, H * 0.42 - h, w, h, `rgb(${t},${t + 5},${t + 10})`);
    });

    // Mid distance
    [[0,55,135],[55,38,98],[93,70,178],[163,45,128],[208,85,215],[293,50,155],
     [343,65,188],[408,42,118],[450,78,205],[528,55,162],[583,68,195],[651,44,138],
     [695,82,230],[777,48,148],[825,62,175],[887,44,122],[931,75,205],[1006,50,158],
    ].forEach(([x,w,h]) => {
      const t = 140 + Math.floor(hsh(x * 0.05) * 20);
      drawB(x, H - h, w, h, `rgb(${t},${t + 3},${t + 8})`);
    });

    // Foreground buildings (most visible, most varied heights)
    [[0,50,122],[50,35,85],[85,65,165],[150,42,112],[192,80,205],[272,48,148],
     [320,62,182],[382,38,100],[420,72,188],[492,52,155],[544,68,198],[612,44,128],
     [656,78,238],[734,50,162],[784,60,185],[844,42,115],[886,75,218],[961,48,152],
     [1009,52,170],
    ].forEach(([x,w,h]) => {
      const t = 108 + Math.floor(hsh(x * 0.07) * 24);
      drawB(x, H - h, w, h, `rgb(${t},${t + 3},${t + 6})`);
    });

    // Street level
    const st = ctx.createLinearGradient(0, H * 0.78, 0, H);
    st.addColorStop(0, '#6e757e'); st.addColorStop(1, '#5c6268');
    ctx.fillStyle = st; ctx.fillRect(0, H * 0.78, W, H * 0.22);

    // ── Window frame — baked into texture (NO 3-D geometry) ──────
    // This completely replaces all BoxGeometry frame pieces.
    const FC = '#28241e';   // dark charcoal-brown
    const outerW = 20;      // outer border (px)
    const barW   = 12;      // interior bar width (px)

    ctx.fillStyle = FC;
    ctx.fillRect(0,          0,          W, outerW);   // top
    ctx.fillRect(0,          H - outerW, W, outerW);   // bottom
    ctx.fillRect(0,          0,          outerW, H);   // left
    ctx.fillRect(W - outerW, 0,          outerW, H);   // right

    // 3 vertical mullions → 4 columns
    [W * 0.25, W * 0.5, W * 0.75].forEach(xp => {
      ctx.fillRect(Math.round(xp) - barW / 2, 0, barW, H);
    });
    // 2 horizontal rails → 3 rows
    [H * 0.40, H * 0.72].forEach(yp => {
      ctx.fillRect(0, Math.round(yp) - barW / 2, W, barW);
    });

    // Subtle glass shimmer
    const shimmer = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.45);
    shimmer.addColorStop(0,   'rgba(255,255,255,0.04)');
    shimmer.addColorStop(0.35,'rgba(255,255,255,0.09)');
    shimmer.addColorStop(1,   'rgba(255,255,255,0.00)');
    ctx.fillStyle = shimmer; ctx.fillRect(0, 0, W, H);

    return new THREE.CanvasTexture(cv);
  }

  /* ── Procedural plaster wall texture ─────────────────────────── */
  _buildWallTexture() {
    const W = 1024, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Warm greige base — matches wallMat color tint
    ctx.fillStyle = '#e0d8c8';
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
    const tones = [125, 108, 138, 115, 128, 102, 135, 112, 122];

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
      color:     0xdfd4be,   // warm cream
      roughness: 0.94,
      metalness: 0.0,
    });

    // City skyline material (self-lit, used for both window views)
    const cityTex = this._buildWindowTexture();
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

    // City view plane — nearly flush with wall so it reads as a window, not a box
    const lCity = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), cityMat.clone());
    lCity.rotation.y = lRot;
    lCity.position.set(-5.04, winCY, winCZ);
    this.scene.add(lCity);

    // ── RIGHT WALL — 4 panels around window ───────────────────────
    const rRot = -Math.PI / 2;
    addPanel(new THREE.PlaneGeometry(wallTotW, topPH), rRot,  5, winTop + topPH / 2, winCZ);
    addPanel(new THREE.PlaneGeometry(wallTotW, botPH), rRot,  5, wallBot + botPH / 2, winCZ);
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  rRot,  5, winCY, wallL + sidePW / 2);
    addPanel(new THREE.PlaneGeometry(sidePW,   winH),  rRot,  5, winCY, wallR - sidePW / 2);

    // City view plane — right wall
    const rCity = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), cityMat.clone());
    rCity.rotation.y = rRot;
    rCity.position.set(5.04, winCY, winCZ);
    this.scene.add(rCity);

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

    // ── Pendant lamp ──────────────────────────────────────────────
    const lampY = 2.8;
    // Cord
    const cordMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 8), cordMat);
    cord.position.set(0, lampY + 0.8, -1.5);
    this.scene.add(cord);
    // Shade — inverted cone
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.38, 24, 1, true), shadeMat);
    shade.rotation.x = Math.PI; // flip so open end faces down
    shade.position.set(0, lampY, -1.5);
    this.scene.add(shade);
    // Inner glow disc
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe8c0 });
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), glowMat);
    glowDisc.rotation.x = Math.PI / 2;
    glowDisc.position.set(0, lampY - 0.19, -1.5);
    this.scene.add(glowDisc);

    // ── Baseboards ────────────────────────────────────────────────
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.85 });
    const bH = 0.12, bD = 0.04, floorY = -1.6;
    // Back wall baseboard
    const bbBack = new THREE.Mesh(new THREE.BoxGeometry(14, bH, bD), baseMat);
    bbBack.position.set(0, floorY + bH / 2, -5.98);
    this.scene.add(bbBack);
    // Left wall baseboard
    const bbLeft = new THREE.Mesh(new THREE.BoxGeometry(bD, bH, 14), baseMat);
    bbLeft.position.set(-4.98, floorY + bH / 2, 0);
    this.scene.add(bbLeft);
    // Right wall baseboard
    const bbRight = new THREE.Mesh(new THREE.BoxGeometry(bD, bH, 14), baseMat);
    bbRight.position.set(4.98, floorY + bH / 2, 0);
    this.scene.add(bbRight);
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

    // Daylight spilling in from side windows
    const lWin = new THREE.PointLight(0xa8c4d8, 1.2, 8, 2);
    lWin.position.set(-4.0, 1.3, -0.5);
    this.scene.add(lWin);

    const rWin = new THREE.PointLight(0xa8c4d8, 1.2, 8, 2);
    rWin.position.set( 4.0, 1.3, -0.5);
    this.scene.add(rWin);

    // Pendant lamp — warm incandescent point light
    this._pendantLight = new THREE.PointLight(0xffcf80, 2.2, 7, 2);
    this._pendantLight.position.set(0, 2.7, -1.5);
    this.scene.add(this._pendantLight);
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
