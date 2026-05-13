/**
 * American hand-category recognizers.
 *
 * These do NOT reproduce specific NMJL card patterns (those are copyrighted).
 * They classify a hand by broad structural category for informational display.
 *
 * Returns the most specific matching category id, or 'mixed' if none fit.
 */

import { isNumbered, suitOf, isHonor, isWind, isDragon, isJoker, isBonus, countTiles } from '../types.js';
import { PATTERN_CATEGORIES } from './rules.js';

function nonJokers(tiles) {
  return tiles.filter(t => !isJoker(t));
}

export function detectCategory(parsed) {
  const tiles = nonJokers(parsed.tiles); // bonuses already stripped in parser
  if (tiles.length === 0) {
    return categoryById('mixed');
  }

  const counts = countTiles(tiles);
  const tileCounts = Object.values(counts);
  const maxCount = tileCounts.length ? Math.max(...tileCounts) : 0;

  // All Honors / Winds-Dragons: every non-joker tile is a wind or dragon
  // (checked first — most specific)
  if (tiles.every(t => isWind(t) || isDragon(t))) {
    return categoryById('winds-dragons');
  }

  // Flowers / Year: bonus-heavy hands
  if (parsed.bonuses.length >= 4) {
    return categoryById('flowers');
  }

  // All Same Suit: every numbered tile shares a single suit, no honors
  const numbered = tiles.filter(isNumbered);
  const honors = tiles.filter(isHonor);
  if (honors.length === 0 && numbered.length > 0) {
    const suits = new Set(numbered.map(suitOf));
    if (suits.size === 1) {
      return categoryById('all-same-suit');
    }
  }

  // Singles & Pairs: no triplets present (must come after All Same Suit so a
  // single-suit pairs hand classifies by suit first)
  if (maxCount <= 2 && parsed.jokerCount === 0) {
    return categoryById('singles-and-pairs');
  }

  // Quints: any tile appearing 5 times (after counting jokers as wildcards)
  if (maxCount + parsed.jokerCount >= 5 && parsed.jokerCount >= 1) {
    return categoryById('quints');
  }

  // Like Numbers: same numeric value across multiple suits
  if (numbered.length > 0) {
    const values = new Set(numbered.map(t => t[0]));
    if (values.size === 1) {
      return categoryById('like-numbers');
    }
  }

  // Consecutive Run: numbered tiles cover 3+ consecutive numbers
  if (numbered.length >= 6) {
    const nums = [...new Set(numbered.map(t => Number(t[0])))].sort((a, b) => a - b);
    let consec = 1;
    let maxConsec = 1;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1] + 1) { consec += 1; maxConsec = Math.max(maxConsec, consec); }
      else consec = 1;
    }
    if (maxConsec >= 4) return categoryById('consecutive-run');
  }

  return categoryById('mixed');
}

function categoryById(id) {
  return PATTERN_CATEGORIES.find(c => c.id === id) || PATTERN_CATEGORIES[PATTERN_CATEGORIES.length - 1];
}
