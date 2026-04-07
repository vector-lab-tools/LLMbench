export interface PromptVariation {
  label: string;
  prompt: string;
}

export function generateVariations(basePrompt: string): PromptVariation[] {
  const trimmed = basePrompt.trim();
  const variations: PromptVariation[] = [];

  // 1. Add "Please" prefix
  if (!trimmed.toLowerCase().startsWith("please")) {
    variations.push({
      label: 'Add "Please"',
      prompt: `Please ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`,
    });
  }

  // 2. Add period at end
  if (!trimmed.endsWith(".") && !trimmed.endsWith("?") && !trimmed.endsWith("!")) {
    variations.push({
      label: "Add period",
      prompt: `${trimmed}.`,
    });
  }

  // 3. Add "Step by step:" prefix
  variations.push({
    label: 'Add "Step by step:"',
    prompt: `Step by step: ${trimmed}`,
  });

  // 4. Convert to question form
  if (!trimmed.endsWith("?")) {
    variations.push({
      label: "Question form",
      prompt: `Can you ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}?`,
    });
  }

  // 5. All caps
  variations.push({
    label: "ALL CAPS",
    prompt: trimmed.toUpperCase(),
  });

  // 6. Add "Be concise." suffix
  variations.push({
    label: 'Add "Be concise."',
    prompt: `${trimmed} Be concise.`,
  });

  // 7. Add "Think carefully." prefix
  variations.push({
    label: 'Add "Think carefully."',
    prompt: `Think carefully. ${trimmed}`,
  });

  // 8. Remove articles (a, an, the)
  const noArticles = trimmed.replace(/\b(a|an|the)\b/gi, "").replace(/\s+/g, " ").trim();
  if (noArticles !== trimmed) {
    variations.push({
      label: "Remove articles",
      prompt: noArticles,
    });
  }

  return variations;
}
