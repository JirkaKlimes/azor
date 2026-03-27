'use client'

import { FileTextIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getDocumentTitle } from '@/lib/utils'
import type { Document } from '../transcript/types'
import type { Reference } from './types'

interface ReferenceBoxProps {
    reference: Reference
    document?: Document
    onLoadDocument?: (documentId: string) => void
}

export default function ReferenceBox({
    reference,
    document,
    onLoadDocument,
}: ReferenceBoxProps) {
    const highlightRef = useRef<HTMLElement>(null)
    const hasDocument = reference.documentId && reference.documentId.length > 0
    const title = hasDocument
        ? getDocumentTitle(document?.sourcePath, reference.documentId)
        : 'Reference'

    // Auto-load document when component mounts (only if we have a document ID)
    useEffect(() => {
        if (hasDocument && !document) {
            onLoadDocument?.(reference.documentId)
        }
    }, [hasDocument, document, reference.documentId, onLoadDocument])

    // Scroll to highlight when document loads
    useEffect(() => {
        if (document && highlightRef.current) {
            highlightRef.current.scrollIntoView({
                behavior: 'instant',
                block: 'center',
            })
        }
    }, [document])

    // Render document content with highlight
    const renderContent = () => {
        // No document ID - just show the reference text
        if (!hasDocument) {
            return (
                <div className="max-h-32 overflow-y-auto">
                    <div className="p-3 text-xs">
                        <mark className="bg-yellow-300 text-foreground rounded px-0.5 dark:bg-yellow-500/60">
                            {reference.text}
                        </mark>
                    </div>
                </div>
            )
        }

        if (!document) {
            return (
                <div className="text-muted-foreground p-3 text-xs">
                    <span className="animate-pulse">Loading...</span>
                </div>
            )
        }

        const content = document.content
        const { start, end } = reference
        const before = content.slice(Math.max(0, start - 100), start)
        const highlighted = content.slice(start, end)
        const after = content.slice(end, Math.min(content.length, end + 100))

        return (
            <div className="max-h-32 overflow-y-auto">
                <div className="prose-sm prose max-w-none p-3 text-xs dark:prose-invert">
                    {before && (
                        <span className="text-muted-foreground">...</span>
                    )}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {before}
                    </ReactMarkdown>
                    <mark
                        ref={highlightRef}
                        className="bg-yellow-300 text-foreground rounded px-0.5 dark:bg-yellow-500/60"
                    >
                        {highlighted}
                    </mark>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {after}
                    </ReactMarkdown>
                    {after && (
                        <span className="text-muted-foreground">...</span>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="border-border bg-muted/30 my-2 overflow-hidden rounded-md border">
            <div className="border-border flex items-center gap-1.5 border-b px-2 py-1.5">
                <FileTextIcon className="text-muted-foreground h-3 w-3 shrink-0" />
                <span className="text-muted-foreground truncate text-xs">
                    {title}
                </span>
            </div>
            {renderContent()}
        </div>
    )
}
