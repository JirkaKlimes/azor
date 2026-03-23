"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";
import type { Document } from "./types";
import DocumentViewer from "./document-viewer";
import { scaleIn, expandCollapse } from "@/lib/animations";

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
    <motion.div
      layout
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="rounded-lg border border-border bg-background/50 overflow-hidden"
    >
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{displayName}</span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            variants={expandCollapse}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="border-t border-border overflow-hidden"
          >
            {document ? (
              <DocumentViewer
                content={document.content}
                highlightStart={start}
                highlightEnd={end}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  Loading...
                </motion.span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
