'use client'

import { cn } from '@/lib/utils'
import type { MessageRole } from './types'

const roleStyles = {
    operator: 'ml-auto bg-primary/90 text-muted dark:bg-accent dark:text-white',
    customer: 'mr-auto bg-accent dark:bg-primary/90 dark:text-muted',
    copilot: 'mr-auto bg-muted border border-border',
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
            <div
                className={cn(
                    'mt-1 flex items-center gap-1 text-xs',
                    role === 'operator'
                        ? 'text-primary-foreground/60 dark:text-muted-foreground justify-end'
                        : 'text-muted-foreground dark:text-primary-foreground/60',
                )}
            >
                <span className="capitalize">
                    {role === 'operator' ? 'You' : role === 'copilot' ? 'AI' : 'Customer'}
                </span>
            </div>
        </div>
    )
}
