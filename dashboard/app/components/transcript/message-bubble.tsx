'use client'

import { BotIcon, MicIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageRole } from './types'

interface MessageBubbleProps {
    role: MessageRole
    content: string
    isPartial?: boolean
    isUtterance?: boolean
}

const roleStyles = {
    operator: 'ml-auto bg-primary text-primary-foreground',
    customer: 'mr-auto bg-muted',
    copilot: 'mr-auto bg-accent border border-accent-foreground/10',
} as const

export default function MessageBubble({
    role,
    content,
    isPartial,
    isUtterance,
}: MessageBubbleProps) {
    const isOperator = role === 'operator'
    const isCopilot = role === 'copilot'

    return (
        <div
            className={cn(
                'max-w-[80%] rounded-lg px-4 py-2',
                roleStyles[role],
                isPartial && 'opacity-70',
            )}
        >
            {isCopilot && (
                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
                    <BotIcon className="h-3 w-3" />
                    <span>Copilot</span>
                </div>
            )}
            <p className="whitespace-pre-wrap text-sm">{content}</p>
            {isUtterance && !isCopilot && (
                <div
                    className={cn(
                        'mt-1 flex items-center gap-1 text-xs',
                        isOperator
                            ? 'text-primary-foreground/60 justify-end'
                            : 'text-muted-foreground',
                    )}
                >
                    <MicIcon className="h-3 w-3" />
                    <span>Voice</span>
                </div>
            )}
        </div>
    )
}
