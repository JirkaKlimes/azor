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
        <div className="bg-background flex justify-center p-4 pt-0">
            <div className="w-md flex items-center gap-2">
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={'Start typing..'}
                    disabled={isDisabled}
                    className="rounded-2xl px-4"
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
