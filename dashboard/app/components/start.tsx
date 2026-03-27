'use client'

import { Button } from '@/components/ui/button'
import { MicIcon, SquareIcon } from 'lucide-react'
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
    const LOG_PREFIX = '[call-recorder]'
    const INPUT_GAIN = 6
    const toLogString = (value: unknown) => {
        if (typeof value === 'string') return value
        if (value instanceof Error) {
            return JSON.stringify({
                name: value.name,
                message: value.message,
                stack: value.stack,
            })
        }
        try {
            return JSON.stringify(value)
        } catch {
            return String(value)
        }
    }

    const log = (...args: unknown[]) => {
        console.log(LOG_PREFIX, ...args.map(toLogString))
    }
    const logWarn = (...args: unknown[]) => {
        console.warn(LOG_PREFIX, ...args.map(toLogString))
    }
    const logError = (...args: unknown[]) => {
        console.error(LOG_PREFIX, ...args.map(toLogString))
    }

    // Used by Navbar as a small websocket bridge for outgoing text messages.
    const [recording, setRecording] = React.useState(false)
    const [starting, setStarting] = React.useState(false)
    const [elapsedMs, setElapsedMs] = React.useState(0)
    const wsRef = React.useRef<WebSocket | null>(null)
    const audioContextRef = React.useRef<AudioContext | null>(null)
    const micStreamRef = React.useRef<MediaStream | null>(null)
    const screenStreamRef = React.useRef<MediaStream | null>(null)
    const micSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null)
    const screenSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null)
    const micWorkletRef = React.useRef<AudioWorkletNode | null>(null)
    const screenWorkletRef = React.useRef<AudioWorkletNode | null>(null)
    const micInputGainRef = React.useRef<GainNode | null>(null)
    const screenInputGainRef = React.useRef<GainNode | null>(null)
    const micSinkRef = React.useRef<GainNode | null>(null)
    const screenSinkRef = React.useRef<GainNode | null>(null)
    const micAnalyserRef = React.useRef<AnalyserNode | null>(null)
    const micMeterTimerRef = React.useRef<number | null>(null)
    const timerRef = React.useRef<number | null>(null)
    const startTimeRef = React.useRef<number | null>(null)
    const statusTimerRef = React.useRef<number | null>(null)
    const micFrameCountRef = React.useRef(0)
    const screenFrameCountRef = React.useRef(0)
    const eventLogTimerRef = React.useRef<number | null>(null)
    const eventCountsRef = React.useRef<Record<string, number>>({})
    const lastEventRef = React.useRef<string | null>(null)
    const droppedFrameCountRef = React.useRef(0)
    const MAX_BUFFERED_BYTES = 4 * 1024 * 1024
    const [micLevel, setMicLevel] = React.useState(0)

    useImperativeHandle(ref, () => ({
        sendMessage: (event: ClientEvent) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event))
            }
        },
    }))

    const cleanupMedia = async () => {
        log('cleanupMedia: begin')
        micWorkletRef.current?.disconnect()
        screenWorkletRef.current?.disconnect()
        micInputGainRef.current?.disconnect()
        screenInputGainRef.current?.disconnect()
        micSinkRef.current?.disconnect()
        screenSinkRef.current?.disconnect()
        micAnalyserRef.current?.disconnect()
        micSourceRef.current?.disconnect()
        screenSourceRef.current?.disconnect()

        micWorkletRef.current = null
        screenWorkletRef.current = null
        micInputGainRef.current = null
        screenInputGainRef.current = null
        micSinkRef.current = null
        screenSinkRef.current = null
        micAnalyserRef.current = null
        micSourceRef.current = null
        screenSourceRef.current = null

        micStreamRef.current?.getTracks().forEach((track) => track.stop())
        screenStreamRef.current?.getTracks().forEach((track) => track.stop())
        micStreamRef.current = null
        screenStreamRef.current = null

        if (audioContextRef.current) {
            await audioContextRef.current.close()
            audioContextRef.current = null
        }
        log('cleanupMedia: done')
    }

    const attachStream = async (
        context: AudioContext,
        stream: MediaStream,
        channel: 0 | 1,
    ) => {
        await context.audioWorklet.addModule('/worklets/recording-worklet.js')

        const source = context.createMediaStreamSource(stream)
        const inputGain = context.createGain()
        inputGain.gain.value = INPUT_GAIN
        const worklet = new AudioWorkletNode(context, 'recording-processor', {
            processorOptions: {
                chunkSize: 1024,
            },
        })
        const sink = context.createGain()
        sink.gain.value = 0

        worklet.port.onmessage = (event) => {
            const ws = wsRef.current
            if (!ws || ws.readyState !== WebSocket.OPEN) return

            if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
                droppedFrameCountRef.current += 1
                return
            }

            const input = event.data as Float32Array
            if (channel === 0) {
                micFrameCountRef.current += 1
            } else {
                screenFrameCountRef.current += 1
            }
            const packet = new ArrayBuffer(4 + input.length * 4)
            const view = new DataView(packet)
            view.setUint8(0, channel)
            new Float32Array(packet, 4).set(input)
            ws.send(packet)
        }

        source.connect(inputGain)
        inputGain.connect(worklet)
        worklet.connect(sink)
        sink.connect(context.destination)

        return { source, inputGain, worklet, sink }
    }

    const startCall = async () => {
        if (recording || starting) return

        setStarting(true)
        log('startCall: requested')

        try {
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            })
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                audio: true,
                video: true,
            })

            if (screenStream.getAudioTracks().length === 0) {
                screenStream.getTracks().forEach((track) => track.stop())
                throw new Error('No screen audio track available')
            }

            log('media streams ready', {
                micTracks: micStream.getAudioTracks().length,
                screenAudioTracks: screenStream.getAudioTracks().length,
                screenVideoTracks: screenStream.getVideoTracks().length,
            })

            micStreamRef.current = micStream
            screenStreamRef.current = screenStream

            const ws = new WebSocket('ws://localhost:7600/api/call')
            wsRef.current = ws

            ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data) as ServerEvent
                        eventCountsRef.current[msg.type] =
                            (eventCountsRef.current[msg.type] ?? 0) + 1
                        lastEventRef.current = msg.type
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
                log('ws open')
                const context = new AudioContext({ sampleRate: 44100 })
                audioContextRef.current = context
                await context.resume()

                micFrameCountRef.current = 0
                screenFrameCountRef.current = 0

                const micNodes = await attachStream(context, micStream, 0)
                const screenNodes = await attachStream(context, screenStream, 1)

                const micAnalyser = context.createAnalyser()
                micAnalyser.fftSize = 2048
                micAnalyserRef.current = micAnalyser
                micNodes.source.connect(micAnalyser)

                micSourceRef.current = micNodes.source
                micInputGainRef.current = micNodes.inputGain
                micWorkletRef.current = micNodes.worklet
                micSinkRef.current = micNodes.sink
                screenSourceRef.current = screenNodes.source
                screenInputGainRef.current = screenNodes.inputGain
                screenWorkletRef.current = screenNodes.worklet
                screenSinkRef.current = screenNodes.sink

                if (micMeterTimerRef.current) {
                    window.clearInterval(micMeterTimerRef.current)
                }
                micMeterTimerRef.current = window.setInterval(() => {
                    const analyser = micAnalyserRef.current
                    if (!analyser) return
                    const buffer = new Float32Array(analyser.fftSize)
                    analyser.getFloatTimeDomainData(buffer)
                    let sum = 0
                    for (const value of buffer) {
                        sum += value * value
                    }
                    const rms = Math.sqrt(sum / buffer.length)
                    setMicLevel(rms)
                }, 200)

                screenStream.getTracks().forEach((track) => {
                    track.onended = () => {
                        logWarn('screen track ended')
                        void stopCall()
                    }
                })

                micStream.getAudioTracks().forEach((track) => {
                    track.onended = () => {
                        logWarn('mic track ended')
                        void stopCall()
                    }
                    track.onmute = () => {
                        logWarn('mic track muted')
                        void stopCall()
                    }
                })

                screenStream.getAudioTracks().forEach((track) => {
                    track.onmute = () => {
                        logWarn('screen audio track muted')
                        void stopCall()
                    }
                })

                setRecording(true)
                setStarting(false)
            }

            ws.onerror = async (event) => {
                logError('ws error', event)
                await cleanupMedia()
                setStarting(false)
                setRecording(false)
            }

            ws.onclose = async (event) => {
                log('ws closed', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                })
                wsRef.current = null
                await cleanupMedia()
                setRecording(false)
                setStarting(false)
                onCallEnd?.()
            }
        } catch (error) {
            logError('Failed to start call', error)
            await cleanupMedia()
            setStarting(false)
            setRecording(false)
        }
    }

    const stopCall = async () => {
        log('stopCall: requested')
        wsRef.current?.close()
        wsRef.current = null
        await cleanupMedia()
        setRecording(false)
        setStarting(false)
    }

    React.useEffect(() => {
        const handleVisibility = () => {
            const context = audioContextRef.current
            if (recording && context && context.state === 'suspended') {
                logWarn('audio context suspended, resuming')
                void context.resume()
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        window.addEventListener('focus', handleVisibility)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
            window.removeEventListener('focus', handleVisibility)
        }
    }, [recording])

    React.useEffect(() => {
        if (recording) {
            startTimeRef.current = Date.now()
            setElapsedMs(0)
            timerRef.current = window.setInterval(() => {
                if (startTimeRef.current) {
                    setElapsedMs(Date.now() - startTimeRef.current)
                }
            }, 1000)

            const logStatus = () => {
                const context = audioContextRef.current
                const ws = wsRef.current
                const micTrack = micStreamRef.current?.getAudioTracks()[0]
                const screenTrack = screenStreamRef.current?.getAudioTracks()[0]
                log('status', {
                    audioState: context?.state ?? 'none',
                    wsState: ws?.readyState ?? 'none',
                    wsBuffered: ws?.bufferedAmount ?? 0,
                    micTrackState: micTrack?.readyState ?? 'none',
                    micMuted: micTrack?.muted ?? null,
                    screenTrackState: screenTrack?.readyState ?? 'none',
                    screenMuted: screenTrack?.muted ?? null,
                    micFrames: micFrameCountRef.current,
                    screenFrames: screenFrameCountRef.current,
                    droppedFrames: droppedFrameCountRef.current,
                })
            }

            logStatus()
            statusTimerRef.current = window.setInterval(logStatus, 10000)

            eventLogTimerRef.current = window.setInterval(() => {
                log('events', {
                    last: lastEventRef.current,
                    counts: eventCountsRef.current,
                })
            }, 10000)
        } else {
            if (micMeterTimerRef.current) {
                window.clearInterval(micMeterTimerRef.current)
                micMeterTimerRef.current = null
            }
            setMicLevel(0)
            if (timerRef.current) {
                window.clearInterval(timerRef.current)
                timerRef.current = null
            }
            if (statusTimerRef.current) {
                window.clearInterval(statusTimerRef.current)
                statusTimerRef.current = null
            }
            if (eventLogTimerRef.current) {
                window.clearInterval(eventLogTimerRef.current)
                eventLogTimerRef.current = null
            }
            startTimeRef.current = null
            setElapsedMs(0)
            droppedFrameCountRef.current = 0
        }

        return () => {
            if (micMeterTimerRef.current) {
                window.clearInterval(micMeterTimerRef.current)
                micMeterTimerRef.current = null
            }
            if (timerRef.current) {
                window.clearInterval(timerRef.current)
                timerRef.current = null
            }
            if (statusTimerRef.current) {
                window.clearInterval(statusTimerRef.current)
                statusTimerRef.current = null
            }
            if (eventLogTimerRef.current) {
                window.clearInterval(eventLogTimerRef.current)
                eventLogTimerRef.current = null
            }
        }
    }, [recording])

    React.useEffect(() => {
        return () => {
            void stopCall()
        }
    }, [])

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}`
    }

    const micLevelPercent = Math.min(100, Math.round(micLevel * 300))

    return (
        <div className="flex items-center gap-3 text-sm">
            {recording ? (
                <>
                    <span className="text-muted-foreground font-mono text-xs">
                        {formatDuration(elapsedMs)}
                    </span>
                    <div className="bg-muted flex h-2 w-20 overflow-hidden rounded-full">
                        <div
                            className="bg-foreground h-full transition-[width]"
                            style={{ width: `${micLevelPercent}%` }}
                        />
                    </div>
                    <Button variant="destructive" onClick={() => void stopCall()}>
                        <SquareIcon className="h-4 w-4" />
                        Stop Call
                    </Button>
                </>
            ) : (
                <Button variant="outline" onClick={startCall} disabled={starting}>
                    <MicIcon className="h-4 w-4" />
                    {starting ? 'Starting...' : 'Start Call'}
                </Button>
            )}
        </div>
    )
})

export default Start
