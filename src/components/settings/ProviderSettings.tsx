"use client";

import React from "react";
import { X, Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import {
  initializeModels,
  getProviderConfigWithModels,
  getAllProviders,
} from "@/lib/ai/config";
import type { AIProvider, ProviderSlot } from "@/types/ai-settings";

/** Provider-specific placeholder text for the Custom Model input */
const CUSTOM_PLACEHOLDERS: Record<AIProvider, string> = {
  anthropic: "e.g. claude-opus-4-20250514, claude-3-opus-20240229",
  openai: "e.g. gpt-4-turbo, o3-mini, chatgpt-4o-latest",
  google: "e.g. gemini-2.0-flash, gemini-1.5-pro-latest",
  ollama: "e.g. llama3.2:latest, codellama, phi3",
  "openai-compatible": "Enter model identifier",
  huggingface: "e.g. meta-llama/Llama-3.3-70B-Instruct",
};

/** Models that support logprobs — detected by name containing "(logprobs)" */
function modelSupportsLogprobs(modelName: string): boolean {
  return modelName.toLowerCase().includes("(logprobs)");
}

function useIsLocal(): boolean {
  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    const h = window.location.hostname;
    setIsLocal(h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0");
  }, []);
  return isLocal;
}

function SlotEditor({
  panel,
  slot,
  modelsLoaded,
  logprobsFilter,
  onUpdate,
}: {
  panel: "A" | "B";
  slot: ProviderSlot;
  modelsLoaded: boolean;
  logprobsFilter: boolean;
  onUpdate: (updates: Partial<ProviderSlot>) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const isLocal = useIsLocal();

  // Use dynamic models when loaded, otherwise fall back to static config
  const providerConfig = getProviderConfigWithModels(slot.provider);
  const providers = getAllProviders();
  const showCustomModel = slot.model === "custom";

  // Filtered model list when logprobsFilter is active.
  // If any model in this provider is tagged "(logprobs)", use tag-based filtering
  // (Google, HuggingFace — only some models work). Otherwise, if the whole provider
  // supports logprobs (OpenAI, openai-compatible), show all its models unchanged.
  const hasTaggedModels = providerConfig.models.some(
    (m) => m.id !== "custom" && modelSupportsLogprobs(m.name)
  );
  const visibleModels = logprobsFilter
    ? providerConfig.models.filter((m) => {
        if (m.id === "custom") return true;
        if (hasTaggedModels) return modelSupportsLogprobs(m.name);
        return providerConfig.supportsLogprobs;
      })
    : providerConfig.models;

  return (
    <div className="space-y-3">
      <h3 className="font-display text-display-sm font-semibold text-foreground">
        Panel {panel}
      </h3>

      {/* Provider select */}
      <div>
        <label className="block text-caption text-muted-foreground mb-1">
          Provider
        </label>
        <select
          value={slot.provider}
          onChange={(e) => {
            const provider = e.target.value as AIProvider;
            const config = getProviderConfigWithModels(provider);
            onUpdate({
              provider,
              model: config.models[0]?.id || "custom",
              apiKey: "",
              baseUrl: config.defaultBaseUrl || "",
              customModelId: "",
            });
          }}
          className="input-editorial w-full"
        >
          {providers
            .filter((p) => p.id !== "ollama" || isLocal)
            .map((p) => {
              const disabled = logprobsFilter && !p.supportsLogprobs;
              return (
                <option key={p.id} value={p.id} disabled={disabled}>
                  {p.name}{disabled ? " (no logprobs)" : ""}
                </option>
              );
            })}
        </select>

        {slot.provider === "ollama" && !isLocal && (
          <p className="mt-1 text-caption text-red-500">
            Ollama requires a local server. Run LLMbench locally with npm run dev to use Ollama.
          </p>
        )}
      </div>

      {/* Model select */}
      <div>
        <label className="block text-caption text-muted-foreground mb-1">
          Model
          {modelsLoaded && (
            <span className="text-muted-foreground/50 ml-1">(from models.md)</span>
          )}
        </label>
        <select
          value={slot.model}
          onChange={(e) => onUpdate({ model: e.target.value, customModelId: "" })}
          className="input-editorial w-full"
        >
          {visibleModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Custom model ID — shown when "Custom Model" is selected */}
      {showCustomModel && (
        <div>
          <label className="block text-caption text-muted-foreground mb-1">
            Custom Model ID
          </label>
          <input
            type="text"
            value={slot.customModelId || ""}
            onChange={(e) => onUpdate({ customModelId: e.target.value })}
            placeholder={CUSTOM_PLACEHOLDERS[slot.provider]}
            className="input-editorial w-full"
          />
          <p className="text-caption text-muted-foreground/60 mt-1">
            Enter the exact model ID your provider expects.
          </p>
        </div>
      )}

      {/* API Key */}
      {providerConfig.requiresApiKey && (
        <div>
          <label className="block text-caption text-muted-foreground mb-1">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={slot.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              placeholder={`Enter ${providerConfig.name} API key`}
              className="input-editorial w-full pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Base URL (for Ollama, OpenAI-compatible) */}
      {providerConfig.baseUrlConfigurable && (
        <div>
          <label className="block text-caption text-muted-foreground mb-1">
            Base URL
          </label>
          <input
            type="text"
            value={slot.baseUrl || ""}
            onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            placeholder={providerConfig.defaultBaseUrl || "https://api.example.com"}
            className="input-editorial w-full"
          />
        </div>
      )}

      {/* Temperature */}
      <div>
        <label className="block text-caption text-muted-foreground mb-1">
          Temperature: {slot.temperature.toFixed(1)}
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={slot.temperature}
          onChange={(e) =>
            onUpdate({ temperature: parseFloat(e.target.value) })
          }
          className="w-full"
        />
        <div className="flex justify-between text-caption text-muted-foreground/60">
          <span>Deterministic</span>
          <span>Creative</span>
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <label className="block text-caption text-muted-foreground mb-1">
          System Prompt (optional)
        </label>
        <textarea
          value={slot.systemPrompt}
          onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
          placeholder="Optional system instructions for this model..."
          className="input-editorial w-full resize-none"
          rows={3}
        />
      </div>
    </div>
  );
}

export default function ProviderSettings({
  isDark,
  onToggleDark,
}: {
  isDark?: boolean;
  onToggleDark?: () => void;
}) {
  const { slots, updateSlot, showSettings, setShowSettings } =
    useProviderSettings();

  // Load dynamic models from /models.md on mount
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [logprobsFilter, setLogprobsFilter] = useState(false);
  useEffect(() => {
    initializeModels().then(() => setModelsLoaded(true));
  }, []);

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-editorial-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display text-display-md font-bold text-foreground">
            Provider Settings
          </h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-caption text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={logprobsFilter}
                onChange={(e) => setLogprobsFilter(e.target.checked)}
                className="rounded"
              />
              Logprobs-compatible only
            </label>
            <button
              onClick={() => setShowSettings(false)}
              className="btn-editorial-ghost p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: two slot editors side by side */}
        <div className="p-6 flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <SlotEditor
              panel="A"
              slot={slots.A}
              modelsLoaded={modelsLoaded}
              logprobsFilter={logprobsFilter}
              onUpdate={(updates) => updateSlot("A", updates)}
            />
          </div>
          <div className="hidden md:block w-px bg-border shrink-0" />
          <div className="md:hidden h-px bg-border" />
          <div className="flex-1">
            <SlotEditor
              panel="B"
              slot={slots.B}
              modelsLoaded={modelsLoaded}
              logprobsFilter={logprobsFilter}
              onUpdate={(updates) => updateSlot("B", updates)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
          <span className="text-caption text-muted-foreground">
            API keys are stored in your browser only.
            {modelsLoaded && " Models loaded from models.md."}
          </span>
          {onToggleDark && (
            <button
              onClick={onToggleDark}
              className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDark ? "Light mode" : "Dark mode"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
