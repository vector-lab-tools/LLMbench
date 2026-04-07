"use client";

interface DefaultPromptChipsProps {
  prompts: readonly string[];
  onSelect: (prompt: string) => void;
  isLoading?: boolean;
}

export function DefaultPromptChips({ prompts, onSelect, isLoading }: DefaultPromptChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-caption text-muted-foreground/70 shrink-0">Try:</span>
      {prompts.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          disabled={isLoading}
          className="text-caption bg-cream hover:bg-parchment border border-parchment/50 px-2 py-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 text-left"
          title={p}
        >
          {p.length > 45 ? p.slice(0, 45) + "…" : p}
        </button>
      ))}
    </div>
  );
}
