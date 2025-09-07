// api/scrape.js
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
    if (!game || !date) {
      return res.status(400).json({ error: "Missing 'game' or 'date' query param" });
    }

    const localDate = new Date(date);
    if (isNaN(localDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'date' (expected yyyy-mm-dd)" });
    }

    const month = localDate.toLocaleString("en-US", { month: "long" }).toLowerCase();
    const day = localDate.getDate();
    const year = localDate.getFullYear();

    const formattedGame = game
      .replace(/\s+/g, "-")
      .replace(/\//g, "-")
      .toLowerCase();

    let url = `${BASE_URL}/${formattedGame}-results-for-${month}-${day}-${year}/`;

    let numbers = [];
    let jackpot = "N/A";
    let winners = "0";

    async function scrapePage(scrapeUrl) {
      const response = await axios.get(scrapeUrl, {
        headers: {
          // Helps avoid occasional bot blocks
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      });
      const $ = cheerio.load(response.data);

      // ✅ Pick the FIRST table that contains "Winning Combination" (the actual results table)
      const resultsTable = $("div.post_content table")
        .filter((_, el) => $(el).text().toLowerCase().includes("winning combination"))
        .first();

      // Fallback: if not found, try the very first table under post_content
      const tableToUse = resultsTable.length ? resultsTable : $("div.post_content table").first();

      if (!tableToUse || !tableToUse.length) {
        return; // leave defaults
      }

      const rows = tableToUse.find("tbody tr");
      rows.each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 2) {
          const label = $(cells[0]).text().toLowerCase();
          const value = $(cells[1]).text().trim();

          if (label.includes("winning combination")) {
            numbers = value.split("-").map((n) => n.trim()).filter(Boolean);
          } else if (label.includes("jackpot prize")) {
            // This will be the jackpot from the correct (results) table
            jackpot = value;
          } else if (label.includes("number of winner")) {
            winners = value;
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
    console.error("Scraper error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
