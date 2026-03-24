'use client'

import { useState, useCallback, useRef } from 'react'
import PanelLayout from './components/panel-layout'
import Navbar, { type NavbarRef } from './components/navbar'
import DocumentPanel from './components/documents/document-panel'
import { TranscriptPanel } from './components/transcript'
import type {
    TranscriptHighlight,
    TranscriptSummary,
    Document,
    ServerEvent,
} from './components/transcript/types'

const API_BASE = 'http://localhost:7600/api'

export default function Home() {
    // Used by Navbar + TranscriptPanel to represent one active websocket session.
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [callEnded, setCallEnded] = useState(false)
    // Used by DocumentPanel.
    const [highlights, setHighlights] = useState<TranscriptHighlight[]>([])
    const [summary, setSummary] = useState<TranscriptSummary | null>(null)
    const [documents, setDocuments] = useState<Map<string, Document>>(new Map())
    const [latestEvent, setLatestEvent] = useState<{
        event: ServerEvent
        seq: number
    } | null>(null)

    const navbarRef = useRef<NavbarRef>(null)
    const eventSeqRef = useRef(0)

    const resetSessionData = useCallback(() => {
        setHighlights([])
        setSummary(null)
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
    }, [])

    const handleClearSession = useCallback(() => {
        resetSessionData()
        setCallEnded(false)
    }, [resetSessionData])

    const handleHighlight = useCallback((highlight: TranscriptHighlight) => {
        setHighlights((prev) => [...prev, highlight])
    }, [])

    const handleSummary = useCallback((newSummary: TranscriptSummary) => {
        setSummary(newSummary)
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
                    <DocumentPanel
                        highlights={highlights}
                        summary={summary}
                        documents={documents}
                        onLoadDocument={loadDocument}
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
                        onHighlight={handleHighlight}
                        onSummary={handleSummary}
                        onClear={handleClearSession}
                    />
                }
            />
        </div>
    )
}
