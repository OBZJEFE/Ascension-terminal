const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TD_KEY = process.env.TWELVEDATA_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CACHE ──────────────────────────────────────────────────────
const cache = {
  prices: {},
  indicators: {},
  lastUpdate: {},
};

// ── TWELVEDATA FETCH ───────────────────────────────────────────
async function tdFetch(endpoint) {
  const url = `https://api.twelvedata.com/${endpoint}&apikey=${TD_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d.code && d.code !== 200) throw new Error(d.message || `Error ${d.code}`);
  return d;
}

// ── REST ENDPOINTS ─────────────────────────────────────────────

// Prix en temps réel
app.get('/api/price/:symbol', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    const d = await tdFetch(`price?symbol=${encodeURIComponent(sym)}`);
    cache.prices[sym] = { price: parseFloat(d.price), time: Date.now() };
    res.json({ symbol: sym, price: parseFloat(d.price), time: Date.now() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Quote complet
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    const d = await tdFetch(`quote?symbol=${encodeURIComponent(sym)}`);
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Time series (chandeliers)
app.get('/api/candles/:symbol/:interval', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    const interval = req.params.interval;
    const d = await tdFetch(`time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=200`);
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Indicateurs groupés (évite les appels multiples côté client)
app.get('/api/indicators/:symbol', async (req, res) => {
  try {
    const sym = decodeURIComponent(req.params.symbol);
    const enc = encodeURIComponent(sym);

    // Espacer les appels pour éviter le rate limit
    const [ma20, ma50, ma200, rsi] = await Promise.all([
      tdFetch(`ma?symbol=${enc}&interval=4h&time_period=20&outputsize=1`),
      tdFetch(`ma?symbol=${enc}&interval=4h&time_period=50&outputsize=1`),
      tdFetch(`ma?symbol=${enc}&interval=1day&time_period=200&outputsize=1`),
      tdFetch(`rsi?symbol=${enc}&interval=4h&time_period=14&outputsize=1`),
    ]);

    const result = {
      ma20:  ma20.values?.[0]  ? parseFloat(ma20.values[0].ma)   : null,
      ma50:  ma50.values?.[0]  ? parseFloat(ma50.values[0].ma)   : null,
      ma200: ma200.values?.[0] ? parseFloat(ma200.values[0].ma)  : null,
      rsi:   rsi.values?.[0]   ? parseFloat(rsi.values[0].rsi)   : null,
      symbol: sym,
      time: Date.now(),
    };

    cache.indicators[sym] = result;
    cache.lastUpdate[sym] = Date.now();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── HTTP SERVER ────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✅ Serveur L'Ascension démarré sur port ${PORT}`);
  startPriceFeed();
});

// ── WEBSOCKET SERVER ───────────────────────────────────────────
const wss = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🔌 Client connecté');
  clients.add(ws);

  // Envoyer le cache immédiatement
  if (Object.keys(cache.prices).length) {
    ws.send(JSON.stringify({ type: 'prices', data: cache.prices }));
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log('🔌 Client déconnecté');
  });

  ws.on('error', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch(e) {}
    }
  });
}

// ── PRICE FEED ─────────────────────────────────────────────────
let tdWs = null;

function startPriceFeed() {
  if (!TD_KEY) {
    console.log('⚠️ TWELVEDATA_KEY manquante — polling toutes les 30s');
    startPolling();
    return;
  }

  console.log('📡 Connexion WebSocket TwelveData...');
  startPolling();
}

function connectTwelveDataWS() {
  try {
    tdWs = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${TD_KEY}`);

    tdWs.on('open', () => {
      console.log('✅ WebSocket TwelveData connecté');
      tdWs.send(JSON.stringify({
        action: 'subscribe',
        params: { symbols: 'XAU/USD,BTC/USD' }
      }));

      // Heartbeat toutes les 10s
      setInterval(() => {
        if (tdWs.readyState === WebSocket.OPEN) {
          tdWs.send(JSON.stringify({ action: 'heartbeat' }));
        }
      }, 10000);
    });

    tdWs.on('message', (raw) => {
      try {
        const d = JSON.parse(raw.toString());
        if (d.event !== 'price') return;
        const price = parseFloat(d.price);
        if (isNaN(price)) return;

        const sym = d.symbol;
        const prev = cache.prices[sym]?.price || null;
        const diff = prev ? price - prev : 0;
        const pct  = prev ? (diff / prev * 100) : 0;

        cache.prices[sym] = { price, diff, pct, time: Date.now() };
        broadcast({ type: 'price', symbol: sym, price, diff, pct, time: Date.now() });
      } catch(e) {}
    });

    tdWs.on('error', (e) => {
      console.log('⚠️ WS Error:', e.message);
    });

    tdWs.on('close', () => {
      console.log('🔄 WS TwelveData fermé — reconnexion dans 5s');
      setTimeout(connectTwelveDataWS, 5000);
    });

  } catch(e) {
    console.log('❌ WS Error:', e.message);
    setTimeout(connectTwelveDataWS, 5000);
  }
}

function startPolling() {
  const symbols = ['XAU/USD', 'BTC/USD'];
  let idx = 0;

  async function pollNext() {
    const sym = symbols[idx % symbols.length];
    idx++;
    try {
      const d = await tdFetch(`price?symbol=${encodeURIComponent(sym)}`);
      const price = parseFloat(d.price);
      const prev = cache.prices[sym]?.price || null;
      const diff = prev ? price - prev : 0;
      const pct  = prev ? (diff / prev * 100) : 0;
      cache.prices[sym] = { price, diff, pct, time: Date.now() };
      broadcast({ type: 'price', symbol: sym, price, diff, pct, time: Date.now() });
    } catch(e) {}
    setTimeout(pollNext, 15000);
  }

  pollNext();
}
