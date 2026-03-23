"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SparklesIcon, FileSearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import DocumentCard from "./document-card";
import type { TranscriptHighlight, TranscriptSummary, Document } from "../transcript/types";
import { fadeIn } from "@/lib/animations";

interface DocumentPanelProps {
  highlights: TranscriptHighlight[];
  summary: TranscriptSummary | null;
  documents: Map<string, Document>;
  onLoadDocument: (documentId: string) => void;
  callEnded?: boolean;
  onClear?: () => void;
}

export default function DocumentPanel({
  highlights,
  summary,
  documents,
  onLoadDocument,
  callEnded,
  onClear,
}: DocumentPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new highlights arrive
  useEffect(() => {
    if (scrollRef.current && highlights.length > 0) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [highlights.length]);

  const hasData = highlights.length > 0 || summary;

  // Empty state - no data
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <motion.div
          animate={{ y: [-2, 2, -2] }}
          transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
        >
          <FileSearchIcon className="h-12 w-12 mb-4 opacity-30" />
        </motion.div>
        <p className="text-sm">Relevant documents will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Clear button when call ended */}
      {callEnded && hasData && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Documents from call</span>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <XIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto"
      >
        {/* Summary section at top */}
        <AnimatePresence>
          {summary && (
            <motion.div
              key={summary.id}
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="rounded-lg border border-border bg-muted/30 px-4 py-3 mb-2"
            >
              <div className="flex items-center gap-2 mb-2">
                <motion.div
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.3, ease: "easeOut" }}
                >
                  <SparklesIcon className="h-4 w-4 text-primary" />
                </motion.div>
                <span className="text-xs font-medium text-muted-foreground">Summary</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{summary.text}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stacked document cards */}
        <AnimatePresence mode="popLayout">
          {highlights.map((highlight, index) => (
            <DocumentCard
              key={highlight.id}
              documentId={highlight.documentId}
              start={highlight.start}
              end={highlight.end}
              text={highlight.text}
              document={documents.get(highlight.documentId)}
              onLoadDocument={onLoadDocument}
              autoExpand={index === highlights.length - 1}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
