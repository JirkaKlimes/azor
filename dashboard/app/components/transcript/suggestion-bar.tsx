"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon, XIcon, LightbulbIcon } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

const MINIMUM_VISIBLE_TIME = 8000; // 8 seconds minimum
const AUTO_DISMISS_TIMEOUT = 60000; // 60 seconds max

interface SuggestionBarProps {
  suggestion: string | null;
  suggestionId: string | null;
  onDismiss: () => void;
  operatorMessageFinal?: boolean; // True when operator sends a final message
}

export default function SuggestionBar({
  suggestion,
  suggestionId,
  onDismiss,
  operatorMessageFinal,
}: SuggestionBarProps) {
  const [copied, setCopied] = useState(false);
  const [canAutoDismiss, setCanAutoDismiss] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Track when suggestion was shown
  useEffect(() => {
    if (suggestion && suggestionId) {
      shownAtRef.current = Date.now();
      setCanAutoDismiss(false);
      setCopied(false);

      // Enable auto-dismiss after minimum time
      const minTimer = setTimeout(() => {
        setCanAutoDismiss(true);
      }, MINIMUM_VISIBLE_TIME);

      // Auto-dismiss after max timeout
      autoDismissTimerRef.current = setTimeout(() => {
        onDismiss();
      }, AUTO_DISMISS_TIMEOUT);

      return () => {
        clearTimeout(minTimer);
        if (autoDismissTimerRef.current) {
          clearTimeout(autoDismissTimerRef.current);
        }
      };
    }
  }, [suggestion, suggestionId, onDismiss]);

  // Dismiss when operator sends final message (if minimum time elapsed)
  useEffect(() => {
    if (operatorMessageFinal && canAutoDismiss && suggestion) {
      onDismiss();
    }
  }, [operatorMessageFinal, canAutoDismiss, suggestion, onDismiss]);

  const handleCopy = useCallback(async () => {
    if (!suggestion) return;
    await navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Don't auto-dismiss on copy - operator might want to reference it
  }, [suggestion]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {suggestion && (
        <motion.div
          key={suggestionId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background via-background to-transparent"
        >
          <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 backdrop-blur-sm p-3">
            <div className="flex items-start gap-2">
              <LightbulbIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Suggested response
                </p>
                <p className="text-sm whitespace-pre-wrap line-clamp-4">
                  {suggestion}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={copied ? "check" : "copy"}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.1 }}
                      >
                        {copied ? (
                          <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <CopyIcon className="h-3.5 w-3.5" />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </Button>
                </motion.div>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={handleDismiss}
                    title="Dismiss"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
