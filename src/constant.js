export const PLAYLIST = "PLAYLIST";
export const SEGMENT = "SEGMENT";
export const ERROR = "ERROR";

export const EVENTS = {
  FFMPEG_LOADING: "ffmpeg_loading",
  FFMPEG_LOADED: "ffmpeg_loaded",
  STARTING_DOWNLOAD: "starting_download",
  SOURCE_PARSED: "source_parsed",
  DOWNLOADING_SEGMENTS: "downloading_segments",
  STICHING_SEGMENTS: "stiching_segments",
  CLEANING_UP: "cleaning_up",
  READY_FOR_DOWNLOAD: "ready_for_download",
  ERROR: "error",
};

export const CHUNK_DOWNLOAD_CONCURRENCY = 10;
export const SEGMENT_RETRY_ATTEMPTS = 10;
