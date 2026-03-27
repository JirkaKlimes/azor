'use client'

import { SendIcon } from 'lucide-react'
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ChatInput({
    onSend,
    disabled = false,
}: {
    onSend: (content: string) => void
    disabled?: boolean
}) {
    const [value, setValue] = useState('')

    const handleSend = useCallback(() => {
        const trimmed = value.trim()
        if (trimmed && !disabled) {
            onSend(trimmed)
            setValue('')
        }
    }, [value, disabled, onSend])

    return (
        <div className="bg-background flex justify-center p-4 pt-0">
            <div className="w-md flex items-center gap-2">
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={'Start typing..'}
                    disabled={disabled}
                    className="rounded-2xl px-4"
                />
                <Button
                    onClick={handleSend}
                    disabled={disabled || !value.trim()}
                    className="rounded-full"
                >
                    <SendIcon className="-translate-x-px translate-y-px" />
                </Button>
            </div>
        </div>
    )
}
