// scripts/update-results.js
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.lottopcso.com";
const DATA_DIR = path.join(process.cwd(), "data");

// Lotto games mapping
const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58.json",
  "Grand Lotto 6/55": "grand-lotto-6-55.json",
  "Super Lotto 6/49": "super-lotto-6-49.json",
  "Mega Lotto 6/45": "mega-lotto-6-45.json",
  "Lotto 6/42": "lotto-6-42.json"
};

// Utility: format date to yyyy-mm-dd
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Build URL for scraping
function buildUrl(game, dateObj) {
  const month = dateObj.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  const formattedGame = game.replace(/\s+/g, "-").replace("/", "-").toLowerCase();
  return `${BASE_URL}/${formattedGame}-results-for-${month}-${day}-${year}/`;
}

// Scrape one page
async function scrapeResult(game, dateObj) {
  const url = buildUrl(game, dateObj);
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    let numbers = [];
    let jackpot = "N/A";
    let winners = "0";

    // 👉 Only get FIRST "Jackpot Prize" table
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

    return {
      date: formatDate(dateObj),
      numbers,
      jackpot,
      winners,
      source: url,
    };
  } catch (err) {
    console.error(`❌ Failed to scrape ${game} on ${formatDate(dateObj)}: ${err.message}`);
    return null;
  }
}

// Update all game JSONs
async function updateAllGames() {
  const today = new Date();

  for (const [game, fileName] of Object.entries(GAMES)) {
    const filePath = path.join(DATA_DIR, fileName);

    // Load existing file or create new
    let results = [];
    if (fs.existsSync(filePath)) {
      results = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    // Check if today's result already exists
    const todayStr = formatDate(today);
    if (results.some(r => r.date === todayStr)) {
      console.log(`⏭️ Already have ${game} for ${todayStr}`);
      continue;
    }

    // Scrape and append
    const result = await scrapeResult(game, today);
    if (result && result.numbers.length > 0) {
      results.unshift(result); // add to top
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      console.log(`✅ Added ${game} for ${todayStr}`);
    } else {
      console.log(`⚠️ No result found for ${game} on ${todayStr}`);
    }
  }
}

updateAllGames();
