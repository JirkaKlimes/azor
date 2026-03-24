'use client'

import { Button } from '@/components/ui/button'
import { CheckIcon, CopyIcon, XIcon, LightbulbIcon } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'

const MINIMUM_VISIBLE_TIME = 8000 // 8 seconds minimum
const AUTO_DISMISS_TIMEOUT = 60000 // 60 seconds max

interface SuggestionBarProps {
    suggestion: string | null
    suggestionId: string | null
    onDismiss: () => void
    operatorMessageFinal?: boolean // True when operator sends a final message
}

export default function SuggestionBar({
    suggestion,
    suggestionId,
    onDismiss,
    operatorMessageFinal,
}: SuggestionBarProps) {
    const [copied, setCopied] = useState(false)
    const [canAutoDismiss, setCanAutoDismiss] = useState(false)
    const shownAtRef = useRef<number | null>(null)
    const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Track when suggestion was shown
    useEffect(() => {
        if (suggestion && suggestionId) {
            shownAtRef.current = Date.now()
            setCanAutoDismiss(false)
            setCopied(false)

            // Enable auto-dismiss after minimum time
            const minTimer = setTimeout(() => {
                setCanAutoDismiss(true)
            }, MINIMUM_VISIBLE_TIME)

            // Auto-dismiss after max timeout
            autoDismissTimerRef.current = setTimeout(() => {
                onDismiss()
            }, AUTO_DISMISS_TIMEOUT)

            return () => {
                clearTimeout(minTimer)
                if (autoDismissTimerRef.current) {
                    clearTimeout(autoDismissTimerRef.current)
                }
            }
        }
    }, [suggestion, suggestionId, onDismiss])

    // Dismiss when operator sends final message (if minimum time elapsed)
    useEffect(() => {
        if (operatorMessageFinal && canAutoDismiss && suggestion) {
            onDismiss()
        }
    }, [operatorMessageFinal, canAutoDismiss, suggestion, onDismiss])

    const handleCopy = useCallback(async () => {
        if (!suggestion) return
        await navigator.clipboard.writeText(suggestion)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        // Don't auto-dismiss on copy - operator might want to reference it
    }, [suggestion])

    const handleDismiss = useCallback(() => {
        onDismiss()
    }, [onDismiss])

    return suggestion ? (
        <div
            key={suggestionId}
            className="bg-linear-to-t from-background via-background absolute bottom-0 left-0 right-0 to-transparent p-3"
        >
            <div className="border-primary/40 bg-primary/5 rounded-lg border-2 border-dashed p-3 backdrop-blur-sm">
                <div className="flex items-start gap-2">
                    <LightbulbIcon className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground mb-1 text-xs font-medium">
                            Suggested response
                        </p>
                        <p className="line-clamp-4 whitespace-pre-wrap text-sm">
                            {suggestion}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={handleCopy}
                            title="Copy to clipboard"
                        >
                            {copied ? (
                                <CheckIcon className="text-green-500 h-3.5 w-3.5" />
                            ) : (
                                <CopyIcon className="h-3.5 w-3.5" />
                            )}
                        </Button>
                        <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={handleDismiss}
                            title="Dismiss"
                        >
                            <XIcon className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    ) : null
}
