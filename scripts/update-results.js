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

// Map full game names to LottoMatik lottery query params
const GAME_CODE_MAP = {
  "Ultra Lotto 6/58": "UL58",
  "Grand Lotto 6/55": "GL55",
  "Super Lotto 6/49": "SL49",
  "Mega Lotto 6/45": "ML45",
  "Lotto 6/42": "L42"
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

// Fetch results directly from LottoMatik API endpoint
async function fetchGameResults(game) {
  const code = GAME_CODE_MAP[game];
  if (!code) return [];

  const url = `https://lottomatik.com/api/backend/get-game-history`;

  try {
    const response = await axios.get(url, {
      params: { lottery: code },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      },
      timeout: 20000
    });

    const items = response.data?.items || [];

    return items.map(item => {
      const numbers = (item.result || []).map(n => String(n).padStart(2, "0"));

      const jackpotVal = Number(item.jackpot);
      const jackpot = !isNaN(jackpotVal)
        ? `Php ${jackpotVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "N/A";

      const winners = item.totalWinners != null ? String(item.totalWinners) : "0";

      return {
        date: item.drawDate,
        numbers: numbers,
        jackpot: jackpot,
        winners: winners,
        source: "lottomatik.com API"
      };
    }).filter(entry => entry.date && entry.numbers.length >= 6);

  } catch (err) {
    console.error(`[ERROR] API request failed for ${game} (${code}): ${err.message}`);
    return [];
  }
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

    console.log(`[INFO] Fetching ${game} from LottoMatik API...`);
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
