'use client'

import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import CopilotMessage from '../copilotMessage'
import ChatInput from './chatInput'
import { useAppContext } from '../../context/app'
import { EmptyCopilotChat } from './emptyCopilotChat'
import OperatorMessage from '../operatorMessage'

export default function CopilotPanelContent() {
    const { chatItems, documents, loadDocument, callEnded } = useAppContext()
    const scrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new items are added
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatItems])

    const isEmpty = chatItems.length === 0

    if (isEmpty) {
        return <EmptyCopilotChat />
    }

    return (
        <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-32 pb-40 pt-24">
                <div className="space-y-4">
                    {chatItems.map((item, index) => {
                        if (item.type === 'response') {
                            return (
                                <CopilotMessage
                                    key={item.data.id}
                                    response={item.data}
                                    documents={documents}
                                    onLoadDocument={loadDocument}
                                />
                            )
                        }
                        if (item.type === 'question') {
                            return (
                                <OperatorMessage
                                    key={item.data.id}
                                    text={item.data.content}
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
            </div>

            <ChatInput disabled={callEnded} />
        </>
    )
}
