(function () {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  let W, H;
  let mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  window.addEventListener("mousemove", (e) => {
    mouse.targetX = (e.clientX - W / 2);
    mouse.targetY = (e.clientY - H / 2);
  });

  function drawQuantumGrid() {
    ctx.clearRect(0, 0, W, H);
    
    // Smooth mouse easing
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    const spacing = 50;
    const cols = Math.ceil(W / spacing) + 4;
    const rows = Math.ceil(H / spacing) + 4;
    
    ctx.strokeStyle = "rgba(0, 251, 251, 0.04)";
    ctx.lineWidth = 1;

    for (let i = -2; i < cols; i++) {
      ctx.beginPath();
      for (let j = -2; j < rows; j++) {
        let x = i * spacing;
        let y = j * spacing;

        // Distort based on mouse
        const dx = x - (W / 2 + mouse.x);
        const dy = y - (H / 2 + mouse.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = Math.max(0, (400 - dist) / 400);
        
        const offsetX = dx * force * 0.15;
        const offsetY = dy * force * 0.15;

        if (j === -2) ctx.moveTo(x + offsetX, y + offsetY);
        else ctx.lineTo(x + offsetX, y + offsetY);
      }
      ctx.stroke();
    }

    for (let j = -2; j < rows; j++) {
      ctx.beginPath();
      for (let i = -2; i < cols; i++) {
        let x = i * spacing;
        let y = j * spacing;

        const dx = x - (W / 2 + mouse.x);
        const dy = y - (H / 2 + mouse.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = Math.max(0, (400 - dist) / 400);
        
        const offsetX = dx * force * 0.15;
        const offsetY = dy * force * 0.15;

        if (i === -2) ctx.moveTo(x + offsetX, y + offsetY);
        else ctx.lineTo(x + offsetX, y + offsetY);
      }
      ctx.stroke();
    }

    // Add cinematic blobs (reduced/subtle)
    const bloomX = W/2 + mouse.x * 0.2;
    const bloomY = H/2 + mouse.y * 0.2;
    const grad = ctx.createRadialGradient(bloomX, bloomY, 0, bloomX, bloomY, 600);
    grad.addColorStop(0, "rgba(99, 102, 241, 0.05)");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    requestAnimationFrame(drawQuantumGrid);
  }

  resize();
  drawQuantumGrid();
  window.addEventListener("resize", resize);
})();

// Micro-interactions & Tilt Logic
document.addEventListener('DOMContentLoaded', () => {
  // Magnetic Buttons
  document.querySelectorAll('.btn-primary, .chip').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });

  // 3D Reveal Observer
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => {
              e.target.classList.add("visible");
            }, i * 100);
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal, .card, .panel").forEach((el) => {
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  // Header state
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // Ticker
  const tickerEl = document.getElementById("stockTicker");
  if (tickerEl) {
    const tickers = ["NIFTY50", "AAPL", "MSFT", "NVDA", "BTC", "ETH"];
    let idx = 0;
    setInterval(() => {
      tickerEl.style.opacity = "0";
      tickerEl.style.transform = "translateY(-10px)";
      setTimeout(() => {
        idx = (idx + 1) % tickers.length;
        tickerEl.textContent = tickers[idx];
        tickerEl.style.opacity = "1";
        tickerEl.style.transform = "translateY(0)";
      }, 400);
    }, 4000);
  }
});

// Mini Chart Animation
(function () {
  const canvas = document.getElementById("miniChart");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const points = [];
  const MAX_PTS = 60;

  function seed() {
    let v = 50;
    for (let i = 0; i < MAX_PTS; i++) {
      v += (Math.random() - 0.48) * 4;
      v = Math.max(10, Math.min(90, v));
      points.push(v);
    }
  }

  function draw() {
    const W = canvas.offsetWidth || 300;
    canvas.width = W;
    canvas.height = 60;
    ctx.clearRect(0, 0, W, 60);
    const step = W / (points.length - 1);
    const minV = Math.min(...points);
    const maxV = Math.max(...points);
    const range = maxV - minV || 1;
    const toY = (v) => 4 + (1 - (v - minV) / range) * 52;

    ctx.beginPath();
    points.forEach((v, i) => {
      if (i === 0) ctx.moveTo(0, toY(v));
      else ctx.lineTo(i * step, toY(v));
    });
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "rgba(99, 102, 241, 0.4)"); 
    grad.addColorStop(1, "rgba(0, 251, 251, 0.7)"); 
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    const lx = (points.length - 1) * step;
    const ly = toY(points[points.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#00fbfb";
    ctx.fill();
  }

  function tick() {
    let last = points[points.length - 1];
    last += (Math.random() - 0.48) * 4;
    last = Math.max(10, Math.min(90, last));
    points.push(last);
    if (points.length > MAX_PTS) points.shift();
    draw();
    setTimeout(tick, 300);
  }

  seed();
  draw();
  tick();
  window.addEventListener("resize", draw);
})();
