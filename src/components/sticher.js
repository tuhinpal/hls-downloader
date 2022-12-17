import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

async function sticher({ segments = [] }) {
  segments = segments.slice(0, 10);

  console.log("Elapsed");
  const ffmpeg = createFFmpeg({
    mainName: "main",
    corePath: "https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js",
    log: true,
  });

  await ffmpeg.load();

  const uuid = "";

  for (let i = 0; i < segments.length; i++) {
    console.log(`[INFO] Downloading segment ${i}`);
    try {
      let segment = segments[i];
      ffmpeg.FS("writeFile", `${uuid}${i}.ts`, await fetchFile(segment.uri));
      console.log(`[SUCCESS] Segment downloaded ${i}`);
    } catch (se) {
      console.log(`[ERROR] Segment download error ${i}`, se);
    }
  }

  await ffmpeg.run(
    "-i",
    `concat:${segments.map((s, i) => `${uuid}${i}.ts`).join("|")}`,
    "-c",
    "copy",
    "output.ts"
  );

  const data = ffmpeg.FS("readFile", "output.ts");
  let url = URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));

  console.log(`[INFO] Downloading...`);
  // let a = document.createElement("a");
  // a.href = url;
  // a.download = "combinned.ts";
  // document.body.appendChild(a);
  // a.click();
  // document.body.removeChild(a);
}

export default sticher;
