/**
 * Dynamic model loading from /public/models.md
 *
 * Fetches and parses a Markdown file at runtime so model lists
 * can be updated without recompiling. Falls back to the hardcoded
 * defaults in config.ts if the file is missing or malformed.
 */

import type { AIProvider } from "@/types/ai-settings";

export interface ModelDefinition {
  id: string;
  name: string;
}

export interface LoadedModels {
  anthropic: ModelDefinition[];
  openai: ModelDefinition[];
  google: ModelDefinition[];
  ollama: ModelDefinition[];
  "openai-compatible": ModelDefinition[];
  huggingface: ModelDefinition[];
}

/** Map section headers in the MD file to provider keys */
const SECTION_TO_PROVIDER: Record<string, AIProvider> = {
  "anthropic (claude)": "anthropic",
  anthropic: "anthropic",
  openai: "openai",
  "google (gemini)": "google",
  google: "google",
  "ollama (local)": "ollama",
  ollama: "ollama",
  "openai-compatible": "openai-compatible",
  "openai-compatible api": "openai-compatible",
  "hugging face": "huggingface",
  "huggingface": "huggingface",
};

/**
 * Parse the models.md content into structured model definitions.
 * Each `## Section` maps to a provider via SECTION_TO_PROVIDER.
 * Model lines match: `- \`model-id\` - Display Name`
 */
export function parseModelsMarkdown(content: string): LoadedModels {
  const result: LoadedModels = {
    anthropic: [],
    openai: [],
    google: [],
    ollama: [],
    "openai-compatible": [],
    huggingface: [],
  };

  let currentProvider: AIProvider | null = null;
  const modelLineRe = /^-\s+`([^`]+)`\s+-\s+(.+)$/;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Section header
    if (trimmed.startsWith("## ")) {
      const heading = trimmed.slice(3).trim().toLowerCase();
      currentProvider = SECTION_TO_PROVIDER[heading] ?? null;
      continue;
    }

    // Model definition line
    if (currentProvider) {
      const match = trimmed.match(modelLineRe);
      if (match) {
        result[currentProvider].push({ id: match[1], name: match[2].trim() });
      }
    }
  }

  return result;
}

/**
 * Fetch /models.md from the public directory and parse it.
 * Returns null if the file cannot be loaded.
 */
export async function loadModelsConfig(): Promise<LoadedModels | null> {
  try {
    const response = await fetch("/models.md", { cache: "no-store" });
    if (!response.ok) return null;
    const text = await response.text();
    return parseModelsMarkdown(text);
  } catch {
    return null;
  }
}
