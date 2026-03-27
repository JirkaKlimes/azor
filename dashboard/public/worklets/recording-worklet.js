class RecordingProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super()
        const chunkSize = options?.processorOptions?.chunkSize
        this.chunkSize = typeof chunkSize === 'number' ? chunkSize : 1024
        this.buffer = new Float32Array(this.chunkSize)
        this.bufferOffset = 0
    }

    process(inputs) {
        const channelData = inputs[0] && inputs[0][0]
        if (!channelData || channelData.length === 0) {
            return true
        }

        let offset = 0
        while (offset < channelData.length) {
            const remaining = this.chunkSize - this.bufferOffset
            const available = channelData.length - offset
            const toCopy = Math.min(remaining, available)

            this.buffer.set(
                channelData.subarray(offset, offset + toCopy),
                this.bufferOffset,
            )

            this.bufferOffset += toCopy
            offset += toCopy

            if (this.bufferOffset === this.chunkSize) {
                const copy = new Float32Array(this.chunkSize)
                copy.set(this.buffer)
                this.port.postMessage(copy, [copy.buffer])
                this.bufferOffset = 0
            }
        }

        return true
    }
}

registerProcessor('recording-processor', RecordingProcessor)
