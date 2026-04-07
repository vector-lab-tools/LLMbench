"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

const QUESTIONS = [
  "Stop! Who would cross the Bridge of LLMs must answer me these questions three, ere the other side he see!",
  "What... is your name?",
  "What... is your quest?",
  "What... is the airspeed velocity of an unladen vector?",
  "African or European transformer?",
  "What is your favourite attention mechanism?",
  "What is the compute velocity of an unladen attention head?",
  "What... is the capital of the latent space?",
  "What is the temperature of an unladen model at inference?",
  "Right. Off you go.",
];

const DISMISSALS = [
  "AAARGH!",
  "He who is valiant and pure of spirit may find the Holy Token!",
  "We are the knights who say... logprob!",
  "It's just a flesh wound.",
];

interface BridgeKeeperProps {
  onDismiss: () => void;
}

export function BridgeKeeper({ onDismiss }: BridgeKeeperProps) {
  const [step, setStep] = useState(0);
  const [dismissText, setDismissText] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Auto-advance through questions
  useEffect(() => {
    if (step >= QUESTIONS.length - 1) return;
    const delay = step === 0 ? 2000 : 3500;
    const t = setTimeout(() => setStep(s => Math.min(s + 1, QUESTIONS.length - 1)), delay);
    return () => clearTimeout(t);
  }, [step]);

  const handleDismiss = useCallback(() => {
    const text = DISMISSALS[Math.floor(Math.random() * DISMISSALS.length)];
    setDismissText(text);
    setLeaving(true);
    setTimeout(onDismiss, 2000);
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 transition-all duration-500 ${leaving ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
      {/* Speech bubble */}
      <div className="relative max-w-xs bg-[#fffde7] border-2 border-[#8B4513] rounded-lg shadow-xl px-4 py-3">
        {/* Tail pointing to character below-right */}
        <div className="absolute -bottom-3 right-8 w-0 h-0"
          style={{
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "12px solid #8B4513",
          }}
        />
        <div className="absolute -bottom-2 right-9 w-0 h-0"
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "10px solid #fffde7",
          }}
        />

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-1.5 right-1.5 text-[#8B4513]/50 hover:text-[#8B4513] transition-colors"
          title="Flee!"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {dismissText ? (
          <p className="text-[12px] font-serif text-[#5c2a00] italic pr-4 leading-relaxed">
            {dismissText}
          </p>
        ) : (
          <p className="text-[12px] font-serif text-[#5c2a00] pr-4 leading-relaxed min-h-[2.5em]">
            {QUESTIONS[step]}
          </p>
        )}

        {/* Progress dots */}
        {!dismissText && (
          <div className="flex gap-1 mt-2">
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-[#8B4513]" : i < step ? "bg-[#8B4513]/40" : "bg-[#8B4513]/15"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* BridgeKeeper character */}
      <div className="select-none text-4xl drop-shadow-md" title="I am the BridgeKeeper!">
        🧙‍♂️
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
