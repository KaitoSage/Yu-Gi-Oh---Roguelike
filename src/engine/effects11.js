// Kart efektleri — 11. paket: efektsiz kalan kartların büyük bölümü (Umi, bildirimli seçimler, Dark Scorpion, Gravekeeper, Amazoness, zar/yazı-tura vb.)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects10.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };
  const equipH = E.equipHelper;
  const eqFx = (name, race, a, df, extra) => { if (!FX[name]) equipH(name, race, a, df, extra); };
  const shuffle = (arr, rng) => E.shuffle(arr, rng);

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
  const fieldST = d => d.allField().filter(c => isST(c));
  const umi = d => d.allField().some(c => c.up && (c.d.name === 'Umi' || c.d.name === 'Maiden of the Aqua'));
  const fieldHas = (d, n) => d.allField().some(c => c.up && c.d.name === n);
  const flagFor = (d, key, p, v) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = v; };
  const TYPES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic'];
  const ATTRS = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND'];
  const CTYPES = ['Canavar', 'Büyü', 'Tuzak'];
  const kindOf = c => (c.d.kind === 'monster' ? 'Canavar' : c.d.kind === 'spell' ? 'Büyü' : 'Tuzak');
  const pay = async (d, p, n) => { if (d.P(p).lp <= n) return false; await d.damage(p, n); return true; };

  async function mill(d, q, n) {
    for (let i = 0; i < n && d.P(q).deck.length; i++) {
      const c = d.P(q).deck.shift(); d.P(q).grave.push(c); c.graveInfo = { turn: d.turn, why: 'mill', from: 'deck' };
      await d.ev('toGrave', { card: c, from: 'deck', why: 'mill' });
    }
  }
  async function discardRandom(d, q, n = 1) {
    for (let i = 0; i < n && d.P(q).hand.length; i++) { const H = d.P(q).hand; await d.sendToGrave(H[Math.floor(d.rng() * H.length)], 'discard'); }
  }
  // Destenin üstündeki n kartı göster; sıralama istenirse oyuncu sırayla seçer (owner'ın destesi)
  async function arrange(d, p, owner, n, reorder = true) {
    const deck = d.P(owner).deck; let cs = deck.splice(0, n); const order = [];
    while (cs.length > 1) {
      const c = await d.ctl[p].pick(d, p, cs.map(card => ({ card })), reorder ? 'Sıradaki kart (en üstten başla)' : 'Destenin üst kartları', 'help');
      const x = reorder && c ? c : cs[0]; order.push(x); cs = cs.filter(y => y !== x);
    }
    order.push(...cs); deck.unshift(...order);
  }
  const faceDownSwitch = {
    label: 'Kapalı savunmaya geç', can: (d, p, c) => c.up,
    async resolve(d, p, c) { c.up = false; c.pos = 'def'; await d.ev('pos', { p, card: c }); },
  };

  // ======================================================================== UMI BAĞIMLILARI
  const umiImmune = { immune: (d, c) => umi(d) && !!(d.src && d.src.kind === 'spell') };
  for (const n of ['Cannonball Spear Shellfish', 'Deepsea Warrior', 'Torpedo Fish']) S(n, Object.assign({}, umiImmune));
  S('The Legendary Fisherman', Object.assign({
    noAttackOn: (d, f, atk, def) => (def === f && umi(d) ? 'The Legendary Fisherman: saldırı hedefi olamaz' : null),
  }, umiImmune));
  S('Amphibious Bugroth MK-3', { direct: d => umi(d) });
  S('Levia-Dragon - Daedalus', {
    ability: {
      label: 'Umi\'yi gönder: sahadaki diğer her kartı yok et', can: (d, p) => d.allField().some(c => c.owner === p && c.d.name === 'Umi'),
      async resolve(d, p, c) { const u = d.allField().find(x => x.owner === p && x.d.name === 'Umi'); if (!u) return false; await d.sendToGrave(u, 'cost'); for (const x of d.allField().filter(y => y !== c)) await d.destroy(x, c); },
      ai: (d, p) => mons(d, O(p)).length >= 2 && mons(d, p).length <= 1,
    },
  });
  S('Tornado Wall', {
    sub: 'continuous', can: d => umi(d),
    shield: (d, p, n, src) => (umi(d) && d.battle && src && src.d && src.d.kind === 'monster' ? 0 : n),
    async endPhaseAny(d, p, x) { if (!umi(d)) await d.destroy(x); },
  });

  // ======================================================================== ZAR / YAZI-TURA
  S('Dice Jar', {
    async onFlip(d, p) {
      const a = (await d.roll(p))[0], b = (await d.roll(O(p)))[0];
      if (a === b) return;
      const [lo, hi, w] = a < b ? [p, O(p), b] : [O(p), p, a];
      await d.damage(lo, w === 6 ? 6000 : w * 500);
    },
  });
  S('Agido', {
    async onGrave(d, p, c, why) {
      if (why !== 'battle') return;
      const r = (await d.roll(p))[0];
      const t = d.P(p).grave.filter(x => isMon(x) && x.d.race === 'Fairy' && x.d.level === r && x !== c);
      if (t.length && d.freeZone(p, 'mz') >= 0 && (await d.ask(p, c, `Zar ${r}: Mezarlığından Level ${r} Fairy çağırılsın mı?`))) { const m = await pick(d, p, t, 'Çağırılacak Fairy', 'revive'); if (m) await d.specialSummon(p, m); }
    },
  });
  async function callCoin(d, p, card, title) { const guess = await d.choose(p, title, ['Yazı', 'Tura']); const r = (await d.toss(p))[0]; return (r ? 'Yazı' : 'Tura') === guess; }
  S('Kryuel', { async onGrave(d, p, c, why) { if (why === 'battle' && mons(d, O(p)).length && (await callCoin(d, p, c, 'Kryuel: Yazı mı Tura mı?'))) { const t = await pick(d, p, mons(d, O(p)), 'Yok edilecek canavar', 'harm'); if (t) await d.destroy(t, c); } } });
  S('Sasuke Samurai #4', {
    async battleBoost(d, p, c, o) { if (o && o.up !== undefined && (await callCoin(d, p, c, 'Sasuke Samurai #4: Yazı mı Tura mı?'))) await d.destroy(o, c); },
  });
  S('Fairy Box', {
    trigger: 'attack', can: (d, p, c, ctx) => !!ctx.attacker, aiOk: () => true,
    async resolve(d, p, c, ctx) { if (await callCoin(d, p, c, 'Fairy Box: Yazı mı Tura mı?')) d.addTemp(ctx.attacker, -d.atk(ctx.attacker), 0); },
  });
  S('Fiend Comedian', {
    manual: true, aiOk: () => true,
    async resolve(d, p, c) {
      if (await callCoin(d, p, c, 'Fiend Comedian: Yazı mı Tura mı?')) { for (const x of [...d.P(O(p)).grave]) await d.banish(x); }
      else await mill(d, p, d.P(O(p)).grave.length);
    },
  });
  S('Gamble', {
    manual: true, can: (d, p) => d.P(O(p)).hand.length >= 6 && d.P(p).hand.length <= 2,
    async resolve(d, p, c) {
      if (await callCoin(d, p, c, 'Gamble: Yazı mı Tura mı?')) { const n = 5 - d.P(p).hand.length; if (n > 0) await d.draw(p, n); }
      else d.flags.skipDraw[p] = (d.flags.skipDraw[p] || 0) + 1;
    },
  });
  S('Needle Wall', {
    sub: 'continuous', aiOk: () => true,
    async standby(d, p) {
      const r = (await d.roll(p))[0]; if (r > 5) return;
      const m = d.P(O(p)).mz[r - 1]; if (m) await d.destroy(m);
    },
  });
  S('Blind Destruction', {
    sub: 'continuous', aiOk: () => true,
    async standby(d, p, x) {
      const r = (await d.roll(p))[0];
      for (const m of d.allField().filter(c => isMon(c) && c.up)) if (r === 6 ? (m.d.level || 0) >= 6 : (m.d.level || 0) === r) await d.destroy(m, x);
    },
  });
  S('Dark Master - Zorc', {
    ability: {
      label: 'Zar at: 1-2 rakibin tüm canavarları / 3-5 1 canavar / 6 kendi canavarların', can: () => true,
      async resolve(d, p, c) {
        const r = (await d.roll(p))[0];
        if (r <= 2) for (const m of [...mons(d, O(p))]) await d.destroy(m, c);
        else if (r <= 5) { const t = await pick(d, p, mons(d, O(p)), 'Yok edilecek canavar', 'harm'); if (t) await d.destroy(t, c); }
        else for (const m of [...mons(d, p)].filter(x => x !== c)) await d.destroy(m, c);
      },
      ai: (d, p) => mons(d, O(p)).length > 0,
    },
  });

  // ======================================================================== BİLDİRİMLİ SEÇİMLER
  S('Abyssal Designator', {
    can: (d, p) => d.P(p).lp > 1000,
    async resolve(d, p, self) {
      if (!(await pay(d, p, 1000))) return false;
      const t = await d.choose(p, 'Bir Tür bildir', TYPES), a = await d.choose(p, 'Bir Özellik bildir', ATTRS);
      const q = O(p), ok = c => isMon(c) && c.d.race === t && c.d.attr === a;
      const cs = [...d.P(q).hand, ...d.P(q).deck].filter(ok); if (!cs.length) return;
      const m = await pick(d, q, cs, 'Mezarlığa gönderilecek canavar', 'discard'); if (m) await d.sendToGrave(m, 'discard');
    },
  });
  S('Array of Revealing Light', {
    sub: 'continuous', async resolve(d, p, self) { self.decl = await d.choose(p, 'Bir Canavar Türü bildir', TYPES); },
    restrictAttack: (d, c, f) => (f.decl && c.d.race === f.decl && c.placedTurn === d.turn ? 'Array of Revealing Light: çağrıldığı turda saldıramaz' : null),
  });
  S('The Regulation of Tribe', {
    sub: 'continuous', async resolve(d, p, self) { self.decl = await d.choose(p, 'Bir Canavar Türü bildir', TYPES); },
    restrictAttack: (d, c, f) => (f.decl && c.d.race === f.decl ? 'The Regulation of Tribe: saldıramaz' : null),
    async standby(d, p, x) { const t = await pick(d, p, mons(d, p), 'The Regulation of Tribe: Tribute', 'tribute'); if (t) await d.sendToGrave(t, 'tribute'); else await d.destroy(x); },
  });
  S('Earthshaker', {
    manual: true, can: d => d.allField().some(c => isMon(c) && c.up),
    async resolve(d, p, self) {
      const a = await d.choose(p, 'Earthshaker: 1. Özellik', ATTRS), b = await d.choose(p, 'Earthshaker: 2. Özellik', ATTRS.filter(x => x !== a));
      const pickA = await d.choose(O(p), 'Hangi Özellik yok edilsin?', [a, b]);
      for (const m of d.allField().filter(c => isMon(c) && c.up && c.d.attr === pickA)) await d.destroy(m, self);
    },
  });
  S('Fuh-Rin-Ka-Zan', {
    manual: true, can: d => ['WIND', 'WATER', 'FIRE', 'EARTH'].every(a => d.allField().some(c => isMon(c) && c.up && c.d.attr === a)),
    async resolve(d, p, self) {
      const o = await d.choose(p, 'Fuh-Rin-Ka-Zan', ['Rakibin tüm canavarlarını yok et', 'Rakibin tüm Büyü/Tuzaklarını yok et', 'Rakibin elini ve mezarlığını boşalt']);
      if (o.startsWith('Rakibin tüm c')) for (const m of [...mons(d, O(p))]) await d.destroy(m, self);
      else if (o.includes('Büyü')) for (const s of d.allField().filter(c => isST(c) && c.owner === O(p))) await d.destroy(s, self);
      else { for (const c of [...d.P(O(p)).hand]) await d.sendToGrave(c, 'discard'); }
    },
  });
  S('Mind Crush', {
    manual: true,
    async resolve(d, p, self) {
      const t = await d.choose(p, 'Mind Crush: kart adı bildir', [...new Set([...d.P(O(p)).hand.map(c => c.d.name), ...d.P(O(p)).deck.slice(0, 40).map(c => c.d.name)])].sort());
      const hit = d.P(O(p)).hand.filter(c => c.d.name === t);
      if (hit.length) for (const c of hit) await d.sendToGrave(c, 'discard'); else await discardRandom(d, p);
    },
  });
  S('D.D. Designator', {
    can: d => d.P(O(0)).hand.length + d.P(O(1)).hand.length > 0,
    async resolve(d, p) {
      const q = O(p); if (!d.P(q).hand.length) return false;
      const t = await d.choose(p, 'Bir kart adı bildir', [...new Set([...d.P(q).hand.map(c => c.d.name), ...d.P(q).deck.slice(0, 40).map(c => c.d.name)])].sort());
      const h = d.P(q).hand.find(c => c.d.name === t);
      if (h) await d.banish(h); else { const H = d.P(q).hand; if (H.length) await d.banish(H[Math.floor(d.rng() * H.length)]); }
    },
  });
  S('Great Phantom Thief', {
    async onBattleDamage(d, p, c, amt, victim) {
      if (victim === p || !d.P(victim).hand.length) return;
      const t = await d.choose(p, 'Bir kart adı bildir', [...new Set(d.P(victim).hand.map(x => x.d.name))].sort());
      for (const h of d.P(victim).hand.filter(x => x.d.name === t)) await d.sendToGrave(h, 'discard');
    },
  });
  const vamp = async (d, p, c, amt, victim) => {
    if (victim === p) return;
    const k = await d.choose(p, 'Kart türü bildir (Rakibin destesinden mezarlığa gider)', CTYPES);
    const m = d.P(victim).deck.find(x => kindOf(x) === k);
    if (m) { d.removeFromWherever(m); d.P(victim).grave.push(m); m.graveInfo = { turn: d.turn, why: 'mill', from: 'deck' }; await d.ev('toGrave', { card: m, from: 'deck', why: 'mill' }); }
  };
  S('Vampire Lady', { onBattleDamage: vamp });
  S('Vampire Lord', { onBattleDamage: vamp });
  S('The Hunter with 7 Weapons', {
    async onSummon(d, p, c) { if (!c.special) c.decl = await d.choose(p, 'Bir Canavar Türü bildir', TYPES); },
    battleBoost: (d, p, c, o) => { if (c.decl && o && o.d.race === c.decl) d.addTemp(c, 1000, 0); },
  });
  S('Archfiend\'s Oath', { sub: 'continuous', aiOk: () => false, async standby(d, p, x) {
    if (d.P(p).lp <= 500 || !d.P(p).deck.length || !(await d.ask(p, x, 'Archfiend\'s Oath: 500 LP öde, kart adı bildir?'))) return;
    await pay(d, p, 500);
    const names = [...new Set(d.P(p).deck.map(c => c.d.name))].sort(); const n = await d.choose(p, 'Kart adı bildir', names);
    const top = d.P(p).deck[0]; if (top.d.name === n) { d.P(p).deck.shift(); d.P(p).hand.push(top); await d.ev('draw', { p, card: top }); } else await mill(d, p, 1);
  } });

  // ======================================================================== DARK SCORPION
  const bdmg = (a, b) => async (d, p, c, amt, victim) => { if (victim === p) return; const o = await d.choose(p, `${c.d.name}`, [a.t, b.t]); await (o === a.t ? a.f : b.f)(d, p, c, victim); };
  S('Don Zaloog', { onBattleDamage: bdmg({ t: 'Rakibin elinden rastgele 1 kart at', f: (d, p, c, v) => discardRandom(d, v) }, { t: 'Rakibin destesinin üst 2 kartını mezarlığa gönder', f: (d, p, c, v) => mill(d, v, 2) }) });
  S('Dark Scorpion - Cliff the Trap Remover', { onBattleDamage: bdmg({ t: 'Sahadaki 1 Büyü/Tuzağı yok et', f: async (d, p, c) => { const t = await pick(d, p, fieldST(d), 'Yok edilecek Büyü/Tuzak', 'harm'); if (t) await d.destroy(t, c); } }, { t: 'Rakibin destesinin üst 2 kartını mezarlığa gönder', f: (d, p, c, v) => mill(d, v, 2) }) });
  S('Dark Scorpion - Chick the Yellow', { onBattleDamage: bdmg({ t: 'Sahadaki 1 kartı ele döndür', f: async (d, p, c) => { const t = await pick(d, p, d.allField().filter(x => x !== c), 'Ele dönecek kart', 'harm'); if (t) await d.bounce(t); } }, { t: 'Rakibin destesinin üst kartını altına at', f: async (d, p, c, v) => { const dk = d.P(v).deck; if (dk.length) dk.push(dk.shift()); } }) });
  S('Dark Scorpion - Gorg the Strong', { onBattleDamage: bdmg({ t: 'Rakibin 1 canavarını destesinin üstüne koy', f: async (d, p, c, v) => { const t = await pick(d, p, mons(d, v), 'Desteye dönecek canavar', 'harm'); if (t) { d.removeFromWherever(t); d.P(v).deck.unshift(t); } } }, { t: 'Rakibin destesinin üst kartını mezarlığa gönder', f: (d, p, c, v) => mill(d, v, 1) }) });
  S('Dark Scorpion - Meanae the Thorn', { onBattleDamage: bdmg({ t: 'Destenden 1 "Dark Scorpion" ele al', f: async (d, p) => { const t = await pick(d, p, d.P(p).deck.filter(x => /Dark Scorpion/.test(x.d.name)), 'Eline alınacak kart', 'help'); if (t) { d.removeFromWherever(t); d.P(p).hand.push(t); shuffle(d.P(p).deck, d.rng); } } }, { t: 'Mezarlıktan 1 "Dark Scorpion" çağır', f: async (d, p) => { if (d.freeZone(p, 'mz') < 0) return; const t = await pick(d, p, d.P(p).grave.filter(x => isMon(x) && /Dark Scorpion/.test(x.d.name)), 'Çağırılacak canavar', 'revive'); if (t) await d.specialSummon(p, t); } }) });
  S('Dark Scorpion Combination', {
    manual: true, can: (d, p) => ['Don Zaloog', 'Dark Scorpion - Cliff the Trap Remover', 'Dark Scorpion - Chick the Yellow', 'Dark Scorpion - Gorg the Strong', 'Dark Scorpion - Meanae the Thorn'].every(n => mons(d, p, true).some(m => m.d.name === n)),
    async resolve(d, p) { for (const m of mons(d, p, true).filter(x => /Don Zaloog|Dark Scorpion/.test(x.d.name))) m.multiTurn = d.turn; },
  });

  // ======================================================================== SET'E GEÇEN / FLIP CANAVARLARI
  S('Des Lacooda', { ability: faceDownSwitch, async onFlip(d, p) { await d.draw(p, 1); } });
  S('Swarm of Locusts', { ability: faceDownSwitch, async onFlip(d, p, c) { const t = await pick(d, p, fieldST(d).filter(x => x.owner === O(p)), 'Yok edilecek Büyü/Tuzak', 'harm'); if (t) await d.destroy(t, c); } });
  S('Swarm of Scarabs', { ability: faceDownSwitch, async onFlip(d, p, c) { const t = await pick(d, p, mons(d, O(p)), 'Yok edilecek canavar', 'harm'); if (t) await d.destroy(t, c); } });
  S('Royal Keeper', { ability: faceDownSwitch, async onFlip(d, p, c) { d.addTemp(c, 300, 300); } });
  S('Big Eye', { async onFlip(d, p) { await arrange(d, p, p, 5); } });
  S('Bombardment Beetle', { async onFlip(d, p, c) {
    const t = await pick(d, p, mons(d, O(p)).filter(m => !m.up), 'Bombardment Beetle: kapalı canavar', 'harm'); if (!t) return;
    if (t.d.frame === 'effect') await d.destroy(t, c);
  } });
  S('The Stern Mystic', { async onFlip(d, p) { for (const c of d.allField().filter(x => !x.up)) await d.ev('reveal', { card: c }); } });
  S('Castle of Dark Illusions', {
    async onFlip(d, p, c) { c.cdiTurn = d.turn; },
    mod: (m, key, d, f) => (f.cdiTurn != null && m.d.race === 'Zombie' && m.d.kind === 'monster' ? 200 * (1 + Math.min(4, Math.floor((d.turn - f.cdiTurn) / 2))) : 0),
  });
  S('Morphing Jar #2', {
    async onFlip(d, p) {
      const all = d.allField().filter(c => isMon(c)); const n = all.length;
      for (const m of all) { d.removeFromWherever(m); m.bonus = { atk: 0, def: 0 }; d.P(m.owner).deck.push(m); }
      for (const q of [0, 1]) shuffle(d.P(q).deck, d.rng);
      for (const q of [p, O(p)]) {
        let found = 0; const take = [];
        while (found < n && d.P(q).deck.length) {
          const c = d.P(q).deck.shift();
          if (isMon(c) && c.d.level <= 4 && take.length < d.P(q).mz.length) { take.push(c); found++; } else d.P(q).grave.push(c);
        }
        for (const c of take) { const zi = d.freeZone(q, 'mz'); if (zi < 0) { d.P(q).grave.push(c); continue; } c.up = false; c.pos = 'def'; c.owner = q; c.placedTurn = d.turn; d.P(q).mz[zi] = c; await d.ev('set', { p: q, card: c, zone: zi }); }
      }
    },
  });
  S('Mysterious Guard', { async onFlip(d, p, c) { const t = await pick(d, p, mons(d, O(p), true), 'Desteye dönecek canavar', 'harm'); if (t) { d.removeFromWherever(t); d.P(t.owner).deck.unshift(t); } } });
  S('Jigen Bakudan', { async onFlip(d, p, c) { c.bombReady = true; }, async standby(d, p, c) {
    if (!c.bombReady) return;
    const others = mons(d, p).filter(m => m !== c); let sum = 0; for (const m of others) sum += d.atk(m);
    await d.destroy(c, c); for (const m of others) await d.destroy(m, c); await d.damage(O(p), Math.floor(sum / 2), c);
  } });

  // ======================================================================== CANAVARLAR (savaş / yetenek)
  S('3-Hump Lacooda', { ability: {
    label: 'Diğer 2 "3-Hump Lacooda"yı tribute et: 3 kart çek', can: (d, p) => mons(d, p, true).filter(m => m.d.name === '3-Hump Lacooda').length >= 3 && d.P(p).deck.length >= 3,
    async resolve(d, p, c) { for (const m of mons(d, p, true).filter(m => m.d.name === '3-Hump Lacooda' && m !== c).slice(0, 2)) await d.sendToGrave(m, 'tribute'); await d.draw(p, 3); },
    ai: () => true,
  } });
  S('Amazoness Blowpiper', { async standby(d, p, c) { const t = await pick(d, p, mons(d, O(p), true), 'Amazoness Blowpiper: -500 ATK', 'harm'); if (t) d.addTemp(t, -500, 0); } });
  S('Arcane Archer of the Forest', {
    noAttackOn: (d, f, atk, def) => (def === f && mons(d, f.owner, true).some(m => m !== f && m.d.race === 'Plant') ? 'Arcane Archer: başka bir Plant varken saldırı hedefi olamaz' : null),
    ability: {
      label: '1 Plant tribute et: 1 Büyü/Tuzak yok et', can: (d, p, c) => mons(d, p, true).some(m => m !== c && m.d.race === 'Plant') && fieldST(d).length > 0,
      async resolve(d, p, c) { const tr = await pick(d, p, mons(d, p, true).filter(m => m !== c && m.d.race === 'Plant'), 'Tribute edilecek Plant', 'tribute'); if (!tr) return false; await d.sendToGrave(tr, 'tribute'); const t = await pick(d, p, fieldST(d), 'Yok edilecek Büyü/Tuzak', 'harm'); if (t) await d.destroy(t, c); },
      ai: (d, p) => fieldST(d).some(x => x.owner === O(p)),
    },
  });
  S('Balloon Lizard', { async standby(d, p, c) { c.ctr = (c.ctr || 0) + 1; }, async onGrave(d, p, c, why) { if (why === 'battle' && c.killedBy && c.ctr) await d.damage(c.killedBy.owner, c.ctr * 400, c); } });
  S('Boar Soldier', { async onSummon(d, p, c) { if (!c.special) await d.destroy(c, c); }, selfMod: (c, key, d) => (key === 'atk' && mons(d, O(c.owner)).length ? -1000 : 0) });
  S('Nuvia the Wicked', { async onSummon(d, p, c) { if (!c.special) await d.destroy(c, c); }, selfMod: (c, key, d) => (key === 'atk' ? -200 * mons(d, O(c.owner)).length : 0) });
  S('D.D. Assailant', { async onGrave(d, p, c, why) { const k = c.killedBy; if (why === 'battle' && k && d.inMZ(k)) { await d.banish(k); await d.banish(c); } } });
  S('D.D. Warrior Lady', { async afterBattle(d, p, c, o) { if (o && d.inMZ(o) && d.inMZ(c) && (await d.ask(p, c, 'Rakibin canavarını ve kendini çıkar (banish)?'))) { await d.banish(o); await d.banish(c); } } });
  S('Electric Snake', { async onHandToGrave(d, p, c, why) { if (d.src && d.src.p !== p) await d.draw(p, 2); } });
  S('Minar', { async onHandToGrave(d, p, c, why) { if (d.src && d.src.p !== p) await d.damage(O(p), 1000, c); } });
  S('Gearfried the Iron Knight', { async standbyAny(d, p, c) { for (const x of d.allField().filter(y => y.equipTo === c.uid)) await d.destroy(x, c); } });
  S('Chaosrider Gustaph', { ability: {
    label: 'Mezarlıktan 2 Büyü çıkar: +300 ATK her biri için', can: (d, p) => d.P(p).grave.some(c => c.d.kind === 'spell'),
    async resolve(d, p, c) { let n = 0; for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.P(p).grave.filter(x => x.d.kind === 'spell'), `Çıkarılacak Büyü (${i + 1}/2)`, 'cost'); if (!t) break; await d.banish(t); n++; } if (n) d.addTemp(c, 300 * n, 0); },
    ai: (d, p) => d.P(p).grave.some(c => c.d.kind === 'spell'),
  } });
  S('Pumpking the King of Ghosts', {
    async standby(d, p, c) { if (fieldHas(d, 'Castle of Dark Illusions')) c.bonus.atk += 100, c.bonus.def += 100; },
    selfMod: (c, key, d) => (fieldHas(d, 'Castle of Dark Illusions') ? 100 : 0),
  });
  S('Sasuke Samurai #2', { ability: { label: '800 LP öde: bu tur Büyü ve Tuzak aktive edilemez', can: d => d.P(d.active).lp > 800, async resolve(d, p) { if (!(await pay(d, p, 800))) return false; flagFor(d, 'noSpell', 0, d.turn); flagFor(d, 'noSpell', 1, d.turn); flagFor(d, 'noTrap', 0, d.turn); flagFor(d, 'noTrap', 1, d.turn); }, ai: () => false } });
  S('Emissary of the Oasis', { noAttackOn: (d, f, atk, def) => (def === f && mons(d, f.owner, true).some(m => m !== f && m.d.type === 'Normal Monster' && (m.d.level || 0) <= 3) ? 'Emissary of the Oasis: korunuyor' : null) });
  S('Prickle Fairy', {
    noAttackOn: (d, f, atk, def) => (def.owner === f.owner && def.d.race === 'Insect' ? 'Prickle Fairy: Insect\'lere saldırılamaz' : null),
    async afterBattle(d, p, c, o) { if (o && d.inMZ(o) && o.pos === 'atk') { o.pos = 'def'; await d.ev('pos', { p: o.owner, card: o }); } },
  });
  S('Legendary Jujitsu Master', { async afterDefended(d, p, c, atk) { if (atk && d.inMZ(atk)) { d.removeFromWherever(atk); d.P(atk.owner).deck.unshift(atk); } } });
  S('Hyper Hammerhead', { async afterBattle(d, p, c, o) { if (d.inMZ(o)) await d.bounce(o); } });
  S('Reflect Bounder', { async afterDefended(d, p, c, atk) { if (atk) await d.damage(atk.owner, d.atk(atk), c); } });
  S('Insect Queen', { selfMod: (c, key, d) => (key === 'atk' ? 200 * d.allField().filter(m => isMon(m) && m.up && m.d.race === 'Insect').length : 0) });
  S('The Unhappy Girl', { noBattleDestroy: (d, c) => c.pos === 'atk', async afterDefended(d, p, c, atk) { if (atk) atk.cantAttackTurn = d.turn + 1; } });
  S('Cat\'s Ear Tribe', { battleBoost: (d, p, c, o) => { if (o && o.owner === d.active && o.owner !== p) d.addTemp(o, -(d.atk(o) - 200), 0); } });
  S('Total Defense Shogun', { async onSummon(d, p, c) { if (!c.special) { c.pos = 'def'; await d.ev('pos', { p, card: c }); } }, canAttack: () => null });
  S('Soul-Absorbing Bone Tower', {
    noAttackOn: (d, f, atk, def) => (def === f && mons(d, f.owner, true).some(m => m !== f && m.d.race === 'Zombie') ? 'Soul-Absorbing Bone Tower: korunuyor' : null),
    async onSpecial(d, p, x, c) { if (c.d.race === 'Zombie') await mill(d, O(p), 2); },
  });
  S('Woodland Sprite', { ability: { label: 'Donatım kartını gönder: 500 hasar', can: (d, p, c) => d.allField().some(x => x.equipTo === c.uid), async resolve(d, p, c) { const e = d.allField().find(x => x.equipTo === c.uid); if (!e) return false; await d.sendToGrave(e, 'cost'); await d.damage(O(p), 500, c); }, ai: () => true } });
  S('Gravekeeper\'s Cannonholder', { ability: { label: '1 "Gravekeeper\'s" tribute et: 700 hasar', can: (d, p, c) => mons(d, p).some(m => m !== c && /^Gravekeeper's/.test(m.d.name)), async resolve(d, p, c) { const t = await pick(d, p, mons(d, p).filter(m => m !== c && /^Gravekeeper's/.test(m.d.name)), 'Tribute', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); await d.damage(O(p), 700, c); }, ai: (d, p) => d.P(O(p)).lp <= 700 } });
  S('Freed the Brave Wanderer', { ability: {
    label: '2 LIGHT canavarı çıkar: daha yüksek ATK\'li canavarı yok et', can: (d, p, c) => d.P(p).grave.filter(x => isMon(x) && x.d.attr === 'LIGHT').length >= 2 && d.allField().some(m => isMon(m) && m.up && d.atk(m) > d.atk(c)),
    async resolve(d, p, c) {
      const t = await pick(d, p, d.allField().filter(m => isMon(m) && m.up && d.atk(m) > d.atk(c)), 'Yok edilecek canavar', 'harm'); if (!t) return false;
      for (let i = 0; i < 2; i++) { const g = await pick(d, p, d.P(p).grave.filter(x => isMon(x) && x.d.attr === 'LIGHT'), 'Çıkarılacak LIGHT canavar', 'cost'); if (g) await d.banish(g); }
      await d.destroy(t, c);
    }, ai: (d, p, c) => d.monsters(O(p), true).some(m => d.atk(m) > d.atk(c)),
  } });
  S('Lady Ninja Yae', { ability: { label: 'Elinden 1 WIND at: rakibin Büyü/Tuzaklarını ele döndür', can: (d, p) => d.P(p).hand.some(c => isMon(c) && c.d.attr === 'WIND') && d.allField().some(c => isST(c) && c.owner === O(p)),
    async resolve(d, p) { const h = await pick(d, p, d.P(p).hand.filter(c => isMon(c) && c.d.attr === 'WIND'), 'At: WIND canavar', 'discard'); if (!h) return false; await d.sendToGrave(h, 'discard'); for (const s of d.allField().filter(c => isST(c) && c.owner === O(p))) await d.bounce(s); }, ai: (d, p) => d.allField().filter(c => isST(c) && c.owner === O(p)).length >= 2 } });

  // ======================================================================== BÜYÜLER
  S('Ancient Telescope', { async resolve(d, p) { await arrange(d, p, O(p), 5, false); } });
  S('Spellbook Organization', { async resolve(d, p) { await arrange(d, p, p, 3); } });
  S('Fruits of Kozaky\'s Studies', { manual: true, async resolve(d, p) { await arrange(d, p, p, 3); } });
  S('Senri Eye', { sub: 'continuous', aiOk: () => true, async standby(d, p, x) { if (d.P(p).lp > 100 && d.P(O(p)).deck.length && (await d.ask(p, x, 'Senri Eye: 100 LP öde, rakibin üst kartına bak?'))) { await pay(d, p, 100); await arrange(d, p, O(p), 1, false); } } });
  S('Card Shuffle', {
    sub: 'continuous', aiOk: () => false,
    async standby(d, p, x) { if (d.P(p).lp > 300 && (await d.ask(p, x, 'Card Shuffle: 300 LP öde, bir desteyi karıştır?'))) { await pay(d, p, 300); const w = await d.choose(p, 'Hangi deste?', ['Benim', 'Rakibin']); shuffle(d.P(w === 'Benim' ? p : O(p)).deck, d.rng); } },
  });
  S('Lighten the Load', { sub: 'continuous', aiOk: () => true, async standby(d, p, x) { const h = d.P(p).hand.filter(c => isMon(c) && (c.d.level || 0) >= 7); if (h.length && d.P(p).deck.length && (await d.ask(p, x, 'Lighten the Load: Level 7+ canavarı desteye ekleyip 1 kart çek?'))) { const m = await pick(d, p, h, 'Desteye eklenecek canavar', 'discard'); if (m) { d.removeFromWherever(m); d.P(p).deck.push(m); shuffle(d.P(p).deck, d.rng); await d.draw(p, 1); } } } });
  S('Call of the Mummy', { sub: 'continuous', aiOk: () => true, async standby(d, p, x) { if (mons(d, p).length || d.freeZone(p, 'mz') < 0) return; const z = d.P(p).hand.filter(c => isMon(c) && c.d.race === 'Zombie'); if (z.length && (await d.ask(p, x, 'Call of the Mummy: Zombie çağır?'))) { const m = await pick(d, p, z, 'Çağırılacak Zombie', 'revive'); if (m) await d.specialSummon(p, m); } } });
  S('Frontline Base', { sub: 'continuous', aiOk: () => true, async standby(d, p, x) { const z = d.P(p).hand.filter(c => isMon(c) && /Union/.test(c.d.type) && (c.d.level || 0) <= 4); if (z.length && d.freeZone(p, 'mz') >= 0 && (await d.ask(p, x, 'Frontline Base: Union çağır?'))) { const m = await pick(d, p, z, 'Çağırılacak Union', 'revive'); if (m) await d.specialSummon(p, m); } } });
  S('Weapon Change', { sub: 'continuous', aiOk: () => false, async standby(d, p, x) { const t = mons(d, p, true).filter(m => m.d.race === 'Warrior' || m.d.race === 'Machine'); if (t.length && d.P(p).lp > 700 && (await d.ask(p, x, 'Weapon Change: 700 LP öde, ATK/DEF değiştir?'))) { await pay(d, p, 700); const m = await pick(d, p, t, 'Hedef canavar', 'help'); if (m) d.addTemp(m, d.def(m) - d.atk(m), d.atk(m) - d.def(m)); } } });
  S('Burning Land', { sub: 'field', async resolve(d, p, self) { for (const q of [0, 1]) { const f = d.P(q).field; if (f && f !== self) await d.destroy(f, self); } }, async standbyAny(d, p, x) { await d.damage(p, 500, x); } });
  S('Ectoplasmer', { sub: 'continuous', aiOk: () => false, async endPhaseAny(d, p, x) { const t = await pick(d, p, mons(d, p, true), 'Ectoplasmer: Tribute', 'tribute'); if (t) { const a = t.d.atk || 0; await d.sendToGrave(t, 'tribute'); await d.damage(O(p), Math.floor(a / 2), x); } } });
  S('Spell Economics', { sub: 'continuous', noSpellCost: true });
  S('Pyramid Energy', { async resolve(d, p) { const o = await d.choose(p, 'Pyramid Energy', ['+200 ATK (bu tur)', '+200 DEF (bu tur)']); for (const m of mons(d, p, true)) d.addTemp(m, o.startsWith('+200 ATK') ? 200 : 0, o.startsWith('+200 ATK') ? 0 : 200); } });
  S('Sebek\'s Blessing', { sub: 'continuous', async onBattleDmg(d, p, x, atker, amt, victim, direct) { if (direct && atker.owner === p) await d.heal(p, amt); } });
  S('The Inexperienced Spy', { async resolve(d, p) { const H = d.P(O(p)).hand; if (!H.length) return; await d.ctl[p].pick(d, p, H.map(card => ({ card })), 'Rakibin elinden 1 kart gör', 'help'); } });
  S('Mind Wipe', { can: (d, p) => d.P(O(p)).hand.length <= 3, async resolve(d, p) { const q = O(p), n = d.P(q).hand.length; while (d.P(q).hand.length) d.P(q).deck.push(d.P(q).hand.pop()); shuffle(d.P(q).deck, d.rng); await d.draw(q, n); } });
  S('Seal of the Ancients', { can: d => d.P(0).lp > 1000, async resolve(d, p) { if (!(await pay(d, p, 1000))) return false; for (const c of d.allField().filter(x => !x.up && x.owner === O(p))) await d.ev('reveal', { card: c }); } });
  S('Wave-Motion Cannon', { sub: 'continuous', aiOk: () => true, async resolve(d, p, x) { x.waveStart = d.turn; }, async standby(d, p, x) { x.waves = (x.waves || 0) + 1; if (x.waves >= 3 && (await d.ask(p, x, `Wave-Motion Cannon: ${x.waves * 1000} hasar için kullanılsın mı?`))) { const n = x.waves * 1000; await d.sendToGrave(x, 'cost'); await d.damage(O(p), n, x); } } });
  S('Primal Seed', { can: (d, p) => d.P(p).banished.length >= 2 && (fieldHas(d, 'Black Luster Soldier - Envoy of the Beginning') || fieldHas(d, 'Chaos Emperor Dragon - Envoy of the End')), async resolve(d, p) { for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.P(p).banished, 'Ele alınacak kart', 'help'); if (t) { d.removeFromWherever(t); d.P(p).hand.push(t); } } } });
  S('Dimension Distortion', { can: (d, p) => d.P(p).grave.length === 0 && d.P(p).banished.some(isMon) && d.freeZone(p, 'mz') >= 0, async resolve(d, p) { const t = await pick(d, p, d.P(p).banished.filter(isMon), 'Çağırılacak çıkarılmış canavar', 'revive'); if (t) await d.specialSummon(p, t); } });
  S('Two-Man Cell Battle', { sub: 'continuous', aiOk: () => true, async endPhaseAny(d, p, x) { const q = p; if (d.freeZone(q, 'mz') < 0) return; const h = d.P(q).hand.filter(c => isMon(c) && c.d.level === 4 && c.d.type === 'Normal Monster'); if (h.length && (await d.ask(q, x, 'Two-Man Cell Battle: Level 4 Normal canavar çağır?'))) { const m = await pick(d, q, h, 'Çağırılacak canavar', 'revive'); if (m) await d.specialSummon(q, m); } } });

  // ======================================================================== TUZAKLAR
  S('Appropriate', { sub: 'continuous', aiOk: () => true, async onDrawCard(d, p, x, who, card, normal) { if (who === O(p) && !normal) await d.draw(p, 2); } });
  S('Aqua Chorus', { sub: 'continuous', aiOk: () => true, mod: (m, key, d, f) => (m.d.kind === 'monster' && d.allField().some(o => o !== m && isMon(o) && o.up && o.d.name === m.d.name) ? 500 : 0) });
  S('Backup Soldier', { manual: true, can: (d, p) => d.P(p).grave.filter(isMon).length >= 5 && d.P(p).grave.some(c => isMon(c) && c.d.type === 'Normal Monster' && c.d.atk <= 1500), async resolve(d, p) { for (let i = 0; i < 3; i++) { const t = await pick(d, p, d.P(p).grave.filter(c => isMon(c) && c.d.type === 'Normal Monster' && c.d.atk <= 1500), `Ele alınacak canavar (${i + 1}/3)`, 'help'); if (!t) break; d.removeFromWherever(t); d.P(p).hand.push(t); } } });
  S('Ceasefire', { manual: true, can: d => d.allField().some(c => isMon(c) && (!c.up || c.d.frame === 'effect')), async resolve(d, p, x) { const eff = d.allField().filter(c => isMon(c) && c.d.frame === 'effect' && c.up); for (const m of d.allField().filter(c => isMon(c) && !c.up)) { m.up = true; await d.ev('flip', { p: m.owner, card: m, silent: true }); } for (const m of eff) await d.damage(O(p), 500, x); } });
  S('Final Attack Orders', { sub: 'continuous', aiOk: () => true, async resolve(d, p) { for (const m of d.allField().filter(c => isMon(c) && c.up && c.pos === 'def')) { m.pos = 'atk'; await d.ev('pos', { p: m.owner, card: m }); } }, restrictPos: () => 'Final Attack Orders: pozisyon değiştirilemez' });
  S('Gorgon\'s Eye', { manual: true, async resolve(d, p) { for (const m of d.allField().filter(c => isMon(c) && c.pos === 'def')) m.mutedTurn = d.turn; } });
  S('Labyrinth of Nightmare', { sub: 'continuous', aiOk: () => true, async endPhaseAny(d, p, x) { for (const m of mons(d, p, true)) { m.pos = m.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p, card: m }); } } });
  S('Self-Destruct Button', { manual: true, can: (d, p) => d.P(O(p)).lp - d.P(p).lp >= 7000, async resolve(d, p) { d.P(0).lp = 0; d.P(1).lp = 0; await d.ev('damage', { p: 0, amount: 0 }); await d.checkWin(); } });
  S('The Spell Absorbing Life', { manual: true, async resolve(d, p) { let n = 0; for (const m of d.allField().filter(c => isMon(c))) { if (!m.up) { m.up = true; await d.ev('flip', { p: m.owner, card: m, silent: true }); } if (m.d.frame === 'effect') n++; } if (n) await d.heal(p, 400 * n); } });
  S('Skull Lair', { manual: true, can: (d, p) => d.P(p).grave.some(isMon) && d.allField().some(c => isMon(c) && c.up), async resolve(d, p, x) { const g = d.P(p).grave.filter(isMon); const lv = await d.choose(p, 'Skull Lair: çıkarılacak canavar sayısı = hedef Level', [...new Set(g.map((_, i) => i + 1))].filter(n => d.allField().some(c => isMon(c) && c.up && c.d.level === n))); if (!lv) return false; for (let i = 0; i < lv; i++) { const t = await pick(d, p, d.P(p).grave.filter(isMon), 'Çıkarılacak canavar', 'cost'); if (t) await d.banish(t); } for (const m of d.allField().filter(c => isMon(c) && c.up && c.d.level === lv)) { await d.destroy(m, x); break; } } });
  S('Order to Smash', { manual: true, can: (d, p) => mons(d, p).some(m => m.d.type === 'Normal Monster' && (m.d.level || 0) <= 2) && fieldST(d).some(c => c.owner === O(p)), async resolve(d, p, x) { const t = await pick(d, p, mons(d, p).filter(m => m.d.type === 'Normal Monster' && (m.d.level || 0) <= 2), 'Tribute edilecek canavar', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); for (let i = 0; i < 2; i++) { const s = await pick(d, p, fieldST(d).filter(c => c.owner === O(p)), 'Yok edilecek Büyü/Tuzak', 'harm'); if (s) await d.destroy(s, x); } } });
  S('Trap of Board Eraser', { trigger: 'damage', can: (d, p, c, ctx) => !ctx.battle && d.P(p).hand.length > 0, async resolve(d, p, c, ctx) { ctx.negated = true; const h = d.P(p).hand; const t = await pick(d, O(p), h, 'Kart seç (rakibin elinden at)', 'discard'); if (t) await d.sendToGrave(t, 'discard'); } });
  S('Ordeal of a Traveler', { trigger: 'attack', can: (d, p, c, ctx) => d.P(p).hand.length > 0 && !!ctx.attacker, async resolve(d, p, c, ctx) { const H = d.P(p).hand; const x = H[Math.floor(d.rng() * H.length)]; const g = await d.choose(ctx.attacker.owner, 'Ordeal of a Traveler: kartın türünü tahmin et', CTYPES); if (g !== kindOf(x)) { ctx.negated = true; await d.bounce(ctx.attacker); } } });
  S('Ominous Fortunetelling', { sub: 'continuous', aiOk: () => true, async standby(d, p, x) { const H = d.P(O(p)).hand; if (!H.length) return; const c = H[Math.floor(d.rng() * H.length)]; const g = await d.choose(p, 'Ominous Fortunetelling: kartın türünü tahmin et', CTYPES); if (g === kindOf(c)) await d.damage(O(p), 700, x); else await d.damage(p, 700, x); } });
  S('Shadow of Eyes', { trigger: 'summon', can: (d, p, c, ctx) => !ctx.monster.up, async resolve(d, p, c, ctx) { const m = ctx.monster; m.up = true; m.pos = 'atk'; await d.ev('flip', { p: m.owner, card: m, silent: true }); } });
  S('Pineapple Blast', { trigger: 'summon', can: (d, p, c, ctx) => ctx.summoner === p && mons(d, O(p)).length > mons(d, p).length, async resolve(d, p, c, ctx) { let extra = mons(d, O(p)).length - mons(d, p).length; while (extra-- > 0) { const t = await pick(d, p, mons(d, O(p)), 'Yok edilecek canavar', 'harm'); if (t) await d.destroy(t, c); } } });
  S('Covering Fire', { trigger: 'attack', can: (d, p, c, ctx) => !!ctx.target && ctx.target.owner === p && mons(d, p, true).length >= 2, async resolve(d, p, c, ctx) { const t = await pick(d, p, mons(d, p, true).filter(m => m !== ctx.target), 'ATK\'si eklenecek canavar', 'help'); if (t) d.addTemp(ctx.target, d.atk(t), 0); } });

  // Quick/Counter vb. basit kalkanlar
  S('Riryoku Field', { trigger: 'spell', can: (d, p, c, ctx) => !!ctx.spell, async resolve(d, p, c, ctx) { ctx.negated = true; } });
  S('Tutan Mask', { trigger: 'spell', can: (d, p, c, ctx) => !!ctx.spell && mons(d, p, true).some(m => m.d.race === 'Zombie'), async resolve(d, p, c, ctx) { ctx.negated = true; } });

});