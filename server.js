const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TD_KEY = process.env.TWELVEDATA_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const cache = { prices: {}, indicators: {} };

async function tdFetch(endpoint) {
  const fetch = (await import('node-fetch')).default;
  const url = `https://api.twelvedata.com/${endpoint}&apikey=${TD_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.code && d.code !== 200) throw new Error(d.message || `Error ${d.code}`);
  return d;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.get('/api/price/:symbol', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    const d = await tdFetch(`price?symbol=${encodeURIComponent(sym)}`);
    res.json({ symbol: sym, price: parseFloat(d.price), time: Date.now() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    res.json(await tdFetch(`quote?symbol=${encodeURIComponent(sym)}`));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/candles/:symbol/:interval', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    res.json(await tdFetch(`time_series?symbol=${encodeURIComponent(sym)}&interval=${req.params.interval}&outputsize=200`));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/indicators/:symbol', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    const enc = encodeURIComponent(sym);
    const ma20 = await tdFetch(`ma?symbol=${enc}&interval=4h&time_period=20&outputsize=1`);
    await sleep(400);
    const ma50 = await tdFetch(`ma?symbol=${enc}&interval=4h&time_period=50&outputsize=1`);
    await sleep(400);
    const ma200 = await tdFetch(`ma?symbol=${enc}&interval=1day&time_period=200&outputsize=1`);
    await sleep(400);
    const rsi = await tdFetch(`rsi?symbol=${enc}&interval=4h&time_period=14&outputsize=1`);
    res.json({
      ma20: ma20.values?.[0] ? parseFloat(ma20.values[0].ma) : null,
      ma50: ma50.values?.[0] ? parseFloat(ma50.values[0].ma) : null,
      ma200: ma200.values?.[0] ? parseFloat(ma200.values[0].ma) : null,
      rsi: rsi.values?.[0] ? parseFloat(rsi.values[0].rsi) : null,
      symbol: sym, time: Date.now(),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur L'Ascension sur port ${PORT}`);
  console.log(`🔑 TwelveData: ${TD_KEY ? 'OK' : 'MANQUANTE'}`);
});
