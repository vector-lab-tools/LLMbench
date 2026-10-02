# LLMbench — Screenshots plan

Drop PNGs into `docs/screenshots/` with the filenames below. When they're in place, the entries will be wired into README.md at the sections named. Captions are drafted and ready to use.

**Resolution.** Shoot at 2× (Retina) — native width **2560–2880px** so the images stay crisp when GitHub scales them in the README view and when readers click through to see the panel at full size. On macOS, Cmd-Shift-5 captures the physical pixels of the window; if the window is at a 1440px CSS width, the resulting PNG is 2880px. Confirm the saved file is ≥ 2400px wide before dropping it in — anything narrower reads soft on Retina screens.

Save as **PNG** (lossless; no JPEG for UI). Crop to the panel of interest where it reads better than a full-window shot. Light theme is the default; dark theme shots can go alongside with a `-dark` suffix if you want both.

---

## Priority 1 — Hero and overview (3)

### `overview.png`
- **What:** The app at launch showing the Compare / Analyse / Investigate tier tabs and a dual-panel generation already run (annotated if possible).
- **README slot:** New hero image directly under the title block (before **## Scholarly Context**, around line 30).
- **Caption:** `LLMbench: dual-panel close reading of generated prose across two models, with annotation, logprobs, and six analytical probes.`

### `settings-providers.png`
- **What:** Settings header expanded, showing provider rows (OpenAI, Anthropic, Google, Hugging Face, OpenRouter, OpenAI-compatible, Ollama) with the Auto-fetch logprobs toggle visible.
- **README slot:** Under **## Chat Models and Token Probabilities: A Primer → ### Logprobs as a first-class layer** (around line 52).
- **Caption:** `Seven providers configured through the Settings header; auto-fetch of logprobs is on by default so the Probs view is a visual toggle, not a new request.`

### `tier-navigation.png`
- **What:** Close-up of the tier tab bar showing Compare / Analyse / Investigate with mode sub-tabs visible.
- **README slot:** Top of **## Operations at a Glance** (line 78).
- **Caption:** `Three tiers of operations: Compare for close reading, Analyse for empirical probes, Investigate for pattern-specific interrogation.`

---

## Priority 2 — Compare mode (3)

### `compare-dual-panel.png`
- **What:** Full dual-panel generation from two models on the same prompt, both panels visible with text streaming or complete.
- **README slot:** Top of **## Compare Mode (Dual Panel)** (line 152).
- **Caption:** `Compare: two models respond to the same prompt in parallel; the surface of their generated prose becomes the object of analysis.`

### `compare-annotations.png`
- **What:** Compare view with annotations visible on both panels, ideally with a cross-panel link visible (typed relation like contrast or parallel).
- **README slot:** Under **### Core features** (around line 156).
- **Caption:** `Annotations layer on both panels; cross-panel links carry typed relations (contrast, parallel, divergence, convergence, echo, absence, note) with free-text notes.`

### `compare-probs-overlay.png`
- **What:** Compare mode with the Probs overlay active — token heatmap visible over the text, colours running from pale yellow through orange to deep red.
- **README slot:** Under **### Four overlay views** (around line 166).
- **Caption:** `The Probs overlay: tokens coloured by probability, with the 70% confident-silence threshold leaving confident spans visually quiet so uncertainty draws the eye.`

---

## Priority 3 — Analyse tier (4)

### `stochastic-variation.png`
- **What:** Stochastic mode showing a distribution of responses to the same prompt — several completions stacked, with the summary banner.
- **README slot:** **### Stochastic Variation** (line 193).
- **Caption:** `Stochastic Variation: repeated generation from one model showing the distribution of responses to the same prompt.`

### `temperature-gradient.png`
- **What:** Temperature mode showing a row or grid of generations across different temperature settings (0.0, 0.3, 0.7, 1.0, 1.5).
- **README slot:** **### Temperature Gradient** (line 196).
- **Caption:** `Temperature Gradient: how stochasticity plays across parameter values, with completions laid out side by side for comparison.`

### `token-probabilities-3d.png`
- **What:** Standalone Token Probabilities mode showing the 3D probability skyline or pixel map.
- **README slot:** **### Token Probabilities (standalone mode)** (line 202).
- **Caption:** `Token Probabilities as a geometric object: 3D skyline of per-position distributions, with perplexity or Shannon entropy as the vertical axis.`

### `cross-model-divergence.png`
- **What:** Divergence mode summary — cosine similarity, Jaccard, word overlap, uniqueness readouts for a two-model run.
- **README slot:** **### Cross-Model Divergence** (line 211).
- **Caption:** `Cross-Model Divergence: cosine similarity, Jaccard, Dice word overlap, and uniqueness, each on its own axis.`

---

## Priority 4 — Investigate tier (3)

### `grammar-probe-phase-a.png`
- **What:** Grammar Probe Phase A heatmap: prevalence across pattern × prompt × model × temperature.
- **README slot:** Under **### Grammar Probe (Investigate tier)** (line 95), early in the section.
- **Caption:** `Grammar Probe Phase A: prevalence of a construction (e.g. "Not X but Y") across prompts, models, and temperatures as a heatmap.`

### `grammar-probe-phase-b.png`
- **What:** Grammar Probe Phase B continuation logprobs: top-K distribution at the scaffold's fork point, with entropy readout.
- **README slot:** Later in **### Grammar Probe (Investigate tier)** (around line 100).
- **Caption:** `Grammar Probe Phase B: top-K continuation logprobs at the fork point of a scaffold, with per-position entropy and the "suppress tokens" view.`

### `sampling-probe-transcript.png`
- **What:** Sampling Probe Investigate mode showing the per-token transcript with override audit log visible to the side.
- **README slot:** Top of **### Sampling Probe (Investigate tier, new in v2.15.0)** (line 139).
- **Caption:** `Sampling Probe: sampling itself as an inspectable surface — per-token transcript with an override audit log recording every intervention.`

---

## Priority 5 — General features, extras (2, optional)

### `prompt-history.png`
- **What:** Prompt history browser open (recent prompts list).
- **README slot:** Early in **## General Features** (line 214).
- **Caption:** `Prompt history: the last ten prompts across every mode, persisted to localStorage.`

### `pdf-export-sample.png`
- **What:** Cropped page from an exported Probs PDF showing the annotated token text with reading key.
- **README slot:** Under **## General Features**, near PDF export (after line 214).
- **Caption:** `PDF export: annotated token text with format, probability, entropy thresholds, and worked examples; CSV and PDF carry the full metric trace.`

---

## Totals

- Priority 1: 3
- Priority 2: 3
- Priority 3: 4
- Priority 4: 3
- Priority 5: 2 optional

**Minimum useful set:** Priorities 1 and 2 = 6 images. Add Priority 3 for Analyse coverage, Priority 4 for the Investigate tier the paper and tool argument depend on.
