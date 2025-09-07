// scripts/fetch-history.js
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.lottopcso.com";
const DATA_DIR = path.resolve("data");

// Map game names to slugs
const GAMES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58",
  "Grand Lotto 6/55": "grand-lotto-6-55",
  "Super Lotto 6/49": "super-lotto-6-49",
  "Mega Lotto 6/45": "mega-lotto-6-45",
  "Lotto 6/42": "lotto-6-42",
};

// Fallback mapping (short slugs)
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

// Try to scrape a given URL
async function scrapePage(url) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const rows = $("div.post_content table tbody tr");
  let numbers = [];
  let jackpot = "N/A";
  let winners = "0";

  rows.each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      const label = $(cells[0]).text().toLowerCase();
      if (label.includes("winning combination") && numbers.length === 0) {
        numbers = $(cells[1])
          .text()
          .split("-")
          .map((n) => n.trim())
          .filter(Boolean);
      } else if (label.includes("jackpot prize") && jackpot === "N/A") {
        jackpot = $(cells[1]).text().trim();
      } else if (label.includes("number of winner")) {
        winners = $(cells[1]).text().trim();
      }
    }
  });

  if (numbers.length === 0) return null;

  return { numbers, jackpot, winners };
}

// Fetch result with fallback
async function fetchResult(game, slug, date) {
  const month = date.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const day = date.getDate();
  const year = date.getFullYear();

  // Primary URL
  let url = `${BASE_URL}/${slug}-results-for-${month}-${day}-${year}/`;
  try {
    const result = await scrapePage(url);
    if (result) {
      return { date: date.toISOString().split("T")[0], ...result };
    }
  } catch (err) {
    console.warn(`⚠️ Primary failed: ${url} — ${err.message}`);
  }

  // Fallback URL
  try {
    const fallbackSlug = mapGameToFallbackUrl(game);
    url = `${BASE_URL}/${fallbackSlug}-lotto-result-${month}-${day}-${year}/`;
    const result = await scrapePage(url);
    if (result) {
      return { date: date.toISOString().split("T")[0], ...result };
    }
  } catch (err) {
    console.warn(`❌ Fallback failed for ${game} on ${date.toISOString().split("T")[0]}`);
  }

  return null;
}

// Run for a specific year
async function fetchHistoryForYear(year) {
  for (const [game, slug] of Object.entries(GAMES)) {
    const filePath = path.join(DATA_DIR, `${slug}.json`);

    // Load existing data if present
    let results = [];
    if (fs.existsSync(filePath)) {
      results = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    console.log(`📅 Fetching ${game} for ${year}...`);

    // Loop through all days of the year
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year}-12-31`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const result = await fetchResult(game, slug, new Date(d));
      if (result && !results.some((r) => r.date === result.date)) {
        results.push(result);
        console.log(`✅ Saved ${game} - ${result.date}: ${result.numbers.join(", ")}`);
      }
    }

    // Sort and save
    results.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  }
}

// Run for 2022 first
fetchHistoryForYear(2024).then(() => {
  console.log("🎉 Done fetching 2022 draws!");
});
