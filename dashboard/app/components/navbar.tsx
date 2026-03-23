"use client";

import { useRef, forwardRef, useImperativeHandle } from "react";
import { ThemeToggle } from "./themeToggle";
import FavIcon from "../icons/favicon";
import StartButton, { type StartRef } from "./start";
import type { ServerEvent, ClientEvent } from "./transcript/types";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavbarProps {
  onConversationId?: (id: string) => void;
  onCallEnd?: () => void;
  onEvent?: (event: ServerEvent) => void;
}

export interface NavbarRef {
  sendMessage: (event: ClientEvent) => void;
}

const Navbar = forwardRef<NavbarRef, NavbarProps>(function Navbar(
  { onConversationId, onCallEnd, onEvent },
  ref,
) {
  // Used by Home page to forward typed messages to the Start websocket bridge.
  const startRef = useRef<StartRef>(null);

  useImperativeHandle(ref, () => ({
    sendMessage: (event: ClientEvent) => {
      startRef.current?.sendMessage(event);
    },
  }));

  return (
    <div className="fixed z-50 left-1/2 top-4 -translate-x-1/2">
      <div className="border rounded-2xl bg-background p-2 pr-3 gap-2 flex items-center shadow-lg">
        <div className="font-extrabold text-xl px-1 flex items-center">
          <FavIcon className="w-9 h-9" />
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
  );
});

export default Navbar;
