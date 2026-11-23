// Paket açılış animasyonu: paket belirir, titrer, üst kenarı tırtıklı bir çizgiden yırtılıp uçar, içeriden ışık patlar.
(function () {
  const UI = (window.UI = window.UI || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Tırtıklı yırtık çizgisi: x boyunca zikzak. Dönüş: [üst parça clip-path, gövde clip-path]
  function tearPaths(y = 10) {
    const pts = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) pts.push([(i / steps) * 100, y + (i % 2 ? 1 : -1) * (0.6 + Math.random() * 1.6)]);
    const line = pts.map(p => `${p[0].toFixed(1)}% ${p[1].toFixed(1)}%`);
    const top = `polygon(0 0, 100% 0, ${[...line].reverse().join(', ')})`;
    const body = `polygon(${line.join(', ')}, 100% 100%, 0 100%)`;
    return [top, body, y];
  }

  /**
   * @param {object} tp  THEME_PACKS girdisi (art alanı)
   * @param {number} n   açılan paket sayısı (n>1: arkada yığın görünür)
   * Dokunma/tıklama animasyonu atlar.
   */
  UI.packTear = async function (tp, n = 1) {
    const k = UI.speedFactor || 1;
    let skip = false;
    const wait = ms => (skip ? Promise.resolve() : sleep(ms * k));
    const [topClip, bodyClip, ty] = tearPaths(10);
    const wrap = document.createElement('div');
    wrap.className = 'pt-wrap';
    const stack = n > 1 ? `<div class="pt-ghost g1"><img src="${tp.art}" alt="" draggable="false"></div><div class="pt-ghost g2"><img src="${tp.art}" alt="" draggable="false"></div>` : '';
    wrap.innerHTML = `<div class="pt-dark"></div>
      <div class="pt-stage">${stack}
        <div class="pt-pack">
          <div class="pt-beam" style="top:${ty}%"></div>
          <div class="pt-body" style="clip-path:${bodyClip}"><img src="${tp.art}" alt="" draggable="false"></div>
          <div class="pt-top" style="clip-path:${topClip}"><img src="${tp.art}" alt="" draggable="false"></div>
          <div class="pt-spark"></div>
        </div>
      </div>
      <div class="pt-flash"></div>${n > 1 ? `<div class="pt-count">× ${n}</div>` : ''}`;
    wrap.onclick = () => { skip = true; };
    document.body.appendChild(wrap);

    requestAnimationFrame(() => wrap.classList.add('s1'));        // paket belirir
    await wait(520);
    wrap.classList.add('s2');                                      // titreme
    UI.sfx('click');
    await wait(520);
    wrap.classList.add('s3');                                      // yırtılma
    UI.sfx('pack');
    setTimeout(() => UI.sfx('reveal', 'SR'), 120 * k);
    await wait(700);
    wrap.classList.add('s4');                                      // ışık patlar, paket söner
    await wait(420);
    wrap.classList.add('s5');
    await wait(260);
    wrap.remove();
  };
})();
