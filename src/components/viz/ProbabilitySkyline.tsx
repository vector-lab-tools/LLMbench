"use client";

import { useMemo, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TokenLogprob } from "@/types/analysis";

// ---------- Config ----------

const WINDOW_HALF = 15; // tokens each side of cursor
const TOP_K = 5; // alternatives to render per position

// Spacing in world units
const X_SPACING = 0.55; // along position axis
const Z_SPACING = 0.6; // along rank axis
const HEIGHT_SCALE = 3.0; // probability (0..1) × this = world height
const BAR_WIDTH = 0.36; // x dimension of each bar
const BAR_DEPTH = 0.42; // z dimension of each bar

// ---------- Data ----------

interface Bar {
  tokenIndex: number; // original index in full sequence
  position: number; // x offset relative to cursor
  rank: number; // 0..TOP_K-1
  prob: number;
  token: string;
  isChosen: boolean;
  color: THREE.Color;
}

function probToColor(prob: number): THREE.Color {
  // t = 0 confident, t = 1 uncertain
  const t = Math.pow(1 - Math.max(0, Math.min(1, prob)), 0.75);
  // Hue: yellow (52°) → red (0°)
  const hue = (52 - 52 * t) / 360;
  const sat = 0.88 + 0.07 * t;
  const light = 0.62 - 0.22 * t;
  const c = new THREE.Color();
  c.setHSL(hue, sat, light);
  return c;
}

function buildBars(
  tokens: TokenLogprob[],
  cursorIndex: number
): { bars: Bar[]; windowStart: number; windowEnd: number } {
  if (tokens.length === 0)
    return { bars: [], windowStart: 0, windowEnd: 0 };

  const clampedCursor = Math.max(0, Math.min(tokens.length - 1, cursorIndex));
  const windowStart = Math.max(0, clampedCursor - WINDOW_HALF);
  const windowEnd = Math.min(tokens.length - 1, clampedCursor + WINDOW_HALF);

  const bars: Bar[] = [];

  for (let i = windowStart; i <= windowEnd; i++) {
    const tok = tokens[i];
    const chosenProb = Math.exp(tok.logprob);

    // Combine chosen + alternatives, sort by probability descending
    const all = [
      { token: tok.token, prob: chosenProb, isChosen: true },
      ...tok.topAlternatives.map((a) => ({
        token: a.token,
        prob: Math.exp(a.logprob),
        isChosen: false,
      })),
    ]
      .sort((a, b) => b.prob - a.prob)
      .slice(0, TOP_K);

    all.forEach((alt, rank) => {
      bars.push({
        tokenIndex: i,
        position: i - clampedCursor,
        rank,
        prob: alt.prob,
        token: alt.token,
        isChosen: alt.isChosen,
        color: probToColor(alt.prob),
      });
    });
  }

  return { bars, windowStart, windowEnd };
}

// ---------- 3D field ----------

interface BarFieldProps {
  bars: Bar[];
  cursorTokenIndex: number;
  onBarClick: (tokenIndex: number) => void;
  onBarHover: (bar: Bar | null) => void;
}

function BarField({
  bars,
  cursorTokenIndex,
  onBarClick,
  onBarHover,
}: BarFieldProps) {
  return (
    <group>
      {bars.map((bar, idx) => {
        const x = bar.position * X_SPACING;
        const h = Math.max(0.02, bar.prob * HEIGHT_SCALE);
        const z = (bar.rank - (TOP_K - 1) / 2) * Z_SPACING;
        const isCursorToken = bar.tokenIndex === cursorTokenIndex;

        return (
          <mesh
            key={`${bar.tokenIndex}-${bar.rank}-${idx}`}
            position={[x, h / 2, z]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onBarClick(bar.tokenIndex);
            }}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onBarHover(bar);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              onBarHover(null);
              document.body.style.cursor = "default";
            }}
          >
            <boxGeometry args={[BAR_WIDTH, h, BAR_DEPTH]} />
            <meshStandardMaterial
              color={bar.color}
              emissive={
                isCursorToken
                  ? new THREE.Color("#7c3aed")
                  : bar.isChosen
                  ? bar.color
                  : new THREE.Color("#000000")
              }
              emissiveIntensity={isCursorToken ? 0.5 : bar.isChosen ? 0.15 : 0}
              metalness={0.1}
              roughness={0.55}
            />
          </mesh>
        );
      })}

      {/* Cursor position marker: a translucent vertical column at x=0 */}
      <mesh position={[0, HEIGHT_SCALE / 2 + 0.3, 0]}>
        <boxGeometry
          args={[BAR_WIDTH * 1.4, HEIGHT_SCALE + 0.6, TOP_K * Z_SPACING + 0.3]}
        />
        <meshBasicMaterial
          color="#a78bfa"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ---------- Per-panel canvas ----------

interface SkylineCanvasProps {
  tokens: TokenLogprob[];
  cursorIndex: number;
  onCursorChange: (i: number) => void;
  label: "A" | "B";
  isDark: boolean;
}

function SkylineCanvas({
  tokens,
  cursorIndex,
  onCursorChange,
  label,
  isDark,
}: SkylineCanvasProps) {
  const [hovered, setHovered] = useState<Bar | null>(null);

  const { bars, windowStart, windowEnd } = useMemo(
    () => buildBars(tokens, cursorIndex),
    [tokens, cursorIndex]
  );

  const gridColor1 = isDark ? "#475569" : "#cbd5e1";
  const gridColor2 = isDark ? "#334155" : "#e2e8f0";

  return (
    <div className="relative flex-1 min-w-0 h-full rounded-sm border border-parchment/40 bg-card/40 overflow-hidden">
      {/* Panel label */}
      <div className="absolute top-1 left-2 z-10 text-[10px] font-medium text-muted-foreground pointer-events-none">
        Panel {label}{" "}
        <span className="font-normal opacity-70">
          · window {windowStart}–{windowEnd} of {tokens.length}
        </span>
      </div>

      {/* Hover readout */}
      <div className="absolute bottom-1 left-2 right-2 z-10 text-[10px] font-mono text-muted-foreground truncate pointer-events-none">
        {hovered ? (
          <>
            pos {hovered.tokenIndex} · rank {hovered.rank + 1} ·{" "}
            <span className="text-foreground">
              &ldquo;{hovered.token.replace(/\n/g, "↵") || "↵"}&rdquo;
            </span>{" "}
            · {(hovered.prob * 100).toFixed(1)}%
            {hovered.isChosen && <span className="text-burgundy"> · chosen</span>}
          </>
        ) : (
          <span className="opacity-60 italic">
            drag to rotate · scroll to zoom · click a bar to jump cursor
          </span>
        )}
      </div>

      <Canvas
        camera={{ position: [8, 7, 14], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={[isDark ? "#0f172a" : "#f8fafc"]} />
        <fog attach="fog" args={[isDark ? "#0f172a" : "#f8fafc", 18, 40]} />

        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[10, 14, 8]}
          intensity={1.1}
          castShadow={false}
        />
        <directionalLight position={[-8, 6, -6]} intensity={0.3} />

        {/* Ground grid */}
        <gridHelper
          args={[30, 30, gridColor1, gridColor2]}
          position={[0, 0, 0]}
        />

        {/* Axes helper: tiny coloured arrows at origin for orientation */}
        <axesHelper args={[1.2]} />

        <BarField
          bars={bars}
          cursorTokenIndex={cursorIndex}
          onBarClick={onCursorChange}
          onBarHover={setHovered}
        />

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={6}
          maxDistance={30}
          target={[0, 1.2, 0]}
        />
      </Canvas>
    </div>
  );
}

// ---------- Main component ----------

interface ProbabilitySkylineProps {
  tokensA: TokenLogprob[] | null;
  tokensB: TokenLogprob[] | null;
  cursorIndex?: number | null;
  onCursorChange?: (i: number) => void;
  isDark: boolean;
}

export function ProbabilitySkyline({
  tokensA,
  tokensB,
  cursorIndex,
  onCursorChange,
  isDark,
}: ProbabilitySkylineProps) {
  const effectiveCursor = cursorIndex ?? 0;
  const handleChange = (i: number) => onCursorChange?.(i);

  const hasA = !!tokensA && tokensA.length > 0;
  const hasB = !!tokensB && tokensB.length > 0;
  const both = hasA && hasB;

  return (
    <div
      className={`w-full px-3 py-2 border-y border-parchment/40 ${
        isDark ? "bg-card/40" : "bg-card/60"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Probability skyline
          </span>
          <span className="text-[10px] text-muted-foreground/70 italic">
            top-{TOP_K} distribution · window ±{WINDOW_HALF} around cursor · X=position · Y=probability · Z=rank
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#fbbf24]" />
            confident
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#dc2626]" />
            uncertain
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#a78bfa]" />
            cursor
          </span>
        </div>
      </div>

      {/* Canvases */}
      <div
        className={`flex gap-3 ${both ? "flex-col md:flex-row" : ""}`}
        style={{ height: 340 }}
      >
        {hasA && (
          <SkylineCanvas
            tokens={tokensA!}
            cursorIndex={effectiveCursor}
            onCursorChange={handleChange}
            label="A"
            isDark={isDark}
          />
        )}
        {hasB && (
          <SkylineCanvas
            tokens={tokensB!}
            cursorIndex={effectiveCursor}
            onCursorChange={handleChange}
            label="B"
            isDark={isDark}
          />
        )}
        {!hasA && !hasB && (
          <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground italic border border-dashed border-parchment/50 rounded-sm">
            no logprob data available
          </div>
        )}
      </div>
    </div>
  );
}
