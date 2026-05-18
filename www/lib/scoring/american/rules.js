/**
 * American (NMJL-style) Mahjong rules.
 *
 * American mahjong is structurally different from Hong Kong and Taiwanese:
 * the National Mah Jongg League (NMJL) publishes an annual card defining
 * ~50 hand patterns. To win, your 14 tiles must exactly match one of those
 * patterns. The card's specific patterns are copyrighted; this engine does
 * NOT include them.
 *
 * What this engine *does*:
 *   1. Validates structural rules common to all American mahjong:
 *        - 14-tile hand (standard) or 14 + 1 per kong
 *        - Jokers ('jk') allowed in groups of 3+ matching tiles only
 *        - No jokers in pairs or singles
 *   2. Identifies the broad category the user's hand falls into
 *      (Like Numbers, All Same Suit, etc.) — informational only.
 *   3. Applies the standard NMJL value modifiers:
 *        - Self-drawn (mahjong off the wall): ×2 multiplier
 *        - Jokerless: ×2 multiplier (and they stack for ×4)
 *   4. Accepts the point value the user reads off their card and returns
 *      it as the final score with multipliers applied.
 *
 * The user is the source of truth for the base point value — the engine's
 * job is to validate the tiles and compute the final-paid value.
 */

export const DEFAULT_RULES = Object.freeze({
  /** Standard hand size in tiles (NMJL standard is 14). */
  baseHandSize: 14,
  /** Allow jokers in the hand. NMJL standard: yes. Some "no-jokers" tournaments: no. */
  allowJokers: true,
  /** Self-draw value multiplier. NMJL standard: ×2. */
  selfDrawMultiplier: 2,
  /** Jokerless value multiplier. NMJL standard: ×2. */
  jokerlessMultiplier: 2,
});

/**
 * Generic pattern categories — these describe the *shape* of a hand
 * without reproducing any specific NMJL card pattern. Used for
 * informational recognition only; the user provides actual point value.
 */
export const PATTERN_CATEGORIES = Object.freeze([
  {
    id: 'all-same-suit',
    name: 'All Same Suit',
    description: 'Every tile is in a single number suit (no winds/dragons/flowers).',
  },
  {
    id: 'like-numbers',
    name: 'Like Numbers',
    description: 'The same number appearing across multiple suits.',
  },
  {
    id: 'consecutive-run',
    name: 'Consecutive Run',
    description: 'A run of sequential numbers, often crossing suits.',
  },
  {
    id: 'winds-dragons',
    name: 'Winds & Dragons',
    description: 'Honor-heavy hand built around winds and/or dragons.',
  },
  {
    id: 'singles-and-pairs',
    name: 'Singles & Pairs',
    description: 'Hand of only singles and pairs (no triplets) — typically no jokers allowed.',
  },
  {
    id: 'quints',
    name: 'Quints',
    description: 'Hand built around 5-of-a-kind groups (heavy joker use).',
  },
  {
    id: 'flowers',
    name: 'Flowers / Year',
    description: 'Year-pattern or flower-heavy hand from the current NMJL card.',
  },
  {
    id: 'mixed',
    name: 'Mixed / Other',
    description: 'A mixed-category NMJL hand. Refer to your card for specifics.',
  },
]);
