import React, { ReactNode } from 'react'

export default function PanelLayout({ c1, c2 }: { c1: ReactNode; c2: ReactNode }) {
    return (
        <div className="h-full w-full p-5 pt-16">
            <div className="flex h-full w-full gap-5">
                <div className="flex w-2/3 flex-col overflow-hidden rounded-xl border">
                    <p className="bg-accent text-muted-foreground w-full border-b px-2 py-1">
                        Copilot
                    </p>
                    {c1}
                </div>
                <div className="flex w-1/3 flex-col overflow-hidden rounded-xl border">
                    <p className="bg-accent text-muted-foreground w-full border-b px-2 py-1">
                        Transcript
                    </p>
                    {c2}
                </div>
            </div>
        </div>
    )
}
