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

// Fetch results for a specific date using the public API
async function fetchResultForDate(game, dateStr) {
  try {
    const response = await axios.get("https://pcsolotto.org/api/v2/results", {
      params: { date: dateStr },
      timeout: 15000
    });

    const data = response.data;
    const draws = data.draws || [];

    const gameCode = GAME_CODE_MAP[game];

    for (const draw of draws) {
      const gameResult = draw.games?.find(g => 
        g.gameCode === gameCode || 
        g.gameName?.toLowerCase().includes(game.toLowerCase().replace(/\s+/g, ""))
      );

      if (gameResult && gameResult.numbers?.length > 0) {
        return {
          date: draw.drawDate ? draw.drawDate.split("T")[0] : dateStr,
          numbers: gameResult.numbers,
          jackpot: gameResult.prizeAmount 
            ? `Php ${Number(gameResult.prizeAmount).toLocaleString()}` 
            : "N/A",
          winners: (gameResult.winnersCount ?? 0).toString(),
          source: "pcsolotto.org API"
        };
      }
    }
    return null;
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ${game} on ${dateStr}: ${err.message}`);
    return null;
  }
}

// Main function - now supports fromDate and toDate
async function fetchHistory(fromYear, toYear) {
  console.log(`📅 Fetching history from ${fromYear} to ${toYear}...`);

  for (const [game, fileName] of Object.entries(GAME_FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    let results = [];

    if (fs.existsSync(filePath)) {
      results = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    console.log(`\n🔄 Processing ${game}...`);

    const startDate = new Date(`${fromYear}-01-01`);
    const endDate = new Date(`${toYear}-12-31`);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      // Skip if we already have this date
      if (results.some(r => r.date === dateStr)) {
        continue;
      }

      const result = await fetchResultForDate(game, dateStr);
      if (result) {
        results.push(result);
        console.log(`✅ Added ${game} - ${dateStr}`);
      }
    }

    // Sort by date (oldest first)
    results.sort((a, b) => new Date(a.date) - new Date(b.date));

    fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
    console.log(`💾 Saved ${results.length} draws for ${game}`);
  }

  console.log("\n🎉 History fetching completed!");
}

// Allow running with from/to year from command line or default to recent years
const fromYear = process.argv[2] ? parseInt(process.argv[2]) : 2022;
const toYear = process.argv[3] ? parseInt(process.argv[3]) : new Date().getFullYear();

fetchHistory(fromYear, toYear);
