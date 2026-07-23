/* ============================================================
   华大教育 · DNA 双螺旋粒子背景动画（轻量 Canvas，无第三方库）
   用法：
     <canvas id="dna"></canvas>
   脚本会按 canvas 父容器的实际尺寸自适应铺满，
   因此既可用于全屏登录背景，也可用于页头 hero 内部。
   尊重系统「减少动态」偏好（prefers-reduced-motion）。
   ============================================================ */
(function () {
  const canvas = document.getElementById('dna');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  let helices = [];
  let t = 0;

  // 华大品牌色：基因蓝 / 生命绿
  const COL_BLUE  = [26, 107, 159];   // #1A6B9F
  const COL_GREEN = [76, 175, 80];    // #4CAF50

  function lerpColor(a, b, k, alpha) {
    const r  = Math.round(a[0] + (b[0] - a[0]) * k);
    const g  = Math.round(a[1] + (b[1] - a[1]) * k);
    const bl = Math.round(a[2] + (b[2] - a[2]) * k);
    return `rgba(${r},${g},${bl},${alpha})`;
  }

  function makeHelix(x, opts) {
    return {
      x: x,
      amp: opts.amp,
      wavelength: opts.wavelength,
      speed: opts.speed,
      phase: opts.phase,
      nodeGap: opts.nodeGap,
      alpha: opts.alpha,
      radius: opts.radius
    };
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = Math.max(Math.round(rect.width), 1);
    H = Math.max(Math.round(rect.height), 1);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // 螺旋带数量随宽度自适应，保持轻盈
    const count = W > 1600 ? 5 : (W > 1100 ? 4 : 3);
    helices = [];
    for (let i = 0; i < count; i++) {
      const xRatio = (i + 0.5) / count;
      helices.push(makeHelix(W * xRatio, {
        amp: 34 + Math.random() * 26,
        wavelength: 150 + Math.random() * 70,
        speed: (0.10 + Math.random() * 0.10) * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        nodeGap: 26,
        alpha: (canvas.dataset.intensity ? parseFloat(canvas.dataset.intensity) : 0.18) + Math.random() * 0.10,
        radius: 2.0 + Math.random() * 1.2
      }));
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.4);

    for (const h of helices) {
      const k = Math.PI * 2 / h.wavelength;
      let prevA = null, prevB = null;

      for (let y = -30, idx = 0; y < H + 30; y += h.nodeGap, idx++) {
        const angle = k * y + h.phase + t * h.speed;
        const offA = Math.sin(angle) * h.amp;
        const offB = Math.sin(angle + Math.PI) * h.amp;
        const xA = h.x + offA;
        const xB = h.x + offB;

        const depthA = (Math.sin(angle) + 1) / 2;
        const depthB = (Math.sin(angle + Math.PI) + 1) / 2;
        const colK = (Math.sin(angle * 0.5 + t * 0.2) + 1) / 2;
        const baseAlpha = h.alpha * breathe;

        // 碱基对连线（两股之间）
        ctx.strokeStyle = lerpColor(COL_BLUE, COL_GREEN, colK, baseAlpha * 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xA, y);
        ctx.lineTo(xB, y);
        ctx.stroke();

        // 股 A 节点
        ctx.fillStyle = lerpColor(COL_BLUE, COL_GREEN, colK, baseAlpha * (0.5 + depthA));
        ctx.beginPath();
        ctx.arc(xA, y, h.radius * (0.6 + depthA * 0.7), 0, Math.PI * 2);
        ctx.fill();

        // 股 B 节点
        ctx.fillStyle = lerpColor(COL_GREEN, COL_BLUE, colK, baseAlpha * (0.5 + depthB));
        ctx.beginPath();
        ctx.arc(xB, y, h.radius * (0.6 + depthB * 0.7), 0, Math.PI * 2);
        ctx.fill();

        // 沿股连成细骨架线
        ctx.strokeStyle = lerpColor(COL_BLUE, COL_GREEN, colK, baseAlpha * 0.5);
        if (prevA) { ctx.beginPath(); ctx.moveTo(prevA.x, prevA.y); ctx.lineTo(xA, y); ctx.stroke(); }
        if (prevB) { ctx.beginPath(); ctx.moveTo(prevB.x, prevB.y); ctx.lineTo(xB, y); ctx.stroke(); }
        prevA = { x: xA, y }; prevB = { x: xB, y };
      }
    }
  }

  let rafId = null;
  let running = false;

  function loop() {
    t += 0.016;
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (running || reduceMotion) return;
    running = true;
    loop();
  }

  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // 标签页隐藏时暂停动画，避免后台空耗 CPU / 电量；回到前台再恢复
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  }
  resize();

  if (reduceMotion) {
    draw();                 // 静态渲染一帧
  } else {
    startLoop();
  }
})();
