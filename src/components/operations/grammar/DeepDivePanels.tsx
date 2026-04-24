"use client";

/**
 * Grammar Probe — Research-grade Deep Dive panels.
 *
 * Consumes the raw RunRecord arrays from Phase A (prevalence) and Phase E
 * (temperature sweep) plus the selectedPatterns array, and renders six
 * quantitative sub-views. Each view ships its own CSV export so the data
 * can be replayed downstream. All computation is client-side and uses the
 * pure helpers in `src/lib/grammar/aggregate.ts` so the same aggregates
 * feed the UI and the bundle export.
 */

import { useMemo, useState, Fragment } from "react";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import type { GrammarPattern } from "@/lib/grammar/patterns";
import {
  GRAMMAR_SUITES,
  suiteOfPrompt,
  REGISTER_LABELS,
  type GrammarSuiteKind,
  type GrammarRegister,
} from "@/lib/grammar/prompt-suite";
import {
  countMultiPattern,
  aggregateByPatternPanelTemp,
  aggregateByPatternRegister,
  hitsHistogram,
  coOccurrenceMatrix,
  formatRate,
  toCsv,
  downloadCsv,
  type MultiCountedRun,
  type RateCell,
  emptyCell,
} from "@/lib/grammar/aggregate";

// The minimum shape we need. Matches RunRecord in GrammarMode without a
// circular import.
export interface DeepDiveRun {
  runIndex: number;
  panel: "A" | "B";
  promptId: string;
  register?: string;
  prompt: string;
  temperature: number;
  text?: string;
  error?: string;
}

interface Props {
  runs: DeepDiveRun[];
  sweepRuns: DeepDiveRun[];
  selectedPatterns: GrammarPattern[];
  activeSuiteIds: Set<GrammarSuiteKind>;
  prevalenceTemps: number[];
  sweepTemps: number[];
  getSlotLabel: (panel: "A" | "B") => string;
}

// ----------------------------- helpers -------------------------------------

function heatHitRate(rate: number): string {
  if (!Number.isFinite(rate)) return "bg-muted/20 text-muted-foreground/40";
  if (rate >= 0.6) return "bg-burgundy/30 text-burgundy dark:text-amber-100";
  if (rate >= 0.35) return "bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100";
  if (rate >= 0.15) return "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200";
  if (rate > 0) return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300";
  return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300";
}

function Section({ title, children, defaultOpen = false, actions }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-parchment/60 rounded-sm bg-card/40">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-parchment/40 bg-cream/30 dark:bg-burgundy/10">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-caption font-semibold text-foreground"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {title}
        </button>
        {open && actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
      {open && <div className="p-2">{children}</div>}
    </div>
  );
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-editorial-ghost flex items-center gap-1 text-[10px] px-2 py-0.5"
      title="Download this view as CSV"
    >
      <Download className="w-3 h-3" /> CSV
    </button>
  );
}

function Bar({ value, max, label, colour = "burgundy" }: {
  value: number; max: number; label?: string; colour?: "burgundy" | "amber";
}) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bg = colour === "burgundy"
    ? "bg-burgundy/80 dark:bg-burgundy/60"
    : "bg-amber-500/80 dark:bg-amber-500/60";
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 bg-parchment/30 dark:bg-parchment/10 h-3 rounded-sm overflow-hidden min-w-[80px]">
        <div className={`${bg} h-full`} style={{ width: `${w}%` }} />
      </div>
      {label && <span className="text-[10px] font-mono text-muted-foreground w-10 text-right shrink-0">{label}</span>}
    </div>
  );
}

// ----------------------------- main ----------------------------------------

export function GrammarDeepDive(props: Props) {
  const {
    runs, sweepRuns, selectedPatterns, activeSuiteIds,
    prevalenceTemps, sweepTemps, getSlotLabel,
  } = props;

  // Apply every selected pattern across every Phase A run, once.
  const counted: MultiCountedRun[] = useMemo(
    () => countMultiPattern(runs, selectedPatterns),
    [runs, selectedPatterns]
  );
  const sweepCounted: MultiCountedRun[] = useMemo(
    () => countMultiPattern(sweepRuns, selectedPatterns),
    [sweepRuns, selectedPatterns]
  );

  const panelsShown: ("A" | "B")[] = useMemo(() => {
    const has = new Set(runs.map(r => r.panel));
    return (["A", "B"] as const).filter(p => has.has(p));
  }, [runs]);

  const patternPanelTemp = useMemo(
    () => aggregateByPatternPanelTemp(counted, selectedPatterns),
    [counted, selectedPatterns]
  );
  const patternRegister = useMemo(
    () => aggregateByPatternRegister(counted, selectedPatterns),
    [counted, selectedPatterns]
  );
  const histogram = useMemo(
    () => hitsHistogram(counted, selectedPatterns),
    [counted, selectedPatterns]
  );
  const { matrix: coMatrix, supportI } = useMemo(
    () => coOccurrenceMatrix(counted, selectedPatterns),
    [counted, selectedPatterns]
  );

  const sweepByPatternTemp = useMemo(() => {
    // Map<patternId::T, RateCell>
    const out = new Map<string, RateCell>();
    for (const r of sweepCounted) {
      if (!r.text) continue;
      for (const p of selectedPatterns) {
        const key = `${p.id}::${r.temperature}`;
        const prev = out.get(key) ?? emptyCell();
        const hits = r.perPatternHits[p.id] || 0;
        out.set(key, {
          runs: prev.runs + 1,
          runsWithHit: prev.runsWithHit + (hits > 0 ? 1 : 0),
          totalHits: prev.totalHits + hits,
          hitRate: 0, avgHitsPerRun: 0,
        });
      }
    }
    for (const [k, v] of out) {
      out.set(k, {
        ...v,
        hitRate: v.runs > 0 ? v.runsWithHit / v.runs : 0,
        avgHitsPerRun: v.runs > 0 ? v.totalHits / v.runs : 0,
      });
    }
    return out;
  }, [sweepCounted, selectedPatterns]);

  // --------------------------- renderers -----------------------------------

  // Panel 1: Per-construction bar chart (hit rate by model × temperature)
  const renderBarChart = () => {
    const maxRate = Math.max(
      0.0001,
      ...Array.from(patternPanelTemp.values()).map(c => c.hitRate)
    );
    return (
      <div className="space-y-2">
        <div className="text-caption text-muted-foreground">
          Hit rate = fraction of runs with ≥1 match. One row per selected construction; one bar per panel × temperature.
        </div>
        {selectedPatterns.map(p => (
          <div key={p.id} className="border-l-2 border-burgundy/50 pl-2 py-1">
            <div className="text-[11px] font-semibold text-foreground">{p.shortLabel ?? p.label}</div>
            <div className="text-[10px] text-muted-foreground mb-1 font-mono">{p.id}</div>
            <div className="grid grid-cols-[80px_1fr_60px] gap-1 items-center">
              {panelsShown.flatMap(panel =>
                prevalenceTemps.map(t => {
                  const cell = patternPanelTemp.get(`${p.id}::${panel}::${t}`) ?? emptyCell();
                  return (
                    <Fragment key={`${panel}-${t}`}>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {panel} T{t.toFixed(1)}
                      </div>
                      <Bar value={cell.hitRate} max={maxRate} />
                      <div className="text-[10px] font-mono text-foreground text-right">
                        {formatRate(cell.hitRate)} <span className="text-muted-foreground">({cell.runsWithHit}/{cell.runs})</span>
                      </div>
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const exportBarChartCsv = () => {
    const rows: unknown[][] = [];
    for (const p of selectedPatterns) {
      for (const panel of panelsShown) {
        for (const t of prevalenceTemps) {
          const c = patternPanelTemp.get(`${p.id}::${panel}::${t}`) ?? emptyCell();
          rows.push([
            p.id, p.shortLabel ?? p.label, panel, getSlotLabel(panel),
            t, c.runs, c.runsWithHit, c.totalHits,
            c.hitRate.toFixed(4), c.avgHitsPerRun.toFixed(4),
          ]);
        }
      }
    }
    downloadCsv(
      "grammar-probe-hit-rate.csv",
      toCsv(
        ["pattern_id", "pattern_label", "panel", "panel_label", "temperature",
         "runs", "runs_with_hit", "total_hits", "hit_rate", "avg_hits_per_run"],
        rows
      )
    );
  };

  // Panel 2: Hits-per-run histogram
  const renderHistogram = () => {
    const BIN_LABELS = ["0", "1", "2", "3", "4", "5+"];
    return (
      <div className="space-y-2">
        <div className="text-caption text-muted-foreground">
          Distribution of per-run hit counts. A fat zero bin means the construction is rare; a spread to the right means the model produces it multiple times per prose sample.
        </div>
        {selectedPatterns.map(p => {
          const bins = histogram.get(p.id) ?? [];
          const totalRuns = bins.reduce((s, n) => s + n, 0);
          const maxBin = Math.max(1, ...bins);
          return (
            <div key={p.id} className="border-l-2 border-burgundy/50 pl-2 py-1">
              <div className="text-[11px] font-semibold text-foreground mb-1">
                {p.shortLabel ?? p.label}
                <span className="ml-2 text-[10px] font-mono text-muted-foreground">n={totalRuns}</span>
              </div>
              <div className="grid grid-cols-[40px_1fr_60px] gap-1 items-center">
                {bins.map((n, i) => (
                  <Fragment key={i}>
                    <div className="text-[10px] font-mono text-muted-foreground">{BIN_LABELS[i]}</div>
                    <Bar value={n} max={maxBin} colour="amber" />
                    <div className="text-[10px] font-mono text-foreground text-right">
                      {n} <span className="text-muted-foreground">({totalRuns > 0 ? ((n / totalRuns) * 100).toFixed(0) : 0}%)</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const exportHistogramCsv = () => {
    const rows: unknown[][] = [];
    const BIN_LABELS = ["0", "1", "2", "3", "4", "5+"];
    for (const p of selectedPatterns) {
      const bins = histogram.get(p.id) ?? [];
      bins.forEach((n, i) => rows.push([p.id, p.shortLabel ?? p.label, BIN_LABELS[i], n]));
    }
    downloadCsv(
      "grammar-probe-hits-histogram.csv",
      toCsv(["pattern_id", "pattern_label", "hits_bin", "run_count"], rows)
    );
  };

  // Panel 3: Register × construction heatmap
  const registers: GrammarRegister[] = ["speech", "op-ed", "explain", "technical", "poetic", "dialogue"];
  const activeRegisters = registers.filter(r =>
    counted.some(run => run.register === r && run.text)
  );

  const renderRegisterHeatmap = () => {
    if (activeRegisters.length === 0) {
      return <div className="text-caption text-muted-foreground italic">No register-tagged runs yet.</div>;
    }
    return (
      <div className="space-y-1">
        <div className="text-caption text-muted-foreground">
          Hit rate (runs with ≥1 match / total runs) broken down by rhetorical register. Warmer cells = higher prevalence.
        </div>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead className="bg-cream/40 dark:bg-burgundy/10">
              <tr>
                <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">Pattern \ Register</th>
                {activeRegisters.map(r => (
                  <th key={r} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {REGISTER_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedPatterns.map(p => (
                <tr key={p.id} className="border-t border-parchment/40">
                  <td className="px-2 py-1 text-[11px] font-semibold text-foreground whitespace-nowrap">
                    {p.shortLabel ?? p.label}
                  </td>
                  {activeRegisters.map(r => {
                    const c = patternRegister.get(`${p.id}::${r}`) ?? emptyCell();
                    return (
                      <td key={r} className={`px-2 py-1 text-right font-mono text-[11px] ${heatHitRate(c.hitRate)}`}>
                        {c.runs > 0 ? formatRate(c.hitRate) : "—"}
                        <div className="text-[9px] text-muted-foreground">{c.runsWithHit}/{c.runs}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const exportRegisterCsv = () => {
    const rows: unknown[][] = [];
    for (const p of selectedPatterns) {
      for (const r of activeRegisters) {
        const c = patternRegister.get(`${p.id}::${r}`) ?? emptyCell();
        rows.push([
          p.id, p.shortLabel ?? p.label, r, REGISTER_LABELS[r],
          c.runs, c.runsWithHit, c.hitRate.toFixed(4), c.avgHitsPerRun.toFixed(4),
        ]);
      }
    }
    downloadCsv(
      "grammar-probe-register.csv",
      toCsv(
        ["pattern_id", "pattern_label", "register_id", "register_label",
         "runs", "runs_with_hit", "hit_rate", "avg_hits_per_run"],
        rows
      )
    );
  };

  // Panel 4: Suite × construction stratification
  const suiteStrat = useMemo(() => {
    const out = new Map<string, RateCell>();
    for (const r of counted) {
      if (!r.text) continue;
      const suite = suiteOfPrompt(r.promptId);
      if (!suite) continue;
      for (const p of selectedPatterns) {
        const key = `${p.id}::${suite.id}`;
        const prev = out.get(key) ?? emptyCell();
        const hits = r.perPatternHits[p.id] || 0;
        out.set(key, {
          runs: prev.runs + 1,
          runsWithHit: prev.runsWithHit + (hits > 0 ? 1 : 0),
          totalHits: prev.totalHits + hits,
          hitRate: 0, avgHitsPerRun: 0,
        });
      }
    }
    for (const [k, v] of out) {
      out.set(k, {
        ...v,
        hitRate: v.runs > 0 ? v.runsWithHit / v.runs : 0,
        avgHitsPerRun: v.runs > 0 ? v.totalHits / v.runs : 0,
      });
    }
    return out;
  }, [counted, selectedPatterns]);

  const activeSuites = GRAMMAR_SUITES.filter(s => activeSuiteIds.has(s.id));

  const renderSuiteStrat = () => {
    if (activeSuites.length === 0) {
      return <div className="text-caption text-muted-foreground italic">No active suites.</div>;
    }
    return (
      <div className="space-y-1">
        <div className="text-caption text-muted-foreground">
          Hit rate stratified by prompt suite (purpose × domain). Use to spot whether a construction is provoked by a particular thematic framing.
        </div>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead className="bg-cream/40 dark:bg-burgundy/10">
              <tr>
                <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">Pattern \ Suite</th>
                {activeSuites.map(s => (
                  <th key={s.id} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {s.shortLabel ?? s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedPatterns.map(p => (
                <tr key={p.id} className="border-t border-parchment/40">
                  <td className="px-2 py-1 text-[11px] font-semibold text-foreground whitespace-nowrap">
                    {p.shortLabel ?? p.label}
                  </td>
                  {activeSuites.map(s => {
                    const c = suiteStrat.get(`${p.id}::${s.id}`) ?? emptyCell();
                    return (
                      <td key={s.id} className={`px-2 py-1 text-right font-mono text-[11px] ${heatHitRate(c.hitRate)}`}>
                        {c.runs > 0 ? formatRate(c.hitRate) : "—"}
                        <div className="text-[9px] text-muted-foreground">{c.runsWithHit}/{c.runs}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const exportSuiteCsv = () => {
    const rows: unknown[][] = [];
    for (const p of selectedPatterns) {
      for (const s of activeSuites) {
        const c = suiteStrat.get(`${p.id}::${s.id}`) ?? emptyCell();
        rows.push([
          p.id, p.shortLabel ?? p.label, s.id, s.label,
          c.runs, c.runsWithHit, c.hitRate.toFixed(4), c.avgHitsPerRun.toFixed(4),
        ]);
      }
    }
    downloadCsv(
      "grammar-probe-suite.csv",
      toCsv(
        ["pattern_id", "pattern_label", "suite_id", "suite_label",
         "runs", "runs_with_hit", "hit_rate", "avg_hits_per_run"],
        rows
      )
    );
  };

  // Panel 5: Co-occurrence matrix
  const renderCoOccurrence = () => {
    if (selectedPatterns.length < 2) {
      return (
        <div className="text-caption text-muted-foreground italic">
          Select at least two constructions to populate the co-occurrence matrix.
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="text-caption text-muted-foreground">
          Cell (i, j) = P(pattern j fires | pattern i fires) across the same run. Diagonal is 1 (by construction). Off-diagonal spikes mean two constructions co-occur — e.g. antithesis paired with paradox.
        </div>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead className="bg-cream/40 dark:bg-burgundy/10">
              <tr>
                <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">given i ↓ / j →</th>
                {selectedPatterns.map(p => (
                  <th key={p.id} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 whitespace-nowrap">
                    {p.shortLabel ?? p.label}
                  </th>
                ))}
                <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">support(i)</th>
              </tr>
            </thead>
            <tbody>
              {selectedPatterns.map((p, i) => (
                <tr key={p.id} className="border-t border-parchment/40">
                  <td className="px-2 py-1 text-[11px] font-semibold text-foreground whitespace-nowrap">
                    {p.shortLabel ?? p.label}
                  </td>
                  {selectedPatterns.map((_, j) => {
                    const v = coMatrix[i]?.[j];
                    const cls = i === j ? "bg-parchment/40 text-muted-foreground"
                      : !Number.isFinite(v) ? "bg-muted/20 text-muted-foreground/40"
                      : heatHitRate(v);
                    return (
                      <td key={j} className={`px-2 py-1 text-right font-mono text-[11px] ${cls}`}>
                        {Number.isFinite(v) ? formatRate(v) : "n/a"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-muted-foreground">
                    {supportI[i] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const exportCoOccurrenceCsv = () => {
    const rows: unknown[][] = [];
    selectedPatterns.forEach((pi, i) => {
      selectedPatterns.forEach((pj, j) => {
        const v = coMatrix[i]?.[j];
        rows.push([
          pi.id, pi.shortLabel ?? pi.label, pj.id, pj.shortLabel ?? pj.label,
          Number.isFinite(v) ? v.toFixed(4) : "",
          supportI[i] ?? 0,
        ]);
      });
    });
    downloadCsv(
      "grammar-probe-cooccurrence.csv",
      toCsv(
        ["pattern_i_id", "pattern_i_label", "pattern_j_id", "pattern_j_label",
         "p_j_given_i", "support_i"],
        rows
      )
    );
  };

  // Panel 6: Phase E — small multiples + elasticity
  const elasticity = useMemo(() => {
    // For each pattern, rate(T=0) and mean rate(T>0). Positive elasticity
    // (rate at T=0 high, falls with T) = greedy construction. Negative
    // = sampler-driven. Near zero = temperature-invariant register signal.
    return selectedPatterns.map(p => {
      const curve = sweepTemps.map(t => {
        const c = sweepByPatternTemp.get(`${p.id}::${t}`) ?? emptyCell();
        return { t, rate: c.hitRate, runs: c.runs, hits: c.totalHits };
      });
      const t0 = curve.find(c => c.t === 0)?.rate ?? NaN;
      const warmRates = curve.filter(c => c.t > 0 && c.runs > 0).map(c => c.rate);
      const meanWarm = warmRates.length > 0
        ? warmRates.reduce((s, v) => s + v, 0) / warmRates.length
        : NaN;
      const elasticity = Number.isFinite(t0) && Number.isFinite(meanWarm) ? t0 - meanWarm : NaN;
      return { pattern: p, curve, t0, meanWarm, elasticity };
    });
  }, [selectedPatterns, sweepByPatternTemp, sweepTemps]);

  const hasSweep = sweepRuns.length > 0;

  const renderPhaseE = () => {
    if (!hasSweep) {
      return <div className="text-caption text-muted-foreground italic">Run Phase E (temperature sweep) first to populate this view.</div>;
    }
    const maxRate = Math.max(
      0.0001,
      ...elasticity.flatMap(e => e.curve.map(c => c.rate))
    );
    return (
      <div className="space-y-2">
        <div className="text-caption text-muted-foreground">
          Small multiples: hit rate vs temperature, one panel per construction. <span className="font-mono">elasticity = rate(T=0) − mean rate(T&gt;0)</span>. Positive = greedy-centre construction; near zero = register-driven; negative = sampler-emergent.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {elasticity.map(({ pattern: p, curve, elasticity: el }) => (
            <div key={p.id} className="border border-parchment/50 rounded-sm p-2">
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-[11px] font-semibold text-foreground">{p.shortLabel ?? p.label}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  elasticity: <span className={Number.isFinite(el)
                    ? el > 0.15 ? "text-burgundy font-semibold"
                    : el < -0.15 ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                    : "text-foreground"
                    : "text-muted-foreground/50"}>
                    {Number.isFinite(el) ? (el >= 0 ? "+" : "") + (el * 100).toFixed(1) + " pp" : "n/a"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-[32px_1fr_60px] gap-1 items-center">
                {curve.map(c => (
                  <Fragment key={c.t}>
                    <div className="text-[10px] font-mono text-muted-foreground">T{c.t.toFixed(1)}</div>
                    <Bar value={c.rate} max={maxRate} />
                    <div className="text-[10px] font-mono text-foreground text-right">
                      {c.runs > 0 ? formatRate(c.rate) : "—"}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const exportPhaseECsv = () => {
    const rows: unknown[][] = [];
    for (const { pattern: p, curve, t0, meanWarm, elasticity: el } of elasticity) {
      for (const c of curve) {
        rows.push([
          p.id, p.shortLabel ?? p.label, c.t,
          c.runs, c.hits,
          c.runs > 0 ? c.rate.toFixed(4) : "",
          Number.isFinite(t0) ? t0.toFixed(4) : "",
          Number.isFinite(meanWarm) ? meanWarm.toFixed(4) : "",
          Number.isFinite(el) ? el.toFixed(4) : "",
        ]);
      }
    }
    downloadCsv(
      "grammar-probe-temperature-sweep.csv",
      toCsv(
        ["pattern_id", "pattern_label", "temperature",
         "runs", "total_hits", "hit_rate",
         "rate_t0", "mean_rate_warm", "elasticity"],
        rows
      )
    );
  };

  // ----------------------------- layout ------------------------------------

  if (selectedPatterns.length === 0) {
    return <div className="text-caption text-muted-foreground italic">No constructions selected.</div>;
  }
  if (runs.filter(r => r.text).length === 0) {
    return <div className="text-caption text-muted-foreground italic">Run Phase A to populate the Deep Dive.</div>;
  }

  return (
    <div className="space-y-2">
      <Section title="Hit rate by model × temperature" defaultOpen
        actions={<CsvButton onClick={exportBarChartCsv} />}>
        {renderBarChart()}
      </Section>
      <Section title="Hits-per-run histogram"
        actions={<CsvButton onClick={exportHistogramCsv} />}>
        {renderHistogram()}
      </Section>
      <Section title="Register × construction heatmap"
        actions={<CsvButton onClick={exportRegisterCsv} />}>
        {renderRegisterHeatmap()}
      </Section>
      <Section title="Suite × construction stratification"
        actions={<CsvButton onClick={exportSuiteCsv} />}>
        {renderSuiteStrat()}
      </Section>
      <Section title="Co-occurrence matrix"
        actions={selectedPatterns.length >= 2 ? <CsvButton onClick={exportCoOccurrenceCsv} /> : null}>
        {renderCoOccurrence()}
      </Section>
      <Section title="Phase E — temperature small multiples + elasticity"
        actions={hasSweep ? <CsvButton onClick={exportPhaseECsv} /> : null}>
        {renderPhaseE()}
      </Section>
    </div>
  );
}
