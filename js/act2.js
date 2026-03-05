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
    this._buildEnvMap();

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

    // Warm white base
    ectx.fillStyle = '#f2f0e8';
    ectx.fillRect(0, 0, W, H);

    // Bright warm ceiling (top of equirect = top of sphere reflection)
    const topLight = ectx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.4);
    topLight.addColorStop(0,   'rgba(255, 248, 220, 0.9)');
    topLight.addColorStop(0.5, 'rgba(240, 230, 200, 0.4)');
    topLight.addColorStop(1,   'rgba(0,   0,   0,   0)');
    ectx.fillStyle = topLight;
    ectx.fillRect(0, 0, W, H * 0.5);

    // Subtle floor shadow at the bottom of the sphere reflection
    const botLight = ectx.createRadialGradient(W / 2, H, 0, W / 2, H, W * 0.35);
    botLight.addColorStop(0,   'rgba(60, 50, 40, 0.35)');
    botLight.addColorStop(0.6, 'rgba(60, 50, 40, 0.10)');
    botLight.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ectx.fillStyle = botLight;
    ectx.fillRect(0, H * 0.6, W, H * 0.4);

    // Cool blue-grey side accent (gives the silver sphere depth)
    const sideLight = ectx.createRadialGradient(W * 0.12, H * 0.5, 0, W * 0.12, H * 0.5, W * 0.28);
    sideLight.addColorStop(0, 'rgba(160, 175, 210, 0.55)');
    sideLight.addColorStop(1, 'rgba(0,   0,   0,   0)');
    ectx.fillStyle = sideLight;
    ectx.fillRect(0, 0, W * 0.45, H);

    const envTexture = new THREE.CanvasTexture(ec);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this._envMap = pmrem.fromEquirectangular(envTexture).texture;
    pmrem.dispose();
    envTexture.dispose();

    this.scene.environment = this._envMap;
  }

  /* ── Room geometry ────────────────────────────────────────────── */
  _buildRoom() {
    const darkMat = new THREE.MeshStandardMaterial({
      color:     0xeeeae0,
      roughness: 0.92,
      metalness: 0.02,
    });

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), darkMat.clone());
    floor.rotation.x = -Math.PI / 2;
    floor.position.y  = -1.6;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), darkMat.clone());
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y  = 5;
    this.scene.add(ceil);

    // Back wall
    const back = new THREE.Mesh(new THREE.PlaneGeometry(20, 12), darkMat.clone());
    back.position.z = -6;
    back.position.y  = 1;
    this.scene.add(back);

    // Volumetric-light-look: cone from above
    const coneGeo = new THREE.ConeGeometry(3.5, 6.5, 32, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color:      0xfff8e8,
      transparent: true,
      opacity:    0.18,
      side:       THREE.DoubleSide,
      depthWrite:  false,
      blending:   THREE.AdditiveBlending,
    });
    const lightCone = new THREE.Mesh(coneGeo, coneMat);
    lightCone.position.set(0, 2.5, 0);
    lightCone.rotation.x = Math.PI; // point down
    this.scene.add(lightCone);
  }

  /* ── The sphere ───────────────────────────────────────────────── */
  _buildSphere() {
    const geo = new THREE.SphereGeometry(1, 64, 64);

    this._sphereMat = new THREE.MeshStandardMaterial({
      color:            0xf0f0f0,
      metalness:        0.95,
      roughness:        0.04,
      envMapIntensity:  2.2,
      emissive:         new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });

    this._sphere = new THREE.Mesh(geo, this._sphereMat);
    this._sphere.castShadow    = true;
    this._sphere.receiveShadow = false;
    this._sphere.position.set(0, 0, 0);
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
    // Overhead spot — warm key light casting a soft shadow on the floor
    this._keyLight = new THREE.SpotLight(0xfff3d0, 2.8, 12, Math.PI / 5, 0.5, 1.5);
    this._keyLight.position.set(0, 5, 0.5);
    this._keyLight.target.position.set(0, 0, 0);
    this._keyLight.castShadow = true;
    this._keyLight.shadow.mapSize.set(1024, 1024);
    this._keyLight.shadow.camera.near = 1;
    this._keyLight.shadow.camera.far  = 15;
    this.scene.add(this._keyLight);
    this.scene.add(this._keyLight.target);

    // Cool blue-grey fill from front-left
    this._fillLight = new THREE.PointLight(0x8090c0, 1.2, 10, 2);
    this._fillLight.position.set(-3, 1, 3);
    this.scene.add(this._fillLight);

    // Accent red underlight (hidden until activation)
    this._redLight = new THREE.PointLight(0xcc0000, 0, 5, 2);
    this._redLight.position.set(0, -1.5, 0);
    this.scene.add(this._redLight);

    // Bright ambient — essential for a white room to feel airy
    this.scene.add(new THREE.AmbientLight(0xd8d4cc, 4));
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
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(th)
    );
    this.camera.lookAt(0, 0, 0);
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

    const mat = this._sphereMat;

    // Pulse scale
    gsap.timeline()
      .to(this._sphere.scale, { x: 1.18, y: 1.18, z: 1.18, duration: 0.22, ease: 'power2.out' })
      .to(this._sphere.scale, { x: 1.00, y: 1.00, z: 1.00, duration: 0.35, ease: 'elastic.out(1.2, 0.5)' });

    // Red internal glow
    gsap.to(mat, {
      emissiveIntensity: 0.45,
      duration:          0.8,
      ease:              'power2.out',
      onUpdate: () => {
        mat.emissive.set(0x8a0000);
        mat.needsUpdate = true;
      },
    });

    // Red underlight fades in
    gsap.to(this._redLight, { intensity: 1.2, duration: 1.2, ease: 'power2.out' });

    // Glow sprite appears
    gsap.to(this._glowSprite.material, { opacity: 1, duration: 1.0, ease: 'power2.out' });

    // Key light dims slightly
    gsap.to(this._keyLight, { intensity: 1.8, duration: 1.5 });

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

    // Sphere pulse + zoom
    gsap.timeline()
      .to(this._sphere.scale, { x: 1.25, y: 1.25, z: 1.25, duration: 0.3, ease: 'power3.out' })
      .to(this._sphere.scale, { x: 1.00, y: 1.00, z: 1.00, duration: 0.2 });

    // Crank up red glow
    gsap.to(this._sphereMat, { emissiveIntensity: 1.2, duration: 0.4 });
    gsap.to(this._redLight,  { intensity: 3.5,    duration: 0.4 });

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
      if (!this._activated) {
        gsap.to(this._sphereMat, {
          emissiveIntensity: hovered ? 0.08 : 0,
          duration:          0.4,
          onUpdate: () => {
            this._sphereMat.emissive.set(0x330000);
            this._sphereMat.needsUpdate = true;
          },
        });
        gsap.to(this._glowSprite.material, { opacity: hovered ? 0.4 : 0, duration: 0.5 });
      }
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

    // Reset sphere
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
