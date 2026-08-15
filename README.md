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

## Fan carousel & residence slider

Both were specced as React components (GSAP fan carousel, Tailwind image-expansion
slider). Both are implemented here in vanilla JS + CSS against the existing tokens.

**Fan carousel** (`#gallery`). Eight plates, seven visible slots, the rest parked
off-stage. The slot table — rotation, scale, x/y offset, z-index — is the same
geometry as the reference; the difference is that JS only ever writes a `transform`
string and the easing lives in a CSS transition, so there is no animation library.

- Entering cards are placed off-stage with `.fan__card--instant` (transition
  suppressed), flushed with a forced reflow, then released so the move animates.
- Hovering lifts a card and pushes its neighbours apart. **The reference's 8rem push
  tears this fan in two** — our cards are narrower relative to their spread, so it is
  dialled to 3rem. Retune this if you change card width or the x offsets.
- Below 1024px a spread multiplier shrinks the x offsets; outer cards are clipped by
  the section's `overflow: hidden`, which is intentional.

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

## Files

| | |
|---|---|
| [index.html](index.html) | Markup — the stage and its overlays, listings, split feature, enquiry form |
| [styles.css](styles.css) | Design tokens and all layout |
| [main.js](main.js) | Frame loader, canvas scrubber, beat timing, reveals, form |
| [make-frames.sh](make-frames.sh) | Rebuild `frames/` from a video |
| `frames/` | The 157-frame sequence |
| `images/listing-*.webp` | Higgsfield-generated listing plates |
| `images/` | Poster plus the stills used in cards and the split section |

## Before it goes live

- The enquiry form is front-end only — it validates and shows a confirmation but
  sends nothing. Point it at Formspree, a Vercel function, or your CRM.
- Copy, prices, and residence details are placeholders.
- Fonts (Fraunces + Inter) load from Google Fonts; self-host them if you want the
  site fully self-contained.
