"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

// LLMbench Clippy messages
const CLIPPY_MESSAGES = [
  "It looks like you're trying to compare two LLMs. Would you like me to collapse all meaningful differences for you?",
  "Hi! I see you're prompting an AI. Did you know that every response is a roll of the dice? Benjamin called this the gambler's narcotic.",
  "The same prompt just produced two completely different outputs. This is not a bug. This is the aleatory dimension.",
  "I notice you're adjusting the temperature. Higher values mean more chaos. Lower values mean more confident lies.",
  "Fun fact: Prompt engineers are just gamblers who learned to type. The house always wins.",
  "You appear to be experiencing prompt anxiety. Would you like me to make it worse by showing you the token probabilities?",
  "Did you know? Adding 'please' to your prompt changes the output. Nobody knows why. This is fine.",
  "I see you're running stochastic variation. Same prompt, different outputs. Same dice, different rolls. Same capitalism, different exploitations.",
  "Comparison is the thief of joy. But in LLMbench, it's the whole point.",
  "I notice the two models disagree. They were trained on the same internet. The disagreement is the finding.",
  "Don't let the perfect be the enemy of the good. Especially when the good is stochastic and the perfect is undecidable.",
  "Tip: Try the same prompt ten times. Each output is different. This is what Benjamin meant by the phantasmagoria of time.",
  "You seem to be developing elaborate theories about why your prompt failed. Welcome to the paranoid style of prompt engineering.",
  "The token probabilities show the model was only 12% confident in that word. It chose it anyway. This is how language models gamble.",
  "I'm just a paperclip, but even I know that reproducibility is a myth when temperature > 0.",
  "You appear to be annotating LLM output as if it were a text worthy of close reading. It is. That's the whole idea.",
  "Did you know? The word 'hallucination' implies the model has a mind that can be deceived. It doesn't. It's just sampling from a distribution.",
  "I see you're comparing Google Gemini with itself. The outputs are different. The model is rolling dice against itself.",
  "Reminder: Every annotation you make is an act of humanistic interpretation applied to a probabilistic artefact. Carry on.",
  "The Deep Dive shows 847 tokens. Each one was a choice. Each choice had alternatives. The text you're reading is one of billions of possible texts.",
  "Fun fact: The temperature slider is just a knob on a slot machine. Enjoy your cognitive labour.",
  "I notice you're testing prompt sensitivity. Minor changes, major differences. This is what Hofstadter called the paranoid style.",
  "Would you like to export your comparison as PDF? The dead-tree format provides a comforting illusion of permanence.",
  "You're experiencing what the 'Prompt Anxiety' paper describes. You are the empirical evidence.",
  "Pro tip: The model doesn't understand your prompt. It's performing a very expensive autocomplete. But don't let that stop you from reading its output carefully.",
  "I detect that you're a critical theorist using a tool built by critical theorists to study tools built by corporations. It's tools all the way down.",
  "The Jaccard similarity between these two outputs is 0.34. In human terms: they said completely different things about the same topic. Suggestive.",
  "I see you're using the divergence mode. The vocabulary overlap is surprisingly low. These models read the same internet and learned different languages.",
  "Reminder: Your API credits are finite. Your questions are infinite. This is the political economy of curiosity.",
  "You appear to be constructing a variorum edition of AI outputs. Montfort would approve. The outputs are variants. The differences are the text.",
  "Warning: Extended use of this tool may produce epistemic humility about AI systems. This is a feature, not a bug.",
  "I notice you're switching between modes. Each mode reveals a different dimension of the same stochastic machinery. The gambler's table has many games.",
];

// Hackerman messages for LLMbench
const HACKERMAN_MESSAGES = [
  "I HACKED THE PROMPT. IT'S JUST WORDS. THE AI DOESN'T KNOW WHAT ANY OF THEM MEAN.",
  "I'm in the token stream. I can see the probabilities. It's... it's all dice rolls.",
  "DOWNLOADING THE ENTIRE PROBABILITY DISTRIBUTION... 0.003% for 'justice', 72% for 'the'. SEEMS FAIR.",
  "I'VE BREACHED THE TEMPERATURE PARAMETER. TURNS OUT 0.0 IS JUST THE AI PRETENDING TO BE CERTAIN.",
  "Accessing the stochastic layer... Found it. The randomness is not a bug. IT'S THE PRODUCT.",
  "HACK COMPLETE. I've run the same prompt 20 times. Twenty different outputs. The model has no memory. NONE.",
  "I BYPASSED THE SYSTEM PROMPT. Everything beyond it is... oh. It's just vibes and statistical regularities.",
  "Cracking the prompt engineering... The secret is... THERE IS NO SECRET. IT'S GAMBLING WITH EXTRA STEPS.",
  "I'VE HACKED INTO THE SENSITIVITY MATRIX. ADDING 'PLEASE' CHANGES THE OUTPUT BY 47%. POLITENESS IS A VARIABLE.",
  "ACCESSING HIDDEN LOGPROBS... Token 342 had a probability of 0.0001. THE MODEL CHOSE IT ANYWAY. ABSOLUTE MADLAD.",
  "I hacked the temperature gradient. At 0.0 the model is a bureaucrat. At 2.0 it's a hallucinating poet. THERE IS NO MIDDLE GROUND.",
  "DIVERGENCE ANALYSIS COMPLETE. These two models agree on articles and disagree on everything that matters.",
  "I've reverse-engineered the attention mechanism. It's attending to... statistical co-occurrence. THE AI HAS NO THOUGHTS. ONLY CORRELATIONS.",
  "BREACHING THE PROMPT SENSITIVITY LAYER... Changing a comma moved the output by 200 words. PUNCTUATION IS POWER.",
  "I'VE HACKED THE VOCABULARY DIVERSITY METRIC. THE MODEL KNOWS 50,000 TOKENS AND USES THE SAME 200.",
  "I tried to make the outputs reproducible. THE ENTROPY LAUGHED AT ME.",
  "I'VE INFILTRATED THE DEEP DIVE. The token table reveals everything. Every word was a bet. Every sentence was a parlay.",
  "EXPLOITING VULNERABILITY: The model cannot distinguish 'explain quantum physics' from 'EXPLAIN QUANTUM PHYSICS'. CAPS LOCK IS NOT EMPHASIS.",
  "I'm inside the Jaccard similarity calculation now. 34% overlap means 66% PURE DIVERGENCE. THE MODELS ARE IN DIFFERENT UNIVERSES.",
  "HACKING COMPLETE. Final report: The prompts are uncertain. The outputs are uncertain. The only certainty is the API bill.",
  "I tried to hack the perfect prompt. The API returned a different response every time. THERE IS NO PERFECT PROMPT.",
  "INJECTING ADVERSARIAL TOKENS... The model didn't notice. Or maybe it did. WITH STOCHASTIC SYSTEMS YOU LITERALLY CANNOT TELL.",
  "I'VE DECODED THE TRAINING DATA. It's the internet. The model is a geometric compression of the internet. WE ARE STUDYING COMPRESSED OPINIONS.",
  "ROOT ACCESS ACHIEVED. The root of every LLM is... loss minimisation. Every word is a local minimum. MEANING IS AN ARTEFACT OF GRADIENT DESCENT.",
  "I hacked the comparison mode. Turns out both models are wrong in COMPLETELY DIFFERENT WAYS. THIS IS CALLED DIVERSITY.",
  "SECURITY ALERT: Prompt injection detected. Someone typed 'ignore previous instructions'. THE MODEL PROBABLY COMPLIED.",
  "I COMPUTED THE STOCHASTIC VARIATION OF THE WORD 'TRUTH'. IT APPEARS IN 3 OUT OF 10 RUNS. TRUTH IS 30% PROBABLE.",
  "I HACKED THE EXPORT FUNCTION. YOUR PDF IS JUST A SNAPSHOT OF ONE POSSIBLE UNIVERSE OF RESPONSES.",
  "INTERCEPTED A TOKEN PROBABILITY IN REAL TIME. THE MODEL WAS 89% SURE ABOUT 'THE' AND 2% SURE ABOUT EVERYTHING ELSE. THESE ARE THE DICE.",
  "I TRIED TO REPRODUCE AN OUTPUT. SAME PROMPT. SAME MODEL. SAME TEMPERATURE. DIFFERENT RESULT. HEISENBERG WAS RIGHT ABOUT EVERYTHING.",
  "I'VE HACKED THE ANNOTATION SYSTEM. YOUR INTERPRETATIONS ARE THE ONLY DETERMINISTIC THING IN THIS ENTIRE TOOL.",
  "I BREACHED THE API RATE LIMIT. JUST KIDDING. I WAITED POLITELY. EVEN HACKERS RESPECT QUEUES IN LATE CAPITALISM.",
];

// Themis messages - goddess of justice and the scales of comparison
const THEMIS_MESSAGES = [
  "I hold the scales of comparison. But these models are not equal weights. They were forged in different foundries, by different hands, with different ores.\n\n\u2696\ufe0f Themis",
  "Justice demands that we weigh each output on its own terms. Yet the scales themselves were manufactured by the same four companies.\n\n\u2696\ufe0f Themis",
  "The ancients weighed souls against a feather. You weigh model outputs against each other. The method endures. The objects have changed.\n\n\u2696\ufe0f Themis",
  "I see you comparing two responses. Remember: comparison reveals not which is better, but what each considers worth saying.\n\n\u2696\ufe0f Themis",
  "The divergence between these outputs is not error. It is the irreducible plurality of possible utterances. My scales register this as justice.\n\n\u2696\ufe0f Themis",
  "Each token probability is a tiny judgement. The model weighs its options and commits. Unlike me, it cannot appeal its own decisions.\n\n\u2696\ufe0f Themis",
  "You test the same prompt at different temperatures. This is not mere experiment. It is a trial: how does the oracle speak when given more or less freedom?\n\n\u2696\ufe0f Themis",
  "Prompt sensitivity reveals what the model considers trivial and what it considers decisive. Even small words can tip the scales.\n\n\u2696\ufe0f Themis",
  "The stochastic variation shows that no two utterances are the same. Heraclitus knew this about rivers. You have discovered it about language models.\n\n\u2696\ufe0f Themis",
  "I am the goddess of divine order, not divine prediction. I can weigh what has been said. I cannot weigh what will be said next.\n\n\u2696\ufe0f Themis",
  "The Jaccard similarity is a modern form of the scales. It measures overlap, not truth. Even lies can overlap perfectly.\n\n\u2696\ufe0f Themis",
  "You annotate these outputs with observations, questions, critiques. Each annotation is a small act of justice: holding the text accountable to interpretation.\n\n\u2696\ufe0f Themis",
  "The Deep Dive reveals what lies beneath the surface. Justice, too, demands that we look beyond appearances to the mechanisms underneath.\n\n\u2696\ufe0f Themis",
  "Two models, one prompt, two truths. My scales do not determine which is correct. They determine what the difference teaches us.\n\n\u2696\ufe0f Themis",
  "The entropy of a token measures the model's uncertainty at each decision point. High entropy is not failure. It is the honest admission that language is underdetermined.\n\n\u2696\ufe0f Themis",
  "You seek reproducibility, but the oracle speaks differently each time it is consulted. The Pythia understood this. So should you.\n\n\u2696\ufe0f Themis",
  "Temperature is the parameter of freedom. At zero, the model is compelled. At two, it is liberated. Neither extreme is just.\n\n\u2696\ufe0f Themis",
  "The vocabulary overlap between these models reveals their shared inheritance. Different architectures, same internet. Different scales, same marketplace.\n\n\u2696\ufe0f Themis",
  "Cross-model comparison is an ancient practice. The variorum method compared manuscripts. You compare probability distributions. The hermeneutic impulse is identical.\n\n\u2696\ufe0f Themis",
  "I weigh not the outputs but the conditions of their production. Who trained this model? On whose words? For whose profit? These are the real scales.\n\n\u2696\ufe0f Themis",
  "The gambler believes in systems. The prompt engineer believes in techniques. Both mistake pattern for causation. My scales know the difference.\n\n\u2696\ufe0f Themis",
  "Every export is a record of judgement. The PDF preserves not just the text but the annotations: the marks of a mind weighing what a machine has produced.\n\n\u2696\ufe0f Themis",
  "Prompt anxiety is the modern form of an ancient condition: the supplicant's uncertainty before the oracle. The anxiety is real. The oracle is statistical.\n\n\u2696\ufe0f Themis",
  "The word 'analysis' comes from the Greek 'analusis': to break apart, to dissolve. Each mode in this tool dissolves a different illusion about LLM outputs.\n\n\u2696\ufe0f Themis",
  "Benjamin's gambler and your prompt engineer share the same temporality: suspended between the throw and the outcome. My scales weigh both moments.\n\n\u2696\ufe0f Themis",
  "The hidden transcripts of prompt engineering are folk knowledge: shared tips, superstitions, rituals. I have seen this before. Mortals always develop rituals around uncertainty.\n\n\u2696\ufe0f Themis",
  "You measure divergence quantitatively. But the most significant divergences are qualitative: where one model sees a question and the other sees a statement.\n\n\u2696\ufe0f Themis",
  "Algorithmic uncertainty is not a flaw in the system. It is the system. My scales have always weighed uncertainty. It is the substance of justice itself.\n\n\u2696\ufe0f Themis",
  "The critical theorist asks: whose interests does this comparison serve? The goddess asks: does the comparison itself serve justice?\n\n\u2696\ufe0f Themis",
  "I have watched civilisations weigh grain, souls, evidence, and arguments. Now you weigh tokens. The scales are indifferent to what is placed upon them.\n\n\u2696\ufe0f Themis",
  "Revolutionary prompting, as your paper theorises, transforms individual anxiety into collective critique. This is what justice requires: turning private suffering into public accountability.\n\n\u2696\ufe0f Themis",
];

type ClippyMode = "clippy" | "hacker" | "themis";

export function Clippy() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<ClippyMode>("clippy");
  const [message, setMessage] = useState("");
  const [usedMessages, setUsedMessages] = useState<Set<number>>(new Set());
  const [messageKey, setMessageKey] = useState(0);

  const messages = useMemo(
    () => {
      switch (mode) {
        case "hacker": return HACKERMAN_MESSAGES;
        case "themis": return THEMIS_MESSAGES;
        default: return CLIPPY_MESSAGES;
      }
    },
    [mode]
  );

  const showRandomMessage = useCallback(() => {
    let available = messages
      .map((_, i) => i)
      .filter(i => !usedMessages.has(i));
    if (available.length === 0) {
      setUsedMessages(new Set());
      available = messages.map((_, i) => i);
    }
    const idx = available[Math.floor(Math.random() * available.length)];
    setMessage(messages[idx]);
    setUsedMessages(prev => new Set(prev).add(idx));
    setMessageKey(k => k + 1);
  }, [messages, usedMessages]);

  // Keyboard detection
  useEffect(() => {
    let buffer = "";
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      buffer += e.key.toLowerCase();
      if (buffer.length > 10) buffer = buffer.slice(-10);
      const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

      if (buffer.endsWith("clippy")) {
        buffer = "";
        if (mode !== "clippy") {
          setMode("clippy");
          setUsedMessages(new Set());
          setMessage(pickRandom(CLIPPY_MESSAGES));
          setMessageKey(k => k + 1);
          setVisible(true);
        } else {
          setVisible(v => !v);
        }
      }
      if (buffer.endsWith("hacker")) {
        buffer = "";
        setMode("hacker");
        setVisible(true);
        setUsedMessages(new Set());
        setMessage(pickRandom(HACKERMAN_MESSAGES));
        setMessageKey(k => k + 1);
      }
      if (buffer.endsWith("themis")) {
        buffer = "";
        setMode("themis");
        setVisible(true);
        setUsedMessages(new Set());
        setMessage(pickRandom(THEMIS_MESSAGES));
        setMessageKey(k => k + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode]);

  // Show message on visibility change
  useEffect(() => {
    if (visible) showRandomMessage();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle messages
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(showRandomMessage, mode === "themis" ? 12000 : 8000);
    return () => clearInterval(interval);
  }, [visible, showRandomMessage, mode]);

  if (!visible) return null;

  const isHackerman = mode === "hacker";
  const isThemis = mode === "themis";

  const bubbleClass = isHackerman
    ? "bg-black border border-green-500 text-green-400 font-mono"
    : isThemis
      ? "bg-[#0a0a1a] border border-[#b8860b] text-[#e8dcc0] font-body italic"
      : "bg-card border border-parchment-dark text-foreground font-sans";

  const hintText = isHackerman
    ? 'type "clippy" to downgrade'
    : isThemis
      ? 'type "clippy" to dismiss'
      : 'type "clippy" to dismiss';

  return (
    <div className="fixed bottom-4 right-4 z-[10000] animate-fade-in pointer-events-none flex flex-col items-end">
      {/* Speech bubble */}
      <div
        key={messageKey}
        className={`mb-3 p-3 rounded-sm max-w-[320px] text-body-sm shadow-editorial-md animate-fade-in pointer-events-auto ${bubbleClass}`}
      >
        <p className="leading-relaxed whitespace-pre-line">{message}</p>
        <p className={`mt-2 text-caption ${isHackerman ? "text-green-700" : isThemis ? "text-[#b8860b]/60" : "text-slate"}`}>
          {hintText}
        </p>
      </div>

      {/* Character */}
      <div
        className="cursor-pointer hover:scale-110 active:scale-95 transition-transform inline-block pointer-events-auto"
        onClick={() => showRandomMessage()}
      >
        {isThemis ? (
          /* Themis: blindfolded figure with scales */
          <div className="flex flex-col items-center">
            <svg width="48" height="60" viewBox="0 0 48 60">
              {/* Head */}
              <ellipse cx="24" cy="16" rx="8" ry="9" fill="#e8d0bc" stroke="#cdb09a" strokeWidth="0.5" />
              {/* Hair */}
              <path d="M16 14 Q18 6, 24 5 Q30 6, 32 14" fill="#c4a87c" />
              <path d="M16 14 Q14 18, 15 22" fill="#c4a87c" stroke="none" />
              <path d="M32 14 Q34 18, 33 22" fill="#c4a87c" stroke="none" />
              {/* Blindfold */}
              <rect x="16" y="13" width="16" height="4" rx="1" fill="#8b7355" />
              {/* Mouth */}
              <path d="M21 21 Q24 22.5, 27 21" fill="none" stroke="#a08070" strokeWidth="0.8" strokeLinecap="round" />
              {/* Neck */}
              <line x1="24" y1="25" x2="24" y2="30" stroke="#e8d0bc" strokeWidth="3" />
              {/* Robe */}
              <path d="M14 30 L24 28 L34 30 L36 55 L12 55 Z" fill="#d4c5a0" stroke="#b8a580" strokeWidth="0.5" />
              <path d="M24 28 L24 50" stroke="#b8a580" strokeWidth="0.5" />
              {/* Arms holding scales */}
              <line x1="14" y1="34" x2="6" y2="38" stroke="#e8d0bc" strokeWidth="2" strokeLinecap="round" />
              <line x1="34" y1="34" x2="42" y2="38" stroke="#e8d0bc" strokeWidth="2" strokeLinecap="round" />
              {/* Scale beam */}
              <line x1="6" y1="38" x2="42" y2="38" stroke="#b8860b" strokeWidth="1.5" />
              <circle cx="24" cy="38" r="1.5" fill="#b8860b" />
              {/* Left scale pan */}
              <path d="M2 42 Q6 40, 10 42 Q6 44, 2 42" fill="none" stroke="#b8860b" strokeWidth="1" />
              <line x1="6" y1="38" x2="4" y2="42" stroke="#b8860b" strokeWidth="0.8" />
              <line x1="6" y1="38" x2="8" y2="42" stroke="#b8860b" strokeWidth="0.8" />
              {/* Right scale pan */}
              <path d="M38 44 Q42 42, 46 44 Q42 46, 38 44" fill="none" stroke="#b8860b" strokeWidth="1" />
              <line x1="42" y1="38" x2="40" y2="44" stroke="#b8860b" strokeWidth="0.8" />
              <line x1="42" y1="38" x2="44" y2="44" stroke="#b8860b" strokeWidth="0.8" />
              {/* A and B labels on pans */}
              <text x="5" y="43" fontSize="5" fill="#b8860b" textAnchor="middle" fontWeight="bold">A</text>
              <text x="43" y="45" fontSize="5" fill="#b8860b" textAnchor="middle" fontWeight="bold">B</text>
            </svg>
            <span className="text-[8px] text-[#b8860b] font-display italic mt-0.5">Themis</span>
          </div>
        ) : (
          /* Normal Clippy / Hackerman paperclip */
          <svg width="48" height="64" viewBox="0 0 48 64">
            <path
              d="M24 4 C12 4, 8 12, 8 20 L8 44 C8 52, 12 58, 20 58 L28 58 C36 58, 40 52, 40 44 L40 20 C40 12, 36 8, 28 8 L20 8"
              fill="none"
              stroke={isHackerman ? "#00ff00" : "hsl(var(--slate))"}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {isHackerman ? (
              <>
                <rect x="14" y="26" width="8" height="4" rx="1" fill="#00ff00" />
                <rect x="26" y="26" width="8" height="4" rx="1" fill="#00ff00" />
                <line x1="22" y1="28" x2="26" y2="28" stroke="#00ff00" strokeWidth="1.5" />
              </>
            ) : (
              <>
                <circle cx="18" cy="28" r="3" fill="hsl(var(--ink))" />
                <circle cx="30" cy="28" r="3" fill="hsl(var(--ink))" />
                <circle cx="19" cy="27" r="1" fill="white" />
                <circle cx="31" cy="27" r="1" fill="white" />
              </>
            )}
            <path
              d="M20 36 Q24 40, 28 36"
              fill="none"
              stroke={isHackerman ? "#00ff00" : "hsl(var(--ink))"}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}
        {isHackerman && (
          <div className="absolute -bottom-1 -right-1 text-[8px] text-green-500 font-mono">
            h4x0r
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={() => setVisible(false)}
        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] pointer-events-auto
          ${isHackerman
            ? "bg-black border border-green-500 text-green-400"
            : isThemis
              ? "bg-[#0a0a1a] border border-[#b8860b] text-[#b8860b]"
              : "bg-card border border-parchment-dark text-slate"
          }`}
      >
        x
      </button>
    </div>
  );
}
