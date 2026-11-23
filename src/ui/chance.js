// Şans animasyonları: klasik Yu-Gi-Oh! yazı-tura (Milenyum Gözü / Piramit) ve altın zar.
(function () {
  const UI = (window.UI = window.UI || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const EYE = `<svg viewBox="0 0 100 100"><defs><radialGradient id="cg1" cx="38%" cy="30%"><stop offset="0" stop-color="#fff3b8"/><stop offset=".55" stop-color="#f2c04a"/><stop offset="1" stop-color="#a8731a"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#cg1)" stroke="#7a4f10" stroke-width="2"/><circle cx="50" cy="50" r="40" fill="none" stroke="#8a5a14" stroke-width="2"/>
    <path d="M14 50 Q50 18 86 50 Q50 82 14 50Z" fill="#fff6d6" stroke="#5a3a08" stroke-width="3"/><circle cx="50" cy="50" r="12" fill="#3a2a6a" stroke="#1a1030" stroke-width="2"/><circle cx="54" cy="46" r="3.5" fill="#fff"/>
    <path d="M50 62 V80 M50 80 Q44 86 38 84" fill="none" stroke="#5a3a08" stroke-width="3"/><path d="M36 38 L22 28 M64 38 L78 28" fill="none" stroke="#5a3a08" stroke-width="3"/></svg>`;
  const PYR = `<svg viewBox="0 0 100 100"><defs><radialGradient id="cg2" cx="38%" cy="30%"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#e0a93a"/><stop offset="1" stop-color="#8f5d12"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#cg2)" stroke="#7a4f10" stroke-width="2"/><circle cx="50" cy="50" r="40" fill="none" stroke="#8a5a14" stroke-width="2"/>
    <path d="M50 20 L82 74 H18Z" fill="#f6d57a" stroke="#5a3a08" stroke-width="3"/><path d="M50 20 L50 74 M34 47 H66" stroke="#5a3a08" stroke-width="2" fill="none"/><circle cx="50" cy="56" r="7" fill="#3a2a6a" stroke="#1a1030" stroke-width="2"/></svg>`;

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (n, cls) => `<div class="dface ${cls}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'pip' : ''}"></i>`).join('')}</div>`;
  const ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] }; // [rotX, rotY]

  /**
   * kind: 'coin' | 'dice'; results: coin için boolean[] (true = Yazı/Heads), dice için 1-6 sayıları
   * who: 'Sen' / rakip adı
   */
  UI.chanceFx = async function (kind, results, who) {
    const k = UI.speedFactor || 1;
    const wrap = document.createElement('div');
    wrap.className = 'ch-wrap';
    const items = results.map((r, i) => kind === 'coin'
      ? `<div class="ch-slot"><div class="coin" style="--end:${r ? 0 : 180}deg;--delay:${i * 0.18}s"><div class="coin-f heads">${EYE}</div><div class="coin-f tails">${PYR}</div></div><div class="ch-res">${r ? 'YAZI' : 'TURA'}<small>${r ? 'Heads' : 'Tails'}</small></div></div>`
      : `<div class="ch-slot"><div class="dscene"><div class="die" style="--rx:${ROT[r][0] + 720}deg;--ry:${ROT[r][1] + 720}deg;--delay:${i * 0.18}s">${face(1, 'f1')}${face(6, 'f6')}${face(3, 'f3')}${face(4, 'f4')}${face(2, 'f2')}${face(5, 'f5')}</div></div><div class="ch-res">${r}</div></div>`);
    wrap.innerHTML = `<div class="ch-box"><div class="ch-title">${UI.esc(who || '')} · ${kind === 'coin' ? 'Yazı-Tura' : 'Zar'}</div><div class="ch-row">${items.join('')}</div></div>`;
    document.body.appendChild(wrap);
    wrap.style.setProperty('--chk', k);
    let skip = false; wrap.onclick = () => { skip = true; };
    UI.sfx && UI.sfx('click');
    requestAnimationFrame(() => wrap.classList.add('go'));
    const total = (1300 + results.length * 180) * k;
    for (let t = 0; t < total && !skip; t += 50) await sleep(50);
    wrap.classList.add('show');
    UI.sfx && UI.sfx(kind === 'coin' ? 'reveal' : 'summon', 'R');
    for (let t = 0; t < 900 * k && !skip; t += 50) await sleep(50);
    wrap.classList.add('out');
    await sleep(220);
    wrap.remove();
  };
})();
