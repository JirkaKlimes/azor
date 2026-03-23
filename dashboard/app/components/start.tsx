"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { MicIcon, PauseIcon, PlayIcon, UploadIcon } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import type { ServerEvent } from "./transcript/types";

interface StartProps {
  onConversationId?: (id: string) => void;
  onCallEnd?: () => void;
  onEvent?: (event: ServerEvent) => void;
}

export default function Start({ onConversationId, onCallEnd, onEvent }: StartProps) {
  const [on, setOn] = React.useState(false);
  const [replaying, setReplaying] = React.useState(false);
  const [replayProgress, setReplayProgress] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const wsRef = React.useRef<WebSocket | null>(null);

  const handleReplayFile = async (file: File) => {
    try {
      setReplaying(true);
      setReplayProgress(0);

      const wsUrl = `ws://localhost:7600/api/call`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data) as ServerEvent;

            // Forward all events to parent
            onEvent?.(msg);

            // Handle connected specifically for backwards compat
            if (msg.type === "connected") {
              onConversationId?.(msg.conversation_id);
            }
          } catch {
            // Ignore non-JSON messages
          }
        }
      };

      ws.onopen = async () => {
        toast("Replay started", {
          position: "top-center",
          description: file.name,
        });

        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const channel0 = audioBuffer.getChannelData(0);
        const channel1 = audioBuffer.numberOfChannels > 1
          ? audioBuffer.getChannelData(1)
          : audioBuffer.getChannelData(0);

        const chunkSize = 1024;
        const sampleRate = audioBuffer.sampleRate;
        const totalChunks = Math.ceil(channel0.length / chunkSize);

        for (let i = 0; i < channel0.length; i += chunkSize) {
          const micChunk = channel0.slice(i, i + chunkSize);
          const screenChunk = channel1.slice(i, i + chunkSize);

          const micBuffer = new ArrayBuffer(4 + micChunk.length * 4);
          const micView = new DataView(micBuffer);
          micView.setUint8(0, 0);
          const micFloats = new Float32Array(micBuffer, 4);
          micFloats.set(micChunk);
          ws.send(micBuffer);

          const screenBuffer = new ArrayBuffer(4 + screenChunk.length * 4);
          const screenView = new DataView(screenBuffer);
          screenView.setUint8(0, 1);
          const screenFloats = new Float32Array(screenBuffer, 4);
          screenFloats.set(screenChunk);
          ws.send(screenBuffer);

          const progress = Math.round(((i / chunkSize + 1) / totalChunks) * 100);
          setReplayProgress(progress);

          await new Promise(resolve => setTimeout(resolve, (chunkSize / sampleRate) * 1000));
        }

        toast("Replay completed", {
          position: "top-center",
        });
        ws.close();
        setReplaying(false);
        setReplayProgress(0);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        toast.error("Replay failed", {
          position: "top-center",
          description: "Could not connect to server",
        });
        setReplaying(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
        onCallEnd?.();
      };
    } catch (error) {
      console.error("Replay error:", error);
      toast.error("Replay failed", {
        position: "top-center",
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setReplaying(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleReplayFile(file);
    }
  };

  const stopReplay = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setReplaying(false);
    setReplayProgress(0);
    toast("Replay stopped", {
      position: "top-center",
    });
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      {on ? (
        <ButtonGroup className="box-loading-border">
          <Button variant="destructive" disabled>
            <MicIcon className="h-4 w-4 text-destructive" />
            12:32
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              toast("Call ended", {
                position: "top-center",
                description: `ID: ${crypto.randomUUID()}`,
              });
              setOn(false);
            }}
          >
            <PauseIcon className="h-4 w-4" />
            Stop
          </Button>
        </ButtonGroup>
      ) : replaying ? (
        <Button
          variant="destructive"
          onClick={stopReplay}
        >
          <PauseIcon className="h-4 w-4" />
          Stop Replay {replayProgress}%
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={() => {
              setOn(true);
            }}
          >
            <PlayIcon className="h-4 w-4" />
            Record
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="h-4 w-4" />
            Replay
            <span className="ml-1.5 text-[10px] text-muted-foreground">(debug)</span>
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
  );
}
