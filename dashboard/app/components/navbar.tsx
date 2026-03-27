'use client'

import { ThemeToggle } from './themeToggle'
import FavIcon from '../icons/favicon'
import StartButton from './start'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
export default function Navbar() {
    return (
        <div className="fixed left-1/2 top-0 z-50 -translate-x-1/2">
            <div className="bg-background flex items-center gap-2 rounded-b-2xl border-x border-b p-2 pr-3 shadow-md">
                <div className="flex items-center px-1 text-xl font-extrabold">
                    <FavIcon className="h-9 w-9" />
                    Azor
                </div>
                <Separator orientation="vertical" className="my-1" />
                <StartButton />
                <ThemeToggle />
                <Avatar>
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>CN</AvatarFallback>
                </Avatar>
            </div>
        </div>
    )
}
