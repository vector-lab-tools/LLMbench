"use client";

import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { Send, Loader2, AlertCircle, ChevronUp, ChevronDown, RotateCcw, Clock } from "lucide-react";
import { ModelSelector, type PanelSelection } from "./ModelSelector";

const HISTORY_KEY = "llmbench-prompt-history";
const HISTORY_MAX = 10;

function usePromptHistory() {
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
  });

  const push = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setHistory(prev => {
      const deduped = [trimmed, ...prev.filter(p => p !== trimmed)].slice(0, HISTORY_MAX);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(deduped)); } catch { /* quota */ }
      return deduped;
    });
  }, []);

  return { history, push };
}

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
  /** When provided, shows a Reset button that clears results */
  onReset?: () => void;
  hasResults?: boolean;
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
  onReset,
  hasResults,
}: AnalysisPromptAreaProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const { history, push } = usePromptHistory();
  const [showHistory, setShowHistory] = useState(false);
  const [historyPos, setHistoryPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const historyDropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (
        historyDropRef.current && !historyDropRef.current.contains(e.target as Node) &&
        historyBtnRef.current && !historyBtnRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHistory]);

  const collapse = useCallback(() => {
    setCollapsed(true);
    setBouncing(true);
  }, []);

  const handleToggle = useCallback(() => {
    if (collapsed) {
      setCollapsed(false);
    } else {
      collapse();
    }
  }, [collapsed, collapse]);

  const handleSubmit = useCallback(() => {
    if (prompt.trim()) push(prompt.trim());
    onSubmit();
    // Slide away after sending so results get full height
    collapse();
  }, [onSubmit, collapse, prompt, push]);

  return (
    <>
    <div className="border-t border-border bg-card">
      {/* Toggle strip — burgundy + bounce when collapsed to hint "tap to restore" */}
      <button
        onClick={handleToggle}
        onAnimationEnd={() => setBouncing(false)}
        className={`w-full flex items-center justify-center gap-1 py-1 text-[10px] transition-colors ${
          collapsed
            ? "text-burgundy hover:bg-burgundy/10"
            : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20"
        } ${bouncing ? "prompt-toggle-bounce" : ""}`}
        title={collapsed ? "Show prompt" : "Hide prompt"}
      >
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Sliding content — grid trick gives true height animation */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2 space-y-1.5">
            {/* Toolbar row: model selector + controls + reset */}
            <div className="flex items-center gap-3 flex-wrap">
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
              {onReset && hasResults && (
                <>
                  <div className="h-4 w-px bg-parchment" />
                  <button
                    onClick={onReset}
                    disabled={isLoading}
                    className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30"
                    title="Clear results and reset to initial state"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </>
              )}
            </div>

            {/* Input row: textarea + send */}
            <div className="flex gap-2 items-end">
              <div className="relative flex-1">
                <textarea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  placeholder={placeholder}
                  className="input-editorial w-full resize-none min-h-[40px] max-h-[160px] text-body-sm"
                  rows={1}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                {history.length > 0 && (
                  <button
                    ref={historyBtnRef}
                    onClick={() => {
                      if (showHistory) {
                        setShowHistory(false);
                      } else {
                        const rect = historyBtnRef.current?.getBoundingClientRect();
                        if (rect) {
                          setHistoryPos({
                            bottom: window.innerHeight - rect.top + 6,
                            left: rect.left,
                            width: Math.max(320, rect.width + 60),
                          });
                        }
                        setShowHistory(true);
                      }
                    }}
                    className="absolute right-2 bottom-2 p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
                    title="Recent prompts"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isLoading || disabled}
                className="btn-editorial-primary px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="text-caption text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Footer (variation chips, info text, etc.) */}
            {footer && (
              <div>
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Prompt history dropdown — fixed position to escape overflow:hidden parents */}
    {showHistory && historyPos && (
      <div
        ref={historyDropRef}
        className="fixed z-50 bg-card border border-border shadow-lg rounded-sm overflow-hidden"
        style={{
          bottom: historyPos.bottom,
          left: historyPos.left,
          width: historyPos.width,
          maxHeight: 280,
        }}
      >
        <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Recent prompts</span>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
          {history.map((p, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 text-caption hover:bg-cream/60 transition-colors border-b border-parchment/30 last:border-0"
              onClick={() => {
                onPromptChange(p);
                setShowHistory(false);
              }}
            >
              <span className="line-clamp-2 text-foreground">{p}</span>
            </button>
          ))}
        </div>
      </div>
    )}
  </>
  );
}
