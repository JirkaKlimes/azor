"use client";

import { motion, AnimatePresence } from "framer-motion";
import { fadeIn } from "@/lib/animations";

interface ProcessingIndicatorProps {
  stage: "retrieving" | "analyzing";
}

export default function ProcessingIndicator({ stage }: ProcessingIndicatorProps) {
  const text = stage === "retrieving" ? "Searching knowledge base" : "Analyzing";

  return (
    <motion.div
      layout
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex items-center gap-2 text-xs text-muted-foreground py-2"
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-current"
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={stage}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
