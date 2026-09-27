import {
  ADTS,
  BufferSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  InputAudioTrack,
  InputVideoTrack,
  MPEG_TS,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  StreamTargetChunk,
} from "mediabunny";

const SEGMENT_FORMATS = [MPEG_TS, ADTS];
const WRITE_CHUNK_SIZE = 8 * 2 ** 20;
// Timestamp jumps larger than this (in seconds) are treated as discontinuities
const MAX_TIMESTAMP_DRIFT = 1;

type InputTrack = InputVideoTrack | InputAudioTrack;

interface OutputTrack {
  kind: "video" | "audio";
  codec: string;
  source: EncodedVideoPacketSource | EncodedAudioPacketSource;
  pendingDecoderConfig: VideoDecoderConfig | AudioDecoderConfig | null;
}

/**
 * Processing stage: remuxes MPEG-TS segments into a single MP4 without
 * re-encoding, streaming the result into a WritableStream.
 *
 * Each segment gets its own short-lived demuxer. Mediabunny's TS demuxer keeps
 * an index that references packet payloads for its whole lifetime, so feeding
 * the entire stream through a single Input would hold every byte in memory.
 */
export class Mp4Remuxer {
  private output: Output;
  private tracks: { video?: OutputTrack; audio?: OutputTrack } | null = null;
  // Added to input timestamps so the output starts at 0 and stays continuous
  private timestampOffset = 0;
  private nextExpectedTimestamp = 0;
  private hasAlignedFirstSegment = false;

  constructor(writable: WritableStream<StreamTargetChunk>) {
    this.output = new Output({
      // Media data is written as it arrives; only the index (moov) is kept in
      // memory and written at the end.
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, {
        chunked: true,
        chunkSize: WRITE_CHUNK_SIZE,
      }),
    });
  }

  async append(data: Uint8Array, { discontinuity = false } = {}) {
    const input = new Input({
      formats: SEGMENT_FORMATS,
      source: new BufferSource(data),
    });

    try {
      const [video, audio] = await Promise.all([
        input.getPrimaryVideoTrack(),
        input.getPrimaryAudioTrack(),
      ]);

      if (!this.tracks) await this.setupTracks(video, audio);

      const candidates: [InputTrack | null, OutputTrack | undefined][] = [
        [video, this.tracks!.video],
        [audio, this.tracks!.audio],
      ];
      const pairs = candidates.filter(
        (pair): pair is [InputTrack, OutputTrack] => !!pair[0] && !!pair[1]
      );
      if (pairs.length === 0) return;

      for (const [track, target] of pairs) {
        const codec = await track.getCodec();
        if (codec !== target.codec) {
          throw new Error(
            `Stream switches ${target.kind} codec mid-way (${target.codec} → ${codec}), which is not supported`
          );
        }
      }

      const firstTimestamps = await Promise.all(
        pairs.map(([track]) => track.getFirstTimestamp())
      );
      this.alignTimestamps(Math.min(...firstTimestamps), discontinuity);

      await this.writeInterleaved(pairs);
    } finally {
      input.dispose();
    }
  }

  async finalize() {
    if (!this.tracks) throw new Error("No playable segments were found");
    await this.output.finalize();
  }

  async cancel() {
    if (this.output.state === "started" || this.output.state === "pending") {
      await this.output.cancel();
    }
  }

  private async setupTracks(
    video: InputVideoTrack | null,
    audio: InputAudioTrack | null
  ) {
    if (!video && !audio) throw new Error("Segment has no audio or video");

    this.tracks = {};

    const videoCodec = await video?.getCodec();
    if (video && videoCodec) {
      const source = new EncodedVideoPacketSource(videoCodec);
      this.output.addVideoTrack(source);
      this.tracks.video = {
        kind: "video",
        codec: videoCodec,
        source,
        pendingDecoderConfig: await video.getDecoderConfig(),
      };
    }

    const audioCodec = await audio?.getCodec();
    if (audio && audioCodec) {
      const source = new EncodedAudioPacketSource(audioCodec);
      this.output.addAudioTrack(source);
      this.tracks.audio = {
        kind: "audio",
        codec: audioCodec,
        source,
        pendingDecoderConfig: await audio.getDecoderConfig(),
      };
    }

    await this.output.start();
  }

  private alignTimestamps(segmentStart: number, discontinuity: boolean) {
    const drift = segmentStart + this.timestampOffset - this.nextExpectedTimestamp;

    if (
      !this.hasAlignedFirstSegment ||
      discontinuity ||
      Math.abs(drift) > MAX_TIMESTAMP_DRIFT
    ) {
      this.timestampOffset = this.nextExpectedTimestamp - segmentStart;
      this.hasAlignedFirstSegment = true;
    }
  }

  /** Writes packets from all tracks ordered by timestamp, as MP4 expects. */
  private async writeInterleaved(pairs: [InputTrack, OutputTrack][]) {
    const iterators = pairs.map(([track]) =>
      new EncodedPacketSink(track).packets()
    );
    const heads = await Promise.all(iterators.map((it) => it.next()));

    while (true) {
      let pick = -1;
      heads.forEach((head, i) => {
        if (head.done) return;
        if (pick === -1 || head.value.timestamp < heads[pick].value!.timestamp) {
          pick = i;
        }
      });
      if (pick === -1) break;

      await this.writePacket(pairs[pick][1], heads[pick].value as EncodedPacket);
      heads[pick] = await iterators[pick].next();
    }
  }

  private async writePacket(target: OutputTrack, packet: EncodedPacket) {
    const timestamp = packet.timestamp + this.timestampOffset;
    this.nextExpectedTimestamp = Math.max(
      this.nextExpectedTimestamp,
      timestamp + packet.duration
    );

    const meta = target.pendingDecoderConfig
      ? { decoderConfig: target.pendingDecoderConfig }
      : undefined;
    target.pendingDecoderConfig = null;

    const shifted = packet.clone({ timestamp });
    if (target.kind === "video") {
      await (target.source as EncodedVideoPacketSource).add(
        shifted,
        meta as EncodedVideoChunkMetadata
      );
    } else {
      await (target.source as EncodedAudioPacketSource).add(
        shifted,
        meta as EncodedAudioChunkMetadata
      );
    }
  }
}
