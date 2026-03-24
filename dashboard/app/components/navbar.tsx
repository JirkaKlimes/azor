'use client'

import { useRef, forwardRef, useImperativeHandle } from 'react'
import { ThemeToggle } from './themeToggle'
import FavIcon from '../icons/favicon'
import StartButton, { type StartRef } from './start'
import type { ServerEvent, ClientEvent } from './transcript/types'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface NavbarProps {
    onConversationId?: (id: string) => void
    onCallEnd?: () => void
    onEvent?: (event: ServerEvent) => void
}

export interface NavbarRef {
    sendMessage: (event: ClientEvent) => void
}

const Navbar = forwardRef<NavbarRef, NavbarProps>(function Navbar(
    { onConversationId, onCallEnd, onEvent },
    ref,
) {
    // Used by Home page to forward typed messages to the Start websocket bridge.
    const startRef = useRef<StartRef>(null)

    useImperativeHandle(ref, () => ({
        sendMessage: (event: ClientEvent) => {
            startRef.current?.sendMessage(event)
        },
    }))

    return (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
            <div className="bg-background flex items-center gap-2 rounded-2xl border p-2 pr-3 shadow-lg">
                <div className="flex items-center px-1 text-xl font-extrabold">
                    <FavIcon className="h-9 w-9" />
                    Azor
                </div>
                <Separator orientation="vertical" className="my-1" />
                <StartButton
                    ref={startRef}
                    onConversationId={onConversationId}
                    onCallEnd={onCallEnd}
                    onEvent={onEvent}
                />
                <ThemeToggle />
                <Avatar>
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>CN</AvatarFallback>
                </Avatar>
            </div>
        </div>
    )
})

export default Navbar
