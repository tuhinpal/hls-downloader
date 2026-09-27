import {
  CHUNK_DOWNLOAD_CONCURRENCY,
  EVENTS,
  SEGMENT,
  SEGMENT_RETRY_ATTEMPTS,
} from "@/constant";
import parseHls, { Segment } from "../parseHls";
import { Mp4Remuxer } from "./Mp4Remuxer";
import { OrderedPrefetcher } from "./OrderedPrefetcher";
import type { OutputSink, SinkResult } from "./OutputSink";
import { SegmentFetcher } from "./SegmentFetcher";

type OnEventFn = (event: string, data?: any) => void;

export class DownloadCancelledError extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "DownloadCancelledError";
  }
}

/**
 * Orchestrates the pipeline:
 *
 *   network (SegmentFetcher, N parallel, ordered window)
 *     → processing (Mp4Remuxer, one segment at a time)
 *     → writing (OutputSink, streamed as the muxer produces bytes)
 *
 * Only the prefetch window plus one write chunk is held in memory at a time.
 */
export class HlsDownloader {
  private onEvent: OnEventFn;
  private concurrency: number;
  private maxRetries: number;
  private abortController = new AbortController();

  constructor({
    onEvent,
    concurrency = CHUNK_DOWNLOAD_CONCURRENCY,
    maxRetries = SEGMENT_RETRY_ATTEMPTS,
  }: {
    onEvent: OnEventFn;
    concurrency?: number;
    maxRetries?: number;
  }) {
    this.onEvent = onEvent;
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
  }

  cancel() {
    this.abortController.abort(new DownloadCancelledError());
  }

  async download({
    url,
    headers,
    sink,
  }: {
    url: string;
    headers?: Record<string, string>;
    sink: OutputSink;
  }): Promise<SinkResult> {
    const signal = this.abortController.signal;
    let remuxer: Mp4Remuxer | null = null;

    try {
      this.onEvent(EVENTS.PREPARING);
      const segments = await this.loadSegments(url, headers);
      this.onEvent(EVENTS.SOURCE_PARSED, { total: segments.length });

      const fetcher = new SegmentFetcher({
        headers,
        maxRetries: this.maxRetries,
        signal,
      });
      const prefetcher = new OrderedPrefetcher(
        segments.length,
        (index) => fetcher.fetch(segments[index].uri),
        this.concurrency
      );
      remuxer = new Mp4Remuxer(sink.writable);

      let completed = 0;
      let bytes = 0;

      for await (const data of prefetcher) {
        signal.throwIfAborted();
        await remuxer.append(data, {
          discontinuity: !!segments[completed].discontinuity,
        });
        bytes += data.byteLength;
        completed++;
        this.onEvent(EVENTS.DOWNLOADING_SEGMENTS, {
          completed,
          total: segments.length,
          bytes,
        });
      }

      signal.throwIfAborted();
      this.onEvent(EVENTS.FINALIZING);
      await remuxer.finalize();

      const result = await sink.result();
      this.onEvent(EVENTS.READY_FOR_DOWNLOAD, result);
      return result;
    } catch (error) {
      // Stop in-flight fetches, then discard the partial output
      if (!signal.aborted) this.abortController.abort();
      await sink.abort();
      await remuxer?.cancel().catch(() => {});

      if (signal.reason instanceof DownloadCancelledError) {
        throw signal.reason;
      }
      throw error;
    }
  }

  private async loadSegments(url: string, headers?: Record<string, string>) {
    const parsed = await parseHls({ hlsUrl: url, headers });
    if (!parsed || parsed.type !== SEGMENT) {
      throw new Error(`Invalid segment url, Please refresh the page`);
    }

    const segments = parsed.data as Segment[];
    if (segments.some((s) => s.key && s.key.method !== "NONE")) {
      throw new Error("Encrypted streams are not supported");
    }
    if (segments.some((s) => s.map)) {
      throw new Error("Fragmented MP4 (fMP4) streams are not supported yet");
    }
    return segments;
  }
}
