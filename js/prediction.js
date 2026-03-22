let chartInstance = null;

function calculateRSI(prices, period) {
  if (prices.length < period + 1) return 50;
  const slice = prices.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateSMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) sum += prices[i];
  return sum / period;
}

function emaSeries(prices, span) {
  if (!prices.length) return [];
  const k = 2 / (span + 1);
  const out = new Array(prices.length);
  out[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    out[i] = prices[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function macdFromPrices(prices) {
  const e12 = emaSeries(prices, 12);
  const e26 = emaSeries(prices, 26);
  const macdLine = prices.map((_, i) => e12[i] - e26[i]);
  const signal = emaSeries(macdLine, 9);
  const last = prices.length - 1;
  const histogram = macdLine[last] - signal[last];
  return { histogram, macd: macdLine[last], signal: signal[last] };
}

function bollingerPctB(prices, period) {
  if (prices.length < period) return 0.5;
  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, v) => a + (v - sma) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + 2 * std;
  const lower = sma - 2 * std;
  const last = prices[prices.length - 1];
  if (upper === lower) return 0.5;
  return (last - lower) / (upper - lower);
}

function rocPercent(prices, lookback) {
  if (prices.length <= lookback) return 0;
  const oldP = prices[prices.length - 1 - lookback];
  const newP = prices[prices.length - 1];
  return ((newP - oldP) / oldP) * 100;
}

/**
 * Hybrid fuzzy-style ensemble: RSI, MACD histogram, Bollinger %B, SMA trend, ROC.
 * Confidence reflects indicator agreement (signal alignment), not guaranteed future accuracy.
 */
function runHybridFuzzy(closePrices) {
  const rsi = calculateRSI(closePrices, 14);
  const sma20 = calculateSMA(closePrices, 20);
  const sma50 = calculateSMA(closePrices, 50);
  const { histogram } = macdFromPrices(closePrices);
  const pctB = bollingerPctB(closePrices, 20);
  const roc = rocPercent(closePrices, 10);
  const price = closePrices[closePrices.length - 1];

  const indicators = [];

  let rsiDir = 0;
  let rsiStr = 0;
  if (rsi < 32) {
    rsiDir = 1;
    rsiStr = Math.min(1, (32 - rsi) / 32);
  } else if (rsi > 68) {
    rsiDir = -1;
    rsiStr = Math.min(1, (rsi - 68) / 32);
  } else {
    rsiDir = rsi >= 50 ? 1 : -1;
    rsiStr = Math.min(1, Math.abs(rsi - 50) / 18);
  }
  indicators.push({ name: "RSI (14)", weight: 1.1, direction: rsiDir, strength: rsiStr });

  const macdDir = histogram >= 0 ? 1 : -1;
  const macdStr = Math.min(1, Math.abs(histogram) / (Math.abs(price) * 0.0015 + 1e-9));
  indicators.push({ name: "MACD vs signal", weight: 1.25, direction: macdDir, strength: macdStr });

  let bbDir = 0;
  const bbStr = Math.min(1, Math.abs(0.5 - pctB) * 2);
  if (pctB < 0.28) bbDir = 1;
  else if (pctB > 0.72) bbDir = -1;
  else bbDir = pctB < 0.5 ? 1 : -1;
  indicators.push({ name: "Bollinger %B", weight: 0.95, direction: bbDir, strength: bbStr });

  const trendDir = sma20 >= sma50 ? 1 : -1;
  const trendStr = Math.min(1, Math.abs(sma20 - sma50) / (sma50 * 0.02 + 1e-9));
  indicators.push({ name: "SMA 20 / 50", weight: 1.05, direction: trendDir, strength: trendStr });

  const rocDir = roc >= 0 ? 1 : -1;
  const rocStr = Math.min(1, Math.abs(roc) / 6);
  indicators.push({ name: "ROC (10d)", weight: 0.9, direction: rocDir, strength: rocStr });

  let num = 0;
  let den = 0;
  for (const ind of indicators) {
    const contrib = ind.direction * ind.weight * (0.45 + 0.55 * ind.strength);
    num += contrib;
    den += ind.weight;
  }
  const composite = den ? num / den : 0;
  const isBuy = composite >= 0;

  let agree = 0;
  let active = 0;
  for (const ind of indicators) {
    if (ind.direction === 0) continue;
    active++;
    if ((isBuy && ind.direction > 0) || (!isBuy && ind.direction < 0)) agree++;
  }
  const agreementRatio = active ? agree / active : 0;
  const mag = Math.min(1, Math.abs(composite));

  let confidence = 54 + agreementRatio * 36 + mag * 10;
  if (agree >= 4 && active >= 4) confidence += 3;
  confidence = Math.min(96, Math.max(51, confidence));

  return {
    isBuy,
    confidence: confidence.toFixed(1),
    rsi,
    macdHist: histogram,
    pctB,
    sma20,
    sma50,
    roc,
    composite,
    indicators,
    agreementRatio,
    agree,
    active,
  };
}

/**
 * Daily OHLC from the local server (Yahoo Finance via yahoo-finance2).
 * Open the site at http://localhost:3000 after `npm start` — opening HTML as file:// will not work.
 */
async function fetchTimeSeriesDaily(ticker) {
  let r;
  try {
    r = await fetch(`/api/time-series?symbol=${encodeURIComponent(ticker)}`);
  } catch {
    throw new Error("SERVER_OFFLINE");
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("SERVER_ERROR");
  }
  if (!r.ok) {
    if (data && data.error) throw new Error("INVALID_TICKER");
    throw new Error("SERVER_ERROR");
  }
  if (data["Time Series (Daily)"]) return data["Time Series (Daily)"];
  throw new Error("INVALID_TICKER");
}

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function renderChart(isBuy, dates, prices) {
  const el = document.getElementById("predictionChart");
  if (!el) return;
  const ctx = el.getContext("2d");
  destroyChart();
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates.map((d) => d.slice(5)),
      datasets: [
        {
          label: "Close",
          data: prices,
          borderColor: isBuy ? "#34d399" : "#f87171",
          backgroundColor: isBuy ? "rgba(52, 211, 153, 0.08)" : "rgba(248, 113, 113, 0.08)",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          backgroundColor: "rgba(10, 14, 18, 0.92)",
          titleColor: "#f4f1ea",
          bodyColor: "#5ee7df",
          borderColor: "rgba(212, 175, 106, 0.25)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { maxTicksLimit: 8, color: "rgba(139,146,163,0.8)" },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { color: "rgba(139,146,163,0.8)" },
        },
      },
      interaction: { mode: "nearest", axis: "x", intersect: false },
    },
  });
}

function formatPrice(n) {
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function getRationale(model) {
  const bullish = model.indicators.filter((i) => i.direction > 0).length;
  const bearish = model.indicators.filter((i) => i.direction < 0).length;
  const top = model.indicators.sort((a, b) => b.strength * b.weight - a.strength * a.weight)[0];

  let text = `The ensemble is ${model.isBuy ? "Bullish" : "Bearish"} with **${
    model.confidence
  }% confidence**. `;
  text += `Primary driver: **${top.name}** showing strong ${
    top.direction > 0 ? "upside" : "downside"
  } pressure. `;
  text += `Alignment: **${bullish} indicators** point up, **${bearish} indicators** point down. `;

  if (model.rsi < 30) text += "RSI indicates oversold conditions (potential reversal). ";
  if (model.rsi > 70) text += "RSI indicates overbought conditions (caution). ";
  if (model.agreementRatio > 0.8) text += "Strong technical convergence detected.";

  return text;
}

function buildResultHTML(stock, price, changePct, model, dates, prices) {
  const up = parseFloat(changePct) >= 0;
  const sig = model.isBuy ? "BUY" : "SELL";
  const indRows = model.indicators
    .map(
      (i) =>
        `<li>
          <span class="quant-label">${i.name}</span>
          <strong class="${i.direction > 0 ? "up" : "down"}">${
          i.direction > 0 ? "BULLISH" : i.direction < 0 ? "BEARISH" : "NEUTRAL"
        }</strong>
        </li>`
    )
    .join("");

  // Ticker to Icon Mapping
  const iconMap = {
    'AAPL': '<i class="fab fa-apple"></i>',
    'MSFT': '<i class="fab fa-microsoft"></i>',
    'NVDA': '<i class="fas fa-microchip"></i>',
    'GOOGL': '<i class="fab fa-google"></i>',
    'META': '<i class="fab fa-facebook"></i>',
    'AMZN': '<i class="fab fa-amazon"></i>',
    'NFLX': '<i class="fas fa-play"></i>',
    'TSLA': '<i class="fas fa-car"></i>',
    'ADBE': '<i class="fas fa-file-pdf"></i>',
    'PYPL': '<i class="fab fa-paypal"></i>'
  };

  const tickerIcon = iconMap[stock.toUpperCase()] || '<i class="fas fa-chart-line"></i>';
  const trendColor = up ? "var(--green)" : "var(--red)";
  const trendIcon = up ? "▲" : "▼";
  const diff = `${Math.abs(changePct)}%`;

  return `
    <div class="result-header">
      <div style="display:flex; align-items:center">
        <div class="stock-icon-lg">${tickerIcon}</div>
        <div>
          <h1 class="gradient-text" style="font-size:2.5rem; margin-bottom:4px">${stock.toUpperCase()}</h1>
          <p class="quant-label">REAL-TIME ANALYSIS</p>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:2.25rem; font-family:var(--font-display); font-weight:600">$${formatPrice(price)}</div>
        <div style="color:${trendColor}; font-weight:500; font-size:1.1rem">
          ${trendIcon} ${diff}
        </div>
      </div>
    </div>

    <div class="result-grid">
      <div class="metric glass glow-${model.isBuy ? "cyan" : "gold"}">
        <div class="quant-label">AI Signal</div>
        <div class="metric-value ${model.isBuy ? "up" : "down"}" style="font-size:1.5rem; letter-spacing:0.05em;">${sig}</div>
      </div>
      <div class="metric glass">
        <div class="quant-label">Confidence</div>
        <div class="metric-value blue">${model.confidence}%</div>
      </div>
      <div class="metric glass">
        <div class="quant-label">Convergence</div>
        <div class="metric-value blue">${model.agree}/${model.active}</div>
      </div>
      <div class="metric glass">
        <div class="quant-label">RSI (14)</div>
        <div class="metric-value ${model.rsi >= 50 ? "up" : "down"}">${model.rsi.toFixed(1)}</div>
      </div>
    </div>

    <div class="panel glass" style="margin-top:1.5rem; padding: 1.5rem;">
      <div class="quant-label" style="margin-bottom:1rem;">Trading Rationale</div>
      <p style="font-size:0.95rem; line-height:1.6; color:var(--text);">${getRationale(model)}</p>
    </div>

    <div class="chart-wrap" style="margin-top:1.5rem; background:rgba(0,0,0,0.4);"><canvas id="predictionChart"></canvas></div>

    <div class="panel glass" style="margin-top:1.5rem; padding: 1.5rem;">
      <div class="quant-label" style="margin-bottom:1rem;">Technical Composition</div>
      <ul class="indicator-list">${indRows}</ul>
    </div>

    <p class="disclaimer" style="margin-top:2rem; font-style: italic;">
      Educational exploration only. Markets involve risk. Composite score: ${model.composite.toFixed(4)}.
    </p>
  `;
}

async function runPrediction(stock, container) {
  container.innerHTML = `
    <div class="loading-wrap">
      <div class="pulse-ring"></div>
      <div class="loading-text">Analyzing ${stock}</div>
      <p style="color:var(--muted); font-size:0.8rem; margin-top:8px;">Running ensemble models...</p>
    </div>`;

  try {
    const timeSeries = await fetchTimeSeriesDaily(stock);
    const dates = Object.keys(timeSeries).slice(0, 100).reverse();
    const closePrices = dates.map((d) => parseFloat(timeSeries[d]["4. close"]));
    if (closePrices.some((x) => Number.isNaN(x))) throw new Error("INVALID_DATA");

    const currentPrice = closePrices[closePrices.length - 1];
    const prevPrice = closePrices[closePrices.length - 2];
    const changePct = (((currentPrice - prevPrice) / prevPrice) * 100).toFixed(2);

    const model = runHybridFuzzy(closePrices);
    container.innerHTML = buildResultHTML(stock, currentPrice, changePct, model, dates, closePrices);
    renderChart(model.isBuy, dates, closePrices);
  } catch (err) {
    destroyChart();
    if (err.message === "SERVER_OFFLINE" || err.message === "SERVER_ERROR") {
      container.innerHTML = `
        <p style="color:var(--muted); margin-bottom:1rem;">Price data is loaded through the local dev server (Yahoo Finance). From the project folder run:</p>
        <pre style="background:rgba(0,0,0,0.35); border:1px solid var(--stroke-soft); border-radius:12px; padding:14px; font-family:var(--font-mono); font-size:0.82rem; color:var(--cyan); overflow:auto">npm start</pre>
        <p style="color:var(--muted); margin-top:1rem;">Then open <strong style="color:var(--text)">http://localhost:3000</strong> (not a raw <code>file://</code> path). See <a href="api.html" style="color:var(--gold)">Setup</a> for details.</p>`;
    } else {
      container.innerHTML = `<p style="color:var(--muted)">Could not load <strong>${stock}</strong>. Use a valid Yahoo Finance symbol (e.g. AAPL, MSFT, or exchange suffix like <code style="color:var(--cyan)">RELIANCE.NS</code> for India).</p>`;
    }
  }
}

function wirePredictPage() {
  const container = document.getElementById("predictionResults");
  const input = document.getElementById("stockInput");
  const btn = document.getElementById("predictBtn");
  if (!container || !input || !btn) return;

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      input.value = chip.dataset.ticker;
      runPrediction(chip.dataset.ticker, container);
    });
  });

  btn.addEventListener("click", () => {
    const s = input.value.trim();
    if (!s) {
      input.style.outline = "2px solid var(--red)";
      input.focus();
      setTimeout(() => {
        input.style.outline = "";
      }, 1200);
      return;
    }
    runPrediction(s, container);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btn.click();
  });
}

function wireHomeModal() {
  const overlay = document.getElementById("modalOverlay");
  const body = document.getElementById("modalBody");
  const closeBtn = document.getElementById("modalClose");
  if (!overlay || !body) return;

  const openFor = (stock) => {
    overlay.classList.add("active");
    runPrediction(stock, body);
  };

  const predictBtn = document.getElementById("predictBtn");
  const stockInput = document.getElementById("stockInput");
  if (predictBtn && stockInput) {
    predictBtn.addEventListener("click", () => {
      const s = stockInput.value.trim();
      if (!s) {
        stockInput.style.outline = "2px solid var(--red)";
        stockInput.focus();
        setTimeout(() => {
          stockInput.style.outline = "";
        }, 1200);
        return;
      }
      openFor(s);
    });
    stockInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") predictBtn.click();
    });
  }

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      if (stockInput) stockInput.value = chip.dataset.ticker;
      openFor(chip.dataset.ticker);
    });
  });

  if (closeBtn)
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("active");
      destroyChart();
    });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("active");
      destroyChart();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("predictionResults")) wirePredictPage();
  if (document.getElementById("modalBody")) wireHomeModal();
});
