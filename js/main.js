/* ================================================================
   MAIN — App orchestrator & state machine
   ================================================================

   States:  LOADING → UNIVERSE → ROOM → GALLERY → ROOM (loop)

   The three act objects are created once and reused.
   DOM containers are shown/hidden via .hidden class.
   ================================================================ */

(function () {
  'use strict';

  /* ── DOM references ─────────────────────────────────────────── */
  const $loading = document.getElementById('loading-screen');
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

  /* ── Scene instances (lazy-created) ─────────────────────────── */
  let universe = null;
  let room     = null;
  let gallery  = null;

  /* ── Initialise ─────────────────────────────────────────────── */
  function init() {
    // Generate gallery images first (CPU-bound, done synchronously
    // on a small canvas — fast enough for a loading screen)
    gallery = new GalleryScene();

    // Give the browser a frame to paint loading screen, then boot Three.js scenes
    requestAnimationFrame(() => {
      universe = new UniverseScene();

      // Build room scene (Three.js setup + env map bake)
      room = new RoomScene();

      // Wire up callbacks
      room.onGallerySelect = openGallery;
      gallery.onBack       = returnToRoom;

      // Skip intro button
      document.getElementById('skip-intro').addEventListener('click', skipIntro);

      // Short artificial delay so the loading sphere animation plays
      setTimeout(hideLoading, 900);
    });
  }

  /* ── Hide loading screen → start Act 1 ──────────────────────── */
  function hideLoading() {
    $loading.classList.add('fade-out');

    setTimeout(() => {
      $loading.style.display = 'none';
      enterUniverse();
    }, 1000);
  }

  /* ── ACT 1 · UNIVERSE ────────────────────────────────────────── */
  function enterUniverse() {
    current = STATE.UNIVERSE;
    $act1.classList.remove('hidden');

    // Fade intro text in, then auto-transition after ~9 s
    universe.playIntro(() => {
      // After intro text fully played, wait then zoom
      gsap.delayedCall(2.5, beginZoom);
    });
  }

  function beginZoom() {
    if (current !== STATE.UNIVERSE) return;
    universe.transitionOut(enterRoom);
  }

  function skipIntro() {
    if (current !== STATE.UNIVERSE) return;
    gsap.killTweensOf('.intro-line');
    gsap.killTweensOf('#skip-intro');
    universe.transitionOut(enterRoom);
  }

  /* ── ACT 2 · ROOM & SPHERE ───────────────────────────────────── */
  function enterRoom() {
    current = STATE.ROOM;

    // Show room canvas; hide universe (keep it alive for back)
    $act2.classList.remove('hidden');

    // Start room render loop
    room.start();

    // Fade overlay out to reveal scene
    gsap.to(document.getElementById('act2-overlay'), {
      opacity:  0,
      duration: 1.4,
      ease:     'power2.out',
      onStart: () => {
        // Can now hide universe to save memory / GPU
        $act1.classList.add('hidden');
        if (universe) {
          universe.dispose();
          universe = null;
        }
      },
    });
  }

  /* ── ACT 3 · GALLERY ─────────────────────────────────────────── */
  function openGallery(id) {
    current = STATE.GALLERY;

    // act2 overlay is already opaque (room handled the fade-to-black)
    // Switch containers
    $act3.classList.remove('hidden');
    $act2.classList.add('hidden');

    // Reset act3 overlay if needed
    const act3Overlay = document.getElementById('act2-overlay');

    // Open the gallery
    gallery.open(id);

    // Fade in act3
    const fadeCover = document.getElementById('image-fade');
    gsap.to(fadeCover, { opacity: 0, duration: 1.2, delay: 0.1, ease: 'power2.out' });
  }

  /* ── Return to Room ──────────────────────────────────────────── */
  function returnToRoom() {
    if (current !== STATE.GALLERY) return;

    // Fade gallery out
    const fadeCover = document.getElementById('image-fade');

    gsap.to(fadeCover, {
      opacity:  1,
      duration: 0.8,
      ease:     'power2.inOut',
      onComplete: () => {
        $act3.classList.add('hidden');
        $act2.classList.remove('hidden');

        // Reset gallery title visibility
        document.getElementById('gallery-title').classList.remove('visible');
        document.getElementById('gallery-subtitle').classList.remove('visible');

        // Room transition-in (fades the room overlay out)
        room.transitionIn(() => {
          current = STATE.ROOM;
        });
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
