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

  /* ── Earth procedural texture (per-pixel noise) ──────────────── */
  _generateEarthTexture() {
    const W = 1024, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx     = canvas.getContext('2d');
    const imgData = ctx.createImageData(W, H);
    const d       = imgData.data;

    // Colour stops (RGB) for elevation ramp
    const COLORS = {
      deepOcean:    [  8,  22,  68],
      ocean:        [ 14,  48, 110],
      shallowOcean: [ 22,  88, 148],
      coast:        [ 90, 120,  68],
      lowland:      [ 42, 110,  30],
      midland:      [ 34,  90,  24],
      highland:     [ 80,  68,  42],
      rocky:        [110,  96,  72],
      snowline:     [200, 210, 220],
      snow:         [235, 242, 252],
    };

    function lerpColor(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    }

    function elevationToColor(e) {
      if (e < 0.36) return lerpColor(COLORS.deepOcean,    COLORS.ocean,        e / 0.36);
      if (e < 0.44) return lerpColor(COLORS.ocean,        COLORS.shallowOcean, (e - 0.36) / 0.08);
      if (e < 0.48) return lerpColor(COLORS.shallowOcean, COLORS.coast,        (e - 0.44) / 0.04);
      if (e < 0.54) return lerpColor(COLORS.coast,        COLORS.lowland,      (e - 0.48) / 0.06);
      if (e < 0.64) return lerpColor(COLORS.lowland,      COLORS.midland,      (e - 0.54) / 0.10);
      if (e < 0.73) return lerpColor(COLORS.midland,      COLORS.highland,     (e - 0.64) / 0.09);
      if (e < 0.82) return lerpColor(COLORS.highland,     COLORS.rocky,        (e - 0.73) / 0.09);
      if (e < 0.90) return lerpColor(COLORS.rocky,        COLORS.snowline,     (e - 0.82) / 0.08);
      return lerpColor(COLORS.snowline, COLORS.snow, Math.min(1, (e - 0.90) / 0.10));
    }

    for (let y = 0; y < H; y++) {
      const lat = (y / H - 0.5) * Math.PI;           // -π/2 … π/2
      const latAbs = Math.abs(y / H - 0.5) * 2.0;    // 0 (equator) … 1 (pole)

      for (let x = 0; x < W; x++) {
        const nx = (x / W) * 6.0;
        const ny = (y / H) * 3.0;

        // Domain-warped fbm for organic continent shapes
        const wx = NoiseUtils.fbm(nx + 0.0, ny + 0.0, 4) * 1.8;
        const wy = NoiseUtils.fbm(nx + 5.2, ny + 1.3, 4) * 1.8;
        let e  = NoiseUtils.fbm(nx + wx, ny + wy, 7);

        // Second layer: ridge noise for mountain ranges
        const ridge = NoiseUtils.ridgedFbm(nx * 1.5 + 3.1, ny * 1.5 + 7.4, 5);
        e = e * 0.72 + ridge * 0.28;

        // Clamp elevation to [0,1]
        e = Math.max(0, Math.min(1, e));

        // Polar flattening — force ice at poles
        const polarBlend = Math.max(0, (latAbs - 0.78) / 0.22);
        e = e * (1 - polarBlend) + 0.92 * polarBlend;

        // Equatorial moisture bias — push coasts toward more green
        const eqBias = Math.max(0, 1.0 - latAbs * 2.2) * 0.04;
        if (e > 0.46 && e < 0.70) e = Math.max(0.46, e - eqBias);

        let [r, g, b] = elevationToColor(e);

        // Ocean depth tint (darker the deeper)
        if (e < 0.44) {
          const depth = 1.0 - e / 0.44;
          r = Math.round(r * (1 - depth * 0.5));
          g = Math.round(g * (1 - depth * 0.4));
          b = Math.round(b * (1 - depth * 0.2));
        }

        // Subtle latitude-temperature tint on land
        if (e >= 0.46 && latAbs > 0.45 && latAbs < 0.78) {
          const cold = (latAbs - 0.45) / 0.33;
          r = Math.round(r + (180 - r) * cold * 0.22);
          g = Math.round(g + (190 - g) * cold * 0.18);
          b = Math.round(b + (200 - b) * cold * 0.22);
        }

        const idx = (y * W + x) * 4;
        d[idx]     = Math.max(0, Math.min(255, r));
        d[idx + 1] = Math.max(0, Math.min(255, g));
        d[idx + 2] = Math.max(0, Math.min(255, b));
        d[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Specular / sunlit side overlay
    const spec = ctx.createRadialGradient(W * 0.32, H * 0.28, 0, W * 0.5, H * 0.5, W * 0.6);
    spec.addColorStop(0,   'rgba(255,250,240,0.06)');
    spec.addColorStop(0.5, 'rgba(0,0,0,0)');
    spec.addColorStop(1,   'rgba(0,0,0,0.28)');
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, W, H);

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
    const earthTex  = this._generateEarthTexture();
    const cloudTex  = this._generateCloudTexture();

    // Earth — higher vertex count for smoother lighting
    const earthGeo  = new THREE.SphereGeometry(1, 96, 96);
    const earthMat  = new THREE.MeshPhongMaterial({
      map:       earthTex,
      specular:  new THREE.Color(0x1a3a66),   // ocean glint only
      shininess: 38,
      reflectivity: 0.3,
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
