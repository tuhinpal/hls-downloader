import { useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { EVENTS } from "../constant";
import Layout from "./layout";
import {
  DownloadCancelledError,
  HlsDownloader,
  OutputSink,
} from "../lib/downloader";
import { Switch, Tooltip } from "@mui/material";
import { ProgressBar } from "./ui/progress";

// Define state constants locally
const START_DOWNLOAD = "START_DOWNLOAD";
const STARTING_DOWNLOAD = "STARTING_DOWNLOAD";
const JOB_FINISHED = "JOB_FINISHED";
const DOWNLOAD_ERROR = "DOWNLOAD_ERROR";

const STATE_NAMES = {
  JOB_FINISHED: "Finished Downloading",
  START_DOWNLOAD: "Ready to Download",
  STARTING_DOWNLOAD: "Download in Progress",
  DOWNLOAD_ERROR: "Failed to Download",
};

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function DownloadPage({ url, headers = {} }) {
  const [downloadState, setDownloadState] = useState(START_DOWNLOAD);
  const [sendHeaderWhileFetchingTS, setSendHeaderWhileFetchingTS] =
    useState(false);
  const [additionalMessage, setAdditionalMessage] = useState();
  const [downloadResult, setDownloadResult] = useState();
  const [downloadStatus, setDownloadStatus] = useState({
    completed: 0,
    total: 0,
  });
  const downloaderRef = useRef();

  async function startDownload() {
    const fileName = `hls-downloader-${new Date()
      .toLocaleDateString()
      .replace(/[/]/g, "-")}.mp4`;

    // Must run first: the save dialog needs the click's user activation
    let sink;
    try {
      sink = await OutputSink.create(fileName);
    } catch (error) {
      if (error.name !== "AbortError") {
        toast.error(error.message || "Could not open the output file");
      }
      return;
    }

    setDownloadState(STARTING_DOWNLOAD);
    setAdditionalMessage(`[INFO] Job started`);

    const downloader = new HlsDownloader({
      onEvent: (event, data) => {
        switch (event) {
          case EVENTS.PREPARING:
            setAdditionalMessage(`[INFO] Fetching playlist`);
            break;
          case EVENTS.SOURCE_PARSED:
            setAdditionalMessage(`[INFO] Found ${data.total} segments`);
            setDownloadStatus({ completed: 0, total: data.total });
            break;
          case EVENTS.DOWNLOADING_SEGMENTS:
            setAdditionalMessage(
              `[INFO] Processed ${data.completed}/${data.total} segments · ${formatBytes(data.bytes)}`
            );
            setDownloadStatus({
              completed: data.completed,
              total: data.total,
            });
            break;
          case EVENTS.FINALIZING:
            setAdditionalMessage(`[INFO] Finalizing file`);
            break;
          case EVENTS.READY_FOR_DOWNLOAD:
            setAdditionalMessage(`[INFO] Download ready!`);
            break;
        }
      },
    });
    downloaderRef.current = downloader;

    try {
      const result = await downloader.download({
        url,
        headers: sendHeaderWhileFetchingTS ? headers : {},
        sink,
      });

      setDownloadResult(result);
      setDownloadState(JOB_FINISHED);
      setAdditionalMessage();
    } catch (error) {
      if (error instanceof DownloadCancelledError) {
        setDownloadState(START_DOWNLOAD);
        setAdditionalMessage(`[INFO] Download cancelled`);
        return;
      }
      console.error("Download error:", error);
      setAdditionalMessage();
      setDownloadState(DOWNLOAD_ERROR);
      toast.error(error.message || "An error occurred during download");
    } finally {
      downloaderRef.current = undefined;
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

      {downloadResult?.kind === "saved" && (
        <p className="text-gray-900 mt-5">
          Saved to <b>{downloadResult.fileName}</b>
        </p>
      )}

      {downloadResult && (
        <div className="flex gap-2 items-center">
          {downloadResult.kind === "blob" && (
            <a
              href={downloadResult.url}
              download={downloadResult.fileName}
              className="px-4 py-1.5 bg-gray-900 hover:bg-gray-700 text-white rounded-md mt-5"
            >
              Download now
            </a>
          )}

          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 border rounded-md mt-5"
          >
            Create new
          </button>
        </div>
      )}

      {downloadState === STARTING_DOWNLOAD && (
        <>
          <ProgressBar
            value={(downloadStatus.completed / downloadStatus.total) * 100 || 0}
          />
          <button
            onClick={() => downloaderRef.current?.cancel()}
            className="px-4 py-1.5 border rounded-md mt-5"
          >
            Cancel
          </button>
        </>
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
