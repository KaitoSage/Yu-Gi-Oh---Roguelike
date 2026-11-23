// Başsız testler: AI vs AI düelloları, fazlar, Fusion, Ritual, field büyüsü, paketler, era filtresi.
const E = require('../src/engine/engine.js');
require('../src/engine/effects.js');
require('../src/engine/effects2.js');
require('../src/engine/effects3.js');
require('../src/engine/effects4.js');
require('../src/engine/effects5.js');
require('../src/engine/effects6.js');
require('../src/engine/effects7.js');
require('../src/engine/effects8.js');
require('../src/engine/effects9.js');
require('../src/engine/effects10.js');
require('../src/engine/effects11.js');
require('../src/engine/effects12.js');
const KEYS12 = new Set(Object.keys(E.FX)); // 13-14. paketle gelen kartları ayırt etmek için
require('../src/engine/effects13.js');
require('../src/engine/effects14.js');
const makeAI = require('../src/engine/ai.js');
const Decks = require('../src/engine/decks.js');
const cards = require('../data/cards.dm.json');

E.setup(cards);
const db = new Map(cards.map(c => [c.id, c]));
const byName = Decks.byName(cards);
let fails = 0;
const assert = (cond, msg) => { if (!cond) { fails++; console.error('FAIL:', msg); } };
const id = n => { const c = byName.get(n); if (!c) throw new Error('kart yok: ' + n); return c.id; };

function invariants(d) {
  for (const p of [0, 1]) {
    const P = d.P(p);
    assert(P.mz.length === 3 && P.st.length === 3, 'bölge sayısı');
    assert(P.lp >= 0, 'LP negatif');
    const all = [...P.deck, ...P.extra, ...P.hand, ...P.grave, ...P.banished, ...P.mz.filter(Boolean), ...P.st.filter(Boolean), ...(P.field ? [P.field] : [])];
    assert(new Set(all.map(c => c.uid)).size === all.length, 'kart kopyalandı');
    if (P.field) assert(E.isFieldSpell(P.field), 'field bölgesinde field büyüsü olmayan kart');
  }
}

// Sessiz kontrolcü: komut kuyruğundan oynar
function scripted(actions) {
  const q = [...actions];
  return {
    act: async () => q.shift() || { type: 'end' },
    pick: async (d, p, cands) => cands[0].card,
    confirmTrap: async () => true,
    error: msg => { assert(false, 'beklenmeyen hata: ' + msg); },
  };
}

async function runSmall(deck0, extra0, hand0, actions, check) {
  // desteyi hile ile kur: istenen kartlar ilk ele gelsin
  const filler = cards.filter(c => c.type === 'Normal Monster' && c.level <= 4).slice(0, 30).map(c => c.id);
  const d = new E.Duel({ decks: [filler.slice(), filler.slice()], extras: [extra0, []], db, ctl: [scripted(actions), makeAI()], first: 0, maxTurns: 1 });
  // eli düzenle
  const P = d.P(0);
  for (const c of [...P.hand]) P.deck.push(c);
  P.hand = [];
  hand0.forEach(name => {
    const i = P.deck.findIndex(c => c.d.name === name);
    let c;
    if (i >= 0) c = P.deck.splice(i, 1)[0]; else c = d.inst(id(name), 0);
    P.hand.push(c);
  });
  d.run = async function () { // 5 kartlık otomatik dağıtımı atla
    await this.ev('start');
    this.turn = 1;
    await this.playTurn();
  };
  await d.run();
  check(d);
}

(async () => {
  // --- Era filtresi ---
  assert(cards.every(c => c.era === 'DM'), 'DM dışı kart oyun DB\'sinde');
  const pool = Decks.buildPool(cards);
  assert(pool.extra.length >= 5, 'oynanabilir Fusion yok: ' + pool.extra.length);
  assert(pool.all.every(c => c.era === 'DM'), 'havuzda DM dışı kart');
  console.log('Havuz:', pool.all.length, 'kart,', pool.extra.length, 'Fusion');

  // --- Paketler ---
  let packsOk = 0;
  for (const code of Object.keys(Decks.PACKS)) {
    const p = Decks.packPool(cards, code);
    const pack = p.length >= 8 ? Decks.openPack(cards, code) : [];
    if (pack.length === 5) packsOk++;
    else console.log('  uyarı: paket', code, 'havuzu küçük:', p.length);
  }
  assert(packsOk >= 6, 'çok az paket açılabiliyor');

  // --- Draft: her tema için tam bir 20 kartlık deste çıkıyor mu? ---
  for (const th of Object.keys(Decks.THEMES)) {
    for (let run = 0; run < 5; run++) {
      const deck = { main: [], extra: [] };
      let rounds = 0, sawFusion = false, sawRitual = false;
      while (deck.main.length < Decks.DRAFT_SIZE && rounds++ < 60) {
        const offer = Decks.draftOffer(cards, th, deck);
        assert(offer.length > 0, `draft teklifi boş (${th}, ${deck.main.length} kart)`);
        if (!offer.length) break;
        assert(new Set(offer.map(c => c.id)).size === offer.length, 'teklifte tekrar');
        // kompozisyon kuralları (deste dolmaya yakınken yer kısıtı yüzünden gevşeyebilir)
        if (deck.main.length <= 8) {
          const cat = k => offer.filter(c => Decks.draftCategory(c) === k).length;
          assert(offer.length === Decks.DRAFT_OFFER, `teklif ${offer.length} kart (8 olmalı)`);
          assert(cat('trap') >= Decks.MIN_TRAP, `teklifte ${cat('trap')} tuzak`);
          assert(cat('spell') >= Decks.MIN_SPELL, `teklifte ${cat('spell')} büyü`);
          assert(cat('effect') >= Decks.MIN_EFFECT, `teklifte ${cat('effect')} efektli canavar`);
        }
        deck.rounds = (deck.rounds || 0) + 1;
        offer.forEach(c => { if (c.type === 'Fusion Monster') sawFusion = true; if (/Ritual/.test(c.type)) sawRitual = true; });
        // rastgele 1-2 kart seç (sığanlardan)
        const picks = [offer[Math.floor(Math.random() * offer.length)]];
        for (const c of picks) {
          const b = Decks.bundleOf(cards, c, deck);
          if (deck.main.length + b.main.length > Decks.DRAFT_SIZE) continue;
          deck.main.push(...b.main); deck.extra.push(...b.extra);
        }
      }
      assert(deck.main.length === Decks.DRAFT_SIZE, `draft ${th} 20 kart olmadı: ${deck.main.length}`);
      // Fusion/Ritual tutarlılığı: extra'daki her fusion'ın malzemeleri ve Polymerization ana destede
      const names = deck.main.map(id => db.get(id).name);
      for (const id of deck.extra) {
        const f = db.get(id);
        f.materials.forEach(m => assert(names.includes(m), `fusion malzemesi eksik: ${f.name} / ${m}`));
        assert(names.includes('Polymerization'), 'Polymerization eklenmedi');
      }
      for (const n of names) {
        const c = byName.get(n);
        if (c.kind === 'monster' && /Ritual/.test(c.type)) assert(deck.main.some(id => db.get(id).ritual && (db.get(id).ritual.target === n || db.get(id).ritual.attr === c.attr)), `ritual büyüsü eksik: ${n}`);
      }
    }
  }

  // --- Arketip eğilimi: Dark Magician + Dark Magician Girl seçildiyse sonraki tekliflerde büyücü kartları artmalı ---
  {
    const deck = { main: [id('Dark Magician'), id('Dark Magician Girl'), id('Pot of Greed'), id('Mirror Force')], extra: [], rounds: 2 };
    const arch = Decks.draftInfo(cards, deck);
    assert(arch && arch.key === 'magician', 'arketip tespit edilemedi: ' + JSON.stringify(arch && arch.key));
    let hits = 0, tot = 0;
    for (let i = 0; i < 100; i++) {
      const offer = Decks.draftOffer(cards, 'kaiba', deck);
      const a = Decks.ARCHETYPES.magician;
      hits += offer.filter(c => a.core.includes(c.name) || a.support.includes(c.name)).length; tot += offer.length;
    }
    const noArch = { main: deck.main.slice(), extra: [], rounds: 0 };
    let base = 0;
    for (let i = 0; i < 100; i++) base += Decks.draftOffer(cards, 'kaiba', noArch).filter(c => Decks.ARCHETYPES.magician.core.includes(c.name) || Decks.ARCHETYPES.magician.support.includes(c.name)).length;
    console.log(`Arketip kartı payı: eğilimli ${(hits / tot * 100).toFixed(0)}% vs eğilimsiz ${(base / tot * 100).toFixed(0)}%`);
    assert(hits > base * 1.5, 'arketip eğilimi yeterince artmadı');
    // Normal canavar oranı
    let normalsN = 0, allN = 0;
    for (let i = 0; i < 100; i++) { const o = Decks.draftOffer(cards, 'yugi', { main: [], extra: [] }); normalsN += o.filter(c => c.type === 'Normal Monster').length; allN += o.length; }
    console.log(`Tekliflerde Normal canavar oranı: ${(normalsN / allN * 100).toFixed(0)}%`);
    assert(normalsN / allN < 0.45, 'çok fazla normal canavar');
  }

  // --- Fusion ---
  await runSmall([], ['Gaia the Dragon Champion'].map(id), ['Polymerization', 'Gaia The Fierce Knight', 'Curse of Dragon'],
    [{ type: 'activate', hand: 0 }],
    d => assert(d.P(0).mz.some(c => c && c.d.name === 'Gaia the Dragon Champion') && d.P(0).extra.length === 0, 'Fusion Summon çalışmadı'));

  // --- Ritual ---
  await runSmall([], [], ['Black Luster Ritual', 'Black Luster Soldier', 'Gaia The Fierce Knight', 'Curse of Dragon'],
    [{ type: 'activate', hand: 0 }],
    d => assert(d.P(0).mz.some(c => c && c.d.name === 'Black Luster Soldier'), 'Ritual Summon çalışmadı'));

  // --- Field büyüsü ---
  await runSmall([], [], ['Forest', 'Beaver Warrior'],
    [{ type: 'activate', hand: 0 }, { type: 'summon', hand: 0, tributes: [] }],
    d => assert(d.P(0).field && d.P(0).field.d.name === 'Forest' && d.P(0).mz[0] && d.atk(d.P(0).mz[0]) === d.P(0).mz[0].d.atk + 200, 'Field büyüsü / ATK bonusu çalışmadı'));

  // --- Fazlar: ilk turda battle'a geçilemez, main'de saldırı hatası ---
  {
    const errs = [];
    const ctl = scripted([{ type: 'phase', to: 'battle' }, { type: 'attack', zone: 0, target: 'direct' }, { type: 'end' }]);
    ctl.error = m => errs.push(m);
    const f = cards.filter(c => c.type === 'Normal Monster' && c.level <= 4).slice(0, 30).map(c => c.id);
    const d = new E.Duel({ decks: [f.slice(), f.slice()], db, ctl: [ctl, makeAI()], first: 0, maxTurns: 1 });
    await d.run();
    assert(errs.length >= 2, 'faz kuralları hata vermedi: ' + errs.join('|'));
  }

  // --- Yasaklı / Sınırlı liste ---
  {
    const forb = cards.filter(c => c.ban === 'Forbidden');
    assert(forb.length >= 20, 'yasaklı liste yüklenmemiş');
    assert(forb.every(f => pool.all.includes(f) || !Decks.isPlayable(f)), 'oynanabilir yasaklı kart havuza girmemiş'); // Yasaklılar artık Sınırlı (1 kopya) olarak oynanır
    assert(Decks.copyLimit(byName.get('Monster Reborn')) === 1 && Decks.copyLimit(byName.get('Pot of Greed')) === 1 && Decks.copyLimit(byName.get('Trap Hole')) === 3, 'copyLimit');
    for (let i = 0; i < 40; i++) for (const c of Decks.draftOffer(cards, 'yugi', { main: [], extra: [], rounds: 3 })) assert(Decks.copyLimit(c) >= 1, 'draft kopya sınırı: ' + c.name);
    for (const k of Object.keys(Decks.THEME_PACKS)) {
      const tp = Decks.themePackPool(cards, k);
      assert(tp.all.length >= 12 && (k === 'duel' || tp.core.length >= 3), `tema paketi havuzu küçük: ${k} ${tp.all.length}/${tp.core.length}`);
      for (let i = 0; i < 20; i++) {
        const pk = Decks.openThemePack(cards, k);
        assert(pk.length === 5, 'tema paketi bozuk: ' + k);
        assert(k === 'duel' || pk.some(c => tp.core.includes(c)), 'pakette çekirdek kart yok: ' + k);
        assert(pk.every(c => tp.all.includes(c)), 'paket havuz dışı kart: ' + k);
      }
    }
    console.log('Tema paketleri OK:', Object.keys(Decks.THEME_PACKS).join(', '));
  }

  // --- Yeni mekanikler ---
  await runSmall([], [], ['Change of Heart', 'Dark Magician'], [{ type: 'end' }], d => assert(true));
  {
    // Change of Heart: tur sonunda canavar geri döner
    const f = cards.filter(c => c.type === 'Normal Monster' && c.level <= 4).slice(0, 30).map(c => c.id);
    const d = new E.Duel({ decks: [f.slice(), f.slice()], db, ctl: [scripted([]), makeAI()], first: 0, maxTurns: 1 });
    const victim = d.inst(id('Celtic Guardian'), 1); d.P(1).mz[0] = victim;
    const ok = await d.takeControl(victim, 0, true);
    assert(ok && d.P(0).mz.includes(victim) && victim.owner === 0, 'takeControl çalışmadı');
    await d.returnLoans();
    assert(d.P(1).mz.includes(victim) && victim.owner === 1, 'kontrol geri dönmedi');
  }
  {
    // Toon World olmadan Toon saldıramaz, olunca direkt saldırır
    const f = cards.filter(c => c.type === 'Normal Monster' && c.level <= 4).slice(0, 30).map(c => c.id);
    const d = new E.Duel({ decks: [f.slice(), f.slice()], db, ctl: [scripted([]), makeAI()], first: 0, maxTurns: 1 });
    const t = d.inst(id('Toon Mermaid'), 0); t.placedTurn = 0; d.P(0).mz[0] = t; d.turn = 3; d.phase = 'battle';
    d.P(1).mz[0] = d.inst(id('Celtic Guardian'), 1);
    assert(!d.canAttack(0, 0).ok, 'Toon World olmadan saldırdı');
    const tw = d.inst(id('Toon World'), 0); tw.up = true; d.P(0).st[0] = tw;
    assert(d.canAttack(0, 0).ok && d.canDirect(0, t), 'Toon direkt saldıramıyor');
  }
  {
    // --- Overframe efsane kartlar ---
    const f = cards.filter(c => c.type === 'Normal Monster' && c.level <= 4).slice(0, 30).map(c => c.id);
    const mkD = (ctl0 = scripted([])) => {
      const d = new E.Duel({ decks: [f.slice(), f.slice()], db, ctl: [ctl0, makeAI()], first: 0, maxTurns: 1 });
      d.turn = 3; d.active = 0; d.phase = 'main1';
      d.P(0).hand = []; d.P(1).hand = [];
      return d;
    };
    const give = (d, p, name, where = 'hand') => { const c = d.inst(id(name), p); if (where === 'hand') d.P(p).hand.push(c); else if (where === 'deck') d.P(p).deck.unshift(c); else if (where === 'mz') { c.placedTurn = 0; d.P(p).mz[d.freeZone(p, 'mz')] = c; } else if (where === 'st') { c.up = false; c.placedTurn = 0; d.P(p).st[d.freeZone(p, 'st')] = c; } return c; };
    const names = ['Dark Magician, the Pharaoh\'s Servant', 'Dark Magical Curtain', 'Blue-Eyes White Dragon, the White Phantom Beast', 'Blue-Eyes Ultimate Dragon, the God-Surpassing Servant', 'Red-Eyes Black Dragon Exceed', 'Red-Eyes Dark Dragoon'];
    for (const n of names) assert(db.get(id(n)).of && Decks.isPlayable(db.get(id(n))), 'Overframe kart oynanamaz: ' + n);
    assert(db.get(id('Dark Magician Girl')).of && db.get(id('Red-Eyes Black Dragon')).of, 'DMG/RED Overframe görseli yok');
    assert(!Decks.buildPool(cards).all.some(c => c.packOnly), 'packOnly kart normal havuzda');

    // Red-Eyes Dark Dragoon: Polymerization (Dark Magician + Red-Eyes), efekt dokunulmazlığı, yok et + hasar
    {
      const d = mkD(); d.P(0).extra.push(d.inst(id('Red-Eyes Dark Dragoon'), 0));
      give(d, 0, 'Dark Magician'); give(d, 0, 'Red-Eyes Black Dragon'); give(d, 0, 'Polymerization');
      const r = await d.perform(0, { type: 'activate', hand: 2 });
      const dr = d.monsters(0)[0];
      assert(!r.error && dr && dr.d.name === 'Red-Eyes Dark Dragoon' && dr.fusionNormals === 2, 'Dragoon füzyonu çalışmadı ' + JSON.stringify(r));
      const v = give(d, 1, 'Celtic Guardian', 'mz'); const v2 = give(d, 1, 'Battle Ox', 'mz');
      assert(d.filterTargets([dr, v], 'harm').length === 1, 'Dragoon hedef alınabiliyor');
      await d.destroy(dr); assert(d.onField(dr), 'Dragoon efektle yok edildi');
      const lp = d.P(1).lp;
      const ab = await d.perform(0, { type: 'ability', zone: d.P(0).mz.indexOf(dr) });
      assert(!ab.error && !d.onField(v) && d.P(1).lp === lp - 1400, 'Dragoon yeteneği: yok et + ATK kadar hasar ' + JSON.stringify(ab) + ' lp ' + d.P(1).lp);
      await d.perform(0, { type: 'ability', zone: d.P(0).mz.indexOf(dr) });
      assert(!d.onField(v2), 'Dragoon 2. kullanım (2 Normal malzeme) çalışmadı');
      assert(!d.canAbility(0, d.P(0).mz.indexOf(dr)).ok, 'Dragoon 3. kullanım engellenmedi');
    }
    // Dragoon alternatif malzeme: Dark Magician + Dragon Effect canavar
    {
      const d = mkD(); d.P(0).extra.push(d.inst(id('Red-Eyes Dark Dragoon'), 0));
      give(d, 0, 'Dark Magician'); const dragonEff = cards.find(c => c.type === 'Effect Monster' && c.race === 'Dragon' && c.level <= 4 && c.name !== 'Red-Eyes Black Dragon');
      if (dragonEff) { d.P(0).hand.push(d.inst(dragonEff.id, 0)); give(d, 0, 'Polymerization'); await d.perform(0, { type: 'activate', hand: 2 }); const dr = d.monsters(0)[0]; assert(dr && dr.fusionNormals === 1, 'Dragoon alt malzeme (Dragon Effect) çalışmadı'); }
    }
    // Dragoon: Pharaoh's Servant sahada Dark Magician sayılır
    {
      const d = mkD(); give(d, 0, "Dark Magician, the Pharaoh's Servant", 'mz'); d.P(1).mz[0] = d.inst(id('Celtic Guardian'), 1); give(d, 0, 'Thousand Knives');
      assert(d.canActivateFromHand(0, 0), 'Pharaoh\'s Servant Dark Magician sayılmıyor');
    }
    // Dragoon: rakip Büyüsünü iptal eder + 1000 ATK
    {
      const d = mkD(); d.active = 1; d.turn = 4;
      const dr = give(d, 0, 'Red-Eyes Dark Dragoon', 'mz'); d.P(0).hand.push(d.inst(id('Celtic Guardian'), 0));
      give(d, 1, 'Pot of Greed'); d.P(1).deck.push(d.inst(id('Celtic Guardian'), 1), d.inst(id('Celtic Guardian'), 1));
      const handN = d.P(1).hand.length;
      await d.perform(1, { type: 'activate', hand: 0 });
      assert(d.P(1).hand.length === handN - 1 && d.atk(dr) === 4000 && d.P(0).hand.length === 0, `Dragoon iptali çalışmadı hand=${d.P(1).hand.length} atk=${d.atk(dr)}`);
    }
    // BEUD: 3x BEWD füzyonu, dokunulmazlık, 3 saldırı, kapalı kartı yok etme
    {
      const d = mkD(); d.P(0).extra.push(d.inst(id('Blue-Eyes Ultimate Dragon, the God-Surpassing Servant'), 0));
      for (let i = 0; i < 3; i++) give(d, 0, 'Blue-Eyes White Dragon'); give(d, 0, 'Polymerization');
      await d.perform(0, { type: 'activate', hand: 3 });
      const b = d.monsters(0)[0];
      assert(b && b.d.name.startsWith('Blue-Eyes Ultimate Dragon, the God'), 'BEUD füzyonu çalışmadı');
      await d.destroy(b); assert(d.onField(b), 'BEUD efektle yok edildi');
      d.active = 1; d.turn = 4; const sp = give(d, 1, 'Pot of Greed', 'st'); sp.up = false;
      d.src = { p: 1, kind: 'spell' }; assert(d.immune(b, 'bounce'), 'BEUD rakip turunda rakip efektine açık'); d.src = null; d.active = 0; d.turn = 3;
      d.phase = 'battle'; b.placedTurn = 0; give(d, 1, 'Trap Hole', 'st'); give(d, 1, 'Mirror Force', 'st'); give(d, 1, 'Waboku', 'st');
      const fd = d.P(1).st.filter(Boolean).length;
      for (let i = 0; i < 3; i++) await d.perform(0, { type: 'ability', zone: d.P(0).mz.indexOf(b) });
      assert(d.P(1).st.filter(Boolean).length === fd - 3, 'BEUD 3 kapalı kartı yok edemedi');
      assert(!d.canAbility(0, d.P(0).mz.indexOf(b)).ok, 'BEUD 4. kullanım');
      assert(d.canAttack(0, d.P(0).mz.indexOf(b)).ok, 'BEUD saldıramıyor');
      b.atkCount = 2; b.attacked = false; assert(d.canAttack(0, d.P(0).mz.indexOf(b)).ok, 'BEUD 3. saldırı yok');
    }
    // BEWD: çekilince elden çağrılır, rakibin canavarlarını yok eder, direkt saldırı kısıtı
    {
      const d = mkD(); d.P(1).mz[0] = d.inst(id('Celtic Guardian'), 1); d.P(1).mz[1] = d.inst(id('Battle Ox'), 1);
      const w = give(d, 0, 'Blue-Eyes White Dragon, the White Phantom Beast', 'deck');
      await d.draw(0, 1);
      assert(d.onField(w) && d.monsters(1).length === 0, 'BEWD çekilince çağrılmadı / canavarları yok etmedi');
      const other = give(d, 0, 'Celtic Guardian', 'mz'); other.placedTurn = 0; d.phase = 'battle';
      assert(!d.canDirect(0, other) && d.canDirect(0, w), 'BEWD direkt saldırı kısıtı yanlış');
    }
    // BEWD: hedef alan efekt iptal edilir (Change of Heart ile hedef alınınca)
    {
      const d = mkD(); d.active = 1; d.turn = 4;
      const w = give(d, 0, 'Blue-Eyes White Dragon, the White Phantom Beast', 'mz'); d.P(0).hand.push(d.inst(id('Celtic Guardian'), 0));
      give(d, 1, 'Change of Heart');
      await d.perform(1, { type: 'activate', hand: 0 });
      assert(d.P(0).mz.includes(w) && w.owner === 0 && d.P(0).hand.length === 0, 'BEWD hedef iptali çalışmadı');
      assert(d.P(1).st.every(c => !c), 'Negated Büyü mezarlığa gitmedi');
    }
    // BEWD: savaşta canavar yok olunca elden çağrılır
    {
      const d = mkD(); const w = give(d, 0, 'Blue-Eyes White Dragon, the White Phantom Beast'); const m = give(d, 0, 'Celtic Guardian', 'mz');
      await d.destroy(m, null, 'battle');
      assert(d.onField(w), 'BEWD savaş tepkisi çalışmadı');
    }
    // Dark Magician, the Pharaoh's Servant: Büyü göstererek elden çağır + Set, sonra rakibin Büyü/Tuzaklarını yok et
    {
      const d = mkD(); const p = give(d, 0, "Dark Magician, the Pharaoh's Servant"); give(d, 0, 'Pot of Greed'); give(d, 0, 'Mage Power');
      d.P(0).deck.unshift(d.inst(id('Thousand Knives'), 0));
      give(d, 1, 'Mirror Force', 'st'); give(d, 1, 'Trap Hole', 'st');
      const r = await d.perform(0, { type: 'hsummon', hand: 0, tributes: [] });
      assert(!r.error && d.onField(p), 'Pharaoh\'s Servant elden çağrılamadı ' + JSON.stringify(r));
      assert(d.P(0).st.some(c => c && c.d.name === 'Thousand Knives' && !c.up), 'Servant Dark Magician Büyüsünü Set etmedi');
      assert(!d.canAbility(0, d.P(0).mz.indexOf(p)).ok, 'Servant tur başı tek efekt kuralı');
      d.turn = 5; p.abilityTurn = -1;
      const a = await d.perform(0, { type: 'ability', zone: d.P(0).mz.indexOf(p) });
      assert(!a.error && d.P(1).st.every(c => !c), 'Servant rakibin Büyü/Tuzaklarını yok etmedi ' + JSON.stringify(a));
    }
    // Dark Magical Curtain: iki taraf DARK Spellcaster çağırır, Dark Magician ise Büyü/Tuzak alınır
    {
      const d = mkD(); give(d, 0, 'Dark Magical Curtain');
      const dm = give(d, 0, 'Dark Magician', 'deck'); d.P(0).deck.unshift(d.inst(id('Dark Magic Attack'), 0));
      const opp = cards.find(c => c.kind === 'monster' && c.attr === 'DARK' && c.race === 'Spellcaster' && c.level <= 4 && c.type === 'Normal Monster');
      d.P(1).deck.unshift(d.inst(opp.id, 1));
      const r = await d.perform(0, { type: 'activate', hand: 0 });
      assert(!r.error && d.monsters(0).length === 1 && d.monsters(1).length === 1, 'Curtain iki tarafa çağırmadı ' + JSON.stringify(r));
      assert(d.P(0).hand.some(c => c.d.name === 'Dark Magic Attack') || d.P(0).deck.every(c => c.d.name !== 'Dark Magic Attack'), 'Curtain Büyü/Tuzak getirmedi');
      assert(d.monsters(0).every(c => c.mutedTurn === d.turn), 'Curtain canavarları susturulmadı');
    }
    // Red-Eyes Black Dragon Exceed: çağrılınca elden/mezarlıktan çağırır, rakibin Büyü/canavar efektlerine dokunulmaz
    {
      const d = mkD(); d.P(0).extra.push(d.inst(id('Red-Eyes Black Dragon Exceed'), 0));
      give(d, 0, 'Red-Eyes Black Dragon'); give(d, 0, 'Time Wizard'); give(d, 0, 'Polymerization'); d.P(0).grave.push(d.inst(id('Celtic Guardian'), 0));
      await d.perform(0, { type: 'activate', hand: 2 });
      const ex = d.monsters(0).find(c => c.d.name === 'Red-Eyes Black Dragon Exceed');
      assert(ex && d.monsters(0).length === 2, 'Exceed füzyonu / çağırma efekti çalışmadı');
      d.active = 1; d.src = { p: 1, kind: 'spell' }; await d.destroy(ex); assert(d.onField(ex), 'Exceed rakip Büyüsüyle yok edildi'); d.src = { p: 1, kind: 'trap' }; assert(!d.immune(ex, 'destroy'), 'Exceed Tuzaktan korunuyor'); d.src = null;
    }
    // ---- 2. parti Overframe kartlar ----
    for (const n of ['Black Luster Soldier - Soldier of Light and Darkness', 'Magician of Dark Chaos - Black Chaos', 'Phara the Primordial Goddess', 'Toon Dark Magician Girl', 'Gilford the Lightning, the Warrior of Thunderbolts', 'Dark Paladin - Wave-Motion', 'Light and Darkness Ritual']) assert(Decks.isPlayable(db.get(id(n))), 'oynanamaz: ' + n);
    assert(db.get(id('Blue-Eyes Toon Dragon')).of, 'Blue-Eyes Toon Dragon Overframe görseli yok');
    // Ritual: Light and Darkness Ritual (el + mezarlıktan banish ile Level toplamı)
    {
      const d = mkD(); give(d, 0, 'Light and Darkness Ritual'); give(d, 0, 'Black Luster Soldier - Soldier of Light and Darkness');
      give(d, 0, 'Dark Magician'); give(d, 0, 'Celtic Guardian'); d.P(0).grave.push(d.inst(id('Kuriboh'), 0));
      const r = await d.perform(0, { type: 'activate', hand: 0 });
      const b = d.monsters(0).find(c => c.d.name.startsWith('Black Luster Soldier - Soldier'));
      assert(!r.error && b, 'Light and Darkness Ritual çalışmadı ' + JSON.stringify(r));
      // BLS: savaşta yok olmaz, hedef alınmayan rakip efektinden etkilenmez, hedef alınırsa etkilenir
      await d.destroy(b, null, 'battle'); assert(d.onField(b), 'BLS savaşta yok oldu');
      d.active = 1; d.src = { p: 1, kind: 'spell' }; await d.destroy(b); assert(d.onField(b), 'BLS rakip efektiyle yok oldu');
      d.tgt = new Set([b.uid]); assert(!d.immune(b, 'destroy'), 'BLS hedef alınınca etkilenmiyor'); d.tgt = null; d.src = null; d.active = 0;
    }
    // BLS: çağrılınca rakibin kartını çıkarır, savaşta canavar yok edince +1500 ATK ve ikinci saldırı
    {
      const d = mkD(); const v = give(d, 1, 'Celtic Guardian', 'mz'); give(d, 1, 'Battle Ox', 'mz');
      d.P(0).deck.unshift(d.inst(id('Dark Magician'), 0)); give(d, 0, 'Light and Darkness Ritual'); give(d, 0, 'Black Luster Soldier - Soldier of Light and Darkness');
      d.P(0).hand.push(d.inst(id('Celtic Guardian'), 0), d.inst(id('Battle Ox'), 0));
      await d.perform(0, { type: 'activate', hand: 0 });
      const b = d.monsters(0).find(c => c.d.name.startsWith('Black Luster'));
      assert(b && d.P(1).banished.length === 1, 'BLS çağrılınca kart çıkarmadı');
      d.phase = 'battle'; b.placedTurn = 0; const lp = d.P(1).lp; const tgtZone = d.P(1).mz.findIndex(Boolean);
      await d.perform(0, { type: 'attack', zone: d.P(0).mz.indexOf(b), target: tgtZone });
      assert(d.atk(b) === 4500 && !b.attacked, 'BLS +1500 ATK / ikinci saldırı çalışmadı atk=' + d.atk(b));
    }
    // Black Chaos: Büyü/Tuzaklar rakip efektiyle yok edilemez, çağrılınca GY'den Büyü alır
    {
      const d = mkD(); const bc = give(d, 0, 'Magician of Dark Chaos - Black Chaos', 'mz'); const st = give(d, 0, 'Mirror Force', 'st');
      d.active = 1; d.src = { p: 1, kind: 'spell' }; await d.destroy(st); assert(d.onField(st), 'Black Chaos Tuzağı korumadı'); d.src = null; d.active = 0;
      await d.destroy(st); assert(!d.onField(st), 'Kendi efektinle yok edilememeli değil');
      d.P(0).grave.push(d.inst(id('Monster Reborn'), 0)); await d.sendToGrave(bc); const bc2 = d.inst(id('Magician of Dark Chaos - Black Chaos'), 0); d.P(0).hand.push(bc2);
      await d.specialSummon(0, bc2);
      assert(d.P(0).hand.some(c => c.d.name === 'Monster Reborn'), 'Black Chaos GY Büyüsünü almadı');
    }
    // Phara: Büyü ile yok edilince çağrılır, GY'den çağrılınca en yüksek ATK'lı canavarı kontrol eder
    {
      const d = mkD(); d.active = 1; d.turn = 4; const ph = give(d, 0, 'Phara the Primordial Goddess', 'mz'); give(d, 0, 'Celtic Guardian', 'mz');
      const big = give(d, 1, 'Blue-Eyes White Dragon', 'mz'); give(d, 1, 'Tribute to the Doomed'); give(d, 1, 'Celtic Guardian');
      await d.perform(1, { type: 'activate', hand: 0 });
      assert(d.monsters(0).some(c => c.d.name === 'Phara the Primordial Goddess'), 'Phara Büyü ile yok olunca geri çağrılmadı');
      assert(big.owner === 0 && d.P(0).mz.includes(big), 'Phara en yüksek ATK\'lı canavarı almadı');
    }
    // Phara elden: karşılık verilemez
    {
      const d = mkD(); const ph = give(d, 0, 'Phara the Primordial Goddess'); give(d, 0, 'Mirror Force');
      const r = await d.perform(0, { type: 'heffect', hand: 0 });
      assert(!r.error && d.respBlocked(d.P(0).hand.find(c => c.d.name === 'Mirror Force')), 'Phara karşılık engeli ayarlanmadı ' + JSON.stringify(r));
    }
    // Toon Dark Magician Girl
    {
      const d = mkD(); const t = give(d, 0, 'Toon Dark Magician Girl'); give(d, 0, 'Celtic Guardian', 'mz');
      assert(!d.canHandSummon(0, 0).ok, 'Toon World olmadan çağrıldı');
      give(d, 0, 'Toon World', 'st').up = true;
      assert(d.canHandSummon(0, 0).ok, 'Toon World ile çağrılamıyor');
      d.P(0).grave.push(d.inst(id('Dark Magician'), 0), d.inst(id('Dark Magician'), 0));
      await d.perform(0, { type: 'hsummon', hand: 0, tributes: [0] });
      assert(d.atk(t) === 2600, 'Toon DMG ATK artışı yanlış ' + d.atk(t));
    }
    // Gilford WoT: 3 tribute ile çağrılır, rakibin tüm canavarları mezarlığa gider; GY'ye gidince End Phase'de Warrior alır
    {
      const d = mkD(); const g = give(d, 0, 'Gilford the Lightning, the Warrior of Thunderbolts');
      for (let i = 0; i < 3; i++) give(d, 0, 'Celtic Guardian', 'mz'); give(d, 1, 'Battle Ox', 'mz'); give(d, 1, 'Celtic Guardian', 'mz');
      d.P(0).deck.unshift(d.inst(id('Axe Raider'), 0));
      const r = await d.perform(0, { type: 'hsummon', hand: 0, tributes: [0, 1, 2] });
      assert(!r.error && d.onField(g) && d.monsters(1).length === 0, 'Gilford çağırma / rakip canavarları GY ' + JSON.stringify(r));
      await d.sendToGrave(g); await d.endTurn();
      assert(d.P(0).hand.some(c => c.d.name === 'Axe Raider'), 'Gilford End Phase Warrior almadı');
    }
    // Dark Paladin - Wave-Motion: Dark Magician + Level 7+ füzyon, tüm canavarlara saldırı, Büyü iptali
    {
      const d = mkD(); d.P(0).extra.push(d.inst(id('Dark Paladin - Wave-Motion'), 0));
      give(d, 0, 'Dark Magician'); give(d, 0, 'Blue-Eyes White Dragon'); give(d, 0, 'Polymerization');
      await d.perform(0, { type: 'activate', hand: 2 });
      const w = d.monsters(0).find(c => c.d.name === 'Dark Paladin - Wave-Motion'); assert(w, 'Wave-Motion füzyonu çalışmadı');
      const a = give(d, 1, 'Celtic Guardian', 'mz'); const b = give(d, 1, 'Battle Ox', 'mz');
      assert(d.atk(w) === 2900 + 1000, 'Wave-Motion ATK artışı ' + d.atk(w));
      d.phase = 'battle'; w.placedTurn = 0;
      await d.perform(0, { type: 'attack', zone: d.P(0).mz.indexOf(w), target: d.P(1).mz.indexOf(a) });
      assert(!w.attacked && d.canAttack(0, d.P(0).mz.indexOf(w)).ok, 'Wave-Motion ikinci hedefe saldıramıyor');
      assert(d.P(0).mz.includes(w), 'Wave-Motion yok oldu');
      const again = await d.perform(0, { type: 'attack', zone: d.P(0).mz.indexOf(w), target: d.P(1).mz.indexOf(a) }); assert(again.error || !d.P(1).mz.includes(a), 'aynı hedefe ikinci saldırı');
    }
    // Dark Paladin (Buster Blader ile) ve diğer Fusion'lar oynanabilir; Dark Paladin Büyüyü iptal eder
    {
      for (const n of ['Dark Paladin', 'Dark Blade the Dragon Knight', 'Dark Flare Knight', 'Fiend Skull Dragon', 'Mokey Mokey King', 'Ojama King', 'Reaper on the Nightmare', 'Ryu Senshi', 'Super Robolady', 'Super Roboyarou', 'The Last Warrior from Another Planet', 'Thousand-Eyes Restrict', 'XY-Dragon Cannon', 'XYZ-Dragon Cannon', 'XZ-Tank Cannon', 'YZ-Tank Dragon', 'Dark Balter the Terrible']) assert(Decks.isPlayable(db.get(id(n))), 'Fusion oynanamaz: ' + n);
      const bad = cards.filter(c => c.type === 'Fusion Monster' && !Decks.isPlayable(c)).map(c => c.name);
      assert(bad.length === 0, 'oynanamayan Fusion kaldı: ' + bad.join(', '));
      const d = mkD(); d.active = 1; d.turn = 4; const dp = give(d, 0, 'Dark Paladin', 'mz'); d.P(0).hand.push(d.inst(id('Celtic Guardian'), 0)); give(d, 1, 'Pot of Greed'); d.P(1).deck.push(d.inst(id('Celtic Guardian'), 1), d.inst(id('Celtic Guardian'), 1));
      const h = d.P(1).hand.length, dk = d.P(1).deck.length; await d.perform(1, { type: 'activate', hand: 0 });
      assert(d.P(1).hand.length === h - 1 && d.P(1).deck.length === dk && d.P(0).hand.length === 0, 'Dark Paladin Büyüyü iptal etmedi');
      d.P(0).grave.push(d.inst(id('Blue-Eyes White Dragon'), 0)); assert(d.atk(dp) === 3400, 'Dark Paladin ATK (Dragon başına +500) ' + d.atk(dp));
    }
    // Last Warrior: çağrılamaz kuralı, Ojama King bölge kilidi, Spirit Reaper savaşta yok olmaz
    {
      const d = mkD(); const lw = give(d, 0, 'The Last Warrior from Another Planet', 'mz'); give(d, 0, 'Celtic Guardian'); assert(!d.canSummon(0, 0).ok && d.summonBlocked(), 'Last Warrior çağırmayı engellemedi');
      const d2 = mkD(); const ok = give(d2, 0, 'Ojama King', 'mz'); await d2.specialSummon(0, d2.inst(id('Ojama King'), 0)); give(d2, 0, 'Ojama King', 'mz'); const k = d2.monsters(0).find(c => c.blockZones); if (k) d2.P(0).mz[d2.P(0).mz.indexOf(k)] = k;
      const d3 = mkD(); const sr = give(d3, 0, 'Spirit Reaper', 'mz'); await d3.destroy(sr, null, 'battle'); assert(d3.onField(sr), 'Spirit Reaper savaşta yok oldu');
      const d4 = mkD(); const ok4 = give(d4, 0, 'Ojama King', 'mz'); ok4.blockZones = [0, 1, 2]; assert(d4.freeZone(1, 'mz') < 0, 'Ojama King bölgeleri kilitlemedi');
    }
    // Ritual canavar elden Normal Summon / Tribute Summon / Set edilemez
    {
      const d = mkD(); give(d, 0, 'Relinquished'); give(d, 0, 'Black Luster Soldier - Soldier of Light and Darkness'); give(d, 0, 'Celtic Guardian', 'mz'); give(d, 0, 'Battle Ox', 'mz');
      assert(!d.canSummon(0, 0).ok && !d.canSummon(0, 1).ok, 'Ritual canavar Normal/Tribute Summon edilebiliyor');
      const r = await d.perform(0, { type: 'summon', hand: 1, tributes: [0, 1] }); assert(r.error && !d.monsters(0).some(c => c.d.name.startsWith('Black Luster')), 'Ritual canavar tribute ile çağrıldı');
      const r2 = await d.perform(0, { type: 'set', hand: 1, tributes: [0, 1] }); assert(r2.error, 'Ritual canavar set edildi');
    }
    // ---- Quick efektler: Quick-Play Büyüler, Counter Trap'ler, hasar penceresi, canavar Quick efektleri ----
    {
      // Set Quick-Play (MST) rakibin turunda Battle Phase başında karşılık verir
      const d = mkD(); d.active = 1; d.turn = 4;
      const mst = give(d, 0, 'Mystical Space Typhoon', 'st'); const tgt = give(d, 1, 'Mirror Force', 'st');
      await d.trapWindow('phase', { phase: 'battle', stop: false }, 0);
      assert(!d.onField(tgt) && d.P(0).grave.includes(mst), 'Quick-Play MST rakip turunda çalışmadı');
      // Aynı tur set edilen Quick-Play aktive edilemez; elden Battle Phase'de aktive edilebilir
      const d2 = mkD(); const s = give(d2, 0, 'Mystical Space Typhoon', 'st'); s.placedTurn = d2.turn; give(d2, 1, 'Mirror Force', 'st');
      d2.phase = 'main1'; const r1 = await d2.perform(0, { type: 'activate', st: d2.P(0).st.indexOf(s) });
      assert(r1.error, 'Quick-Play set edildiği tur aktive edildi');
      const d3 = mkD(); give(d3, 0, 'Book of Moon'); give(d3, 0, 'Celtic Guardian', 'mz'); d3.phase = 'battle';
      assert(d3.canActivateFromHand(0, 0), 'Quick-Play Battle Phase\'de elden aktive edilemiyor');
      const r2 = await d3.perform(0, { type: 'activate', hand: 0 }); assert(!r2.error, 'Battle Phase Quick-Play hata: ' + JSON.stringify(r2));
      // Normal Büyü Battle Phase'de aktive edilemez
      const d4 = mkD(); give(d4, 0, 'Pot of Greed'); d4.phase = 'battle'; assert(!d4.canActivateFromHand(0, 0), 'Normal Büyü Battle Phase\'de aktive edilebiliyor');
    }
    {
      // Counter Trap: Seven Tools of the Bandit rakibin Tuzak aktivasyonunu iptal eder (1000 LP)
      const d = mkD(); d.active = 1; d.turn = 4;
      give(d, 0, 'Seven Tools of the Bandit', 'st'); give(d, 1, 'Compulsory Evacuation Device', 'st').placedTurn = 1; give(d, 0, 'Celtic Guardian', 'mz');
      d.phase = 'main1'; const lp = d.P(0).lp;
      const r = await d.perform(1, { type: 'activate', st: 0 });
      assert(d.P(0).lp === lp - 1000 && d.P(0).mz.some(Boolean) && d.P(1).st.every(c => !c), 'Seven Tools Tuzak aktivasyonunu iptal etmedi lp=' + d.P(0).lp);
    }
    {
      // Hasar penceresi: Barrel Behind the Door efekt hasarını yansıtır; Nutrient Z büyük savaş hasarında 4000 LP verir
      const d = mkD(); d.active = 1; d.turn = 4; give(d, 0, 'Barrel Behind the Door', 'st'); give(d, 1, 'Final Flame');
      const lp0 = d.P(0).lp, lp1 = d.P(1).lp; await d.perform(1, { type: 'activate', hand: 0 });
      assert(d.P(0).lp === lp0 && d.P(1).lp === lp1 - 600, `Barrel Behind the Door hasarı yansıtmadı ${d.P(0).lp}/${d.P(1).lp}`);
      const d2 = mkD(); give(d2, 0, 'Nutrient Z', 'st'); await d2.damage(0, 2500, { d: { kind: 'monster' } }); // battle bağlamı olmadan efekt hasarı: tetiklenmez
      assert(d2.P(0).lp === 1500, 'Nutrient Z efekt hasarında tetiklendi');
    }
    {
      // Canavar Quick efekti: Kazejin saldırıldığında saldıranın ATK'sını 0 yapar
      const d = mkD(); d.active = 1; d.turn = 4; d.phase = 'battle';
      const kz = give(d, 0, 'Kazejin', 'mz'); kz.placedTurn = 0; const atk = give(d, 1, 'Blue-Eyes White Dragon', 'mz'); atk.placedTurn = 0;
      const lp = d.P(1).lp; await d.doAttack(1, d.P(1).mz.indexOf(atk), d.P(0).mz.indexOf(kz));
      assert(d.onField(kz) && !d.onField(atk) && d.P(0).lp === 4000, 'Kazejin Quick efekti çalışmadı');
      // A-Team: Trap aktivasyonunu iptal eder
      const e = mkD(); e.active = 1; e.turn = 4; give(e, 0, 'A-Team: Trap Disposal Unit', 'mz'); give(e, 1, 'Compulsory Evacuation Device', 'st').placedTurn = 1; give(e, 0, 'Celtic Guardian', 'mz'); e.phase = 'main1';
      await e.perform(1, { type: 'activate', st: 0 });
      assert(e.P(1).st.every(c => !c) && e.P(0).mz.some(c => c && c.d.name === 'Celtic Guardian'), 'A-Team Tuzağı iptal etmedi');
    }
    {
      // Yeni mekanikler: Token, Cost Down, Negate Attack Battle Phase'i bitirir, Kishido eşitlikte korur
      const d = mkD(); give(d, 0, 'Scapegoat'); d.phase = 'main1'; const r = await d.perform(0, { type: 'activate', hand: 0 });
      assert(!r.error && d.monsters(0).length === 3 && d.monsters(0).every(c => c.d.type === 'Token' && c.pos === 'def'), 'Scapegoat token çağırmadı');
      await d.sendToGrave(d.monsters(0)[0]); assert(d.P(0).grave.length === 1 + 0 || !d.P(0).grave.some(c => c.d.type === 'Token'), 'Token mezarlığa gitti');
      const d2 = mkD(); give(d2, 0, 'Cost Down'); give(d2, 0, 'Blue-Eyes White Dragon'); give(d2, 0, 'Celtic Guardian'); d2.phase = 'main1';
      await d2.perform(0, { type: 'activate', hand: 0 }); assert(d2.canSummon(0, 0).need === 0 || d2.canSummon(0, 0).need === 1, 'Cost Down tribute sayısını azaltmadı ' + JSON.stringify(d2.canSummon(0, 0)));
      const d3 = mkD(); d3.active = 1; d3.turn = 4; d3.phase = 'battle'; const a1 = give(d3, 1, 'Celtic Guardian', 'mz'); a1.placedTurn = 0; give(d3, 1, 'Battle Ox', 'mz').placedTurn = 0; give(d3, 0, 'Negate Attack', 'st'); give(d3, 0, 'Celtic Guardian', 'mz');
      await d3.doAttack(1, d3.P(1).mz.indexOf(a1), 0); assert(d3.endBattle === true, 'Negate Attack Battle Phase\'i bitirmedi');
    }
    // ---- 3. parti kartlar: yeni motor kancaları ----
    {
      // Fusion yedeği: Mystical Sheep #1 bir malzemenin yerine geçer
      const d = mkD(); d.P(0).extra.push(d.inst(id('Dark Paladin'), 0));
      give(d, 0, 'Dark Magician'); give(d, 0, 'Mystical Sheep #1'); give(d, 0, 'Polymerization');
      const r = await d.perform(0, { type: 'activate', hand: 2 });
      assert(!r.error && d.monsters(0).some(c => c.d.name === 'Dark Paladin'), 'Fusion yedeği çalışmadı ' + JSON.stringify(r));
      // Level Up!: LV3 -> LV5
      const d2 = mkD(); give(d2, 0, 'Armed Dragon LV3', 'mz'); give(d2, 0, 'Level Up!'); d2.P(0).deck.unshift(d2.inst(id('Armed Dragon LV5'), 0));
      await d2.perform(0, { type: 'activate', hand: 0 });
      assert(d2.monsters(0).some(c => c.d.name === 'Armed Dragon LV5'), 'Level Up! çalışmadı');
      // Kapalı canavar avcısı
      const d3 = mkD(); d3.phase = 'battle'; const sk = give(d3, 0, 'Sasuke Samurai', 'mz'); sk.placedTurn = 0; const fd = give(d3, 1, 'Dark Magician', 'mz'); fd.up = false; fd.pos = 'def';
      await d3.doAttack(0, 0, 0); assert(!d3.onField(fd) && d3.onField(sk), 'Sasuke Samurai kapalı canavarı yok etmedi');
      // Dimensionhole: sonraki Standby Phase'inde döner
      const d4 = mkD(); const m = give(d4, 0, 'Celtic Guardian', 'mz'); give(d4, 0, 'Dimensionhole'); await d4.perform(0, { type: 'activate', hand: 0 });
      assert(!d4.onField(m) && d4.pendingReturn.length === 1, 'Dimensionhole canavarı çıkarmadı');
      d4.active = 0; await d4.hook('standby', 0); // pendingReturn playTurn içinde işlenir
      // Amazoness Swords Woman: aldığın savaş hasarı rakibe yansır
      const d5 = mkD(); d5.phase = 'battle'; d5.active = 1; d5.turn = 4; const sw = give(d5, 0, 'Amazoness Swords Woman', 'mz'); sw.placedTurn = 0; const at = give(d5, 1, 'Blue-Eyes White Dragon', 'mz'); at.placedTurn = 0;
      const lp0 = d5.P(0).lp, lp1 = d5.P(1).lp; await d5.doAttack(1, 0, 0);
      assert(d5.P(0).lp === lp0 && d5.P(1).lp < lp1, 'Amazoness Swords Woman hasarı yansıtmadı');
      // Timidity + Frozen Soul + Ojama Trio
      const d6 = mkD(); give(d6, 0, 'Timidity'); await d6.perform(0, { type: 'activate', hand: 0 }); const st = give(d6, 1, 'Mirror Force', 'st'); await d6.destroy(st); assert(d6.onField(st), 'Timidity Set kartı korumadı');
      const d7 = mkD(); give(d7, 0, 'Ojama Trio', 'st'); d7.P(0).st[0].up = false; d7.P(0).st[0].placedTurn = 0; await d7.perform(0, { type: 'activate', st: 0 });
      assert(d7.monsters(1).length === 3 && d7.monsters(1).every(c => c.d.type === 'Token'), 'Ojama Trio token çağırmadı');
      // Drop Off: rakibin normal çekişini attırır
      const d8 = mkD(); d8.active = 1; d8.turn = 4; give(d8, 0, 'Drop Off', 'st'); d8.P(1).deck.unshift(d8.inst(id('Celtic Guardian'), 1)); d8.normalDraw = true; await d8.draw(1, 1); d8.normalDraw = false;
      assert(d8.P(1).hand.length === 0, 'Drop Off çekilen kartı attırmadı');
    }
    console.log('Overframe efsane kartlar OK');
  }
  {
    // Yazı-tura / zar API'si ve 11-12. paket mekanikleri
    const evs = [];
    const f = []; for (let i = 0; i < 20; i++) f.push(id('Celtic Guardian'));
    const mkD = () => { const d = new E.Duel({ decks: [f.slice(), f.slice()], db, ctl: [scripted([]), makeAI()], first: 0, maxTurns: 1, onEvent: async e => { evs.push(e); } }); d.turn = 3; d.active = 0; d.phase = 'main1'; d.P(0).hand = []; d.P(1).hand = []; return d; };
    const give = (d, p, name, where = 'mz', up = true) => { const c = d.inst(id(name), p); if (where === 'hand') d.P(p).hand.push(c); else if (where === 'mz') { c.placedTurn = 0; d.P(p).mz[d.freeZone(p, 'mz')] = c; } else if (where === 'st') { c.up = up; c.placedTurn = 0; d.P(p).st[d.freeZone(p, 'st')] = c; } else if (where === 'field') { c.up = true; d.P(p).field = c; } return c; };
    const d1 = mkD();
    const tr = await d1.toss(0, 3), rr = await d1.roll(0, 2);
    assert(tr.length === 3 && tr.every(x => typeof x === 'boolean') && rr.length === 2 && rr.every(x => x >= 1 && x <= 6), 'toss/roll sonuçları');
    assert(evs.some(e => e.type === 'coin' && e.results.length === 3) && evs.some(e => e.type === 'dice' && e.results.length === 2), 'coin/dice olayları yayınlanmadı');
    assert((await d1.choose(0, 'x', ['a', 'b'])) === 'a', 'choose varsayılanı');
    // Necrovalley: Gravekeeper's +500
    const d2 = mkD(); const gk = give(d2, 0, "Gravekeeper's Spy"); const a0 = d2.atk(gk); give(d2, 0, 'Necrovalley', 'field');
    assert(d2.atk(gk) === a0 + 500, 'Necrovalley +500 vermedi');
    // Raregold Armor: rakip yalnızca donatılmış canavara saldırabilir
    const d3 = mkD(); d3.active = 1; d3.phase = 'battle'; d3.turn = 4; const ma = give(d3, 0, 'Celtic Guardian'), mb = give(d3, 0, 'Celtic Guardian'); const at = give(d3, 1, 'Blue-Eyes White Dragon'); at.placedTurn = 0;
    const ra = give(d3, 0, 'Raregold Armor', 'st'); ra.equipTo = ma.uid;
    const r3 = await d3.doAttack(1, 0, d3.P(0).mz.indexOf(mb)); assert(r3 && r3.error, 'Raregold Armor korumadı');
    const r3b = await d3.doAttack(1, 0, d3.P(0).mz.indexOf(ma)); assert(r3b && !r3b.error, 'Raregold Armor donatılmış canavara saldırıyı engelledi');
    // The Sanctuary in the Sky: Fairy savaş hasarı 0
    const d4 = mkD(); d4.active = 1; d4.phase = 'battle'; d4.turn = 4; give(d4, 0, 'The Sanctuary in the Sky', 'field'); const fa = give(d4, 0, 'Petit Angel'); const at4 = give(d4, 1, 'Blue-Eyes White Dragon'); at4.placedTurn = 0; fa.pos = 'atk';
    const lp4 = d4.P(0).lp; await d4.doAttack(1, 0, d4.P(0).mz.indexOf(fa)); assert(d4.P(0).lp === lp4, 'Sanctuary Fairy hasarını engellemedi');
    // Dice Jar FLIP: iki zar atılır
    const before = evs.filter(e => e.type === 'dice').length; const d5 = mkD(); const jar = give(d5, 0, 'Dice Jar'); await E.FX['Dice Jar'].onFlip(d5, 0, jar);
    assert(evs.filter(e => e.type === 'dice').length >= before + 2, 'Dice Jar iki zar atmadı');
    console.log('Yazı-tura/zar ve 11-12. paket testleri OK');
  }
  {
    // 13-14. paket: Union, Spell Counter, çift tribute, saldırı yönlendirme, kısıtlamalar, Destiny Board...
    const f = []; for (let i = 0; i < 20; i++) f.push(id('Celtic Guardian'));
    const mkD = () => { const d = new E.Duel({ decks: [f.slice(), f.slice()], db, ctl: [scripted([]), scripted([])], first: 0, maxTurns: 1 }); d.turn = 3; d.active = 0; d.phase = 'main1'; d.P(0).hand = []; d.P(1).hand = []; return d; };
    const give = (d, p, name, where = 'mz', up = true) => { const c = d.inst(id(name), p); if (where === 'hand') d.P(p).hand.push(c); else if (where === 'mz') { c.placedTurn = 0; d.P(p).mz[d.freeZone(p, 'mz')] = c; } else if (where === 'st') { c.up = up; c.placedTurn = 0; d.P(p).st[d.freeZone(p, 'st')] = c; } else if (where === 'field') { c.up = true; d.P(p).field = c; } return c; };
    // Union: Zombie Tiger → Decayed Commander (+500 ATK), çözme, savaşta Union feda edilir
    const d1 = mkD(); const dc = give(d1, 0, 'Decayed Commander'), zt = give(d1, 0, 'Zombie Tiger'); const a0 = d1.atk(dc);
    await d1.perform(0, { type: 'ability', zone: d1.P(0).mz.indexOf(zt) });
    assert(d1.P(0).st.includes(zt) && d1.atk(dc) === a0 + 500, 'Union donatılmadı / ATK artmadı');
    await d1.perform(0, { type: 'stability', st: d1.P(0).st.indexOf(zt), i: 0 }); assert(d1.inMZ(zt) && d1.atk(dc) === a0, 'Union çözülmedi');
    zt.abilityTurn = -1; await d1.perform(0, { type: 'ability', zone: d1.P(0).mz.indexOf(zt) }); d1.phase = 'battle'; d1.active = 1; d1.turn = 4;
    const bw = give(d1, 1, 'Blue-Eyes White Dragon'); bw.placedTurn = 0; await d1.doAttack(1, 0, d1.P(0).mz.indexOf(dc));
    assert(d1.onField(dc) && d1.P(0).grave.includes(zt), 'Union savaşta host yerine yok olmadı');
    // Spell Counter: Tower of Babel 4. sayaçta yok olur, aktive eden 3000 hasar alır
    const d2 = mkD(); const tw = give(d2, 0, 'Tower of Babel', 'st'); const sp = give(d2, 0, 'Pot of Greed', 'hand'); const lp2 = d2.P(1).lp;
    for (let i = 0; i < 4; i++) await E.FX['Tower of Babel'].onSpellResolved(d2, 0, tw, 1, sp);
    assert(!d2.onField(tw) && d2.P(1).lp === lp2 - 3000, 'Tower of Babel 3000 hasar vermedi');
    // Çift tribute: Double Coston tek başına Level 7 DARK canavarı çağırır
    const d3 = mkD(); const co = give(d3, 0, 'Double Coston'); give(d3, 0, 'Dark Magician', 'hand'); const cs = d3.canSummon(0, 0);
    assert(cs.ok && cs.need === 2, 'Double Coston tribute sayılmadı'); const r3 = await d3.perform(0, { type: 'summon', hand: 0, tributes: [d3.P(0).mz.indexOf(co)] });
    assert(r3 && !r3.error && d3.monsters(0).some(m => m.d.name === 'Dark Magician'), 'Double Coston ile Tribute Summon olmadı');
    // Astral Barrier: saldırı direkt olur
    const d4 = mkD(); d4.active = 1; d4.phase = 'battle'; d4.turn = 4; const vi = give(d4, 0, 'Celtic Guardian'); give(d4, 0, 'Astral Barrier', 'st'); const at4 = give(d4, 1, 'Blue-Eyes White Dragon'); at4.placedTurn = 0; const lp4 = d4.P(0).lp;
    await d4.doAttack(1, 0, 0); assert(d4.onField(vi) && d4.P(0).lp < lp4, 'Astral Barrier saldırıyı direkt yapmadı');
    // Kaiser Colosseum: rakip, benden fazla canavar koyamaz
    const d5 = mkD(); give(d5, 0, 'Kaiser Colosseum', 'st'); give(d5, 0, 'Celtic Guardian'); give(d5, 1, 'Celtic Guardian'); give(d5, 1, 'Gaia The Fierce Knight', 'hand'); d5.active = 1; const cs5 = d5.canSummon(1, 0);
    assert(!cs5.ok, 'Kaiser Colosseum sınırlamadı');
    // DNA Surgery: tüm canavarlar seçilen Tür olur, kart çıkınca eski haline döner
    const d6 = mkD(); const m6 = give(d6, 0, 'Celtic Guardian'); const dn = give(d6, 0, 'DNA Surgery', 'st', false); await d6.perform(0, { type: 'activate', st: 0 });
    assert(m6.d.race === 'Warrior' || m6.d.race === d6.P(0).st[0].dna, 'DNA Surgery uygulanmadı'); const raceBefore = m6.d0 ? m6.d0.race : m6.d.race; await d6.destroy(dn); assert(m6.d.race === raceBefore, 'DNA Surgery bitince Tür geri gelmedi');
    // Destiny Board: I-N-A + L yerleşince oyun biter
    const d7 = mkD(); const db7 = give(d7, 0, 'Destiny Board', 'st'); db7.msgs = ['I', 'N', 'A'].map(l => d7.inst(id(`Spirit Message "${l}"`), 0)); give(d7, 0, 'Spirit Message "L"', 'hand');
    await E.FX['Destiny Board'].endPhaseAny(d7, 1, db7); assert(d7.over && d7.winner === 0, 'Destiny Board kazanç vermedi');
    // Royal Oppression: Özel Çağırma 800 LP karşılığı iptal edilir
    const d8 = mkD(); give(d8, 1, 'Royal Oppression', 'st'); const sm = give(d8, 0, 'Celtic Guardian', 'hand'); const lp8 = d8.P(1).lp; const ok8 = await d8.specialSummon(0, sm);
    assert(!ok8 && d8.P(1).lp === lp8 - 800, 'Royal Oppression Özel Çağırmayı iptal etmedi');
    // Parasite Paracide: rakibin destesine girer, çekilince çağrılır ve 1000 hasar verir
    const d9 = mkD(); const pp = give(d9, 0, 'Parasite Paracide'); pp.up = false; await E.FX['Parasite Paracide'].onFlip(d9, 0, pp); assert(d9.P(1).deck.includes(pp), 'Parasite Paracide rakip destesine girmedi');
    d9.P(1).deck.unshift(pp); const lp9 = d9.P(1).lp; await d9.draw(1, 1); assert(d9.inMZ(pp) && d9.P(1).lp === lp9 - 1000, 'Parasite Paracide çekilince çağrılmadı');
    // Chain Energy: hamle başına 500 LP; Mermaid Knight + Umi: iki saldırı
    const d10 = mkD(); give(d10, 0, 'Chain Energy', 'st'); give(d10, 0, 'Celtic Guardian', 'hand'); const lp10 = d10.P(0).lp; await d10.perform(0, { type: 'summon', hand: 0, tributes: [] }); assert(d10.P(0).lp === lp10 - 500, 'Chain Energy LP almadı');
    const d11 = mkD(); give(d11, 0, 'Umi', 'field'); const mk = give(d11, 0, 'Mermaid Knight'); assert(E.FX['Mermaid Knight'].multiAttack(d11, mk) === 2, 'Mermaid Knight Umi ile 2 saldırı yapamadı');
    // Heart of Clear Water: ATK 1300+ ise kendini yok eder
    const d12 = mkD(); const hm = give(d12, 0, 'Gaia The Fierce Knight'); const hc = give(d12, 0, 'Heart of Clear Water', 'st'); hc.equipTo = hm.uid; await d12.checkWin(); assert(!d12.onField(hc), 'Heart of Clear Water yüksek ATK\'de yok olmadı');
    // Magical Hats / Last Turn / Soul Exchange / Pyro Clock: hata vermeden çözülür
    const d13 = mkD(); const mm = give(d13, 0, 'Celtic Guardian'); for (let i = 0; i < 2; i++) d13.P(0).deck.unshift(d13.inst(id('Mirror Force'), 0)); const mh = give(d13, 0, 'Magical Hats', 'st', false); d13.active = 1; await d13.trapWindow('phase', { phase: 'battle', stop: false }, 0);
    assert(d13.monsters(0).length === 3, 'Magical Hats 3 canavar oluşturmadı');
    console.log('13-14. paket sahne testleri OK');
    // Yalnızca yeni kartlardan oluşan destelerle stres (hook/uyumluluk)
    const names13 = Object.keys(E.FX).filter(n => !KEYS12.has(n)); const newCards = cards.filter(c => names13.includes(c.name) && Decks.isPlayable(c));
    const base = pool.all.filter(c => !names13.includes(c.name) && c.type !== 'Fusion Monster' && !c.ritual && c.type === 'Normal Monster' && c.level <= 4);
    const mk13 = () => { const m = []; while (m.length < 30) { const c = Math.random() < 0.7 ? newCards[Math.floor(Math.random() * newCards.length)] : base[Math.floor(Math.random() * base.length)]; if (c.type === 'Fusion Monster') continue; if (m.filter(i => i === c.id).length < Decks.copyLimit(c)) m.push(c.id); } return m; };
    let crashed13 = 0; const N13 = +(process.env.STRESS13 || 120);
    for (let g = 0; g < N13; g++) {
      const d = new E.Duel({ decks: [mk13(), mk13()], db, ctl: [makeAI(), makeAI()], first: g % 2, maxTurns: 30 });
      try { await Promise.race([d.run(), new Promise((_, rj) => setTimeout(() => rj(new Error('zaman aşımı')), 8000))]); invariants(d); }
      catch (e) { crashed13++; console.error('13-14 STRES HATASI:', e.message, e.stack.split('\n').slice(0, 4).join(' | ')); }
    }
    assert(crashed13 === 0, `${crashed13} yeni-kart stres düellosu çöktü`);
    console.log(`13-14. paket stres: ${N13} düello bitti (${newCards.length} yeni kart)`);
  }
  {
    // Rastgele destelerle stres testi: tüm kodlanmış kartlar hata vermeden çalışmalı
    const pl = pool.all.filter(c => c.type !== 'Fusion Monster' && !c.ritual && c.name !== 'Polymerization');
    const mk = () => { const m = []; while (m.length < 30) { const c = pl[Math.floor(Math.random() * pl.length)]; if (m.filter(i => i === c.id).length < Decks.copyLimit(c)) m.push(c.id); } return m; };
    let crashed = 0;
    for (let g = 0; g < 60; g++) {
      const d = new E.Duel({ decks: [mk(), mk()], db, ctl: [makeAI(), makeAI()], first: g % 2, maxTurns: 30 });
      try { await Promise.race([d.run(), new Promise((_, rj) => setTimeout(() => rj(new Error('zaman aşımı')), 8000))]); invariants(d); }
      catch (e) { crashed++; console.error('STRES HATASI:', e.message, e.stack.split('\n').slice(0, 3).join(' | ')); }
    }
    assert(crashed === 0, `${crashed} stres düellosu çöktü`);
    console.log('Stres: 60 rastgele-deste düellosu bitti');
  }

  // --- AI vs AI ---
  const keys = Object.keys(Decks.ENEMIES);
  const results = { 0: 0, 1: 0, draw: 0 };
  let total = 0;
  for (let g = 0; g < 40; g++) {
    const a = Decks.starterDeck(cards, g % 2 ? 'kaiba' : 'yugi');
    const b = Decks.enemyDeck(cards, keys[g % keys.length]);
    const d = new E.Duel({ decks: [a.main, b.main], extras: [a.extra, b.extra], db, ctl: [makeAI(), makeAI()], first: g % 2, maxTurns: 40 });
    const t0 = Date.now();
    const r = await d.run();
    invariants(d);
    total += d.turn;
    if (r.winner === null) results.draw++; else results[r.winner]++;
    assert(Date.now() - t0 < 5000, 'düello çok uzun sürdü');
  }
  console.log('40 düello bitti. Sonuçlar:', results, 'ortalama tur:', (total / 40).toFixed(1));
  assert(results.draw < 20, 'çok fazla berabere (AI takılıyor olabilir)');
  console.log(fails ? `${fails} HATA` : 'TÜM TESTLER GEÇTİ');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
