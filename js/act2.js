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

  /* ── Procedural wood floor texture ───────────────────────────── */
  _buildWoodTexture() {
    const W = 1024, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // Base warm wood tone
    ctx.fillStyle = '#b8884e';
    ctx.fillRect(0, 0, W, H);

    const plankH = 96;
    const numPlanks = Math.ceil(H / plankH);

    for (let row = 0; row < numPlanks; row++) {
      const y0 = row * plankH;
      // Slight color variation per plank
      const tone = 170 + Math.floor(Math.sin(row * 1.7) * 20);
      ctx.fillStyle = `rgb(${tone},${Math.floor(tone * 0.72)},${Math.floor(tone * 0.42)})`;
      ctx.fillRect(0, y0 + 2, W, plankH - 2);

      // Horizontal wood grain lines
      for (let g = y0 + 6; g < y0 + plankH - 4; g += 4 + (row * 13 % 5)) {
        const alpha = 0.025 + (g % 7) * 0.006;
        ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, g);
        ctx.bezierCurveTo(W * 0.3, g + (Math.sin(g) * 1.5), W * 0.7, g - (Math.cos(g) * 1.5), W, g);
        ctx.stroke();
      }

      // Plank gap (dark line)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, y0, W, 2);

      // Vertical board seam offset per row
      const seam = (row % 3) * (W / 3) + (row % 2) * (W / 6);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(seam, y0, 2, plankH);
      if (seam + W / 3 < W) ctx.fillRect(seam + W / 3, y0, 2, plankH);
    }

    return new THREE.CanvasTexture(cv);
  }

  /* ── Room geometry ────────────────────────────────────────────── */
  _buildRoom() {
    const wallMat = new THREE.MeshStandardMaterial({
      color:     0xf3f0ec,
      roughness: 0.94,
      metalness: 0.0,
    });

    // Wood floor
    const woodTex = this._buildWoodTexture();
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(3, 3);
    const floorMat = new THREE.MeshStandardMaterial({
      map:       woodTex,
      roughness: 0.80,
      metalness: 0.02,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), wallMat.clone());
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 4.5;
    this.scene.add(ceil);

    // Back wall
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 6.5), wallMat.clone());
    back.position.set(0, 1.2, -6);
    this.scene.add(back);

    // Left wall
    const left = new THREE.Mesh(new THREE.PlaneGeometry(14, 6.5), wallMat.clone());
    left.rotation.y = Math.PI / 2;
    left.position.set(-5, 1.2, -0.5);
    this.scene.add(left);

    // Right wall
    const right = new THREE.Mesh(new THREE.PlaneGeometry(14, 6.5), wallMat.clone());
    right.rotation.y = -Math.PI / 2;
    right.position.set(5, 1.2, -0.5);
    this.scene.add(right);

    // ── Ceiling skylight / window panel ──────────────────────────
    const slW = 3.0, slD = 2.2;
    const ceilY = 4.48;

    // Bright frosted glass panel (emissive white)
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xfff9f0 });
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(slW, slD), glassMat);
    glassPane.rotation.x = Math.PI / 2;
    glassPane.position.set(0, ceilY, -0.5);
    this.scene.add(glassPane);

    // Metal frame around the skylight (4 bars)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.5, metalness: 0.6 });
    const fw = 0.07, fh = 0.12;
    const frameData = [
      { pos: [0, ceilY + 0.01, -0.5 + slD / 2],   size: [slW + fw * 2, fh, fw] },
      { pos: [0, ceilY + 0.01, -0.5 - slD / 2],   size: [slW + fw * 2, fh, fw] },
      { pos: [ slW / 2, ceilY + 0.01, -0.5],       size: [fw, fh, slD] },
      { pos: [-slW / 2, ceilY + 0.01, -0.5],       size: [fw, fh, slD] },
      // Cross bar
      { pos: [0, ceilY + 0.01, -0.5],              size: [slW, fh, fw] },
    ];
    frameData.forEach(({ pos, size }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), frameMat);
      m.position.set(...pos);
      this.scene.add(m);
    });

    // Lamp housing recessed into ceiling around the skylight
    const housingMat = new THREE.MeshStandardMaterial({ color: 0xd8d4ce, roughness: 0.9 });
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(slW + 0.4, 0.18, slD + 0.4),
      housingMat
    );
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

    // Warm ambient (gallery daylight feel)
    this.scene.add(new THREE.AmbientLight(0xddd9d0, 3.5));
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
