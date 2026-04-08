"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SplitSquareHorizontal, Settings, HelpCircle, Info, X } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { TabNav, type TabId } from "@/components/layout/TabNav";
import ProviderSettings from "@/components/settings/ProviderSettings";
import CompareMode from "@/components/operations/CompareMode";
import StochasticMode from "@/components/operations/StochasticMode";
import TemperatureMode from "@/components/operations/TemperatureMode";
import SensitivityMode from "@/components/operations/SensitivityMode";
import LogprobsMode from "@/components/operations/LogprobsMode";
import DivergenceMode from "@/components/operations/DivergenceMode";
import { APP_VERSION } from "@/lib/version";
import { Clippy } from "@/components/easter-eggs/Clippy";
import { KillerRabbit } from "@/components/viz/KillerRabbit";

const MODE_LABELS: Record<TabId, string> = {
  compare: "Dual Panel",
  stochastic: "Stochastic Variation",
  sensitivity: "Prompt Sensitivity",
  temperature: "Temperature Gradient",
  logprobs: "Token Probabilities",
  divergence: "Cross-Model Divergence",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("compare");
  const [isDark, setIsDark] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLogprobsExplainer, setShowLogprobsExplainer] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
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
        <div className="flex items-center gap-2">
          <SplitSquareHorizontal className="w-4 h-4 text-burgundy" />
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
        {activeTab === "compare" && <CompareMode isDark={isDark} onToggleDark={toggleDark} />}
        {activeTab === "stochastic" && <StochasticMode isDark={isDark} />}
        {activeTab === "temperature" && <TemperatureMode isDark={isDark} />}
        {activeTab === "sensitivity" && <SensitivityMode isDark={isDark} />}
        {activeTab === "logprobs" && <LogprobsMode isDark={isDark} />}
        {activeTab === "divergence" && <DivergenceMode isDark={isDark} />}
      </div>

      {/* Status bar */}
      <footer className="px-6 py-1.5 border-t border-border bg-card text-caption text-muted-foreground flex justify-between">
        <span>LLMbench v{APP_VERSION}</span>
        <span>{MODE_LABELS[activeTab]}</span>
      </footer>

      {/* Settings modal */}
      <ProviderSettings isDark={isDark} onToggleDark={toggleDark} />

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
          <div className="bg-popover rounded-sm shadow-lg p-6 w-full max-w-lg border border-parchment max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  You can use Google Gemini, OpenAI, Anthropic, Ollama, or any OpenAI-compatible provider.
                  Each mode works with one or two models; use the <strong>A / B / Both</strong> selector
                  in analysis modes to choose. If you send an empty prompt, a curated example is chosen automatically &mdash;
                  or pick one from the <strong>Try:</strong> chips below the input.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Compare</h3>
                <p className="text-muted-foreground mb-1.5">
                  Side-by-side comparison of two model outputs with inline annotations and export to JSON, text, or PDF.
                  Three overlay views augment the text in place:
                </p>
                <div className="space-y-1 text-muted-foreground pl-3 border-l-2 border-parchment">
                  <p><strong className="text-foreground">Diff</strong> &mdash; Word-level highlighting of what each model said uniquely, with synchronised scrolling.</p>
                  <p><strong className="text-foreground">Struct</strong> &mdash; Numbers each sentence in the margin and highlights discourse connectives (however, therefore, moreover&hellip;) in burgundy. Makes argumentative structure visible at a glance.</p>
                  <p><strong className="text-foreground">Tone</strong> &mdash; Applies Hyland&rsquo;s (2005) metadiscourse model to highlight seven register categories: <span className="text-blue-700">Hedges</span> (might, perhaps), <span className="text-emerald-700">Boosters</span> (clearly, must), <span className="text-orange-700">Limiting</span> (not, never), <span className="text-purple-700">Attitude</span> (important, surprising), <span className="text-amber-700">Intensifiers</span> (very, extremely), <span className="text-rose-700">Self-mentions</span> (I, we, my), and <span className="text-teal-700">Engagement markers</span> (you, consider, note). Click any category chip to read its Hyland definition. Use the eye icon to hide individual categories when the text becomes too colourful. Hover any marked word for its linguistic note and surrounding context.</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Analyse Modes</h3>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Stochastic Variation</strong> &mdash; Sends the same prompt multiple times to measure how outputs differ across runs. Reports word count variation, vocabulary diversity, and pairwise overlap.
                  </p>
                  <p>
                    <strong className="text-foreground">Temperature Gradient</strong> &mdash; Runs the prompt across temperature settings (0.0&ndash;2.0) to show how sampling temperature affects determinism and creativity.
                  </p>
                  <p>
                    <strong className="text-foreground">Prompt Sensitivity</strong> &mdash; Auto-generates micro-variations of your prompt (adding &ldquo;please&rdquo;, rephrasing as a question, etc.) to show how wording affects output.
                  </p>
                  <p>
                    <strong className="text-foreground">Token Probabilities</strong> &mdash; Visualises how confident the model was at each token position. A continuous heatmap shades tokens from pale yellow (moderate uncertainty) to deep red (very low probability); tokens above 70% are uncoloured. A navigation strip provides step buttons and three analytical chips: <em>Uncertain</em> (highest entropy positions), <em>Forks</em> (chosen token &lt;70%), and <em>≠&nbsp;Diverge</em> (where A and B chose different tokens). Click any token to pin its probability distribution; ⌘/Ctrl+click for a second. Requires Google Gemini or OpenAI.{" "}
                    <button
                      onClick={() => setShowLogprobsExplainer(true)}
                      className="text-burgundy hover:underline font-medium"
                    >
                      Learn more about logprobs &rarr;
                    </button>
                  </p>
                  <p>
                    <strong className="text-foreground">Cross-Model Divergence</strong> &mdash; Quantitative comparison with Jaccard similarity, vocabulary overlap, sentence-level structural analysis, and top word frequency comparison across both outputs.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Deep Dive</h3>
                <p className="text-muted-foreground">
                  Every result has a collapsible <strong>Deep Dive</strong> panel. In analysis modes these contain
                  per-run metrics tables, pairwise overlap matrices, entropy hotspot lists, vocabulary frequency
                  comparisons, and unique bigram analysis. In Compare mode the Deep Dive shows structural breakdowns
                  and top-word frequency bars side by side.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Tips</h3>
                <ul className="text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Hover any <strong>?</strong> badge on a metric for an explanation of what it measures.</li>
                  <li>In Token Probabilities, click a token to pin its distribution. Use the <em>Forks</em> and <em>Uncertain</em> chips to jump to the most analytically interesting positions.</li>
                  <li>In the entropy histogram, click any confidence band to see exactly which tokens fell there.</li>
                  <li>Type <strong>rabbit</strong> on the keyboard for a surprise.</li>
                  <li>Comparisons save automatically to browser storage; reload them via the History button.</li>
                </ul>
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

              <p className="text-muted-foreground text-caption">
                Built as part of a research programme into computational culture, critical code studies,
                and the political economy of artificial intelligence. Part of the Critical Code Studies
                Workbench family of tools.
              </p>

              <div className="pt-2 border-t border-parchment/50">
                <a
                  href="https://github.com/dmberry/LLMbench"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-burgundy hover:underline"
                >
                  github.com/dmberry/LLMbench
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
