"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "operator" | "customer";
  content: string;
  isPartial?: boolean;
}

export default function MessageBubble({
  role,
  content,
  isPartial,
}: MessageBubbleProps) {
  const isOperator = role === "operator";
  const hasAnimated = useRef(false);

  // Only animate on first mount
  useEffect(() => {
    hasAnimated.current = true;
  }, []);

  return (
    <motion.div
      initial={hasAnimated.current ? false : { opacity: 0, x: isOperator ? 16 : -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isOperator ? 8 : -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "max-w-[80%] rounded-lg px-4 py-2",
        isOperator
          ? "ml-auto bg-primary text-primary-foreground"
          : "mr-auto bg-muted",
        isPartial && "opacity-70"
      )}
    >
      <p className="text-sm whitespace-pre-wrap">{content}</p>
    </motion.div>
  );
}
