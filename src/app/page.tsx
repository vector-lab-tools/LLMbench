"use client";

import { useState } from "react";
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
  const [showAbout, setShowAbout] = useState(false);
  const { setShowSettings } = useProviderSettings();

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
                  You can use any combination of Google Gemini, OpenAI, Anthropic, Ollama, or OpenAI-compatible
                  providers. Each mode works with one or two models. Use the
                  <strong> Model A | Model B | Both</strong> selector in analysis modes to choose which model(s) to run.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Modes</h3>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Compare</strong> &mdash; Side-by-side comparison of two model outputs
                    with annotations, word-level diff highlighting, and export to JSON, text, or PDF.
                  </p>
                  <p>
                    <strong className="text-foreground">Stochastic Variation</strong> &mdash; Sends the same prompt to the
                    same model(s) multiple times to measure how outputs vary across runs.
                  </p>
                  <p>
                    <strong className="text-foreground">Temperature Gradient</strong> &mdash; Runs the same prompt across a
                    range of temperature settings (0.0 to 2.0) to visualise how sampling temperature
                    affects output determinism and creativity.
                  </p>
                  <p>
                    <strong className="text-foreground">Prompt Sensitivity</strong> &mdash; Tests how minor prompt changes
                    affect model outputs.  Auto-generates variations with option to add custom ones.
                  </p>
                  <p>
                    <strong className="text-foreground">Token Probabilities</strong> &mdash; Visualises per-token probability
                    distributions with a colour-coded heatmap. Hover over tokens to see alternative
                    choices the model considered. Supported by Google Gemini and OpenAI.
                  </p>
                  <p>
                    <strong className="text-foreground">Cross-Model Divergence</strong> &mdash; Quantitative comparison with
                    Jaccard similarity, vocabulary overlap analysis, structural metrics, and response
                    time comparison.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Deep Dive</h3>
                <p className="text-muted-foreground">
                  Each result card has a collapsible Deep Dive panel that reveals detailed
                  analysis: full text, token tables, vocabulary comparisons, and CSV export.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Metric Tooltips</h3>
                <p className="text-muted-foreground">
                  Hover over any metric with a <strong>?</strong> indicator to see an explanation of what it measures.
                </p>
              </div>
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
