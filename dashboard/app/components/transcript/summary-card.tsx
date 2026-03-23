"use client";

import { SparklesIcon } from "lucide-react";

interface SummaryCardProps {
  text: string;
}

export default function SummaryCard({ text }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <div>
          <SparklesIcon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          Summary
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}
