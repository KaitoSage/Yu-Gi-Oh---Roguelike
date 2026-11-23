// Düello ekranı: saha çizimi, insan kontrolcüsü, fazlar, animasyonlu olay işleme.
(function () {
  const UI = (window.UI = window.UI || {});
  const { cardEl, esc } = UI;
  const sleep = ms => UI.sleep(ms * (UI.speedFactor || 1));

  const KIND_TR = { monster: 'Canavar', spell: 'Büyü', trap: 'Tuzak' };
  const PHASE_CHIPS = [['draw', 'DP'], ['standby', 'SP'], ['main1', 'M1'], ['battle', 'BP'], ['main2', 'M2'], ['end', 'EP']];

  UI.preview = function (d, fin) {
    const box = document.getElementById('preview');
    if (!box || !d) return;
    box.innerHTML = '';
    const big = cardEl(d, { size: 'big', pos: 'atk', finish: fin == null ? UI.finishOf(d.id) : fin, noTag: true });
    big.classList.add('fx-on');
    box.appendChild(big);
    const info = document.createElement('div');
    info.className = 'pname';
    info.textContent = UI.nm(d);
    box.appendChild(info);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:12px;color:#9a93c8;text-align:center';
    meta.textContent = d.kind === 'monster'
      ? `${d.attr} · ${d.race} · Lv${d.level} · ATK ${d.atk} / DEF ${d.def}`
      : `${KIND_TR[d.kind]} · ${d.race}`;
    box.appendChild(meta);
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = d.desc;
    box.appendChild(desc);
  };

  document.addEventListener('mouseover', e => {
    const c = e.target.closest && e.target.closest('.card[data-id]');
    if (c && UI.db && document.getElementById('preview')) {
      const own1 = c.dataset.owner === '1';
      UI.preview(UI.db.get(+c.dataset.id), own1 ? 0 : undefined);
    }
  });

  /**
   * Düelloyu başlatır. Promise<{winner}> (0=oyuncu, 1=rakip, null=berabere)
   * o: {deck, extra, enemyDeck, enemyExtra, enemyName, enemyTitle, startLP:[p,e], db}
   */
  UI.startDuel = function (o) {
    return new Promise(async resolveAll => {
      const root = document.getElementById('screen-duel');
      root.innerHTML = `
        <div id="duel">
          <div id="leftcol"><div id="preview"></div></div>
          <div id="board"></div>
          <div id="rightcol"><div id="rtop"></div><div id="log"></div><div id="rbot"></div></div>
        </div>`;
      UI.show('duel');
      const board = document.getElementById('board');
      const rtop = document.getElementById('rtop');
      const rbot = document.getElementById('rbot');
      const hud = root;
      document.getElementById('preview').innerHTML = '<div class="prevhint">Bir kartın üzerine gel:<br>tam boyut ve detay burada görünür.</div>';
      const logEl = document.getElementById('log');

      let d = null;
      let pendingResolve = null;
      let mode = null; // {type:'tribute'|'target'|'fieldpick', ...}
      let menuEl = null;
      let abandoned = false;
      const shownLP = [o.startLP[0], o.startLP[1]];
      const names = ['Sen', o.enemyName];

      const log = (t, cls = '') => {
        const l = document.createElement('div');
        l.className = cls; l.textContent = t;
        logEl.appendChild(l); logEl.scrollTop = logEl.scrollHeight;
      };

      function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
      const onDocDown = e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
      document.addEventListener('mousedown', onDocDown);

      function openMenu(anchor, items) {
        closeMenu();
        const m = document.createElement('div');
        m.className = 'actionmenu';
        for (const it of items) {
          const b = document.createElement('button');
          b.textContent = it.label;
          if (it.disabled) { b.disabled = true; b.title = it.disabled; b.style.opacity = .45; }
          b.onclick = () => { closeMenu(); UI.sfx('click'); it.fn(); };
          m.appendChild(b);
          if (it.disabled) { const s = document.createElement('div'); s.style.cssText = 'font-size:10px;color:#9a93c8;padding:0 6px'; s.textContent = it.disabled; m.appendChild(s); }
        }
        document.body.appendChild(m);
        const r = anchor.getBoundingClientRect();
        let x = r.right + 6, y = r.top;
        if (x + 220 > innerWidth) x = r.left - 220;
        if (y + m.offsetHeight > innerHeight) y = innerHeight - m.offsetHeight - 8;
        m.style.left = Math.max(8, x) + 'px'; m.style.top = Math.max(8, y) + 'px';
        menuEl = m;
      }

      const submit = a => { if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r(a); } };
      const myTurn = () => d && !d.over && d.active === 0 && !!pendingResolve && !mode;

      // Gizli bilgi: rakibin kapalı/eldeki/destedeki kartları sırt olarak görünür
      const hiddenFromMe = c => {
        if (c.owner === 0) return false;
        const loc = d.locate(c);
        if (!loc) return false;
        if (['hand', 'deck', 'extra'].includes(loc.kind)) return true;
        return (loc.kind === 'mz' || loc.kind === 'st' || loc.kind === 'field') && !c.up;
      };

      // ---------- Çizim ----------
      function lpBar(p) {
        const max = Math.max(o.startLP[p], 4000);
        const pct = Math.max(0, Math.min(100, (shownLP[p] / max) * 100));
        return `<div class="lpbar ${pct < 30 ? 'low' : ''}" data-lp="${p}"><div class="fill" style="width:${pct}%"></div><div class="txt">${shownLP[p]} LP</div></div>`;
      }

      function emptyZone(cls = '', label = '') {
        const z = document.createElement('div');
        z.className = 'zone ' + cls;
        if (label) z.innerHTML = `<span class="zlabel">${label}</span>`;
        return z;
      }

      function zoneCard(c, p, zi, kind) {
        const mine = p === 0;
        const z = emptyZone(kind, kind === 'field' ? 'Saha' : '');
        if (!c) return z;
        z.querySelector('.zlabel') && z.querySelector('.zlabel').remove();
        const down = !c.up;
        const el = cardEl(c, { size: 'field', down: down && !mine, pos: c.pos });
        if (down && mine) {
          el.querySelector('.card-inner').style.filter = 'brightness(.55) saturate(.7)';
          el.dataset.id = c.d.id;
        }
        z.appendChild(el);
        if (kind === 'mz' && c.up) {
          const a = d.atk(c), df = d.def(c);
          const chip = document.createElement('div');
          chip.className = 'stat ' + ((a > c.d.atk || df > c.d.def) ? 'up' : (a < c.d.atk || df < c.d.def) ? 'down' : '');
          chip.textContent = c.pos === 'atk' ? `ATK ${a}` : `DEF ${df}`;
          z.appendChild(chip);
        }
        el.dataset.zone = zi; el.dataset.owner = p; el.dataset.kind = kind;
        el.onclick = ev => { ev.stopPropagation(); onFieldClick(c, p, zi, kind, el); };
        return z;
      }

      // Deste / Extra deck: yığılmış kart sırtları
      function stackPile(label, n, cls, onclick) {
        const z = emptyZone('pile ' + cls);
        const layers = n > 0 ? Math.min(5, 1 + Math.floor(n / 6)) : 0;
        for (let i = 0; i < layers; i++) {
          const b = UI.backEl(cls);
          b.style.transform = `translate(${-i * 1.6}px, ${-i * 1.6}px)`;
          z.appendChild(b);
        }
        const lab = document.createElement('div');
        lab.className = 'pilelabel';
        lab.innerHTML = `${label}<b>${n}</b>`;
        z.appendChild(lab);
        if (onclick && n > 0) { z.classList.add('clickable'); z.onclick = onclick; }
        return z;
      }

      // Mezarlık: üst üste yığılmış açık kartlar (en üstteki görünür)
      function gravePile(p) {
        const P = d.P(p);
        const z = emptyZone('pile grave');
        const n = P.grave.length;
        if (n) {
          const layers = Math.min(4, n);
          for (let i = 0; i < layers; i++) {
            const c = P.grave[n - 1 - (layers - 1 - i)];
            const el = cardEl(c, { size: 'field', pos: 'atk', noTag: i !== layers - 1 });
            el.classList.add('gcard');
            el.style.position = 'absolute';
            el.style.transform = `translate(${(i - layers + 1) * 2.5}px, ${(i - layers + 1) * 2.5}px) rotate(${((i * 37) % 5) - 2}deg)`;
            el.style.zIndex = i;
            if (i !== layers - 1) { el.style.pointerEvents = 'none'; el.querySelector('.card-inner').style.filter = 'brightness(.75)'; }
            el.dataset.owner = p;
            z.appendChild(el);
          }
          z.classList.add('clickable');
          z.onclick = () => UI.chooseCards(P.grave.slice().reverse(), `${names[p]} — Mezarlık (${n})`, { viewOnly: true });
        }
        const lab = document.createElement('div');
        lab.className = 'pilelabel';
        lab.innerHTML = `Mezarlık<b>${n}</b>`;
        z.appendChild(lab);
        return z;
      }

      // Tam playmat (889x1500 birim). Slotlar [merkezX, merkezY, genişlik, yükseklik].
      // Rakip: üst yarı (uzak sıra = büyü/tuzak, yakın sıra = canavar). Ben: alt yarı (üst sıra = canavar, alt sıra = büyü/tuzak).
      const MAT_W = 889, MAT_H = 1500;
      const SLOTS = {
        opp: {
          deck: [90.5, 281.5, 111, 163], os0: [269.5, 325, 121, 184], os1: [445, 325, 120, 184], os2: [619, 325, 122, 184], extra: [799, 281.5, 112, 163],
          grave: [86.5, 572, 119, 180], om0: [269.5, 537.5, 121, 185], om1: [445, 537.5, 120, 185], om2: [619, 537.5, 122, 185], field: [802, 572, 118, 180],
        },
        me: {
          field: [90.5, 939.5, 111, 163], m0: [269.5, 983.5, 121, 185], m1: [445, 983.5, 120, 185], m2: [619, 983.5, 122, 185], grave: [799, 939.5, 112, 163],
          extra: [86.5, 1231, 119, 180], s0: [269.5, 1196, 121, 186], s1: [445, 1196, 120, 186], s2: [619, 1196, 122, 186], deck: [802, 1231, 118, 180],
        },
      };
      function place(z, side, key) {
        const [x, y, w, h] = SLOTS[side][key];
        z.classList.add('slot');
        z.style.left = (x / MAT_W * 100) + '%';
        z.style.top = (y / MAT_H * 100) + '%';
        z.style.width = (w / MAT_W * 100) + '%';
        z.style.height = (h / MAT_H * 100) + '%';
        return z;
      }

      // Mor gradient katmanı: slotların iç kısmı delik (gradient kartlara/slotlara işlemez)
      const maskSvg = (() => {
        let path = `M0 0H${MAT_W}V${MAT_H}H0Z`;
        for (const side of ['opp', 'me']) for (const [x, y, w, h] of Object.values(SLOTS[side])) {
          const pad = 3, x0 = x - w / 2 - pad, y0 = y - h / 2 - pad, x1 = x + w / 2 + pad, y1 = y + h / 2 + pad;
          path += `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
        }
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${MAT_W} ${MAT_H}' preserveAspectRatio='none'><path fill-rule='evenodd' d='${path}'/></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      })();

      function matSide(p) {
        const P = d.P(p);
        const side = p === 0 ? 'me' : 'opp';
        const frag = document.createDocumentFragment();
        const add = (key, z) => frag.appendChild(place(z, side, key));
        const mk = i => (p === 0 ? 'm' : 'om') + i, sk = i => (p === 0 ? 's' : 'os') + i;
        add('field', zoneCard(P.field, p, 0, 'field'));
        for (let i = 0; i < 3; i++) add(mk(i), zoneCard(P.mz[i], p, i, 'mz'));
        add('grave', gravePile(p));
        add('extra', stackPile('Extra', P.extra.length, 'extra', p === 0 ? () => UI.chooseCards(P.extra, 'Extra Deck', { viewOnly: true }) : null));
        for (let i = 0; i < 3; i++) add(sk(i), zoneCard(P.st[i], p, i, 'st'));
        add('deck', stackPile('Deste', P.deck.length, 'deck', null));
        return frag;
      }

      function phaseBar() {
        const bar = document.createElement('div');
        bar.className = 'phasebar';
        const ok = myTurn() ? (YGO.NEXT_OK[d.phase] || []) : [];
        for (const [ph, label] of PHASE_CHIPS) {
          const c = document.createElement('div');
          c.className = 'phasechip' + (d.phase === ph ? ' cur' : '') + (d.active === 1 && d.phase === ph ? ' opp' : '');
          c.textContent = label;
          c.title = YGO.PHASE_TR[ph];
          const can = ok.includes(ph) && !(ph === 'battle' && d.turn === 1);
          if (can) { c.classList.add('go'); c.onclick = () => { UI.sfx('click'); closeMenu(); submit({ type: 'phase', to: ph }); }; }
          bar.appendChild(c);
        }
        return bar;
      }

      function render() {
        if (!d) return;
        const O = d.P(1), M = d.P(0);

        // ----- Sağ sütun: rakip bilgisi (üst), oyuncu bilgisi + kontroller (alt) -----
        rtop.innerHTML = `<div class="pinfo"><div class="name">${esc(names[1])}</div>${lpBar(1)}<div class="meta">El: ${O.hand.length} · Deste: ${O.deck.length} · Mezarlık: ${O.grave.length}</div></div>`;
        rbot.innerHTML = `<div class="pinfo"><div class="name">${esc(names[0])}</div>${lpBar(0)}<div class="meta">${YGO.PHASE_TR[d.phase]} · Deste: ${M.deck.length} · Mezarlık: ${M.grave.length}</div></div>`;
        const ctrl = document.createElement('div');
        ctrl.className = 'ctrlbox';
        const endBtn = document.createElement('button');
        endBtn.className = 'btn'; endBtn.textContent = 'Turu Bitir';
        endBtn.disabled = !myTurn();
        endBtn.onclick = () => { closeMenu(); submit({ type: 'end' }); };
        ctrl.appendChild(endBtn);
        const row2 = document.createElement('div'); row2.className = 'row2';
        const sur = document.createElement('button');
        sur.className = 'btn ghost'; sur.textContent = 'Teslim Ol';
        sur.onclick = () => { if (!d.over) { d.win(1, 'Teslim'); submit({ type: 'end' }); mode && mode.cancel && mode.cancel(); } };
        row2.appendChild(sur);
        const mnu = document.createElement('button');
        mnu.className = 'btn ghost'; mnu.textContent = '← Menü'; mnu.title = 'Düelloyu bırak, ana menüye dön';
        mnu.onclick = async () => {
          if (d.over || abandoned) return;
          if (!(await UI.confirm('Düelloyu bırakıp ana menüye dönülsün mü? Bu düello yok sayılır, harita son kayıtta kalır.', 'Menüye dön', 'Devam et'))) return;
          abandoned = true; d.over = true; closeMenu(); mode && mode.cancel && mode.cancel(); submit({ type: 'end' });
        };
        row2.appendChild(mnu);
        const mb = document.createElement('button');
        mb.className = 'btn ghost mutebtn'; mb.textContent = UI.isMuted() ? '🔇' : '🔊'; mb.title = 'Ses (M)';
        mb.onclick = () => UI.toggleMute();
        row2.appendChild(mb);
        ctrl.appendChild(row2);
        rbot.appendChild(ctrl);

        // ----- Faz çubuğu: iki saha arasındaki boşluk -----
        const gapEl = document.createElement('div');
        gapEl.className = 'phasegap';
        gapEl.appendChild(phaseBar());
        const gr = document.createElement('div'); gr.className = 'gaprow';
        const ti = document.createElement('div');
        ti.className = 'turninfo' + (d.active === 0 ? ' mine' : '');
        ti.textContent = `Tur ${d.turn} · ${d.active === 0 ? 'Senin turun' : names[1] + ' oynuyor'}`;
        gr.appendChild(ti);
        const nextMap = { main1: ['Battle Phase ▶', 'battle'], battle: ['Main Phase 2 ▶', 'main2'], main2: ['End Phase ▶', 'end'] };
        const nx = nextMap[d.phase];
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn';
        const t1 = d.phase === 'main1' && d.turn === 1;
        nextBtn.textContent = t1 ? 'End Phase ▶' : (nx ? nx[0] : '…');
        nextBtn.disabled = !myTurn() || !nx;
        nextBtn.onclick = () => { closeMenu(); UI.sfx('click'); submit({ type: 'phase', to: t1 ? 'end' : nx[1] }); };
        gr.appendChild(nextBtn);
        gapEl.appendChild(gr);
        if (mode) {
          const hint = document.createElement('div');
          hint.className = 'turninfo modehint';
          hint.textContent = mode.prompt + (mode.cancel ? '  (Esc: iptal)' : '');
          gapEl.appendChild(hint);
        }

        // ----- Playmat -----
        board.innerHTML = '';
        const mat = document.createElement('div');
        mat.className = 'mat';
        const tint = document.createElement('div');
        tint.className = 'mattint';
        tint.style.webkitMaskImage = maskSvg; tint.style.maskImage = maskSvg;
        mat.appendChild(tint);
        mat.appendChild(matSide(1));
        mat.appendChild(matSide(0));
        board.appendChild(mat);
        board.appendChild(gapEl);

        const oh = document.createElement('div');
        oh.className = 'handrow opp';
        const shown = d.handRevealed(1); // Ceremonial Bell / Mind on Air / Respect Play / The Eye of Truth: rakibin eli açık
        for (let i = 0; i < O.hand.length; i++) oh.appendChild(shown ? cardEl(O.hand[i], { size: 'hand' }) : UI.backEl('mini'));
        board.appendChild(oh);

        const mh = document.createElement('div');
        mh.className = 'handrow me';
        M.hand.forEach((c, i) => {
          const el = cardEl(c, { size: 'hand' });
          el.classList.add('clickable');
          el.onclick = ev => { ev.stopPropagation(); onHandClick(c, i, el); };
          mh.appendChild(el);
        });
        board.appendChild(mh);

        if (mode && mode.type === 'tribute') {
          board.querySelectorAll('.zone.mz .card[data-owner="0"]').forEach(el => {
            el.classList.add('glow-target');
            if (mode.sel.includes(+el.dataset.zone)) el.classList.add('selected');
          });
        }
        if (mode && mode.type === 'target') board.querySelectorAll('.zone.mz .card[data-owner="1"]').forEach(el => el.classList.add('glow-target'));
        if (mode && mode.type === 'fieldpick') {
          board.querySelectorAll('.card[data-uid]').forEach(el => { if (mode.set.has(+el.dataset.uid)) el.classList.add('glow-target'); });
        }
      }

      // ---------- Etkileşim ----------
      function onHandClick(c, i, el) {
        if (mode) return;
        if (!myTurn()) { UI.toast('Şu an hamle yapamazsın'); return; }
        const items = [];
        if (c.d.kind === 'monster' && YGO.FX[c.d.name] && YGO.FX[c.d.name].handSummon) {
          const r = d.canHandSummon(0, i);
          const need = r.need ?? 0;
          items.push({ label: need ? `Özel Çağır (${need} tribute)` : 'Özel Çağır', disabled: r.ok ? null : r.err, fn: async () => {
            let tributes = [];
            if (need) { tributes = await pickTributes(need); if (!tributes) return; }
            submit({ type: 'hsummon', hand: i, tributes });
          } });
        }
        const he = c.d.kind === 'monster' && YGO.FX[c.d.name] && YGO.FX[c.d.name].handEffect;
        if (he) { const ck = d.canHandEffect(0, i); items.push({ label: `Efekt: ${he.label || 'Kullan'}`, disabled: ck.ok ? null : ck.err, fn: () => submit({ type: 'heffect', hand: i }) }); }
        const fxh = c.d.kind === 'monster' && YGO.FX[c.d.name] && YGO.FX[c.d.name].handSummon ? YGO.FX[c.d.name] : null;
        if (c.d.kind === 'monster' && /Ritual/.test(c.d.type)) {
          items.push({ label: 'Ritual Summon', disabled: 'Elindeki Ritual Büyüsünü aktive et (Büyü kartına tıkla)', fn: () => {} });
        } else if (c.d.kind === 'monster' && fxh && !fxh.alsoNormal) {
          // yalnızca Özel Çağırma
        } else if (c.d.kind === 'monster') {
          const r = d.canSummon(0, i);
          const need = r.need ?? 0;
          items.push({ label: need ? `Tribute Summon (${need})` : 'Normal Summon', disabled: r.ok ? null : r.err, fn: () => doSummon(i, need, false) });
          items.push({ label: need ? `Set (${need} tribute)` : 'Set (kapalı savunma)', disabled: r.ok ? null : r.err, fn: () => doSummon(i, need, true) });
        } else if (c.d.kind === 'spell') {
          const ok = d.canActivateFromHand(0, i);
          const why = !d.inMain() ? 'Sadece Main Phase\'de' : (!YGO.FX[c.d.name] ? 'Bu kartın efekti henüz kodlanmadı' : (YGO.isFieldSpell(c) ? 'Şu an aktive edilemez' : (d.freeZone(0, 'st') < 0 ? 'Büyü/Tuzak bölgesi dolu' : 'Şartlar sağlanmıyor')));
          items.push({ label: 'Aktive Et', disabled: ok ? null : why, fn: () => submit({ type: 'activate', hand: i }) });
          items.push({ label: 'Set', disabled: d.canSetST(0, i) ? null : (d.inMain() ? 'Bölge dolu' : 'Sadece Main Phase\'de'), fn: () => submit({ type: 'set', hand: i }) });
        } else {
          items.push({ label: 'Set', disabled: d.canSetST(0, i) ? null : (d.inMain() ? 'Bölge dolu' : 'Sadece Main Phase\'de'), fn: () => submit({ type: 'set', hand: i }) });
        }
        openMenu(el, items);
      }

      async function doSummon(i, need, set) {
        let tributes = [];
        if (need) {
          tributes = await pickTributes(need, d.P(0).hand[i]);
          if (!tributes) return;
        }
        submit({ type: set ? 'set' : 'summon', hand: i, tributes });
      }

      // card verilirse çift tribute sayılan canavarlar (Double Coston...) toplam değere göre seçilir
      function pickTributes(n, card) {
        return new Promise(res => {
          mode = { type: 'tribute', need: n, card, sel: [], prompt: `Tribute seç (${n})`, res, cancel: () => { mode = null; render(); res(null); } };
          render();
        });
      }

      function onFieldClick(c, p, zi, kind, el) {
        if (mode && mode.type === 'fieldpick') {
          if (mode.set.has(c.uid)) { const m = mode; mode = null; UI.sfx('click'); m.res(c); }
          return;
        }
        if (mode && mode.type === 'tribute') {
          if (p !== 0 || kind !== 'mz') return;
          const k = mode.sel.indexOf(zi);
          if (k >= 0) mode.sel.splice(k, 1); else mode.sel.push(zi);
          const val = mode.sel.reduce((s, z) => s + (mode.card && d.P(0).mz[z] ? d.tribVal(mode.card, d.P(0).mz[z]) : 1), 0);
          if (val >= mode.need) { const m = mode; mode = null; m.res(m.sel); } else render();
          return;
        }
        if (mode && mode.type === 'target') {
          if (p === 1 && kind === 'mz') { const m = mode; mode = null; m.res(zi); }
          return;
        }
        if (p === 1 || !myTurn()) return;
        const items = [];
        if (kind === 'mz') {
          const atk = d.canAttack(0, zi);
          items.push({ label: 'Saldır', disabled: atk.ok ? null : atk.err, fn: () => doAttack(zi) });
          const mainOk = d.inMain();
          const ab = c.up && YGO.FX[c.d.name] && YGO.FX[c.d.name].ability;
          if (ab) { const ck = d.canAbility(0, zi); items.push({ label: `Efekt: ${ab.label || 'Kullan'}`, disabled: ck.ok ? null : ck.err, fn: () => submit({ type: 'ability', zone: zi }) }); }
          if (!c.up) {
            items.push({ label: 'Flip Summon', disabled: !mainOk ? 'Sadece Main Phase\'de' : ((c.placedTurn === d.turn || c.moved) ? 'Bu tur çevrilemez' : null), fn: () => submit({ type: 'pos', zone: zi }) });
          } else {
            items.push({ label: c.pos === 'atk' ? 'Savunmaya Geç' : 'Saldırıya Geç', disabled: !mainOk ? 'Sadece Main Phase\'de' : ((c.moved || c.attacked) ? 'Bu tur değişti/saldırdı' : null), fn: () => submit({ type: 'pos', zone: zi }) });
          }
        } else if (kind === 'st' || kind === 'field') {
          const sab = c.up && YGO.FX[c.d.name] && YGO.FX[c.d.name].stAb; // Union çöz, Pitch-Black Power Stone, Ultimate Offering, Fusion Gate...
          if (sab) sab.forEach((ab, i) => { const ck = d.canStAbility(0, kind, zi, i); items.push({ label: `Efekt: ${ab.label || 'Kullan'}`, disabled: ck.ok ? null : ck.err, fn: () => submit(kind === 'field' ? { type: 'stability', field: true, i } : { type: 'stability', st: zi, i }) }); });
          if (!c.up && c.d.kind === 'spell') items.push({ label: 'Aktive Et', disabled: (d.inMain() || (d.phase === 'battle' && d.isQuickSpell(c))) ? (d.isQuickSpell(c) && c.placedTurn >= d.turn ? 'Quick-Play: set edildiği tur aktive edilemez' : null) : (d.isQuickSpell(c) ? 'Quick-Play: Main/Battle Phase\'de' : 'Sadece Main Phase\'de'), fn: () => submit(kind === 'field' ? { type: 'activate', field: true } : { type: 'activate', st: zi }) });
          else if (!c.up && c.d.kind === 'trap') {
            const tf = YGO.FX[c.d.name];
            if (tf && tf.manual) items.push({ label: 'Tuzağı Aktive Et', disabled: !d.inMain() ? 'Sadece Main Phase\'de' : (c.placedTurn >= d.turn ? 'Set edildiği tur aktive edilemez' : (tf.can && !tf.can(d, 0, c) ? 'Şartlar sağlanmıyor' : null)), fn: () => submit({ type: 'activate', st: zi }) });
            else items.push({ label: 'Tuzak: rakip hamlesinde sorulur', disabled: 'Otomatik tetiklenir', fn: () => {} });
          }
        }
        if (items.length) openMenu(el, items);
      }

      async function doAttack(zi) {
        if (!d.P(1).mz.some(Boolean)) { submit({ type: 'attack', zone: zi, target: 'direct' }); return; }
        if (d.canDirect(0, d.P(0).mz[zi]) && await UI.confirm('Bu canavar direkt saldırabilir. Direkt saldırılsın mı?', 'Direkt saldır', 'Hedef seç')) { submit({ type: 'attack', zone: zi, target: 'direct' }); return; }
        const t = await new Promise(res => {
          mode = { type: 'target', prompt: 'Saldırı hedefini seç', res, cancel: () => { mode = null; render(); res(null); } };
          render();
        });
        if (t == null) return;
        submit({ type: 'attack', zone: zi, target: t });
      }

      const onKey = e => { if (e.key === 'Escape') { closeMenu(); if (mode && mode.cancel) mode.cancel(); } };
      document.addEventListener('keydown', onKey);
      const onCtx = e => { if (mode && mode.cancel) { e.preventDefault(); mode.cancel(); } };
      document.addEventListener('contextmenu', onCtx);

      // ---------- Animasyon / olaylar ----------
      const byUid = c => c && board.querySelector(`.card[data-uid="${c.uid}"]`);
      function floatNum(p, text, cls) {
        const bar = hud.querySelector(`.lpbar[data-lp="${p}"]`);
        if (!bar) return;
        const r = bar.getBoundingClientRect();
        const f = document.createElement('div');
        f.className = 'floatnum ' + cls; f.textContent = text;
        f.style.left = (r.left + r.width / 2 - 30) + 'px'; f.style.top = (r.top - 10) + 'px';
        document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
      }
      function banner(t) {
        const b = document.createElement('div'); b.className = 'banner'; b.textContent = t;
        document.body.appendChild(b); setTimeout(() => b.remove(), 1700);
      }
      function shakeBoard() { board.classList.remove('boardshake'); void board.offsetWidth; board.classList.add('boardshake'); }
      const who = p => (p === 0 ? 'Sen' : names[1]);
      const N = c => UI.nm(c.d);

      async function onEvent(ev) {
        const cls = ev.p === 0 ? 'me' : ev.p === 1 ? 'opp' : '';
        switch (ev.type) {
          case 'start': render(); banner('DÜELLO!'); log(`${names[1]} ile düello başladı.`, 'sys'); await sleep(900); return;
          case 'turn': render(); log(`— Tur ${ev.turn}: ${who(ev.p)} —`, 'sys'); await sleep(200); return;
          case 'phase': render(); UI.sfx('phase'); if (ev.phase === 'draw' || ev.phase === 'standby') log(YGO.PHASE_TR[ev.phase], 'sys'); await sleep(ev.p === 0 ? 220 : 280); return;
          case 'draw': render(); UI.sfx('draw'); if (ev.p === 0) log(`Çektin: ${N(ev.card)}`, 'me'); await sleep(ev.p === 0 ? 250 : 120); return;
          case 'summon': {
            render();
            const el = byUid(ev.card);
            const fus = ev.special && ev.card.d.type === 'Fusion Monster';
            const rit = ev.special && /Ritual/.test(ev.card.d.type);
            const legend = ev.p === 0 && ev.card.d.of && el; // Overframe kart: özel sinematik
            if (!legend) { if (el) el.classList.add('summon-in'); UI.sfx(fus ? 'fusion' : 'summon'); }
            log(`${who(ev.p)}: ${N(ev.card)} ${fus ? 'Fusion Summon' : rit ? 'Ritual Summon' : ev.special ? 'Special Summon' : 'Normal Summon'}`, cls);
            if (legend) { await UI.legendSummon(ev.card, el); await sleep(120); return; }
            if (fus || rit) await UI.cutin(ev.card, fus ? 'FUSION SUMMON!' : 'RITUAL SUMMON!', 1000);
            await sleep(ev.special ? 200 : 520); return;
          }
          case 'coin': case 'dice': render(); log(`${who(ev.p)}: ${ev.type === 'coin' ? 'Yazı-tura' : 'Zar'} → ${ev.type === 'coin' ? ev.results.map(r => (r ? 'Yazı' : 'Tura')).join(', ') : ev.results.join(', ')}`, cls); await UI.chanceFx(ev.type, ev.results, who(ev.p)); return;
          case 'set': render(); UI.sfx('set'); log(`${who(ev.p)}: bir canavar set etti.`, cls); await sleep(380); return;
          case 'setST': render(); UI.sfx('set'); log(`${who(ev.p)}: bir kart set etti.`, cls); await sleep(380); return;
          case 'flipSummon': render(); UI.sfx('summon'); log(`${who(ev.p)}: ${N(ev.card)} Flip Summon`, cls); { const e = byUid(ev.card); e && e.classList.add('summon-in'); } await sleep(520); return;
          case 'flip': render(); UI.sfx('trap'); log(`${N(ev.card)} açıldı!`, cls); { const e = byUid(ev.card); e && e.classList.add('flash'); } await sleep(520); return;
          case 'pos': render(); UI.sfx('click'); log(`${N(ev.card)} pozisyon değiştirdi.`, cls); await sleep(300); return;
          case 'activate': render(); UI.sfx('spell'); log(`${who(ev.p)}: ${N(ev.card)} aktive etti.`, cls); await UI.cutin(ev.card, null, 800); return;
          case 'trap': render(); UI.sfx('trap'); log(`${who(ev.p)}: Tuzak! ${N(ev.card)}`, cls); await UI.cutin(ev.card, 'TUZAK AKTİF!', 950); return;
          case 'ability': render(); UI.sfx('spell'); log(`${who(ev.p)}: ${N(ev.card)} efektini kullandı.`, cls); await sleep(500); return;
          case 'control': render(); UI.sfx('trap'); log(`${N(ev.card)}: kontrol ${who(ev.p)} tarafına geçti.`, cls); await sleep(500); return;
          case 'equip': render(); log(`${N(ev.card)} → ${N(ev.target)}`, cls); await sleep(400); return;
          case 'search': render(); UI.sfx('draw'); log(`${who(ev.p)}: ${ev.p === 0 ? N(ev.card) : 'bir kart'} ele eklendi.`, cls); await sleep(400); return;
          case 'attack': {
            const a = byUid(ev.attacker);
            if (a) a.classList.add(ev.p === 0 ? 'lunge-up' : 'lunge-down');
            UI.sfx('attack');
            log(`${who(ev.p)}: ${N(ev.attacker)} saldırıyor${ev.target === 'direct' ? ' (direkt)' : ''}!`, cls);
            await sleep(520); return;
          }
          case 'impact': { const t = byUid(ev.target); if (t) t.classList.add('slash'); UI.sfx('hit'); shakeBoard(); await sleep(260); return; }
          case 'destroy': { const e = byUid(ev.card); if (e) e.classList.add('destroy-fx'); UI.sfx('destroy'); log(`${N(ev.card)} yok edildi.`); await sleep(520); render(); return; }
          case 'toGrave': render(); if (ev.why === 'tribute' || ev.why === 'discard' || ev.why === 'fusion') log(`${N(ev.card)} mezarlığa gitti.`); await sleep(120); return;
          case 'bounce': render(); UI.sfx('draw'); log(`${N(ev.card)} ele döndü.`); await sleep(400); return;
          case 'banish': render(); await sleep(200); return;
          case 'damage': {
            floatNum(ev.p, '-' + ev.amount, 'dmg'); UI.sfx('damage'); shakeBoard();
            log(`${who(ev.p)} ${ev.amount} hasar aldı.`, cls);
            shownLP[ev.p] = d.P(ev.p).lp; render();
            const bar = hud.querySelector(`.lpbar[data-lp="${ev.p}"]`); if (bar) bar.classList.add('shake');
            await sleep(750); return;
          }
          case 'heal': floatNum(ev.p, '+' + ev.amount, 'heal'); UI.sfx('heal'); log(`${who(ev.p)} ${ev.amount} LP kazandı.`, cls); shownLP[ev.p] = d.P(ev.p).lp; render(); await sleep(600); return;
          case 'end': render(); UI.sfx(ev.winner === 0 ? 'win' : 'lose'); banner(ev.winner === 0 ? 'ZAFER!' : ev.winner === 1 ? 'YENİLDİN' : 'BERABERE'); log(`Düello bitti: ${ev.reason}`, 'sys'); await sleep(1800); return;
          default: render(); await sleep(100);
        }
      }

      // ---------- Kontrolcüler ----------
      const human = {
        act() { return new Promise(res => { pendingResolve = res; render(); }); },
        error(msg) { UI.toast(msg); },
        async pick(dd, p, cands, prompt) {
          render();
          const cs = cands.map(x => x.card);
          // Hepsi sahadaysa sahada tıklayarak seç; değilse pencere
          if (cs.length && cs.every(c => dd.onField(c))) {
            return new Promise(res => {
              mode = { type: 'fieldpick', set: new Set(cs.map(c => c.uid)), prompt, res, cancel: null };
              render();
            });
          }
          return UI.chooseCards(cs, prompt, { hidden: hiddenFromMe });
        },
        async choose(dd, p, title, options) {
          render();
          return new Promise(res => {
            const dlg = UI.modal(`<h3>${esc(title)}</h3><div style="display:flex;flex-wrap:wrap;gap:8px;max-width:420px">${options.map((o, i) => `<button class="btn" data-i="${i}">${esc(String(o))}</button>`).join('')}</div>`);
            dlg.querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => { UI.closeModal(); res(options[+b.dataset.i]); }; });
          });
        },
        async confirmTrap(dd, p, card, ctx) {
          render();
          return new Promise(res => {
            const dlg = UI.modal(`<h3>${ctx.text ? 'Efekti aktive et?' : 'Tuzağını aktive et?'}</h3><div style="display:flex;gap:18px;align-items:center"><div id="tc"></div><div style="max-width:280px"><b>${esc(UI.nm(card.d))}</b><p style="color:#9a93c8;font-size:13px">${esc(card.d.desc)}</p>
              <p>${ctx.text ? esc(ctx.text) : ctx.attacker ? `Saldıran: <b>${esc(ctx.attacker.d.name)}</b>` : ctx.monster ? `Çağrılan: <b>${esc(ctx.monster.d.name)}</b>` : ctx.spell ? `Aktive edilen Büyü: <b>${esc(ctx.spell.d.name)}</b>` : ''}</p></div></div>
              <div style="margin-top:14px;display:flex;gap:10px"><button class="btn" id="ty">Aktive Et</button><button class="btn ghost" id="tn">Hayır</button></div>`);
            const el = cardEl(card.d, { size: 'mid', finish: UI.finishOf(card.d.id) }); dlg.querySelector('#tc').appendChild(el); el.classList.add('fx-on');
            dlg.querySelector('#ty').onclick = () => { UI.closeModal(); res(true); };
            dlg.querySelector('#tn').onclick = () => { UI.closeModal(); res(false); };
          });
        },
      };

      d = new YGO.Duel({
        decks: [o.deck, o.enemyDeck],
        extras: [o.extra || [], o.enemyExtra || []],
        db: o.db,
        ctl: [human, YGO.makeAI()],
        onEvent,
        startLP: o.startLP,
        first: 0,
      });
      UI.currentDuel = d;
      const res = await d.run();
      res.abandoned = abandoned;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('mousedown', onDocDown);
      closeMenu();
      resolveAll(res);
    });
  };
})();