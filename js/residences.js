/* Meridian — residence inventory.
 *
 * Single source of truth for both AI experiences. The voice advisor matches
 * against these records; the residence chat answers from them. Keep it in sync
 * with the slides in index.html (`data-residence` attributes point here).
 */

export const RESIDENCES = [
  {
    code: '41A',
    name: 'The Corner Living',
    floor: 41,
    aspect: 'West',
    beds: 3,
    baths: 3.5,
    sqft: 2140,
    price: 4250000,
    priceLabel: '$4,250,000',
    status: 'available',
    image: 'images/listing-living.webp',
    // Qualities the advisor reasons over. 0–3, deliberately coarse.
    light: 3,
    separation: 1,      // living / sleeping separation
    entertaining: 2,
    outlook: 'harbour and open water to the west',
    notes: 'The corner glazing gives it two exposures, so it holds light later than its floor suggests.',
  },
  {
    code: '44B',
    name: 'The Long Kitchen',
    floor: 44,
    aspect: 'South-west',
    beds: 3,
    baths: 3,
    sqft: 2410,
    price: 5100000,
    priceLabel: '$5,100,000',
    status: 'available',
    image: 'images/listing-kitchen.webp',
    light: 2,
    separation: 2,
    entertaining: 3,
    outlook: 'the harbour mouth, angled south',
    notes: 'Built around a single long kitchen and dining run — the most natural of the four for entertaining.',
  },
  {
    code: '47C',
    name: 'The Quiet Floor',
    floor: 47,
    aspect: 'West',
    beds: 3,
    baths: 3.5,
    sqft: 2620,
    price: 5900000,
    priceLabel: '$5,900,000',
    status: 'available',
    image: 'images/listing-bedroom.webp',
    light: 3,
    separation: 3,
    entertaining: 2,
    outlook: 'straight down the harbour, full western exposure',
    notes: 'The bedrooms sit off their own hall, so the living side can be busy without carrying.',
  },
  {
    code: '52',
    name: 'The Upper House',
    floor: 52,
    aspect: 'West and north',
    beds: 4,
    baths: 4.5,
    sqft: 3880,
    price: null,
    priceLabel: 'Price on request',
    status: 'appointment',
    image: 'images/listing-terrace.webp',
    light: 3,
    separation: 3,
    entertaining: 3,
    outlook: 'the full sweep of the harbour from the top of the building',
    notes: 'The only full floor, with a private terrace on the western corner.',
  },
];

export const byCode = (code) =>
  RESIDENCES.find((r) => r.code.toLowerCase() === String(code).toLowerCase());

/** "$5.9M" — for tight lines where the full figure is too heavy. */
export const shortPrice = (r) =>
  r.price ? `$${(r.price / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : 'on request';

export const sqftLabel = (r) => `${r.sqft.toLocaleString()} sq ft`;

/** 41 → "41st", 52 → "52nd". Floors get spoken aloud, so this has to be right. */
export const ordinal = (n) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};
