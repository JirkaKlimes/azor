'use client'

import { SendIcon } from 'lucide-react'
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppContext } from '../../context/app'

export default function ChatInput({ disabled }: { disabled?: boolean }) {
    const { sendMessage } = useAppContext()

    const [value, setValue] = useState('')
    const isDisabled = disabled ?? false

    const handleSend = useCallback(() => {
        const trimmed = value.trim()
        if (trimmed && !isDisabled) {
            sendMessage(trimmed)
            setValue('')
        }
    }, [value, isDisabled, sendMessage])

    return (
        <div className="absolute bottom-4 self-center">
            <div className="w-md bg-background flex items-center gap-2 rounded-full border p-1 shadow">
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                    placeholder={'Start typing..'}
                    disabled={isDisabled}
                    className="bg-background dark:bg-background rounded-2xl border-0 px-3 shadow-none outline-0"
                />
                <Button
                    onClick={handleSend}
                    disabled={isDisabled || !value.trim()}
                    className="rounded-full"
                >
                    <SendIcon className="-translate-x-px translate-y-px" />
                </Button>
            </div>
        </div>
    )
}
