"use client";

import { GripVerticalIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./themeToggle";
import { Button } from "@/components/ui/button";
import FavIcon from "../icons/favicon";
import StartButton from "./start";
import type { ServerEvent } from "./transcript/types";
import { Separator } from "@/components/ui/separator";
import { CommandWithGroups } from "./command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavbarProps {
  onConversationId?: (id: string) => void;
  onCallEnd?: () => void;
  onEvent?: (event: ServerEvent) => void;
}

export default function Navbar({ onConversationId, onCallEnd, onEvent }: NavbarProps) {
  const navbarRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 24 });

  const clampPosition = useCallback((x: number, y: number) => {
    const navbar = navbarRef.current;
    if (!navbar) {
      return { x, y };
    }

    const maxX = Math.max(0, window.innerWidth - navbar.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - navbar.offsetHeight);

    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }, []);

  useEffect(() => {
    const navbar = navbarRef.current;
    if (!navbar) {
      return;
    }

    const margin = 24;
    const startX = (window.innerWidth - navbar.offsetWidth) / 2;
    const startY = window.innerHeight - navbar.offsetHeight - margin;
    setPosition(clampPosition(startX, startY));
    setIsPositioned(true);
  }, [clampPosition]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const navbar = navbarRef.current;
    if (!navbar) {
      return;
    }

    const rect = navbar.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragOffset = dragOffsetRef.current;
    if (!dragOffset) {
      return;
    }

    const nextX = event.clientX - dragOffset.x;
    const nextY = event.clientY - dragOffset.y;
    setPosition(clampPosition(nextX, nextY));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOffsetRef.current = null;
  };

  return (
    <div
      ref={navbarRef}
      className="fixed z-50"
      style={{
        left: position.x,
        top: position.y,
        visibility: isPositioned ? "visible" : "hidden",
      }}
    >
      <div className="border rounded-2xl bg-background p-2 gap-2 flex items-center shadow-lg">
        <div className="font-extrabold text-xl px-1 flex items-center">
          <FavIcon className="w-9 h-9" />
          Azor
        </div>
        <Separator orientation="vertical" className="my-1" />
        <CommandWithGroups />
        <StartButton onConversationId={onConversationId} onCallEnd={onCallEnd} onEvent={onEvent} />
        <ThemeToggle />
        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
        <Button
          variant={"ghost"}
          type="button"
          aria-label="Drag navbar"
          className="rounded-md p-1 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <GripVerticalIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
    </div>
  );
}
