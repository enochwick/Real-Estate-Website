/* Ask this residence — contextual conversation for one home.
 *
 * The panel is always bound to a residence: every question is answered from
 * that record and the rest of the Meridian inventory, never from anything
 * else. Opening it from a slide sets the context automatically.
 *
 * Swap `ask()` for a server call when the real model lands — keep the
 * `{ reply, offerViewing }` shape and pass the residence code as context so
 * the model can't wander outside the building.
 */

import { byCode, shortPrice, sqftLabel } from './residences.js';
import { ask, suggestionsFor } from './advisor.js';

export const ResidenceChat = (() => {
  const el = {};
  let current = null;
  let lastFocus = null;
  let exchanges = 0;
  let converted = false;

  function cache() {
    el.root    = document.getElementById('chat');
    el.title   = document.getElementById('chatTitle');
    el.spec    = document.getElementById('chatSpec');
    el.log     = document.getElementById('chatLog');
    el.sugg    = document.getElementById('chatSuggestions');
    el.form    = document.getElementById('chatForm');
    el.input   = document.getElementById('chatInput');
    return !!el.root;
  }

  function bubble(role, text) {
    const p = document.createElement('div');
    p.className = `chat__msg chat__msg--${role}`;
    p.textContent = text;
    el.log.append(p);
    el.log.scrollTop = el.log.scrollHeight;
    return p;
  }

  function renderSuggestions() {
    el.sugg.innerHTML = '';
    suggestionsFor(current).forEach((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat__sugg';
      b.textContent = q;
      b.addEventListener('click', () => send(q));
      el.sugg.append(b);
    });
  }

  /* Surfaced only once the conversation shows real interest — never up front. */
  function offerViewing() {
    if (converted) return;
    converted = true;
    const box = document.createElement('div');
    box.className = 'chat__convert';
    box.innerHTML = `
      <h4>See it in person</h4>
      <p>Arrange a private viewing at a time that works for you.</p>
      <button class="btn btn--solid" type="button">Schedule a private viewing</button>`;
    box.querySelector('button').addEventListener('click', () => {
      const code = current.code;
      close();
      document.dispatchEvent(new CustomEvent('meridian:schedule-viewing', { detail: { code } }));
    });
    el.log.append(box);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function send(text) {
    const clean = String(text).trim();
    if (!clean) return;
    el.input.value = '';
    bubble('visitor', clean);
    el.sugg.hidden = true;

    const pending = bubble('meridian', '…');
    pending.classList.add('is-pending');

    setTimeout(() => {
      const { reply, offerViewing: wants } = ask(current, clean);
      pending.classList.remove('is-pending');
      pending.textContent = reply;
      exchanges += 1;

      // Two useful exchanges, or an explicit ask, reads as genuine interest.
      if (wants || exchanges >= 2) offerViewing();
    }, 520);
  }

  function open(code) {
    const residence = byCode(code);
    if (!residence) return;
    current = residence;
    exchanges = 0;
    converted = false;
    lastFocus = document.activeElement;

    el.title.textContent = `Residence ${residence.code}`;
    el.spec.textContent =
      `${residence.name} · Floor ${residence.floor} · ${residence.aspect} · ${residence.beds} bed · ${sqftLabel(residence)} · ${residence.price ? shortPrice(residence) : 'Price on request'}`;

    el.log.innerHTML = '';
    bubble('meridian',
      'Ask me about this residence — its layout, orientation, space, price, or how it compares with another home at Meridian.');
    el.sugg.hidden = false;
    renderSuggestions();

    el.root.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => el.root.classList.add('is-open'));
    el.input.focus();
  }

  function close() {
    el.root.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    const done = () => { el.root.hidden = true; };
    setTimeout(done, 260);
    lastFocus?.focus();
  }

  function init() {
    if (!cache()) return;

    el.form.addEventListener('submit', (e) => { e.preventDefault(); send(el.input.value); });
    el.root.querySelectorAll('[data-chat="close"]').forEach((b) => b.addEventListener('click', close));
    el.root.addEventListener('click', (e) => { if (e.target === el.root) close(); });
    document.addEventListener('keydown', (e) => {
      if (!el.root.hidden && e.key === 'Escape') close();
    });

    document.querySelectorAll('[data-ask]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();          // the slide itself opens the lightbox
        open(b.dataset.ask);
      });
    });

    document.addEventListener('meridian:open-residence', (e) => open(e.detail.code));
  }

  return { init, open, close };
})();
