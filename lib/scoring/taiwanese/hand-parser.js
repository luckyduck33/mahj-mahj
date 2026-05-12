/**
 * Hand parser for Taiwanese 16-tile mahjong.
 *
 * Structurally identical to the HK parser except:
 *   - Requires 5 sets (not 4) for a standard hand.
 *   - Total hand size 17 base (+1 per kong) instead of 14.
 *   - No Thirteen Orphans special hand (doesn't adapt to 16-tile structure).
 *   - Seven Pairs becomes Eight Pairs in some rule sets (we keep "Seven Pairs"
 *     terminology for clarity — engine accepts 14 OR 16 tiles in pairs form).
 */

import {
  isNumbered, suitOf, valueOf, isHonor, isFlower, isSeason,
  TERMINALS_AND_HONORS, sortTiles, countTiles,
} from '../types.js';

export class HandParseError extends Error {}

function validateSet(s, idx) {
  if (!s || !s.type) throw new HandParseError(`Set #${idx} missing type`);
  if (!Array.isArray(s.tiles)) throw new HandParseError(`Set #${idx} missing tiles[]`);
  const t = s.tiles;
  switch (s.type) {
    case 'pair':
      if (t.length !== 2) throw new HandParseError(`Pair must have 2 tiles, got ${t.length}`);
      if (t[0] !== t[1]) throw new HandParseError(`Pair tiles must match: got ${t.join(',')}`);
      return;
    case 'pong':
      if (t.length !== 3) throw new HandParseError(`Pong must have 3 tiles, got ${t.length}`);
      if (!(t[0] === t[1] && t[1] === t[2])) {
        throw new HandParseError(`Pong tiles must all match: got ${t.join(',')}`);
      }
      return;
    case 'kong':
      if (t.length !== 4) throw new HandParseError(`Kong must have 4 tiles, got ${t.length}`);
      if (!(t[0] === t[1] && t[1] === t[2] && t[2] === t[3])) {
        throw new HandParseError(`Kong tiles must all match: got ${t.join(',')}`);
      }
      return;
    case 'chow': {
      if (t.length !== 3) throw new HandParseError(`Chow must have 3 tiles, got ${t.length}`);
      if (!t.every(isNumbered)) throw new HandParseError(`Chow tiles must all be numbered: got ${t.join(',')}`);
      const suit = suitOf(t[0]);
      if (!t.every(x => suitOf(x) === suit)) {
        throw new HandParseError(`Chow tiles must share a suit: got ${t.join(',')}`);
      }
      const vals = t.map(valueOf).sort((a, b) => a - b);
      if (!(vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1)) {
        throw new HandParseError(`Chow tiles must be sequential: got ${t.join(',')}`);
      }
      return;
    }
    default:
      throw new HandParseError(`Unknown set type "${s.type}"`);
  }
}

function canonSet(s) {
  return {
    type: s.type,
    tiles: sortTiles(s.tiles),
    exposed: !!s.exposed,
    ...(s.addedKong ? { addedKong: true } : {}),
  };
}

export function keyTileOf(s) {
  if (!s) return null;
  if (s.type === 'chow') return sortTiles(s.tiles)[0];
  return s.tiles[0];
}

export function parseHand(input) {
  if (!input) throw new HandParseError('Hand input required');
  if (input.special) return parseSpecial(input);

  const { sets = [], pair = null, flowers = [], win = {} } = input;
  if (!pair) throw new HandParseError('Hand requires a pair');
  validateSet(pair, 'pair');

  if (sets.length !== 5) {
    throw new HandParseError(`Taiwanese hand requires exactly 5 sets (got ${sets.length})`);
  }
  sets.forEach((s, i) => validateSet(s, i));

  for (const t of flowers) {
    if (!isFlower(t) && !isSeason(t)) {
      throw new HandParseError(`Flowers list contains non-bonus tile: ${t}`);
    }
  }

  const canonSets = sets.map(canonSet);
  const canonPair = canonSet(pair);

  return {
    kind: 'standard',
    sets: canonSets,
    pair: canonPair,
    pongs: canonSets.filter(s => s.type === 'pong'),
    chows: canonSets.filter(s => s.type === 'chow'),
    kongs: canonSets.filter(s => s.type === 'kong'),
    flowers: [...flowers],
    win: normalizeWin(win),
  };
}

function normalizeWin(win) {
  return {
    winningTile: win.winningTile || null,
    selfDrawn: !!win.selfDrawn,
    seatWind: win.seatWind || 'E',
    prevailingWind: win.prevailingWind || 'E',
    isDealer: !!win.isDealer,
    consecutiveDealerWins: Math.max(0, Number(win.consecutiveDealerWins) || 0),
    robbingKong: !!win.robbingKong,
    lastTile: !!win.lastTile,
    winOnKongDraw: !!win.winOnKongDraw,
    heavenlyHand: !!win.heavenlyHand,
    earthlyHand: !!win.earthlyHand,
  };
}

function parseSpecial(input) {
  const { special, flowers = [], win = {} } = input;
  const kind = special.kind;
  const tiles = special.tiles || [];
  if (kind === 'sevenPairs') {
    return parseSevenPairs(tiles, flowers, win);
  }
  throw new HandParseError(`Unknown special hand "${kind}" for Taiwanese`);
}

function parseSevenPairs(tiles, flowers, win) {
  // Some Taiwanese rule sets accept either 14 or 16 tiles in pairs form.
  // We accept both shapes; 14 = 7 pairs, 16 = 8 pairs.
  if (tiles.length !== 14 && tiles.length !== 16) {
    throw new HandParseError(`Seven Pairs needs 14 or 16 tiles, got ${tiles.length}`);
  }
  const counts = countTiles(tiles);
  const pairTiles = [];
  const expectedPairCount = tiles.length / 2;
  for (const [t, c] of Object.entries(counts)) {
    if (c !== 2) {
      throw new HandParseError(`Seven Pairs requires exactly 2 of each tile (failed on ${t} ×${c})`);
    }
    pairTiles.push(t);
  }
  if (pairTiles.length !== expectedPairCount) {
    throw new HandParseError(`Pairs hand needs ${expectedPairCount} distinct pairs, got ${pairTiles.length}`);
  }
  return {
    kind: 'sevenPairs',
    pairs: pairTiles.map(t => ({ type: 'pair', tiles: [t, t], exposed: false })),
    tiles: sortTiles(tiles),
    flowers: [...flowers],
    win: normalizeWin(win),
  };
}

export function allHandTiles(parsed) {
  if (parsed.kind === 'sevenPairs') return [...parsed.tiles];
  const out = [];
  for (const s of parsed.sets) out.push(...s.tiles);
  out.push(...parsed.pair.tiles);
  return out;
}
