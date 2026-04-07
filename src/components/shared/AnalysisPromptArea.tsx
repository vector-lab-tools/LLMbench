"use client";

import { useState, type ReactNode } from "react";
import { Send, Loader2, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";
import { ModelSelector, type PanelSelection } from "./ModelSelector";

interface AnalysisPromptAreaProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
  panelSelection: PanelSelection;
  onPanelSelectionChange: (value: PanelSelection) => void;
  /** Extra controls rendered between the model selector and the send button */
  controls?: ReactNode;
  /** Content rendered below the input row (e.g. variation chips, info text) */
  footer?: ReactNode;
}

export function AnalysisPromptArea({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading,
  disabled,
  error,
  placeholder = "Enter a prompt...",
  panelSelection,
  onPanelSelectionChange,
  controls,
  footer,
}: AnalysisPromptAreaProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-t border-border bg-card">
      {/* Toggle strip */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-center gap-1 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/20 transition-colors"
        title={collapsed ? "Show prompt" : "Hide prompt"}
      >
        {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {!collapsed && (
    <div className="px-6 py-3 space-y-2">
      {/* Toolbar row: model selector + controls */}
      <div className="flex items-center gap-3 max-w-4xl mx-auto">
        <ModelSelector
          value={panelSelection}
          onChange={onPanelSelectionChange}
          disabled={isLoading}
        />
        {controls && (
          <>
            <div className="h-4 w-px bg-parchment" />
            {controls}
          </>
        )}
      </div>

      {/* Input row: textarea + send */}
      <div className="flex gap-2 max-w-4xl mx-auto items-end">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={placeholder}
          className="input-editorial flex-1 resize-none min-h-[52px] max-h-[160px] text-body-sm"
          rows={2}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          onClick={() => onSubmit()}
          disabled={!prompt.trim() || isLoading || disabled}
          className="btn-editorial-primary px-3 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-4xl mx-auto text-caption text-red-500 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Footer (variation chips, info text, etc.) */}
      {footer && (
        <div className="max-w-4xl mx-auto">
          {footer}
        </div>
      )}
    </div>
      )}
    </div>
  );
}
