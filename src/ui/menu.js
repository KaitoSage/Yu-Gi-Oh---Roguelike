// Ana menü, ayarlar ve kart dükkânı (katalog) ekranları.
(function () {
  const UI = (window.UI = window.UI || {});
  const { esc, cardEl } = UI;
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------- ayarlar
  const DEF = { volume: 0.8, speed: 'normal' };
  const SPEED = { slow: 1.5, normal: 1, fast: 0.5 };
  UI.settings = Object.assign({}, DEF);
  try { Object.assign(UI.settings, JSON.parse(localStorage.getItem('ygo_settings') || '{}')); } catch (e) {}
  UI.applySettings = () => { UI.setVolume(UI.settings.volume); UI.speedFactor = SPEED[UI.settings.speed] || 1; };
  UI.saveSettings = () => { try { localStorage.setItem('ygo_settings', JSON.stringify(UI.settings)); } catch (e) {} UI.applySettings(); };
  UI.applySettings();

  // ---------------------------------------------------------- ana menü
  UI.mainMenu = function () {
    const g = UI.game;
    const hasSave = g && g.hasSave();
    const el = $('screen-title');
    el.innerHTML = `
      <div class="menu-bg"></div><div class="menu-shade"></div>
      <div class="menu-content" lang="en">
        <div class="menu-logo"><div class="l1">YU-GI-OH!</div><div class="l2">ROGUELIKE</div><div class="l3">Duel Monsters</div></div>
        <div class="menu-buttons">
          <button class="mbtn" id="m-new">New Game</button>
          <button class="mbtn" id="m-load" ${hasSave ? '' : 'disabled'}>Load Game${hasSave ? '' : '<small>kayıt yok</small>'}</button>
          <button class="mbtn" id="m-shop">Card Shop</button>
          <button class="mbtn" id="m-col">Card Collection</button>
          <button class="mbtn" id="m-set">Settings</button>
          <button class="mbtn" id="m-quit">Quit</button>
        </div>
        <div class="menu-foot">Kişisel prototip · ses: M</div>
      </div>`;
    $('m-new').onclick = () => { UI.sfx('click'); g.newGameScreen(); };
    $('m-load').onclick = () => { UI.sfx('click'); g.loadGame(); };
    $('m-shop').onclick = () => { UI.sfx('click'); UI.cardShop(); };
    $('m-col').onclick = () => { UI.sfx('click'); UI.collection(); };
    $('m-set').onclick = () => { UI.sfx('click'); UI.settingsScreen(); };
    $('m-quit').onclick = () => {
      if (window.api && window.api.quit) window.api.quit();
      else { try { window.close(); } catch (e) {} UI.toast('Tarayıcı önizlemesinde pencere kapatılamaz'); }
    };
    UI.show('title');
  };

  // ---------------------------------------------------------- ayarlar ekranı
  UI.settingsScreen = function () {
    const el = $('screen-settings');
    const s = UI.settings;
    el.innerHTML = `<div class="panelpage"><h2 lang="en">Settings</h2>
      <div class="setrow"><label>Ses</label><button class="btn ghost mutebtn" id="s-mute">${UI.isMuted() ? '🔇 Kapalı' : '🔊 Açık'}</button></div>
      <div class="setrow"><label>Ses seviyesi</label><input type="range" id="s-vol" min="0" max="100" value="${Math.round(s.volume * 100)}"><span id="s-volv">${Math.round(s.volume * 100)}%</span></div>
      <div class="setrow"><label>Düello animasyon hızı</label><div class="seg" id="s-speed">
        <button data-v="slow">Yavaş</button><button data-v="normal">Normal</button><button data-v="fast">Hızlı</button></div></div>
      <div class="setrow"><label>Tam ekran</label><button class="btn ghost" id="s-full">Aç / Kapat</button></div>
      <div class="setrow"><label>Kayıtlı oyun</label><button class="btn ghost" id="s-del" ${UI.game.hasSave() ? '' : 'disabled'}>Kaydı sil</button></div>
      <div style="margin-top:18px"><button class="btn big" id="s-back">← Geri</button></div></div>`;
    const markSpeed = () => el.querySelectorAll('#s-speed button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.settings.speed));
    markSpeed();
    $('s-mute').onclick = () => { UI.toggleMute(); $('s-mute').textContent = UI.isMuted() ? '🔇 Kapalı' : '🔊 Açık'; };
    $('s-vol').oninput = e => { s.volume = e.target.value / 100; $('s-volv').textContent = e.target.value + '%'; UI.saveSettings(); };
    $('s-vol').onchange = () => UI.sfx('summon');
    el.querySelectorAll('#s-speed button').forEach(b => b.onclick = () => { s.speed = b.dataset.v; UI.saveSettings(); markSpeed(); });
    $('s-full').onclick = () => {
      if (window.api && window.api.setFullscreen) window.api.setFullscreen(!document.fullscreenElement && !window.__fs).then(v => { window.__fs = v; });
      else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
    };
    $('s-del').onclick = () => { UI.game.deleteSave(); UI.toast('Kayıt silindi'); UI.settingsScreen(); };
    $('s-back').onclick = () => { UI.sfx('click'); UI.mainMenu(); };
    UI.show('settings', () => UI.mainMenu());
  };

  // ---------------------------------------------------------- Kart Dükkânı (şimdilik katalog)
  UI.catalogScreen = function (back) {
    back = back || (() => UI.mainMenu());
    const el = $('screen-catalog');
    const all = [...UI.db.values()].filter(c => !c.token);
    const state = { q: '', kind: 'all', rar: 'all', fin: 0, shown: 60 };
    el.innerHTML = `<div class="catwrap">
      <div class="hud"><b style="font-size:18px">Kart Kataloğu</b>
        ${UI.searchBox('c-q')}
        <select id="c-kind" class="inp"><option value="all">Hepsi</option><option value="monster">Canavar</option><option value="spell">Büyü</option><option value="trap">Tuzak</option><option value="fusion">Fusion</option><option value="ritual">Ritual</option></select>
        <select id="c-rar" class="inp"><option value="all">Nadirlik: hepsi</option><option>N</option><option>R</option><option>SR</option><option>UR</option><option>PR</option></select>
        <select id="c-fin" class="inp">${UI.FINISH_NAME.map((n, i) => `<option value="${i}">Foil: ${n}</option>`).join('')}</select>
        <div class="grow"></div><span id="c-count" style="color:#9a93c8"></span><button class="btn ghost" id="c-back">← Geri</button></div>
      <div class="catnote">Duel Monsters dönemindeki tüm kartlar (oyunda yalnızca efekti kodlanmış olanlar çıkar; durum kart detayında yazar). Karta tıkla: büyük görünüm.</div>
      <div class="catgrid" id="c-grid"></div></div>`;
    UI.initSearch(el);
    const grid = $('c-grid');
    const match = c => {
      if (state.q && !c.name.toLowerCase().includes(state.q)) return false;
      if (state.rar !== 'all' && c.rarity !== state.rar) return false;
      switch (state.kind) {
        case 'monster': return c.kind === 'monster';
        case 'spell': return c.kind === 'spell';
        case 'trap': return c.kind === 'trap';
        case 'fusion': return c.type === 'Fusion Monster';
        case 'ritual': return /Ritual/.test(c.type);
      }
      return true;
    };
    let list = [];
    const draw = (more) => {
      if (!more) { list = all.filter(match); state.shown = 60; grid.innerHTML = ''; grid.scrollTop = 0; }
      const from = more ? grid.querySelectorAll('.catcard').length : 0;
      list.slice(from, state.shown).forEach(c => {
        const w = document.createElement('div'); w.className = 'catcard';
        const e = cardEl(c, { size: 'mid', finish: state.fin }); e.classList.remove('def');
        e.onclick = () => UI.showCard(c, state.fin);
        const l = document.createElement('div'); l.className = 'catname'; l.textContent = c.name + (c.ban ? ` ⚠${c.ban === 'Forbidden' ? 'Yasaklı→1' : c.ban === 'Limited' ? 'Sınırlı' : '½'}` : '');
        w.append(e, l); grid.appendChild(w);
      });
      $('c-count').textContent = `${Math.min(state.shown, list.length)} / ${list.length} kart`;
    };
    grid.onscroll = () => {
      if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 300 && state.shown < list.length) { state.shown += 40; draw(true); }
    };
    $('c-q').oninput = e => { state.q = e.target.value.trim().toLowerCase(); draw(false); };
    $('c-kind').onchange = e => { state.kind = e.target.value; draw(false); };
    $('c-rar').onchange = e => { state.rar = e.target.value; draw(false); };
    $('c-fin').onchange = e => { state.fin = +e.target.value; draw(false); };
    $('c-back').onclick = () => { UI.sfx('click'); back(); };
    draw(false);
    UI.show('catalog', back);
  };
})();
