'use client'

import { SparklesIcon } from 'lucide-react'

interface SummaryCardProps {
    text: string
}

export default function SummaryCard({ text }: SummaryCardProps) {
    return (
        <div className="border-border bg-muted/30 rounded-lg border px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
                <div>
                    <SparklesIcon className="text-primary h-4 w-4" />
                </div>
                <span className="text-muted-foreground text-xs font-medium">Summary</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{text}</p>
        </div>
    )
}
