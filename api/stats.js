// api/stats.js
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-lotto-6-58.json",
  "Grand Lotto 6/55": "grand-lotto-6-55.json",
  "Super Lotto 6/49": "super-lotto-6-49.json",
  "Mega Lotto 6/45": "mega-lotto-6-45.json",
  "Lotto 6/42": "lotto-6-42.json",
};

export default function handler(req, res) {
  try {
    const { game } = req.query;

    if (!game) {
      return res.status(400).json({ error: "Missing required param: game" });
    }

    const fileName = GAME_FILES[game];
    if (!fileName) {
      return res.status(400).json({ error: `Unknown game: ${game}` });
    }

    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `No data file found for ${game}` });
    }

    const results = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (!results.length) {
      return res.status(404).json({ error: `No results available for ${game}` });
    }

    // total draws
    const draws = results.length;

    // latest result (files are stored newest-first in your updater)
    const latest = results[0];

    // frequency count
    const freqMap = {};
    results.forEach(r => {
      r.numbers.forEach(num => {
        freqMap[num] = (freqMap[num] || 0) + 1;
      });
    });

    // convert to array and sort by frequency
    const freqArray = Object.entries(freqMap).map(([number, count]) => ({
      number,
      count,
      percentage: ((count / draws) * 100).toFixed(1) // one decimal place
    }));

    freqArray.sort((a, b) => b.count - a.count);

    // take top 6 as hot numbers
    const hotNumbers = freqArray.slice(0, 6);

    return res.status(200).json({
      game,
      draws,
      latest,
      hotNumbers,
    });
  } catch (err) {
    console.error("Stats API error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
