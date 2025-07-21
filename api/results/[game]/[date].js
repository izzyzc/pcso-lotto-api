import { readFileSync } from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { game, date } = req.query;
  const filePath = path.resolve('./data', `${game}.json`);
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    const match = data.history.find(entry => entry.date === date);
    res.status(200).json(match || {});
  } catch {
    res.status(404).json({ error: 'Game or date not found' });
  }
}