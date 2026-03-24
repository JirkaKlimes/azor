'use client'

import { useEffect, useRef } from 'react'
import { SparklesIcon, FileSearchIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DocumentCard from './document-card'
import type {
    TranscriptHighlight,
    TranscriptSummary,
    Document,
} from '../transcript/types'

interface DocumentPanelProps {
    highlights: TranscriptHighlight[]
    summary: TranscriptSummary | null
    documents: Map<string, Document>
    onLoadDocument: (documentId: string) => void
    callEnded?: boolean
    onClear?: () => void
}

export default function DocumentPanel({
    highlights,
    summary,
    documents,
    onLoadDocument,
    callEnded,
    onClear,
}: DocumentPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new highlights arrive
    useEffect(() => {
        if (scrollRef.current && highlights.length > 0) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
            })
        }
    }, [highlights.length])

    const hasData = highlights.length > 0 || summary

    // Empty state - no data
    if (!hasData) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center">
                <div className="animate-pulse">
                    <FileSearchIcon className="mb-4 h-12 w-12 opacity-30" />
                </div>
                <p className="text-sm">Relevant documents will appear here</p>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header with Clear button when call ended */}
            {callEnded && hasData && (
                <div className="bg-background/95 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2 backdrop-blur">
                    <span className="text-muted-foreground text-sm">
                        Documents from call
                    </span>
                    <Button size="sm" variant="ghost" onClick={onClear}>
                        <XIcon className="mr-1 h-4 w-4" />
                        Clear
                    </Button>
                </div>
            )}

            <div
                ref={scrollRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
            >
                {/* Summary section at top */}
                {summary && (
                    <div
                        key={summary.id}
                        className="border-border bg-muted/30 mb-2 rounded-lg border px-4 py-3"
                    >
                        <div className="mb-2 flex items-center gap-2">
                            <SparklesIcon className="text-primary h-4 w-4" />
                            <span className="text-muted-foreground text-xs font-medium">
                                Summary
                            </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{summary.text}</p>
                    </div>
                )}

                {/* Stacked document cards */}
                {highlights.map((highlight, index) => (
                    <DocumentCard
                        key={highlight.id}
                        documentId={highlight.documentId}
                        start={highlight.start}
                        end={highlight.end}
                        document={documents.get(highlight.documentId)}
                        onLoadDocument={onLoadDocument}
                        autoExpand={index === highlights.length - 1}
                    />
                ))}
            </div>
        </div>
    )
}
