"use client";

import { useState } from "react";

/**
 * Inline code block with a copy-to-clipboard button. Originally lived
 * inside `ProviderSettings.tsx` for the OLLAMA_ORIGINS command; extracted
 * to shared in v2.15.43 so the same component can render the command
 * inside Ollama-failure error blocks in Compare and other modes — users
 * shouldn't have to hand-select and copy a long `OLLAMA_ORIGINS="…"`
 * string out of an error message.
 */
export function CopyableCommand({
  command,
  className = "",
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; user can still select manually */
    }
  };
  return (
    <span className={`block my-1.5 flex items-start gap-1.5 ${className}`}>
      <code className="flex-1 font-mono text-[11px] bg-muted/60 px-2 py-1 rounded select-all break-all text-left">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="btn-editorial-ghost text-[10px] px-2 py-1 shrink-0"
        title="Copy to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
