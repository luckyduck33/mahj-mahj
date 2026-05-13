/**
 * Smoke tests for the server-side set-repair logic in api/identify-tiles.js.
 *
 * Run with: node --test api/_repair.test.mjs
 *
 * Re-implements the function under test (the original is bundled with the
 * Vercel handler and not easily extracted). Keep this in sync — it's a
 * spec for the repair contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror the production logic exactly.
function isNumberedSuit(t) { return typeof t === 'string' && /^[1-9][mps]$/.test(t); }
function isValidChow(ts) {
  if (ts.length !== 3) return false;
  if (!ts.every(isNumberedSuit)) return false;
  const suit = ts[0][1];
  if (!ts.every(t => t[1] === suit)) return false;
  const vs = ts.map(t => Number(t[0])).sort((a, b) => a - b);
  if (vs[0] === vs[1] || vs[1] === vs[2]) return false;
  return vs[0] + 1 === vs[1] && vs[1] + 1 === vs[2];
}
function isValidPong(ts) { return ts.length === 3 && ts[0] === ts[1] && ts[1] === ts[2]; }

function repairSets(parsed) {
  if (!parsed || !Array.isArray(parsed.sets)) return parsed;
  const tiles = Array.isArray(parsed.tiles) ? parsed.tiles : [];
  const repairNotes = [];
  const repairedSets = [];

  for (const s of parsed.sets) {
    const indices = Array.isArray(s.tile_indices) ? s.tile_indices : [];
    const tileObjs = indices.map(i => tiles[i]).filter(Boolean);
    const tileStrings = tileObjs.map(t => t.tile);

    if (s.type === 'chow' && isValidChow(tileStrings)) { repairedSets.push(s); continue; }
    if (s.type === 'pong' && isValidPong(tileStrings)) { repairedSets.push(s); continue; }
    if (s.type === 'pair' && tileStrings.length === 2 && tileStrings[0] === tileStrings[1]) {
      repairedSets.push(s); continue;
    }

    if ((s.type === 'chow' || s.type === 'pong') && tileStrings.length === 3) {
      const counts = Object.create(null);
      for (const t of tileStrings) counts[t] = (counts[t] || 0) + 1;
      const sortedByCount = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const [topTile, topCount] = sortedByCount[0];
      const before = `[${tileStrings.join(',')}]`;

      if (topCount === 3) {
        repairedSets.push({ ...s, type: 'pong' });
        repairNotes.push(`Set ${before}: was '${s.type}', recognized as pong.`);
        continue;
      }
      if (topCount === 2) {
        const oddTile = tileStrings.find(t => t !== topTile);
        const oddIdx = indices[tileStrings.indexOf(oddTile)];
        if (oddIdx != null && tiles[oddIdx]) {
          tiles[oddIdx] = { tile: topTile, confidence: 0.4 };
        }
        repairedSets.push({ ...s, type: 'pong' });
        repairNotes.push(`Set ${before}: reinterpreted as pong of ${topTile}.`);
        continue;
      }
      const sortedByConf = [...tileObjs].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      const bestTile = sortedByConf[0]?.tile;
      if (bestTile && isNumberedSuit(bestTile)) {
        for (const i of indices) {
          if (tiles[i]) tiles[i] = { tile: bestTile, confidence: 0.35 };
        }
        repairedSets.push({ ...s, type: 'pong' });
        repairNotes.push(`Set ${before}: best guess pong of ${bestTile}.`);
        continue;
      }
      repairNotes.push(`Set ${before}: couldn't reinterpret.`);
      continue;
    }
    repairedSets.push(s);
  }

  if (repairNotes.length === 0) return parsed;
  return { ...parsed, tiles, sets: repairedSets, notes: [parsed.notes, ...repairNotes].filter(Boolean).join(' · '), _repaired: true };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test('valid chow passes through unchanged', () => {
  const input = {
    tiles: [{ tile: '3p', confidence: 0.9 }, { tile: '4p', confidence: 0.9 }, { tile: '5p', confidence: 0.9 }],
    sets: [{ type: 'chow', tile_indices: [0, 1, 2], exposed: false }],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, undefined);
  assert.equal(out.sets[0].type, 'chow');
});

test("the failing case: chow '3p,8p,9p' becomes pong of highest-confidence value", () => {
  // Real-world failure: model emitted invalid chow on 3 identical tiles
  const input = {
    tiles: [
      { tile: '3p', confidence: 0.4 },
      { tile: '8p', confidence: 0.55 },
      { tile: '9p', confidence: 0.35 },
    ],
    sets: [{ type: 'chow', tile_indices: [0, 1, 2], exposed: false }],
    notes: '',
  };
  const out = repairSets(input);
  assert.equal(out._repaired, true);
  assert.equal(out.sets[0].type, 'pong');
  // Should pick 8p (highest confidence) and rewrite all three
  assert.equal(out.tiles[0].tile, '8p');
  assert.equal(out.tiles[1].tile, '8p');
  assert.equal(out.tiles[2].tile, '8p');
  // All marked low confidence
  assert.ok(out.tiles.every(t => t.confidence <= 0.4));
  assert.match(out.notes, /pong of 8p/);
});

test("3 identical tiles labeled 'chow' become pong cleanly", () => {
  const input = {
    tiles: [
      { tile: '5m', confidence: 0.9 },
      { tile: '5m', confidence: 0.9 },
      { tile: '5m', confidence: 0.9 },
    ],
    sets: [{ type: 'chow', tile_indices: [0, 1, 2], exposed: false }],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, true);
  assert.equal(out.sets[0].type, 'pong');
  // High-confidence tiles stay high-confidence (no rewrite needed)
  assert.equal(out.tiles[0].confidence, 0.9);
});

test('2/3 match — model misread one tile', () => {
  const input = {
    tiles: [
      { tile: '4p', confidence: 0.9 },
      { tile: '4p', confidence: 0.9 },
      { tile: '7p', confidence: 0.4 }, // misread
    ],
    sets: [{ type: 'chow', tile_indices: [0, 1, 2], exposed: false }],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, true);
  assert.equal(out.sets[0].type, 'pong');
  // The misread tile gets rewritten
  assert.equal(out.tiles[2].tile, '4p');
  assert.ok(out.tiles[2].confidence <= 0.4);
});

test('valid pong passes through unchanged', () => {
  const input = {
    tiles: [
      { tile: 'dR', confidence: 0.99 },
      { tile: 'dR', confidence: 0.99 },
      { tile: 'dR', confidence: 0.99 },
    ],
    sets: [{ type: 'pong', tile_indices: [0, 1, 2], exposed: true }],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, undefined);
});

test('valid pair passes through', () => {
  const input = {
    tiles: [{ tile: 'wS', confidence: 0.95 }, { tile: 'wS', confidence: 0.95 }],
    sets: [{ type: 'pair', tile_indices: [0, 1], exposed: false }],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, undefined);
});

test('multiple invalid chows in one response all get repaired', () => {
  const input = {
    tiles: [
      { tile: '3p', confidence: 0.5 }, { tile: '8p', confidence: 0.5 }, { tile: '9p', confidence: 0.5 },
      { tile: '4m', confidence: 0.5 }, { tile: '4m', confidence: 0.5 }, { tile: '4m', confidence: 0.9 },
      { tile: 'dR', confidence: 0.99 }, { tile: 'dR', confidence: 0.99 },
    ],
    sets: [
      { type: 'chow', tile_indices: [0, 1, 2], exposed: false },
      { type: 'chow', tile_indices: [3, 4, 5], exposed: false },
      { type: 'pair', tile_indices: [6, 7], exposed: false },
    ],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, true);
  assert.equal(out.sets[0].type, 'pong');
  assert.equal(out.sets[1].type, 'pong');
  assert.equal(out.sets[2].type, 'pair'); // pair untouched
});

test('chow with mixed suits gets repaired to pong', () => {
  const input = {
    tiles: [
      { tile: '3p', confidence: 0.7 },
      { tile: '3s', confidence: 0.4 },  // wrong suit
      { tile: '3m', confidence: 0.4 },  // wrong suit
    ],
    sets: [{ type: 'chow', tile_indices: [0, 1, 2], exposed: false }],
  };
  const out = repairSets(input);
  assert.equal(out._repaired, true);
  assert.equal(out.sets[0].type, 'pong');
  // Highest confidence is 3p — should win
  assert.equal(out.tiles[0].tile, '3p');
  assert.equal(out.tiles[1].tile, '3p');
  assert.equal(out.tiles[2].tile, '3p');
});

test('no sets in response is fine', () => {
  const input = { tiles: [], sets: [], notes: '' };
  const out = repairSets(input);
  assert.equal(out._repaired, undefined);
});
