// Kart efektleri — 5. paket: Büyüler (Quick-Play dahil). Önceki paketlerdeki efektlere dokunulmaz (S yalnızca yoksa tanımlar).
// Sürekli (Continuous) kartlar engine'in notify() kancalarını kullanır: onSpecial, onBanish, onBounce, onDrawCard, onEffectDamage, onBigTribute...
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects4.js'); module.exports = factory(require('./engine.js')); }
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
  const anyST = d => [0, 1].flatMap(i => stZone(d, i));
  const fieldMons = (d, up) => d.allField().filter(c => isMon(c) && (!up || c.up));
  const myUp = (d, p) => d.monsters(p, true);
  const graveMons = (d, p, f = () => true) => d.P(p).grave.filter(c => isMon(c) && f(c));
  const handMons = (d, p, f = () => true) => d.P(p).hand.filter(c => isMon(c) && f(c));
  const toHand = async (d, p, c) => { const loc = d.locate(c); d.removeFromWherever(c); d.P(p).hand.push(c); await d.ev('search', { p, card: c }); if (loc && loc.kind === 'deck') await d.handReact('deckToHand', p, c); };
  const shuffleDeck = (d, p) => E.shuffle(d.P(p).deck, d.rng);
  const plainSummonable = c => isMon(c) && c.d.type !== 'Fusion Monster' && !/Ritual/.test(c.d.type) && !(FX[c.d.name] && (FX[c.d.name].handSummon || FX[c.d.name].summonReq));
  async function discardN(d, p, n, prompt, filter = () => true) {
    const pool = d.P(p).hand.filter(filter);
    if (pool.length < n) return false;
    for (let i = 0; i < n; i++) {
      const c = await pick(d, p, d.P(p).hand.filter(filter), `${prompt} (${i + 1}/${n})`, 'discard');
      if (!c) return false;
      await d.sendToGrave(c, 'discard');
    }
    return true;
  }
  const tokenId = name => { const t = E._tokens = E._tokens || {}; return t[name]; };
  // Token çağır: db'deki "<ad>" kartından örnek üretir
  async function token(d, p, name, pos = 'atk') {
    const def = [...d.db.values()].find(c => c.name === name);
    if (!def) return false;
    const t = d.inst(def.id, p);
    const ok = await d.specialSummon(p, t, { pos });
    return ok ? t : false;
  }
  E.makeToken = token;
  const flagFor = (d, key, p, v) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = v; };

  // ======================================================================== NORMAL BÜYÜLER
  S('A Wingbeat of Giant Dragon', {
    can: (d, p) => myUp(d, p).some(c => c.d.race === 'Dragon' && (c.d.level || 0) >= 5),
    async resolve(d, p, self) {
      const t = await pick(d, p, myUp(d, p).filter(c => c.d.race === 'Dragon' && (c.d.level || 0) >= 5), 'Eline dönecek Level 5+ Dragon', 'help');
      if (!t) return false;
      await d.bounce(t);
      for (const c of anyST(d).filter(x => x !== self)) await d.destroy(c, self);
    },
  });
  S('Big Wave Small Wave', {
    can: (d, p) => myUp(d, p).some(c => c.d.attr === 'WATER'),
    async resolve(d, p) {
      const ws = myUp(d, p).filter(c => c.d.attr === 'WATER'); let n = 0;
      for (const c of ws) { await d.destroy(c); n++; }
      for (let i = 0; i < n; i++) {
        const h = await pick(d, p, handMons(d, p, c => c.d.attr === 'WATER'), 'Elinden WATER canavar çağır', 'revive');
        if (!h || d.freeZone(p, 'mz') < 0) break;
        await d.specialSummon(p, h);
      }
    },
  });
  S('Book of Life', {
    can: (d, p) => graveMons(d, p, c => c.d.race === 'Zombie').length > 0 && graveMons(d, O(p)).length > 0 && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) {
      const z = await pick(d, p, graveMons(d, p, c => c.d.race === 'Zombie'), 'Mezarlığından çağrılacak Zombie', 'revive');
      const v = await pick(d, p, graveMons(d, O(p)), 'Çıkarılacak rakip mezarlık canavarı', 'harm');
      if (!z || !v) return false;
      await d.specialSummon(p, z); await d.banish(v);
    },
  });
  S('Cost Down', {
    can: (d, p) => d.P(p).hand.length >= 2,
    async resolve(d, p) { if (!(await discardN(d, p, 1, 'Cost Down: at'))) return false; flagFor(d, 'costDown', p, d.turn); },
  });
  S('Darkness Approaches', {
    can: (d, p) => d.P(p).hand.length >= 3 && fieldMons(d, true).length > 0,
    async resolve(d, p) {
      if (!(await discardN(d, p, 2, 'Darkness Approaches: at'))) return false;
      const t = await pick(d, p, fieldMons(d, true), 'Kapalı savunmaya çevrilecek canavar', 'harm');
      if (t) { t.up = false; t.pos = 'def'; await d.ev('pos', { p: t.owner, card: t }); }
    },
  });
  S('Gravedigger Ghoul', {
    can: (d, p) => graveMons(d, O(p)).length > 0,
    async resolve(d, p) {
      for (let i = 0; i < 2; i++) { const t = await pick(d, p, graveMons(d, O(p)), `Gravedigger Ghoul: çıkarılacak canavar (${i + 1}/2)`, 'harm'); if (!t) break; await d.banish(t); }
    },
  });
  S("Gryphon's Feather Duster", {
    can: (d, p) => d.P(p).st.some(Boolean) || !!d.P(p).field,
    async resolve(d, p, self) { let n = 0; for (const c of stZone(d, p).filter(x => x !== self)) { await d.destroy(c, self); n++; } await d.heal(p, 500 * n); },
  });
  S('Heart of the Underdog', {
    sub: 'continuous',
    async onDrawCard(d, p, x, who, card, normal) {
      if (who !== p || !normal || card.d.type !== 'Normal Monster' || d.P(p).deck.length === 0) return;
      if (await d.ask(p, x, `${card.d.name} (Normal canavar) çektin: göstererek 1 kart daha çek?`)) await d.draw(p, 1);
    },
  });
  S('Hieroglyph Lithograph', { can: (d, p) => d.P(p).lp > 1000, async resolve(d, p) { await d.damage(p, 1000); flagFor(d, 'handLimit', p, 7); } });
  S('Infinite Cards', { sub: 'continuous', noHandLimit: true });
  S('Last Will', {
    can: (d, p) => d.P(p).grave.some(c => isMon(c) && c.graveInfo && c.graveInfo.turn === d.turn && c.graveInfo.from === 'mz') && d.P(p).deck.some(c => isMon(c) && (c.d.atk || 0) <= 1500 && !FX[c.d.name]?.handSummon) && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.P(p).deck.filter(c => isMon(c) && (c.d.atk || 0) <= 1500 && c.d.type !== 'Fusion Monster' && !/Ritual/.test(c.d.type) && !FX[c.d.name]?.handSummon), 'Last Will: çağrılacak ATK 1500 veya altı canavar', 'revive');
      if (!t) return false;
      await d.specialSummon(p, t); shuffleDeck(d, p);
    },
  });
  S('Machine Duplication', {
    can: (d, p) => myUp(d, p).some(c => c.d.race === 'Machine' && (c.d.atk || 0) <= 500 && d.P(p).deck.some(x => x.d.name === c.d.name)) && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) {
      const t = await pick(d, p, myUp(d, p).filter(c => c.d.race === 'Machine' && (c.d.atk || 0) <= 500 && d.P(p).deck.some(x => x.d.name === c.d.name)), 'Machine Duplication: hedef canavar', 'help');
      if (!t) return false;
      for (let i = 0; i < 2; i++) { const c = d.P(p).deck.find(x => x.d.name === t.d.name); if (c && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, c); }
      shuffleDeck(d, p);
    },
  });
  S('Metamorphosis', {
    can: (d, p) => d.monsters(p).length > 0 && d.P(p).extra.some(f => f.d.level === Math.max(...d.monsters(p).map(m => m.d.level || 0)) || d.monsters(p).some(m => m.d.level === f.d.level)),
    async resolve(d, p) {
      const opts = d.monsters(p).filter(m => d.P(p).extra.some(f => f.d.level === m.d.level));
      const t = await pick(d, p, opts, 'Metamorphosis: tribute edilecek canavar', 'tribute');
      if (!t) return false;
      const fs = d.P(p).extra.filter(f => f.d.level === t.d.level);
      await d.sendToGrave(t, 'tribute');
      const f = await pick(d, p, fs, 'Çağrılacak Fusion canavar', 'revive');
      if (f) await d.specialSummon(p, f);
    },
  });
  S('Monster Gate', {
    can: (d, p) => d.monsters(p).length > 0 && d.P(p).deck.some(plainSummonable),
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p), 'Monster Gate: tribute edilecek canavar', 'tribute');
      if (!t) return false;
      await d.sendToGrave(t, 'tribute');
      const dk = d.P(p).deck;
      while (dk.length) {
        const c = dk.shift();
        if (plainSummonable(c) && d.freeZone(p, 'mz') >= 0) { d.P(p).hand.push(c); await d.specialSummon(p, c); break; }
        d.P(p).grave.push(c); c.graveInfo = { turn: d.turn, why: 'excavate', from: 'deck' };
      }
    },
  });
  S('Multiplication of Ants', {
    can: (d, p) => d.monsters(p).some(c => c.d.race === 'Insect'),
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p).filter(c => c.d.race === 'Insect'), 'Tribute edilecek Insect', 'tribute');
      if (!t) return false;
      await d.sendToGrave(t, 'tribute');
      for (let i = 0; i < 2; i++) await token(d, p, 'Army Ant Token', 'atk');
    },
  });
  S('Precious Cards from Beyond', {
    sub: 'continuous',
    async onBigTribute(d, p, x, card) { if (card.owner === p) await d.draw(p, 2); },
  });
  S('Return of the Doomed', {
    can: (d, p) => d.P(p).hand.some(isMon) && d.P(p).grave.some(c => isMon(c) && c.graveInfo && c.graveInfo.turn === d.turn && c.graveInfo.why === 'battle'),
    async resolve(d, p) {
      if (!(await discardN(d, p, 1, 'Return of the Doomed: canavar at', isMon))) return false;
      const t = await pick(d, p, d.P(p).grave.filter(c => isMon(c) && c.graveInfo && c.graveInfo.turn === d.turn && c.graveInfo.why === 'battle'), 'Ele dönecek canavar', 'help');
      if (t) await toHand(d, p, t);
    },
  });
  S('Riryoku', {
    can: d => fieldMons(d, true).length >= 2,
    async resolve(d, p) {
      const a = await pick(d, p, fieldMons(d, true), 'Riryoku: ATK\'sı yarıya düşecek canavar', 'harm');
      if (!a) return false;
      const b = await pick(d, p, fieldMons(d, true).filter(m => m !== a), 'Riryoku: ATK kazanacak canavar', 'help');
      if (!b) return false;
      const half = Math.floor(d.atk(a) / 2);
      d.addTemp(a, -half, 0); d.addTemp(b, half, 0);
    },
  });
  S('Shield & Sword', {
    can: d => fieldMons(d, true).length > 0,
    async resolve(d) { for (const c of fieldMons(d, true)) d.addTemp(c, (c.d.def || 0) - (c.d.atk || 0), (c.d.atk || 0) - (c.d.def || 0)); },
  });
  S('Soul Release', {
    can: d => [0, 1].some(i => d.P(i).grave.length > 0),
    async resolve(d, p) {
      const cs = [...d.P(O(p)).grave, ...d.P(p).grave].slice(0, 5);
      for (const c of cs) await d.banish(c);
    },
  });
  S('Special Hurricane', {
    can: (d, p) => d.P(p).hand.length >= 2 && fieldMons(d, true).some(c => c.special),
    async resolve(d, p) {
      if (!(await discardN(d, p, 1, 'Special Hurricane: at'))) return false;
      for (const c of fieldMons(d, true).filter(m => m.special)) await d.destroy(c);
    },
  });
  S('Stray Lambs', {
    can: (d, p) => d.freeZone(p, 'mz') >= 0 && !d.P(p).summoned,
    async resolve(d, p) { for (let i = 0; i < 2; i++) await token(d, p, 'Lamb Token', 'def'); d.P(p).summoned = true; },
  });
  S('The Cheerful Coffin', {
    can: (d, p) => handMons(d, p).length > 0,
    async resolve(d, p) {
      for (let i = 0; i < 3; i++) {
        const cs = handMons(d, p); if (!cs.length) break;
        if (i > 0 && !(await d.ask(p, d.P(p).hand[0] || cs[0], `Bir canavar daha at? (${i}/3)`))) break;
        const c = await pick(d, p, cs, `Cheerful Coffin: at (${i + 1}/3)`, 'discard');
        if (!c) break;
        await d.sendToGrave(c, 'discard');
      }
    },
  });
  S('The Shallow Grave', {
    can: (d, p) => [p, O(p)].some(q => graveMons(d, q).length > 0 && d.freeZone(q, 'mz') >= 0),
    async resolve(d, p) {
      for (const q of [p, O(p)]) {
        if (d.freeZone(q, 'mz') < 0) continue;
        const t = await pick(d, q, graveMons(d, q), 'Shallow Grave: kapalı savunmada çağrılacak canavar', 'revive');
        if (t && (await d.specialSummon(q, t, { pos: 'def' }))) t.up = false;
      }
    },
  });
  S('Thousand Energy', { can: (d, p) => myUp(d, p).some(c => c.d.level === 2 && c.d.type === 'Normal Monster'), async resolve(d, p) { for (const c of myUp(d, p).filter(c => c.d.level === 2 && c.d.type === 'Normal Monster')) d.addTemp(c, 1000, 1000); } });
  S('Triangle Power', { can: (d, p) => myUp(d, p).some(c => c.d.level === 1 && c.d.type === 'Normal Monster'), async resolve(d, p) { for (const c of myUp(d, p).filter(c => c.d.level === 1 && c.d.type === 'Normal Monster')) d.addTemp(c, 2000, 2000); } });
  S('Token Thanksgiving', {
    can: d => fieldMons(d).some(c => c.d.type === 'Token'),
    async resolve(d, p) { let n = 0; for (const c of fieldMons(d).filter(c => c.d.type === 'Token')) { await d.sendToGrave(c, 'destroy'); n++; } await d.heal(p, 800 * n); },
  });
  S('Tribute Doll', {
    can: (d, p) => d.monsters(p).length > 0 && handMons(d, p, c => c.d.level === 7 && plainSummonable(c)).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p), 'Tribute Doll: tribute edilecek canavar', 'tribute');
      if (!t) return false;
      await d.sendToGrave(t, 'tribute');
      const h = await pick(d, p, handMons(d, p, c => c.d.level === 7 && plainSummonable(c)), 'Çağrılacak Level 7 canavar', 'revive');
      if (h && (await d.specialSummon(p, h))) h.attacked = true;
    },
  });
  S('Ultra Evolution Pill', {
    can: (d, p) => d.monsters(p).some(c => c.d.race === 'Reptile') && handMons(d, p, c => c.d.race === 'Dinosaur').length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p).filter(c => c.d.race === 'Reptile'), 'Tribute edilecek Reptile', 'tribute');
      if (!t) return false;
      await d.sendToGrave(t, 'tribute');
      const h = await pick(d, p, handMons(d, p, c => c.d.race === 'Dinosaur'), 'Çağrılacak Dinosaur', 'revive');
      if (h) await d.specialSummon(p, h);
    },
  });
  S("Wild Nature's Release", {
    can: d => fieldMons(d, true).some(c => c.d.race === 'Beast' || c.d.race === 'Beast-Warrior'),
    async resolve(d, p) {
      const t = await pick(d, p, fieldMons(d, true).filter(c => c.d.race === 'Beast' || c.d.race === 'Beast-Warrior'), 'Wild Nature\'s Release: hedef', 'help');
      if (!t) return false;
      d.addTemp(t, d.def(t), 0);
      (d.endQueue = d.endQueue || []).push(async () => { if (d.onField(t)) await d.destroy(t); });
    },
  });
  S('Card of Sanctity', {
    can: (d, p) => d.P(p).hand.length >= 2 && d.allField().some(c => c.owner === p),
    async resolve(d, p, self) {
      for (const c of [...d.P(p).hand, ...d.allField().filter(x => x.owner === p && x !== self)]) await d.banish(c);
      for (let i = 0; i < 2 && d.P(p).hand.length < 2 && d.P(p).deck.length; i++) await d.draw(p, 1);
    },
  });
  S('Chaos End', { can: (d, p) => d.P(p).banished.length >= 7 && fieldMons(d).length > 0, async resolve(d) { for (const c of fieldMons(d)) await d.destroy(c); } });
  S('Chaos Greed', { can: (d, p) => d.P(p).banished.length >= 4 && d.P(p).grave.length === 0, async resolve(d, p) { await d.draw(p, 2); } });
  S('Spell Reproduction', {
    can: (d, p) => d.P(p).hand.filter(c => c.d.kind === 'spell').length >= 2 && d.P(p).grave.some(c => c.d.kind === 'spell'),
    async resolve(d, p, self) {
      if (!(await discardN(d, p, 2, 'Spell Reproduction: Büyü at', c => c.d.kind === 'spell' && c !== self))) return false;
      const t = await pick(d, p, d.P(p).grave.filter(c => c.d.kind === 'spell'), 'Ele alınacak Büyü', 'help');
      if (t) await toHand(d, p, t);
    },
  });
  S('Dimension Fusion', {
    can: (d, p) => d.P(p).lp > 2000,
    async resolve(d, p) {
      await d.damage(p, 2000); if (d.over) return;
      for (const q of [p, O(p)]) for (const c of d.P(q).banished.filter(isMon)) { if (d.freeZone(q, 'mz') < 0) break; await d.specialSummon(q, c); }
    },
  });
  S('Share the Pain', {
    can: (d, p) => d.monsters(p).length > 0 && d.monsters(O(p)).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p), 'Share the Pain: tribute', 'tribute'); if (!t) return false;
      await d.sendToGrave(t, 'tribute');
      const v = await pick(d, O(p), d.monsters(O(p)), 'Share the Pain: tribute etmek zorundasın', 'tribute');
      if (v) await d.sendToGrave(v, 'tribute');
    },
  });
  S('Gather Your Mind', {
    can: (d, p) => d.P(p).deck.some(c => c.d.name === 'Gather Your Mind') && (d.flags.gym || [])[p] !== d.turn,
    async resolve(d, p) { const c = d.P(p).deck.find(x => x.d.name === 'Gather Your Mind'); if (!c) return false; flagFor(d, 'gym', p, d.turn); await toHand(d, p, c); shuffleDeck(d, p); },
  });
  S('Enchanting Fitting Room', {
    can: (d, p) => d.P(p).lp > 800 && d.P(p).deck.length >= 4,
    async resolve(d, p) {
      await d.damage(p, 800); if (d.over) return;
      const top = d.P(p).deck.splice(0, 4);
      for (const c of top) { if (c.d.type === 'Normal Monster' && (c.d.level || 0) <= 3 && d.freeZone(p, 'mz') >= 0) { d.P(p).deck.unshift(c); await d.specialSummon(p, c); } else d.P(p).deck.push(c); }
    },
  });
  S('Mesmeric Control', { async resolve(d, p) { flagFor(d, 'noPos', O(p), d.turn + 1); } });
  S('The Secret of the Bandit', { can: d => d.phase === 'main1' && fieldMons(d, true).length > 0, async resolve(d, p) { const t = await pick(d, p, fieldMons(d, true), 'Hedef canavar', 'help'); if (t) d.addTemp(t, 500, 0); } });
  S('Fengsheng Mirror', { can: (d, p) => d.P(O(p)).hand.some(c => FX[c.d.name] && FX[c.d.name].spirit), async resolve(d, p) { const c = d.P(O(p)).hand.find(x => FX[x.d.name] && FX[x.d.name].spirit); if (c) await d.sendToGrave(c, 'discard'); } });

  // ======================================================================== SÜREKLİ BÜYÜLER (notify kancaları)
  S('Card of Safe Return', { sub: 'continuous', async onSpecial(d, p, x, c, from) { if (c.owner === p && from === 'grave') await d.draw(p, 1); } });
  S('Dark Room of Nightmare', { sub: 'continuous', async onEffectDamage(d, p, x, victim, n, src) { if (victim === O(p) && src !== x) await d.damage(victim, 300, x); } });
  S('Soul Absorption', { sub: 'continuous', async onBanish(d, p, x) { await d.heal(p, 500); } });
  S('Spring of Rebirth', { sub: 'continuous', async onBounce(d, p, x, c) { if (c.owner === p) await d.heal(p, 500); } });
  S('Kishido Spirit', { sub: 'continuous', tieSafe: true });
  S("Gravekeeper's Servant", {
    sub: 'continuous',
    async attackToll(d, owner, atker, p) { if (p === owner) return true; const dk = d.P(p).deck; if (!dk.length) return false; const c = dk.shift(); d.P(p).grave.push(c); c.graveInfo = { turn: d.turn, why: 'cost', from: 'deck' }; return true; },
  });
  S('Toll', { sub: 'continuous', async attackToll(d, owner, atker, p) { if (d.P(p).lp <= 500) return false; await d.damage(p, 500); return true; } });
  S('The Dark Door', { sub: 'continuous', restrictAttack: (d, c) => (d.bpAttacked && d.bpAttacked.size > 0 && !d.bpAttacked.has(c.uid) ? 'The Dark Door: bu Battle Phase yalnızca 1 canavar saldırabilir' : null) });
  S('Stumbling', { sub: 'continuous', async onAnySummon(d, p, x, c) { if (c.up && c.pos === 'atk') c.pos = 'def'; } });
  S('Blessings of the Nile', { sub: 'continuous', async onDiscard(d, p, x, c) { if (c.owner === p && d.src && d.src.p === O(p)) await d.heal(p, 1000); } });
  S('Jam Breeding Machine', {
    sub: 'continuous',
    async standby(d, p) { if (d.freeZone(p, 'mz') >= 0) await token(d, p, 'Slime Token', 'atk'); },
  });

  // ======================================================================== QUICK-PLAY BÜYÜLER
  S('De-Fusion', {
    can: d => fieldMons(d, true).some(c => c.d.type === 'Fusion Monster'),
    async resolve(d, p) {
      const t = await pick(d, p, fieldMons(d, true).filter(c => c.d.type === 'Fusion Monster'), 'De-Fusion: Extra Deck\'e dönecek Fusion', 'harm');
      if (!t) return false;
      const q = t.owner, mats = t.d.materials || [];
      await d.bounce(t);
      const pool = [...d.P(q).grave];
      const chosen = [];
      for (const m of mats) { const c = pool.find(x => x.d.name === m && !chosen.includes(x)); if (!c) return; chosen.push(c); }
      if (chosen.length !== mats.length || d.freeZone(q, 'mz') < 0) return;
      for (const c of chosen) { if (d.freeZone(q, 'mz') >= 0) await d.specialSummon(q, c); }
    },
  });
  S('Malice Dispersion', {
    can: (d, p) => d.P(p).hand.length >= 2 && anyST(d).some(c => c.up && c.d.kind === 'trap' && FX[c.d.name] && FX[c.d.name].sub === 'continuous'),
    async resolve(d, p) {
      if (!(await discardN(d, p, 1, 'Malice Dispersion: at'))) return false;
      for (const c of anyST(d).filter(c => c.up && c.d.kind === 'trap' && FX[c.d.name] && FX[c.d.name].sub === 'continuous')) await d.destroy(c);
    },
  });
  S('Scapegoat', {
    can: (d, p) => d.freeZone(p, 'mz') >= 0 && !d.P(p).summoned,
    async resolve(d, p) { for (let i = 0; i < 4; i++) { if (d.freeZone(p, 'mz') < 0) break; await token(d, p, 'Sheep Token', 'def'); } d.P(p).summoned = true; },
  });
  S('Monster Recovery', {
    can: (d, p) => myUp(d, p).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p), 'Monster Recovery: desteye dönecek canavar', 'help');
      if (!t) return false;
      const n = d.P(p).hand.length;
      d.removeFromWherever(t); t.up = true; t.pos = 'atk'; t.bonus = { atk: 0, def: 0 }; d.P(p).deck.push(t);
      for (const c of d.P(p).hand.splice(0)) d.P(p).deck.push(c);
      shuffleDeck(d, p);
      await d.sweepEquips();
      await d.draw(p, n);
    },
  });

  // Quick-Play Büyülere varsayılan tepki ipuçları (AI): kullanışlı durumlarda tepki verir
  const qpAI = {
    'Mystical Space Typhoon': (d, p, c, ctx) => ctx.phase === 'end' || ctx.phase === 'battle' ? [...d.P(O(p)).st, d.P(O(p)).field].some(x => x && x.up) : false,
    'Book of Moon': (d, p, c, ctx) => !!(ctx && ctx.attacker && ctx.attacker.owner !== p && d.atk(ctx.attacker) >= 2000),
    'Enemy Controller': () => false,
  };
  for (const [n, f] of Object.entries(qpAI)) if (FX[n]) FX[n].ai = f;
  // Book of Moon saldırıya karşılık verildiğinde saldıran canavarı çevirir ve saldırıyı iptal eder
  if (FX['Book of Moon'] && !FX['Book of Moon']._quick) {
    const orig = FX['Book of Moon'].resolve;
    FX['Book of Moon']._quick = true;
    FX['Book of Moon'].resolve = async function (d, p, c, ctx) {
      if (ctx && ctx.attacker && d.inMZ(ctx.attacker) && ctx.attacker.up) {
        ctx.attacker.up = false; ctx.attacker.pos = 'def'; await d.ev('pos', { p: ctx.attacker.owner, card: ctx.attacker }); ctx.negated = true; return;
      }
      return orig.call(this, d, p, c, ctx);
    };
  }
  if (FX['Mystical Space Typhoon']) FX['Mystical Space Typhoon'].triggers = ['attack', 'phase', 'spell'];
});
