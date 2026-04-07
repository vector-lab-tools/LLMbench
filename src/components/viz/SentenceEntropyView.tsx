"use client";

import { useMemo, useState } from "react";
import { computeMeanEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface SentenceEntropyViewProps {
  tokens: TokenLogprob[];
  isDark: boolean;
}

interface SentenceSegment {
  text: string;
  tokens: TokenLogprob[];
  meanEntropy: number;
  tokenCount: number;
}

function buildSentenceSegments(tokens: TokenLogprob[]): SentenceSegment[] {
  // Reconstruct text from tokens, tracking character ranges
  let offset = 0;
  const tokenRanges: { start: number; end: number }[] = [];
  let fullText = "";

  for (const t of tokens) {
    tokenRanges.push({ start: offset, end: offset + t.token.length });
    fullText += t.token;
    offset += t.token.length;
  }

  if (!fullText.trim()) return [];

  // [^.!?]+ requires at least 1 char — prevents zero-length matches and infinite loops
  // matchAll is safe; exec-while with patterns that can match "" is not
  const sentenceMatches = [...fullText.matchAll(/[^.!?]+[.!?]*/g)];

  if (sentenceMatches.length === 0) {
    // Fallback: treat entire text as one segment
    return [{
      text: fullText,
      tokens,
      meanEntropy: computeMeanEntropy(tokens),
      tokenCount: tokens.length,
    }];
  }

  return sentenceMatches
    .map(match => {
      const start = match.index!;
      const end = start + match[0].length;
      const sentTokens = tokens.filter((_, i) =>
        tokenRanges[i].start >= start && tokenRanges[i].start < end
      );
      const meanEntropy = sentTokens.length > 0 ? computeMeanEntropy(sentTokens) : 0;
      return {
        text: match[0],
        tokens: sentTokens,
        meanEntropy,
        tokenCount: sentTokens.length,
      };
    })
    .filter(s => s.tokenCount > 0);
}

function entropyToBackground(entropy: number, maxEntropy: number, isDark: boolean): string {
  if (maxEntropy === 0) return "";
  const t = Math.min(entropy / maxEntropy, 1);
  // Interpolate opacity: 0 → transparent, 1 → strong tint
  if (isDark) {
    if (t < 0.2) return "";
    if (t < 0.4) return "bg-blue-900/20";
    if (t < 0.6) return "bg-yellow-900/30";
    if (t < 0.8) return "bg-orange-900/40";
    return "bg-red-900/50";
  }
  if (t < 0.2) return "";
  if (t < 0.4) return "bg-blue-50";
  if (t < 0.6) return "bg-yellow-100";
  if (t < 0.8) return "bg-orange-100";
  return "bg-red-100";
}

export function SentenceEntropyView({ tokens, isDark }: SentenceEntropyViewProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { segments, maxEntropy, maxEntropyIndex } = useMemo(() => {
    const segs = buildSentenceSegments(tokens);
    const maxE = segs.reduce((m, s) => Math.max(m, s.meanEntropy), 0);
    const maxIdx = segs.reduce((mi, s, i) => s.meanEntropy > (segs[mi]?.meanEntropy ?? 0) ? i : mi, 0);
    return { segments: segs, maxEntropy: maxE, maxEntropyIndex: maxIdx };
  }, [tokens]);

  if (segments.length === 0) {
    return (
      <p className="text-caption text-muted-foreground italic">
        Could not segment text into sentences.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-muted-foreground">
        Each sentence is tinted by its mean token entropy. Darker = more uncertain generation. Hover for details.
      </p>

      <div className="font-serif text-base leading-loose">
        {segments.map((seg, i) => {
          const bg = entropyToBackground(seg.meanEntropy, maxEntropy, isDark);
          const isHovered = hoveredIndex === i;
          const isHighest = i === maxEntropyIndex;
          return (
            <span
              key={i}
              className={`relative cursor-default rounded-sm px-0.5 transition-all ${bg} ${isHovered ? "ring-1 ring-burgundy/50" : ""}`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHighest && (
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500/80 text-white text-[8px] font-bold mr-0.5 align-middle"
                  title="Highest-entropy sentence"
                >
                  !
                </span>
              )}
              {seg.text}
              {/* Hover tooltip */}
              {isHovered && (
                <span className="absolute bottom-full left-0 mb-1 z-20 bg-card border border-parchment/80 rounded shadow-sm px-2 py-1.5 text-caption text-foreground whitespace-nowrap pointer-events-none">
                  <span className="font-medium">{seg.tokenCount} tokens</span>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <span>mean entropy: <span className="font-mono">{seg.meanEntropy.toFixed(3)}</span> bits</span>
                  {isHighest && (
                    <span className="ml-1 text-red-500 font-medium">← highest</span>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Entropy scale legend */}
      <div className="flex items-center gap-3 text-caption text-muted-foreground pt-1">
        <span>Uncertainty:</span>
        {[
          { label: "Low", cls: isDark ? "bg-blue-900/20" : "bg-blue-50" },
          { label: "Medium", cls: isDark ? "bg-yellow-900/30" : "bg-yellow-100" },
          { label: "High", cls: isDark ? "bg-orange-900/40" : "bg-orange-100" },
          { label: "Peak", cls: isDark ? "bg-red-900/50" : "bg-red-100" },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`w-4 h-3 rounded-sm ${cls} border border-parchment/30`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
