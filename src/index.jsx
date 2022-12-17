import { useMemo, useState } from "react";
import DownloadPage from "./components/downloadPage";
import HomePage from "./components/home";

export default function MainPage() {
  const [url, seturl] = useState();

  const segmentUrl = useMemo(() => url, [url]);

  return (
    <>
      {!url ? <HomePage seturl={seturl} /> : <DownloadPage url={segmentUrl} />}
    </>
  );
}
