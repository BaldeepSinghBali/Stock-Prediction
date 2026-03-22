import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

function formatDay(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

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

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: "Missing symbol" });
  }

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
      return res.status(404).json({ error: "Not enough history or unknown symbol", symbol });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ "Time Series (Daily)": ts, Meta: { symbol } });
  } catch (e) {
    return res.status(404).json({ error: String(e.message || e), symbol });
  }
}
