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

  /* ── Fan carousel ─────────────────────────────────────────────
     Seven visible slots; the rest wait off-stage. Slot geometry is the
     same table the reference component used, but the animation is a CSS
     transition — JS only ever writes a transform string.
  ─────────────────────────────────────────────────────────────── */
  const fanLayout = document.getElementById('fanLayout');

  if (fanLayout) {
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

    const MAX_VISIBLE = 7;
    const HALF = 3;
    // rot / scale / x(rem) / y(rem) / z-index, centre outwards.
    const SLOTS = [
      { rot: -21, scale: 0.800, x: -18.5, y: 5.4, z: 1 },
      { rot: -14, scale: 0.868, x: -13.5, y: 3.0, z: 2 },
      { rot:  -7, scale: 0.944, x:  -6.8, y: 1.0, z: 3 },
      { rot:   0, scale: 1.000, x:    0,  y: 0.0, z: 10 },
      { rot:   7, scale: 0.944, x:   6.8, y: 1.0, z: 3 },
      { rot:  14, scale: 0.868, x:  13.5, y: 3.0, z: 2 },
      { rot:  21, scale: 0.800, x:  18.5, y: 5.4, z: 1 },
    ];

    const total = PLATES.length;
    const paginated = total > MAX_VISIBLE;
    const slotCount = paginated ? MAX_VISIBLE : total;

    // Narrow viewports cannot afford the full ±30rem spread.
    const spread = () => {
      const w = window.innerWidth;
      if (w < 480) return 0.28;
      if (w < 640) return 0.38;
      if (w < 768) return 0.5;
      if (w < 1024) return 0.75;
      return 1;
    };

    const slotAt = (slot) => {
      if (total >= MAX_VISIBLE) return SLOTS[slot];
      const centre = total >> 1;
      const d = total > 1 ? (slot - centre) / centre : 0;
      const a = Math.abs(d);
      return { rot: d * 21, scale: 1 - 0.2 * a * a, x: d * 18.5, y: a * a * 5.4, z: 10 - Math.abs(slot - centre) };
    };

    const cards = PLATES.map(([src, alt]) => {
      const el = document.createElement('div');
      el.className = 'fan__card';
      const img = new Image();
      img.src = src;
      img.alt = alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      el.append(img);
      fanLayout.append(el);
      return el;
    });

    const dotsWrap = document.getElementById('fanDots');
    const dots = PLATES.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fan__dot';
      b.setAttribute('aria-label', `Image ${i + 1}`);
      b.addEventListener('click', () => go(i));
      dotsWrap.append(b);
      return b;
    });

    let centre = paginated ? HALF : total >> 1;
    let visible = new Map();
    let hovered = null;

    const visibleMap = (c) => {
      const map = new Map();
      if (!paginated) { cards.forEach((_, i) => map.set(i, i)); return map; }
      for (let slot = 0; slot < MAX_VISIBLE; slot++) {
        map.set((((c + slot - HALF) % total) + total) % total, slot);
      }
      return map;
    };

    const place = (el, t, instant) => {
      if (instant) el.classList.add('fan__card--instant');
      el.style.zIndex = t.z;
      el.style.opacity = t.opacity;
      el.style.transform =
        `translate(${t.x}rem, ${t.y}rem) rotate(${t.rot}deg) scale(${t.scale})`;
      if (instant) {
        void el.offsetWidth;              // flush, so the next change animates
        el.classList.remove('fan__card--instant');
      }
    };

    // Hovering a card lifts it and pushes its neighbours outward.
    const layout = (first) => {
      const m = spread();
      const centreSlot = slotCount >> 1;

      visible.forEach((slot, i) => {
        const base = slotAt(slot);
        let { rot, scale } = base;
        let x = base.x * m;
        let y = base.y;

        if (hovered !== null) {
          const d = Math.abs(slot - hovered);
          if (slot === hovered) {
            y -= 2.5;
            scale *= 1.08;
          } else {
            // The reference used a base of 8rem, which tears this fan in two —
            // our cards are narrower relative to their spread. 3rem reads as a
            // spread rather than a gap.
            const norm = centreSlot > 0 ? (slot - centreSlot) / centreSlot : 0;
            const push = 2.2 * (1 - Math.abs(norm)) * (1 + 0.2 * Math.max(0, 3 - d)) * m;
            x += slot < hovered ? -push : push;
            rot += slot < hovered ? -3 / (d + 1) : 3 / (d + 1);
          }
        }
        place(cards[i], { x, y, rot, scale, z: base.z, opacity: 1 }, first);
      });
    };

    function go(next) {
      const dir = next > centre || (centre === total - 1 && next === 0) ? 1 : -1;
      centre = ((next % total) + total) % total;
      const nextVisible = visibleMap(centre);
      const m = spread();

      // Anything leaving flies out the opposite way.
      visible.forEach((slot, i) => {
        if (nextVisible.has(i)) return;
        place(cards[i], { x: dir > 0 ? -40 * m : 40 * m, y: 0, rot: dir > 0 ? -30 : 30, scale: 0.5, z: 0, opacity: 0 }, false);
      });
      // Anything arriving is parked off-stage, then animated in.
      nextVisible.forEach((slot, i) => {
        if (visible.has(i)) return;
        const base = slotAt(slot);
        place(cards[i], { x: dir > 0 ? 40 * m : -40 * m, y: base.y, rot: dir > 0 ? 30 : -30, scale: 0.5, z: base.z, opacity: 0 }, true);
      });

      visible = nextVisible;
      hovered = null;
      layout(false);
      dots.forEach((d, i) => d.classList.toggle('is-active', i === centre));
    }

    cards.forEach((el, i) => {
      el.addEventListener('mouseenter', () => {
        const slot = visible.get(i);
        if (slot === undefined || reduced) return;
        hovered = slot;
        layout(false);
      });
    });
    fanLayout.addEventListener('mouseleave', () => {
      if (hovered === null) return;
      hovered = null;
      layout(false);
    });

    document.querySelector('[data-fan="prev"]')
      .addEventListener('click', () => go(centre - 1));
    document.querySelector('[data-fan="next"]')
      .addEventListener('click', () => go(centre + 1));

    window.addEventListener('resize', () => layout(true));

    visible = visibleMap(centre);
    cards.forEach((el, i) => {
      if (!visible.has(i)) place(el, { x: 0, y: 0, rot: 0, scale: 0.3, z: 0, opacity: 0 }, true);
    });
    layout(true);
    requestAnimationFrame(() => layout(false));
    dots.forEach((d, i) => d.classList.toggle('is-active', i === centre));
  }

  /* ── Residence slider: tabs, snap track, dots, lightbox ───────── */
  const slider = document.getElementById('slider');

  if (slider) {
    const track  = document.getElementById('sliderTrack');
    const dotsEl = document.getElementById('sliderDots');
    const slides = [...track.children];
    let shown = slides;
    let index = 0;

    const dots = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slider__dot';
      b.setAttribute('aria-label', `Go to residence ${i + 1}`);
      b.addEventListener('click', () => scrollTo(i));
      dotsEl.append(b);
      return b;
    });

    const syncDots = () => {
      dots.forEach((d, i) => {
        d.hidden = i >= shown.length;
        d.classList.toggle('is-active', i === index);
      });
    };

    function scrollTo(i) {
      index = Math.max(0, Math.min(i, shown.length - 1));
      const card = shown[index];
      if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
      syncDots();
    }

    // Keep the dots honest when the track is swiped rather than clicked.
    let scrollTick = false;
    track.addEventListener('scroll', () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => {
        scrollTick = false;
        const x = track.scrollLeft + track.offsetLeft;
        let nearest = 0, best = Infinity;
        shown.forEach((c, i) => {
          const d = Math.abs(c.offsetLeft - x);
          if (d < best) { best = d; nearest = i; }
        });
        if (nearest !== index) { index = nearest; syncDots(); }
      });
    }, { passive: true });

    slider.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        slider.querySelectorAll('.tab').forEach((t) => {
          const on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
        });
        const filter = tab.dataset.filter;
        slides.forEach((s) => {
          const match = filter === 'all' || s.dataset.status === filter;
          s.classList.toggle('is-hidden', !match);
        });
        shown = slides.filter((s) => !s.classList.contains('is-hidden'));
        index = 0;
        track.scrollTo({ left: 0, behavior: reduced ? 'auto' : 'smooth' });
        syncDots();
      });
    });

    slider.querySelector('[data-slide="prev"]')
      .addEventListener('click', () => scrollTo(index - 1 < 0 ? shown.length - 1 : index - 1));
    slider.querySelector('[data-slide="next"]')
      .addEventListener('click', () => scrollTo(index + 1 >= shown.length ? 0 : index + 1));

    /* Lightbox */
    const box    = document.getElementById('lightbox');
    const boxImg = document.getElementById('lightboxImg');
    const boxTtl = document.getElementById('lightboxTitle');
    const boxCnt = document.getElementById('lightboxCount');
    let boxIndex = 0;
    let lastFocus = null;

    const paint = () => {
      const card = shown[boxIndex];
      if (!card) return;
      boxImg.src = card.dataset.img;
      boxImg.alt = card.querySelector('img').alt;
      boxTtl.textContent = card.querySelector('.slide__title').textContent;
      boxCnt.textContent = `${boxIndex + 1} of ${shown.length}`;
    };
    const open = (i) => {
      boxIndex = i;
      lastFocus = document.activeElement;
      paint();
      box.hidden = false;
      box.querySelector('.lightbox__close').focus();
    };
    const close = () => {
      box.hidden = true;
      lastFocus?.focus();
    };
    const step = (d) => {
      boxIndex = (boxIndex + d + shown.length) % shown.length;
      paint();
    };

    slides.forEach((card) => {
      card.addEventListener('click', () => open(shown.indexOf(card)));
    });
    box.querySelector('.lightbox__close').addEventListener('click', close);
    box.querySelector('.lightbox__nav--prev').addEventListener('click', () => step(-1));
    box.querySelector('.lightbox__nav--next').addEventListener('click', () => step(1));
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    document.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    syncDots();
  }

  /* ── Reveal on scroll ─────────────────────────────────────────── */
  const revealTargets = document.querySelectorAll(
    '.intro, .fan-head, .slider, .split__media, .split__text, .cta__inner'
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
