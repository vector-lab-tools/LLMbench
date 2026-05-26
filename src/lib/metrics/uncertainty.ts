/**
 * Token-level uncertainty: display helpers.
 *
 * LLMbench computes Shannon entropy internally (in bits) — additive,
 * standard, easy to combine across positions. For DISPLAY, though, a
 * humanities reader is better served by perplexity, which re-expresses
 * entropy as "the effective number of equally-likely candidates the
 * model was choosing between":
 *
 *     perplexity = 2 ^ entropy_bits
 *
 * So 0 bits → 1 (certainty), 1 bit → 2, 3.32 bits → ≈ 10, etc.
 *
 * The unit choice is a user preference (`ProviderSettings.uncertaintyUnit`)
 * with `"perplexity"` as the default. This module is the single point of
 * truth for *how* either unit is rendered — colour-coded labels in the
 * Probs detail panel, sentence-entropy bands, sampling-step tooltips
 * and so on all route through `formatUncertainty()` so the visible string
 * stays consistent across the app.
 */

export type UncertaintyUnit = "perplexity" | "entropy";

/** Convert Shannon entropy (bits) → perplexity (effective option count). */
export function bitsToPerplexity(bits: number): number {
  if (!Number.isFinite(bits) || bits < 0) return 1;
  return Math.pow(2, bits);
}

/**
 * Pick a sensible decimal precision for a perplexity value. Tight near
 * the certainty end (1.004 reads as noise unless we show 3 decimals;
 * 87.3 reads better as "87.3" than "87.291").
 */
function perplexityPrecision(p: number): number {
  if (p < 2) return 3;
  if (p < 10) return 2;
  if (p < 100) return 1;
  return 0;
}

/**
 * Render an uncertainty value in the user's chosen unit.
 *
 * - Returns the bare numeric string plus an explicit unit suffix.
 *   Callers prepend their own label ("Entropy:" / "Perplexity:") so
 *   the surrounding typography stays under each panel's control.
 * - For perplexity, the suffix is empty (the unit is just "options"
 *   and is conveyed by context); for entropy, the suffix is "bits".
 *
 * @param bits  Shannon entropy in bits (always the computed primitive).
 * @param unit  Display unit. Default "perplexity".
 * @param opts  Optional precision override + leading "≈" toggle.
 */
export function formatUncertainty(
  bits: number,
  unit: UncertaintyUnit = "perplexity",
  opts: { decimals?: number; approx?: boolean } = {}
): { value: string; suffix: string; label: string } {
  if (unit === "entropy") {
    const decimals = opts.decimals ?? 2;
    return {
      value: bits.toFixed(decimals),
      suffix: " bits",
      label: "Entropy",
    };
  }
  // Perplexity (default)
  const p = bitsToPerplexity(bits);
  const decimals = opts.decimals ?? perplexityPrecision(p);
  const approxPrefix = opts.approx === false ? "" : "≈ ";
  return {
    value: `${approxPrefix}${p.toFixed(decimals)}`,
    suffix: "",
    label: "Perplexity",
  };
}

/**
 * Convenience: format the entire uncertainty phrase as a single string
 * ("Perplexity: ≈ 9.97" or "Entropy: 3.32 bits"). Used by analytical
 * notes inside the detail panel where the caller wants a complete
 * sentence-fragment rather than its parts.
 */
export function formatUncertaintyPhrase(
  bits: number,
  unit: UncertaintyUnit = "perplexity",
  opts: { decimals?: number; approx?: boolean } = {}
): string {
  const { value, suffix, label } = formatUncertainty(bits, unit, opts);
  return `${label}: ${value}${suffix}`;
}
