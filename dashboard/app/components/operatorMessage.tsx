export default function OperatorMessage({ text }: { text: string }) {
    return (
        <div className="flex justify-end">
            <div className="bg-blue-400 border-blue-500/60 dark:border-blue-950/60 dark:bg-blue-800 max-w-[75%] rounded-2xl rounded-br-md border px-4 py-2 text-sm leading-relaxed text-white shadow-sm">
                <p className="whitespace-pre-wrap">{text}</p>
            </div>
        </div>
    )
}
