// Kart efektleri — 13. paket: Union canavarlar, Spell Counter sistemi, çift tribute, saldırı yönlendirme, el açma, kısıtlama kartları (A–L).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects12.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };
  const eqFx = (name, race, a, df, extra) => { if (!FX[name]) E.equipHelper(name, race, a, df, extra); };

  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }
  // Kartı oyuncuya göster (modal); seçim sonucu önemsiz
  async function look(d, p, cards, title) { if (cards.length) await d.ctl[p].pick(d, p, cards.map(card => ({ card })), title, 'help'); }
  const isMon = c => c.d.kind === 'monster';
  const isST = c => c.d.kind !== 'monster';
  const lv = c => c.d.level || 0;
  const mons = (d, p, up) => d.monsters(p, up);
  const fieldHas = (d, n) => d.allField().some(c => c.up && c.d.name === n);
  const ownHas = (d, p, n) => d.allField().some(c => c.up && c.owner === p && c.d.name === n);
  const pay = async (d, p, n) => { if (d.P(p).lp <= n) return false; await d.damage(p, n); return true; };
  const shuffleDeck = (d, p) => E.shuffle(d.P(p).deck, d.rng);
  const pand = d => d.allField().some(x => x.up && x.d.name === 'Pandemonium');
  const umi = d => d.allField().some(c => c.up && (c.d.name === 'Umi' || c.d.name === 'Maiden of the Aqua'));
  const discLock = d => d.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].noDiscardCost);
  const TYPES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic'];
  const ATTRS = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND'];
  const plainOk = c => isMon(c) && c.d.type !== 'Fusion Monster' && !/Ritual/.test(c.d.type) && !(FX[c.d.name] && (FX[c.d.name].handSummon || FX[c.d.name].summonReq));
  async function discardRandom(d, q, n = 1) { for (let i = 0; i < n && d.P(q).hand.length; i++) { const H = d.P(q).hand; await d.sendToGrave(H[Math.floor(d.rng() * H.length)], 'discard'); } }
  const toHand = async (d, p, c) => { d.removeFromWherever(c); d.P(p).hand.push(c); await d.ev('search', { p, card: c }); };
  const faceDown = { label: 'Kapalı savunmaya geç', can: (d, p, c) => c.up, async resolve(d, p, c) { c.up = false; c.pos = 'def'; await d.ev('pos', { p, card: c }); } };
  const placeST = async (d, p, c, host, up = true) => { // kartı Büyü/Tuzak bölgesine koy (equip gibi)
    const zi = d.freeZone(p, 'st'); if (zi < 0) return false;
    d.removeFromWherever(c); c.owner = p; c.equipTo = host ? host.uid : null; c.up = up; c.pos = 'atk'; c.placedTurn = d.turn; d.P(p).st[zi] = c;
    return true;
  };

  // ---------- Özel (veri tabanında olmayan) Token'lar: mevcut bir Token'ın resmini kullanır ----------
  async function mkToken(d, p, name, atk, def, level, race, attr, pos = 'atk', copy = null) {
    const E_ = E._ctok = E._ctok || {};
    const key = copy ? 'Mirage:' + copy.d.id : name;
    if (!E_[key]) {
      const base = [...d.db.values()].find(c => c.name === 'Slime Token');
      E_[key] = copy ? Object.assign({}, copy.d0 || copy.d, { id: -(900 + Object.keys(E_).length), name, type: 'Token', desc: name }) : { id: -(900 + Object.keys(E_).length), name, type: 'Token', kind: 'monster', frame: 'normal', desc: name + ' (Token)', race, attr, atk, def, level, img: base ? base.img : 0 };
    }
    const def_ = E_[key];
    if (!d.db.has(def_.id)) d.db.set(def_.id, def_);
    const t = d.inst(def_.id, p);
    return (await d.specialSummon(p, t, { pos })) ? t : false;
  }
  E.mkToken = mkToken;

  // ======================================================================== SPELL COUNTER SİSTEMİ
  const canSC = c => !!(FX[c.d.name] && FX[c.d.name].sc);
  const addSC = (c, n = 1) => { if (!canSC(c)) return; c.sc = Math.min(FX[c.d.name].scMax || 99, (c.sc || 0) + n); };
  const scTotal = (d, p) => d.allField().filter(c => c.owner === p && canSC(c)).reduce((s, c) => s + (c.sc || 0), 0);
  function scRemove(d, p, n) {
    if (scTotal(d, p) < n) return false;
    for (const c of d.allField().filter(x => x.owner === p && canSC(x))) { const t = Math.min(n, c.sc || 0); c.sc = (c.sc || 0) - t; n -= t; if (!n) break; }
    return true;
  }
  E.sc = { add: addSC, total: scTotal, remove: scRemove, can: canSC };
  const scAuto = (max, extra) => Object.assign({ sc: true, scMax: max, async onSpellResolved(d, o, x) { addSC(x, 1); } }, extra);

  S('Magical Plant Mandragola', { sc: true, async onFlip(d) { for (const x of d.allField().filter(y => y.up && canSC(y))) addSC(x, 1); } });
  S('Tower of Babel', {
    sub: 'continuous', manual: true, aiOk: () => false, sc: true, async resolve() {},
    async onSpellResolved(d, o, x, p) { addSC(x, 1); if ((x.sc || 0) >= 4) { await d.destroy(x, x); await d.damage(p, 3000, x); } },
  });
  S('Pitch-Black Power Stone', {
    sub: 'continuous', manual: true, aiOk: () => false, sc: true, async resolve(d, p, c) { c.sc = 3; },
    stAb: [{
      label: '1 Spell Counter\'ı başka karta aktar', can: (d, p, c) => (c.sc || 0) > 0 && d.allField().some(x => x !== c && x.up && canSC(x)),
      async resolve(d, p, c) { const t = await pick(d, p, d.allField().filter(x => x !== c && x.up && canSC(x)), 'Spell Counter konacak kart', 'help'); if (!t) return false; c.sc--; addSC(t, 1); if (c.sc <= 0) await d.destroy(c, c); },
      ai: () => true,
    }],
  });
  S('Legendary Flame Lord', scAuto(99, {
    ability: {
      label: '3 Spell Counter: diğer tüm canavarları yok et', can: (d, p, c) => (c.sc || 0) >= 3,
      async resolve(d, p, c) { c.sc -= 3; for (const m of d.allField().filter(x => isMon(x) && x !== c)) await d.destroy(m, c); },
      ai: (d, p, c) => d.monsters(O(p)).length > d.monsters(p).length,
    },
  }));
  S('Anti-Spell', { counter: { kinds: ['spell'], can: (d, o) => scTotal(d, o) >= 2, async cost(d, o) { return scRemove(d, o, 2); }, text: card => `${card.d.name}: 2 Spell Counter ver ve iptal et?`, ai: () => true } });
  S('Armor Exe', {
    canAttack: (d, p, c) => (c.placedTurn === d.turn ? 'Bu tur saldıramaz' : null),
    async standbyAny(d, tp, x) { if (!scRemove(d, x.owner, 1)) await d.destroy(x, x); },
  });
  S('Exhausting Spell', { manual: true, aiOk: () => false, can: d => d.allField().some(c => (c.sc || 0) > 0), async resolve(d) { for (const c of d.allField()) c.sc = 0; } });
  S('Mega Ton Magical Cannon', {
    can: (d, p) => scTotal(d, p) >= 10,
    async resolve(d, p) { scRemove(d, p, 10); for (const c of d.allField().filter(x => x.owner === O(p))) await d.destroy(c, null); },
  });
  S('Miracle Restoring', {
    manual: true, aiOk: () => false,
    can: (d, p) => scTotal(d, p) >= 2 && d.freeZone(p, 'mz') >= 0 && d.P(p).grave.some(c => c.d.name === 'Dark Magician' || c.d.name === 'Buster Blader'),
    async resolve(d, p) { const t = await pick(d, p, d.P(p).grave.filter(c => c.d.name === 'Dark Magician' || c.d.name === 'Buster Blader'), 'Çağrılacak canavar', 'revive'); if (!t) return false; scRemove(d, p, 2); await d.specialSummon(p, t); },
  });
  // Spell Counter üreten mevcut kısmi canavarların gerçek efektleri
  FX['Skilled Dark Magician'] = scAuto(3, { ability: { label: 'Tribute: Dark Magician çağır (3 sayaç)', can: (d, p, c) => (c.sc || 0) >= 3, async resolve(d, p, c) { const m = [...d.P(p).hand, ...d.P(p).deck, ...d.P(p).grave].find(x => x.d.name === 'Dark Magician'); if (!m) return false; await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, m); }, ai: () => true } });
  FX['Skilled White Magician'] = scAuto(3, { ability: { label: 'Tribute: Buster Blader çağır (3 sayaç)', can: (d, p, c) => (c.sc || 0) >= 3, async resolve(d, p, c) { const m = [...d.P(p).hand, ...d.P(p).deck, ...d.P(p).grave].find(x => x.d.name === 'Buster Blader'); if (!m) return false; await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, m); }, ai: () => true } });
  FX['Magical Marionette'] = scAuto(99, {
    selfMod: (c, key) => (key === 'atk' ? 200 * (c.sc || 0) : 0),
    ability: { label: '2 Spell Counter: 1 canavarı yok et', can: (d, p, c) => (c.sc || 0) >= 2 && d.allField().some(m => isMon(m) && m !== c), async resolve(d, p, c) { const t = await pick(d, p, d.allField().filter(m => isMon(m) && m !== c), 'Yok edilecek canavar', 'harm'); if (!t) return false; c.sc -= 2; await d.destroy(t, c); }, ai: (d, p, c) => d.monsters(O(p)).length > 0 },
  });
  FX['Royal Magical Library'] = scAuto(3, { ability: { label: '3 Spell Counter: 1 kart çek', can: (d, p, c) => (c.sc || 0) >= 3 && d.P(p).deck.length > 0, async resolve(d, p, c) { c.sc -= 3; await d.draw(p, 1); }, ai: () => true } });
  FX['Apprentice Magician'] = {
    async onSummon(d, p, c) { const t = await pick(d, p, d.allField().filter(x => x.up && canSC(x)), 'Spell Counter konacak kart', 'help'); if (t) addSC(t, 1); },
    async onGrave(d, p, c, why) {
      if (why !== 'battle' || d.freeZone(p, 'mz') < 0) return;
      const t = await pick(d, p, d.P(p).deck.filter(x => isMon(x) && x.d.race === 'Spellcaster' && lv(x) <= 2 && plainOk(x)), 'Desteden Level ≤2 Spellcaster', 'help');
      if (t && (await d.specialSummon(p, t, { pos: 'def' }))) { t.up = false; await d.ev('pos', { p, card: t }); shuffleDeck(d, p); }
    },
  };
  FX['Magical Plant Mandragola'].partial = undefined;

  // ======================================================================== UNION CANAVARLAR
  const isUnion = c => !!(FX[c.d.name] && FX[c.d.name].union);
  const hostUnion = (d, m) => d.allField().find(u => u.equipTo === m.uid && isUnion(u));
  async function unionEquip(d, p, u, host) {
    if (!(await placeST(d, p, u, host))) return false;
    await d.ev('equip', { p, card: u, target: host });
    await d.notify('onEquip', p, u, host);
    return true;
  }
  async function unionRelease(d, p, u) {
    if (d.freeZone(p, 'mz') < 0) return false;
    u.equipTo = null;
    return d.specialSummon(p, u, { pos: 'atk' });
  }
  function union(name, hostOk, extra = {}, stExtra = []) {
    const cands = (d, p, c) => d.monsters(p, true).filter(m => m !== c && hostOk(m, c) && !hostUnion(d, m));
    FX[name] = Object.assign({
      union: true, hostOk,
      ability: {
        label: 'Donat (Union)', can: (d, p, c) => cands(d, p, c).length > 0 && d.freeZone(p, 'st') >= 0,
        async resolve(d, p, c) { const t = await pick(d, p, cands(d, p, c), `${name}: donatılacak canavar`, 'help'); if (!t) return false; if (!(await unionEquip(d, p, c, t))) return false; },
        ai: (d, p, c) => cands(d, p, c).length > 0 && d.freeZone(p, 'st') >= 0,
      },
      stAb: [{ label: 'Union\'u çöz: Saldırı pozisyonunda çağır', can: (d, p, c) => c.owner === c.origOwner && d.freeZone(p, 'mz') >= 0, async resolve(d, p, c) { if (!(await unionRelease(d, p, c))) return false; } }, ...stExtra],
    }, extra);
  }
  const modUnion = (a, df) => (m, key, d, f) => (f.equipTo === m.uid ? (key === 'atk' ? a : df) : 0);
  const named = n => m => m.d.name === n;
  union('Burning Beast', named('Freezing Beast'), {
    async onBattleDmg(d, o, x, atker, amt, tgt) { if (x.equipTo !== atker.uid || tgt === x.owner) return; const t = await pick(d, o, d.allField().filter(c => isST(c) && c.up), 'Burning Beast: yok edilecek açık Büyü/Tuzak', 'harm'); if (t) await d.destroy(t, x); },
  });
  union('Freezing Beast', named('Burning Beast'), {
    async onBattleDmg(d, o, x, atker, amt, tgt) { if (x.equipTo !== atker.uid || tgt === x.owner) return; const t = await pick(d, o, d.allField().filter(c => isST(c) && !c.up), 'Freezing Beast: yok edilecek kapalı Büyü/Tuzak', 'harm'); if (t) await d.destroy(t, x); },
  });
  union('Des Dendle', named('Vampiric Orchis'), {
    async onKillAny(d, o, x, winner, victim) { if (x.equipTo === winner.uid && victim.owner !== x.owner) await mkToken(d, x.owner, 'Wicked Plant Token', 800, 800, 1, 'Plant', 'EARTH'); },
  });
  union('Kiryu', named('Dark Blade'), { mod: modUnion(900, 900) }, [{
    label: 'Tribute: donatılan canavar direkt saldırır', battle: true, can: (d, p, c) => d.allField().some(m => m.uid === c.equipTo),
    async resolve(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (!h) return false; h.directTurn = d.turn; await d.sendToGrave(c, 'tribute'); },
  }]);
  union('Koitsu', named('Aitsu'), { mod: modUnion(3000, 0), givesPierce: true });
  union('Second Goblin', named('Giant Orc'), {}, [{
    label: 'Donatılan canavarın pozisyonunu değiştir', can: (d, p, c) => d.allField().some(m => m.uid === c.equipTo && !m.moved && !m.attacked && m.up),
    async resolve(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (!h) return false; h.pos = h.pos === 'atk' ? 'def' : 'atk'; h.moved = true; await d.ev('pos', { p, card: h }); },
  }]);
  union('Metallizing Parasite - Lunatite', m => m.up, { guardMon: (d, x, c) => c.uid === x.equipTo && !!d.src && d.src.kind === 'spell' && d.src.p !== c.owner });
  union('Heavy Mech Support Platform', m => m.d.race === 'Machine', { mod: modUnion(500, 500), unionSubAll: true });
  union('Zombie Tiger', named('Decayed Commander'), {
    mod: modUnion(500, 500),
    async onKillAny(d, o, x, winner, victim) { if (x.equipTo === winner.uid && victim.owner !== x.owner) await discardRandom(d, O(x.owner), 1); },
  });
  S('Union Rider', {
    ability: {
      label: 'Rakibin Union canavarını bu karta donat', can: (d, p, c) => d.freeZone(p, 'st') >= 0 && !hostUnion(d, c) && mons(d, O(p), true).some(isUnion),
      async resolve(d, p, c) { const u = await pick(d, p, mons(d, O(p), true).filter(isUnion), 'Alınacak Union canavar', 'harm'); if (!u) return false; if (!(await unionEquip(d, p, u, c))) return false; },
      ai: (d, p, c) => mons(d, O(p), true).some(isUnion) && d.freeZone(p, 'st') >= 0,
    },
  });
  S('Formation Union', {
    manual: true, aiOk: () => false,
    can: (d, p) => d.freeZone(p, 'st') >= 0 && d.monsters(p, true).some(u => isUnion(u) && d.monsters(p, true).some(m => m !== u && FX[u.d.name].hostOk(m, u) && !hostUnion(d, m))) || d.P(p).st.some(c => c && c.up && isUnion(c) && c.owner === c.origOwner) && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) {
      const eqU = d.monsters(p, true).filter(u => isUnion(u) && d.monsters(p, true).some(m => m !== u && FX[u.d.name].hostOk(m, u) && !hostUnion(d, m))), free = d.P(p).st.filter(c => c && c.up && isUnion(c) && c.owner === c.origOwner);
      const modes = []; if (eqU.length && d.freeZone(p, 'st') >= 0) modes.push('Union canavarı donat'); if (free.length && d.freeZone(p, 'mz') >= 0) modes.push('Union\'u çöz ve çağır');
      if (!modes.length) return false;
      const m = await d.choose(p, 'Formation Union', modes);
      if (m === 'Union canavarı donat') { const u = await pick(d, p, eqU, 'Donatılacak Union', 'help'); const h = u && await pick(d, p, d.monsters(p, true).filter(x => x !== u && FX[u.d.name].hostOk(x, u) && !hostUnion(d, x)), 'Donatılacak canavar', 'help'); if (!u || !h) return false; await unionEquip(d, p, u, h); }
      else { const u = await pick(d, p, free, 'Çözülecek Union', 'revive'); if (!u) return false; await unionRelease(d, p, u); }
    },
  });
  S('Combination Attack', {
    triggers: [], noAI: true,
    can: (d, p) => d.phase === 'battle' && d.monsters(p, true).some(m => m.atkCount > 0 && hostUnion(d, m)),
    async resolve(d, p) {
      const h = await pick(d, p, d.monsters(p, true).filter(m => m.atkCount > 0 && hostUnion(d, m)), 'Union\'u çözülecek canavar', 'help'); if (!h) return false;
      const u = hostUnion(d, h); if (!(await unionRelease(d, p, u))) return false;
      h.attacked = false; h.atkCount = Math.max(0, (h.atkCount || 1) - 1);
    },
  });

  // ======================================================================== ÇİFT TRIBUTE
  S('Double Coston', { doubleTrib: c => c.d.attr === 'DARK' });
  S('Kaiser Sea Horse', { doubleTrib: c => c.d.attr === 'LIGHT' });
  S('The Trojan Horse', { doubleTrib: c => c.d.attr === 'EARTH' });
  S('Unshaven Angler', { doubleTrib: c => c.d.attr === 'WATER' });
  S('Mask of Restrict', { sub: 'continuous', manual: true, aiOk: () => false, noTributeAny: true, async resolve() {} });

  // ======================================================================== EL AÇMA
  S('Ceremonial Bell', { revealHand: () => true });
  S('Mind on Air', { revealHand: (d, x, p) => p !== x.owner });
  S('Respect Play', { sub: 'continuous', manual: true, aiOk: () => false, revealHand: (d, x, p) => d.active === p, async resolve() {} });
  S('The Eye of Truth', {
    sub: 'continuous', manual: true, aiOk: () => false, revealHand: (d, x, p) => p !== x.owner, async resolve() {},
    async standbyAny(d, tp, x) { if (tp === O(x.owner) && d.P(tp).hand.some(c => c.d.kind === 'spell')) await d.heal(tp, 1000); },
  });
  S('Inspection', {
    sub: 'continuous', noAI: true, async resolve() {},
    async standbyAny(d, tp, x) {
      if (tp !== O(x.owner) || d.P(x.owner).lp <= 500 || !d.P(tp).hand.length || !(await d.ask(x.owner, x, 'Inspection: 500 LP öde, rakibin elinden rastgele 1 kartı gör?'))) return;
      await d.damage(x.owner, 500); const H = d.P(tp).hand; await look(d, x.owner, [H[Math.floor(d.rng() * H.length)]], 'Rakibin elinden rastgele kart');
    },
  });
  const lookSet = async (d, p, x) => { const cs = d.allField().filter(c => c.owner === O(p) && !c.up); if (!cs.length) return; const t = await pick(d, p, cs, `${x.d.name}: bakılacak kapalı kart`, 'help'); if (t) await look(d, p, [t], `${t.d.name} (kapalı kart)`); };
  S('A Man with Wdjat', { async onSummon(d, p, c) { if (!c.special) await lookSet(d, p, c); }, async standby(d, p, c) { await lookSet(d, p, c); } });
  S('Patrol Robo', { async standby(d, p, c) { await lookSet(d, p, c); } });
  S('Cobraman Sakuzy', { ability: faceDown, async onFlip(d, p) { await look(d, p, d.P(O(p)).st.filter(c => c && !c.up), 'Rakibin kapalı Büyü/Tuzakları'); } });

  // ======================================================================== SAVAŞ / SALDIRI YÖNLENDİRME
  S('8-Claws Scorpion', { ability: faceDown, battleBoost(d, p, c) { if (d.battle && d.battle.a === c && d.battle.fd) d.addTemp(c, 2400 - d.atk(c)); } });
  S('Astral Barrier', { sub: 'continuous', manual: true, aiOk: () => true, ai: () => false, async resolve() {}, async redirectAttack(d, f) { return (await d.ask(f.owner, f, 'Astral Barrier: saldırıyı direkt saldırıya çevir?')) ? 'direct' : null; } });
  S('Dreamsprite', {
    async redirectAttack(d, f, atk, def) {
      if (def !== f) return null;
      const os = d.P(f.owner).mz.filter(m => m && m !== f);
      return !os.length ? null : os.length === 1 ? os[0] : pick(d, f.owner, os, 'Dreamsprite: yeni saldırı hedefi', 'help');
    },
  });
  S('Jam Defender', {
    sub: 'continuous', manual: true, aiOk: () => true, async resolve() {},
    async redirectAttack(d, f, atk, def) { const jam = d.P(f.owner).mz.find(m => m && m.d.name === 'Revival Jam' && m !== def); return jam && (await d.ask(f.owner, f, 'Jam Defender: saldırıyı Revival Jam\'e çevir?')) ? jam : null; },
  });
  S('Patrician of Darkness', { chooseAttackTarget: true });
  S('Dark Spirit of the Silent', {
    trigger: 'attack', can: (d, p, c, ctx) => d.monsters(O(p), true).some(m => m !== ctx.attacker),
    async resolve(d, p, c, ctx) {
      const t = await pick(d, p, d.monsters(O(p), true).filter(m => m !== ctx.attacker), 'Bunun yerine saldıracak canavar', 'harm'); if (!t) return;
      if (t.pos === 'def') { t.pos = 'atk'; await d.ev('pos', { p: t.owner, card: t }); }
      ctx.negated = true; const zi = d.P(t.owner).mz.indexOf(t); const tz = ctx.target ? d.P(p).mz.indexOf(ctx.target) : 'direct';
      if (zi >= 0) await d.doAttack(t.owner, zi, tz);
    },
  });
  S('Shift', {
    trigger: 'attack', can: (d, p, c, ctx) => !!ctx.target && ctx.target.owner === p && d.monsters(p).some(m => m !== ctx.target),
    async resolve(d, p, c, ctx) { const t = await pick(d, p, d.monsters(p).filter(m => m !== ctx.target), 'Yeni saldırı hedefi', 'help'); if (t) ctx.redirect = t; },
  });
  S('Staunch Defender', {
    trigger: 'attack', can: (d, p) => d.monsters(p, true).length > 0,
    async resolve(d, p, c, ctx) { const t = await pick(d, p, d.monsters(p, true), 'Zorunlu saldırı hedefi', 'help'); if (!t) return; d.flags.forceTarget = { turn: d.turn, q: p, c: t }; ctx.redirect = t; },
  });
  S('Taunt', {
    trigger: 'phase', can: (d, p, c, ctx) => ctx.phase === 'battle' && d.monsters(p, true).length > 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(p, true), 'Zorunlu saldırı hedefi', 'help'); if (t) d.flags.forceTarget = { turn: d.turn, q: p, c: t }; },
  });
  S('Bark of Dark Ruler', {
    trigger: 'attack', ai: () => false, can: (d, p, c, ctx) => d.P(p).lp > 100 && !!ctx.target && ctx.target.owner === p && ctx.target.d.race === 'Fiend',
    async resolve(d, p, c, ctx) { const opts = [100, 500, 1000, 1500, 2000, 2500, 3000].filter(n => n < d.P(p).lp); const v = +(await d.choose(p, 'Bark of Dark Ruler: ödenecek LP', opts.map(String))); await d.damage(p, v); d.addTemp(ctx.attacker, -v, -v); },
  });
  S('Kiseitai', {
    async fdAttacked(d, q, c, atk) { if (d.freeZone(q, 'st') < 0) return false; await placeST(d, q, c, atk); await d.ev('equip', { p: q, card: c, target: atk }); return true; },
    async standbyAny(d, tp, x) { if (x.equipTo == null || tp !== O(x.owner)) return; const h = d.allField().find(m => m.uid === x.equipTo); if (h) await d.heal(x.owner, Math.floor(d.atk(h) / 2)); },
  });
  S('Gravekeeper\'s Assailant', { async onDeclare(d, p) { if (!fieldHas(d, 'Necrovalley')) return; const t = await pick(d, p, d.monsters(O(p), true), 'Pozisyonu değişecek canavar', 'harm'); if (t) { t.pos = t.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: t.owner, card: t }); } } });
  S('Gravekeeper\'s Vassal', { battleAsEffect: true });
  S('Giant Axe Mummy', { ability: faceDown, async defWin(d, q, c, atk) { if (d.battle && d.battle.fd) await d.destroy(atk, c); } });
  S('Continuous Destruction Punch', { sub: 'continuous', async resolve() {}, async onDefWin(d, o, x, def, atk) { if (def.owner === x.owner && d.inMZ(atk)) await d.destroy(atk, x); } });
  S('Mermaid Knight', { multiAttack: (d) => (umi(d) ? 2 : 1) });
  S('Legacy Hunter', { async onKill(d, p, c) { const q = O(p), H = d.P(q).hand; if (d.battle && d.battle.fd && H.length) { const x = H[Math.floor(d.rng() * H.length)]; d.removeFromWherever(x); d.P(q).deck.push(x); shuffleDeck(d, q); } } });
  S('Inferno Hammer', { async onKill(d, p, c) { const t = await pick(d, p, mons(d, O(p), true), 'Kapalı savunmaya çevrilecek canavar', 'harm'); if (t) { t.up = false; t.pos = 'def'; await d.ev('pos', { p: t.owner, card: t }); } } });
  S('Drill Bug', {
    async onBattleDamage(d, p, c) { const pc = d.P(p).deck.find(x => x.d.name === 'Parasite Paracide'); if (!pc || !(await d.ask(p, c, 'Parasite Paracide Destenin üstüne konsun mu?'))) return; d.removeFromWherever(pc); shuffleDeck(d, p); d.P(p).deck.unshift(pc); },
    ai: () => false,
  });
  S('Decayed Commander', {
    async onSummon(d, p, c) { if (c.special) return; const z = d.P(p).hand.find(x => x.d.name === 'Zombie Tiger'); if (z && d.freeZone(p, 'mz') >= 0 && (await d.ask(p, c, 'Zombie Tiger çağrılsın mı?'))) await d.specialSummon(p, z); },
    async onBattleDamage(d, p, c, amt, victim, direct) { if (direct) await discardRandom(d, O(p), 1); },
  });
  S('Vampiric Orchis', { async onSummon(d, p, c) { if (c.special) return; const z = d.P(p).hand.find(x => x.d.name === 'Des Dendle'); if (z && d.freeZone(p, 'mz') >= 0 && (await d.ask(p, c, 'Des Dendle çağrılsın mı?'))) await d.specialSummon(p, z); } });
  S('Element Dragon', { selfMod: (c, key, d) => (key === 'atk' && d.allField().some(m => isMon(m) && m.up && m.d.attr === 'FIRE') ? 500 : 0), async onKill(d, p, c) { windAgain(d, c); } });
  S('Element Magician', { immune: (d, c, kind) => kind === 'control' && attrOn(d, 'WATER'), async onKill(d, p, c) { windAgain(d, c); } });
  S('Element Saurus', { selfMod: (c, key, d) => (key === 'atk' && attrOn(d, 'FIRE') ? 500 : 0), negateKilled: (d, x, killer, victim) => killer === x && attrOn(d, 'EARTH') && /Effect/.test(victim.d.type) });
  S('Element Soldier', { immune: (d, c, kind) => kind === 'control' && attrOn(d, 'WATER'), negateKilled: (d, x, killer, victim) => killer === x && attrOn(d, 'EARTH') && /Effect/.test(victim.d.type) });
  function attrOn(d, a) { return d.allField().some(m => isMon(m) && m.up && m.d.attr === a); }
  function windAgain(d, c) { if (attrOn(d, 'WIND') && c.againTurn !== d.turn) { c.againTurn = d.turn; c.attacked = false; } }
  S('B.E.S. Big Core', { noBattleDestroy: true, async onSummon(d, p, c) { if (!c.special) c.bes = 3; }, async afterBattle(d, p, c) { if ((c.bes || 0) > 0) c.bes--; else await d.destroy(c, c); } });
  S('Big Shield Gardna', {
    async fdTarget(d, p, c) { c.up = true; c.pos = 'def'; await d.ev('flip', { p, card: c }); return true; },
    async afterDefended(d, q, c) { if (c.pos === 'def') { c.pos = 'atk'; await d.ev('pos', { p: q, card: c }); } },
  });

  // ======================================================================== SPHINX / PYRAMID
  const pyr = (d, p) => d.allField().some(c => c.up && c.owner === p && c.d.name === 'Pyramid of Light');
  async function theinen(d, p, other) {
    const o = d.P(p).grave.find(x => x.d.name === other && x.graveInfo && x.graveInfo.turn === d.turn && ['destroy', 'battle'].includes(x.graveInfo.why));
    const th = [...d.P(p).hand, ...d.P(p).deck].find(x => x.d.name === 'Theinen the Great Sphinx');
    if (!o || !th || d.P(p).lp <= 500 || d.freeZone(p, 'mz') < 0) return;
    if (!(await d.ask(p, th, 'Theinen the Great Sphinx: 500 LP öde ve çağır?'))) return;
    await d.damage(p, 500); await d.specialSummon(p, th);
  }
  const sphinx = (name, key, other) => S(name, {
    noGraveSS: true,
    handSummon: { tributes: 0, costFrees: false, can: (d, p) => (!pyr(d, p) ? 'Pyramid of Light gerekir' : d.P(p).lp <= 500 ? '500 LP gerekir' : null), cost: async (d, p) => pay(d, p, 500) },
    canAttack: (d, p, c) => (c.placedTurn === d.turn ? 'Bu tur saldıramaz' : null),
    async onKill(d, p, c, v) { if (d.battle && d.battle.dpos === 'def') await d.damage(O(p), Math.floor((v.d[key] || 0) / 2), c); },
    async onGrave(d, p) { await theinen(d, p, other); },
  });
  sphinx('Andro Sphinx', 'atk', 'Sphinx Teleia'); sphinx('Sphinx Teleia', 'def', 'Andro Sphinx');
  S('Theinen the Great Sphinx', {
    noGraveSS: true, handSummon: { tributes: 0, can: () => 'Yalnızca Andro Sphinx + Sphinx Teleia aynı anda yok olunca çağrılır' },
    async onSummon(d, p, c) { if (c.special && d.P(p).lp > 500 && (await d.ask(p, c, '500 LP öde: ATK +3000?'))) { await d.damage(p, 500); d.addTemp(c, 3000); } },
  });
  S('Pyramid of Light', { sub: 'continuous', manual: true, aiOk: () => false, async resolve() {}, async onLeaveField(d, p) { for (const n of ['Andro Sphinx', 'Sphinx Teleia']) for (const m of d.P(p).mz.filter(x => x && x.d.name === n)) await d.banish(m); } });

  // ======================================================================== DONATILAN / EQUIP BENZERİ KARTLAR
  eqFx('Amplifier', m => m.d.name === 'Jinzo', 0, 0, { amplify: true, async onLeaveField(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (h) await d.destroy(h, c); } });
  eqFx('Ballista of Rampart Smashing', null, 0, 0, { mod: (m, key, d, f) => (f.equipTo === m.uid && key === 'atk' && d.battle && d.battle.a === m && d.battle.fd ? 1500 : 0) });
  eqFx('Buster Rancher', m => (m.d.atk || 0) <= 1000, 0, 0, {
    mod: (m, key, d, f) => {
      if (f.equipTo !== m.uid || key !== 'atk' || !d.battle) return 0;
      const o = d.battle.a === m ? d.battle.d : d.battle.d === m ? d.battle.a : null; if (!o) return 0;
      return (o.pos === 'atk' && d.atk(o) >= 2500) || (o.pos === 'def' && d.def(o) >= 2500) ? 2500 : 0;
    },
  });
  eqFx('Heart of Clear Water', null, 0, 0, {
    protectBattle: (d, x, c) => x.equipTo === c.uid,
    async guardTarget(d, x, c, src) { return x.equipTo === c.uid && src.p !== x.owner; },
    async stateCheck(d, p, x) { const h = d.allField().find(m => m.uid === x.equipTo); if (h && d.atk(h) >= 1300) await d.destroy(x, x); },
  });
  eqFx('Metalsilver Armor', null, 0, 0, { async guardTarget(d, x, c, src) { return x.equipTo !== c.uid && c.owner === x.owner && isMon(c) && src.p !== x.owner; } });
  eqFx('Rod of the Mind\'s Eye', null, 0, 0, { fixedDmg: 1000 });
  eqFx('Necklace of Command', null, 0, 0, {
    async onLeaveField(d, p, c, why) {
      if (why !== 'equip-lost') return;
      const h = d.P(c.owner).grave.find(x => x.uid === c.equipTo && x.graveInfo && x.graveInfo.why === 'battle' && x.graveInfo.turn === d.turn); if (!h) return;
      const m = await d.choose(p, 'Necklace of Command', ['1 kart çek', 'Rakibin elinden rastgele 1 kart at']);
      if (m === '1 kart çek') await d.draw(p, 1); else await discardRandom(d, O(p), 1);
    },
  });
  eqFx('Smoke Grenade of the Thief', null, 0, 0, {
    async onLeaveField(d, p, c, why) {
      if (why !== 'destroy' || !d.allField().some(m => m.uid === c.equipTo) || !d.P(O(p)).hand.length) return;
      await look(d, p, d.P(O(p)).hand, 'Rakibin eli'); const t = await pick(d, p, d.P(O(p)).hand, 'Atılacak kart', 'discard'); if (t) await d.sendToGrave(t, 'discard');
    },
  });
  eqFx('Sword of the Soul-Eater', m => m.d.type === 'Normal Monster' && lv(m) <= 3, 0, 0, {
    async resolve(d, p, c) {
      const t = await pick(d, p, d.monsters(p, true).filter(m => m.d.type === 'Normal Monster' && lv(m) <= 3), 'Sword of the Soul-Eater: hedef', 'help'); if (!t) return false;
      const ns = d.monsters(p).filter(m => m !== t && m.d.type === 'Normal Monster'); c.sos = ns.length; for (const m of ns) await d.sendToGrave(m, 'tribute');
      c.equipTo = t.uid; await d.ev('equip', { p, card: c, target: t }); await d.notify('onEquip', p, c, t);
    },
    mod: (m, key, d, f) => (f.equipTo === m.uid && key === 'atk' ? 1000 * (f.sos || 0) : 0),
  });
  eqFx('Scroll of Bewitchment', null, 0, 0, {
    async resolve(d, p, c) {
      const t = await pick(d, p, d.monsters(p, true), 'Scroll of Bewitchment: hedef', 'help'); if (!t) return false;
      const a = await d.choose(p, 'Yeni Özellik', ATTRS); c.equipTo = t.uid; d.setD(t, 'scroll' + c.uid, { attr: a }); await d.ev('equip', { p, card: c, target: t }); await d.notify('onEquip', p, c, t);
    },
    async onLeaveField(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (h) d.clrD(h, 'scroll' + c.uid); },
  });
  S('Demotion', {
    sub: 'equip', can: d => d.allField().some(m => isMon(m) && m.up && d.inMZ(m)), ok: () => true,
    async resolve(d, p, c) {
      const t = await pick(d, p, d.allField().filter(m => isMon(m) && m.up && d.inMZ(m)), 'Demotion: hedef', 'harm'); if (!t) return false;
      c.equipTo = t.uid; d.setD(t, 'dem' + c.uid, { level: Math.max(1, lv(t) - 2) }); await d.ev('equip', { p, card: c, target: t }); await d.notify('onEquip', p, c, t);
    },
    async onLeaveField(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (h) d.clrD(h, 'dem' + c.uid); },
  });
  S('Ekibyo Drakmord', {
    sub: 'equip', ok: () => true, can: d => d.allField().some(m => isMon(m) && m.up && d.inMZ(m)),
    async resolve(d, p, c) { const t = await pick(d, p, d.allField().filter(m => isMon(m) && m.up && d.inMZ(m)), 'Ekibyo Drakmord: hedef', 'harm'); if (!t) return false; c.equipTo = t.uid; c.ek = 0; await d.ev('equip', { p, card: c, target: t }); await d.notify('onEquip', p, c, t); },
    restrictAttack: (d, m, f) => (f.equipTo === m.uid ? 'Ekibyo Drakmord: saldıramaz' : null),
    async endPhaseAny(d, tp, x) {
      const h = d.allField().find(m => m.uid === x.equipTo); if (!h || tp !== h.owner) return;
      x.ek = (x.ek || 0) + 1; if (x.ek < 2) return;
      await d.destroy(h, x); if (d.locate(x) && !d.onField(x)) { d.removeFromWherever(x); x.up = true; d.P(x.origOwner).hand.push(x); } else if (d.onField(x)) { d.removeFromWherever(x); x.up = true; d.P(x.origOwner).hand.push(x); }
    },
  });
  const stealEq = (name, extra) => S(name, Object.assign({
    sub: 'equip', ok: () => true, can: (d, p) => d.monsters(O(p), true).length > 0 && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p, c) { const t = await pick(d, p, d.monsters(O(p), true), `${name}: kontrol alınacak canavar`, 'harm'); if (!t || !(await d.takeControl(t, p, false))) return false; c.equipTo = t.uid; await d.ev('equip', { p, card: c, target: t }); await d.notify('onEquip', p, c, t); },
    async onLeaveField(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (h && h.owner !== h.origOwner) await d.takeControl(h, h.origOwner, false); },
  }, extra));
  stealEq('Snatch Steal', { async standbyAny(d, tp, x) { if (tp === O(x.owner)) await d.heal(tp, 1000); } });
  stealEq('Falling Down', {
    async standbyAny(d, tp, x) {
      if (!d.allField().some(c => c.owner === x.owner && c.up && /Archfiend/.test(c.d.name))) { await d.destroy(x, x); return; }
      if (tp === O(x.owner)) await d.damage(x.owner, 800, x);
    },
  });
  S('Archfiend of Gilfer', {
    async onGrave(d, p, c) {
      const tg = d.allField().filter(m => isMon(m) && m.up && d.inMZ(m)); if (!tg.length || d.freeZone(p, 'st') < 0) return;
      if (!(await d.ask(p, c, 'Archfiend of Gilfer: bir canavara donatılsın mı?'))) return;
      const t = await pick(d, p, tg, 'Gilfer donatılacak canavar', 'harm'); if (!t || !(await placeST(d, p, c, t))) return;
      await d.ev('equip', { p, card: c, target: t });
    },
    mod: (m, key, d, f) => (f.equipTo === m.uid && key === 'atk' ? -500 : 0), ai: () => true,
  });
  S('Sword Hunter', {
    async onKill(d, p, c, v) { (c.shV = c.shV || []).push(v); },
    selfMod: (c, key, d) => (key === 'atk' ? 200 * d.allField().filter(u => u.equipTo === c.uid && u.sh).length : 0),
    async onBattleEnd(d, o, x, tp) {
      if (o !== tp || !x.shV || !x.shV.length) return; const vs = x.shV; x.shV = [];
      for (const v of vs) { if (!d.P(v.origOwner).grave.includes(v) || d.freeZone(o, 'st') < 0) continue; v.sh = true; if (await placeST(d, o, v, x)) await d.ev('equip', { p: o, card: v, target: x }); }
    },
  });
  S('Chopman the Desperate Outlaw', { async onFlip(d, p, c) { await equipFromGrave(d, p, c); } });
  S('The Kick Man', { async onSummon(d, p, c) { if (c.special) await equipFromGrave(d, p, c); } });
  async function equipFromGrave(d, p, m) {
    if (d.freeZone(p, 'st') < 0) return;
    const cs = d.P(p).grave.filter(c => c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub === 'equip' && (!FX[c.d.name].ok || FX[c.d.name].ok(m)));
    const t = await pick(d, p, cs, 'Mezarlıktan donatılacak Equip Büyüsü', 'revive'); if (!t || !(await placeST(d, p, t, m))) return;
    await d.ev('equip', { p, card: t, target: m }); await d.notify('onEquip', p, t, m);
  }
  S('Collected Power', {
    manual: true, aiOk: () => false,
    can: d => d.allField().some(c => c.equipTo != null && c.d.kind === 'spell') && d.allField().some(c => isMon(c) && c.up && d.inMZ(c)),
    async resolve(d, p, self) {
      const t = await pick(d, p, d.allField().filter(c => isMon(c) && c.up && d.inMZ(c)), 'Collected Power: hedef', 'help'); if (!t) return false;
      for (const e of d.allField().filter(c => c.equipTo != null && c.d.kind === 'spell')) { const f = FX[e.d.name]; if (f && f.ok && !f.ok(t)) await d.destroy(e, self); else e.equipTo = t.uid; }
    },
  });
  S('Cyber Raider', {
    async onSummon(d, p, c) {
      const eq = d.allField().filter(x => x.equipTo != null && x.d.kind === 'spell'); if (!eq.length) return;
      const mode = await d.choose(p, 'Cyber Raider', ['Equip kartını yok et', 'Equip kartını bu karta aktar']);
      const t = await pick(d, p, eq, 'Hedef Equip kartı', 'harm'); if (!t) return;
      const f = FX[t.d.name];
      if (mode.startsWith('Equip kartını yok') || (f && f.ok && !f.ok(c))) await d.destroy(t, c); else t.equipTo = c.uid;
    },
  });
  S('Tailor of the Fickle', {
    triggers: [], noAI: true, can: d => d.allField().some(c => c.equipTo != null && c.d.kind === 'spell'),
    async resolve(d, p) {
      const e = await pick(d, p, d.allField().filter(c => c.equipTo != null && c.d.kind === 'spell'), 'Hedefi değişecek Equip kartı', 'help'); if (!e) return false;
      const f = FX[e.d.name]; const t = await pick(d, p, d.allField().filter(m => isMon(m) && m.up && d.inMZ(m) && m.uid !== e.equipTo && (!f || !f.ok || f.ok(m))), 'Yeni hedef', 'help'); if (!t) return false;
      e.equipTo = t.uid;
    },
  });
  S('Morale Boost', {
    sub: 'continuous', noAI: true, async resolve() {},
    async onEquip(d, o, x, p) { await d.heal(p, 1000); },
    async onFieldToGrave(d, o, x, card, kind) { if (kind === 'st' && card.d.kind === 'spell' && FX[card.d.name] && FX[card.d.name].sub === 'equip') await d.damage(card.owner, 1000, x); },
  });
  S('Armored Glass', { manual: true, aiOk: () => false, can: d => d.allField().some(c => c.equipTo != null), async resolve(d) { d.flags.equipOff = d.turn; } });
  S('The Emperor\'s Holiday', { sub: 'continuous', manual: true, aiOk: () => false, negEquip: true, async resolve() {} });

  // ======================================================================== ÇEŞİTLİ CANAVARLAR (A–L)
  S('Ameba', { async onControl(d, p, c) { if (c.ctlUsed) return; c.ctlUsed = true; await d.damage(p, 2000, c); } });
  S('Griggle', { async onControl(d, p, c, from) { if (c.ctlUsed) return; c.ctlUsed = true; await d.heal(from, 3000); } });
  S('Archlord Zerato', {
    handSummon: { tributes: 1, can: (d, p) => (ownHas(d, p, 'The Sanctuary in the Sky') ? null : 'The Sanctuary in the Sky gerekir'), cost: async (d, p, c, tr) => tr.length === 1 && tr[0].d.name === 'Warrior of Zera' && tr[0].up },
    ability: {
      label: 'LIGHT canavar at: rakibin canavarlarını yok et', can: (d, p) => ownHas(d, p, 'The Sanctuary in the Sky') && !discLock(d) && d.monsters(O(p)).length > 0 && d.P(p).hand.some(x => isMon(x) && x.d.attr === 'LIGHT'),
      async resolve(d, p, c) { const t = await pick(d, p, d.P(p).hand.filter(x => isMon(x) && x.d.attr === 'LIGHT'), 'Atılacak LIGHT canavar', 'discard'); if (!t) return false; await d.sendToGrave(t, 'cost'); for (const m of d.monsters(O(p))) await d.destroy(m, c); },
      ai: (d, p) => d.monsters(O(p)).length >= 2,
    },
  });
  S('Charm of Shabti', {
    handEffect: { label: 'At: Gravekeeper\'s savaşta yok olmaz', can: (d, p) => !discLock(d) && d.monsters(p, true).some(m => /^Gravekeeper's/.test(m.d.name)), async resolve(d, p, c) { await d.sendToGrave(c, 'discard'); (d.flags.safe = d.flags.safe || []).push({ turn: d.turn, fn: m => m.owner === p && /^Gravekeeper's/.test(m.d.name) }); } },
  });
  S('Coach Goblin', {
    ai: () => false,
    async endPhase(d, p, c) {
      const ns = d.P(p).hand.filter(x => isMon(x) && x.d.type === 'Normal Monster'); if (!ns.length || !d.P(p).deck.length || !(await d.ask(p, c, 'Coach Goblin: Normal canavarı Deste altına koyup 1 kart çek?'))) return;
      const t = await pick(d, p, ns, 'Deste altına konacak Normal canavar', 'discard'); if (!t) return; d.removeFromWherever(t); d.P(p).deck.push(t); await d.draw(p, 1);
    },
  });
  S('D.D. Scout Plane', { async onBanished(d, p, c) { (d.endQueue = d.endQueue || []).push(async () => { if (d.P(p).banished.includes(c) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, c); }); } });
  S('Dark Ruler Ha Des', { noGraveSS: true, negateKilled: (d, x, killer) => killer.owner === x.owner && killer.d.race === 'Fiend' });
  S('Twin-Headed Wolf', { negateKilled: (d, x, killer, victim) => killer === x && mons(d, x.owner, true).some(m => m !== x && m.d.race === 'Fiend') && !!(FX[victim.d.name] && FX[victim.d.name].onFlip) });
  S('Dragon Piper', {
    async onFlip(d, p) {
      const jars = d.allField().filter(c => c.up && c.d.name === 'Dragon Capture Jar'); if (!jars.length) return;
      for (const j of jars) await d.destroy(j, null);
      for (const m of d.allField().filter(c => isMon(c) && c.up && c.d.race === 'Dragon')) { m.pos = 'atk'; await d.ev('pos', { p: m.owner, card: m }); }
    },
  });
  S('Fairy Guardian', {
    ability: {
      label: 'Tribute: Büyüyü Deste altına koy', can: (d, p) => d.P(p).grave.some(g => g.d.kind === 'spell' && g.graveInfo && g.graveInfo.turn === d.turn && g.graveInfo.srcP === O(p)),
      async resolve(d, p, c) { const t = await pick(d, p, d.P(p).grave.filter(g => g.d.kind === 'spell' && g.graveInfo && g.graveInfo.turn === d.turn && g.graveInfo.srcP === O(p)), 'Deste altına konacak Büyü', 'revive'); if (!t) return false; await d.sendToGrave(c, 'tribute'); d.removeFromWherever(t); d.P(p).deck.push(t); },
    },
  });
  S('Fox Fire', { noTribute: true, async onGrave(d, p, c, why) { if (why !== 'battle' || !c.wasUp) return; (d.endQueue = d.endQueue || []).push(async () => { if (d.P(p).grave.includes(c) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, c); }); } });
  const dezardGuard = async (d, owner, c) => { if (!d.src || d.src.kind === 'monster') return false; if (d.src.card && d.onField(d.src.card)) await d.destroy(d.src.card, c); return true; };
  S('Great Dezard', {
    async onKill(d, p, c) { c.dzKills = (c.dzKills || 0) + 1; },
    async onTargeted(d, owner, c) { return (c.dzKills || 0) >= 1 ? dezardGuard(d, owner, c) : false; },
    ability: {
      label: 'Tribute: Fushioh Richie çağır', can: (d, p, c) => (c.dzKills || 0) >= 2 && [...d.P(p).hand, ...d.P(p).deck].some(x => x.d.name === 'Fushioh Richie'),
      async resolve(d, p, c) { const f = [...d.P(p).hand, ...d.P(p).deck].find(x => x.d.name === 'Fushioh Richie'); if (!f) return false; await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, f); shuffleDeck(d, p); },
      ai: () => true,
    },
  });
  S('Fushioh Richie', {
    handSummon: { tributes: 0, can: () => 'Yalnızca Great Dezard efektiyle çağrılır' },
    ability: faceDown, async onTargeted(d, owner, c) { return dezardGuard(d, owner, c); },
    async onFlip(d, p) { if (d.freeZone(p, 'mz') < 0) return; const t = await pick(d, p, d.P(p).grave.filter(x => isMon(x) && x.d.race === 'Zombie'), 'Çağrılacak Zombie', 'revive'); if (t) await d.specialSummon(p, t); },
  });
  S('Goblin of Greed', { noDiscardCost: true });
  S('Gradius\' Option', {
    handSummon: { tributes: 0, can: (d, p) => (ownHas(d, p, 'Gradius') ? null : 'Gradius gerekir') },
    selfMod: (c, key, d) => { const g = d.allField().find(m => m.owner === c.owner && m.up && m.d.name === 'Gradius'); return g ? g.d[key] + g.bonus[key] - c.d[key] : 0; },
    async stateCheck(d, p, x) { if (!ownHas(d, p, 'Gradius')) await d.destroy(x, x); },
  });
  S('Gravekeeper\'s Watcher', { handNegator: { can: (d, h, card) => /discard/i.test(card.d.desc) && !discLock(d), text: card => `${card.d.name}: Watcher'ı mezarlığa gönder ve aktivasyonu iptal et?` } });
  S('Helpoemer', {
    noGraveSS: true,
    async onGrave(d, p, c, why) { if (why !== 'battle') return; (d.endQueue = d.endQueue || []).push(async () => { if (d.P(p).grave.includes(c)) await discardRandom(d, O(p), 1); }); },
  });
  S('Homunculus the Alchemic Being', { ability: { label: 'Özelliği değiştir', async resolve(d, p, c) { const a = await d.choose(p, 'Homunculus: yeni Özellik', ATTRS); d.setD(c, 'homun', { attr: a }); } } });
  S('King Tiger Wanghu', { async onAnySummon(d, p, x, c) { if (c !== x && c.up && d.inMZ(c) && d.atk(c) <= 1400) await d.destroy(c, x); } });
  S('Lekunga', {
    ability: {
      label: '2 WATER canavar çıkar: Lekunga Token çağır', can: (d, p) => d.P(p).grave.filter(x => isMon(x) && x.d.attr === 'WATER').length >= 2 && d.freeZone(p, 'mz') >= 0,
      async resolve(d, p) { const a = await pick(d, p, d.P(p).grave.filter(x => isMon(x) && x.d.attr === 'WATER'), 'Çıkarılacak WATER canavar 1', 'cost'); const b = a && await pick(d, p, d.P(p).grave.filter(x => isMon(x) && x.d.attr === 'WATER' && x !== a), 'Çıkarılacak WATER canavar 2', 'cost'); if (!a || !b) return false; await d.banish(a); await d.banish(b); await mkToken(d, p, 'Lekunga Token', 700, 700, 2, 'Plant', 'WATER'); },
      ai: () => true,
    },
  });
  S('Lava Golem', {
    handSummon: {
      opp: true, tributes: 0, can: (d, p) => (d.monsters(O(p)).length >= 2 ? null : 'Rakibin 2 canavarı gerekir'),
      async cost(d, p) { const t = []; for (let i = 0; i < 2; i++) { const m = await pick(d, p, d.monsters(O(p)).filter(x => !t.includes(x)), `Tribute edilecek rakip canavar (${i + 1}/2)`, 'tribute'); if (!m) return false; t.push(m); } for (const m of t) await d.sendToGrave(m, 'tribute'); d.P(p).summoned = true; },
    },
    async standby(d, p, c) { await d.damage(p, 1000, c); },
  });

  // ======================================================================== BÜYÜ / TUZAK (A–L)
  S('7', {
    sub: 'continuous', async resolve() {},
    async stateCheck(d, p, x) { const mine = d.P(x.owner).st.filter(c => c && c.up && c.d.name === '7'); if (mine[0] !== x || mine.length < 3) return; await d.draw(x.owner, 3); for (const c of mine) await d.destroy(c, x); },
    async onLeaveField(d, p) { await d.heal(p, 700); },
  });
  S('Anti-Spell Fragrance', { sub: 'continuous', manual: true, aiOk: () => false, noHandSpell: true, async resolve() {} });
  S('Bait Doll', {
    can: d => d.allField().some(c => !c.up && isST(c)),
    async resolve(d, p, self) {
      const t = await pick(d, p, d.allField().filter(c => !c.up && isST(c) && c !== self), 'Bait Doll: kapalı kart', 'harm');
      if (t) { await d.ev('reveal', { p, card: t }); if (t.d.kind === 'trap') await d.destroy(t, self); }
      d.removeFromWherever(self); self.up = true; d.P(p).deck.push(self); shuffleDeck(d, p);
    },
  });
  S('Battle-Scarred', {
    sub: 'continuous', manual: true, aiOk: () => false, can: (d, p) => d.monsters(p, true).some(m => /Archfiend/.test(m.d.name)),
    async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p, true).filter(m => /Archfiend/.test(m.d.name)), 'Battle-Scarred: Archfiend', 'help'); if (!t) return false; c.bs = t.uid; },
    async standby(d, p, x) { const t = d.allField().find(m => m.uid === x.bs); if (!t || pand(d)) return; await d.damage(O(p), { 'Terrorking Archfiend': 800, 'Shadowknight Archfiend': 900 }[t.d.name] || 500, x); },
    async onFieldToGrave(d, p, x, card) { if (card.uid === x.bs) await d.destroy(x, x); },
    async onLeaveField(d, p, c) { const t = d.allField().find(m => m.uid === c.bs); if (t) await d.destroy(t, c); },
  });
  S('Big Burn', {
    trigger: 'spell', can: (d, p, c, ctx) => ctx.activator !== p && /Graveyard/i.test(ctx.spell.d.desc) && /Special Summon|monster/i.test(ctx.spell.d.desc),
    async resolve(d) { for (const q of [0, 1]) for (const m of [...d.P(q).grave.filter(isMon)]) await d.banish(m); },
  });
  S('Checkmate', {
    can: (d, p) => d.monsters(p, true).some(m => m.d.name === 'Terrorking Archfiend') && d.monsters(p, true).some(m => /Archfiend/.test(m.d.name) && m.d.name !== 'Terrorking Archfiend'),
    async resolve(d, p) { const t = await pick(d, p, d.monsters(p, true).filter(m => /Archfiend/.test(m.d.name) && m.d.name !== 'Terrorking Archfiend'), 'Tribute edilecek Archfiend', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); for (const m of d.monsters(p, true).filter(x => x.d.name === 'Terrorking Archfiend')) m.directTurn = d.turn; },
  });
  S('Chain Energy', { sub: 'continuous', noAI: true, handCost: () => 500, async resolve() {} });
  S('Chosen One', {
    can: (d, p) => d.P(p).hand.some(isMon) && d.P(p).hand.filter(isST).length >= 2,
    async resolve(d, p) {
      const H = d.P(p).hand; const m = await pick(d, p, H.filter(isMon), 'Seçilecek canavar', 'cost'); const s1 = m && await pick(d, p, H.filter(isST), 'Seçilecek Büyü/Tuzak (1/2)', 'cost'); const s2 = s1 && await pick(d, p, H.filter(c => isST(c) && c !== s1), 'Seçilecek Büyü/Tuzak (2/2)', 'cost');
      if (!m || !s1 || !s2) return false; const set = [m, s1, s2]; const hit = set[Math.floor(d.rng() * 3)];
      if (hit === m && d.freeZone(p, 'mz') >= 0) { await d.specialSummon(p, m); for (const c of [s1, s2]) await d.sendToGrave(c, 'discard'); } else for (const c of set) if (d.locate(c)) await d.sendToGrave(c, 'discard');
    },
  });
  S('Convulsion of Nature', { sub: 'continuous', noAI: true, async resolve(d) { d.flags.deckFlip = true; }, async onLeaveField(d) { d.flags.deckFlip = false; } });
  S('D. Tribe', {
    manual: true, aiOk: () => false, can: (d, p) => d.monsters(p, true).length > 0,
    async resolve(d, p) { const ms = d.monsters(p, true); for (const m of ms) d.setD(m, 'dtribe', { race: 'Dragon' }); (d.endQueue = d.endQueue || []).push(async () => { for (const m of ms) d.clrD(m, 'dtribe'); }); },
  });
  S('Dark Coffin', {
    async onLeaveField(d, p, c, why) {
      if (c.wasUp || (why !== 'destroy' && why !== 'battle')) return;
      const q = O(p); const hasM = d.monsters(q).length > 0;
      const opt = hasM ? await d.choose(q, 'Dark Coffin', ['Elinden rastgele 1 kart at', 'Bir canavarını yok et']) : 'Elinden';
      if (opt.startsWith('Elinden')) await discardRandom(d, q, 1); else { const t = await pick(d, q, d.monsters(q), 'Yok edilecek canavar', 'tribute'); if (t) await d.destroy(t, c); }
    },
  });
  S('Statue of the Wicked', { async onLeaveField(d, p, c, why) { if (c.wasUp || (why !== 'destroy' && why !== 'battle')) return; if (d.freeZone(p, 'mz') >= 0) await mkToken(d, p, 'Wicked Token', 1000, 1000, 4, 'Fiend', 'DARK'); } });
  S('Dark Sage', {
    handSummon: { tributes: 1, can: (d, p) => ((d.flags.twRight || [])[p] === d.turn ? null : 'Time Wizard\'ın yazı-turası doğru bilinmeli (bu tur)'), cost: async (d, p, c, tr) => tr.length === 1 && (tr[0].d.alias || tr[0].d.name) === 'Dark Magician' && tr[0].up },
    async onSummon(d, p, c) { if (!c.special) return; const t = await pick(d, p, d.P(p).deck.filter(x => x.d.kind === 'spell'), 'Desteden Büyü al', 'help'); if (t) await toHand(d, p, t); shuffleDeck(d, p); },
  });
  if (FX['Time Wizard'] && FX['Time Wizard'].ability && !FX['Time Wizard'].ability.twWrapped) {
    const ab = FX['Time Wizard'].ability, r0 = ab.resolve; ab.twWrapped = true;
    ab.resolve = async function (d, p, c) {
      const orig = d.toss; let right = null;
      d.toss = async function (...a) { const r = await orig.apply(d, a); right = r[0]; return r; };
      try { await r0.call(this, d, p, c); } finally { delete d.toss; }
      if (right) (d.flags.twRight = d.flags.twRight || [-1, -1])[p] = d.turn;
    };
  }
  S('Delta Attacker', {
    can: (d, p) => { const g = {}; for (const m of d.monsters(p, true).filter(x => x.d.type === 'Normal Monster')) g[m.d.name] = (g[m.d.name] || 0) + 1; return Object.values(g).some(v => v >= 3); },
    async resolve(d, p) { const g = {}; for (const m of d.monsters(p, true).filter(x => x.d.type === 'Normal Monster')) (g[m.d.name] = g[m.d.name] || []).push(m); for (const l of Object.values(g)) if (l.length >= 3) for (const m of l) m.directTurn = d.turn; },
  });
  S('Different Dimension Gate', {
    sub: 'continuous', noAI: true, can: (d, p) => d.monsters(p).length > 0 && d.monsters(O(p)).length > 0,
    async resolve(d, p, c) {
      const a = await pick(d, p, d.monsters(p), 'Kendi canavarın', 'harm'); const b = await pick(d, p, d.monsters(O(p)), 'Rakibin canavarı', 'harm'); if (!a || !b) return false;
      c.dd = [a, b].map(m => ({ m, p: m.owner, pos: m.pos, up: m.up })); for (const m of [a, b]) await d.banish(m);
    },
    async onLeaveField(d, p, c, why) { if (!c.dd) return; for (const r of c.dd) { if (d.P(r.p).banished.includes(r.m) && d.freeZone(r.p, 'mz') >= 0) { await d.specialSummon(r.p, r.m, { pos: r.pos, muted: true }); if (!r.up) { r.m.up = false; } } } c.dd = null; },
  });
  const dna = (name, patchKey, list, label) => S(name, {
    sub: 'continuous', manual: true, aiOk: () => false,
    async resolve(d, p, c) { c.dna = await d.choose(p, label, list); apply(d, c); },
    async stateCheck(d, p, x) { apply(d, x); },
    async onLeaveField(d, p, c) { for (const m of d.allField().filter(isMon)) d.clrD(m, 'dna' + c.uid); },
  });
  function apply(d, x) { if (!x.dna) return; const key = FX[x.d.name].dnaKey; for (const m of d.allField().filter(c => isMon(c) && c.up && d.inMZ(c))) if (m.d[key] !== x.dna) d.setD(m, 'dna' + x.uid, { [key]: x.dna }); }
  dna('DNA Surgery', 'race', TYPES, 'DNA Surgery: Tür bildir'); FX['DNA Surgery'].dnaKey = 'race';
  dna('DNA Transplant', 'attr', ATTRS, 'DNA Transplant: Özellik bildir'); FX['DNA Transplant'].dnaKey = 'attr';
  S('Dora of Fate', {
    trigger: 'phase', can: (d, p, c, ctx) => ctx.phase === 'battle' && d.monsters(O(p), true).length > 0,
    async resolve(d, p, c) {
      const t = await pick(d, p, d.monsters(O(p), true), 'Dora of Fate: hedef canavar', 'harm'); if (!t) return; const L = lv(t), tt = d.turn + 1;
      (d.watch = d.watch || []).push(async (dd, ev, pl, m) => { if (dd.turn > tt) return true; if (ev === 'normalSummon' && pl === p && dd.turn === tt && lv(m) === L - 1) { await dd.damage(O(p), L * 500, c); return true; } return false; });
    },
  });
  S('Double Snare', {
    can: d => d.allField().some(x => x.up && FX[x.d.name] && (FX[x.d.name].negateTraps || FX[x.d.name].negateOtherTraps)),
    async resolve(d, p, self) { const t = await pick(d, p, d.allField().filter(x => x.up && FX[x.d.name] && (FX[x.d.name].negateTraps || FX[x.d.name].negateOtherTraps)), 'Double Snare hedefi', 'harm'); if (!t) return false; await d.destroy(t, self); },
  });
  S('Double Spell', {
    can: (d, p) => !discLock(d) && d.P(p).hand.filter(c => c.d.kind === 'spell').length >= 2 && d.P(O(p)).grave.some(c => c.d.kind === 'spell' && FX[c.d.name] && !FX[c.d.name].sub && c.d.name !== 'Double Spell'),
    async resolve(d, p, self) {
      const dc = await pick(d, p, d.P(p).hand.filter(c => c.d.kind === 'spell'), 'Atılacak Büyü', 'discard'); if (!dc) return false; await d.sendToGrave(dc, 'discard');
      const t = await pick(d, p, d.P(O(p)).grave.filter(c => c.d.kind === 'spell' && FX[c.d.name] && !FX[c.d.name].sub && c.d.name !== 'Double Spell'), 'Kullanılacak Büyü', 'revive'); if (!t) return;
      const f = FX[t.d.name]; if (!f.can || f.can(d, p, self)) await f.resolve(d, p, self);
    },
  });
  S('Dramatic Rescue', {
    targetCan: (d, p, t, c) => /Amazoness/.test(c.d.name) && d.P(p).hand.some(x => plainOk(x) && x !== c),
    async onTargetedTrap(d, p, t, c) { await d.bounce(c); const m = await pick(d, p, d.P(p).hand.filter(x => plainOk(x) && x !== c), 'Çağrılacak canavar', 'revive'); if (m) await d.specialSummon(p, m); return true; },
  });
  S('Fairy\'s Hand Mirror', { targetCan: (d, p, t, c, src) => src.kind === 'spell' && isMon(c), async onTargetedTrap() { return true; } });
  S('Fiend\'s Hand Mirror', { targetCan: (d, p, t, c, src) => src.kind === 'spell' && isST(c), async onTargetedTrap() { return true; } });
  S('Fake Trap', { fakeTrap: true, trigger: 'none', can: () => false });
  const stLostTrap = (name, kind) => S(name, {
    trigger: 'stLost', can: (d, p, c, ctx) => ctx.kind === kind && d.allField().some(x => isST(x) && x !== c),
    async resolve(d, p, c) { const t = await pick(d, p, d.allField().filter(x => isST(x) && x !== c), `${name}: yok edilecek Büyü/Tuzak`, 'harm'); if (t) await d.destroy(t, c); },
  });
  stLostTrap('Driving Snow', 'trap'); stLostTrap('Gust', 'spell');
  S('Dust Barrier', {
    sub: 'continuous', async resolve() {}, async standby(d, p, x) { x.n = (x.n || 0) + 1; if (x.n >= 2) await d.destroy(x, x); },
    guardMon: (d, x, c) => c.up && c.d.type === 'Normal Monster' && !!d.src && d.src.kind === 'spell' && d.src.p !== x.owner,
  });
  S('Non-Spellcasting Area', { sub: 'continuous', async resolve() {}, guardMon: (d, x, c) => c.up && !/Effect/.test(c.d.type) && !!d.src && d.src.kind === 'spell' });
  S('Fusion Gate', {
    sub: 'field', async resolve() {},
    stAb: [{
      label: 'Fusion Summon (malzemeler çıkarılır)', can: (d, p) => E.fusionOptions(d, p).length > 0,
      async resolve(d, p) {
        const opts = E.fusionOptions(d, p); const f = await pick(d, p, opts.map(o => o.fusion), 'Fusion Gate: Fusion Summon', 'help'); if (!f) return false;
        const o = opts.find(x => x.fusion === f); f.fusionNormals = o.mats.filter(m => m.d.type === 'Normal Monster').length; for (const m of o.mats) await d.banish(m); await d.specialSummon(p, f);
      },
      ai: () => true,
    }],
  });
  S('Ground Collapse', {
    sub: 'continuous', noAI: true, can: d => [0, 1, 2].filter(i => !d.P(0).mz[i] && !d.P(1).mz[i]).length >= 2,
    async resolve(d, p, c) {
      let free = [0, 1, 2].filter(i => !d.P(0).mz[i] && !d.P(1).mz[i]);
      const a = +(await d.choose(p, 'Kapatılacak bölge (1)', free.map(i => String(i + 1)))) - 1; free = free.filter(i => i !== a);
      const b = +(await d.choose(p, 'Kapatılacak bölge (2)', free.map(i => String(i + 1)))) - 1; c.blockZones = [a, b]; c.blockBoth = true;
    },
  });
  S('Human-Wave Tactics', {
    sub: 'continuous', manual: true, aiOk: () => false, async resolve() {},
    async onFieldToGrave(d, o, x, card, kind) { if (kind === 'mz' && card.owner === x.owner && card.graveInfo && card.graveInfo.why === 'battle' && card.d.type === 'Normal Monster' && lv(card) <= 2) { if (x.hw && x.hw.turn === d.turn) x.hw.n++; else x.hw = { turn: d.turn, n: 1 }; } },
    async endPhaseAny(d, tp, x) { if (!x.hw || x.hw.turn !== d.turn) return; const n = x.hw.n; x.hw = null; for (let i = 0; i < n; i++) { const m = d.P(x.owner).deck.find(c => isMon(c) && c.d.type === 'Normal Monster' && lv(c) <= 2); if (!m || d.freeZone(x.owner, 'mz') < 0) break; await d.specialSummon(x.owner, m); } shuffleDeck(d, x.owner); },
  });
  S('Huge Revolution', {
    manual: true, aiOk: () => false, can: (d, p) => ['People Running About', 'Oppressed People', 'United Resistance'].every(n => ownHas(d, p, n)),
    async resolve(d, p) { for (const c of [...d.P(O(p)).hand]) await d.sendToGrave(c, 'discard'); for (const c of d.allField().filter(x => x.owner === O(p))) await d.destroy(c, null); },
  });
  S('Inferno Tempest', {
    triggers: ['damage'], can: (d, p, c, ctx) => !!ctx && ctx.p === p && ctx.battle && ctx.amount >= 3000,
    async resolve(d) { for (const q of [0, 1]) for (const m of [...d.P(q).deck.filter(isMon), ...d.P(q).grave.filter(isMon)]) await d.banish(m); },
  });
  S('Jar Robber', { triggers: ['spell'], can: (d, p, c, ctx) => !!ctx && !!ctx.spell && ctx.spell.d.name === 'Pot of Greed' && ctx.activator !== p, async resolve(d, p, c, ctx) { ctx.negated = true; await d.draw(p, 1); } });
  S('Judgment of the Desert', {
    sub: 'continuous', manual: true, aiOk: () => true, async resolve() {},
    async onFlip(d, o, x, c) { c.jotd = x.uid; },
    restrictPos: (d, c, f) => (c.jotd === f.uid ? 'Judgment of the Desert: pozisyon değiştirilemez' : null),
  });
  S('Kaiser Colosseum', {
    sub: 'continuous', noAI: true, async resolve() {},
    restrictSummon: (d, f, p, c) => { if (c.d.kind !== 'monster' || p === f.owner) return null; const mine = d.monsters(f.owner).length; return mine && d.monsters(p).length + 1 > mine ? 'Kaiser Colosseum: rakipten fazla canavar koyamazsın' : null; },
  });
  S('Last Turn', {
    trigger: 'phase', ai: () => false, can: (d, p, c, ctx) => ctx.phase === 'battle' && d.P(p).lp <= 1000 && d.monsters(p).length > 0,
    async resolve(d, p, c) {
      const keep = await pick(d, p, d.monsters(p), 'Last Turn: kalacak canavar', 'help'); if (!keep) return; const q = O(p);
      for (const x of d.allField().filter(y => y !== keep && y !== c)) await d.sendToGrave(x, 'destroy');
      for (const pl of [0, 1]) for (const h of [...d.P(pl).hand]) await d.sendToGrave(h, 'discard');
      d.flags.noDmg = [d.turn, d.turn];
      const m = await pick(d, q, d.P(q).deck.filter(plainOk), 'Last Turn: desteden çağrılacak canavar', 'revive');
      if (m && (await d.specialSummon(q, m))) { const zi = d.P(q).mz.indexOf(m), tz = d.P(p).mz.indexOf(keep); if (zi >= 0 && tz >= 0) await d.doAttack(q, zi, tz); }
      (d.endQueue = d.endQueue || []).push(async () => { const ms = [0, 1].flatMap(i => d.monsters(i)); if (ms.length === 1) await d.win(ms[0].owner, 'Last Turn: tek canavar kaldı'); else await d.win(null, 'Last Turn: beraberlik'); });
    },
  });
  S('Life Absorbing Machine', { sub: 'continuous', manual: true, aiOk: () => false, async resolve() {}, async standby(d, p) { const n = Math.floor(((d.lpPrev || [0, 0])[p] || 0) / 2); if (n > 0) await d.heal(p, n); } });
  S('Light of Intervention', { sub: 'continuous', manual: true, aiOk: () => false, noSetMon: true, async resolve() {} });
  S('Light of Judgment', {
    manual: true, aiOk: () => false, can: (d, p) => fieldHas(d, 'The Sanctuary in the Sky') && !discLock(d) && d.P(p).hand.some(x => isMon(x) && x.d.attr === 'LIGHT'),
    async resolve(d, p) {
      const t = await pick(d, p, d.P(p).hand.filter(x => isMon(x) && x.d.attr === 'LIGHT'), 'Atılacak LIGHT canavar', 'cost'); if (!t) return false; await d.sendToGrave(t, 'discard');
      const m = await d.choose(p, 'Light of Judgment', ['Rakibin elini gör ve 1 kart at', 'Rakibin 1 kartını mezarlığa gönder']);
      if (m.startsWith('Rakibin elini')) { await look(d, p, d.P(O(p)).hand, 'Rakibin eli'); const x = await pick(d, p, d.P(O(p)).hand, 'Atılacak kart', 'discard'); if (x) await d.sendToGrave(x, 'discard'); }
      else { const x = await pick(d, p, d.allField().filter(c => c.owner === O(p)), 'Mezarlığa gönderilecek kart', 'harm'); if (x) await d.sendToGrave(x, 'destroy'); }
    },
  });
  return FX;
});
