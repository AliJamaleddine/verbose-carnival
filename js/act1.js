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

  /* ── Earth procedural texture ─────────────────────────────────── */
  _generateEarthTexture() {
    const W = 1024, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── 1. Ocean base ──────────────────────────────────────────────
    const ocean = ctx.createLinearGradient(0, 0, 0, H);
    ocean.addColorStop(0.0, '#041528');
    ocean.addColorStop(0.4, '#061e3a');
    ocean.addColorStop(0.6, '#061e3a');
    ocean.addColorStop(1.0, '#041528');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, W, H);

    // ── 2. Landmasses (blurred shapes) ────────────────────────────
    const land = '#2d6b1f';
    const arid = '#7a5c30';

    ctx.save();
    ctx.filter = 'blur(10px)';

    // North America
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(145, 95);
    ctx.bezierCurveTo( 95, 75,  70, 140,  85, 210);
    ctx.bezierCurveTo( 90, 270, 130, 315, 185, 318);
    ctx.bezierCurveTo(240, 322, 282, 290, 285, 242);
    ctx.bezierCurveTo(290, 195, 268, 138, 238, 112);
    ctx.bezierCurveTo(210,  90, 175,  85, 145,  95);
    ctx.fill();

    // Greenland
    ctx.fillStyle = '#e0ecf0';
    ctx.beginPath();
    ctx.ellipse(210, 62, 38, 28, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // South America
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(215, 298);
    ctx.bezierCurveTo(178, 310, 162, 375, 172, 438);
    ctx.bezierCurveTo(182, 490, 218, 500, 254, 465);
    ctx.bezierCurveTo(282, 435, 288, 382, 274, 328);
    ctx.bezierCurveTo(263, 292, 238, 290, 215, 298);
    ctx.fill();

    // Europe
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(458, 95);
    ctx.bezierCurveTo(432, 85, 410, 105, 405, 140);
    ctx.bezierCurveTo(400, 168, 420, 185, 452, 180);
    ctx.bezierCurveTo(484, 175, 510, 158, 512, 128);
    ctx.bezierCurveTo(516, 102, 492, 90, 458, 95);
    ctx.fill();

    // Scandinavia protrusion
    ctx.beginPath();
    ctx.ellipse(468, 72, 18, 30, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Africa
    ctx.fillStyle = arid;
    ctx.beginPath();
    ctx.moveTo(448, 152);
    ctx.bezierCurveTo(415, 162, 395, 215, 400, 288);
    ctx.bezierCurveTo(405, 368, 442, 425, 480, 422);
    ctx.bezierCurveTo(518, 422, 548, 362, 548, 285);
    ctx.bezierCurveTo(548, 205, 512, 155, 480, 148);
    ctx.bezierCurveTo(466, 144, 456, 147, 448, 152);
    ctx.fill();

    // Vegetation band on Africa's west coast
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.ellipse(415, 270, 22, 70, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Main Asia body
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(488, 78);
    ctx.bezierCurveTo(520, 55, 608, 50, 695, 68);
    ctx.bezierCurveTo(770, 82, 830, 98, 848, 132);
    ctx.bezierCurveTo(862, 162, 842, 200, 800, 210);
    ctx.bezierCurveTo(755, 218, 695, 200, 655, 215);
    ctx.bezierCurveTo(618, 228, 598, 258, 568, 245);
    ctx.bezierCurveTo(540, 232, 518, 200, 505, 168);
    ctx.bezierCurveTo(492, 132, 476, 100, 488, 78);
    ctx.fill();

    // Arabian peninsula (arid)
    ctx.fillStyle = arid;
    ctx.beginPath();
    ctx.ellipse(568, 225, 32, 50, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // India subcontinent
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(612, 208);
    ctx.bezierCurveTo(588, 220, 572, 268, 582, 315);
    ctx.bezierCurveTo(592, 355, 628, 362, 648, 325);
    ctx.bezierCurveTo(668, 288, 660, 245, 645, 218);
    ctx.bezierCurveTo(634, 205, 622, 202, 612, 208);
    ctx.fill();

    // Southeast Asia islands
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.ellipse(748, 265, 30, 16, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(792, 285, 22, 12, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(820, 300, 18, 10, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Japan
    ctx.beginPath();
    ctx.ellipse(862, 162, 10, 28, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Australia
    ctx.fillStyle = arid;
    ctx.beginPath();
    ctx.moveTo(740, 348);
    ctx.bezierCurveTo(710, 338, 695, 372, 708, 415);
    ctx.bezierCurveTo(720, 452, 762, 462, 802, 445);
    ctx.bezierCurveTo(844, 428, 858, 392, 842, 360);
    ctx.bezierCurveTo(828, 334, 782, 335, 740, 348);
    ctx.fill();

    // Australia east coast green
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.ellipse(842, 390, 10, 40, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // remove blur

    // ── 3. Polar ice caps ──────────────────────────────────────────
    const northCap = ctx.createLinearGradient(0, 0, 0, H * 0.16);
    northCap.addColorStop(0, 'rgba(210, 228, 255, 0.96)');
    northCap.addColorStop(1, 'rgba(210, 228, 255, 0)');
    ctx.fillStyle = northCap;
    ctx.fillRect(0, 0, W, H * 0.16);

    const southCap = ctx.createLinearGradient(0, H * 0.86, 0, H);
    southCap.addColorStop(0, 'rgba(210, 228, 255, 0)');
    southCap.addColorStop(1, 'rgba(220, 235, 255, 0.98)');
    ctx.fillStyle = southCap;
    ctx.fillRect(0, H * 0.86, W, H * 0.14);

    // ── 4. Subtle shading vignette ─────────────────────────────────
    const vignette = ctx.createRadialGradient(W * 0.35, H * 0.35, 0, W * 0.5, H * 0.5, W * 0.65);
    vignette.addColorStop(0, 'rgba(255,255,255,0.04)');
    vignette.addColorStop(0.6, 'rgba(0,0,0,0)');
    vignette.addColorStop(1,   'rgba(0,0,0,0.35)');
    ctx.fillStyle = vignette;
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

    // Earth
    const earthGeo  = new THREE.SphereGeometry(1, 64, 64);
    const earthMat  = new THREE.MeshPhongMaterial({
      map:      earthTex,
      specular: new THREE.Color(0x224466),
      shininess: 20,
    });
    this._earth = new THREE.Mesh(earthGeo, earthMat);
    this.scene.add(this._earth);

    // Cloud shell
    const cloudGeo  = new THREE.SphereGeometry(1.015, 64, 64);
    const cloudMat  = new THREE.MeshPhongMaterial({
      map:        cloudTex,
      transparent: true,
      depthWrite: false,
      opacity:    1.0,
    });
    this._clouds = new THREE.Mesh(cloudGeo, cloudMat);
    this.scene.add(this._clouds);

    // Atmosphere glow (inner)
    const atmGeo    = new THREE.SphereGeometry(1.06, 48, 48);
    const atmMat    = new THREE.MeshPhongMaterial({
      color:       0x2244aa,
      transparent: true,
      opacity:     0.07,
      depthWrite:  false,
      side:        THREE.FrontSide,
    });
    this._atm = new THREE.Mesh(atmGeo, atmMat);
    this.scene.add(this._atm);
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
    // Sunlight (off-center, warm)
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
    sun.position.set(5, 2, 3);
    this.scene.add(sun);

    // Deep-space ambient (very subtle)
    const ambient = new THREE.AmbientLight(0x06080f, 1.5);
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
      .to(lines[1], { opacity: 1, y: 0, duration: 1.4, ease: 'power2.out' }, 2.8);

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
