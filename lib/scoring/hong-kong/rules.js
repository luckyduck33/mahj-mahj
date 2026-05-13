/**
 * Hong Kong Mahjong scoring rules — faan values and rule-variant toggles.
 *
 * Default config follows common tournament-style "Hong Kong Old Style"
 * (the most widely played HK variant). Individual house rules vary; toggle
 * `rules.*` flags or override faan values on a per-game basis.
 *
 * Sources cross-checked: HKMJ tournament rule cards (HKMJTA), Hong Kong Old
 * Style references, and the standard 13-tile HK game most US/AU clubs play.
 */

export const DEFAULT_FAAN = Object.freeze({
  // Core hand shapes
  chickenHand: 0,         // valid win, no scoring pattern (also: "no points hand")
  allChows: 1,            // all 4 sets are chows, pair is non-yakuhai
  allPongs: 3,            // all 4 sets are pongs/kongs
  mixedOneSuit: 3,        // one numbered suit + honors only
  pureOneSuit: 7,         // one numbered suit only, no honors
  concealedHand: 1,       // no exposed sets (won by discard still ok)
  selfDrawn: 1,           // tsumo / self-draw win

  // Yakuhai (value-tile pongs)
  dragonPong: 1,          // PER dragon pong
  seatWindPong: 1,
  prevailingWindPong: 1,

  // Honor sets — small/big
  smallThreeDragons: 5,   // 2 dragon pongs + dragon pair
  bigThreeDragons: 'limit',
  smallFourWinds: 'limit',
  bigFourWinds: 'limit',

  // Special hands
  sevenPairs: 4,
  thirteenOrphans: 'limit',
  nineGates: 'limit',
  allHonors: 'limit',
  allTerminals: 'limit',

  // Win-context bonuses
  robbingKong: 1,
  lastTile: 1,            // win on last tile drawn from wall
  winOnKongDraw: 1,       // win on replacement tile after declaring a kong
});

export const DEFAULT_RULES = Object.freeze({
  /** Maximum faan count. Hands at or above this cap pay the limit. */
  limit: 10,
  /** Minimum faan required to win. HK old style usually allows 0 (chicken hand). */
  minimumFaan: 0,
  /** Enable Seven Pairs as a recognized hand. Some HK groups don't play this. */
  allowSevenPairs: true,
  /** Enable Thirteen Orphans (Kokushi) as a limit hand. */
  allowThirteenOrphans: true,
  /** Enable Nine Gates as a limit hand (only valid in pure one-suit hands). */
  allowNineGates: true,
  /** Whether dragon/wind pongs add on top of allPongs / allChows etc. */
  yakuhaiStacks: true,
  /** Each matching seat-flower/season scores 1 faan. */
  flowerFaan: 1,
  /** Bonus when a player holds all 4 flowers or all 4 seasons. */
  fullSetFlowerBonus: 2,
});

/**
 * HK doubling table for translating faan → base units.
 * Below the limit, each additional faan doubles the base. Above the limit,
 * payouts are capped. Real HK clubs vary their tables; this is a common one.
 *
 * Faan 0 → 1 base
 * Faan 1 → 2 base
 * Faan 2 → 4 base
 * ...
 * Faan 7+ → 64 base (commonly the "half-limit" plateau before limit)
 * Limit (10+) → 128 base
 */
export function faanToBase(faan, rules = DEFAULT_RULES) {
  if (faan >= rules.limit) return 128;
  if (faan <= 0) return 1;
  // Doubling: base = 2^faan. Cap at 64 below limit so 7,8,9 all pay 64.
  return Math.min(2 ** faan, 64);
}

/**
 * Resolve a faan value that might be 'limit' into a concrete number.
 */
export function resolveFaan(value, rules = DEFAULT_RULES) {
  return value === 'limit' ? rules.limit : value;
}
