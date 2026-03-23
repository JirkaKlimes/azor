"use client";

interface ProcessingIndicatorProps {
  stage: "retrieving" | "analyzing";
}

export default function ProcessingIndicator({
  stage,
}: ProcessingIndicatorProps) {
  const text =
    stage === "retrieving" ? "Searching knowledge base" : "Analyzing";

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <span key={stage}>{text}</span>
    </div>
  );
}
