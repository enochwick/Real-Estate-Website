/* Entry point for the two Meridian AI experiences. */

import { MeridianVoice } from './voice.js';
import { ResidenceChat } from './residence-chat.js';
import { byCode } from './residences.js';

MeridianVoice.init();
ResidenceChat.init();

/* Both experiences hand off to the same place: the enquiry form, pre-filled
   with the residence under discussion, so nothing is retyped. */
document.addEventListener('meridian:schedule-viewing', (e) => {
  const r = byCode(e.detail?.code);
  const form = document.querySelector('.form');
  const brief = form?.querySelector('[name="brief"]');
  if (r && brief) {
    brief.value = `A private viewing of Residence ${r.code} — ${r.name}, floor ${r.floor}.`;
  }
  document.getElementById('enquire')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => form?.querySelector('[name="name"]')?.focus(), 600);
});

// Exposed for console checks and for wiring the Retell driver in later.
window.Meridian = { voice: MeridianVoice, chat: ResidenceChat };
