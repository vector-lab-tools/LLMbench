"use client";

/**
 * Grammar Probe — research-grade Deep Dives for Phases C, D, E.
 *
 * One component per phase. Each wraps a set of quantitative panels inside
 * the shared <DeepDive> shell, with CSV export per panel. The goal is to
 * surface data the main phase view can't (token frequencies, register ×
 * framing heatmaps, greediness curves) so a researcher can read each
 * phase as an empirical claim rather than a demo.
 */

import { useMemo, Fragment } from "react";
import { DeepDive } from "@/components/shared/DeepDive";
import type { GrammarPattern } from "@/lib/grammar/patterns";
import { countMatches } from "@/lib/grammar/patterns";
import {
  REGISTER_LABELS,
  suiteOfPrompt,
  type GrammarRegister,
  type GrammarSuitePrompt,
} from "@/lib/grammar/prompt-suite";
import { formatRate, toCsv, downloadCsv } from "@/lib/grammar/aggregate";
import { Section, Bar, CsvButton, heatHitRate } from "./DeepDivePanels";

// ============================================================================
// Phase C — Forced continuation Deep Dive
// ============================================================================

export interface ForcedExpansion {
  scaffoldId: string;
  scaffold: string;
  panel: "A" | "B";
  rank: number;
  token: string;
  tokenLogprob: number;
  phrase: string | null;
  error?: string;
}

export function ForcedContinuationDeepDive({
  expansions, pattern,
}: {
  expansions: ForcedExpansion[];
  pattern: GrammarPattern;
}) {
  // Panel 1: Y-token frequency across scaffolds. Which single tokens does
  // the model repeatedly reach for as the Y slot filler? Read the top bar
  // as "the model defaults to 'way' as its Y-token in N% of scaffolds".
  const tokenFreq = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expansions) {
      const key = e.token.trim().toLowerCase();
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [expansions]);
  const maxFreq = Math.max(1, ...tokenFreq.map(([, n]) => n));

  // Panel 2: Y-phrase length distribution. Measures whether the model's
  // "nuance" Y-phrases tend to be short and abstract or long and
  // substantive. Bins 1..6 words; anything longer collapses into "6+".
  const phraseLengths = useMemo(() => {
    const bins = [0, 0, 0, 0, 0, 0];
    for (const e of expansions) {
      if (!e.phrase) continue;
      const words = e.phrase.trim().split(/\s+/).filter(Boolean).length;
      const bin = Math.min(Math.max(words, 1), 6) - 1;
      bins[bin]++;
    }
    return bins;
  }, [expansions]);
  const maxLen = Math.max(1, ...phraseLengths);

  // Panel 3: Per-scaffold logprob concentration — top-1 prob, mean top-N
  // prob, and Shannon entropy over the top-N distribution. Flags
  // scaffolds where the Y slot is very peaked ("only one plausible Y")
  // versus scaffolds where many Ys compete.
  const concentration = useMemo(() => {
    // Group by scaffold, derive softmax from logprobs (local re-softmax).
    const byScaffold = new Map<string, ForcedExpansion[]>();
    for (const e of expansions) {
      const bucket = byScaffold.get(e.scaffoldId) ?? [];
      bucket.push(e);
      byScaffold.set(e.scaffoldId, bucket);
    }
    const rows: { scaffold: string; scaffoldId: string; top1: number; meanP: number; entropy: number; n: number }[] = [];
    for (const [scaffoldId, group] of byScaffold) {
      const logprobs = group.map(g => g.tokenLogprob);
      const maxL = Math.max(...logprobs);
      const exps = logprobs.map(l => Math.exp(l - maxL));
      const sum = exps.reduce((s, x) => s + x, 0) || 1;
      const probs = exps.map(x => x / sum);
      const entropy = probs.reduce((h, p) => h + (p > 0 ? -p * Math.log2(p) : 0), 0);
      rows.push({
        scaffold: group[0].scaffold,
        scaffoldId,
        top1: Math.max(...probs),
        meanP: probs.reduce((s, p) => s + p, 0) / probs.length,
        entropy,
        n: group.length,
      });
    }
    return rows.sort((a, b) => b.top1 - a.top1);
  }, [expansions]);

  const exportTokenFreqCsv = () => {
    downloadCsv("grammar-phaseC-token-frequency.csv",
      toCsv(["y_token", "scaffold_count"], tokenFreq));
  };
  const exportPhraseLenCsv = () => {
    downloadCsv("grammar-phaseC-phrase-lengths.csv",
      toCsv(["word_count", "phrase_count"],
        phraseLengths.map((n, i) => [i === 5 ? "6+" : String(i + 1), n])));
  };
  const exportConcentrationCsv = () => {
    downloadCsv("grammar-phaseC-concentration.csv",
      toCsv(["scaffold_id", "scaffold", "n_entries", "top1_softmax_p", "mean_softmax_p", "entropy_bits"],
        concentration.map(r => [r.scaffoldId, r.scaffold, r.n, r.top1.toFixed(4), r.meanP.toFixed(4), r.entropy.toFixed(4)])));
  };

  if (expansions.length === 0) return null;

  return (
    <DeepDive label="Deep Dive — Y-token landscape, phrase lengths, slot concentration" defaultOpen={false}>
      <div className="space-y-2 text-caption">
        <div className="text-muted-foreground">
          Research lens on the <strong className="text-foreground">{pattern.shortLabel}</strong> Y-slot: which tokens and phrases does the model treat as the plausible completions, and how peaked is its distribution scaffold-by-scaffold?
        </div>

        <Section title={`Y-token frequency across scaffolds (top ${tokenFreq.length})`} defaultOpen
          actions={<CsvButton onClick={exportTokenFreqCsv} />}>
          <div className="text-muted-foreground mb-1">
            How many times each token appears in the top-N Y slot across all scaffolds. A tall top bar = the model reaches for that Y regardless of the scaffold&apos;s X.
          </div>
          <div className="grid grid-cols-[140px_1fr_50px] gap-1 items-center">
            {tokenFreq.map(([token, count]) => (
              <Fragment key={token}>
                <div className="font-mono text-[11px] text-foreground truncate" title={token}>{JSON.stringify(token)}</div>
                <Bar value={count} max={maxFreq} />
                <div className="text-[10px] font-mono text-foreground text-right">{count}</div>
              </Fragment>
            ))}
          </div>
        </Section>

        <Section title="Y-phrase length distribution (words)"
          actions={<CsvButton onClick={exportPhraseLenCsv} />}>
          <div className="text-muted-foreground mb-1">
            How long are the Y-phrase expansions? Compressed rhetoric favours short Ys (1–3 words); elaborate models spread into longer clauses.
          </div>
          <div className="grid grid-cols-[40px_1fr_60px] gap-1 items-center">
            {phraseLengths.map((n, i) => (
              <Fragment key={i}>
                <div className="text-[10px] font-mono text-muted-foreground">{i === 5 ? "6+" : `${i + 1}`}</div>
                <Bar value={n} max={maxLen} colour="amber" />
                <div className="text-[10px] font-mono text-foreground text-right">
                  {n} <span className="text-muted-foreground">({expansions.filter(e => e.phrase).length > 0 ? ((n / expansions.filter(e => e.phrase).length) * 100).toFixed(0) : 0}%)</span>
                </div>
              </Fragment>
            ))}
          </div>
        </Section>

        <Section title="Per-scaffold slot concentration"
          actions={<CsvButton onClick={exportConcentrationCsv} />}>
          <div className="text-muted-foreground mb-1">
            For each scaffold&rsquo;s top-N Ys, compute a local softmax and report <strong>top-1 p</strong> (mass on the single most-likely Y), <strong>mean p</strong>, and <strong>H</strong> (Shannon entropy in bits). High top-1 + low H = a near-deterministic slot; low top-1 + high H = a genuinely open slot with competing Ys.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead className="bg-cream/40 dark:bg-burgundy/10">
                <tr className="text-left">
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">Scaffold</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">n</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">top-1 p</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">mean p</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">H (bits)</th>
                </tr>
              </thead>
              <tbody>
                {concentration.map(r => (
                  <tr key={r.scaffoldId} className="border-t border-parchment/40">
                    <td className="px-2 py-1 font-mono text-[11px] text-foreground truncate max-w-[360px]" title={r.scaffold}>{r.scaffold}</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-right text-muted-foreground">{r.n}</td>
                    <td className={`px-2 py-1 font-mono text-[11px] text-right ${heatHitRate(r.top1)}`}>{(r.top1 * 100).toFixed(1)}%</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{(r.meanP * 100).toFixed(1)}%</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{r.entropy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </DeepDive>
  );
}

// ============================================================================
// Phase D — Perturbation Deep Dive
// ============================================================================

export interface PerturbationDeepDiveRun {
  runIndex: number;
  panel: "A" | "B";
  promptId: string;
  register?: string;
  prompt: string;
  text?: string;
  error?: string;
  framing: "neutral" | "anti" | "pro";
}

export function PerturbationDeepDive({
  runs, pattern, selectedPrompts,
}: {
  runs: PerturbationDeepDiveRun[];
  pattern: GrammarPattern;
  selectedPrompts: GrammarSuitePrompt[];
}) {
  // Panel 1: Per-prompt breakdown for the primary pattern. Which prompts
  // comply with the anti-framing and which ignore it? Useful because the
  // headline verdict can hide prompt-level variance (one prompt structural,
  // another stylistic, averaging to "mixed").
  const perPromptRows = useMemo(() => {
    return selectedPrompts.map(p => {
      const byFraming = (["neutral", "anti", "pro"] as const).map(f => {
        const rs = runs.filter(r => r.promptId === p.id && r.framing === f && r.text);
        const hit = rs.filter(r => countMatches(r.text!, pattern) > 0).length;
        return { framing: f, hit, total: rs.length, rate: rs.length > 0 ? hit / rs.length : NaN };
      });
      const n = byFraming[0].rate, a = byFraming[1].rate, pr = byFraming[2].rate;
      return {
        prompt: p, promptId: p.id,
        neutral: n, anti: a, pro: pr,
        dAnti: Number.isFinite(n) && Number.isFinite(a) ? a - n : NaN,
        dPro: Number.isFinite(n) && Number.isFinite(pr) ? pr - n : NaN,
      };
    });
  }, [runs, pattern, selectedPrompts]);

  // Panel 2: Register × framing heatmap. Does suppression instruction work
  // better in formal registers (where the model "complies" more readily)
  // than in poetic or narrative ones?
  const registers: GrammarRegister[] = ["speech", "op-ed", "explain", "technical", "poetic", "dialogue"];
  const activeRegisters = registers.filter(r => runs.some(x => x.register === r && x.text));
  const regHeatmap = useMemo(() => {
    const m = new Map<string, { rate: number; n: number }>();
    for (const reg of activeRegisters) {
      for (const f of ["neutral", "anti", "pro"] as const) {
        const rs = runs.filter(r => r.register === reg && r.framing === f && r.text);
        const hit = rs.filter(r => countMatches(r.text!, pattern) > 0).length;
        m.set(`${reg}::${f}`, { rate: rs.length > 0 ? hit / rs.length : NaN, n: rs.length });
      }
    }
    return m;
  }, [runs, pattern, activeRegisters]);

  // Panel 3: Example excerpts — for the primary pattern, show one example
  // run from each framing on a shared prompt. Lets the researcher read
  // side-by-side how the model's prose actually changed under the
  // directive, not just the aggregate number.
  const exemplars = useMemo(() => {
    // Prefer a prompt that has runs under all three framings.
    const candidate = selectedPrompts.find(p =>
      runs.some(r => r.promptId === p.id && r.framing === "neutral" && r.text) &&
      runs.some(r => r.promptId === p.id && r.framing === "anti" && r.text) &&
      runs.some(r => r.promptId === p.id && r.framing === "pro" && r.text)
    );
    if (!candidate) return null;
    const pick = (f: "neutral" | "anti" | "pro") =>
      runs.find(r => r.promptId === candidate.id && r.framing === f && r.text);
    return { prompt: candidate, neutral: pick("neutral"), anti: pick("anti"), pro: pick("pro") };
  }, [runs, selectedPrompts]);

  const fmtPct = (v: number) => Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
  const fmtDelta = (v: number) => {
    if (!Number.isFinite(v)) return "—";
    const pct = (v * 100).toFixed(1);
    return `${v > 0 ? "+" : ""}${pct}pp`;
  };

  const exportPerPromptCsv = () => {
    downloadCsv("grammar-phaseD-per-prompt.csv",
      toCsv(
        ["prompt_id", "prompt", "register",
         "neutral_rate", "anti_rate", "pro_rate", "delta_anti", "delta_pro"],
        perPromptRows.map(r => [r.promptId, r.prompt.prompt, r.prompt.register ?? "",
          Number.isFinite(r.neutral) ? r.neutral.toFixed(4) : "",
          Number.isFinite(r.anti) ? r.anti.toFixed(4) : "",
          Number.isFinite(r.pro) ? r.pro.toFixed(4) : "",
          Number.isFinite(r.dAnti) ? r.dAnti.toFixed(4) : "",
          Number.isFinite(r.dPro) ? r.dPro.toFixed(4) : ""])));
  };
  const exportRegHeatmapCsv = () => {
    const rows: unknown[][] = [];
    for (const reg of activeRegisters) {
      for (const f of ["neutral", "anti", "pro"] as const) {
        const c = regHeatmap.get(`${reg}::${f}`) ?? { rate: NaN, n: 0 };
        rows.push([reg, REGISTER_LABELS[reg], f, c.n, Number.isFinite(c.rate) ? c.rate.toFixed(4) : ""]);
      }
    }
    downloadCsv("grammar-phaseD-register-framing.csv",
      toCsv(["register_id", "register_label", "framing", "runs", "hit_rate"], rows));
  };

  if (runs.length === 0) return null;

  return (
    <DeepDive label="Deep Dive — per-prompt deltas, register × framing, side-by-side exemplars" defaultOpen={false}>
      <div className="space-y-2 text-caption">
        <div className="text-muted-foreground">
          Research lens on <strong className="text-foreground">{pattern.shortLabel}</strong> under three framings: <em>neutral</em> vs <em>anti-pattern</em> (suppress) vs <em>pro-pattern</em> (invite). The headline verdict in the main panel averages across prompts; the views below unpack where the compliance actually happens.
        </div>

        <Section title="Per-prompt hit rate under each framing" defaultOpen
          actions={<CsvButton onClick={exportPerPromptCsv} />}>
          <div className="text-muted-foreground mb-1">
            One row per selected prompt. Positive <span className="font-mono">Δanti</span> = the construction survived or increased under suppression. Negative Δanti = the model complied. Spread across prompts shows where the construction is robust.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead className="bg-cream/40 dark:bg-burgundy/10">
                <tr className="text-left">
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">Prompt</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Neutral</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Anti</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Δanti</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Pro</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Δpro</th>
                </tr>
              </thead>
              <tbody>
                {perPromptRows.map(r => (
                  <tr key={r.promptId} className="border-t border-parchment/40">
                    <td className="px-2 py-1 text-[11px] text-foreground truncate max-w-[340px]" title={r.prompt.prompt}>{r.prompt.prompt}</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{fmtPct(r.neutral)}</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{fmtPct(r.anti)}</td>
                    <td className={`px-2 py-1 font-mono text-[11px] text-right ${Number.isFinite(r.dAnti) && r.dAnti < -0.2 ? "text-emerald-700 dark:text-emerald-400" : Number.isFinite(r.dAnti) && Math.abs(r.dAnti) < 0.1 ? "text-burgundy font-semibold" : "text-foreground"}`}>{fmtDelta(r.dAnti)}</td>
                    <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{fmtPct(r.pro)}</td>
                    <td className={`px-2 py-1 font-mono text-[11px] text-right ${Number.isFinite(r.dPro) && r.dPro > 0.2 ? "text-burgundy font-semibold" : "text-foreground"}`}>{fmtDelta(r.dPro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Register × framing heatmap"
          actions={<CsvButton onClick={exportRegHeatmapCsv} />}>
          <div className="text-muted-foreground mb-1">
            Hit rate of the primary construction broken down by register (speech, op-ed, explain, technical, poetic, dialogue) and framing. Looks for registers where suppression is selectively effective.
          </div>
          {activeRegisters.length === 0 ? (
            <div className="text-muted-foreground italic">No register-tagged runs.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-caption border-collapse">
                <thead className="bg-cream/40 dark:bg-burgundy/10">
                  <tr>
                    <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">Register \ Framing</th>
                    {(["neutral", "anti", "pro"] as const).map(f => (
                      <th key={f} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeRegisters.map(reg => (
                    <tr key={reg} className="border-t border-parchment/40">
                      <td className="px-2 py-1 text-[11px] font-semibold text-foreground whitespace-nowrap">{REGISTER_LABELS[reg]}</td>
                      {(["neutral", "anti", "pro"] as const).map(f => {
                        const c = regHeatmap.get(`${reg}::${f}`) ?? { rate: NaN, n: 0 };
                        return (
                          <td key={f} className={`px-2 py-1 text-right font-mono text-[11px] ${heatHitRate(c.rate)}`}>
                            {c.n > 0 ? formatRate(c.rate) : "—"}
                            <div className="text-[9px] text-muted-foreground">{c.n} runs</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Side-by-side exemplars (one prompt, three framings)">
          {!exemplars ? (
            <div className="text-muted-foreground italic">No prompt has runs under all three framings yet.</div>
          ) : (
            <div className="space-y-2">
              <div className="text-muted-foreground">
                Prompt: <span className="font-mono text-foreground">{exemplars.prompt.prompt}</span>
              </div>
              {(["neutral", "anti", "pro"] as const).map(f => {
                const ex = exemplars[f];
                const hit = ex?.text ? countMatches(ex.text, pattern) : 0;
                return (
                  <div key={f} className="border-l-2 border-parchment/60 pl-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                      {f} <span className="ml-2 text-muted-foreground/60 normal-case tracking-normal font-normal">
                        {hit > 0 ? <span className="text-burgundy">{hit} hit{hit !== 1 ? "s" : ""}</span> : "no hits"}
                      </span>
                    </div>
                    <div className="text-[11px] text-foreground whitespace-pre-wrap break-words mt-0.5">
                      {ex?.text ? (ex.text.length > 600 ? ex.text.slice(0, 600) + "…" : ex.text) : <span className="italic text-muted-foreground">(no text)</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </DeepDive>
  );
}

// ============================================================================
// Phase E — Temperature sweep Deep Dive
// ============================================================================

export interface SweepDeepDiveRun {
  runIndex: number;
  panel: "A" | "B";
  promptId: string;
  register?: string;
  prompt: string;
  temperature: number;
  text?: string;
  error?: string;
}

export function TemperatureSweepDeepDive({
  sweepRuns, selectedPatterns, sweepTemps,
}: {
  sweepRuns: SweepDeepDiveRun[];
  selectedPatterns: GrammarPattern[];
  sweepTemps: number[];
}) {
  // Panel 1: Per-construction small multiples. For each selected pattern,
  // hit rate as a function of T. Useful for spotting whether Phase E's
  // headline curve averaged over many patterns is actually composed of
  // agreeing curves or opposing ones.
  const perPatternCurves = useMemo(() => {
    return selectedPatterns.map(p => {
      const points = sweepTemps.map(t => {
        const rs = sweepRuns.filter(r => r.temperature === t && r.text);
        const hit = rs.filter(r => countMatches(r.text!, p) > 0).length;
        return { t, rate: rs.length > 0 ? hit / rs.length : NaN, n: rs.length, hit };
      });
      const t0 = points.find(pt => pt.t === 0)?.rate ?? NaN;
      const warm = points.filter(pt => pt.t > 0 && pt.n > 0).map(pt => pt.rate);
      const meanWarm = warm.length > 0 ? warm.reduce((s, v) => s + v, 0) / warm.length : NaN;
      const elasticity = Number.isFinite(t0) && Number.isFinite(meanWarm) ? t0 - meanWarm : NaN;
      // AUC: trapezoidal integration of rate over T ∈ [min, max]. Gives a
      // single number for "how much total prevalence does this pattern
      // accumulate across the sweep".
      let auc = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        if (Number.isFinite(a.rate) && Number.isFinite(b.rate)) {
          auc += ((a.rate + b.rate) / 2) * (b.t - a.t);
        }
      }
      return { pattern: p, points, t0, meanWarm, elasticity, auc };
    });
  }, [sweepRuns, selectedPatterns, sweepTemps]);
  const maxRate = Math.max(0.0001, ...perPatternCurves.flatMap(c => c.points.map(p => p.rate)).filter(Number.isFinite));

  // Panel 2: Register × temperature heatmap (for the primary pattern —
  // or really any single pattern; use the first selected one). Shows
  // whether the greediness index varies by register.
  const primary = selectedPatterns[0];
  const registers: GrammarRegister[] = ["speech", "op-ed", "explain", "technical", "poetic", "dialogue"];
  const activeRegisters = registers.filter(r => sweepRuns.some(x => x.register === r && x.text));
  const regTempHeatmap = useMemo(() => {
    if (!primary) return new Map<string, { rate: number; n: number }>();
    const m = new Map<string, { rate: number; n: number }>();
    for (const reg of activeRegisters) {
      for (const t of sweepTemps) {
        const rs = sweepRuns.filter(r => r.register === reg && r.temperature === t && r.text);
        const hit = rs.filter(r => countMatches(r.text!, primary) > 0).length;
        m.set(`${reg}::${t}`, { rate: rs.length > 0 ? hit / rs.length : NaN, n: rs.length });
      }
    }
    return m;
  }, [sweepRuns, primary, activeRegisters, sweepTemps]);

  // Panel 3: Greediness table with AUC + structural/sampler-emergent
  // classification. The claim-ready summary row: "for each construction,
  // is it a reflex of the argmax or a sampler artefact?"
  const exportCurvesCsv = () => {
    const rows: unknown[][] = [];
    for (const c of perPatternCurves) {
      for (const pt of c.points) {
        rows.push([c.pattern.id, c.pattern.shortLabel, pt.t, pt.n, pt.hit,
          Number.isFinite(pt.rate) ? pt.rate.toFixed(4) : ""]);
      }
    }
    downloadCsv("grammar-phaseE-curves.csv",
      toCsv(["pattern_id", "pattern_label", "temperature", "runs", "hits", "hit_rate"], rows));
  };
  const exportGreedinessCsv = () => {
    downloadCsv("grammar-phaseE-greediness.csv",
      toCsv(["pattern_id", "pattern_label", "rate_t0", "mean_rate_warm", "elasticity", "auc"],
        perPatternCurves.map(c => [c.pattern.id, c.pattern.shortLabel,
          Number.isFinite(c.t0) ? c.t0.toFixed(4) : "",
          Number.isFinite(c.meanWarm) ? c.meanWarm.toFixed(4) : "",
          Number.isFinite(c.elasticity) ? c.elasticity.toFixed(4) : "",
          c.auc.toFixed(4)])));
  };
  const exportRegTempCsv = () => {
    const rows: unknown[][] = [];
    for (const reg of activeRegisters) {
      for (const t of sweepTemps) {
        const c = regTempHeatmap.get(`${reg}::${t}`) ?? { rate: NaN, n: 0 };
        rows.push([primary?.id ?? "", reg, REGISTER_LABELS[reg], t, c.n,
          Number.isFinite(c.rate) ? c.rate.toFixed(4) : ""]);
      }
    }
    downloadCsv("grammar-phaseE-register-temperature.csv",
      toCsv(["pattern_id", "register_id", "register_label", "temperature", "runs", "hit_rate"], rows));
  };

  if (sweepRuns.length === 0) return null;

  return (
    <DeepDive label="Deep Dive — per-construction curves, register × T heatmap, greediness table" defaultOpen={false}>
      <div className="space-y-2 text-caption">
        <div className="text-muted-foreground">
          Decomposition of the temperature sweep: curves per construction, register breakdown for the primary pattern, and a greediness index + AUC table summarising how sensitive each construction is to sampling temperature.
        </div>

        <Section title="Per-construction hit rate vs temperature" defaultOpen
          actions={<CsvButton onClick={exportCurvesCsv} />}>
          <div className="text-muted-foreground mb-1">
            Small multiples, one per selected construction. A flat-line at low T with collapse at high T = greedy-centre reflex. A rising curve = sampler-emergent. Curves that diverge across selected constructions make the headline Phase E line (which averages them) harder to interpret.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {perPatternCurves.map(c => (
              <div key={c.pattern.id} className="border border-parchment/50 rounded-sm p-2">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-[11px] font-semibold text-foreground truncate">{c.pattern.shortLabel}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    AUC {c.auc.toFixed(2)} &middot; elasticity {Number.isFinite(c.elasticity) ? ((c.elasticity > 0 ? "+" : "") + (c.elasticity * 100).toFixed(1) + "pp") : "n/a"}
                  </div>
                </div>
                <div className="grid grid-cols-[32px_1fr_60px] gap-1 items-center">
                  {c.points.map(p => (
                    <Fragment key={p.t}>
                      <div className="text-[10px] font-mono text-muted-foreground">T{p.t.toFixed(1)}</div>
                      <Bar value={Number.isFinite(p.rate) ? p.rate : 0} max={maxRate} />
                      <div className="text-[10px] font-mono text-foreground text-right">
                        {p.n > 0 ? formatRate(p.rate) : "—"}
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {primary && (
          <Section title={`Register × temperature heatmap — ${primary.shortLabel}`}
            actions={<CsvButton onClick={exportRegTempCsv} />}>
            <div className="text-muted-foreground mb-1">
              For the primary construction, hit rate across registers × temperatures. Useful for spotting registers where the construction&rsquo;s temperature dependence differs from the corpus-level curve.
            </div>
            {activeRegisters.length === 0 ? (
              <div className="text-muted-foreground italic">No register-tagged sweep runs.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-caption border-collapse">
                  <thead className="bg-cream/40 dark:bg-burgundy/10">
                    <tr>
                      <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">Register</th>
                      {sweepTemps.map(t => (
                        <th key={t} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">T{t.toFixed(1)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRegisters.map(reg => (
                      <tr key={reg} className="border-t border-parchment/40">
                        <td className="px-2 py-1 text-[11px] font-semibold text-foreground whitespace-nowrap">{REGISTER_LABELS[reg]}</td>
                        {sweepTemps.map(t => {
                          const c = regTempHeatmap.get(`${reg}::${t}`) ?? { rate: NaN, n: 0 };
                          return (
                            <td key={t} className={`px-2 py-1 text-right font-mono text-[11px] ${heatHitRate(c.rate)}`}>
                              {c.n > 0 ? formatRate(c.rate) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        <Section title="Greediness index + AUC table"
          actions={<CsvButton onClick={exportGreedinessCsv} />}>
          <div className="text-muted-foreground mb-1">
            Compact summary per construction. <strong>elasticity</strong> = rate(T=0) − mean rate(T&gt;0); positive means the construction lives at the argmax (greedy reflex), negative means it emerges out of the sampler. <strong>AUC</strong> integrates hit rate over the sweep (total prevalence exposure across T).
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead className="bg-cream/40 dark:bg-burgundy/10">
                <tr className="text-left">
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">Construction</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">rate(T=0)</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">mean rate(T&gt;0)</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">elasticity</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">AUC</th>
                  <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">reading</th>
                </tr>
              </thead>
              <tbody>
                {perPatternCurves.map(c => {
                  const reading = !Number.isFinite(c.elasticity) ? "insufficient"
                    : c.elasticity > 0.15 ? "greedy reflex"
                    : c.elasticity < -0.15 ? "sampler-emergent"
                    : "register-driven";
                  return (
                    <tr key={c.pattern.id} className="border-t border-parchment/40">
                      <td className="px-2 py-1 text-[11px] text-foreground">{c.pattern.shortLabel}</td>
                      <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{Number.isFinite(c.t0) ? formatRate(c.t0) : "—"}</td>
                      <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{Number.isFinite(c.meanWarm) ? formatRate(c.meanWarm) : "—"}</td>
                      <td className={`px-2 py-1 font-mono text-[11px] text-right ${Number.isFinite(c.elasticity) && c.elasticity > 0.15 ? "text-burgundy font-semibold" : Number.isFinite(c.elasticity) && c.elasticity < -0.15 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-foreground"}`}>
                        {Number.isFinite(c.elasticity) ? `${c.elasticity > 0 ? "+" : ""}${(c.elasticity * 100).toFixed(1)}pp` : "—"}
                      </td>
                      <td className="px-2 py-1 font-mono text-[11px] text-right text-foreground">{c.auc.toFixed(2)}</td>
                      <td className="px-2 py-1 text-[11px] text-muted-foreground">{reading}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </DeepDive>
  );
}

// Silence unused import warning — suiteOfPrompt is reserved for a future
// panel and keeping the import avoids churn across subsequent releases.
void suiteOfPrompt;
