import { useMemo, useState } from "react";
import DownloadPage from "./components/downloadPage";
import HomePage from "./components/home";

export default function MainPage() {
  const [url, seturl] = useState();
  const [headers, setheaders] = useState({});

  const segmentUrl = useMemo(() => url, [url]);

  return (
    <>
      {!url ? (
        <HomePage seturl={seturl} setheaders={setheaders} />
      ) : (
        <DownloadPage url={segmentUrl} headers={headers} />
      )}
    </>
  );
}
