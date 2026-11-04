import fs from "fs";
import path from "path";
import axios from "axios";

const DATA_DIR = path.join(process.cwd(), "data");

// Game mapping to JSON data files
const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58.json",
  "Grand Lotto 6/55": "grand-lotto-6-55.json",
  "Super Lotto 6/49": "super-lotto-6-49.json",
  "Mega Lotto 6/45": "mega-lotto-6-45.json",
  "Lotto 6/42": "lotto-6-42.json"
};

// Exact game codes matching LottoMatik payloads
const GAME_CODE_MAP = {
  "Ultra Lotto 6/58": "UL58",
  "Grand Lotto 6/55": "GL55",
  "Super Lotto 6/49": "SL49",
  "Mega Lotto 6/45": "ML45",
  "Lotto 6/42": "LOTTO42"
};

// Parse Target Year and Month from CLI arguments or Environment variables
// Usage: node scripts/backfill-month.js 2026 10
const YEAR = process.argv[2] || process.env.YEAR || "2026";
const MONTH = (process.argv[3] || process.env.MONTH || "10").padStart(2, "0");

// Utility: format Date object to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// Extract items from month archive response
function parseMonthItems(rawData) {
  let items = [];

  if (Array.isArray(rawData)) {
    items = rawData;
  } else if (rawData?.pageProps?.monthlyResults) {
    items = rawData.pageProps.monthlyResults;
  } else if (rawData?.pageProps?.latestResults) {
    items = rawData.pageProps.latestResults;
  } else if (rawData?.pageProps?.draws) {
    items = rawData.pageProps.draws;
  } else if (rawData?.items) {
    items = rawData.items;
  }

  return items;
}

// Dynamically fetch the active Next.js Build ID
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

// Fetch all results for a specific year and month archive
async function fetchMonthArchive(year, month) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": `https://lottomatik.com/lotto-results/${year}/${month}`
  };

  const buildId = await getActiveBuildId();

  const endpoints = [
    buildId ? `https://lottomatik.com/_next/data/${buildId}/lotto-results/${year}/${month}.json` : null,
    `https://lottomatik.com/api/backend/get-game-history?year=${year}&month=${month}&perPage=200`,
    `https://lottomatik.com/api/get-game-history?year=${year}&month=${month}`
  ].filter(Boolean);

  for (const url of endpoints) {
    try {
      console.log(`[INFO] Requesting archive data from: ${url}`);
      const response = await axios.get(url, { headers, timeout: 15000 });
      const items = parseMonthItems(response.data);

      if (items.length > 0) {
        return items;
      }
    } catch (err) {
      console.warn(`[WARN] Archive endpoint failed (${url}): ${err.message}`);
    }
  }

  // Fallback: Parse embedded __NEXT_DATA__ script directly from HTML page
  console.log(`[INFO] Attempting HTML __NEXT_DATA__ archive fallback for ${year}/${month}...`);
  try {
    const pageUrl = `https://lottomatik.com/lotto-results/${year}/${month}`;
    const pageRes = await axios.get(pageUrl, { headers, timeout: 20000 });

    const nextDataMatch = pageRes.data.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch && nextDataMatch[1]) {
      const nextData = JSON.parse(nextDataMatch[1]);
      return parseMonthItems(nextData);
    }
  } catch (fallbackErr) {
    console.error(`[ERROR] Monthly HTML fallback failed: ${fallbackErr.message}`);
  }

  return [];
}

// Process and insert monthly draws into local JSON data files
async function backfillMonth() {
  console.log(`🚀 Starting monthly backfill for: ${YEAR}-${MONTH}`);

  const rawDraws = await fetchMonthArchive(YEAR, MONTH);

  if (!rawDraws || rawDraws.length === 0) {
    console.error(`❌ No archive draws found for ${YEAR}-${MONTH}`);
    return;
  }

  console.log(`📦 Retreived ${rawDraws.length} total raw draws for ${YEAR}-${MONTH}`);

  for (const [game, fileName] of Object.entries(GAME_FILES)) {
    const code = GAME_CODE_MAP[game];
    const filePath = path.join(DATA_DIR, fileName);

    let existingResults = [];
    if (fs.existsSync(filePath)) {
      existingResults = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    // Filter draw results matching current game code
    const matchingDraws = rawDraws.filter(item => {
      const itemLottery = item.lottery || item.gameCode || item.code || "";
      return itemLottery === code;
    });

    if (matchingDraws.length === 0) {
      console.log(`ℹ️ No draws for ${game} (${code}) in ${YEAR}-${MONTH}`);
      continue;
    }

    let addedCount = 0;

    for (const item of matchingDraws) {
      const rawDate = item.drawDate || item.date || item.created_at;
      let formattedDate = null;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          formattedDate = formatDate(parsed);
        }
      }

      if (!formattedDate) continue;

      // Extract winning numbers
      let rawNumbers = item.result || item.numbers || item.combinations || [];
      if (typeof rawNumbers === "string") {
        rawNumbers = rawNumbers.split(/[-,\s]+/).filter(Boolean);
      }
      const numbers = rawNumbers.map(n => String(n).trim().padStart(2, "0"));

      if (numbers.length < 6) continue;

      // Extract jackpot
      const jackpotVal = Number(item.jackpot);
      let jackpot = "N/A";
      if (!isNaN(jackpotVal) && jackpotVal > 0) {
        jackpot = `Php ${jackpotVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (typeof item.jackpot === "string") {
        jackpot = item.jackpot.startsWith("₱") ? item.jackpot.replace("₱", "Php ") : item.jackpot;
      }

      // Extract winners
      const winnersCount = item.totalWinners ?? item.winners ?? item.winnersCount;
      const winners = winnersCount != null ? String(winnersCount) : "0";

      const entry = {
        date: formattedDate,
        numbers: numbers,
        jackpot: jackpot,
        winners: winners,
        source: "lottomatik.com Monthly Archive"
      };

      // Check if entry exists or needs update
      const existingIdx = existingResults.findIndex(r => r.date === formattedDate);
      if (existingIdx === -1) {
        existingResults.push(entry);
        addedCount++;
      } else {
        // Update winner count if existing is unpopulated/zero
        if ((!existingResults[existingIdx].winners || existingResults[existingIdx].winners === "0") && winners !== "0") {
          existingResults[existingIdx].winners = winners;
          console.log(`🔄 Updated winners for ${game} ${formattedDate} → ${winners}`);
        }
      }
    }

    if (addedCount > 0) {
      // Re-sort descending by date (newest first)
      existingResults.sort((a, b) => new Date(b.date) - new Date(a.date));
      fs.writeFileSync(filePath, JSON.stringify(existingResults, null, 2));
      console.log(`✅ ${game}: Added ${addedCount} missing records for ${YEAR}-${MONTH}`);
    } else {
      console.log(`⏭️ ${game}: All draws for ${YEAR}-${MONTH} already exist in data file.`);
    }
  }
}

backfillMonth().catch(err => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
