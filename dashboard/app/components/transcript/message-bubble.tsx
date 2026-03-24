'use client'

import { cn } from '@/lib/utils'
import type { MessageRole } from './types'

const roleStyles = {
    operator: 'ml-auto bg-primary/90 text-muted',
    customer: 'mr-auto bg-accent',
    // copilot: 'mr-auto bg-accent border border-accent-foreground/10',
} as const

export default function MessageBubble({
    role,
    content,
    isPartial,
}: {
    role: MessageRole
    content: string
    isPartial?: boolean
}) {
    return (
        <div
            className={cn(
                'max-w-[80%] rounded-lg px-4 py-2',
                roleStyles[role],
                isPartial && 'opacity-70',
            )}
        >
            <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
    )
}
