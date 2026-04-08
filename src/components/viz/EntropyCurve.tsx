"use client";

import { useMemo, useRef, useState } from "react";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface EntropyCurveProps {
  tokensA: TokenLogprob[] | null;
  tokensB: TokenLogprob[] | null;
  divergePositions?: number[];
  cursorIndex?: number | null;
  onCursorChange?: (i: number) => void;
  isDark: boolean;
}

// viewBox coordinate space — scales to container via preserveAspectRatio
const WIDTH = 800;
const HEIGHT = 140;
const PAD_L = 38;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 24;
const PLOT_W = WIDTH - PAD_L - PAD_R;
const PLOT_H = HEIGHT - PAD_T - PAD_B;

export function EntropyCurve({
  tokensA,
  tokensB,
  divergePositions = [],
  cursorIndex,
  onCursorChange,
  isDark,
}: EntropyCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { entropiesA, entropiesB, maxLen, maxEntropy, meanA, meanB } = useMemo(() => {
    const eA = (tokensA ?? []).map(computeTokenEntropy);
    const eB = (tokensB ?? []).map(computeTokenEntropy);
    const maxLen = Math.max(eA.length, eB.length, 1);
    const maxEntropy = Math.max(...eA, ...eB, 1);
    const mean = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    return {
      entropiesA: eA,
      entropiesB: eB,
      maxLen,
      maxEntropy,
      meanA: mean(eA),
      meanB: mean(eB),
    };
  }, [tokensA, tokensB]);

  const xFor = (i: number) =>
    PAD_L + (i / Math.max(1, maxLen - 1)) * PLOT_W;
  const yFor = (e: number) =>
    PAD_T + PLOT_H - (e / maxEntropy) * PLOT_H;
  const iFromX = (x: number) => {
    const frac = Math.max(0, Math.min(1, (x - PAD_L) / PLOT_W));
    return Math.round(frac * (maxLen - 1));
  };

  const buildPath = (es: number[]) => {
    if (es.length === 0) return "";
    return es
      .map(
        (e, i) =>
          `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(e).toFixed(1)}`
      )
      .join(" ");
  };

  const buildArea = (es: number[]) => {
    if (es.length === 0) return "";
    const top = es
      .map(
        (e, i) =>
          `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(e).toFixed(1)}`
      )
      .join(" ");
    const last = es.length - 1;
    return `${top} L${xFor(last).toFixed(1)},${yFor(0).toFixed(1)} L${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} Z`;
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    setHover(iFromX(local.x));
  };

  const handleClick = () => {
    if (hover !== null && onCursorChange) onCursorChange(hover);
  };

  // Colours tuned to match the panel tints (A=blue, B=amber) in both themes
  const colorA = isDark ? "#60a5fa" : "#2563eb";
  const colorB = isDark ? "#fbbf24" : "#d97706";
  const gridColor = isDark ? "#334155" : "#e2e8f0";
  const axisColor = isDark ? "#94a3b8" : "#64748b";
  const cursorColor = isDark ? "#c4b5fd" : "#7c3aed";

  const hoverEntA =
    hover !== null && entropiesA[hover] !== undefined ? entropiesA[hover] : null;
  const hoverEntB =
    hover !== null && entropiesB[hover] !== undefined ? entropiesB[hover] : null;
  const hoverTokA =
    hover !== null && tokensA?.[hover] ? tokensA[hover].token : null;
  const hoverTokB =
    hover !== null && tokensB?.[hover] ? tokensB[hover].token : null;

  // Y grid values — up to 4 bits, only those within range
  const yTicks = [0, 1, 2, 3, 4].filter((v) => v <= maxEntropy + 0.01);

  return (
    <div className="w-full px-3 py-2 bg-card/40 border-y border-parchment/40">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto select-none cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        role="img"
        aria-label="Entropy curve across token position"
      >
        {/* Y-axis grid + labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              y1={yFor(v)}
              x2={WIDTH - PAD_R}
              y2={yFor(v)}
              stroke={gridColor}
              strokeWidth="0.5"
            />
            <text
              x={PAD_L - 4}
              y={yFor(v) + 3}
              fontSize="9"
              fill={axisColor}
              textAnchor="end"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {v}
            </text>
          </g>
        ))}
        <text
          x={6}
          y={PAD_T + 8}
          fontSize="9"
          fill={axisColor}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          bits
        </text>

        {/* Divergence markers */}
        {divergePositions.map((p) => (
          <line
            key={`div-${p}`}
            x1={xFor(p)}
            y1={PAD_T}
            x2={xFor(p)}
            y2={HEIGHT - PAD_B}
            stroke="#dc2626"
            strokeWidth="0.5"
            strokeDasharray="2 2"
            opacity="0.35"
          />
        ))}

        {/* Panel A curve */}
        {entropiesA.length > 0 && (
          <>
            <path d={buildArea(entropiesA)} fill={colorA} opacity="0.1" />
            <path
              d={buildPath(entropiesA)}
              fill="none"
              stroke={colorA}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </>
        )}
        {/* Panel B curve */}
        {entropiesB.length > 0 && (
          <>
            <path d={buildArea(entropiesB)} fill={colorB} opacity="0.1" />
            <path
              d={buildPath(entropiesB)}
              fill="none"
              stroke={colorB}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </>
        )}

        {/* Cursor marker (pinned position) */}
        {cursorIndex !== null &&
          cursorIndex !== undefined &&
          cursorIndex >= 0 &&
          cursorIndex < maxLen && (
            <line
              x1={xFor(cursorIndex)}
              y1={PAD_T}
              x2={xFor(cursorIndex)}
              y2={HEIGHT - PAD_B}
              stroke={cursorColor}
              strokeWidth="1"
              opacity="0.75"
            />
          )}

        {/* Hover indicator */}
        {hover !== null && (
          <line
            x1={xFor(hover)}
            y1={PAD_T}
            x2={xFor(hover)}
            y2={HEIGHT - PAD_B}
            stroke={axisColor}
            strokeWidth="0.5"
            strokeDasharray="1 2"
          />
        )}

        {/* X-axis baseline */}
        <line
          x1={PAD_L}
          y1={HEIGHT - PAD_B}
          x2={WIDTH - PAD_R}
          y2={HEIGHT - PAD_B}
          stroke={axisColor}
          strokeWidth="0.5"
        />

        {/* X-axis labels */}
        <text
          x={PAD_L}
          y={HEIGHT - 8}
          fontSize="9"
          fill={axisColor}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          0
        </text>
        <text
          x={WIDTH - PAD_R}
          y={HEIGHT - 8}
          fontSize="9"
          fill={axisColor}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          textAnchor="end"
        >
          {maxLen - 1}
        </text>
        <text
          x={WIDTH / 2}
          y={HEIGHT - 8}
          fontSize="9"
          fill={axisColor}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          textAnchor="middle"
        >
          token position
        </text>
      </svg>

      {/* Legend + live readout row */}
      <div className="flex items-center justify-between gap-3 text-[10px] pt-1 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="font-medium text-muted-foreground uppercase tracking-wide">
            Uncertainty landscape
          </span>
          {entropiesA.length > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span
                className="inline-block w-3 h-0.5"
                style={{ background: colorA }}
              />
              A (μ {meanA.toFixed(2)}b)
            </span>
          )}
          {entropiesB.length > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span
                className="inline-block w-3 h-0.5"
                style={{ background: colorB }}
              />
              B (μ {meanB.toFixed(2)}b)
            </span>
          )}
          {divergePositions.length > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-3 border-t border-dashed border-red-500" />
              {divergePositions.length} diverge
            </span>
          )}
        </div>
        {hover !== null ? (
          <div className="font-mono text-muted-foreground truncate max-w-[60%]">
            pos {hover}
            {hoverTokA !== null && (
              <>
                {" · A "}
                <span className="text-foreground">
                  &ldquo;{hoverTokA.replace(/\n/g, "↵") || "↵"}&rdquo;
                </span>{" "}
                {hoverEntA !== null ? `${hoverEntA.toFixed(2)}b` : ""}
              </>
            )}
            {hoverTokB !== null && (
              <>
                {" · B "}
                <span className="text-foreground">
                  &ldquo;{hoverTokB.replace(/\n/g, "↵") || "↵"}&rdquo;
                </span>{" "}
                {hoverEntB !== null ? `${hoverEntB.toFixed(2)}b` : ""}
              </>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground italic">
            click to jump · peaks = forks
          </span>
        )}
      </div>
    </div>
  );
}
