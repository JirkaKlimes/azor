"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef } from "react";

interface DocumentViewerProps {
  content: string;
  highlightStart?: number;
  highlightEnd?: number;
}

export default function DocumentViewer({
  content,
  highlightStart,
  highlightEnd,
}: DocumentViewerProps) {
  const highlightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // If we have highlight bounds, split the content and highlight the section
  if (highlightStart !== undefined && highlightEnd !== undefined) {
    const before = content.slice(0, highlightStart);
    const highlighted = content.slice(highlightStart, highlightEnd);
    const after = content.slice(highlightEnd);

    return (
      <div className="p-4 max-h-[400px] overflow-y-auto prose prose-sm dark:prose-invert prose-p:my-2 prose-headings:my-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{before}</ReactMarkdown>
        <motion.span
          ref={highlightRef}
          initial={{ backgroundColor: "rgba(250, 204, 21, 0.6)" }}
          animate={{ backgroundColor: "rgba(250, 204, 21, 0.3)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="px-0.5 rounded dark:!bg-yellow-900/50"
          style={{ backgroundColor: "rgba(250, 204, 21, 0.3)" }}
        >
          {highlighted}
        </motion.span>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{after}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="p-4 max-h-[400px] overflow-y-auto prose prose-sm dark:prose-invert prose-p:my-2 prose-headings:my-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
