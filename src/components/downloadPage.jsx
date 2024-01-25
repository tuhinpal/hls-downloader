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
import { Switch, Tooltip } from "@mui/material";
import * as ProgressPrimitive from "@radix-ui/react-progress";

export default function DownloadPage({ url, headers = {} }) {
  const [downloadState, setdownloadState] = useState(START_DOWNLOAD);
  const [sendHeaderWhileFetchingTS, setsendHeaderWhileFetchingTS] =
    useState(false);
  const [additionalMessage, setadditionalMessage] = useState();
  const [downloadBlobUrl, setdownloadBlobUrl] = useState();
  const [downloadStatus, setdownloadStatus] = useState({
    segmentDownloaded: 0,
    totalSegments: 0,
  });

  const ProgressBar = ({ value }) => (
    <>
      <ProgressPrimitive.Root
        className={
          "relative h-4 mt-2 w-[300px] overflow-hidden rounded-full bg-gray-200"
        }
      >
        <ProgressPrimitive.Indicator
          className="h-full w-full flex-1 bg-gray-900 transition-all"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Root>
      <p className="text-gray-900 mt-2">{Math.round(value || 0, 2)}%</p>
    </>
  );

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function startDownload() {
    setdownloadState(STARTING_DOWNLOAD);
    setadditionalMessage(`[INFO] Job started`);

    try {
      setadditionalMessage(`[INFO] Fetching segments`);

      let getSegments = await parseHls({ hlsUrl: url, headers: headers });
      if (getSegments.type !== SEGMENT)
        throw new Error(`Invalid segment url, Please refresh the page`);

      let segments = getSegments.data.map((s, i) => ({ ...s, index: i }));
      setdownloadStatus({
        totalSegments: segments.length,
        segmentDownloaded: 0,
      });

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
              let getFile = await fetch(segment.uri, {
                headers: {
                  ...(sendHeaderWhileFetchingTS ? headers : {}),
                },
              });

              if (!getFile.ok) throw new Error("File failed to fetch");

              setdownloadStatus((prev) => ({
                ...prev,
                segmentDownloaded: prev.segmentDownloaded + 1,
              }));

              ffmpeg.FS(
                "writeFile",
                fileId,
                await fetchFile(await getFile.arrayBuffer())
              );
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
      await sleep(100); // wait for state to update

      await ffmpeg.run(
        "-i",
        `concat:${successSegments.join("|")}`,
        "-c:v",
        "copy",
        "output.mp4"
      );

      setadditionalMessage(`[INFO] Stiching segments finished`);
      await sleep(100); // wait for state to update

      for (const segment of successSegments) {
        try {
          ffmpeg.FS("unlink", segment);
        } catch (_) {}
      }

      let blobUrl;

      try {
        const data = ffmpeg.FS("readFile", "output.mp4");
        blobUrl = URL.createObjectURL(
          new Blob([data.buffer], { type: "video/mp4" })
        );
        ffmpeg.FS("unlink", "output.mp4");
      } catch (_) {
        console.log("Error while creating blob url", _);
        throw new Error(`Something went wrong while stiching!`);
      }

      setadditionalMessage();
      setdownloadState(JOB_FINISHED);
      setdownloadBlobUrl(blobUrl);
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
        <div className="flex gap-5 items-center mt-5">
          {Object.keys(headers).length > 0 && (
            <Tooltip title="Send custom header while fetching TS segments (If you are facing error, try toggling)">
              <button
                className="flex items-center"
                onClick={() =>
                  setsendHeaderWhileFetchingTS(!sendHeaderWhileFetchingTS)
                }
              >
                <Switch checked={sendHeaderWhileFetchingTS} />
                Send header
              </button>
            </Tooltip>
          )}

          <button
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md"
            onClick={startDownload}
          >
            Start Download
          </button>
        </div>
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
              .replace(/[/]/g, "-")}.mp4`} // .mp4 is widely supported, and player knows the mimetype so it doesn't matter
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

      {downloadState === SEGMENT_STARTING_DOWNLOAD &&
        downloadState != SEGMENT_STICHING && (
          <ProgressBar
            value={
              (downloadStatus.segmentDownloaded /
                downloadStatus.totalSegments) *
              100
            }
          />
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
