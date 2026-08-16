# Meridian — scroll-scrubbed real estate stage

A static site whose opening plays a video **frame by frame as you scroll**. The camera
starts in the kitchen, moves through the glass and out over the balcony, then descends
between the towers to street level — and the page's own content arrives on top of it
partway down, holding still while the descent continues behind it.

Source: `Camera_shot_of_luxury_apartment_202608151106.mp4`, trimmed at frame 157.
The video climbs back out over the harbour after that; those frames are deliberately
unused. To include them, re-run `make-frames.sh` without a trim.

Below it: a 3D unfurling gallery, four listings, and a dark editorial run down to
the footer.

Built as plain HTML/CSS/JS — no build step, no dependencies. Drop it on any static
host (Vercel, Netlify, S3, a folder).

**Not a React project.** The gallery was specced as a shadcn/framer-motion component;
it is implemented here as CSS transforms driven by the same scroll observer as the
stage. Moving to Next.js + Tailwind would mean rebuilding the frame-scrub stage, so
it was kept vanilla. See "Gallery" below.

## Run it

```bash
python3 -m http.server 4321
# open http://localhost:4321
```

It must be served over HTTP, not opened as a `file://` path.

## How the stage works

The video is decoded ahead of time into 157 WebP stills. Everything hangs off one tall
scroll container, `.stage`. Inside it, two layers stay pinned for the container's whole
height:

1. `.stage__sticky` — the canvas, drawing the frame that matches scroll progress.
2. `.band--over` — "The building", pinned over the top of it. Its `margin-top: -100vh`
   cancels its own height, so it adds no scroll of its own; it just holds still on the
   same screen while the camera keeps descending behind it.

```
progress  = -stage.getBoundingClientRect().top / (stage.offsetHeight - innerHeight)
frame     = round(progress * (FRAME_COUNT - 1))
```

Frames beat `<video>` + `currentTime` here — browsers only seek reliably to keyframes,
so scrubbing a video judders. Stills are exact.

Details worth knowing:

- **Beats.** `BEAT_RANGES` in [main.js](main.js) maps slices of scroll progress to the
  three overlays. The *gaps between ranges are the cross-fades* — keep them near 0.02
  or the screen goes bare between beats.
- **Two-phase loading.** Every 8th frame loads first so scrubbing works almost
  immediately, then the rest fill in. Until a frame arrives, the nearest loaded one is
  drawn, so there are never gaps — just a briefly coarser sequence.
- **Contrast overlay.** `.stage__scrim` sits between the canvas and the copy: a flat
  tint, a vignette, and top/bottom gradients. `.band--over` carries its own wash on top
  of that. Deepen the tint there if new footage is brighter.
- **Poster fallback.** `images/poster.webp` shows until the canvas is ready.
- **Reduced motion.** With `prefers-reduced-motion`, the scrub is skipped entirely: the
  stage collapses to one still screen and "The building" reverts to a normal section on
  paper below it.
- **Scroll distance** is the `.stage` height in `styles.css` (445vh desktop, 380vh
  mobile). Keep it proportional to `FRAME_COUNT` — roughly 2.2vh of scroll per frame —
  or the scrub pace changes.

## Spacing & the hero hand-off

Every section below the hero shares one vertical rhythm: `.band { padding-block:
clamp(6rem, 13vw, var(--sp-9)) }`. Change that one line and the whole page moves
together — don't add one-off padding to individual sections.

The stage ends with `.stage__fade`, a 26vh gradient from transparent to `--ink` pinned
to the bottom of the sticky layer. Without it the last frame met the black page on a
hard horizon. It sits at `z-index: 3` — above the canvas and scrim, below the copy.

## Fan carousel & residence slider

Both were specced as React components (GSAP fan carousel, Tailwind image-expansion
slider). Both are implemented here in vanilla JS + CSS against the existing tokens.

**Fan carousel** (`#gallery`). Eight plates, seven visible slots, the rest parked
off-stage. The slot table — rotation, scale, x/y offset, z-index — is the same
geometry as the reference; the difference is that JS only ever writes a `transform`
string and the easing lives in a CSS transition, so there is no animation library.

- **Click any plate to bring it to the front.** Plates are focusable (`role="button"`,
  Enter/Space), and `go()` picks the shortest way round the ring.
- **Edges cross-fade, they do not fly.** A leaving plate fades out where it stands and
  an arriving one fades up at its destination — both use `.fan__card--instant`
  (transition suppressed) plus a forced reflow to set the start state without animating
  into it.
- Each slot carries its own `dim` — a black wash painted by `.fan__card::after` —
  rising from 0 at centre to 0.62 at the edges, so plates get **darker** outward.
  Opacity stays high (0.9+) so the cards keep their edges instead of going
  translucent. `.fan::after` then sinks the whole stack into the page left and right.
- Plates are wide interiors in a portrait card, so only the horizontal crop is ever in
  play. Each entry in `PLATES` carries a **focal-x** as its third value — that is what
  keeps the subject in frame, not the aspect ratio.
- Hovering lifts a card and pushes its neighbours apart. **The reference's 8rem push
  tears this fan in two** — our cards are narrower relative to their spread, so it is
  dialled to 3rem. Retune this if you change card width or the x offsets.
- Below 1024px a spread multiplier shrinks the x offsets; outer cards are clipped by
  the section's `overflow: hidden`, which is intentional.
- Plate width and the slot x-offsets move together. Widen the cards without pulling the
  offsets in and the fan spreads instead of stacking.
- Outer plates are ~20% pointer-reachable — the rest is under their neighbours, which is
  what a tight fan should do. Their exposed edge is the hit area.
- A rotated plate's bounding box is taller than the plate. `.fan`'s height has to allow
  for that or `overflow: hidden` shaves the outer corners, and `.fan__layout` is lifted
  2.5rem because the slots fan downward — without it the stack sits low in its box.

**Residence slider** (`#residences`). Tabs filter by status, the track is CSS
scroll-snap, dots and arrows drive `scrollTo`, and a scroll listener keeps the dots
honest when the track is swiped instead of clicked. Clicking a card opens a lightbox
with arrow-key and Escape support, and focus returns to the card on close.

One deliberate omission: the reference slider carried a light/dark toggle. This site
is committed to dark, so it was dropped rather than shipped as a control that fights
the design.

## Imagery

The four listing plates were generated with Higgsfield (`recraft_v4_1`, 4:3, 2k) and
converted to WebP — living room, kitchen, bedroom, terrace, each written to match the
video's warm sunset palette (walnut, dark oak, oatmeal linen, burnt orange, amber
sunset over a harbour skyline). Reuse that description and the same model if you add
a fifth, or the set stops looking like one building.

| File | Room |
|---|---|
| `images/listing-living.webp` | Living room, harbour outlook |
| `images/listing-kitchen.webp` | Walnut kitchen and island |
| `images/listing-bedroom.webp` | Primary bedroom at twilight |
| `images/listing-terrace.webp` | Private terrace, fire bowl |

The rest (`interior`, `terrace`, `skyline`, `aerial`, `poster`) are stills pulled from
the source video by `make-frames.sh`.

## Swapping in a different video

```bash
./make-frames.sh /path/to/your-video.mp4 157   # 157 = last frame to keep, optional
```

Then set `FRAME_COUNT` in [main.js](main.js) to the count it prints, and scale the
`.stage` height to match. Re-time the overlays with `BEAT_RANGES`:

| Scroll | Shot | Overlay |
|---|---|---|
| 0–17% | Kitchen island → dining room | *Homes with a view of everything.* |
| 21–34% | Through the glass, out past the balcony | *Come see it at golden hour.* + CTAs |
| 36–100% | Descending between the towers to the street | **The building** — copy and stats, held |

Current sequence: 157 frames, 1280px wide, ~8.3 MB total.

## Meridian AI

Two experiences, built into the page rather than bolted on: no floating bubble, no
sparkles, no gradients. Both read from one inventory, `js/residences.js`.

### Talk to Meridian (`js/voice.js`)

A full-screen voice interface, opened from the nav and from its own section. States
run idle → listening → thinking → speaking, with a mic control, an eight-bar waveform
that only animates while listening, understated example lines, and a typed fallback
for anyone who would rather not speak.

A recommendation renders as a residence card with **View residence · Compare · Keep
talking · Schedule a viewing**.

**Public API, per the brief:**

```js
window.Meridian.voice.startVoiceConversation()
window.Meridian.voice.endVoiceConversation()
window.Meridian.voice.voiceStatus              // idle | listening | thinking | speaking
window.Meridian.voice.conversationTranscript   // [{ role, text, at }]
window.Meridian.voice.currentRecommendedProperty
window.Meridian.voice.propertyRecommendations
```

### ElevenLabs (`js/drivers/elevenlabs.js`)

The voice is a live [ElevenLabs Agents](https://elevenlabs.io/docs/agents-platform)
call. The module owns the UI and the states; the driver owns the transport, so the
overlay — mic, waveform, transcript, residence card — is the same either way.

**Going live takes one line.** Paste a public agent id into `index.html`:

```html
<meta name="meridian:agent-id" content="agent_…">
```

Empty means the scripted demo runs instead, so the site is never broken while the
agent is being set up. The SDK (`@elevenlabs/client`, loaded from esm.sh) is only
fetched once there is an id to use — no build step, no dependencies to install.

**Agent setup**

1. Create the agent at elevenlabs.io → Agents.
2. Set it **public** (Agent → Security → authentication off) and add your domain to
   the allowlist. A public agent id is safe in the browser; an API key never is.
3. Add these client tools, with exactly these names and parameters:

   | Tool | Parameters | What it does |
   |---|---|---|
   | `recommend_residence` | `brief` | Ranks the inventory locally, renders the card |
   | `show_residence` | `code` | Renders one residence, rejects unknown codes |
   | `compare_residences` | `code_a`, `code_b` | Two-up comparison |
   | `schedule_viewing` | `code` | Opens the enquiry form, pre-filled |
   | `list_residences` | — | The whole inventory as one line |

The handlers run against `js/residences.js` and return a spoken-length summary, so
the agent talks about real residences and cannot invent one. Check the wiring from
the console: `Meridian.driver.clientTools.show_residence({ code: '44B' })`.

**Behaviour**

- Microphone permission is requested before connecting, so a blocked mic fails
  cleanly instead of mid-call.
- The mic button mutes and unmutes a live call.
- If the mic is blocked or the line can't be reached, the overlay says so on the
  status line and typed questions keep working through the local advisor.

**Any other transport** can take over the same way:

```js
window.Meridian.voice.setDriver({
  async start({ onStatus, onTranscript, onResult, onError }) { /* open the call */ },
  async submit(text, hooks) { /* typed input */ },
  toggleMic() { /* optional; return the new status */ },
  async stop() { /* end the call */ },
});
```

### Ask this residence (`js/residence-chat.js`)

A right-side panel on desktop, a bottom sheet on mobile, opened from a button on each
listing. It is always bound to one residence — the header shows which — and answers
only from that record plus the rest of the inventory. Suggested questions are generated
per residence, so 47C offers a comparison against its nearest neighbour by floor.

### Conversion

Never pushed. **See it in person** surfaces only after two useful exchanges or an
explicit ask, then hands off to the enquiry form with the residence pre-filled.

### Replacing the mock

`js/advisor.js` is a deterministic stand-in so the interaction could be designed before
a model was connected. Swap `recommend`, `compare` and `ask` for server calls and keep
the return shapes — `{ reply, ranked, primary }` and `{ reply, offerViewing }`. Pass the
residence code as context so the model cannot wander outside the building.

Tone rules are documented at the top of that file and apply to any replacement: calm,
concise, knowledgeable, never salesy. No exclamation marks, no "Great choice", no "How
may I assist you", no "As an AI".

## Files

| | |
|---|---|
| [index.html](index.html) | Markup — the stage and its overlays, listings, split feature, enquiry form |
| [styles.css](styles.css) | Design tokens and all layout |
| [main.js](main.js) | Frame loader, canvas scrubber, beat timing, reveals, form |
| [make-frames.sh](make-frames.sh) | Rebuild `frames/` from a video |
| `frames/` | The 157-frame sequence |
| `images/listing-*.webp` | Higgsfield-generated listing plates |
| [js/residences.js](js/residences.js) | The inventory both AI experiences read from |
| [js/advisor.js](js/advisor.js) | Matching, comparison, response composition (mock) |
| [js/voice.js](js/voice.js) | Talk to Meridian — states, overlay UI, driver interface |
| [js/drivers/elevenlabs.js](js/drivers/elevenlabs.js) | ElevenLabs Agents driver + the client tools it exposes |
| [js/residence-chat.js](js/residence-chat.js) | Ask this residence panel |
| [js/meridian-ai.js](js/meridian-ai.js) | Entry point; wires the viewing hand-off |
| `images/` | Poster plus the stills used in cards and the split section |

## Before it goes live

- `<meta name="meridian:agent-id">` is empty — Talk to Meridian runs the scripted
  demo until a public ElevenLabs agent id is pasted in.
- The enquiry form is front-end only — it validates and shows a confirmation but
  sends nothing. Point it at Formspree, a Vercel function, or your CRM.
- Copy, prices, and residence details are placeholders.
- Fonts (Fraunces + Inter) load from Google Fonts; self-host them if you want the
  site fully self-contained.
