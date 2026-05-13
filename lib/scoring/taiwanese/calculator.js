/**
 * Taiwanese 16-tile mahjong scoring — top-level entry point.
 *
 * Usage:
 *   import { score } from './calculator.js';
 *   const result = score(handInput, { rules?, taiTable? });
 *
 * Same result shape as the Hong Kong engine, but `faan` here is `tai` count.
 * The router in lib/scoring/index.js exposes this as `score(input)` when
 * input.style === 'taiwanese'.
 */

import { parseHand, HandParseError } from './hand-parser.js';
import { detectAll } from './patterns.js';
import { DEFAULT_RULES, DEFAULT_TAI, taiToBase } from './rules.js';

export function score(input, options = {}) {
  const rules = { ...DEFAULT_RULES, ...(options.rules || {}) };
  const tai = { ...DEFAULT_TAI, ...(options.taiTable || {}) };

  let hand;
  try {
    hand = parseHand(input);
  } catch (err) {
    if (err instanceof HandParseError) return invalid([err.message]);
    throw err;
  }

  const matches = detectAll(hand, rules, tai);
  const tot = matches.reduce((s, m) => s + (m.tai || 0), 0);
  const hitLimitPattern = matches.some(m => m.isLimit);
  const limit = rules.limit;
  const finalTai = hitLimitPattern ? limit : Math.min(tot, limit);
  const isLimit = hitLimitPattern || tot >= limit;
  const base = taiToBase(finalTai, rules);

  if (matches.length === 0 && finalTai === 0) {
    matches.push({
      id: 'chickenHand',
      name: '雞胡 (Chicken Hand)',
      tai: tai.chickenHand,
      description: 'A valid win with no scoring patterns.',
    });
  }

  if (finalTai < rules.minimumTai) {
    return {
      valid: false,
      hand,
      matches,
      faanRaw: tot,
      faan: finalTai,
      isLimit,
      base: 0,
      summary: '',
      handTitle: '',
      errors: [`Hand worth ${finalTai} tai, below the ${rules.minimumTai}-tai minimum to win.`],
    };
  }

  const summary = buildSummary(matches);
  const handTitle = pickHandTitle(matches, finalTai, isLimit);

  return {
    valid: true,
    hand,
    matches,
    // 'faan' aliased to tai for uniform interface with HK engine
    faanRaw: tot,
    faan: finalTai,
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
  const sorted = [...matches].sort((a, b) => b.tai - a.tai).slice(0, 3);
  return sorted.map(m => m.name).join(' · ');
}

function pickHandTitle(matches, finalTai, isLimit) {
  if (isLimit) {
    const limitMatch = matches.find(m => m.isLimit);
    if (limitMatch) return limitMatch.name;
    return 'Limit Hand';
  }
  const sorted = [...matches].sort((a, b) => b.tai - a.tai);
  return sorted[0]?.name || '雞胡 (Chicken Hand)';
}
