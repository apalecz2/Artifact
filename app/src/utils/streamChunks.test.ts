import { describe, it, expect, vi } from 'vitest';
import { rechunk } from './streamChunks';

/** A stream that yields the given byte-lengths as distinct chunks. */
const streamOf = (lengths: number[]): ReadableStream<Uint8Array> => {
    let seq = 0;
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const length of lengths) {
                // Each chunk carries a recognisable byte so ordering is checkable.
                controller.enqueue(new Uint8Array(length).fill(seq++ % 256));
            }
            controller.close();
        },
    });
};

const drain = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> => {
    const out: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return out;
        out.push(value);
    }
};

const flatten = (blocks: Uint8Array[]): number[] => blocks.flatMap(b => [...b]);

describe('rechunk', () => {
    it('batches many small chunks into blocks of at least the target size', async () => {
        // What File.stream() looks like: ~64 KB at a time, here scaled down.
        const blocks = await drain(rechunk(streamOf(Array(10).fill(10)), 40));
        expect(blocks.map(b => b.length)).toEqual([40, 40, 20]);
    });

    it('preserves the bytes and their order exactly', async () => {
        const source = streamOf([3, 3, 3]);
        const blocks = await drain(rechunk(source, 4));
        expect(flatten(blocks)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    });

    it('never splits a source chunk, so a block can overshoot by one of them', async () => {
        const blocks = await drain(rechunk(streamOf([30, 30]), 40));
        expect(blocks.map(b => b.length)).toEqual([60]);
    });

    it('passes a chunk larger than the target straight through', async () => {
        const blocks = await drain(rechunk(streamOf([100]), 40));
        expect(blocks.map(b => b.length)).toEqual([100]);
    });

    it('emits the trailing partial block rather than dropping it', async () => {
        // The bug that would silently truncate every upload not a multiple of the
        // block size: the last, short accumulation has to be flushed on close.
        const blocks = await drain(rechunk(streamOf([5]), 40));
        expect(blocks.map(b => b.length)).toEqual([5]);
    });

    it('produces nothing for an empty stream', async () => {
        expect(await drain(rechunk(streamOf([]), 40))).toEqual([]);
        expect(await drain(rechunk(streamOf([0, 0]), 40))).toEqual([]);
    });

    it('cancels the source when the consumer gives up', async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(new Uint8Array(80)); },
            cancel,
        });
        const stream = rechunk(source, 40);
        const reader = stream.getReader();
        await reader.read();
        await reader.cancel('gave up');
        expect(cancel).toHaveBeenCalledWith('gave up');
    });
});
