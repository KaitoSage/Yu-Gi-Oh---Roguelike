// Kart efektleri — 12. paket: Guardian seti, Necrovalley/Gravekeeper, Ritual canavarları, özel çağırmalı canavarlar, Büyü/Tuzak eklemeleri.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects11.js'); module.exports = factory(require('./engine.js')); }
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
  const isMon = c => c.d.kind === 'monster';
  const isST = c => c.d.kind !== 'monster';
  const mons = (d, p, up) => d.monsters(p, up);
  const fieldHas = (d, n) => d.allField().some(c => c.up && c.d.name === n);
  const ownHas = (d, p, n) => d.allField().some(c => c.up && c.owner === p && c.d.name === n);
  const pay = async (d, p, n) => { if (d.P(p).lp <= n) return false; await d.damage(p, n); return true; };
  const fromHandDeck = (d, p, name) => [...d.P(p).hand, ...d.P(p).deck].find(c => c.d.name === name);
  const shuffleDeck = (d, p) => E.shuffle(d.P(p).deck, d.rng);

  // ======================================================================== GUARDIAN SETİ
  const guard = (name, equip, extra) => S(name, Object.assign({ summonReq: (d, p) => (ownHas(d, p, equip) ? null : `"${equip}" kontrol etmelisin`) }, extra));
  guard('Guardian Baou', 'Wicked-Breaking Flamberge - Baou', { async onKill(d, p, c) { c.bonus.atk += 1000; } });
  guard('Guardian Ceal', 'Shooting Star Bow - Ceal');
  guard('Guardian Elma', 'Butterfly Dagger - Elma');
  guard('Guardian Grarl', 'Gravity Axe - Grarl');
  guard("Guardian Kay'est", "Rod of Silence - Kay'est", {
    immune: (d, c) => !!(d.src && d.src.kind === 'spell'),
    noAttackOn: (d, f, atk, def) => (def === f ? "Guardian Kay'est: saldırı hedefi olamaz" : null),
  });
  guard('Guardian Tryce', 'Twin Swords of Flashing Light - Tryce');

  // ======================================================================== NECROVALLEY / GRAVEKEEPER
  S('Necrovalley', { sub: 'field', async resolve() {}, mod: (c) => (c.d.kind === 'monster' && /^Gravekeeper's/.test(c.d.name) ? 500 : 0) });
  S("Gravekeeper's Chief", {
    async onSummon(d, p, c) {
      if (!c.tribSum) return;
      const t = await pick(d, p, d.P(p).grave.filter(x => isMon(x) && /^Gravekeeper's/.test(x.d.name)), "Mezarlıktan çağırılacak Gravekeeper's", 'revive');
      if (t && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, t);
    },
  });
  S('Rite of Spirit', { manual: true, can: (d, p) => d.freeZone(p, 'mz') >= 0 && d.P(p).grave.some(c => isMon(c) && /^Gravekeeper's/.test(c.d.name)), async resolve(d, p) { const t = await pick(d, p, d.P(p).grave.filter(c => isMon(c) && /^Gravekeeper's/.test(c.d.name)), 'Çağırılacak canavar', 'revive'); if (t) await d.specialSummon(p, t); } });

  // ======================================================================== SAHA KALKANLARI / SÜREKLİ
  S('The Sanctuary in the Sky', {
    sub: 'field', async resolve() {},
    shieldAny: (d, p, n, src) => (d.battle && [d.battle.a, d.battle.d].some(m => m && m.owner === p && m.d.race === 'Fairy') ? 0 : n),
  });
  S('Skill Drain', { sub: 'continuous', aiOk: () => true, can: (d, p) => d.P(p).lp > 1000, async resolve(d, p) { await pay(d, p, 1000); }, skillDrain: true });
  S('Gora Turtle', { restrictAttack: (d, c) => (d.atk(c) >= 1900 ? 'Gora Turtle: 1900+ ATK saldıramaz' : null) });
  S('Bottomless Shifting Sand', {
    sub: 'continuous', aiOk: () => true,
    async endPhaseAny(d, p, x) { if (p === x.owner) return; const up = d.allField().filter(c => isMon(c) && c.up); if (!up.length) return; const mx = Math.max(...up.map(c => d.atk(c))); for (const m of up.filter(c => d.atk(c) === mx)) await d.destroy(m, x); },
    async standby(d, p, x) { if (d.P(p).hand.length <= 4) await d.destroy(x, x); },
  });
  S('Forced Requisition', { sub: 'continuous', aiOk: () => true, async onDiscard(d, p, x, c) { if (c.origOwner === p && d.P(O(p)).hand.length) { const t = await pick(d, O(p), d.P(O(p)).hand, 'Forced Requisition: at', 'discard'); if (t) await d.sendToGrave(t, 'cost'); } } });
  S('Second Coin Toss', { sub: 'continuous', redoToss: true, aiOk: () => false });
  S('Dice Re-Roll', { manual: true, async resolve(d) { d.flags.dieReroll = d.turn; } });
  eqFx('Raregold Armor', null, 0, 0, { noAttackOn: (d, f, atk, def) => (def.owner === f.owner && f.equipTo != null && def.uid !== f.equipTo && d.allField().some(m => m.uid === f.equipTo) ? 'Raregold Armor: yalnızca donatılmış canavara saldırılabilir' : null) });
  eqFx('Cyclon Laser', c => c.d.name === 'Gradius', 300, 0);

  // ======================================================================== TUZAK / BÜYÜ
  S('Amazoness Archers', { trigger: 'attack', can: (d, p, c, ctx) => mons(d, p, true).some(m => /Amazoness/.test(m.d.name)) && mons(d, O(p)).some(m => m.pos === 'def'), async resolve(d, p) { for (const m of mons(d, O(p), true).filter(x => x.pos === 'def')) { m.pos = 'atk'; await d.ev('pos', { p: O(p), card: m }); } } });
  S('Amazoness Spellcaster', {
    can: (d, p) => mons(d, p, true).some(m => /Amazoness/.test(m.d.name)) && mons(d, O(p), true).length > 0,
    async resolve(d, p) {
      const a = await pick(d, p, mons(d, p, true).filter(m => /Amazoness/.test(m.d.name)), 'Amazoness canavarı', 'help'); const b = await pick(d, p, mons(d, O(p), true), 'Rakibin canavarı', 'harm');
      if (!a || !b) return false; const x = a.d.atk, y = b.d.atk; d.addTemp(a, y - x, 0); d.addTemp(b, x - y, 0);
    },
  });
  S('Ninjitsu Art of Transformation', {
    manual: true, can: (d, p) => mons(d, p, true).some(m => /Ninja/.test(m.d.name)) && d.freeZone(p, 'mz') >= -1,
    async resolve(d, p) {
      const t = await pick(d, p, mons(d, p, true).filter(m => /Ninja/.test(m.d.name)), 'Tribute edilecek Ninja', 'tribute'); if (!t) return false;
      const lv = t.d.level || 0; await d.sendToGrave(t, 'tribute');
      const cs = [...d.P(p).hand, ...d.P(p).deck].filter(c => isMon(c) && ['Beast', 'Winged Beast', 'Insect'].includes(c.d.race) && (c.d.level || 0) <= lv && !(FX[c.d.name] && (FX[c.d.name].handSummon || FX[c.d.name].summonReq)));
      const m = await pick(d, p, cs, 'Çağırılacak canavar', 'revive'); if (m) await d.specialSummon(p, m); shuffleDeck(d, p);
    },
  });
  S('Reasoning', {
    async resolve(d, p) {
      const lv = +(await d.choose(O(p), 'Reasoning: bir Level bildir (1-12)', Array.from({ length: 12 }, (_, i) => String(i + 1))));
      const ex = []; let hit = null;
      while (d.P(p).deck.length) { const c = d.P(p).deck.shift(); if (isMon(c) && !(FX[c.d.name] && (FX[c.d.name].handSummon || FX[c.d.name].summonReq)) && c.d.type !== 'Fusion Monster') { hit = c; break; } ex.push(c); }
      for (const c of ex) { d.P(p).grave.push(c); c.graveInfo = { turn: d.turn, why: 'mill', from: 'deck' }; }
      if (!hit) return;
      if ((hit.d.level || 0) === lv || d.freeZone(p, 'mz') < 0) { d.P(p).grave.push(hit); hit.graveInfo = { turn: d.turn, why: 'mill', from: 'deck' }; } else await d.specialSummon(p, hit);
    },
  });
  S('Reversal Quiz', {
    can: d => d.P(0).deck.length > 0 || d.P(1).deck.length > 0,
    async resolve(d, p, self) {
      for (const c of [...d.P(p).hand].filter(x => x !== self)) await d.sendToGrave(c, 'discard');
      for (const c of d.allField().filter(x => x.owner === p && x !== self)) await d.sendToGrave(c, 'destroy');
      if (!d.P(p).deck.length) return;
      const t = d.P(p).deck[0]; const k = t.d.kind === 'monster' ? 'Canavar' : t.d.kind === 'spell' ? 'Büyü' : 'Tuzak';
      const g = await d.choose(p, 'Destenin üstündeki kartın türünü tahmin et', ['Canavar', 'Büyü', 'Tuzak']);
      if (g === k) { const a = d.P(p).lp; d.P(p).lp = d.P(O(p)).lp; d.P(O(p)).lp = a; await d.ev('heal', { p, amount: 0 }); await d.checkWin(); }
    },
  });

  // ======================================================================== CANAVARLAR
  S('Invitation to a Dark Sleep', {
    async onSummon(d, p, c) { if (c.special) return; const t = await pick(d, p, mons(d, O(p), true), 'Saldıramayacak canavar', 'harm'); if (t) c.lock = t.uid; },
    restrictAttack: (d, m, f) => (f.lock === m.uid ? 'Invitation to a Dark Sleep: saldıramaz' : null),
  });
  S('Shadow Tamer', { async onFlip(d, p, c) { const t = await pick(d, p, mons(d, O(p), true).filter(m => m.d.race === 'Fiend'), 'Kontrol alınacak Fiend', 'harm'); if (t) await d.takeControl(t, p, true); } });
  S('Maiden of the Aqua', { isUmi: true });
  const tri3 = (race, atkDouble) => ({ handSummon: { tributes: 3, can: () => null, cost: async (d, p, c, tr) => tr.length === 3 && tr.every(t => t.d.race === race) }, dmgMult: (d, c, direct) => (direct ? 2 : 1) });
  S('Meteo the Matchless', tri3('Beast-Warrior'));
  S('Ulevo', tri3('Winged Beast'));
  S('Sorcerer of Dark Magic', { handSummon: { tributes: 2, can: () => null, cost: async (d, p, c, tr) => tr.length === 2 && tr.every(t => t.d.race === 'Spellcaster' && (t.d.level || 0) >= 6) } });
  S('Paladin of White Dragon', {
    killsFacedown: true,
    ability: {
      label: 'Kendini tribute et: Blue-Eyes White Dragon çağır', can: (d, p, c) => !!fromHandDeck(d, p, 'Blue-Eyes White Dragon'),
      async resolve(d, p, c) { const b = fromHandDeck(d, p, 'Blue-Eyes White Dragon'); if (!b) return false; await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, b); shuffleDeck(d, p); },
      ai: (d, p) => !!fromHandDeck(d, p, 'Blue-Eyes White Dragon'),
    },
  });
  S('Shinato, King of a Higher Plane', { async onKill(d, p, c, v) { await d.damage(O(p), v.d.atk || 0, c); } });
  S('Orca Mega-Fortress of Darkness', {
    ability: {
      label: 'Torpedo Fish / Cannonball Spear Shellfish tribute et', can: (d, p, c) => mons(d, p, true).some(m => m.d.name === 'Torpedo Fish' || m.d.name === 'Cannonball Spear Shellfish'),
      async resolve(d, p, c) {
        const fish = mons(d, p, true).find(m => m.d.name === 'Torpedo Fish'), shell = mons(d, p, true).find(m => m.d.name === 'Cannonball Spear Shellfish');
        let o = fish && shell ? await d.choose(p, 'Orca Mega-Fortress', ['Torpedo Fish: canavar yok et', 'Cannonball Spear Shellfish: Büyü/Tuzak yok et']) : fish ? 'Torpedo Fish' : 'Cannonball';
        if (o.startsWith('Torpedo')) { const t = await pick(d, p, d.allField().filter(x => isMon(x) && x !== c && x !== fish), 'Yok edilecek canavar', 'harm'); if (!t) return false; await d.sendToGrave(fish, 'tribute'); await d.destroy(t, c); }
        else { const t = await pick(d, p, d.allField().filter(isST), 'Yok edilecek Büyü/Tuzak', 'harm'); if (!t) return false; await d.sendToGrave(shell, 'tribute'); await d.destroy(t, c); }
      },
      ai: (d, p) => d.allField().some(x => x.owner === O(p)),
    },
  });
  S('Ultimate Obedient Fiend', { canAttack: (d, p, c) => (d.allField().filter(x => x.owner === p).length > 1 || d.P(p).hand.length > 0 ? 'Ultimate Obedient Fiend: tek kartın ve elin boşken saldırabilir' : null) });
  S('The Agent of Creation - Venus', {
    ability: { label: '500 LP öde: Mystical Shine Ball çağır', can: (d, p) => d.P(p).lp > 500 && d.freeZone(p, 'mz') >= 0 && !!fromHandDeck(d, p, 'Mystical Shine Ball'),
      async resolve(d, p) { const b = fromHandDeck(d, p, 'Mystical Shine Ball'); if (!b || !(await pay(d, p, 500))) return false; await d.specialSummon(p, b); shuffleDeck(d, p); }, ai: () => true },
  });
  S('The Agent of Force - Mars', {
    immune: (d, c) => !!(d.src && d.src.kind === 'spell'),
    selfMod: (c, key, d) => (fieldHas(d, 'The Sanctuary in the Sky') && d.P(c.owner).lp > d.P(O(c.owner)).lp ? d.P(c.owner).lp - d.P(O(c.owner)).lp : 0),
  });
  S('The Agent of Judgment - Saturn', {
    ability: { label: 'Tribute et: LP farkı kadar hasar', can: (d, p) => d.P(p).lp > d.P(O(p)).lp, async resolve(d, p, c) { const n = d.P(p).lp - d.P(O(p)).lp; await d.sendToGrave(c, 'tribute'); if (!fieldHas(d, 'The Sanctuary in the Sky')) await d.damage(p, 0); await d.damage(O(p), n, c); }, ai: (d, p) => d.P(p).lp - d.P(O(p)).lp >= d.P(O(p)).lp },
  });
  S('Exodia Necross', { summonReq: () => 'Contract with Exodia ile çağrılır', immune: (d, c, kind) => kind === 'destroy', noBattleDestroy: true });
  const EXO = ['Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One'];
  S('Contract with Exodia', { can: (d, p) => EXO.every(n => d.P(p).grave.some(c => c.d.name === n)) && d.freeZone(p, 'mz') >= 0 && !!fromHandDeck(d, p, 'Exodia Necross'), async resolve(d, p) { const x = fromHandDeck(d, p, 'Exodia Necross'); if (!x) return false; await d.specialSummon(p, x); shuffleDeck(d, p); } });
  S('Berserk Dragon', { summonReq: () => 'A Deal with Dark Ruler ile çağrılır', attackAll: true });
  S('A Deal with Dark Ruler', { can: (d, p) => d.freeZone(p, 'mz') >= 0 && !!fromHandDeck(d, p, 'Berserk Dragon') && d.P(p).grave.some(c => isMon(c) && (c.d.level || 0) >= 8 && c.graveInfo && c.graveInfo.turn === d.turn), async resolve(d, p) { const x = fromHandDeck(d, p, 'Berserk Dragon'); if (!x) return false; await d.specialSummon(p, x); shuffleDeck(d, p); } });
});
