'use client'

import { useState, useCallback, useRef } from 'react'
import PanelLayout from './components/panel-layout'
import Navbar, { type NavbarRef } from './components/navbar'
import { ChatPanel, type ChatItem, type AIResponse } from './components/chat'
import { TranscriptPanel } from './components/transcript'
import type { Document, ServerEvent } from './components/transcript/types'

const API_BASE = 'http://localhost:7600/api'

export default function Home() {
    // Used by Navbar + TranscriptPanel to represent one active websocket session.
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [callEnded, setCallEnded] = useState(false)
    // Used by ChatPanel
    const [chatItems, setChatItems] = useState<ChatItem[]>([])
    const [documents, setDocuments] = useState<Map<string, Document>>(new Map())
    const [latestEvent, setLatestEvent] = useState<{
        event: ServerEvent
        seq: number
    } | null>(null)

    const navbarRef = useRef<NavbarRef>(null)
    const eventSeqRef = useRef(0)

    const resetSessionData = useCallback(() => {
        setChatItems([])
        setDocuments(new Map())
        setLatestEvent(null)
    }, [])

    const handleConversationId = useCallback(
        (id: string | null) => {
            if (id) {
                setConversationId(id)
                setCallEnded(false)
                resetSessionData()
            }
        },
        [resetSessionData],
    )

    const handleCallEnd = useCallback(() => {
        setConversationId(null)
        setCallEnded(true)
    }, [])

    const handleEvent = useCallback((event: ServerEvent) => {
        eventSeqRef.current += 1
        setLatestEvent({ event, seq: eventSeqRef.current })

        // Handle processing event - add loading state
        if (event.type === 'processing' && event.stage === 'retrieving') {
            setChatItems((prev) => [
                ...prev,
                { type: 'loading', triggerId: event.trigger_id },
            ])
        }

        // Handle response event - replace loading with response
        if (event.type === 'response') {
            const response: AIResponse = {
                id: event.id,
                triggerId: event.trigger_id,
                content: event.content,
                references: event.references.map((ref) => ({
                    documentId: ref.document_id,
                    start: ref.start,
                    end: ref.end,
                    text: ref.text,
                })),
                suggestion: event.suggestion,
            }
            setChatItems((prev) => {
                // Remove the loading item for this trigger and add the response
                const filtered = prev.filter(
                    (item) =>
                        item.type !== 'loading' ||
                        item.triggerId !== event.trigger_id,
                )
                return [...filtered, { type: 'response', data: response }]
            })
        }

        // Handle operator message event - add question to chat
        if (event.type === 'message' && event.role === 'operator') {
            setChatItems((prev) => [
                ...prev,
                {
                    type: 'question',
                    data: { id: event.id, content: event.content },
                },
            ])
        }
    }, [])

    const handleClearSession = useCallback(() => {
        resetSessionData()
        setCallEnded(false)
    }, [resetSessionData])

    const handleSendMessage = useCallback((content: string) => {
        navbarRef.current?.sendMessage({ type: 'message', content })
    }, [])

    const loadDocument = useCallback(
        async (documentId: string) => {
            if (documents.has(documentId)) return

            try {
                const res = await fetch(`${API_BASE}/documents/${documentId}`)
                if (!res.ok) throw new Error('Failed to fetch document')
                const doc: Document = await res.json()
                setDocuments((prev) => new Map(prev).set(documentId, doc))
            } catch {
                // Optional UX signal intentionally removed to keep this page lightweight.
            }
        },
        [documents],
    )

    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <Navbar
                ref={navbarRef}
                onConversationId={handleConversationId}
                onCallEnd={handleCallEnd}
                onEvent={handleEvent}
            />
            <PanelLayout
                c1={
                    <ChatPanel
                        items={chatItems}
                        documents={documents}
                        onLoadDocument={loadDocument}
                        onSendMessage={handleSendMessage}
                        callEnded={callEnded}
                        onClear={handleClearSession}
                    />
                }
                c2={
                    <TranscriptPanel
                        conversationId={conversationId}
                        callEnded={callEnded}
                        serverEvent={latestEvent?.event ?? null}
                        serverEventSeq={latestEvent?.seq ?? 0}
                        onClear={handleClearSession}
                    />
                }
            />
        </div>
    )
}
