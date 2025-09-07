// scripts/fetch-history.js
import fs from "fs";
import path from "path";
import axios from "axios";

const DATA_DIR = path.join(process.cwd(), "data");

// Your deployed scrape endpoint
const SCRAPE_URL = "https://pcso-lotto-api.vercel.app/api/scrape";

// Game list + start years (rough estimates, adjust as needed)
const GAMES = {
  "Ultra Lotto 6/58": 2022,
  "Grand Lotto 6/55": 2022,
  "Super Lotto 6/49": 2022,
  "Mega Lotto 6/45": 2022,
  "Lotto 6/42": 2022,
};

async function fetchResult(game, date) {
  try {
    const res = await axios.get(SCRAPE_URL, {
      params: { game, date },
    });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    console.warn(`Error for ${game} on ${date}: ${err.message}`);
    return null;
  }
}

function formatDate(yyyy, mm, dd) {
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

async function fetchHistory() {
  for (const [game, startYear] of Object.entries(GAMES)) {
    const results = [];
    const today = new Date();
    console.log(`Fetching history for ${game}...`);

    for (let year = startYear; year <= today.getFullYear(); year++) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 31; day++) {
          const dateStr = formatDate(year, month, day);
          const dateObj = new Date(dateStr);
          if (dateObj > today) continue;

          const result = await fetchResult(game, dateStr);
          if (result && result.numbers?.length) {
            results.push(result);
            console.log(`${game} ✅ ${dateStr}: ${result.numbers.join(", ")}`);
          }
        }
      }
    }

    // Save JSON
    const fileName = path.join(DATA_DIR, `${game.toLowerCase().replace(/\s|\//g, "-")}.json`);
    fs.writeFileSync(fileName, JSON.stringify(results, null, 2));
    console.log(`Saved ${results.length} draws for ${game}`);
  }
}

fetchHistory();
