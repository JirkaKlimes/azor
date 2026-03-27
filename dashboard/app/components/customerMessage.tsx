export default function CustomerMessage({ text }: { text: string }) {
    return (
        <div className="flex justify-start">
            <div className="bg-muted text-foreground border-border/60 max-w-[75%] rounded-2xl rounded-bl-md border px-4 py-2 text-sm leading-relaxed shadow-sm">
                <p className="whitespace-pre-wrap">{text}</p>
            </div>
        </div>
    )
}
