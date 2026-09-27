const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 5000;

class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} while fetching ${url}`);
  }
}

/**
 * Network stage: fetches a single segment into memory, retrying transient
 * failures with exponential backoff. Honours an AbortSignal so a cancelled
 * download stops hitting the network immediately.
 */
export class SegmentFetcher {
  private headers: Record<string, string>;
  private maxRetries: number;
  private signal: AbortSignal;

  constructor({
    headers = {},
    maxRetries,
    signal,
  }: {
    headers?: Record<string, string>;
    maxRetries: number;
    signal: AbortSignal;
  }) {
    this.headers = headers;
    this.maxRetries = maxRetries;
    this.signal = signal;
  }

  async fetch(url: string): Promise<Uint8Array> {
    let attempt = 0;

    while (true) {
      try {
        return await this.fetchOnce(url);
      } catch (error) {
        attempt++;
        if (this.signal.aborted || !this.isRetryable(error)) throw error;
        if (attempt >= this.maxRetries) {
          throw new Error(
            `Failed to download ${url} after ${this.maxRetries} attempts`
          );
        }
        await this.sleep(Math.min(500 * 2 ** (attempt - 1), MAX_BACKOFF_MS));
      }
    }
  }

  private async fetchOnce(url: string) {
    const response = await fetch(url, {
      headers: this.headers,
      signal: this.signal,
    });
    if (!response.ok) throw new HttpError(response.status, url);
    return new Uint8Array(await response.arrayBuffer());
  }

  private isRetryable(error: unknown) {
    if (error instanceof HttpError) return RETRYABLE_STATUS.has(error.status);
    // Network / CORS failures surface as TypeError and are worth another try
    return true;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      this.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(this.signal.reason);
        },
        { once: true }
      );
    });
  }
}
