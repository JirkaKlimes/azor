/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useEffect, useRef, useState } from 'react'
import type {
    TranscriptMessage,
    TranscriptHighlight,
    TranscriptSummary,
    ServerEvent,
} from './types'
import MessageBubble from './message-bubble'

export default function TranscriptPanel({
    conversationId,
    serverEvent,
    serverEventSeq = 0,
    onHighlight,
    onSummary,
    onTranscriptUpdate,
}: {
    conversationId: string | null
    callEnded?: boolean
    serverEvent?: ServerEvent | null
    serverEventSeq?: number
    onHighlight?: (highlight: TranscriptHighlight) => void
    onSummary?: (summary: TranscriptSummary) => void
    onClear?: () => void
    onTranscriptUpdate?: (items: TranscriptMessage[]) => void
}) {
    // Used by app/page.tsx as the main chat timeline.
    const [messages, setMessages] = useState<TranscriptMessage[]>([])
    const [interimOperator, setInterimOperator] = useState('')
    const [interimCustomer, setInterimCustomer] = useState('')

    const scrollRef = useRef<HTMLDivElement>(null)
    const prevConversationIdRef = useRef<string | null>(null)
    const lastEventSeqRef = useRef(0)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
            })
        }
    }, [messages, interimOperator, interimCustomer])

    useEffect(() => {
        onTranscriptUpdate?.(messages)
    }, [messages, onTranscriptUpdate])

    useEffect(() => {
        if (conversationId && prevConversationIdRef.current !== conversationId) {
            setMessages([])
            setInterimOperator('')
            setInterimCustomer('')
            prevConversationIdRef.current = conversationId
            lastEventSeqRef.current = 0
        }
    }, [conversationId])

    useEffect(() => {
        if (!serverEvent || serverEventSeq <= lastEventSeqRef.current) return
        lastEventSeqRef.current = serverEventSeq

        switch (serverEvent.type) {
            case 'interim_transcript': {
                if (serverEvent.role === 'operator') {
                    setInterimOperator(serverEvent.content)
                } else {
                    setInterimCustomer(serverEvent.content)
                }
                break
            }

            case 'utterance': {
                if (serverEvent.role === 'operator') {
                    setInterimOperator('')
                } else {
                    setInterimCustomer('')
                }

                setMessages((prev) => [
                    ...prev,
                    {
                        id: serverEvent.id,
                        type: 'message',
                        role: serverEvent.role,
                        content: serverEvent.content,
                        isUtterance: true,
                    },
                ])
                break
            }

            case 'message': {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: serverEvent.id,
                        type: 'message',
                        role: serverEvent.role,
                        content: serverEvent.content,
                        isUtterance: false,
                    },
                ])
                break
            }

            case 'processing': {
                // Processing UI removed intentionally to keep this panel minimal.
                break
            }

            case 'highlight': {
                onHighlight?.({
                    id: serverEvent.id,
                    type: 'highlight',
                    triggerId: serverEvent.trigger_id,
                    documentId: serverEvent.document_id,
                    start: serverEvent.start,
                    end: serverEvent.end,
                    text: serverEvent.text,
                })
                break
            }

            case 'summary': {
                onSummary?.({
                    id: serverEvent.id,
                    type: 'summary',
                    triggerId: serverEvent.trigger_id,
                    text: serverEvent.content,
                })
                break
            }

            case 'suggestion': {
                // Suggestion bar removed intentionally to reduce moving parts.
                break
            }

            case 'no_relevant_info': {
                break
            }
        }
    }, [serverEvent, serverEventSeq, onHighlight, onSummary])

    const hasContent = messages.length > 0 || interimOperator || interimCustomer

    if (!conversationId && !hasContent) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center">
                <p className="text-sm">Start a call to see the transcript.</p>
            </div>
        )
    }

    return (
        <div className="relative flex h-full flex-col">
            <div
                ref={scrollRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pb-32"
            >
                {messages.map((msg) => (
                    <MessageBubble
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        isPartial={false}
                    />
                ))}

                {interimOperator && (
                    <MessageBubble
                        key="interim-operator"
                        role="operator"
                        content={interimOperator}
                        isPartial
                    />
                )}

                {interimCustomer && (
                    <MessageBubble
                        key="interim-customer"
                        role="customer"
                        content={interimCustomer}
                        isPartial
                    />
                )}
            </div>
        </div>
    )
}
