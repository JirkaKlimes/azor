'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronDownIcon, ChevronUpIcon, FileTextIcon } from 'lucide-react'
import { useState } from 'react'
import type { Document } from './types'
import DocumentViewer from './document-viewer'

interface HighlightCardProps {
    documentId: string
    start: number
    end: number
    sourcePath?: string
    document?: Document
    onLoadDocument?: (documentId: string) => void
}

export default function HighlightCard({
    documentId,
    start,
    end,
    sourcePath,
    document,
    onLoadDocument,
}: HighlightCardProps) {
    const [expanded, setExpanded] = useState(false)

    const displayName = sourcePath
        ? sourcePath.split('/').pop() || sourcePath
        : documentId

    const handleToggle = () => {
        if (!expanded && !document) {
            onLoadDocument?.(documentId)
        }
        setExpanded(!expanded)
    }

    return (
        <div className="border-border bg-background/50 overflow-hidden rounded-lg border">
            <button
                onClick={handleToggle}
                className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
            >
                <FileTextIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">{displayName}</span>
                <div
                    className={cn(
                        'transition-transform duration-200',
                        expanded && 'rotate-180',
                    )}
                >
                    <ChevronDownIcon className="text-muted-foreground h-4 w-4" />
                </div>
            </button>
            {expanded && (
                <div className="border-border overflow-hidden border-t">
                    {document ? (
                        <DocumentViewer
                            content={document.content}
                            highlightStart={start}
                            highlightEnd={end}
                        />
                    ) : (
                        <div className="text-muted-foreground p-4 text-sm">
                            <span className="animate-pulse">Loading...</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
