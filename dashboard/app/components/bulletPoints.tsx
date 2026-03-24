'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const data = [
    { id: 1, text: 'The Primary Directive of Visual Density' },
    { id: 2, text: 'Section One: The Foundation of Content' },
    { id: 3, text: 'Subsection A: The Granular Details' },
    { id: 4, text: 'Detail Level: High' },
    { id: 5, text: 'Experimental Micro-Headings' },
    { id: 6, text: 'The Absolute Minimum: H6' },
    { id: 7, text: 'Section Two: The Return of the Wall' },
    { id: 8, text: 'Section Three: Final Verticality' },
    { id: 9, text: 'BIG HEADER REPRISE' },
]

export default function BulletPoints() {
    const [activeId, setActiveId] = React.useState<number | null>(null)

    const scrollWithOffset = (target: HTMLElement, offsetTop: number) => {
        let parent: HTMLElement | null = target.parentElement

        while (parent) {
            const style = window.getComputedStyle(parent)
            const isScrollableY = /(auto|scroll|overlay)/.test(style.overflowY)

            if (isScrollableY && parent.scrollHeight > parent.clientHeight) {
                const parentRect = parent.getBoundingClientRect()
                const targetRect = target.getBoundingClientRect()
                const nextTop =
                    parent.scrollTop + (targetRect.top - parentRect.top) - offsetTop

                parent.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
                return
            }

            parent = parent.parentElement
        }
    }

    return (
        <>
            <div className="mb-2 px-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Sections
                </p>
            </div>

            <ol className="space-y-1">
                {data.map((item, index) => (
                    <li key={item.id}>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'h-auto w-full items-start justify-start gap-2 whitespace-normal px-2 py-2 text-left',
                                activeId === item.id && 'bg-muted text-foreground',
                            )}
                            onClick={() => {
                                const element = document.getElementById(
                                    item.id.toString(),
                                )
                                if (!element) return

                                setActiveId(item.id)
                                scrollWithOffset(element, 24)
                            }}
                        >
                            <span className="min-w-6 border-border/70 bg-background text-muted-foreground mt-0.5 inline-flex items-center justify-center rounded-md border px-1.5 text-[10px] font-semibold">
                                {(index + 1).toString().padStart(2, '0')}
                            </span>
                            <span className="leading-snug">{item.text}</span>
                        </Button>
                    </li>
                ))}
            </ol>
        </>
    )
}
