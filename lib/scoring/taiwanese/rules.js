/**
 * Taiwanese 16-tile Mahjong scoring rules — 台 (tai) values + rule config.
 *
 * Taiwanese rules vary significantly by region, table, and house. This
 * default targets the common "Northern Taiwan" tournament style, with
 * configurable knobs for the most common variants.
 *
 * Structural differences from Hong Kong:
 *   - 16 tiles in hand, winning hand = 17 tiles (5 sets of 3 + 1 pair).
 *   - Each kong adds 1 tile to the hand count (18, 19, ...).
 *   - Eight bonus tiles (4 flowers + 4 seasons), all matched by seat.
 *   - Scoring unit is 台 (tai), not faan.
 *   - Final point payout = base × 2^tai (capped at the limit).
 */

export const DEFAULT_TAI = Object.freeze({
  // Hand-shape patterns
  chickenHand: 0,            // valid win, no pattern (some rulesets disallow)
  pingHu: 2,                  // 平胡 — all chows + non-yakuhai pair
  allPongs: 4,                // 碰碰胡 (peng peng hu)
  mixedOneSuit: 4,            // 混一色
  pureOneSuit: 8,             // 清一色 — limit-tier
  allHonors: 'limit',         // 字一色
  allTerminals: 'limit',      // 清老頭
  mixedTerminalsHonors: 4,    // 混老頭

  // Concealment + draw context
  concealedHand: 1,           // 門清 — no exposed sets, won by discard
  concealedSelfDrawn: 3,      // 門清自摸 — replaces concealed + selfDrawn stacking
  selfDrawn: 1,               // 自摸
  allFromOthers: 1,           // 全求人 — all sets exposed, won by discard
  robbingKong: 1,             // 搶槓胡
  winOnKongDraw: 1,           // 槓上開花
  lastTileSelfDraw: 1,        // 海底撈月
  lastTileDiscard: 1,         // 河底撈魚

  // Yakuhai (value-tile pongs)
  dragonPong: 1,              // 三元牌 — per dragon pong
  seatWindPong: 1,            // 門風
  prevailingWindPong: 1,      // 圈風

  // Honor groups
  smallThreeDragons: 4,       // 小三元
  bigThreeDragons: 'limit',   // 大三元
  smallFourWinds: 'limit',    // 小四喜
  bigFourWinds: 'limit',      // 大四喜

  // Concealed-pongs achievements
  fiveConcealedPongs: 'limit',// 五暗刻

  // Special hands
  sevenPairs: 4,              // 七對子 (note: structurally rare in 16-tile; some rule sets disallow)
  heavenlyHand: 'limit',      // 天胡 — dealer wins on opening
  earthlyHand: 'limit',       // 地胡 — non-dealer wins on first draw

  // Flowers / seasons
  flowersPer: 1,              // 花 — per matching seat flower or season
  allFlowers: 'limit',        // 八仙過海 — all 8 bonus tiles
  sevenStealOne: 4,           // 七搶一 — 7 own flowers + stole 8th

  // Dealer
  dealer: 1,                  // 莊家
  consecutiveDealer: 2,       // 連N莊 — 2 tai per consecutive win (multiplied by count)
});

export const DEFAULT_RULES = Object.freeze({
  /** Hard cap for tai. Common values: 8 (standard), 16 (generous), 24 (very generous). */
  limit: 8,
  /** Minimum tai to declare a winning hand. Some groups require 0, others require 1. */
  minimumTai: 0,
  /** Enable Seven Pairs as a recognized hand. Some Taiwanese groups don't play this. */
  allowSevenPairs: true,
  /** Enable Five Concealed Pongs as a limit hand. */
  allowFiveConcealedPongs: true,
  /** Number of sets a standard hand requires (5 in 16-tile Taiwanese). */
  setCount: 5,
  /** Total tile count in a winning hand (17 base + kong count). */
  baseHandSize: 17,
});

/**
 * Tai → base-point multiplier. Taiwanese payouts use a doubling-with-cap model.
 * faanToBase here returns relative units; callers multiply by their group's base.
 */
export function taiToBase(tai, rules = DEFAULT_RULES) {
  if (tai <= 0) return 1;
  if (tai >= rules.limit) return 2 ** rules.limit;
  return 2 ** tai;
}

export function resolveTai(value, rules = DEFAULT_RULES) {
  return value === 'limit' ? rules.limit : value;
}
