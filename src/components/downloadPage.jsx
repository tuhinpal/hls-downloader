import { useState } from "react";
import { toast } from "react-hot-toast";
import { EVENTS } from "../constant";
import Layout from "./layout";
import Downloader from "../lib/download";
import { Switch, Tooltip } from "@mui/material";
import { ProgressBar } from "./ui/progress";

// Define state constants locally
const START_DOWNLOAD = "START_DOWNLOAD";
const STARTING_DOWNLOAD = "STARTING_DOWNLOAD";
const JOB_FINISHED = "JOB_FINISHED";
const DOWNLOAD_ERROR = "DOWNLOAD_ERROR";

const STATE_NAMES = {
  JOB_FINISHED: "Download Complete",
  START_DOWNLOAD: "Ready to Download",
  STARTING_DOWNLOAD: "Downloading in Progress",
  DOWNLOAD_ERROR: "Download Failed",
};

export default function DownloadPage({ url, headers = {} }) {
  const [downloadState, setDownloadState] = useState(START_DOWNLOAD);
  const [sendHeaderWhileFetchingTS, setSendHeaderWhileFetchingTS] =
    useState(false);
  const [additionalMessage, setAdditionalMessage] = useState();
  const [downloadBlobUrl, setDownloadBlobUrl] = useState();
  const [downloadStatus, setDownloadStatus] = useState({
    segmentDownloaded: 0,
    totalSegments: 0,
  });

  async function startDownload() {
    setDownloadState(STARTING_DOWNLOAD);
    setAdditionalMessage(`[INFO] Job started`);

    try {
      const downloader = new Downloader({
        onEvent: (event, data) => {
          console.log(`Event: ${event}`, data);

          switch (event) {
            case EVENTS.FFMPEG_LOADING:
              setAdditionalMessage(`[INFO] Initializing ffmpeg`);
              break;
            case EVENTS.FFMPEG_LOADED:
              setAdditionalMessage(`[SUCCESS] ffmpeg loaded`);
              break;
            case EVENTS.STARTING_DOWNLOAD:
              setAdditionalMessage(`[INFO] Fetching segments`);
              break;
            case EVENTS.SOURCE_PARSED:
              setAdditionalMessage(`[INFO] Segments information fetched`);
              break;
            case EVENTS.DOWNLOADING_SEGMENTS:
              setDownloadStatus({
                segmentDownloaded: data.completed,
                totalSegments: data.total,
              });
              break;
            case EVENTS.STICHING_SEGMENTS:
              setAdditionalMessage(`[INFO] Stiching segments started`);
              break;
            case EVENTS.CLEANING_UP:
              setAdditionalMessage(`[INFO] Cleaning up temporary files`);
              break;
            case EVENTS.READY_FOR_DOWNLOAD:
              setAdditionalMessage(`[INFO] Download ready!`);
              break;
          }
        },
      });

      const result = await downloader.startDownload({
        url,
        headers: sendHeaderWhileFetchingTS ? headers : {},
      });

      setDownloadBlobUrl(result.blobURL);
      setDownloadState(JOB_FINISHED);
      setAdditionalMessage();
    } catch (error) {
      console.error("Download error:", error);
      setAdditionalMessage();
      setDownloadState(DOWNLOAD_ERROR);
      toast.error(error.message || "An error occurred during download");
    }
  }

  return (
    <Layout>
      <h2 className="text-2xl lg:text-3xl font-bold mb-4">
        {STATE_NAMES[downloadState]}
      </h2>
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
                  setSendHeaderWhileFetchingTS(!sendHeaderWhileFetchingTS)
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
              .replace(/[/]/g, "-")}.mp4`}
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

      {downloadState === STARTING_DOWNLOAD && (
        <ProgressBar
          value={
            (downloadStatus.segmentDownloaded / downloadStatus.totalSegments) *
              100 || 0
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
