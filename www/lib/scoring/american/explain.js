/**
 * Generate a plain-English explanation of an American (NMJL) scored hand.
 */

export function explain(result) {
  if (!result.valid) {
    return {
      headline: 'Hand could not be validated',
      lines: result.errors || ['This hand cannot be scored.'],
      breakdown: [],
      payout: null,
    };
  }

  const breakdown = result.matches.map(m => ({
    name: m.name,
    faan: m.points,
    description: m.description,
    isLimit: false,
    isMultiplier: !!m.isMultiplier,
    warning: !!m.warning,
    informational: !!m.informational,
  }));

  const base = result.faanRaw;
  const mult = result.multiplier || 1;
  const final = result.faan;

  const lines = [];
  if (mult > 1) {
    lines.push(`${base} points × ${mult} = ${final} points.`);
  } else {
    lines.push(`${final} points.`);
  }
  lines.push(`Refer to your NMJL card for the specific pattern's base value and any club-specific scoring conventions.`);

  return {
    headline: result.handTitle,
    lines,
    breakdown,
    payout: {
      base: final,
      text: result.hand?.win?.selfDrawn
        ? `Self-drawn — each of the three losers typically pays the full amount.`
        : `Won on a discard — the discarder typically pays double, the other two players pay the base amount. (Conventions vary by club.)`,
    },
  };
}
