const clarityURL = "https://www.clarity.ms/tag/f08li9do6x";

export default async function (req, res) {
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
  res.setHeader("Content-Type", "text/javascript");

  res.send(await fetch(clarityURL).then((response) => response.text()));
}
