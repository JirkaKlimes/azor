import React, { ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function Layout({
  c1,
  c2,
  c3,
}: {
  c1: ReactNode;
  c2: ReactNode;
  c3: ReactNode;
}) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      <ResizablePanel defaultSize="20%">
        <div className="h-full p-6">{c1}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="80%">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="40%">
            <div className="h-full p-6">{c2}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="40%">
            <div className="h-full">{c3}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
