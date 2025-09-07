// api/scrape.js (for Vercel)
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.lottopcso.com";

function mapGameToFallbackUrl(game) {
  switch (game) {
    case "Ultra Lotto 6/58": return "6-58";
    case "Grand Lotto 6/55": return "6-55";
    case "Super Lotto 6/49": return "6-49";
    case "Mega Lotto 6/45": return "6-45";
    case "Lotto 6/42": return "6-42";
    default: throw new Error("Unknown game: " + game);
  }
}

export default async function handler(req, res) {
  try {
    const { game, date } = req.query; // date = yyyy-mm-dd
    const localDate = new Date(date);
    const month = localDate.toLocaleString("en-US", { month: "long" }).toLowerCase();
    const day = localDate.getDate();
    const year = localDate.getFullYear();

    const formattedGame = game.replace(/\s+/g, "-").replace("/", "-").toLowerCase();
    let url = `${BASE_URL}/${formattedGame}-results-for-${month}-${day}-${year}/`;

    let numbers = [];
    let jackpot = "N/A";
    let winners = "0";

    async function scrapePage(scrapeUrl) {
      const response = await axios.get(scrapeUrl);
      const $ = cheerio.load(response.data);

      const rows = $("div.post_content table tbody tr");
      rows.each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 2) {
          const label = $(cells[0]).text().toLowerCase();
          if (label.includes("winning combination")) {
            numbers = $(cells[1]).text().split("-").map(n => n.trim()).filter(Boolean);
          } else if (label.includes("p:contains(latest jackpot prize) ~ figure.wp-block-table table")) {
            jackpot = $(cells[1]).text().trim();
          } else if (label.includes("number of winner")) {
            winners = $(cells[1]).text().trim();
          }
        }
      });
    }

    try {
      await scrapePage(url);
    } catch (err) {
      console.warn("Primary scrape failed, trying fallback:", err.message);
      const fallback = mapGameToFallbackUrl(game);
      url = `${BASE_URL}/${fallback}-lotto-result-${month}-${day}-${year}/`;
      await scrapePage(url);
    }

    return res.status(200).json({
      game,
      date,
      numbers,
      jackpot,
      winners,
      source: url,
    });
  } catch (err) {
    console.error("Scraper error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
