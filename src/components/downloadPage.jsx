import { useState } from "react";
import { toast } from "react-hot-toast";
import {
  DOWNLOAD_ERROR,
  JOB_FINISHED,
  SEGMENT,
  SEGMENT_CHUNK_SIZE,
  SEGMENT_STARTING_DOWNLOAD,
  SEGMENT_STICHING,
  STARTING_DOWNLOAD,
  START_DOWNLOAD,
} from "../constant";
import Layout from "./layout";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import parseHls from "../lib/parseHls";

export default function DownloadPage({ url }) {
  const [downloadState, setdownloadState] = useState(START_DOWNLOAD);
  const [additionalMessage, setadditionalMessage] = useState();
  const [downloadBlobUrl, setdownloadBlobUrl] = useState();

  async function startDownload() {
    setdownloadState(STARTING_DOWNLOAD);
    setadditionalMessage(`[INFO] Job started`);

    try {
      setadditionalMessage(`[INFO] Fetching segments`);

      let getSegments = await parseHls({ hlsUrl: url });
      if (getSegments.type !== SEGMENT)
        throw new Error(`Invalid segment url, Please refresh the page`);

      let segments = getSegments.data.map((s, i) => ({ ...s, index: i })); // comment out .slice

      setadditionalMessage(`[INFO] Initializing ffmpeg`);
      const ffmpeg = createFFmpeg({
        mainName: "main",
        corePath:
          "https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js",
        log: false,
      });

      await ffmpeg.load();
      setadditionalMessage(`[SUCCESS] ffmpeg loaded`);

      setdownloadState(SEGMENT_STARTING_DOWNLOAD);

      let segmentChunks = [];
      for (let i = 0; i < segments.length; i += SEGMENT_CHUNK_SIZE) {
        segmentChunks.push(segments.slice(i, i + SEGMENT_CHUNK_SIZE));
      }

      let successSegments = [];

      for (let i = 0; i < segmentChunks.length; i++) {
        setadditionalMessage(
          `[INFO] Downloading segment chunks ${i}/${segmentChunks.length} - Chunksize: ${SEGMENT_CHUNK_SIZE}`
        );

        let segmentChunk = segmentChunks[i];

        await Promise.all(
          segmentChunk.map(async (segment) => {
            try {
              let fileId = `${segment.index}.ts`;
              ffmpeg.FS("writeFile", fileId, await fetchFile(segment.uri));
              successSegments.push(fileId);
              console.log(`[SUCCESS] Segment downloaded ${segment.index}`);
            } catch (error) {
              console.log(`[ERROR] Segment download error ${segment.index}`);
            }
          })
        );
      }

      successSegments = successSegments.sort((a, b) => {
        let aIndex = parseInt(a.split(".")[0]);
        let bIndex = parseInt(b.split(".")[0]);
        return aIndex - bIndex;
      });

      console.log("successSegments", successSegments);

      setadditionalMessage(`[INFO] Stiching segments started`);
      setdownloadState(SEGMENT_STICHING);

      await ffmpeg.run(
        "-i",
        `concat:${successSegments.join("|")}`,
        "-c",
        "copy",
        "output.ts"
      );

      setadditionalMessage(`[INFO] Stiching segments finished`);

      const data = ffmpeg.FS("readFile", "output.ts");
      setadditionalMessage();
      setdownloadState(JOB_FINISHED);
      setdownloadBlobUrl(
        URL.createObjectURL(new Blob([data.buffer], { type: "video/mp2t" }))
      );

      setTimeout(() => {
        ffmpeg.exit(); // ffmpeg.exit() is callable only after load() stage.
      }, 1000);
    } catch (error) {
      setadditionalMessage();
      setdownloadState(DOWNLOAD_ERROR);
      toast.error(error.message);
    }
  }

  return (
    <Layout>
      <h2 className="text-2xl lg:text-3xl font-bold mb-4">{downloadState}</h2>
      <code className="border boder-gray-200 bg-gray-100 px-2 rounded-sm break-all text-center py-2 w-full max-w-3xl">
        {url}
      </code>

      {downloadState === START_DOWNLOAD && (
        <button
          className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
          onClick={startDownload}
        >
          Start Download
        </button>
      )}

      {additionalMessage && (
        <p className="text-gray-900 mt-5">{additionalMessage}</p>
      )}

      {downloadBlobUrl && (
        <div className="flex gap-2 items-center">
          <a
            href={downloadBlobUrl}
            download={`hls-downloader-${new Date()
              .toLocaleDateString()
              .replace(/[/]/g, "-")}.ts`}
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
          >
            Download now
          </a>

          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
          >
            Create new
          </button>
        </div>
      )}

      {downloadState === DOWNLOAD_ERROR && (
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
        >
          Try with different url
        </button>
      )}
    </Layout>
  );
}
