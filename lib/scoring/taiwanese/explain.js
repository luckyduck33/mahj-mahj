/**
 * Plain-English / Chinese explanations of a scored Taiwanese hand.
 */

import { DEFAULT_RULES } from './rules.js';

export function explain(result, rules = DEFAULT_RULES) {
  if (!result.valid) {
    return {
      headline: 'Not a valid winning hand',
      lines: result.errors || ['This hand cannot be scored.'],
      breakdown: [],
      payout: null,
    };
  }

  const headline = result.handTitle;
  const breakdown = result.matches.map(m => ({
    name: m.name,
    faan: m.tai,
    description: m.description,
    isLimit: !!m.isLimit,
  }));

  const lines = [];
  if (result.isLimit) {
    lines.push(`${headline} — a limit hand worth the maximum ${result.faan} tai.`);
  } else if (result.faan === 0) {
    lines.push(`A chicken hand: a valid win, but no scoring patterns triggered.`);
  } else {
    lines.push(`${result.faan} tai — ${result.summary}.`);
  }

  const payout = describePayout(result, rules);
  if (payout) lines.push(payout.text);

  return { headline, lines, breakdown, payout };
}

function describePayout(result, rules) {
  const tai = result.faan;
  const base = result.base;
  // In Taiwanese mahjong, the typical payout = base_unit × 2^tai (capped).
  // We report the multiplier; the table's base value (e.g. NT$10 or chips) is
  // a per-group convention we don't try to encode here.
  if (!base) return null;
  const selfDrawn = result.hand?.win?.selfDrawn;
  if (selfDrawn) {
    return {
      base,
      text: `Worth ${base}× the table's base unit. On a self-draw, all three losers pay the full amount.`,
      perLoser: base,
      totalToWinner: base * 3,
    };
  }
  return {
    base,
    text: `Worth ${base}× the table's base unit. The player who dealt the winning tile pays the full amount.`,
    perLoser: base,
    totalToWinner: base,
  };
}
