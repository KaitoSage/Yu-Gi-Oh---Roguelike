// Overframe kart çağırma sinematiği: ekran kararır, kartın paketi yükselir, sarı yıldırımlar düşer,
// paket patlar, kart parlayarak belirir ve çağrıldığı bölgeye süzülerek oturur.
(function () {
  const UI = (window.UI = window.UI || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const NS = 'http://www.w3.org/2000/svg';

  // Merkeze doğru çatallanan yıldırım çizgileri (SVG)
  function makeBolts(n) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 600'); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('lg-bolts');
    const cx = 500, cy = 300;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, R = 620;
      let x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R * 0.62;
      const tx = cx + (Math.random() - 0.5) * 110, ty = cy + (Math.random() - 0.5) * 90;
      const pts = [[x, y]], seg = 9;
      for (let s = 1; s <= seg; s++) {
        const k = s / seg;
        pts.push([x + (tx - x) * k + (Math.random() - 0.5) * 90 * (1 - k * 0.6), y + (ty - y) * k + (Math.random() - 0.5) * 70 * (1 - k * 0.6)]);
      }
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M' + pts.map(p => p[0].toFixed(0) + ' ' + p[1].toFixed(0)).join(' L'));
      path.setAttribute('pathLength', '1');
      path.style.strokeWidth = (2 + Math.random() * 4.5).toFixed(1);
      path.style.animationDelay = (i * 55) + 'ms';
      svg.appendChild(path);
    }
    return svg;
  }

  /**
   * @param {object} card     düello kart örneği (d.of olan)
   * @param {Element} zoneEl  çağrıldığı bölgedeki .card öğesi (animasyon boyunca gizlenir)
   * Akış: ekran kararır, altın çerçeve → sarı yıldırımlar → kart parlayarak belirir (adı altında) → bölgesine süzülür → altın halka.
   */
  UI.legendSummon = async function (card, zoneEl) {
    if (UI._lgDuel !== UI.currentDuel) { UI._lgDuel = UI.currentDuel; UI._lgSeen = new Set(); }
    const quick = UI._lgSeen.has(card.d.id); // aynı kart bu düelloda daha önce çağrıldıysa kısa sürüm
    UI._lgSeen.add(card.d.id);
    const k = (UI.speedFactor || 1) * (quick ? 0.55 : 1);

    const wrap = document.createElement('div');
    wrap.className = 'lg-wrap';
    wrap.innerHTML = `<div class="lg-dark"></div><div class="lg-frame"></div><div class="lg-flash"></div>
      <div class="lg-title">${UI.esc(card.d.name)}</div><div class="lg-slot"></div>`;
    document.body.appendChild(wrap);
    if (zoneEl) zoneEl.style.visibility = 'hidden';

    // 1) ekran kararır, altın çerçeve belirir
    requestAnimationFrame(() => wrap.classList.add('s1'));
    UI.sfx('pack');
    await sleep(300 * k);
    wrap.classList.add('s2');
    await sleep((quick ? 200 : 380) * k);
    // 2) sarı yıldırımlar
    const bolts = makeBolts(quick ? 9 : 16);
    wrap.appendChild(bolts);
    wrap.classList.add('s3');
    UI.sfx('trap'); setTimeout(() => UI.sfx('fusion'), 160 * k);
    await sleep((quick ? 360 : 600) * k);
    // 3) kart parlayarak belirir
    const big = UI.cardEl(card, { size: 'big', pos: 'atk', finish: 4, noTag: true });
    big.classList.remove('def'); big.classList.add('fx-on');
    const slot = wrap.querySelector('.lg-slot');
    slot.appendChild(big);
    wrap.classList.add('s4');
    UI.sfx('reveal', 'PR');
    await sleep((quick ? 520 : 900) * k);
    // 4) kart bölgesine süzülür
    if (zoneEl) {
      const zr = zoneEl.getBoundingClientRect(), br = big.getBoundingClientRect();
      const dx = (zr.left + zr.width / 2) - (br.left + br.width / 2), dy = (zr.top + zr.height / 2) - (br.top + br.height / 2);
      const sc = zr.width / br.width;
      slot.style.transition = `transform ${0.5 * k}s cubic-bezier(.5,0,.2,1)`;
      slot.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
      wrap.classList.add('s5');
      await sleep(520 * k);
      zoneEl.style.visibility = '';
      zoneEl.classList.add('summon-in', 'lg-land');
      setTimeout(() => zoneEl.classList.remove('lg-land'), 900);
    }
    wrap.classList.add('s6');
    await sleep(240 * k);
    wrap.remove();
  };})();
