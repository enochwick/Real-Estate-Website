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

/* The voice transport. With an agent id in the page, Talk to Meridian is a
   real ElevenLabs call; without one it stays the scripted demo, so the site
   never ships broken. The SDK is only fetched when there is an id to use. */
const agentId = document
  .querySelector('meta[name="meridian:agent-id"]')?.content.trim();

if (agentId) {
  import('./drivers/elevenlabs.js')
    .then(({ createElevenLabsDriver }) => {
      const driver = createElevenLabsDriver({ agentId });
      MeridianVoice.setDriver(driver);
      window.Meridian.driver = driver;
    })
    .catch((err) => console.error('[Meridian] voice driver failed to load', err));
}

// Exposed for console checks.
window.Meridian = { voice: MeridianVoice, chat: ResidenceChat };
