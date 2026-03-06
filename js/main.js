/* ================================================================
   MAIN — App orchestrator & state machine
   ================================================================

   States:  LOADING → UNIVERSE → ROOM → GALLERY → ROOM (loop)

   Audio phases (synced to visual beats):
     0  → pad drone only              (scene opens)
     1  → bass ostinato               (line 1 at t=1.2 s)
     2  → kick enters                 (line 2 at t=2.8 s)
     3  → snare + hi-hat              (line 3 at t=4.6 s)
     4  → full action + brass         (Earth zoom triggered)
   ================================================================ */

(function () {
  'use strict';

  /* ── DOM references ─────────────────────────────────────────── */
  const $act1    = document.getElementById('act1');
  const $act2    = document.getElementById('act2');
  const $act3    = document.getElementById('act3');

  /* ── State ──────────────────────────────────────────────────── */
  const STATE = Object.freeze({
    LOADING:  'LOADING',
    UNIVERSE: 'UNIVERSE',
    ROOM:     'ROOM',
    GALLERY:  'GALLERY',
  });

  let current = STATE.LOADING;

  /* ── Scene & audio instances ─────────────────────────────────── */
  let universe = null;
  let room     = null;
  let gallery  = null;
  let audio    = new CinematicAudio();

  /* ── Initialise ─────────────────────────────────────────────── */
  function init() {
    gallery = new GalleryScene();

    requestAnimationFrame(() => {
      universe = new UniverseScene();

      try {
        room = new RoomScene();
      } catch (e) {
        console.error('[Portfolio] RoomScene init error:', e);
      }

      if (room) room.onGallerySelect = openGallery;
      gallery.onBack = returnToRoom;

      document.getElementById('skip-intro').addEventListener('click', skipIntro);

      // About / Contact panel toggles
      const setupPanel = (btnId, overlayId) => {
        const btn     = document.getElementById(btnId);
        const overlay = document.getElementById(overlayId);
        if (!btn || !overlay) return;
        btn.addEventListener('click', () => overlay.classList.add('open'));
        overlay.addEventListener('click', e => {
          if (e.target === overlay || e.target.classList.contains('panel-close'))
            overlay.classList.remove('open');
        });
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape') overlay.classList.remove('open');
        });
      };
      setupPanel('btn-about',   'about-overlay');
      setupPanel('btn-contact', 'contact-overlay');

      enterUniverse();
    });
  }

  /* ── ACT 1 · UNIVERSE ────────────────────────────────────────── */
  function enterUniverse() {
    current = STATE.UNIVERSE;
    $act1.classList.remove('hidden');

    // ── Start audio on first interaction (browser policy) ─────────
    // Any click/key on the page will unlock AudioContext.
    // We try immediately; browsers that allow it will just work.
    const tryAudio = () => {
      audio.start();
    };
    tryAudio();
    document.addEventListener('click',   tryAudio, { once: true });
    document.addEventListener('keydown',  tryAudio, { once: true });

    // ── Sync audio phases to text fade-in timings ─────────────────
    // line 1 appears at  t = 1.2 s  →  phase 1 (bass ostinato)
    // line 2 appears at  t = 2.8 s  →  phase 2 (kick drum)
    // line 3 appears at  t = 4.6 s  →  phase 3 (snare + hi-hat)
    gsap.delayedCall(1.2, () => audio.setPhase(1));
    gsap.delayedCall(2.8, () => audio.setPhase(2));
    gsap.delayedCall(4.6, () => audio.setPhase(3));

    // ── Play intro text, then auto-zoom ───────────────────────────
    universe.playIntro(() => {
      gsap.delayedCall(2.5, beginZoom);
    });
  }

  function beginZoom() {
    if (current !== STATE.UNIVERSE) return;
    // Audio is best-effort — never let it block the visual transition
    try { audio.triggerZoomRiser(); } catch (_) {}
    universe.transitionOut(enterRoom);
  }

  function skipIntro() {
    if (current !== STATE.UNIVERSE) return;
    gsap.killTweensOf('.intro-line');
    gsap.killTweensOf('#skip-intro');
    audio.setPhase(4);
    universe.transitionOut(enterRoom);
  }

  /* ── ACT 2 · ROOM & SPHERE ───────────────────────────────────── */
  function enterRoom() {
    current = STATE.ROOM;
    $act2.classList.remove('hidden');
    room.start();

    // Fade audio from epic → subtle ambient
    audio.fadeOut(2.5);

    gsap.to(document.getElementById('act2-overlay'), {
      opacity:  0,
      duration: 1.4,
      ease:     'power2.out',
      onStart: () => {
        $act1.classList.add('hidden');
        if (universe) { universe.dispose(); universe = null; }
      },
    });
  }

  /* ── ACT 3 · GALLERY ─────────────────────────────────────────── */
  function openGallery(id) {
    current = STATE.GALLERY;
    $act3.classList.remove('hidden');
    $act2.classList.add('hidden');

    gallery.open(id);

    const fadeCover = document.getElementById('image-fade');
    gsap.to(fadeCover, { opacity: 0, duration: 1.2, delay: 0.1, ease: 'power2.out' });
  }

  /* ── Return to Room ──────────────────────────────────────────── */
  function returnToRoom() {
    if (current !== STATE.GALLERY) return;

    const fadeCover = document.getElementById('image-fade');
    gsap.to(fadeCover, {
      opacity:  1,
      duration: 0.8,
      ease:     'power2.inOut',
      onComplete: () => {
        $act3.classList.add('hidden');
        $act2.classList.remove('hidden');

        document.getElementById('gallery-title').classList.remove('visible');
        document.getElementById('gallery-subtitle').classList.remove('visible');

        room.transitionIn(() => { current = STATE.ROOM; });
      },
    });
  }

  /* ── Global error guard ──────────────────────────────────────── */
  window.addEventListener('error', e => {
    console.error('[Portfolio] Uncaught error:', e.message);
  });

  /* ── Boot ────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
