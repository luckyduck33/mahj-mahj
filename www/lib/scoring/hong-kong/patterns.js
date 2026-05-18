/**
 * Hong Kong Mahjong pattern detectors.
 *
 * Each detector takes (parsedHand, rules, faanTable) and returns either:
 *   - null  → pattern not present
 *   - { id, name, faan, isLimit?, description } → single match
 *   - array of matches → multiple instances (e.g. one per dragon pong)
 *
 * `id` is stable for testing/UI. `faan` is the numeric faan (limit hands
 * already resolved via resolveFaan). `description` is a short, human-readable
 * one-liner suitable for the results screen.
 *
 * Mutual-exclusion and subsumption are NOT handled inside detectors — that's
 * resolveMatches()'s job. Detectors should only check their own conditions.
 */

import {
  WINDS, DRAGONS, HONORS,
  isNumbered, suitOf, isHonor, isDragon, isWind, isTerminal,
  bonusSeat, isFlower, isSeason, countTiles, valueOf,
} from '../types.js';
import { resolveFaan } from './rules.js';
import { allHandTiles, keyTileOf } from './hand-parser.js';

const SEAT_FLOWER_TO_SEAT = { E: 'E', S: 'S', W: 'W', N: 'N' };

// ─── Helpers ───────────────────────────────────────────────────────────────

function pongLikeSets(hand) {
  // pongs + kongs both count as "triplet-shaped" sets for HK pattern detection
  if (hand.kind !== 'standard') return [];
  return hand.sets.filter(s => s.type === 'pong' || s.type === 'kong');
}
function chowSets(hand) {
  if (hand.kind !== 'standard') return [];
  return hand.sets.filter(s => s.type === 'chow');
}

// ─── Detectors ─────────────────────────────────────────────────────────────

export function detectAllChows(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  if (chowSets(hand).length !== 4) return null;
  // Pair must NOT be a yakuhai (dragons, seat wind, prevailing wind)
  const pairTile = hand.pair.tiles[0];
  if (isDragon(pairTile)) return null;
  if (isWind(pairTile)) {
    const w = pairTile[1];
    if (w === hand.win.seatWind || w === hand.win.prevailingWind) return null;
  }
  return {
    id: 'allChows',
    name: 'All Chows',
    faan: faanTable.allChows,
    description: 'Every set is a run, and your pair has no scoring value.',
  };
}

export function detectAllPongs(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  if (pongLikeSets(hand).length !== 4) return null;
  return {
    id: 'allPongs',
    name: 'All Pongs',
    faan: faanTable.allPongs,
    description: 'Every set is a triplet (pong or kong).',
  };
}

export function detectConcealedHand(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  // No exposed sets at all. (Winning tile from discard is still ok.)
  if (hand.sets.some(s => s.exposed)) return null;
  return {
    id: 'concealedHand',
    name: 'Concealed Hand',
    faan: faanTable.concealedHand,
    description: 'No sets were exposed during play.',
  };
}

export function detectSelfDrawn(hand, rules, faanTable) {
  if (!hand.win.selfDrawn) return null;
  return {
    id: 'selfDrawn',
    name: 'Self-Drawn',
    faan: faanTable.selfDrawn,
    description: 'You drew your winning tile yourself.',
  };
}

export function detectPureOneSuit(hand, rules, faanTable) {
  const tiles = allHandTiles(hand);
  if (tiles.some(isHonor)) return null;
  if (!tiles.every(isNumbered)) return null;
  const suit = suitOf(tiles[0]);
  if (!tiles.every(t => suitOf(t) === suit)) return null;
  return {
    id: 'pureOneSuit',
    name: 'Pure One Suit',
    faan: faanTable.pureOneSuit,
    description: 'Every tile is the same numbered suit — no honors.',
  };
}

export function detectMixedOneSuit(hand, rules, faanTable) {
  const tiles = allHandTiles(hand);
  const numbered = tiles.filter(isNumbered);
  if (numbered.length === 0) return null;          // all honors — different pattern
  const suit = suitOf(numbered[0]);
  if (!numbered.every(t => suitOf(t) === suit)) return null;
  const honors = tiles.filter(isHonor);
  if (honors.length === 0) return null;            // would be pure one suit instead
  return {
    id: 'mixedOneSuit',
    name: 'Mixed One Suit',
    faan: faanTable.mixedOneSuit,
    description: 'One numbered suit combined with honors only.',
  };
}

export function detectAllHonors(hand, rules, faanTable) {
  const tiles = allHandTiles(hand);
  if (!tiles.every(isHonor)) return null;
  return {
    id: 'allHonors',
    name: 'All Honors',
    faan: resolveFaan(faanTable.allHonors, rules),
    isLimit: faanTable.allHonors === 'limit',
    description: 'Every tile is a wind or dragon — a limit hand.',
  };
}

export function detectAllTerminals(hand, rules, faanTable) {
  const tiles = allHandTiles(hand);
  if (!tiles.every(isTerminal)) return null;
  return {
    id: 'allTerminals',
    name: 'All Terminals',
    faan: resolveFaan(faanTable.allTerminals, rules),
    isLimit: faanTable.allTerminals === 'limit',
    description: 'Every tile is a 1 or a 9, no honors, no simples — a limit hand.',
  };
}

export function detectDragonPongs(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  const matches = [];
  for (const s of pongLikeSets(hand)) {
    if (isDragon(s.tiles[0])) {
      const dragonName = ({ R: 'Red Dragon', G: 'Green Dragon', W: 'White Dragon' })[s.tiles[0][1]];
      matches.push({
        id: `dragonPong:${s.tiles[0]}`,
        name: `${dragonName} Pong`,
        faan: faanTable.dragonPong,
        description: `Triplet of ${dragonName.toLowerCase()}s.`,
      });
    }
  }
  return matches.length ? matches : null;
}

export function detectSeatWindPong(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  for (const s of pongLikeSets(hand)) {
    if (isWind(s.tiles[0]) && s.tiles[0][1] === hand.win.seatWind) {
      return {
        id: 'seatWindPong',
        name: 'Seat Wind Pong',
        faan: faanTable.seatWindPong,
        description: `Triplet of your seat wind (${hand.win.seatWind}).`,
      };
    }
  }
  return null;
}

export function detectPrevailingWindPong(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  for (const s of pongLikeSets(hand)) {
    if (isWind(s.tiles[0]) && s.tiles[0][1] === hand.win.prevailingWind) {
      // If seat == prevailing, this still scores once on its own (the same
      // pong scores twice: once for seat, once for prevailing). HK convention.
      return {
        id: 'prevailingWindPong',
        name: 'Prevailing Wind Pong',
        faan: faanTable.prevailingWindPong,
        description: `Triplet of the prevailing wind (${hand.win.prevailingWind}).`,
      };
    }
  }
  return null;
}

export function detectSmallThreeDragons(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  const dragonPongCount = pongLikeSets(hand).filter(s => isDragon(s.tiles[0])).length;
  const pairIsDragon = isDragon(hand.pair.tiles[0]);
  if (dragonPongCount === 2 && pairIsDragon) {
    return {
      id: 'smallThreeDragons',
      name: 'Small Three Dragons',
      faan: faanTable.smallThreeDragons,
      description: 'Two dragon pongs plus a pair of the third dragon.',
    };
  }
  return null;
}

export function detectBigThreeDragons(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  const dragonPongCount = pongLikeSets(hand).filter(s => isDragon(s.tiles[0])).length;
  if (dragonPongCount === 3) {
    return {
      id: 'bigThreeDragons',
      name: 'Big Three Dragons',
      faan: resolveFaan(faanTable.bigThreeDragons, rules),
      isLimit: faanTable.bigThreeDragons === 'limit',
      description: 'Pongs of all three dragons — a limit hand.',
    };
  }
  return null;
}

export function detectSmallFourWinds(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  const windPongs = pongLikeSets(hand).filter(s => isWind(s.tiles[0]));
  const pairIsWind = isWind(hand.pair.tiles[0]);
  if (windPongs.length === 3 && pairIsWind) {
    return {
      id: 'smallFourWinds',
      name: 'Small Four Winds',
      faan: resolveFaan(faanTable.smallFourWinds, rules),
      isLimit: faanTable.smallFourWinds === 'limit',
      description: 'Three wind pongs plus a pair of the fourth wind — a limit hand.',
    };
  }
  return null;
}

export function detectBigFourWinds(hand, rules, faanTable) {
  if (hand.kind !== 'standard') return null;
  const windPongs = pongLikeSets(hand).filter(s => isWind(s.tiles[0]));
  if (windPongs.length === 4) {
    return {
      id: 'bigFourWinds',
      name: 'Big Four Winds',
      faan: resolveFaan(faanTable.bigFourWinds, rules),
      isLimit: faanTable.bigFourWinds === 'limit',
      description: 'Pongs of all four winds — a limit hand.',
    };
  }
  return null;
}

export function detectSevenPairs(hand, rules, faanTable) {
  if (!rules.allowSevenPairs) return null;
  if (hand.kind !== 'sevenPairs') return null;
  return {
    id: 'sevenPairs',
    name: 'Seven Pairs',
    faan: faanTable.sevenPairs,
    description: 'Seven distinct pairs — an unusual hand structure.',
  };
}

export function detectThirteenOrphans(hand, rules, faanTable) {
  if (!rules.allowThirteenOrphans) return null;
  if (hand.kind !== 'thirteenOrphans') return null;
  return {
    id: 'thirteenOrphans',
    name: 'Thirteen Orphans',
    faan: resolveFaan(faanTable.thirteenOrphans, rules),
    isLimit: faanTable.thirteenOrphans === 'limit',
    description: 'All terminals and honors, one of each, plus a pair — a limit hand.',
  };
}

export function detectNineGates(hand, rules, faanTable) {
  if (!rules.allowNineGates) return null;
  if (hand.kind !== 'standard') return null;
  // Must be pure one suit AND fully concealed.
  if (hand.sets.some(s => s.exposed)) return null;
  const tiles = allHandTiles(hand);
  if (tiles.some(isHonor)) return null;
  if (!tiles.every(isNumbered)) return null;
  const suit = suitOf(tiles[0]);
  if (!tiles.every(t => suitOf(t) === suit)) return null;
  // Pattern: 1,1,1,2,3,4,5,6,7,8,9,9,9 in the suit + one extra tile.
  const counts = countTiles(tiles);
  const required = { [`1${suit}`]: 3, [`9${suit}`]: 3 };
  for (let v = 2; v <= 8; v++) {
    required[`${v}${suit}`] = (required[`${v}${suit}`] || 0) + 1;
  }
  // The 14th tile is the winning tile and can be any of 1-9 in the suit.
  const totalRequired = Object.values(required).reduce((a, b) => a + b, 0); // = 13
  if (tiles.length !== totalRequired + 1) return null;
  // Subtract the required minimum from counts; remainder must be exactly one tile.
  let extra = 0;
  for (let v = 1; v <= 9; v++) {
    const t = `${v}${suit}`;
    const got = counts[t] || 0;
    const need = required[t] || 0;
    if (got < need) return null;
    extra += got - need;
  }
  if (extra !== 1) return null;
  return {
    id: 'nineGates',
    name: 'Nine Gates',
    faan: resolveFaan(faanTable.nineGates, rules),
    isLimit: faanTable.nineGates === 'limit',
    description: 'A concealed 1112345678999 in one suit plus any matching tile — a limit hand.',
  };
}

export function detectRobbingKong(hand, rules, faanTable) {
  if (!hand.win.robbingKong) return null;
  return {
    id: 'robbingKong',
    name: 'Robbing the Kong',
    faan: faanTable.robbingKong,
    description: 'You won by stealing the tile an opponent was adding to a pong.',
  };
}

export function detectLastTile(hand, rules, faanTable) {
  if (!hand.win.lastTile) return null;
  return {
    id: 'lastTile',
    name: 'Win on Last Tile',
    faan: faanTable.lastTile,
    description: 'Your winning tile was the very last available draw.',
  };
}

export function detectWinOnKongDraw(hand, rules, faanTable) {
  if (!hand.win.winOnKongDraw) return null;
  return {
    id: 'winOnKongDraw',
    name: 'Win on Kong Draw',
    faan: faanTable.winOnKongDraw,
    description: 'You drew the replacement tile after declaring a kong and won.',
  };
}

export function detectFlowers(hand, rules, faanTable) {
  if (!hand.flowers?.length) return null;
  const seat = hand.win.seatWind;
  const matches = [];
  let perTile = 0;
  for (const t of hand.flowers) {
    if (bonusSeat(t) === seat) perTile += 1;
  }
  if (perTile > 0) {
    const noun = perTile === 1 ? 'flower or season' : 'flowers/seasons';
    matches.push({
      id: 'flowersSeat',
      name: perTile === 1 ? 'Seat Flower' : 'Seat Flowers',
      faan: perTile * (faanTable.flowersPer ?? rules.flowerFaan),
      description: `Matched ${perTile} ${noun} to your seat wind (${seat}).`,
    });
  }
  // Full set bonuses
  const flowerSeats = hand.flowers.filter(isFlower).map(bonusSeat).sort();
  const seasonSeats = hand.flowers.filter(isSeason).map(bonusSeat).sort();
  const hasAllFlowers = ['E', 'S', 'W', 'N'].every(s => flowerSeats.includes(s));
  const hasAllSeasons = ['E', 'S', 'W', 'N'].every(s => seasonSeats.includes(s));
  if (hasAllFlowers) {
    matches.push({
      id: 'fullFlowers',
      name: 'Full Set of Flowers',
      faan: rules.fullSetFlowerBonus,
      description: 'You collected all four flowers.',
    });
  }
  if (hasAllSeasons) {
    matches.push({
      id: 'fullSeasons',
      name: 'Full Set of Seasons',
      faan: rules.fullSetFlowerBonus,
      description: 'You collected all four seasons.',
    });
  }
  return matches.length ? matches : null;
}

// ─── Registry & resolution ─────────────────────────────────────────────────

export const ALL_DETECTORS = [
  // hand-shape & flush
  detectPureOneSuit,
  detectMixedOneSuit,
  detectAllHonors,
  detectAllTerminals,
  detectAllPongs,
  detectAllChows,
  // honor groups
  detectBigThreeDragons,
  detectSmallThreeDragons,
  detectBigFourWinds,
  detectSmallFourWinds,
  detectDragonPongs,
  detectSeatWindPong,
  detectPrevailingWindPong,
  // special hands
  detectSevenPairs,
  detectThirteenOrphans,
  detectNineGates,
  // concealment + win context
  detectConcealedHand,
  detectSelfDrawn,
  detectRobbingKong,
  detectLastTile,
  detectWinOnKongDraw,
  // bonuses
  detectFlowers,
];

/**
 * Apply mutual-exclusion / subsumption to a raw list of matches.
 *
 * Rules:
 *   - Pure One Suit subsumes Mixed One Suit
 *   - Big Three Dragons subsumes Small Three Dragons and individual dragon pongs
 *   - Big Four Winds subsumes Small Four Winds and the wind pongs that make it
 *   - All Honors subsumes Mixed/Pure One Suit (it's all-honor → no numbered suit)
 *   - Nine Gates subsumes Pure One Suit + Concealed Hand
 *   - Thirteen Orphans / Seven Pairs don't combine with structural detectors
 */
export function resolveMatches(matches) {
  let out = matches.slice();

  const has = id => out.some(m => m.id === id);
  const remove = id => { out = out.filter(m => m.id !== id); };
  const removePrefix = pre => { out = out.filter(m => !m.id.startsWith(pre)); };

  if (has('pureOneSuit')) remove('mixedOneSuit');

  if (has('bigThreeDragons')) {
    remove('smallThreeDragons');
    removePrefix('dragonPong:');
  }
  if (has('bigFourWinds')) {
    remove('smallFourWinds');
    remove('seatWindPong');
    remove('prevailingWindPong');
  }
  if (has('smallFourWinds')) {
    // small4winds is the limit too — the wind pongs are already counted in it.
    remove('seatWindPong');
    remove('prevailingWindPong');
  }
  if (has('nineGates')) {
    remove('pureOneSuit');
    remove('concealedHand');
  }
  if (has('thirteenOrphans') || has('sevenPairs')) {
    // Special hands don't combine with structural-set detectors; only context
    // bonuses (selfDrawn, lastTile, robbingKong, flowers) stack.
    const keep = new Set([
      'thirteenOrphans', 'sevenPairs',
      'selfDrawn', 'lastTile', 'robbingKong', 'winOnKongDraw',
      'flowersSeat', 'fullFlowers', 'fullSeasons',
    ]);
    out = out.filter(m => keep.has(m.id));
  }
  return out;
}

/**
 * Run all detectors and return resolved matches.
 */
export function detectAll(hand, rules, faanTable) {
  const raw = [];
  for (const det of ALL_DETECTORS) {
    const result = det(hand, rules, faanTable);
    if (!result) continue;
    if (Array.isArray(result)) raw.push(...result);
    else raw.push(result);
  }
  return resolveMatches(raw);
}
