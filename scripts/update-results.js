import fs from "fs";
import path from "path";
import axios from "axios";

const DATA_DIR = path.join(process.cwd(), "data");

// Lotto games mapping
const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58.json",
  "Grand Lotto 6/55": "grand-lotto-6-55.json",
  "Super Lotto 6/49": "super-lotto-6-49.json",
  "Mega Lotto 6/45": "mega-lotto-6-45.json",
  "Lotto 6/42": "lotto-6-42.json"
};

// Exact game codes from LottoMatik payload
const GAME_CODE_MAP = {
  "Ultra Lotto 6/58": "UL58",
  "Grand Lotto 6/55": "GL55",
  "Super Lotto 6/49": "SL49",
  "Mega Lotto 6/45": "ML45",
  "Lotto 6/42": "LOTTO42" // Updated code from payload
};

const WINNERS_ONLY = process.env.WINNERS_ONLY === "true";
const START_DATE_ENV = process.env.START_DATE || null;
const END_DATE_ENV = process.env.END_DATE || null;

// Utility: format Date object to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Utility: Generate array of YYYY-MM-DD dates between start and end inclusive
function getDateRange(startDateStr, endDateStr) {
  const dates = [];
  let current = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(current.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date format provided for range. Use YYYY-MM-DD");
  }

  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Extract and normalize items array from pageProps payload
function parseItemsFromResponse(rawData, targetCode) {
  let items = [];

  if (Array.isArray(rawData)) {
    items = rawData;
  } else if (rawData?.pageProps?.latestResults) {
    items = rawData.pageProps.latestResults;
  } else if (rawData?.items) {
    items = rawData.items;
  } else if (rawData?.data) {
    items = rawData.data;
  }

  return items
    .filter(item => {
      if (!targetCode) return true;
      const itemLottery = item.lottery || item.gameCode || item.code || "";
      return itemLottery === targetCode;
    })
    .map(item => {
      // Date extraction
      const rawDate = item.drawDate || item.date || item.created_at;
      let formattedDate = null;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          formattedDate = formatDate(parsed);
        }
      }

      // Winning numbers extraction
      let rawNumbers = item.result || item.numbers || item.combinations || [];
      if (typeof rawNumbers === "string") {
        rawNumbers = rawNumbers.split(/[-,\s]+/).filter(Boolean);
      }

      const numbers = rawNumbers.map(n => String(n).trim().padStart(2, "0"));

      // Jackpot formatting
      const jackpotVal = Number(item.jackpot);
      let jackpot = "N/A";
      if (!isNaN(jackpotVal) && jackpotVal > 0) {
        jackpot = `Php ${jackpotVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (typeof item.jackpot === "string") {
        jackpot = item.jackpot.startsWith("₱") ? item.jackpot.replace("₱", "Php ") : item.jackpot;
      }

      // Winners count extraction
      const winnersCount = item.totalWinners ?? item.winners ?? item.winnersCount;
      const winners = winnersCount != null ? String(winnersCount) : "0";

      return {
        date: formattedDate,
        numbers: numbers,
        jackpot: jackpot,
        winners: winners,
        source: "lottomatik.com API"
      };
    })
    .filter(entry => entry.date && entry.numbers.length >= 6);
}

// Dynamically fetch the active Next.js Build ID from HTML
async function getActiveBuildId() {
  try {
    const pageRes = await axios.get("https://lottomatik.com/lotto-results", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      timeout: 10000
    });

    const match = pageRes.data.match(/"buildId":"([^"]+)"/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err) {
    console.warn(`[WARN] Could not resolve Build ID: ${err.message}`);
  }
  return null;
}

// Fetch results using dynamic route with fallbacks
async function fetchGameResults(game) {
  const code = GAME_CODE_MAP[game];
  if (!code) return [];

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": `https://lottomatik.com/lotto-results`
  };

  const buildId = await getActiveBuildId();

  const endpoints = [
    buildId ? `https://lottomatik.com/_next/data/${buildId}/lotto-results.json` : null,
    `https://lottomatik.com/api/backend/get-game-history?lottery=${code}&page=1&perPage=50`,
    `https://lottomatik.com/api/get-game-history?lottery=${code}`
  ].filter(Boolean);

  for (const url of endpoints) {
    try {
      const response = await axios.get(url, { headers, timeout: 15000 });
      const parsed = parseItemsFromResponse(response.data, code);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      console.warn(`[WARN] Endpoint failed (${url}): ${err.message}`);
    }
  }

  // Fallback: Extract from __NEXT_DATA__ script on page HTML directly
  console.log(`[INFO] Attempting __NEXT_DATA__ page fallback for ${game}...`);
  try {
    const pageUrl = `https://lottomatik.com/lotto-results`;
    const pageRes = await axios.get(pageUrl, { headers, timeout: 20000 });

    const nextDataMatch = pageRes.data.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch && nextDataMatch[1]) {
      const nextData = JSON.parse(nextDataMatch[1]);
      const parsed = parseItemsFromResponse(nextData, code);
      if (parsed.length > 0) return parsed;
    }
  } catch (fallbackErr) {
    console.error(`[ERROR] HTML fallback failed for ${game}: ${fallbackErr.message}`);
  }

  return [];
}

// Main updater logic
async function updateAllGames() {
  const todayStr = formatDate(new Date());

  let targetDates = [];
  if (START_DATE_ENV) {
    const endStr = END_DATE_ENV || START_DATE_ENV;
    targetDates = getDateRange(START_DATE_ENV, endStr);
  } else {
    targetDates = [todayStr];
  }

  console.log(`[INFO] Processing dates: ${targetDates.join(", ")}`);

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
      for (let i = 0; i < Math.min(existingResults.length, 30); i++) {
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

    // 🟢 NORMAL / BACKFILL MODE
    let fileModified = false;

    for (const targetDateStr of targetDates) {
      const targetMatch = freshData.find(r => r.date === targetDateStr);

      if (targetMatch) {
        const exists = existingResults.some(r => r.date === targetDateStr);
        if (exists) {
          console.log(`⏭️ Already have ${game} for ${targetDateStr}`);
        } else {
          existingResults.push(targetMatch);
          fileModified = true;
          console.log(`✅ Added ${game} for ${targetDateStr}`);
        }
      } else {
        console.log(`❌ No draw result found for ${game} on ${targetDateStr}`);
      }
    }

    if (fileModified) {
      // Sort in descending order by date (newest first)
      existingResults.sort((a, b) => new Date(b.date) - new Date(a.date));
      fs.writeFileSync(filePath, JSON.stringify(existingResults, null, 2));
    }
  }
}

updateAllGames().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
