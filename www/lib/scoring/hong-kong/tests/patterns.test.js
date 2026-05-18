/**
 * Pattern-detector unit tests — exercise detectors in isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPureOneSuit, detectMixedOneSuit, detectAllPongs, detectAllChows,
  detectAllHonors, detectAllTerminals, detectConcealedHand,
  detectSeatWindPong, detectPrevailingWindPong, detectDragonPongs,
  detectSmallThreeDragons, detectBigThreeDragons, detectBigFourWinds,
  detectSmallFourWinds, detectNineGates, detectFlowers,
  resolveMatches,
} from '../patterns.js';
import { parseHand } from '../hand-parser.js';
import { DEFAULT_RULES, DEFAULT_FAAN } from '../rules.js';

const rules = DEFAULT_RULES;
const faan = DEFAULT_FAAN;

function buildHand(over = {}) {
  return parseHand({
    sets: [
      { type: 'chow', tiles: ['1m', '2m', '3m'], exposed: false },
      { type: 'chow', tiles: ['4p', '5p', '6p'], exposed: false },
      { type: 'chow', tiles: ['7s', '8s', '9s'], exposed: false },
      { type: 'pong', tiles: ['5m', '5m', '5m'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['2p', '2p'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
    ...over,
  });
}

test('detectPureOneSuit: returns null for mixed suits', () => {
  const result = detectPureOneSuit(buildHand(), rules, faan);
  assert.equal(result, null);
});

test('detectPureOneSuit: matches single-suit hand', () => {
  const hand = parseHand({
    sets: [
      { type: 'chow', tiles: ['1p', '2p', '3p'], exposed: false },
      { type: 'chow', tiles: ['4p', '5p', '6p'], exposed: false },
      { type: 'chow', tiles: ['7p', '8p', '9p'], exposed: false },
      { type: 'pong', tiles: ['5p', '5p', '5p'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['2p', '2p'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  const result = detectPureOneSuit(hand, rules, faan);
  assert.ok(result);
  assert.equal(result.id, 'pureOneSuit');
  assert.equal(result.faan, 7);
});

test('detectMixedOneSuit: needs honors + one numbered suit', () => {
  const hand = parseHand({
    sets: [
      { type: 'chow', tiles: ['1p', '2p', '3p'], exposed: false },
      { type: 'chow', tiles: ['4p', '5p', '6p'], exposed: false },
      { type: 'pong', tiles: ['9p', '9p', '9p'], exposed: false },
      { type: 'pong', tiles: ['dR', 'dR', 'dR'], exposed: true },
    ],
    pair: { type: 'pair', tiles: ['wE', 'wE'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'S', prevailingWind: 'E' },
  });
  const result = detectMixedOneSuit(hand, rules, faan);
  assert.ok(result);
  assert.equal(result.faan, 3);
});

test('detectAllPongs: 4 pongs, regardless of exposure', () => {
  const hand = parseHand({
    sets: [
      { type: 'pong', tiles: ['1m', '1m', '1m'], exposed: true },
      { type: 'pong', tiles: ['5p', '5p', '5p'], exposed: false },
      { type: 'kong', tiles: ['3s', '3s', '3s', '3s'], exposed: true },
      { type: 'pong', tiles: ['9p', '9p', '9p'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['2m', '2m'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  const result = detectAllPongs(hand, rules, faan);
  assert.ok(result);
  assert.equal(result.faan, 3);
});

test('detectAllChows: rejects yakuhai pair', () => {
  const hand = parseHand({
    sets: [
      { type: 'chow', tiles: ['1m', '2m', '3m'], exposed: false },
      { type: 'chow', tiles: ['4m', '5m', '6m'], exposed: false },
      { type: 'chow', tiles: ['1p', '2p', '3p'], exposed: false },
      { type: 'chow', tiles: ['7s', '8s', '9s'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['dR', 'dR'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  assert.equal(detectAllChows(hand, rules, faan), null);
});

test('detectConcealedHand: all sets concealed → match', () => {
  const hand = buildHand();
  assert.ok(detectConcealedHand(hand, rules, faan));
});

test('detectConcealedHand: one exposed → no match', () => {
  const hand = buildHand({
    sets: [
      { type: 'chow', tiles: ['1m', '2m', '3m'], exposed: true },
      { type: 'chow', tiles: ['4p', '5p', '6p'], exposed: false },
      { type: 'chow', tiles: ['7s', '8s', '9s'], exposed: false },
      { type: 'pong', tiles: ['5m', '5m', '5m'], exposed: false },
    ],
  });
  assert.equal(detectConcealedHand(hand, rules, faan), null);
});

test('detectDragonPongs: one per dragon', () => {
  const hand = parseHand({
    sets: [
      { type: 'pong', tiles: ['dR', 'dR', 'dR'], exposed: true },
      { type: 'pong', tiles: ['dG', 'dG', 'dG'], exposed: false },
      { type: 'chow', tiles: ['1p', '2p', '3p'], exposed: false },
      { type: 'chow', tiles: ['4s', '5s', '6s'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['5m', '5m'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  const result = detectDragonPongs(hand, rules, faan);
  assert.equal(result.length, 2);
  assert.ok(result.every(m => m.faan === 1));
});

test('detectNineGates: matches the canonical pattern', () => {
  // Concealed, single suit, 1112345678999 + extra 5
  const hand = parseHand({
    sets: [
      { type: 'pong', tiles: ['1m', '1m', '1m'], exposed: false },
      { type: 'chow', tiles: ['2m', '3m', '4m'], exposed: false },
      { type: 'chow', tiles: ['5m', '6m', '7m'], exposed: false },
      { type: 'pong', tiles: ['9m', '9m', '9m'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['8m', '8m'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  const result = detectNineGates(hand, rules, faan);
  assert.ok(result, 'expected nineGates match');
  assert.equal(result.faan, rules.limit);
});

test('detectNineGates: rejected when exposed', () => {
  const hand = parseHand({
    sets: [
      { type: 'pong', tiles: ['1m', '1m', '1m'], exposed: true },
      { type: 'chow', tiles: ['2m', '3m', '4m'], exposed: false },
      { type: 'chow', tiles: ['5m', '6m', '7m'], exposed: false },
      { type: 'pong', tiles: ['9m', '9m', '9m'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['8m', '8m'] },
    flowers: [],
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  assert.equal(detectNineGates(hand, rules, faan), null);
});

test('detectFlowers: matches seat flower', () => {
  const hand = parseHand({
    sets: [
      { type: 'chow', tiles: ['1m', '2m', '3m'], exposed: false },
      { type: 'chow', tiles: ['4p', '5p', '6p'], exposed: false },
      { type: 'chow', tiles: ['7s', '8s', '9s'], exposed: false },
      { type: 'pong', tiles: ['5m', '5m', '5m'], exposed: false },
    ],
    pair: { type: 'pair', tiles: ['2p', '2p'] },
    flowers: ['fE', 'fS', 'zE'],  // E flower + E season match seat E
    win: { selfDrawn: false, seatWind: 'E', prevailingWind: 'E' },
  });
  const result = detectFlowers(hand, rules, faan);
  const seatFlowerMatch = result.find(m => m.id === 'flowersSeat');
  assert.ok(seatFlowerMatch);
  assert.equal(seatFlowerMatch.faan, 2); // fE + zE match seat E
});

test('resolveMatches: nineGates subsumes pureOneSuit + concealed', () => {
  const matches = [
    { id: 'nineGates', name: 'Nine Gates', faan: 10, isLimit: true },
    { id: 'pureOneSuit', name: 'Pure One Suit', faan: 7 },
    { id: 'concealedHand', name: 'Concealed Hand', faan: 1 },
  ];
  const out = resolveMatches(matches);
  const matchIds = out.map(m => m.id);
  assert.deepEqual(matchIds.sort(), ['nineGates']);
});

test('resolveMatches: bigThreeDragons subsumes individual dragon pongs', () => {
  const matches = [
    { id: 'bigThreeDragons', name: 'Big Three Dragons', faan: 10, isLimit: true },
    { id: 'dragonPong:dR', name: 'Red Dragon Pong', faan: 1 },
    { id: 'dragonPong:dG', name: 'Green Dragon Pong', faan: 1 },
    { id: 'dragonPong:dW', name: 'White Dragon Pong', faan: 1 },
    { id: 'smallThreeDragons', name: 'Small Three Dragons', faan: 5 },
  ];
  const out = resolveMatches(matches);
  assert.deepEqual(out.map(m => m.id), ['bigThreeDragons']);
});

test('resolveMatches: bigFourWinds clears wind-pong matches', () => {
  const matches = [
    { id: 'bigFourWinds', name: 'Big Four Winds', faan: 10, isLimit: true },
    { id: 'seatWindPong', faan: 1 },
    { id: 'prevailingWindPong', faan: 1 },
    { id: 'smallFourWinds', faan: 10 },
  ];
  const out = resolveMatches(matches);
  assert.deepEqual(out.map(m => m.id), ['bigFourWinds']);
});
