/**
 * Shareable scorecard generator.
 *
 * Takes a scoring result and renders a 1080×1350 PNG card on an off-screen
 * canvas, returning a Blob the caller can share or download.
 *
 * No external dependencies — uses the platform Canvas 2D API and the same
 * Google Fonts already loaded in index.html (Unbounded + Poppins). When the
 * fonts aren't available we fall back gracefully to system fonts.
 */

const W = 1080;
const H = 1350;

const COLORS = {
  bgTop:    '#F0EADF',
  bgBottom: '#E5DCCB',
  ink:      '#2A201A',
  inkSoft:  '#4A3E34',
  inkMuted: '#8A7A6A',
  coral:    '#C47A4A',
  green:    '#2D4A3E',
  greenLight: '#3E6251',
  card:     '#FFFFFF',
  divider:  'rgba(74,62,52,0.12)',
};

export async function drawScorecard(result) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ─── Background ────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, COLORS.bgTop);
  grad.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative coral strip
  ctx.fillStyle = COLORS.coral;
  ctx.fillRect(0, 0, W, 12);

  // ─── Header ────────────────────────────────────────────────────
  setFont(ctx, 700, 22, "'Unbounded', sans-serif");
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('MAHJ MAHJ · HONG KONG MAHJONG', W / 2, 90);

  // Eyebrow
  setFont(ctx, 600, 28, "'Poppins', sans-serif");
  ctx.fillStyle = COLORS.coral;
  ctx.letterSpacing = '0.1em';
  ctx.fillText('SCORE MY HAND', W / 2, 150);

  // ─── Big faan count ────────────────────────────────────────────
  const faanText = String(result.faan);
  setFont(ctx, 900, 280, "'Unbounded', sans-serif");
  ctx.fillStyle = COLORS.green;
  ctx.textAlign = 'center';
  ctx.fillText(faanText, W / 2, 410);

  // "faan" subscript
  setFont(ctx, 700, 50, "'Unbounded', sans-serif");
  ctx.fillStyle = COLORS.inkSoft;
  ctx.fillText(result.isLimit ? 'limit hand' : 'faan', W / 2, 480);

  // ─── Hand title ────────────────────────────────────────────────
  setFont(ctx, 800, 60, "'Unbounded', sans-serif");
  ctx.fillStyle = COLORS.ink;
  wrappedCenteredText(ctx, result.handTitle, W / 2, 570, W - 120, 70);

  // ─── Patterns breakdown ─────────────────────────────────────────
  const patterns = result.matches
    .filter(m => m.id !== 'chickenHand')
    .slice(0, 8);

  let y = 710;
  ctx.textAlign = 'left';
  setFont(ctx, 600, 24, "'Poppins', sans-serif");
  ctx.fillStyle = COLORS.inkMuted;
  ctx.fillText('SCORING PATTERNS', 90, y);
  y += 40;

  // Divider
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, y);
  ctx.lineTo(W - 90, y);
  ctx.stroke();
  y += 20;

  if (patterns.length === 0) {
    setFont(ctx, 500, 32, "'Poppins', sans-serif");
    ctx.fillStyle = COLORS.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText('A valid win with no scoring patterns.', W / 2, y + 50);
    y += 90;
  } else {
    for (const p of patterns) {
      ctx.textAlign = 'left';
      setFont(ctx, 600, 32, "'Poppins', sans-serif");
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(p.name, 90, y + 36);

      ctx.textAlign = 'right';
      setFont(ctx, 700, 32, "'Unbounded', sans-serif");
      ctx.fillStyle = p.isLimit ? COLORS.coral : COLORS.green;
      const faanLabel = p.isLimit ? `${p.faan} limit` : `+${p.faan}`;
      ctx.fillText(faanLabel, W - 90, y + 36);

      y += 60;
      if (y > H - 200) break;
    }
  }

  // ─── Footer ────────────────────────────────────────────────────
  // Coral accent line
  ctx.fillStyle = COLORS.coral;
  ctx.fillRect(W / 2 - 40, H - 170, 80, 4);

  setFont(ctx, 400, 26, "'Poppins', sans-serif");
  ctx.fillStyle = COLORS.inkSoft;
  ctx.textAlign = 'center';
  ctx.fillText('Score your hand at', W / 2, H - 120);

  setFont(ctx, 700, 38, "'Unbounded', sans-serif");
  ctx.fillStyle = COLORS.green;
  ctx.fillText('mahjmahj.co', W / 2, H - 65);

  // ─── Output ────────────────────────────────────────────────────
  return await canvasToBlob(canvas);
}

function setFont(ctx, weight, size, family) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function wrappedCenteredText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    const probe = current ? `${current} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = probe;
    }
  }
  if (current) lines.push(current);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return lines.length;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
  });
}
