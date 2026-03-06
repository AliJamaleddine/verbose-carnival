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

    this._warpTime    = 0;
    this._starOrigins = null;

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
    const COUNT     = 10000;
    const positions = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const u     = Math.random();
      const v     = Math.random();
      const theta = 2 * Math.PI * u;
      const phi   = Math.acos(2 * v - 1);
      const r     = 180 + Math.random() * 220;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    // Store originals for the black-hole vortex effect during zoom
    this._starOrigins = new Float32Array(positions);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

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

    const mat = new THREE.PointsMaterial({
      map:             new THREE.CanvasTexture(starCanvas),
      size:            0.9,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         0.95,
      depthWrite:      false,
    });

    this._stars = new THREE.Points(geo, mat);
    this.scene.add(this._stars);
  }

  /* ── Mountain range helper ─────────────────────────────────────── */
  _mountainRange(lon, lat, cx, cy, rx, ry) {
    let dlon = lon - cx;
    if (dlon >  180) dlon -= 360;
    if (dlon < -180) dlon += 360;
    const dlat = lat - cy;
    const d = Math.sqrt((dlon / rx) * (dlon / rx) + (dlat / ry) * (dlat / ry));
    return Math.max(0, 1 - d);
  }

  /* ── Geography: continent land mask + elevation ───────────────── */
  _generateGeography(W, H) {
    // ── Step 1: Rasterise continent polygons via canvas ───────────
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    const mctx = mc.getContext('2d');

    const ll = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];

    const fp = pts => {
      mctx.beginPath();
      pts.forEach(([lo, la], i) => {
        const [x, y] = ll(lo, la);
        i === 0 ? mctx.moveTo(x, y) : mctx.lineTo(x, y);
      });
      mctx.closePath();
      mctx.fill();
    };

    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, W, H);
    mctx.fillStyle = '#fff';

    // North America
    fp([[-168,72],[-141,72],[-141,61],[-130,56],[-125,49],
        [-124,37],[-117,32],[-97,26],[-90,21],[-83,10],
        [-77,8],[-78,9],[-80,10],[-84,11],[-85,16],
        [-87,21],[-90,16],[-92,18],[-88,22],[-81,30],
        [-81,34],[-76,35],[-75,44],[-71,47],[-66,44],
        [-60,47],[-54,47],[-56,52],[-60,58],[-64,62],
        [-66,64],[-72,70],[-78,73],[-86,74],[-97,74],
        [-105,73],[-120,74],[-132,71],[-142,71],[-155,69],
        [-165,71],[-168,72]]);

    // South America
    fp([[-77,8],[-63,11],[-60,7],[-53,5],[-50,2],
        [-35,-6],[-35,-10],[-38,-16],[-40,-22],[-43,-23],
        [-50,-29],[-53,-33],[-58,-34],[-62,-39],[-65,-42],
        [-68,-46],[-70,-52],[-68,-56],[-64,-55],[-63,-52],
        [-66,-46],[-68,-42],[-65,-35],[-60,-30],[-58,-23],
        [-60,-16],[-60,-10],[-62,-4],[-60,0],[-58,3],
        [-60,7],[-64,10],[-77,8]]);

    // Europe (including Iberia + Italy peninsulas)
    fp([[-10,36],[-6,36],[-1,37],[4,44],[8,46],[14,46],
        [18,46],[22,44],[26,44],[30,46],[28,54],[24,56],
        [20,60],[18,64],[20,70],[14,70],[10,68],[6,58],
        [2,56],[-2,50],[-5,48],[-8,44],[-9,39],[-10,36]]);

    // Scandinavia
    fp([[4,58],[8,56],[12,56],[16,56],[20,60],[22,62],
        [24,64],[26,68],[28,72],[24,70],[20,70],[16,70],
        [14,68],[12,64],[10,60],[8,58],[4,58]]);

    // Africa
    fp([[-17,15],[-15,12],[-12,8],[-8,5],[-5,5],[0,5],
        [8,5],[10,2],[12,-2],[14,-8],[12,-18],[10,-22],
        [14,-28],[18,-34],[22,-34],[28,-32],[34,-26],
        [38,-18],[42,-12],[44,4],[48,8],[44,12],[42,12],
        [44,16],[40,20],[38,24],[36,28],[34,32],[32,30],
        [28,32],[26,32],[22,36],[18,38],[12,36],[10,38],
        [6,37],[2,37],[-2,35],[-5,36],[-14,30],[-17,22],[-17,15]]);

    // Arabian Peninsula / Middle East
    fp([[36,34],[38,38],[42,38],[46,36],[54,26],
        [58,22],[60,22],[58,18],[50,14],[44,12],
        [40,16],[38,22],[36,26],[34,28],[34,32],[36,34]]);

    // Russia + Central/North Asia
    fp([[26,44],[30,46],[34,46],[38,42],[44,42],[48,46],
        [52,48],[56,46],[60,44],[64,44],[68,46],[72,46],
        [76,44],[80,44],[84,42],[88,44],[92,48],[96,50],
        [100,50],[104,52],[108,54],[110,56],[112,54],[116,50],
        [120,48],[124,50],[128,52],[130,48],[134,44],[138,44],
        [140,48],[142,50],[144,50],[148,46],[150,44],[152,46],
        [154,52],[152,58],[148,58],[144,60],[140,64],[132,66],
        [124,70],[118,72],[112,72],[106,72],[100,70],[94,70],
        [88,72],[82,74],[76,74],[70,72],[64,68],[58,64],
        [54,58],[48,56],[42,52],[38,48],[34,48],[30,48],[26,44]]);

    // India
    fp([[68,24],[72,26],[76,28],[80,28],[84,26],[88,24],
        [90,22],[88,20],[86,14],[80,8],[78,8],[76,8],
        [74,14],[72,20],[68,24]]);

    // Indochina / SE Asia mainland
    fp([[96,24],[100,22],[104,14],[104,8],[106,4],
        [104,2],[100,2],[96,4],[92,18],[90,22],[92,22],[96,24]]);

    // China + East Asia
    fp([[76,44],[80,44],[84,42],[88,44],[92,46],[96,48],
        [100,50],[104,48],[108,48],[112,48],[116,44],[120,40],
        [124,40],[126,38],[128,38],[128,34],[124,30],[120,26],
        [116,22],[112,20],[108,20],[104,22],[100,20],[96,22],
        [92,22],[90,24],[88,26],[84,28],[80,28],[76,28],
        [72,26],[68,24],[68,28],[72,32],[74,36],[72,40],[76,44]]);

    // Japan (Honshu)
    fp([[130,34],[134,32],[136,34],[136,38],[132,40],[130,34]]);

    // Australia
    fp([[114,-22],[116,-20],[120,-18],[124,-16],[128,-16],
        [132,-12],[136,-12],[138,-14],[142,-16],[148,-22],
        [152,-26],[152,-30],[150,-36],[148,-38],[144,-38],
        [140,-36],[136,-34],[130,-32],[124,-30],[120,-28],
        [116,-26],[114,-22]]);

    // Greenland
    fp([[-44,72],[-34,72],[-24,74],[-18,76],[-18,80],
        [-24,82],[-34,84],[-44,84],[-50,82],[-52,78],[-50,74],[-44,72]]);

    // Iceland
    fp([[-24,64],[-18,64],[-14,66],[-22,66],[-24,64]]);

    // Madagascar
    fp([[44,-12],[48,-12],[50,-16],[48,-26],[44,-26],[44,-12]]);

    // Antarctica
    fp([[-180,-70],[180,-70],[180,-90],[-180,-90]]);

    // Read land mask from canvas
    const px = mctx.getImageData(0, 0, W, H).data;
    const landMap = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      landMap[i] = px[i * 4] > 128 ? 1 : 0;
    }

    // ── Step 2: Generate elevation ────────────────────────────────
    const elev = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const lat = (1 - y / H) * 180 - 90;
      for (let x = 0; x < W; x++) {
        const lon = (x / W) * 360 - 180;
        const idx = y * W + x;
        let e;

        if (landMap[idx] < 0.5) {
          e = 0.12 + NoiseUtils.fbm((x / W) * 4, (y / H) * 2, 3) * 0.08;
        } else {
          const tnx = (x / W) * 6 + 5.1;
          const tny = (y / H) * 3 + 5.1;
          e = 0.52 + NoiseUtils.fbm(tnx, tny, 4) * 0.12;

          const mtn = Math.max(
            this._mountainRange(lon, lat, -116, 46,  8, 18),
            this._mountainRange(lon, lat,  -78, 42,  5, 13),
            this._mountainRange(lon, lat,  -70,-24,  5, 34),
            this._mountainRange(lon, lat,    9, 46,  6,  4),
            this._mountainRange(lon, lat,   84, 29, 18,  5),
            this._mountainRange(lon, lat,   92, 34, 14, 10),
            this._mountainRange(lon, lat,   60, 58,  3, 18),
            this._mountainRange(lon, lat,   36,  5,  4, 16),
            this._mountainRange(lon, lat,   -3, 32, 12,  4),
            this._mountainRange(lon, lat,   44, 42, 10,  3),
            this._mountainRange(lon, lat,  127, 35,  3,  8)
          );
          e += mtn * 0.38;
        }

        if (lat >  78) e = Math.max(e, 0.75 + (lat  - 78) / 12 * 0.18);
        if (lat < -64) e = Math.max(e, 0.80);

        elev[idx] = Math.max(0, Math.min(1, e));
      }
    }

    return { elev, landMap };
  }

  /* ── Color texture using biome / geography logic ──────────────── */
  _generateEarthTexture(elev, landMap, W, H) {
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d   = img.data;

    const lerp3 = (a, b, t) => [
      (a[0] + (b[0] - a[0]) * t + 0.5) | 0,
      (a[1] + (b[1] - a[1]) * t + 0.5) | 0,
      (a[2] + (b[2] - a[2]) * t + 0.5) | 0,
    ];

    // Ocean palette
    const deepSea  = [  3,  14,  52];
    const ocean    = [ 10,  46, 110];
    const shallow  = [ 22,  82, 148];

    // Biome palettes (land)
    const tropical = [ 15,  90,  22];   // equatorial rainforest
    const savanna  = [ 95, 130,  35];   // tropical grassland
    const desert   = [205, 178, 105];   // Sahara / Arabia
    const ausOut   = [165,  88,  42];   // Australian outback
    const steppe   = [148, 122,  58];   // Central Asia steppe
    const tempFor  = [ 38,  95,  38];   // temperate forest
    const boreal   = [ 28,  76,  32];   // taiga
    const tundra   = [120, 110,  82];   // arctic tundra
    const rock     = [100,  86,  68];   // mountain rock
    const snowline = [196, 192, 185];   // snow transition
    const snow     = [242, 246, 255];   // glacier / polar ice

    // Desert zone check: lon/lat boxes
    const isDesert = (lon, lat) => {
      if (lat >  14 && lat <  33 && lon > -18 && lon <  36) return 1.0;  // Sahara
      if (lat >  12 && lat <  32 && lon >  35 && lon <  62) return 0.9;  // Arabian
      if (lat >  24 && lat <  38 && lon >  45 && lon <  68) return 0.75; // Iranian
      if (lat >  38 && lat <  50 && lon >  90 && lon < 118) return 0.6;  // Gobi
      if (lat > -35 && lat < -18 && lon > 116 && lon < 144) return 0.85; // Australian
      if (lat > -32 && lat < -18 && lon > -74 && lon < -68) return 0.65; // Atacama
      if (lat >  25 && lat <  40 && lon >-114 && lon <-104) return 0.55; // US southwest
      return 0;
    };

    const isTropical = (lon, lat) => {
      if (Math.abs(lat) > 12) return 0;
      if (lon > -78 && lon < -46 && lat > -15 && lat < 5)  return 1.0; // Amazon
      if (lon >  16 && lon <  30 && lat >  -5 && lat < 5)  return 0.9; // Congo
      if (lon >  95 && lon < 130 && lat >  -8 && lat < 18) return 0.8; // SE Asia
      return 0.5; // generic equatorial
    };

    for (let y = 0; y < H; y++) {
      const lat    = (1 - y / H) * 180 - 90;
      const absLat = Math.abs(lat);

      for (let x = 0; x < W; x++) {
        const lon  = (x / W) * 360 - 180;
        const idx  = y * W + x;
        const e    = elev[idx];
        const land = landMap[idx] > 0.5;

        let r, g, b;

        if (!land) {
          // ── Ocean ─────────────────────────────────────────────
          const depth = Math.max(0, Math.min(1, e / 0.32));
          if (e < 0.22) {
            [r, g, b] = lerp3(deepSea, ocean, e / 0.22);
          } else {
            [r, g, b] = lerp3(ocean, shallow, (e - 0.22) / 0.18);
          }
          // Further darken deep ocean
          const dk = 1 - depth * 0.5;
          r = (r * dk) | 0; g = (g * dk) | 0; b = (b * dk) | 0;

        } else {
          // ── Land — mountain/snow override first ───────────────
          if (e > 0.88) {
            [r, g, b] = lerp3(snowline, snow, Math.min(1, (e - 0.88) / 0.10));
          } else if (e > 0.78) {
            [r, g, b] = lerp3(rock, snowline, (e - 0.78) / 0.10);
          } else if (e > 0.68) {
            [r, g, b] = lerp3(steppe, rock, (e - 0.68) / 0.10);
          } else {
            // ── Biome by latitude + special zones ─────────────
            const desertStrength = isDesert(lon, lat);
            const tropicStrength = isTropical(lon, lat);

            if (absLat > 70) {
              [r, g, b] = lerp3(tundra, snowline, Math.min(1, (absLat - 70) / 15));
            } else if (absLat > 60) {
              [r, g, b] = lerp3(boreal, tundra, (absLat - 60) / 10);
            } else if (absLat > 50) {
              [r, g, b] = lerp3(tempFor, boreal, (absLat - 50) / 10);
            } else if (absLat > 35) {
              // Temperate — possible desert override
              if (desertStrength > 0.4) {
                [r, g, b] = lerp3(tempFor, desert, desertStrength);
              } else {
                [r, g, b] = [...tempFor];
              }
            } else if (absLat > 20) {
              // Subtropical — savanna or desert
              if (desertStrength > 0.3) {
                [r, g, b] = lerp3(savanna, desert, desertStrength * 0.9);
              } else if (lon > 116 && lon < 144 && lat < -18 && lat > -35) {
                // Australian outback
                [r, g, b] = [...ausOut];
              } else {
                [r, g, b] = lerp3(savanna, tempFor, 0.4);
              }
            } else {
              // Tropical
              if (desertStrength > 0.2) {
                [r, g, b] = lerp3(tropical, savanna, desertStrength);
              } else {
                [r, g, b] = lerp3(savanna, tropical, tropicStrength);
              }
            }
          }
        }

        const i = idx * 4;
        d[i]     = Math.max(0, Math.min(255, r));
        d[i + 1] = Math.max(0, Math.min(255, g));
        d[i + 2] = Math.max(0, Math.min(255, b));
        d[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    // Sunlit hemisphere subtle brightening
    const spec = ctx.createRadialGradient(W * 0.30, H * 0.26, 0, W * 0.5, H * 0.5, W * 0.58);
    spec.addColorStop(0,   'rgba(255,248,228,0.08)');
    spec.addColorStop(0.5, 'rgba(0,0,0,0)');
    spec.addColorStop(1,   'rgba(0,0,0,0.28)');
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
    const { elev, landMap } = this._generateGeography(W, H);
    const earthTex  = this._generateEarthTexture(elev, landMap, W, H);
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

    // ── Black-hole vortex: stars spiral inward during zoom ────────
    if (this._inTransition && this._stars && this._starOrigins) {
      this._warpTime += 0.007;
      const wt  = this._warpTime;
      const pos = this._stars.geometry.attributes.position;
      const orig = this._starOrigins;

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];

        // Spiral angle accelerates as warp deepens
        const theta = Math.atan2(ox, oz) + wt * (1.8 + wt * 1.2);
        // Radius shrinks exponentially toward centre
        const horizR = Math.sqrt(ox * ox + oz * oz) * Math.exp(-wt * 0.07);
        const newY   = oy * Math.exp(-wt * 0.04);

        pos.setXYZ(i, Math.sin(theta) * horizR, newY, Math.cos(theta) * horizR);
      }
      pos.needsUpdate = true;
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
