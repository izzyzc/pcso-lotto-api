// scripts/update-results.js
import fs from "fs";
import path from "path";
import axios from "axios";

const DATA_DIR = path.join(process.cwd(), "data");

// Lotto games mapping - keep your existing JSON files
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

// Game code mapping for pcsolotto.org API
const GAME_CODE_MAP = {
  "Ultra Lotto 6/58": "ultra_lotto_6_58",
  "Grand Lotto 6/55": "grand_lotto_6_55",
  "Super Lotto 6/49": "super_lotto_6_49",
  "Mega Lotto 6/45": "mega_lotto_6_45",
  "Lotto 6/42":     "lotto_6_42"
};

// Fetch result from stable public PCSO API
async function fetchResult(game, targetDateObj) {
  const targetDateStr = formatDate(targetDateObj);
  try {
    const response = await axios.get("https://pcsolotto.org/api/v2/results", {
      params: { date: targetDateStr },
      timeout: 20000
    });

    const data = response.data;
    const draws = data.draws || [];

    const gameCode = GAME_CODE_MAP[game];

    for (const draw of draws) {
      const gameResult = draw.games?.find(g => 
        g.gameCode === gameCode || 
        g.gameName?.toLowerCase().includes(game.toLowerCase().replace(/\s+/g, ""))
      );

      if (gameResult && gameResult.numbers && gameResult.numbers.length > 0) {
        return {
          date: draw.drawDate || targetDateStr,
          numbers: gameResult.numbers,
          jackpot: gameResult.prizeAmount 
            ? `Php ${Number(gameResult.prizeAmount).toLocaleString()}` 
            : "N/A",
          winners: gameResult.winnersCount != null 
            ? gameResult.winnersCount.toString() 
            : "0",
          source: "pcsolotto.org API"
        };
      }
    }

    console.warn(`[WARN] No matching result for ${game} on ${targetDateStr}`);
    return null;
  } catch (err) {
    console.error(`[ERROR] API request failed for ${game} on ${targetDateStr}: ${err.message}`);
    return null;
  }
}

// Main updater
async function updateAllGames() {
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
          const fresh = await fetchResult(game, new Date(entry.date));
          if (fresh?.winners && fresh.winners !== "*" && fresh.winners !== entry.winners) {
            entry.winners = fresh.winners;
            updated = true;
            console.log(`🔄 Winners updated: ${game} ${entry.date} → ${fresh.winners}`);
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

    const result = await fetchResult(game, today);

    if (result) {
      results.unshift(result);
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      console.log(`✅ Added ${game} for ${todayStr} from ${result.source}`);
    } else {
      console.log(`❌ No result found for ${game} on ${todayStr}`);
    }
  }
}

updateAllGames().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
