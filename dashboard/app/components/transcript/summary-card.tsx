"use client";

import { motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import { scaleIn } from "@/lib/animations";

interface SummaryCardProps {
  text: string;
}

export default function SummaryCard({ text }: SummaryCardProps) {
  return (
    <motion.div
      layout
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="rounded-lg border border-border bg-muted/30 px-4 py-3"
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
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </motion.div>
  );
}
