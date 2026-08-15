/* Meridian — advisor logic.
 *
 * A deterministic stand-in for the language model, so the whole interaction —
 * states, timing, recommendations, comparisons, the hand-off to a viewing —
 * can be designed and reviewed before any model is connected.
 *
 * Replace `recommend`, `compare` and `ask` with calls to a server-side
 * endpoint when the real backend lands. Keep the return shapes: the UI reads
 * `{ reply, ranked, primary }` and `{ reply, offerViewing }`.
 *
 * Tone rules these responses follow, and any replacement must too: composed,
 * concise, useful, never pushy. No exclamation marks, no "Great choice", no
 * "How may I assist you", no "As an AI".
 */

import { RESIDENCES, byCode, shortPrice, sqftLabel, ordinal } from './residences.js';

/* ── Reading the request ─────────────────────────────────────────── */

const has = (t, ...words) => words.some((w) => t.includes(w));

export function parseIntent(input) {
  const t = String(input).toLowerCase();

  // "$5 million", "5m", "around 5.5"
  let budget = null;
  const m = t.match(/\$?\s*(\d+(?:\.\d+)?)\s*(m\b|million)/);
  if (m) budget = parseFloat(m[1]) * 1_000_000;

  const bedsMatch = t.match(/(\d+|one|two|three|four)[\s-]*(bed|bedroom)/);
  const words = { one: 1, two: 2, three: 3, four: 4 };
  const beds = bedsMatch ? (words[bedsMatch[1]] ?? parseInt(bedsMatch[1], 10)) : null;

  const floorMatch = t.match(/(?:above|over|higher than)\s*(?:the\s*)?(\d{2})/);

  return {
    budget,
    beds,
    minFloor: floorMatch ? parseInt(floorMatch[1], 10) : null,
    sunset: has(t, 'sunset', 'evening light', 'west', 'golden hour', 'sunsets'),
    high: has(t, 'high up', 'high floor', 'higher floor', 'top', 'upper'),
    light: has(t, 'natural light', 'light', 'bright', 'sunny'),
    privacy: has(t, 'private', 'privacy', 'separate', 'separation', 'quiet'),
    entertaining: has(t, 'entertain', 'host', 'hosting', 'guests', 'dinner parties'),
    space: has(t, 'space', 'large', 'bigger', 'biggest', 'square', 'room to'),
    value: has(t, 'value', 'best price', 'cheaper', 'lower price', 'budget'),
    codes: (t.match(/\b(41a|44b|47c|52)\b/g) || []).map((c) => c.toUpperCase()),
  };
}

/* ── Ranking ─────────────────────────────────────────────────────── */

function score(r, i) {
  let s = 0;
  if (i.sunset) s += r.aspect.includes('West') ? 3 : 0;
  if (i.high) s += (r.floor - 40) / 4;
  if (i.minFloor) s += r.floor > i.minFloor ? 3 : -2;
  if (i.light) s += r.light;
  if (i.privacy) s += r.separation;
  if (i.entertaining) s += r.entertaining;
  if (i.space) s += (r.sqft - 2000) / 700;
  if (i.beds) s += r.beds === i.beds ? 2 : -1.5;
  if (i.value && r.price) s += (6_000_000 - r.price) / 800_000;
  if (i.budget && r.price) {
    const drift = Math.abs(r.price - i.budget) / i.budget;
    s += drift < 0.12 ? 3 : drift < 0.25 ? 1 : -2;
  }
  // Without a price, 52 shouldn't win a budget-led question by default.
  if ((i.budget || i.value) && !r.price) s -= 2;
  return s;
}

/** Why this one — phrased as an advisor would, not as a feature list. */
function reasons(r, i) {
  const out = [];
  if (i.sunset && r.aspect.includes('West')) out.push(`it's ${r.aspect.toLowerCase()}-facing`);
  if (i.minFloor && r.floor > i.minFloor) out.push(`it sits above the ${ordinal(i.minFloor)} floor`);
  else if (i.high) out.push(`it's on the ${ordinal(r.floor)}`);
  if (i.privacy && r.separation >= 3) out.push('it gives you the separation between living and private spaces you described');
  if (i.entertaining && r.entertaining >= 3) out.push("it's built around a single long kitchen and dining run");
  if (i.light && r.light >= 3 && !out.length) out.push('it holds light later than its floor suggests');
  if (i.space && r.sqft >= 2600) out.push(`you're getting ${sqftLabel(r)}`);
  if (i.budget && r.price) out.push(`it lands at ${shortPrice(r)}`);
  return out;
}

const sentence = (parts) =>
  parts.length <= 1 ? parts[0] || ''
    : parts.length === 2 ? `${parts[0]} and ${parts[1]}`
    : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;

/* ── The three things the UI asks for ────────────────────────────── */

export function recommend(input) {
  const i = parseIntent(input);

  if (i.codes.length >= 2) {
    return { reply: compare(i.codes[0], i.codes[1]), ranked: i.codes.map(byCode), primary: byCode(i.codes[0]) };
  }

  const ranked = [...RESIDENCES].sort((a, b) => score(b, i) - score(a, i));
  const [first, second] = ranked;
  const why = reasons(first, i);
  const close = Math.abs(score(first, i) - score(second, i)) < 1.6;

  let reply;
  if (why.length) {
    reply = `I'd start with Residence ${first.code}. ${sentence(why).replace(/^./, (c) => c.toUpperCase())}.`;
  } else {
    reply = `I'd look at ${first.code} first — ${first.notes.charAt(0).toLowerCase()}${first.notes.slice(1)}`;
  }
  if (close) {
    reply += ` ${second.code} is the other one worth your time; the difference comes down to ${
      first.floor !== second.floor ? 'floor height and exposure' : 'space and price'
    }.`;
  }

  return { reply, ranked, primary: first, followUp: 'Would you like to hear how it compares with another residence?' };
}

export function compare(codeA, codeB) {
  const a = byCode(codeA);
  const b = byCode(codeB);
  if (!a || !b) return "Tell me which two residences you have in mind and I'll set them side by side.";

  const higher = a.floor > b.floor ? a : b;
  const lower = higher === a ? b : a;
  const cheaper = a.price && b.price ? (a.price < b.price ? a : b) : (a.price ? a : b);
  const dearer = cheaper === a ? b : a;

  let reply = `${higher.code} gives you the higher floor`;
  reply += higher.aspect.includes('West') && !lower.aspect.includes('West')
    ? ' and stronger western exposure. '
    : ` and ${higher.outlook}. `;
  reply += cheaper.price
    ? `${cheaper.code} comes in at ${shortPrice(cheaper)} while still offering ${sqftLabel(cheaper)}. `
    : `${cheaper.code} is offered on request. `;
  reply += `If views are the priority, I'd lean toward ${higher.code}. If value matters more, ${
    cheaper === higher ? dearer.code : cheaper.code
  } deserves a closer look.`;

  return reply;
}

/* ── Ask this residence ──────────────────────────────────────────── */

export function ask(residence, question) {
  const r = residence;
  const t = String(question).toLowerCase();
  const i = parseIntent(question);

  const other = i.codes.find((c) => c !== r.code);
  if (other && byCode(other)) {
    return { reply: compare(r.code, other), offerViewing: false };
  }

  if (has(t, 'viewing', 'visit', 'see it', 'in person', 'schedule', 'appointment')) {
    return {
      reply: `I can arrange that. Viewings of ${r.code} are best late in the day, when the western light is at its strongest.`,
      offerViewing: true,
    };
  }

  if (has(t, 'special', 'different', 'stand out', 'why this')) {
    const edge = r.aspect.includes('West')
      ? `its ${r.aspect.toLowerCase()}-facing position and higher floor`
      : `its ${r.outlook}`;
    return {
      reply: `${r.code} stands out for ${edge}. If evening light and sunset views matter to you, this is one of the stronger options at Meridian.`,
      offerViewing: false,
    };
  }

  if (has(t, 'light', 'bright', 'sun')) {
    return {
      reply: `${r.notes} Through the afternoon it stays lit without needing much help; the glazing runs floor to ceiling on the ${r.aspect.toLowerCase()} side.`,
      offerViewing: false,
    };
  }

  if (has(t, 'space for the price', 'much space', 'value', 'worth', 'per square')) {
    const per = r.price ? Math.round(r.price / r.sqft) : null;
    return {
      reply: per
        ? `${sqftLabel(r)} at ${r.priceLabel} — about $${per.toLocaleString()} a square foot. Within the building that sits mid-range: you're paying for the floor and the exposure rather than the footprint.`
        : `${sqftLabel(r)} across a single full floor. Pricing is handled directly, so it's worth a conversation rather than a comparison on paper.`,
      offerViewing: false,
    };
  }

  if (has(t, 'price', 'cost', 'how much')) {
    return {
      reply: r.price
        ? `${r.priceLabel} for ${sqftLabel(r)}, ${r.beds} bedrooms and ${r.baths} baths on the ${ordinal(r.floor)}.`
        : `${r.code} is offered on request — it's the only full floor in the building, so it's priced case by case.`,
      offerViewing: false,
    };
  }

  if (has(t, 'view', 'outlook', 'sunset', 'harbour', 'harbor', 'water')) {
    return {
      reply: `From ${r.code} you're looking at ${r.outlook}. On the ${ordinal(r.floor)} there's nothing between you and it.`,
      offerViewing: false,
    };
  }

  if (has(t, 'layout', 'bedroom', 'privacy', 'private', 'plan', 'rooms')) {
    return {
      reply: r.separation >= 3
        ? `${r.beds} bedrooms, and they sit off their own hall — the living side can be busy without carrying through to them.`
        : `${r.beds} bedrooms and ${r.baths} baths across ${sqftLabel(r)}, with the living and dining opening into one another.`,
      offerViewing: false,
    };
  }

  if (has(t, 'floor', 'high')) {
    return { reply: `The ${ordinal(r.floor)}, ${r.aspect.toLowerCase()}-facing. ${r.notes}`, offerViewing: false };
  }

  return {
    reply: `${r.code} is ${sqftLabel(r)} on the ${ordinal(r.floor)}, ${r.aspect.toLowerCase()}-facing, at ${r.priceLabel}. ${r.notes} Ask me about the light, the layout, or how it sits against another residence.`,
    offerViewing: false,
  };
}

/** Suggested questions, varied by what actually distinguishes this residence. */
export function suggestionsFor(r) {
  const others = RESIDENCES.filter((x) => x.code !== r.code);
  const rival = others.find((x) => Math.abs(x.floor - r.floor) <= 4) || others[0];
  const out = [`How does this compare to ${rival.code}?`, 'What makes this residence different?'];
  if (r.light >= 3) out.push('Tell me about the natural light.');
  if (r.price) out.push('How much space am I getting for the price?');
  if (r.aspect.includes('West')) out.push('Which residence has the better sunset view?');
  return out.slice(0, 5);
}
