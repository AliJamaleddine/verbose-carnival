/* ================================================================
   CINEMATIC AUDIO ENGINE
   100% Web Audio API — zero external files, zero copyright.

   Musical key : D minor
   BPM         : 92  (cinematic action/epic tempo)
   Texture     : atmospheric pad → bass ostinato → full drums → brass

   Phase schedule (driven by main.js via setPhase()):
     0  — deep pad drone only          (scene opens)
     1  — bass ostinato added          (line 1 appears)
     2  — kick drum enters             (line 2 appears)
     3  — snare + hi-hat enter         (line 3 appears)
     4  — full drums + brass stabs     (Earth zoom begins)
   ================================================================ */

class CinematicAudio {
  constructor() {
    this._ctx         = null;
    this._master      = null;
    this._reverb      = null;
    this._noiseBuffer = null;

    this._bpm       = 92;
    this._step16    = (60 / 92) / 4;   // duration of a 16th note in seconds
    this._stepCount = 0;
    this._nextStep  = 0;
    this._timer     = null;

    this._phase   = 0;
    this._running = false;
  }

  /* ── Public API ───────────────────────────────────────────────── */

  async start() {
    if (this._running) return;
    this._running = true;

    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === 'suspended') await this._ctx.resume();

    /* Signal chain ─────────────────────────────────────────────────
       instruments
          │
        master gain  (starts at 0, fades in)
         ├─► dry gain ────────────────────► limiter ► output
         └─► reverb convolver ► wet gain ─► limiter ► output      */

    this._master = this._ctx.createGain();
    this._master.gain.value = 0;

    const dryGain = this._ctx.createGain(); dryGain.gain.value = 0.72;
    const wetGain = this._ctx.createGain(); wetGain.gain.value = 0.28;

    this._reverb = this._buildReverb(3.5, 2.2);

    const limiter = this._ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value      = 2;
    limiter.ratio.value     = 20;
    limiter.attack.value    = 0.001;
    limiter.release.value   = 0.06;

    this._master.connect(dryGain);
    this._master.connect(this._reverb);
    this._reverb.connect(wetGain);
    dryGain.connect(limiter);
    wetGain.connect(limiter);
    limiter.connect(this._ctx.destination);

    // Pre-build shared noise buffer (4 s, reused for all noise sources)
    this._noiseBuffer = this._buildNoiseBuffer(4.0);

    // Atmospheric pad drone (plays from the start, forever)
    this._startPad();

    // Kick-off scheduler — runs every 25 ms, looks 120 ms ahead
    this._nextStep = this._ctx.currentTime + 0.15;
    this._timer    = setInterval(() => this._schedule(), 25);

    // Fade master in over 2.5 s
    const t = this._ctx.currentTime;
    this._master.gain.setValueAtTime(0, t);
    this._master.gain.linearRampToValueAtTime(0.75, t + 2.5);
  }

  /** Advance the rhythm phase (0–4). */
  setPhase(n) {
    this._phase = n;
  }

  /** Noise riser sweep + big BOOM for Earth zoom. */
  triggerZoomRiser() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;

    // Riser: bandpass noise sweeping 200 Hz → 12 kHz over 2.8 s
    const src    = this._ctx.createBufferSource();
    src.buffer   = this._noiseBuffer;
    src.loop     = true;

    const bp     = this._ctx.createBiquadFilter();
    bp.type      = 'bandpass';
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(12000, t + 2.8);
    bp.Q.value   = 4;

    const rGain  = this._ctx.createGain();
    rGain.gain.setValueAtTime(0,    t);
    rGain.gain.linearRampToValueAtTime(0.5, t + 2.4);
    rGain.gain.linearRampToValueAtTime(0,   t + 3.2);

    src.connect(bp); bp.connect(rGain); rGain.connect(this._master);
    src.start(t); src.stop(t + 3.5);

    // Giant sub-boom at riser peak
    setTimeout(() => {
      if (this._ctx) this._boom(this._ctx.currentTime);
    }, 2700);

    // Advance to full-action phase
    this.setPhase(4);
  }

  /** Fade master to silence, then stop scheduler. */
  fadeOut(duration = 2.0) {
    if (!this._master) return;
    const t = this._ctx.currentTime;
    this._master.gain.setValueAtTime(this._master.gain.value, t);
    this._master.gain.linearRampToValueAtTime(0, t + duration);
    setTimeout(() => {
      clearInterval(this._timer);
      this._running = false;
    }, (duration + 0.2) * 1000);
  }

  /* ── Reverb (synthetic impulse response) ─────────────────────── */
  _buildReverb(duration, decay) {
    const rate    = this._ctx.sampleRate;
    const length  = Math.ceil(rate * duration);
    const impulse = this._ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const conv = this._ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  }

  /* ── Shared noise buffer ──────────────────────────────────────── */
  _buildNoiseBuffer(seconds) {
    const len    = Math.ceil(this._ctx.sampleRate * seconds);
    const buf    = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ── Atmospheric pad (D-minor drone cluster) ──────────────────── */
  _startPad() {
    // D minor overtone series: D1 A1 D2 F2 A2 C3 D3
    const freqs   = [36.71, 55.00, 73.42, 87.31, 110.00, 130.81, 146.83];
    const detunes = [  0,    -5,     8,    -7,      3,     -9,      6  ];
    const amps    = [0.035, 0.028, 0.022, 0.018, 0.015, 0.010, 0.008];

    freqs.forEach((f, i) => {
      const osc  = this._ctx.createOscillator();
      const lpf  = this._ctx.createBiquadFilter();
      const gain = this._ctx.createGain();

      osc.type            = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value    = detunes[i];

      lpf.type            = 'lowpass';
      lpf.frequency.value = 280 + i * 60;
      lpf.Q.value         = 1.2;

      gain.gain.value = amps[i];

      // Slow LFO for pad breathing
      const lfo  = this._ctx.createOscillator();
      const lfoG = this._ctx.createGain();
      lfo.frequency.value = 0.18 + i * 0.03;
      lfoG.gain.value     = amps[i] * 0.3;
      lfo.connect(lfoG);
      lfoG.connect(gain.gain);
      lfo.start();

      osc.connect(lpf); lpf.connect(gain); gain.connect(this._master);
      osc.start();
    });
  }

  /* ── 16-step scheduler ────────────────────────────────────────── */
  _schedule() {
    const LOOK = 0.12;   // look-ahead window
    while (this._nextStep < this._ctx.currentTime + LOOK) {
      this._step(this._nextStep, this._stepCount % 16, this._stepCount);
      this._nextStep  += this._step16;
      this._stepCount += 1;
    }
  }

  _step(t, s16, total) {
    const p   = this._phase;
    const bar = Math.floor(total / 16);

    /* ── KICK ── cinematic pattern: 1 + e-of-2 + 3 + upbeat-4 ─── */
    const kick16 = [1,0,0,0, 0,0,1,0, 1,0,0,0, 1,0,0,0];
    if (p >= 2 && kick16[s16]) {
      this._kick(t, s16 === 0 ? 1.0 : 0.78);
    }

    /* ── SNARE ── beats 2 & 4, ghost on s=14 in phase 4 ─────── */
    if (p >= 3) {
      if (s16 === 4 || s16 === 12)  this._snare(t, 1.0);
      if (p >= 4 && s16 === 14)     this._snare(t, 0.3);   // ghost
    }

    /* ── HI-HAT ── 8th notes p3, 16th accent on off-16ths p4 ── */
    if (p >= 3 && s16 % 2 === 0)   this._hihat(t, 0.55);
    if (p >= 4 && s16 % 2 === 1)   this._hihat(t, 0.22);

    /* ── BASS OSTINATO ── syncopated D-minor motif ───────────── */
    // Pattern: strong 1, anticipation of beat 2, beat 3, before 4
    const bassOn  = [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,0];
    const bassHz  = [73.42, 87.31, 65.41, 73.42, 55.00, 73.42, 87.31, 73.42];
    if (p >= 1 && bassOn[s16]) {
      this._bass(t, bassHz[s16 % bassHz.length]);
    }

    /* ── LOW TOM ── accent fills ─────────────────────────────── */
    if (p >= 3 && (s16 === 6 || s16 === 14)) this._tom(t);

    /* ── BRASS STABS ── beats 1 & 3, D-minor chord ───────────── */
    if (p >= 4 && (s16 === 0 || s16 === 8)) {
      // D minor 7 voicing: D3  F3   A3   C4
      [146.83, 174.61, 220.00, 261.63].forEach(f => this._brass(t, f));
    }

    /* ── ORCHESTRA HIT ── every 4 bars on beat 1 in phase 4 ──── */
    if (p >= 4 && s16 === 0 && bar % 4 === 0) {
      this._orchHit(t);
    }
  }

  /* ── KICK DRUM ───────────────────────────────────────────────── */
  _kick(t, vel = 1.0) {
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();

    // Pitch envelope: 140 Hz → 28 Hz (gives that deep thud)
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.55);

    gain.gain.setValueAtTime(vel * 2.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    // Extra transient click for punch
    const click = this._ctx.createOscillator();
    const cGain = this._ctx.createGain();
    click.frequency.value = 400;
    cGain.gain.setValueAtTime(vel * 0.6, t);
    cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    click.connect(cGain); cGain.connect(this._master);
    click.start(t); click.stop(t + 0.04);

    osc.connect(gain); gain.connect(this._master);
    osc.start(t);      osc.stop(t + 0.6);
  }

  /* ── SNARE ───────────────────────────────────────────────────── */
  _snare(t, vel = 1.0) {
    // Noise body
    const src  = this._ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const bp   = this._ctx.createBiquadFilter();
    bp.type    = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.65;

    const ng   = this._ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    src.connect(bp); bp.connect(ng); ng.connect(this._master);
    src.start(t); src.stop(t + 0.25);

    // Tone crack (high-mid transient)
    const crk  = this._ctx.createOscillator();
    const cg   = this._ctx.createGain();
    crk.frequency.value = 200;
    cg.gain.setValueAtTime(vel * 0.5, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    crk.connect(cg); cg.connect(this._master);
    crk.start(t); crk.stop(t + 0.1);
  }

  /* ── HI-HAT ──────────────────────────────────────────────────── */
  _hihat(t, vel = 1.0) {
    const src  = this._ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const hp   = this._ctx.createBiquadFilter();
    hp.type    = 'highpass';
    hp.frequency.value = 8500;

    const g    = this._ctx.createGain();
    g.gain.setValueAtTime(vel * 0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    src.connect(hp); hp.connect(g); g.connect(this._master);
    src.start(t); src.stop(t + 0.05);
  }

  /* ── BASS OSTINATO ───────────────────────────────────────────── */
  _bass(t, freq) {
    const osc  = this._ctx.createOscillator();
    const lpf  = this._ctx.createBiquadFilter();
    const g    = this._ctx.createGain();

    osc.type            = 'sawtooth';
    osc.frequency.value = freq;

    lpf.type            = 'lowpass';
    lpf.frequency.setValueAtTime(700, t);
    lpf.frequency.exponentialRampToValueAtTime(130, t + 0.26);
    lpf.Q.value         = 2.5;

    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.30);

    osc.connect(lpf); lpf.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.32);
  }

  /* ── LOW TOM ─────────────────────────────────────────────────── */
  _tom(t) {
    const osc  = this._ctx.createOscillator();
    const g    = this._ctx.createGain();
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.42);
    g.gain.setValueAtTime(1.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.5);
  }

  /* ── BRASS STAB ──────────────────────────────────────────────── */
  _brass(t, freq) {
    const osc  = this._ctx.createOscillator();
    const lpf  = this._ctx.createBiquadFilter();
    const g    = this._ctx.createGain();

    osc.type            = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value    = (Math.random() - 0.5) * 8;

    lpf.type            = 'lowpass';
    lpf.frequency.setValueAtTime(5000, t);
    lpf.frequency.exponentialRampToValueAtTime(900,  t + 0.32);
    lpf.Q.value         = 1.8;

    // Sharp brass attack, quick decay
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.010);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    osc.connect(lpf); lpf.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.4);
  }

  /* ── ORCHESTRA HIT ───────────────────────────────────────────── */
  _orchHit(t) {
    // Stacked noise + pitched cluster for the big "cinematic HIT"
    const src  = this._ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const bp   = this._ctx.createBiquadFilter();
    bp.type    = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.4;

    const g    = this._ctx.createGain();
    g.gain.setValueAtTime(1.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    src.connect(bp); bp.connect(g); g.connect(this._master);
    src.start(t); src.stop(t + 0.55);

    // Pitched cluster chord (D minor, tight voicing)
    [73.42, 87.31, 110.00, 130.81].forEach(f => {
      const o = this._ctx.createOscillator();
      const og = this._ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      og.gain.setValueAtTime(0.22, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(og); og.connect(this._master);
      o.start(t); o.stop(t + 0.5);
    });
  }

  /* ── SUB BOOM ────────────────────────────────────────────────── */
  _boom(t) {
    const osc = this._ctx.createOscillator();
    const g   = this._ctx.createGain();
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(18, t + 1.8);
    g.gain.setValueAtTime(2.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 2.0);
  }
}
