export interface Reference {
    documentId: string
    start: number
    end: number
    text: string
}

export interface AIResponse {
    id: string
    triggerId: string
    content: string
    references: Reference[]
    suggestion: string | null
}

export interface OperatorQuestion {
    id: string
    content: string
}

export type ChatItem =
    | { type: 'response'; data: AIResponse }
    | { type: 'question'; data: OperatorQuestion }
    | { type: 'loading'; triggerId: string }

// Parsed content segments for rendering AI messages with inline references
export type ContentSegment =
    | { type: 'text'; value: string }
    | { type: 'ref'; index: number }

// Helper function to parse content with [[ref:N]] markers into segments
export function parseContent(content: string): ContentSegment[] {
    const segments: ContentSegment[] = []
    const regex = /\[\[ref:(\d+)\]\]/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            segments.push({
                type: 'text',
                value: content.slice(lastIndex, match.index),
            })
        }
        // Add the reference
        segments.push({
            type: 'ref',
            index: parseInt(match[1], 10),
        })
        lastIndex = regex.lastIndex
    }

    // Add remaining text after last match
    if (lastIndex < content.length) {
        segments.push({
            type: 'text',
            value: content.slice(lastIndex),
        })
    }

    return segments
}
