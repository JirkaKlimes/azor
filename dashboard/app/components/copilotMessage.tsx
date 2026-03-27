'use client'

import { LightbulbIcon } from 'lucide-react'
import type { Document } from './transcript/types'
import ReferenceBox from './copilotPanel/reference-box'
import { parseContent, type AIResponse } from './copilotPanel/types'

export default function CopilotMessage({
    response,
    documents,
    onLoadDocument,
}: {
    response: AIResponse
    documents: Map<string, Document>
    onLoadDocument: (documentId: string) => void
}) {
    const segments = parseContent(response.content)

    return (
        <div className="">
            <div className="text-pretty text-sm leading-relaxed">
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
                            <span key={i} className="text-muted-foreground text-xs">
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
                    <p className="text-foreground text-sm">{response.suggestion}</p>
                </div>
            )}
        </div>
    )
}
