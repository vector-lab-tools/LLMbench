# LLMbench

**A comparative close reading workbench for Large Language Model outputs.**

**Author:** David M. Berry
**Institution:** University of Sussex
**Version:** 1.9.5
**Date:** 8 April 2026
**Licence:** MIT

LLMbench is a web-based research tool that enables scholars and researchers to subject AI-generated text to the kind of sustained hermeneutic scrutiny that has long been applied to literary, philosophical, and computational texts. It sends prompts to one or two LLMs, displays their responses in annotatable panels, and provides analytical modes for empirically investigating model behaviour: stochastic variation, prompt sensitivity, temperature gradients, token probabilities, and cross-model divergence.

The tool is designed for humanistic inquiry into LLM behaviour, not engineering evaluation. Where existing comparison tools (Google PAIR's LLM Comparator, Chatbot Arena, LMSYS) measure win rates, safety metrics, and benchmark performance, LLMbench treats the outputs as texts to be read, annotated, and interpreted.

## Scholarly Context

LLMbench emerges from the convergence of three research programmes.

**Critical Code Studies.** Mark Marino's Critical Code Studies (2020) established that source code is a cultural object amenable to hermeneutic, rhetorical, and materialist analysis. The CCS-WB (Critical Code Studies Workbench) provides the annotation infrastructure that LLMbench adapts. Where CCS applies close reading to code, LLMbench extends that practice to the *outputs* of computational systems, treating LLM-generated text as an object of analysis rather than a finished product.

**AI Sprints.** Berry (2025) proposed AI sprints as a research methodology for bounded, intensive human-AI collaboration in humanities and social science research. The method adapts earlier sprint traditions (book sprints, data sprints) while maintaining critical reflexivity about computational systems. AI sprints operate through *productive augmentation*, where researchers maintain strategic control over research questions and interpretive claims while leveraging computational capacity for generation and pattern-finding. LLMbench provides the analytical workspace for the comparative dimension of this methodology, enabling researchers to examine how different models handle the same prompt and to build structured interpretive records of that examination.

**Comparative and variorum analysis.** The variorum principle, articulated in *10 PRINT* (Montfort et al. 2013), treats different variants of the same text as analytically productive rather than as defects to be resolved. LLMbench operationalises this principle for LLM outputs. Two models responding to the same prompt produce textual variants whose differences reveal assumptions, rhetorical strategies, knowledge boundaries, and ideological dispositions that would remain invisible in a single output.

## What It Does

### Compare Mode

- **Dual-panel comparison.** Send a prompt to two LLM providers simultaneously. Responses appear in side-by-side panels with full provenance metadata (model name, temperature, response time, word count).

- **Six-type annotation system.** Each panel supports independent inline annotations with typed categories: observation, question, metaphor, pattern, context, and critique. Annotations appear as colour-coded inline widgets with gutter markers, adapted from the CCS-WB annotation infrastructure.

- **Text overlay views.** Three mutually exclusive overlay modes augment the text in place (toggled by buttons in the toolbar; click again to turn off):

  - **Diff** — Word-level highlighting of what each model wrote uniquely, with synchronised scrolling between panels. Unique-word counts shown in each panel header.

  - **Struct** — Numbers each sentence in the margin with a burgundy-tinted badge and highlights discourse connectives (however, therefore, moreover, firstly, consequently, etc.) in burgundy. A footer shows sentence count, how many sentences contain discourse markers, and average words per sentence. Reveals argumentation structure that word diff cannot capture.

  - **Tone (Register view)** — Applies Hyland's (2005) metadiscourse model across seven categories: **Hedges** (might, perhaps, arguably — blue), **Boosters** (clearly, certainly, must — green), **Limiting** (not, never, without, hardly — orange), **Attitude markers** (important, surprising, problematic — purple), **Intensifiers** (very, extremely, highly — amber), **Self-mentions** (I, we, my, our — rose), and **Engagement markers** (you, consider, note, imagine — teal). Click any chip to toggle that category on or off. Click the **?** beside each chip to open a modal with the full Hyland (2005) definition, term, and bibliographic origin. Hover any marked word for its surrounding context, frequency count, and a word-specific linguistic note. A register balance bar at the foot shows proportions.

  - **Probs** — Re-runs the current prompt through the token probability API and overlays a colour-coded entropy heatmap on each panel (grey = confident, red = uncertain). Requires Google Gemini 2.0 or OpenAI models. If neither panel is configured with a compatible model the button is dimmed; clicking it opens an explanatory modal with model requirements and a link to Settings.

- **Default prompts.** A row of curated example prompts appears below the input when empty. Clicking one fills and immediately runs it. Sending an empty prompt auto-selects a random example.

- **Export.** Comparisons export as structured JSON, formatted plain text, or side-by-side landscape PDF with coloured annotation badges.

### Analyse Modes

- **Stochastic Variation.** Sends the same prompt to the same model(s) multiple times to empirically demonstrate how identical inputs produce different outputs through probabilistic sampling ("prompt salting"). Configurable run count (3-20). Reports word count variation, vocabulary diversity, and pairwise word overlap across runs.

- **Temperature Gradient.** Runs the same prompt across a range of temperature settings (0.0, 0.3, 0.7, 1.0, 1.5, 2.0) to visualise how sampling temperature affects output determinism and creativity.

- **Prompt Sensitivity.** Tests how minor prompt changes affect model outputs. Auto-generates variations (adding "please", changing punctuation, rephrasing as question, adding "step by step", etc.) with support for custom user-defined variations.

- **Token Probabilities.** Visualises how confident the model was at every token position. Components: (1) a colour-coded heatmap (grey = high confidence, red = high uncertainty) where clicking any token pins a probability bar chart for that position in a persistent right-side panel; (2) an entropy distribution histogram showing how many tokens fell into each confidence band — click any band to see the exact tokens and their entropy values; (3) a sentence entropy view showing which sentences carry the most uncertainty, with hover tooltips; (4) an Uncertainty Analysis Deep Dive with confidence split, entropy hotspot list with context windows, and most-considered alternatives. Requires Google Gemini or OpenAI (logprobs support).

- **Cross-Model Divergence.** Quantitative comparison with Jaccard similarity, vocabulary overlap analysis, structural metrics, and response time comparison. Per-panel Deep Dives include a sentence breakdown table; a panel-level Comparative Analysis Deep Dive shows top-10 word frequency bars side by side and unique bigram candidates for each output.

### General Features

- **Single or dual model.** All modes work with one or two models. Configure just Panel A for single-model analysis, or both panels for side-by-side comparison.

- **Multi-provider support.** Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama (local models), and any OpenAI-compatible endpoint. API keys are stored persistently in the browser, never sent to a server.

- **Default prompts.** Every mode shows curated example prompts as clickable chips when the input is empty. Clicking runs immediately. Sending an empty input auto-picks a random example — the quickest way to explore a new mode.

- **Streaming results.** Analysis modes stream results progressively as each run completes, with animated ghost cards for pending results. Metrics update live as data arrives.

- **Deep Dive.** Every result has a collapsible Deep Dive panel. Analysis modes include per-run metrics tables, pairwise overlap matrices, entropy hotspot lists, confidence distribution bars, vocabulary frequency comparisons, and CSV export. Compare mode adds structural breakdowns and word frequency bars.

- **Display controls.** Configurable prose font, font size, annotation brightness, line highlighting intensity, and dark mode.

- **Dynamic model configuration.** Available models are defined in a [`models.md`](public/models.md) file. Add new models by editing the Markdown file and refreshing, with no rebuild required.

- **Local persistence.** Comparisons and API keys save to browser localStorage.

## Design Rationale

**Why CodeMirror for prose?** Displaying LLM prose in a code-style editor is a deliberate choice. It creates productive defamiliarisation, making the text look less like natural language and more like an object of analysis. The line-based annotation system transfers directly from code analysis, and the gutter provides a natural site for annotation markers. The editorial typography (serif fonts, comfortable line height) counterbalances the code-editor affordance with readability appropriate to extended prose.

**Why not engineering metrics?** Existing LLM comparison tools are designed for developers optimising model selection. They answer questions like "which model is better at coding?" or "which is safer?" LLMbench answers different questions: How does this model frame the concept differently from that one? What rhetorical strategies does each deploy? Where do their knowledge representations diverge, and what does that divergence reveal? These are humanistic questions that require close reading, not measurement.

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
  models.md                    # Editable model definitions (no rebuild needed)
src/
  app/
    api/generate/              # Fan-out API route (dual-panel comparison)
    api/analyse/
      stochastic/              # N-run stochastic variation endpoint
      temperature/             # Temperature gradient endpoint
      sensitivity/             # Prompt sensitivity endpoint
      logprobs/                # Token probabilities endpoint (Google/OpenAI)
      divergence/              # Quantitative divergence endpoint
    page.tsx                   # Mode-switching shell
  components/
    layout/TabNav.tsx          # Two-tier tab navigation (Compare / Analyse)
    operations/                # Mode components (CompareMode, StochasticMode, etc.)
    annotations/               # CodeMirror annotation system (adapted from CCS-WB)
    settings/                  # Provider configuration modal
    shared/                    # DeepDive, ResultCard, MetricBox, DefaultPromptChips, AnalysisPromptArea
    viz/                       # TokenHeatmap, EntropyHistogram, SentenceEntropyView, StructView, ToneView
    workspace/                 # ProsePanel, DiffPanel, theme
  context/                     # Provider settings (localStorage-persisted)
  hooks/                       # Annotations, local storage, prompt dispatch
  lib/
    ai/                        # Unified AI client, provider configs, model loader
    diff/                      # Word-level diff computation
    export/                    # JSON, text, PDF export
    metrics/                   # Text metrics (word overlap, Jaccard, entropy)
    prompts/                   # Prompt variation generator + default prompt sets
  types/                       # TypeScript types for modes, analysis, annotations
```

The architecture follows the Manifold Atlas pattern: a thin `page.tsx` manages mode state and conditionally renders standalone mode components. Each analysis mode dispatches to its own API route, which handles one or both provider slots in parallel using `Promise.allSettled`.

## Tech Stack

- **Next.js 16** with React 19 and App Router
- **CodeMirror 6** for prose display and annotation
- **Tailwind CSS v3** with an editorial colour palette (ivory, cream, parchment, burgundy, gold)
- **Vercel AI SDK** with Anthropic, OpenAI, and Google providers
- **@google/generative-ai** for token probability (logprobs) support
- **jsPDF** for PDF export
- **diff** for word-level text comparison
- **localStorage** for persistence (Supabase preparation layer exists for future cloud sync)

## Roadmap

- [ ] Cross-panel annotation linking (connecting annotations across Panel A and Panel B)
- [ ] Embedding-based semantic similarity in divergence mode
- [ ] Prompt history browser
- [ ] Supabase cloud persistence and sharing
- [ ] Tutorial/cards system for guided analytical exercises

## Related Work

- Berry, D. M. (2025) 'AI Sprints: A Research Methodology for Human-AI Collaboration', *Stunlaw*. Available at: https://stunlaw.blogspot.com/2025/11/ai-sprints.html
- Berry, D. M. (2025) 'Synthetic Media and Computational Capitalism: Towards a Critical Theory of Artificial Intelligence', *AI & Society*. Available at: https://doi.org/10.1007/s00146-025-02265-2
- Berry, D. M. (2026) *Artificial Intelligence and Critical Theory*. MUP.
- Berry, D. M. and Marino, M. C. (2024) 'Reading ELIZA', ebr.
- Marino, M. C. (2020) *Critical Code Studies*. MIT Press.
- Montfort, N. et al. (2013) *10 PRINT CHR$(205.5+RND(1)); : GOTO 10*. MIT Press.

## Acknowledgements

LLMbench adapts the annotation infrastructure from the [Critical Code Studies Workbench](https://github.com/dmberry/CCS-WB) (CCS-WB). The editorial design system, CodeMirror annotation widgets, and display settings are shared between the two projects.

## Licence

MIT
