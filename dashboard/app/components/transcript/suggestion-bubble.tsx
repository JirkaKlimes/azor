"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { slideUp } from "@/lib/animations";

interface SuggestionBubbleProps {
  text: string;
  onUse?: (text: string) => void;
}

export default function SuggestionBubble({ text, onUse }: SuggestionBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onUse?.(text);
  };

  return (
    <motion.div
      layout
      variants={slideUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="ml-auto max-w-[80%] rounded-lg px-4 py-3 border-2 border-dashed border-primary/40 bg-primary/5"
    >
      <p className="text-xs text-muted-foreground mb-2 font-medium">
        Suggested response
      </p>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
      <div className="mt-2 flex justify-end">
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button size="xs" variant="ghost" onClick={handleCopy}>
            <motion.span
              key={copied ? "check" : "copy"}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon className="h-3 w-3" />
                  Copy
                </>
              )}
            </motion.span>
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
