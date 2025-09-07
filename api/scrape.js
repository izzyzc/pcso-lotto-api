// api/scrape.js
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.lottopcso.com";
const DATA_DIR = path.join(process.cwd(), "data");

const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-658.json",
  "Grand Lotto 6/55": "grand-655.json",
  "Super Lotto 6/49": "super-649.json",
  "Mega Lotto 6/45": "mega-645.json",
  "Lotto 6/42": "lotto-642.json",
};

// Utility
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Fallback scraping (only if data not found in JSON)
async function scrapeResult(game, dateStr) {
  const dateObj = new Date(dateStr);
  const month = dateObj.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  const formattedGame = game.replace(/\s+/g, "-").replace("/", "-").toLowerCase();

  let url = `${BASE_URL}/${formattedGame}-results-for-${month}-${day}-${year}/`;

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    let numbers = [];
    let jackpot = "N/A";
    let winners = "0";

    const table = $("div.post_content table").first();
    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length >= 2) {
        const label = $(cells[0]).text().toLowerCase();
        if (label.includes("winning combination")) {
          numbers = $(cells[1]).text().split("-").map(n => n.trim()).filter(Boolean);
        } else if (label.includes("jackpot prize") && jackpot === "N/A") {
          jackpot = $(cells[1]).text().trim();
        } else if (label.includes("number of winner")) {
          winners = $(cells[1]).text().trim();
        }
      }
    });

    return { date: dateStr, numbers, jackpot, winners, source: url };
  } catch (err) {
    console.error("Scrape fallback error:", err.message);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const { game, date } = req.query;
    if (!game || !date) {
      return res.status(400).json({ error: "Missing required params: game, date" });
    }

    const fileName = GAME_FILES[game];
    if (!fileName) {
      return res.status(400).json({ error: "Unknown game: " + game });
    }

    const filePath = path.join(DATA_DIR, fileName);
    let results = [];

    if (fs.existsSync(filePath)) {
      results = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    // Look for cached entry
    const cached = results.find(r => r.date === date);
    if (cached) {
      return res.status(200).json({ ...cached, game, cached: true });
    }

    // If not found in JSON, scrape live
    const live = await scrapeResult(game, date);
    if (live) {
      return res.status(200).json({ ...live, game, cached: false });
    }

    return res.status(404).json({ error: `No results found for ${game} on ${date}` });
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
