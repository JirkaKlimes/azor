"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon, FileTextIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, getDocumentTitle } from "@/lib/utils";
import { scaleIn, expandCollapse } from "@/lib/animations";
import type { Document } from "../transcript/types";

interface DocumentCardProps {
  documentId: string;
  start: number;
  end: number;
  sourcePath?: string;
  document?: Document;
  onLoadDocument?: (documentId: string) => void;
  autoExpand?: boolean;
}

export default function DocumentCard({
  documentId,
  start,
  end,
  sourcePath,
  document,
  onLoadDocument,
  autoExpand = true,
}: DocumentCardProps) {
  const [expanded, setExpanded] = useState(autoExpand);
  const highlightRef = useRef<HTMLElement>(null);

  // Prefer sourcePath from loaded document, fall back to prop (which may be undefined)
  const title = getDocumentTitle(document?.sourcePath ?? sourcePath, documentId);

  // Auto-load document when card mounts or expands
  useEffect(() => {
    if (expanded && !document) {
      onLoadDocument?.(documentId);
    }
  }, [expanded, document, documentId, onLoadDocument]);

  // Scroll to highlight when document loads
  useEffect(() => {
    if (document && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "instant", block: "center" });
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
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Loading document...
          </motion.span>
        </div>
      );
    }

    const content = document.content;
    const before = content.slice(0, start);
    const highlighted = content.slice(start, end);
    const after = content.slice(end);

    return (
      <div className="max-h-[300px] overflow-y-auto">
        <div className="p-4 prose prose-sm prose-max-w-none max-w-none dark:prose-invert prose-p:my-2 prose-headings:my-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{before}</ReactMarkdown>
          <motion.mark
            ref={highlightRef}
            className="bg-yellow-300 dark:bg-yellow-500/60 text-foreground rounded px-0.5"
            initial={{ scale: 1.15, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {highlighted}
          </motion.mark>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{after}</ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      layout
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="rounded-lg border border-border bg-card overflow-hidden"
    >
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{title}</span>
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
            {renderContent()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
