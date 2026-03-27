'use client'

import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import AIMessage from './ai-message'
import ChatInput from './chat-input'
import OperatorQuestionBubble from './operator-question'
import { useAppContext } from '../../context/app'

export default function ChatPanel() {
    const { chatItems, documents, loadDocument, callEnded } = useAppContext()
    const scrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new items are added
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatItems])

    const isEmpty = chatItems.length === 0

    return (
        <div className="flex h-full flex-col">
            {/* Message list */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
                {isEmpty ? (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
                        <p className="text-sm">
                            AI assistance will appear here during the call
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {chatItems.map((item, index) => {
                            if (item.type === 'response') {
                                return (
                                    <AIMessage
                                        key={item.data.id}
                                        response={item.data}
                                        documents={documents}
                                        onLoadDocument={loadDocument}
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

            <ChatInput disabled={callEnded} />
        </div>
    )
}
