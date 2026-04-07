"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

type Speaker = "keeper" | "arthur";

const CONVERSATION: { speaker: Speaker; text: string }[] = [
  { speaker: "keeper", text: "Stop! Who would cross the Bridge of LLMs must answer me these questions three, ere the other side he see!" },
  { speaker: "arthur", text: "Ask me the questions, BridgeKeeper. I am not afraid." },
  { speaker: "keeper", text: "What... is your name?" },
  { speaker: "arthur", text: "It is Arthur, King of the Britons!" },
  { speaker: "keeper", text: "What... is your quest?" },
  { speaker: "arthur", text: "To seek the Holy Token!" },
  { speaker: "keeper", text: "What... is the airspeed velocity of an unladen vector?" },
  { speaker: "arthur", text: "What do you mean? An African or European transformer?" },
  { speaker: "keeper", text: "Huh? I... I don't know that!" },
  { speaker: "arthur", text: "Ha! Then you must answer me THESE questions three!" },
  { speaker: "keeper", text: "AAARGH!" },
];

const STEP_DELAY = 4500;

interface BridgeKeeperProps {
  onDismiss: () => void;
}

export function BridgeKeeper({ onDismiss }: BridgeKeeperProps) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const current = CONVERSATION[step];
  const isLast = step >= CONVERSATION.length - 1;

  useEffect(() => {
    if (isLast) return;
    const t = setTimeout(() => setStep(s => s + 1), STEP_DELAY);
    return () => clearTimeout(t);
  }, [step, isLast]);

  const handleDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 500);
  }, [onDismiss]);

  // Arthur is left character, Keeper is right character.
  // Tail sits at roughly 20% from left (Arthur) or 80% from left (Keeper).
  const tailLeft = current.speaker === "arthur" ? "20%" : "75%";

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-64 transition-all duration-500 ${leaving ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-[#8B4513] text-[#fffde7] hover:bg-[#5c2a00] flex items-center justify-center transition-colors"
        title="Flee!"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Speech bubble — single bubble, tail moves left/right per speaker */}
      <div className="relative mb-4">
        <div className="bg-[#fffde7] border-2 border-[#8B4513] rounded-lg shadow-xl px-3 py-2.5 min-h-[52px] flex items-center">
          <p className="text-[11px] font-serif text-[#5c2a00] leading-relaxed">
            {current.text}
          </p>
        </div>
        {/* Down-pointing tail, shifts with speaker */}
        <div
          className="absolute -bottom-[11px] w-0 h-0"
          style={{
            left: tailLeft,
            transform: "translateX(-50%)",
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "12px solid #8B4513",
          }}
        />
        <div
          className="absolute -bottom-[9px] w-0 h-0"
          style={{
            left: tailLeft,
            transform: "translateX(-50%)",
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "10px solid #fffde7",
          }}
        />
      </div>

      {/* Characters — fixed positions matching tail anchors */}
      <div className="flex items-end justify-between px-2">
        {/* Arthur — left ~20% */}
        <div className={`flex flex-col items-center gap-0.5 transition-all duration-300 ${current.speaker === "arthur" ? "scale-110" : "scale-90 opacity-50"}`}>
          <span className="text-3xl select-none" title="Arthur, King of the Britons">🤴</span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Arthur</span>
        </div>

        {/* BridgeKeeper — right ~75% */}
        <div className={`flex flex-col items-center gap-0.5 transition-all duration-300 ${current.speaker === "keeper" ? "scale-110" : "scale-90 opacity-50"}`}>
          <span className="text-3xl select-none" title="I am the BridgeKeeper!">🧙‍♂️</span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">BridgeKeeper</span>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1 mt-2">
        {CONVERSATION.map((_, i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full transition-colors ${i === step ? "bg-[#8B4513]" : i < step ? "bg-[#8B4513]/35" : "bg-[#8B4513]/12"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Returns true if the prompt is one of the Monty Python Easter egg triggers */
export function isBridgeKeeperPrompt(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  return (
    p.includes("airspeed velocity") ||
    p.includes("unladen swallow") ||
    p.includes("how'd you get that") ||
    p.includes("self-perpetuating autocracy") ||
    p.includes("working classes")
  );
}
