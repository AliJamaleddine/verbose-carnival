/* ================================================================
   ACT 1 · THE UNIVERSE
   Earth rotating in deep space — cinematic intro.
   ================================================================ */

class UniverseScene {
  constructor() {
    this.canvas     = document.getElementById('universe-canvas');
    this.overlay    = document.getElementById('act1-overlay');
    this.introText  = document.getElementById('intro-text');
    this.skipBtn    = document.getElementById('skip-intro');

    this._animId    = null;
    this._startTime = Date.now();
    this._disposed  = false;

    // Camera spherical state for gentle orbit
    this._camTheta  = 0;
    this._camPhi    = Math.PI * 0.48;
    this._camRadius = 7.5;

    this._setupRenderer();
    this._setupScene();
    this._buildStars();
    this._buildEarth();
    this._buildAtmosphere();
    this._buildLights();

    window.addEventListener('resize', this._onResize.bind(this));
    this._animate();
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
    this.renderer.setClearColor(0x03030a, 1);
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  /* ── Scene & camera ───────────────────────────────────────────── */
  _setupScene() {
    this.scene  = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x03030a, 0.008);

    this.camera = new THREE.PerspectiveCamera(
      45, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    this._updateCameraPosition();
  }

  /* ── Stars particle field ─────────────────────────────────────── */
  _buildStars() {
    const COUNT     = 8000;
    const positions = new Float32Array(COUNT * 3);
    const alphas    = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Uniform sphere distribution
      const u     = Math.random();
      const v     = Math.random();
      const theta = 2 * Math.PI * u;
      const phi   = Math.acos(2 * v - 1);
      const r     = 150 + Math.random() * 250;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      alphas[i]            = 0.4 + Math.random() * 0.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Simple star texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width  = 32;
    starCanvas.height = 32;
    const sc = starCanvas.getContext('2d');
    const sg = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
    sg.addColorStop(0.0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    sg.addColorStop(1.0, 'rgba(255,255,255,0)');
    sc.fillStyle = sg;
    sc.fillRect(0, 0, 32, 32);

    const starTex = new THREE.CanvasTexture(starCanvas);

    const mat = new THREE.PointsMaterial({
      map:            starTex,
      size:           0.7,
      sizeAttenuation: true,
      transparent:    true,
      opacity:        0.85,
      depthWrite:     false,
    });

    this._stars = new THREE.Points(geo, mat);
    this.scene.add(this._stars);
  }

  /* ── Shared elevation data (Float32Array) ────────────────────── */
  _generateElevation(W, H) {
    const elev = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const latAbs = Math.abs(y / H - 0.5) * 2.0;
      for (let x = 0; x < W; x++) {
        const nx = (x / W) * 6.2;
        const ny = (y / H) * 3.1;

        // Domain-warped FBM — organic continent shapes
        const wx = NoiseUtils.fbm(nx,       ny,       4) * 2.1;
        const wy = NoiseUtils.fbm(nx + 5.2, ny + 1.3, 4) * 2.1;
        let e = NoiseUtils.fbm(nx + wx, ny + wy, 8);

        // Ridge noise — sharp mountain spines
        const ridge  = NoiseUtils.ridgedFbm(nx * 1.7 + 3.1, ny * 1.7 + 7.4, 6);
        // Secondary ridges at a different angle for cross-range texture
        const ridge2 = NoiseUtils.ridgedFbm(nx * 2.3 + 9.8, ny * 1.1 + 2.5, 4);
        e = e * 0.55 + ridge * 0.32 + ridge2 * 0.13;

        // Fine micro-relief detail
        const micro = NoiseUtils.fbm(nx * 5.5 + 21.3, ny * 5.5 + 8.7, 3) * 0.06;
        e = Math.max(0, Math.min(1, e + micro));

        // Polar ice caps
        const polarBlend = Math.max(0, (latAbs - 0.80) / 0.20);
        e = e * (1 - polarBlend) + 0.94 * polarBlend;

        elev[y * W + x] = e;
      }
    }
    return elev;
  }

  /* ── Color texture from elevation ────────────────────────────── */
  _generateEarthTexture(elev, W, H) {
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d   = img.data;

    // Photo-matched colour palette (Central-Asia / Himalaya look)
    const C = {
      deepSea:   [  6,  16,  52],   // abyssal blue
      ocean:     [ 12,  42, 105],   // open ocean
      shallow:   [ 22,  80, 140],   // shelf / shallow
      coast:     [ 55,  78,  42],   // dark-green coastal plain
      steppe:    [148, 118,  62],   // tan / ochre steppe (Tibet)
      highland:  [128,  92,  48],   // mid-brown highland
      rocky:     [ 88,  68,  38],   // dark rocky ridge base
      scree:     [118, 102,  84],   // grey-brown scree / talus
      snowline:  [195, 188, 178],   // grey-white transition
      snow:      [245, 248, 255],   // pure white peaks
    };

    const lerp3 = (a, b, t) => [
      (a[0] + (b[0] - a[0]) * t + 0.5) | 0,
      (a[1] + (b[1] - a[1]) * t + 0.5) | 0,
      (a[2] + (b[2] - a[2]) * t + 0.5) | 0,
    ];

    const elevToColor = (e) => {
      if (e < 0.36) return lerp3(C.deepSea,  C.ocean,    e / 0.36);
      if (e < 0.44) return lerp3(C.ocean,    C.shallow,  (e - 0.36) / 0.08);
      if (e < 0.49) return lerp3(C.shallow,  C.coast,    (e - 0.44) / 0.05);
      if (e < 0.56) return lerp3(C.coast,    C.steppe,   (e - 0.49) / 0.07);
      if (e < 0.65) return lerp3(C.steppe,   C.highland, (e - 0.56) / 0.09);
      if (e < 0.72) return lerp3(C.highland, C.rocky,    (e - 0.65) / 0.07);
      if (e < 0.79) return lerp3(C.rocky,    C.scree,    (e - 0.72) / 0.07);
      if (e < 0.87) return lerp3(C.scree,    C.snowline, (e - 0.79) / 0.08);
      return lerp3(C.snowline, C.snow, Math.min(1, (e - 0.87) / 0.09));
    };

    for (let y = 0; y < H; y++) {
      const latAbs = Math.abs(y / H - 0.5) * 2.0;
      for (let x = 0; x < W; x++) {
        const e = elev[y * W + x];
        let [r, g, b] = elevToColor(e);

        // Ocean depth darkening
        if (e < 0.44) {
          const depth = 1 - e / 0.44;
          r = (r * (1 - depth * 0.6) + 0.5) | 0;
          g = (g * (1 - depth * 0.5) + 0.5) | 0;
          b = (b * (1 - depth * 0.2) + 0.5) | 0;
        }

        // Subtle cold-tint at mid-latitudes on land
        if (e >= 0.49 && latAbs > 0.48 && latAbs < 0.80) {
          const cold = (latAbs - 0.48) / 0.32;
          r = (r + (175 - r) * cold * 0.18 + 0.5) | 0;
          g = (g + (188 - g) * cold * 0.15 + 0.5) | 0;
          b = (b + (205 - b) * cold * 0.20 + 0.5) | 0;
        }

        const i = (y * W + x) * 4;
        d[i]     = Math.max(0, Math.min(255, r));
        d[i + 1] = Math.max(0, Math.min(255, g));
        d[i + 2] = Math.max(0, Math.min(255, b));
        d[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    // Sunlit hemisphere soft overlay
    const spec = ctx.createRadialGradient(W * 0.30, H * 0.26, 0, W * 0.5, H * 0.5, W * 0.58);
    spec.addColorStop(0,   'rgba(255,248,228,0.07)');
    spec.addColorStop(0.5, 'rgba(0,0,0,0)');
    spec.addColorStop(1,   'rgba(0,0,0,0.30)');
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, W, H);

    return new THREE.CanvasTexture(canvas);
  }

  /* ── Normal map from elevation (Sobel gradient) ──────────────── */
  _generateNormalMap(elev, W, H) {
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d   = img.data;

    const STR = 10.0; // relief strength — higher = more dramatic mountains

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const xl = elev[y * W + Math.max(0, x - 1)];
        const xr = elev[y * W + Math.min(W - 1, x + 1)];
        const yu = elev[Math.max(0, y - 1) * W + x];
        const yd = elev[Math.min(H - 1, y + 1) * W + x];

        const nx = (xl - xr) * STR;
        const ny = (yd - yu) * STR;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

        const i = (y * W + x) * 4;
        d[i]     = ((nx / len) * 0.5 + 0.5) * 255 | 0;
        d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255 | 0;
        d[i + 2] = ((nz / len) * 0.5 + 0.5) * 255 | 0;
        d[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(canvas);
  }

  /* ── Cloud texture ────────────────────────────────────────────── */
  _generateCloudTexture() {
    const W = 512, H = 256;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const imgData = ctx.createImageData(W, H);
    const d       = imgData.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx  = (x / W) * 7 + 3.1;
        const ny  = (y / H) * 3.5 + 1.7;
        const val = NoiseUtils.fbm(nx, ny, 5);

        // Only show denser cloud areas
        const alpha = val > 0.54
          ? Math.min(255, (val - 0.54) / 0.2 * 200)
          : 0;

        const idx = (y * W + x) * 4;
        d[idx]     = 255;
        d[idx + 1] = 255;
        d[idx + 2] = 255;
        d[idx + 3] = Math.round(alpha * 0.65);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return new THREE.CanvasTexture(canvas);
  }

  /* ── Earth sphere ─────────────────────────────────────────────── */
  _buildEarth() {
    const W = 1024, H = 512;
    const elev      = this._generateElevation(W, H);
    const earthTex  = this._generateEarthTexture(elev, W, H);
    const normalTex = this._generateNormalMap(elev, W, H);
    const cloudTex  = this._generateCloudTexture();

    // Higher vertex count so normal map is smooth at close zoom range
    const earthGeo  = new THREE.SphereGeometry(1, 128, 128);
    const earthMat  = new THREE.MeshPhongMaterial({
      map:         earthTex,
      normalMap:   normalTex,
      normalScale: new THREE.Vector2(2.2, 2.2),
      specular:    new THREE.Color(0x0d2a55),
      shininess:   28,
    });
    this._earth = new THREE.Mesh(earthGeo, earthMat);
    this.scene.add(this._earth);

    // Cloud shell — slightly raised, semi-transparent
    const cloudGeo  = new THREE.SphereGeometry(1.018, 64, 64);
    const cloudMat  = new THREE.MeshPhongMaterial({
      map:         cloudTex,
      transparent: true,
      depthWrite:  false,
      opacity:     0.88,
    });
    this._clouds = new THREE.Mesh(cloudGeo, cloudMat);
    this.scene.add(this._clouds);

    // Atmosphere haze shell — thin, backlit blue rim
    const atmGeo = new THREE.SphereGeometry(1.055, 48, 48);
    const atmMat = new THREE.MeshPhongMaterial({
      color:       0x3366cc,
      emissive:    new THREE.Color(0x0a1a44),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity:     0.10,
      depthWrite:  false,
      side:        THREE.FrontSide,
    });
    this._atm = new THREE.Mesh(atmGeo, atmMat);
    this.scene.add(this._atm);

    // Back-lit atmosphere limb (seen from the dark side)
    const limbGeo = new THREE.SphereGeometry(1.07, 48, 48);
    const limbMat = new THREE.MeshPhongMaterial({
      color:       0x1144bb,
      transparent: true,
      opacity:     0.055,
      depthWrite:  false,
      side:        THREE.BackSide,
    });
    this.scene.add(new THREE.Mesh(limbGeo, limbMat));
  }

  /* ── Atmosphere glow sprite ───────────────────────────────────── */
  _buildAtmosphere() {
    // Outer glow ring using a sprite
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width  = 256;
    glowCanvas.height = 256;
    const gc = glowCanvas.getContext('2d');
    const gg = gc.createRadialGradient(128, 128, 88, 128, 128, 128);
    gg.addColorStop(0,   'rgba(40, 80, 200, 0)');
    gg.addColorStop(0.5, 'rgba(40, 80, 200, 0.06)');
    gg.addColorStop(0.8, 'rgba(80, 140, 255, 0.12)');
    gg.addColorStop(1,   'rgba(80, 140, 255, 0)');
    gc.fillStyle = gg;
    gc.fillRect(0, 0, 256, 256);

    const glowTex     = new THREE.CanvasTexture(glowCanvas);
    const glowMat     = new THREE.SpriteMaterial({
      map:        glowTex,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });
    this._glow = new THREE.Sprite(glowMat);
    this._glow.scale.set(2.6, 2.6, 1);
    this.scene.add(this._glow);
  }

  /* ── Lights ───────────────────────────────────────────────────── */
  _buildLights() {
    // Sunlight — bright warm key light with hard terminator
    const sun = new THREE.DirectionalLight(0xfff8e8, 2.8);
    sun.position.set(5, 2, 3);
    this.scene.add(sun);

    // Subtle fill from opposite side (Earth-shine / star-light)
    const fill = new THREE.DirectionalLight(0x1a2a55, 0.18);
    fill.position.set(-4, -1, -3);
    this.scene.add(fill);

    // Deep-space ambient (almost black)
    const ambient = new THREE.AmbientLight(0x04060e, 1.0);
    this.scene.add(ambient);
  }

  /* ── Camera helpers ───────────────────────────────────────────── */
  _updateCameraPosition() {
    const r   = this._camRadius;
    const phi = this._camPhi;
    const th  = this._camTheta;
    this.camera.position.set(
      r * Math.sin(phi) * Math.sin(th),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(th)
    );
    this.camera.lookAt(0, 0, 0);
  }

  /* ── Resize ───────────────────────────────────────────────────── */
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ── Animation loop ───────────────────────────────────────────── */
  _animate() {
    if (this._disposed) return;
    this._animId = requestAnimationFrame(this._animate.bind(this));

    const t = (Date.now() - this._startTime) * 0.001;

    // Earth & cloud slow rotation
    if (this._earth)  this._earth.rotation.y  = t * 0.045;
    if (this._clouds) this._clouds.rotation.y = t * 0.056;

    // Very gentle camera drift (not driven by GSAP)
    if (!this._inTransition) {
      this._camTheta = t * 0.025;
      this._camPhi   = Math.PI * 0.46 + Math.sin(t * 0.08) * 0.04;
      this._updateCameraPosition();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ── Intro text animation ─────────────────────────────────────── */
  playIntro(onComplete) {
    const lines = document.querySelectorAll('.intro-line');

    const tl = gsap.timeline({ onComplete });

    tl.to(lines[0], { opacity: 1, y: 0, duration: 1.4, ease: 'power2.out' }, 1.2)
      .to(lines[1], { opacity: 1, y: 0, duration: 1.4, ease: 'power2.out' }, 2.8)
      .to(lines[2], { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out' }, 4.6);

    return tl;
  }

  /* ── Transition out (zoom toward Earth → fade black) ──────────── */
  transitionOut(onComplete) {
    this._inTransition = true;

    // Fade intro text out
    gsap.to('.intro-line', { opacity: 0, duration: 0.8, stagger: 0.15 });
    gsap.to('#skip-intro', { opacity: 0, duration: 0.5 });

    // GSAP zoom: camera races toward Earth
    const proxy = { r: this._camRadius };
    gsap.to(proxy, {
      r:        1.3,
      duration: 3.2,
      ease:     'power3.inOut',
      onUpdate: () => {
        this._camRadius = proxy.r;
        this._updateCameraPosition();
      },
    });

    // Fade overlay to black slightly after zoom starts
    gsap.to(this.overlay, {
      opacity:  1,
      duration: 1.8,
      delay:    1.8,
      ease:     'power2.inOut',
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
