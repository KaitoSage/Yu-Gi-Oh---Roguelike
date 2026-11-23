// Kart DOM üreticisi + foil (parlama) seviyeleri + nadirlik etiketi + eğim etkileşimi
(function () {
  const UI = (window.UI = window.UI || {});

  UI.imgUrl = id => (window.api ? window.api.imageUrl(id) : `../data/images/${id}.jpg`);
  UI.esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Foil seviyeleri: oyuncunun kartlarının görsel kalitesi (run içinde yükseltilir)
  UI.FINISH_CLASS = ['', 'r-R', 'r-SR', 'r-UR', 'r-PR'];
  UI.FINISH_NAME = ['Mat', 'Parlak (Glossy)', 'Holografik', 'Altın Overframe', 'Prizmatik'];
  UI.FINISH_COST = [60, 100, 160, 240]; // 0→1, 1→2, 2→3, 3→4
  UI.finish = new Map(); // kart id -> seviye (0..4); her run başında sıfırlanır
  UI.finishOf = id => UI.finish.get(id) || 0;

  // Arama kutusu: büyüteç simgesi; üzerine gelince / tıklayınca yazı alanı açılır, metin varsa açık kalır
  UI.searchBox = id => `<div class="sbox"><button type="button" class="sbtn" title="Ara" aria-label="Ara"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button><input id="${id}" class="inp" placeholder="Kart ara…" autocomplete="off"></div>`;
  UI.initSearch = root => root.querySelectorAll('.sbox').forEach(b => {
    const i = b.querySelector('input');
    const upd = () => b.classList.toggle('has', !!i.value);
    i.addEventListener('input', upd);
    b.querySelector('.sbtn').onclick = () => { b.classList.add('open'); i.focus(); };
    i.addEventListener('blur', () => { if (!i.value) b.classList.remove('open'); });
  });

  UI.rarTag = d => `(${d.rarity})`;
  UI.nm = d => `${d.name} ${UI.rarTag(d)}`;

  /**
   * @param {object} c  kart verisi veya düello kart örneği
   * @param {object} o  {size, down, pos, finish, noTag}
   */
  UI.cardEl = function (c, o = {}) {
    const d = c.d || c;
    const el = document.createElement('div');
    const pos = o.pos || (c.pos || 'atk');
    // Rakibin kartları mat; oyuncunun kartları kendi foil seviyesini taşır
    // Overframe kartlar (d.of = tam kart görseli) her zaman Prizmatik; diğerleri foil seviyesini taşır
    const fin = d.of ? 4 : (o.finish != null ? o.finish : (c.uid && c.owner === 1 ? 0 : UI.finishOf(d.id)));
    el.className = `card size-${o.size || 'field'} ${d.of ? 'r-OF' : UI.FINISH_CLASS[fin]}` + (o.down ? ' facedown' : '') + (pos === 'def' && o.size === 'field' ? ' def' : '');
    if (c.uid) el.dataset.uid = c.uid;
    if (o.down) {
      el.innerHTML = '<div class="card-inner"></div>';
    } else {
      el.dataset.id = d.id;
      const face = d.token ? `<div class="tokenface"><b>${UI.esc(d.name.replace(' Token', ''))}</b><span>TOKEN</span><i>${d.atk}/${d.def}</i></div>` : null;
      const art = face || `<img src="${d.of ? 'assets/overframe/' + d.of : UI.imgUrl(d.img)}" alt="${UI.esc(d.name)}" draggable="false" loading="lazy">`;
      el.innerHTML = `<div class="card-inner">${art}
        <div class="fx-holo"></div><div class="fx-shine"></div><div class="fx-spark"></div></div><div class="overframe"></div>`
        + (o.noTag ? '' : `<span class="rar rar-${d.rarity}">${UI.rarTag(d)}</span>`);
    }
    if (el.classList.contains('def')) el.style.transform = 'rotate(90deg)';
    return el;
  };

  // Kart arkası (deste yığınları için)
  UI.backEl = function (cls = '') {
    const el = document.createElement('div');
    el.className = 'cardback ' + cls;
    return el;
  };

  // Eğim + holografik ışık imleci takip eder
  document.addEventListener('mousemove', e => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card || card.classList.contains('facedown')) return;
    const r = card.getBoundingClientRect();
    const mx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const my = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    const inner = card.querySelector('.card-inner');
    if (!inner) return;
    card.style.setProperty('--mx', mx.toFixed(1));
    card.style.setProperty('--my', my.toFixed(1));
    inner.style.setProperty('--rx', ((50 - my) / 50 * 12).toFixed(1) + 'deg');
    inner.style.setProperty('--ry', ((mx - 50) / 50 * 12).toFixed(1) + 'deg');
  });
  document.addEventListener('mouseout', e => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const inner = card.querySelector('.card-inner');
    if (inner) { inner.style.setProperty('--rx', '0deg'); inner.style.setProperty('--ry', '0deg'); }
  });

  UI.toast = function (msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove('show'), 1800);
  };
  UI.sleep = ms => new Promise(r => setTimeout(r, ms));
  // back: Esc / geri tuşuyla çağrılacak fonksiyon (yoksa Esc bir şey yapmaz)
  UI.show = function (name, back) {
    UI.onBack = back || null;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  };
  UI.modalOpen = () => !document.getElementById('modal').classList.contains('hidden');

  // Evet / Hayır penceresi: Promise<boolean>
  UI.confirm = function (msg, yes = 'Evet', no = 'Hayır') {
    return new Promise(res => {
      const dlg = UI.modal(`<h3>${UI.esc(msg)}</h3><div style="display:flex;gap:10px;margin-top:14px"><button class="btn" id="cfy">${UI.esc(yes)}</button><button class="btn ghost" id="cfn" data-esc="1">${UI.esc(no)}</button></div>`);
      dlg.querySelector('#cfy').onclick = () => { UI.closeModal(); res(true); };
      dlg.querySelector('#cfn').onclick = () => { UI.closeModal(); res(false); };
    });
  };

  // Esc: açık pencerede [data-esc] düğmesi varsa onu tıkla; pencere yoksa ekranın geri fonksiyonunu çağır
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (UI.modalOpen()) {
      const b = document.querySelector('#modal [data-esc]');
      if (b) b.click();
      return;
    }
    if (UI.onBack) UI.onBack();
  });
  UI.modal = function (html) {
    const m = document.getElementById('modal');
    m.innerHTML = '<div class="dialog"></div>';
    const dlg = m.firstChild;
    if (typeof html === 'string') dlg.innerHTML = html; else dlg.appendChild(html);
    m.classList.remove('hidden');
    return dlg;
  };
  UI.closeModal = function () { document.getElementById('modal').classList.add('hidden'); };

  /**
   * Kart seçtirme penceresi. opts: {cancel, hidden: c=>bool (gizli kartlar sırt olarak gösterilir), viewOnly}
   * Promise<card|null>
   */
  UI.chooseCards = function (cards, title, opts = {}) {
    return new Promise(res => {
      const dlg = UI.modal(`<h3>${UI.esc(title)}</h3><div class="cardgrid"></div>`);
      const grid = dlg.querySelector('.cardgrid');
      for (const c of cards) {
        const hid = opts.hidden ? opts.hidden(c) : false;
        const el = UI.cardEl(c, { size: 'mid', pos: 'atk', down: hid });
        el.classList.remove('def'); el.style.transform = '';
        if (!opts.viewOnly) el.onclick = () => { UI.closeModal(); res(c); };
        grid.appendChild(el);
      }
      if (opts.cancel || opts.viewOnly) {
        const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = opts.viewOnly ? 'Kapat' : 'Vazgeç'; b.style.marginTop = '14px'; b.dataset.esc = '1';
        b.onclick = () => { UI.closeModal(); res(null); };
        dlg.appendChild(b);
      }
    });
  };

  // Ortada beliren aktivasyon kartı (büyü/tuzak/fusion)
  UI.cutin = async function (card, label, ms = 900) {
    const el = document.createElement('div');
    el.className = 'cutin';
    const c = UI.cardEl(card, { size: 'big', pos: 'atk', finish: Math.max(2, UI.finishOf((card.d || card).id)), noTag: false });
    c.classList.add('fx-on');
    el.appendChild(c);
    if (label) { const l = document.createElement('div'); l.className = 'cutin-label'; l.textContent = label; el.appendChild(l); }
    document.body.appendChild(el);
    await UI.sleep(ms);
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
})();
