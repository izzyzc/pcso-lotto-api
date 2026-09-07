import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const DATA_DIR = path.join(process.cwd(), "data");

// Lotto games mapping
const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58.json",
  "Grand Lotto 6/55": "grand-lotto-6-55.json",
  "Super Lotto 6/49": "super-lotto-6-49.json",
  "Mega Lotto 6/45": "mega-lotto-6-45.json",
  "Lotto 6/42": "lotto-6-42.json"
};

// Map full game names to LottoMatik game path parameters
const GAME_CODE_MAP = {
  "Ultra Lotto 6/58": "UL58",
  "Grand Lotto 6/55": "GL55",
  "Super Lotto 6/49": "SL49",
  "Mega Lotto 6/45": "ML45",
  "Lotto 6/42": "L42"
};

const WINNERS_ONLY = process.env.WINNERS_ONLY === "true";
const TARGET_DATE = process.env.TARGET_DATE || null;

// Utility: format Date object to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Utility: normalize date formats like MM-DD-YY or Month DD, YYYY to YYYY-MM-DD
function normalizeDateStr(dateStr) {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();

  // Handle MM-DD-YY format (e.g. "09-02-26")
  if (/^\d{2}-\d{2}-\d{2}$/.test(cleanStr)) {
    const [m, d, y] = cleanStr.split("-");
    const fullYear = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
    return `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Handle standard Date string parsing (e.g., "September 03, 2026")
  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  return null;
}

// Fetch results for a given game from LottoMatik
async function fetchGameResults(game) {
  const code = GAME_CODE_MAP[game];
  if (!code) return [];

  const url = `https://lottomatik.com/lotto-results/${code}`;
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // 1. Scrape latest featured draw result header
    const latestDateRaw = $(".latest-draw-date, .draw-date").first().text();
    const latestDate = normalizeDateStr(latestDateRaw);

    if (latestDate) {
      const numbers = [];
      $(".winning-numbers .number, .winning-number").each((_, el) => {
        const val = $(el).text().trim();
        if (val && !isNaN(val)) numbers.push(val.padStart(2, "0"));
      });

      const jackpot = $(".jackpot-amount, .current-jackpot").first().text().trim() || "N/A";
      const winners = $(".winners-count").first().text().trim() || "0";

      if (numbers.length >= 6) {
        results.push({
          date: latestDate,
          numbers: numbers.slice(0, 6),
          jackpot: jackpot.startsWith("₱") ? jackpot.replace("₱", "Php ") : jackpot,
          winners: winners.replace(/[^0-9]/g, "") || "0",
          source: "lottomatik.com"
        });
      }
    }

    // 2. Scrape previous historical draws list on the page
    $(".previous-results tr, .history-row, .result-row").each((_, row) => {
      const dateText = $(row).find(".date, td:nth-child(1)").text().trim();
      const date = normalizeDateStr(dateText);
      if (!date) return;

      const numbers = [];
      $(row).find(".number, .ball, td:nth-child(2)").each((_, el) => {
        const num = $(el).text().trim();
        if (num && !isNaN(num)) numbers.push(num.padStart(2, "0"));
      });

      const jackpotText = $(row).find(".jackpot, td:nth-child(3)").text().trim();
      const winnersText = $(row).find(".winners, td:nth-child(4)").text().trim();

      if (numbers.length >= 6) {
        results.push({
          date: date,
          numbers: numbers.slice(0, 6),
          jackpot: jackpotText ? (jackpotText.startsWith("₱") ? jackpotText.replace("₱", "Php ") : jackpotText) : "N/A",
          winners: winnersText.replace(/[^0-9]/g, "") || "0",
          source: "lottomatik.com"
        });
      }
    });

    return results;
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ${game} (${code}): ${err.message}`);
    return [];
  }
}

// Main updater logic
async function updateAllGames() {
  const today = TARGET_DATE ? new Date(TARGET_DATE) : new Date();
  if (TARGET_DATE && isNaN(today)) {
    throw new Error("Invalid TARGET_DATE format. Use YYYY-MM-DD");
  }
  const todayStr = formatDate(today);

  for (const [game, fileName] of Object.entries(GAME_FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    let existingResults = [];

    if (fs.existsSync(filePath)) {
      existingResults = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    console.log(`[INFO] Fetching ${game} from LottoMatik...`);
    const freshData = await fetchGameResults(game);

    if (freshData.length === 0) {
      console.warn(`[WARN] No data returned for ${game}`);
      continue;
    }

    // 🟠 WINNERS-ONLY PATCH MODE
    if (WINNERS_ONLY) {
      let updated = false;
      for (let i = 0; i < Math.min(existingResults.length, 7); i++) {
        const entry = existingResults[i];
        if (!entry.winners || entry.winners === "*" || entry.winners === "0") {
          const matchedFresh = freshData.find(f => f.date === entry.date);
          if (matchedFresh?.winners && matchedFresh.winners !== "*" && matchedFresh.winners !== entry.winners) {
            entry.winners = matchedFresh.winners;
            updated = true;
            console.log(`🔄 Winners updated: ${game} ${entry.date} → ${matchedFresh.winners}`);
          }
        }
      }
      if (updated) {
        fs.writeFileSync(filePath, JSON.stringify(existingResults, null, 2));
      }
      continue;
    }

    // 🟢 NORMAL NIGHTLY MODE
    const targetMatch = freshData.find(r => r.date === todayStr);

    if (targetMatch) {
      const exists = existingResults.some(r => r.date === todayStr);
      if (exists) {
        console.log(`⏭️ Already have ${game} for ${todayStr}`);
      } else {
        existingResults.unshift(targetMatch);
        fs.writeFileSync(filePath, JSON.stringify(existingResults, null, 2));
        console.log(`✅ Added ${game} for ${todayStr} from ${targetMatch.source}`);
      }
    } else {
      console.log(`❌ No result found for ${game} on ${todayStr}`);
    }
  }
}

updateAllGames().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
