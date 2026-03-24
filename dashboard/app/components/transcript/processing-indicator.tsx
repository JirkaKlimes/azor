'use client'

interface ProcessingIndicatorProps {
    stage: 'retrieving' | 'analyzing'
}

export default function ProcessingIndicator({ stage }: ProcessingIndicatorProps) {
    const text = stage === 'retrieving' ? 'Searching knowledge base' : 'Analyzing'

    return (
        <div className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
            <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                        style={{ animationDelay: `${i * 150}ms` }}
                    />
                ))}
            </span>
            <span key={stage}>{text}</span>
        </div>
    )
}
