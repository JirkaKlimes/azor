import Navbar from './components/navbar'
import { ChatPanel } from './components/chat'
import { TranscriptPanel } from './components/transcript'

export default function Home() {
    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <Navbar />
            <div className="h-full w-full p-5 pt-16">
                <div className="flex h-full w-full gap-5">
                    <div className="relative flex w-2/3 flex-col overflow-hidden rounded-lg border pt-8 shadow-md">
                        <p className="bg-accent text-muted-foreground absolute left-0 top-0 z-10 h-8 w-full border-b px-2 py-1 shadow">
                            Copilot
                        </p>
                        <ChatPanel />
                    </div>
                    <div className="relative flex w-1/3 flex-col overflow-hidden rounded-lg border pt-8 shadow-md hover:cursor-not-allowed">
                        <p className="bg-accent text-muted-foreground absolute left-0 top-0 z-10 h-8 w-full border-b px-2 py-1 shadow">
                            Transcript
                        </p>
                        <TranscriptPanel />
                    </div>
                </div>
            </div>
        </div>
    )
}
