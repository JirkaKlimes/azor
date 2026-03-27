'use client'

import { BotIcon, LightbulbIcon } from 'lucide-react'
import type { Document } from '../transcript/types'
import ReferenceBox from './reference-box'
import { parseContent, type AIResponse } from './types'

interface AIMessageProps {
    response: AIResponse
    documents: Map<string, Document>
    onLoadDocument: (documentId: string) => void
}

export default function AIMessage({
    response,
    documents,
    onLoadDocument,
}: AIMessageProps) {
    const segments = parseContent(response.content)

    return (
        <div className="flex gap-3">
            <div className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                <BotIcon className="text-primary h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="bg-card border-border rounded-lg border p-4">
                    {/* Main content with inline references */}
                    <div className="text-foreground text-sm leading-relaxed">
                        {segments.map((segment, i) => {
                            if (segment.type === 'text') {
                                return (
                                    <span key={i} className="whitespace-pre-wrap">
                                        {segment.value}
                                    </span>
                                )
                            }
                            // Reference segment
                            const ref = response.references[segment.index]
                            if (!ref) {
                                return (
                                    <span
                                        key={i}
                                        className="text-muted-foreground text-xs"
                                    >
                                        [ref not found]
                                    </span>
                                )
                            }
                            return (
                                <ReferenceBox
                                    key={i}
                                    reference={ref}
                                    document={documents.get(ref.documentId)}
                                    onLoadDocument={onLoadDocument}
                                />
                            )
                        })}
                    </div>

                    {/* Suggestion section */}
                    {response.suggestion && (
                        <div className="border-border bg-primary/5 mt-4 rounded-md border p-3">
                            <div className="text-primary mb-1 flex items-center gap-1.5 text-xs font-medium">
                                <LightbulbIcon className="h-3.5 w-3.5" />
                                Suggested response
                            </div>
                            <p className="text-foreground text-sm">
                                {response.suggestion}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
