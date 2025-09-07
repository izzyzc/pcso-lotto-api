// api/frequency.js
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

export default async function handler(req, res) {
  try {
    const { game, limit } = req.query;
    const fileName = GAME_FILES[game];
    if (!fileName) {
      return res.status(400).json({ error: "Unknown game: " + game });
    }

    const filePath = path.join(DATA_DIR, fileName);
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

    // Convert to sorted array
    const freqArray = Object.entries(freqMap).map(([number, count]) => ({
      number,
      count,
    }));

    freqArray.sort((a, b) => b.count - a.count);

    let mostFrequent, leastFrequent;

    if (limit) {
      const n = parseInt(limit);
      mostFrequent = freqArray.slice(0, n);
      leastFrequent = freqArray.slice(-n);
    } else {
      mostFrequent = freqArray.slice(0, 10);   // default top 10
      leastFrequent = freqArray.slice(-10);    // default bottom 10
    }

    return res.status(200).json({
      game,
      draws: results.length,
      mostFrequent,
      leastFrequent,
      allFrequencies: freqArray // full list if needed
    });
  } catch (err) {
    console.error("Frequency error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
