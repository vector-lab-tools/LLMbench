"use client";

import { useState, useCallback } from "react";
import type { CrossPanelLink, LinkRelationType } from "@/types/links";

export function useCrossPanelLinks() {
  const [links, setLinks] = useState<CrossPanelLink[]>([]);

  const addLink = useCallback(
    (annotationAId: string, annotationBId: string, relation: LinkRelationType, content: string) => {
      const link: CrossPanelLink = {
        id: crypto.randomUUID(),
        annotationAId,
        annotationBId,
        relation,
        content,
        createdAt: new Date().toISOString(),
      };
      setLinks((prev) => [...prev, link]);
      return link.id;
    },
    []
  );

  const updateLink = useCallback((id: string, relation: LinkRelationType, content: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, relation, content } : l))
    );
  }, []);

  const deleteLink = useCallback((id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const setAllLinks = useCallback((incoming: CrossPanelLink[]) => {
    setLinks(incoming);
  }, []);

  /** Return all link IDs that reference a given annotation */
  const linksForAnnotation = useCallback(
    (annotationId: string) =>
      links.filter(
        (l) => l.annotationAId === annotationId || l.annotationBId === annotationId
      ),
    [links]
  );

  return { links, addLink, updateLink, deleteLink, setAllLinks, linksForAnnotation };
}
