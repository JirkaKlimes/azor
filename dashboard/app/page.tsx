import PanelLayout from './components/panel-layout'
import Navbar from './components/navbar'
import { ChatPanel } from './components/chat'
import { TranscriptPanel } from './components/transcript'

export default function Home() {
    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <Navbar />
            <PanelLayout c1={<ChatPanel />} c2={<TranscriptPanel />} />
        </div>
    )
}
