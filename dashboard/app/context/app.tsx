'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ChatItem, AIResponse } from '../components/chat'
import type { ClientEvent, Document, ServerEvent } from '../components/transcript/types'

const API_BASE = 'http://localhost:7600/api'

type LatestEvent = {
    event: ServerEvent
    seq: number
}

interface AppContextValue {
    conversationId: string | null
    callEnded: boolean
    chatItems: ChatItem[]
    documents: Map<string, Document>
    latestEvent: LatestEvent | null
    latestEventSeq: number
    handleConversationId: (id: string | null) => void
    handleCallEnd: () => void
    handleEvent: (event: ServerEvent) => void
    clearSession: () => void
    loadDocument: (documentId: string) => Promise<void>
    sendMessage: (content: string) => void
    registerSendMessageHandler: (handler: ((event: ClientEvent) => void) | null) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [callEnded, setCallEnded] = useState(false)
    const [chatItems, setChatItems] = useState<ChatItem[]>([])
    const [documents, setDocuments] = useState<Map<string, Document>>(new Map())
    const [latestEvent, setLatestEvent] = useState<LatestEvent | null>(null)

    const eventSeqRef = useRef(0)
    const sendMessageHandlerRef = useRef<((event: ClientEvent) => void) | null>(null)

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

        if (event.type === 'processing' && event.stage === 'retrieving') {
            setChatItems((prev) => [
                ...prev,
                { type: 'loading', triggerId: event.trigger_id },
            ])
        }

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
                const filtered = prev.filter(
                    (item) =>
                        item.type !== 'loading' || item.triggerId !== event.trigger_id,
                )
                return [...filtered, { type: 'response', data: response }]
            })
        }

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

    const clearSession = useCallback(() => {
        resetSessionData()
        setCallEnded(false)
    }, [resetSessionData])

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

    const registerSendMessageHandler = useCallback(
        (handler: ((event: ClientEvent) => void) | null) => {
            sendMessageHandlerRef.current = handler
        },
        [],
    )

    const sendMessage = useCallback((content: string) => {
        const handler = sendMessageHandlerRef.current
        if (!handler) return
        handler({ type: 'message', content })
    }, [])

    const value = useMemo(
        () => ({
            conversationId,
            callEnded,
            chatItems,
            documents,
            latestEvent,
            latestEventSeq: latestEvent?.seq ?? 0,
            handleConversationId,
            handleCallEnd,
            handleEvent,
            clearSession,
            loadDocument,
            sendMessage,
            registerSendMessageHandler,
        }),
        [
            conversationId,
            callEnded,
            chatItems,
            documents,
            latestEvent,
            handleConversationId,
            handleCallEnd,
            handleEvent,
            clearSession,
            loadDocument,
            sendMessage,
            registerSendMessageHandler,
        ],
    )

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext() {
    const value = useContext(AppContext)
    if (!value) {
        throw new Error('useAppContext must be used within AppProvider')
    }
    return value
}
