/**
 * American (NMJL) hand parser.
 *
 * Validates structural rules common to all American mahjong, regardless of
 * the specific card pattern: tile count, joker placement, and basic shape.
 */

import {
  isNumbered, isHonor, isJoker, JOKER, isBonus, sortTiles, countTiles,
} from '../types.js';

export class HandParseError extends Error {}

const VALID_TILE_PREFIXES = ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
  '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
  '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
  'wE', 'wS', 'wW', 'wN', 'dR', 'dG', 'dW',
  'fE', 'fS', 'fW', 'fN', 'zE', 'zS', 'zW', 'zN',
  JOKER,
];
const VALID_TILE_SET = new Set(VALID_TILE_PREFIXES);

export function parseHand(input, rules) {
  if (!input) throw new HandParseError('Hand input required');
  const tiles = input.tiles || [];
  const groupings = input.groupings || []; // optional structural hints
  const win = normalizeWin(input.win || {});
  const userPoints = Number(input.userPoints);

  // Validate every tile is a recognized 2-char string.
  for (const t of tiles) {
    if (!VALID_TILE_SET.has(t)) {
      throw new HandParseError(`Unknown tile string: "${t}"`);
    }
  }

  // Validate tile count.
  // NMJL standard: 14 tiles. Each kong adds 1.
  const minHand = rules.baseHandSize;
  if (tiles.length < minHand) {
    throw new HandParseError(`Hand has ${tiles.length} tiles; needs at least ${minHand}.`);
  }
  if (tiles.length > minHand + 4) {
    throw new HandParseError(`Hand has ${tiles.length} tiles; too many for a standard NMJL hand.`);
  }

  // Joker checks. If user provided groupings, validate jokers only appear
  // in pong/kong/quint groups (size ≥ 3). If no groupings, do a softer check:
  // count jokers and flag if there are an unreasonable number (>8).
  const jokerCount = tiles.filter(isJoker).length;
  if (!rules.allowJokers && jokerCount > 0) {
    throw new HandParseError('Jokers are not allowed in this rule variant.');
  }
  if (jokerCount > 8) {
    throw new HandParseError(`Too many jokers (${jokerCount}); NMJL allows 8 in the game.`);
  }

  const jokerWarnings = [];
  if (groupings.length > 0) {
    for (const g of groupings) {
      const gTiles = g.tiles || [];
      const gJokers = gTiles.filter(isJoker).length;
      const gNonJokers = gTiles.length - gJokers;
      if (gJokers === 0) continue;
      if (gTiles.length < 3) {
        jokerWarnings.push(`Group "${describeGroup(g)}" has a joker but only ${gTiles.length} tiles. Jokers must be in groups of 3 or more.`);
      }
      // Pair group is 2 tiles → already caught above. Singles never have jokers.
      if (gNonJokers === 0 && gTiles.length > 0) {
        jokerWarnings.push(`Group "${describeGroup(g)}" is all jokers — at least one matching non-joker tile is required to identify the set.`);
      }
    }
  }

  if (!Number.isFinite(userPoints) || userPoints <= 0) {
    throw new HandParseError('userPoints (the value from your NMJL card) is required and must be > 0.');
  }

  return {
    kind: 'american',
    tiles: sortTiles(tiles.filter(t => !isBonus(t))),
    bonuses: tiles.filter(isBonus),
    groupings,
    jokerCount,
    jokerless: jokerCount === 0,
    userPoints,
    patternName: typeof input.patternName === 'string' ? input.patternName : '',
    win,
    warnings: jokerWarnings,
  };
}

function describeGroup(g) {
  const t = (g.tiles || []).join(',');
  return g.type ? `${g.type}:${t}` : t;
}

function normalizeWin(win) {
  return {
    winningTile: win.winningTile || null,
    selfDrawn: !!win.selfDrawn,
    seatWind: win.seatWind || 'E',
    prevailingWind: win.prevailingWind || 'E',
  };
}
