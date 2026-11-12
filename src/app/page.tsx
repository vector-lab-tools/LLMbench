"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, HelpCircle, Info, X, GraduationCap } from "lucide-react";
import Image from "next/image";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { TabNav, type TabId } from "@/components/layout/TabNav";
import ProviderSettings from "@/components/settings/ProviderSettings";
import CompareMode from "@/components/operations/CompareMode";
import StochasticMode from "@/components/operations/StochasticMode";
import TemperatureMode from "@/components/operations/TemperatureMode";
import SensitivityMode from "@/components/operations/SensitivityMode";
import LogprobsMode from "@/components/operations/LogprobsMode";
import DivergenceMode from "@/components/operations/DivergenceMode";
import GrammarMode from "@/components/operations/GrammarMode";
import SamplingMode from "@/components/operations/SamplingMode";
import { APP_VERSION } from "@/lib/version";
import { Clippy } from "@/components/easter-eggs/Clippy";
import { KillerRabbit } from "@/components/viz/KillerRabbit";
import { TutorialCards } from "@/components/layout/TutorialCards";

const MODE_LABELS: Record<TabId, string> = {
  compare: "Dual Panel",
  stochastic: "Stochastic Variation",
  sensitivity: "Prompt Sensitivity",
  temperature: "Temperature Gradient",
  logprobs: "Token Probabilities",
  divergence: "Cross-Model Divergence",
  grammar: "Grammar Probe",
  sampling: "Sampling Probe",
};

const HELP_TABS = [
  { id: "start", label: "Getting started" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "compare", label: "Compare" },
  { id: "probs", label: "Token probabilities" },
  { id: "analyse", label: "Analyse modes" },
  { id: "grammar", label: "Grammar Probe" },
  { id: "sampling", label: "Sampling Probe" },
  { id: "tips", label: "Tips" },
] as const;
type HelpTabId = (typeof HELP_TABS)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("compare");
  const [isDark, setIsDark] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTabId>("start");
  const [showLogprobsExplainer, setShowLogprobsExplainer] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>();
  const { setShowSettings, noMarkdown, setNoMarkdown } = useProviderSettings();

  // Easter egg state
  const [showRabbit, setShowRabbit] = useState(false);
  const [grenadeReady, setGrenadeReady] = useState(false);
  const [grenadeThrown, setGrenadeThrown] = useState(false);
  const throwRabbitRef = useRef<(() => void) | null>(null);

  // Keyboard detection for Easter eggs (same pattern as Clippy)
  useEffect(() => {
    let buffer = "";
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      buffer += e.key.toLowerCase();
      if (buffer.length > 15) buffer = buffer.slice(-15);

      if (buffer.endsWith("rabbit")) {
        buffer = "";
        setShowRabbit(true);
        setGrenadeReady(false);
        setGrenadeThrown(false);
        throwRabbitRef.current = null;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleGrenadeReady = useCallback((fn: () => void) => {
    throwRabbitRef.current = fn;
    setGrenadeReady(true);
  }, []);

  const handleThrowGrenade = useCallback(() => {
    setGrenadeThrown(true);
    throwRabbitRef.current?.();
    setTimeout(() => { setGrenadeReady(false); setShowRabbit(false); }, 2200);
  }, []);

  const handleDismissRabbit = useCallback(() => {
    setShowRabbit(false);
    setGrenadeReady(false);
    setGrenadeThrown(false);
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    // Document-level scroll model (matches Manifold Atlas's StatusBar
    // pattern, v1.3.5). The root is `min-h-screen` rather than `h-screen`
    // so the page can grow with content rather than capping at viewport
    // height. As content scrolls, the header and TabNav scroll up out of
    // view naturally; the footer is `sticky bottom-0 z-30` so it stays
    // pinned to the bottom of the viewport throughout. No toggle, no
    // scroll listener — just CSS.
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="px-4 py-2 border-b border-border bg-cream/30 flex items-center gap-3">
        {/* Vector Lab mark */}
        <a
          href="https://vector-lab-tools.github.io"
          target="_blank"
          rel="noopener noreferrer"
          title="Vector Lab — research instruments for critical vector theory"
          className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity shrink-0"
        >
          <Image src="/vector-lab-mark.svg" alt="Vector Lab" width={20} height={20} className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground hidden sm:inline">
            Vector Lab
          </span>
        </a>
        <div className="h-4 w-px bg-parchment" />
        {/* LLMbench identity */}
        <div className="flex items-center gap-2">
          <Image src="/llmbench-icon.svg" alt="" width={18} height={18} className="w-[18px] h-[18px]" />
          <h1 className="font-display text-body-sm font-bold text-foreground">
            LLMbench
          </h1>
        </div>
        <div className="h-4 w-px bg-parchment" />
        <span className="text-caption text-muted-foreground">
          {MODE_LABELS[activeTab]}
        </span>
        <div className="flex-1" />
        {/* Markdown / No Markdown segmented toggle */}
        <div className="flex items-center border border-border rounded-sm text-caption overflow-hidden">
          <button
            onClick={() => setNoMarkdown(false)}
            className={`px-2 py-1 transition-colors ${!noMarkdown ? "bg-burgundy text-cream" : "text-muted-foreground/60 hover:text-foreground"}`}
            title="Allow markdown: the model may use bold, italics, bullet points, headers, and code blocks in its response"
          >
            Markdown
          </button>
          <div className="w-px self-stretch bg-border" />
          <button
            onClick={() => setNoMarkdown(true)}
            className={`px-2 py-1 transition-colors ${noMarkdown ? "bg-burgundy text-cream" : "text-muted-foreground/60 hover:text-foreground"}`}
            title="No Markdown: appends a system instruction telling the model to respond in plain text only — no bold, italics, headers, bullet points, or code blocks"
          >
            No Markdown
          </button>
        </div>

        <button
          onClick={() => setShowTutorial(true)}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
          title="Guided analytical exercises"
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Exercises</span>
        </button>
        <button
          onClick={() => setShowHelp(true)}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
          title="How to use LLMbench"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Help</span>
        </button>
        <button
          onClick={() => setShowAbout(true)}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
          title="About LLMbench"
        >
          <Info className="w-3.5 h-3.5" />
          <span>About</span>
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
          title="Provider settings"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </header>

      {/* Tab navigation */}
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Mode content */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === "compare" && <CompareMode isDark={isDark} onToggleDark={toggleDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "stochastic" && <StochasticMode isDark={isDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "temperature" && <TemperatureMode isDark={isDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "sensitivity" && <SensitivityMode isDark={isDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "logprobs" && <LogprobsMode isDark={isDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "divergence" && <DivergenceMode isDark={isDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "grammar" && <GrammarMode isDark={isDark} pendingPrompt={pendingPrompt} />}
        {activeTab === "sampling" && <SamplingMode isDark={isDark} pendingPrompt={pendingPrompt} />}
      </div>

      {/* Status bar — sticky to the bottom of the viewport. As the
          document scrolls (header + TabNav scroll naturally up and out
          of view), this stays pinned. Matches Manifold Atlas's pattern. */}
      <footer className="sticky bottom-0 z-30 px-6 py-1.5 border-t border-border bg-card text-caption text-muted-foreground flex items-center justify-between">
        <span>LLMbench v{APP_VERSION}</span>
        <a
          href="https://vector-lab-tools.github.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity"
          title="Vector Lab — research instruments for critical vector theory"
        >
          <Image src="/vector-lab-mark.svg" alt="Vector Lab" width={14} height={14} className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Vector Lab</span>
        </a>
        <span>{MODE_LABELS[activeTab]}</span>
      </footer>

      {/* Settings modal */}
      <ProviderSettings isDark={isDark} onToggleDark={toggleDark} />

      {/* Tutorial / Exercises modal */}
      {showTutorial && (
        <TutorialCards
          onClose={() => setShowTutorial(false)}
          onLaunch={(mode, prompt) => {
            setPendingPrompt(prompt);
            setActiveTab(mode as TabId);
          }}
        />
      )}

      {/* Easter eggs */}
      <Clippy />
      {showRabbit && (
        <KillerRabbit
          onDismiss={handleDismissRabbit}
          onGrenadeReady={handleGrenadeReady}
          grenadeThrown={grenadeThrown}
        />
      )}
      {/* Holy Hand Grenade — fixed position in the header, clear of the title */}
      {showRabbit && grenadeReady && (
        <button
          onClick={handleThrowGrenade}
          className="fixed z-[9999] animate-bounce hover:scale-110 transition-transform drop-shadow-md"
          style={{ left: 320, top: 2 }}
          title="Throw the Holy Hand Grenade of Antioch! (First shalt thou take out the Holy Pin...)"
        >
          <span style={{ fontSize: "2rem", display: "inline-block", lineHeight: 1 }}>💣</span>
        </button>
      )}

      {/* Help modal: sidebar of panes, one section shown at a time */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowHelp(false)}>
          <div className="bg-popover rounded-sm shadow-lg w-full max-w-4xl border border-parchment h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-parchment/60 shrink-0">
              <h2 className="font-display text-display-md font-bold text-foreground">
                Help
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close help"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 min-h-0">
              <nav className="flex md:flex-col gap-1 p-3 md:w-52 shrink-0 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-parchment/60" aria-label="Help sections">
                {HELP_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setHelpTab(t.id)}
                    className={`text-left whitespace-nowrap px-3 py-1.5 rounded-sm text-body-sm transition-colors ${
                      helpTab === t.id
                        ? "bg-burgundy/10 text-burgundy font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>

              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 text-body-sm text-foreground">
                {helpTab === "start" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Getting started</h3>
                    <p className="text-muted-foreground">
                      Click <strong className="text-foreground">Settings</strong> to configure one or two LLM providers. You can use Google Gemini, OpenAI, Anthropic, OpenRouter, Hugging Face, Ollama (local, no key), or any OpenAI-compatible endpoint. Keys are stored in your browser only.
                    </p>
                    <p className="text-muted-foreground">
                      Each mode works with one or two models; use the <strong className="text-foreground">A / B / Both</strong> selector in the analysis modes to choose. If you send an empty prompt, a curated example is chosen automatically, or pick one from the <strong className="text-foreground">Try:</strong> chips below the input.
                    </p>
                    <div className="pl-3 border-l-2 border-parchment space-y-1.5 text-muted-foreground">
                      <p><strong className="text-foreground">Which models return token probabilities?</strong> The Probs view and the probability-based probes need a model that returns logprobs:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        <li>OpenAI (<code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">gpt-4o</code>, <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">gpt-4o-mini</code>)</li>
                        <li>Google Gemini <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">gemini-2.0-flash</code> (the 2.5 models do not)</li>
                        <li>OpenRouter on its <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">openai/*</code> routes</li>
                        <li>Hugging Face: Llama 3.3 70B (the default) or Gemma 4 31B</li>
                        <li>Any local Ollama model</li>
                      </ul>
                      <p>Anthropic returns none. Tick <strong className="text-foreground">Logprobs-compatible only</strong> in Settings to filter the model list.</p>
                    </div>
                    <p className="text-muted-foreground">
                      Hosted model line-ups change. If a model you saved is retired by its provider, LLMbench falls back to that provider&rsquo;s default when it loads. Every provider also has a <strong className="text-foreground">Custom Model</strong> option, so you can always type a model ID the list does not show.
                    </p>
                  </div>
                )}

                {helpTab === "ollama" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Ollama (local)</h3>
                    <p className="text-muted-foreground">
                      No API key: the model runs on your own machine and nothing leaves it. LLMbench calls Ollama directly from the browser, so it works from both a local dev build and the deployed app.
                    </p>
                    <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                      <li>Install from <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-burgundy hover:underline">ollama.com/download</a>.</li>
                      <li>Pull a model, for example <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">ollama pull llama3.2</code>.</li>
                      <li>Start the server (see below), then choose <strong className="text-foreground">Ollama (Local)</strong> in Settings.</li>
                    </ol>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">From the deployed app</strong> you must allow its origin in Ollama&rsquo;s <strong className="text-foreground">CORS</strong> list. CORS is the browser&rsquo;s gatekeeper for cross-origin requests: a page at <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">https://llm-bench-mu.vercel.app</code> cannot call <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">http://127.0.0.1:11434</code> unless Ollama names that origin. The Settings panel shows the command with your origin pre-filled and a copy button:
                    </p>
                    <code className="block text-[11px] bg-muted/60 px-2 py-1.5 rounded break-all">
                      OLLAMA_ORIGINS=&quot;https://llm-bench-mu.vercel.app,http://localhost:3000,http://127.0.0.1:3000&quot; ollama serve
                    </code>
                    <p className="text-muted-foreground">
                      For a local dev build (<code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">npm run dev</code>), a plain <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">ollama serve</code> is enough.
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Browser support.</strong> The browser-direct path works in Chrome, Firefox, Edge, Arc and Brave. <strong className="text-foreground">Safari blocks it</strong>: even with CORS open, it refuses HTTPS pages calling <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">http://localhost</code>. Safari is fine for the local dev build.
                    </p>
                    <p className="text-muted-foreground">
                      Ollama returns full logprobs, so the Probs view, Grammar Probe phases B and C, and the Sampling Probe all work against an Ollama slot.
                    </p>
                  </div>
                )}

                {helpTab === "compare" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Compare</h3>
                    <p className="text-muted-foreground">
                      The primary close-reading workspace. Enter a prompt in the bar at the bottom and press <strong className="text-foreground">Enter</strong>; responses appear side by side. The <strong className="text-foreground">clock icon</strong> in the prompt bar gives your last 10 prompts. After sending, the prompt bar collapses: click <strong className="text-foreground">Prompt</strong> in the bottom strip to expand it, or <strong className="text-foreground">New</strong> to start fresh.
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Annotations.</strong> Select any text in a panel to annotate it. Six types: Observation, Question, Metaphor, Pattern, Context, Critique, each colour-coded with a gutter marker.
                    </p>
                    <p className="text-muted-foreground"><strong className="text-foreground">Toolbar overlays</strong> (click once to turn on, again to turn off):</p>
                    <div className="space-y-1.5 text-muted-foreground pl-3 border-l-2 border-parchment">
                      <p><strong className="text-foreground">Diff</strong>: word-level highlighting of what each model said uniquely, with synchronised scrolling.</p>
                      <p><strong className="text-foreground">Struct</strong>: numbers each sentence in the margin and highlights discourse connectives (however, therefore, moreover) in burgundy, showing the argumentative skeleton.</p>
                      <p><strong className="text-foreground">Tone</strong>: Hyland&rsquo;s (2005) metadiscourse model across seven categories: <span className="text-blue-700">Hedges</span>, <span className="text-emerald-700">Boosters</span>, <span className="text-orange-700">Limiting</span>, <span className="text-purple-700">Attitude</span>, <span className="text-amber-700">Intensifiers</span>, <span className="text-rose-700">Self-mentions</span> and <span className="text-teal-700">Engagement markers</span>. Click a chip for its definition; hover a marked word for a note.</p>
                      <p><strong className="text-foreground">Probs</strong>: a token-probability heatmap over both panels. See the <button onClick={() => setHelpTab("probs")} className="text-burgundy hover:underline">Token probabilities</button> pane.</p>
                    </div>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Export.</strong> Structured JSON, formatted plain text, or a side-by-side landscape PDF with annotation badges. In the Probs view, Export opens a dedicated modal with PDF snapshot, PNG image and per-token JSON.
                    </p>
                  </div>
                )}

                {helpTab === "probs" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Token probabilities (Probs)</h3>
                    <p className="text-muted-foreground">
                      With <strong className="text-foreground">Auto-fetch logprobs</strong> on (the default), the per-token distributions arrive with the response itself, so toggling <strong className="text-foreground">Probs</strong> is a pure visual change with no extra API call. The dot on the button shows the cache state: green ready, amber fetching. Confident tokens stay uncoloured; below 70% the highlight runs from pale yellow through orange to deep red.
                    </p>
                    <div className="text-muted-foreground">
                      <p className="mb-1.5"><strong className="text-foreground">Colour reference</strong> (dark mode uses lower lightness across the same hues and thresholds):</p>
                      <div className="pl-3 border-l-2 border-parchment space-y-0.5 font-mono text-[11px]">
                        <div className="flex items-center gap-2"><span className="inline-block w-6 h-3.5 rounded-sm border border-parchment/60 bg-card" /><span className="w-16 text-foreground">≥ 70%</span><span className="text-muted-foreground/80">no highlight</span></div>
                        <div className="flex items-center gap-2"><span className="inline-block w-6 h-3.5 rounded-sm" style={{ background: "hsla(41, 90%, 80%, 0.37)" }} /><span className="w-16 text-foreground">50&ndash;70%</span><span className="text-muted-foreground/80">pale yellow</span></div>
                        <div className="flex items-center gap-2"><span className="inline-block w-6 h-3.5 rounded-sm" style={{ background: "hsla(27, 92%, 65%, 0.61)" }} /><span className="w-16 text-foreground">30&ndash;50%</span><span className="text-muted-foreground/80">warm orange</span></div>
                        <div className="flex items-center gap-2"><span className="inline-block w-6 h-3.5 rounded-sm" style={{ background: "hsla(16, 93%, 53%, 0.82)" }} /><span className="w-16 text-foreground">10&ndash;30%</span><span className="text-muted-foreground/80">deep orange-red</span></div>
                        <div className="flex items-center gap-2"><span className="inline-block w-6 h-3.5 rounded-sm" style={{ background: "hsla(8, 95%, 45%, 0.96)" }} /><span className="w-16 text-foreground">1&ndash;10%</span><span className="text-muted-foreground/80">saturated red</span></div>
                        <div className="flex items-center gap-2"><span className="inline-block w-6 h-3.5 rounded-sm" style={{ background: "hsla(5, 95%, 42%, 1.00)" }} /><span className="w-16 text-foreground">&lt; 1%</span><span className="text-muted-foreground/80">deepest red</span></div>
                      </div>
                    </div>
                    <p className="text-muted-foreground"><strong className="text-foreground">Navigation strip</strong> (below the toolbar when Probs is on):</p>
                    <div className="space-y-1 text-muted-foreground pl-3 border-l-2 border-parchment">
                      <p><strong className="text-foreground">← →</strong> step one token; <strong className="text-foreground">↑ ↓</strong> jump a row; <strong className="text-foreground">Home / End</strong> first and last token. The keyboard works too.</p>
                      <p><strong className="text-foreground">Uncertain</strong>: jumps to the highest-entropy positions.</p>
                      <p><strong className="text-foreground">Forks</strong>: positions where the chosen token had under 70% probability.</p>
                      <p><strong className="text-foreground">≠ Diverge</strong>: positions where Panel A and Panel B chose different tokens (needs logprobs on both).</p>
                      <p><strong className="text-foreground">Click a token</strong> to pin its distribution; <strong className="text-foreground">⌘/Ctrl+click</strong> pins a second for side-by-side comparison.</p>
                    </div>
                    <p className="text-muted-foreground"><strong className="text-foreground">Visualisation bands</strong> (right of the nav strip):</p>
                    <div className="space-y-1 text-muted-foreground pl-3 border-l-2 border-parchment">
                      <p><strong className="text-foreground">Graph</strong>: per-token entropy curve, A and B overlaid; click a point to jump.</p>
                      <p><strong className="text-foreground">Pixels</strong>: bird&rsquo;s-eye grid, one cell per token, five palettes; click a cell to jump.</p>
                      <p><strong className="text-foreground">Net</strong>: rotatable 3D probability skyline where peaks are uncertain tokens.</p>
                    </div>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Snapshot consistency.</strong> The model that generated the text is captured at submit time; Probs always fetches against that model, even if you change Settings afterwards. Re-submit to probe a different model.
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">When a model returns no logprobs</strong>, the empty state names the cause and suggests a working alternative, with a <strong className="text-foreground">Retry with current settings</strong> button so you can switch models without re-running the prompt.
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Units.</strong> Uncertainty shows as <strong className="text-foreground">perplexity</strong> (default; <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">2^entropy</code>, the effective number of equally likely candidates) or <strong className="text-foreground">entropy in bits</strong>, set from the Uncertainty dropdown in Settings. Exports always report bits.
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">The long tail.</strong> Providers return only the top-K candidates (LLMbench asks for 5). The unseen remainder is counted as one residual bucket, <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">1&nbsp;&minus;&nbsp;&Sigma;(visible)</code>, which makes the displayed perplexity a lower bound: the true full-vocabulary value is always at least what you see.
                    </p>
                    <p>
                      <button
                        onClick={() => setShowLogprobsExplainer(true)}
                        className="text-burgundy hover:underline font-medium"
                      >
                        Learn what logprobs are and how to interpret them &rarr;
                      </button>
                    </p>
                  </div>
                )}

                {helpTab === "analyse" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Analyse modes</h3>
                    <div className="space-y-2.5 text-muted-foreground">
                      <p><strong className="text-foreground">Stochastic Variation</strong>: sends the same prompt to the same model several times to measure how outputs differ across runs. Reports word-count variation, vocabulary diversity and pairwise word overlap.</p>
                      <p><strong className="text-foreground">Temperature Gradient</strong>: runs the prompt across a fixed sweep of temperatures (0.0 to 2.0) to show how sampling randomness changes determinism and variety.</p>
                      <p><strong className="text-foreground">Prompt Sensitivity</strong>: generates micro-variations of your prompt (adding &ldquo;please&rdquo;, rephrasing as a question, adding &ldquo;step by step&rdquo;) and ranks them by divergence from the base output.</p>
                      <p><strong className="text-foreground">Token Probabilities</strong>: single-response logprob analysis with a heatmap (click to pin, ⌘/Ctrl+click to compare two tokens), an entropy histogram (click a bin to list its tokens), sentences coloured by mean entropy, and an Uncertainty Deep Dive. Needs a logprobs-capable model.</p>
                      <p><strong className="text-foreground">Cross-Model Divergence</strong>: Jaccard similarity, vocabulary overlap, sentence-level structure and top word frequencies side by side.</p>
                    </div>
                  </div>
                )}

                {helpTab === "grammar" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Investigate: Grammar Probe</h3>
                    <p className="text-muted-foreground">
                      Investigates rhetorical constructions the model reaches for: five antithesis variants (<em>Not X but Y</em>, <em>Not just X but Y</em>, <em>It&rsquo;s not X, it&rsquo;s Y</em>, <em>While X, Y</em>, <em>What matters is not X but Y</em>), plus hedging triplets, tricolon and modal stacking. Five phases:
                    </p>
                    <div className="space-y-2 text-muted-foreground pl-3 border-l-2 border-parchment">
                      <p><strong className="text-foreground">A. Prevalence.</strong> Batch-runs a prompt suite across temperatures and up to two models, counts hits, and renders a prompt &times; model &times; temperature heatmap with a verdict banner. The Deep Dive adds hit-rate charts, a hits-per-run histogram, a register heatmap, suite stratification and a co-occurrence matrix, each exportable as CSV.</p>
                      <p><strong className="text-foreground">B. Continuation logprobs.</strong> Takes the pattern&rsquo;s canonical scaffolds (e.g. &ldquo;Democracy is not just a system of government, but a&rdquo;) and fetches the next-token distribution, highlighting the tokens the construction leans on, with three concentration metrics per scaffold: <strong className="text-foreground">top-1 p</strong>, <strong className="text-foreground">entropy H</strong> and <strong className="text-foreground">clich&eacute; share</strong>. High top-1, low entropy and a high clich&eacute; share mean the model is parked in the construction&rsquo;s groove.</p>
                      <p><strong className="text-foreground">C. Forced continuation.</strong> For each scaffold probed in B, expands the top candidate Y tokens into short Y-phrases and tabulates scaffold &times; Y-token &times; Y-phrase.</p>
                      <p><strong className="text-foreground">D. Perturbation.</strong> Runs each prompt under three framings (neutral, told not to use the construction, told it may) and reports hit-rate deltas with a verdict: <em>structural</em>, <em>stylistic</em> or <em>invitable</em>.</p>
                      <p><strong className="text-foreground">E. Temperature sweep.</strong> Plots prevalence against <span className="font-mono">T &isin; {`{0, 0.3, 0.7, 1.0, 1.5}`}</span> per model. The <strong className="text-foreground">greediness index</strong>, <span className="font-mono">hitRate(T=0) &minus; mean hitRate(T&gt;0)</span>, reads positive when the construction is a reflex of the most likely path and negative when it emerges from sampling.</p>
                    </div>
                    <p className="text-muted-foreground">
                      Ships with a pattern library and a <strong className="text-foreground">thematic suite library</strong> on two axes you can combine: purpose suites (<strong className="text-foreground">baseline</strong>, <strong className="text-foreground">invitation</strong>, <strong className="text-foreground">resistance</strong>, <strong className="text-foreground">adversarial</strong>) and domain suites (politics, technology, science, ethics, pedagogy, everyday). <strong className="text-foreground">Export run data</strong> writes every phase&rsquo;s observations to a portable JSON file. Add patterns or suites in <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">src/lib/grammar/</code>.
                    </p>
                    <p className="text-muted-foreground">
                      Phases B and C need a logprobs-capable model.
                    </p>
                  </div>
                )}

                {helpTab === "sampling" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Investigate: Sampling Probe</h3>
                    <p className="text-muted-foreground">
                      Autoregressive generation as data: one request per sampled token, with each step&rsquo;s full top-K distribution kept client-side so every control responds instantly. Needs a logprobs-capable model.
                    </p>
                    <div className="space-y-1.5 text-muted-foreground pl-3 border-l-2 border-parchment">
                      <p><strong className="text-foreground">Per-step top-K.</strong> A bar chart of the real next-token distribution, re-softmaxed under your current <strong className="text-foreground">T</strong> and <strong className="text-foreground">top-p</strong> without a new request. The chosen token is highlighted in burgundy.</p>
                      <p><strong className="text-foreground">Generation strip.</strong> The sequence inline, each token shaded by surprisal (&minus;log&#8322;p): green expected, burgundy rare. Click a token to rewind the inspector.</p>
                      <p><strong className="text-foreground">Trajectory.</strong> Per-step entropy and chosen-token surprisal; click a bar to jump to that step.</p>
                      <p><strong className="text-foreground">Counterfactual branches.</strong> Click any non-chosen candidate to fork a new branch from that step; forking reuses the cached distribution and costs nothing until you advance.</p>
                      <p><strong className="text-foreground">Dual-panel A/B.</strong> Both slots predict against the same prefix, with Jaccard(A, B) and KL(A&#8214;B) per step.</p>
                      <p><strong className="text-foreground">Export.</strong> <strong className="text-foreground">Bundle</strong> writes the full trace as <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">vector-lab.sampling-trace.v1</code> JSON; a trajectory CSV per branch.</p>
                    </div>
                  </div>
                )}

                {helpTab === "tips" && (
                  <div className="space-y-3">
                    <h3 className="font-display text-display-sm font-semibold">Tips</h3>
                    <ul className="text-muted-foreground space-y-1.5 list-disc pl-4">
                      <li>Hover any <strong className="text-foreground">?</strong> badge on a metric for what it measures.</li>
                      <li>Every result has a collapsible <strong className="text-foreground">Deep Dive</strong> with per-run tables, entropy hotspots, vocabulary partitions and CSV export.</li>
                      <li>In the entropy histogram, click any confidence band to list the tokens in it.</li>
                      <li><strong className="text-foreground">No Markdown</strong> asks the model for plain text, which is cleaner for diffs and probability analysis.</li>
                      <li>Comparisons save to browser storage; reload them via <strong className="text-foreground">History</strong>.</li>
                      <li>Type <strong className="text-foreground">rabbit</strong> on the keyboard for a surprise.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-parchment/60 flex items-center gap-2 shrink-0">
              <a
                href="https://vector-lab-tools.github.io/LLMbench/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption text-muted-foreground hover:text-foreground transition-colors"
              >
                Full guide and FAQ
              </a>
              <span className="text-muted-foreground/40 text-caption">·</span>
              <a
                href="https://vector-lab-tools.github.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors"
              >
                <Image src="/vector-lab-mark.svg" alt="" width={14} height={14} className="w-3.5 h-3.5 shrink-0" />
                Part of the Vector Lab
              </a>
              <span className="text-muted-foreground/40 text-caption">·</span>
              <a
                href="https://github.com/vector-lab-tools/LLMbench"
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Logprobs explainer subwindow */}
      {showLogprobsExplainer && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={() => setShowLogprobsExplainer(false)}
        >
          <div
            className="bg-popover rounded-sm shadow-xl p-6 w-full max-w-2xl border border-parchment max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-md font-bold text-foreground">
                Understanding Log Probabilities
              </h2>
              <button
                onClick={() => setShowLogprobsExplainer(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-body-sm text-foreground leading-relaxed">
              <section>
                <h3 className="font-semibold text-foreground mb-1.5">
                  Log probabilities (logprobs) &mdash; what they are
                </h3>
                <p className="text-muted-foreground mb-2">
                  When a language model generates text, it doesn&rsquo;t just pick words. At every position it produces a{" "}
                  <strong className="text-foreground">probability distribution over its entire vocabulary</strong>{" "}
                  &mdash; typically 50,000 to 200,000 candidate tokens, each with a score representing how likely the
                  model thinks that token is the right next one.
                </p>
                <p className="text-muted-foreground mb-2">
                  Those raw probabilities are tiny numbers (0.0466, 0.1605, 0.0001&hellip;), so the model stores and
                  returns them as <strong className="text-foreground">logarithms</strong>:{" "}
                  <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">logprob = ln(probability)</code>. Hence
                  &ldquo;logprobs.&rdquo; Logs are easier to work with numerically (you add them instead of multiplying
                  them, they don&rsquo;t underflow to zero), and most APIs &mdash; OpenAI, Gemini &mdash; expose them
                  directly.
                </p>
                <p className="text-muted-foreground">
                  To convert back for display:{" "}
                  <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">probability = exp(logprob)</code>.
                  That&rsquo;s the 4.66%, 16.05% etc. you see in the panel.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-1.5">
                  Two units for one measurement: perplexity and entropy
                </h3>
                <p className="text-muted-foreground mb-2">
                  LLMbench summarises each position&rsquo;s uncertainty with a single number, displayed in your choice
                  of unit (the <strong className="text-foreground">Uncertainty</strong> dropdown in Settings). Both
                  units describe the same underlying quantity &mdash; how spread out the probability distribution was
                  &mdash; from two angles:
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Perplexity</strong> (the default) is the{" "}
                  <em>effective number of equally-likely candidates</em> the model was choosing between. Perplexity 1
                  means certainty (one option); 2 means a coin-flip between two; 10 means the choice behaved like a
                  ten-way tie. It is computed as{" "}
                  <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">2^entropy</code> and is the standard
                  reporting unit in NLP because &ldquo;the model was choosing between ~4 plausible tokens&rdquo; is
                  immediately readable.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Entropy</strong> is Shannon entropy in bits (
                  <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">H = &minus;&Sigma; p&middot;log&#8322;(p)</code>
                  , Shannon 1948) &mdash; the canonical information-theoretic measure. Zero bits means certainty; each
                  additional bit doubles the effective number of options (1 bit &asymp; 2 candidates, 2 bits &asymp; 4,
                  3 bits &asymp; 8). Bits are additive across positions, which makes them the right unit for comparing
                  or summing uncertainty over a whole sequence &mdash; and the unit CSV/PDF exports always use.
                </p>
                <p className="text-muted-foreground">
                  The two are interchangeable (<code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">perplexity = 2^bits</code>);
                  switching the dropdown re-labels every display without changing any underlying data. One caveat at
                  the certain end: 0.006 bits reads clearly as &ldquo;almost zero uncertainty,&rdquo; while its
                  perplexity equivalent (1.004) can look like noise &mdash; hovering the read-out always shows the
                  equivalent in the other unit.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-1.5">How the inspector panel works</h3>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Position 32 / 239.</strong> You&rsquo;re inspecting the 32nd token
                  out of 239 the model generated. Each token is roughly a word or word fragment.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Perplexity: &asymp; 3.64</strong> (equivalently{" "}
                  <strong className="text-foreground">1.862 bits</strong> of entropy, if your Settings unit is set to
                  bits). The model&rsquo;s choice at this position behaved like a roughly{" "}
                  <em>3.6-way tie</em> &mdash; moderate uncertainty, several tokens were live contenders. Zero
                  uncertainty would read as perplexity 1 (0 bits); a genuine many-way fork reads as perplexity 8+
                  (3+ bits). The heatmap colour of the token is driven by the chosen token&rsquo;s probability (the
                  continuous yellow&rarr;red gradient), while this read-out summarises the <em>whole</em> distribution.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Chosen: 4.66%.</strong> The token actually emitted
                  (&ldquo;&nbsp;processes&rdquo;) had only a 4.66% probability. Notice that the chosen token is{" "}
                  <em>not</em> the most likely one &mdash; &ldquo;&nbsp;similarity&rdquo; at 16.05% was. This is because
                  the model is sampling with temperature &gt; 0, which draws from the full distribution rather than
                  always taking the argmax. That&rsquo;s why you get different outputs on reruns of the same prompt.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Probability distribution (top-k).</strong> The API returns the
                  top few alternatives at each position. A typical top-four plus &ldquo;other&rdquo; readout might look
                  like:
                </p>
                <div className="bg-muted/40 rounded-sm p-3 mb-2 text-[12px]">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-parchment/50">
                        <th className="pb-1 font-medium">Rank</th>
                        <th className="pb-1 font-medium">Token</th>
                        <th className="pb-1 font-medium text-right">Probability</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground">
                      <tr>
                        <td className="py-0.5">1</td>
                        <td className="py-0.5">
                          <code>&ldquo; processes&rdquo;</code> &larr; chosen
                        </td>
                        <td className="py-0.5 text-right">4.66%</td>
                      </tr>
                      <tr>
                        <td className="py-0.5">2</td>
                        <td className="py-0.5">
                          <code>&ldquo; similarity&rdquo;</code>
                        </td>
                        <td className="py-0.5 text-right">16.05%</td>
                      </tr>
                      <tr>
                        <td className="py-0.5">3</td>
                        <td className="py-0.5">
                          <code>&ldquo; compositio&hellip;&rdquo;</code>
                        </td>
                        <td className="py-0.5 text-right">9.70%</td>
                      </tr>
                      <tr>
                        <td className="py-0.5">4</td>
                        <td className="py-0.5">
                          <code>&ldquo; plaus&rdquo;</code>
                        </td>
                        <td className="py-0.5 text-right">7.47%</td>
                      </tr>
                      <tr className="text-muted-foreground italic">
                        <td className="py-0.5">&mdash;</td>
                        <td className="py-0.5">other (all remaining vocabulary)</td>
                        <td className="py-0.5 text-right">62.1%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-foreground mb-2">
                  The fact that &ldquo;other&rdquo; is 62% tells you the distribution has a long tail: no single
                  alternative dominated, but the probability was thinly spread across thousands of remaining tokens.
                  That&rsquo;s consistent with the perplexity &asymp; 3.64 (1.86-bit) reading.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Divergence annotation.</strong> This is LLMbench&rsquo;s own
                  overlay, not something the API provides. Because you&rsquo;re comparing two panels, the tool has
                  aligned the two token streams and noticed that at a given position the other panel emitted a
                  different token. From that branch point the two outputs will tend to diverge further and further,
                  because each new token conditions on everything before it.
                </p>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Uncertainty annotation.</strong> Again LLMbench&rsquo;s
                  interpretation of the uncertainty number (whichever unit you display it in). The threshold logic is:
                  low perplexity/entropy = confident, moderate = plausible alternatives existed, high = a genuine fork
                  where temperature/sampling is doing real work.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-foreground mb-1.5">Why this matters interpretively</h3>
                <p className="text-muted-foreground mb-2">
                  What you&rsquo;re really looking at is the model&rsquo;s{" "}
                  <strong className="text-foreground">counterfactual history</strong>: every token is a road taken, and
                  the distribution shows the roads not taken. A high-entropy position is a moment where the text could
                  plausibly have gone several ways; a low-entropy position (e.g. &ldquo;&nbsp;the&rdquo; after
                  &ldquo;&nbsp;in&rdquo;) is one where the model was effectively constrained. Reading a generation
                  through its logprobs is the closest we get to seeing where the prose is load-bearing (the model was
                  committed) versus where it is contingent (the model was rolling dice within a cloud of
                  near-equivalents).
                </p>
                <p className="text-muted-foreground">
                  This is also why comparing two panels at divergence points is interesting: it shows you that two
                  different tokens were both live options in both models&rsquo; distributions, and sampling happened to
                  pull them in different directions. An apparent semantic difference between, say, &ldquo;biological
                  human&rdquo; and &ldquo;biological processes&rdquo; isn&rsquo;t always a difference of{" "}
                  <em>belief</em> &mdash; sometimes it is simply a difference of <em>draw</em>.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* About modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAbout(false)}>
          <div className="bg-popover rounded-sm shadow-lg p-6 w-full max-w-md border border-parchment" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-md font-bold text-foreground">
                About LLMbench
              </h2>
              <button
                onClick={() => setShowAbout(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-body-sm">
              <p className="text-foreground">
                A research tool for the comparative close reading of Large Language Model outputs,
                enabling researchers to subject AI-generated text to hermeneutic scrutiny.
              </p>

              <div className="bg-muted/50 rounded-sm p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono text-foreground">v{APP_VERSION}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Author</span>
                  <span className="text-foreground">David M. Berry</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Institution</span>
                  <span className="text-foreground">University of Sussex</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Year</span>
                  <span className="text-foreground">2026</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Licence</span>
                  <span className="text-foreground">MIT</span>
                </div>
              </div>

              <div className="pt-2 border-t border-parchment/50 flex items-center gap-3">
                <Image src="/llmbench-icon.svg" alt="" width={32} height={32} className="w-8 h-8 shrink-0" />
                <div>
                  <a
                    href="https://vector-lab-tools.github.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Image src="/vector-lab-mark.svg" alt="" width={14} height={14} className="w-3.5 h-3.5" />
                    Part of the Vector Lab
                  </a>
                  <a
                    href="https://github.com/vector-lab-tools/LLMbench"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-caption text-burgundy hover:underline"
                  >
                    github.com/vector-lab-tools/LLMbench
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
