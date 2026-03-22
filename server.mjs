import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import YahooFinance from "yahoo-finance2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const yahooFinance = new YahooFinance();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function formatDay(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/** Map Yahoo chart quotes to Alpha-Vantage-shaped JSON for the existing frontend parser. */
function quotesToTimeSeriesDaily(quotes) {
  const valid = (quotes || []).filter((q) => q != null && q.close != null && !Number.isNaN(Number(q.close)));
  valid.sort((a, b) => new Date(b.date) - new Date(a.date));
  const ts = {};
  for (const q of valid) {
    const day = formatDay(q.date);
    const c = Number(q.close);
    const o = q.open != null ? Number(q.open) : c;
    const h = q.high != null ? Number(q.high) : c;
    const l = q.low != null ? Number(q.low) : c;
    const v = q.volume != null ? Number(q.volume) : 0;
    ts[day] = {
      "1. open": String(o),
      "2. high": String(h),
      "3. low": String(l),
      "4. close": String(c),
      "5. volume": String(v),
    };
  }
  return ts;
}

async function handleYahooTimeSeries(symbol, res) {
  const period1 = new Date(Date.now() - 86400000 * 800);
  const period2 = new Date();
  try {
    const result = await yahooFinance.chart(symbol.trim(), {
      period1,
      period2,
      interval: "1d",
    });
    const ts = quotesToTimeSeriesDaily(result.quotes);
    const keys = Object.keys(ts);
    if (keys.length < 30) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not enough history or unknown symbol", symbol }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ "Time Series (Daily)": ts, Meta: { symbol } }));
  } catch (e) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e), symbol }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/time-series") {
    const symbol = url.searchParams.get("symbol");
    if (!symbol || !symbol.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing symbol" }));
      return;
    }
    await handleYahooTimeSeries(symbol, res);
    return;
  }

  let filePath = path.join(__dirname, decodeURIComponent(url.pathname));
  if (url.pathname === "/") filePath = path.join(__dirname, "index.html");

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    sendFile(res, filePath);
  });
});

server.listen(PORT, () => {
  console.log(`FuzzyStock · Yahoo Finance API at http://localhost:${PORT}`);
  console.log(`Open that URL in your browser (data requires this local server).`);
});
