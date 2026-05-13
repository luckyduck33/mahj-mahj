/**
 * Tile primitives and predicates for MAHJ MAHJ scoring engines.
 *
 * Tile string format (always 2 chars):
 *   Numbered suits:  '1m'..'9m' (characters / man / wan)
 *                    '1p'..'9p' (dots / pin / tong)
 *                    '1s'..'9s' (bamboo / sou / suo)
 *   Winds:           'wE','wS','wW','wN'
 *   Dragons:         'dR' (red / zhong), 'dG' (green / fa), 'dW' (white / bai)
 *   Flowers:         'fE','fS','fW','fN'   (paired to seat E,S,W,N)
 *   Seasons:         'zE','zS','zW','zN'   (paired to seat E,S,W,N)
 *
 * Set object format:
 *   { type: 'pong'|'chow'|'kong'|'pair', tiles: [...], exposed: bool, addedKong?: bool }
 *
 * Hand input format (calculator entry point):
 *   {
 *     sets:    [ ...4 sets in non-pair case ],
 *     pair:    { type:'pair', tiles:[t,t] },
 *     flowers: [ 'fE', 'zE', ... ],          // bonus tiles set aside
 *     win: {
 *       winningTile:     '5m',                // the tile that completed the hand
 *       selfDrawn:       false,
 *       seatWind:        'E'|'S'|'W'|'N',
 *       prevailingWind:  'E'|'S'|'W'|'N',
 *       robbingKong:     false,
 *       lastTile:        false,
 *       winOnKongDraw:   false,
 *     },
 *     // OPTIONAL special-hand inputs (Seven Pairs / Thirteen Orphans):
 *     special?: { kind: 'sevenPairs'|'thirteenOrphans', tiles: [...] }
 *   }
 */

export const SUITS = Object.freeze({ MAN: 'm', PIN: 'p', SOU: 's' });
export const SUIT_LETTERS = Object.freeze(['m', 'p', 's']);
export const WINDS = Object.freeze(['wE', 'wS', 'wW', 'wN']);
export const DRAGONS = Object.freeze(['dR', 'dG', 'dW']);
export const HONORS = Object.freeze([...WINDS, ...DRAGONS]);
export const TERMINALS = Object.freeze([
  '1m', '9m', '1p', '9p', '1s', '9s',
]);
export const TERMINALS_AND_HONORS = Object.freeze([...TERMINALS, ...HONORS]);
export const FLOWERS = Object.freeze(['fE', 'fS', 'fW', 'fN']);
export const SEASONS = Object.freeze(['zE', 'zS', 'zW', 'zN']);
export const BONUSES = Object.freeze([...FLOWERS, ...SEASONS]);

/**
 * Joker tile — only used in American mahjong. Substitutes for tiles in pongs
 * and kongs (never pairs or singles). Not allowed in Hong Kong or Taiwanese.
 * Single 2-char code: 'jk'.
 */
export const JOKER = 'jk';
export function isJoker(t) { return t === JOKER; }

export const SEAT_INDEX = Object.freeze({ E: 0, S: 1, W: 2, N: 3 });
export const SEAT_LETTERS = Object.freeze(['E', 'S', 'W', 'N']);

const NUMBERED_SUIT_RE = /^[1-9][mps]$/;

export function isNumbered(t) {
  return typeof t === 'string' && NUMBERED_SUIT_RE.test(t);
}
export function isHonor(t) {
  return HONORS.includes(t);
}
export function isWind(t) {
  return WINDS.includes(t);
}
export function isDragon(t) {
  return DRAGONS.includes(t);
}
export function isFlower(t) {
  return FLOWERS.includes(t);
}
export function isSeason(t) {
  return SEASONS.includes(t);
}
export function isBonus(t) {
  return isFlower(t) || isSeason(t);
}
export function isTerminal(t) {
  return TERMINALS.includes(t);
}
export function isTerminalOrHonor(t) {
  return isTerminal(t) || isHonor(t);
}
export function isSimple(t) {
  // 2-8 in a numbered suit
  return isNumbered(t) && t[0] !== '1' && t[0] !== '9';
}

export function suitOf(t) {
  if (!isNumbered(t)) return null;
  return t[1]; // 'm' | 'p' | 's'
}
export function valueOf(t) {
  if (!isNumbered(t)) return null;
  return Number(t[0]);
}
export function windOf(t) {
  if (!isWind(t)) return null;
  return t[1]; // 'E' | 'S' | 'W' | 'N'
}
export function dragonOf(t) {
  if (!isDragon(t)) return null;
  return t[1]; // 'R' | 'G' | 'W'
}

/**
 * Returns the seat that "owns" a bonus tile (Flower or Season).
 * Flowers and Seasons are conventionally numbered 1=East, 2=South, 3=West, 4=North.
 * In our notation we encode the seat letter directly: 'fE' = East flower, 'zN' = North season.
 */
export function bonusSeat(t) {
  if (!isFlower(t) && !isSeason(t)) return null;
  return t[1]; // 'E'|'S'|'W'|'N'
}

/**
 * All 34 unique non-bonus tile types.
 */
export function allUniqueTileTypes() {
  const out = [];
  for (const s of SUIT_LETTERS) {
    for (let n = 1; n <= 9; n++) out.push(`${n}${s}`);
  }
  for (const w of WINDS) out.push(w);
  for (const d of DRAGONS) out.push(d);
  return out;
}

/**
 * Stable tile comparator: groups by kind, then by value, then by suit/wind/dragon letter.
 * Order: man → pin → sou → winds (E,S,W,N) → dragons (R,G,W) → flowers → seasons.
 */
const KIND_ORDER = ['m', 'p', 's', 'w', 'd', 'f', 'z'];
const SECOND_ORDER = {
  w: ['E', 'S', 'W', 'N'],
  d: ['R', 'G', 'W'],
  f: ['E', 'S', 'W', 'N'],
  z: ['E', 'S', 'W', 'N'],
};
export function tileCompare(a, b) {
  // Determine "kind" for each tile.
  const ka = isNumbered(a) ? a[1] : a[0];
  const kb = isNumbered(b) ? b[1] : b[0];
  const ki = KIND_ORDER.indexOf(ka);
  const kj = KIND_ORDER.indexOf(kb);
  if (ki !== kj) return ki - kj;
  if (isNumbered(a)) return valueOf(a) - valueOf(b);
  // Honor/bonus: rank by second-char order
  const order = SECOND_ORDER[ka] || [];
  return order.indexOf(a[1]) - order.indexOf(b[1]);
}

export function sortTiles(tiles) {
  return [...tiles].sort(tileCompare);
}

/**
 * Count tiles by type. Returns a plain object: { '1m': 2, 'dR': 3, ... }.
 */
export function countTiles(tiles) {
  const counts = Object.create(null);
  for (const t of tiles) counts[t] = (counts[t] || 0) + 1;
  return counts;
}
