import { HeadsetIcon } from 'lucide-react'
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty'

export function EmptyCopilotChat() {
    return (
        <Empty className="h-full">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <HeadsetIcon />
                </EmptyMedia>
                <EmptyTitle>No AI assistance yet</EmptyTitle>
                <EmptyDescription className="text-pretty max-w-xs">
                    AI assistance will appear here during the call.
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    )
}
