import { readdirSync, readFileSync } from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    const dataDir = path.resolve('./data');
    const files = readdirSync(dataDir);
    const results = {};
    files.forEach(file => {
      const content = JSON.parse(readFileSync(path.join(dataDir, file)));
      results[file.replace('.json', '')] = content.latest || {};
    });
    res.status(200).json(results);
  } catch {
    res.status(500).json({ error: 'Failed to load results' });
  }
}