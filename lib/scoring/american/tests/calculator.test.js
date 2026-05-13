/**
 * American (NMJL) calculator tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../calculator.js';

test('basic hand with joker, won by discard: no multipliers, base value only', () => {
  const r = score({
    tiles: ['1m','1m','1m','jk','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s'],
    userPoints: 25,
    win: { selfDrawn: false },
  });
  assert.equal(r.valid, true);
  assert.equal(r.faan, 25);
  assert.equal(r.multiplier, 1);
});

test('self-drawn (with joker present) doubles the score', () => {
  const r = score({
    tiles: ['1m','1m','1m','jk','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s'],
    userPoints: 25,
    win: { selfDrawn: true },
  });
  assert.equal(r.faan, 50);
  assert.equal(r.multiplier, 2);
});

test('jokerless doubles the score', () => {
  const r = score({
    tiles: ['1m','1m','1m','2m','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s'],
    userPoints: 25,
    win: { selfDrawn: false },
  });
  assert.equal(r.faan, 50); // jokerless multiplier
  assert.equal(r.multiplier, 2);
});

test('self-drawn + jokerless: 4x multiplier', () => {
  const r = score({
    tiles: ['1m','1m','1m','2m','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s'],
    userPoints: 25,
    win: { selfDrawn: true },
  });
  assert.equal(r.faan, 100);
  assert.equal(r.multiplier, 4);
});

test('jokers present: no jokerless bonus, base value only on discard', () => {
  const r = score({
    tiles: ['1m','1m','jk','jk','2m','3m','4m','5p','5p','5p','7s','7s','7s','9s'],
    userPoints: 25,
    win: { selfDrawn: false },
  });
  assert.equal(r.faan, 25); // no multipliers
  assert.equal(r.multiplier, 1);
});

test('userPoints required + must be positive', () => {
  const r = score({
    tiles: ['1m','1m','1m','2m','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s'],
    win: {},
  });
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /userPoints/);
});

test('rejects unknown tile string', () => {
  const r = score({
    tiles: ['1m','BADTILE','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s','dR','dR'],
    userPoints: 25,
    win: {},
  });
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /Unknown tile/);
});

test('rejects too few tiles', () => {
  const r = score({
    tiles: ['1m','1m','1m','2m','3m','4m','5p','5p','5p'],
    userPoints: 25,
    win: {},
  });
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /at least 14/);
});

test('rejects too many jokers (>8)', () => {
  const r = score({
    tiles: ['jk','jk','jk','jk','jk','jk','jk','jk','jk','1m','2m','3m','4m','5m'],
    userPoints: 25,
    win: {},
  });
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /jokers/);
});

test('joker in a pair is flagged as a warning (not blocking)', () => {
  const r = score({
    tiles: ['jk','1m','1m','1m','2m','3m','4m','5p','5p','5p','7s','7s','7s','9s'],
    userPoints: 25,
    win: {},
    groupings: [
      { type: 'pair', tiles: ['jk', '9s'] },
      { type: 'pong', tiles: ['1m','1m','1m'] },
    ],
  });
  // Still valid (warnings don't block); but a warning is present.
  assert.equal(r.valid, true);
  const warning = r.matches.find(m => m.warning);
  assert.ok(warning, 'expected joker placement warning');
});

test('classifies All Same Suit', () => {
  const r = score({
    tiles: ['1p','2p','3p','4p','5p','6p','7p','8p','9p','1p','2p','3p','4p','5p'],
    userPoints: 25,
    win: {},
  });
  assert.equal(r.valid, true);
  const cat = r.matches.find(m => m.id?.startsWith('category:'));
  assert.equal(cat.id, 'category:all-same-suit');
});

test('classifies Like Numbers', () => {
  const r = score({
    tiles: ['1m','1m','1p','1p','1s','1s','1m','1p','1s','1m','1p','1s','dR','dR'],
    userPoints: 30,
    win: {},
  });
  const cat = r.matches.find(m => m.id?.startsWith('category:'));
  assert.equal(cat.id, 'category:like-numbers');
});

test('classifies Winds & Dragons', () => {
  const r = score({
    tiles: ['wE','wE','wE','wS','wS','wS','wW','wW','wW','wN','wN','wN','dR','dR'],
    userPoints: 25,
    win: {},
  });
  const cat = r.matches.find(m => m.id?.startsWith('category:'));
  assert.equal(cat.id, 'category:winds-dragons');
});

test('classifies Singles & Pairs (no triplets, no jokers)', () => {
  const r = score({
    tiles: ['1m','1m','2m','2m','3m','3m','4m','5m','6m','7m','8m','9m','dR','dR'],
    userPoints: 50,
    win: {},
  });
  const cat = r.matches.find(m => m.id?.startsWith('category:'));
  assert.equal(cat.id, 'category:singles-and-pairs');
});

test('handTitle reflects user-entered pattern name when given', () => {
  const r = score({
    tiles: ['1m','1m','1m','2m','3m','4m','5p','5p','5p','7s','7s','7s','9s','9s'],
    userPoints: 25,
    patternName: 'LIKE NUMBERS #3',
    win: {},
  });
  assert.equal(r.handTitle, 'LIKE NUMBERS #3');
});
