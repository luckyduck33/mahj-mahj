/**
 * Taiwanese pattern detectors.
 *
 * Each detector returns null, a single match, or an array of matches.
 * Subsumption (Big subsumes Small + parts, etc.) is handled in resolveMatches.
 */

import {
  isNumbered, suitOf, isHonor, isDragon, isWind, isTerminal,
  bonusSeat, isFlower, isSeason, countTiles,
} from '../types.js';
import { resolveTai } from './rules.js';
import { allHandTiles } from './hand-parser.js';

function pongLikeSets(hand) {
  if (hand.kind !== 'standard') return [];
  return hand.sets.filter(s => s.type === 'pong' || s.type === 'kong');
}
function chowSets(hand) {
  if (hand.kind !== 'standard') return [];
  return hand.sets.filter(s => s.type === 'chow');
}

// ─── Hand-shape detectors ───────────────────────────────────────────────────

export function detectPingHu(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  if (chowSets(hand).length !== 5) return null;
  const pairTile = hand.pair.tiles[0];
  if (isDragon(pairTile)) return null;
  if (isWind(pairTile)) {
    const w = pairTile[1];
    if (w === hand.win.seatWind || w === hand.win.prevailingWind) return null;
  }
  // Some rule sets also require concealed + won-by-discard for true ping hu;
  // we accept the looser definition (all chows + non-yakuhai pair).
  return {
    id: 'pingHu',
    name: '平胡 (Ping Hu)',
    tai: tai.pingHu,
    description: 'Every set is a run, and your pair has no scoring value.',
  };
}

export function detectAllPongs(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  if (pongLikeSets(hand).length !== 5) return null;
  return {
    id: 'allPongs',
    name: '碰碰胡 (All Pongs)',
    tai: tai.allPongs,
    description: 'Every set is a triplet (pong or kong).',
  };
}

export function detectConcealedHand(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  if (hand.sets.some(s => s.exposed)) return null;
  if (hand.win.selfDrawn) return null; // covered by detectConcealedSelfDrawn
  return {
    id: 'concealedHand',
    name: '門清 (Concealed)',
    tai: tai.concealedHand,
    description: 'No sets were exposed; won by discard.',
  };
}

export function detectConcealedSelfDrawn(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  if (hand.sets.some(s => s.exposed)) return null;
  if (!hand.win.selfDrawn) return null;
  return {
    id: 'concealedSelfDrawn',
    name: '門清自摸 (Concealed Self-Draw)',
    tai: tai.concealedSelfDrawn,
    description: 'Fully concealed and self-drawn — the prized combination.',
  };
}

export function detectSelfDrawn(hand, rules, tai) {
  if (!hand.win.selfDrawn) return null;
  // suppressed when detectConcealedSelfDrawn matches
  return {
    id: 'selfDrawn',
    name: '自摸 (Self-Drawn)',
    tai: tai.selfDrawn,
    description: 'You drew the winning tile yourself.',
  };
}

export function detectAllFromOthers(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  if (hand.win.selfDrawn) return null;
  // 全求人: every set is exposed and won by discard.
  if (!hand.sets.every(s => s.exposed)) return null;
  return {
    id: 'allFromOthers',
    name: '全求人 (All From Others)',
    tai: tai.allFromOthers,
    description: 'Every set was called from others; won by discard.',
  };
}

export function detectPureOneSuit(hand, rules, tai) {
  const tiles = allHandTiles(hand);
  if (tiles.some(isHonor)) return null;
  if (!tiles.every(isNumbered)) return null;
  const suit = suitOf(tiles[0]);
  if (!tiles.every(t => suitOf(t) === suit)) return null;
  return {
    id: 'pureOneSuit',
    name: '清一色 (Pure One Suit)',
    tai: tai.pureOneSuit,
    description: 'Every tile is the same numbered suit — no honors.',
  };
}

export function detectMixedOneSuit(hand, rules, tai) {
  const tiles = allHandTiles(hand);
  const numbered = tiles.filter(isNumbered);
  if (numbered.length === 0) return null;
  const suit = suitOf(numbered[0]);
  if (!numbered.every(t => suitOf(t) === suit)) return null;
  const honors = tiles.filter(isHonor);
  if (honors.length === 0) return null;
  return {
    id: 'mixedOneSuit',
    name: '混一色 (Mixed One Suit)',
    tai: tai.mixedOneSuit,
    description: 'One numbered suit combined with honors only.',
  };
}

export function detectAllHonors(hand, rules, tai) {
  const tiles = allHandTiles(hand);
  if (!tiles.every(isHonor)) return null;
  return {
    id: 'allHonors',
    name: '字一色 (All Honors)',
    tai: resolveTai(tai.allHonors, rules),
    isLimit: tai.allHonors === 'limit',
    description: 'Every tile is a wind or dragon — a limit hand.',
  };
}

export function detectAllTerminals(hand, rules, tai) {
  const tiles = allHandTiles(hand);
  if (!tiles.every(isTerminal)) return null;
  return {
    id: 'allTerminals',
    name: '清老頭 (All Terminals)',
    tai: resolveTai(tai.allTerminals, rules),
    isLimit: tai.allTerminals === 'limit',
    description: 'Every tile is a 1 or a 9 — no honors, no simples.',
  };
}

export function detectMixedTerminalsHonors(hand, rules, tai) {
  const tiles = allHandTiles(hand);
  if (!tiles.every(t => isTerminal(t) || isHonor(t))) return null;
  const hasTerminal = tiles.some(isTerminal);
  const hasHonor = tiles.some(isHonor);
  if (!(hasTerminal && hasHonor)) return null;
  return {
    id: 'mixedTerminalsHonors',
    name: '混老頭 (Mixed Terminals & Honors)',
    tai: tai.mixedTerminalsHonors,
    description: 'Only terminals and honors — no simples.',
  };
}

// ─── Dragons + winds ────────────────────────────────────────────────────────

export function detectDragonPongs(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  const matches = [];
  for (const s of pongLikeSets(hand)) {
    if (isDragon(s.tiles[0])) {
      const dragonName = ({ R: 'Red', G: 'Green', W: 'White' })[s.tiles[0][1]];
      matches.push({
        id: `dragonPong:${s.tiles[0]}`,
        name: `${dragonName} Dragon Pong`,
        tai: tai.dragonPong,
        description: `Triplet of ${dragonName.toLowerCase()} dragons.`,
      });
    }
  }
  return matches.length ? matches : null;
}

export function detectSeatWindPong(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  for (const s of pongLikeSets(hand)) {
    if (isWind(s.tiles[0]) && s.tiles[0][1] === hand.win.seatWind) {
      return {
        id: 'seatWindPong',
        name: '門風 (Seat Wind Pong)',
        tai: tai.seatWindPong,
        description: `Triplet of your seat wind (${hand.win.seatWind}).`,
      };
    }
  }
  return null;
}

export function detectPrevailingWindPong(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  for (const s of pongLikeSets(hand)) {
    if (isWind(s.tiles[0]) && s.tiles[0][1] === hand.win.prevailingWind) {
      return {
        id: 'prevailingWindPong',
        name: '圈風 (Prevailing Wind Pong)',
        tai: tai.prevailingWindPong,
        description: `Triplet of the prevailing wind (${hand.win.prevailingWind}).`,
      };
    }
  }
  return null;
}

export function detectSmallThreeDragons(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  const dragonPongCount = pongLikeSets(hand).filter(s => isDragon(s.tiles[0])).length;
  const pairIsDragon = isDragon(hand.pair.tiles[0]);
  if (dragonPongCount === 2 && pairIsDragon) {
    return {
      id: 'smallThreeDragons',
      name: '小三元 (Small Three Dragons)',
      tai: tai.smallThreeDragons,
      description: 'Two dragon pongs plus a pair of the third dragon.',
    };
  }
  return null;
}

export function detectBigThreeDragons(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  const dragonPongCount = pongLikeSets(hand).filter(s => isDragon(s.tiles[0])).length;
  if (dragonPongCount === 3) {
    return {
      id: 'bigThreeDragons',
      name: '大三元 (Big Three Dragons)',
      tai: resolveTai(tai.bigThreeDragons, rules),
      isLimit: tai.bigThreeDragons === 'limit',
      description: 'Pongs of all three dragons — a limit hand.',
    };
  }
  return null;
}

export function detectSmallFourWinds(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  const windPongs = pongLikeSets(hand).filter(s => isWind(s.tiles[0]));
  const pairIsWind = isWind(hand.pair.tiles[0]);
  if (windPongs.length === 3 && pairIsWind) {
    return {
      id: 'smallFourWinds',
      name: '小四喜 (Small Four Winds)',
      tai: resolveTai(tai.smallFourWinds, rules),
      isLimit: tai.smallFourWinds === 'limit',
      description: 'Three wind pongs plus a pair of the fourth wind.',
    };
  }
  return null;
}

export function detectBigFourWinds(hand, rules, tai) {
  if (hand.kind !== 'standard') return null;
  const windPongs = pongLikeSets(hand).filter(s => isWind(s.tiles[0]));
  if (windPongs.length === 4) {
    return {
      id: 'bigFourWinds',
      name: '大四喜 (Big Four Winds)',
      tai: resolveTai(tai.bigFourWinds, rules),
      isLimit: tai.bigFourWinds === 'limit',
      description: 'Pongs of all four winds — a limit hand.',
    };
  }
  return null;
}

export function detectFiveConcealedPongs(hand, rules, tai) {
  if (!rules.allowFiveConcealedPongs) return null;
  if (hand.kind !== 'standard') return null;
  const concealedPongs = pongLikeSets(hand).filter(s => !s.exposed);
  if (concealedPongs.length === 5) {
    return {
      id: 'fiveConcealedPongs',
      name: '五暗刻 (Five Concealed Pongs)',
      tai: resolveTai(tai.fiveConcealedPongs, rules),
      isLimit: tai.fiveConcealedPongs === 'limit',
      description: 'Five concealed triplets — a limit hand.',
    };
  }
  return null;
}

// ─── Special hands ──────────────────────────────────────────────────────────

export function detectSevenPairs(hand, rules, tai) {
  if (!rules.allowSevenPairs) return null;
  if (hand.kind !== 'sevenPairs') return null;
  return {
    id: 'sevenPairs',
    name: '七對子 (Seven Pairs)',
    tai: tai.sevenPairs,
    description: 'Seven (or eight) distinct pairs — an unusual hand structure.',
  };
}

export function detectHeavenlyHand(hand, rules, tai) {
  if (!hand.win.heavenlyHand) return null;
  return {
    id: 'heavenlyHand',
    name: '天胡 (Heavenly Hand)',
    tai: resolveTai(tai.heavenlyHand, rules),
    isLimit: tai.heavenlyHand === 'limit',
    description: 'Dealer wins on the opening 17-tile draw.',
  };
}

export function detectEarthlyHand(hand, rules, tai) {
  if (!hand.win.earthlyHand) return null;
  return {
    id: 'earthlyHand',
    name: '地胡 (Earthly Hand)',
    tai: resolveTai(tai.earthlyHand, rules),
    isLimit: tai.earthlyHand === 'limit',
    description: 'Non-dealer wins on the first draw of the round.',
  };
}

// ─── Win context ────────────────────────────────────────────────────────────

export function detectRobbingKong(hand, rules, tai) {
  if (!hand.win.robbingKong) return null;
  return {
    id: 'robbingKong',
    name: '搶槓胡 (Robbing the Kong)',
    tai: tai.robbingKong,
    description: 'You won by stealing the tile an opponent was adding to a pong.',
  };
}

export function detectLastTile(hand, rules, tai) {
  if (!hand.win.lastTile) return null;
  if (hand.win.selfDrawn) {
    return {
      id: 'lastTileSelfDraw',
      name: '海底撈月 (Last Tile Self-Draw)',
      tai: tai.lastTileSelfDraw,
      description: 'Self-drawn winning tile was the very last tile available.',
    };
  }
  return {
    id: 'lastTileDiscard',
    name: '河底撈魚 (Last Tile Discard)',
    tai: tai.lastTileDiscard,
    description: 'You won on the final discard of the round.',
  };
}

export function detectWinOnKongDraw(hand, rules, tai) {
  if (!hand.win.winOnKongDraw) return null;
  return {
    id: 'winOnKongDraw',
    name: '槓上開花 (Win on Kong Replacement)',
    tai: tai.winOnKongDraw,
    description: 'You drew the replacement tile after declaring a kong and won.',
  };
}

// ─── Dealer ─────────────────────────────────────────────────────────────────

export function detectDealer(hand, rules, tai) {
  if (!hand.win.isDealer) return null;
  return {
    id: 'dealer',
    name: '莊家 (Dealer)',
    tai: tai.dealer,
    description: 'You won as dealer.',
  };
}

export function detectConsecutiveDealer(hand, rules, tai) {
  const n = hand.win.consecutiveDealerWins || 0;
  if (n <= 0) return null;
  return {
    id: 'consecutiveDealer',
    name: `連${n}莊 (Consecutive Dealer ×${n})`,
    tai: n * (tai.consecutiveDealer || 2),
    description: `Won as dealer for ${n} consecutive round(s).`,
  };
}

// ─── Flowers ────────────────────────────────────────────────────────────────

export function detectFlowers(hand, rules, tai) {
  if (!hand.flowers?.length) return null;
  const seat = hand.win.seatWind;
  const matches = [];

  // Match-by-seat count
  let perTile = 0;
  for (const t of hand.flowers) {
    if (bonusSeat(t) === seat) perTile += 1;
  }
  if (perTile > 0) {
    matches.push({
      id: 'flowersSeat',
      name: perTile === 1 ? '花 (Seat Flower)' : `花 ×${perTile} (Seat Flowers)`,
      tai: perTile * (tai.flowersPer || 1),
      description: `Matched ${perTile} flower/season to your seat wind (${seat}).`,
    });
  }

  // All 8 bonus tiles → limit
  if (hand.flowers.length >= 8) {
    matches.push({
      id: 'allFlowers',
      name: '八仙過海 (All Flowers)',
      tai: resolveTai(tai.allFlowers, rules),
      isLimit: tai.allFlowers === 'limit',
      description: 'You collected all 8 flower and season tiles — a limit hand.',
    });
  }

  return matches.length ? matches : null;
}

// ─── Registry & resolution ──────────────────────────────────────────────────

export const ALL_DETECTORS = [
  // Shape & flush
  detectPureOneSuit,
  detectMixedOneSuit,
  detectAllHonors,
  detectAllTerminals,
  detectMixedTerminalsHonors,
  detectAllPongs,
  detectPingHu,
  // Concealed pongs
  detectFiveConcealedPongs,
  // Honor groups
  detectBigThreeDragons,
  detectSmallThreeDragons,
  detectBigFourWinds,
  detectSmallFourWinds,
  detectDragonPongs,
  detectSeatWindPong,
  detectPrevailingWindPong,
  // Special hands
  detectSevenPairs,
  detectHeavenlyHand,
  detectEarthlyHand,
  // Concealment / draw
  detectConcealedSelfDrawn,
  detectConcealedHand,
  detectSelfDrawn,
  detectAllFromOthers,
  detectRobbingKong,
  detectLastTile,
  detectWinOnKongDraw,
  // Dealer
  detectDealer,
  detectConsecutiveDealer,
  // Flowers
  detectFlowers,
];

export function resolveMatches(matches) {
  let out = matches.slice();
  const has = id => out.some(m => m.id === id);
  const remove = id => { out = out.filter(m => m.id !== id); };
  const removePrefix = pre => { out = out.filter(m => !m.id.startsWith(pre)); };

  if (has('pureOneSuit')) remove('mixedOneSuit');
  if (has('allHonors')) {
    remove('pureOneSuit');
    remove('mixedOneSuit');
    remove('mixedTerminalsHonors');
  }
  if (has('allTerminals')) {
    remove('mixedTerminalsHonors');
  }
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
    remove('seatWindPong');
    remove('prevailingWindPong');
  }
  if (has('fiveConcealedPongs')) {
    remove('allPongs');
    remove('concealedSelfDrawn');
    remove('concealedHand');
  }
  if (has('concealedSelfDrawn')) {
    remove('concealedHand');
    remove('selfDrawn');
  }
  if (has('heavenlyHand') || has('earthlyHand')) {
    // Limit hands subsume any structural counting (player drew the entire hand at once).
    const keep = new Set([
      'heavenlyHand', 'earthlyHand', 'flowersSeat', 'allFlowers',
      'dealer', 'consecutiveDealer',
    ]);
    out = out.filter(m => keep.has(m.id));
  }
  if (has('sevenPairs')) {
    const keep = new Set([
      'sevenPairs', 'selfDrawn', 'concealedHand', 'concealedSelfDrawn',
      'pureOneSuit', 'mixedOneSuit', 'allHonors', 'allTerminals',
      'mixedTerminalsHonors',
      'lastTileSelfDraw', 'lastTileDiscard', 'robbingKong', 'winOnKongDraw',
      'flowersSeat', 'allFlowers', 'dealer', 'consecutiveDealer',
    ]);
    out = out.filter(m => keep.has(m.id));
  }
  return out;
}

export function detectAll(hand, rules, tai) {
  const raw = [];
  for (const det of ALL_DETECTORS) {
    const result = det(hand, rules, tai);
    if (!result) continue;
    if (Array.isArray(result)) raw.push(...result);
    else raw.push(result);
  }
  return resolveMatches(raw);
}
