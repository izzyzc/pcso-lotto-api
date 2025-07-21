const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.lottopcso.com/';

const GAMES = {
  '6-42': '6/42 Lotto',
  '6-45': '6/45 Mega Lotto',
  '6-49': '6/49 Super Lotto',
  '6-55': '6/55 Grand Lotto',
  '6-58': '6/58 Ultra Lotto',
  '4d': '4D Lotto',
  '3d': 'Swertres',
  '2d': 'EZ2'
};

function updateJsonFile(game, result) {
  const filePath = path.resolve(__dirname, `../data/${game}.json`);
  let json = { latest: {}, history: [], frequency: {} };

  if (fs.existsSync(filePath)) {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  json.latest = result;
  json.history.unshift(result);

  result.numbers.forEach(n => {
    json.frequency[n] = (json.frequency[n] || 0) + 1;
  });

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
}

function parseNumberList(text) {
  return text
    .replace(/[^0-9-]/g, '')
    .split('-')
    .map(s => s.trim())
    .filter(Boolean);
}

async function scrape() {
  const { data } = await axios.get(BASE_URL);
  const $ = cheerio.load(data);

  const today = new Date().toISOString().split('T')[0];

  // 🎯 Jackpot Games
  $('table:contains("Jackpot Games") tbody tr').each((_, row) => {
    const tds = $(row).find('td');
    const gameName = $(tds[0]).text().trim();
    const gameKey = Object.keys(GAMES).find(key => GAMES[key] === gameName);
    if (!gameKey) return;

    const date = $(tds[1]).text().trim();
    const numbers = parseNumberList($(tds[2]).text());
    const jackpot = $(tds[3]).text().trim();
    const winners = $(tds[4]).text().trim();

    updateJsonFile(gameKey, { date, numbers, jackpot, winners });
  });

  // 🎯 4D Lotto (single 6-digit number)
  $('.results-card:contains("4D") .draw-result').each((_, el) => {
    const text = $(el).text().trim().replace(/[^0-9]/g, '');
    if (text.length >= 4) {
      const numbers = text.split('');
      updateJsonFile('4d', { date: today, numbers, jackpot: '—', winners: '—' });
    }
  });

  // 🎯 Swertres (3D)
  $('.results-card:contains("Swertres")').each((_, el) => {
    const time = $(el).find('h5').text().trim();
    const draw = $(el).find('.draw-result').text().trim();
    const numbers = draw.split('-').map(n => n.trim());
    if (numbers.length === 3) {
      updateJsonFile('3d', { date: today, numbers, jackpot: '—', winners: time });
    }
  });

  // 🎯 EZ2 (2D)
  $('.results-card:contains("EZ2")').each((_, el) => {
    const time = $(el).find('h5').text().trim();
    const draw = $(el).find('.draw-result').text().trim();
    const numbers = draw.split('-').map(n => n.trim());
    if (numbers.length === 2) {
      updateJsonFile('2d', { date: today, numbers, jackpot: '—', winners: time });
    }
  });

  console.log('✅ Scraping complete.');
}

scrape().catch(console.error);
