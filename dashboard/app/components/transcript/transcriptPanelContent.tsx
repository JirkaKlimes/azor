'use client'
import CustomerMessage from '../customerMessage'
import OperatorMessage from '../operatorMessage'
import type { TranscriptMessage } from './types'
import { useAppContext } from '../../context/app'
import { EmptyTranscriptChat } from './emptyTranscriptChat'

export default function TranscriptPanelContent() {
    const { transcriptMessages } = useAppContext()
    if (transcriptMessages.length === 0) {
        return <EmptyTranscriptChat />
    }

    return (
        <div className="relative flex h-full flex-col">
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {transcriptMessages.map((message) => (
                    <TranscriptMessageMapper key={message.id} message={message} />
                ))}
            </div>
        </div>
    )
}

function TranscriptMessageMapper({ message }: { message: TranscriptMessage }) {
    switch (message.role) {
        case 'operator':
            return <OperatorMessage text={message.content} />
        case 'customer':
            return <CustomerMessage text={message.content} />
        default:
            return null
    }
}
