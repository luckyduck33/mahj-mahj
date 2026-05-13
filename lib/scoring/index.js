/**
 * Top-level scoring router.
 *
 * MAHJ MAHJ recognizes three play styles, each with its own scoring engine:
 *
 *   'hong-kong'  — 13-tile hand (4 sets + pair), faan-based scoring
 *   'taiwanese'  — 16-tile hand (5 sets + pair), tai-based scoring
 *   'american'   — NMJL-card hand-matching with jokers (validation + user-entered points)
 *
 * Each style implements the same outward contract:
 *   score(input, options?) → ScoreResult
 *
 * Where ScoreResult has the common shape:
 *   { valid, hand, matches, faanRaw, faan, isLimit, base, summary, handTitle, style, errors? }
 *
 * The `faan` field is the engine's primary numeric output:
 *   - hong-kong → faan
 *   - taiwanese → tai
 *   - american  → points-on-card (user-entered)
 *
 * Callers can dispatch via `score(input)` (this module) or import the
 * style-specific calculator directly when the style is fixed at compile time.
 */

import { score as scoreHK } from './hong-kong/calculator.js';
import { explain as explainHK } from './hong-kong/explain.js';
import { score as scoreTW } from './taiwanese/calculator.js';
import { explain as explainTW } from './taiwanese/explain.js';
import { score as scoreUS } from './american/calculator.js';
import { explain as explainUS } from './american/explain.js';

export const STYLES = Object.freeze(['hong-kong', 'taiwanese', 'american']);

export const STYLE_META = Object.freeze({
  'hong-kong': {
    id: 'hong-kong',
    label: 'Hong Kong',
    handSize: 14,
    setCount: 4,
    unit: 'faan',
    description: 'Classic 13-tile Hong Kong scoring. Faan-based, with limit hands at 10.',
  },
  'taiwanese': {
    id: 'taiwanese',
    label: 'Taiwanese',
    handSize: 17,
    setCount: 5,
    unit: 'tai',
    description: '16-tile Taiwanese mahjong. Five sets and a pair, tai-based scoring (台).',
  },
  'american': {
    id: 'american',
    label: 'American',
    handSize: 14,
    setCount: null,
    unit: 'points',
    description: 'NMJL-style scoring with jokers. Enter your hand and the point value from your NMJL card.',
  },
});

export function score(input, options = {}) {
  const style = input.style || options.style || 'hong-kong';
  switch (style) {
    case 'hong-kong':
      return tagStyle(scoreHK(input, options), 'hong-kong');
    case 'taiwanese':
      return tagStyle(scoreTW(input, options), 'taiwanese');
    case 'american':
      return tagStyle(scoreUS(input, options), 'american');
    default:
      return {
        valid: false,
        style,
        matches: [],
        faan: 0,
        faanRaw: 0,
        isLimit: false,
        base: 0,
        summary: '',
        handTitle: '',
        errors: [`Unknown scoring style "${style}". Valid: ${STYLES.join(', ')}.`],
      };
  }
}

export function explain(result) {
  const style = result.style || 'hong-kong';
  switch (style) {
    case 'taiwanese': return explainTW(result);
    case 'american':  return explainUS(result);
    case 'hong-kong':
    default:          return explainHK(result);
  }
}

function tagStyle(result, style) {
  return { ...result, style };
}
