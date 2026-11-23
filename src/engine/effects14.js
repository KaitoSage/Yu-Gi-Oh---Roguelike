// Kart efektleri — 14. paket: M–Z (Destiny Board, Sarcophagus zinciri, Pandemonium/Terrorking, Metal canavarlar, LV kartları, kısıtlama kartları...).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects13.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };
  const eqFx = (name, race, a, df, extra) => { if (!FX[name]) E.equipHelper(name, race, a, df, extra); };
  const mkToken = E.mkToken;
  const { total: scTotal, remove: scRemove, add: addSC, can: canSC } = E.sc;

  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }
  async function look(d, p, cards, title) { if (cards.length) await d.ctl[p].pick(d, p, cards.map(card => ({ card })), title, 'help'); }
  const isMon = c => c.d.kind === 'monster';
  const isST = c => c.d.kind !== 'monster';
  const lv = c => c.d.level || 0;
  const mons = (d, p, up) => d.monsters(p, up);
  const fieldHas = (d, n) => d.allField().some(c => c.up && c.d.name === n);
  const ownHas = (d, p, n) => d.allField().some(c => c.up && c.owner === p && c.d.name === n);
  const shuffleDeck = (d, p) => E.shuffle(d.P(p).deck, d.rng);
  const pand = d => d.allField().some(x => x.up && x.d.name === 'Pandemonium');
  const umi = d => d.allField().some(c => c.up && (c.d.name === 'Umi' || c.d.name === 'Maiden of the Aqua'));
  const discLock = d => d.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].noDiscardCost);
  const plainOk = c => isMon(c) && c.d.type !== 'Fusion Monster' && !/Ritual/.test(c.d.type) && !(FX[c.d.name] && (FX[c.d.name].handSummon || FX[c.d.name].summonReq));
  async function discardRandom(d, q, n = 1) { for (let i = 0; i < n && d.P(q).hand.length; i++) { const H = d.P(q).hand; await d.sendToGrave(H[Math.floor(d.rng() * H.length)], 'discard'); } }
  const toHand = async (d, p, c) => { d.removeFromWherever(c); d.P(p).hand.push(c); await d.ev('search', { p, card: c }); };
  const faceDown = { label: 'Kapalı savunmaya geç', can: (d, p, c) => c.up, async resolve(d, p, c) { c.up = false; c.pos = 'def'; await d.ev('pos', { p, card: c }); } };
  const placeFace = async (d, p, c, host) => { // Spirit Message / Sarcophagus gibi kartları Büyü/Tuzak bölgesine yüzü açık koy
    const zi = d.freeZone(p, 'st'); if (zi < 0) return false;
    d.removeFromWherever(c); c.owner = p; c.equipTo = host ? host.uid : null; c.up = true; c.pos = 'atk'; c.placedTurn = d.turn; d.P(p).st[zi] = c;
    await d.ev('activate', { p, card: c, zone: zi });
    return true;
  };
  async function sendAllNamed(d, p, re) { for (const c of [...d.P(p).st].filter(x => x && re.test(x.d.name))) await d.sendToGrave(c, 'destroy'); }

  // ======================================================================== DESTINY BOARD / SARCOPHAGUS
  // Not: oyunda yalnızca 3 Büyü/Tuzak bölgesi var; Destiny Board + 4 Spirit Message sığmaz. Bu yüzden Spirit Message kartları
  // Destiny Board'a eklenir (sahada bölge kaplamaz), sırayla I-N-A-L.
  const MSG = ['I', 'N', 'A', 'L'].map(l => `Spirit Message "${l}"`);
  for (const n of MSG) S(n, { sub: 'continuous', noSet: true, can: () => false, noAI: true, async resolve() {} });
  S('Destiny Board', {
    sub: 'continuous', manual: true, aiOk: () => true, async resolve() {},
    async endPhaseAny(d, tp, x) {
      if (tp === x.owner) return;
      const have = (x.msgs || []).map(c => c.d.name); const next = MSG.find(n => !have.includes(n)); if (!next) return;
      const c = [...d.P(x.owner).hand, ...d.P(x.owner).deck].find(y => y.d.name === next); if (!c) return;
      d.removeFromWherever(c); c.up = true; (x.msgs = x.msgs || []).push(c); shuffleDeck(d, x.owner); await d.ev('reveal', { p: x.owner, card: c });
      if (x.msgs.length === 4) await d.win(x.owner, 'DESTINY BOARD! F-I-N-A-L');
    },
    async onLeaveField(d, p, c) { for (const m of (c.msgs || [])) { m.graveInfo = { turn: d.turn, why: 'destroy', from: 'st' }; d.P(m.origOwner).grave.push(m); } c.msgs = null; },
  });
  const SARC = ['The Second Sarcophagus', 'The Third Sarcophagus'];
  for (const n of SARC) S(n, { sub: 'continuous', noSet: true, can: () => false, noAI: true, async resolve() {}, async onLeaveField(d, p) { await sendAllNamed(d, p, /Sarcophagus$/); } });
  S('The First Sarcophagus', {
    sub: 'continuous', manual: true, aiOk: () => true, async resolve() {},
    async endPhaseAny(d, tp, x) {
      if (tp === x.owner) return;
      const sar = () => d.P(x.owner).st.filter(c => c && c.up && /Sarcophagus$/.test(c.d.name)).map(c => c.d.name);
      const next = SARC.find(n => !sar().includes(n));
      if (next) { const c = [...d.P(x.owner).hand, ...d.P(x.owner).deck].find(y => y.d.name === next); if (c && d.freeZone(x.owner, 'st') >= 0) { await placeFace(d, x.owner, c); shuffleDeck(d, x.owner); } }
      if (sar().length === 3) {
        const sp = [...d.P(x.owner).hand, ...d.P(x.owner).deck].find(y => y.d.name === 'Spirit of the Pharaoh'); await sendAllNamed(d, x.owner, /Sarcophagus$/);
        if (sp && d.freeZone(x.owner, 'mz') >= 0) { await d.specialSummon(x.owner, sp); shuffleDeck(d, x.owner); }
      }
    },
    async onLeaveField(d, p) { await sendAllNamed(d, p, /Sarcophagus$/); },
  });
  S('Spirit of the Pharaoh', {
    handSummon: { tributes: 0, can: () => 'Yalnızca The First Sarcophagus ile çağrılır' },
    async onSummon(d, p, c) { if (!c.special) return; let n = 0; for (const t of d.P(p).grave.filter(x => isMon(x) && x.d.race === 'Zombie' && x.d.type === 'Normal Monster' && lv(x) <= 2)) { if (n >= 4 || d.freeZone(p, 'mz') < 0) break; if (await d.specialSummon(p, t)) n++; } },
  });

  // ======================================================================== PANDEMONIUM / ARCHFIEND
  S('Pandemonium', {
    sub: 'field', async resolve() {},
    async onFieldToGrave(d, o, x, card, kind) {
      if (kind !== 'mz' || !isMon(card) || !/Archfiend/.test(card.d.name) || (card.graveInfo && card.graveInfo.why === 'battle')) return;
      const q = card.owner; const t = await pick(d, q, d.P(q).deck.filter(m => isMon(m) && /Archfiend/.test(m.d.name) && lv(m) < lv(card)), 'Pandemonium: Desteden daha düşük Level Archfiend al', 'help'); if (t) await toHand(d, q, t);
    },
  });
  S('Pandemonium Watchbear', { guardST: (d, c, kind) => c.d.name === 'Pandemonium' && kind === 'destroy' && !!d.src && d.src.p !== c.owner });
  S('Terrorking Archfiend', {
    summonReq: (d, p) => (mons(d, p, true).some(m => /Archfiend/.test(m.d.name) && m.d.name !== 'Terrorking Archfiend') ? null : 'Archfiend canavarı gerekir'),
    async standby(d, p, c) { if (pand(d)) return; if (d.P(p).lp > 800) await d.damage(p, 800, c); else await d.destroy(c); },
    async onTargeted(d, owner, c) { const r = (await d.roll(owner))[0]; if (r === 2 || r === 5) { if (d.src && d.src.card && d.onField(d.src.card)) await d.destroy(d.src.card, c); return true; } return false; },
    negateKilled: (d, x, killer, victim) => killer === x && /Effect/.test(victim.d.type),
  });
  S('Mazera DeVille', {
    handSummon: { tributes: 1, can: (d) => (fieldHas(d, 'Pandemonium') ? null : 'Pandemonium gerekir'), cost: async (d, p, c, tr) => tr.length === 1 && tr[0].d.name === 'Warrior of Zera' && tr[0].up },
    async onSummon(d, p, c) { if (c.special && ownHas(d, p, 'Pandemonium')) await discardRandom(d, O(p), 3); },
  });

  // ======================================================================== METAL CANAVARLAR
  const metalAb = metal => ({
    label: `Metalmorph tribute: ${metal} çağır`, can: (d, p, c) => d.allField().some(e => e.equipTo === c.uid && e.d.name === 'Metalmorph') && d.P(p).deck.some(x => x.d.name === metal),
    async resolve(d, p, c) { const m = d.P(p).deck.find(x => x.d.name === metal); if (!m) return false; await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, m); shuffleDeck(d, p); }, ai: () => true,
  });
  for (const [base, metal] of [['Zoa', 'Metalzoa'], ['Red-Eyes Black Dragon', 'Red-Eyes Black Metal Dragon']]) { FX[base] = FX[base] || {}; if (!FX[base].ability) FX[base].ability = metalAb(metal); S(metal, { handSummon: { tributes: 0, can: () => `Yalnızca Metalmorph donatılmış ${base} ile çağrılır` } }); }
  S('Rare Metal Dragon', { handSummon: { tributes: 1, can: () => null, cost: async (d, p, c, tr) => tr.length === 1 && tr[0].d.race === 'Machine' } });
  S('Rare Metalmorph', {
    sub: 'continuous', manual: true, aiOk: () => false, can: d => d.allField().some(m => isMon(m) && m.up && m.d.race === 'Machine' && d.inMZ(m)),
    async resolve(d, p, c) { const t = await pick(d, p, d.allField().filter(m => isMon(m) && m.up && m.d.race === 'Machine' && d.inMZ(m)), 'Rare Metalmorph: Machine canavar', 'help'); if (!t) return false; c.rm = t.uid; },
    mod: (m, key, d, f) => (f.rm === m.uid && key === 'atk' ? 500 : 0),
    async guardTarget(d, x, c, src) { if (x.rm === c.uid && src.kind === 'spell' && !x.rmUsed) { x.rmUsed = true; return true; } return false; },
    async onFieldToGrave(d, o, x, card) { if (card.uid === x.rm) await d.destroy(x, x); },
  });
  const cocoonOn = (d, m) => d.allField().find(e => e.equipTo === m.uid && e.d.name === 'Cocoon of Evolution');
  FX['Cocoon of Evolution'] = {
    handEffect: {
      label: 'Petit Moth\'a donat', can: (d, p) => d.freeZone(p, 'st') >= 0 && d.monsters(p, true).some(m => m.d.name === 'Petit Moth' && !cocoonOn(d, m)),
      async resolve(d, p, c) {
        const m = await pick(d, p, d.monsters(p, true).filter(x => x.d.name === 'Petit Moth' && !cocoonOn(d, x)), 'Cocoon donatılacak Petit Moth', 'help'); if (!m) return false;
        const zi = d.freeZone(p, 'st'); d.removeFromWherever(c); c.owner = p; c.equipTo = m.uid; c.up = true; c.cAge = 0; d.P(p).st[zi] = c; d.setD(m, 'cocoon', { atk: 0, def: 2000 }); await d.ev('equip', { p, card: c, target: m });
      },
      ai: () => true,
    },
    async standby(d, p, x) { x.cAge = (x.cAge || 0) + 1; },
    async onLeaveField(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); if (h) d.clrD(h, 'cocoon'); },
  };
  const mothAge = n => ({ handSummon: { tributes: 1, can: () => null, cost: async (d, p, c, tr) => { const e = tr.length === 1 && tr[0].d.name === 'Petit Moth' && cocoonOn(d, tr[0]); return !!e && (e.cAge || 0) >= n; } } });
  FX['Great Moth'] = mothAge(4);
  S('Perfectly Ultimate Great Moth', mothAge(6));

  // ======================================================================== LV KARTLARI / DİĞER ÖZEL ÇAĞRILANLAR
  S('Silent Swordsman LV3', { async onTargeted(d) { return !!d.src && d.src.kind === 'spell'; } });
  S('Silent Swordsman LV7', {
    handSummon: { tributes: 1, can: () => null, cost: async (d, p, c, tr) => tr.length === 1 && /^Silent Swordsman LV[35]$/.test(tr[0].d.name) && tr[0].up },
    negateSpells: true, negateSpellFx: true,
  });
  S('Ultimate Insect LV1', {
    immune: (d, c) => !!d.src && d.src.kind === 'spell',
    async standby(d, p, c) {
      if (c.placedTurn >= d.turn) return; const n = [...d.P(p).hand, ...d.P(p).deck].find(x => x.d.name === 'Ultimate Insect LV3'); if (!n || !(await d.ask(p, c, 'Ultimate Insect LV1: LV3\'e yüksel?'))) return;
      await d.sendToGrave(c, 'cost'); if (await d.specialSummon(p, n)) n.fromLV1 = true; shuffleDeck(d, p);
    },
  });
  S('Ultimate Insect LV3', { mod: (m, key, d, f) => (f.fromLV1 && m.owner !== f.owner && key === 'atk' && isMon(m) ? -300 : 0) });
  S('Metal Detector', { trigger: 'trapAct', can: (d, p, c, ctx) => ctx.activator !== p && !!FX[ctx.card.d.name] && FX[ctx.card.d.name].sub === 'continuous', async resolve(d) { d.flags.negContTrap = d.turn; } });
  S('Mystic Probe', { trigger: 'spell', can: (d, p, c, ctx) => ctx.activator !== p && !!FX[ctx.spell.d.name] && FX[ctx.spell.d.name].sub === 'continuous', async resolve(d) { d.flags.negContSpell = d.turn; } });
  S('World Suppression', { trigger: 'fieldAct', can: (d, p, c, ctx) => ctx.activator !== p, async resolve(d) { d.flags.negField = d.turn; } });
  S('Mirage Knight', {
    handSummon: { tributes: 0, can: () => 'Yalnızca Dark Flare Knight ile çağrılır' },
    battleBoost(d, p, c) { if (!d.battle) return; const o = d.battle.a === c ? d.battle.d : d.battle.d === c ? d.battle.a : null; if (o) d.addTemp(c, o.d.atk || 0); },
    async endPhaseAny(d, tp, x) { if (x.battledTurn === d.turn) await d.banish(x); },
  });
  const triple = ['Alpha The Magnet Warrior', 'Beta The Magnet Warrior', 'Gamma The Magnet Warrior'];
  S('Valkyrion the Magna Warrior', {
    handSummon: {
      tributes: 0, costFrees: true,
      can: (d, p) => (triple.every(n => [...d.P(p).hand, ...d.monsters(p)].some(c => c.d.name === n)) ? null : 'Alpha, Beta ve Gamma gerekir'),
      async cost(d, p) { const used = []; for (const n of triple) { const c = [...d.monsters(p), ...d.P(p).hand].find(x => x.d.name === n && !used.includes(x)); if (!c) return false; used.push(c); } for (const c of used) await d.sendToGrave(c, 'tribute'); },
    },
    ability: {
      label: 'Tribute: Alpha/Beta/Gamma\'yı mezarlıktan çağır', can: (d, p) => triple.every(n => d.P(p).grave.some(c => c.d.name === n)),
      async resolve(d, p, c) { await d.sendToGrave(c, 'tribute'); for (const n of triple) { const t = d.P(p).grave.find(x => x.d.name === n); if (t && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, t); } }, ai: () => false,
    },
  });
  S('Vampire Genesis', {
    handSummon: { tributes: 0, costFrees: true, can: (d, p) => (mons(d, p, true).some(m => m.d.name === 'Vampire Lord') ? null : 'Vampire Lord gerekir'), async cost(d, p) { const v = mons(d, p, true).find(m => m.d.name === 'Vampire Lord'); if (!v) return false; await d.banish(v); } },
    ability: {
      label: 'Zombie at: mezarlıktan daha düşük Level Zombie çağır', can: (d, p) => d.P(p).hand.some(x => isMon(x) && x.d.race === 'Zombie') && d.freeZone(p, 'mz') >= 0 && !discLock(d),
      async resolve(d, p) {
        const z = await pick(d, p, d.P(p).hand.filter(x => isMon(x) && x.d.race === 'Zombie'), 'Atılacak Zombie', 'discard'); if (!z) return false; await d.sendToGrave(z, 'discard');
        const t = await pick(d, p, d.P(p).grave.filter(x => isMon(x) && x.d.race === 'Zombie' && lv(x) < lv(z)), 'Çağrılacak Zombie', 'revive'); if (t) await d.specialSummon(p, t);
      },
    },
  });
  S('Wall Shadow', { handSummon: { tributes: 0, can: () => 'Yalnızca Magical Labyrinth ile çağrılır' } });
  eqFx('Magical Labyrinth', m => m.d.name === 'Labyrinth Wall', 0, 0, {
    stAb: [{
      label: 'Labyrinth Wall\'ı tribute et: Wall Shadow çağır', can: (d, p, c) => d.allField().some(m => m.uid === c.equipTo) && d.P(p).deck.some(x => x.d.name === 'Wall Shadow'),
      async resolve(d, p, c) { const h = d.allField().find(m => m.uid === c.equipTo); const w = d.P(p).deck.find(x => x.d.name === 'Wall Shadow'); if (!h || !w) return false; await d.sendToGrave(h, 'tribute'); await d.specialSummon(p, w); shuffleDeck(d, p); },
      ai: () => true,
    }],
  });
  S('Skull Knight #2', { async onTributed(d, p, t, c) { if (c.d.race !== 'Fiend' || d.freeZone(p, 'mz') < 0) return; const n = d.P(p).deck.find(x => x.d.name === 'Skull Knight #2'); if (n) { await d.specialSummon(p, n); shuffleDeck(d, p); } } });
  S('Spirit of the Pot of Greed', { async onSpellResolved(d, o, x, p, c) { if (c.d.name === 'Pot of Greed' && x.pos === 'atk') await d.draw(p, 1); } });
  S('The Agent of Wisdom - Mercury', {
    async endPhaseAny(d, tp, x) { if (tp !== x.owner) x.emptyHand = d.P(x.owner).hand.length === 0; },
    async standby(d, p, x) { if (x.emptyHand) { x.emptyHand = false; await d.draw(p, 1); } },
  });
  S('The End of Anubis', { blockGrave: true });
  S('Twin-Headed Behemoth', {
    async onGrave(d, p, c, why) {
      if (c.thbUsed || (why !== 'destroy' && why !== 'battle')) return;
      (d.endQueue = d.endQueue || []).push(async () => { if (!d.P(p).grave.includes(c) || d.freeZone(p, 'mz') < 0) return; c.thbUsed = true; if (await d.specialSummon(p, c)) d.setD(c, 'thb', { atk: 1000, def: 1000 }); });
    },
  });
  S('Steel Scorpion', { async afterDefended(d, q, c, a) { if (a.d.race === 'Machine') return; (d.pendingReturn = d.pendingReturn || []).push({ p: a.owner, n: 2, fn: async () => { if (d.inMZ(a)) await d.destroy(a, c); } }); } });
  S('Sinister Serpent', {
    async graveStandby(d, p, c) {
      if (d.flags.serpTurn === d.turn || !(await d.ask(p, c, 'Sinister Serpent: ele alınsın mı?'))) return;
      d.flags.serpTurn = d.turn; await toHand(d, p, c);
      (d.endWatch = d.endWatch || []).push({ p: O(p), after: d.turn, fn: async () => { const g = d.P(p).grave.find(x => x.d.name === 'Sinister Serpent'); if (g) await d.banish(g); } });
    },
  });
  S('Makyura the Destructor', { async onGrave(d, p) { d.flags.trapHand = d.flags.trapHand || [-1, -1]; d.flags.trapHand[p] = d.turn; } });
  S('Malice Doll of Demise', {
    async onGrave(d, p, c) {
      const s = d.src; if (!(s && s.card && s.card.d.kind === 'spell' && FX[s.card.d.name] && FX[s.card.d.name].sub === 'continuous')) return;
      (d.pendingReturn = d.pendingReturn || []).push({ p, n: 1, fn: async () => { if (d.P(p).grave.includes(c) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, c); } });
    },
  });
  S('Manticore of Darkness', {
    async onGrave(d, p, c) {
      (d.endQueue = d.endQueue || []).push(async () => {
        if (!d.P(p).grave.includes(c) || d.freeZone(p, 'mz') < 0) return;
        const cs = [...d.P(p).hand.filter(isMon), ...mons(d, p)].filter(x => ['Beast', 'Beast-Warrior', 'Winged Beast'].includes(x.d.race)); if (!cs.length || !(await d.ask(p, c, 'Manticore of Darkness: Beast/Beast-Warrior/Winged Beast gönder ve çağır?'))) return;
        const t = await pick(d, p, cs, 'Mezarlığa gönderilecek canavar', 'cost'); if (!t) return; await d.sendToGrave(t, 'cost'); await d.specialSummon(p, c);
      });
    },
  });
  S('Neko Mane King', { async onGrave(d, p) { if (d.active !== p && d.src && d.src.p !== p) d.skipToEnd = true; } });
  S('Parasite Paracide', {
    async onFlip(d, p, c) { d.removeFromWherever(c); c.up = true; c.pos = 'atk'; c.parasite = true; d.P(O(p)).deck.push(c); shuffleDeck(d, O(p)); },
    async onDrawn(d, p, c) { if (!c.parasite) return; c.parasite = false; if (d.freeZone(p, 'mz') >= 0 && (await d.specialSummon(p, c, { pos: 'def' }))) await d.damage(p, 1000, c); },
    async stateCheck(d, p, x) { for (const m of d.monsters(O(x.owner), true)) if (m.d.race !== 'Insect') d.setD(m, 'para' + x.uid, { race: 'Insect' }); },
    async onLeaveField(d, p, c) { for (const m of d.allField().filter(isMon)) d.clrD(m, 'para' + c.uid); },
  });
  S('Pharaoh\'s Treasure', {
    manual: true, aiOk: () => false,
    async resolve(d, p, self) { d.removeFromWherever(self); self.up = true; self.treasure = true; d.P(p).deck.push(self); shuffleDeck(d, p); },
    async onDrawn(d, p, c) { if (!c.treasure) return; c.treasure = false; await d.sendToGrave(c, 'cost'); const t = await pick(d, p, d.P(p).grave.filter(x => x !== c), 'Pharaoh\'s Treasure: mezarlıktan kart al', 'help'); if (t) await toHand(d, p, t); },
  });
  S('Penguin Knight', { async onMilled(d, p) { const P = d.P(p); P.deck.push(...P.grave); P.grave.length = 0; shuffleDeck(d, p); } });
  S('Serpentine Princess', { async onToDeck(d, p) { const t = await pick(d, p, d.P(p).deck.filter(x => isMon(x) && lv(x) <= 3 && plainOk(x)), 'Çağrılacak Level ≤3 canavar', 'revive'); if (t) { await d.specialSummon(p, t); shuffleDeck(d, p); } } });
  S('Supply', {
    async onFlip(d, p) {
      const g = d.P(p).grave.filter(x => isMon(x) && x.graveInfo && x.graveInfo.why === 'fusion');
      for (let i = 0; i < 2; i++) { const t = await pick(d, p, g.filter(x => d.P(p).grave.includes(x)), `Supply: Fusion malzemesi (${i + 1}/2)`, 'revive'); if (t) await toHand(d, p, t); }
    },
  });
  S('Wandering Mummy', {
    ability: {
      label: 'Kapalı savunmaya geç ve kapalı canavarları karıştır', can: (d, p, c) => c.up,
      async resolve(d, p, c) { c.up = false; c.pos = 'def'; await d.ev('pos', { p, card: c }); const P = d.P(p); const idx = P.mz.map((m, i) => (m && !m.up ? i : -1)).filter(i => i >= 0); const cs = E.shuffle(idx.map(i => P.mz[i]), d.rng); idx.forEach((i, k) => { P.mz[i] = cs[k]; }); },
    },
  });
  S('Yado Karu', {
    ai: () => false,
    async onPos(d, p, c, from, to) { if (from !== 'atk' || to !== 'def') return; while (d.P(p).hand.length && (await d.ask(p, c, 'Yado Karu: elinden bir kartı Deste altına koy?'))) { const t = await pick(d, p, d.P(p).hand, 'Deste altına konacak kart', 'discard'); if (!t) break; d.removeFromWherever(t); d.P(p).deck.push(t); } },
  });

  // ======================================================================== BÜYÜ / TUZAK (M–Z)
  S('Graverobber', {
    manual: true, aiOk: () => false, can: (d, p) => d.P(O(p)).grave.some(c => c.d.kind === 'spell' && FX[c.d.name]),
    async resolve(d, p) {
      const t = await pick(d, p, d.P(O(p)).grave.filter(c => c.d.kind === 'spell' && FX[c.d.name]), 'Graverobber: rakibin mezarlığından Büyü', 'revive'); if (!t) return false;
      d.removeFromWherever(t); t.owner = p; t.lent = d.turn; d.P(p).hand.push(t); await d.ev('search', { p, card: t });
      (d.endQueue = d.endQueue || []).push(async () => { if (d.P(p).hand.includes(t)) { d.removeFromWherever(t); t.owner = t.origOwner; t.lent = -1; d.P(t.origOwner).grave.push(t); } });
    },
  });
  S('Magic Reflector', { can: (d, p) => d.allField().some(c => c.owner === p && c.up && c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub), async resolve(d, p) { const t = await pick(d, p, d.allField().filter(c => c.owner === p && c.up && c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub), 'Sayaç konacak Büyü', 'help'); if (!t) return false; t.mr = (t.mr || 0) + 1; } });
  S('Magical Hats', {
    trigger: 'phase', ai: () => false,
    can: (d, p, c, ctx) => ctx.phase === 'battle' && d.monsters(p).length >= 1 && d.P(p).deck.filter(isST).length >= 2 && d.P(p).mz.filter(x => !x).length >= 2,
    async resolve(d, p) {
      const m = await pick(d, p, d.monsters(p), 'Magical Hats: saklanacak canavar', 'help'); if (!m) return;
      const hats = []; for (let i = 0; i < 2; i++) { const h = await pick(d, p, d.P(p).deck.filter(x => isST(x) && !hats.includes(x)), `Desteden Büyü/Tuzak (${i + 1}/2)`, 'cost'); if (!h) return; hats.push(h); }
      for (const h of hats) { const z = d.freeZone(p, 'mz'); if (z < 0) break; d.removeFromWherever(h); h.owner = p; d.P(p).mz[z] = h; h.up = false; h.pos = 'def'; h.placedTurn = d.turn; d.setD(h, 'hat', { kind: 'monster', type: 'Normal Monster', atk: 0, def: 0, level: 1, race: 'Spellcaster', attr: 'DARK' }); await d.ev('set', { p, card: h, zone: z }); }
      m.up = false; m.pos = 'def'; await d.ev('pos', { p, card: m });
      const P = d.P(p); const cs = E.shuffle(P.mz.filter(Boolean), d.rng); for (let i = 0; i < 3; i++) P.mz[i] = cs[i] || null;
      (d.endQueue = d.endQueue || []).push(async () => { for (const h of hats) if (d.inMZ(h)) await d.sendToGrave(h, 'destroy'); });
      shuffleDeck(d, p);
    },
  });
  S('Major Riot', {
    trigger: 'bounce', can: (d, p, c, ctx) => ctx.card.origOwner === p,
    async resolve(d, p) {
      const n = [0, 0]; for (const m of d.allField().filter(isMon)) { n[m.origOwner === 0 ? 0 : 1]++; }
      const cs = [...d.allField().filter(isMon)]; const side = cs.map(m => m.owner); for (const m of cs) await d.bounce(m);
      for (const q of [0, 1]) for (let i = 0; i < side.filter(s => s === q).length; i++) { const t = await pick(d, q, d.P(q).hand.filter(plainOk), `Major Riot: kapalı savunmada çağrılacak canavar`, 'help'); if (!t) break; if (await d.specialSummon(q, t, { pos: 'def' })) { t.up = false; await d.ev('pos', { p: q, card: t }); } }
    },
  });
  S('Mirage of Nightmare', {
    sub: 'continuous', noAI: true, async resolve() {},
    async standbyAny(d, tp, x) { if (tp !== O(x.owner)) return; const n = 4 - d.P(x.owner).hand.length; if (n > 0) { x.mn = n; await d.draw(x.owner, n); } },
    async standby(d, p, x) { if (x.mn > 0) { const n = x.mn; x.mn = 0; await discardRandom(d, p, n); } },
  });
  S('Mirror Wall', {
    sub: 'continuous', manual: true, aiOk: () => false, async resolve() {},
    async onAttackAny(d, o, x, atker) { if (atker.owner !== x.owner) (x.halved = x.halved || new Set()).add(atker.uid); },
    mod: (m, key, d, f) => (f.halved && f.halved.has(m.uid) && key === 'atk' ? -Math.floor((m.d.atk + m.bonus.atk) / 2) : 0),
    async standby(d, p, x) { if (d.P(p).lp > 2000) await d.damage(p, 2000, x); else await d.destroy(x, x); },
  });
  S('Mokey Mokey Smackdown', {
    sub: 'continuous', noAI: true, async resolve() {},
    async onFieldToGrave(d, o, x, card, kind) { if (kind === 'mz' && card.owner === x.owner && card.d.race === 'Fairy' && card.graveInfo && ['destroy', 'battle'].includes(card.graveInfo.why) && ownHas(d, x.owner, 'Mokey Mokey')) x.boostTurn = d.turn; },
    mod: (m, key, d, f) => (f.boostTurn === d.turn && m.d.name === 'Mokey Mokey' && m.owner === f.owner && key === 'atk' ? 3000 - m.d.atk : 0),
  });
  S('Muko', { trigger: 'spell', can: (d, p, c, ctx) => ctx.activator !== p && /draw/i.test(ctx.spell.d.desc), async resolve(d) { d.flags.muko = d.turn; } });
  S('My Body as a Shield', {
    triggers: ['spell', 'effect'], can: (d, p, c, ctx) => !!ctx && d.P(p).lp > 1500 && ctx.activator !== p && !!(ctx.spell || ctx.card) && /destroy/i.test((ctx.spell || ctx.card).d.desc) && /monster/i.test((ctx.spell || ctx.card).d.desc),
    async resolve(d, p, c, ctx) { await d.damage(p, 1500); ctx.negated = true; },
  });
  S('Narrow Pass', {
    sub: 'continuous', manual: true, aiOk: () => false, can: d => d.monsters(0).length <= 2 && d.monsters(1).length <= 2, async resolve() {},
    restrictSummon: (d, f, p, c, kind) => (c.d.kind === 'monster' && kind === 'normal' && ((f.np || [0, 0])[p] >= 2) ? 'Narrow Pass: en fazla 2 canavar daha' : null),
    async onNormalSet(d, o, x, p) { (x.np = x.np || [0, 0])[p]++; },
  });
  S('Ninjitsu Art of Decoy', {
    sub: 'continuous', manual: true, aiOk: () => false, can: (d, p) => d.monsters(p, true).some(m => /Ninja/.test(m.d.name)),
    async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p, true).filter(m => /Ninja/.test(m.d.name)), 'Ninja canavar', 'help'); if (!t) return false; c.nd = t.uid; },
    protectBattle: (d, x, c) => x.nd === c.uid,
  });
  S('Non Aggression Area', {
    standbyTrap: { own: true, can: (d, p) => d.P(p).hand.length > 0 && !discLock(d), text: 'Non Aggression Area: 1 kart at, rakip bir sonraki turda çağıramasın?' },
    async resolve(d, p) { const t = await pick(d, p, d.P(p).hand, 'Atılacak kart', 'discard'); if (!t) return; await d.sendToGrave(t, 'discard'); d.flags.noSummonP = d.flags.noSummonP || [-1, -1]; d.flags.noSummonP[O(p)] = d.turn + 1; },
  });
  S('Thunder of Ruler', { standbyTrap: { own: false, text: 'Thunder of Ruler: bu tur Battle Phase olmasın?' }, async resolve(d) { d.flags.skipBattle = d.flags.skipBattle || [-1, -1]; d.flags.skipBattle[d.active] = true; } });
  S('Physical Double', {
    trigger: 'phase', ai: () => false, can: (d, p, c, ctx) => ctx.phase === 'battle' && d.monsters(O(p), true).length > 0 && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(O(p), true), 'Kopyalanacak canavar', 'harm'); if (!t) return; const k = await mkToken(d, p, 'Mirage Token', t.d.atk, t.d.def, t.d.level, t.d.race, t.d.attr, 'atk', t); if (k) (d.endQueue = d.endQueue || []).push(async () => { if (d.inMZ(k)) await d.sendToGrave(k, 'destroy'); }); },
  });
  S('Prohibition', {
    sub: 'continuous', noAI: true,
    async resolve(d, p, c) {
      const names = new Set(); for (const q of [0, 1]) { const P = d.P(q); for (const x of [...P.deck, ...P.hand, ...P.grave, ...P.banished, ...P.extra]) names.add(x.d.name); }
      c.banned = await d.choose(p, 'Prohibition: yasaklanacak kart adı', [...names].sort().slice(0, 80));
    },
    banName: true,
  });
  S('Pyro Clock of Destiny', {
    manual: true, aiOk: () => false,
    async resolve(d) { d.maxTurns = Math.max(d.turn + 1, d.maxTurns - 1); for (const c of d.allField()) { if (c.counter > 0) { c.counter--; if (!c.counter) await d.sendToGrave(c, 'expire'); } if (c.d.name === 'Dust Barrier') { c.n = (c.n || 0) + 1; if (c.n >= 2) await d.destroy(c, c); } } },
  });
  S('Question', {
    can: (d, p) => d.P(p).grave.some(isMon),
    async resolve(d, p) {
      const g = d.P(p).grave.filter(isMon)[0]; if (!g) return false; const names = new Set(); for (const x of [...d.P(p).deck, ...d.P(p).hand, ...d.P(p).grave, ...d.allField().filter(c => c.owner === p), ...d.P(p).banished]) if (isMon(x)) names.add(x.d.name);
      const guess = await d.choose(O(p), 'Question: Mezarlığın en altındaki canavarın adı?', [...names].sort().slice(0, 80));
      if (guess === g.d.name) await d.banish(g); else if (d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, g);
    },
  });
  S('Reverse Trap', { manual: true, trigger: 'attack', ai: () => false, aiOk: () => false, async resolve(d) { d.flags.reverse = d.turn; } });
  S('Rivalry of Warlords', {
    sub: 'continuous', manual: true, aiOk: () => false, async resolve(d) { await rival(d); }, async stateCheck(d) { await rival(d); },
  });
  async function rival(d) {
    for (const q of [0, 1]) {
      const ms = d.monsters(q, true); if (new Set(ms.map(m => m.d.race)).size <= 1) continue;
      const keep = [...ms].sort((a, b) => d.atk(b) - d.atk(a))[0].d.race; for (const m of ms.filter(x => x.d.race !== keep)) await d.sendToGrave(m, 'destroy');
    }
  }
  S('Royal Oppression', { sub: 'continuous', manual: true, royal: true, aiOk: () => false, ai: (d, p) => !!d.curSS && d.curSS.p !== p && d.P(p).lp > 2000, async resolve() {} });
  S('Royal Tribute', { can: (d, p) => ownHas(d, p, 'Necrovalley'), async resolve(d) { for (const q of [0, 1]) for (const c of [...d.P(q).hand.filter(isMon)]) await d.sendToGrave(c, 'discard'); } });
  S('Serial Spell', {
    triggers: ['ownSpell'], noAI: true, can: (d, p, c, ctx) => !!ctx && !!ctx.spell,
    async resolve(d, p, c, ctx) { for (const h of [...d.P(p).hand]) await d.sendToGrave(h, 'discard'); const f = FX[ctx.spell.d.name]; if (f && f.resolve) await f.resolve(d, p, ctx.spell); },
  });
  S('Soul Demolition', {
    sub: 'continuous', manual: true, aiOk: () => false, async resolve() {},
    stAb: [{
      label: '500 LP öde: iki taraf rakibin mezarlığından canavar çıkarır', can: (d, p) => d.P(p).lp > 500 && mons(d, p, true).some(m => m.d.race === 'Fiend') && [0, 1].every(q => d.P(q).grave.some(isMon)),
      async resolve(d, p) { await d.damage(p, 500); for (const q of [p, O(p)]) { const t = await pick(d, q, d.P(O(q)).grave.filter(isMon), 'Çıkarılacak canavar (rakibin mezarlığı)', 'harm'); if (t) await d.banish(t); } },
    }],
  });
  S('Soul Exchange', {
    can: (d, p) => d.monsters(O(p), true).length > 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(O(p), true), 'Soul Exchange: hedef', 'harm'); if (!t) return false; d.flags.soulEx = { p, c: t, turn: d.turn }; d.flags.skipBattle = d.flags.skipBattle || [-1, -1]; d.flags.skipBattle[p] = true; },
  });
  S('Spatial Collapse', { sub: 'continuous', manual: true, aiOk: () => false, can: d => [0, 1].every(q => d.P(q).mz.filter(Boolean).length + d.P(q).st.filter(Boolean).length + (d.P(q).field ? 1 : 0) <= 5), fieldCap: 5, async resolve() {} });
  S('Spell Shield Type-8', {
    counter: {
      kinds: ['spell'], can: (d, o, c, card) => (/target/i.test(card.d.desc) && /monster/i.test(card.d.desc)) || d.P(o).hand.some(x => x.d.kind === 'spell'),
      async cost(d, o, c, card) { if (/target/i.test(card.d.desc) && /monster/i.test(card.d.desc)) return true; const t = await pick(d, o, d.P(o).hand.filter(x => x.d.kind === 'spell'), 'Mezarlığa gönderilecek Büyü', 'cost'); if (!t) return false; await d.sendToGrave(t, 'discard'); return true; },
      text: card => `${card.d.name}: Spell Shield Type-8 ile iptal et?`, ai: () => true,
    },
  });
  S('Spirit Elimination', { noAI: true, async resolve(d, p) { d.flags.spiritElim = { p, turn: d.turn }; } });
  S('Spirit\'s Invitation', {
    sub: 'continuous', manual: true, aiOk: () => false, async resolve() {},
    async onBounce(d, o, x, c) { if (!(FX[c.d.name] && FX[c.d.name].spirit) || c.origOwner !== x.owner) return; const t = await pick(d, x.owner, d.monsters(O(x.owner)), 'Spirit\'s Invitation: eline dönecek canavar', 'harm'); if (t) await d.bounce(t); },
    async standby(d, p, x) { if (d.P(p).lp > 500) await d.damage(p, 500, x); else await d.destroy(x, x); },
  });
  S('Spiritual Energy Settle Machine', {
    sub: 'continuous', noAI: true, keepSpirits: true, async resolve() {},
    async endPhase(d, p, x) { const H = d.P(p).hand; if (!H.length) { await d.destroy(x, x); return; } const t = await pick(d, p, H, 'Atılacak kart', 'discard'); if (t) await d.sendToGrave(t, 'discard'); else await d.destroy(x, x); },
    async onLeaveField(d) { for (const m of d.allField().filter(c => isMon(c) && c.up && FX[c.d.name] && FX[c.d.name].spirit)) await d.bounce(m); },
  });
  S('Super Rejuvenation', { triggers: [], noAI: true, async resolve(d, p) { (d.endQueue = d.endQueue || []).push(async () => { const n = (d.dragonLog || []).filter(x => x.turn === d.turn && x.owner === p).length; if (n) await d.draw(p, n); }); } });
  const talisman = (name, key, kind) => S(name, {
    sub: 'continuous', manual: true, aiOk: () => false, [key]: true, can: (d, p) => ownHas(d, p, 'Sealmaster Meisei'), async resolve() {},
    async onFieldToGrave(d, o, x, card) { if (card.d.name === 'Sealmaster Meisei' && card.owner === x.owner) await d.destroy(x, x); },
  });
  talisman('Talisman of Spell Sealing', 'sealSpells'); talisman('Talisman of Trap Sealing', 'sealTraps');
  S('The Dragon\'s Bead', {
    sub: 'continuous', manual: true, aiOk: () => false, can: (d, p) => d.P(p).hand.length > 0 && !discLock(d),
    async resolve(d, p) { const t = await pick(d, p, d.P(p).hand, 'Atılacak kart', 'discard'); if (!t) return false; await d.sendToGrave(t, 'discard'); },
    async guardTarget(d, x, c, src) { if (c.owner !== x.owner || c.d.race !== 'Dragon' || src.kind !== 'trap' || src.p === x.owner) return false; if (src.card && d.onField(src.card)) await d.destroy(src.card, x); return true; },
  });
  S('The Law of the Normal', {
    can: (d, p) => d.monsters(p, true).length >= 3 && d.monsters(p, true).every(m => m.d.type === 'Normal Monster' && lv(m) <= 2),
    async resolve(d, p) { for (const q of [0, 1]) for (const c of [...d.P(q).hand]) await d.sendToGrave(c, 'discard'); for (const c of d.allField().filter(x => !(isMon(x) && x.d.type === 'Normal Monster' && lv(x) <= 2))) await d.destroy(c, null); },
  });
  S('The Puppet Magic of Dark Ruler', {
    can: (d, p) => d.freeZone(p, 'mz') >= -1 && d.P(p).grave.some(c => isMon(c) && c.d.race === 'Fiend' && !!combo(d.monsters(p), lv(c))),
    async resolve(d, p) { const t = await pick(d, p, d.P(p).grave.filter(c => isMon(c) && c.d.race === 'Fiend' && !!combo(d.monsters(p), lv(c))), 'Çağrılacak Fiend', 'revive'); if (!t) return false; for (const m of combo(d.monsters(p), lv(t))) await d.banish(m); await d.specialSummon(p, t); },
  });
  function combo(ms, target) { let best = null; const rec = (i, sum, ch) => { if (sum === target) { if (!best || ch.length < best.length) best = [...ch]; return; } if (i >= ms.length || sum > target) return; ch.push(ms[i]); rec(i + 1, sum + lv(ms[i]), ch); ch.pop(); rec(i + 1, sum, ch); }; rec(0, 0, []); return best; }
  S('Tragedy', {
    trigger: 'pos', can: (d, p, c, ctx) => ctx.owner !== p && d.monsters(O(p)).some(m => m.pos === 'def'),
    async resolve(d, p) { for (const m of d.monsters(O(p)).filter(x => x.pos === 'def')) await d.destroy(m, null); },
  });
  S('Ultimate Offering', {
    sub: 'continuous', manual: true, aiOk: () => false, async resolve() {},
    stAb: [{ label: '500 LP öde: ek Normal Summon/Set hakkı', multi: true, can: (d, p) => d.P(p).lp > 500 && d.P(p).hand.some(isMon), async resolve(d, p) { await d.damage(p, 500); d.P(p).extraNS = (d.P(p).extraNS || 0) + 1; } }],
  });
  S('White Hole', { trigger: 'spell', can: (d, p, c, ctx) => ctx.activator !== p && ctx.spell.d.name === 'Dark Hole', async resolve(d, p) { d.flags.shield = { turn: d.turn, p, src: 'Dark Hole' }; } });
  S('Xing Zhen Hu', {
    sub: 'continuous', manual: true, aiOk: () => false, can: d => d.allField().filter(c => !c.up && isST(c)).length >= 1,
    async resolve(d, p, c) { const cs = d.allField().filter(x => !x.up && isST(x) && x !== c); const a = await pick(d, p, cs, 'Mühürlenecek kart (1/2)', 'harm'); const b = a && await pick(d, p, cs.filter(x => x !== a), 'Mühürlenecek kart (2/2)', 'harm'); c.sealed = [a, b].filter(Boolean).map(x => x.uid); },
  });
  return FX;
});
