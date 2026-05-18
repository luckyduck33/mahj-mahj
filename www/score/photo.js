/**
 * Score My Hand V2 — Photo-Assisted Scoring (client side).
 *
 * Captures a photo of a winning hand, posts it to /api/identify-tiles, and
 * returns a structured result the view module merges into the existing
 * manual-builder state.
 *
 * Three exported functions:
 *   capturePhoto()        — opens the OS file/camera picker, returns a File
 *   compressImage(file)   — resizes + recompresses for upload
 *   identifyTiles(file)   — uploads + parses + returns the JSON
 *
 * Engine integration is in view.js — this module stays UI-agnostic.
 */

const API_ENDPOINT = '/api/identify-tiles';
const MAX_LONG_EDGE = 1600;     // px — preserves enough detail for the model
const JPEG_QUALITY = 0.85;       // 0.85 yields ~200-500KB for a 12MP source
const TIMEOUT_MS = 45_000;       // give the model headroom; client UI shows a spinner

/**
 * Opens the OS camera/file picker. Returns a Promise<File> or null if the
 * user cancelled.
 */
export function capturePhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // capture="environment" hints to mobile browsers to use the rear camera.
    // Honored on Mobile Safari + Chrome Android; ignored on desktop.
    input.capture = 'environment';
    input.style.display = 'none';

    let settled = false;
    const onChange = () => {
      if (settled) return;
      settled = true;
      const file = input.files && input.files[0];
      cleanup();
      resolve(file || null);
    };
    const onFocus = () => {
      // Some browsers fire a focus event on the window when the file dialog
      // closes without a selection. Use a short delay so an actual `change`
      // wins the race when a file *was* picked.
      setTimeout(() => {
        if (settled) return;
        if (!input.files || input.files.length === 0) {
          settled = true;
          cleanup();
          resolve(null);
        }
      }, 300);
    };
    const cleanup = () => {
      input.removeEventListener('change', onChange);
      window.removeEventListener('focus', onFocus);
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener('change', onChange);
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Resizes the given image File so its long edge is <= MAX_LONG_EDGE and
 * re-encodes as JPEG. Returns a Promise<Blob>.
 *
 * Why both: phone photos can hit 3-5MB+ and Vercel's body limit is 4.5MB on
 * the Hobby tier. Even on Pro, sending uncompressed wastes bandwidth and adds
 * latency without improving model accuracy.
 */
export async function compressImage(file) {
  const bitmap = await loadBitmap(file);
  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(w, h));
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  if (typeof bitmap.close === 'function') bitmap.close();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      // EXIF orientation is honored when available, so we don't need to
      // manually rotate based on metadata.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to the HTMLImageElement path.
    }
  }
  // Fallback for older Safari that doesn't support createImageBitmap options.
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * POSTs the compressed image to the identify-tiles endpoint and returns the
 * parsed JSON. Throws on network / API errors with a user-friendly message.
 */
export async function identifyTiles(file, { style = 'hong-kong' } = {}) {
  const blob = await compressImage(file);
  const dataUrl = await blobToDataUrl(blob);
  const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, media_type: 'image/jpeg', style }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("That took longer than expected. Try a smaller or clearer photo.");
    }
    throw new Error(`Couldn't reach the scoring server: ${err.message || err}`);
  }
  clearTimeout(timeoutId);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The scoring server returned an unreadable response.');
  }

  if (!response.ok) {
    throw new Error(payload.error || `Server error (${response.status}).`);
  }

  if (payload.error) {
    const friendly = {
      not_a_hand: "This doesn't look like a mahjong hand. Try again with the tiles in the frame.",
      blurry: 'The photo is too blurry to read confidently. Try better lighting or a steadier shot.',
      incomplete_hand: 'I can only see part of the hand. Make sure all 14 tiles are in frame.',
    }[payload.error] || `Photo couldn't be processed (${payload.error}).`;
    throw new Error(friendly);
  }

  return payload;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Translates an /api/identify-tiles result into the standard-builder state
 * shape used by view.js. The caller is responsible for storing the returned
 * patch into its state object (so this module stays UI-framework-agnostic).
 *
 * Returns:
 *   {
 *     handKind: 'standard' | 'sevenPairs' | 'thirteenOrphans',
 *     sets: [...4],            // when handKind === 'standard'
 *     pair: {type:'pair', ...},// when handKind === 'standard'
 *     specialTiles: [...14],   // when handKind === sevenPairs / thirteenOrphans
 *     flowers: [...],
 *     lowConfidenceTiles: Set<string-key>,  // for UI highlighting
 *     notes: string,
 *   }
 *
 * lowConfidenceTiles contains keys of the form "set:<setIdx>:<tileIdx>" or
 * "pair:<tileIdx>" or "special:<tileIdx>" — match the rendering loop.
 */
const SETS_PER_STYLE = { 'hong-kong': 4, 'taiwanese': 5 };

export function buildStatePatch(identifyResult, { lowConfidenceThreshold = 0.7, style = 'hong-kong' } = {}) {
  const lowConf = new Set();
  const tiles = identifyResult.tiles || [];
  const sets = identifyResult.sets || [];
  const pairIdx = typeof identifyResult.pair_index === 'number' ? identifyResult.pair_index : -1;
  const handKind = identifyResult.hand_kind || 'standard';

  // American: flat tile list (includes jokers if model identified any).
  if (style === 'american') {
    const americanTiles = tiles.map((t, i) => {
      if ((t.confidence ?? 1) < lowConfidenceThreshold) lowConf.add(`american:${i}`);
      return t.tile;
    });
    return {
      handKind: 'standard',
      sets: emptySets(0),
      pair: { type: 'pair', tiles: [], exposed: false },
      specialTiles: [],
      americanTiles,
      flowers: [],  // bonuses are part of the hand in American, not set aside
      lowConfidenceTiles: lowConf,
      notes: identifyResult.notes || '',
    };
  }

  const expectedSetCount = SETS_PER_STYLE[style] || 4;

  if (handKind !== 'standard') {
    const specialTiles = tiles.map((t, i) => {
      if ((t.confidence ?? 1) < lowConfidenceThreshold) lowConf.add(`special:${i}`);
      return t.tile;
    });
    return {
      handKind,
      sets: emptySets(expectedSetCount),
      pair: { type: 'pair', tiles: [], exposed: false },
      specialTiles,
      americanTiles: [],
      flowers: identifyResult.flowers || [],
      lowConfidenceTiles: lowConf,
      notes: identifyResult.notes || '',
    };
  }

  const builderSets = emptySets(expectedSetCount);
  let pair = { type: 'pair', tiles: [], exposed: false };

  let nextSlot = 0;
  sets.forEach((s, sIdx) => {
    const groupTiles = (s.tile_indices || []).map((i) => tiles[i]).filter(Boolean);
    const groupTileStrings = groupTiles.map((t) => t.tile);
    const exposed = !!s.exposed;
    const markLow = (i, key) => {
      const t = groupTiles[i];
      if (!t) return;
      if ((t.confidence ?? 1) < lowConfidenceThreshold) lowConf.add(key);
    };

    if (sIdx === pairIdx || (s.type === 'pair' && pair.tiles.length === 0)) {
      pair = { type: 'pair', tiles: groupTileStrings.slice(0, 2), exposed: false };
      groupTileStrings.slice(0, 2).forEach((_, i) => markLow(i, `pair:${i}`));
      return;
    }
    if (nextSlot >= expectedSetCount) return;
    if (!['pong', 'chow', 'kong'].includes(s.type)) return;
    builderSets[nextSlot] = {
      type: s.type,
      tiles: groupTileStrings,
      exposed,
    };
    groupTileStrings.forEach((_, i) => markLow(i, `set:${nextSlot}:${i}`));
    nextSlot += 1;
  });

  return {
    handKind: 'standard',
    sets: builderSets,
    pair,
    specialTiles: [],
    americanTiles: [],
    flowers: identifyResult.flowers || [],
    lowConfidenceTiles: lowConf,
    notes: identifyResult.notes || '',
  };
}

function emptySets(n) {
  return Array.from({ length: n }, () => ({ type: null, tiles: [], exposed: false }));
}
