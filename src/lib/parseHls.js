import { Parser } from "m3u8-parser";
import { ERROR, PLAYLIST, SEGMENT } from "../constant";

async function parseHls({ hlsUrl, headers = {} }) {
  try {
    let url = new URL(hlsUrl);

    let response = await fetch(url.href, {
      headers: {
        ...headers,
      },
    });
    if (!response.ok) throw new Error(response.text());
    let manifest = await response.text();

    var parser = new Parser();
    parser.push(manifest);
    parser.end();

    let path = hlsUrl;

    try {
      let pathBase = url.pathname.split("/");
      pathBase.pop();
      pathBase.push("{{URL}}");
      path = pathBase.join("/");
    } catch (perror) {
      console.info(`[Info] Path parse error`, perror);
    }

    let base = url.origin + path;

    if (parser.manifest.playlists?.length) {
      let groups = parser.manifest.playlists;

      groups = groups
        .map((g) => {
          return {
            name: g.attributes.NAME
              ? g.attributes.NAME
              : g.attributes.RESOLUTION
              ? `${g.attributes.RESOLUTION.width}x${g.attributes.RESOLUTION.height}`
              : `MAYBE_AUDIO:${g.attributes.BANDWIDTH}`,
            bandwidth: g.attributes.BANDWIDTH,
            uri: g.uri.startsWith("http")
              ? g.uri
              : base.replace("{{URL}}", g.uri),
          };
        })
        .filter((g) => g);

      return {
        type: PLAYLIST,
        data: groups,
      };
    } else if (parser.manifest.segments?.length) {
      let segments = parser.manifest.segments;
      segments = segments.map((s) => ({
        ...s,
        uri: s.uri.startsWith("http") ? s.uri : base.replace("{{URL}}", s.uri),
      }));

      return {
        type: SEGMENT,
        data: segments,
      };
    }
  } catch (error) {
    return {
      type: ERROR,
      data: error.message,
    };
  }
}

export default parseHls;
