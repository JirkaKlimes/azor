'use client'

import { Button } from '@/components/ui/button'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'

interface SuggestionBubbleProps {
    text: string
    onUse?: (text: string) => void
}

export default function SuggestionBubble({ text, onUse }: SuggestionBubbleProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        onUse?.(text)
    }

    return (
        <div className="border-primary/40 bg-primary/5 ml-auto max-w-[80%] rounded-lg border-2 border-dashed px-4 py-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium">
                Suggested response
            </p>
            <p className="whitespace-pre-wrap text-sm">{text}</p>
            <div className="mt-2 flex justify-end">
                <Button size="xs" variant="ghost" onClick={handleCopy}>
                    <span className="flex items-center gap-1">
                        {copied ? (
                            <>
                                <CheckIcon className="h-3 w-3" />
                                Copied
                            </>
                        ) : (
                            <>
                                <CopyIcon className="h-3 w-3" />
                                Copy
                            </>
                        )}
                    </span>
                </Button>
            </div>
        </div>
    )
}
