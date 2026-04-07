/**
 * Shared system prompt utilities.
 * noMarkdown: appends a plain-prose instruction to any system prompt,
 * preventing models from returning markdown formatting in their responses.
 */

export const NO_MARKDOWN_INSTRUCTION =
  "Write your response in plain prose only. Do not use markdown formatting of any kind: " +
  "no asterisks for bold or italic, no hash symbols for headings, no hyphen or asterisk " +
  "bullet points, no numbered lists with periods, no backticks or code fences, no horizontal " +
  "rules. Use natural sentences and paragraphs. If you want to list items, write them as " +
  "prose sentences separated by commas or semicolons, or as a sequence of sentences.";

export function buildSystemPrompt(
  base: string | undefined,
  noMarkdown: boolean
): string | undefined {
  if (!noMarkdown) return base || undefined;
  const parts = [base?.trim(), NO_MARKDOWN_INSTRUCTION].filter(Boolean);
  return parts.join("\n\n");
}
