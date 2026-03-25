'use client'

import { SendIcon } from 'lucide-react'
import { useState, useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatInputProps {
    onSend: (content: string) => void
    disabled?: boolean
    placeholder?: string
}

export default function ChatInput({
    onSend,
    disabled = false,
    placeholder = 'Ask a question...',
}: ChatInputProps) {
    const [value, setValue] = useState('')

    const handleSend = useCallback(() => {
        const trimmed = value.trim()
        if (trimmed && !disabled) {
            onSend(trimmed)
            setValue('')
        }
    }, [value, disabled, onSend])

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
            }
        },
        [handleSend],
    )

    return (
        <div className="border-border bg-background flex items-end gap-2 border-t p-4">
            <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="min-h-[44px] max-h-32 resize-none"
                rows={1}
            />
            <Button
                onClick={handleSend}
                disabled={disabled || !value.trim()}
                size="icon"
                className="shrink-0"
            >
                <SendIcon className="h-4 w-4" />
            </Button>
        </div>
    )
}
