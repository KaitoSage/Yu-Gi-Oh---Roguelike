// Kart efektleri — 4. paket: Fusion canavarların oynanabilir olması için eksik Fusion'lar ve malzeme kartları.
// Dark Paladin (Buster Blader zaten var) dahil, daha önce efekti kodlanmadığı için havuzda olmayan 17 Fusion ve 18 malzeme.
// Basitleştirmeler:
//  - Union canavarlar (Pitch-Dark Dragon, Y-Dragon Head, Z-Metal Tank) yalnızca gövde olarak oynanır (Union ekipman efekti yok).
//  - XY/XYZ/XZ/YZ Cannon'lar "malzemeleri banish ederek" değil, Polymerization ile çağrılır.
//  - Relinquished / Thousand-Eyes Restrict: rakip canavarı "ekipman" olarak yutar; aldığın savaş hasarını rakibe yansıtma yok.
//  - Dark Balter: savaşta yok ettiği canavarın efektini yok sayma yok. Dark Paladin: GY'deki kartın efektini engelleme yok.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects3.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };

  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }
  const isMon = c => c.d.kind === 'monster';
  const stZone = (d, p) => [d.P(p).field, ...d.P(p).st].filter(Boolean);
  const upMons = (d, p) => d.monsters(p, true);
  const toHandFrom = async (d, p, c) => { d.removeFromWherever(c); d.P(p).hand.push(c); await d.ev('search', { p, card: c }); };
  async function discardOne(d, p, prompt) {
    const c = await pick(d, p, d.P(p).hand, prompt, 'discard');
    if (!c) return false;
    await d.sendToGrave(c, 'discard');
    return true;
  }
  const randDiscard = async (d, victim) => { const H = d.P(victim).hand; if (!H.length) return; await d.sendToGrave(H[Math.floor(d.rng() * H.length)], 'discard'); };

  // ================================================================== MALZEME KARTLARI
  // Pozisyon değişince tetiklenenler (engine: fx.onPos(d, p, c, from, to))
  S('Crass Clown', { async onPos(d, p, c, from, to) { if (from === 'def' && to === 'atk') { const t = await pick(d, p, d.monsters(O(p)), 'Crass Clown: ele dönecek rakip canavarı', 'harm'); if (t) await d.bounce(t); } } });
  S('Dream Clown', { async onPos(d, p, c, from, to) { if (from === 'atk' && to === 'def') { const t = await pick(d, p, d.monsters(O(p)), 'Dream Clown: yok edilecek rakip canavarı', 'harm'); if (t) await d.destroy(t, c); } } });
  S('Tainted Wisdom', { async onPos(d, p, c, from, to) { if (from === 'atk' && to === 'def') E.shuffle(d.P(p).deck, d.rng); } });

  // Blast Juggler: Standby Phase'inde kendini tribute et; ATK 1000 veya altı 2 yüzü açık canavarı yok et
  S('Blast Juggler', {
    async standby(d, p, c) {
      const cands = () => upMons(d, 0).concat(upMons(d, 1)).filter(m => m !== c && d.atk(m) <= 1000);
      if (cands().filter(m => m.owner !== p).length < 1 || cands().length < 2) return;
      if (!(await d.ask(p, c, 'Kendini tribute et: ATK 1000 veya altı 2 yüzü açık canavarı yok et?'))) return;
      await d.sendToGrave(c, 'tribute');
      for (let i = 0; i < 2; i++) { const t = await pick(d, p, cands(), `Blast Juggler: yok edilecek canavar (${i + 1}/2)`, 'harm'); if (t) await d.destroy(t, c); }
    },
  });
  S('Possessed Dark Soul', {
    ability: {
      label: 'Tribute: Level 3 veya altı rakip canavarlarının kontrolünü al',
      can: (d, p) => upMons(d, O(p)).some(m => (m.d.level || 0) <= 3),
      async resolve(d, p, c) {
        const ts = upMons(d, O(p)).filter(m => (m.d.level || 0) <= 3);
        await d.sendToGrave(c, 'tribute');
        for (const m of ts) { if (d.freeZone(p, 'mz') < 0) break; await d.takeControl(m, p, false); }
      },
      ai: (d, p) => upMons(d, O(p)).filter(m => (m.d.level || 0) <= 3).length >= 1,
    },
  });
  // Frontier Wiseman: senin Warrior'ını hedef alan Büyü efektini iptal et ve o kartı yok et
  S('Frontier Wiseman', {
    async guardTarget(d, x, target, src) {
      if (src.kind !== 'spell' || target.owner !== x.owner || target.d.kind !== 'monster' || target.d.race !== 'Warrior') return false;
      if (src.card && d.onField(src.card)) await d.destroy(src.card, x);
      return true;
    },
  });
  S('Pitch-Dark Dragon', {}); S('Y-Dragon Head', {}); S('Z-Metal Tank', {}); // Union efekti yok: gövde olarak oynanır
  S('Lesser Fiend', { async onKill(d, p, c, victim) { if (d.P(victim.owner).grave.includes(victim)) await d.banish(victim); } });
  S('Des Kangaroo', { async defWin(d, p, c, atker) { if (d.atk(atker) < d.def(c)) await d.destroy(atker, c); } });
  S('Spirit Reaper', {
    noBattleDestroy: true, destroyWhenTargeted: true,
    async onBattleDamage(d, p, c, amt, victim, direct) { if (direct) await randDiscard(d, victim); },
  });
  S('Spirit Ryu', {
    async battleBoost(d, p, c) {
      if (!d.P(p).hand.some(x => isMon(x) && x.d.race === 'Dragon')) return;
      if (!(await d.ask(p, c, '1 Dragon canavarı at: bu savaşta +1000 ATK/DEF?'))) return;
      const t = await pick(d, p, d.P(p).hand.filter(x => isMon(x) && x.d.race === 'Dragon'), 'At: Dragon canavar', 'discard');
      if (!t) return;
      await d.sendToGrave(t, 'discard'); d.addTemp(c, 1000, 1000);
    },
  });
  S('The Forgiving Maiden', {
    ability: {
      label: 'Tribute: bu tur savaşta yok olan canavarını ele al', battle: true,
      can: (d, p) => d.P(p).grave.some(g => isMon(g) && g.graveInfo && g.graveInfo.turn === d.turn && g.graveInfo.why === 'battle'),
      async resolve(d, p, c) {
        const t = await pick(d, p, d.P(p).grave.filter(g => isMon(g) && g.graveInfo && g.graveInfo.turn === d.turn && g.graveInfo.why === 'battle'), 'Ele dönecek canavar', 'help');
        if (!t) return false;
        await d.sendToGrave(c, 'tribute'); await toHandFrom(d, p, t);
      },
    },
  });
  S('Zombyra the Dark', { noDirectAtk: true, async onKill(d, p, c) { c.bonus.atk -= 200; } });
  S('Maryokutai', {
    negator: {
      can: (d, x, card) => card.d.kind === 'spell' && d.active !== x.owner,
      text: card => `${card.d.name} aktive edildi: Maryokutai'yi tribute edip iptal et ve yok et?`,
      cost: async (d, p, x) => { await d.sendToGrave(x, 'tribute'); },
      async after(d, p, x, src) { if (d.onField(src)) await d.destroy(src, x); },
    },
  });
  S('Thunder Dragon', {
    handEffect: {
      label: 'At: desteden 2 Thunder Dragon al',
      can: (d, p) => d.P(p).deck.some(x => x.d.name === 'Thunder Dragon'),
      async resolve(d, p, c) {
        await d.sendToGrave(c, 'discard');
        for (let i = 0; i < 2; i++) { const t = d.P(p).deck.find(x => x.d.name === 'Thunder Dragon'); if (t) await toHandFrom(d, p, t); }
      },
      ai: (d, p) => d.P(p).deck.filter(x => x.d.name === 'Thunder Dragon').length >= 1 && d.P(p).hand.length >= 3,
    },
  });

  // Relinquished / Thousand-Eyes Restrict: rakip canavarı "ekipman" olarak yutar, ATK/DEF onunki olur
  const absorb = {
    selfMod: (c, key) => (c.absorbed ? (c.absorbed.d[key] || 0) : 0),
    async battleSub(d, c) { // savaşta yok olacaksa yutulan canavar yok olur
      if (!c.absorbed) return false;
      const m = c.absorbed; c.absorbed = null;
      m.owner = m.origOwner; d.P(m.owner).grave.push(m); m.graveInfo = { turn: d.turn, why: 'battle' };
      await d.ev('toGrave', { card: m, from: 'equip', why: 'battle' });
      return true;
    },
    async onGrave(d, p, c) { if (c.absorbed) { const m = c.absorbed; c.absorbed = null; m.owner = m.origOwner; d.P(m.owner).grave.push(m); } },
    ability: {
      label: 'Rakip canavarını yut (ekipman)',
      can: (d, p, c) => !c.absorbed && d.monsters(O(p)).length > 0,
      async resolve(d, p, c) {
        const t = await pick(d, p, d.monsters(O(p)), 'Yutulacak rakip canavarı', 'harm');
        if (!t || d.immune(t, 'control')) return false;
        d.removeFromWherever(t); t.up = true; t.pos = 'atk'; c.absorbed = t;
        await d.ev('ability', { p, card: c });
      },
      ai: (d, p) => d.monsters(O(p)).length > 0,
    },
  };
  S('Relinquished', absorb);

  // ================================================================== FUSION CANAVARLAR
  const countDragons = d => d.allField().filter(x => isMon(x) && x.d.race === 'Dragon').length + [0, 1].reduce((s, i) => s + d.P(i).grave.filter(g => isMon(g) && g.d.race === 'Dragon').length, 0);
  S('Dark Paladin', {
    selfMod: (c, key, d) => (key === 'atk' ? 500 * countDragons(d) : 0),
    // Büyü aktive edilince (Quick): 1 kart at, iptal et ve yok et
    negator: {
      can: (d, x, card) => card.d.kind === 'spell' && d.P(x.owner).hand.length > 0,
      text: card => `${card.d.name} aktive edildi: 1 kart atıp iptal et ve yok et? (Dark Paladin)`,
      cost: (d, p) => discardOne(d, p, 'At: 1 kart (Büyüyü iptal eder)'),
      async after(d, p, x, src) { if (d.onField(src)) await d.destroy(src, x); },
    },
  });
  S('Dark Balter the Terrible', {
    negator: {
      can: (d, x, card) => card.d.kind === 'spell' && card.d.race === 'Normal' && d.P(x.owner).lp > 1000,
      text: card => `${card.d.name} aktive edildi: 1000 LP ödeyip iptal et? (Dark Balter)`,
      cost: async (d, p) => { await d.damage(p, 1000); },
    },
  });
  S('Dark Blade the Dragon Knight', {
    async onBattleDamage(d, p, c, amt, victim) {
      if (victim === p) return;
      const gy = d.P(victim).grave.filter(isMon).sort((a, b) => (b.d.atk || 0) - (a.d.atk || 0)).slice(0, 3);
      for (const m of gy) await d.banish(m);
    },
  });
  S('Dark Flare Knight', {
    // Bu kartın dahil olduğu savaşlarda savaş hasarı almazsın
    shield: (d, p, n, src, f) => (d.battle && (d.battle.a === f || d.battle.d === f) ? 0 : n),
    async onGrave(d, p, c, why) {
      if (why !== 'battle') return;
      const mk = [...d.P(p).hand, ...d.P(p).deck].find(x => x.d.name === 'Mirage Knight');
      if (mk && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, mk);
    },
  });
  S('Fiend Skull Dragon', {
    negateFlip: true, // Flip Efekt canavarlarının efektleri yok sayılır
    async onTargeted(d, p, c) { // Tuzak efekti hedef alırsa iptal et ve o Tuzağı yok et
      const s = d.src; if (!s || s.kind !== 'trap') return false;
      if (s.card && d.onField(s.card)) await d.destroy(s.card, c);
      return true;
    },
  });
  S('Mokey Mokey King', {
    async onGrave(d, p) { for (const m of d.P(p).grave.filter(x => x.d.name === 'Mokey Mokey')) { if (d.freeZone(p, 'mz') < 0) break; await d.specialSummon(p, m); } },
  });
  S('Ojama King', {
    // Rakibin 3 canavar bölgesi kullanılamaz (boş olanlar öncelikli)
    async onSummon(d, p, c) {
      if (!c.special) return;
      const zs = [0, 1, 2].sort((a, b) => (d.P(O(p)).mz[a] ? 1 : 0) - (d.P(O(p)).mz[b] ? 1 : 0));
      c.blockZones = zs.slice(0, 3);
    },
  });
  S('Reaper on the Nightmare', {
    noBattleDestroy: true, destroyWhenTargeted: true, direct: true,
    async onBattleDamage(d, p, c, amt, victim, direct) { if (direct) await randDiscard(d, victim); },
  });
  S('Ryu Senshi', {
    negator: {
      can: (d, x, card) => card.d.kind === 'trap' && card.d.race === 'Normal' && d.P(x.owner).lp > 1000,
      text: card => `${card.d.name} aktive edildi: 1000 LP ödeyip iptal et? (Ryu Senshi)`,
      cost: async (d, p) => { await d.damage(p, 1000); },
    },
    async onTargeted(d, p, c) { // Büyü efekti hedef alırsa iptal et ve o Büyüyü yok et
      const s = d.src; if (!s || s.kind !== 'spell') return false;
      if (s.card && d.onField(s.card)) await d.destroy(s.card, c);
      return true;
    },
  });
  // Super Robolady <-> Super Roboyarou
  const swap = (self, other, why) => ({
    label: `Extra Deck'e dön: ${other} çağır`,
    can: (d, p, c) => c.placedTurn !== d.turn && d.P(p).extra.some(x => x.d.name === other),
    async resolve(d, p, c) {
      const t = d.P(p).extra.find(x => x.d.name === other); if (!t) return false;
      await d.bounce(c);
      if (d.onField(c)) return false;
      await d.specialSummon(p, t);
    },
    ai: () => false,
  });
  S('Super Robolady', {
    selfMod: (c, key, d) => (key === 'atk' && d.battle && d.battle.direct && d.battle.a === c ? 1000 : 0),
    ability: swap('Super Robolady', 'Super Roboyarou'),
  });
  S('Super Roboyarou', {
    selfMod: (c, key, d) => (key === 'atk' && d.battle && !d.battle.direct && (d.battle.a === c || d.battle.d === c) ? 1000 : 0),
    ability: swap('Super Roboyarou', 'Super Robolady'),
  });
  S('The Last Warrior from Another Planet', {
    noSummon: true, // yüzü açıkken iki oyuncu da canavar çağıramaz
    async onSummon(d, p, c) { if (!c.special) return; for (const m of d.monsters(p).filter(x => x !== c)) await d.destroy(m, c); },
  });
  S('Thousand-Eyes Restrict', Object.assign({}, absorb, {
    restrictAttack: (d, c, f) => (c !== f ? 'Thousand-Eyes Restrict: diğer canavarlar saldıramaz' : null),
    restrictPos: (d, c, f) => (c !== f ? 'Thousand-Eyes Restrict: diğer canavarlar pozisyon değiştiremez' : null),
  }));

  // Cannon Fusion'ları: 1 kart at, hedefi yok et (tur başı sınır yok; maliyet el kartıdır)
  const cannon = (name, targets) => S(name, {
    ability: {
      label: '1 kart at: hedefi yok et', times: 9,
      can: (d, p) => d.P(p).hand.length > 0 && targets(d, p).length > 0,
      async resolve(d, p, c) {
        if (!(await discardOne(d, p, `${name}: At (1 kart)`))) return false;
        const t = await pick(d, p, targets(d, p), `${name}: yok edilecek kart`, 'harm');
        if (t) await d.destroy(t, c);
      },
      ai: (d, p) => d.P(p).hand.length >= 3 && targets(d, p).length > 0,
    },
  });
  cannon('XY-Dragon Cannon', (d, p) => stZone(d, O(p)).filter(x => x.up));
  cannon('XYZ-Dragon Cannon', (d, p) => [...d.monsters(O(p)), ...stZone(d, O(p))]);
  cannon('XZ-Tank Cannon', (d, p) => stZone(d, O(p)).filter(x => !x.up));
  cannon('YZ-Tank Dragon', (d, p) => d.monsters(O(p)).filter(x => !x.up));
});
