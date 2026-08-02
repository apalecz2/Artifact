/**
 * Re-chunk a byte stream into blocks of at least `size` bytes.
 *
 * Used when copying an upload into AppData. `writeFile` accepts a
 * `ReadableStream` and writes it chunk by chunk, which is what keeps a 500 MB
 * PDF out of the webview heap — but each chunk costs one IPC round-trip, and a
 * `File.stream()` yields ~64 KB at a time, so a large document would cross the
 * bridge thousands of times. Batching into a few MB keeps both bounded: peak
 * memory is one block, and the round-trips fall by two orders of magnitude.
 *
 * Blocks are *at least* `size` — the last source chunk is not split — so the
 * true ceiling is `size` plus one source chunk. A trailing partial block is
 * emitted before closing; an empty stream produces no blocks at all.
 */
export function rechunk(source: ReadableStream<Uint8Array>, size: number): ReadableStream<Uint8Array> {
    const reader = source.getReader();
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;

    const take = (): Uint8Array => {
        const block = new Uint8Array(pendingBytes);
        let at = 0;
        for (const part of pending) {
            block.set(part, at);
            at += part.length;
        }
        pending = [];
        pendingBytes = 0;
        return block;
    };

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            while (pendingBytes < size) {
                const { done, value } = await reader.read();
                if (done) {
                    if (pendingBytes > 0) controller.enqueue(take());
                    controller.close();
                    return;
                }
                if (value.length > 0) {
                    pending.push(value);
                    pendingBytes += value.length;
                }
            }
            controller.enqueue(take());
        },
        cancel(reason) {
            return reader.cancel(reason);
        },
    });
}
