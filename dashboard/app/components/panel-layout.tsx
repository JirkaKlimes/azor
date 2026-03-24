import React, { ReactNode } from 'react'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable'

export default function Layout({ c1, c2 }: { c1: ReactNode; c2: ReactNode }) {
    // Used by app/page.tsx: left is documents, right is transcript.
    return (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
            {/* Document panel */}
            <ResizablePanel defaultSize={67} minSize={30}>
                <div className="h-full">{c1}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            {/* Transcript panel */}
            <ResizablePanel defaultSize={33} minSize={30}>
                <div className="h-full">{c2}</div>
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}
