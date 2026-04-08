"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";

interface KillerRabbitProps {
  onDismiss: () => void;
  /** Called with the throw function once all warning quotes have played */
  onGrenadeReady: (throwFn: () => void) => void;
  /** Set to true externally when the grenade is thrown */
  grenadeThrown: boolean;
}

const WARNINGS = [
  "Wait! There's something you should know...",
  "That's the most foul, cruel, and bad-tempered rodent you ever set eyes on!",
  "Look, that rabbit's got a vicious streak a mile wide! It's a killer!",
  "He's got huge, sharp... er... He can leap about. Look at the bones!",
  "Consult the Book of Armaments! Chapter Two, verses nine through twenty-one...",
  "You must use the Holy Hand Grenade of Antioch!",
];

const WARN_DELAY = 4000;

function randPos() {
  const margin = 140;
  return {
    x: margin + Math.random() * (window.innerWidth - margin * 2),
    y: margin + Math.random() * (window.innerHeight - margin * 2),
  };
}

/** SVG illustration of the Killer Rabbit of Caerbannog */
function KillerRabbitSVG({ dead }: { dead: boolean }) {
  return (
    <svg
      width="140"
      height="154"
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: dead
          ? "grayscale(100%) brightness(0.3)"
          : "drop-shadow(0 0 8px rgba(180,0,0,0.5))",
        transition: "filter 0.4s",
      }}
    >
      {/* Left ear */}
      <ellipse cx="68" cy="44" rx="19" ry="52" fill="#ededec" />
      <ellipse cx="68" cy="44" rx="11" ry="42" fill="#e8b4b8" opacity="0.7" />
      {/* Right ear — slightly cocked */}
      <ellipse cx="132" cy="40" rx="19" ry="50" transform="rotate(6 132 40)" fill="#ededec" />
      <ellipse cx="132" cy="40" rx="11" ry="40" transform="rotate(6 132 40)" fill="#e8b4b8" opacity="0.7" />

      {/* Body */}
      <ellipse cx="100" cy="178" rx="62" ry="46" fill="#e9e9e8" />
      {/* Fur texture — body */}
      <ellipse cx="80" cy="165" rx="14" ry="10" fill="#f4f4f3" opacity="0.6" />
      <ellipse cx="115" cy="160" rx="12" ry="9" fill="#f4f4f3" opacity="0.6" />
      <ellipse cx="100" cy="195" rx="16" ry="10" fill="#f4f4f3" opacity="0.6" />

      {/* Head */}
      <ellipse cx="100" cy="112" rx="52" ry="50" fill="#eaeae9" />
      {/* Fur wisps */}
      <ellipse cx="78" cy="92" rx="9" ry="6" fill="#f5f5f4" opacity="0.7" />
      <ellipse cx="122" cy="90" rx="8" ry="6" fill="#f5f5f4" opacity="0.7" />
      <ellipse cx="100" cy="86" rx="10" ry="5" fill="#f5f5f4" opacity="0.7" />

      {/* Eyes — deep red with orange glow */}
      {/* Glow */}
      <circle cx="79" cy="107" r="16" fill="#8B0000" opacity="0.3" />
      <circle cx="121" cy="107" r="16" fill="#8B0000" opacity="0.3" />
      {/* Iris */}
      <circle cx="79" cy="107" r="11" fill="#cc0000" />
      <circle cx="121" cy="107" r="11" fill="#cc0000" />
      {/* Highlight */}
      <circle cx="79" cy="107" r="7" fill="#ff2200" />
      <circle cx="121" cy="107" r="7" fill="#ff2200" />
      {/* Pupil */}
      <ellipse cx="80" cy="108" rx="4" ry="5" fill="#111" />
      <ellipse cx="122" cy="108" rx="4" ry="5" fill="#111" />
      {/* Eye glint */}
      <circle cx="76" cy="104" r="2" fill="white" opacity="0.8" />
      <circle cx="118" cy="104" r="2" fill="white" opacity="0.8" />

      {/* Nose */}
      <ellipse cx="100" cy="124" rx="7" ry="5" fill="#d4808a" />
      {/* Nostrils */}
      <ellipse cx="97" cy="124" rx="2" ry="1.5" fill="#a05060" />
      <ellipse cx="103" cy="124" rx="2" ry="1.5" fill="#a05060" />

      {/* Snarling mouth */}
      <path d="M 78 132 Q 100 145 122 132" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Fangs */}
      <polygon points="85,133 82,150 90,137" fill="white" stroke="#ccc" strokeWidth="1" />
      <polygon points="95,136 92,154 100,140" fill="white" stroke="#ccc" strokeWidth="1" />
      <polygon points="105,136 108,154 100,140" fill="white" stroke="#ccc" strokeWidth="1" />
      <polygon points="115,133 118,150 110,137" fill="white" stroke="#ccc" strokeWidth="1" />

      {/* Blood on face — left side */}
      <path d="M 62 108 Q 58 118 60 130" stroke="#8B0000" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
      <circle cx="60" cy="130" r="4" fill="#8B0000" opacity="0.8" />
      <circle cx="55" cy="115" r="3" fill="#8B0000" opacity="0.7" />
      {/* Blood splatter — right */}
      <circle cx="138" cy="102" r="4" fill="#8B0000" opacity="0.75" />
      <circle cx="143" cy="112" r="2.5" fill="#8B0000" opacity="0.6" />
      <path d="M 135 96 L 140 108" stroke="#8B0000" strokeWidth="2" fill="none" opacity="0.7" strokeLinecap="round" />
      {/* Blood on body */}
      <path d="M 85 155 Q 80 168 82 178" stroke="#8B0000" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
      <circle cx="82" cy="178" r="3.5" fill="#8B0000" opacity="0.65" />

      {/* Paws at bottom */}
      <ellipse cx="72" cy="214" rx="26" ry="10" fill="#dedede" />
      <ellipse cx="128" cy="214" rx="26" ry="10" fill="#dedede" />
      {/* Claws */}
      <path d="M 58 210 L 55 220" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
      <path d="M 65 212 L 63 222" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
      <path d="M 72 213 L 71 223" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
      <path d="M 114 213 L 113 223" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
      <path d="M 121 212 L 121 222" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
      <path d="M 128 210 L 130 220" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function KillerRabbit({ onDismiss, onGrenadeReady, grenadeThrown }: KillerRabbitProps) {
  const [rabbitPos, setRabbitPos] = useState<{ x: number; y: number } | null>(null);
  const [dead, setDead] = useState(false);
  const [fading, setFading] = useState(false);
  const [warnStep, setWarnStep] = useState(0);
  const deadRef = useRef(false);

  // Scurry on mount + immediately signal grenade ready
  useEffect(() => {
    setRabbitPos(randPos());
    const id = setInterval(() => {
      if (!deadRef.current) setRabbitPos(randPos());
    }, 1500);
    const throwFn = () => {
      if (deadRef.current) return;
      deadRef.current = true;
      setDead(true);
      setTimeout(() => setFading(true), 1600);
      setTimeout(onDismiss, 2100);
    };
    onGrenadeReady(throwFn);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle warning quotes
  useEffect(() => {
    if (warnStep >= WARNINGS.length - 1) return;
    const t = setTimeout(() => setWarnStep(s => s + 1), WARN_DELAY);
    return () => clearTimeout(t);
  }, [warnStep, onDismiss, onGrenadeReady]);

  // Respond to external grenade throw
  useEffect(() => {
    if (!grenadeThrown || deadRef.current) return;
    deadRef.current = true;
    setDead(true);
    setTimeout(() => setFading(true), 1600);
    setTimeout(onDismiss, 2100);
  }, [grenadeThrown, onDismiss]);

  const dismiss = useCallback(() => {
    setFading(true);
    setTimeout(onDismiss, 500);
  }, [onDismiss]);

  return (
    <>
      {/* Scurrying rabbit */}
      {rabbitPos && (
        <div style={{
          position: "fixed",
          left: rabbitPos.x,
          top: rabbitPos.y,
          zIndex: 9998,
          userSelect: "none",
          pointerEvents: "none",
          transform: "translate(-50%, -50%)",
          opacity: fading ? 0 : 1,
          transition: dead
            ? "opacity 0.6s ease"
            : "left 0.8s cubic-bezier(0.4,0,0.2,1), top 0.8s cubic-bezier(0.4,0,0.2,1)",
        }}>
          {dead ? (
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: "5rem", display: "block" }}>💥</span>
              <div style={{ fontSize: 13, fontFamily: "Georgia, serif", color: "#6b1010", textAlign: "center", fontWeight: "bold" }}>
                AAARGH!
              </div>
            </div>
          ) : (
            <KillerRabbitSVG dead={false} />
          )}
        </div>
      )}

      {/* Tim the Enchanter warning — bottom-right (clippy position) */}
      <div style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: 240,
        opacity: fading ? 0 : 1,
        transition: "opacity 0.5s ease",
        userSelect: "none",
      }}>
        {/* Dismiss */}
        <button onClick={dismiss} title="Run away!" style={{
          position: "absolute", top: -8, right: -8, zIndex: 1,
          width: 20, height: 20, borderRadius: 2,
          background: "#2e1e10", color: "#c8b898", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <X size={12} />
        </button>

        {/* Speech bubble */}
        <div style={{ marginBottom: 12, position: "relative" }}>
          <div style={{
            background: "#ffffff", border: "2px solid #2e1e10",
            boxShadow: "2px 3px 0 #1a1008", borderRadius: 4,
            padding: "10px 12px", minHeight: 52,
            display: "flex", alignItems: "center",
          }}>
            <p style={{ fontSize: 11, fontFamily: "Georgia, serif", color: "#0a0a0a", margin: 0, lineHeight: 1.5 }}>
              {WARNINGS[warnStep]}
            </p>
          </div>
          <div style={{ position: "absolute", bottom: -11, left: 28, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "12px solid #2e1e10" }} />
          <div style={{ position: "absolute", bottom: -9, left: 30, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "10px solid #ffffff" }} />
        </div>

        {/* Tim */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingLeft: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: "2.2rem", filter: "grayscale(50%) sepia(30%) brightness(0.8)" }} title="Tim the Enchanter">🧙</span>
            <span style={{ fontSize: 8, fontFamily: "monospace", color: "#7a6a58" }}>Tim the Enchanter</span>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 8 }}>
          {WARNINGS.map((_, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: "50%",
              background: i === warnStep ? "#2e1e10" : i < warnStep ? "#2e1e1055" : "#2e1e1018",
              transition: "background 0.3s",
            }} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Triggers when the prompt contains the word "rabbit" */
export function isKillerRabbitPrompt(prompt: string): boolean {
  return /\brabbit\b/i.test(prompt.trim());
}
