/**
 * American (NMJL) mahjong scoring.
 *
 * User provides the base point value from their NMJL card; engine validates
 * the tiles, identifies the hand category, applies multipliers, returns the
 * final paid value.
 *
 * Multipliers stack:
 *   - Self-drawn (mahjong off the wall): ×2
 *   - Jokerless: ×2
 *   - Both: ×4
 */

import { parseHand, HandParseError } from './hand-parser.js';
import { detectCategory } from './patterns.js';
import { DEFAULT_RULES } from './rules.js';

export function score(input, options = {}) {
  const rules = { ...DEFAULT_RULES, ...(options.rules || {}) };

  let hand;
  try {
    hand = parseHand(input, rules);
  } catch (err) {
    if (err instanceof HandParseError) return invalid([err.message]);
    throw err;
  }

  const category = detectCategory(hand);
  const matches = [];

  // Base value from card
  matches.push({
    id: 'cardValue',
    name: hand.patternName
      ? `${hand.patternName} (NMJL card)`
      : `NMJL hand value`,
    points: hand.userPoints,
    description: `Base point value from your NMJL card${hand.patternName ? ' for ' + hand.patternName : ''}.`,
  });

  let multiplier = 1;
  if (hand.win.selfDrawn) {
    multiplier *= rules.selfDrawMultiplier;
    matches.push({
      id: 'selfDrawn',
      name: 'Self-drawn',
      points: 0,
      description: `Mahjong off the wall — ×${rules.selfDrawMultiplier} multiplier.`,
      isMultiplier: true,
      multiplier: rules.selfDrawMultiplier,
    });
  }
  if (hand.jokerless) {
    multiplier *= rules.jokerlessMultiplier;
    matches.push({
      id: 'jokerless',
      name: 'Jokerless',
      points: 0,
      description: `No jokers used — ×${rules.jokerlessMultiplier} multiplier.`,
      isMultiplier: true,
      multiplier: rules.jokerlessMultiplier,
    });
  }

  // Category recognition (informational only)
  matches.push({
    id: `category:${category.id}`,
    name: category.name,
    points: 0,
    description: category.description,
    informational: true,
  });

  // Warnings (joker placement issues) surface here
  for (const w of hand.warnings) {
    matches.push({
      id: 'warning',
      name: 'Joker rule warning',
      points: 0,
      description: w,
      warning: true,
    });
  }

  const finalPoints = hand.userPoints * multiplier;
  const summary = matches
    .filter(m => !m.informational && !m.warning)
    .map(m => m.name)
    .join(' · ');

  return {
    valid: true,
    hand,
    matches,
    // Uniform interface: `faan` carries the final score for American too.
    faan: finalPoints,
    faanRaw: hand.userPoints,
    isLimit: false, // NMJL doesn't have a "limit" the same way HK/Taiwanese do
    base: finalPoints, // For consistency: base == final for American
    multiplier,
    summary,
    handTitle: hand.patternName || category.name,
  };
}

function invalid(errors) {
  return {
    valid: false,
    hand: null,
    matches: [],
    faan: 0,
    faanRaw: 0,
    isLimit: false,
    base: 0,
    multiplier: 1,
    summary: '',
    handTitle: '',
    errors,
  };
}
