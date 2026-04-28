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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("compare");
  const [isDark, setIsDark] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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
    <div className="flex flex-col h-screen bg-background">
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

      {/* Status bar */}
      <footer className="px-6 py-1.5 border-t border-border bg-card text-caption text-muted-foreground flex items-center justify-between">
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

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowHelp(false)}>
          <div className="bg-popover rounded-sm shadow-lg p-6 w-full max-w-2xl border border-parchment max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-md font-bold text-foreground">
                Help
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-body-sm text-foreground">
              <div>
                <h3 className="font-semibold mb-1">Getting Started</h3>
                <p className="text-muted-foreground">
                  Click <strong>Settings</strong> to configure one or two LLM providers with API keys.
                  You can use Google Gemini, OpenAI, Anthropic, OpenRouter, Hugging Face, Ollama, or any OpenAI-compatible provider.
                  Each mode works with one or two models; use the <strong>A / B / Both</strong> selector
                  in analysis modes to choose. If you send an empty prompt, a curated example is chosen automatically &mdash;
                  or pick one from the <strong>Try:</strong> chips below the input.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Compare</h3>
                <p className="text-muted-foreground mb-2">
                  The primary close-reading workspace. Enter a prompt in the bar at the bottom, press <strong>Enter</strong> or the send button, and responses appear side by side. A <strong>clock icon</strong> in the prompt bar gives access to your last 10 prompts. After sending, the prompt bar collapses &mdash; click <strong>Prompt</strong> in the bottom strip to expand it again, or press <strong>New</strong> to clear everything and start fresh.
                </p>
                <p className="text-muted-foreground mb-1.5">
                  <strong className="text-foreground">Annotations.</strong> Select any text in a panel to annotate it. Six types are available: Observation, Question, Metaphor, Pattern, Context, Critique &mdash; each colour-coded with a gutter marker.
                </p>
                <p className="text-muted-foreground mb-1.5">
                  <strong className="text-foreground">Toolbar overlays</strong> &mdash; click once to activate, click again to turn off:
                </p>
                <div className="space-y-1.5 text-muted-foreground pl-3 border-l-2 border-parchment mb-2">
                  <p><strong className="text-foreground">Diff</strong> &mdash; Word-level highlighting of what each model said uniquely. Words present in one panel but not the other are highlighted; synchronised scrolling keeps both panels aligned.</p>
                  <p><strong className="text-foreground">Struct</strong> &mdash; Numbers each sentence in the margin and highlights discourse connectives (however, therefore, moreover&hellip;) in burgundy. Reveals the argumentative skeleton of each response.</p>
                  <p><strong className="text-foreground">Tone</strong> &mdash; Applies Hyland&rsquo;s (2005) metadiscourse model across seven register categories: <span className="text-blue-700">Hedges</span> (might, perhaps), <span className="text-emerald-700">Boosters</span> (clearly, must), <span className="text-orange-700">Limiting</span> (not, never), <span className="text-purple-700">Attitude</span> (important, surprising), <span className="text-amber-700">Intensifiers</span> (very, extremely), <span className="text-rose-700">Self-mentions</span> (I, we), and <span className="text-teal-700">Engagement markers</span> (you, consider, note). Click any chip to read its Hyland definition. Hover any marked word for a linguistic note and surrounding context.</p>
                  <p><strong className="text-foreground">Probs</strong> &mdash; Overlays a token probability heatmap on both panels. With <strong>Auto-fetch logprobs</strong> on (default in Settings), the data is fetched alongside the main generation, so toggling Probs is a pure visual op &mdash; no extra API call. A small dot on the button indicates the cache state (green = ready, amber pulse = fetching). See <em>Using Probs</em> below. Requires Google Gemini (2.0), OpenAI, OpenRouter (GPT-4o/Mini), or Hugging Face.</p>
                </div>
                <p className="text-muted-foreground mb-1">
                  <strong className="text-foreground">Export.</strong> Save as structured JSON, formatted plain text, or a side-by-side landscape PDF with annotation badges. In Probs view, Export opens a dedicated modal with PDF snapshot, PNG image, and per-token JSON.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Using Probs (token probabilities in Compare)</h3>
                <p className="text-muted-foreground mb-2">
                  Token probabilities are a <strong className="text-foreground">first-class data layer</strong> in LLMbench. With <strong>Auto-fetch logprobs</strong> on (default), the data rides alongside every submit when both slots are logprobs-capable: a single API round-trip returns both the response and its per-token distributions. Click <strong>Probs</strong> to render the heatmap &mdash; tokens the model was very confident about are uncoloured; uncertainty glides from pale yellow through orange to deep red, with a 70% threshold below which highlighting begins. The button&rsquo;s status dot tells you whether the data is cached and ready.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Slot-snapshot consistency.</strong> The model used to generate the displayed text is captured at submit time. If you change models in Settings before pressing Probs, the probability distribution is fetched against the <em>original</em> model &mdash; not the new one. Compare and Probs always show data from the same model snapshot. To probe with a different model, re-submit; the snapshot updates.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">When a model can&rsquo;t return logprobs.</strong> Some models accept the logprobs flag but return no token-level data (Gemini 2.5 Pro/Flash, gpt-3.5-turbo, certain HF-routed chat models). The empty state names the cause and recommends a working alternative &mdash; <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">gemini-2.0-flash</code>, <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">gpt-4o</code> / <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">gpt-4o-mini</code>, or an OpenRouter <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">openai/*</code> route. A <strong>Retry with current settings</strong> button appears in the error block so you can re-fetch after switching models without re-running the whole prompt.
                </p>
                <p className="text-muted-foreground mb-1.5"><strong className="text-foreground">Navigation strip</strong> (below the toolbar when Probs is on):</p>
                <div className="space-y-1 text-muted-foreground pl-3 border-l-2 border-parchment mb-2">
                  <p><strong className="text-foreground">← →</strong> step one token at a time; <strong>↑ ↓</strong> jump a visual row; <strong>Home / End</strong> jump to first/last token. Arrow keys work from the keyboard too.</p>
                  <p><strong className="text-foreground">Uncertain</strong> chip &mdash; jumps to the highest-entropy positions (where the model was most spread across alternatives). Click again to deselect.</p>
                  <p><strong className="text-foreground">Forks</strong> chip &mdash; jumps to positions where the chosen token had less than 70% probability. Click again to deselect.</p>
                  <p><strong className="text-foreground">≠ Diverge</strong> chip &mdash; jumps to positions where Panel A and Panel B chose different tokens (requires both panels to have logprob data). Click again to deselect.</p>
                  <p><strong className="text-foreground">Click a token</strong> to pin its probability distribution in a side panel. <strong>⌘/Ctrl+click</strong> to pin a second token and compare two positions side by side.</p>
                </div>
                <p className="text-muted-foreground mb-1.5"><strong className="text-foreground">Visualisation bands</strong> (toggle from the right of the nav strip):</p>
                <div className="space-y-1 text-muted-foreground pl-3 border-l-2 border-parchment mb-2">
                  <p><strong className="text-foreground">📈 Graph</strong> &mdash; Entropy curve: an SVG sparkline of per-token entropy across the whole sequence, with A and B overlaid. Click any point to jump to that token.</p>
                  <p><strong className="text-foreground">🟨 Pixels</strong> &mdash; Token pixel map: a bird&rsquo;s-eye grid where each cell is one token, coloured by probability. Five palettes (Heat, Viridis, Magma, Ice, Mono). Click any cell to jump the cursor. Both panels use the same cell size so counts are directly comparable.</p>
                  <p><strong className="text-foreground">🕸️ Net</strong> &mdash; 3D probability skyline: a rotatable WebGL mesh where peaks are uncertain tokens. Drag to rotate. Click any point to jump the cursor.</p>
                </div>
                <p className="text-muted-foreground">
                  <button
                    onClick={() => setShowLogprobsExplainer(true)}
                    className="text-burgundy hover:underline font-medium"
                  >
                    Learn what logprobs actually are and how to interpret them &rarr;
                  </button>
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Analyse Modes</h3>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Stochastic Variation</strong> &mdash; Sends the same prompt multiple times to the same model to measure how outputs differ across runs. Reports word count variation, vocabulary diversity, and pairwise word overlap.
                  </p>
                  <p>
                    <strong className="text-foreground">Temperature Gradient</strong> &mdash; Runs the prompt across a fixed sweep of temperatures (0.0&ndash;2.0) to show how sampling randomness affects output determinism and creativity.
                  </p>
                  <p>
                    <strong className="text-foreground">Prompt Sensitivity</strong> &mdash; Auto-generates micro-variations of your prompt (adding &ldquo;please&rdquo;, rephrasing as a question, adding &ldquo;step by step&rdquo;, etc.) and ranks them by divergence from the base output.
                  </p>
                  <p>
                    <strong className="text-foreground">Token Probabilities</strong> &mdash; A dedicated single-response logprob analysis mode. Components: TokenHeatmap (click to pin, ⌘/Ctrl+click for two-token comparison), EntropyHistogram (click any bin to list tokens in it), SentenceEntropyView (sentences colour-coded by mean entropy), and a full Uncertainty Deep Dive with hotspots and top alternatives. Requires Google Gemini (2.0), OpenAI, or OpenRouter (GPT-4o/Mini).
                  </p>
                  <p>
                    <strong className="text-foreground">Cross-Model Divergence</strong> &mdash; Quantitative comparison with Jaccard similarity, vocabulary overlap, sentence-level structural analysis, and top word frequency bars side by side.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Investigate: Grammar Probe</h3>
                <p className="text-muted-foreground mb-2">
                  A pattern-specific investigation of rhetorical constructions the model reaches for &mdash; five antithesis variants (<em>Not X but Y</em>, <em>Not just X but Y</em>, <em>It&rsquo;s not X, it&rsquo;s Y</em>, <em>While X, Y</em>, <em>What matters is not X but Y</em>), plus hedging triplets, tricolon, and modal stacking. Phases A, B, and E ship; C and D planned:
                </p>
                <div className="space-y-1.5 text-muted-foreground pl-3 border-l-2 border-parchment mb-2">
                  <p>
                    <strong className="text-foreground">A. Prevalence.</strong> Batch-runs a 20-prompt suite across two temperatures and up to two models, regex-counts hits, and renders a prompt &times; model &times; temperature heatmap with per-register, per-model, per-temperature breakdowns and a low / moderate / high verdict banner. The <strong>Deep Dive</strong> opens six research panels computed across every selected construction: a per-construction hit-rate bar chart (model &times; temperature), a hits-per-run histogram, a register heatmap, a suite stratification table, an antithesis-style co-occurrence matrix, and Phase E temperature small multiples with an elasticity readout &mdash; every panel exports CSV.
                  </p>
                  <p>
                    <strong className="text-foreground">B. Continuation logprobs.</strong> Picks the pattern&rsquo;s canonical scaffolds (e.g. &ldquo;Democracy is not just a system of government, but a &rdquo;) and fetches the top-K next-token distribution at position 0. Tokens the construction typically leans on (<em>not</em>, <em>just</em>, <em>merely</em>&hellip;) are highlighted in burgundy; Shannon entropy (bits) appears per card. Requires Gemini 2.0, OpenAI, OpenRouter, or Hugging Face.
                  </p>
                  <p>
                    <strong className="text-foreground">B. Scaffold concentration.</strong> For each scaffold, three embedding-free concentration metrics computed from the top-K distribution: <strong>top-1 p</strong> (mass on the single most-likely token), <strong>H</strong> (Shannon entropy in bits over the returned top-K), and <strong>cliché share</strong> (summed probability of the pattern&rsquo;s expected slot fillers like <em>rather</em>, <em>merely</em>, <em>instead</em>). High top-1 + low entropy + high cliché share = the model is parked in the construction&rsquo;s groove. Paired with an <strong>Export Grammar data bundle</strong> action that writes all Phase A / B / E data as <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">*.grammar.json</code> for Manifold Atlas or downstream notebooks (Atlas can compute geometry against its own embedder).
                  </p>
                  <p>
                    <strong className="text-foreground">E. Temperature sweep.</strong> Runs the selected suite across <span className="font-mono">T &isin; {`{0, 0.3, 0.7, 1.0, 1.5}`}</span> and plots prevalence against T, one line per model. The headline is the <strong className="text-foreground">greediness index</strong> &mdash; <span className="font-mono">hitRate(T=0) &minus; mean hitRate(T&gt;0)</span>. Positive means the construction is a reflex of the argmax; near-zero means register-driven, not greedy; negative means the pattern emerges out of the sampler.
                  </p>
                </div>
                <p className="text-muted-foreground mb-2">
                  Ships with a four-preset pattern library (Not X but Y, Hyland hedges, tricolon, modal stacking) and a <strong className="text-foreground">thematic suite library</strong> with two axes you can combine: four <em>purpose</em> suites &mdash; <strong className="text-foreground">baseline</strong> (unprimed), <strong className="text-foreground">invitation</strong> (ceiling), <strong className="text-foreground">resistance</strong> (floor), <strong className="text-foreground">adversarial</strong> (lexical-cue stress test) &mdash; and six <em>domain</em> suites (politics, technology, science, ethics, pedagogy, everyday). Tick any combination; the heatmap stratifies by suite and the verdict tile reports per-suite hit rates. Add patterns or suites by editing <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">src/lib/grammar/</code>.
                </p>
                <p className="text-muted-foreground mb-1">
                  <strong className="text-foreground">C. Forced continuation</strong> (new in v2.15.9). For each scaffold already probed in Phase B, takes the top-N highest-logprob candidate Y tokens and asks the model to expand each into a short Y-phrase. Renders a scaffold &times; Y-token &times; Y-phrase table with the extracted X shown per scaffold. The full Y-harvest is written to the Grammar data bundle as <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">forcedExpansions</code>; Manifold Atlas imports the bundle directly.
                </p>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">D. Perturbation</strong> (new in v2.15.10). Each selected prompt is run under three framings &mdash; neutral, anti-pattern (&ldquo;do not use the <em>Not X but Y</em> construction&rdquo;), pro-pattern (&ldquo;you may use it&rdquo;) &mdash; and hit rate is reported per construction per framing with deltas. A <strong className="text-foreground">verdict</strong> column summarises the reading: <em>structural</em> if |&Delta;anti| &lt; 10pp at non-trivial baseline, <em>stylistic</em> if &Delta;anti &lt; &minus;30pp, <em>invitable</em> if &Delta;pro &gt; 30pp.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Investigate: Sampling Probe</h3>
                <p className="text-muted-foreground mb-2">
                  Autoregressive generation as data. One HTTP call per sampled token; each step&rsquo;s full top-K distribution is stored client-side so every knob is instant. Requires a logprobs-capable slot (Gemini 2.0, OpenAI, OpenRouter, or Hugging Face).
                </p>
                <div className="space-y-1.5 text-muted-foreground pl-3 border-l-2 border-parchment mb-2">
                  <p>
                    <strong className="text-foreground">Per-step top-K.</strong> Bar chart of the real next-token distribution, re-softmaxed client-side under your current <strong className="text-foreground">T</strong> and <strong className="text-foreground">top-p</strong> so the chart updates without a new API call. Rows show rank, token, softmax probability, raw logprob. Chosen token highlighted in burgundy.
                  </p>
                  <p>
                    <strong className="text-foreground">Generation strip.</strong> The sequence rendered inline, each token shaded by <strong className="text-foreground">surprisal</strong> (&minus;log&#8322;p): green = expected, burgundy = rare. Click a token to rewind the inspector.
                  </p>
                  <p>
                    <strong className="text-foreground">Trajectory.</strong> Per-step entropy H (line, bits) and chosen-token surprisal (bars). Click any bar to jump to that step. Branch summary shows total surprisal and perplexity.
                  </p>
                  <p>
                    <strong className="text-foreground">Counterfactual branches.</strong> Click any non-chosen top-K token to fork a new branch from that step. Raw logprobs are cached, so forking reuses the existing distribution and consumes no new API call until you advance.
                  </p>
                  <p>
                    <strong className="text-foreground">Dual-panel A/B.</strong> Both slots predict the next token against the same prefix; <strong className="text-foreground">Jaccard(A, B)</strong> and <strong className="text-foreground">KL(A&#8214;B)</strong> reported per step; the Deep Dive flags steps where the two models chose different tokens.
                  </p>
                  <p>
                    <strong className="text-foreground">Export.</strong> <strong className="text-foreground">Bundle</strong> writes the full trace as <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">vector-lab.sampling-trace.v1</code> JSON (prompt, params, every branch&rsquo;s every step with raw top-K). Trajectory CSV per branch.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Tips</h3>
                <ul className="text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Hover any <strong>?</strong> badge on a metric for an explanation of what it measures.</li>
                  <li>Every result has a collapsible <strong>Deep Dive</strong> with per-run tables, entropy hotspots, vocabulary partitions, and CSV export.</li>
                  <li>In the entropy histogram, click any confidence band to list exactly which tokens fell there.</li>
                  <li>The <strong>No Markdown</strong> toggle injects a system instruction telling the model to return plain text &mdash; cleaner for diffs and probability analysis.</li>
                  <li>Comparisons save automatically to browser storage; reload them via the <strong>History</strong> button.</li>
                  <li>Type <strong>rabbit</strong> on the keyboard for a surprise.</li>
                </ul>
              </div>

              <div className="pt-3 border-t border-parchment/50 flex items-center gap-2">
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
                  github.com/vector-lab-tools/LLMbench
                </a>
              </div>
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
                <h3 className="font-semibold text-foreground mb-1.5">How the inspector panel works</h3>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Position 32 / 239.</strong> You&rsquo;re inspecting the 32nd token
                  out of 239 the model generated. Each token is roughly a word or word fragment.
                </p>
                <p className="text-muted-foreground mb-2">
                  <strong className="text-foreground">Entropy: 1.862 bits.</strong> This is Shannon entropy computed
                  across the top-k candidate distribution:{" "}
                  <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">H = -Σ p·log₂(p)</code>. It measures how{" "}
                  <em>spread out</em> the distribution is. Zero bits means the model was certain; high bits mean it was
                  hedging between many options. 1.86 bits is moderate uncertainty &mdash; several tokens were live
                  contenders. The colour of the token in the heatmap is driven by this (the continuous yellow&rarr;red
                  gradient).
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
                  That&rsquo;s consistent with the 1.86-bit entropy reading.
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
                  interpretation of the entropy number. The threshold logic is: low entropy = confident, moderate =
                  plausible alternatives existed, high = a genuine fork where temperature/sampling is doing real work.
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
