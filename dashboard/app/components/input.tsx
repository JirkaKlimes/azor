import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp } from "lucide-react";

export default function ChatInput() {
  return (
    <div className="w-11/12 absolute bottom-6 z-10 p-4 bg-background border rounded-2xl shadow">
      <Textarea
        placeholder="Ask, search, or make anything..."
        className="min-h-12 w-full resize-none border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
        rows={1}
      />

      <div className="flex items-center justify-end mt-4">
        <Button
          size="icon"
          variant={"outline"}
          className="h-9 w-9 rounded-full"
        >
          <ArrowUp className="w-4 h-4 stroke-3" />
        </Button>
      </div>
    </div>
  );
}
