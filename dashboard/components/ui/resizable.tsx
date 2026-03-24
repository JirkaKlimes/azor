'use client'

import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/lib/utils'

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
    return (
        <ResizablePrimitive.Group
            data-slot="resizable-panel-group"
            className={cn(
                'flex h-full w-full aria-[orientation=vertical]:flex-col',
                className,
            )}
            {...props}
        />
    )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
    return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
    withHandle,
    className,
    ...props
}: ResizablePrimitive.SeparatorProps & {
    withHandle?: boolean
}) {
    return (
        <ResizablePrimitive.Separator
            data-slot="resizable-handle"
            className={cn(
                'relative flex w-px items-center justify-center outline-none ',
                className,
            )}
            {...props}
        >
            {withHandle && (
                <div className="bg-border z-10 flex h-6 w-1 shrink-0 rounded-lg" />
            )}
        </ResizablePrimitive.Separator>
    )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
