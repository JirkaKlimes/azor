"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  TranscriptItem,
  TranscriptMessage,
  TranscriptHighlight,
  TranscriptSummary,
  TranscriptSuggestion,
  TranscriptProcessing,
  ServerEvent,
} from "./types";
import MessageBubble from "./message-bubble";
import ProcessingIndicator from "./processing-indicator";
import SuggestionBar from "./suggestion-bar";
import { Button } from "@/components/ui/button";
import { float } from "@/lib/animations";
import { MessageSquareIcon, XIcon } from "lucide-react";

interface TranscriptPanelProps {
  conversationId: string | null;
  callEnded?: boolean;
  serverEvent?: ServerEvent | null;
  serverEventSeq?: number;
  onHighlight?: (highlight: TranscriptHighlight) => void;
  onSummary?: (summary: TranscriptSummary) => void;
  onSuggestion?: (suggestion: TranscriptSuggestion | null) => void;
  onClear?: () => void;
  onTranscriptUpdate?: (items: TranscriptMessage[]) => void;
}

export default function TranscriptPanel({
  conversationId,
  callEnded,
  serverEvent,
  serverEventSeq = 0,
  onHighlight,
  onSummary,
  onSuggestion,
  onClear,
  onTranscriptUpdate,
}: TranscriptPanelProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [processing, setProcessing] = useState<TranscriptProcessing | null>(null);
  const [interimOperator, setInterimOperator] = useState<string>("");
  const [interimCustomer, setInterimCustomer] = useState<string>("");
  const [currentSuggestion, setCurrentSuggestion] = useState<TranscriptSuggestion | null>(null);
  const [operatorMessageFinal, setOperatorMessageFinal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const lastEventSeqRef = useRef<number>(0);

  // Auto-scroll to bottom on changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, processing, interimOperator, interimCustomer]);

  // Notify parent of transcript updates (final messages only)
  useEffect(() => {
    onTranscriptUpdate?.(messages);
  }, [messages, onTranscriptUpdate]);

  // Reset state when conversation changes
  useEffect(() => {
    if (conversationId && prevConversationIdRef.current !== conversationId) {
      setMessages([]);
      setProcessing(null);
      setInterimOperator("");
      setInterimCustomer("");
      setCurrentSuggestion(null);
      setOperatorMessageFinal(false);
      prevConversationIdRef.current = conversationId;
      lastEventSeqRef.current = 0;
    }
  }, [conversationId]);

  // Process incoming server events
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

      case "final_transcript": {
        // Clear interim for this role
        if (serverEvent.role === "operator") {
          setInterimOperator("");
        } else {
          setInterimCustomer("");
        }

        const msg: TranscriptMessage = {
          id: serverEvent.id,
          type: "message",
          role: serverEvent.role,
          content: serverEvent.content,
          isFinal: true,
        };

        setMessages((prev) => [...prev, msg]);

        // Track operator final messages for suggestion dismiss logic
        if (msg.role === "operator") {
          setOperatorMessageFinal(true);
          setTimeout(() => setOperatorMessageFinal(false), 100);
        }
        break;
      }

      case "processing": {
        setProcessing({
          id: `processing-${serverEvent.message_id}-${serverEvent.stage}`,
          type: "processing",
          messageId: serverEvent.message_id,
          stage: serverEvent.stage,
        });
        break;
      }

      case "highlight": {
        const highlight: TranscriptHighlight = {
          id: serverEvent.id,
          type: "highlight",
          messageId: serverEvent.message_id,
          documentId: serverEvent.document_id,
          start: serverEvent.start_char,
          end: serverEvent.end_char,
        };
        onHighlight?.(highlight);
        break;
      }

      case "summary": {
        // Clear processing indicator
        setProcessing(null);
        const summary: TranscriptSummary = {
          id: serverEvent.id,
          type: "summary",
          messageId: serverEvent.message_id,
          text: serverEvent.content,
        };
        onSummary?.(summary);
        break;
      }

      case "suggestion": {
        const suggestion: TranscriptSuggestion = {
          id: serverEvent.id,
          type: "suggestion",
          messageId: serverEvent.message_id,
          text: serverEvent.content,
        };
        setCurrentSuggestion(suggestion);
        onSuggestion?.(suggestion);
        break;
      }

      case "no_relevant_info": {
        // Clear processing indicator
        setProcessing(null);
        break;
      }
    }
  }, [serverEvent, serverEventSeq, onHighlight, onSummary, onSuggestion]);

  const handleDismissSuggestion = useCallback(() => {
    setCurrentSuggestion(null);
    onSuggestion?.(null);
  }, [onSuggestion]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setProcessing(null);
    setInterimOperator("");
    setInterimCustomer("");
    setCurrentSuggestion(null);
    prevConversationIdRef.current = null;
    lastEventSeqRef.current = 0;
    onClear?.();
  }, [onClear]);

  // Check if we have any content to show
  const hasContent = messages.length > 0 || interimOperator || interimCustomer;

  // Empty state - no data and no active call
  if (!conversationId && !hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <motion.div variants={float} initial="initial" animate="animate">
          <MessageSquareIcon className="h-12 w-12 mb-4 opacity-30" />
        </motion.div>
        <p className="text-sm">Start a call to see the transcript</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Header with Clear button when call ended */}
      {callEnded && messages.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Call ended</span>
          <Button size="sm" variant="ghost" onClick={handleClear}>
            <XIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Transcript content */}
      <div
        ref={scrollRef}
        className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto pb-24"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {/* Final messages */}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              isPartial={false}
            />
          ))}

          {/* Interim operator message */}
          {interimOperator && (
            <MessageBubble
              key="interim-operator"
              role="operator"
              content={interimOperator}
              isPartial={true}
            />
          )}

          {/* Interim customer message */}
          {interimCustomer && (
            <MessageBubble
              key="interim-customer"
              role="customer"
              content={interimCustomer}
              isPartial={true}
            />
          )}

          {/* Processing indicator - always at the end */}
          {processing && (
            <ProcessingIndicator key={processing.id} stage={processing.stage} />
          )}
        </AnimatePresence>
      </div>

      {/* Floating suggestion bar at bottom - hide when call ended */}
      {!callEnded && (
        <SuggestionBar
          suggestion={currentSuggestion?.text ?? null}
          suggestionId={currentSuggestion?.id ?? null}
          onDismiss={handleDismissSuggestion}
          operatorMessageFinal={operatorMessageFinal}
        />
      )}
    </div>
  );
}
