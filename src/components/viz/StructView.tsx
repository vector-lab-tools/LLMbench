"use client";

import { useMemo } from "react";

// Words that signal discourse structure / argumentation moves
const DISCOURSE_WORDS = new Set([
  // Contrast
  "however", "nevertheless", "nonetheless", "yet", "still", "although",
  "though", "whereas", "despite", "but", "while", "conversely",
  // Addition
  "moreover", "furthermore", "additionally", "also", "besides", "likewise",
  "similarly", "equally", "again", "too", "indeed",
  // Causation / result
  "therefore", "consequently", "hence", "thus", "accordingly", "so",
  "because", "since", "as", "therefore",
  // Sequence
  "firstly", "secondly", "thirdly", "finally", "lastly", "initially",
  "subsequently", "then", "next", "first", "second", "third", "last",
  // Clarification
  "specifically", "particularly", "notably", "namely", "alternatively",
  "meanwhile", "simultaneously",
]);

interface StructViewProps {
  text: string;
  fontSize: number;
  fontFamily: string;
  isDark: boolean;
}

function renderSentenceTokens(sentence: string, sentenceIndex: number) {
  // Split into word-boundary tokens preserving all whitespace/punctuation
  const tokens = [...sentence.matchAll(/[a-zA-Z'-]+|[^a-zA-Z'-]+/g)].map(m => m[0]);

  return (
    <>
      {/* Sentence number badge */}
      <sup
        className="inline-block align-super text-[9px] leading-none px-1 mr-0.5 rounded-full bg-burgundy/15 text-burgundy/70 select-none font-sans tabular-nums"
        aria-hidden
      >
        {sentenceIndex + 1}
      </sup>
      {tokens.map((token, j) => {
        const word = token.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
        if (DISCOURSE_WORDS.has(word)) {
          return (
            <span
              key={j}
              className="text-burgundy font-semibold"
              title={`Discourse connective: "${token}"`}
            >
              {token}
            </span>
          );
        }
        return <span key={j}>{token}</span>;
      })}
    </>
  );
}

export function StructView({ text, fontSize, fontFamily, isDark }: StructViewProps) {
  const sentences = useMemo(() => {
    const matches = [...text.matchAll(/[^.!?]+[.!?]*/g)];
    if (matches.length === 0) return [text];
    return matches.map(m => m[0]);
  }, [text]);

  const sentenceBg = isDark
    ? ["bg-blue-950/20", "bg-slate-800/20"]
    : ["bg-blue-50/40", "bg-slate-50/40"];

  return (
    <div className="flex flex-col h-full">
      {/* Legend */}
      <div className="px-4 py-1.5 border-b border-parchment/30 flex items-center gap-4 text-[10px] bg-cream/20">
        <span className="text-muted-foreground font-medium">Structure view</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-[9px] px-1 rounded-full bg-burgundy/15 text-burgundy/70 font-sans">1</span>
          Sentence number
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-burgundy font-semibold">however</span>
          <span className="text-muted-foreground">Discourse connective</span>
        </span>
      </div>

      {/* Text */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 leading-relaxed whitespace-pre-wrap"
        style={{ fontSize, fontFamily }}
      >
        {sentences.map((sentence, i) => (
          <span
            key={i}
            className={`rounded-sm ${sentenceBg[i % 2]}`}
          >
            {renderSentenceTokens(sentence, i)}
          </span>
        ))}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-1.5 border-t border-parchment/30 flex gap-4 text-[10px] text-muted-foreground bg-cream/20">
        <span>{sentences.length} sentences</span>
        <span>
          {sentences.filter(s => {
            const words = s.split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-zA-Z'-]/g, "").toLowerCase());
            return words.some(w => DISCOURSE_WORDS.has(w));
          }).length} with discourse markers
        </span>
        <span>
          avg {Math.round(sentences.reduce((a, s) => a + s.split(/\s+/).filter(Boolean).length, 0) / Math.max(sentences.length, 1))} words/sentence
        </span>
      </div>
    </div>
  );
}
