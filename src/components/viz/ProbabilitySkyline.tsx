"use client";

import { useMemo, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

// ---------- Config ----------

// Net geometry is a grid of cols × rows cells laid flat on the XZ plane.
// Each vertex corresponds to one token position. Its Y height is driven by
// the entropy of that token, so peaks = uncertain tokens, valleys = committed.
const CELL_SIZE = 0.5; // world units between grid vertices
const HEIGHT_SCALE = 2.6; // max entropy maps to this world height
const TARGET_ASPECT = 1.6; // width / depth ratio for the grid
const WIREFRAME_OFFSET = 0.015;
const PEAK_COUNT = 5; // how many peak labels to render

function chooseCols(n: number): number {
  if (n <= 4) return Math.max(1, n);
  return Math.max(2, Math.ceil(Math.sqrt(n * TARGET_ASPECT)));
}

// ---------- Data ----------

interface NetData {
  cols: number;
  rows: number;
  entropies: number[];
  maxEntropy: number;
  meanEntropy: number;
  peaks: { index: number; entropy: number; token: string }[];
}

function buildNetData(tokens: TokenLogprob[]): NetData {
  const entropies = tokens.map(computeTokenEntropy);
  const n = entropies.length;
  const cols = chooseCols(n);
  const rows = Math.max(1, Math.ceil(n / cols));
  const maxEntropy = entropies.reduce((a, b) => Math.max(a, b), 1e-6);
  const meanEntropy = n > 0 ? entropies.reduce((a, b) => a + b, 0) / n : 0;

  // Top-N peaks by entropy — these are the most uncertain positions
  const peaks = entropies
    .map((e, i) => ({ index: i, entropy: e, token: tokens[i].token }))
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, PEAK_COUNT);

  return { cols, rows, entropies, maxEntropy, meanEntropy, peaks };
}

// Convert an entropy value to a colour on a continuous yellow → red scale.
// Confident (low entropy) = pale yellow, uncertain (high entropy) = deep red.
function entropyColor(entropy: number, maxEntropy: number): THREE.Color {
  const t = Math.min(1, Math.max(0, entropy / maxEntropy));
  const hue = (52 - 52 * t) / 360;
  const sat = 0.85 + 0.1 * t;
  const light = 0.66 - 0.26 * t;
  return new THREE.Color().setHSL(hue, sat, light);
}

// ---------- Net surface ----------

interface NetSurfaceProps {
  data: NetData;
  tokens: TokenLogprob[];
  cursorIndex: number;
  onCursorChange: (i: number) => void;
  onHover: (
    info: { index: number; token: string; entropy: number; prob: number } | null
  ) => void;
  isDark: boolean;
}

function NetSurface({
  data,
  tokens,
  cursorIndex,
  onCursorChange,
  onHover,
  isDark,
}: NetSurfaceProps) {
  const { cols, rows, entropies, maxEntropy, peaks } = data;

  const {
    geometry,
    gridWidth,
    gridDepth,
    cursorMarker,
    peakMarkers,
    entScale,
  } = useMemo(() => {
    const gridWidth = Math.max(CELL_SIZE, (cols - 1) * CELL_SIZE);
    const gridDepth = Math.max(CELL_SIZE, (rows - 1) * CELL_SIZE);
    const entScale = HEIGHT_SCALE / maxEntropy;

    const widthSegs = Math.max(1, cols - 1);
    const depthSegs = Math.max(1, rows - 1);

    // PlaneGeometry vertices are ordered row-by-row on the XY plane. After
    // rotating around X, the original Y axis becomes -Z, so "row 0" on the
    // plane ends up at negative Z in world space — which lines up with our
    // sequential token layout if we flip the row index.
    const geom = new THREE.PlaneGeometry(
      gridWidth,
      gridDepth,
      widthSegs,
      depthSegs
    );
    geom.rotateX(-Math.PI / 2);

    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const vIdx = row * cols + col;
        const tokIdx = row * cols + col;
        const entropy = tokIdx < entropies.length ? entropies[tokIdx] : 0;
        const y = entropy * entScale;
        posAttr.setY(vIdx, y);

        const c = entropyColor(entropy, maxEntropy);
        colors[vIdx * 3] = c.r;
        colors[vIdx * 3 + 1] = c.g;
        colors[vIdx * 3 + 2] = c.b;
      }
    }

    posAttr.needsUpdate = true;
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    // World position of a given token index on the flattened grid
    const posOf = (tokIdx: number): [number, number, number] => {
      const col = tokIdx % cols;
      const row = Math.floor(tokIdx / cols);
      const x = col * CELL_SIZE - gridWidth / 2;
      const z = row * CELL_SIZE - gridDepth / 2;
      const y = (entropies[tokIdx] ?? 0) * entScale;
      return [x, y, z];
    };

    const cursorMarker =
      cursorIndex >= 0 && cursorIndex < entropies.length
        ? posOf(cursorIndex)
        : null;

    const peakMarkers = peaks.map((p) => ({
      pos: posOf(p.index),
      index: p.index,
      token: p.token,
      entropy: p.entropy,
    }));

    return {
      geometry: geom,
      gridWidth,
      gridDepth,
      cursorMarker,
      peakMarkers,
      entScale,
    };
  }, [cols, rows, entropies, maxEntropy, peaks, cursorIndex]);

  // Convert a world-space point (from a ray hit) back to a token index
  const pointToTokenIndex = (point: THREE.Vector3): number | null => {
    const localX = point.x + gridWidth / 2;
    const localZ = point.z + gridDepth / 2;
    const col = Math.round(localX / CELL_SIZE);
    const row = Math.round(localZ / CELL_SIZE);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    const idx = row * cols + col;
    if (idx < 0 || idx >= tokens.length) return null;
    return idx;
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = pointToTokenIndex(e.point);
    if (idx !== null) onCursorChange(idx);
  };

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const idx = pointToTokenIndex(e.point);
    if (idx !== null) {
      onHover({
        index: idx,
        token: tokens[idx].token,
        entropy: entropies[idx],
        prob: Math.exp(tokens[idx].logprob),
      });
      document.body.style.cursor = "pointer";
    } else {
      onHover(null);
      document.body.style.cursor = "default";
    }
  };

  const handleOut = () => {
    onHover(null);
    document.body.style.cursor = "default";
  };

  return (
    <group>
      {/* Solid shaded surface — translucent so the wireframe reads through */}
      <mesh
        geometry={geometry}
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
      >
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          metalness={0.15}
          roughness={0.55}
          transparent
          opacity={0.82}
          flatShading={false}
        />
      </mesh>

      {/* Wireframe overlay — the "net" */}
      <mesh
        geometry={geometry}
        position={[0, WIREFRAME_OFFSET, 0]}
        raycast={() => null}
      >
        <meshBasicMaterial
          color={isDark ? "#e2e8f0" : "#1e293b"}
          wireframe
          transparent
          opacity={isDark ? 0.35 : 0.28}
        />
      </mesh>

      {/* Peak markers for the most uncertain positions */}
      {peakMarkers.map((peak, i) => (
        <group key={`peak-${peak.index}-${i}`} position={peak.pos}>
          <mesh position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial
              color="#fca5a5"
              emissive="#dc2626"
              emissiveIntensity={0.4}
            />
          </mesh>
          <Text
            position={[0, 0.42, 0]}
            fontSize={0.18}
            color={isDark ? "#fecaca" : "#7f1d1d"}
            anchorX="center"
            anchorY="bottom"
            maxWidth={2}
            outlineWidth={0.008}
            outlineColor={isDark ? "#0f172a" : "#ffffff"}
          >
            {peak.token.replace(/\n/g, "↵").trim() || "↵"}
          </Text>
        </group>
      ))}

      {/* Cursor marker — bright purple sphere at the current token */}
      {cursorMarker && (
        <group position={cursorMarker}>
          <mesh position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial
              color="#c4b5fd"
              emissive="#7c3aed"
              emissiveIntensity={0.7}
            />
          </mesh>
          {/* Vertical guide line from surface up */}
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1.0, 8]} />
            <meshBasicMaterial color="#a78bfa" transparent opacity={0.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ---------- Per-panel canvas ----------

interface NetCanvasProps {
  tokens: TokenLogprob[];
  cursorIndex: number;
  onCursorChange: (i: number) => void;
  label: "A" | "B";
  isDark: boolean;
}

function NetCanvas({
  tokens,
  cursorIndex,
  onCursorChange,
  label,
  isDark,
}: NetCanvasProps) {
  const [hovered, setHovered] = useState<{
    index: number;
    token: string;
    entropy: number;
    prob: number;
  } | null>(null);

  const data = useMemo(() => buildNetData(tokens), [tokens]);

  const gridColor1 = isDark ? "#1e293b" : "#e2e8f0";
  const gridColor2 = isDark ? "#0f172a" : "#f1f5f9";

  return (
    <div className="relative flex-1 min-w-0 h-full rounded-sm border border-parchment/40 bg-card/40 overflow-hidden">
      {/* Panel label */}
      <div className="absolute top-1 left-2 z-10 text-[10px] font-medium text-muted-foreground pointer-events-none">
        Panel {label}{" "}
        <span className="font-normal opacity-70">
          · {tokens.length} tokens · μ {data.meanEntropy.toFixed(2)}b · max{" "}
          {data.maxEntropy.toFixed(2)}b
        </span>
      </div>

      {/* Hover readout */}
      <div className="absolute bottom-1 left-2 right-2 z-10 text-[10px] font-mono text-muted-foreground truncate pointer-events-none">
        {hovered ? (
          <>
            pos {hovered.index} ·{" "}
            <span className="text-foreground">
              &ldquo;{hovered.token.replace(/\n/g, "↵") || "↵"}&rdquo;
            </span>{" "}
            · H {hovered.entropy.toFixed(2)}b · p{" "}
            {(hovered.prob * 100).toFixed(1)}%
          </>
        ) : (
          <span className="opacity-60 italic">
            drag to rotate · scroll to zoom · click a cell to jump cursor · peaks = uncertain words
          </span>
        )}
      </div>

      <Canvas
        camera={{ position: [6, 6, 10], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={[isDark ? "#0f172a" : "#f8fafc"]} />
        <fog attach="fog" args={[isDark ? "#0f172a" : "#f8fafc", 14, 36]} />

        {/* Lighting — soft key + fill + rim to shade the net contours */}
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} />
        <directionalLight position={[-6, 4, -8]} intensity={0.35} />
        <pointLight position={[0, 6, 0]} intensity={0.4} color="#fbbf24" />

        {/* Ground grid for spatial reference */}
        <gridHelper
          args={[24, 24, gridColor1, gridColor2]}
          position={[0, -0.01, 0]}
        />

        <NetSurface
          data={data}
          tokens={tokens}
          cursorIndex={cursorIndex}
          onCursorChange={onCursorChange}
          onHover={setHovered}
          isDark={isDark}
        />

        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={4}
          maxDistance={26}
          target={[0, 0.6, 0]}
          maxPolarAngle={Math.PI / 2 - 0.05}
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
            Uncertainty net
          </span>
          <span className="text-[10px] text-muted-foreground/70 italic">
            each vertex = one token · height = entropy · peaks = uncertain words
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
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[#fca5a5] border border-[#dc2626]" />
            top-{PEAK_COUNT} peaks
          </span>
        </div>
      </div>

      {/* Canvases */}
      <div
        className={`flex gap-3 ${both ? "flex-col md:flex-row" : ""}`}
        style={{ height: 360 }}
      >
        {hasA && (
          <NetCanvas
            tokens={tokensA!}
            cursorIndex={effectiveCursor}
            onCursorChange={handleChange}
            label="A"
            isDark={isDark}
          />
        )}
        {hasB && (
          <NetCanvas
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
