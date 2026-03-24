import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUp } from 'lucide-react'

export default function ChatInput() {
    return (
        <div className="bg-background absolute bottom-6 z-10 w-11/12 rounded-2xl border p-4 shadow">
            <Textarea
                placeholder="Ask, search, or make anything..."
                className="min-h-12 w-full resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                rows={1}
            />

            <div className="mt-4 flex items-center justify-end">
                <Button size="icon" variant={'outline'} className="h-9 w-9 rounded-full">
                    <ArrowUp className="stroke-3 h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
