/* ================================================================
   ACT 3 · THE MEMORIES (GALLERY)
   Cinematic immersive photo gallery with procedural placeholder images.
   ================================================================ */

/* ── Gallery catalogue ────────────────────────────────────────────
   Each entry has:
     title, subtitle — typography
     palette         — used to generate placeholder canvas images
     imageCount      — how many images to generate
     description     — shown nowhere visible yet, useful for a11y
   ──────────────────────────────────────────────────────────────── */
const GALLERY_CATALOGUE = {
  tokyo: {
    title:      'Tokyo',
    subtitle:   'Neon & Silence',
    palette:    { bg: '#090510', hi: '#ff2200', mid: '#cc4400', lo: '#002244', accent: '#ffaa00' },
    imageCount: 5,
    description: 'Between neon rivers and ancient temples, a city that never exhales.',
  },
  sahara: {
    title:      'Sahara',
    subtitle:   'Infinite Horizons',
    palette:    { bg: '#100800', hi: '#d97020', mid: '#b05510', lo: '#1a0d00', accent: '#f0cc70' },
    imageCount: 4,
    description: 'Where silence becomes an architecture and shadow is the only shelter.',
  },
  rio: {
    title:      'Rio',
    subtitle:   'Light & Chaos',
    palette:    { bg: '#030e08', hi: '#00bb55', mid: '#007a30', lo: '#001a0d', accent: '#60ffaa' },
    imageCount: 4,
    description: 'Mountains that touch the sea. Colour as a language.',
  },
  paris: {
    title:      'Paris',
    subtitle:   'Fog & Memory',
    palette:    { bg: '#080b14', hi: '#445577', mid: '#334466', lo: '#050810', accent: '#aabbcc' },
    imageCount: 5,
    description: 'A city that exists equally in reality and in the imagination.',
  },
  portraits: {
    title:      'Portraits',
    subtitle:   'Faces of Elsewhere',
    palette:    { bg: '#0e0508', hi: '#881133', mid: '#551022', lo: '#0a0306', accent: '#dd6688' },
    imageCount: 4,
    description: 'Every face is a geography. Every glance, a migration.',
  },
  mountains: {
    title:      'Mountains',
    subtitle:   'Altitude & Silence',
    palette:    { bg: '#05080f', hi: '#334d66', mid: '#223344', lo: '#030608', accent: '#88aacc' },
    imageCount: 4,
    description: 'Where air grows scarce and language becomes unnecessary.',
  },
  ocean: {
    title:      'Ocean',
    subtitle:   'Depth & Distance',
    palette:    { bg: '#02040e', hi: '#0033aa', mid: '#002277', lo: '#010208', accent: '#2266dd' },
    imageCount: 4,
    description: 'The oldest story still being written along every coast.',
  },
};

/* ================================================================ */

class GalleryScene {
  constructor() {
    this._imgEl     = document.getElementById('gallery-image');
    this._fadEl     = document.getElementById('image-fade');
    this._titleEl   = document.getElementById('gallery-title');
    this._subtitleEl= document.getElementById('gallery-subtitle');
    this._counterEl = document.getElementById('gallery-counter');
    this._backBtn   = document.getElementById('gallery-back');
    this._prevBtn   = document.getElementById('gallery-prev');
    this._nextBtn   = document.getElementById('gallery-next');

    this._current   = null;   // id of current gallery
    this._index     = 0;
    this._images    = [];     // data-URLs for this gallery
    this._sliding   = false;

    // Callback
    this.onBack = null;

    // Pre-generate images for all galleries
    this._imageCache = {};
    this._pregenerate();

    // Add keyboard hint
    const kh = document.createElement('p');
    kh.id = 'gallery-key-hint';
    kh.textContent = '← → Arrow keys to navigate';
    document.getElementById('gallery-viewer').appendChild(kh);

    this._setupEvents();
  }

  /* ── Pre-generate placeholder images ─────────────────────────── */
  _pregenerate() {
    Object.keys(GALLERY_CATALOGUE).forEach(id => {
      const data = GALLERY_CATALOGUE[id];
      this._imageCache[id] = [];
      for (let i = 0; i < data.imageCount; i++) {
        this._imageCache[id].push(
          this._generateImage(data.palette, i, data.imageCount)
        );
      }
    });
  }

  /* ── Procedural placeholder image ────────────────────────────── */
  _generateImage(pal, index, total) {
    const W = 1920, H = 1080;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Dark background base
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // Composition varies by index
    const comp = index % 4;

    if (comp === 0) {
      // ── Horizon composition ──────────────────────────────────────
      const hy = H * (0.45 + (index / total) * 0.1);

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, pal.bg);
      sky.addColorStop(0.6, this._adjustAlpha(pal.lo, 1));
      sky.addColorStop(1,   this._adjustAlpha(pal.mid, 0.5));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, hy);

      // Ground / reflection
      const gnd = ctx.createLinearGradient(0, hy, 0, H);
      gnd.addColorStop(0, this._adjustAlpha(pal.mid, 0.6));
      gnd.addColorStop(1, pal.bg);
      ctx.fillStyle = gnd;
      ctx.fillRect(0, hy, W, H - hy);

      // Light source (sun / moon)
      const lx = W * (0.3 + (index / total) * 0.4);
      const lg = ctx.createRadialGradient(lx, hy * 0.5, 0, lx, hy * 0.5, H * 0.35);
      lg.addColorStop(0,   this._hex2rgba(pal.hi, 0.55));
      lg.addColorStop(0.3, this._hex2rgba(pal.accent, 0.18));
      lg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);

      // Subtle silhouettes
      ctx.fillStyle = this._hex2rgba('#000005', 0.85);
      for (let s = 0; s < 5; s++) {
        const sx = W * (s / 5 + Math.sin(s * 1.3) * 0.06);
        const sw = W * (0.08 + Math.sin(s * 2.1) * 0.04);
        const sh = H * (0.08 + Math.sin(s * 0.9) * 0.06);
        ctx.fillRect(sx, hy - sh, sw, sh + 2);
      }

      // Horizon glow line
      const hg = ctx.createLinearGradient(0, hy - 2, 0, hy + 2);
      hg.addColorStop(0, 'rgba(0,0,0,0)');
      hg.addColorStop(0.5, this._hex2rgba(pal.hi, 0.5));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, hy - 2, W, 4);

    } else if (comp === 1) {
      // ── Portrait / vertical composition ─────────────────────────
      // Dark vignette with central bright zone
      const cx = W * (0.35 + (index / total) * 0.3);
      const cy = H * 0.42;

      const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.45);
      radial.addColorStop(0,   this._hex2rgba(pal.mid, 0.65));
      radial.addColorStop(0.4, this._hex2rgba(pal.lo,  0.5));
      radial.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, W, H);

      // Subject silhouette (vertical dark form)
      const fw = W * 0.12;
      const fx = cx - fw / 2 + W * 0.04;
      const fg = ctx.createLinearGradient(fx, H * 0.12, fx + fw, H * 0.92);
      fg.addColorStop(0, this._hex2rgba('#000000', 0.9));
      fg.addColorStop(1, this._hex2rgba('#000000', 0.6));
      ctx.fillStyle = fg;
      this._roundRect(ctx, fx, H * 0.1, fw, H * 0.82, 8);
      ctx.fill();

      // Light rim
      const rimGrad = ctx.createLinearGradient(fx + fw, H * 0.1, fx + fw + 12, H * 0.9);
      rimGrad.addColorStop(0, this._hex2rgba(pal.hi, 0.4));
      rimGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rimGrad;
      ctx.fillRect(fx + fw - 4, H * 0.1, 20, H * 0.82);

      // Bokeh circles (background lights)
      for (let b = 0; b < 18; b++) {
        const bx = W * Math.random();
        const by = H * Math.random();
        const br = 8 + Math.random() * 60;
        const ba = 0.04 + Math.random() * 0.14;
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, this._hex2rgba(b % 3 === 0 ? pal.hi : pal.accent, ba));
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }

    } else if (comp === 2) {
      // ── Abstract texture / aerial ────────────────────────────────
      // Repeating diagonal bands
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-0.3 + index * 0.15);
      for (let i = -10; i < 10; i++) {
        const x     = i * W * 0.1;
        const alpha = 0.04 + Math.abs(Math.sin(i * 0.8)) * 0.06;
        const bg2   = ctx.createLinearGradient(x, -H, x + W * 0.06, H);
        bg2.addColorStop(0, 'rgba(0,0,0,0)');
        bg2.addColorStop(0.5, this._hex2rgba(i % 2 === 0 ? pal.hi : pal.mid, alpha));
        bg2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg2;
        ctx.fillRect(x, -H, W * 0.06, H * 2);
      }
      ctx.restore();

      // Central focal glow
      const cg = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.4);
      cg.addColorStop(0,   this._hex2rgba(pal.accent, 0.08));
      cg.addColorStop(0.5, this._hex2rgba(pal.hi,     0.03));
      cg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);

      // Distant shapes
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle   = pal.mid;
      for (let s = 0; s < 6; s++) {
        const sx = W * (0.1 + (s / 6) * 0.8);
        const sy = H * (0.2 + Math.sin(s * 1.5) * 0.3);
        const sr = 40 + s * 20;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

    } else {
      // ── Long exposure / motion blur look ────────────────────────
      // Streaking light trails
      const streakCount = 20 + index * 5;
      for (let s = 0; s < streakCount; s++) {
        const sx     = W * Math.random();
        const sy     = H * Math.random();
        const len    = 30 + Math.random() * 200;
        const angle  = -Math.PI * 0.4 + (Math.random() - 0.5) * 0.5;
        const alpha  = 0.04 + Math.random() * 0.1;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        const sg = ctx.createLinearGradient(0, 0, len, 0);
        sg.addColorStop(0, 'rgba(0,0,0,0)');
        sg.addColorStop(0.5, this._hex2rgba(s % 3 === 0 ? pal.hi : pal.accent, alpha));
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, -1, len, 2);
        ctx.restore();
      }

      // Bokeh
      for (let b = 0; b < 25; b++) {
        const bx = W * Math.random();
        const by = H * Math.random();
        const br = 5 + Math.random() * 45;
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, this._hex2rgba(b % 2 === 0 ? pal.hi : pal.accent, 0.12));
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Vignette ──────────────────────────────────────────────────
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // ── Film grain ────────────────────────────────────────────────
    const gd   = ctx.createImageData(W, H);
    const orig = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < orig.data.length; i += 4) {
      const grain       = (Math.random() - 0.5) * 22;
      gd.data[i]     = Math.max(0, Math.min(255, orig.data[i]     + grain));
      gd.data[i + 1] = Math.max(0, Math.min(255, orig.data[i + 1] + grain));
      gd.data[i + 2] = Math.max(0, Math.min(255, orig.data[i + 2] + grain));
      gd.data[i + 3] = orig.data[i + 3];
    }
    ctx.putImageData(gd, 0, 0);

    return c.toDataURL('image/jpeg', 0.92);
  }

  /* ── Canvas helper: rounded rect ─────────────────────────────── */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* ── Color helpers ────────────────────────────────────────────── */
  _hex2rgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _adjustAlpha(hex, alpha) {
    return this._hex2rgba(hex, alpha);
  }

  /* ── Events ───────────────────────────────────────────────────── */
  _setupEvents() {
    this._prevBtn.addEventListener('click', () => this._navigate(-1));
    this._nextBtn.addEventListener('click', () => this._navigate(1));
    this._backBtn.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });

    document.addEventListener('keydown', e => {
      if (!document.getElementById('act3').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this._navigate(-1);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  this._navigate(1);
        if (e.key === 'Escape') { if (this.onBack) this.onBack(); }
      }
    });
  }

  /* ── Open a gallery ───────────────────────────────────────────── */
  open(id) {
    const data = GALLERY_CATALOGUE[id];
    if (!data) return;

    this._current = id;
    this._index   = 0;
    this._images  = this._imageCache[id] || [];

    // Set typography
    this._titleEl.textContent    = data.title;
    this._subtitleEl.textContent = data.subtitle;

    // Animate title in
    this._titleEl.classList.remove('visible');
    this._subtitleEl.classList.remove('visible');
    requestAnimationFrame(() => {
      this._titleEl.classList.add('visible');
      this._subtitleEl.classList.add('visible');
    });

    this._showImage(0, true);
  }

  /* ── Show image at index ──────────────────────────────────────── */
  _showImage(idx, instant = false) {
    if (!this._images.length) return;
    this._index = ((idx % this._images.length) + this._images.length) % this._images.length;

    const src = this._images[this._index];

    this._counterEl.textContent =
      `${String(this._index + 1).padStart(2, '0')} / ${String(this._images.length).padStart(2, '0')}`;

    if (instant) {
      // Immediate show (first frame)
      this._imgEl.src = src;
      gsap.fromTo(this._imgEl, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' });
      this._imgEl.classList.remove('ken-burns');
      void this._imgEl.offsetWidth; // reflow
      this._imgEl.classList.add('ken-burns');
      return;
    }

    // Cross-fade
    this._sliding = true;
    gsap.to(this._fadEl, {
      opacity:  1,
      duration: 0.45,
      ease:     'power2.inOut',
      onComplete: () => {
        this._imgEl.src = src;
        this._imgEl.onload = () => {
          // Ken Burns reset
          this._imgEl.classList.remove('ken-burns');
          void this._imgEl.offsetWidth;
          this._imgEl.classList.add('ken-burns');

          gsap.to(this._fadEl, {
            opacity: 0,
            duration: 0.55,
            ease:    'power2.out',
            onComplete: () => { this._sliding = false; },
          });
        };
      },
    });
  }

  /* ── Navigate ─────────────────────────────────────────────────── */
  _navigate(dir) {
    if (this._sliding) return;
    this._showImage(this._index + dir);
  }
}
