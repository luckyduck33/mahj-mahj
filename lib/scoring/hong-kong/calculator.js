/**
 * Hong Kong Mahjong faan calculator — top-level entry point.
 *
 * Usage:
 *   import { score } from './calculator.js';
 *   const result = score(handInput, { rules?, faanTable? });
 *
 * Result shape:
 *   {
 *     valid:        boolean,          // does the hand structurally form a win
 *     hand:         normalizedHand,
 *     matches:      [ {id,name,faan,description,isLimit?}, ... ],
 *     faanRaw:      number,           // sum of all matched faan (pre-cap)
 *     faan:         number,           // final faan (capped at rules.limit)
 *     isLimit:      boolean,          // hit the rules.limit ceiling
 *     base:         number,           // HK base units after faan→base table
 *     summary:      string,           // headline title (e.g. "Pure One Suit, All Pongs")
 *     handTitle:    string,           // a single named title for the scorecard
 *     errors?:      [string],         // present if !valid
 *   }
 */

import { parseHand, HandParseError } from './hand-parser.js';
import { detectAll } from './patterns.js';
import { DEFAULT_RULES, DEFAULT_FAAN, faanToBase } from './rules.js';

export function score(input, options = {}) {
  const rules = { ...DEFAULT_RULES, ...(options.rules || {}) };
  const faanTable = { ...DEFAULT_FAAN, ...(options.faanTable || {}) };

  let hand;
  try {
    hand = parseHand(input);
  } catch (err) {
    if (err instanceof HandParseError) {
      return invalid([err.message]);
    }
    throw err;
  }

  const matches = detectAll(hand, rules, faanTable);
  const faanRaw = matches.reduce((sum, m) => sum + (m.faan || 0), 0);
  const hitLimitPattern = matches.some(m => m.isLimit);
  const limit = rules.limit;
  const faan = hitLimitPattern ? limit : Math.min(faanRaw, limit);
  const isLimit = hitLimitPattern || faanRaw >= limit;
  const base = faanToBase(faan, rules);

  // Chicken hand: no scoring patterns at all (still valid as long as minimumFaan=0)
  if (matches.length === 0 && faan === 0) {
    matches.push({
      id: 'chickenHand',
      name: 'Chicken Hand',
      faan: faanTable.chickenHand,
      description: 'A valid win with no scoring patterns.',
    });
  }

  if (faan < rules.minimumFaan) {
    return {
      valid: false,
      hand,
      matches,
      faanRaw,
      faan,
      isLimit,
      base: 0,
      summary: '',
      handTitle: '',
      errors: [`Hand worth ${faan} faan, below the ${rules.minimumFaan}-faan minimum to win.`],
    };
  }

  const summary = buildSummary(matches);
  const handTitle = pickHandTitle(matches, faan, isLimit);

  return {
    valid: true,
    hand,
    matches,
    faanRaw,
    faan,
    isLimit,
    base,
    summary,
    handTitle,
  };
}

function invalid(errors) {
  return {
    valid: false,
    hand: null,
    matches: [],
    faanRaw: 0,
    faan: 0,
    isLimit: false,
    base: 0,
    summary: '',
    handTitle: '',
    errors,
  };
}

function buildSummary(matches) {
  // Use up to the top 3 highest-faan matches for the summary headline.
  const sorted = [...matches].sort((a, b) => b.faan - a.faan).slice(0, 3);
  return sorted.map(m => m.name).join(' · ');
}

function pickHandTitle(matches, faan, isLimit) {
  if (isLimit) {
    const limitMatch = matches.find(m => m.isLimit);
    if (limitMatch) return limitMatch.name;
    return 'Limit Hand';
  }
  // Pick the highest-faan named match, falling back to "Chicken Hand"
  const sorted = [...matches].sort((a, b) => b.faan - a.faan);
  return sorted[0]?.name || 'Chicken Hand';
}
