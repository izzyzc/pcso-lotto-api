// scripts/fetch-history.js
import fs from "fs";
import path from "path";
import axios from "axios";

const DATA_DIR = path.resolve("data");

const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58.json",
  "Grand Lotto 6/55": "grand-lotto-6-55.json",
  "Super Lotto 6/49": "super-lotto-6-49.json",
  "Mega Lotto 6/45": "mega-lotto-6-45.json",
  "Lotto 6/42": "lotto-6-42.json"
};

const GAME_CODE_MAP = {
  "Ultra Lotto 6/58": "ultra_lotto_6_58",
  "Grand Lotto 6/55": "grand_lotto_6_55",
  "Super Lotto 6/49": "super_lotto_6_49",
  "Mega Lotto 6/45": "mega_lotto_6_45",
  "Lotto 6/42":     "lotto_6_42"
};

// Improved fetch function with better matching (same as update-results.js)
async function fetchResultForDate(game, dateStr) {
  try {
    const response = await axios.get("https://pcsolotto.org/api/v2/results", {
      params: { date: dateStr },
      timeout: 20000
    });

    console.log(`[DEBUG] API response received for ${dateStr} (${game})`);

    const data = response.data;
    const draws = data.draws || data.results || data.data || [];

    if (draws.length === 0) {
      console.warn(`[WARN] No draws returned by API for ${dateStr}`);
      return null;
    }

    const searchTerm = game.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const draw of draws) {
      const gamesList = draw.games || draw.results || [];

      for (const g of gamesList) {
        if (!g || !g.numbers || g.numbers.length === 0) continue;

        const apiName = (g.gameName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const apiCode = (g.gameCode || "").toLowerCase();

        // Flexible matching logic
        if (
          apiCode.includes(searchTerm) ||
          apiName.includes(searchTerm) ||
          apiName.includes(game.toLowerCase().replace(/\s+/g, "")) ||
          searchTerm.includes(apiCode.replace(/_/g, ""))
        ) {
          console.log(`[DEBUG] Found match for ${game} → ${g.gameName || apiCode}`);

          return {
            date: draw.drawDate ? draw.drawDate.split("T")[0] : dateStr,
            numbers: g.numbers,
            jackpot: g.prizeAmount 
              ? `Php ${Number(g.prizeAmount).toLocaleString()}` 
              : "N/A",
            winners: g.winnersCount != null 
              ? g.winnersCount.toString() 
              : "0",
            source: "pcsolotto.org API"
          };
        }
      }
    }

    console.warn(`[WARN] No matching game found for ${game} on ${dateStr}`);
    return null;
  } catch (err) {
    console.error(`[ERROR] API request failed for ${game} on ${dateStr}: ${err.message}`);
    return null;
  }
}

// Main history fetch function - supports fromYear and toYear
async function fetchHistory(fromYear, toYear) {
  console.log(`📅 Starting history fetch from ${fromYear} to ${toYear}...`);

  for (const [game, fileName] of Object.entries(GAME_FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    let results = [];

    if (fs.existsSync(filePath)) {
      results = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    console.log(`\n🔄 Processing ${game}...`);

    const startDate = new Date(`${fromYear}-01-01`);
    const endDate = new Date(`${toYear}-12-31`);

    let addedCount = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      // Skip if we already have this date
      if (results.some(r => r.date === dateStr)) {
        continue;
      }

      const result = await fetchResultForDate(game, dateStr);

      if (result) {
        results.push(result);
        addedCount++;
        console.log(`✅ Added ${game} - ${dateStr}`);
      }
    }

    // Sort by date (oldest first)
    results.sort((a, b) => new Date(a.date) - new Date(b.date));

    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    console.log(`💾 Saved ${results.length} total draws for ${game} (${addedCount} new)`);
  }

  console.log("\n🎉 History fetching completed!");
}

// Allow running with command line arguments: fromYear toYear
const fromYear = process.argv[2] ? parseInt(process.argv[2]) : 2022;
const toYear = process.argv[3] ? parseInt(process.argv[3]) : new Date().getFullYear();

fetchHistory(fromYear, toYear);
