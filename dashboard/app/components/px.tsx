import React from 'react'
import { twMerge } from 'tailwind-merge'

export default function PX({
    children,
    className,
    type,
}: {
    children: React.ReactNode
    className?: string
    type?: 'default' | 'tight'
}) {
    if (type === 'tight') {
        return (
            <div className={twMerge('px-2 md:px-20 2xl:px-44', className)}>
                {children}
            </div>
        )
    }
    return <div className={twMerge('px-5 md:px-7 2xl:px-32', className)}>{children}</div>
}
