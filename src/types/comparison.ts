// Comparison types for local persistence
import type { LineAnnotation } from "./annotations";
import type { OutputProvenance } from "./ai-settings";
import type { CrossPanelLink } from "./links";

export interface ComparisonOutput {
  text: string;
  provenance: OutputProvenance;
  error?: string;
}

export interface SavedComparison {
  id: string;
  name: string;
  prompt: string;
  outputA: ComparisonOutput | null;
  outputB: ComparisonOutput | null;
  annotationsA: LineAnnotation[];
  annotationsB: LineAnnotation[];
  crossPanelLinks?: CrossPanelLink[];
  createdAt: string;
  updatedAt: string;
}
