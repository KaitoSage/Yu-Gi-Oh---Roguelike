// Kart efektleri — 10. paket: ek Büyü/Tuzak/Canavarlar (Fusion yedekleri, Level Up!, kapalı/savunma avcıları, savaş sonrası efektleri).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects9.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };
  const equipH = E.equipHelper;

  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }
  const isMon = c => c.d.kind === 'monster';
  const fieldMons = (d, up) => d.allField().filter(c => isMon(c) && (!up || c.up));
  const myUp = (d, p) => d.monsters(p, true);
  const graveMons = (d, p, f = () => true) => d.P(p).grave.filter(c => isMon(c) && f(c));
  const shuffleDeck = (d, p) => E.shuffle(d.P(p).deck, d.rng);
  const flagFor = (d, key, p, v) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = v; };
  const lvOf = n => { const m = / LV(\d+)$/.exec(n); return m ? { base: n.replace(/ LV\d+$/, ''), lv: +m[1] } : null; };

  // ======================================================================== BÜYÜLER
  S('Ante', {
    can: (d, p) => d.P(p).hand.length >= 2 && d.P(O(p)).hand.length >= 1,
    async resolve(d, p, self) {
      const a = await pick(d, p, d.P(p).hand.filter(c => c !== self), 'Ante: göstereceğin kart', 'help');
      const b = await pick(d, O(p), d.P(O(p)).hand, 'Ante: göstereceğin kart', 'help');
      if (!a || !b) return false;
      const la = isMon(a) ? (a.d.level || 0) : 0, lb = isMon(b) ? (b.d.level || 0) : 0;
      if (la === lb) return;
      const [low, owner] = la < lb ? [a, p] : [b, O(p)];
      await d.sendToGrave(low, 'discard'); await d.damage(owner, 1000);
    },
  });
  S('Level Up!', {
    can: (d, p) => myUp(d, p).some(c => lvOf(c.d.name) && [...d.P(p).hand, ...d.P(p).deck].some(x => { const a = lvOf(x.d.name), b = lvOf(c.d.name); return a && a.base === b.base && a.lv > b.lv; })) && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) {
      const t = await pick(d, p, myUp(d, p).filter(c => lvOf(c.d.name)), 'Level Up!: gönderilecek LV canavar', 'tribute');
      if (!t) return false;
      const b = lvOf(t.d.name);
      const nx = [...d.P(p).hand, ...d.P(p).deck].filter(x => { const a = lvOf(x.d.name); return a && a.base === b.base && a.lv > b.lv; }).sort((x, y) => lvOf(x.d.name).lv - lvOf(y.d.name).lv)[0];
      if (!nx) return false;
      await d.sendToGrave(t, 'tribute'); await d.specialSummon(p, nx); shuffleDeck(d, p);
    },
  });
  const eqFx = (name, race, a, df, extra) => { if (!FX[name]) equipH(name, race, a, df, extra); };
  eqFx('Ring of Magnetism', null, -500, -500);
  eqFx('Germ Infection', c => c.d.race !== 'Machine', 0, 0, { async standby(d, p, x) { const t = d.allField().find(m => m.uid === x.equipTo); if (t) t.bonus.atk -= 300; } });
  eqFx('Wicked-Breaking Flamberge - Baou', null, 500, 0);

  // ======================================================================== TUZAKLAR
  S('Frozen Soul', { manual: true, can: (d, p) => d.P(p).lp <= d.P(O(p)).lp - 2000, async resolve(d, p) { flagFor(d, 'skipBattle', O(p), true); } });
  eqFx('Metalmorph', null, 300, 300, { manual: true });
  eqFx('Blast with Chain', null, 500, 0, { manual: true });

  // ======================================================================== FUSION YEDEKLERİ
  for (const n of ['Beastking of the Swamps', 'Mystical Sheep #1', 'Goddess with the Third Eye', 'King of the Swamp', 'Versago the Destroyer']) S(n, { substitute: true });

  // ======================================================================== KAPALI / SAVUNMA AVCILARI
  S('Sasuke Samurai', { killsFacedown: true });
  for (const n of ['Mystic Swordsman LV2', 'Mystic Swordsman LV4', 'Mystic Swordsman LV6']) S(n, { killsFacedown: true });
  S('Ninja Grandmaster Sasuke', { killsDefMin: 0 });
  S('Disc Fighter', { killsDefMin: 2000 });

  // ======================================================================== DİĞER CANAVARLAR
  S('Stealth Bird', {
    ability: { label: 'Kapalı savunmaya geç', can: (d, p, c) => c.up && c.pos !== undefined, async resolve(d, p, c) { c.up = false; c.pos = 'def'; await d.ev('pos', { p, card: c }); } },
    async onFlip(d, p) { await d.damage(O(p), 1000); },
  });
  S('Guardian Sphinx', {
    ability: { label: 'Kapalı savunmaya geç', can: (d, p, c) => c.up, async resolve(d, p, c) { c.up = false; c.pos = 'def'; await d.ev('pos', { p, card: c }); } },
    async onFlip(d, p) { for (const m of d.monsters(O(p))) await d.bounce(m); },
  });
  S('Ghost Knight of Jackal', {
    async onKill(d, p, c, v) { if (d.P(v.owner).grave.includes(v) && d.freeZone(p, 'mz') >= 0 && (await d.ask(p, c, 'Yok ettiğin canavar savunmada senin tarafında çağırılsın mı?'))) await d.specialSummon(p, v, { pos: 'def' }); },
  });
  S('Jirai Gumo', {
    async attackCost(d, p) { if ((await d.toss(p))[0]) await d.damage(p, Math.floor(d.P(p).lp / 2)); return true; },
  });
  S('Nightmare Penguin', {
    selfMod: (c, key) => (key === 'atk' ? 200 : 0),
    mod: (m, key, d, f) => (key === 'atk' && m.owner === f.owner && m.d.attr === 'WATER' ? 200 : 0),
  });
  S('Familiar Knight', {
    async onGrave(d, p, c, why) {
      if (why !== 'battle') return;
      for (const q of [p, O(p)]) {
        if (d.freeZone(q, 'mz') < 0) continue;
        const cs = d.P(q).hand.filter(x => isMon(x) && x.d.level === 4 && !(FX[x.d.name] && FX[x.d.name].handSummon));
        const t = cs.length ? await pick(d, q, cs, 'Familiar Knight: elinden Level 4 canavar çağır', 'revive') : null;
        if (t) await d.specialSummon(q, t);
      }
    },
  });
  S('Abyss Soldier', {
    ability: {
      label: '1 WATER canavar at: sahadaki 1 kartı ele döndür', can: (d, p) => d.P(p).hand.some(c => isMon(c) && c.d.attr === 'WATER') && d.allField().length > 1,
      async resolve(d, p, c) {
        const h = await pick(d, p, d.P(p).hand.filter(x => isMon(x) && x.d.attr === 'WATER'), 'At: WATER canavar', 'discard'); if (!h) return false;
        await d.sendToGrave(h, 'discard');
        const t = await pick(d, p, d.allField().filter(x => x !== c), 'Ele dönecek kart', 'harm'); if (t) await d.bounce(t);
      },
      ai: (d, p) => d.P(p).hand.filter(x => isMon(x) && x.d.attr === 'WATER').length > 0 && d.monsters(O(p)).length > 0,
    },
  });
  S('Atomic Firefly', { async onGrave(d, p, c, why) { if (why === 'battle' && c.killedBy) await d.damage(c.killedBy.owner, 1000, c); } });
  const lvDmg = async (d, p, c, v) => { await d.damage(O(p), (v.d.level || 0) * 500, c); };
  S('Needle Burrower', { onKill: lvDmg });
  S('KA-2 Des Scissors', { onKill: lvDmg });
  S('Emes the Infinity', { async onKill(d, p, c) { c.bonus.atk += 700; } });
  S('Vampire Baby', {
    async onKill(d, p, c, v) { c.vbTurn = d.turn; c.vbVictim = v; },
    async endPhase(d, p, c) { const v = c.vbVictim; if (c.vbTurn === d.turn && v && v.d.type !== 'Token' && d.freeZone(p, 'mz') >= 0 && d.P(v.owner).grave.includes(v) && (await d.ask(p, c, 'Yok ettiğin canavar senin tarafında çağırılsın mı?'))) await d.specialSummon(p, v); },
  });
  S('Winged Sage Falcos', {
    async onKill(d, p, c, v) { if (d.P(v.owner).grave.includes(v) && v.graveInfo && (await d.ask(p, c, 'Yok ettiğin canavar rakibin destesinin üstüne konsun mu?'))) { d.removeFromWherever(v); d.P(v.owner).deck.unshift(v); } },
  });
  S('Hyper Hammerhead', { async afterBattle(d, p, c, o) { if (d.inMZ(o)) await d.bounce(o); } });
  S('Keldo', {
    async onGrave(d, p, c, why) {
      if (why !== 'battle') return;
      for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.P(O(p)).grave, `Keldo: rakibin destesine dönecek kart (${i + 1}/2)`, 'harm'); if (!t) break; d.removeFromWherever(t); d.P(O(p)).deck.push(t); }
      shuffleDeck(d, O(p));
    },
  });
  S('Pixie Knight', {
    async onGrave(d, p, c, why) {
      if (why !== 'battle') return;
      const spells = d.P(p).grave.filter(x => x.d.kind === 'spell'); if (!spells.length) return;
      const t = await pick(d, O(p), spells, 'Pixie Knight: rakibin mezarlığından destesinin üstüne konacak Büyü', 'harm');
      if (t) { d.removeFromWherever(t); d.P(p).deck.unshift(t); }
    },
  });
  S('Sasuke Samurai #3', { async onBattleDamage(d, p, c, amt, victim) { if (victim !== p) { const q = victim; for (let i = 0; i < 7 && d.P(q).hand.length < 7 && d.P(q).deck.length; i++) await d.draw(q, 1); } } });
});
