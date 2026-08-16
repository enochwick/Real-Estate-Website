/* ElevenLabs Agents driver for "Talk to Meridian".
 *
 * Implements the driver contract in ../voice.js — start / submit / stop, plus
 * an optional toggleMic — so the overlay UI (mic, wave, transcript, residence
 * card) is unchanged; only the transport underneath it is real.
 *
 * ── Setup ───────────────────────────────────────────────────────────
 * 1. Create an agent at elevenlabs.io → Agents.
 * 2. Set it to **public** (Agent → Security → "Enable authentication" OFF).
 *    A public agent needs no API key in the browser, which is what keeps this
 *    site a plain static folder. Add your domain to the allowlist there.
 * 3. Paste the agent id into index.html:
 *      <meta name="meridian:agent-id" content="agent_…">
 * 4. Give the agent these client tools (Agent → Tools → Add client tool). The
 *    names and parameters must match exactly; the handlers live below and run
 *    against js/residences.js, so the inventory stays the single source of
 *    truth and the agent can never invent a residence.
 *
 *      recommend_residence(brief: string)
 *      show_residence(code: string)
 *      compare_residences(code_a: string, code_b: string)
 *      schedule_viewing(code: string)
 *      list_residences()
 *
 * NEVER put an ElevenLabs API key in this file or any other client bundle. A
 * public agent id is safe to ship; an API key is not. If you later lock the
 * agent down, add an endpoint that returns a conversation token and pass it as
 * `conversationToken` instead of `agentId` — that is the only change needed.
 * ──────────────────────────────────────────────────────────────────── */

import { recommend, compare } from '../advisor.js';
import { RESIDENCES, byCode, shortPrice, sqftLabel } from '../residences.js';

/* Pinned: the SDK is loaded straight from a CDN, so there is no build step.
   Bump deliberately, not automatically — this is the audio path. */
const SDK_URL = 'https://esm.sh/@elevenlabs/client@1.18.0';

/* What the agent hears back from a tool call. Compact on purpose: it is spoken
   material, not a data dump. */
const describe = (r) =>
  `${r.code} — ${r.name}, floor ${r.floor}, ${r.aspect}-facing, ${r.beds} bed, ` +
  `${sqftLabel(r)}, ${r.price ? shortPrice(r) : 'price on request'}. ${r.notes}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createElevenLabsDriver({ agentId, sdkUrl = SDK_URL } = {}) {
  let conversation = null;
  let hooks = null;
  let micMuted = false;
  /* A typed message is echoed back by the server as a user message. Remember
     the last one so the transcript does not show it twice. */
  let lastSent = null;
  /* No session — mic blocked, agent unreachable, no id configured. The overlay
     stays usable: typed questions still run through the local advisor. */
  let degraded = false;

  /* ── Client tools ──────────────────────────────────────────────────
     The agent decides *when*; these decide *what*, from local inventory.
     Each renders into the overlay and returns a line for the agent to say.
     ────────────────────────────────────────────────────────────────── */
  const clientTools = {
    recommend_residence: ({ brief }) => {
      const result = recommend(String(brief ?? ''));
      hooks?.onResult(result);
      return result.ranked.slice(0, 3).map(describe).join(' | ');
    },

    show_residence: ({ code }) => {
      const r = byCode(String(code ?? '').toUpperCase());
      if (!r) {
        return `There is no residence ${code}. The ones we hold are ` +
               `${RESIDENCES.map((x) => x.code).join(', ')}.`;
      }
      hooks?.onResult({ ranked: [r], primary: r });
      return describe(r);
    },

    compare_residences: ({ code_a, code_b }) => {
      const a = byCode(String(code_a ?? '').toUpperCase());
      const b = byCode(String(code_b ?? '').toUpperCase());
      if (!a || !b) return 'I need two residence codes to compare, for example 41A and 44B.';
      hooks?.onResult({ ranked: [a, b], primary: a });
      return compare(a.code, b.code);
    },

    schedule_viewing: ({ code }) => {
      const r = byCode(String(code ?? '').toUpperCase());
      document.dispatchEvent(new CustomEvent('meridian:schedule-viewing', {
        detail: { code: r?.code },
      }));
      return r
        ? `The enquiry form is open on screen, pre-filled for ${r.code}. Ask them to add a name and email.`
        : 'The enquiry form is open on screen. Ask them to add a name and email.';
    },

    list_residences: () => RESIDENCES.map(describe).join(' | '),
  };

  /* ── Session callbacks → the overlay's four states ─────────────── */
  const callbacks = {
    onStatusChange: ({ status }) => {
      if (status === 'connecting') hooks?.onStatus('connecting');
      if (status === 'disconnected') hooks?.onStatus('idle');
    },
    onModeChange: ({ mode }) => {
      hooks?.onStatus(mode === 'speaking' ? 'speaking' : 'listening');
    },
    onMessage: ({ message, role, source }) => {
      const who = (role ?? source) === 'user' ? 'visitor' : 'meridian';
      if (who === 'visitor' && message === lastSent) { lastSent = null; return; }
      hooks?.onTranscript({ role: who, text: message });
    },
    onError: (message) => {
      hooks?.onError?.(typeof message === 'string' ? message : 'Something went wrong on the line.');
    },
    onDisconnect: (details) => {
      conversation = null;
      hooks?.onStatus('idle');
      if (details?.reason === 'error') hooks?.onError?.(details.message);
    },
  };

  function micWasDenied(err) {
    return err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
  }

  return {
    async start(h) {
      hooks = h;
      degraded = false;
      micMuted = false;

      if (!agentId) {
        degraded = true;
        hooks.onError?.('Voice is not configured yet — type and I’ll still answer.');
        return;
      }

      try {
        hooks.onStatus('connecting');
        // Ask before connecting, so a blocked mic fails here and not mid-call.
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const { Conversation } = await import(/* @vite-ignore */ sdkUrl);
        conversation = await Conversation.startSession({
          agentId,
          connectionType: 'webrtc',
          ...callbacks,
          clientTools,
        });
      } catch (err) {
        degraded = true;
        conversation = null;
        hooks.onStatus('idle');
        hooks.onError?.(micWasDenied(err)
          ? 'I can’t hear you — microphone access is blocked. Type instead and I’ll still answer.'
          : 'I couldn’t reach the voice line. Type instead and I’ll still answer.');
      }
    },

    async submit(text, h) {
      hooks = h;

      if (conversation && !degraded) {
        lastSent = text;
        hooks.onTranscript({ role: 'visitor', text });
        conversation.sendUserMessage(text);
        return;
      }

      // No live session: the local advisor answers, as it does in the demo.
      hooks.onTranscript({ role: 'visitor', text });
      hooks.onStatus('thinking');
      await wait(700);
      const result = recommend(text);
      hooks.onStatus('speaking');
      hooks.onTranscript({ role: 'meridian', text: result.reply });
      hooks.onResult(result);
    },

    /* The mic button mutes a live call rather than faking a listening state. */
    toggleMic() {
      if (!conversation) return null;
      micMuted = !micMuted;
      conversation.setMicMuted(micMuted);
      return micMuted ? 'muted' : 'listening';
    },

    async stop() {
      lastSent = null;
      const session = conversation;
      conversation = null;
      await session?.endSession();
    },

    /* Exposed so the tool wiring can be checked from the console against the
       agent's tool definitions:  Meridian.driver.clientTools.show_residence({ code: '44B' }) */
    clientTools,
  };
}
