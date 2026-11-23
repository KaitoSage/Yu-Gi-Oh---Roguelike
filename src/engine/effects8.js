// Kart efektleri — 8. paket: ek Büyüler, Ekipmanlar ve Tuzaklar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects7.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };
  const T = (name, def) => S(name, Object.assign({ manual: true }, def));
  const equipH = E.equipHelper;

  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }
  const isMon = c => c.d.kind === 'monster';
  const stZone = (d, p) => [d.P(p).field, ...d.P(p).st].filter(Boolean);
  const anyST = d => [0, 1].flatMap(i => stZone(d, i));
  const fieldMons = (d, up) => d.allField().filter(c => isMon(c) && (!up || c.up));
  const myUp = (d, p) => d.monsters(p, true);
  const graveMons = (d, p, f = () => true) => d.P(p).grave.filter(c => isMon(c) && f(c));
  const shuffleDeck = (d, p) => E.shuffle(d.P(p).deck, d.rng);
  const toHand = async (d, p, c) => { d.removeFromWherever(c); d.P(p).hand.push(c); await d.ev('search', { p, card: c }); };
  const flagFor = (d, key, p, v) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = v; };
  async function discardN(d, p, n, prompt, filter = () => true) {
    if (d.P(p).hand.filter(filter).length < n) return false;
    for (let i = 0; i < n; i++) { const c = await pick(d, p, d.P(p).hand.filter(filter), `${prompt} (${i + 1}/${n})`, 'discard'); if (!c) return false; await d.sendToGrave(c, 'discard'); }
    return true;
  }
  const later = (d, p, n, fn) => (d.pendingReturn = d.pendingReturn || []).push({ p, n, fn }); // p'nin n. Standby Phase'inde çalışır

  // ======================================================================== BÜYÜLER
  S('After the Struggle', {
    can: d => d.phase === 'main1' && fieldMons(d).some(c => c.battledTurn === d.turn),
    async resolve(d) { for (const c of fieldMons(d).filter(m => m.battledTurn === d.turn)) await d.destroy(c); },
  });
  S('Dragged Down into the Grave', {
    can: (d, p) => d.P(p).hand.length >= 2 && d.P(O(p)).hand.length > 0,
    async resolve(d, p) {
      const mine = await pick(d, O(p), d.P(p).hand, 'Dragged Down: rakip, senin elinden atılacak kartı seçiyor', 'discard');
      const theirs = await pick(d, p, d.P(O(p)).hand, 'Dragged Down: rakibin elinden atılacak kart', 'harm');
      if (mine) await d.sendToGrave(mine, 'discard');
      if (theirs) await d.sendToGrave(theirs, 'discard');
      await d.draw(p, 1);
    },
  });
  S('Dimensionhole', {
    can: (d, p) => myUp(d, p).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, myUp(d, p), 'Dimensionhole: sonraki Standby Phase\'ine kadar çıkarılacak canavar', 'help');
      if (!t) return false;
      await d.banish(t);
      later(d, p, 1, async () => { if (d.P(p).banished.includes(t) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, t); });
    },
  });
  S('Different Dimension Capsule', {
    can: (d, p) => d.P(p).deck.length > 0,
    async resolve(d, p, self) {
      const t = await pick(d, p, d.P(p).deck, 'Capsule: banish edilecek kart', 'help');
      if (!t) return false;
      await d.banish(t);
      later(d, p, 2, async () => { if (d.P(p).banished.includes(t)) await toHand(d, p, t); if (d.onField(self)) await d.destroy(self); });
    },
  });
  S('Jade Insect Whistle', {
    can: (d, p) => d.P(O(p)).deck.some(c => isMon(c) && c.d.race === 'Insect'),
    async resolve(d, p) {
      const t = await pick(d, O(p), d.P(O(p)).deck.filter(c => isMon(c) && c.d.race === 'Insect'), 'Jade Insect Whistle: destenin üstüne konacak Insect', 'help');
      if (!t) return false;
      d.removeFromWherever(t); shuffleDeck(d, O(p)); d.P(O(p)).deck.unshift(t);
    },
  });
  S('Miracle Dig', {
    can: (d, p) => d.P(p).banished.filter(isMon).length >= 5,
    async resolve(d, p) { for (let i = 0; i < 3; i++) { const t = await pick(d, p, d.P(p).banished.filter(isMon), `Mezarlığa dönecek canavar (${i + 1}/3)`, 'help'); if (!t) break; d.removeFromWherever(t); d.P(p).grave.push(t); } },
  });
  S('Mustering of the Dark Scorpions', {
    can: (d, p) => myUp(d, p).some(c => c.d.name === 'Don Zaloog') && d.P(p).hand.some(c => isMon(c) && /^Dark Scorpion/.test(c.d.name)) && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) {
      const seen = new Set();
      for (const c of d.P(p).hand.filter(x => isMon(x) && /^Dark Scorpion/.test(x.d.name))) { if (seen.has(c.d.name) || d.freeZone(p, 'mz') < 0) continue; seen.add(c.d.name); await d.specialSummon(p, c); }
    },
  });
  S('Ojama Delta Hurricane!!', {
    can: (d, p) => ['Ojama Green', 'Ojama Yellow', 'Ojama Black'].every(n => myUp(d, p).some(c => c.d.name === n)) && d.monsters(O(p)).length > 0,
    async resolve(d, p) { for (const m of d.monsters(O(p))) await d.destroy(m); },
  });
  S('Painful Choice', {
    can: (d, p) => d.P(p).deck.length >= 5,
    async resolve(d, p) {
      const chosen = [];
      for (let i = 0; i < 5; i++) { const c = await pick(d, p, d.P(p).deck.filter(x => !chosen.includes(x)), `Painful Choice: gösterilecek kart (${i + 1}/5)`, 'help'); if (!c) break; chosen.push(c); }
      if (!chosen.length) return false;
      const keep = await pick(d, O(p), chosen, 'Painful Choice: rakibin eline girecek kartı seç (diğerleri mezarlığa)', 'harm');
      for (const c of chosen) { if (c === keep) await toHand(d, p, c); else await d.sendToGrave(c, 'effect'); }
      shuffleDeck(d, p);
    },
  });
  S('Secret Pass to the Treasures', {
    can: (d, p) => myUp(d, p).some(c => (c.d.atk || 0) <= 1000 && d.atk(c) <= 1000),
    async resolve(d, p) { const t = await pick(d, p, myUp(d, p).filter(c => d.atk(c) <= 1000), 'Direkt saldırabilecek canavar', 'help'); if (!t) return false; t.directTurn = d.turn; },
  });
  S('Soul Reversal', {
    can: (d, p) => graveMons(d, p, c => FX[c.d.name] && FX[c.d.name].onFlip).length > 0,
    async resolve(d, p) { const t = await pick(d, p, graveMons(d, p, c => FX[c.d.name] && FX[c.d.name].onFlip), 'Destenin üstüne konacak Flip canavar', 'help'); if (!t) return false; d.removeFromWherever(t); d.P(p).deck.unshift(t); },
  });
  S('The Graveyard in the Fourth Dimension', {
    can: (d, p) => graveMons(d, p, c => / LV\d/.test(c.d.name)).length > 0,
    async resolve(d, p) { for (let i = 0; i < 2; i++) { const t = await pick(d, p, graveMons(d, p, c => / LV\d/.test(c.d.name)), 'Desteye dönecek LV canavar', 'help'); if (!t) break; d.removeFromWherever(t); d.P(p).deck.push(t); } shuffleDeck(d, p); },
  });
  S('Timidity', { async resolve(d) { d.flags.timidity = d.turn + 1; } });
  S('Triangle Ecstasy Spark', {
    can: d => fieldMons(d, true).some(c => c.d.name === 'Harpie Lady Sisters'),
    async resolve(d) { for (const c of fieldMons(d, true).filter(m => m.d.name === 'Harpie Lady Sisters')) d.addTemp(c, 2700 - d.atk(c), 0); },
  });
  S('Cold Wave', { can: d => d.phase === 'main1', async resolve(d, p) { flagFor(d, 'noSpell', p, d.turn + 1); flagFor(d, 'noSpell', O(p), d.turn + 1); } });
  S('Dark Designator', {
    can: (d, p) => d.P(O(p)).deck.some(isMon),
    async resolve(d, p) { const t = await pick(d, p, d.P(O(p)).deck.filter(isMon), 'Dark Designator: rakibin eline verilecek canavar', 'harm'); if (!t) return false; await toHand(d, O(p), t); shuffleDeck(d, O(p)); },
  });
  S('Diffusion Wave-Motion', {
    can: (d, p) => d.P(p).lp > 1000 && d.monsters(O(p)).length > 0 && myUp(d, p).some(c => c.d.race === 'Spellcaster' && (c.d.level || 0) >= 7),
    async resolve(d, p) { const t = await pick(d, p, myUp(d, p).filter(c => c.d.race === 'Spellcaster' && (c.d.level || 0) >= 7), 'Her canavara saldıracak Spellcaster', 'help'); if (!t) return false; await d.damage(p, 1000); t.attackAllTurn = d.turn; },
  });

  // Sürekli Büyüler
  S('D.D. Borderline', { sub: 'continuous', restrictAttack: (d, c, f) => (!d.P(f.owner).grave.some(g => g.d.kind === 'spell') ? 'D.D. Borderline: Battle Phase yapılamaz' : null) });
  S('Dark Snake Syndrome', { sub: 'continuous', async standby(d, p, x) { x.dss = (x.dss || 100) * 2; await d.damage(p, x.dss, x); await d.damage(O(p), x.dss, x); } });
  S('Recycle', {
    sub: 'continuous',
    async standby(d, p, x) {
      if (d.P(p).lp <= 300 || !d.P(p).grave.some(c => !isMon(c))) return;
      if (!(await d.ask(p, x, '300 LP öde: mezarlıktan bir Büyü/Tuzak destenin altına dönsün?'))) return;
      await d.damage(p, 300); const t = await pick(d, p, d.P(p).grave.filter(c => !isMon(c)), 'Destenin altına dönecek kart', 'help');
      if (t) { d.removeFromWherever(t); d.P(p).deck.push(t); }
    },
  });
  S('Mask of Dispel', {
    sub: 'continuous',
    can: d => anyST(d).some(c => c.d.kind === 'spell' && c.up),
    async resolve(d, p, self) { const t = await pick(d, p, anyST(d).filter(c => c.d.kind === 'spell' && c.up && c !== self), 'Mask of Dispel: hedef Büyü', 'harm'); if (!t) return false; self.maskTarget = t; },
    async standby(d, p, x) { const t = x.maskTarget; if (t && d.onField(t)) await d.damage(t.owner, 500, x); },
  });

  // Ekipmanlar
  const eqFx = (name, race, a, df, extra) => { if (!FX[name]) equipH(name, race, a, df, extra); };
  eqFx('Paralyzing Potion', null, 0, 0, { restrictAttack: (d, c, f) => (f.equipTo === c.uid && c.d.race !== 'Machine' ? 'Paralyzing Potion: saldıramaz' : null) });
  eqFx('Flint', null, -300, 0, {
    restrictAttack: (d, c, f) => (f.equipTo === c.uid ? 'Flint: saldıramaz' : null),
    restrictPos: (d, c, f) => (f.equipTo === c.uid ? 'Flint: pozisyon değiştiremez' : null),
  });
  eqFx('Mask of the Accursed', null, 0, 0, {
    restrictAttack: (d, c, f) => (f.equipTo === c.uid ? 'Mask of the Accursed: saldıramaz' : null),
    async standby(d, p, x) { const t = d.allField().find(m => m.uid === x.equipTo); if (t) await d.damage(t.owner, 500, x); },
  });
  eqFx('Fuhma Shuriken', c => /Ninja/.test(c.d.name), 700, 0, { async onLeaveField(d, p, c, why) { if (why !== 'equip-lost' || true) await d.damage(O(p), 700, c); } });
  eqFx('Dragonic Attack', 'Warrior', 500, 500);
  eqFx('Twin Swords of Flashing Light - Tryce', null, -500, 0, { givesDouble: true });
  eqFx('7 Completed', 'Machine', 700, 0);

  // ======================================================================== TUZAKLAR
  T('A Feint Plan', { async resolve(d) { d.flags.noFD = d.turn; } });
  S('Absolute End', { trigger: 'phase', can: (d, p, c, ctx) => ctx.phase === 'battle', async resolve(d, p) { flagFor(d, 'directAll', O(p), d.turn); } });
  T('Arsenal Robber', {
    can: (d, p) => d.P(O(p)).deck.some(c => FX[c.d.name] && FX[c.d.name].sub === 'equip'),
    async resolve(d, p) { const t = await pick(d, O(p), d.P(O(p)).deck.filter(c => FX[c.d.name] && FX[c.d.name].sub === 'equip'), 'Arsenal Robber: mezarlığa gönderilecek Equip Büyüsü', 'discard'); if (t) await d.sendToGrave(t, 'effect'); },
  });
  T('Blasting the Ruins', { can: (d, p) => d.P(p).grave.length >= 30, async resolve(d, p) { await d.damage(O(p), 3000); } });
  S('Drop Off', { trigger: 'draw', can: (d, p, c, ctx) => d.P(ctx.p).hand.includes(ctx.card), async resolve(d, p, c, ctx) { if (d.P(ctx.p).hand.includes(ctx.card)) await d.sendToGrave(ctx.card, 'discard'); } });
  T('Lightforce Sword', {
    can: (d, p) => d.P(O(p)).hand.length > 0,
    async resolve(d, p) {
      const H = d.P(O(p)).hand; const c = H[Math.floor(d.rng() * H.length)]; if (!c) return false;
      await d.banish(c);
      later(d, O(p), 4, async () => { if (d.P(O(p)).banished.includes(c)) await toHand(d, O(p), c); });
    },
  });
  T('Meteorain', { async resolve(d, p) { flagFor(d, 'pierceAll', p, d.turn); } });
  S('Michizure', { trigger: 'monGrave', can: d => fieldMons(d).length > 0, async resolve(d, p) { const t = await pick(d, p, fieldMons(d), 'Michizure: yok edilecek canavar', 'harm'); if (t) await d.destroy(t); } });
  S('Rope of Life', {
    trigger: 'monGrave', can: (d, p, c, ctx) => ctx.why === 'battle' && d.P(p).hand.length > 0 && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p, c, ctx) {
      for (const h of [...d.P(p).hand]) await d.sendToGrave(h, 'discard');
      if (d.P(p).grave.includes(ctx.card) && (await d.specialSummon(p, ctx.card))) ctx.card.bonus.atk += 800;
    },
  });
  T('Ojama Trio', {
    can: (d, p) => d.freeZone(O(p), 'mz') >= 0,
    async resolve(d, p) { for (let i = 0; i < 3; i++) { if (d.freeZone(O(p), 'mz') < 0) break; await E.makeToken(d, O(p), 'Ojama Token', 'def'); } },
  });
  T('Spell Purification', {
    can: (d, p) => d.P(p).hand.length >= 1 && anyST(d).some(c => c.up && c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub === 'continuous'),
    async resolve(d, p) { if (!(await discardN(d, p, 1, 'Spell Purification: at'))) return false; for (const c of anyST(d).filter(c => c.up && c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub === 'continuous')) await d.destroy(c); },
  });
  const cont = (name, def) => T(name, Object.assign({ sub: 'continuous', aiOk: () => true }, def));
  cont('Goblin Fan', { async onFlipSummon(d, p, x, c) { if ((c.d.level || 0) <= 2 && d.inMZ(c)) await d.destroy(c, x); } });
  cont("Graverobber's Retribution", { async standby(d, p, x) { await d.damage(O(p), 100 * graveMons(d, O(p)).length, x); } });
  cont('Infinite Dismissal', { async onAnySummon(d, p, x, c) { if ((c.d.level || 0) <= 3) (d.endQueue = d.endQueue || []).push(async () => { if (d.inMZ(c)) await d.destroy(c, x); }); } });
  cont('Royal Command', { negateFlip: true });
  cont('Bad Reaction to Simochi', { reverseHeal: true, aiOk: () => true });
  cont('Enervating Mist', { limitOppHand: true });
  cont('Wall of Revealing Light', {
    can: (d, p) => d.P(p).lp > 1000,
    async resolve(d, p, self) { const n = Math.min(3, Math.floor((d.P(p).lp - 1) / 1000)); if (n < 1) return false; await d.damage(p, n * 1000); self.wall = n * 1000; },
    restrictAttack: (d, c, f) => (c.owner !== f.owner && f.wall && d.atk(c) <= f.wall ? 'Wall of Revealing Light: saldıramaz' : null),
  });
});
