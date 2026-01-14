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

const WINNERS_ONLY = process.env.WINNERS_ONLY === "true";
const TARGET_DATE = process.env.TARGET_DATE || null;

// Utility: format date to yyyy-mm-dd
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// 🟡 Multi-fallback slug mapping
function mapGameToFallbackUrls(game) {
  switch (game) {
    case "Ultra Lotto 6/58":
      return ["6-58-ultra-lotto", "6-58"];
    case "Grand Lotto 6/55":
      return ["6-55-grand-lotto", "6-55"];
    case "Super Lotto 6/49":
      return ["6-49-super-lotto", "6-49"];
    case "Mega Lotto 6/45":
      return ["6-45-mega-lotto", "6-45"];
    case "Lotto 6/42":
      return ["6-42-lotto", "6-42"];
    default:
      throw new Error("Unknown game: " + game);
  }
}

// Primary URL
function buildPrimaryUrl(game, dateObj) {
  const month = dateObj.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  const formattedGame = game.replace(/\s+/g, "-").replace("/", "-").toLowerCase();
  return `${BASE_URL}/${formattedGame}-results-for-${month}-${day}-${year}/`;
}

// Fallback URLs (plural)
function buildFallbackUrls(game, dateObj) {
  const month = dateObj.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const day = dateObj.getDate();
  const year = dateObj.getFullYear();
  return mapGameToFallbackUrls(game).map(
    slug => `${BASE_URL}/${slug}-lotto-results-for-${month}-${day}-${year}/`
  );
}

// Shared axios config with headers
const axiosConfig = {
  timeout: 15000,
  headers: {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "priority": "u=0, i",
    "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    // Optional: add if-modified-since only if you have a cached date, otherwise omit to avoid conditional misses
  },
  // Force HTTP/2 if possible (axios supports via http2 adapter in newer versions)
  // Or install axios-http2-adapter if needed
};

// Scrape page
async function scrapeResult(dateObj, url) {
  try {
    const res = await axios.get(url, axiosConfig);
    console.log(`[DEBUG] Status for ${url}: ${res.status}`);

    // Optional: log first chunk for debugging failed parses
    // console.log(`[DEBUG] HTML snippet: ${res.data.substring(0, 800)}`);

    const $ = cheerio.load(res.data);
    let numbers = [];
    let jackpot = "N/A";
    let winners = "0";

    const table = $("div.post_content table").first();
    // Fallback selector if .post_content missing
    if (!table.length) {
      table = $("table").first(); // or $(".entry-content table").first()
    }

    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td, th"); // support th too
      if (cells.length >= 2) {
        const label = $(cells[0]).text().toLowerCase().trim();
        const valueCell = $(cells[1]);
        const value = valueCell.text().trim();

        if (label.includes("winning combination") || label.includes("combination")) {
          numbers = value
            .split("-")
            .map(n => n.trim())
            .filter(Boolean);
        } else if (label.includes("jackpot prize") || label.includes("jackpot")) {
          jackpot = value;
        } else if (label.includes("winner") || label.includes("number of winner")) {
          winners = value.replace(/[^0-9]/g, ""); // extract digits only
          if (!winners || winners === "") winners = "0"; // handle *, empty, etc.
        }
      }
    });

    if (!numbers.length) {
      console.warn(`[WARN] No numbers found in ${url}`);
      return null;
    }

    return {
      date: formatDate(dateObj),
      numbers,
      jackpot,
      winners,
      source: url
    };
  } catch (err) {
    console.error(`[ERROR] Fetch failed for ${url}: ${err.message}`);
    return null;
  }
}

// Main updater
async function updateAllGames() {
  // const today = new Date();
  const today = TARGET_DATE ? new Date(TARGET_DATE) : new Date();
  if (TARGET_DATE && isNaN(today)) {
  throw new Error("Invalid TARGET_DATE format. Use YYYY-MM-DD");
  }
  const todayStr = formatDate(today);

  for (const [game, fileName] of Object.entries(GAME_FILES)) {
    const filePath = path.join(DATA_DIR, fileName);

    let results = [];
    if (fs.existsSync(filePath)) {
      results = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    // 🟠 WINNERS-ONLY PATCH MODE
    if (WINNERS_ONLY) {
      let updated = false;

      for (let i = 0; i < Math.min(results.length, 7); i++) {
        const entry = results[i];

        if (!entry.winners || entry.winners === "*" || entry.winners === "0") {
          const entryDate = new Date(entry.date);

          // Try primary + fallbacks
          const urls = [
            buildPrimaryUrl(game, entryDate),
            ...buildFallbackUrls(game, entryDate)
          ];

          for (const url of urls) {
            try {
              const fresh = await scrapeResult(entryDate, url);
              if (fresh?.winners && fresh.winners !== "*" && fresh.winners !== entry.winners) {
                entry.winners = fresh.winners;
                updated = true;
                console.log(`🔄 Winners updated: ${game} ${entry.date} → ${fresh.winners}`);
                break;
              }
            } catch {}
          }
        }
      }

      if (updated) {
        fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      }

      continue;
    }

    // 🟢 NORMAL NIGHTLY MODE
    if (results.some(r => r.date === todayStr)) {
      console.log(`⏭️ Already have ${game} for ${todayStr}`);
      continue;
    }

    let result = null;
    const urls = [
      buildPrimaryUrl(game, today),
      ...buildFallbackUrls(game, today)
    ];

    for (const url of urls) {
      try {
        result = await scrapeResult(today, url);
        if (result) break;
      } catch {
        console.warn(`⚠️ Failed: ${url}`);
      }
    }

    if (result) {
      results.unshift(result);
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      console.log(`✅ Added ${game} for ${todayStr}`);
    } else {
      console.log(`❌ No result found for ${game} on ${todayStr}`);
    }
  }
}

updateAllGames();
