export interface TranscriptMessage {
  id: string;
  type: "message";
  role: "operator" | "customer";
  content: string;
  isFinal: boolean;
}

export interface TranscriptProcessing {
  id: string;
  type: "processing";
  messageId: string;
  stage: "retrieving" | "analyzing";
}

export interface TranscriptRetrieval {
  id: string;
  type: "retrieval";
  messageId: string;
  chunkId: string;
  documentId: string;
  sourcePath?: string;
  score: number;
}

export interface TranscriptHighlight {
  id: string;
  type: "highlight";
  messageId: string;
  documentId: string;
  start: number;
  end: number;
  sourcePath?: string;
}

export interface TranscriptSummary {
  id: string;
  type: "summary";
  messageId: string;
  text: string;
}

export interface TranscriptSuggestion {
  id: string;
  type: "suggestion";
  messageId: string;
  text: string;
}

export interface TranscriptNoRelevantInfo {
  id: string;
  type: "no_relevant_info";
  messageId: string;
  reason: string;
}

export interface TranscriptPipelineError {
  id: string;
  type: "pipeline_error";
  messageId: string;
  message: string;
}

export type TranscriptItem =
  | TranscriptMessage
  | TranscriptProcessing
  | TranscriptRetrieval
  | TranscriptHighlight
  | TranscriptSummary
  | TranscriptSuggestion
  | TranscriptNoRelevantInfo
  | TranscriptPipelineError;

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

export interface ServerFinalTranscriptEvent {
  type: "final_transcript";
  id: string;
  role: "operator" | "customer";
  content: string;
}

export interface ServerProcessingEvent {
  type: "processing";
  id: string;
  message_id: string;
  stage: "retrieving" | "analyzing";
}

export interface ServerHighlightEvent {
  type: "highlight";
  id: string;
  message_id: string;
  document_id: string;
  start_char: number;
  end_char: number;
  text: string;
}

export interface ServerSummaryEvent {
  type: "summary";
  id: string;
  message_id: string;
  content: string;
}

export interface ServerSuggestionEvent {
  type: "suggestion";
  id: string;
  message_id: string;
  content: string;
}

export interface ServerNoRelevantInfoEvent {
  type: "no_relevant_info";
  id: string;
  message_id: string;
}

export type ServerEvent =
  | ServerConnectedEvent
  | ServerInterimTranscriptEvent
  | ServerFinalTranscriptEvent
  | ServerProcessingEvent
  | ServerHighlightEvent
  | ServerSummaryEvent
  | ServerSuggestionEvent
  | ServerNoRelevantInfoEvent;
