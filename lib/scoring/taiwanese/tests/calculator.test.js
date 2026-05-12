/**
 * Taiwanese calculator tests.
 *
 * Run with: node --test lib/scoring/taiwanese/tests/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../calculator.js';

const pong = (t, exposed = false) => ({ type: 'pong', tiles: [t, t, t], exposed });
const kong = (t, exposed = false) => ({ type: 'kong', tiles: [t, t, t, t], exposed });
const chow = (lo, suit, exposed = false) => ({
  type: 'chow',
  tiles: [`${lo}${suit}`, `${lo + 1}${suit}`, `${lo + 2}${suit}`],
  exposed,
});
const pair = (t) => ({ type: 'pair', tiles: [t, t] });

const defaultWin = (over = {}) => ({
  selfDrawn: false,
  seatWind: 'E',
  prevailingWind: 'E',
  ...over,
});

function ids(result) {
  return result.matches.map(m => m.id).sort();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test('hand requires exactly 5 sets', () => {
  const result = score({
    sets: [pong('1m', true), pong('5p', true), pong('9s', true), pong('3p', true)],
    pair: pair('4m'),
    win: defaultWin(),
  });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /exactly 5 sets/);
});

test('chicken hand: valid win with no patterns', () => {
  // Pong of simples + 4 chows in mixed suits + non-yakuhai pair → no patterns
  const result = score({
    sets: [
      pong('5m', true),
      chow(1, 'p'),
      chow(4, 's'),
      chow(2, 'm', true),
      chow(7, 'p'),
    ],
    pair: pair('3s'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.faan, 0);
  assert.deepEqual(ids(result), ['chickenHand']);
});

test('ping hu: all chows + non-yakuhai pair, all exposed (stacks with all-from-others)', () => {
  const result = score({
    sets: [
      chow(1, 'p', true), chow(4, 'p', true), chow(7, 'p', true),
      chow(1, 's', true), chow(4, 's', true),
    ],
    pair: pair('2m'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  // pingHu (2) + allFromOthers (1) = 3
  assert.equal(result.faan, 3);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('pingHu'));
  assert.ok(matchIds.includes('allFromOthers'));
});

test('all pongs: 4 tai (plus 1 if all exposed)', () => {
  const result = score({
    sets: [
      pong('2m', true), pong('5p', true), pong('8s', true),
      pong('3p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  // allPongs (4) + allFromOthers (1) = 5
  assert.equal(result.faan, 5);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('allPongs'));
  assert.ok(matchIds.includes('allFromOthers'));
});

test('pure one suit: caps at limit (8 tai default)', () => {
  // 5 chows + pair in pin suit
  const result = score({
    sets: [
      chow(1, 'p', true), chow(4, 'p', true), chow(7, 'p', true),
      chow(2, 'p', true), chow(5, 'p', true),
    ],
    pair: pair('3p'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  // pingHu (2) + pureOneSuit (8) = 10, capped at 8 limit
  assert.equal(result.faan, 8);
  assert.equal(result.isLimit, true);
});

test('mixed one suit: 4 tai with honor pong (all exposed adds all-from-others)', () => {
  const result = score({
    sets: [
      chow(1, 'p', true), chow(4, 'p', true), chow(7, 'p', true),
      pong('9p', true), pong('dG', true),
    ],
    pair: pair('5p'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  // mixedOneSuit (4) + dragonPong:dG (1) + allFromOthers (1) = 6
  assert.equal(result.faan, 6);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('mixedOneSuit'));
  assert.ok(matchIds.includes('dragonPong:dG'));
});

test('all honors: limit hand (8 tai)', () => {
  const result = score({
    sets: [
      pong('dR', true), pong('dG', true), pong('dW', true),
      pong('wE', true), pong('wS', true),
    ],
    pair: pair('wW'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 8);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('allHonors'));
  // Big three dragons subsumes individual dragon pongs
  assert.ok(matchIds.includes('bigThreeDragons'));
  assert.ok(!matchIds.some(id => id.startsWith('dragonPong:')));
});

test('concealed self-drawn: 3 tai (replaces concealed + selfDrawn stacking)', () => {
  const result = score({
    sets: [
      chow(1, 'p'), chow(4, 'p'), chow(7, 's'),
      chow(1, 'm'), pong('5p'),
    ],
    pair: pair('3s'),
    win: defaultWin({ selfDrawn: true }),
  });
  assert.equal(result.valid, true);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('concealedSelfDrawn'));
  assert.ok(!matchIds.includes('concealedHand'));
  assert.ok(!matchIds.includes('selfDrawn'));
});

test('all from others: 1 tai when all exposed + won by discard', () => {
  const result = score({
    sets: [
      pong('2m', true), pong('5p', true), pong('8s', true),
      pong('3p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin({ selfDrawn: false }),
  });
  // allPongs (4) + allFromOthers (1) = 5
  assert.equal(result.faan, 5);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('allFromOthers'));
});

test('dragon pong: +1 per dragon', () => {
  const result = score({
    sets: [
      pong('dR', true), chow(1, 'p'), chow(4, 's'), chow(2, 'm'), pong('5p', true),
    ],
    pair: pair('3m'),
    win: defaultWin(),
  });
  assert.equal(result.faan, 1);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('dragonPong:dR'));
});

test('seat wind pong: 1 tai when seat matches', () => {
  const result = score({
    sets: [
      pong('wS', true), chow(1, 'p'), chow(4, 's'), pong('5p', true), pong('7m', true),
    ],
    pair: pair('3m'),
    win: defaultWin({ seatWind: 'S' }),
  });
  const matchIds = ids(result);
  assert.ok(matchIds.includes('seatWindPong'));
  // not prevailing (prevailing is E by default)
  assert.ok(!matchIds.includes('prevailingWindPong'));
});

test('big three dragons: limit, subsumes dragon pongs + small3dragons', () => {
  const result = score({
    sets: [
      pong('dR', true), pong('dG', true), pong('dW', true),
      chow(1, 'p'), pong('5m', true),
    ],
    pair: pair('3m'),
    win: defaultWin(),
  });
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 8);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('bigThreeDragons'));
  assert.ok(!matchIds.includes('smallThreeDragons'));
  assert.ok(!matchIds.some(id => id.startsWith('dragonPong:')));
});

test('small three dragons: 4 tai', () => {
  const result = score({
    sets: [
      pong('dR', true), pong('dG', true), chow(1, 'p'),
      chow(4, 's'), pong('5m', true),
    ],
    pair: pair('dW'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('smallThreeDragons'));
});

test('big four winds: limit, subsumes wind pongs', () => {
  const result = score({
    sets: [
      pong('wE', true), pong('wS', true), pong('wW', true), pong('wN', true),
      pong('5m', true),
    ],
    pair: pair('3m'),
    win: defaultWin({ seatWind: 'E', prevailingWind: 'E' }),
  });
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 8);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('bigFourWinds'));
  assert.ok(!matchIds.includes('seatWindPong'));
  assert.ok(!matchIds.includes('prevailingWindPong'));
});

test('five concealed pongs: limit hand', () => {
  const result = score({
    sets: [
      pong('2m', false), pong('5p', false), pong('8s', false),
      pong('3p', false), pong('6m', false),
    ],
    pair: pair('4m'),
    win: defaultWin({ selfDrawn: true }),
  });
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 8);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('fiveConcealedPongs'));
  // Should subsume allPongs + concealedSelfDrawn
  assert.ok(!matchIds.includes('allPongs'));
  assert.ok(!matchIds.includes('concealedSelfDrawn'));
});

test('seven pairs: 4 tai (14-tile form)', () => {
  const result = score({
    special: {
      kind: 'sevenPairs',
      tiles: [
        '2m', '2m', '5m', '5m', '7p', '7p', '3s', '3s',
        '8s', '8s', 'wE', 'wE', 'dG', 'dG',
      ],
    },
    flowers: [],
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.faan, 4);
});

test('seven pairs: 16-tile form (8 pairs) also accepted', () => {
  const result = score({
    special: {
      kind: 'sevenPairs',
      tiles: [
        '2m', '2m', '5m', '5m', '7p', '7p', '3s', '3s',
        '8s', '8s', 'wE', 'wE', 'dG', 'dG', '4p', '4p',
      ],
    },
    flowers: [],
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.faan, 4);
});

test('flowers: per matching seat flower', () => {
  const result = score({
    sets: [
      pong('5m', true), pong('7p', true), pong('3s', true),
      pong('2p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    flowers: ['fE', 'zE', 'fS'],
    win: defaultWin({ seatWind: 'E' }),
  });
  // allPongs (4) + allFromOthers (1) + flowersSeat (2 — fE + zE match E) = 7
  assert.equal(result.faan, 7);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('flowersSeat'));
});

test('all 8 flowers: limit hand', () => {
  const result = score({
    sets: [
      chow(1, 'p'), chow(4, 'p'), chow(7, 'p'),
      chow(1, 's'), chow(4, 's'),
    ],
    pair: pair('5m'),
    flowers: ['fE', 'fS', 'fW', 'fN', 'zE', 'zS', 'zW', 'zN'],
    win: defaultWin({ seatWind: 'E' }),
  });
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 8);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('allFlowers'));
});

test('robbing the kong: +1 tai', () => {
  const result = score({
    sets: [
      pong('5m', true), pong('7p', true), pong('3s', true),
      pong('2p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin({ robbingKong: true }),
  });
  const matchIds = ids(result);
  assert.ok(matchIds.includes('robbingKong'));
});

test('last tile self-draw: 1 tai', () => {
  const result = score({
    sets: [
      pong('5m', true), pong('7p', true), pong('3s', true),
      pong('2p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin({ selfDrawn: true, lastTile: true }),
  });
  const matchIds = ids(result);
  assert.ok(matchIds.includes('lastTileSelfDraw'));
  assert.ok(!matchIds.includes('lastTileDiscard'));
});

test('dealer + consecutive dealer: +1 + N*2', () => {
  const result = score({
    sets: [
      pong('5m', true), pong('7p', true), pong('3s', true),
      pong('2p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin({ isDealer: true, consecutiveDealerWins: 2 }),
  });
  const matchIds = ids(result);
  assert.ok(matchIds.includes('dealer'));
  assert.ok(matchIds.includes('consecutiveDealer'));
  // dealer(1) + consecutiveDealer(2×2=4) + allPongs(4) + allFromOthers(1) = 10, capped to 8
  assert.equal(result.faan, 8);
});

test('heavenly hand: limit, subsumes structural patterns', () => {
  const result = score({
    sets: [
      pong('5m', true), pong('7p', true), pong('3s', true),
      pong('2p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin({ heavenlyHand: true, selfDrawn: true, isDealer: true }),
  });
  assert.equal(result.isLimit, true);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('heavenlyHand'));
  assert.ok(!matchIds.includes('allPongs'));
});

test('all-from-others requires win on discard', () => {
  const result = score({
    sets: [
      pong('5m', true), pong('7p', true), pong('3s', true),
      pong('2p', true), pong('6m', true),
    ],
    pair: pair('4m'),
    win: defaultWin({ selfDrawn: true }),
  });
  const matchIds = ids(result);
  assert.ok(!matchIds.includes('allFromOthers'));
});

test('invalid hand: ping hu rejected with yakuhai pair', () => {
  const result = score({
    sets: [
      chow(1, 'p', true), chow(4, 'p', true), chow(7, 'p', true),
      chow(1, 's', true), chow(4, 's', true),
    ],
    pair: pair('dR'),
    win: defaultWin(),
  });
  const matchIds = ids(result);
  assert.ok(!matchIds.includes('pingHu'));
});

test('non-sequential chow rejected at parse time', () => {
  const result = score({
    sets: [
      { type: 'chow', tiles: ['1m', '3m', '5m'], exposed: false },
      chow(1, 'p'), chow(4, 's'), chow(7, 'p'), pong('5m'),
    ],
    pair: pair('3s'),
    win: defaultWin(),
  });
  assert.equal(result.valid, false);
});
