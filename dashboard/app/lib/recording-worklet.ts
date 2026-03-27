class RecordingProcessor extends AudioWorkletProcessor {
    process(inputs: Float32Array[][]) {
        const channelData = inputs[0]?.[0]
        if (!channelData || channelData.length === 0) {
            return true
        }

        const copy = new Float32Array(channelData.length)
        copy.set(channelData)
        this.port.postMessage(copy, [copy.buffer])
        return true
    }
}

registerProcessor('recording-processor', RecordingProcessor)
