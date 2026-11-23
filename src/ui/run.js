// Run akışı: başlık, harita, ödüller, mağaza (kart/paket/atölye), dinlenme, olaylar.
(function () {
  const UI = (window.UI = window.UI || {});
  const { cardEl, esc } = UI;

  let cards = [], db = new Map(), pool = [];
  let run = null;

  const RANKS = ['N', 'R', 'SR', 'UR', 'PR'];
  const RARITY_PRICE = { N: 40, R: 70, SR: 110, UR: 170, PR: 250 };
  const MAIN_MAX = 30, MAIN_MIN = 20, EXTRA_MAX = 10, STORAGE_MAX = 10; // deste ≤30, Extra ≤10; fazlası "Kart Deposu"na (≤10) gider; depo düelloya dahil değildir
  const SELL_CHIPS = 20; // run içinde satılan kart başına ★
  UI.DECK_MAX = MAIN_MAX; UI.EXTRA_MAX = EXTRA_MAX; UI.STORAGE_MAX = STORAGE_MAX;
  const rnd = n => Math.floor(Math.random() * n);
  const pickOne = a => a[rnd(a.length)];
  const $ = id => document.getElementById(id);
  const isExtraCard = c => c.type === 'Fusion Monster';

  const NODE_ICON = { duel: '⚔', elite: '★', shop: '🛒', event: '❓', rest: '🔥', boss: '☠' };
  const NODE_NAME = { duel: 'Düello', elite: 'Elit', shop: 'Mağaza', event: 'Olay', rest: 'Dinlenme', boss: 'Boss' };

  // ---------------------------------------------------------- yükleme
  async function boot() {
    if (window.api) cards = window.api.loadCards();
    else cards = await (await fetch('../data/cards.dm.json')).json();
    YGO.setup(cards);
    db = new Map(cards.map(c => [c.id, c]));
    UI.db = db; UI.cards = cards;
    pool = YGO.Decks.buildPool(cards);
    titleScreen();
  }

  // ---------------------------------------------------------- yardımcılar
  const lim = c => YGO.Decks.copyLimit(c);
  const nIn = (list, id) => list.filter(i => i === id).length;
  // run boyunca sahip olunan toplam kopya (deste + extra + depo)
  const copies = id => nIn(run.deck, id) + nIn(run.extra, id) + nIn(run.storage, id);
  // Yeni kart: desteye (yer ve kopya sınırı uygunsa), değilse Kart Deposu'na. false = depo da dolu.
  function addCard(c) {
    run.storage = run.storage || [];
    if (isExtraCard(c)) {
      if (run.extra.length < EXTRA_MAX && nIn(run.extra, c.id) < lim(c)) { run.extra.push(c.id); return 'deck'; }
    } else if (run.deck.length < MAIN_MAX && nIn(run.deck, c.id) < lim(c)) { run.deck.push(c.id); return 'deck'; }
    if (run.storage.length >= STORAGE_MAX) return false;
    run.storage.push(c.id);
    return 'storage';
  }
  const addMsg = (c, how) => `${c.name} ${how === 'storage' ? 'Kart Deposu\'na eklendi (deste dolu / kopya sınırı)' : 'desteye eklendi'}`;

  // ---- Kart satma: yalnızca deste VE depo doluyken, kalıcı (koleksiyondan getirilen) kartlar hariç, kart başına 20★
  const isFull = () => run.deck.length >= MAIN_MAX && (run.storage || []).length >= STORAGE_MAX;
  const permOf = id => (run.perm && run.perm[id]) || 0;
  const sellable = id => copies(id) > permOf(id);
  // bir kopyayı satar: önce depodan, sonra destenin/extra'nın içinden
  function sellOne(id) {
    for (const list of [run.storage || [], isExtraCard(db.get(id)) ? run.extra : run.deck, run.extra, run.deck]) {
      const i = list.indexOf(id);
      if (i >= 0) { list.splice(i, 1); UI.meta.earn(SELL_CHIPS); return true; }
    }
    return false;
  }
  // Kart yerleştirilemediğinde (deste+depo dolu): bir kart sat ya da yeni kartı bırak. Dönüş: 'deck'|'storage'|false
  async function addCardAsk(c) {
    const how = addCard(c);
    if (how) return how;
    const opts = [...new Set([...(run.storage || []), ...run.deck, ...run.extra])].filter(sellable).map(id => db.get(id)).sort((a, b) => a.name.localeCompare(b.name));
    if (!opts.length) { UI.toast('Deste ve depo dolu; satılabilir kart yok (kalıcı kartlar satılamaz)'); return false; }
    const t = await UI.chooseCards(opts, `Deste ve Depo dolu — ${c.name} için yer aç: bir kartı sat (+${SELL_CHIPS}★) ya da yeni kartı bırak`, { cancel: true });
    if (!t) return false;
    sellOne(t.id); UI.sfx('buy'); UI.toast(`${t.name} satıldı (+${SELL_CHIPS}★)`);
    return addCard(c);
  }

  const hudHtml = () => `
    <div>❤ <b>${run.hearts}/${run.maxHearts}</b></div>
    <div>🪙 <b>${run.gold}</b></div>
    <div>🃏 Deste: <b>${run.deck.length}</b>/${MAIN_MAX} · Extra: <b>${run.extra.length}</b>/${EXTRA_MAX} · 📦 Depo: <b>${(run.storage || []).length}</b>/${STORAGE_MAX}</div>
    ${run.bonusLP ? `<div>✨ Sonraki düello +${run.bonusLP} LP</div>` : ''}`;

  // ---------------------------------------------------------- başlık
  function titleScreen() { UI.mainMenu(); }

  // ---------------------------------------------------------- kayıt (localStorage; Electron'da kullanıcı verisinde kalıcı)
  const SAVE_KEY = 'ygo_run_v1';
  function saveRun() {
    if (!run) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ run, finish: [...UI.finish.entries()] })); } catch (e) {}
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function loadGame() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      run = s.run;
      UI.finish = new Map(s.finish || []);
      mapScreen();
    } catch (e) { UI.toast('Kayıt okunamadı'); deleteSave(); UI.mainMenu(); }
  }

  function newGameScreen() {
    const el = $('screen-newgame');
    const byName = YGO.Decks.byName(cards);
    el.innerHTML = `<h1>NEW GAME</h1><h2>Bir tema seç, 20 kartlık desteni draft ile kur</h2><div class="starters"></div>
      <div style="color:#9a93c8;font-size:13px">4000 LP · 3 Canavar + 3 Büyü/Tuzak + Saha + Extra Deck · <button class="btn ghost" id="ng-back" style="padding:2px 14px">← Ana menü</button></div>`;
    el.querySelector('#ng-back').onclick = () => { UI.sfx('click'); UI.mainMenu(); };
    const wrap = el.querySelector('.starters');
    for (const key of Object.keys(YGO.Decks.THEMES)) {
      const th = YGO.Decks.THEMES[key];
      const box = document.createElement('div');
      box.className = 'starter';
      box.innerHTML = `<h3 style="margin:0;color:#e8c766">${esc(th.name)} Teması</h3><div style="color:#9a93c8;font-size:13px">${esc(th.desc)}</div><div class="row"></div>`;
      const row = box.querySelector('.row');
      for (const n of th.show) { const c = byName.get(n); if (c) { const e = cardEl(c, { size: 'mid', finish: 0 }); e.classList.remove('def'); row.appendChild(e); } }
      const b = document.createElement('button');
      b.className = 'btn big'; b.textContent = 'Draft ile Başla';
      b.onclick = () => { UI.sfx('click'); startDraft(key); };
      box.appendChild(b);
      if (YGO.Decks.STARTERS[key]) {
        const q = document.createElement('button');
        q.className = 'btn ghost'; q.style.marginLeft = '8px'; q.textContent = 'Hazır Deste';
        q.onclick = () => { UI.sfx('click'); newRun(key); };
        box.appendChild(q);
      }
      wrap.appendChild(box);
    }
    UI.show('newgame', () => UI.mainMenu());
  }

  // ---------------------------------------------------------- başlangıç draft'ı
  // 8 kart gelir (≥1 Tuzak, ≥2 Büyü, ≥2 Efektli Canavar), 1-2 tanesini seç; 20 kartlık deste dolana kadar.
  // Fusion/Ritual seçilirse gerekenler birlikte gelir. 2 tur sonra önerilen konsept destesine yakın kartlar artar.
  function startDraft(themeKey) {
    const deck = { main: [], extra: [], rounds: 0, perm: { main: [], extra: [] } }; // perm: koleksiyondan seçilen kalıcı kartlar (toplam 20'ye dahil)
    const history = []; // geri alma için: {main, extra, perm, rounds, offer}
    const used = () => deck.main.length + deck.perm.main.length;
    const dview = () => ({ main: deck.main.concat(deck.perm.main), extra: deck.extra.concat(deck.perm.extra), rounds: deck.rounds });
    let round = 0, offer = null;
    const MAXP = YGO.Decks.DRAFT_MAX_PICK, SIZE = YGO.Decks.DRAFT_SIZE;
    const el = $('screen-draft');
    const catName = { trap: 'TUZAK', spell: 'BÜYÜ', effect: 'EFEKT', mon: '' };

    function nextRound() {
      if (used() >= SIZE) return finish();
      round = deck.rounds + 1;
      offer = YGO.Decks.draftOffer(cards, themeKey, dview());
      if (!offer.length) return finish();
      show();
    }

    function finish() {
      UI.sfx('win');
      const perm = {};
      for (const id of [...deck.perm.main, ...deck.perm.extra]) perm[id] = (perm[id] || 0) + 1;
      const v = dview();
      newRun(null, { main: v.main, extra: v.extra, perm });
    }

    async function leave() {
      if ((deck.main.length || deck.perm.main.length) && !(await UI.confirm('Draft\'tan çıkılsın mı? Şimdiye kadarki seçimlerin kaybolur.', 'Çık', 'Devam et'))) return;
      newGameScreen();
    }

    function show() {
      const th = YGO.Decks.THEMES[themeKey];
      const info = YGO.Decks.draftInfo(cards, dview());
      const arch = info && YGO.Decks.ARCHETYPES[info.key];
      const picked = new Set();
      const remaining = () => SIZE - used();
      const addOf = c => YGO.Decks.bundleOf(cards, c, dview()).main.length;
      el.innerHTML = `<div class="draftwrap">
        <div class="hud"><button class="btn ghost" id="d-back">← Geri</button><button class="btn ghost" id="d-undo" ${history.length ? '' : 'disabled'}>↶ Son seçimi geri al</button>
          <div><b>${esc(th.name)}</b> draft'ı · Seçim <b>${round}</b></div>
          <div>🃏 Deste: <b>${used()}</b>/${SIZE} <small style="color:#9a93c8">(rastgele ${deck.main.length} + kalıcı ${deck.perm.main.length})</small> · Extra: <b>${deck.extra.length + deck.perm.extra.length}</b>/${UI.EXTRA_MAX}</div>
          <button class="btn" id="d-col" ${UI.meta.total() ? '' : 'disabled title="Koleksiyonunda kart yok"'}>🗂 Koleksiyondan Ekle${deck.perm.main.length + deck.perm.extra.length ? ' (' + (deck.perm.main.length + deck.perm.extra.length) + ')' : ''}</button>
          ${info ? `<div class="archbadge" title="${esc(info.desc)}">★ Önerilen deste: <b>${esc(info.name)}</b> (${info.have.length} kart)</div>` : '<div style="color:#9a93c8">Eğilim: ilk 2 turdan sonra belirlenir</div>'}
          <div class="grow"></div><button class="btn ghost mutebtn">${UI.isMuted() ? '🔇' : '🔊'}</button></div>
        <div class="drafthint">8 karttan <b>1 ya da en fazla ${MAXP}</b> tanesini seç. Üzerine gelince detay altta görünür; Fusion / Ritual kartlarında birlikte eklenecek kartlar yukarıda belirir.</div>
        <div class="offers"></div>
        <div class="draftdetail" id="ddetail">Bir kartın üzerine gel…</div>
        <div class="draftctl"><button class="btn big" id="dconfirm" disabled>Seçimi Onayla</button></div>
        <div class="deckstrip"><div class="decklabel">Destenin (${used()}/${SIZE})</div><div class="stripcards" id="stripmain"></div>
          <div class="decklabel">Extra Deck (${deck.extra.length + deck.perm.extra.length})</div><div class="stripcards" id="stripextra"></div></div>
      </div>`;
      el.querySelector('.mutebtn').onclick = () => UI.toggleMute();
      $('d-back').onclick = () => { UI.sfx('click'); leave(); };
      $('d-undo').onclick = () => {
        const h = history.pop(); if (!h) return;
        deck.main = h.main; deck.extra = h.extra; deck.perm = h.perm; deck.rounds = h.rounds; offer = h.offer; round = deck.rounds + 1; UI.sfx('click'); show();
      };
      const row = el.querySelector('.offers');
      const confirmBtn = $('dconfirm');

      const detail = c => {
        const cat = YGO.Decks.draftCategory(c);
        $('ddetail').innerHTML = `<b style="color:#f2c04a">${esc(UI.nm(c))}</b> · <span style="color:#9a93c8">${c.kind === 'monster' ? `${esc(c.attr)} · ${esc(c.race)} · Lv${c.level} · ATK ${c.atk} / DEF ${c.def}` : (c.kind === 'spell' ? 'Büyü' : 'Tuzak')}${cat === 'effect' ? ' · Efektli' : ''}</span><br>${esc(c.desc)}`;
      };

      const refresh = () => {
        confirmBtn.disabled = picked.size === 0;
        confirmBtn.textContent = picked.size ? `Seçimi Onayla (${picked.size}/${MAXP})` : 'Bir kart seç';
        row.querySelectorAll('.offer').forEach((o, i) => o.classList.toggle('picked', picked.has(i)));
      };

      offer.forEach((c, i) => {
        const b = YGO.Decks.bundleOf(cards, c, dview());
        const cat = YGO.Decks.draftCategory(c);
        const recommended = arch && (arch.core.includes(c.name) || arch.support.includes(c.name));
        const w = document.createElement('div'); w.className = 'offer';
        if (b.note) {
          const pop = document.createElement('div'); pop.className = 'bundlepop';
          pop.innerHTML = `<div class="bundlenote">${esc(b.note)}</div><div class="bundlecards"></div>`;
          const bc = pop.querySelector('.bundlecards');
          b.shown.forEach((s, k) => {
            const m = cardEl(s, { size: 'mini', finish: 0 }); m.classList.remove('def'); m.style.animationDelay = (k * 70) + 'ms';
            bc.appendChild(m);
          });
          w.appendChild(pop);
        }
        const e = cardEl(c, { size: 'big', finish: 0 }); e.classList.remove('def');
        w.appendChild(e);
        const tags = [catName[cat] ? `<span class="tag t-${cat}">${catName[cat]}</span>` : '', recommended ? '<span class="tag t-rec">★ ÖNERİLEN</span>' : ''].join('');
        const l = document.createElement('div'); l.className = 'offerlabel';
        l.innerHTML = `<div class="tags">${tags}</div><b>${esc(c.name)}</b> ${UI.rarTag(c)}<br><span style="color:#9a93c8">${c.kind === 'monster' ? `ATK ${c.atk} / DEF ${c.def} · Lv${c.level}` : (c.kind === 'spell' ? 'Büyü' : 'Tuzak')}${b.extra.length ? ' · Extra' : ''}${b.main.length > 1 ? ` · +${b.main.length - 1} kart` : ''}</span>`;
        w.appendChild(l);
        w.onmouseenter = () => detail(c);
        w.onclick = () => {
          UI.sfx('click');
          if (picked.has(i)) picked.delete(i);
          else {
            if (picked.size >= MAXP) return UI.toast(`En fazla ${MAXP} kart`);
            const need = [...picked].reduce((s, j) => s + addOf(offer[j]), 0) + addOf(c);
            if (need > remaining()) return UI.toast('Destede bu kadar yer yok');
            picked.add(i);
          }
          refresh();
        };
        row.appendChild(w);
      });

      // alttaki deste şeridi
      const strip = (id, ids) => {
        const box = $(id);
        ids.map(x => db.get(x)).sort((a, b) => a.kind.localeCompare(b.kind) || (b.atk || 0) - (a.atk || 0)).forEach(c => {
          const m = cardEl(c, { size: 'tiny', finish: 0, noTag: true }); m.classList.remove('def'); m.title = UI.nm(c);
          m.onmouseenter = () => detail(c);
          box.appendChild(m);
        });
      };
      strip('stripmain', deck.main.concat(deck.perm.main)); strip('stripextra', deck.extra.concat(deck.perm.extra));
      // Koleksiyondan kalıcı kart ekle: rastgele kartlarla birlikte toplam 20'yi geçemez
      $('d-col').onclick = async () => {
        UI.sfx('click');
        const pre = {};
        for (const id of [...deck.perm.main, ...deck.perm.extra]) pre[id] = (pre[id] || 0) + 1;
        const r = await UI.pickFromCollection({ main: deck.main, extra: deck.extra }, { limit: SIZE - deck.main.length, preselect: pre, confirmLabel: 'Seçimi Kaydet', skipLabel: 'Seçimi Temizle', title: 'Kalıcı kartlarını seç' });
        if (r) { deck.perm = r; if (used() >= SIZE) return finish(); }
        show();
      };

      confirmBtn.onclick = () => {
        history.push({ main: deck.main.slice(), extra: deck.extra.slice(), perm: { main: deck.perm.main.slice(), extra: deck.perm.extra.slice() }, rounds: deck.rounds, offer });
        for (const i of picked) {
          const b = YGO.Decks.bundleOf(cards, offer[i], dview());
          deck.main.push(...b.main); deck.extra.push(...b.extra);
        }
        deck.rounds++;
        UI.sfx('buy');
        nextRound();
      };
      refresh();
      UI.show('draft', leave);
    }
    nextRound();
  }

  // ---------------------------------------------------------- harita
  function genMap() {
    const types = [
      ['duel'], ['duel', 'event'], ['duel', 'shop', 'event'], ['elite', 'duel'],
      ['rest', 'shop', 'event'], ['elite', 'duel', 'event'], ['rest'], ['boss'],
    ];
    const L = types.length;
    const nodes = [];
    for (let l = 0; l < L; l++) {
      const cols = l === L - 1 ? [1] : [0, 1, 2];
      cols.forEach(col => nodes.push({ id: nodes.length, l, col, type: pickOne(types[l]), next: [], done: false }));
    }
    for (const n of nodes.filter(n => n.l < L - 1)) {
      const nextLayer = nodes.filter(m => m.l === n.l + 1);
      if (nextLayer.length === 1) { n.next = [nextLayer[0].id]; continue; }
      const cand = nextLayer.filter(m => Math.abs(m.col - n.col) <= 1);
      n.next = [cand.find(m => m.col === n.col).id];
      const extra = cand.filter(m => !n.next.includes(m.id));
      if (extra.length && Math.random() < 0.6) n.next.push(pickOne(extra).id);
    }
    return { nodes, layers: L };
  }

  async function newRun(starterKey, custom) {
    const sd = custom || YGO.Decks.starterDeck(cards, starterKey);
    const main = sd.main.slice(), extra = sd.extra.slice();
    const perm = Object.assign({}, sd.perm || {}); // kalıcı (koleksiyondan gelen) kartlar: run içinde satılamaz
    // Draft'ta kalıcı kartlar zaten seçildi; yalnızca hazır deste yolunda koleksiyondan en fazla 10 kart getirilir
    if (!custom && UI.meta.total() > 0) {
      const r = await UI.pickFromCollection({ main, extra });
      if (r === null) return newGameScreen();
      main.push(...r.main); extra.push(...r.extra);
      for (const id of [...r.main, ...r.extra]) perm[id] = (perm[id] || 0) + 1;
    }
    // Extra Deck ≤ 10: fazlası depoya (≤10) gider
    const storage = [];
    while (extra.length > EXTRA_MAX) { const id = extra.pop(); if (storage.length < STORAGE_MAX) storage.push(id); }
    UI.finish.clear(); // tüm kartlar mat başlar
    run = {
      hearts: 3, maxHearts: 3, gold: 80, bonusLP: 0, wins: 0, perm,
      deck: main, extra, storage,
      map: genMap(), layer: -1, current: null,
    };
    mapScreen();
  }

  // ---------------------------------------------------------- deste düzenleyici (deste ≤30 / Kart Deposu)
  function deckEditor(back) {
    const el = $('screen-deckedit');
    const sortFn = (a, b) => a.kind.localeCompare(b.kind) || (b.atk || 0) - (a.atk || 0) || a.name.localeCompare(b.name);
    const render = () => {
      run.storage = run.storage || [];
      el.innerHTML = `<div class="catwrap">
        <div class="hud"><button class="btn ghost" id="de-back">← Geri</button>
          <div>🃏 Deste: <b style="color:${run.deck.length < MAIN_MIN ? '#ff9a9a' : '#fff'}">${run.deck.length}</b>/${MAIN_MAX} <small style="color:#9a93c8">(en az ${MAIN_MIN})</small></div>
          <div>Extra: <b>${run.extra.length}</b>/${EXTRA_MAX}</div><div>📦 Depo: <b>${run.storage.length}</b>/${STORAGE_MAX}</div></div>
        <div class="catnote">Karta <b>tıkla</b>: desteyle depo arasında taşır. Depo düelloya dahil değildir (en fazla ${STORAGE_MAX} kart). Destede kalan kartların bittiğinde çekemeyen oyuncu <b>düelloyu kaybeder</b> — 30 kartı doldurmak zorunda değilsin ama ${MAIN_MIN} altına inemezsin. Kopya sınırı: Yasaklı/Sınırlı 1 · Yarı Sınırlı 2 · diğerleri 3.
          <br><b>Kart satma:</b> deste ve depo doluyken, koleksiyondan getirdiğin kalıcı kartlar dışındaki kartlar <b>${SELL_CHIPS}★</b> karşılığında satılabilir ${isFull() ? '<b style="color:#7fe08a">(şu an satış açık)</b>' : '<span style="color:#9a93c8">(şu an kapalı: deste ve depo dolu değil)</span>'}.</div>
        <div class="decklabel">Ana Deste (${run.deck.length})</div><div class="cardgrid" id="de-main"></div>
        <div class="decklabel">Extra Deck (${run.extra.length})</div><div class="cardgrid" id="de-extra"></div>
        <div class="decklabel">📦 Kart Deposu (${run.storage.length})</div><div class="cardgrid" id="de-store"></div></div>`;
      const fill = (sel, ids, onClick) => {
        const grid = el.querySelector(sel);
        ids.map(id => ({ id, c: db.get(id) })).sort((a, b) => sortFn(a.c, b.c)).forEach(({ id, c }) => {
          const w = document.createElement('div'); w.className = 'choice';
          const e = cardEl(c, { size: 'mid' }); e.classList.remove('def'); e.style.cursor = 'pointer';
          e.onclick = () => onClick(id, c); e.oncontextmenu = ev => { ev.preventDefault(); UI.showCard(c, UI.finishOf(c.id)); };
          const l = document.createElement('div'); l.className = 'catname'; l.textContent = c.name + (c.ban ? ` ⚠${c.ban === 'Semi-Limited' ? '2' : '1'}` : '') + (permOf(id) ? ' 🔒' : '');
          w.append(e, l);
          if (isFull() && sellable(id)) { // deste ve depo doluyken: kalıcı olmayan kartı sat
            const sb = document.createElement('button'); sb.className = 'btn ghost'; sb.style.cssText = 'padding:2px 10px;font-size:12px;margin-top:4px'; sb.textContent = `Sat +${SELL_CHIPS}★`;
            sb.onclick = async ev => { ev.stopPropagation(); if (!(await UI.confirm(`${c.name} ${SELL_CHIPS}★ karşılığında satılsın mı?`, 'Sat', 'Vazgeç'))) return; const i = ids.indexOf(id); if (i >= 0) { ids.splice(i, 1); UI.meta.earn(SELL_CHIPS); UI.sfx('buy'); render(); } };
            w.appendChild(sb);
          }
          grid.appendChild(w);
        });
        if (!ids.length) grid.innerHTML = '<div style="color:#9a93c8;padding:6px">—</div>';
      };
      const move = (from, to, id) => {
        if (to === run.storage && run.storage.length >= STORAGE_MAX) return UI.toast(`Depo dolu (${STORAGE_MAX})`);
        from.splice(from.indexOf(id), 1); to.push(id); UI.sfx('click'); render();
      };
      fill('#de-main', run.deck, (id, c) => { if (run.deck.length <= MAIN_MIN) return UI.toast(`Deste en az ${MAIN_MIN} kart olmalı`); move(run.deck, run.storage, id); });
      fill('#de-extra', run.extra, (id) => move(run.extra, run.storage, id));
      fill('#de-store', run.storage, (id, c) => {
        if (isExtraCard(c)) {
          if (run.extra.length >= EXTRA_MAX) return UI.toast('Extra Deck dolu');
          if (nIn(run.extra, id) >= lim(c)) return UI.toast('Kopya sınırı');
          return move(run.storage, run.extra, id);
        }
        if (run.deck.length >= MAIN_MAX) return UI.toast(`Deste dolu (${MAIN_MAX})`);
        if (nIn(run.deck, id) >= lim(c)) return UI.toast(`Destede bu karttan en fazla ${lim(c)} kopya olabilir`);
        move(run.storage, run.deck, id);
      });
      $('de-back').onclick = () => { UI.sfx('click'); close(); };
    };
    const close = () => { if (run.deck.length < MAIN_MIN) return UI.toast(`Deste en az ${MAIN_MIN} kart olmalı`); saveRun(); back(); };
    render();
    UI.show('deckedit', close);
  }

  // ---------------------------------------------------------- run sonu: kalıcı koleksiyona 1-5 kart
  // Run'ı kazanmak 5 kart; elenirsen ulaştığın aşamaya göre: boss'a kadar gelmek 4, 6. ve 5. katman 3, 4. ve 3. katman 2, daha erken 1.
  const LEGACY_TABLE = [[7, 4], [5, 3], [3, 2], [0, 1]]; // [en az ulaşılan katman, kart]
  function legacyCount(victory) {
    if (victory) return 5;
    const L = run.layer == null ? -1 : run.layer;
    for (const [min, n] of LEGACY_TABLE) if (L >= min) return n;
    return 1;
  }
  function legacyScreen(victoryFlag) {
    const el = $('screen-misc');
    const n = legacyCount(victoryFlag);
    const chips = run.wins * 40 + (victoryFlag ? 300 : 0);
    UI.meta.earn(chips);
    const ids = [...new Set([...run.deck, ...run.extra, ...(run.storage || [])])].map(id => db.get(id)).sort((a, b) => a.name.localeCompare(b.name));
    const picked = new Set();
    el.innerHTML = `<div class="shopwrap"><div class="hud"><b style="font-size:18px">${victoryFlag ? '🏆 Bölüm 1 Tamamlandı!' : '☠ Run Bitti'}</b>
        <div>${run.wins} düello kazandın</div><div>★ <b>+${chips}</b> Star Chip (toplam ${UI.meta.data.chips})</div><div class="grow"></div></div>
      <div class="catnote"><b>Kalıcı ödül:</b> destende ve deponda biriken kartlardan <b>${n} tanesini</b> kalıcı koleksiyonuna ekle (en fazla ${UI.meta.MAX_COPIES} kopya). <span style="color:#9a93c8">Run'ı kazanırsan 5, boss'a kadar gelirsen 4, daha erken elenirsen aşamana göre 3 · 2 · 1 kart.</span> Yeni run'da bu koleksiyondan ${UI.meta.RUN_PICK_MAX} karta kadar getirebilirsin.</div>
      <div class="cardgrid" id="lg-grid"></div>
      <div style="text-align:center;padding:12px"><span id="lg-info" style="margin-right:14px"></span><button class="btn big" id="lg-ok">Koleksiyona Ekle ve Çık</button></div></div>`;
    const grid = $('lg-grid');
    const info = () => { $('lg-info').textContent = `Seçilen: ${picked.size}/${n}`; el.querySelectorAll('.lgc').forEach(w => w.classList.toggle('picked', picked.has(+w.dataset.id))); };
    ids.forEach(c => {
      const w = document.createElement('div'); w.className = 'choice lgc'; w.dataset.id = c.id;
      const e = cardEl(c, { size: 'mid' }); e.classList.remove('def'); e.style.cursor = 'pointer';
      e.onclick = () => {
        if (picked.has(c.id)) picked.delete(c.id);
        else if (picked.size >= n) return UI.toast(`En fazla ${n} kart`);
        else picked.add(c.id);
        UI.sfx('click'); info();
      };
      const l = document.createElement('div'); l.className = 'catname'; l.innerHTML = `${esc(c.name)} <b>${UI.meta.owned(c.id) ? '(×' + UI.meta.owned(c.id) + ' sende)' : '✦ yeni'}</b>`;
      w.append(e, l); grid.appendChild(w);
    });
    $('lg-ok').onclick = async () => {
      if (picked.size < Math.min(n, ids.length) && !(await UI.confirm(`${n} karttan az seçtin. Yine de çıkılsın mı?`, 'Çık', 'Seçmeye dön'))) return;
      let refund = 0;
      for (const id of picked) if (UI.meta.add(id) === 'refund') refund += 20;
      UI.sfx('buy'); deleteSave(); run = null;
      UI.toast(`${picked.size} kart koleksiyona eklendi${refund ? ` (+${refund}★ fazla kopya)` : ''}`);
      UI.mainMenu();
    };
    info();
    UI.show('misc');
  }

  function available() {
    if (run.layer === -1) return run.map.nodes.filter(n => n.l === 0).map(n => n.id);
    return run.map.nodes[run.current].next;
  }

  function mapScreen() {
    const el = $('screen-map');
    const avail = new Set(available());
    el.innerHTML = `
      <div class="hud">${hudHtml()}
        <div class="grow"></div>
        <button class="btn ghost mutebtn">${UI.isMuted() ? '🔇' : '🔊'}</button>
        <button class="btn ghost" id="btn-deck">Deste / Depo</button>
        <button class="btn ghost" id="btn-menu">← Ana Menü</button>
      </div>
      <div class="mapwrap" id="mapwrap"></div>
      <div class="legend">⚔ Düello · ★ Elit · 🛒 Mağaza · ❓ Olay · 🔥 Dinlenme · ☠ Boss — Altından yukarı ilerle</div>`;
    el.querySelector('.mutebtn').onclick = () => UI.toggleMute();
    const wrap = $('mapwrap');
    const pos = n => {
      const x = n.l === run.map.layers - 1 ? 50 : [22, 50, 78][n.col];
      const y = 92 - n.l * (84 / (run.map.layers - 1));
      return { x, y };
    };
    let svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">';
    for (const n of run.map.nodes) for (const t of n.next) {
      const a = pos(n), b = pos(run.map.nodes[t]);
      const live = (run.layer === -1 ? false : run.current === n.id) && avail.has(t);
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${live ? '#e8c766' : '#3a3366'}" stroke-width="${live ? 2.2 : 1.4}" vector-effect="non-scaling-stroke" stroke-dasharray="${live ? '' : '4 4'}"/>`;
    }
    wrap.innerHTML = svg + '</svg>';
    for (const n of run.map.nodes) {
      const p = pos(n);
      const d = document.createElement('div');
      d.className = `node ${n.type === 'boss' ? 'boss' : ''} ${avail.has(n.id) ? 'avail' : ''} ${n.done ? 'done' : ''} ${run.current === n.id ? 'current' : ''}`;
      d.style.left = p.x + '%'; d.style.top = p.y + '%';
      d.innerHTML = `${NODE_ICON[n.type]}<small>${NODE_NAME[n.type]}</small>`;
      if (avail.has(n.id)) d.onclick = () => { UI.sfx('click'); enterNode(n); };
      wrap.appendChild(d);
    }
    $('btn-deck').onclick = () => { UI.sfx('click'); deckEditor(() => mapScreen()); };
    $('btn-menu').onclick = () => { UI.sfx('click'); UI.mainMenu(); };
    saveRun(); // her haritaya dönüşte otomatik kayıt
    UI.show('map', () => UI.mainMenu());
  }

  // Deste görüntüleyici (onPick verilirse kart seçtirir)
  function showDeck(onPick, title) {
    const sortFn = (a, b) => a.kind.localeCompare(b.kind) || (b.atk || 0) - (a.atk || 0);
    const main = run.deck.map(id => db.get(id)).sort(sortFn);
    const extra = run.extra.map(id => db.get(id));
    const dlg = UI.modal(`<h3>${esc(title || `Deste (${run.deck.length}) · Extra (${run.extra.length})`)}</h3>
      <div style="color:#9a93c8;margin:4px 0">Ana Deste</div><div class="cardgrid" id="g-main"></div>
      <div style="color:#9a93c8;margin:14px 0 4px">Extra Deck</div><div class="cardgrid" id="g-extra"></div>`);
    const fill = (sel, list, kind) => {
      const grid = dlg.querySelector(sel);
      list.forEach(c => {
        const el = cardEl(c, { size: 'mid' }); el.classList.remove('def');
        el.onclick = () => { if (onPick) { UI.closeModal(); onPick(c, kind); } };
        grid.appendChild(el);
      });
    };
    fill('#g-main', main, 'main'); fill('#g-extra', extra, 'extra');
    const b = document.createElement('button');
    b.className = 'btn ghost'; b.style.marginTop = '14px'; b.textContent = 'Kapat';
    b.onclick = UI.closeModal; b.dataset.esc = '1'; dlg.appendChild(b);
  }

  function removeFromDeck(c) {
    const list = isExtraCard(c) ? run.extra : run.deck;
    list.splice(list.indexOf(c.id), 1);
  }

  // ---------------------------------------------------------- düğüm girişi
  function enterNode(n) {
    run.layer = n.l; run.current = n.id;
    if (n.type === 'duel' || n.type === 'elite' || n.type === 'boss') return startFight(n);
    if (n.type === 'shop') return shop(n);
    if (n.type === 'rest') return rest(n);
    return event(n);
  }
  function finishNode(n) { n.done = true; mapScreen(); }

  // ---------------------------------------------------------- düello
  function pickEnemy(n) {
    if (n.type === 'boss') return pickOne(['kaiba', 'pegasus']);
    if (n.type === 'elite') return pickOne(['mai', 'keith']);
    return pickOne(n.l <= 1 ? ['weevil', 'rex'] : ['weevil', 'rex', 'mai', 'keith']);
  }

  async function startFight(n) {
    const key = pickEnemy(n);
    const e = YGO.Decks.ENEMIES[key];
    const ed = YGO.Decks.enemyDeck(cards, key);
    const bonus = run.bonusLP; run.bonusLP = 0;
    const res = await UI.startDuel({
      deck: run.deck, extra: run.extra, enemyDeck: ed.main, enemyExtra: ed.extra,
      enemyName: e.name, enemyTitle: e.title, db,
      startLP: [4000 + bonus, e.hp + (n.type === 'elite' ? 500 : 0)],
    });
    if (res.abandoned) { UI.mainMenu(); return; } // düello bırakıldı: harita kaydı geçerli
    if (res.winner === 0) {
      run.wins++;
      const gold = (n.type === 'boss' ? 150 : n.type === 'elite' ? 70 : 35) + rnd(15);
      run.gold += gold;
      if (n.type === 'boss') return victory();
      rewardScreen(n, gold);
    } else {
      run.hearts--;
      if (run.hearts <= 0) return gameOver();
      infoScreen('Yenildin…', `Bir kalp kaybettin. Kalan: ${run.hearts} ❤`, () => finishNode(n));
    }
  }

  function weightedRarity(type) {
    const w = type === 'elite' ? { N: 25, R: 40, SR: 25, UR: 9, PR: 1 } : type === 'boss' ? { SR: 50, UR: 40, PR: 10 } : { N: 60, R: 28, SR: 10, UR: 2 };
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(w)) { r -= w[k]; if (r <= 0) return k; }
    return 'N';
  }

  function rollCards(type, n) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 300) {
      const r = weightedRarity(type);
      const list = pool.all.filter(c => c.rarity === r && !out.includes(c) && copies(c.id) < Math.min(3, lim(c)));
      if (list.length) out.push(pickOne(list));
    }
    return out;
  }

  function rewardScreen(n, gold) {
    const el = $('screen-reward');
    const choices = rollCards(n.type, 3);
    el.innerHTML = `<div class="centerscreen"><h2>Zafer!</h2><div>🪙 +${gold} altın · Bir kart seç</div><div class="choices"></div>
      <button class="btn ghost" id="skip">Geç (+20 🪙)</button></div>`;
    const row = el.querySelector('.choices');
    choices.forEach(c => {
      const wrap = document.createElement('div'); wrap.className = 'choice';
      const e = cardEl(c, { size: 'big' }); e.classList.remove('def'); e.style.cursor = 'pointer';
      let busy = false;
      e.onclick = async () => {
        if (busy) return; busy = true;
        const how = await addCardAsk(c);
        if (!how) { busy = false; return UI.toast('Kart eklenmedi: yer yok'); }
        UI.sfx('buy'); UI.toast(addMsg(c, how));
        // Sonraki düelloya geçmeden önce depodan desteye kart taşıyabilirsin
        if (await UI.confirm(`${addMsg(c, how)}. Desteni / deponu düzenlemek ister misin?`, 'Deste Düzenle', 'Devam')) return deckEditor(() => finishNode(n));
        finishNode(n);
      };
      const l = document.createElement('div'); l.textContent = `${c.name} ${UI.rarTag(c)}${isExtraCard(c) ? ' · Extra' : ''}`;
      wrap.append(e, l); row.appendChild(wrap);
    });
    $('skip').onclick = () => { run.gold += 20; finishNode(n); };
    UI.show('reward');
  }

  // ---------------------------------------------------------- mağaza
  function shop(n) {
    const el = $('screen-misc');
    const stock = rollCards('elite', 5);
    const usable = Object.keys(YGO.Decks.PACKS).filter(code => YGO.Decks.packPool(cards, code).length >= 8);
    const packs = [...usable].sort(() => Math.random() - .5).slice(0, 3);
    // Overframe mağazası: yüksek nadirlikteki kartlar overframe foil ile satılır
    const overStock = [];
    const hi = pool.all.filter(c => (c.rarity === 'UR' || c.rarity === 'PR') && copies(c.id) < Math.min(3, lim(c)));
    while (overStock.length < 3 && hi.length) overStock.push(hi.splice(rnd(hi.length), 1)[0]);
    let tab = 'cards';

    const render = () => {
      el.innerHTML = `<div class="shopwrap">
        <div class="hud">${hudHtml()}<div class="grow"></div><button class="btn ghost mutebtn">${UI.isMuted() ? '🔇' : '🔊'}</button></div>
        <div class="tabs">
          <button class="tab ${tab === 'cards' ? 'on' : ''}" data-t="cards">🃏 Kartlar</button>
          <button class="tab ${tab === 'packs' ? 'on' : ''}" data-t="packs">📦 Paketler</button>
          <button class="tab ${tab === 'over' ? 'on' : ''}" data-t="over">🏆 Overframe</button>
          <button class="tab ${tab === 'lab' ? 'on' : ''}" data-t="lab">✨ Atölye (Foil)</button>
          <button class="tab ${tab === 'misc' ? 'on' : ''}" data-t="misc">🛠 Hizmetler</button>
        </div>
        <div class="shopbody" id="shopbody"></div>
        <div style="text-align:center;padding:10px"><button class="btn big" id="leave">Ayrıl</button></div>
      </div>`;
      el.querySelector('.mutebtn').onclick = () => UI.toggleMute();
      el.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; UI.sfx('click'); render(); });
      $('leave').onclick = () => finishNode(n);
      const body = $('shopbody');

      if (tab === 'cards') {
        body.innerHTML = '<div class="choices" id="stock"></div>';
        stock.forEach((c, i) => {
          if (!c) return;
          const price = RARITY_PRICE[c.rarity];
          const wrap = document.createElement('div'); wrap.className = 'choice';
          const e = cardEl(c, { size: 'mid' }); e.classList.remove('def'); e.style.cursor = 'pointer';
          e.onclick = async () => {
            if (run.gold < price) return UI.toast('Yetersiz altın');
            const how = await addCardAsk(c);
            if (!how) return UI.toast('Kart eklenmedi: yer yok');
            run.gold -= price; stock[i] = null; UI.sfx('buy'); UI.toast(addMsg(c, how)); render();
          };
          const l = document.createElement('div'); l.className = 'price'; l.textContent = `${price} 🪙`;
          wrap.append(e, l); $('stock').appendChild(wrap);
        });
      } else if (tab === 'packs') {
        body.innerHTML = '<div class="choices" id="packrow"></div><div style="text-align:center;color:#9a93c8;font-size:13px">Her paket 5 kart içerir (1 R+, 1 SR+ garantili). Açtıktan sonra en fazla 3 kartı seçip desteye eklersin.</div>';
        packs.forEach(code => {
          const pk = YGO.Decks.PACKS[code];
          const b = document.createElement('div'); b.className = 'pack pack-' + code;
          b.innerHTML = `<div class="packshine"></div><div class="packcode">${code}</div><div class="packname">${esc(pk.name)}</div><div class="price">${pk.price} 🪙</div>`;
          b.onclick = () => {
            if (run.gold < pk.price) return UI.toast('Yetersiz altın');
            run.gold -= pk.price; UI.sfx('pack');
            openPack(code, () => render());
          };
          $('packrow').appendChild(b);
        });
      } else if (tab === 'over') {
        body.innerHTML = `<div style="text-align:center;margin-bottom:10px">Overframe Mağazası: <b>altın çerçeveli (Overframe)</b> kartlar hazır foil ile satılır. Stok her mağazada yenilenir.</div><div class="choices" id="overrow"></div>`;
        overStock.forEach((c, i) => {
          if (!c) return;
          const price = RARITY_PRICE[c.rarity] + 200;
          const wrap = document.createElement('div'); wrap.className = 'choice';
          const e = cardEl(c, { size: 'mid', finish: 3 }); e.classList.remove('def'); e.style.cursor = 'pointer'; e.classList.add('fx-on');
          e.onclick = async () => {
            if (run.gold < price) return UI.toast('Yetersiz altın');
            if (!(await addCardAsk(c))) return UI.toast('Kart eklenmedi: yer yok');
            run.gold -= price; overStock[i] = null;
            if (UI.finishOf(c.id) < 3) UI.finish.set(c.id, 3);
            UI.sfx('reveal', 'UR'); UI.toast(`${c.name} (Overframe) alındı`); render();
          };
          const l = document.createElement('div'); l.className = 'price'; l.textContent = `${price} 🪙`;
          wrap.append(e, l); $('overrow').appendChild(wrap);
        });
      } else if (tab === 'lab') {
        body.innerHTML = `<div style="text-align:center;margin-bottom:10px">Kartların foil seviyesini yükselt: <b>Mat → Parlak → Holografik → Altın Overframe → Prizmatik</b>. Sadece görünüm değişir.</div>
          <div class="cardgrid" id="labgrid"></div>`;
        const uniq = [...new Set([...run.deck, ...run.extra, ...(run.storage || [])])].map(id => db.get(id)).sort((a, b) => a.name.localeCompare(b.name));
        uniq.forEach(c => {
          const wrap = document.createElement('div'); wrap.className = 'choice';
          const e = cardEl(c, { size: 'mid' }); e.classList.remove('def'); e.style.cursor = 'pointer';
          const f = UI.finishOf(c.id);
          const cost = UI.FINISH_COST[f];
          e.onclick = () => {
            if (f >= 4) return UI.toast('Zaten Prizmatik');
            if (run.gold < cost) return UI.toast('Yetersiz altın');
            run.gold -= cost; UI.finish.set(c.id, f + 1); UI.sfx('reveal', RANKS[f + 1]); render();
          };
          const l = document.createElement('div'); l.className = 'price';
          l.innerHTML = f >= 4 ? `<span style="color:#bbb">${UI.FINISH_NAME[f]}</span>` : `${UI.FINISH_NAME[f]} → ${UI.FINISH_NAME[f + 1]}<br>${cost} 🪙`;
          wrap.append(e, l); $('labgrid').appendChild(wrap);
        });
      } else {
        body.innerHTML = `<div class="choices"><button class="btn big" id="heal">❤ Kalp yenile (80🪙)</button><button class="btn big" id="rm">🗑 Kart çıkar (50🪙)</button></div>`;
        $('heal').onclick = () => {
          if (run.gold < 80) return UI.toast('Yetersiz altın');
          if (run.hearts >= run.maxHearts) return UI.toast('Kalpler zaten dolu');
          run.gold -= 80; run.hearts++; UI.sfx('heal'); render();
        };
        $('rm').onclick = () => {
          if (run.gold < 50) return UI.toast('Yetersiz altın');
          showDeck((c) => {
            if (!isExtraCard(c) && run.deck.length <= 20) return UI.toast('Ana deste 20 kartın altına inemez');
            removeFromDeck(c); run.gold -= 50; render();
          }, 'Çıkarılacak kartı seç');
        };
      }
    };
    render();
    UI.show('misc');
  }

  // Paket açma: 5 kapalı kart, tek tek çevir, en fazla 3 tanesini al
  function openPack(code, done) {
    const pk = YGO.Decks.PACKS[code];
    const out = YGO.Decks.openPack(cards, code);
    // Paketten foil çıkabilir: 0 mat, 1 Glossy, 2 Holo, 3 Altın Overframe, 4 Prismatic. Son (SR+) slot daha şanslı.
    const rollFinish = last => {
      const w = last ? [55, 25, 12, 6, 2] : [86, 9, 3.5, 1.2, 0.3];
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
      return 0;
    };
    const fins = out.map((_, i) => rollFinish(i === out.length - 1));
    const flipped = new Set();
    const chosen = new Set();
    const dlg = UI.modal(`<h3>${esc(pk.name)} — kartları çevir</h3><div class="packcards"></div>
      <div id="packmsg" style="margin:12px 0;color:#9a93c8;text-align:center">Kartlara tıkla. Hepsini çevirdikten sonra en fazla 3 tanesini seç.</div>
      <div style="display:flex;gap:10px;justify-content:center"><button class="btn ghost" id="revall">Hepsini Çevir</button><button class="btn" id="takepack" disabled>Seçilenleri Al</button></div>`);
    const row = dlg.querySelector('.packcards');
    const slots = out.map((c, i) => {
      const s = document.createElement('div'); s.className = 'packslot';
      s.appendChild(UI.backEl('big'));
      s.onclick = () => flip(i);
      row.appendChild(s);
      return s;
    });
    function flip(i) {
      const c = out[i], s = slots[i];
      if (!flipped.has(i)) {
        flipped.add(i);
        s.innerHTML = '';
        const e = cardEl(c, { size: 'big', finish: fins[i] });
        e.classList.remove('def'); e.classList.add('reveal', 'fx-on');
        s.appendChild(e);
        const lab = document.createElement('div'); lab.className = 'packlabel';
        lab.innerHTML = `${esc(c.name)} ${UI.rarTag(c)}${isExtraCard(c) ? ' · Extra' : ''}${fins[i] ? `<br><b style="color:#ffe08a">✨ ${UI.FINISH_NAME[fins[i]]}</b>` : ''}`;
        s.appendChild(lab);
        UI.sfx('reveal', RANKS[Math.max(fins[i] + 1, RANKS.indexOf(c.rarity))]);
        update();
      } else {
        if (chosen.has(i)) chosen.delete(i);
        else if (chosen.size < 3) chosen.add(i);
        else UI.toast('En fazla 3 kart');
        s.classList.toggle('picked', chosen.has(i));
        update();
      }
    }
    function update() {
      const all = flipped.size === out.length;
      dlg.querySelector('#takepack').disabled = !all;
      dlg.querySelector('#packmsg').textContent = all ? `Seçilen: ${chosen.size}/3 (karta tıklayarak seç/bırak)` : `${flipped.size}/5 kart çevrildi`;
    }
    dlg.querySelector('#revall').onclick = () => out.forEach((_, i) => { if (!flipped.has(i)) flip(i); });
    dlg.querySelector('#takepack').onclick = async () => {
      let added = 0, stored = 0;
      for (const i of [...chosen]) {
        const how = await addCardAsk(out[i]);
        if (how) { added++; if (how === 'storage') stored++; if (fins[i] > UI.finishOf(out[i].id)) UI.finish.set(out[i].id, fins[i]); }
      }
      if (added < chosen.size) UI.toast('Deste ve depo dolu: bazı kartlar eklenemedi');
      else if (stored) UI.toast(`${stored} kart Kart Deposu'na gitti (deste dolu / kopya sınırı)`);
      UI.sfx('buy'); UI.closeModal(); done();
    };
  }

  // ---------------------------------------------------------- dinlenme
  function rest(n) {
    const el = $('screen-misc');
    el.innerHTML = `<div class="centerscreen"><h2>Dinlenme Alanı</h2><div>Bir seçim yap.</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center">
        <button class="btn big" id="r-heal">❤ Kalp yenile</button>
        <button class="btn big" id="r-lp">✨ Sonraki düello +800 LP</button>
        <button class="btn big" id="r-rm">🗑 Kart çıkar</button></div>
      <button class="btn ghost" id="r-skip">Atla →</button></div>`;
    $('r-heal').onclick = () => {
      if (run.hearts >= run.maxHearts) return UI.toast('Kalpler zaten dolu');
      run.hearts++; finishNode(n);
    };
    $('r-lp').onclick = () => { run.bonusLP += 800; finishNode(n); };
    $('r-skip').onclick = () => finishNode(n);
    $('r-rm').onclick = () => {
      showDeck(c => {
        if (!isExtraCard(c) && run.deck.length <= 20) return UI.toast('Ana deste 20 kartın altına inemez');
        removeFromDeck(c); finishNode(n);
      }, 'Çıkarılacak kartı seç');
    };
    UI.show('misc');
  }

  // ---------------------------------------------------------- olay
  function event(n) {
    const evs = [
      {
        title: 'Gizemli Sandık', text: 'Eski bir sandık buldun.',
        opts: [
          ['Aç (rastgele nadir kart)', () => { const c = rollCards('elite', 1)[0]; if (c && addCard(c)) return `${c.name} kazandın!`; return 'Boştu.'; }],
          ['Altınları al (+60🪙)', () => { run.gold += 60; return '+60 altın'; }],
        ],
      },
      {
        title: 'Kutsal Çeşme', text: 'Berrak bir su tazeleyici bir his veriyor.',
        opts: [
          ['İç (+1 kalp)', () => { if (run.hearts < run.maxHearts) { run.hearts++; return '+1 kalp'; } run.maxHearts++; run.hearts++; return 'Maksimum kalp arttı!'; }],
          ['Şişeye doldur (+600 LP sonraki düello)', () => { run.bonusLP += 600; return '+600 LP'; }],
        ],
      },
      {
        title: 'Kumarbaz Joey', text: '"Hadi bir zar atalım! 50 altına 150 kazan… ya da hepsini kaybet!"',
        opts: [
          ['Oyna (50🪙)', () => { if (run.gold < 50) return 'Yeterli altının yok.'; run.gold -= 50; if (Math.random() < 0.5) { run.gold += 150; return 'Kazandın! +150🪙'; } return 'Kaybettin…'; }],
          ['Reddet', () => 'Yoluna devam ettin.'],
        ],
      },
    ];
    const ev = pickOne(evs);
    const el = $('screen-misc');
    el.innerHTML = `<div class="centerscreen"><h2>${esc(ev.title)}</h2><div>${esc(ev.text)}</div><div class="evrow" style="display:flex;gap:14px"></div><button class="btn ghost" id="e-skip">Atla →</button></div>`;
    $('e-skip').onclick = () => finishNode(n);
    const row = el.querySelector('.evrow');
    ev.opts.forEach(([label, fn]) => {
      const b = document.createElement('button'); b.className = 'btn big'; b.textContent = label;
      b.onclick = () => infoScreen(ev.title, fn(), () => finishNode(n));
      row.appendChild(b);
    });
    UI.show('misc');
  }

  function infoScreen(title, text, next) {
    const el = $('screen-misc');
    el.innerHTML = `<div class="centerscreen"><h2>${esc(title)}</h2><div>${esc(text)}</div><button class="btn big" id="ok">Devam</button></div>`;
    $('ok').onclick = next;
    UI.show('misc');
  }

  function victory() { deleteSave(); legacyScreen(true); }
  function gameOver() { deleteSave(); legacyScreen(false); }

  UI.game = { newGameScreen, loadGame, hasSave, deleteSave };
  UI.debug = { get run() { return run; }, legacy: legacyScreen, deckEditor: () => deckEditor(() => mapScreen()), newRun, enterNode, openPack: code => openPack(code, () => {}), shop: () => shop(run.map.nodes[0]) };
  window.addEventListener('DOMContentLoaded', boot);
})();