'use client'

import { Loader2Icon, MessageSquareIcon, TrashIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { Document } from '../transcript/types'
import AIMessage from './ai-message'
import ChatInput from './chat-input'
import OperatorQuestionBubble from './operator-question'
import type { ChatItem } from './types'

interface ChatPanelProps {
    items: ChatItem[]
    documents: Map<string, Document>
    onLoadDocument: (documentId: string) => void
    onSendMessage: (content: string) => void
    callEnded?: boolean
    onClear?: () => void
}

export default function ChatPanel({
    items,
    documents,
    onLoadDocument,
    onSendMessage,
    callEnded = false,
    onClear,
}: ChatPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new items are added
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [items])

    const isEmpty = items.length === 0

    return (
        <div className="flex h-full flex-col">
            {/* Message list */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4"
            >
                {isEmpty ? (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
                        <MessageSquareIcon className="h-8 w-8 opacity-50" />
                        <p className="text-sm">
                            AI assistance will appear here during the call
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item, index) => {
                            if (item.type === 'response') {
                                return (
                                    <AIMessage
                                        key={item.data.id}
                                        response={item.data}
                                        documents={documents}
                                        onLoadDocument={onLoadDocument}
                                    />
                                )
                            }
                            if (item.type === 'question') {
                                return (
                                    <OperatorQuestionBubble
                                        key={item.data.id}
                                        question={item.data}
                                    />
                                )
                            }
                            // Loading state
                            return (
                                <div
                                    key={`loading-${item.triggerId}-${index}`}
                                    className="flex items-center gap-2 px-4 py-2"
                                >
                                    <Loader2Icon className="text-muted-foreground h-4 w-4 animate-spin" />
                                    <span className="text-muted-foreground text-sm">
                                        Analyzing...
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Clear button when call ended and has items */}
            {callEnded && !isEmpty && onClear && (
                <div className="border-border flex justify-center border-t p-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        className="text-muted-foreground"
                    >
                        <TrashIcon className="mr-1.5 h-3.5 w-3.5" />
                        Clear
                    </Button>
                </div>
            )}

            {/* Input area - only show when call is active */}
            {!callEnded && (
                <ChatInput
                    onSend={onSendMessage}
                    disabled={false}
                />
            )}
        </div>
    )
}
