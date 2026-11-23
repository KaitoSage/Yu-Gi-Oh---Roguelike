// Kalıcı ilerleme: Star Chip (★) bakiyesi, kart koleksiyonu, Card Shop (temalı paketler), Card Collection ekranı,
// run başında koleksiyondan kart getirme.
(function () {
  const UI = (window.UI = window.UI || {});
  const { esc, cardEl } = UI;
  const $ = id => document.getElementById(id);

  const KEY = 'ygo_meta_v1';
  const MAX_COPIES = 3;        // koleksiyonda tutulabilecek kopya
  const DUP_REFUND = 20;       // fazla kopya → ★
  const RUN_PICK_MAX = 10;     // run başında koleksiyondan getirilebilecek kart sayısı
  const START_CHIPS = 800;

  const data = { chips: START_CHIPS, cards: {}, opened: 0 };
  try { Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
  const owned = id => data.cards[id] || 0;
  const unique = () => Object.keys(data.cards).filter(k => data.cards[k] > 0).length;
  const total = () => Object.values(data.cards).reduce((a, b) => a + b, 0);

  // Koleksiyona kart ekle. Dönüş: 'new' | 'dup' | 'refund'
  function add(id) {
    const n = owned(id);
    if (n >= MAX_COPIES) { data.chips += DUP_REFUND; save(); return 'refund'; }
    data.cards[id] = n + 1; save();
    return n === 0 ? 'new' : 'dup';
  }
  UI.meta = { data, save, owned, unique, total, add, MAX_COPIES, RUN_PICK_MAX, earn(n) { data.chips += n; save(); } };

  const cardsAll = () => [...UI.db.values()];
  const supportOf = c => { const fx = YGO.FX[c.name]; return c.kind === 'monster' && c.type === 'Normal Monster' ? 'normal' : !fx ? 'none' : fx.partial ? 'partial' : 'full'; };
  UI.effectStatus = supportOf;
  const STATUS_TXT = { normal: '', full: '<span style="color:#7fe08a">✓ Efekt kodlandı</span>', partial: '<span style="color:#f2c04a">◐ Efekt kısmen kodlandı (ana efekt çalışır)</span>', none: '<span style="color:#e57b7b">✗ Efekt henüz kodlanmadı (oyunda çıkmaz)</span>' };

  // Kart detay penceresi (katalog / koleksiyon ortak)
  UI.showCard = function (c, fin = 0) {
    const ban = c.ban ? `<div style="color:#ff9a9a;margin-bottom:6px">⚠ ${esc(YGO.Decks.BAN_TR[c.ban] || c.ban)} (güncel TCG listesi)</div>` : '';
    const dlg = UI.modal(`<div style="display:flex;gap:22px;align-items:flex-start"><div id="cbig"></div><div style="max-width:340px"><h3>${esc(UI.nm(c))}</h3>
      <div style="color:#9a93c8;margin-bottom:8px">${c.kind === 'monster' ? `${esc(c.attr)} · ${esc(c.race)} · Lv${c.level} · ATK ${c.atk} / DEF ${c.def}` : esc(c.race)} · ${esc(c.type)}</div>
      ${ban}<div style="font-size:13px;line-height:1.5;user-select:text">${esc(c.desc)}</div>
      <div style="margin-top:8px;font-size:12px">${STATUS_TXT[supportOf(c)]}</div>
      <div style="margin-top:6px;color:#9a93c8;font-size:12px">${c.packs && c.packs.length ? 'Paketler: ' + c.packs.join(', ') : ''}</div>
      <button class="btn ghost" id="cclose" data-esc="1" style="margin-top:14px">Kapat</button></div></div>`);
    const big = cardEl(c, { size: 'big', finish: fin, noTag: true }); big.classList.remove('def'); big.classList.add('fx-on');
    dlg.querySelector('#cbig').appendChild(big);
    dlg.querySelector('#cclose').onclick = UI.closeModal;
  };

  const sortFn = (a, b) => a.kind.localeCompare(b.kind) || (b.atk || 0) - (a.atk || 0) || a.name.localeCompare(b.name);
  const banTag = c => (c.ban ? `<span class="bantag">${c.ban === 'Limited' ? '1' : c.ban === 'Semi-Limited' ? '2' : '1'}</span>` : '');

  // ---------------------------------------------------------- Card Shop (★ ile temalı paketler)
  const BUNDLE_N = 10, BUNDLE_OFF = 0.85; // 10'lu paket %15 indirimli
  const bundlePrice = tp => Math.floor(tp.price * BUNDLE_N * BUNDLE_OFF / 50) * 50;
  const RANK_ORDER = { PR: 0, UR: 1, SR: 2, R: 3, N: 4 };
  const RANKS = ['N', 'R', 'SR', 'UR', 'PR'];

  UI.cardShop = function () {
    const el = $('screen-cshop');
    const T = YGO.Decks.THEME_PACKS;
    el.innerHTML = `<div class="catwrap">
      <div class="hud"><b style="font-size:18px" lang="en">Card Shop</b><div>★ <b id="cs-chips">${data.chips}</b> Star Chip</div><div>📚 Koleksiyon: <b>${unique()}</b> kart</div>
        <div class="grow"></div><button class="btn ghost" id="cs-cat">📖 Kart Kataloğu</button><button class="btn ghost" id="cs-col">🗂 Card Collection</button><button class="btn ghost" id="cs-back">← Geri</button></div>
      <div class="catnote">Bir pakete tıkla: içinden çıkabilecek tüm kartları gör ve satın al. Star Chip kazanmak için run oyna: her düello zaferi +40★, Bölüm zaferi +300★. Aynı karttan 3'ten fazlası ${DUP_REFUND}★'a çevrilir.</div>
      <div class="packshelf" id="cs-shelf"></div></div>`;
    const shelf = $('cs-shelf');
    for (const [key, tp] of Object.entries(T)) {
      const tpool = YGO.Decks.themePackPool(UI.cards, key);
      const have = tpool.all.filter(c => owned(c.id) > 0).length;
      const b = document.createElement('div'); b.className = 'tpwrap';
      b.innerHTML = `<div class="tpack"><img src="${tp.art}" alt="${esc(tp.name)}" draggable="false"><div class="tp-shine"></div></div>
        <div class="tp-sub">${esc(key === 'duel' ? '(' + tp.sub + ')' : tp.sub)}</div>
        <div class="tp-meta">${tpool.all.length} farklı kart · sende ${have}</div><div class="tp-price">★ ${tp.price}</div>`;
      b.onclick = () => { UI.sfx('click'); UI.packDetail(key); };
      shelf.appendChild(b);
    }
    $('cs-cat').onclick = () => { UI.sfx('click'); UI.catalogScreen(() => UI.cardShop()); };
    $('cs-col').onclick = () => { UI.sfx('click'); UI.collection(() => UI.cardShop()); };
    $('cs-back').onclick = () => { UI.sfx('click'); UI.mainMenu(); };
    UI.show('cshop', () => UI.mainMenu());
  };

  // Paket ayrıntısı: solda küçük paket, sağda satın alma düğmeleri, altta pakette çıkabilecek tüm kartlar
  UI.packDetail = function (key) {
    const el = $('screen-cshop');
    const tp = YGO.Decks.THEME_PACKS[key];
    const pool = YGO.Decks.themePackPool(UI.cards, key).all.slice().sort((a, b) => (RANK_ORDER[a.rarity] ?? 9) - (RANK_ORDER[b.rarity] ?? 9) || sortFn(a, b));
    const legend = new Set(tp.legend || []);
    const bp = bundlePrice(tp), saved = tp.price * BUNDLE_N - bp;
    const st = { q: '', only: false };
    el.innerHTML = `<div class="catwrap">
      <div class="hud"><button class="btn ghost" id="pd-back">← Geri</button><b style="font-size:18px" lang="en">Card Shop</b><div>★ <b id="pd-chips">${data.chips}</b> Star Chip</div>
        <div class="grow"></div>${UI.searchBox('pd-q')}<label style="font-size:13px"><input type="checkbox" id="pd-only"> Sadece sahip olduklarım</label><span id="pd-count" style="color:#9a93c8"></span></div>
      <div class="pdhead">
        <div class="tpack small"><img src="${tp.art}" alt="${esc(tp.name)}" draggable="false"><div class="tp-shine"></div></div>
        <div class="pdinfo"><h2 lang="en">${esc(tp.name)}</h2><div class="pdsub">${esc(key === 'duel' ? '(' + tp.sub + ')' : tp.sub)}</div>
          <div class="pdmeta">${pool.length} farklı kart · her pakette 5 kart · son kart SR veya üstü${legend.size ? ` · <span style="color:#ffe27a">✦ %3 Overframe şansı</span>` : ''}</div>
          <div class="pdmeta">Sende: <b id="pd-have"></b> / ${pool.length}</div></div>
        <div class="pdbuy"><button class="btn big pdb" id="pd-b1"><span>1 Paket</span><b>★ ${tp.price}</b></button>
          <button class="btn big pdb" id="pd-b10"><span>${BUNDLE_N} Paket</span><b>★ ${bp}</b><small>%${Math.round((1 - BUNDLE_OFF) * 100)} indirim · ★${saved} tasarruf</small></button></div>
      </div>
      <div class="catgrid" id="pd-grid"></div></div>`;
    UI.initSearch(el);
    const grid = $('pd-grid');
    const draw = () => {
      grid.innerHTML = '';
      $('pd-have').textContent = pool.filter(c => owned(c.id) > 0).length;
      const list = pool.filter(c => (!st.q || c.name.toLowerCase().includes(st.q)) && (!st.only || owned(c.id) > 0));
      list.forEach(c => {
        const w = document.createElement('div'); w.className = 'catcard' + (owned(c.id) ? '' : ' unowned');
        const e = cardEl(c, { size: 'mid', finish: 0 }); e.classList.remove('def'); e.onclick = () => UI.showCard(c);
        const l = document.createElement('div'); l.className = 'catname'; l.innerHTML = `${esc(c.name)} <b>${owned(c.id) ? '×' + owned(c.id) : ''}</b>${legend.has(c.name) ? ' <span style="color:#ffe27a">✦</span>' : ''}${banTag(c)}`;
        w.append(e, l); grid.appendChild(w);
      });
      $('pd-count').textContent = `${list.length} kart`;
      if (!list.length) grid.innerHTML = '<div style="padding:30px;color:#9a93c8">Eşleşen kart yok.</div>';
    };
    const buy = n => {
      const cost = n === 1 ? tp.price : bp;
      if (data.chips < cost) return UI.toast('Yetersiz Star Chip');
      data.chips -= cost; data.opened += n; save(); UI.sfx('pack');
      openThemePack(key, n, () => UI.packDetail(key));
    };
    $('pd-b1').onclick = () => buy(1);
    $('pd-b10').onclick = () => buy(BUNDLE_N);
    $('pd-q').oninput = e => { st.q = e.target.value.trim().toLowerCase(); draw(); };
    $('pd-only').onchange = e => { st.only = e.target.checked; draw(); };
    $('pd-back').onclick = () => { UI.sfx('click'); UI.cardShop(); };
    draw();
    UI.show('cshop', () => UI.cardShop());
  };

  // n paket aç (1 veya 10): kartlar hemen koleksiyona eklenir
  // Kapalı kartlarda da görünen rarity parlaması: SR mavi, UR altın, PR gökkuşağı, Overframe sarı-beyaz "shining"
  const glowOf = c => (c.of ? 'OF' : (c.rarity === 'SR' || c.rarity === 'UR' || c.rarity === 'PR') ? c.rarity : '');

  async function openThemePack(key, n, done) {
    const tp = YGO.Decks.THEME_PACKS[key];
    const out = [];
    for (let i = 0; i < n; i++) out.push(...YGO.Decks.openThemePack(UI.cards, key));
    const results = out.map(c => ({ c, r: add(c.id) })); // hemen koleksiyona
    await UI.packTear(tp, n); // yırtılma animasyonu
    const flipped = new Set();
    const many = out.length > 5;
    const dlg = UI.modal(`<h3 lang="en" style="display:flex;align-items:center;justify-content:center;gap:12px"><img src="${tp.art}" alt="" style="height:52px;border-radius:4px;box-shadow:0 2px 8px #000a">${esc(tp.name)}${n > 1 ? ` <small style="color:#9a93c8">× ${n} paket</small>` : ''}</h3><div class="packcards${many ? ' many' : ''}"></div>
      <div id="packmsg" style="margin:12px 0;color:#9a93c8;text-align:center">Kartlara tıkla.</div>
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn ghost" id="revall">Hepsini Çevir</button><button class="btn" id="packdone" data-esc="1">Tamam</button></div>`);
    const row = dlg.querySelector('.packcards');
    const size = many ? 'mid' : 'big';
    const slots = out.map((c, i) => {
      const g = glowOf(c);
      const s = document.createElement('div'); s.className = 'packslot' + (g ? ' g-' + g : ''); s.appendChild(UI.backEl(size));
      s.onclick = () => flip(i); row.appendChild(s); return s;
    });
    function flip(i) {
      if (flipped.has(i)) return;
      flipped.add(i);
      const { c, r } = results[i], s = slots[i];
      s.innerHTML = '';
      const e = cardEl(c, { size, finish: Math.max(0, RANKS.indexOf(c.rarity) - 1) }); e.classList.remove('def'); e.classList.add('reveal', 'fx-on');
      s.appendChild(e);
      const lab = document.createElement('div'); lab.className = 'packlabel';
      lab.innerHTML = `${esc(c.name)} ${UI.rarTag(c)}<br><b style="color:${r === 'new' ? '#7fe08a' : r === 'refund' ? '#f2c04a' : '#9a93c8'}">${r === 'new' ? '✦ YENİ' : r === 'dup' ? `×${owned(c.id)}` : `+${DUP_REFUND}★ (fazla kopya)`}</b>`;
      s.appendChild(lab);
      UI.sfx('reveal', c.rarity);
      const news = results.filter((x, k) => flipped.has(k) && x.r === 'new').length;
      $('packmsg').textContent = flipped.size === out.length ? `Kartların koleksiyonuna eklendi.${n > 1 ? ` (${results.filter(x => x.r === 'new').length} yeni kart)` : ''}` : `${flipped.size}/${out.length} kart çevrildi${n > 1 ? ` · ${news} yeni` : ''}`;
    }
    dlg.querySelector('#revall').onclick = () => out.forEach((_, i) => flip(i));
    dlg.querySelector('#packdone').onclick = () => { UI.sfx('buy'); UI.closeModal(); done(); };
  }
  // ---------------------------------------------------------- Card Collection
  UI.collection = function (back) {
    back = back || (() => UI.mainMenu());
    const el = $('screen-collection');
    const st = { q: '', kind: 'all', only: true };
    el.innerHTML = `<div class="catwrap">
      <div class="hud"><b style="font-size:18px" lang="en">Card Collection</b>
        ${UI.searchBox('co-q')}
        <select id="co-kind" class="inp"><option value="all">Hepsi</option><option value="monster">Canavar</option><option value="spell">Büyü</option><option value="trap">Tuzak</option><option value="extra">Fusion</option></select>
        <label style="font-size:13px"><input type="checkbox" id="co-only" checked> Sadece sahip olduklarım</label>
        <div class="grow"></div><span id="co-count" style="color:#9a93c8"></span><button class="btn ghost" id="co-back">← Geri</button></div>
      <div class="catnote">Kalıcı koleksiyonun: run sonunda kartlar eklenir, paketlerden gelir. Yeni run'a başlarken buradan <b>en fazla ${RUN_PICK_MAX} kart</b> getirebilirsin. Sınırlı/Yasaklı liste desteye uygulanır.</div>
      <div class="catgrid" id="co-grid"></div></div>`;
    UI.initSearch(el);
    const grid = $('co-grid');
    const draw = () => {
      grid.innerHTML = '';
      let list = cardsAll().filter(c => !(c.type === 'Normal Monster' && false));
      list = list.filter(c => (!st.only || owned(c.id) > 0) && (!st.q || c.name.toLowerCase().includes(st.q))
        && (st.kind === 'all' || (st.kind === 'extra' ? c.type === 'Fusion Monster' : c.kind === st.kind)));
      // yalnızca oyunda oynanabilir kartlar (yasaklı olanlar dahil sahip olunmuşsa gösterilir)
      list = list.filter(c => owned(c.id) > 0 || YGO.Decks.isPlayable(c)).sort(sortFn).slice(0, 400);
      list.forEach(c => {
        const w = document.createElement('div'); w.className = 'catcard' + (owned(c.id) ? '' : ' unowned');
        const e = cardEl(c, { size: 'mid', finish: 0 }); e.classList.remove('def'); e.onclick = () => UI.showCard(c);
        const l = document.createElement('div'); l.className = 'catname'; l.innerHTML = `${esc(c.name)} <b>${owned(c.id) ? '×' + owned(c.id) : ''}</b>${banTag(c)}`;
        w.append(e, l); grid.appendChild(w);
      });
      $('co-count').textContent = `${unique()} farklı · ${total()} kart`;
      if (!list.length) grid.innerHTML = '<div style="padding:30px;color:#9a93c8">Henüz koleksiyonunda kart yok. Bir run bitir ya da Card Shop\'tan paket aç.</div>';
    };
    $('co-q').oninput = e => { st.q = e.target.value.trim().toLowerCase(); draw(); };
    $('co-kind').onchange = e => { st.kind = e.target.value; draw(); };
    $('co-only').onchange = e => { st.only = e.target.checked; draw(); };
    $('co-back').onclick = () => { UI.sfx('click'); back(); };
    draw();
    UI.show('collection', back);
  };

  // ---------------------------------------------------------- Run başı: koleksiyondan kart getir
  // base: {main:id[], extra:id[]} (draft/hazır deste). Dönüş: Promise<{main,extra}|null> (null = geri)
  // opts: {limit (en fazla kaç kart; varsayılan 10), preselect {id:adet}, title, confirmLabel, skipLabel}
  UI.pickFromCollection = function (base, opts = {}) {
    return new Promise(res => {
      const el = $('screen-collection');
      const DECK_MAX = UI.DECK_MAX, EXTRA_MAX = UI.EXTRA_MAX;
      const LIMIT = Math.max(0, opts.limit != null ? opts.limit : RUN_PICK_MAX);
      const sel = Object.assign({}, opts.preselect || {}); // id -> adet
      const selCount = () => Object.values(sel).reduce((a, b) => a + b, 0);
      const inDeck = id => base.main.filter(i => i === id).length + base.extra.filter(i => i === id).length + (sel[id] || 0);
      const isExtra = c => c.type === 'Fusion Monster';
      const mainSel = () => Object.entries(sel).filter(([id]) => !isExtra(UI.db.get(+id))).reduce((s, [, n]) => s + n, 0);
      const extraSel = () => selCount() - mainSel();
      const counted = () => (opts.limit != null ? mainSel() : selCount()); // draft'ta yalnızca ana deste kartları 20'ye sayılır
      const st = { q: '', kind: 'all' };
      el.innerHTML = `<div class="catwrap">
        <div class="hud"><b style="font-size:18px">${esc(opts.title || 'Koleksiyondan kart getir')}</b><div id="pk-info"></div>
          ${UI.searchBox('pk-q')}
          <select id="pk-kind" class="inp"><option value="all">Hepsi</option><option value="monster">Canavar</option><option value="spell">Büyü</option><option value="trap">Tuzak</option><option value="extra">Fusion</option></select>
          <div class="grow"></div><button class="btn ghost" id="pk-back">← Geri</button>${opts.skipLabel === '' ? '' : `<button class="btn ghost" id="pk-skip">${esc(opts.skipLabel || 'Kart getirmeden başla')}</button>`}<button class="btn big" id="pk-go">${esc(opts.confirmLabel || "Run'a Başla")}</button></div>
        <div class="catnote">Kalıcı koleksiyonundan en fazla <b>${LIMIT}</b> kart seç${opts.limit != null ? ' (rastgele seçtiklerinle birlikte başlangıç destesi 20 kartı geçemez; Fusion kartları Extra Deck\'e gider)' : ` (deste ${base.main.length}/${DECK_MAX})`}. Kopya sınırı: Yasaklı/Sınırlı 1 · Yarı Sınırlı 2 · diğerleri 3. Sağ tık: seçimi geri al.</div>
        <div class="catgrid" id="pk-grid"></div></div>`;
      const info = () => { $('pk-info').innerHTML = `Seçilen: <b>${counted()}</b>/${LIMIT} · Deste: <b>${base.main.length + mainSel()}</b>/${DECK_MAX}`; };
      UI.initSearch(el);
      const grid = $('pk-grid');
      const draw = () => {
        grid.innerHTML = '';
        const list = cardsAll().filter(c => owned(c.id) > 0 && (!st.q || c.name.toLowerCase().includes(st.q))
          && (st.kind === 'all' || (st.kind === 'extra' ? isExtra(c) : c.kind === st.kind))).sort(sortFn);
        list.forEach(c => {
          const lim = YGO.Decks.copyLimit(c);
          const w = document.createElement('div'); w.className = 'catcard' + (lim === 0 ? ' unowned' : '');
          const e = cardEl(c, { size: 'mid', finish: 0 }); e.classList.remove('def');
          const badge = document.createElement('div'); badge.className = 'pickbadge'; badge.style.display = sel[c.id] ? 'block' : 'none'; badge.textContent = '×' + (sel[c.id] || 0);
          e.onclick = () => {
            if (lim === 0) return UI.toast('Bu kart Yasaklı listede');
            if (!isExtra(c) || opts.limit == null ? counted() >= LIMIT : false) return UI.toast(`En fazla ${LIMIT} kart`);
            if ((sel[c.id] || 0) >= owned(c.id)) return UI.toast('Koleksiyonunda başka kopya yok');
            if (inDeck(c.id) >= lim) return UI.toast(`Destede bu karttan en fazla ${lim} kopya`);
            if (isExtra(c) ? base.extra.length + extraSel() >= EXTRA_MAX : base.main.length + mainSel() >= DECK_MAX) return UI.toast(isExtra(c) ? 'Extra Deck dolu' : 'Deste dolu (30)');
            sel[c.id] = (sel[c.id] || 0) + 1; UI.sfx('click'); badge.style.display = 'block'; badge.textContent = '×' + sel[c.id]; info();
          };
          e.oncontextmenu = ev => { ev.preventDefault(); if (sel[c.id]) { sel[c.id]--; if (!sel[c.id]) delete sel[c.id]; badge.textContent = '×' + (sel[c.id] || 0); badge.style.display = sel[c.id] ? 'block' : 'none'; info(); } };
          const l = document.createElement('div'); l.className = 'catname'; l.innerHTML = `${esc(c.name)} <b>×${owned(c.id)}</b>${banTag(c)}`;
          const more = document.createElement('button'); more.className = 'minibtn'; more.textContent = 'ⓘ'; more.onclick = ev => { ev.stopPropagation(); UI.showCard(c); };
          w.append(e, badge, l, more); grid.appendChild(w);
        });
        if (!list.length) grid.innerHTML = '<div style="padding:30px;color:#9a93c8">Koleksiyonunda kart yok.</div>';
      };
      const finishPick = clear => {
        if (clear) { for (const k of Object.keys(sel)) delete sel[k]; }
        const main = [], extra = [];
        for (const [id, n] of Object.entries(sel)) for (let i = 0; i < n; i++) (isExtra(UI.db.get(+id)) ? extra : main).push(+id);
        res({ main, extra });
      };
      $('pk-q').oninput = e => { st.q = e.target.value.trim().toLowerCase(); draw(); };
      $('pk-kind').onchange = e => { st.kind = e.target.value; draw(); };
      $('pk-back').onclick = () => { UI.sfx('click'); res(null); };
      $('pk-skip').onclick = () => { UI.sfx('click'); finishPick(true); };
      $('pk-go').onclick = () => { UI.sfx('buy'); finishPick(false); };
      info(); draw();
      UI.show('collection', () => res(null));
    });
  };
})();
