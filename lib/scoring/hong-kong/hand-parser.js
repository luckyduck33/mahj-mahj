/**
 * Hand parser — validates user-grouped sets and normalizes a hand input.
 *
 * Input:  the structured Hand object documented in ../types.js
 * Output: a normalized + validated Hand object, plus convenience derived data.
 *
 * Special-hand detection (Seven Pairs / Thirteen Orphans) lives here too,
 * since those hands don't follow the 4-sets-and-a-pair structure.
 */

import {
  isNumbered, suitOf, valueOf, isHonor, isFlower, isSeason,
  TERMINALS_AND_HONORS, sortTiles, countTiles,
} from '../types.js';

export class HandParseError extends Error {}

function uniqueTilesFromSet(s) {
  return new Set(s.tiles);
}

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

/**
 * Canonicalize a set: sort tiles, default exposed=false.
 */
function canonSet(s) {
  return {
    type: s.type,
    tiles: sortTiles(s.tiles),
    exposed: !!s.exposed,
    ...(s.addedKong ? { addedKong: true } : {}),
  };
}

/**
 * Returns the "key tile" of a set — the tile that defines it:
 *   pong/kong/pair → the repeated tile
 *   chow           → the lowest tile in the run
 */
export function keyTileOf(s) {
  if (!s) return null;
  if (s.type === 'chow') return sortTiles(s.tiles)[0];
  return s.tiles[0];
}

/**
 * Parse + validate a normal 4-sets + 1-pair hand.
 * Returns canonical hand: { sets, pair, kongs[], chows[], pongs[], flowers, win }
 */
export function parseHand(input) {
  if (!input) throw new HandParseError('Hand input required');
  if (input.special) return parseSpecial(input);

  const { sets = [], pair = null, flowers = [], win = {} } = input;
  if (!pair) throw new HandParseError('Hand requires a pair');
  validateSet(pair, 'pair');

  if (sets.length !== 4) {
    throw new HandParseError(`Hand requires exactly 4 sets (got ${sets.length})`);
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
    robbingKong: !!win.robbingKong,
    lastTile: !!win.lastTile,
    winOnKongDraw: !!win.winOnKongDraw,
  };
}

/**
 * Parse a special-hand input (Seven Pairs or Thirteen Orphans).
 */
function parseSpecial(input) {
  const { special, flowers = [], win = {} } = input;
  const kind = special.kind;
  const tiles = special.tiles || [];
  if (kind === 'sevenPairs') {
    return parseSevenPairs(tiles, flowers, win);
  }
  if (kind === 'thirteenOrphans') {
    return parseThirteenOrphans(tiles, flowers, win);
  }
  throw new HandParseError(`Unknown special hand "${kind}"`);
}

function parseSevenPairs(tiles, flowers, win) {
  if (tiles.length !== 14) {
    throw new HandParseError(`Seven Pairs needs 14 tiles, got ${tiles.length}`);
  }
  const counts = countTiles(tiles);
  const pairTiles = [];
  for (const [t, c] of Object.entries(counts)) {
    // Strictly 7 distinct pairs. A four-of-a-kind would NOT qualify under
    // common HK Seven Pairs rules (it would be a kong, which breaks the form).
    if (c !== 2) {
      throw new HandParseError(`Seven Pairs requires exactly 2 of each tile (failed on ${t} ×${c})`);
    }
    pairTiles.push(t);
  }
  if (pairTiles.length !== 7) {
    throw new HandParseError(`Seven Pairs requires 7 distinct pairs, got ${pairTiles.length}`);
  }
  return {
    kind: 'sevenPairs',
    pairs: pairTiles.map(t => ({ type: 'pair', tiles: [t, t], exposed: false })),
    tiles: sortTiles(tiles),
    flowers: [...flowers],
    win: normalizeWin(win),
  };
}

function parseThirteenOrphans(tiles, flowers, win) {
  if (tiles.length !== 14) {
    throw new HandParseError(`Thirteen Orphans needs 14 tiles, got ${tiles.length}`);
  }
  const counts = countTiles(tiles);
  const required = TERMINALS_AND_HONORS;
  let pairTile = null;
  for (const t of required) {
    if (!counts[t]) {
      throw new HandParseError(`Thirteen Orphans missing required tile: ${t}`);
    }
    if (counts[t] === 2) {
      if (pairTile) {
        throw new HandParseError(`Thirteen Orphans needs exactly one pair, found multiple`);
      }
      pairTile = t;
    } else if (counts[t] !== 1) {
      throw new HandParseError(`Thirteen Orphans tile ${t} appears ${counts[t]} times`);
    }
  }
  if (!pairTile) {
    throw new HandParseError(`Thirteen Orphans needs exactly one pair (none found)`);
  }
  // No other tiles allowed
  for (const t of Object.keys(counts)) {
    if (!required.includes(t)) {
      throw new HandParseError(`Thirteen Orphans contains non-terminal/honor tile: ${t}`);
    }
  }
  return {
    kind: 'thirteenOrphans',
    pairTile,
    tiles: sortTiles(tiles),
    flowers: [...flowers],
    win: normalizeWin(win),
  };
}

/**
 * Collect every non-bonus tile from a parsed hand for whole-hand inspections
 * (e.g. flush detection).
 */
export function allHandTiles(parsed) {
  if (parsed.kind === 'sevenPairs' || parsed.kind === 'thirteenOrphans') {
    return [...parsed.tiles];
  }
  const out = [];
  for (const s of parsed.sets) out.push(...s.tiles);
  out.push(...parsed.pair.tiles);
  return out;
}
