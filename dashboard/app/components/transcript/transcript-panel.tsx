"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  TranscriptMessage,
  TranscriptHighlight,
  TranscriptSummary,
  ServerEvent,
  ClientEvent,
} from "./types";
import MessageBubble from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareIcon, SendIcon, XIcon } from "lucide-react";

interface TranscriptPanelProps {
  conversationId: string | null;
  callEnded?: boolean;
  serverEvent?: ServerEvent | null;
  serverEventSeq?: number;
  onHighlight?: (highlight: TranscriptHighlight) => void;
  onSummary?: (summary: TranscriptSummary) => void;
  onClear?: () => void;
  onTranscriptUpdate?: (items: TranscriptMessage[]) => void;
  onSendMessage?: (event: ClientEvent) => void;
}

export default function TranscriptPanel({
  conversationId,
  callEnded,
  serverEvent,
  serverEventSeq = 0,
  onHighlight,
  onSummary,
  onClear,
  onTranscriptUpdate,
  onSendMessage,
}: TranscriptPanelProps) {
  // Used by app/page.tsx as the main chat timeline.
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [interimOperator, setInterimOperator] = useState("");
  const [interimCustomer, setInterimCustomer] = useState("");
  const [inputValue, setInputValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const lastEventSeqRef = useRef(0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, interimOperator, interimCustomer]);

  useEffect(() => {
    onTranscriptUpdate?.(messages);
  }, [messages, onTranscriptUpdate]);

  useEffect(() => {
    if (conversationId && prevConversationIdRef.current !== conversationId) {
      setMessages([]);
      setInterimOperator("");
      setInterimCustomer("");
      setInputValue("");
      prevConversationIdRef.current = conversationId;
      lastEventSeqRef.current = 0;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!serverEvent || serverEventSeq <= lastEventSeqRef.current) return;
    lastEventSeqRef.current = serverEventSeq;

    switch (serverEvent.type) {
      case "interim_transcript": {
        if (serverEvent.role === "operator") {
          setInterimOperator(serverEvent.content);
        } else {
          setInterimCustomer(serverEvent.content);
        }
        break;
      }

      case "utterance": {
        if (serverEvent.role === "operator") {
          setInterimOperator("");
        } else {
          setInterimCustomer("");
        }

        setMessages((prev) => [
          ...prev,
          {
            id: serverEvent.id,
            type: "message",
            role: serverEvent.role,
            content: serverEvent.content,
            isUtterance: true,
          },
        ]);
        break;
      }

      case "message": {
        setMessages((prev) => [
          ...prev,
          {
            id: serverEvent.id,
            type: "message",
            role: serverEvent.role,
            content: serverEvent.content,
            isUtterance: false,
          },
        ]);
        break;
      }

      case "processing": {
        // Processing UI removed intentionally to keep this panel minimal.
        break;
      }

      case "highlight": {
        onHighlight?.({
          id: serverEvent.id,
          type: "highlight",
          triggerId: serverEvent.trigger_id,
          documentId: serverEvent.document_id,
          start: serverEvent.start,
          end: serverEvent.end,
          text: serverEvent.text,
        });
        break;
      }

      case "summary": {
        onSummary?.({
          id: serverEvent.id,
          type: "summary",
          triggerId: serverEvent.trigger_id,
          text: serverEvent.content,
        });
        break;
      }

      case "suggestion": {
        // Suggestion bar removed intentionally to reduce moving parts.
        break;
      }

      case "no_relevant_info": {
        break;
      }
    }
  }, [serverEvent, serverEventSeq, onHighlight, onSummary]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setInterimOperator("");
    setInterimCustomer("");
    setInputValue("");
    prevConversationIdRef.current = null;
    lastEventSeqRef.current = 0;
    onClear?.();
  }, [onClear]);

  const handleSendMessage = useCallback(() => {
    const content = inputValue.trim();
    if (!content || !onSendMessage) return;

    onSendMessage({ type: "message", content });
    setInputValue("");
    inputRef.current?.focus();
  }, [inputValue, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const hasContent = messages.length > 0 || interimOperator || interimCustomer;

  if (!conversationId && !hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="animate-pulse">
          <MessageSquareIcon className="h-12 w-12 mb-4 opacity-30" />
        </div>
        <p className="text-sm">Start a call to see the transcript</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {callEnded && messages.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Call ended</span>
          <Button size="sm" variant="ghost" onClick={handleClear}>
            <XIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto pb-32"
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isPartial={false}
            isUtterance={msg.isUtterance}
          />
        ))}

        {interimOperator && (
          <MessageBubble
            key="interim-operator"
            role="operator"
            content={interimOperator}
            isPartial
            isUtterance
          />
        )}

        {interimCustomer && (
          <MessageBubble
            key="interim-customer"
            role="customer"
            content={interimCustomer}
            isPartial
            isUtterance
          />
        )}
      </div>

      {!callEnded && (
        <>
          {conversationId && onSendMessage && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the copilot..."
                  className="min-h-10 max-h-30 resize-none"
                  rows={1}
                />
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                >
                  <SendIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
