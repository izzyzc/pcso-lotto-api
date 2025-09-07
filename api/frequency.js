import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { game, limit } = req.query;

    if (!game) {
      return res.status(400).json({ error: "Missing game parameter" });
    }

    // Map game name to file
    const fileMap = {
      "Ultra Lotto 6/58": "ultra-658.json",
      "Grand Lotto 6/55": "grand-655.json",
      "Super Lotto 6/49": "super-649.json",
      "Mega Lotto 6/45": "mega-645.json",
      "Lotto 6/42": "lotto-642.json"
    };

    const filename = fileMap[game];
    if (!filename) {
      return res.status(400).json({ error: "Unsupported game" });
    }

    const filePath = path.join(process.cwd(), "data", filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    let results = JSON.parse(raw);

    // Sort by date descending
    results = results.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply limit
    const limitedResults = limit ? results.slice(0, Number(limit)) : results;

    // Count frequencies
    const freq = {};
    limitedResults.forEach(draw => {
      draw.numbers.forEach(num => {
        freq[num] = (freq[num] || 0) + 1;
      });
    });

    // Sort by frequency
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1]);

    const mostFrequent = sorted.slice(0, 6).map(([num]) => num);
    const leastFrequent = sorted.slice(-6).map(([num]) => num);

    return res.status(200).json({
      game,
      limit: limit ? Number(limit) : results.length,
      mostFrequent,
      leastFrequent,
      frequencyTable: freq
    });

  } catch (err) {
    console.error("Frequency error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
