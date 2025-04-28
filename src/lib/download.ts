import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import {
  CHUNK_DOWNLOAD_CONCURRENCY,
  EVENTS,
  SEGMENT,
  SEGMENT_RETRY_ATTEMPTS,
} from "@/constant";
import parseHls, { Segment } from "./parseHls";
import promiseWithLimit from "./promiseWithLimit";

const FFMPEG_BASE = "https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm";

type OnEventFn = (event: string, data?: any) => void;
type DownloadFileProps = {
  url: string;
  headers?: Record<string, string>;
  fileIndex: number;
};

class Downloader {
  private onEvent: OnEventFn;
  private ffmpeg: FFmpeg | null = null;

  constructor({ onEvent }: { onEvent: OnEventFn }) {
    this.onEvent = onEvent;
  }

  private async setAndGetFFmpegInstance() {
    if (!this.ffmpeg) {
      this.onEvent(EVENTS.FFMPEG_LOADING);

      this.ffmpeg = new FFmpeg();

      await this.ffmpeg.load({
        coreURL: await toBlobURL(
          `${FFMPEG_BASE}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${FFMPEG_BASE}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
        workerURL: await toBlobURL(
          `${FFMPEG_BASE}/ffmpeg-core.worker.js`,
          "text/javascript"
        ),
      });
    }

    this.onEvent(EVENTS.FFMPEG_LOADED);
    return this.ffmpeg;
  }

  private async terminateFFmpeg() {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
    }
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async downloadAndWriteFile({
    url,
    headers,
    fileIndex,
  }: DownloadFileProps) {
    if (!this.ffmpeg) {
      throw new Error("FFmpeg instance is not initialized");
    }

    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }

    const buffer = await response.arrayBuffer();
    const unit8Array = new Uint8Array(buffer);

    const filePath = `${fileIndex}.ts`;

    await this.ffmpeg.writeFile(filePath, unit8Array);

    return filePath;
  }

  private async downloadAndWriteFileWithRetry({
    maxRetry,
    ...props
  }: DownloadFileProps & {
    maxRetry: number;
  }) {
    let retry = 0;

    while (retry < maxRetry) {
      try {
        return await this.downloadAndWriteFile(props);
      } catch (error) {
        retry++;
        if (retry >= maxRetry) {
          throw new Error(
            `Failed to download ${props.url} after ${maxRetry} attempts`
          );
        }
      }
    }
  }

  public async startDownload({
    url,
    headers,
    maxRetry = SEGMENT_RETRY_ATTEMPTS,
    downloadConcurrency = CHUNK_DOWNLOAD_CONCURRENCY,
  }: {
    url: string;
    headers?: Record<string, string>;
    maxRetry?: number;
    downloadConcurrency?: number;
  }) {
    this.onEvent(EVENTS.STARTING_DOWNLOAD);

    const segmentData = await parseHls({ hlsUrl: url, headers: headers });
    if (!segmentData || segmentData.type !== SEGMENT) {
      throw new Error(`Invalid segment url, Please refresh the page`);
    }
    const segments = segmentData.data as Segment[];
    const segmentWithIndex = segments.map((s, i) => ({
      ...s,
      index: i,
    }));

    this.onEvent(EVENTS.SOURCE_PARSED);
    await this.fakeDelay(1500);

    const ffmpeg = await this.setAndGetFFmpegInstance();

    let completed = 0;

    const downloadedSegments = await promiseWithLimit(
      segmentWithIndex.map((segment) => async () => {
        const filePath = await this.downloadAndWriteFileWithRetry({
          url: segment.uri,
          headers,
          fileIndex: segment.index,
          maxRetry,
        });

        this.onEvent(EVENTS.DOWNLOADING_SEGMENTS, {
          total: segments.length,
          completed: completed++,
        });

        return {
          segment,
          filePath: filePath!,
        };
      }),
      downloadConcurrency
    );

    this.onEvent(EVENTS.STICHING_SEGMENTS);

    await ffmpeg.exec([
      "-i",
      `concat:${downloadedSegments.map((s) => s.filePath).join("|")}`,
      "-c:v",
      "copy",
      "output.mp4",
    ]);

    this.onEvent(EVENTS.CLEANING_UP);

    const data = await ffmpeg.readFile("output.mp4");

    // terminate
    await this.terminateFFmpeg();

    this.onEvent(EVENTS.READY_FOR_DOWNLOAD);

    const blobURL = URL.createObjectURL(
      new Blob([data], { type: "video/mp4" })
    );

    return {
      blobURL,
      totalSegments: segments.length,
    };
  }
}

export default Downloader;
