// api/frequency.js
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const GAME_FILES = {
  "Ultra Lotto 6/58": { file: "ultra-lotto-6-58.json", max: 58 },
  "Grand Lotto 6/55": { file: "grand-lotto-6-55.json", max: 55 },
  "Super Lotto 6/49": { file: "super-lotto-6-49.json", max: 49 },
  "Mega Lotto 6/45": { file: "mega-lotto-6-45.json", max: 45 },
  "Lotto 6/42": { file: "lotto-6-42.json", max: 42 },
};

export default async function handler(req, res) {
  try {
    const { game, limit } = req.query;
    const gameConfig = GAME_FILES[game];
    if (!gameConfig) {
      return res.status(400).json({ error: "Unknown game: " + game });
    }

    const filePath = path.join(DATA_DIR, gameConfig.file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "No data file found for " + game });
    }

    const results = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Count frequency of each number
    const freqMap = {};
    results.forEach(draw => {
      draw.numbers.forEach(num => {
        freqMap[num] = (freqMap[num] || 0) + 1;
      });
    });

    // Build a full list from 1 → max number
    const freqArray = [];
    for (let i = 1; i <= gameConfig.max; i++) {
      freqArray.push({
        number: i.toString(),
        count: freqMap[i.toString()] || 0,
      });
    }

    // Sort descending
    freqArray.sort((a, b) => b.count - a.count);

    const top = limit ? freqArray.slice(0, parseInt(limit)) : freqArray;
    const bottom = limit ? freqArray.slice(-parseInt(limit)) : freqArray;

    return res.status(200).json({
      game,
      draws: results.length,
      mostFrequent: top,
      leastFrequent: bottom,
    });
  } catch (err) {
    console.error("Frequency error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
