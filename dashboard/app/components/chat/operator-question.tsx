'use client'

import { UserIcon } from 'lucide-react'
import type { OperatorQuestion } from './types'

interface OperatorQuestionProps {
    question: OperatorQuestion
}

export default function OperatorQuestionBubble({
    question,
}: OperatorQuestionProps) {
    return (
        <div className="flex gap-3">
            <div className="bg-accent/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                <UserIcon className="text-accent-foreground h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="bg-accent/10 border-accent/20 rounded-lg border p-4">
                    <p className="text-foreground text-sm">{question.content}</p>
                </div>
            </div>
        </div>
    )
}
