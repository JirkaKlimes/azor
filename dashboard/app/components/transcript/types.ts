export type MessageRole = 'operator' | 'customer' | 'copilot'

export interface TranscriptMessage {
    id: string
    type: 'message'
    role: MessageRole
    content: string
    isUtterance: boolean
}

export interface TranscriptProcessing {
    id: string
    type: 'processing'
    triggerId: string
    stage: 'retrieving' | 'analyzing'
}

export interface TranscriptResponse {
    id: string
    type: 'response'
    triggerId: string
    content: string
    references: Array<{
        documentId: string
        start: number
        end: number
        text: string
    }>
    suggestion: string | null
}

export type TranscriptItem =
    | TranscriptMessage
    | TranscriptProcessing
    | TranscriptResponse

// Deprecated types - kept for backwards compatibility with document-panel
/** @deprecated Use TranscriptResponse instead */
export interface TranscriptHighlight {
    id: string
    type: 'highlight'
    triggerId: string
    documentId: string
    start: number
    end: number
    text: string
}

/** @deprecated Use TranscriptResponse instead */
export interface TranscriptSummary {
    id: string
    type: 'summary'
    triggerId: string
    text: string
}

export interface Document {
    id: string
    content: string
    sourcePath?: string
    originUrl?: string
}

// =============================================================================
// WebSocket Server Events
// =============================================================================

export interface ServerConnectedEvent {
    type: 'connected'
    conversation_id: string
}

export interface ServerInterimTranscriptEvent {
    type: 'interim_transcript'
    role: 'operator' | 'customer'
    content: string
}

export interface ServerUtteranceEvent {
    type: 'utterance'
    id: string
    role: 'operator' | 'customer'
    content: string
}

export interface ServerMessageEvent {
    type: 'message'
    id: string
    role: 'operator' | 'copilot'
    content: string
}

export interface ServerProcessingEvent {
    type: 'processing'
    id: string
    trigger_id: string
    stage: 'retrieving' | 'analyzing'
}

export interface ServerResponseEvent {
    type: 'response'
    id: string
    trigger_id: string
    content: string
    references: Array<{
        document_id: string
        start: number
        end: number
        text: string
    }>
    suggestion: string | null
}

export type ServerEvent =
    | ServerConnectedEvent
    | ServerInterimTranscriptEvent
    | ServerUtteranceEvent
    | ServerMessageEvent
    | ServerProcessingEvent
    | ServerResponseEvent

// =============================================================================
// WebSocket Client Events
// =============================================================================

export interface ClientMessageEvent {
    type: 'message'
    content: string
}

export type ClientEvent = ClientMessageEvent
