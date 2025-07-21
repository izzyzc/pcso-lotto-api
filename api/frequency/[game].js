import { readFileSync } from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { game } = req.query;
  const filePath = path.resolve('./data', `${game}.json`);
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    res.status(200).json(data.frequency || {});
  } catch {
    res.status(404).json({ error: 'Game not found' });
  }
}