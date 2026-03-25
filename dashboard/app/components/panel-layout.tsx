import React, { ReactNode } from 'react'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable'

export default function PanelLayout({ c1, c2 }: { c1: ReactNode; c2: ReactNode }) {
    return (
        <div className="flex h-full w-full flex-col">
            <div className="text-muted-foreground flex h-14 w-full items-center justify-between px-4">
                <span>Copilot</span>
                <span>Transcription</span>
            </div>
            <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
                {/* Chat panel */}
                <ResizablePanel defaultSize="67%" minSize="50%" maxSize="80%">
                    <div className="h-full">{c1}</div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                {/* Transcript panel */}
                <ResizablePanel defaultSize="33%" minSize="20%" maxSize="50%">
                    <div className="h-full">{c2}</div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
