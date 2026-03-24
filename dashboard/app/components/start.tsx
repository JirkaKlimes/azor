'use client'

import { Button } from '@/components/ui/button'
import { PauseIcon, UploadIcon } from 'lucide-react'
import React, { useImperativeHandle, forwardRef } from 'react'
import type { ServerEvent, ClientEvent } from './transcript/types'

interface StartProps {
    onConversationId?: (id: string) => void
    onCallEnd?: () => void
    onEvent?: (event: ServerEvent) => void
}

export interface StartRef {
    sendMessage: (event: ClientEvent) => void
}

const Start = forwardRef<StartRef, StartProps>(function Start(
    { onConversationId, onCallEnd, onEvent },
    ref,
) {
    // Used by Navbar as a small websocket bridge for replay + outgoing text messages.
    const [replaying, setReplaying] = React.useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const wsRef = React.useRef<WebSocket | null>(null)

    useImperativeHandle(ref, () => ({
        sendMessage: (event: ClientEvent) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event))
            }
        },
    }))

    const handleReplayFile = async (file: File) => {
        try {
            setReplaying(true)

            const ws = new WebSocket('ws://localhost:7600/api/call')
            wsRef.current = ws

            ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data) as ServerEvent
                        onEvent?.(msg)
                        if (msg.type === 'connected') {
                            onConversationId?.(msg.conversation_id)
                        }
                    } catch {
                        // Ignore non-JSON messages
                    }
                }
            }

            ws.onopen = async () => {
                const arrayBuffer = await file.arrayBuffer()
                const audioContext = new AudioContext()
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

                const channel0 = audioBuffer.getChannelData(0)
                const channel1 =
                    audioBuffer.numberOfChannels > 1
                        ? audioBuffer.getChannelData(1)
                        : audioBuffer.getChannelData(0)

                const chunkSize = 1024
                const sampleRate = audioBuffer.sampleRate

                for (let i = 0; i < channel0.length; i += chunkSize) {
                    const micChunk = channel0.slice(i, i + chunkSize)
                    const screenChunk = channel1.slice(i, i + chunkSize)

                    const micBuffer = new ArrayBuffer(4 + micChunk.length * 4)
                    new DataView(micBuffer).setUint8(0, 0)
                    new Float32Array(micBuffer, 4).set(micChunk)
                    ws.send(micBuffer)

                    const screenBuffer = new ArrayBuffer(4 + screenChunk.length * 4)
                    new DataView(screenBuffer).setUint8(0, 1)
                    new Float32Array(screenBuffer, 4).set(screenChunk)
                    ws.send(screenBuffer)

                    await new Promise((resolve) =>
                        setTimeout(resolve, (chunkSize / sampleRate) * 1000),
                    )
                }

                ws.close()
            }

            ws.onerror = () => {
                setReplaying(false)
            }

            ws.onclose = () => {
                wsRef.current = null
                setReplaying(false)
                onCallEnd?.()
            }
        } catch (error) {
            console.error('Replay failed', error)
            setReplaying(false)
        }
    }

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            handleReplayFile(file)
        }
    }

    const stopReplay = () => {
        wsRef.current?.close()
        wsRef.current = null
        setReplaying(false)
    }

    return (
        <div className="flex items-center gap-3 text-sm">
            {replaying ? (
                <Button variant="destructive" onClick={stopReplay}>
                    <PauseIcon className="h-4 w-4" />
                    Stop Replay
                </Button>
            ) : (
                <>
                    {/* Used by Navbar to feed mock websocket events into Home page panels. */}
                    <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <UploadIcon className="h-4 w-4" />
                        Replay
                        <span className="text-muted-foreground ml-1.5 text-[10px]">
                            (debug)
                        </span>
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                </>
            )}
        </div>
    )
})

export default Start
