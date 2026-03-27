'use client'

import { Button } from '@/components/ui/button'
import { MicIcon, PhoneIcon, PhoneOffIcon, SquareIcon } from 'lucide-react'
import React, { useEffect } from 'react'
import type { ServerEvent, ClientEvent } from './transcript/types'
import { useAppContext } from '../context/app'

export default function Start() {
    const {
        handleConversationId,
        handleCallEnd,
        handleEvent,
        clearSession,
        registerSendMessageHandler,
    } = useAppContext()
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
    const [listening, setListening] = React.useState(false)
    const [listenStarting, setListenStarting] = React.useState(false)
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
    const timerRef = React.useRef<number | null>(null)
    const startTimeRef = React.useRef<number | null>(null)
    const statusTimerRef = React.useRef<number | null>(null)
    const micFrameCountRef = React.useRef(0)
    const screenFrameCountRef = React.useRef(0)
    const eventLogTimerRef = React.useRef<number | null>(null)
    const eventCountsRef = React.useRef<Record<string, number>>({})
    const lastEventRef = React.useRef<string | null>(null)
    const droppedFrameCountRef = React.useRef(0)
    const listeningRef = React.useRef(false)
    const callFinalizedRef = React.useRef(false)
    const MAX_BUFFERED_BYTES = 4 * 1024 * 1024

    useEffect(() => {
        registerSendMessageHandler((event: ClientEvent) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event))
            }
        })

        return () => {
            registerSendMessageHandler(null)
        }
    }, [registerSendMessageHandler])

    const cleanupMedia = async () => {
        log('cleanupMedia: begin')
        micWorkletRef.current?.disconnect()
        screenWorkletRef.current?.disconnect()
        micInputGainRef.current?.disconnect()
        screenInputGainRef.current?.disconnect()
        micSinkRef.current?.disconnect()
        screenSinkRef.current?.disconnect()
        micSourceRef.current?.disconnect()
        screenSourceRef.current?.disconnect()

        micWorkletRef.current = null
        screenWorkletRef.current = null
        micInputGainRef.current = null
        screenInputGainRef.current = null
        micSinkRef.current = null
        screenSinkRef.current = null
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

    const finalizeCall = async (keepMedia: boolean) => {
        if (callFinalizedRef.current) return
        callFinalizedRef.current = true
        setRecording(false)
        setStarting(false)
        handleCallEnd()
        clearSession()
        if (!keepMedia) {
            await cleanupMedia()
        }
    }

    const startListening = async () => {
        if (listening || listenStarting) return
        setListenStarting(true)
        log('startListening: requested')

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

            log('listening streams ready', {
                micTracks: micStream.getAudioTracks().length,
                screenAudioTracks: screenStream.getAudioTracks().length,
                screenVideoTracks: screenStream.getVideoTracks().length,
            })

            micStreamRef.current = micStream
            screenStreamRef.current = screenStream

            const context = new AudioContext({ sampleRate: 44100 })
            audioContextRef.current = context
            await context.resume()

            micFrameCountRef.current = 0
            screenFrameCountRef.current = 0

            const micNodes = await attachStream(context, micStream, 0)
            const screenNodes = await attachStream(context, screenStream, 1)

            micSourceRef.current = micNodes.source
            micInputGainRef.current = micNodes.inputGain
            micWorkletRef.current = micNodes.worklet
            micSinkRef.current = micNodes.sink
            screenSourceRef.current = screenNodes.source
            screenInputGainRef.current = screenNodes.inputGain
            screenWorkletRef.current = screenNodes.worklet
            screenSinkRef.current = screenNodes.sink

            screenStream.getTracks().forEach((track) => {
                track.onended = () => {
                    logWarn('screen track ended')
                    void stopListening()
                }
            })

            micStream.getAudioTracks().forEach((track) => {
                track.onended = () => {
                    logWarn('mic track ended')
                    void stopListening()
                }
                track.onmute = () => {
                    logWarn('mic track muted')
                    void stopListening()
                }
            })

            screenStream.getAudioTracks().forEach((track) => {
                track.onmute = () => {
                    logWarn('screen audio track muted')
                    void stopListening()
                }
            })

            setListening(true)
            listeningRef.current = true
        } catch (error) {
            logError('Failed to start listening', error)
            await cleanupMedia()
            setListening(false)
            listeningRef.current = false
        } finally {
            setListenStarting(false)
        }
    }

    const stopListening = async () => {
        log('stopListening: requested')
        await stopCall(true)
        setListening(false)
        listeningRef.current = false
        await cleanupMedia()
    }

    const startCall = async () => {
        if (recording || starting || !listening) return

        setStarting(true)
        log('startCall: requested')

        try {
            const micStream = micStreamRef.current
            const screenStream = screenStreamRef.current
            if (!micStream || !screenStream || !audioContextRef.current) {
                throw new Error('Listening is not ready')
            }

            const ws = new WebSocket('ws://localhost:7600/api/call')
            wsRef.current = ws
            callFinalizedRef.current = false

            ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data) as ServerEvent
                        eventCountsRef.current[msg.type] =
                            (eventCountsRef.current[msg.type] ?? 0) + 1
                        lastEventRef.current = msg.type
                        handleEvent(msg)
                        if (msg.type === 'connected') {
                            handleConversationId(msg.conversation_id)
                        }
                    } catch {
                        // Ignore non-JSON messages
                    }
                }
            }

            ws.onopen = async () => {
                log('ws open')
                await audioContextRef.current?.resume()

                setRecording(true)
                setStarting(false)
            }

            ws.onerror = async (event) => {
                logError('ws error', event)
                await finalizeCall(listeningRef.current)
            }

            ws.onclose = async (event) => {
                log('ws closed', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                })
                wsRef.current = null
                await finalizeCall(listeningRef.current)
            }
        } catch (error) {
            logError('Failed to start call', error)
            await finalizeCall(listeningRef.current)
        }
    }

    const stopCall = async (keepMedia: boolean) => {
        log('stopCall: requested')
        wsRef.current?.close()
        wsRef.current = null
        await finalizeCall(keepMedia)
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
            void stopListening()
        }
    }, [])

    React.useEffect(() => {
        void startListening()
    }, [])

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}`
    }

    return (
        <div className="flex items-center gap-3 text-sm">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <span
                    className={`mx-px h-2.5 w-2.5 rounded-full ${
                        listening
                            ? 'box-loading-border bg-emerald-500 text-emerald-500'
                            : 'bg-destructive'
                    }`}
                />
                Microphone & Audio
            </div>
            {recording ? (
                <>
                    <span className="text-muted-foreground font-mono text-xs">
                        {formatDuration(elapsedMs)}
                    </span>
                    <Button variant="destructive" onClick={() => void stopCall(true)}>
                        <PhoneOffIcon className="h-4 w-4" />
                        Stop Session
                    </Button>
                </>
            ) : (
                <Button
                    variant="outline"
                    onClick={startCall}
                    disabled={!listening || starting}
                >
                    <PhoneIcon className="h-4 w-4" />
                    {starting ? 'Starting...' : 'Start Session'}
                </Button>
            )}
        </div>
    )
}
