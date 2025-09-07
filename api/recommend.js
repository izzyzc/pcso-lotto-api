// api/recommend.js
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

const GAME_FILES = {
  "Ultra Lotto 6/58": "ultra-658.json",
  "Grand Lotto 6/55": "grand-655.json",
  "Super Lotto 6/49": "super-649.json",
  "Mega Lotto 6/45": "mega-645.json",
  "Lotto 6/42": "lotto-642.json",
};

export default async function handler(req, res) {
  try {
    const { game } = req.query;
    const fileName = GAME_FILES[game];
    if (!fileName) {
      return res.status(400).json({ error: "Unknown game: " + game });
    }

    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "No data file found for " + game });
    }

    const results = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Count frequency
    const freqMap = {};
    results.forEach(draw => {
      draw.numbers.forEach(num => {
        freqMap[num] = (freqMap[num] || 0) + 1;
      });
    });

    // Sort by frequency
    const freqArray = Object.entries(freqMap).map(([number, count]) => ({
      number,
      count,
    }));
    freqArray.sort((a, b) => b.count - a.count);

    // Take top 6 numbers
    const recommended = freqArray.slice(0, 6).map(item => item.number);

    return res.status(200).json({
      game,
      draws: results.length,
      recommended, // top 6 numbers
    });
  } catch (err) {
    console.error("Recommend error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
