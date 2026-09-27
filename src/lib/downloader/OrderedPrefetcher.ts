/**
 * Loads items concurrently but yields them strictly in order.
 *
 * At most `windowSize` items are in flight or waiting to be consumed at any
 * time, so memory stays bounded no matter how long the playlist is: a new
 * fetch only starts once the consumer has taken an item off the front.
 */
export class OrderedPrefetcher<T> implements AsyncIterable<T> {
  private pending = new Map<number, Promise<T>>();
  private nextToStart = 0;

  constructor(
    private readonly count: number,
    private readonly load: (index: number) => Promise<T>,
    private readonly windowSize: number
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (let index = 0; index < this.count; index++) {
      this.fill(index);
      const item = this.pending.get(index)!;
      this.pending.delete(index);
      yield await item;
    }
  }

  private fill(consumed: number) {
    while (
      this.nextToStart < this.count &&
      this.nextToStart < consumed + this.windowSize
    ) {
      const index = this.nextToStart++;
      const promise = this.load(index);
      // Rejections are surfaced when the item is consumed; avoid them being
      // reported as unhandled while the item is still waiting in the window.
      promise.catch(() => {});
      this.pending.set(index, promise);
    }
  }
}
