"use client";

import { useState } from "react";
import { Link2, Plus, Trash2, Pencil, ChevronDown, ChevronUp, X } from "lucide-react";
import type { CrossPanelLink, LinkRelationType } from "@/types/links";
import type { LineAnnotation } from "@/types";
import {
  LINK_RELATION_TYPES,
  LINK_RELATION_LABELS,
  LINK_RELATION_DESCRIPTIONS,
  LINK_RELATION_COLORS,
} from "@/types/links";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CrossPanelLinksProps {
  links: CrossPanelLink[];
  annotationsA: LineAnnotation[];
  annotationsB: LineAnnotation[];
  onAdd: (annAId: string, annBId: string, relation: LinkRelationType, content: string) => void;
  onUpdate: (id: string, relation: LinkRelationType, content: string) => void;
  onDelete: (id: string) => void;
  labelA?: string;
  labelB?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function annotationSummary(ann: LineAnnotation): string {
  const type = ann.type.charAt(0).toUpperCase() + ann.type.slice(1);
  const preview = ann.content.length > 60 ? ann.content.slice(0, 60) + "…" : ann.content;
  return `L${ann.lineNumber} · ${type}: "${preview}"`;
}

function annotationShort(ann: LineAnnotation): string {
  return ann.content.length > 50 ? ann.content.slice(0, 50) + "…" : ann.content;
}

const RELATION_BORDER: Record<LinkRelationType, string> = {
  contrast: "border-l-red-400",
  parallel: "border-l-blue-400",
  divergence: "border-l-amber-400",
  convergence: "border-l-green-400",
  echo: "border-l-purple-400",
  absence: "border-l-slate-400",
  note: "border-l-burgundy/60",
};

// ─── New-Link Form ────────────────────────────────────────────────────────────

interface LinkFormProps {
  annotationsA: LineAnnotation[];
  annotationsB: LineAnnotation[];
  initial?: CrossPanelLink;
  labelA: string;
  labelB: string;
  onSubmit: (annAId: string, annBId: string, relation: LinkRelationType, content: string) => void;
  onCancel: () => void;
}

function LinkForm({ annotationsA, annotationsB, initial, labelA, labelB, onSubmit, onCancel }: LinkFormProps) {
  const [annAId, setAnnAId] = useState(initial?.annotationAId ?? "");
  const [annBId, setAnnBId] = useState(initial?.annotationBId ?? "");
  const [relation, setRelation] = useState<LinkRelationType>(initial?.relation ?? "contrast");
  const [content, setContent] = useState(initial?.content ?? "");

  const canSubmit = annAId && annBId;

  return (
    <div className="border border-parchment/60 rounded-sm p-4 bg-cream/20 space-y-3">
      <div className="text-caption font-semibold text-foreground">
        {initial ? "Edit link" : "New cross-panel link"}
      </div>

      {/* Annotation selects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide block mb-1">
            Panel A annotation — {labelA}
          </label>
          <select
            value={annAId}
            onChange={(e) => setAnnAId(e.target.value)}
            className="input-editorial w-full text-caption px-2 py-1.5"
          >
            <option value="">— select —</option>
            {annotationsA.map((a) => (
              <option key={a.id} value={a.id}>
                {annotationSummary(a)}
              </option>
            ))}
          </select>
          {annotationsA.length === 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              No annotations in Panel A yet. Create some first.
            </p>
          )}
        </div>
        <div>
          <label className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide block mb-1">
            Panel B annotation — {labelB}
          </label>
          <select
            value={annBId}
            onChange={(e) => setAnnBId(e.target.value)}
            className="input-editorial w-full text-caption px-2 py-1.5"
          >
            <option value="">— select —</option>
            {annotationsB.map((a) => (
              <option key={a.id} value={a.id}>
                {annotationSummary(a)}
              </option>
            ))}
          </select>
          {annotationsB.length === 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              No annotations in Panel B yet. Create some first.
            </p>
          )}
        </div>
      </div>

      {/* Relation type */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
          Relation
        </label>
        <div className="flex flex-wrap gap-1.5">
          {LINK_RELATION_TYPES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRelation(r)}
              title={LINK_RELATION_DESCRIPTIONS[r]}
              className={`text-caption px-2 py-0.5 rounded-sm border transition-colors ${
                relation === r
                  ? "border-transparent text-white font-medium"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
              style={relation === r ? { backgroundColor: LINK_RELATION_COLORS[r] } : undefined}
            >
              {LINK_RELATION_LABELS[r]}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{LINK_RELATION_DESCRIPTIONS[relation]}</p>
      </div>

      {/* Content */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">
          Your interpretive note <span className="text-muted-foreground/60 normal-case">(optional)</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Describe the relationship between these two annotated moments (optional)…"
          className="input-editorial w-full resize-none text-caption"
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="btn-editorial-ghost text-caption px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => canSubmit && onSubmit(annAId, annBId, relation, content.trim())}
          className="btn-editorial-primary text-caption px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {initial ? "Save" : "Create link"}
        </button>
      </div>
    </div>
  );
}

// ─── Link Card ────────────────────────────────────────────────────────────────

interface LinkCardProps {
  link: CrossPanelLink;
  annA?: LineAnnotation;
  annB?: LineAnnotation;
  labelA: string;
  labelB: string;
  annotationsA: LineAnnotation[];
  annotationsB: LineAnnotation[];
  onUpdate: (id: string, relation: LinkRelationType, content: string) => void;
  onDelete: (id: string) => void;
}

function LinkCard({ link, annA, annB, labelA, labelB, annotationsA, annotationsB, onUpdate, onDelete }: LinkCardProps) {
  const [editing, setEditing] = useState(false);
  const color = LINK_RELATION_COLORS[link.relation];

  if (editing) {
    return (
      <LinkForm
        annotationsA={annotationsA}
        annotationsB={annotationsB}
        initial={link}
        labelA={labelA}
        labelB={labelB}
        onSubmit={(annAId, annBId, relation, content) => {
          onUpdate(link.id, relation, content);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`border border-parchment/50 border-l-2 rounded-sm overflow-hidden bg-card ${RELATION_BORDER[link.relation]}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-parchment/30">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm text-white"
          style={{ backgroundColor: color }}
        >
          {LINK_RELATION_LABELS[link.relation]}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {new Date(link.createdAt).toLocaleDateString()}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
          title="Edit link"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(link.id)}
          className="p-1 rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete link"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Annotations being linked */}
      <div className="grid grid-cols-2 divide-x divide-parchment/30 text-caption">
        <div className="px-3 py-2">
          <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-0.5 uppercase tracking-wide">
            {labelA} · L{annA?.lineNumber ?? "?"}
          </div>
          <p className="text-muted-foreground font-serif italic">
            {annA ? annotationShort(annA) : <span className="text-red-400">Annotation removed</span>}
          </p>
        </div>
        <div className="px-3 py-2">
          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-0.5 uppercase tracking-wide">
            {labelB} · L{annB?.lineNumber ?? "?"}
          </div>
          <p className="text-muted-foreground font-serif italic">
            {annB ? annotationShort(annB) : <span className="text-red-400">Annotation removed</span>}
          </p>
        </div>
      </div>

      {/* Interpretive note */}
      {link.content.trim() && (
        <div className="px-4 py-3 border-t border-parchment/20 text-body-sm text-foreground font-serif leading-relaxed">
          {link.content}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CrossPanelLinks({
  links,
  annotationsA,
  annotationsB,
  onAdd,
  onUpdate,
  onDelete,
  labelA = "Panel A",
  labelB = "Panel B",
}: CrossPanelLinksProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const annMapA = Object.fromEntries(annotationsA.map((a) => [a.id, a]));
  const annMapB = Object.fromEntries(annotationsB.map((a) => [a.id, a]));

  const canCreate = annotationsA.length > 0 && annotationsB.length > 0;

  return (
    <div className="border-t border-border">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-6 py-2 bg-cream/30">
        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-caption font-semibold text-foreground hover:text-burgundy transition-colors"
        >
          Cross-Panel Links
          {links.length > 0 && (
            <span className="bg-burgundy/15 text-burgundy text-[10px] px-1.5 py-0.5 rounded-full font-medium">
              {links.length}
            </span>
          )}
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setCollapsed(false); }}
              disabled={!canCreate}
              title={
                !canCreate
                  ? "Create annotations in both panels first, then link them"
                  : "Create a new cross-panel link"
              }
              className="flex items-center gap-1 text-caption text-burgundy hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              New link
            </button>
          )}
          {showForm && (
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-6 py-4 space-y-3">
          {/* Creation form */}
          {showForm && (
            <LinkForm
              annotationsA={annotationsA}
              annotationsB={annotationsB}
              labelA={labelA}
              labelB={labelB}
              onSubmit={(annAId, annBId, relation, content) => {
                onAdd(annAId, annBId, relation, content);
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          )}

          {/* Existing links */}
          {links.length === 0 && !showForm && (
            <div className="text-center py-6 text-muted-foreground">
              <Link2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-body-sm">No cross-panel links yet.</p>
              <p className="text-caption mt-1">
                {canCreate
                  ? "Create links to record interpretive connections between annotations across the two models."
                  : "Annotate both panels first, then create links to record interpretive connections."}
              </p>
            </div>
          )}

          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              annA={annMapA[link.annotationAId]}
              annB={annMapB[link.annotationBId]}
              labelA={labelA}
              labelB={labelB}
              annotationsA={annotationsA}
              annotationsB={annotationsB}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
