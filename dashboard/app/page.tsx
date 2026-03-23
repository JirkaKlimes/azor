"use client";

import { useState, useCallback, useRef } from "react";
import Layout from "./components/panel-layout";
import Navbar from "./components/navbar";
import Sidebar from "./components/sidebar";
import DocumentPanel from "./components/documents/document-panel";
import { TranscriptPanel } from "./components/transcript";
import { toast } from "sonner";
import type {
  TranscriptHighlight,
  TranscriptSummary,
  TranscriptMessage,
  Document,
  ServerEvent,
} from "./components/transcript/types";

const API_BASE = "http://localhost:7600/api";

export default function Home() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const [highlights, setHighlights] = useState<TranscriptHighlight[]>([]);
  const [summary, setSummary] = useState<TranscriptSummary | null>(null);
  const [documents, setDocuments] = useState<Map<string, Document>>(new Map());
  const [transcriptItems, setTranscriptItems] = useState<TranscriptMessage[]>([]);
  const [latestEvent, setLatestEvent] = useState<{ event: ServerEvent; seq: number } | null>(null);
  const eventSeqRef = useRef(0);

  // Start new conversation
  const handleConversationId = useCallback((id: string | null) => {
    if (id) {
      // New conversation starting - reset everything
      setConversationId(id);
      setCallEnded(false);
      setHighlights([]);
      setSummary(null);
      setDocuments(new Map());
      setTranscriptItems([]);
      setLatestEvent(null);
    }
  }, []);

  // Call ended - keep data, just mark as ended
  const handleCallEnd = useCallback(() => {
    setConversationId(null);
    setCallEnded(true);
  }, []);

  // Handle WebSocket events from Start component
  const handleEvent = useCallback((event: ServerEvent) => {
    // Pass to TranscriptPanel for processing with unique sequence number
    eventSeqRef.current += 1;
    setLatestEvent({ event, seq: eventSeqRef.current });
  }, []);

  // Clear all session data
  const handleClearSession = useCallback(() => {
    setHighlights([]);
    setSummary(null);
    setDocuments(new Map());
    setTranscriptItems([]);
    setCallEnded(false);
    setLatestEvent(null);
  }, []);

  // Handle highlight events from transcript panel
  const handleHighlight = useCallback((highlight: TranscriptHighlight) => {
    setHighlights((prev) => [...prev, highlight]);
  }, []);

  // Handle summary events from transcript panel
  const handleSummary = useCallback((newSummary: TranscriptSummary) => {
    setSummary(newSummary);
  }, []);

  // Track transcript items from TranscriptPanel
  const handleTranscriptUpdate = useCallback((items: TranscriptMessage[]) => {
    setTranscriptItems(items);
  }, []);

  // Load document content
  const loadDocument = useCallback(async (documentId: string) => {
    if (documents.has(documentId)) return;

    try {
      const res = await fetch(`${API_BASE}/documents/${documentId}`);
      if (!res.ok) throw new Error("Failed to fetch document");
      const doc: Document = await res.json();
      setDocuments((prev) => new Map(prev).set(documentId, doc));
    } catch (err) {
      console.error("Failed to load document:", err);
      toast.error("Failed to load document");
    }
  }, [documents]);

  // Handle document click from sidebar
  const handleDocumentClick = useCallback((documentId: string) => {
    loadDocument(documentId);
  }, [loadDocument]);

  const hasData = transcriptItems.length > 0 || highlights.length > 0;

  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <Navbar
        onConversationId={handleConversationId}
        onCallEnd={handleCallEnd}
        onEvent={handleEvent}
      />
      <Layout
        c1={
          <Sidebar
            highlights={highlights}
            documents={documents}
            conversationId={conversationId}
            callEnded={callEnded}
            onDocumentClick={handleDocumentClick}
            onClear={handleClearSession}
          />
        }
        c2={
          <DocumentPanel
            highlights={highlights}
            summary={summary}
            documents={documents}
            onLoadDocument={loadDocument}
            callEnded={callEnded}
            onClear={handleClearSession}
          />
        }
        c3={
          <TranscriptPanel
            conversationId={conversationId}
            callEnded={callEnded}
            serverEvent={latestEvent?.event ?? null}
            serverEventSeq={latestEvent?.seq ?? 0}
            onHighlight={handleHighlight}
            onSummary={handleSummary}
            onClear={handleClearSession}
            onTranscriptUpdate={handleTranscriptUpdate}
          />
        }
      />
    </div>
  );
}
