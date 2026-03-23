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
    <ResizablePanelGroup orientation="horizontal">
      {/* Document panel - 50% of remaining */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full">{c2}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      {/* Transcript panel - 50% of remaining */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full">{c3}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {/* Sidebar - 15% */}
      <ResizablePanel defaultSize={15} minSize={10} maxSize={25}>
        <div className="h-full">{c1}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      {/* Main content - 85% */}
      <ResizablePanel defaultSize={85}>
        <ResizablePanelGroup orientation="horizontal">
          {/* Document panel - 50% of remaining */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full">{c2}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* Transcript panel - 50% of remaining */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full">{c3}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
