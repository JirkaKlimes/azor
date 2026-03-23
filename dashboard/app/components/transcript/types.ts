export type MessageRole = "operator" | "customer" | "copilot";

export interface TranscriptMessage {
  id: string;
  type: "message";
  role: MessageRole;
  content: string;
  isUtterance: boolean;
}

export interface TranscriptProcessing {
  id: string;
  type: "processing";
  triggerId: string;
  stage: "retrieving" | "analyzing";
}

export interface TranscriptHighlight {
  id: string;
  type: "highlight";
  triggerId: string;
  documentId: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptSummary {
  id: string;
  type: "summary";
  triggerId: string;
  text: string;
}

export interface TranscriptSuggestion {
  id: string;
  type: "suggestion";
  triggerId: string;
  text: string;
}

export interface TranscriptNoRelevantInfo {
  id: string;
  type: "no_relevant_info";
  triggerId: string;
}

export type TranscriptItem =
  | TranscriptMessage
  | TranscriptProcessing
  | TranscriptHighlight
  | TranscriptSummary
  | TranscriptSuggestion
  | TranscriptNoRelevantInfo;

export interface Document {
  id: string;
  content: string;
  sourcePath?: string;
  originUrl?: string;
}

// =============================================================================
// WebSocket Server Events
// =============================================================================

export interface ServerConnectedEvent {
  type: "connected";
  conversation_id: string;
}

export interface ServerInterimTranscriptEvent {
  type: "interim_transcript";
  role: "operator" | "customer";
  content: string;
}

export interface ServerUtteranceEvent {
  type: "utterance";
  id: string;
  role: "operator" | "customer";
  content: string;
}

export interface ServerMessageEvent {
  type: "message";
  id: string;
  role: "operator" | "copilot";
  content: string;
}

export interface ServerProcessingEvent {
  type: "processing";
  id: string;
  trigger_id: string;
  stage: "retrieving" | "analyzing";
}

export interface ServerHighlightEvent {
  type: "highlight";
  id: string;
  trigger_id: string;
  document_id: string;
  start: number;
  end: number;
  text: string;
}

export interface ServerSummaryEvent {
  type: "summary";
  id: string;
  trigger_id: string;
  content: string;
}

export interface ServerSuggestionEvent {
  type: "suggestion";
  id: string;
  trigger_id: string;
  content: string;
}

export interface ServerNoRelevantInfoEvent {
  type: "no_relevant_info";
  id: string;
  trigger_id: string;
}

export type ServerEvent =
  | ServerConnectedEvent
  | ServerInterimTranscriptEvent
  | ServerUtteranceEvent
  | ServerMessageEvent
  | ServerProcessingEvent
  | ServerHighlightEvent
  | ServerSummaryEvent
  | ServerSuggestionEvent
  | ServerNoRelevantInfoEvent;

// =============================================================================
// WebSocket Client Events
// =============================================================================

export interface ClientMessageEvent {
  type: "message";
  content: string;
}

export type ClientEvent = ClientMessageEvent;
