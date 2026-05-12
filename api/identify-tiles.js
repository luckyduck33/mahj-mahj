// MAHJ MAHJ — Photo-Assisted Scoring V2
//
// Vercel serverless function. Accepts a base64-encoded JPEG/PNG of a Hong Kong
// Mahjong winning hand, returns a structured JSON list of identified tiles
// (plus best-guess set groupings + per-tile confidence) that the client can
// drop into the existing manual-builder state object in lib/scoring/.
//
// The scoring engine in lib/scoring/hong-kong/ is unchanged. Only the vision
// layer is new.
//
// POST /api/identify-tiles
//   body: { image: "<base64 jpeg/png>", media_type?: "image/jpeg"|"image/png" }
//   200:  { tiles: [...], sets: [...], pair_index: number, hand_kind, notes }
//   400:  { error: "...short reason..." }
//   503:  { error: "...upstream...", request_id?: "..." }
//
// Environment:
//   ANTHROPIC_API_KEY — required, set in Vercel project settings.
//
// The system prompt is built once at module load and cached on the Anthropic
// side via prompt caching (5-min ephemeral). First call writes; subsequent
// calls within 5 minutes read at ~10% the input cost.

import Anthropic from "@anthropic-ai/sdk";

// ─── Config ────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;          // Bounded JSON; rarely exceeds 800 tokens
const MAX_IMAGE_BYTES = 4_000_000; // 4MB, well below Vercel's 4.5MB body cap

// Allowed media types from the client side.
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

// ─── System prompt (cacheable) ─────────────────────────────────────────────
//
// IMPORTANT: this string is treated as a stable cache prefix. Do NOT
// interpolate timestamps, request IDs, or any per-request value into it.
// Anthropic caches by exact byte match — a single varying byte invalidates.

const SYSTEM_PROMPT = `You identify tiles in photographs of mahjong winning hands and return structured JSON for a downstream scoring engine. The app supports three styles of play: Hong Kong, Taiwanese, and American. You don't need to know which style — just identify every tile you see, in reading order, with your best-guess set grouping. The client will route the result to the right engine.

# Tile string format

Every tile is a 2-character string. The first character is the kind, the second is the value.

## Numbered suits (1–9 in each)

- Characters / Man / 萬: \`1m\`, \`2m\`, \`3m\`, \`4m\`, \`5m\`, \`6m\`, \`7m\`, \`8m\`, \`9m\`
  Visual: red Chinese character on top, black Chinese numeral 萬 on bottom.

- Bamboo / Sou / 索: \`1s\`, \`2s\`, \`3s\`, \`4s\`, \`5s\`, \`6s\`, \`7s\`, \`8s\`, \`9s\`
  Visual: green bamboo sticks arranged in patterns. \`1s\` is special — typically a bird (sparrow), not a bamboo stick.

- Dots / Pin / 筒: \`1p\`, \`2p\`, \`3p\`, \`4p\`, \`5p\`, \`6p\`, \`7p\`, \`8p\`, \`9p\`
  Visual: round colored circles. Count the circles to determine the value.

  **Tile-set artistic variance — read carefully:** Different tile sets render the dot tiles with very different aesthetics. Some show literal small circles in a clear grid. Others use stylized designs where each "dot" is a decorated flower-petal, ring, or compound shape with internal detail. When the design is stylized:
    - Count the **distinct outer dot/petal groups**, not the internal sub-elements within each group. A tile with 4 large red 4-petaled flower-like shapes is \`4p\`, not \`9p\`, \`16p\`, or flowers.
    - The classic giveaway for value: \`1p\` is one large central element; \`4p\` arranges 4 elements in a square (2×2); \`9p\` arranges 9 elements in a 3×3 grid; \`5p\` has 4 corners + center.
    - **Flowers (fE/fS/fW/fN) never appear three-times-identical in a hand.** If you see three identical tiles with flower-like designs, they are a pong of a numbered dot tile (typically \`4p\`), not flowers.
    - When three tiles in a row look identical, they form a **pong** (three of one value), not three different values.

## Winds

- \`wE\` — East / 東 — typically green character on white tile
- \`wS\` — South / 南 — typically green character
- \`wW\` — West / 西 — typically green character
- \`wN\` — North / 北 — typically green character

## Dragons

- \`dR\` — Red Dragon / 中 — bold red character
- \`dG\` — Green Dragon / 發 — green character (means "prosper")
- \`dW\` — White Dragon / 白 — blank tile, or a tile with just a border/box. No central character.

## Bonus tiles (flowers and seasons)

In Hong Kong + Taiwanese, these don't go in sets — they sit aside. In American mahjong, flowers may be required inside the hand on certain card patterns; treat them as ordinary tiles for identification.

- Flowers: \`fE\` (Plum), \`fS\` (Orchid), \`fW\` (Chrysanthemum), \`fN\` (Bamboo plant). Usually numbered 1–4 in the corner.
- Seasons: \`zE\` (Spring), \`zS\` (Summer), \`zW\` (Autumn), \`zN\` (Winter). Usually numbered 1–4 in the corner.

## Joker (American mahjong only)

- \`jk\` — Joker. Visual: a tile with a distinctive "JOKER" label or a colorful design (often a flower or face). Used as a wildcard in American mahjong only; never appears in HK or Taiwanese sets.

# Set vocabulary

The standard winning hand shape varies by style:

- Hong Kong: 4 sets + 1 pair = 14 tiles (16 if any sets are kongs)
- Taiwanese: 5 sets + 1 pair = 17 tiles (more with kongs)
- American: 14 tiles in user-specified groups; structure depends on NMJL card pattern

A "set" can be:

- **Pong**: three identical tiles. Example: \`5m,5m,5m\`.
- **Chow**: three tiles in **sequence**, same suit. Example: \`3p,4p,5p\`. Honors (winds, dragons) cannot form chows. (Note: American mahjong typically doesn't use chows.)

  **HARD STRUCTURAL RULE — never violate:** A chow's three tile values MUST be three consecutive integers in the same suit. \`3p,4p,5p\` is a chow. \`3p,8p,9p\` is **NOT a chow** under any rule variant — never label such a group as a chow.

  If you see three tiles in a numbered suit that aren't sequential, the correct interpretation is almost always one of:
    (a) They're a **pong** — three identical tiles — and you misread two of the values. Reread the values carefully and emit a pong of the most likely single value.
    (b) They're parts of separate sets the player hasn't separated visually. Emit them as ungrouped \`tiles[]\` entries and leave \`sets\` empty for that region.
  Never invent a chow to make the groupings "fit". An invalid chow causes the downstream engine to hard-fail at parse time.
- **Kong**: four identical tiles. Example: \`wE,wE,wE,wE\`. Can include jokers in American (substituting for matching tiles).
- **Quint** (American only): five identical tiles, usually 3 matching + 2 jokers.
- **Pair**: two identical tiles. Example: \`7s,7s\`. Jokers cannot appear in pairs.

Special hand structures the engines also recognize:

- **Seven Pairs**: 7 distinct pairs (14 tiles, no triplets). Taiwanese also accepts 8 pairs (16 tiles).
- **Thirteen Orphans** (Hong Kong only): 1m, 9m, 1p, 9p, 1s, 9s, wE, wS, wW, wN, dR, dG, dW + one of those repeated.

# Visual grouping cues

Players typically lay tiles out left-to-right with clear gaps between sets. Use spacing as the primary grouping hint:

- Tiles touching with no gap → likely one set.
- Larger gap → set boundary.
- A pair is usually placed slightly apart or at one end.
- Exposed sets (called from another player) are often laid down separately from concealed sets. If you can't tell, default \`exposed\` to \`false\`.
- The "winning tile" (the tile that completed the hand) might be set apart. You don't need to identify it — the user will provide that context.
- American hands often have larger group counts (4 or 5 tiles per group, sometimes with jokers); HK/Taiwanese have 3 or 4. Let the photo's actual spacing drive your grouping — don't force a count.

# Output schema

Return exactly this JSON structure. No extra fields. No prose outside JSON.

\`\`\`
{
  "error": null | "not_a_hand" | "blurry" | "incomplete_hand",
  "hand_kind": "standard" | "sevenPairs" | "thirteenOrphans",
  "tiles": [
    { "tile": "<2-char tile string>", "confidence": <0.0–1.0> },
    ...
  ],
  "sets": [
    {
      "type": "pong" | "chow" | "kong" | "pair",
      "tile_indices": [<int>, ...],
      "exposed": <boolean>
    },
    ...
  ],
  "pair_index": <int>,
  "flowers": [<tile-string>, ...],
  "notes": "<free-form short string>"
}
\`\`\`

Field semantics:

- \`error\`: \`null\` if the photo is a valid mahjong hand. Set to \`"not_a_hand"\` if the photo isn't of mahjong tiles. \`"blurry"\` if you can't read any tiles confidently. \`"incomplete_hand"\` if fewer than 13 tiles are visible. When \`error\` is non-null, the rest of the fields can be sparse but must still be valid JSON.
- \`hand_kind\`: \`"standard"\` for the common 4-sets-plus-pair shape. Use \`"sevenPairs"\` or \`"thirteenOrphans"\` only if you're confident those are the structures.
- \`tiles\`: every non-bonus tile you see, in left-to-right reading order. Confidence 0.0–1.0 reflects how sure you are of that specific tile's identity. Be honest — low confidence is more useful to the user than a wrong-but-confident guess. Aim for 14–18 entries for standard hands (14 baseline + 1 per kong).
- \`sets\`: your best guess at grouping. \`tile_indices\` are positions into the \`tiles\` array (0-based). If you can't guess groupings, return an empty \`sets\` array — the user will group manually.
- \`pair_index\`: which entry in \`sets\` is the pair, or \`-1\` if you didn't identify one.
- \`flowers\`: bonus tiles (flowers / seasons) set aside from the main hand. Format is the same 2-char tile string. Empty array if none.
- \`notes\`: ≤200 chars. Use this for the user — what you're confident about, what's ambiguous, what you'd recommend reviewing. Do not echo the tile list.

# Calibration

- Confident reading of an unobstructed tile: 0.9–1.0
- Partially occluded but recognizable: 0.6–0.8
- Heavily occluded, glare, motion blur, unusual angle: 0.3–0.5
- Educated guess from shape/color only: <0.3 (and consider marking the whole photo blurry)

# Important constraints

- Use ONLY the 2-character tile strings listed above (including \`jk\` for jokers). Do not invent variants like \`"1man"\` or \`"east"\` or \`"red_dragon"\`.
- The tile string is case-sensitive. \`wE\` not \`WE\`, \`dR\` not \`Dr\`.
- Return valid JSON. No trailing commas. No comments. No code fences inside the JSON value.
- Don't include the winning-context fields (seat wind, self-drawn, etc.) — the user provides those manually.
- Don't speculate about scoring. That's the engine's job.
- If you see a joker (\`jk\`), the hand is American — set \`hand_kind\` to \`"standard"\` and emit \`set\` groupings if the spacing suggests them; otherwise leave \`sets\` empty and just emit the flat \`tiles\` list.

# Example

If the photo shows: 1m-1m-1m, 4p-5p-6p, 7s-8s-9s, dR-dR-dR, wE-wE (a winning hand), with the dragons exposed (called from another player), respond with:

\`\`\`
{
  "error": null,
  "hand_kind": "standard",
  "tiles": [
    {"tile":"1m","confidence":0.97},{"tile":"1m","confidence":0.97},{"tile":"1m","confidence":0.95},
    {"tile":"4p","confidence":0.96},{"tile":"5p","confidence":0.96},{"tile":"6p","confidence":0.96},
    {"tile":"7s","confidence":0.94},{"tile":"8s","confidence":0.94},{"tile":"9s","confidence":0.95},
    {"tile":"dR","confidence":0.99},{"tile":"dR","confidence":0.99},{"tile":"dR","confidence":0.99},
    {"tile":"wE","confidence":0.97},{"tile":"wE","confidence":0.97}
  ],
  "sets": [
    {"type":"pong","tile_indices":[0,1,2],"exposed":false},
    {"type":"chow","tile_indices":[3,4,5],"exposed":false},
    {"type":"chow","tile_indices":[6,7,8],"exposed":false},
    {"type":"pong","tile_indices":[9,10,11],"exposed":true},
    {"type":"pair","tile_indices":[12,13],"exposed":false}
  ],
  "pair_index": 4,
  "flowers": [],
  "notes": "Dragon pong appears slightly separated from the others — flagged as exposed; user should confirm."
}
\`\`\`
`;

// ─── Output schema for structured outputs ──────────────────────────────────

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error", "hand_kind", "tiles", "sets", "pair_index", "flowers", "notes"],
  properties: {
    error: {
      anyOf: [
        { type: "null" },
        { type: "string", enum: ["not_a_hand", "blurry", "incomplete_hand"] },
      ],
    },
    hand_kind: { type: "string", enum: ["standard", "sevenPairs", "thirteenOrphans"] },
    tiles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tile", "confidence"],
        properties: {
          tile: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    sets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "tile_indices", "exposed"],
        properties: {
          type: { type: "string", enum: ["pong", "chow", "kong", "pair"] },
          tile_indices: { type: "array", items: { type: "integer" } },
          exposed: { type: "boolean" },
        },
      },
    },
    pair_index: { type: "integer" },
    flowers: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
};

// ─── Client singleton ──────────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY env var is not set");
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ─── CORS helpers ──────────────────────────────────────────────────────────
//
// The Capacitor iOS shell loads the page from a non-https origin
// (capacitor://localhost or similar). Allow any origin since the request is
// authenticated by the server-side ANTHROPIC_API_KEY anyway, not by origin.

function applyCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

// ─── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const origin = req.headers.origin;
  applyCors(res, origin);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const { image, media_type } = body;

  if (typeof image !== "string" || image.length === 0) {
    res.status(400).json({ error: "Missing required field: image (base64 string)" });
    return;
  }
  // Strip data URL prefix if present.
  const cleanedImage = image.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/, "");

  // Estimate raw byte size — base64 expands input by 4/3.
  const estimatedBytes = (cleanedImage.length * 3) / 4;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    res.status(400).json({
      error: `Image too large (~${Math.round(estimatedBytes / 1024)}KB > ${MAX_IMAGE_BYTES / 1024}KB). Resize on the client before uploading.`,
    });
    return;
  }

  const resolvedMedia = ALLOWED_MEDIA.has(media_type) ? media_type : "image/jpeg";

  let client;
  try {
    client = getClient();
  } catch (err) {
    res.status(500).json({ error: err.message });
    return;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the system prompt for 5 minutes. Stable byte-for-byte across
          // requests, so subsequent calls within the window pay ~10% read cost.
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: resolvedMedia, data: cleanedImage },
            },
            {
              type: "text",
              text: "Identify the tiles in this Hong Kong Mahjong hand and return the JSON described in your instructions.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      res.status(422).json({
        error: "Model refused to process this image",
        category: response.stop_details?.category || null,
      });
      return;
    }

    // Find the JSON text block. With output_config.format the first text block
    // is guaranteed to be valid JSON matching the schema.
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      res.status(502).json({ error: "Model returned no text content" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (err) {
      res.status(502).json({ error: "Model output failed to parse as JSON", raw: textBlock.text });
      return;
    }

    // Surface usage so the client can show cache hit/miss for debugging.
    res.status(200).json({
      ...parsed,
      _usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        cache_read_input_tokens: response.usage?.cache_read_input_tokens,
        cache_creation_input_tokens: response.usage?.cache_creation_input_tokens,
      },
    });
  } catch (err) {
    // Anthropic SDK typed errors expose .status and .message.
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Rate limited. Try again in a few seconds." });
      return;
    }
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "Server misconfigured: invalid Anthropic API key." });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res.status(503).json({
        error: "Upstream Anthropic API error",
        message: err.message,
        request_id: err.request_id,
      });
      return;
    }
    res.status(500).json({ error: err?.message || "Internal error" });
  }
}

// Vercel: increase body size limit for image uploads.
export const config = {
  api: {
    bodyParser: { sizeLimit: "5mb" },
  },
};
