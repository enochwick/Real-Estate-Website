/* The animated orb in the corner launcher.
 *
 * thinking-orbs ships as a React component, but its `./engine` entry is pure
 * geometry plus a 2D-canvas painter with no React in it — so this site stays
 * vanilla. This module is the twenty lines of lifecycle the React wrapper
 * would otherwise provide: size the canvas for the display, drive one rAF
 * loop, and stop when nobody is looking.
 *
 * If the CDN import fails the caller keeps its CSS fallback, so the launcher
 * is never a blank hole.
 */

const ENGINE_URL = 'https://esm.sh/thinking-orbs@0.3.1/engine';

/* Only two tuned presets exist — 64 and 20. We draw the 64 design and let CSS
   size the element down, which is what the package's own demo does. */
const PRESET_SIZE = 64;

export async function mountOrb(canvas, {
  state = 'breathing',
  dark = true,
  speed = 1,
} = {}) {
  const { resolvePreset, MODE_DRAWS } = await import(/* @vite-ignore */ ENGINE_URL);

  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(PRESET_SIZE * dpr);
  canvas.height = Math.round(PRESET_SIZE * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { mode, speed: baked, opts } = resolvePreset(state, PRESET_SIZE);
  const draw = MODE_DRAWS[mode];
  const rate = baked * speed;

  const frame = (t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PRESET_SIZE, PRESET_SIZE);
    draw(ctx, PRESET_SIZE, t, dark, opts);
  };

  // Reduced motion: one held frame, picked past the start so it is not a
  // half-formed pose.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    frame(0.6);
    return { stop() {} };
  }

  let raf = 0;
  let running = false;
  const tick = () => {
    frame((performance.now() / 1000) * rate);
    if (running) raf = requestAnimationFrame(tick);
  };
  const play = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  frame((performance.now() / 1000) * rate);

  /* Off screen or in a background tab, the loop has no reason to run. */
  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && document.visibilityState !== 'hidden') play(); else stop();
  });
  io.observe(canvas);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') stop();
    else if (visible) play();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    stop() {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
