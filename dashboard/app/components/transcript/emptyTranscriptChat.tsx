import { MessagesSquareIcon } from 'lucide-react'
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty'

export function EmptyTranscriptChat() {
    return (
        <Empty className="h-full">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <MessagesSquareIcon />
                </EmptyMedia>
                <EmptyTitle>No transcript available</EmptyTitle>
                <EmptyDescription className="text-pretty max-w-xs">
                    The transcript of the call will appear here.
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    )
}
