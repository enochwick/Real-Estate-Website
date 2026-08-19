/* Talk to Meridian — voice experience.
 *
 * ── Drivers ─────────────────────────────────────────────────────────
 * This module owns the interaction states and the UI. It does not own the
 * transport. The shipped transport is ElevenLabs Agents, in
 * ./drivers/elevenlabs.js, wired up in ./meridian-ai.js when an agent id is
 * present. Below is the mock it falls back to. Any transport can take over:
 *
 *   import { MeridianVoice } from './voice.js';
 *   MeridianVoice.setDriver({
 *     async start({ onStatus, onTranscript, onResult }) { … },
 *     async stop() { … },
 *   });
 *
 * A driver must:
 *   • call onStatus('listening' | 'thinking' | 'speaking' | 'idle')
 *   • call onTranscript({ role: 'visitor' | 'meridian', text })
 *   • call onResult({ reply, ranked, primary }) when it has recommendations
 *   • optionally implement toggleMic() for the mic button
 *
 * NEVER put a provider API key in this file or any other client bundle. Ship a
 * public agent id, or fetch a short-lived token from your own endpoint that
 * holds the key server-side.
 * ──────────────────────────────────────────────────────────────────── */

import { recommend } from './advisor.js';
import { shortPrice, sqftLabel } from './residences.js';

const PROMPTS = [
  'Something high up with sunset views.',
  'A three-bedroom around $5 million.',
  'I entertain often, but I want the bedrooms to feel private.',
  'Show me the best options for natural light.',
];

/* The mock driver: scripted timing that mirrors a real call's cadence. */
const mockDriver = {
  _timers: [],
  async start({ onStatus }) {
    onStatus('listening');
  },
  async submit(text, { onStatus, onTranscript, onResult }) {
    onTranscript({ role: 'visitor', text });
    onStatus('thinking');
    await new Promise((r) => this._timers.push(setTimeout(r, 1400)));
    const result = recommend(text);
    onStatus('speaking');
    onTranscript({ role: 'meridian', text: result.reply });
    onResult(result);
  },
  async stop() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
  },
};

export const MeridianVoice = (() => {
  let driver = mockDriver;

  /* ── Public state, per the integration brief ─────────────────── */
  const state = {
    voiceStatus: 'idle',              // idle | listening | thinking | speaking
    conversationTranscript: [],       // [{ role, text, at }]
    currentRecommendedProperty: null,
    propertyRecommendations: [],
  };

  /* ── Elements ────────────────────────────────────────────────── */
  const el = {};
  let lastFocus = null;
  let listeners = [];

  const on = (t, e, fn) => { t.addEventListener(e, fn); listeners.push([t, e, fn]); };

  function cache() {
    el.root      = document.getElementById('voice');
    el.status    = document.getElementById('voiceStatus');
    el.wave      = document.getElementById('voiceWave');
    el.prompts   = document.getElementById('voicePrompts');
    el.log       = document.getElementById('voiceLog');
    el.result    = document.getElementById('voiceResult');
    el.mic       = document.getElementById('voiceMic');
    el.intro     = document.getElementById('voiceIntro');
    return !!el.root;
  }

  function setStatus(next) {
    state.voiceStatus = next;
    el.root.dataset.status = next;
    const label = {
      idle: '',
      connecting: 'Connecting…',
      listening: "I'm listening.",
      muted: 'Muted — tap the mic to talk.',
      thinking: 'Finding the right fit…',
      speaking: '',
    }[next];
    if (label !== undefined) el.status.textContent = label;
    el.mic.setAttribute('aria-pressed', String(next === 'listening'));
  }

  function addTranscript(entry) {
    state.conversationTranscript.push({ ...entry, at: Date.now() });
    const row = document.createElement('p');
    row.className = `voice__line voice__line--${entry.role}`;
    row.textContent = entry.text;
    el.log.append(row);
    el.log.scrollTop = el.log.scrollHeight;
    el.intro.hidden = true;
  }

  function renderResult({ ranked, primary, followUp }) {
    state.currentRecommendedProperty = primary;
    state.propertyRecommendations = ranked;

    el.result.innerHTML = '';
    if (!primary) return;

    const card = document.createElement('article');
    card.className = 'voice__rec';
    card.innerHTML = `
      <img src="${primary.image}" alt="" loading="lazy">
      <div class="voice__recBody">
        <p class="voice__recMeta">Residence ${primary.code} · Floor ${primary.floor} · ${primary.aspect}</p>
        <h3>${primary.name}</h3>
        <p class="voice__recSpec">${primary.beds} bed · ${sqftLabel(primary)} · ${primary.price ? shortPrice(primary) : 'Price on request'}</p>
      </div>`;
    el.result.append(card);

    if (followUp) {
      const p = document.createElement('p');
      p.className = 'voice__followUp';
      p.textContent = followUp;
      el.result.append(p);
    }

    const actions = document.createElement('div');
    actions.className = 'voice__actions';
    const second = ranked.find((r) => r.code !== primary.code);
    actions.innerHTML = `
      <button class="btn btn--solid" type="button" data-act="view">View residence</button>
      ${second ? `<button class="btn btn--ghost" type="button" data-act="compare">Compare with ${second.code}</button>` : ''}
      <button class="btn btn--ghost" type="button" data-act="keep">Keep talking</button>
      <button class="btn btn--ghost" type="button" data-act="viewing">Schedule a viewing</button>`;
    el.result.append(actions);

    actions.querySelector('[data-act="view"]').addEventListener('click', () => {
      close();
      document.dispatchEvent(new CustomEvent('meridian:open-residence', { detail: { code: primary.code } }));
    });
    actions.querySelector('[data-act="keep"]')?.addEventListener('click', () => {
      el.result.innerHTML = '';
      setStatus('listening');
    });
    actions.querySelector('[data-act="compare"]')?.addEventListener('click', () => {
      submit(`Compare ${primary.code} with ${second.code}`);
    });
    actions.querySelector('[data-act="viewing"]').addEventListener('click', () => {
      close();
      document.dispatchEvent(new CustomEvent('meridian:schedule-viewing', { detail: { code: primary.code } }));
    });
  }

  /* The whole collection, when the agent says it is pulling up a list. Rows
     are clickable — tapping one swaps this out for that residence's card. */
  function renderList(residences) {
    el.result.innerHTML = '';
    if (!residences?.length) return;

    state.propertyRecommendations = residences;

    const list = document.createElement('ul');
    list.className = 'voice__list';
    residences.forEach((r) => {
      const row = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voice__listRow';
      btn.innerHTML = `
        <img src="${r.image}" alt="" loading="lazy">
        <span class="voice__listBody">
          <span class="voice__listName">${r.code} · ${r.name}</span>
          <span class="voice__listSpec">Floor ${r.floor} · ${r.aspect} · ${r.beds} bed · ${sqftLabel(r)}</span>
        </span>
        <span class="voice__listPrice">${r.price ? shortPrice(r) : 'On request'}</span>`;
      btn.addEventListener('click', () => renderResult({ ranked: [r], primary: r }));
      row.append(btn);
      list.append(row);
    });
    el.result.append(list);
    el.intro.hidden = true;
  }

  const hooks = () => ({
    onStatus: setStatus,
    onTranscript: addTranscript,
    onResult: renderResult,
    onList: renderList,
    // Drivers report trouble here; it lands on the status line, in plain words.
    onError: (message) => { el.status.textContent = message; },
  });

  async function submit(text) {
    const clean = String(text).trim();
    if (!clean || state.voiceStatus === 'thinking') return;
    el.result.innerHTML = '';
    await driver.submit?.(clean, hooks());
  }

  /* ── Open / close ────────────────────────────────────────────── */

  async function startVoiceConversation() {
    if (!el.root) return;
    lastFocus = document.activeElement;
    el.root.hidden = false;
    document.body.classList.add('is-locked');
    await driver.start(hooks());
  }

  async function endVoiceConversation() {
    await driver.stop?.();
    setStatus('idle');
    el.root.hidden = true;
    document.body.classList.remove('is-locked');
    lastFocus?.focus();
  }

  const close = endVoiceConversation;

  function reset() {
    state.conversationTranscript = [];
    state.currentRecommendedProperty = null;
    state.propertyRecommendations = [];
    el.log.innerHTML = '';
    el.result.innerHTML = '';
    el.intro.hidden = false;
  }

  /* ── Init ────────────────────────────────────────────────────── */

  function init() {
    if (!cache()) return;

    // Understated example lines, not buttons.
    PROMPTS.forEach((text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'voice__prompt';
      b.textContent = `“${text}”`;
      b.addEventListener('click', () => submit(text));
      el.prompts.append(b);
    });

    // Eight bars, animated only while listening.
    el.wave.innerHTML = Array.from({ length: 8 }, (_, i) =>
      `<i style="--i:${i}"></i>`).join('');

    on(el.mic, 'click', () => {
      // With a live call the mic mutes it; without one it toggles the demo state.
      const next = driver.toggleMic?.();
      if (next) { setStatus(next); return; }
      setStatus(state.voiceStatus === 'listening' ? 'idle' : 'listening');
    });
    on(el.root, 'click', (e) => { if (e.target === el.root) close(); });
    el.root.querySelectorAll('[data-voice="close"]').forEach((b) => on(b, 'click', close));
    on(document, 'keydown', (e) => {
      if (!el.root.hidden && e.key === 'Escape') close();
    });

    document.querySelectorAll('[data-voice="open"]').forEach((b) => {
      on(b, 'click', (e) => { e.preventDefault(); reset(); startVoiceConversation(); });
    });
  }

  return {
    init,
    setDriver(next) { driver = next; },
    startVoiceConversation,
    endVoiceConversation,
    submit,
    get voiceStatus() { return state.voiceStatus; },
    get conversationTranscript() { return [...state.conversationTranscript]; },
    get currentRecommendedProperty() { return state.currentRecommendedProperty; },
    get propertyRecommendations() { return [...state.propertyRecommendations]; },
  };
})();
