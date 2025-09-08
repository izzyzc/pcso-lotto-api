// api/result.js
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
    const { game, date } = req.query;

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

    let result;
    if (date) {
      // Specific date requested
      result = results.find(r => r.date === date);
      if (!result) {
        return res.status(404).json({
          error: `No result found for ${game} on ${date}`,
        });
      }
    } else {
      // No date → latest draw (last entry in array)
      result = results[results.length - 1];
    }

    return res.status(200).json({
      game,
      ...result,
    });
  } catch (err) {
    console.error("Result API error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
