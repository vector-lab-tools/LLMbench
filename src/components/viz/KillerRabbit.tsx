"use client";

import { useState, useEffect, useCallback } from "react";

interface KillerRabbitProps {
  onDismiss: () => void;
}

function randPos() {
  const margin = 80;
  return {
    x: margin + Math.random() * (window.innerWidth - margin * 2),
    y: margin + Math.random() * (window.innerHeight - margin * 2),
  };
}

function randDelay() {
  return 900 + Math.random() * 900; // 0.9–1.8s
}

export function KillerRabbit({ onDismiss }: KillerRabbitProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dead, setDead] = useState(false);
  const [fading, setFading] = useState(false);

  // Set initial position client-side (avoids SSR)
  useEffect(() => {
    setPos(randPos());
  }, []);

  // Move at random intervals while alive
  useEffect(() => {
    if (dead || !pos) return;
    let cancelled = false;
    const schedule = () => {
      const t = setTimeout(() => {
        if (!cancelled) {
          setPos(randPos());
          schedule();
        }
      }, randDelay());
      return t;
    };
    const t = schedule();
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dead, pos === null]);

  const handleClick = useCallback(() => {
    if (dead) return;
    setDead(true);
    setTimeout(() => setFading(true), 1400);
    setTimeout(onDismiss, 1900);
  }, [dead, onDismiss]);

  if (!pos) return null;

  return (
    <div
      onClick={handleClick}
      title={dead ? undefined : "The Rabbit of Caerbannog! Click to slay it!"}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        cursor: dead ? "default" : "crosshair",
        userSelect: "none",
        transition: dead
          ? `opacity 0.5s ease ${fading ? "0s" : "1s"}`
          : "left 0.55s cubic-bezier(0.4,0,0.2,1), top 0.55s cubic-bezier(0.4,0,0.2,1)",
        opacity: fading ? 0 : 1,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {/* Rabbit emoji — desaturated to match Monty Python palette */}
        <span
          style={{
            fontSize: "2.8rem",
            display: "block",
            filter: dead
              ? "grayscale(100%) brightness(0.4)"
              : "grayscale(40%) sepia(20%) brightness(0.85)",
            transition: "filter 0.3s",
          }}
        >
          {dead ? "☠️" : "🐇"}
        </span>

        {dead ? (
          <span style={{
            fontSize: "10px",
            fontFamily: "Georgia, serif",
            color: "#6b1010",
            whiteSpace: "nowrap",
            textShadow: "0 1px 0 #00000040",
          }}>
            &ldquo;That&rsquo;s no ordinary rabbit!&rdquo;
          </span>
        ) : (
          <span style={{
            fontSize: "8px",
            fontFamily: "monospace",
            color: "#7a6a58",
            whiteSpace: "nowrap",
          }}>
            Rabbit of Caerbannog
          </span>
        )}
      </div>
    </div>
  );
}

/** Triggers when the prompt contains the word "rabbit" */
export function isKillerRabbitPrompt(prompt: string): boolean {
  return /\brabbit\b/i.test(prompt.trim());
}
