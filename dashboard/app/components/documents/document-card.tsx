"use client";

import { ChevronDownIcon, FileTextIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, getDocumentTitle } from "@/lib/utils";
import type { Document } from "../transcript/types";

interface DocumentCardProps {
  documentId: string;
  start: number;
  end: number;
  document?: Document;
  onLoadDocument?: (documentId: string) => void;
  autoExpand?: boolean;
}

export default function DocumentCard({
  documentId,
  start,
  end,
  document,
  onLoadDocument,
  autoExpand = true,
}: DocumentCardProps) {
  const [expanded, setExpanded] = useState(autoExpand);
  const highlightRef = useRef<HTMLElement>(null);

  const title = getDocumentTitle(document?.sourcePath, documentId);

  // Auto-load document when card mounts or expands
  useEffect(() => {
    if (expanded && !document) {
      onLoadDocument?.(documentId);
    }
  }, [expanded, document, documentId, onLoadDocument]);

  // Scroll to highlight when document loads
  useEffect(() => {
    if (document && highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "instant",
        block: "center",
      });
    }
  }, [document]);

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  // Render document content with highlight
  const renderContent = () => {
    if (!document) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          <span className="animate-pulse">Loading document...</span>
        </div>
      );
    }

    const content = document.content;
    const before = content.slice(0, start);
    const highlighted = content.slice(start, end);
    const after = content.slice(end);

    return (
      <div className="max-h-75 overflow-y-auto">
        <div className="p-4 prose prose-sm prose-max-w-none max-w-none dark:prose-invert prose-p:my-2 prose-headings:my-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{before}</ReactMarkdown>
          <mark
            ref={highlightRef}
            className="bg-yellow-300 dark:bg-yellow-500/60 text-foreground rounded px-0.5"
          >
            {highlighted}
          </mark>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{after}</ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{title}</span>
        <div
          className={cn(
            "transition-transform duration-200",
            expanded && "rotate-180",
          )}
        >
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border overflow-hidden">
          {renderContent()}
        </div>
      )}
    </div>
  );
}
