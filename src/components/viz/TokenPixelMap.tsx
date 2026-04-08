"use client";

import { useMemo, useState } from "react";
import type { TokenLogprob } from "@/types/analysis";

interface TokenPixelMapProps {
  tokensA: TokenLogprob[] | null;
  tokensB: TokenLogprob[] | null;
  cursorIndex?: number | null;
  onCursorChange?: (i: number) => void;
  isDark: boolean;
}

// ------ Palettes ------
// Each palette is a function (t in [0,1]) => css colour string.
// t = 0 means "very confident" (high probability), t = 1 means "very uncertain".

type PaletteId = "heat" | "viridis" | "magma" | "ice" | "mono";

interface PaletteDef {
  id: PaletteId;
  label: string;
  fn: (t: number) => string;
  // preview gradient CSS for the picker swatch
  preview: string;
}

function interpStops(t: number, stops: [number, number, number][]): string {
  // Interpolate a list of RGB stops evenly spaced across [0,1]
  if (stops.length === 0) return "rgb(0,0,0)";
  if (stops.length === 1) {
    const [r, g, b] = stops[0];
    return `rgb(${r},${g},${b})`;
  }
  const clamped = Math.max(0, Math.min(1, t));
  const pos = clamped * (stops.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const frac = pos - i0;
  const a = stops[i0];
  const b = stops[i1];
  const r = Math.round(a[0] + (b[0] - a[0]) * frac);
  const g = Math.round(a[1] + (b[1] - a[1]) * frac);
  const bl = Math.round(a[2] + (b[2] - a[2]) * frac);
  return `rgb(${r},${g},${bl})`;
}

const PALETTES: PaletteDef[] = [
  {
    id: "heat",
    label: "Heat",
    fn: (t) =>
      interpStops(t, [
        [254, 252, 232], // pale yellow (confident)
        [253, 224, 71], // yellow
        [251, 146, 60], // orange
        [239, 68, 68], // red
        [127, 29, 29], // deep red (uncertain)
      ]),
    preview:
      "linear-gradient(to right, rgb(254,252,232), rgb(253,224,71), rgb(251,146,60), rgb(239,68,68), rgb(127,29,29))",
  },
  {
    id: "viridis",
    label: "Viridis",
    fn: (t) =>
      interpStops(t, [
        [253, 231, 37], // yellow (confident)
        [94, 201, 98],
        [33, 145, 140],
        [59, 82, 139],
        [68, 1, 84], // deep purple (uncertain)
      ]),
    preview:
      "linear-gradient(to right, rgb(253,231,37), rgb(94,201,98), rgb(33,145,140), rgb(59,82,139), rgb(68,1,84))",
  },
  {
    id: "magma",
    label: "Magma",
    fn: (t) =>
      interpStops(t, [
        [252, 253, 191], // cream
        [254, 176, 120],
        [241, 96, 93],
        [140, 41, 129],
        [0, 0, 4], // near black
      ]),
    preview:
      "linear-gradient(to right, rgb(252,253,191), rgb(254,176,120), rgb(241,96,93), rgb(140,41,129), rgb(0,0,4))",
  },
  {
    id: "ice",
    label: "Ice",
    fn: (t) =>
      interpStops(t, [
        [240, 249, 255], // pale ice
        [186, 230, 253],
        [56, 189, 248],
        [29, 78, 216],
        [30, 27, 75], // deep navy
      ]),
    preview:
      "linear-gradient(to right, rgb(240,249,255), rgb(186,230,253), rgb(56,189,248), rgb(29,78,216), rgb(30,27,75))",
  },
  {
    id: "mono",
    label: "Mono",
    fn: (t) =>
      interpStops(t, [
        [245, 245, 245],
        [200, 200, 200],
        [130, 130, 130],
        [70, 70, 70],
        [20, 20, 20],
      ]),
    preview:
      "linear-gradient(to right, rgb(245,245,245), rgb(130,130,130), rgb(20,20,20))",
  },
];

// ------ Component ------

// Approximate number of columns per panel grid. The SVG scales fluidly,
// but we aim for a roughly square-ish aspect so shape is readable.
function chooseCols(n: number): number {
  if (n <= 64) return 16;
  if (n <= 144) return 24;
  if (n <= 256) return 32;
  if (n <= 400) return 40;
  return Math.ceil(Math.sqrt(n * 1.6));
}

interface PanelGridProps {
  label: "A" | "B";
  tokens: TokenLogprob[] | null;
  palette: PaletteDef;
  cursorIndex?: number | null;
  onCursorChange?: (i: number) => void;
}

function PanelGrid({
  label,
  tokens,
  palette,
  cursorIndex,
  onCursorChange,
}: PanelGridProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = tokens?.length ?? 0;
  const cols = chooseCols(Math.max(n, 1));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cell = 14; // px in viewBox coords
  const gap = 1.5;
  const gridW = cols * (cell + gap) - gap;
  const gridH = rows * (cell + gap) - gap;

  const hoverTok = hover !== null && tokens?.[hover] ? tokens[hover] : null;
  const hoverProb =
    hoverTok !== null ? Math.exp(hoverTok.logprob) : null;

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 px-0.5">
        Panel {label}{" "}
        <span className="font-normal opacity-70">({n} tokens)</span>
      </div>
      {n === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground italic border border-dashed border-parchment/50 rounded-sm py-8">
          no logprob data
        </div>
      ) : (
        <svg
          viewBox={`-1 -1 ${gridW + 2} ${gridH + 2}`}
          className="w-full h-auto"
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Panel ${label} token probability map`}
        >
          {tokens!.map((tok, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * (cell + gap);
            const y = row * (cell + gap);
            const prob = Math.exp(tok.logprob);
            // Map prob -> t in [0,1]: 1.0 = confident (t=0), 0.0 = uncertain (t=1).
            // Use non-linear curve so mid-probabilities get more colour variation.
            const t = Math.pow(1 - Math.max(0, Math.min(1, prob)), 0.8);
            const fill = palette.fn(t);
            const isHover = hover === i;
            const isCursor = cursorIndex === i;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx="1"
                ry="1"
                fill={fill}
                stroke={
                  isCursor
                    ? "#7c3aed"
                    : isHover
                    ? "#111827"
                    : "rgba(0,0,0,0.08)"
                }
                strokeWidth={isCursor ? 1.5 : isHover ? 1 : 0.3}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onClick={() => onCursorChange?.(i)}
              >
                <title>
                  pos {i} · &ldquo;{tok.token.replace(/\n/g, "↵")}&rdquo; ·{" "}
                  {(prob * 100).toFixed(1)}%
                </title>
              </rect>
            );
          })}
        </svg>
      )}
      {/* Hover readout */}
      <div className="h-4 mt-1 text-[10px] font-mono text-muted-foreground truncate px-0.5">
        {hoverTok ? (
          <>
            pos {hover} · &ldquo;
            <span className="text-foreground">
              {hoverTok.token.replace(/\n/g, "↵") || "↵"}
            </span>
            &rdquo; · {((hoverProb ?? 0) * 100).toFixed(1)}%
          </>
        ) : (
          <span className="opacity-60 italic">hover to inspect · click to jump</span>
        )}
      </div>
    </div>
  );
}

export function TokenPixelMap({
  tokensA,
  tokensB,
  cursorIndex,
  onCursorChange,
  isDark,
}: TokenPixelMapProps) {
  const [paletteId, setPaletteId] = useState<PaletteId>("heat");
  const palette = useMemo(
    () => PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0],
    [paletteId]
  );

  return (
    <div
      className={`w-full px-3 py-2 border-y border-parchment/40 ${
        isDark ? "bg-card/40" : "bg-card/60"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Bird&rsquo;s-eye probability map
          </span>
          <span className="text-[10px] text-muted-foreground/70 italic">
            each cell = one token, coloured by chosen probability
          </span>
        </div>

        {/* Palette picker */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">Palette:</span>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPaletteId(p.id)}
              title={p.label}
              className={`group flex flex-col items-center ${
                paletteId === p.id ? "" : "opacity-60 hover:opacity-100"
              }`}
            >
              <span
                className={`block w-10 h-3 rounded-sm border ${
                  paletteId === p.id
                    ? "border-burgundy ring-1 ring-burgundy/40"
                    : "border-parchment/60"
                }`}
                style={{ background: p.preview }}
              />
              <span className="text-[9px] text-muted-foreground leading-tight mt-0.5">
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Side-by-side grids */}
      <div className="flex gap-4">
        <PanelGrid
          label="A"
          tokens={tokensA}
          palette={palette}
          cursorIndex={cursorIndex}
          onCursorChange={onCursorChange}
        />
        <PanelGrid
          label="B"
          tokens={tokensB}
          palette={palette}
          cursorIndex={cursorIndex}
          onCursorChange={onCursorChange}
        />
      </div>

      {/* Scale bar */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        <span>high confidence</span>
        <div
          className="flex-1 h-2 rounded-sm border border-parchment/40"
          style={{ background: palette.preview }}
        />
        <span>low confidence</span>
      </div>
    </div>
  );
}
