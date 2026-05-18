/**
 * Generate plain-English explanations of a scored hand.
 *
 * The bulk of human-readable text already lives on each match's `description`.
 * This module composes higher-level narrative: opening line, set-by-set rundown,
 * and a closing payout sentence.
 */

import { faanToBase, DEFAULT_RULES } from './rules.js';

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
    faan: m.faan,
    description: m.description,
    isLimit: !!m.isLimit,
  }));

  const lines = [];
  if (result.isLimit) {
    lines.push(`${headline} — a limit hand worth the maximum ${result.faan} faan.`);
  } else if (result.faan === 0) {
    lines.push(`A chicken hand: a valid win, but no scoring patterns triggered.`);
  } else {
    lines.push(`${result.faan} faan — ${result.summary}.`);
  }

  const base = result.base;
  const payout = base ? describePayout(result, rules) : null;
  if (payout) lines.push(payout.text);

  return { headline, lines, breakdown, payout };
}

function describePayout(result, rules) {
  const base = result.base;
  const selfDrawn = result.hand?.win?.selfDrawn;
  // In HK, the loser pays the winner the full amount on a discard;
  // on a self-draw, all three opponents pay. We translate base units
  // to a relative payout description.
  if (selfDrawn) {
    return {
      base,
      text: `Worth ${base} base units. On a self-draw, each of the three losers pays the full amount.`,
      perLoser: base,
      totalToWinner: base * 3,
    };
  }
  return {
    base,
    text: `Worth ${base} base units. The player who dealt the winning tile pays the full amount.`,
    perLoser: base,
    totalToWinner: base,
  };
}
