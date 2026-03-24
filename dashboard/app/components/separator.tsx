type SeparatorSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export default function Separator({ type }: { type?: SeparatorSize }) {
    const getHeight = () => {
        if (!type) return 'h-6 md:h-10'
        switch (type) {
            case 'xs':
                return 'h-3 md:h-5'
            case 'sm':
                return 'h-5 md:h-12'
            case 'md':
                return 'h-12 md:h-20'
            case 'lg':
                return 'h-20 md:h-[7rem]'
            case 'xl':
                return 'h-28 md:h-40'
            case '2xl':
                return 'h-32 md:h-60'
        }
    }

    return <div className={`${getHeight()} w-full`}></div>
}
