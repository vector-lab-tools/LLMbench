"use client";

import React from "react";
import { X, Eye, EyeOff, Moon, Sun, ChevronDown, ChevronRight, ExternalLink, HelpCircle } from "lucide-react";
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
  openrouter: "e.g. qwen/qwen-2.5-72b-instruct, anthropic/claude-3-5-sonnet",
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

/**
 * Client-only access to window.location bits used in the Ollama help
 * text. Reading `window` directly during render breaks SSR hydration
 * (React error #418) — values render as "" on the server and as the
 * real hostname on the client, the trees don't match, React tears the
 * subtree down and a possibly-in-flight Ollama fetch dies with it.
 */
function useClientOrigin(): { hostname: string; origin: string } {
  const [info, setInfo] = useState({ hostname: "", origin: "" });
  useEffect(() => {
    setInfo({
      hostname: window.location.hostname,
      origin: window.location.origin,
    });
  }, []);
  return info;
}

/**
 * Small inline code block with a copy-to-clipboard button. Used for
 * the OLLAMA_ORIGINS command so users can paste the exact string with
 * their own origin pre-filled, rather than hand-editing the example.
 */
function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable; user can still select manually */ }
  };
  return (
    <span className="block my-1.5 flex items-start gap-1.5">
      <code className="flex-1 font-mono text-[11px] bg-muted/60 px-2 py-1 rounded select-all break-all">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="btn-editorial-ghost text-[10px] px-2 py-1 shrink-0"
        title="Copy to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
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
  const clientOrigin = useClientOrigin();

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
            const newProvider = e.target.value as AIProvider;
            const config = getProviderConfigWithModels(newProvider);
            // Persist API keys per provider in localStorage so switching
            // providers doesn't wipe the user's key. Stash the current
            // slot's key under its current provider, then restore (or
            // leave blank for) the new provider.
            try {
              if (slot.apiKey) {
                localStorage.setItem(`llmbench-apikey-${slot.provider}`, slot.apiKey);
              }
            } catch { /* localStorage may be unavailable */ }
            let restored = "";
            try {
              restored = localStorage.getItem(`llmbench-apikey-${newProvider}`) ?? "";
            } catch { /* ignore */ }
            onUpdate({
              provider: newProvider,
              model: config.models[0]?.id || "custom",
              apiKey: restored,
              baseUrl: config.defaultBaseUrl || "",
              customModelId: "",
            });
          }}
          className="input-editorial w-full"
        >
          {/* Ollama is always listed; logprobs filter still greys it
              out when the user has the "logprobs only" filter on.
              Otherwise selectable on every origin — v2.15.34's
              browser-direct Ollama path means a deployed LLMbench
              can reach the user's local Ollama once the user runs
              with OLLAMA_ORIGINS=*. */}
          {providers.map((p) => {
            const noLogprobs = logprobsFilter && !p.supportsLogprobs;
            return (
              <option key={p.id} value={p.id} disabled={noLogprobs}>
                {p.name}{noLogprobs ? " (no logprobs)" : ""}
              </option>
            );
          })}
        </select>

        {slot.provider === "ollama" && (
          <div className="mt-1 text-caption text-muted-foreground space-y-1">
            <p>
              <strong className="text-foreground">Ollama (Local)</strong> runs the model on
              your own machine. LLMbench calls it directly from your browser
              (skipping the server route) so you can use it both from a local
              dev build and from a deployed LLMbench, as long as you let
              Ollama&apos;s <strong className="text-foreground">CORS</strong> (Cross-Origin Resource Sharing) policy talk to this page&apos;s origin.
              CORS is the browser&apos;s gatekeeper for cross-origin HTTP requests: the remote server has to opt in by naming
              the caller&apos;s origin in an <code className="font-mono">Access-Control-Allow-Origin</code> header, which
              Ollama configures via the <code className="font-mono">OLLAMA_ORIGINS</code> environment variable.
            </p>
            <p>
              Setup: install from{" "}
              <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer"
                 className="text-burgundy hover:underline">ollama.com/download</a>,
              pull a model (<code className="font-mono">ollama pull llama3.2</code>),
              and start the server.
              {isLocal ? (
                <> A plain <code className="font-mono">ollama serve</code> is enough when
                you&apos;re running LLMbench on localhost.</>
              ) : (
                <>
                  {" "}You&apos;re viewing LLMbench from{" "}
                  <span className="font-mono">{clientOrigin.hostname || "a deployed origin"}</span>.
                  Start Ollama with this exact command so its CORS policy lets the browser call it from here:
                  <CopyableCommand
                    command={`OLLAMA_ORIGINS="${clientOrigin.origin || "https://your-llmbench-origin"},http://localhost:3000,http://127.0.0.1:3000" ollama serve`}
                  />
                  <span className="block mt-1">
                    <strong className="text-foreground">Safari note:</strong> the browser-direct path works in Chrome,
                    Firefox, Edge, Arc, and Brave. Safari currently blocks HTTPS pages from calling{" "}
                    <code className="font-mono">http://localhost</code> regardless of CORS, so use one of the
                    Chromium-family browsers (or Firefox) for Ollama from a deployed LLMbench. Local dev
                    (<code className="font-mono">npm run dev</code> on <code className="font-mono">localhost:3000</code>)
                    works in Safari too.
                  </span>
                </>
              )}
            </p>
          </div>
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
              onChange={(e) => {
                const v = e.target.value;
                onUpdate({ apiKey: v });
                // Mirror the key into the per-provider store so a later
                // provider switch restores the same value.
                try {
                  if (v) localStorage.setItem(`llmbench-apikey-${slot.provider}`, v);
                  else localStorage.removeItem(`llmbench-apikey-${slot.provider}`);
                } catch { /* ignore */ }
              }}
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
  const { slots, updateSlot, showSettings, setShowSettings, autoFetchLogprobs, setAutoFetchLogprobs } =
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
            {/* Restrict the provider/model dropdowns to entries that
                support logprobs. Display-only — does not affect runtime
                behaviour beyond what is selectable. */}
            <label className="flex items-center gap-2 text-caption text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={logprobsFilter}
                onChange={(e) => setLogprobsFilter(e.target.checked)}
                className="rounded"
              />
              Logprobs-compatible only
            </label>
            {/* App-wide auto-fetch: when on, Compare mode fetches
                logprobs alongside the main generation if both active
                slots are logprobs-capable, so toggling the probs view
                later never triggers a second model request. Persisted
                in localStorage. */}
            <label
              className="flex items-center gap-2 text-caption text-muted-foreground cursor-pointer select-none"
              title="When on: Compare always fetches token probabilities at submit time so toggling the probs view never re-runs the model. Requires both active slots to support logprobs."
            >
              <input
                type="checkbox"
                checked={autoFetchLogprobs}
                onChange={(e) => setAutoFetchLogprobs(e.target.checked)}
                className="rounded"
              />
              Auto-fetch logprobs
            </label>
            <button
              onClick={() => setShowSettings(false)}
              className="btn-editorial-ghost p-1.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Onboarding guide — first thing the user sees. Collapsible so it
            doesn't push the slot editors below the fold for returning users
            who already have keys, but defaults to expanded for first-timers
            (i.e. when neither slot has an apiKey yet). */}
        <div className="px-6 pt-6">
          <OnboardingGuide defaultOpen={!slots.A.apiKey && !slots.B.apiKey} />
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

// ---------- Onboarding guide ------------------------------------------------
//
// Per-provider, expandable instructions for getting an API key. The intent is
// that a first-time user landing on Settings can find the relevant flow
// without leaving the app, and that the Hugging Face path — which trips
// people up because their key UI is buried — is just as discoverable as
// OpenAI's. Each entry covers: where to sign up, where the key page lives,
// what the key looks like, and any free-tier caveats. Links open in a new
// tab.

interface ProviderGuideEntry {
  id: AIProvider;
  name: string;
  signupUrl: string;
  keyUrl: string;
  keyPrefix: string;
  freeTier: string;
  steps: string[];
  notes?: string;
}

const PROVIDER_GUIDES: ProviderGuideEntry[] = [
  {
    id: "huggingface",
    name: "Hugging Face",
    signupUrl: "https://huggingface.co/join",
    keyUrl: "https://huggingface.co/settings/tokens",
    keyPrefix: "hf_…",
    freeTier:
      "Free Inference API access to many open-weight chat models. Rate-limited; needs a paid Pro / dedicated endpoint for heavy use.",
    steps: [
      "Sign up at huggingface.co (email or GitHub).",
      "Open Settings → Access Tokens (the link below).",
      "Click \"+ Create new token\". Choose Token type \"Read\". A name like \"llmbench\" is fine.",
      "Copy the token (starts with hf_). Paste into the API Key field above.",
      "In the Model dropdown choose any HF model — Llama 3 / Qwen / Mistral all work. Add a custom model ID if you need a specific repo.",
    ],
    notes:
      "Logprobs work on the Hugging Face router for OpenAI-compatible chat models. If you see empty distributions, try a different model — not every HF-routed model exposes logprobs.",
  },
  {
    id: "openai",
    name: "OpenAI",
    signupUrl: "https://platform.openai.com/signup",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-…",
    freeTier:
      "No free tier. Pay-as-you-go after a small initial credit if you add a card.",
    steps: [
      "Sign up at platform.openai.com.",
      "Add a payment method under Billing.",
      "Open API Keys (the link below) and click \"Create new secret key\". Copy it once — it cannot be shown again.",
      "Paste into the API Key field above. Pick a model (gpt-4o or gpt-4o-mini for logprobs work).",
    ],
    notes:
      "The cleanest provider for Sampling Probe — direct API returns full top_logprobs without proxy stripping.",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    signupUrl: "https://console.anthropic.com/",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-…",
    freeTier: "Initial free credit on signup; pay-as-you-go after.",
    steps: [
      "Sign up at console.anthropic.com.",
      "Open Settings → API Keys (link below) and click \"Create Key\".",
      "Copy the key (starts with sk-ant-). Paste above.",
    ],
    notes:
      "Claude does not expose logprobs through the public API, so Anthropic slots cannot be used with Sampling Probe or Grammar Probe Phase B/C. Compare and Analyse modes work fully.",
  },
  {
    id: "google",
    name: "Google (Gemini)",
    signupUrl: "https://aistudio.google.com/",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyPrefix: "AIza…",
    freeTier:
      "Generous free tier on Gemini 2.0 Flash and 2.5 series via AI Studio.",
    steps: [
      "Open Google AI Studio (aistudio.google.com) and sign in with a Google account.",
      "Click \"Get API key\" or visit the link below.",
      "Create an API key in a new or existing Google Cloud project.",
      "Copy and paste above. Pick gemini-2.0-flash if you want logprobs (2.5-series does not return them).",
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    signupUrl: "https://openrouter.ai/",
    keyUrl: "https://openrouter.ai/keys",
    keyPrefix: "sk-or-…",
    freeTier: "Pay-as-you-go across many models with one key. Some models have free tiers.",
    steps: [
      "Sign up at openrouter.ai.",
      "Add credit (a few dollars covers a lot of LLMbench usage).",
      "Open Keys (link below), create a key, copy it.",
      "Paste above. The Model dropdown lists OpenRouter-compatible models; you can also use a custom model ID.",
    ],
    notes:
      "Logprobs are reliably available on openai/* routes (gpt-4o, gpt-4o-mini). Other routes may return empty distributions; LLMbench will surface a clear error if so.",
  },
  {
    id: "ollama",
    name: "Ollama (Local, no API key)",
    signupUrl: "https://ollama.com/download",
    keyUrl: "https://ollama.com/library",
    keyPrefix: "(no key)",
    freeTier:
      "Free. All inference happens on your own machine — no calls leave your laptop, no per-token cost. Works from both local and deployed LLMbench (browser calls Ollama directly).",
    steps: [
      "Install Ollama from ollama.com/download (macOS, Linux, Windows).",
      "Pull a model: `ollama pull gemma4` or `ollama pull llama3.2` or `ollama pull qwen3`. The model library link below lists what's available.",
      "Start the server. If you're using a LOCAL LLMbench (e.g. `npm run dev` on localhost:3000), a plain `ollama serve` is enough.",
      "If you're using a DEPLOYED LLMbench (e.g. on Vercel), start Ollama with `OLLAMA_ORIGINS=\"<your-LLMbench-origin>\" ollama serve`. The Settings panel for the Ollama slot displays the exact command with your origin pre-filled, ready to copy.",
      "In LLMbench Settings, choose Ollama, leave the API key blank, and either pick a model from the list or enter the exact model ID you pulled (e.g. gemma4 or llama3.2:latest).",
    ],
    notes:
      "Ollama is the one provider LLMbench calls directly from the browser instead of routing through its server-side API — that's why Vercel-style deployments can reach a local Ollama at all. The browser-direct path works in Chrome, Firefox, Edge, Arc, and Brave. SAFARI doesn't allow it: even with CORS open, Safari blocks HTTPS pages from calling http://localhost, so use a Chromium-family browser or Firefox for Ollama from a deployed LLMbench. Local-dev (npm run dev) on Safari works fine. Logprobs are not currently exposed by Ollama, so the Probs view, Grammar Probe Phase B/C, and Sampling Probe will not work against an Ollama slot — Compare and the rest of Analyse are fully usable. No data leaves your machine.",
  },
];

function OnboardingGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState<AIProvider | null>(null);

  return (
    <div className="border border-parchment/60 rounded-sm bg-cream/30 dark:bg-burgundy/10">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-caption font-semibold text-foreground"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <HelpCircle className="w-3.5 h-3.5 text-burgundy" />
        <span>Getting started — how to obtain an API key</span>
        <span className="ml-auto text-[10px] text-muted-foreground/70 font-normal">
          {open ? "" : "click to expand"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-caption">
          <p className="text-muted-foreground leading-relaxed">
            LLMbench runs entirely in your browser; API keys are stored locally and never sent anywhere except directly to the model provider. Pick a provider below for step-by-step setup. <strong className="text-foreground">Hugging Face</strong> is the easiest free-tier option for getting started.
          </p>
          <div className="space-y-1">
            {PROVIDER_GUIDES.map(g => {
              const isOpen = expanded === g.id;
              return (
                <div key={g.id} className="border border-parchment/60 rounded-sm bg-card/40">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : g.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                  >
                    {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <span className="font-semibold text-foreground">{g.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{g.keyPrefix}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/70 truncate">{g.freeTier}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      <ol className="list-decimal list-outside pl-5 space-y-1 text-muted-foreground">
                        {g.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a href={g.signupUrl} target="_blank" rel="noopener noreferrer"
                          className="btn-editorial-ghost flex items-center gap-1 text-[10px] px-2 py-0.5">
                          <ExternalLink className="w-3 h-3" /> Sign up
                        </a>
                        <a href={g.keyUrl} target="_blank" rel="noopener noreferrer"
                          className="btn-editorial-ghost flex items-center gap-1 text-[10px] px-2 py-0.5">
                          <ExternalLink className="w-3 h-3" /> Get key
                        </a>
                      </div>
                      {g.notes && (
                        <p className="text-[10px] text-muted-foreground italic border-l-2 border-parchment/60 pl-2">
                          {g.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/70 italic pt-1">
            Switching providers no longer wipes your other keys — LLMbench remembers each provider&apos;s key per browser. Keys you&apos;ve previously entered come back when you switch back to that provider.
          </p>
        </div>
      )}
    </div>
  );
}
