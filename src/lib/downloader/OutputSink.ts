import type { StreamTargetChunk } from "mediabunny";

export type SinkResult =
  | { kind: "saved"; fileName: string }
  | { kind: "blob"; fileName: string; url: string };

const OPFS_PREFIX = "hls-downloader-";

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description?: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandle>;
  }
}

/**
 * Writing stage: where the remuxed MP4 bytes end up.
 *
 * `writable` accepts positional writes from the muxer. Aborting a sink
 * discards what was written instead of committing a half-finished file.
 */
export abstract class OutputSink {
  readonly writable: WritableStream<StreamTargetChunk>;
  private aborted = false;

  constructor(readonly fileName: string) {
    this.writable = new WritableStream<StreamTargetChunk>({
      write: (chunk) => this.write(chunk),
      // The muxer also closes the stream when it is cancelled; that must not
      // commit the partial file.
      close: () => (this.aborted ? undefined : this.close()),
    });
  }

  /**
   * Picks the best available sink, preferring ones that keep the output out of
   * RAM. Must be called directly from a user gesture: the save dialog needs one.
   */
  static async create(fileName: string): Promise<OutputSink> {
    if (FileSystemSink.isSupported()) return FileSystemSink.open(fileName);

    if (OpfsSink.isSupported()) {
      try {
        return await OpfsSink.open(fileName);
      } catch (error) {
        // e.g. Firefox private browsing exposes the API but rejects access
        console.warn("OPFS unavailable, falling back to memory", error);
      }
    }

    return new MemorySink(fileName);
  }

  async abort() {
    if (this.aborted) return;
    this.aborted = true;
    await this.discard();
  }

  abstract result(): Promise<SinkResult>;
  protected abstract write(chunk: StreamTargetChunk): Promise<void> | void;
  protected abstract close(): Promise<void> | void;
  protected abstract discard(): Promise<void> | void;
}

/** Streams straight to a file the user picks (Chromium desktop). */
export class FileSystemSink extends OutputSink {
  private constructor(
    fileName: string,
    private stream: FileSystemWritableFileStream
  ) {
    super(fileName);
  }

  static isSupported() {
    return typeof window.showSaveFilePicker === "function";
  }

  static async open(fileName: string) {
    const handle = await window.showSaveFilePicker!({
      suggestedName: fileName,
      types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
    });
    return new FileSystemSink(handle.name, await handle.createWritable());
  }

  protected write(chunk: StreamTargetChunk) {
    return this.stream.write(chunk);
  }

  protected close() {
    return this.stream.close();
  }

  protected discard() {
    return this.stream.abort().catch(() => {});
  }

  async result(): Promise<SinkResult> {
    return { kind: "saved", fileName: this.fileName };
  }
}

/**
 * Streams into the browser's private file system (disk-backed), then hands
 * the file out as a blob URL. Used where no save dialog is available.
 */
export class OpfsSink extends OutputSink {
  private constructor(
    fileName: string,
    private directory: FileSystemDirectoryHandle,
    private handle: FileSystemFileHandle,
    private stream: FileSystemWritableFileStream
  ) {
    super(fileName);
  }

  static isSupported() {
    return (
      typeof navigator.storage?.getDirectory === "function" &&
      typeof FileSystemFileHandle !== "undefined" &&
      "createWritable" in FileSystemFileHandle.prototype
    );
  }

  static async open(fileName: string) {
    const directory = await navigator.storage.getDirectory();
    await OpfsSink.removeStaleFiles(directory);

    const handle = await directory.getFileHandle(
      `${OPFS_PREFIX}${Date.now()}.mp4`,
      { create: true }
    );
    return new OpfsSink(
      fileName,
      directory,
      handle,
      await handle.createWritable()
    );
  }

  /** Files from previous downloads are only needed until the page is left. */
  private static async removeStaleFiles(directory: FileSystemDirectoryHandle) {
    // Async iteration of directory handles is missing from older TS DOM libs
    const entries = directory as unknown as { keys(): AsyncIterable<string> };
    for await (const name of entries.keys()) {
      if (!name.startsWith(OPFS_PREFIX)) continue;
      // Fails if another tab is still writing it, which is fine
      await directory.removeEntry(name).catch(() => {});
    }
  }

  protected write(chunk: StreamTargetChunk) {
    return this.stream.write(chunk);
  }

  protected close() {
    return this.stream.close();
  }

  protected async discard() {
    await this.stream.abort().catch(() => {});
    await this.directory.removeEntry(this.handle.name).catch(() => {});
  }

  async result(): Promise<SinkResult> {
    const file = await this.handle.getFile();
    return {
      kind: "blob",
      fileName: this.fileName,
      url: URL.createObjectURL(file),
    };
  }
}

/** Last resort: keeps the output in RAM (still a single copy). */
export class MemorySink extends OutputSink {
  private parts: { position: number; data: Uint8Array }[] = [];
  private size = 0;

  protected write({ position, data }: StreamTargetChunk) {
    const end = position + data.length;

    // The muxer occasionally goes back to patch headers it already wrote
    for (const part of this.parts) {
      const from = Math.max(position, part.position);
      const to = Math.min(end, part.position + part.data.length);
      if (from < to) {
        part.data.set(
          data.subarray(from - position, to - position),
          from - part.position
        );
      }
    }

    if (end > this.size) {
      const appendFrom = Math.max(this.size, position);
      if (appendFrom > this.size) {
        this.parts.push({
          position: this.size,
          data: new Uint8Array(appendFrom - this.size),
        });
      }
      this.parts.push({
        position: appendFrom,
        data: data.slice(appendFrom - position),
      });
      this.size = end;
    }
  }

  protected close() {}

  protected discard() {
    this.parts = [];
    this.size = 0;
  }

  async result(): Promise<SinkResult> {
    const blob = new Blob(
      this.parts.map((part) => part.data as Uint8Array<ArrayBuffer>),
      { type: "video/mp4" }
    );
    this.parts = [];
    return { kind: "blob", fileName: this.fileName, url: URL.createObjectURL(blob) };
  }
}
