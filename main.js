/* Meridian — scroll-scrubbed frame sequence stage */
(() => {
  'use strict';

  // Interior → balcony → descent to street level. The sequence stops there;
  // the camera climbs back out over the harbour after this and we don't use it.
  const FRAME_COUNT = 157;
  const framePath = (i) => `frames/frame_${String(i + 1).padStart(4, '0')}.webp`;

  const stage     = document.getElementById('stage');
  const canvas    = document.getElementById('heroCanvas');
  const cue       = document.getElementById('heroCue');
  const railFill  = document.getElementById('heroRailFill');
  const loader    = document.getElementById('heroLoader');
  const loadFill  = document.getElementById('heroLoaderFill');
  const nav       = document.getElementById('nav');
  const beats     = [...document.querySelectorAll('.beat')];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Frame store ──────────────────────────────────────────────── */
  const frames = new Array(FRAME_COUNT).fill(null);
  let loadedCount = 0;
  let lastDrawn = -1;

  function loadFrame(i) {
    return new Promise((resolve) => {
      if (frames[i]) return resolve();
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        frames[i] = img;
        loadedCount++;
        if (loadFill) loadFill.style.width = (loadedCount / FRAME_COUNT) * 100 + '%';
        resolve();
      };
      img.onerror = () => { loadedCount++; resolve(); };
      img.src = framePath(i);
    });
  }

  // Nearest already-loaded frame, so scrubbing never shows a gap.
  function resolveFrame(i) {
    if (frames[i]) return frames[i];
    for (let d = 1; d < FRAME_COUNT; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  async function runQueue(indices, concurrency) {
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < indices.length) await loadFrame(indices[cursor++]);
    });
    await Promise.all(workers);
  }

  /* ── Canvas ───────────────────────────────────────────────────── */
  const ctx = canvas.getContext('2d', { alpha: false });
  let viewW = 0, viewH = 0;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = stage.clientWidth;
    viewH = canvas.parentElement.clientHeight;
    canvas.width  = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (lastDrawn >= 0) paint(lastDrawn, true);
  }

  function paint(index, force = false) {
    if (index === lastDrawn && !force) return;
    const img = resolveFrame(index);
    if (!img) return;
    lastDrawn = index;

    // cover fit
    const scale = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (viewW - w) / 2, (viewH - h) / 2, w, h);
  }

  /* ── Beats ────────────────────────────────────────────────────── */
  // Progress runs across the whole stage, so these are fractions of the entire
  // shot. The gaps between ranges are the cross-fades — keep them small or the
  // screen goes bare between beats.
  //   0  interior    1  balcony exit + CTA    2  "The building", held for the
  //   whole descent to street level.
  const BEAT_RANGES = [[0, 0.17], [0.21, 0.34], [0.36, 1.01]];
  let activeBeat = -1;

  function setBeat(progress) {
    let next = -1;
    for (let i = 0; i < BEAT_RANGES.length; i++) {
      const [a, b] = BEAT_RANGES[i];
      if (progress >= a && progress < b) { next = i; break; }
    }
    if (next === activeBeat) return;
    activeBeat = next;
    beats.forEach((el, i) => el.classList.toggle('is-active', i === next));
  }

  /* ── Scroll loop ──────────────────────────────────────────────── */
  let ticking = false;

  function update() {
    ticking = false;

    const rect = stage.getBoundingClientRect();
    const scrollable = stage.offsetHeight - window.innerHeight;
    const progress = scrollable > 0
      ? Math.min(Math.max(-rect.top / scrollable, 0), 1)
      : 0;

    paint(Math.min(FRAME_COUNT - 1, Math.round(progress * (FRAME_COUNT - 1))));
    setBeat(progress);

    if (railFill) railFill.style.height = progress * 100 + '%';
    cue.classList.toggle('is-hidden', progress > 0.02);
    nav.classList.toggle('is-solid', rect.bottom <= window.innerHeight * 0.9);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  /* ── Boot ─────────────────────────────────────────────────────── */
  async function boot() {
    sizeCanvas();

    // Phase 1: a coarse pass across the whole sequence so scrubbing works
    // almost immediately, then fill in every remaining frame.
    const coarse = [];
    for (let i = 0; i < FRAME_COUNT; i += 8) coarse.push(i);
    await runQueue(coarse, 6);

    stage.classList.add('is-ready');
    update();

    const rest = [];
    for (let i = 0; i < FRAME_COUNT; i++) if (!frames[i]) rest.push(i);
    await runQueue(rest, 8);

    loader.classList.add('is-done');
    update();
  }

  if (reduced) {
    // No scrubbing: the poster still tells the story, beat 0 stays visible.
    beats[0].classList.add('is-active');
    cue.classList.add('is-hidden');
    loader.classList.add('is-done');
    nav.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.6);
    window.addEventListener('scroll', () => {
      nav.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.6);
    }, { passive: true });
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', sizeCanvas);
    window.addEventListener('orientationchange', sizeCanvas);
    boot();
  }

  /* ── Gallery: unfurling 3D matrix ─────────────────────────────
     Fills four columns from the listing stills, then writes a single
     0→1 custom property as it scrolls. All the transform maths lives in
     CSS calc(), so there is one style write per frame.
  ─────────────────────────────────────────────────────────────── */
  const gallery = document.getElementById('gallery');

  if (gallery) {
    const PLATES = [
      ['images/listing-living.webp',  'Living room facing the harbour'],
      ['images/listing-kitchen.webp', 'Walnut kitchen and island'],
      ['images/listing-bedroom.webp', 'Primary bedroom at twilight'],
      ['images/listing-terrace.webp', 'Private terrace above the city'],
      ['images/interior.webp',        'Open-plan living at sunset'],
      ['images/terrace.webp',         'Dining beside the glazing'],
      ['images/skyline.webp',         'The skyline from the upper floors'],
      ['images/aerial.webp',          'The street below the tower'],
    ];

    gallery.querySelectorAll('.gallery__col').forEach((col, c) => {
      // Each column takes every 4th plate, doubled so it never runs dry.
      const own = PLATES.filter((_, i) => i % 4 === c);
      [...own, ...own, ...own].forEach(([src, alt]) => {
        const img = new Image();
        img.src = src;
        img.alt = alt;
        img.loading = 'lazy';
        img.decoding = 'async';
        col.append(img);
      });
    });

    if (!reduced) {
      let gTicking = false;
      const updateGallery = () => {
        gTicking = false;
        const rect = gallery.getBoundingClientRect();
        const travel = gallery.offsetHeight - window.innerHeight;
        const g = travel > 0
          ? Math.min(Math.max(-rect.top / travel, 0), 1)
          : 0;
        // Ease the tail so the matrix settles instead of stopping dead.
        gallery.style.setProperty('--g', (1 - Math.pow(1 - g, 1.7)).toFixed(4));
      };
      window.addEventListener('scroll', () => {
        if (gTicking) return;
        gTicking = true;
        requestAnimationFrame(updateGallery);
      }, { passive: true });
      window.addEventListener('resize', updateGallery);
      updateGallery();
    } else {
      gallery.style.setProperty('--g', '1');
    }
  }

  /* ── Reveal on scroll ─────────────────────────────────────────── */
  const revealTargets = document.querySelectorAll(
    '.intro, .sectionHead, .card, .split__media, .split__text, .cta__inner'
  );
  if (!reduced && 'IntersectionObserver' in window) {
    revealTargets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 3) * 80}ms`;
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  }

  /* ── Form (front-end only until a backend is wired up) ────────── */
  const form = document.querySelector('.form');
  const note = document.getElementById('formNote');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (!data.get('name') || !data.get('email')) {
      note.textContent = 'Please add your name and email so we can reach you.';
      return;
    }
    note.textContent = `Thanks, ${data.get('name')}. We'll be in touch within a day to set a time.`;
    form.reset();
  });
})();
