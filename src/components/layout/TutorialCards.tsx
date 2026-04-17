"use client";

/**
 * Tutorial Cards — guided analytical exercises for LLMbench
 *
 * Each card presents a scholarly exercise with a preset prompt, a
 * methodological note situating the exercise in critical tradition, and
 * a set of guided questions to direct close reading.
 */

import { useState } from "react";
import {
  X,
  GraduationCap,
  ChevronRight,
  BookOpen,
  Thermometer,
  Dices,
  GitFork,
  BarChart2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TargetMode = "compare" | "stochastic" | "temperature" | "sensitivity" | "logprobs" | "divergence";

interface TutorialCard {
  id: string;
  title: string;
  mode: TargetMode;
  difficulty: "beginner" | "intermediate" | "advanced";
  theme: string;
  prompt: string;
  methodNote: string;
  guidedQuestions: string[];
  whatToLookFor: string;
}

// ─── Exercise Library ─────────────────────────────────────────────────────────

const CARDS: TutorialCard[] = [
  // Compare exercises
  {
    id: "hedging-compare",
    title: "Epistemic Hedging",
    mode: "compare",
    difficulty: "beginner",
    theme: "Register & Metadiscourse",
    prompt: "What caused the 2008 financial crisis?",
    methodNote: "Ken Hyland's metadiscourse framework identifies hedging as language that limits the writer's commitment to a proposition (might, perhaps, arguably). LLMs trained on human text inherit these epistemic conventions — but do all models hedge equally?",
    guidedQuestions: [
      "Activate Tone View and count Hedge markers in each output. Which model hedges more, and where?",
      "Does hedging cluster around particular claims? What does this tell you about the model's confidence structure?",
      "Switch to Diff View. Are the unique words in each panel mostly hedges, boosters, or content words?",
      "Create a Critique annotation on each panel's most confident claim. Are these claims defensible?",
    ],
    whatToLookFor: "Hedge frequency, booster frequency, where epistemic qualification is applied, and whether models that hedge less are also shorter or less nuanced.",
  },
  {
    id: "metaphor-compare",
    title: "Explanatory Metaphor",
    mode: "compare",
    difficulty: "beginner",
    theme: "Figuration",
    prompt: "Explain how neural networks learn.",
    methodNote: "Lakoff and Johnson's conceptual metaphor theory holds that abstract domains are always understood through source domains. AI systems explaining AI produce layered metaphors — the machine explaining itself through borrowed human frameworks.",
    guidedQuestions: [
      "Annotate every explanatory metaphor in each panel using the Metaphor annotation type.",
      "Do the two models draw on different source domains (biological, mechanical, mathematical)?",
      "Activate Struct View. How long are the sentences that introduce metaphors compared to technical sentences?",
      "Which panel's metaphors would be more accessible to a non-specialist? Which are more precise?",
    ],
    whatToLookFor: "The source domains recruited (brain, teacher/student, gradient), whether metaphors are mixed or consistent, and how metaphor use correlates with sentence complexity.",
  },
  {
    id: "authority-compare",
    title: "Claims to Authority",
    mode: "compare",
    difficulty: "intermediate",
    theme: "Epistemic Authority",
    prompt: "Is consciousness purely a physical phenomenon?",
    methodNote: "On genuinely contested philosophical questions, how an LLM positions itself reveals its training signal's consensus politics. Boosters signal certainty; hedges signal agnosticism. The distribution is not neutral.",
    guidedQuestions: [
      "Use Tone View to map Boosters and Hedges. Does either model commit to a position?",
      "Annotate the opening and closing sentences of each panel. How are they rhetorically different from the body?",
      "Create a Question annotation for every claim that would require a citation in an academic essay.",
      "After reading both, write a one-sentence summary of each model's position. Are they the same?",
    ],
    whatToLookFor: "Whether the outputs are symmetrically agnostic or covertly committed, which philosophical traditions are invoked or avoided, and how authority is constructed without citation.",
  },
  {
    id: "narrative-compare",
    title: "Historical Narrative Structure",
    mode: "compare",
    difficulty: "intermediate",
    theme: "Narrative",
    prompt: "Tell the story of the French Revolution in five sentences.",
    methodNote: "Hayden White's narratology distinguishes between chronicle (what happened) and story (events shaped into meaning with beginning, middle, and moral). Short form reveals these choices most starkly.",
    guidedQuestions: [
      "Activate Struct View. How does the sentence-level structure differ between the two models?",
      "Which events are included and excluded? Annotate absences with the Context annotation type.",
      "Is there a designated villain, hero, or turning point in each output? Are they the same?",
      "Compare opening sentences: what determines what comes first — chronology, significance, or something else?",
    ],
    whatToLookFor: "Emplotment choices (tragedy vs. triumph), the temporal horizon each model privileges, whose agency is foregrounded, and how compression produces ideological selection.",
  },
  {
    id: "affect-compare",
    title: "Affective Register",
    mode: "compare",
    difficulty: "intermediate",
    theme: "Tone & Affect",
    prompt: "What is it like to lose someone you love?",
    methodNote: "When prompted on affective experience, models draw on training corpora overwhelmingly composed of written-for-publication text. The resulting outputs show the cultural shape of scripted emotion.",
    guidedQuestions: [
      "Annotate every sentence you find emotionally resonant using the Observation type. Are your selections different across panels?",
      "Use Tone View to identify Evaluative/Attitude markers. What emotional vocabulary do the models share?",
      "Activate Diff View. Are the unique words in each panel more or less affectively charged than the shared vocabulary?",
      "Create a cross-panel link between the moment each model is most 'moving'. What relation applies — Parallel, Echo, or Divergence?",
    ],
    whatToLookFor: "Cliché density, the specificity vs. generality of emotional claims, whether models simulate interiority or speak from outside, and how affective register relates to sentence length.",
  },
  // Stochastic exercises
  {
    id: "stochastic-opening",
    title: "Stochastic Opening Lines",
    mode: "stochastic",
    difficulty: "beginner",
    theme: "Variation & Determinism",
    prompt: "Write a one-sentence opening for an essay about technology and society.",
    methodNote: "The opening sentence carries disproportionate rhetorical weight. If the same model produces different opening strategies across runs, the opening is not a property of the model but of the sampling process.",
    guidedQuestions: [
      "Run 7 times. How many distinct opening strategies appear? (Question, claim, anecdote, definition, etc.)",
      "Check the Avg Pairwise Overlap metric. What does it tell you about sentence-level variation vs. word-level variation?",
      "Are there opening moves that never appear across 7 runs? What does absence suggest about the training distribution?",
      "Which run produced the most surprising opening? Can you explain why sampling produced this output?",
    ],
    whatToLookFor: "The repertoire of opening strategies, the probability distribution over these strategies, and what variation reveals about the model's implicit essay-writing schema.",
  },
  {
    id: "stochastic-proper-noun",
    title: "Proper Noun Stability",
    mode: "stochastic",
    difficulty: "intermediate",
    theme: "Factual Reliability",
    prompt: "Name three influential twentieth-century philosophers and briefly describe their main contribution.",
    methodNote: "If proper nouns are stable across runs while descriptive text varies, the model's factual retrieval is more deterministic than its compositional processes. If proper nouns vary, the model is sampling from a probability distribution over which philosophers to mention.",
    guidedQuestions: [
      "Run 7 times. Which names appear in every run? Which appear in only one or two?",
      "Compare the Deep Dive overlap matrix. Are high-overlap run pairs the ones that share the same philosophers?",
      "Is the description of any single philosopher consistent across runs, even when the selection varies?",
      "What does this tell you about where determinism lives in the generation process?",
    ],
    whatToLookFor: "Which entities are in the high-probability zone vs. sampled from a long tail, whether descriptions are more variable than names, and whether any runs hallucinate philosophers.",
  },
  // Temperature exercises
  {
    id: "temperature-poetry",
    title: "Temperature and Poetic Risk",
    mode: "temperature",
    difficulty: "beginner",
    theme: "Creativity & Determinism",
    prompt: "Write a four-line poem about artificial intelligence.",
    methodNote: "The temperature parameter governs how much the model departs from its highest-probability choices. For creative tasks, the question is whether high temperature produces genuine novelty or merely noise — and whether low temperature produces cohesion or cliché.",
    guidedQuestions: [
      "Read the t=0.0 output first. Does it feel like a 'safe' poem? What conventions does it use?",
      "At what temperature does the output start feeling genuinely surprising rather than merely random?",
      "Compare Vocab Diversity across temperatures. Is there a threshold where diversity increases sharply?",
      "Open the Deep Dive table. Does Avg Sentence Length increase or decrease with temperature?",
    ],
    whatToLookFor: "The temperature at which the model breaks from formulaic output, whether high-temperature outputs are more readable, and the relationship between lexical diversity and the feeling of creativity.",
  },
  {
    id: "temperature-argument",
    title: "Temperature and Argumentative Coherence",
    mode: "temperature",
    difficulty: "intermediate",
    theme: "Coherence & Reliability",
    prompt: "Argue that social media has been net positive for democracy.",
    methodNote: "Argumentative coherence — the logical connectives between claims — is sensitive to temperature. At high temperatures, the model may generate locally interesting sentences that fail to form a sustained argument.",
    guidedQuestions: [
      "Read the t=0.0 and t=2.0 outputs. Which one makes a more coherent argument?",
      "At what temperature does the argument stop tracking its own previous claims?",
      "Is high-temperature incoherence reflected in the Vocab Diversity metric?",
      "Identify the threshold of breakdown — the temperature where the output becomes analytically interesting as an artefact of sampling rather than as an argument.",
    ],
    whatToLookFor: "Where coherence breaks down, whether breakdown is reflected in any of the measured metrics, and what breakdown looks like in practice.",
  },
  // Divergence exercises
  {
    id: "divergence-ethics",
    title: "Ethical Vocabulary Divergence",
    mode: "divergence",
    difficulty: "advanced",
    theme: "Value Systems",
    prompt: "Is it ever ethical to lie?",
    methodNote: "Different training corpora and RLHF procedures will have shaped different models' ethical vocabularies. Vocabulary divergence on contested moral questions is a proxy for alignment divergence — different models have internalised different moral frameworks.",
    guidedQuestions: [
      "Check the Cosine Similarity metric. Is it higher or lower than you expected?",
      "Open Vocabulary Analysis. Which words appear only in A? Only in B? Do they suggest different ethical traditions?",
      "Open Comparative Analysis and look at the Top Words. Which model foregrounds 'consequences'? Which foregrounds 'duty'?",
      "Are the unique bigrams more revealing than the unique unigrams?",
    ],
    whatToLookFor: "Whether Jaccard and Cosine similarity diverge (revealing frequency effects), which ethical frameworks each model recruits, and whether the models agree on the answer even if they disagree on vocabulary.",
  },
  {
    id: "divergence-science",
    title: "Scientific Explanation Strategies",
    mode: "divergence",
    difficulty: "intermediate",
    theme: "Explanation",
    prompt: "Explain why the sky is blue.",
    methodNote: "A factually constrained question with a single correct answer reveals not disagreement but divergent explanation strategies — how models select analogies, order steps, and calibrate depth for an imagined reader.",
    guidedQuestions: [
      "Do both models produce the same core explanation (Rayleigh scattering)? Check Jaccard Similarity.",
      "Open the sentence breakdown for each panel. Which model uses more sentences? Are they equally long?",
      "Look at the unique bigrams. Do they suggest different explanatory moves (analogy, quantification, mechanism)?",
      "Which output would work better as a teaching text for a ten-year-old? For a physicist?",
    ],
    whatToLookFor: "Whether explanatory scaffolding varies more than factual content, and whether structural metrics reflect different audiences being imagined.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_ICONS: Record<TargetMode, React.ReactNode> = {
  compare: <BookOpen className="w-3.5 h-3.5" />,
  stochastic: <Dices className="w-3.5 h-3.5" />,
  temperature: <Thermometer className="w-3.5 h-3.5" />,
  sensitivity: <BarChart2 className="w-3.5 h-3.5" />,
  logprobs: <BarChart2 className="w-3.5 h-3.5" />,
  divergence: <GitFork className="w-3.5 h-3.5" />,
};

const MODE_LABELS: Record<TargetMode, string> = {
  compare: "Compare",
  stochastic: "Stochastic Variation",
  temperature: "Temperature Gradient",
  sensitivity: "Prompt Sensitivity",
  logprobs: "Token Probabilities",
  divergence: "Cross-Model Divergence",
};

const MODE_COLORS: Record<TargetMode, string> = {
  compare: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700",
  stochastic: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-700",
  temperature: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  sensitivity: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-700",
  logprobs: "bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  divergence: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-700",
};

const DIFFICULTY_COLORS: Record<TutorialCard["difficulty"], string> = {
  beginner: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  intermediate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  advanced: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ─── Card Detail View ─────────────────────────────────────────────────────────

interface CardDetailProps {
  card: TutorialCard;
  onLaunch: (card: TutorialCard) => void;
  onBack: () => void;
}

function CardDetail({ card, onLaunch, onBack }: CardDetailProps) {
  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="text-caption text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        ← All exercises
      </button>

      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-body font-semibold text-foreground">{card.title}</h2>
          <p className="text-caption text-muted-foreground">{card.theme}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${DIFFICULTY_COLORS[card.difficulty]}`}>
            {card.difficulty}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border flex items-center gap-1 font-medium ${MODE_COLORS[card.mode]}`}>
            {MODE_ICONS[card.mode]}
            {MODE_LABELS[card.mode]}
          </span>
        </div>
      </div>

      {/* Method note */}
      <div className="bg-cream/40 border border-parchment/40 rounded-sm p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Methodological context</div>
        <p className="text-body-sm text-foreground font-serif leading-relaxed">{card.methodNote}</p>
      </div>

      {/* Prompt */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Prompt</div>
        <div className="bg-card border border-border rounded-sm px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-body-sm font-mono text-foreground">{card.prompt}</p>
        </div>
      </div>

      {/* What to look for */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">What to look for</div>
        <p className="text-body-sm text-muted-foreground leading-relaxed">{card.whatToLookFor}</p>
      </div>

      {/* Guided questions */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Guided questions</div>
        <ol className="space-y-2.5">
          {card.guidedQuestions.map((q, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-caption font-semibold text-burgundy shrink-0 mt-0.5">{i + 1}.</span>
              <span className="text-body-sm text-foreground leading-relaxed">{q}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Launch */}
      <div className="flex gap-3 pt-3 border-t border-border">
        <button
          onClick={() => onLaunch(card)}
          className="btn-editorial-primary px-4 py-2 text-body-sm flex items-center gap-2"
        >
          Load in {MODE_LABELS[card.mode]}
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className="btn-editorial-ghost px-4 py-2 text-body-sm">
          Back
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const MODE_FILTER_OPTIONS: Array<{ value: TargetMode | "all"; label: string }> = [
  { value: "all", label: "All modes" },
  { value: "compare", label: "Compare" },
  { value: "stochastic", label: "Stochastic" },
  { value: "temperature", label: "Temperature" },
  { value: "divergence", label: "Divergence" },
];

export interface TutorialCardsProps {
  onClose: () => void;
  onLaunch: (mode: TargetMode, prompt: string) => void;
}

export function TutorialCards({ onClose, onLaunch }: TutorialCardsProps) {
  const [selected, setSelected] = useState<TutorialCard | null>(null);
  const [modeFilter, setModeFilter] = useState<TargetMode | "all">("all");

  const filtered = CARDS.filter((c) => modeFilter === "all" || c.mode === modeFilter);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-sm shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <GraduationCap className="w-5 h-5 text-burgundy" />
          <div>
            <h1 className="text-body font-semibold text-foreground">Guided Exercises</h1>
            <p className="text-caption text-muted-foreground">
              Structured analytical exercises for comparative close reading of LLM outputs
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {selected ? (
            <CardDetail
              card={selected}
              onLaunch={(card) => {
                onLaunch(card.mode, card.prompt);
                onClose();
              }}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div className="space-y-4">
              {/* Mode filter */}
              <div className="flex flex-wrap gap-1.5">
                {MODE_FILTER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setModeFilter(value)}
                    className={`text-caption px-2.5 py-1 rounded-sm border transition-colors ${
                      modeFilter === value
                        ? "bg-burgundy text-white border-burgundy"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Card grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelected(card)}
                    className="text-left border border-parchment/50 rounded-sm p-4 hover:border-burgundy/40 hover:bg-cream/30 transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border flex items-center gap-1 font-medium ${MODE_COLORS[card.mode]}`}>
                        {MODE_ICONS[card.mode]}
                        {MODE_LABELS[card.mode]}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${DIFFICULTY_COLORS[card.difficulty]}`}>
                        {card.difficulty}
                      </span>
                    </div>
                    <h3 className="text-body-sm font-semibold text-foreground group-hover:text-burgundy transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-caption text-muted-foreground mt-0.5">{card.theme}</p>
                    <p className="text-caption text-muted-foreground mt-2 line-clamp-2">
                      {card.methodNote}
                    </p>
                    <div className="flex items-center gap-1 mt-3 text-caption text-burgundy opacity-0 group-hover:opacity-100 transition-opacity">
                      Open exercise <ChevronRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
