"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  TranscriptMessage,
  TranscriptHighlight,
  TranscriptSummary,
  TranscriptSuggestion,
  TranscriptProcessing,
  ServerEvent,
  ClientEvent,
} from "./types";
import MessageBubble from "./message-bubble";
import ProcessingIndicator from "./processing-indicator";
import SuggestionBar from "./suggestion-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { float } from "@/lib/animations";
import { MessageSquareIcon, SendIcon, XIcon } from "lucide-react";

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
  onSendMessage?: (event: ClientEvent) => void;
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
  onSendMessage,
}: TranscriptPanelProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [processing, setProcessing] = useState<TranscriptProcessing | null>(null);
  const [interimOperator, setInterimOperator] = useState("");
  const [interimCustomer, setInterimCustomer] = useState("");
  const [currentSuggestion, setCurrentSuggestion] = useState<TranscriptSuggestion | null>(null);
  const [operatorMessageFinal, setOperatorMessageFinal] = useState(false);
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
  }, [messages, processing, interimOperator, interimCustomer]);

  useEffect(() => {
    onTranscriptUpdate?.(messages);
  }, [messages, onTranscriptUpdate]);

  useEffect(() => {
    if (conversationId && prevConversationIdRef.current !== conversationId) {
      setMessages([]);
      setProcessing(null);
      setInterimOperator("");
      setInterimCustomer("");
      setCurrentSuggestion(null);
      setOperatorMessageFinal(false);
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

        if (serverEvent.role === "operator") {
          setOperatorMessageFinal(true);
          setTimeout(() => setOperatorMessageFinal(false), 100);
        }
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

        if (serverEvent.role === "operator") {
          setOperatorMessageFinal(true);
          setTimeout(() => setOperatorMessageFinal(false), 100);
        }
        break;
      }

      case "processing": {
        setProcessing({
          id: `processing-${serverEvent.trigger_id}-${serverEvent.stage}`,
          type: "processing",
          triggerId: serverEvent.trigger_id,
          stage: serverEvent.stage,
        });
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
        setProcessing(null);
        onSummary?.({
          id: serverEvent.id,
          type: "summary",
          triggerId: serverEvent.trigger_id,
          text: serverEvent.content,
        });
        break;
      }

      case "suggestion": {
        const suggestion: TranscriptSuggestion = {
          id: serverEvent.id,
          type: "suggestion",
          triggerId: serverEvent.trigger_id,
          text: serverEvent.content,
        };
        setCurrentSuggestion(suggestion);
        onSuggestion?.(suggestion);
        break;
      }

      case "no_relevant_info": {
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
    [handleSendMessage]
  );

  const hasContent = messages.length > 0 || interimOperator || interimCustomer;

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
      {callEnded && messages.length > 0 && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 py-2 border-b flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Call ended</span>
          <Button size="sm" variant="ghost" onClick={handleClear}>
            <XIcon className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto pb-32">
        <AnimatePresence mode="popLayout" initial={false}>
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

          {processing && <ProcessingIndicator key={processing.id} stage={processing.stage} />}
        </AnimatePresence>
      </div>

      {!callEnded && (
        <>
          <SuggestionBar
            suggestion={currentSuggestion?.text ?? null}
            suggestionId={currentSuggestion?.id ?? null}
            onDismiss={handleDismissSuggestion}
            operatorMessageFinal={operatorMessageFinal}
          />

          {conversationId && onSendMessage && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
              <div className="flex gap-2 items-end">
                <Textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask the copilot..."
                  className="min-h-[40px] max-h-[120px] resize-none"
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
