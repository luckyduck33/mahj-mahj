/**
 * Calculator tests — end-to-end faan scoring.
 *
 * Run with:  cd lib/scoring && node --test hong-kong/tests/
 * Or:        node --test mahj-mahj/lib/scoring/hong-kong/tests/calculator.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../calculator.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function getFaan(result, id) {
  const m = result.matches.find(x => x.id === id);
  return m ? m.faan : null;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test('chicken hand: valid win with no scoring patterns', () => {
  // All chows in one suit + chows in another + plain pair → no points patterns
  // We need a pair that's not yakuhai and a mix of chow suits so no flush.
  // But "all chows + non-yakuhai pair" IS "all chows" = 1 faan. To get a true
  // chicken hand we need a pong of simples (no yakuhai) + 3 chows.
  const result = score({
    sets: [
      pong('5m', true),         // pong of simples — not yakuhai
      chow(1, 'p'),
      chow(4, 's'),
      chow(7, 'p'),
    ],
    pair: pair('3s'),           // non-yakuhai pair
    flowers: [],
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.faan, 0);
  assert.deepEqual(ids(result), ['chickenHand']);
});

test('all pongs: three faan', () => {
  const result = score({
    sets: [pong('2m', true), pong('5p', true), pong('8s', true), pong('3p', true)],
    pair: pair('4m'),  // non-yakuhai pair
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.faan, 3);
  assert.deepEqual(ids(result), ['allPongs']);
});

test('mixed one suit: three faan (one suit + honors)', () => {
  const result = score({
    sets: [chow(1, 'p'), chow(4, 'p'), chow(7, 'p'), pong('dG', true)],
    pair: pair('5p'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  // Mixed one suit (3) + dragon pong (1) = 4 faan
  // The chows + dragon pong + pair-of-5p combo makes the pair yakuhai-free,
  // but the green-dragon pong disqualifies allChows.
  assert.equal(result.faan, 4);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('mixedOneSuit'), `expected mixedOneSuit in ${matchIds}`);
  assert.ok(matchIds.includes('dragonPong:dG'), `expected dragon pong in ${matchIds}`);
});

test('pure one suit: seven faan', () => {
  const result = score({
    sets: [chow(1, 's'), chow(4, 's'), chow(7, 's'), pong('2s', true)],
    pair: pair('5s'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.faan, 7);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('pureOneSuit'));
  assert.ok(!matchIds.includes('mixedOneSuit'), 'mixedOneSuit must be subsumed');
});

test('concealed + self-drawn together add to base hand', () => {
  // Mixed one suit, all concealed, self-drawn
  const result = score({
    sets: [
      { ...chow(1, 'p'), exposed: false },
      { ...chow(4, 'p'), exposed: false },
      { ...chow(7, 'p'), exposed: false },
      pong('dR', false),
    ],
    pair: pair('5p'),
    win: defaultWin({ selfDrawn: true }),
  });
  assert.equal(result.valid, true);
  // mixedOneSuit (3) + dragonPong R (1) + concealed (1) + selfDrawn (1) = 6
  assert.equal(result.faan, 6);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('concealedHand'));
  assert.ok(matchIds.includes('selfDrawn'));
});

test('all honors: limit hand', () => {
  const result = score({
    sets: [pong('dR', true), pong('dG', true), pong('dW', true), pong('wE', true)],
    pair: pair('wS'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 10);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('allHonors'));
  // Big Three Dragons subsumes individual dragon pongs
  assert.ok(matchIds.includes('bigThreeDragons'));
  assert.ok(!matchIds.some(id => id.startsWith('dragonPong:')));
});

test('thirteen orphans: limit hand', () => {
  const result = score({
    special: {
      kind: 'thirteenOrphans',
      tiles: [
        '1m', '9m', '1p', '9p', '1s', '9s',
        'wE', 'wS', 'wW', 'wN',
        'dR', 'dG', 'dW',
        '1m', // pair
      ],
    },
    flowers: [],
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 10);
  assert.deepEqual(ids(result).filter(i => i === 'thirteenOrphans'), ['thirteenOrphans']);
});

test('seven pairs: four faan', () => {
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
  assert.deepEqual(ids(result), ['sevenPairs']);
});

test('dragon pong: adds 1 faan per dragon', () => {
  const result = score({
    sets: [pong('dR', true), chow(2, 'm'), chow(5, 'm'), chow(7, 'p')],
    pair: pair('3p'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  // dragonPong:dR (1) only
  assert.equal(getFaan(result, 'dragonPong:dR'), 1);
  assert.equal(result.faan, 1);
});

test('seat wind pong vs prevailing wind pong score separately when same', () => {
  // East seat in East round, with a pong of East: scores both
  const result = score({
    sets: [pong('wE', true), pong('5m', true), pong('7p', true), pong('3s', true)],
    pair: pair('2m'),
    win: defaultWin({ seatWind: 'E', prevailingWind: 'E' }),
  });
  assert.equal(result.valid, true);
  // allPongs (3) + seatWindPong (1) + prevailingWindPong (1) = 5
  assert.equal(result.faan, 5);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('seatWindPong'));
  assert.ok(matchIds.includes('prevailingWindPong'));
});

test('seat wind pong only when prevailing differs', () => {
  const result = score({
    sets: [pong('wS', true), pong('5m', true), pong('7p', true), pong('3s', true)],
    pair: pair('2m'),
    win: defaultWin({ seatWind: 'S', prevailingWind: 'E' }),
  });
  // allPongs (3) + seatWindPong (1) = 4
  assert.equal(result.faan, 4);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('seatWindPong'));
  assert.ok(!matchIds.includes('prevailingWindPong'));
});

test('flower bonus: one matching seat flower = 1 faan', () => {
  const result = score({
    sets: [pong('5m', true), pong('7p', true), pong('3s', true), pong('2p', true)],
    pair: pair('4m'),
    flowers: ['fE'],  // East flower
    win: defaultWin({ seatWind: 'E' }),
  });
  // allPongs (3) + flowersSeat (1) = 4
  assert.equal(result.faan, 4);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('flowersSeat'));
});

test('full flowers set bonus stacks with seat flower', () => {
  const result = score({
    sets: [pong('5m', true), pong('7p', true), pong('3s', true), pong('2p', true)],
    pair: pair('4m'),
    flowers: ['fE', 'fS', 'fW', 'fN'],
    win: defaultWin({ seatWind: 'E' }),
  });
  // allPongs (3) + flowersSeat (1 from fE) + fullFlowers (2) = 6
  assert.equal(result.faan, 6);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('flowersSeat'));
  assert.ok(matchIds.includes('fullFlowers'));
});

test('robbing the kong: +1 faan', () => {
  const result = score({
    sets: [pong('5m', true), pong('7p', true), pong('3s', true), pong('2p', true)],
    pair: pair('4m'),
    win: defaultWin({ robbingKong: true }),
  });
  // allPongs (3) + robbingKong (1) = 4
  assert.equal(result.faan, 4);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('robbingKong'));
});

test('kong tiles count as triplet shape for all pongs', () => {
  const result = score({
    sets: [kong('5m', true), pong('7p', true), pong('3s', true), pong('2p', true)],
    pair: pair('4m'),
    win: defaultWin(),
  });
  assert.equal(result.faan, 3);
  assert.ok(ids(result).includes('allPongs'));
});

test('big three dragons subsumes individual dragon pongs + small3dragons', () => {
  const result = score({
    sets: [pong('dR', true), pong('dG', true), pong('dW', true), pong('5m', true)],
    pair: pair('4m'),
    win: defaultWin(),
  });
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 10);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('bigThreeDragons'));
  assert.ok(!matchIds.includes('smallThreeDragons'));
  assert.ok(!matchIds.some(id => id.startsWith('dragonPong:')));
});

test('small three dragons: two dragon pongs + dragon pair', () => {
  const result = score({
    sets: [pong('dR', true), pong('dG', true), chow(1, 'p'), chow(4, 's')],
    pair: pair('dW'),
    win: defaultWin(),
  });
  assert.equal(result.valid, true);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('smallThreeDragons'));
  // smallThreeDragons (5) + dragonPong:dR (1) + dragonPong:dG (1) = 7
  assert.equal(result.faan, 7);
});

test('big four winds: limit hand, subsumes wind pongs', () => {
  const result = score({
    sets: [pong('wE', true), pong('wS', true), pong('wW', true), pong('wN', true)],
    pair: pair('5m'),
    win: defaultWin({ seatWind: 'E', prevailingWind: 'E' }),
  });
  assert.equal(result.isLimit, true);
  assert.equal(result.faan, 10);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('bigFourWinds'));
  assert.ok(!matchIds.includes('seatWindPong'));
  assert.ok(!matchIds.includes('prevailingWindPong'));
});

test('all chows requires non-yakuhai pair', () => {
  // Pair of seat wind disqualifies allChows
  const result = score({
    sets: [chow(1, 'p'), chow(4, 'p'), chow(7, 's'), chow(1, 'm')],
    pair: pair('wE'),
    win: defaultWin({ seatWind: 'E' }),
  });
  // Should NOT have allChows match
  const matchIds = ids(result);
  assert.ok(!matchIds.includes('allChows'));
});

test('all chows: 1 faan when chows are exposed', () => {
  const result = score({
    sets: [chow(1, 'p', true), chow(4, 'p', true), chow(7, 's', true), chow(1, 'm', true)],
    pair: pair('5m'),
    win: defaultWin({ seatWind: 'E', prevailingWind: 'E' }),
  });
  assert.equal(result.faan, 1);
  assert.deepEqual(ids(result), ['allChows']);
});

test('all chows concealed: 2 faan (allChows + concealedHand)', () => {
  const result = score({
    sets: [chow(1, 'p'), chow(4, 'p'), chow(7, 's'), chow(1, 'm')],
    pair: pair('5m'),
    win: defaultWin({ seatWind: 'E', prevailingWind: 'E' }),
  });
  assert.equal(result.faan, 2);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('allChows'));
  assert.ok(matchIds.includes('concealedHand'));
});

test('win on kong draw bonus', () => {
  const result = score({
    sets: [kong('5m', false), chow(1, 'p'), chow(4, 'p'), chow(7, 's')],
    pair: pair('3p'),
    win: defaultWin({ selfDrawn: true, winOnKongDraw: true }),
  });
  // concealedHand (1) + selfDrawn (1) + winOnKongDraw (1) = 3
  assert.equal(result.faan, 3);
  const matchIds = ids(result);
  assert.ok(matchIds.includes('winOnKongDraw'));
  assert.ok(matchIds.includes('selfDrawn'));
});

test('faan caps at rules.limit', () => {
  // Pure one suit (7) + all pongs (3) + concealed (1) + selfDrawn (1) = 12 → capped at 10
  const result = score({
    sets: [
      { ...pong('1s', false), exposed: false },
      { ...pong('4s', false), exposed: false },
      { ...pong('7s', false), exposed: false },
      { ...pong('9s', false), exposed: false },
    ],
    pair: pair('2s'),
    win: defaultWin({ selfDrawn: true }),
  });
  assert.equal(result.valid, true);
  // Raw 12, capped to 10 limit
  assert.equal(result.faanRaw, 12);
  assert.equal(result.faan, 10);
  assert.equal(result.isLimit, true);
});

test('invalid hand: wrong set count', () => {
  const result = score({
    sets: [pong('5m', true), pong('7p', true), pong('3s', true)],
    pair: pair('4m'),
    win: defaultWin(),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors && result.errors.length > 0);
});

test('invalid hand: non-sequential chow', () => {
  const result = score({
    sets: [
      { type: 'chow', tiles: ['1m', '3m', '5m'], exposed: false },
      chow(1, 'p'), chow(4, 's'), chow(7, 'p'),
    ],
    pair: pair('3s'),
    win: defaultWin(),
  });
  assert.equal(result.valid, false);
});

test('invalid hand: pong of mismatched tiles', () => {
  const result = score({
    sets: [
      { type: 'pong', tiles: ['1m', '1m', '2m'], exposed: false },
      chow(1, 'p'), chow(4, 's'), chow(7, 'p'),
    ],
    pair: pair('3s'),
    win: defaultWin(),
  });
  assert.equal(result.valid, false);
});
