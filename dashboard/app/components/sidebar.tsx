"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileTextIcon, PhoneIcon, PhoneOffIcon, ClockIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, getDocumentTitle } from "@/lib/utils";
import type { TranscriptHighlight, Document } from "./transcript/types";
import { fadeIn } from "@/lib/animations";

interface SidebarProps {
  highlights: TranscriptHighlight[];
  documents?: Map<string, Document>;
  conversationId: string | null;
  callEnded?: boolean;
  onDocumentClick?: (documentId: string) => void;
  onClear?: () => void;
  callDuration?: number;
}

export default function Sidebar({
  highlights,
  documents,
  conversationId,
  callEnded,
  onDocumentClick,
  onClear,
  callDuration,
}: SidebarProps) {
  // Group highlights by document
  const documentMap = new Map<string, { count: number }>();
  for (const h of highlights) {
    const existing = documentMap.get(h.documentId);
    if (existing) {
      existing.count++;
    } else {
      documentMap.set(h.documentId, { count: 1 });
    }
  }
  const documentList = Array.from(documentMap.entries());

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isActiveCall = conversationId && !callEnded;
  const hasData = highlights.length > 0;

  return (
    <div className="flex flex-col h-full p-3 gap-4">
      {/* Call info section */}
      {(isActiveCall || callEnded) && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className={cn(
            "rounded-lg border border-border bg-card p-3",
            callEnded && "border-dashed"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              {callEnded ? (
                <>
                  <PhoneOffIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Previous Call</span>
                </>
              ) : (
                <>
                  <PhoneIcon className="h-4 w-4 text-green-500" />
                  <span>Active Call</span>
                </>
              )}
            </div>
            {callEnded && (
              <Button size="icon-xs" variant="ghost" onClick={onClear} title="Clear session">
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {callDuration !== undefined && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <ClockIcon className="h-3 w-3" />
              <span>{formatDuration(callDuration)}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Referenced documents section */}
      <div className="flex-1 min-h-0">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Referenced Documents
        </h3>
        <div className="space-y-1 overflow-y-auto max-h-[calc(100%-2rem)]">
          <AnimatePresence mode="popLayout">
            {documentList.length === 0 ? (
              <motion.p
                key="empty"
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-xs text-muted-foreground px-1 py-2"
              >
                No documents referenced yet
              </motion.p>
            ) : (
              documentList.map(([docId, { count }]) => {
                const loadedDoc = documents?.get(docId);
                const displayPath = loadedDoc?.sourcePath;
                return (
                  <motion.button
                    key={docId}
                    variants={fadeIn}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    onClick={() => onDocumentClick?.(docId)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
                      "hover:bg-muted/50 transition-colors text-sm"
                    )}
                  >
                    <FileTextIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">
                      {getDocumentTitle(displayPath, docId)}
                    </span>
                    {count > 1 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                  </motion.button>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
