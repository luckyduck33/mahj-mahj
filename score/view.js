/**
 * Score My Hand — UI module.
 *
 * Imported lazily from index.html when the user first opens the Score tab.
 * Owns its own state, builds DOM into the host container, and calls the
 * scoring engine in lib/scoring/.
 */

import { score } from '../lib/scoring/hong-kong/calculator.js';
import { explain } from '../lib/scoring/hong-kong/explain.js';
import { drawScorecard } from './scorecard.js';
import { capturePhoto, identifyTiles, buildStatePatch } from './photo.js';

// ─── Tile constants ────────────────────────────────────────────────────────

const SUITS_GROUPED = [
  { label: 'Characters', tiles: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'] },
  { label: 'Bamboo',     tiles: ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'] },
  { label: 'Dots',       tiles: ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'] },
  { label: 'Winds',      tiles: ['wE', 'wS', 'wW', 'wN'] },
  { label: 'Dragons',    tiles: ['dR', 'dG', 'dW'] },
];
const BONUS_TILES = [
  { label: 'Flowers', tiles: ['fE', 'fS', 'fW', 'fN'] },
  { label: 'Seasons', tiles: ['zE', 'zS', 'zW', 'zN'] },
];

const TILE_GLYPH = {
  '1m': '🀇', '2m': '🀈', '3m': '🀉', '4m': '🀊', '5m': '🀋', '6m': '🀌', '7m': '🀍', '8m': '🀎', '9m': '🀏',
  '1s': '🀐', '2s': '🀑', '3s': '🀒', '4s': '🀓', '5s': '🀔', '6s': '🀕', '7s': '🀖', '8s': '🀗', '9s': '🀘',
  '1p': '🀙', '2p': '🀚', '3p': '🀛', '4p': '🀜', '5p': '🀝', '6p': '🀞', '7p': '🀟', '8p': '🀠', '9p': '🀡',
  'wE': '🀀', 'wS': '🀁', 'wW': '🀂', 'wN': '🀃',
  'dR': '🀄', 'dG': '🀅', 'dW': '🀆',
  'fE': '🀢', 'fS': '🀣', 'fW': '🀤', 'fN': '🀥',
  'zE': '🀦', 'zS': '🀧', 'zW': '🀨', 'zN': '🀩',
};

const TILE_NAMES = {
  '1m': '1 Char', '9m': '9 Char',
  '1s': '1 Bam', '9s': '9 Bam',
  '1p': '1 Dot', '9p': '9 Dot',
  'wE': 'East', 'wS': 'South', 'wW': 'West', 'wN': 'North',
  'dR': 'Red', 'dG': 'Green', 'dW': 'White',
  'fE': 'Flower E', 'fS': 'Flower S', 'fW': 'Flower W', 'fN': 'Flower N',
  'zE': 'Season E', 'zS': 'Season S', 'zW': 'Season W', 'zN': 'Season N',
};

const SET_TYPE_SIZE = { pong: 3, chow: 3, kong: 4, pair: 2 };

// ─── State ─────────────────────────────────────────────────────────────────

function freshState() {
  return {
    handKind: 'standard',
    sets: [
      { type: null, tiles: [], exposed: false },
      { type: null, tiles: [], exposed: false },
      { type: null, tiles: [], exposed: false },
      { type: null, tiles: [], exposed: false },
    ],
    pair: { type: 'pair', tiles: [], exposed: false },
    flowers: [],
    win: {
      selfDrawn: false,
      seatWind: 'E',
      prevailingWind: 'E',
      robbingKong: false,
      lastTile: false,
      winOnKongDraw: false,
    },
    specialTiles: [],
    activeSlot: null,
    pickerOpen: false,
    result: null,
    error: null,
    // V2 — Photo-Assisted Scoring
    photoBusy: false,
    photoNotes: '',
    lowConfidenceTiles: new Set(),
  };
}

let state = freshState();
let host = null;

// ─── Init ──────────────────────────────────────────────────────────────────

export function init(container) {
  host = container;
  state = freshState();
  render();
}

// ─── Render ────────────────────────────────────────────────────────────────

function render() {
  if (!host) return;
  host.innerHTML = `
    <div class="sm-root">
      <header class="sm-head">
        <h1 class="view-h" style="padding:22px 20px 4px;">Score My Hand</h1>
        <p class="view-sub">Hong Kong Mahjong faan calculator — build your winning hand below.</p>
      </header>

      ${renderPhotoBanner()}

      ${state.photoNotes ? `<div class="sm-photo-notes"><strong>From the photo:</strong> ${escapeHtml(state.photoNotes)}</div>` : ''}

      <div class="sm-section">
        <div class="sm-label">Hand structure</div>
        <div class="sm-segmented" id="sm-kind">
          ${segOption('standard', 'Standard', state.handKind)}
          ${segOption('sevenPairs', 'Seven Pairs', state.handKind)}
          ${segOption('thirteenOrphans', 'Thirteen Orphans', state.handKind)}
        </div>
      </div>

      ${state.handKind === 'standard' ? renderStandardBuilder() : renderSpecialBuilder()}

      ${renderFlowersSection()}

      ${renderWinContext()}

      ${renderActionRow()}

      ${state.error ? `<div class="sm-error">${escapeHtml(state.error)}</div>` : ''}
    </div>

    ${state.pickerOpen ? renderPicker() : ''}
    ${state.result ? renderResults() : ''}
    ${state.photoBusy ? renderPhotoBusy() : ''}
  `;

  wireEvents();
}

function segOption(value, label, current) {
  const active = current === value ? ' is-active' : '';
  return `<button class="sm-seg${active}" data-kind="${value}" type="button">${label}</button>`;
}

function renderStandardBuilder() {
  return `
    <div class="sm-section">
      <div class="sm-label">Your sets <span class="sm-hint">— tap a slot to fill it</span></div>
      <div class="sm-sets">
        ${state.sets.map((s, i) => renderSetSlot(s, i)).join('')}
        ${renderPairSlot(state.pair)}
      </div>
    </div>
  `;
}

function renderSetSlot(s, idx) {
  const filled = s.type && s.tiles.length === SET_TYPE_SIZE[s.type];
  const partial = s.type && s.tiles.length > 0 && !filled;
  const empty = !s.type;
  const slotClass = empty ? 'sm-slot is-empty'
    : partial ? 'sm-slot is-partial'
    : 'sm-slot is-filled';
  const exposedToggle = s.type
    ? `<label class="sm-exposed-tog">
         <input type="checkbox" data-slot-idx="${idx}" data-slot-toggle="exposed" ${s.exposed ? 'checked' : ''}/>
         <span>Exposed</span>
       </label>`
    : '';
  return `
    <div class="${slotClass}" data-slot-idx="${idx}">
      <div class="sm-slot-head">
        <span class="sm-slot-label">Set ${idx + 1}</span>
        ${s.type ? `<span class="sm-slot-type">${typeLabel(s.type)}</span>` : ''}
      </div>
      ${empty ? `
        <div class="sm-typebtns">
          <button class="sm-typebtn" data-slot-idx="${idx}" data-set-type="pong">Pong</button>
          <button class="sm-typebtn" data-slot-idx="${idx}" data-set-type="chow">Chow</button>
          <button class="sm-typebtn" data-slot-idx="${idx}" data-set-type="kong">Kong</button>
        </div>
      ` : `
        <button class="sm-slot-tiles" data-slot-idx="${idx}" data-open-picker="set" type="button">
          ${renderSlotTiles(s, `set:${idx}`)}
        </button>
        <div class="sm-slot-foot">
          ${exposedToggle}
          <button class="sm-slot-clear" data-slot-idx="${idx}" data-action="clear-slot" type="button">Reset</button>
        </div>
      `}
    </div>
  `;
}

function renderPairSlot(p) {
  const filled = p.tiles.length === 2;
  const partial = p.tiles.length > 0 && !filled;
  const slotClass = filled ? 'sm-slot is-filled'
    : partial ? 'sm-slot is-partial'
    : 'sm-slot is-empty';
  return `
    <div class="${slotClass}" data-slot="pair">
      <div class="sm-slot-head">
        <span class="sm-slot-label">Pair</span>
        <span class="sm-slot-type">Pair</span>
      </div>
      <button class="sm-slot-tiles" data-open-picker="pair" type="button">
        ${renderSlotTiles(p, 'pair')}
      </button>
      ${filled || partial ? `
        <div class="sm-slot-foot">
          <button class="sm-slot-clear" data-action="clear-pair" type="button">Reset</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderSlotTiles(s, keyPrefix = '') {
  if (!s.type) return `<span class="sm-slot-empty">Tap to choose tiles</span>`;
  const size = SET_TYPE_SIZE[s.type];
  const slots = [];
  for (let i = 0; i < size; i++) {
    const t = s.tiles[i];
    const lowConf = keyPrefix && state.lowConfidenceTiles?.has(`${keyPrefix}:${i}`);
    const cls = lowConf ? 'sm-tile is-small is-low-conf' : 'sm-tile is-small';
    slots.push(t
      ? `<span class="${cls}">${tileGlyph(t)}</span>`
      : `<span class="sm-tile is-small is-empty"></span>`);
  }
  return slots.join('');
}

function renderSpecialBuilder() {
  const need = 14;
  const have = state.specialTiles.length;
  return `
    <div class="sm-section">
      <div class="sm-label">Your 14 tiles <span class="sm-hint">(${have}/${need})</span></div>
      <button class="sm-special-pile" data-open-picker="special" type="button">
        ${have === 0
          ? '<span class="sm-slot-empty">Tap to pick all 14 tiles</span>'
          : state.specialTiles.map((t, i) => {
              const lowConf = state.lowConfidenceTiles?.has(`special:${i}`);
              const cls = lowConf ? 'sm-tile is-small is-low-conf' : 'sm-tile is-small';
              return `<span class="${cls}">${tileGlyph(t)}</span>`;
            }).join('')
        }
      </button>
      <p class="sm-hint" style="margin-top:8px;">
        ${state.handKind === 'sevenPairs'
          ? 'For Seven Pairs, pick 14 tiles forming exactly 7 distinct pairs.'
          : 'For Thirteen Orphans, pick 1×9 and 9×9 from each suit, all four winds, all three dragons, plus one matching pair.'
        }
      </p>
    </div>
  `;
}

function renderFlowersSection() {
  return `
    <div class="sm-section">
      <div class="sm-label">Flowers & seasons <span class="sm-hint">— optional</span></div>
      <button class="sm-special-pile sm-flowers-pile" data-open-picker="flowers" type="button">
        ${state.flowers.length === 0
          ? '<span class="sm-slot-empty">Tap to add bonus tiles</span>'
          : state.flowers.map(t => `<span class="sm-tile is-small">${tileGlyph(t)}</span>`).join('')
        }
      </button>
    </div>
  `;
}

function renderWinContext() {
  const winds = ['E', 'S', 'W', 'N'];
  return `
    <div class="sm-section">
      <div class="sm-label">Win context</div>
      <div class="sm-context-grid">
        <div class="sm-context-cell">
          <span class="sm-context-label">Seat wind</span>
          <select data-win="seatWind">
            ${winds.map(w => `<option value="${w}" ${state.win.seatWind === w ? 'selected' : ''}>${windName(w)}</option>`).join('')}
          </select>
        </div>
        <div class="sm-context-cell">
          <span class="sm-context-label">Prevailing wind</span>
          <select data-win="prevailingWind">
            ${winds.map(w => `<option value="${w}" ${state.win.prevailingWind === w ? 'selected' : ''}>${windName(w)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="sm-context-flags">
        ${flagToggle('selfDrawn', 'Self-drawn (tsumo)')}
        ${flagToggle('robbingKong', 'Robbing the kong')}
        ${flagToggle('lastTile', 'Won on last tile')}
        ${flagToggle('winOnKongDraw', 'Won on kong replacement')}
      </div>
    </div>
  `;
}

function flagToggle(key, label) {
  return `
    <label class="sm-toggle">
      <input type="checkbox" data-win="${key}" ${state.win[key] ? 'checked' : ''}/>
      <span>${label}</span>
    </label>
  `;
}

function renderActionRow() {
  return `
    <div class="sm-section sm-actions">
      <button class="sm-primary" data-action="score" type="button">Score my hand</button>
      <button class="sm-secondary" data-action="reset-all" type="button">Reset</button>
    </div>
  `;
}

function renderPhotoBanner() {
  return `
    <div class="sm-section sm-photo-banner">
      <button class="sm-photo-cta" data-action="photo-capture" type="button">
        <span class="sm-photo-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7h3l2-2h8l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </span>
        <span class="sm-photo-text">
          <span class="sm-photo-eyebrow">New</span>
          <span class="sm-photo-title">Use a photo of your hand</span>
          <span class="sm-photo-sub">We'll identify the tiles for you — review before scoring.</span>
        </span>
        <span class="sm-photo-arrow" aria-hidden="true">→</span>
      </button>
    </div>
  `;
}

function renderPhotoBusy() {
  return `
    <div class="sm-photo-busy" role="dialog" aria-live="polite">
      <div class="sm-photo-busy-card">
        <div class="sm-photo-spinner"></div>
        <div class="sm-photo-busy-title">Identifying tiles…</div>
        <div class="sm-photo-busy-sub">This usually takes 5–15 seconds.</div>
      </div>
    </div>
  `;
}

function renderPicker() {
  const ctx = state.activeSlot;
  const target = pickerTargetDescription(ctx);
  // For standard set/pair, only show core tiles. For flowers/special, include bonuses.
  const groups = (ctx?.kind === 'flowers') ? BONUS_TILES : SUITS_GROUPED;
  return `
    <div class="sm-picker-backdrop" data-close-picker="true">
      <div class="sm-picker" data-stop-propagation="true">
        <div class="sm-picker-head">
          <div>
            <div class="sm-picker-title">${target.title}</div>
            <div class="sm-picker-sub">${target.sub}</div>
          </div>
          <button class="sm-picker-close" data-close-picker="true" type="button" aria-label="Close">✕</button>
        </div>
        <div class="sm-picker-body">
          ${groups.map(g => `
            <div class="sm-picker-group">
              <div class="sm-picker-group-label">${g.label}</div>
              <div class="sm-picker-grid">
                ${g.tiles.map(t => `
                  <button class="sm-tile sm-picker-tile" data-pick-tile="${t}" type="button">
                    ${tileGlyph(t)}
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="sm-picker-foot">
          <button class="sm-picker-done" data-close-picker="true" type="button">Done</button>
        </div>
      </div>
    </div>
  `;
}

function pickerTargetDescription(ctx) {
  if (!ctx) return { title: 'Pick tiles', sub: '' };
  if (ctx.kind === 'set') {
    const s = state.sets[ctx.index];
    const remaining = SET_TYPE_SIZE[s.type] - s.tiles.length;
    return {
      title: `Pick tiles for ${typeLabel(s.type)}`,
      sub: remaining > 0 ? `${remaining} more to choose` : 'All tiles chosen — tap Done',
    };
  }
  if (ctx.kind === 'pair') {
    const remaining = 2 - state.pair.tiles.length;
    return {
      title: 'Pick the two pair tiles',
      sub: remaining > 0 ? `${remaining} more to choose` : 'Pair complete — tap Done',
    };
  }
  if (ctx.kind === 'flowers') {
    return { title: 'Add flowers & seasons', sub: 'Tap each bonus tile you held.' };
  }
  if (ctx.kind === 'special') {
    const remaining = 14 - state.specialTiles.length;
    return {
      title: state.handKind === 'sevenPairs' ? 'Pick all 14 tiles (Seven Pairs)' : 'Pick all 14 tiles (Thirteen Orphans)',
      sub: remaining > 0 ? `${remaining} more to choose` : '14 tiles chosen — tap Done',
    };
  }
  return { title: '', sub: '' };
}

function renderResults() {
  const r = state.result;
  const exp = explain(r);
  if (!r.valid) {
    return `
      <div class="sm-results-backdrop" data-close-results="true">
        <div class="sm-results" data-stop-propagation="true">
          <div class="sm-results-head">
            <div class="sm-results-eyebrow">No score</div>
            <h2 class="sm-results-title">Hand isn't valid yet</h2>
          </div>
          <div class="sm-results-body">
            ${(r.errors || ['Please re-check your sets.']).map(e => `<p>${escapeHtml(e)}</p>`).join('')}
          </div>
          <div class="sm-results-foot">
            <button class="sm-secondary" data-close-results="true" type="button">Back</button>
          </div>
        </div>
      </div>
    `;
  }
  const limitTag = r.isLimit ? '<span class="sm-limit-tag">LIMIT HAND</span>' : '';
  return `
    <div class="sm-results-backdrop" data-close-results="true">
      <div class="sm-results" data-stop-propagation="true">
        <div class="sm-results-head">
          <div class="sm-results-eyebrow">${escapeHtml(r.summary || 'Chicken Hand')}</div>
          <h2 class="sm-results-title">
            ${r.faan} <span class="sm-results-unit">faan</span>
            ${limitTag}
          </h2>
          <p class="sm-results-headline">${escapeHtml(r.handTitle)}</p>
        </div>
        <div class="sm-results-body">
          ${exp.breakdown.map(b => `
            <div class="sm-results-row">
              <div class="sm-results-row-name">
                ${escapeHtml(b.name)}
                ${b.isLimit ? '<span class="sm-results-row-tag">limit</span>' : ''}
              </div>
              <div class="sm-results-row-meta">
                <span class="sm-results-row-faan">${formatFaan(b.faan, b.isLimit)}</span>
              </div>
              <div class="sm-results-row-desc">${escapeHtml(b.description)}</div>
            </div>
          `).join('')}
        </div>
        ${exp.payout ? `
          <div class="sm-results-payout">
            <div class="sm-results-payout-label">Payout</div>
            <div class="sm-results-payout-text">${escapeHtml(exp.payout.text)}</div>
          </div>
        ` : ''}
        <div class="sm-results-foot">
          <button class="sm-primary" data-action="share-card" type="button">Share scorecard</button>
          <button class="sm-secondary" data-close-results="true" type="button">Edit hand</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Events ────────────────────────────────────────────────────────────────

function wireEvents() {
  host.querySelectorAll('[data-kind]').forEach(el => {
    el.addEventListener('click', () => setHandKind(el.getAttribute('data-kind')));
  });

  host.querySelectorAll('[data-set-type]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-slot-idx'));
      setSetType(idx, el.getAttribute('data-set-type'));
    });
  });

  host.querySelectorAll('[data-open-picker]').forEach(el => {
    el.addEventListener('click', () => {
      const kind = el.getAttribute('data-open-picker');
      const idx = el.hasAttribute('data-slot-idx') ? Number(el.getAttribute('data-slot-idx')) : null;
      openPicker(kind, idx);
    });
  });

  host.querySelectorAll('[data-slot-toggle="exposed"]').forEach(el => {
    el.addEventListener('change', () => {
      const idx = Number(el.getAttribute('data-slot-idx'));
      state.sets[idx].exposed = el.checked;
      // No full render needed for a toggle.
    });
  });

  host.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.getAttribute('data-action');
      const idx = el.hasAttribute('data-slot-idx') ? Number(el.getAttribute('data-slot-idx')) : null;
      handleAction(action, idx);
    });
  });

  host.querySelectorAll('[data-win]').forEach(el => {
    el.addEventListener('change', () => {
      const key = el.getAttribute('data-win');
      if (el.type === 'checkbox') state.win[key] = el.checked;
      else state.win[key] = el.value;
    });
  });

  host.querySelectorAll('[data-pick-tile]').forEach(el => {
    el.addEventListener('click', () => pickTile(el.getAttribute('data-pick-tile')));
  });

  host.querySelectorAll('[data-close-picker]').forEach(el => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-stop-propagation]') && ev.target !== el) return;
      closePicker();
    });
  });

  host.querySelectorAll('[data-close-results]').forEach(el => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-stop-propagation]') && ev.target !== el) return;
      closeResults();
    });
  });
}

function setHandKind(kind) {
  state.handKind = kind;
  // Reset construction state but keep win context & flowers.
  state.sets = freshState().sets;
  state.pair = freshState().pair;
  state.specialTiles = [];
  state.error = null;
  render();
}

function setSetType(idx, type) {
  state.sets[idx].type = type;
  state.sets[idx].tiles = [];
  render();
  openPicker('set', idx);
}

function openPicker(kind, index = null) {
  state.activeSlot = { kind, index };
  state.pickerOpen = true;
  render();
}

function closePicker() {
  state.pickerOpen = false;
  state.activeSlot = null;
  render();
}

function pickTile(tile) {
  const ctx = state.activeSlot;
  if (!ctx) return;
  if (ctx.kind === 'set') {
    const s = state.sets[ctx.index];
    if (!s.type) return;
    if (s.tiles.length < SET_TYPE_SIZE[s.type]) s.tiles.push(tile);
    if (s.tiles.length >= SET_TYPE_SIZE[s.type]) {
      // Auto-close when full
      state.pickerOpen = false;
      state.activeSlot = null;
    }
  } else if (ctx.kind === 'pair') {
    if (state.pair.tiles.length < 2) state.pair.tiles.push(tile);
    if (state.pair.tiles.length >= 2) {
      state.pickerOpen = false;
      state.activeSlot = null;
    }
  } else if (ctx.kind === 'flowers') {
    state.flowers.push(tile);
  } else if (ctx.kind === 'special') {
    if (state.specialTiles.length < 14) state.specialTiles.push(tile);
    if (state.specialTiles.length >= 14) {
      state.pickerOpen = false;
      state.activeSlot = null;
    }
  }
  render();
}

function handleAction(action, idx) {
  switch (action) {
    case 'clear-slot':
      state.sets[idx] = { type: null, tiles: [], exposed: false };
      // Drop any low-confidence markers belonging to this slot.
      state.lowConfidenceTiles = filterOutPrefix(state.lowConfidenceTiles, `set:${idx}:`);
      break;
    case 'clear-pair':
      state.pair = { type: 'pair', tiles: [], exposed: false };
      state.lowConfidenceTiles = filterOutPrefix(state.lowConfidenceTiles, 'pair:');
      break;
    case 'reset-all':
      state = freshState();
      break;
    case 'score':
      runScore();
      return;
    case 'share-card':
      shareScorecard();
      return;
    case 'photo-capture':
      runPhotoCapture();
      return;
    case 'photo-clear-notes':
      state.photoNotes = '';
      break;
  }
  render();
}

function filterOutPrefix(set, prefix) {
  const out = new Set();
  for (const k of set) if (!k.startsWith(prefix)) out.add(k);
  return out;
}

async function runPhotoCapture() {
  state.error = null;
  const file = await capturePhoto();
  if (!file) return; // User cancelled

  state.photoBusy = true;
  render();

  try {
    const result = await identifyTiles(file);
    const patch = buildStatePatch(result);
    // Apply the patch — overwrite construction state, keep win context + flowers
    // (unless the photo found flowers, in which case use those).
    state.handKind = patch.handKind;
    state.sets = patch.sets;
    state.pair = patch.pair;
    state.specialTiles = patch.specialTiles;
    if (patch.flowers && patch.flowers.length > 0) {
      state.flowers = patch.flowers;
    }
    state.lowConfidenceTiles = patch.lowConfidenceTiles;
    state.photoNotes = patch.notes;
    state.error = null;
  } catch (err) {
    state.error = err && err.message ? err.message : 'Something went wrong identifying the photo.';
  } finally {
    state.photoBusy = false;
    render();
  }
}

function closeResults() {
  state.result = null;
  render();
}

function runScore() {
  let input;
  if (state.handKind === 'standard') {
    // Need 4 fully-filled sets + pair
    const incomplete = state.sets.findIndex(s => !s.type || s.tiles.length !== SET_TYPE_SIZE[s.type]);
    if (incomplete >= 0) {
      state.error = `Set ${incomplete + 1} isn't complete yet.`;
      render();
      return;
    }
    if (state.pair.tiles.length !== 2) {
      state.error = "Pair isn't complete yet.";
      render();
      return;
    }
    input = {
      sets: state.sets.map(s => ({ type: s.type, tiles: s.tiles, exposed: s.exposed })),
      pair: { type: 'pair', tiles: state.pair.tiles },
      flowers: [...state.flowers],
      win: { ...state.win },
    };
  } else {
    if (state.specialTiles.length !== 14) {
      state.error = `Need 14 tiles for ${state.handKind === 'sevenPairs' ? 'Seven Pairs' : 'Thirteen Orphans'}.`;
      render();
      return;
    }
    input = {
      special: { kind: state.handKind, tiles: state.specialTiles },
      flowers: [...state.flowers],
      win: { ...state.win },
    };
  }
  state.error = null;
  state.result = score(input);
  render();
}

async function shareScorecard() {
  if (!state.result || !state.result.valid) return;
  try {
    const blob = await drawScorecard(state.result);
    const file = new File([blob], 'mahj-scorecard.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My MAHJ MAHJ score' });
      return;
    }
    // Fallback: download the file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mahj-scorecard.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    state.error = `Couldn't generate scorecard: ${err && err.message || err}`;
    render();
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function tileGlyph(t) {
  const g = TILE_GLYPH[t];
  if (!g) return t;
  return `<span class="sm-tile-glyph">${g}</span><span class="sm-tile-label">${tileShortLabel(t)}</span>`;
}

function tileShortLabel(t) {
  if (/^[1-9][mps]$/.test(t)) return t[0];
  if (t[0] === 'w') return t[1];
  if (t[0] === 'd') return ({ R: '中', G: '發', W: '白' })[t[1]] || t[1];
  if (t[0] === 'f') return `F${seatOrder(t[1])}`;
  if (t[0] === 'z') return `S${seatOrder(t[1])}`;
  return '';
}

function seatOrder(w) {
  return ({ E: 1, S: 2, W: 3, N: 4 })[w] || '';
}

function windName(w) {
  return ({ E: 'East', S: 'South', W: 'West', N: 'North' })[w] || w;
}

function typeLabel(type) {
  return ({ pong: 'Pong', chow: 'Chow', kong: 'Kong', pair: 'Pair' })[type] || type;
}

function formatFaan(faan, isLimit) {
  if (isLimit) return `${faan} (limit)`;
  if (faan === 0) return '0';
  return `+${faan}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}
