/**
 * Cross-panel annotation links for LLMbench
 *
 * A CrossPanelLink connects one annotation in Panel A to one annotation in
 * Panel B, recording the interpretive relationship between them. It is the
 * structured artefact of comparative close reading: making explicit what the
 * side-by-side display only implies.
 */

export interface CrossPanelLink {
  id: string;
  /** ID of the annotation in Panel A */
  annotationAId: string;
  /** ID of the annotation in Panel B */
  annotationBId: string;
  /** Descriptive label for the relationship type */
  relation: LinkRelationType;
  /** Free-text explanation of the connection */
  content: string;
  createdAt: string;
}

export type LinkRelationType =
  | "contrast"     // The two annotations reveal a meaningful difference
  | "parallel"     // The two annotations handle the same move differently
  | "divergence"   // The models branch from a shared premise
  | "convergence"  // The models arrive at the same point via different routes
  | "echo"         // One model's phrasing is echoed or borrowed in the other
  | "absence"      // One panel has something the other conspicuously lacks
  | "note";        // General interpretive note spanning both panels

export const LINK_RELATION_LABELS: Record<LinkRelationType, string> = {
  contrast: "Contrast",
  parallel: "Parallel",
  divergence: "Divergence",
  convergence: "Convergence",
  echo: "Echo",
  absence: "Absence",
  note: "Note",
};

export const LINK_RELATION_DESCRIPTIONS: Record<LinkRelationType, string> = {
  contrast: "The two annotations reveal a meaningful difference in how each model handles this moment",
  parallel: "Both models make the same structural move but via different vocabulary or framing",
  divergence: "The models branch from a shared premise — same start, different trajectories",
  convergence: "The models arrive at the same point via different routes",
  echo: "One model's phrasing is echoed or borrowed in the other — shared training signal?",
  absence: "One panel has something the other conspicuously lacks — significant by omission",
  note: "A general interpretive note that connects these two moments across the comparison",
};

export const LINK_RELATION_TYPES: LinkRelationType[] = [
  "contrast",
  "parallel",
  "divergence",
  "convergence",
  "echo",
  "absence",
  "note",
];

export const LINK_RELATION_COLORS: Record<LinkRelationType, string> = {
  contrast: "#dc2626",    // red
  parallel: "#2563eb",    // blue
  divergence: "#d97706",  // amber
  convergence: "#16a34a", // green
  echo: "#9333ea",        // purple
  absence: "#64748b",     // slate
  note: "#8b2942",        // burgundy
};
