"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";
import type { Document } from "./types";
import DocumentViewer from "./document-viewer";

interface HighlightCardProps {
  documentId: string;
  start: number;
  end: number;
  sourcePath?: string;
  document?: Document;
  onLoadDocument?: (documentId: string) => void;
}

export default function HighlightCard({
  documentId,
  start,
  end,
  sourcePath,
  document,
  onLoadDocument,
}: HighlightCardProps) {
  const [expanded, setExpanded] = useState(false);

  const displayName = sourcePath
    ? sourcePath.split("/").pop() || sourcePath
    : documentId;

  const handleToggle = () => {
    if (!expanded && !document) {
      onLoadDocument?.(documentId);
    }
    setExpanded(!expanded);
  };

  return (
    <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">
          {displayName}
        </span>
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
          {document ? (
            <DocumentViewer
              content={document.content}
              highlightStart={start}
              highlightEnd={end}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              <span className="animate-pulse">Loading...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
