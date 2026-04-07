"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

export function KillerRabbit({ onDismiss }: KillerRabbitProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dead, setDead] = useState(false);
  const [fading, setFading] = useState(false);
  const deadRef = useRef(false);

  // Set initial position and start moving on mount
  useEffect(() => {
    setPos(randPos());
    const id = setInterval(() => {
      if (!deadRef.current) setPos(randPos());
    }, 1300);
    return () => clearInterval(id);
  }, []);

  const handleClick = useCallback(() => {
    if (deadRef.current) return;
    deadRef.current = true;
    setDead(true);
    setTimeout(() => setFading(true), 1400);
    setTimeout(onDismiss, 1900);
  }, [onDismiss]);

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
        opacity: fading ? 0 : 1,
        transform: "translate(-50%, -50%)",
        transition: dead
          ? "opacity 0.5s ease"
          : "left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{
          fontSize: "2.8rem",
          display: "block",
          filter: dead
            ? "grayscale(100%) brightness(0.4)"
            : "grayscale(40%) sepia(20%) brightness(0.85)",
          transition: "filter 0.3s",
        }}>
          {dead ? "☠️" : "🐇"}
        </span>
        {dead ? (
          <span style={{ fontSize: "10px", fontFamily: "Georgia, serif", color: "#6b1010", whiteSpace: "nowrap" }}>
            &ldquo;That&rsquo;s no ordinary rabbit!&rdquo;
          </span>
        ) : (
          <span style={{ fontSize: "8px", fontFamily: "monospace", color: "#7a6a58", whiteSpace: "nowrap" }}>
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
