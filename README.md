# LLMbench

**A comparative close reading workbench for Large Language Model outputs.**

**Author:** David M. Berry
**Institution:** University of Sussex
**Version:** 2.7.1
**Date:** 12 April 2026
**Licence:** MIT

LLMbench is a web-based research tool that enables scholars and researchers to subject AI-generated text to the kind of sustained hermeneutic scrutiny that has long been applied to literary, philosophical, and computational texts. It sends prompts to one or two LLMs, displays their responses in annotatable panels, and provides six analytical modes for empirically investigating model behaviour: dual-panel comparison, stochastic variation, prompt sensitivity, temperature gradients, token probabilities, and cross-model divergence.

The tool is designed for humanistic inquiry into LLM behaviour, not engineering evaluation. Where existing comparison tools (Google PAIR's LLM Comparator, Chatbot Arena, LMSYS) measure win rates, safety metrics, and benchmark performance, LLMbench treats outputs as texts to be read, annotated, and interpreted.

## Scholarly Context

LLMbench emerges from the convergence of three research programmes.

**Critical Code Studies.** Mark Marino's *Critical Code Studies* (2020) established that source code is a cultural object amenable to hermeneutic, rhetorical, and materialist analysis. The CCS-WB (Critical Code Studies Workbench) provides the annotation infrastructure that LLMbench adapts. Where CCS applies close reading to code, LLMbench extends that practice to the *outputs* of computational systems, treating LLM-generated text as an object of analysis rather than a finished product.

**AI Sprints.** Berry (2025) proposed AI sprints as a research methodology for bounded, intensive human-AI collaboration in humanities and social science research. The method adapts earlier sprint traditions (book sprints, data sprints) while maintaining critical reflexivity about computational systems. AI sprints operate through *productive augmentation*, where researchers maintain strategic control over research questions and interpretive claims while leveraging computational capacity for generation and pattern-finding. LLMbench provides the analytical workspace for the comparative dimension of this methodology.

**Comparative and variorum analysis.** The variorum principle, articulated in *10 PRINT* (Montfort et al. 2013), treats different variants of the same text as analytically productive rather than as defects to be resolved. LLMbench operationalises this principle for LLM outputs: two models responding to the same prompt produce textual variants whose differences reveal assumptions, rhetorical strategies, knowledge boundaries, and ideological dispositions that would remain invisible in a single output.

## Modes at a Glance

LLMbench is organised as a two-tier tab navigation: one **Compare** mode for close reading, and five **Analyse** modes for empirical probes into model behaviour.

| Mode | Purpose | Core question |
|---|---|---|
| **Dual Panel** | Side-by-side close reading with overlays and annotations | How do two models read the same prompt? |
| **Stochastic Variation** | Repeated runs of the same prompt | How much does the same model disagree with itself? |
| **Temperature Gradient** | Sweep across sampling temperatures | How does randomness shape output? |
| **Prompt Sensitivity** | Auto-generated prompt variants | How much does phrasing matter? |
| **Token Probabilities** | Deep single-response logprob analysis | Where was the model uncertain? |
| **Cross-Model Divergence** | Quantitative comparison of two outputs | What do the numbers say about difference? |

All modes work with a single model (Panel A only) or two models (A + B), with streaming results and a collapsible Deep Dive for each.

## Compare Mode (Dual Panel)

The primary close-reading workspace. Two panels, two models, one prompt.

### Core features
- **Dual-panel comparison.** Send a prompt to two LLM providers simultaneously. Responses appear side by side with full provenance metadata (model name, temperature, response time, word count).
- **Six-type annotation system.** Each panel supports independent inline annotations with typed categories — observation, question, metaphor, pattern, context, and critique — as colour-coded inline widgets with gutter markers, adapted from CCS-WB.
- **Temperature override.** A per-prompt temperature control overrides the slot's default temperature for that run only.
- **Default prompts.** Curated example prompt chips appear below the input when empty. Clicking one fills and runs it. Sending an empty prompt auto-picks a random example.
- **Prompt reveal.** After sending, a collapsed strip shows the prompt; clicking it opens the full user prompt and system instruction.
- **History and save.** Comparisons persist to browser localStorage; load, rename, and delete past sessions from the history dropdown.
- **Reset.** Clears results and returns the panel to its initial state without losing the current prompt.
- **Export.** Comparisons export as structured JSON, formatted plain text, or side-by-side landscape PDF with coloured annotation badges. In probs view the Export button switches to a dedicated probs modal with PDF snapshot, PNG image, and JSON (per-token probabilities, entropy stats, divergence positions, and text metrics).

### Four overlay views

Compare mode supports four mutually exclusive text overlays, toggled from the toolbar (click again to turn off).

**Diff.** Word-level highlighting of what each model wrote uniquely, with synchronised scrolling between panels. Unique-word counts appear in each panel header.

**Struct.** Numbers each sentence in the margin with a burgundy-tinted badge and highlights discourse connectives (*however*, *therefore*, *moreover*, *firstly*, *consequently*, etc.) in burgundy. A footer shows sentence count, how many sentences contain discourse markers, and average words per sentence. Reveals argumentation structure that word-level diff cannot capture.

**Tone (Register view).** Applies Hyland's (2005) metadiscourse model across seven categories: **Hedges** (*might*, *perhaps*, *arguably* — blue), **Boosters** (*clearly*, *certainly*, *must* — green), **Limiting** (*not*, *never*, *without* — orange), **Attitude markers** (*important*, *surprising*, *problematic* — purple), **Intensifiers** (*very*, *extremely*, *highly* — amber), **Self-mentions** (*I*, *we*, *our* — rose), and **Engagement markers** (*you*, *consider*, *note*, *imagine* — teal). Click any chip to toggle a category; click the **?** beside each chip for the full Hyland definition and bibliographic origin. Hover any marked word for its surrounding context, frequency count, and a word-specific linguistic note. A register balance bar at the foot shows proportions.

**Probs.** Re-runs the current prompt through the token-probability API and overlays a continuous probability heatmap on each panel. Tokens with ≥70% probability receive no highlight; below that the background glides from pale yellow through orange to deep red (near-zero probability), reflecting the full shape of the distribution. A compact gradient confidence key appears in each panel header.

The Probs view adds a navigation strip with analytical tools and three optional visualisation bands:

- **Step navigation.** `←` / `→` buttons (and arrow keys) walk through every token position; both panels stay in sync. `↑` / `↓` jump a visual row in the heatmap; `Home` / `End` jump to the first / last token.
- **Uncertain chip.** Jumps to positions sorted by highest entropy. Click again to deselect.
- **Forks chip.** Jumps to positions where the chosen token had < 70% probability. Click again to deselect.
- **≠ Diverge chip.** Jumps to positions where Panel A and Panel B chose different tokens (requires both panels). Click again to deselect.
- **Click + ⌘/Ctrl-click.** Click any token to pin a probability distribution bar chart in a side panel; ⌘/Ctrl-click to pin a second token and compare two positions side by side.
- **📈 Graph band.** Toggles an **entropy curve** — an SVG sparkline of per-token entropy across the sequence, with A and B overlaid, divergence markers, and click-to-jump cursor tracking.
- **🟨 Pixels band.** Toggles a **token pixel map** — a bird's-eye grid where each cell is one token, coloured by probability. Five selectable palettes (Heat, Viridis, Magma, Ice, Mono). Cells are clickable and jump the cursor. Both panels use the same cell size for direct comparison. Exportable per-panel as high-resolution PNG.
- **🕸️ Net band.** Toggles a **3D probability skyline** — a rotatable WebGL mesh surface (Three.js) where peaks are uncertain tokens. Each vertex is a token position, Y is displaced by entropy, rendered as a translucent surface with wireframe net overlay. Top-5 peaks carry floating labels; click any point to jump the cursor. Exportable per-panel as PNG at any rotation angle.

Per-panel error states surface actual API messages (rate-limit text, authentication failures) instead of a generic "not supported" message. Logprobs require Google Gemini (2.0), OpenAI (direct or via OpenRouter), or Hugging Face (select models via Fireworks/Together backends). A **logprobs-compatible only** checkbox in Provider Settings greys out providers and models that do not expose token probabilities.

## Analyse Modes

### Stochastic Variation
Sends the same prompt to the same model(s) multiple times to demonstrate empirically how identical inputs produce different outputs through probabilistic sampling ("prompt salting"). Configurable run count (3–20). Reports word-count variation, vocabulary diversity, and pairwise word overlap across runs. Deep Dive includes a per-run metrics table and a colour-coded pairwise overlap matrix (green > 70%, yellow 40–70%, red < 40%).

### Temperature Gradient
Runs the same prompt across a fixed sweep of sampling temperatures (0.0, 0.3, 0.7, 1.0, 1.5, 2.0) to visualise how randomness affects output determinism and creativity. Deep Dive includes a per-temperature metrics table (words, sentences, average sentence length, vocabulary diversity, unique words, response time) with contextual notes on low- vs high-temperature behaviour.

### Prompt Sensitivity
Tests how minor prompt changes affect model outputs. Auto-generates variations (adding "please", changing punctuation, rephrasing as question, adding "step by step", etc.) with support for custom user-defined variations. Ranks each variation by its word overlap with the base output, surfacing which prompt tweaks cause the largest divergence.

### Token Probabilities (standalone mode)
A dedicated mode for deep single-response logprob analysis. Where Compare mode's Probs view is a *comparative* overlay, this mode is for sustained inspection of one output. Components:
1. **TokenHeatmap.** Continuous probability colouring with click-to-pin distribution panel and ⌘/Ctrl-click for two-token comparison.
2. **EntropyHistogram.** Five-bin distribution (Very Low → Very High entropy). Click any bin to list the exact tokens that fall into it.
3. **SentenceEntropyView.** Sentences colour-coded by mean entropy with hover tooltips, surfacing which sentences carry the most uncertainty.
4. **Uncertainty Deep Dive.** Confidence-split bar, top entropy hotspots with context windows, and a list of the most frequently considered alternatives across all positions.

Requires Google Gemini (2.0), OpenAI, or Hugging Face with a logprobs-supporting model (logprobs support).

### Cross-Model Divergence
Quantitative comparison with Jaccard similarity, vocabulary overlap analysis, structural metrics (word count, sentence count, average sentence length, vocabulary diversity), and response-time comparison. Deep Dives include vocabulary partitions (unique to A / shared / unique to B), top-10 word frequency bar charts side by side, unique bigram candidates, and a per-panel sentence breakdown.

## General Features

- **Single or dual model.** All modes work with one or two models. Configure just Panel A for single-model analysis or both panels for comparison.
- **Multi-provider support.** Anthropic (Claude), OpenAI (GPT), Google (Gemini), OpenRouter (300+ models via single key), Hugging Face (open-weights models via Inference API), Ollama (local models), and any OpenAI-compatible endpoint. API keys are stored in the browser, never sent to a server.
- **Streaming results.** Analysis modes stream results progressively as each run completes, with animated ghost cards for pending results. Metrics update live as data arrives.
- **Deep Dive.** Every result has a collapsible Deep Dive panel with per-run metric tables, pairwise overlap matrices, entropy hotspot lists, confidence distribution bars, vocabulary frequency comparisons, and CSV export.
- **Default prompt chips.** Every mode shows curated example prompts when the input is empty. Clicking runs immediately; sending an empty input auto-picks a random example.
- **Display controls.** Configurable prose font, font size, annotation brightness, line highlighting intensity, and dark mode.
- **No Markdown mode.** A toolbar toggle injects a system instruction telling the model to return plain text rather than Markdown — useful for cleaner diffs and probability analysis.
- **Help modal.** A built-in help dialog explains each mode, the overlay views, and the token probabilities system, with a dedicated sub-window on how logprobs, entropy, and the heatmap work.
- **Dynamic model configuration.** Available models are defined in a [`models.md`](public/models.md) file. Add new models by editing the Markdown file and refreshing — no rebuild required.
- **Local persistence.** Comparisons and API keys save to browser localStorage; a Supabase preparation layer exists for future cloud sync.
- **Easter eggs.** A few hidden Monty Python references reward close reading of the interface.

## Design Rationale

**Why CodeMirror for prose?** Displaying LLM prose in a code-style editor is a deliberate choice. It creates productive defamiliarisation, making the text look less like natural language and more like an object of analysis. The line-based annotation system transfers directly from code analysis, and the gutter provides a natural site for annotation markers. The editorial typography (serif fonts, comfortable line height) counterbalances the code-editor affordance with readability appropriate to extended prose.

**Why not engineering metrics?** Existing LLM comparison tools are designed for developers optimising model selection. They answer questions like "which model is better at coding?" or "which is safer?" LLMbench answers different questions: How does this model frame the concept differently from that one? What rhetorical strategies does each deploy? Where do their knowledge representations diverge, and what does that divergence reveal? These are humanistic questions that require close reading, not measurement.

**Why multiple visualisations of the same data?** The three Probs-view bands (entropy curve, pixel map, 3D net) are not redundant. Each imposes a different spatial grammar on the same token sequence: the curve emphasises *temporal dynamics* of uncertainty, the pixel map offers a *glance-level summary* of the whole response, and the 3D net turns uncertainty into *terrain* that can be rotated and inspected from any angle. Together they prevent any single visual idiom from naturalising itself as *the* way to see token probabilities.

**Why two panels?** Two is the minimum for comparison and sufficient for most analytical work. It follows the variorum principle: you need at least two variants to see what varies. The dual-panel constraint also keeps the interface focused and prevents the tool from becoming a dashboard.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- API keys for at least one LLM provider (Anthropic, OpenAI, Google, or a local Ollama instance)

### Installation

```bash
git clone https://github.com/dmberry/LLMbench.git
cd LLMbench
npm install
```

### Configuration

Copy the example environment file:

```bash
cp .env.example .env.local
```

API keys are configured in the browser through the Settings panel (gear icon), not in environment variables. The `.env.local` file is used for optional Supabase configuration if cloud persistence is enabled later.

### Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click the gear icon to configure your LLM providers, then enter a prompt and send.

## Architecture

```
public/
  models.md                      # Editable model definitions (no rebuild needed)
src/
  app/
    api/generate/                # Fan-out API route (dual-panel comparison)
    api/analyse/
      stochastic/                # N-run stochastic variation endpoint
      temperature/               # Temperature gradient endpoint
      sensitivity/               # Prompt sensitivity endpoint
      logprobs/                  # Token probabilities endpoint (Google/OpenAI/HuggingFace)
      divergence/                # Quantitative divergence endpoint
    page.tsx                     # Mode-switching shell + Help modal
  components/
    layout/TabNav.tsx            # Two-tier tab navigation (Compare / Analyse)
    operations/                  # Mode components (CompareMode, StochasticMode,
                                 #   TemperatureMode, SensitivityMode,
                                 #   LogprobsMode, DivergenceMode)
    annotations/                 # CodeMirror annotation system (adapted from CCS-WB)
    settings/                    # Provider configuration modal
    shared/                      # DeepDive, ResultCard, MetricBox, DefaultPromptChips
    viz/                         # TokenHeatmap, EntropyCurve, EntropyHistogram,
                                 #   SentenceEntropyView, StructView, ToneView,
                                 #   TokenPixelMap, ProbabilitySkyline (3D),
                                 #   BridgeKeeper, KillerRabbit
    workspace/                   # ProsePanel, DiffPanel, theme
    easter-eggs/                 # Clippy and friends
  context/                       # Provider settings (localStorage-persisted)
  hooks/                         # Annotations, local storage, prompt dispatch
  lib/
    ai/                          # Unified AI client, provider configs, model loader
    diff/                        # Word-level diff computation
    export/                      # JSON, text, PDF export
    metrics/                     # Text metrics (word overlap, Jaccard, entropy)
    prompts/                     # Prompt variation generator + default prompt sets
  types/                         # TypeScript types for modes, analysis, annotations
```

The architecture follows the Manifold Atlas pattern: a thin `page.tsx` manages mode state and conditionally renders standalone mode components. Each analysis mode dispatches to its own API route, which handles one or both provider slots in parallel using `Promise.allSettled`. Heavy visualisations (the 3D probability skyline) are code-split via `next/dynamic` to keep the initial bundle lean.

## Tech Stack

- **Next.js 16** with React 19 and App Router
- **CodeMirror 6** for prose display and annotation
- **Tailwind CSS v3** with an editorial colour palette (ivory, cream, parchment, burgundy, gold)
- **Vercel AI SDK** with Anthropic, OpenAI, Google, and Hugging Face providers
- **@google/generative-ai** for token-probability (logprobs) support
- **Three.js** via `@react-three/fiber` and `@react-three/drei` for the 3D probability skyline
- **jsPDF** for PDF export
- **diff** for word-level text comparison
- **localStorage** for persistence (Supabase preparation layer exists for future cloud sync)

## Roadmap

- [ ] Cross-panel annotation linking (connecting annotations across Panel A and Panel B)
- [ ] Embedding-based semantic similarity in divergence mode
- [x] Prompt history browser (last 10 prompts, localStorage, Compare mode)
- [ ] Prompt history browser across all modes
- [ ] Supabase cloud persistence and sharing
- [ ] Tutorial / cards system for guided analytical exercises

## Related Work

- Berry, D. M. (2025) 'AI Sprints: A Research Methodology for Human-AI Collaboration', *Stunlaw*. Available at: https://stunlaw.blogspot.com/2025/11/ai-sprints.html
- Berry, D. M. (2025) 'Synthetic Media and Computational Capitalism: Towards a Critical Theory of Artificial Intelligence', *AI & Society*. Available at: https://doi.org/10.1007/s00146-025-02265-2
- Berry, D. M. (2026) *Artificial Intelligence and Critical Theory*. MUP.
- Berry, D. M. and Marino, M. C. (2024) 'Reading ELIZA', ebr.
- Hyland, K. (2005) *Metadiscourse: Exploring Interaction in Writing*. Continuum.
- Marino, M. C. (2020) *Critical Code Studies*. MIT Press.
- Montfort, N. et al. (2013) *10 PRINT CHR$(205.5+RND(1)); : GOTO 10*. MIT Press.

## Acknowledgements

LLMbench adapts the annotation infrastructure from the [Critical Code Studies Workbench](https://github.com/dmberry/CCS-WB) (CCS-WB). The editorial design system, CodeMirror annotation widgets, and display settings are shared between the two projects.

## Licence

MIT
