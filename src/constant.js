export const PLAYLIST = "PLAYLIST";
export const SEGMENT = "SEGMENT";
export const ERROR = "ERROR";

export const EVENTS = {
  PREPARING: "preparing",
  SOURCE_PARSED: "source_parsed",
  DOWNLOADING_SEGMENTS: "downloading_segments",
  FINALIZING: "finalizing",
  READY_FOR_DOWNLOAD: "ready_for_download",
};

export const CHUNK_DOWNLOAD_CONCURRENCY = 10;
export const SEGMENT_RETRY_ATTEMPTS = 10;
