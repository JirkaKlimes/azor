"use client";

import { useState, useCallback, useRef } from "react";
import Layout from "./components/panel-layout";
import Navbar, { type NavbarRef } from "./components/navbar";
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
  ClientEvent,
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

  const navbarRef = useRef<NavbarRef>(null);
  const eventSeqRef = useRef(0);

  const handleConversationId = useCallback((id: string | null) => {
    if (id) {
      setConversationId(id);
      setCallEnded(false);
      setHighlights([]);
      setSummary(null);
      setDocuments(new Map());
      setTranscriptItems([]);
      setLatestEvent(null);
    }
  }, []);

  const handleCallEnd = useCallback(() => {
    setConversationId(null);
    setCallEnded(true);
  }, []);

  const handleEvent = useCallback((event: ServerEvent) => {
    eventSeqRef.current += 1;
    setLatestEvent({ event, seq: eventSeqRef.current });
  }, []);

  const handleClearSession = useCallback(() => {
    setHighlights([]);
    setSummary(null);
    setDocuments(new Map());
    setTranscriptItems([]);
    setCallEnded(false);
    setLatestEvent(null);
  }, []);

  const handleHighlight = useCallback((highlight: TranscriptHighlight) => {
    setHighlights((prev) => [...prev, highlight]);
  }, []);

  const handleSummary = useCallback((newSummary: TranscriptSummary) => {
    setSummary(newSummary);
  }, []);

  const handleTranscriptUpdate = useCallback((items: TranscriptMessage[]) => {
    setTranscriptItems(items);
  }, []);

  const loadDocument = useCallback(
    async (documentId: string) => {
      if (documents.has(documentId)) return;

      try {
        const res = await fetch(`${API_BASE}/documents/${documentId}`);
        if (!res.ok) throw new Error("Failed to fetch document");
        const doc: Document = await res.json();
        setDocuments((prev) => new Map(prev).set(documentId, doc));
      } catch {
        toast.error("Failed to load document");
      }
    },
    [documents]
  );

  const handleDocumentClick = useCallback(
    (documentId: string) => {
      loadDocument(documentId);
    },
    [loadDocument]
  );

  const handleSendMessage = useCallback((event: ClientEvent) => {
    navbarRef.current?.sendMessage(event);
  }, []);

  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <Navbar
        ref={navbarRef}
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
            onSendMessage={handleSendMessage}
          />
        }
      />
    </div>
  );
}
