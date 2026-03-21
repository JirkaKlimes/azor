"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { MicIcon, PauseIcon, PlayIcon } from "lucide-react";
import React from "react";
import { toast } from "sonner";

export default function Start() {
  const [on, setOn] = React.useState(false);

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
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            setOn(true);
          }}
        >
          <PlayIcon className="h-4 w-4" />
          Record
        </Button>
      )}
    </div>
  );
}
