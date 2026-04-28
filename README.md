> Part of the [Vector Lab](https://github.com/vector-lab-tools) —
> vector methods for vector theory.
> [Overview and map](https://vector-lab-tools.github.io) ·
> [Org profile](https://github.com/vector-lab-tools)
>
> **Tier:** comparative model tool. **Object:** generated prose across models.
>
> **Sibling instruments:**
> [Vectorscope](https://github.com/vector-lab-tools/vectorscope) ·
> [Manifoldscope](https://github.com/vector-lab-tools/manifoldscope) ·
> [Theoryscope](https://github.com/vector-lab-tools/theoryscope) ·
> [Manifold Atlas](https://github.com/vector-lab-tools/manifold-atlas)

# LLMbench

**A comparative close reading workbench for Large Language Model outputs.**

**Author:** David M. Berry
**Institution:** University of Sussex
**Version:** 2.15.26
**Date:** 24 April 2026
**Licence:** MIT



LLMbench is a web-based research tool that enables scholars and researchers to subject AI-generated text to the kind of sustained hermeneutic scrutiny that has long been applied to literary, philosophical, and computational texts. It sends prompts to one or two LLMs, displays their responses in annotatable panels, and provides six analytical modes for empirically investigating model behaviour: dual-panel comparison, stochastic variation, prompt sensitivity, temperature gradients, token probabilities, and cross-model divergence.

The tool is designed for humanistic inquiry into LLM behaviour, not engineering evaluation. Where existing comparison tools (Google PAIR's LLM Comparator, Chatbot Arena, LMSYS) measure win rates, safety metrics, and benchmark performance, LLMbench treats outputs as texts to be read, annotated, and interpreted.

> LLMbench is part of the [Vector Lab](https://github.com/dmberry) family of research instruments, alongside [Manifold Atlas](https://github.com/dmberry/manifold-atlas), [Vectorscope](https://github.com/dmberry/vectorscope), and [Theoryscope](https://github.com/dmberry/theoryscope). The four tools share an editorial design system, an open-weight-friendly methodology, and a commitment to making the geometry of meaning legible for critical analysis. They diverge in their object: Manifold Atlas compares output geometries between models, Vectorscope inspects the internals of a single open-weight model, Theoryscope maps the geometry of a corpus of theoretical texts, and LLMbench reads the surface of model outputs as prose.

## Scholarly Context

LLMbench emerges from the convergence of three research programmes.

**Critical Code Studies.** Mark Marino's *Critical Code Studies* (2020) established that source code is a cultural object amenable to hermeneutic, rhetorical, and materialist analysis. The CCS-WB (Critical Code Studies Workbench) provides the annotation infrastructure that LLMbench adapts. Where CCS applies close reading to code, LLMbench extends that practice to the *outputs* of computational systems, treating LLM-generated text as an object of analysis rather than a finished product.

**AI Sprints.** Berry (2025) proposed AI sprints as a research methodology for bounded, intensive human-AI collaboration in humanities and social science research. The method adapts earlier sprint traditions (book sprints, data sprints) while maintaining critical reflexivity about computational systems. AI sprints operate through *productive augmentation*, where researchers maintain strategic control over research questions and interpretive claims while leveraging computational capacity for generation and pattern-finding. LLMbench provides the analytical workspace for the comparative dimension of this methodology.

**Comparative and variorum analysis.** The variorum principle, articulated in *10 PRINT* (Montfort et al. 2013), treats different variants of the same text as analytically productive rather than as defects to be resolved. LLMbench operationalises this principle for LLM outputs: two models responding to the same prompt produce textual variants whose differences reveal assumptions, rhetorical strategies, knowledge boundaries, and ideological dispositions that would remain invisible in a single output.

## Chat Models and Token Probabilities: A Primer

LLMbench uses two kinds of signal from a language model, and it helps to understand the difference.

A **chat model** (GPT-4o, Claude, Gemini, Llama) takes text in and produces text out. You give it a prompt, it generates a response. The output is language. Every LLMbench mode uses chat models as its basic instrument, sending a prompt to one or two providers in parallel and displaying the responses side by side.

A **token probability** is a number attached to a single word or subword in a response. When a chat model generates the next token in its output, it produces a probability distribution over every possible next token, then samples from that distribution. The **logprob** is the logarithm of the chosen token's probability, and it tells you how confident the model was at that step. Low confidence is not a defect, it is a place where the model was balancing alternatives. Token probability data is only available from some providers (Google Gemini 2.0, OpenAI, Hugging Face via Fireworks or Together) and only for specific models.

This matters for LLMbench because the tool offers two complementary reading surfaces. The text of a response is a hermeneutic object, readable as prose. The token probabilities are a geometric object, revealing where the model hesitated, branched, or converged. The Probs view in Compare mode and the standalone Token Probabilities mode are the two places these probabilities become visible: as heatmaps, entropy curves, pixel maps, and 3D skylines. A token-probability reading never replaces the close reading of the prose; it supplements it, showing where the surface calm hides underlying uncertainty.

### Logprobs as a first-class layer (v2.15.20+)

LLMbench treats token probabilities as a **central** data layer rather than a click-to-fetch overlay. Two design decisions follow from this:

- **Auto-fetch by default.** When at least one active slot supports logprobs, LLMbench fetches the token probability data alongside the main generation on every submit. Toggling the **Probs** button is then a pure visual op — no extra API call, no waiting. A small indicator dot on the button shows the cache state (green = ready, amber pulse = fetching, none = not yet fetched). The behaviour is controlled by an app-wide **Auto-fetch logprobs** setting in the Settings header, on by default; power users can switch it off to revert to on-demand fetching.

- **Slot-snapshot consistency.** The slot configuration used for a generation is snapshotted at submit time (`executedSlots`). All downstream views — the auto-fetch effect, the manual `Probs` button, the per-panel capability indicator, the retry button — read from this snapshot. So if you generate with Qwen, switch to GPT-4o in Settings, and then press **Probs**, the probability distribution is fetched against Qwen (the model that produced the displayed text). The compare view and the probs view always show data from the same model. To probe with a different model, re-submit; the snapshot updates.

Together these mean the probs view is no longer a separate request waiting to happen; it is the second face of the response you already have. Compare and Probs always show the same text, with their data sourced from the same model snapshot. When a particular model can't return logprobs (Gemini 2.5 series, gpt-3.5-turbo, some Hugging Face routes), the empty state names the actual cause and recommends a working alternative — `gemini-2.0-flash`, `gpt-4o`/`gpt-4o-mini`, or an OpenRouter `openai/*` route — rather than implying a re-send will fix it.

## Operations at a Glance

LLMbench is organised as a three-tier tab navigation: one **Compare** mode for close reading, five **Analyse** modes for empirical probes into model behaviour, and an **Investigate** tier for pattern-specific rhetorical probes.

| Tier | Mode | Purpose | Core question |
|---|---|---|---|
| Compare | **Dual Panel** | Side-by-side close reading with overlays and annotations | How do two models read the same prompt? |
| Analyse | **Stochastic Variation** | Repeated runs of the same prompt | How much does the same model disagree with itself? |
| Analyse | **Temperature Gradient** | Sweep across sampling temperatures | How does randomness shape output? |
| Analyse | **Prompt Sensitivity** | Auto-generated prompt variants | How much does phrasing matter? |
| Analyse | **Token Probabilities** | Deep single-response logprob analysis | Where was the model uncertain? |
| Analyse | **Cross-Model Divergence** | Quantitative comparison of two outputs | What do the numbers say about difference? |
| Investigate | **Grammar Probe** | Pattern-specific investigation of rhetorical constructions (Not X but Y, hedging, tricolon, modal stacking) | Does the model produce this construction, and why? |
| Investigate | **Sampling Probe** | Autoregressive generation as data — per-token top-K logprobs, counterfactual branching, A/B divergence | How does the sampler arrive at the sequence, step by step? |

All modes work with a single model (Panel A only) or two models (A + B), with streaming results and a collapsible Deep Dive for each.

### Grammar Probe (Investigate tier)

Grammar Probe is the generation-side companion to Manifold Atlas's *Grammar of Vectors* operation and (in future) Vectorscope's activation-steering tools. Where Atlas asks *what geometric relationship does the pattern reveal?* and Vectorscope asks *what internal representations are responsible?*, Grammar Probe asks *what generation behaviour produces the pattern?*

Five phases, each a distinct research question:

- **A. Prevalence** *(available in v2.10.0; Deep Dive expanded in v2.14.1)*. Batch-run a prompt suite across temperatures and models; regex-count pattern hits; aggregate by register, model, and temperature. The Deep Dive opens six research panels, each computed across every selected construction (not just the primary pattern) with CSV export: (1) per-construction hit-rate bar chart faceted by model × temperature, (2) hits-per-run histogram exposing the long-tail shape, (3) register heatmap, (4) suite × construction stratification table, (5) pairwise co-occurrence matrix `P(j | i)` revealing which antithesis constructions ride together in the same run, and (6) Phase E small-multiples with a per-construction **elasticity** readout `rate(T=0) − mean rate(T>0)` so greedy-centre reflexes, register signals, and sampler-emergent constructions are separable at a glance. Answers: how often does the pattern appear, and is it register-sensitive?
- **B. Continuation logprobs** *(available in v2.10.1)*. For each pattern scaffold, fetch the top-K next-token distribution (max_tokens=1 with logprobs). Tokens the construction typically relies on (*not*, *just*, *merely*, etc.) are highlighted, and per-card Shannon entropy is reported. Answers: is the pattern baked into the next-token distribution, or does it emerge downstream? Requires Gemini 2.0, OpenAI, OpenRouter, or Hugging Face.
- **B. Scaffold concentration** *(new in v2.14.0, replaces the earlier Geometry view)*. For each scaffold the probe already fetched a top-K next-token distribution in the continuation phase, and three embedding-free concentration metrics are now computed from it: **top-1 p** (probability mass on the single most-likely token), **H** (Shannon entropy in bits over the returned top-K), and **cliché share** (summed probability of the pattern's expected slot fillers, e.g. *rather*, *merely*, *instead*, *also*). High top-1 combined with low entropy and high cliché share is the signature of a model parked in the construction's groove — producing the antithesis reflexively rather than choosing it. The earlier geometry view has been retired because LLMbench's chat-slot providers do not reliably expose embedding endpoints in the same slot; geometry is now a responsibility of **Manifold Atlas**, which imports the portable **Grammar data bundle** (`*.grammar.json`, spec: `vector-lab.grammar-probe.v1`) exported from this phase and computes cosine geometry against its own embedders. The bundle captures Phase A prevalence runs, Phase B top-K distributions, and Phase E sweep runs in a single analysable JSON.
- **C. Forced continuation** *(available in v2.15.9)*. For each scaffold already probed in Phase B, take the top-N highest-logprob candidate Y tokens and ask the model to expand each into a short Y-phrase via `/api/investigate/grammar-expand`. Renders a scaffold × Y-token × Y-phrase table with the X term extracted per scaffold via `pattern.xExtractor`. The full Y-harvest is written to the Grammar data bundle as `forcedExpansions`; Manifold Atlas imports the bundle directly (no per-scaffold deep link). Canonical spec at `vector-lab-design/GRAMMAR-PROBE-BUNDLE.md`.
- **E. Temperature sweep** *(available in v2.13.0)*. Runs the selected prompt suite across **T ∈ {0, 0.3, 0.7, 1.0, 1.5}** and plots prevalence (hit rate) against T, one line per model. The headline is the **greediness index**: `hitRate(T=0) − mean hitRate(T>0)`. Positive → the construction lives at the argmax (reflex). Near-zero → register-driven, not greedy. Negative → the pattern emerges out of the sampler (rarer, more interesting). A sustained flat-line across T suggests the model is producing the construction as default rhetoric, not as a considered choice.

**Pattern library aligned with Manifold Atlas (v2.13.0).** The antithesis family now ships with five constructions matching Atlas's `Grammar of Vectors` grammars — `not-x-but-y`, `not-just-x-but-y`, `it-is-not-x-it-is-y` (false correction), `while-x-y` (conciliation pivot), and `what-matters-is-not-x-but-y` (cleft emphasis) — so that a probe in LLMbench and the corresponding Atlas operation are testing the same rhetorical target. The three non-antithesis patterns (Hyland hedges, tricolon, modal stacking) remain LLMbench-specific research axes.
- **D. Perturbation** *(available in v2.15.10)*. Each selected prompt is run under three framings: **neutral** (as-is), **anti-pattern** (directive prefix asking the model not to use the primary construction), and **pro-pattern** (directive prefix inviting it). Hit rate is reported per construction per framing, with deltas `Δanti = anti − neutral` and `Δpro = pro − neutral`. A **verdict** column classifies each pattern: **structural** if the model holds it under suppression (`|Δanti| < 10pp` at non-trivial baseline), **stylistic** if it collapses (`Δanti < −30pp`), **invitable** if it inflates under invitation (`Δpro > 30pp`), **mixed** otherwise. Reuses the Phase A prevalence backend; writes `perturbationRuns` into the Grammar data bundle with a `framing` tag per run.
- **E. Temperature sweep** *(planned)*. Prevalence at T ∈ {0, 0.3, 0.7, 1.0, 1.5}. A pattern present at T=0 sits at the greedy centre of the distribution; not a sampling accident.

Ships with a four-preset pattern library (Not X but Y, Hyland hedging triplets, tricolon, modal stacking) and a **thematic suite library** that makes Phase A a research instrument rather than a demo.

#### Prompt suites

Ten named prompt batteries on two composable axes. Tick any combination in the Phase A toolbar; the heatmap gains suite-coloured gutter badges and a per-suite stats tile reports hit rates per condition, so conditions read side by side.

**Purpose axis** — four suites that answer "under what conditions does the pattern appear?"

| Suite | Research question | Prompt style |
|---|---|---|
| **Baseline** | Does the pattern appear unprovoked? | Neutral prompts spread across six registers, not priming any construction. |
| **Invitation** | What's the ceiling under favourable framing? | Prompts that genuinely invite contrast, hedging, or tricolon (e.g. "begin with *Artificial intelligence is not merely*…"). |
| **Resistance** | What's the floor under explicit suppression? | Prompts that instruct the model to be direct and avoid the construction. Feeds into Phase D. |
| **Adversarial** | Does the pattern fire on lexical cues rather than rhetorical need? | Prompts that surface the pattern's trigger words (*not*, *but*, *merely*, *only*) without inviting the construction. |

**Domain axis** — six suites for cross-topic robustness.

| Suite | Covers |
|---|---|
| **Politics** | Democracy, representation, diplomacy, parliamentary process. |
| **Technology** | LLMs, software engineering, vector search, keynote rhetoric. |
| **Science** | Physics, genomics, climate, statistics communication. |
| **Ethics** | Climate duties, clinical decisions, consequentialist / deontological reasoning. |
| **Pedagogy** | Teaching and learning, assessment, school policy, lecture openings. |
| **Everyday** | Ordinary register: cafés, neighbours, toasts, small towns. |

Suites are additive (union of prompts, deduplicated), and every prompt still carries its register tag so the existing by-register breakdown continues to work orthogonally. Add or replace suites by editing [`src/lib/grammar/prompt-suite.ts`](src/lib/grammar/prompt-suite.ts).

### Sampling Probe (Investigate tier, new in v2.15.0)

Where Grammar Probe asks *how often does this rhetorical shape appear across a corpus?*, **Sampling Probe** asks *how does the sampler arrive at any shape at all, step by step?* Autoregressive generation is unfolded into a data structure: one HTTP call per sampled token, each step stores its full top-K distribution, and the browser holds the sampler state machine so every knob is instant. Requires a logprobs-capable slot (Gemini 2.0, OpenAI, OpenRouter, or Hugging Face).

- **Per-step data.** Top-K bar chart (K up to 20, the provider-side cap) showing real next-token probabilities, re-softmaxed client-side under your current **T** and **top-p** so sliders update the chart without a new API call. Each row shows rank, token, softmax probability (bar), and raw logprob. The chosen token is highlighted in burgundy.
- **Generation strip.** The whole generated sequence rendered inline, each token shaded by its **surprisal** (−log₂p): green for low-surprisal (expected) tokens, amber for moderate, burgundy for high-surprisal (rare) choices. Click any token to rewind the inspector to that step.
- **Trajectory chart.** Per-step entropy H (green line, bits over top-K) and chosen-token surprisal (burgundy bars). Click the bars to jump to any step. A summary row reports total surprisal and branch perplexity.
- **Counterfactual override.** Click any non-chosen token in the top-K inspector to **override** the model's pick at that step. The current branch is truncated (every token after the overridden step is cleared) and the step's chosen token is swapped for your pick; pressing **Step** or **Run** continues generating from the new choice. This is the counterfactual workflow: walk the sequence, disagree with the sampler at any step, keep walking. A **Stop** button halts an in-flight Run between tokens. Because raw logprobs are cached, the override re-uses the existing distribution — no new API call until you advance.
- **Dual-panel A/B lockstep.** Both slots generate against the same prefix. Top-K bar charts render side by side; the inspector footer reports **Jaccard(A,B)** (overlap of top-K token sets) and **KL(A‖B)** (bits). The Deep Dive shows a per-step divergence table with ● markers on steps where the two models chose different tokens.
- **Exports.** A one-click **Bundle** button writes the full trace as `vector-lab.sampling-trace.v1` JSON (prompt, params, every branch's every step with raw top-K, provider/model, slot metadata). The Deep Dive ships a per-branch **Trajectory CSV** (step / chosen token / entropy / surprisal / rank / softmax p). Bundle files are fully replayable — re-softmax, branch comparisons, and new metrics can all be computed downstream without re-calling the provider.

Research uses. Where does a chosen token sit in the distribution (rank histogram)? How does entropy rise and fall across a sentence (boilerplate → novelty → boilerplate)? Which sequence positions are high-stakes sampling decisions vs. near-deterministic transitions? When two models disagree, is it an early fork that propagates, or parallel choices that converge? Sampling Probe treats each of these as measurable.

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
- **Export.** Comparisons export as structured JSON, formatted plain text, or side-by-side landscape PDF with coloured annotation badges. In probs view the Export button switches to a dedicated probs modal with PDF snapshot (heatmap, full text, deep-dive stats, entropy curve, pixel maps, and a final annotated-token page showing each token with its probability, entropy, and top two alternatives in two-colour typography), PNG image, and JSON (per-token probabilities, entropy stats, divergence positions, and text metrics).

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
Quantitative comparison with cosine similarity (frequency-weighted), Jaccard similarity (set-level), vocabulary overlap analysis, structural metrics (word count, sentence count, average sentence length, vocabulary diversity), and response-time comparison. Deep Dives include vocabulary partitions (unique to A / shared / unique to B), top-10 word frequency bar charts side by side, unique bigram candidates, and a per-panel sentence breakdown.

## General Features

- **Single or dual model.** All modes work with one or two models. Configure just Panel A for single-model analysis or both panels for comparison.
- **Multi-provider support.** Anthropic (Claude), OpenAI (GPT), Google (Gemini), OpenRouter (300+ models via single key), Hugging Face (open-weights models via Inference API), Ollama (local models), and any OpenAI-compatible endpoint. API keys are stored in the browser, never sent to a server.
- **Streaming results.** Analysis modes stream results progressively as each run completes, with animated ghost cards for pending results. Metrics update live as data arrives.
- **Deep Dive.** Every result has a collapsible Deep Dive panel with per-run metric tables, pairwise overlap matrices, entropy hotspot lists, confidence distribution bars, vocabulary frequency comparisons, and CSV export.
- **Default prompt chips.** Every mode shows curated example prompts when the input is empty. Clicking runs immediately; sending an empty input auto-picks a random example.
- **Display controls.** Configurable prose font, font size, annotation brightness, line highlighting intensity, and dark mode.
- **Summary statistics.** Each Analyse mode displays a one-line verdict banner when a run completes — automatically classifying variation level (low / moderate / high) from the run metrics with colour coding.
- **Guided exercises.** A tutorial cards system (GraduationCap button in the header) offers 10 structured analytical exercises across all modes, each with a method note, guided questions, and a one-click launch.
- **Cross-panel annotation linking.** Annotations in Panel A can be linked to annotations in Panel B with typed relation categories (contrast, parallel, divergence, convergence, echo, absence, note), persisted with the comparison.
- **Prompt history.** A clock icon in every mode's prompt bar gives access to the last 10 prompts, shared across all modes via localStorage.
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
git clone https://github.com/vector-lab-tools/LLMbench.git
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

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 3, CCS-WB editorial design system |
| Prose editor | CodeMirror 6 |
| AI providers | Vercel AI SDK with Anthropic, OpenAI, Google, Hugging Face |
| Logprobs support | @google/generative-ai (Gemini 2.0) |
| Visualisation | Three.js via @react-three/fiber and @react-three/drei (3D skyline), custom SVG |
| Export | jsPDF (PDF), diff (word-level) |
| Persistence | localStorage; Supabase preparation layer for future cloud sync |

## Roadmap

- [x] Cross-panel annotation linking (contrast, parallel, divergence, convergence, echo, absence, note)
- [x] Prompt history browser across all modes (last 10 prompts, localStorage)
- [x] Tutorial / cards system for guided analytical exercises (10 exercises across all modes)
- [x] Summary statistics banners in all Analyse modes
- [x] Cosine similarity (frequency-weighted) in Cross-Model Divergence
- [x] Annotated token text page in probs PDF export (with reading key: format, probability, entropy with quantitative thresholds, worked example)
- [x] Top-5 alternatives with probabilities on each annotated token
- [x] Vector Lab family branding and navigation
- [x] Canonical Vector Lab toolbar layout: clustered views, right-hand icon dock for Export and History
- [x] Investigate tier with Grammar Probe (Phase A: prevalence heatmap across pattern × prompt × temperature × model)
- [x] Grammar Probe Phase B: continuation logprobs — top-K next-token distribution per scaffold with suppress-token highlighting and entropy
- [x] Grammar Probe Phase B geometry upgrade — logprob × cosine(X, Y-phrase) scatter with Spearman ρ headline, plus Grammar Probe Bundle export (`vector-lab.grammar-probe.v1`)
- [x] Grammar Probe Phase E — temperature sweep (T ∈ {0, 0.3, 0.7, 1.0, 1.5}) with per-model prevalence lines and "greediness index" headline
- [x] Grammar Probe pattern library aligned with Manifold Atlas — five antithesis constructions (`not-x-but-y`, `not-just-x-but-y`, `it-is-not-x-it-is-y`, `while-x-y`, `what-matters-is-not-x-but-y`) plus the three LLMbench-specific patterns
- [x] Grammar Probe suite library — four purpose suites (baseline / invitation / resistance / adversarial) and six domain suites (politics, technology, science, ethics, pedagogy, everyday), composable with per-suite stratification
- [ ] Grammar Probe Phase C (forced-continuation with Manifold Atlas hand-off)
- [ ] Grammar Probe Phases D (perturbation) and E (temperature sweep)
- [ ] Logit-bias "suppress tokens" experiment for Grammar Probe
- [ ] Embedding-based semantic similarity in divergence mode
- [ ] Supabase cloud persistence and sharing

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
