// Kart efektleri — 2. paket (Duel Monsters dönemi genişletmesi).
// Yardımcı fonksiyonlarla kısa tanımlar. Daha önce elle yazılmış bir efekt varsa ona dokunulmaz.
// partial:true = kartın temel istatistikleri ve ana efekti oynanır, ikincil bir cümlesi henüz kodlanmadı.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const equipH = E.equipHelper;
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
  const fieldMons = (d, upOnly) => d.allField().filter(c => isMon(c) && (!upOnly || c.up));
  const stZone = (d, p) => [d.P(p).field, ...d.P(p).st].filter(Boolean);
  const anyST = d => [0, 1].flatMap(i => stZone(d, i));
  const graveMons = (d, p, f = () => true) => d.P(p).grave.filter(c => isMon(c) && f(c));
  const nm = c => c.d.alias || c.d.name; // Dark Magician, the Pharaoh's Servant sahada/mezarlıkta 'Dark Magician' sayılır
  const hasName = (d, p, name) => d.monsters(p, true).some(c => nm(c) === name);
  const toHand = async (d, p, c, why = 'search') => { const loc = d.locate(c); d.removeFromWherever(c); d.P(p).hand.push(c); await d.ev(why, { p, card: c }); if (loc && loc.kind === 'deck') await d.handReact('deckToHand', p, c); };
  const randOf = (d, arr) => arr[Math.floor(d.rng() * arr.length)];
  const lvl = c => c.d.level || 0;

  async function discardCost(d, p, n, prompt, filter = () => true) {
    const hand = d.P(p).hand.filter(filter);
    if (hand.length < n) return false;
    for (let i = 0; i < n; i++) {
      const c = await pick(d, p, d.P(p).hand.filter(filter), `${prompt} (${i + 1}/${n})`, 'discard');
      if (!c) return false;
      await d.sendToGrave(c, 'discard');
    }
    return true;
  }

  // =========================================================== BÜYÜLER
  const simple = (name, def) => S(name, def);

  // --- LP / hasar / çekiş
  simple('Blue Medicine', { async resolve(d, p) { await d.heal(p, 400); } });
  simple("Goblin's Secret Remedy", { async resolve(d, p) { await d.heal(p, 600); } });
  simple('Soul of the Pure', { async resolve(d, p) { await d.heal(p, 800); } });
  simple('Final Flame', { async resolve(d, p) { await d.damage(O(p), 600); } });
  simple('Raimei', { async resolve(d, p) { await d.damage(O(p), 300); } });
  simple('Goblin Thief', { async resolve(d, p) { await d.damage(O(p), 500); await d.heal(p, 500); } });
  simple('Tremendous Fire', { async resolve(d, p) { await d.damage(O(p), 1000); await d.damage(p, 500); } });
  simple('Upstart Goblin', { async resolve(d, p) { await d.draw(p, 1); await d.heal(O(p), 1000); } });
  simple('Poison of the Old Man', { async resolve(d, p) { if (d.P(O(p)).lp <= 800) await d.damage(O(p), 800); else await d.heal(p, 1200); } });
  simple('Mass Driver', {
    can: (d, p) => d.monsters(p).length > 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(p), 'Mass Driver: tribute edilecek canavar', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); await d.damage(O(p), 400); },
  });
  simple('Emergency Provisions', {
    can: (d, p) => d.P(p).st.some(Boolean),
    async resolve(d, p, self) {
      const cs = d.P(p).st.filter(c => c && c !== self); let n = 0;
      for (const c of cs) { await d.sendToGrave(c, 'cost'); n++; }
      await d.heal(p, 1000 * n);
    },
  });
  simple('Mystik Wok', {
    can: (d, p) => d.monsters(p).length > 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(p), 'Mystik Wok: tribute edilecek canavar', 'tribute'); if (!t) return false; const g = Math.max(d.atk(t), d.def(t)); await d.sendToGrave(t, 'tribute'); await d.heal(p, g); },
  });
  simple('Inferno Fire Blast', {
    can: (d, p) => hasName(d, p, 'Red-Eyes Black Dragon'),
    async resolve(d, p) { const t = d.monsters(p, true).find(c => nm(c) === 'Red-Eyes Black Dragon'); await d.damage(O(p), t.d.atk); },
  });
  simple("Dragon's Gunfire", { can: (d, p) => d.monsters(p, true).some(c => c.d.race === 'Dragon'), async resolve(d, p) { await d.damage(O(p), 800); } });
  simple('Stamping Destruction', {
    can: (d, p) => d.monsters(p, true).some(c => c.d.race === 'Dragon') && anyST(d).length > 0,
    async resolve(d, p, self) { const t = await pick(d, p, anyST(d).filter(c => c !== self), 'Stamping Destruction: yok edilecek kart', 'harm'); if (!t) return false; await d.destroy(t, self); await d.damage(O(p), 500); },
  });
  simple('Reload', { async resolve(d, p) { const n = d.P(p).hand.length; for (const c of d.P(p).hand.splice(0)) d.P(p).deck.push(c); E.shuffle(d.P(p).deck, d.rng); await d.draw(p, n); } });

  // --- Yok etme / kaldırma
  simple('Tribute to the Doomed', {
    can: (d, p) => d.P(p).hand.length >= 2 && fieldMons(d).length > 0,
    async resolve(d, p) {
      if (!(await discardCost(d, p, 1, 'Tribute to the Doomed: at'))) return false;
      const t = await pick(d, p, fieldMons(d), 'Yok edilecek canavar', 'harm'); if (t) await d.destroy(t);
    },
  });
  simple('Dark Core', {
    can: (d, p) => d.P(p).hand.length >= 2 && fieldMons(d, true).length > 0,
    async resolve(d, p) {
      if (!(await discardCost(d, p, 1, 'Dark Core: at'))) return false;
      const t = await pick(d, p, fieldMons(d, true), 'Çıkarılacak canavar', 'harm'); if (t) await d.banish(t);
    },
  });
  simple('Burst Stream of Destruction', {
    can: (d, p) => hasName(d, p, 'Blue-Eyes White Dragon') && d.monsters(O(p)).length > 0,
    async resolve(d, p) { for (const c of d.monsters(O(p))) await d.destroy(c); },
  });
  simple('Exile of the Wicked', { noAI: true, can: d => fieldMons(d).some(c => c.d.race === 'Fiend'), async resolve(d) { for (const c of fieldMons(d).filter(c => c.d.race === 'Fiend')) await d.destroy(c); } });
  simple('Thunder Crash', { noAI: true, can: (d, p) => d.monsters(p).length > 0, async resolve(d, p) { let n = 0; for (const c of d.monsters(p)) { await d.destroy(c); n++; } await d.damage(O(p), 300 * n); } });
  simple('Final Destiny', {
    noAI: true, can: (d, p) => d.P(p).hand.length >= 6,
    async resolve(d, p, self) { if (!(await discardCost(d, p, 5, 'Final Destiny: at'))) return false; for (const c of d.allField().filter(x => x !== self)) await d.destroy(c, self); },
  });
  simple('Order to Charge', {
    can: (d, p) => d.monsters(p).some(c => c.d.type === 'Normal Monster') && d.monsters(O(p)).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p).filter(c => c.d.type === 'Normal Monster'), 'Order to Charge: tribute (Normal canavar)', 'tribute'); if (!t) return false;
      await d.sendToGrave(t, 'tribute');
      const v = await pick(d, p, d.monsters(O(p)), 'Yok edilecek rakip canavarı', 'harm'); if (v) await d.destroy(v);
    },
  });
  simple('Thousand Knives', {
    can: (d, p) => hasName(d, p, 'Dark Magician') && d.monsters(O(p)).length > 0,
    async resolve(d, p) { const v = await pick(d, p, d.monsters(O(p)), 'Thousand Knives: yok edilecek canavar', 'harm'); if (v) await d.destroy(v); },
  });
  simple('Dark Magic Attack', {
    can: (d, p) => hasName(d, p, 'Dark Magician') && stZone(d, O(p)).length > 0,
    async resolve(d, p, self) { for (const c of stZone(d, O(p))) await d.destroy(c, self); },
  });
  simple('Eternal Rest', { can: d => d.allField().some(c => c.equipTo != null), async resolve(d) { const ts = new Set(d.allField().filter(c => c.equipTo != null).map(c => c.equipTo)); for (const m of fieldMons(d).filter(m => ts.has(m.uid))) await d.destroy(m); } });
  simple('De-Spell', {
    can: d => anyST(d).some(c => c.d.kind === 'spell'),
    async resolve(d, p, self) { const t = await pick(d, p, anyST(d).filter(c => c.d.kind === 'spell' && c !== self), 'De-Spell: yok edilecek Büyü', 'harm'); if (!t) return false; await d.destroy(t, self); },
  });
  simple('Remove Trap', {
    can: d => anyST(d).some(c => c.d.kind === 'trap' && c.up),
    async resolve(d, p, self) { const t = await pick(d, p, anyST(d).filter(c => c.d.kind === 'trap' && c.up), 'Remove Trap: yok edilecek Tuzak', 'harm'); if (!t) return false; await d.destroy(t, self); },
  });
  simple('Spiritualism', {
    can: (d, p) => stZone(d, O(p)).length > 0,
    async resolve(d, p) { const t = await pick(d, p, stZone(d, O(p)), 'Spiritualism: ele dönecek kart', 'harm'); if (!t) return false; await d.bounce(t); },
  });
  simple('Back to Square One', {
    can: (d, p) => d.P(p).hand.length >= 2 && fieldMons(d).length > 0,
    async resolve(d, p) {
      if (!(await discardCost(d, p, 1, 'Back to Square One: at'))) return false;
      const t = await pick(d, p, fieldMons(d), 'Desteye dönecek canavar', 'harm'); if (!t) return;
      d.removeFromWherever(t); t.up = true; t.pos = 'atk'; t.bonus = { atk: 0, def: 0 }; t.owner = t.origOwner; d.P(t.owner).deck.unshift(t); await d.ev('bounce', { card: t }); await d.sweepEquips();
    },
  });

  // --- Mezarlık / el
  simple('Dark Factory of Mass Production', {
    can: (d, p) => graveMons(d, p, c => c.d.type === 'Normal Monster').length >= 1,
    async resolve(d, p) {
      for (let i = 0; i < 2; i++) { const c = await pick(d, p, graveMons(d, p, c => c.d.type === 'Normal Monster'), `Dark Factory: ele eklenecek Normal canavar (${i + 1}/2)`, 'help'); if (c) await toHand(d, p, c); }
    },
  });
  simple('The Warrior Returning Alive', { can: (d, p) => graveMons(d, p, c => c.d.race === 'Warrior').length > 0, async resolve(d, p) { const c = await pick(d, p, graveMons(d, p, c => c.d.race === 'Warrior'), 'Mezarlıktan Warrior al', 'help'); if (!c) return false; await toHand(d, p, c); } });
  simple('Monster Reincarnation', {
    can: (d, p) => d.P(p).hand.length >= 2 && graveMons(d, p).length > 0,
    async resolve(d, p) { if (!(await discardCost(d, p, 1, 'Monster Reincarnation: at'))) return false; const c = await pick(d, p, graveMons(d, p), 'Mezarlıktan canavar al', 'help'); if (c) await toHand(d, p, c); },
  });
  simple('Salvage', { can: (d, p) => graveMons(d, p, c => c.d.attr === 'WATER' && c.d.atk <= 1500).length >= 1, async resolve(d, p) { for (let i = 0; i < 2; i++) { const c = await pick(d, p, graveMons(d, p, c => c.d.attr === 'WATER' && c.d.atk <= 1500), `Salvage: WATER canavar (${i + 1}/2)`, 'help'); if (c) await toHand(d, p, c); } } });
  simple('Emblem of Dragon Destroyer', {
    can: (d, p) => [...d.P(p).deck, ...d.P(p).grave].some(c => c.d.name === 'Buster Blader'),
    async resolve(d, p) { const c = [...d.P(p).deck, ...d.P(p).grave].find(c => c.d.name === 'Buster Blader'); if (!c) return false; await toHand(d, p, c); },
  });
  simple('Terraforming', { can: (d, p) => d.P(p).deck.some(c => E.isFieldSpell(c)), async resolve(d, p) { const c = await pick(d, p, d.P(p).deck.filter(c => E.isFieldSpell(c)), 'Terraforming: Saha Büyüsü', 'help'); if (!c) return false; await toHand(d, p, c); } });
  simple('Fairy of the Spring', { can: (d, p) => d.P(p).grave.some(c => c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub === 'equip'), async resolve(d, p) { const c = await pick(d, p, d.P(p).grave.filter(c => c.d.kind === 'spell' && FX[c.d.name] && FX[c.d.name].sub === 'equip'), 'Equip Büyüsü al', 'help'); if (!c) return false; await toHand(d, p, c); } });
  simple('Confiscation', {
    can: (d, p) => d.P(p).lp > 1000 && d.P(O(p)).hand.length > 0,
    async resolve(d, p) { await d.damage(p, 1000); if (d.over) return; const c = await pick(d, p, d.P(O(p)).hand, 'Confiscation: attırılacak kart (rakibin eli)', 'harm'); if (c) await d.sendToGrave(c, 'discard'); },
  });
  simple('Delinquent Duo', {
    can: (d, p) => d.P(p).lp > 1000 && d.P(O(p)).hand.length > 0,
    async resolve(d, p) {
      await d.damage(p, 1000); if (d.over) return;
      const H = d.P(O(p)).hand; const r = randOf(d, H); if (r) await d.sendToGrave(r, 'discard');
      const c = await pick(d, p, d.P(O(p)).hand, 'Delinquent Duo: attırılacak 2. kart', 'harm'); if (c) await d.sendToGrave(c, 'discard');
    },
  });
  simple('The Forceful Sentry', {
    can: (d, p) => d.P(O(p)).hand.length > 0,
    async resolve(d, p) { const c = await pick(d, p, d.P(O(p)).hand, 'Forceful Sentry: desteye dönecek kart', 'harm'); if (!c) return false; d.removeFromWherever(c); d.P(c.owner).deck.push(c); E.shuffle(d.P(c.owner).deck, d.rng); },
  });
  simple('Exchange', {
    can: (d, p) => d.P(p).hand.length > 1 && d.P(O(p)).hand.length > 0,
    async resolve(d, p, self) {
      const mine = await pick(d, p, d.P(p).hand, 'Exchange: verilecek kart', 'discard'); const theirs = randOf(d, d.P(O(p)).hand);
      if (!mine || !theirs) return false;
      d.removeFromWherever(mine); d.removeFromWherever(theirs);
      mine.owner = O(p); mine.origOwner = O(p); theirs.owner = p; theirs.origOwner = p;
      d.P(O(p)).hand.push(mine); d.P(p).hand.push(theirs);
    },
  });
  simple('Sage\'s Stone', { can: (d, p) => hasName(d, p, 'Dark Magician Girl') && [...d.P(p).hand, ...d.P(p).deck].some(c => c.d.name === 'Dark Magician') && d.freeZone(p, 'mz') >= 0, async resolve(d, p) { const c = [...d.P(p).hand, ...d.P(p).deck].find(c => c.d.name === 'Dark Magician'); await d.specialSummon(p, c); } });
  simple("Knight's Title", {
    can: (d, p) => hasName(d, p, 'Dark Magician') && [...d.P(p).hand, ...d.P(p).deck, ...d.P(p).grave].some(c => c.d.name === 'Dark Magician Knight'),
    async resolve(d, p) { const t = d.monsters(p, true).find(c => nm(c) === 'Dark Magician'); await d.sendToGrave(t, 'tribute'); const c = [...d.P(p).hand, ...d.P(p).deck, ...d.P(p).grave].find(c => c.d.name === 'Dark Magician Knight'); await d.specialSummon(p, c); },
  });
  simple('Dedication through Light and Darkness', {
    can: (d, p) => hasName(d, p, 'Dark Magician') && [...d.P(p).hand, ...d.P(p).deck, ...d.P(p).grave].some(c => c.d.name === 'Dark Magician of Chaos'),
    async resolve(d, p) { const t = d.monsters(p, true).find(c => nm(c) === 'Dark Magician'); await d.sendToGrave(t, 'tribute'); const c = [...d.P(p).hand, ...d.P(p).deck, ...d.P(p).grave].find(c => c.d.name === 'Dark Magician of Chaos'); await d.specialSummon(p, c); },
  });
  simple('Elegant Egotist', {
    can: (d, p) => hasName(d, p, 'Harpie Lady') && d.freeZone(p, 'mz') >= 0 && [...d.P(p).hand, ...d.P(p).deck].some(c => c.d.name === 'Harpie Lady' || c.d.name === 'Harpie Lady Sisters'),
    async resolve(d, p) {
      const cs = [...d.P(p).hand, ...d.P(p).deck].filter(c => c.d.name === 'Harpie Lady' || c.d.name === 'Harpie Lady Sisters');
      const c = await pick(d, p, cs, 'Elegant Egotist: çağrılacak Harpie', 'revive'); if (c) await d.specialSummon(p, c);
    },
  });
  simple('The Flute of Summoning Dragon', {
    can: (d, p) => hasName(d, p, 'Lord of D.') && d.P(p).hand.some(c => c.d.race === 'Dragon' && isMon(c)) && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) { for (let i = 0; i < 2; i++) { const c = await pick(d, p, d.P(p).hand.filter(c => c.d.race === 'Dragon' && isMon(c)), 'Flute: çağrılacak Dragon', 'revive'); if (c) await d.specialSummon(p, c); } },
  });
  simple('Insect Imitation', {
    can: (d, p) => d.monsters(p).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p).filter(m => d.P(p).deck.some(c => c.d.race === 'Insect' && lvl(c) === lvl(m) + 1)), 'Insect Imitation: tribute', 'tribute'); if (!t) return false;
      const L = lvl(t) + 1; await d.sendToGrave(t, 'tribute');
      const c = await pick(d, p, d.P(p).deck.filter(c => c.d.race === 'Insect' && lvl(c) === L), 'Çağrılacak Insect', 'revive'); if (c) await d.specialSummon(p, c);
    },
  });
  simple('Limiter Removal', { can: (d, p) => d.monsters(p, true).some(c => c.d.race === 'Machine'), async resolve(d, p, self) { for (const m of d.monsters(p, true).filter(c => c.d.race === 'Machine')) d.addTemp(m, d.atk(m)); d.flags.limiter = d.flags.limiter || []; d.flags.limiter.push(...d.monsters(p, true).filter(c => c.d.race === 'Machine')); } });
  simple('Autonomous Action Unit', {
    can: (d, p) => d.P(p).lp > 1500 && d.freeZone(p, 'mz') >= 0 && graveMons(d, O(p)).length > 0,
    async resolve(d, p) { const c = await pick(d, p, graveMons(d, O(p)), 'Autonomous Action Unit: rakibin mezarlığından çağır', 'revive'); if (!c) return false; await d.damage(p, 1500); if (!d.over) await d.specialSummon(p, c); },
  });
  simple("Archfiend's Roar", {
    manual: true, can: (d, p) => d.P(p).lp > 500 && d.freeZone(p, 'mz') >= 0 && graveMons(d, p, c => /Archfiend/.test(c.d.name)).length > 0,
    async resolve(d, p) { const c = await pick(d, p, graveMons(d, p, c => /Archfiend/.test(c.d.name)), 'Archfiend', 'revive'); if (!c) return false; await d.damage(p, 500); if (!d.over) await d.specialSummon(p, c); },
  });

  // --- Kontrol
  simple('Change of Heart', {
    noAI: false, can: (d, p) => d.monsters(O(p), true).length > 0 && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(O(p), true), 'Change of Heart: kontrol alınacak canavar', 'harm'); if (!t) return false; await d.takeControl(t, p, true); },
  });
  simple('Mind Control', {
    can: (d, p) => d.monsters(O(p), true).length > 0 && d.freeZone(p, 'mz') >= 0,
    async resolve(d, p) { const t = await pick(d, p, d.monsters(O(p), true), 'Mind Control: kontrol alınacak canavar', 'harm'); if (!t) return false; await d.takeControl(t, p, true); t.attacked = true; },
  });
  simple('Creature Swap', {
    can: (d, p) => d.monsters(p).length > 0 && d.monsters(O(p)).length > 0,
    async resolve(d, p) {
      const a = await pick(d, p, d.monsters(p), 'Creature Swap: verilecek canavar', 'tribute'); const b = await pick(d, p, d.monsters(O(p)), 'Creature Swap: alınacak canavar', 'harm');
      if (!a || !b) return false;
      const za = d.locate(a).idx, zb = d.locate(b).idx;
      d.P(p).mz[za] = b; d.P(O(p)).mz[zb] = a; a.owner = O(p); b.owner = p; a.attacked = b.attacked = true; a.moved = b.moved = true;
      await d.ev('control', { p, card: b }); await d.ev('control', { p: O(p), card: a });
    },
  });

  // --- Pozisyon
  simple('Earthquake', { noAI: true, can: d => fieldMons(d, true).some(c => c.pos === 'atk'), async resolve(d) { for (const c of fieldMons(d, true).filter(c => c.pos === 'atk')) { c.pos = 'def'; await d.ev('pos', { p: c.owner, card: c }); } } });
  simple('Curse of Fiend', { noAI: true, can: d => fieldMons(d, true).length > 0, async resolve(d) { for (const c of fieldMons(d, true)) { c.pos = c.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: c.owner, card: c }); } } });
  simple('Level Limit - Area B', { noAI: true, can: d => fieldMons(d, true).some(c => lvl(c) >= 4 && c.pos === 'atk'), async resolve(d) { for (const c of fieldMons(d, true).filter(c => lvl(c) >= 4)) { c.pos = 'def'; await d.ev('pos', { p: c.owner, card: c }); } } });
  simple('Book of Taiyou', { can: d => fieldMons(d).some(c => !c.up), async resolve(d, p) { const t = await pick(d, p, fieldMons(d).filter(c => !c.up), 'Book of Taiyou: çevrilecek canavar', 'harm'); if (!t) return false; t.up = true; t.pos = 'atk'; await d.ev('flip', { p: t.owner, card: t }); } });
  simple('Dark-Piercing Light', { can: (d, p) => d.monsters(O(p)).some(c => !c.up), async resolve(d, p) { for (const c of d.monsters(O(p)).filter(c => !c.up)) { c.up = true; await d.ev('flip', { p: c.owner, card: c }); } } });
  simple('Block Attack', { can: (d, p) => d.monsters(O(p), true).some(c => c.pos === 'atk'), async resolve(d, p) { const t = await pick(d, p, d.monsters(O(p), true).filter(c => c.pos === 'atk'), 'Block Attack: savunmaya çevrilecek', 'harm'); if (!t) return false; t.pos = 'def'; await d.ev('pos', { p: t.owner, card: t }); } });
  simple('Enemy Controller', { can: (d, p) => d.monsters(O(p), true).length > 0, async resolve(d, p) { const t = await pick(d, p, d.monsters(O(p), true), 'Enemy Controller: pozisyonu değişecek', 'harm'); if (!t) return false; t.pos = t.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: t.owner, card: t }); } });

  // --- Geçici güçlendirme
  simple('Rush Recklessly', { can: d => fieldMons(d, true).length > 0, async resolve(d, p) { const t = await pick(d, p, d.monsters(p, true).length ? d.monsters(p, true) : fieldMons(d, true), 'Rush Recklessly: +700 ATK', 'help'); if (!t) return false; d.addTemp(t, 700); } });
  simple('The Reliable Guardian', { can: (d, p) => d.monsters(p, true).length > 0, async resolve(d, p) { const t = await pick(d, p, d.monsters(p, true), 'DEF +700', 'help'); if (!t) return false; d.addTemp(t, 0, 700); } });
  simple('Graceful Dice', { can: (d, p) => d.monsters(p, true).length > 0, async resolve(d, p) { const r = (await d.roll(p))[0]; for (const m of d.monsters(p, true)) d.addTemp(m, r * 100, r * 100); } });
  simple('Yellow Luster Shield', { sub: 'continuous', async resolve() {}, mod(c, key, d, f) { return key === 'def' && isMon(c) && c.owner === f.owner ? 300 : 0; } });
  simple('Chorus of Sanctuary', { sub: 'continuous', async resolve() {}, mod(c, key) { return key === 'def' && isMon(c) && c.pos === 'def' ? 500 : 0; } });
  simple('Banner of Courage', { sub: 'continuous', async resolve() {}, mod(c, key, d, f) { return key === 'atk' && isMon(c) && c.owner === f.owner && d.phase === 'battle' && d.active === f.owner ? 200 : 0; } });
  simple('The A. Forces', { sub: 'continuous', async resolve() {}, mod(c, key, d, f) { if (key !== 'atk' || !isMon(c) || c.owner !== f.owner || c.d.race !== 'Warrior') return 0; return 200 * d.monsters(f.owner, true).filter(m => m.d.race === 'Warrior' || m.d.race === 'Spellcaster').length; } });
  simple('Harpies\' Hunting Ground', { sub: 'field', async resolve() {}, mod(c) { return isMon(c) && c.d.race === 'Winged Beast' ? 200 : 0; } });
  simple('A Legendary Ocean', { sub: 'field', async resolve() {}, mod(c) { return isMon(c) && c.d.attr === 'WATER' ? 200 : 0; } });
  const fa = (name, attr, up, down) => S(name, { sub: 'field', async resolve() {}, mod(c, key) { return isMon(c) && c.d.attr === attr ? (key === 'atk' ? up : down) : 0; } });
  fa('Umiiruka', 'WATER', 500, -400); fa('Luminous Spark', 'LIGHT', 500, -400); fa('Molten Destruction', 'FIRE', 500, -400); fa('Rising Air Current', 'WIND', 500, -400);

  // --- Kısıtlayıcı sürekli büyüler
  simple('Messenger of Peace', {
    sub: 'continuous', async resolve() {},
    restrictAttack: (d, c) => (d.atk(c) >= 1500 ? 'Messenger of Peace: ATK 1500+ saldıramaz' : null),
    async standby(d, p, c) { if (d.P(p).lp > 100) await d.damage(p, 100, c); else await d.destroy(c); },
  });
  simple('Insect Barrier', { sub: 'continuous', async resolve() {}, restrictAttack: (d, c, f) => (c.owner !== f.owner && c.d.race === 'Insect' ? 'Insect Barrier: Insect saldıramaz' : null) });
  simple('Vengeful Bog Spirit', { sub: 'continuous', async resolve() {}, restrictAttack: (d, c) => (c.placedTurn === d.turn ? 'Vengeful Bog Spirit: çağrıldığı tur saldıramaz' : null) });
  simple('Final Countdown', {
    sub: 'continuous', can: (d, p) => d.P(p).lp > 2000, async resolve(d, p, c) { await d.damage(p, 2000, c); c.counter2 = 0; },
    async standby(d, p, c) { c.counter2 = (c.counter2 || 0) + 1; if (c.counter2 >= 20) await d.win(p, 'Final Countdown!'); },
  });

  // --- Equip büyüleri
  const eqs = [
    ['Beast Fangs', 'Beast', 300, 300], ['Vile Germs', 'Plant', 300, 300], ['Violet Crystal', 'Zombie', 300, 300], ['Electro-Whip', 'Thunder', 300, 300],
    ['Dark Energy', 'Fiend', 300, 300], ['Silver Bow and Arrow', 'Fairy', 300, 300], ['Follow Wind', 'Winged Beast', 300, 300], ['Raise Body Heat', 'Dinosaur', 300, 300],
    ['Power of Kaishin', 'Aqua', 300, 300], ['Laser Cannon Armor', 'Insect', 300, 300], ['Mystical Moon', 'Beast-Warrior', 300, 300], ['Cestus of Dagla', 'Fairy', 500, 0],
    ['Burning Spear', 'FIRE', 400, -200], ["Elf's Light", 'LIGHT', 400, -200], ['Gust Fan', 'WIND', 400, -200], ['Invigoration', 'EARTH', 400, -200], ['Steel Shell', 'WATER', 400, -200],
    ['Salamandra', 'FIRE', 700, 0], ['Lightning Blade', 'Warrior', 800, 0], ['Horn of the Unicorn', null, 700, 700], ['Sword of Deep-Seated', null, 500, 500],
    ['Malevolent Nuzzler', null, 700, 0], ['Gravity Axe - Grarl', null, 500, 0], ['Butterfly Dagger - Elma', null, 300, 0], ['Axe of Despair', null, 1000, 0],
    ['Fusion Weapon', c => c.d.type === 'Fusion Monster' && lvl(c) <= 6, 1500, 1500], ['Ritual Weapon', c => /Ritual/.test(c.d.type) && lvl(c) <= 6, 1500, 1500],
    ["Sword of Dragon's Soul", 'Warrior', 700, 0], ['Fusion Sword Murasame Blade', 'Warrior', 800, 0], ['Horn of Light', null, 0, 800], ["Rod of Silence - Kay'est", null, 0, 500],
    ['Stim-Pack', null, 500, 0], ['Mask of Brutality', null, 1000, -1000], ['Machine Duplication', null, 0, 0],
  ];
  for (const [n, r, a, dd] of eqs) if (n !== 'Machine Duplication' && !FX[n]) equipH(n, r, a, dd);
  equipH('Big Bang Shot', null, 400, 0, { givesPierce: true });
  equipH('Fairy Meteor Crush', null, 0, 0, { givesPierce: true });
  equipH('Shooting Star Bow - Ceal', null, -1000, 0, { givesDirect: true });
  equipH('Opti-Camouflage Armor', c => lvl(c) === 1, 0, 0, { givesDirect: true });
  equipH('United We Stand', null, 0, 0, { mod(m, key, d, f) { return f.equipTo === m.uid ? 800 * d.monsters(f.owner, true).length : 0; } });
  equipH('Megamorph', null, 0, 0, { mod(m, key, d, f) { return f.equipTo === m.uid && key === 'atk' ? (d.P(f.owner).lp < d.P(O(f.owner)).lp ? m.d.atk : 0) : 0; } });

  // =========================================================== TUZAKLAR (manuel: kendi turunda, set edildiği turdan sonra)
  const trap = (n, def) => S(n, Object.assign({ manual: true }, def));
  trap('Compulsory Evacuation Device', { can: d => fieldMons(d).length > 0, async resolve(d, p) { const t = await pick(d, p, fieldMons(d), 'Compulsory Evacuation Device: ele dönecek canavar', 'harm'); if (!t) return false; await d.bounce(t); } });
  trap('Call of the Haunted', {
    sub: 'continuous', can: (d, p) => d.freeZone(p, 'mz') >= 0 && graveMons(d, p).length > 0,
    async resolve(d, p, c) { const m = await pick(d, p, graveMons(d, p), 'Call of the Haunted: çağrılacak canavar', 'revive'); if (!m) return false; await d.specialSummon(p, m); c.equipTo = m.uid; },
    async onLeaveField(d, p, c) { const m = d.allField().find(x => x.uid === c.equipTo); if (m) await d.destroy(m); },
  });
  trap('Soul Resurrection', { can: (d, p) => d.freeZone(p, 'mz') >= 0 && graveMons(d, p, c => c.d.type === 'Normal Monster').length > 0, async resolve(d, p) { const m = await pick(d, p, graveMons(d, p, c => c.d.type === 'Normal Monster'), 'Soul Resurrection', 'revive'); if (!m) return false; await d.specialSummon(p, m, { pos: 'def' }); } });
  trap('Raigeki Break', {
    can: (d, p) => d.P(p).hand.length >= 1 && d.allField().length > 0,
    async resolve(d, p, self) { if (!(await discardCost(d, p, 1, 'Raigeki Break: at'))) return false; const t = await pick(d, p, d.allField().filter(c => c !== self), 'Yok edilecek kart', 'harm'); if (t) await d.destroy(t, self); },
  });
  trap('Reinforcements', { can: (d, p) => d.monsters(p, true).length > 0, async resolve(d, p) { const t = await pick(d, p, d.monsters(p, true), '+500 ATK', 'help'); if (!t) return false; d.addTemp(t, 500); } });
  trap('Gift of The Mystical Elf', { async resolve(d, p) { await d.heal(p, 300 * fieldMons(d).length); } });
  trap('Jar of Greed', { async resolve(d, p) { await d.draw(p, 1); } });
  trap('Cemetary Bomb', { async resolve(d, p) { await d.damage(O(p), 100 * d.P(O(p)).grave.length); } });
  trap('Just Desserts', { async resolve(d, p) { await d.damage(O(p), 500 * d.monsters(O(p)).length); } });
  trap('Solar Ray', { async resolve(d, p) { await d.damage(O(p), 600 * d.monsters(p, true).filter(c => c.d.attr === 'LIGHT').length); } });
  trap('Secret Barrel', { async resolve(d, p) { const O_ = d.P(O(p)); await d.damage(O(p), 200 * (O_.hand.length + O_.mz.filter(Boolean).length + O_.st.filter(Boolean).length + (O_.field ? 1 : 0))); } });
  trap('Minor Goblin Official', { can: (d, p) => d.P(O(p)).lp <= 3000, async resolve(d, p) { await d.damage(O(p), 500); } });
  trap('Type Zero Magic Crusher', { can: (d, p) => d.P(p).hand.some(c => c.d.kind === 'spell'), async resolve(d, p) { if (!(await discardCost(d, p, 1, 'Type Zero: Büyü at', c => c.d.kind === 'spell'))) return false; await d.damage(O(p), 500); } });
  trap('Destruction Ring', { can: (d, p) => d.monsters(p, true).length > 0, async resolve(d, p) { const t = await pick(d, p, d.monsters(p, true), 'Destruction Ring: yok edilecek canavar', 'tribute'); if (!t) return false; await d.destroy(t); await d.damage(O(p), 1000); await d.damage(p, 1000); } });
  trap('Needle Ceiling', { can: d => d.allField().filter(isMon).length >= 4, async resolve(d) { for (const c of fieldMons(d, true)) await d.destroy(c); } });
  trap('Two-Pronged Attack', {
    can: (d, p) => d.monsters(p).length >= 2 && d.monsters(O(p)).length >= 1,
    async resolve(d, p) {
      for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.monsters(p), `Two-Pronged Attack: kendi canavarın (${i + 1}/2)`, 'tribute'); if (t) await d.destroy(t); }
      const v = await pick(d, p, d.monsters(O(p)), 'Rakip canavarı', 'harm'); if (v) await d.destroy(v);
    },
  });
  trap('Disarmament', { can: d => d.allField().some(c => c.equipTo != null), async resolve(d, p, self) { for (const c of d.allField().filter(c => c.equipTo != null)) await d.destroy(c, self); } });
  trap('Windstorm of Etaqua', { can: (d, p) => d.monsters(O(p), true).length > 0, async resolve(d, p) { for (const c of d.monsters(O(p), true)) { c.pos = c.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: c.owner, card: c }); } } });
  trap('Zero Gravity', { can: d => fieldMons(d, true).length > 0, async resolve(d) { for (const c of fieldMons(d, true)) { c.pos = c.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: c.owner, card: c }); } } });
  trap('Desert Sunlight', { can: (d, p) => d.monsters(p, true).some(c => c.pos === 'atk'), async resolve(d, p) { for (const c of d.monsters(p, true)) { c.pos = 'def'; await d.ev('pos', { p, card: c }); } } });
  trap('Dragon Capture Jar', { can: d => fieldMons(d, true).some(c => c.d.race === 'Dragon' && c.pos === 'atk'), async resolve(d) { for (const c of fieldMons(d, true).filter(c => c.d.race === 'Dragon')) { c.pos = 'def'; await d.ev('pos', { p: c.owner, card: c }); } } });
  trap('Acid Trap Hole', {
    can: d => fieldMons(d).some(c => !c.up),
    async resolve(d, p) { const t = await pick(d, p, fieldMons(d).filter(c => !c.up), 'Acid Trap Hole: çevrilecek canavar', 'harm'); if (!t) return false; t.up = true; await d.ev('flip', { p: t.owner, card: t }); if (t.d.def <= 2000) await d.destroy(t); },
  });
  trap('Remove Brainwashing', { can: d => fieldMons(d).some(c => c.owner !== c.origOwner), async resolve(d) { for (const c of fieldMons(d).filter(c => c.owner !== c.origOwner)) { const back = c.origOwner; const z = d.freeZone(back, 'mz'); if (z < 0) { await d.sendToGrave(c); continue; } d.removeFromWherever(c); c.owner = back; d.P(back).mz[z] = c; await d.ev('control', { p: back, card: c }); } } });
  trap('Time Seal', { async resolve(d, p) { d.flags.skipDraw[O(p)] = (d.flags.skipDraw[O(p)] || 0) + 1; } });
  trap('Reckless Greed', { async resolve(d, p) { await d.draw(p, 2); d.flags.skipDraw[p] = (d.flags.skipDraw[p] || 0) + 2; } });
  trap('Gravity Bind', { sub: 'continuous', async resolve() {}, restrictAttack: (d, c) => (lvl(c) >= 4 ? 'Gravity Bind: Level 4+ saldıramaz' : null) });
  trap('Spirit Barrier', { sub: 'continuous', async resolve() {}, shield: (d, p, n, src, f) => (src && src.d && src.d.kind === 'monster' && d.monsters(p).length ? 0 : n) });
  trap('Mask of Weakness', { trigger: 'attack', async resolve(d, p, c, ctx) { d.addTemp(ctx.attacker, -700); } });
  trap('Enchanted Javelin', { trigger: 'attack', async resolve(d, p, c, ctx) { await d.heal(p, d.atk(ctx.attacker)); } });
  S('Mask of Weakness', FX['Mask of Weakness']);
  FX['Mask of Weakness'].manual = false; FX['Enchanted Javelin'].manual = false;
  trap('Widespread Ruin', { trigger: 'attack', can: (d, p, c, ctx) => ctx.attacker.pos === 'atk', async resolve(d, p, c, ctx) { await d.destroy(ctx.attacker, c); ctx.negated = true; } });
  trap('Dark Mirror Force', { trigger: 'attack', can: (d, p) => d.monsters(O(p), true).some(c => c.pos === 'def'), async resolve(d, p, c, ctx) { for (const m of d.monsters(O(p)).filter(m => m.pos === 'def')) await d.banish(m); ctx.negated = true; } });
  trap('Destruction Punch', { trigger: 'attack', can: (d, p, c, ctx) => ctx.target && ctx.target.pos === 'def' && d.atk(ctx.attacker) < d.def(ctx.target), async resolve(d, p, c, ctx) { await d.destroy(ctx.attacker, c); ctx.negated = true; } });
  for (const n of ['Mask of Weakness', 'Enchanted Javelin', 'Widespread Ruin', 'Dark Mirror Force', 'Destruction Punch']) FX[n].manual = false;
  trap('Adhesion Trap Hole', { trigger: 'summon', can: (d, p, c, ctx) => d.inMZ(ctx.monster), async resolve(d, p, c, ctx) { ctx.monster.bonus.atk -= Math.floor(ctx.monster.d.atk / 2); } });
  trap('Eatgaboon', { trigger: 'summon', can: (d, p, c, ctx) => !ctx.monster.special && ctx.monster.d.atk <= 500 && d.inMZ(ctx.monster), async resolve(d, p, c, ctx) { await d.destroy(ctx.monster, c); } });
  trap('House of Adhesive Tape', { trigger: 'summon', can: (d, p, c, ctx) => !ctx.monster.special && ctx.monster.d.def <= 500 && d.inMZ(ctx.monster), async resolve(d, p, c, ctx) { await d.destroy(ctx.monster, c); } });
  trap('Horn of Heaven', { trigger: 'summon', can: (d, p) => d.monsters(p).length > 0, async resolve(d, p, c, ctx) { const t = await pick(d, p, d.monsters(p), 'Horn of Heaven: tribute', 'tribute'); if (!t) return; await d.sendToGrave(t, 'tribute'); if (d.inMZ(ctx.monster)) await d.destroy(ctx.monster, c); ctx.stop = true; } });
  trap('Solemn Judgment', { trigger: 'summon', can: (d, p) => d.P(p).lp > 2, async resolve(d, p, c, ctx) { await d.damage(p, Math.floor(d.P(p).lp / 2)); if (d.inMZ(ctx.monster)) await d.destroy(ctx.monster, c); ctx.stop = true; } });
  for (const n of ['Adhesion Trap Hole', 'Eatgaboon', 'House of Adhesive Tape', 'Horn of Heaven', 'Solemn Judgment']) FX[n].manual = false;
  const spellTrap = (n, cost, destroy) => { FX[n] = FX[n] || { trigger: 'spell', can: (d, p) => d.P(p).hand.length >= cost, async resolve(d, p, c, ctx) { if (!(await discardCost(d, p, cost, `${n}: at`))) return; ctx.negated = true; } }; };
  spellTrap('Magic Jammer', 1); spellTrap('Spell Vanishing', 2);

  // =========================================================== TOON
  const isToon = c => c.d.type === 'Toon Monster';
  const toonWorldOn = (d, p) => stZone(d, p).some(c => c.up && c.d.name === 'Toon World');
  S('Toon World', {
    sub: 'continuous', can: (d, p) => d.P(p).lp > 1000,
    async resolve(d, p, c) { await d.damage(p, 1000, c); },
    async onLeaveField(d, p) { for (const m of d.monsters(p).filter(isToon)) await d.destroy(m); },
  });
  const toon = (name, tributes, extra = {}) => S(name, Object.assign({
    canAttack: (d, p, c) => (!toonWorldOn(d, p) ? 'Toon World gerekli' : c.placedTurn === d.turn ? 'Çağrıldığı tur saldıramaz' : null),
    direct: (d, p) => !d.monsters(O(p)).some(isToon),
    async attackCost(d, p, c) { if (d.P(p).lp <= 500) return false; await d.damage(p, 500, c); return true; },
  }, tributes != null ? { handSummon: { tributes, can: (d, p) => (toonWorldOn(d, p) ? null : 'Toon World gerekli') } } : {}, extra));
  E.toonFx = toon; // effects3.js (Toon Dark Magician Girl) kullanır
  toon('Toon Mermaid', 0); toon('Toon Summoned Skull', 1); toon('Blue-Eyes Toon Dragon', 2); toon('Manga Ryu-Ran', 2);
  toon('Toon Gemini Elf', null, {
    async onBattleDamage(d, p, c, amt, victim) { const r = randOf(d, d.P(victim).hand); if (r) await d.sendToGrave(r, 'discard'); },
    summonReq: (d, p) => (toonWorldOn(d, p) ? null : 'Toon World gerekli'),
  });

  // =========================================================== CANAVARLAR
  const mon = (n, def) => S(n, def);
  const flip = (n, fn, extra) => mon(n, Object.assign({ onFlip: fn }, extra));
  const summ = (n, fn, extra) => mon(n, Object.assign({ async onSummon(d, p, c) { await fn(d, p, c); } }, extra));
  const tribSumm = (n, fn) => mon(n, { async onSummon(d, p, c) { if (c.tribSum) await fn(d, p, c); } });

  // --- Flip
  flip('4-Starred Ladybug of Doom', async (d, p) => { for (const c of d.monsters(O(p)).filter(m => lvl(m) === 4)) await d.destroy(c); });
  flip('Armed Ninja', async (d, p, c) => { const t = await pick(d, p, anyST(d).filter(x => x.d.kind === 'spell'), 'Armed Ninja: yok edilecek Büyü', 'harm'); if (t) await d.destroy(t, c); });
  const trapKiller = async (d, p, c) => { const t = await pick(d, p, anyST(d).filter(x => x.d.kind === 'trap'), 'Yok edilecek Tuzak', 'harm'); if (t) await d.destroy(t, c); };
  flip('Crimson Ninja', trapKiller); flip('Reaper of the Cards', trapKiller);
  flip('Bite Shoes', async (d, p) => { const t = await pick(d, p, fieldMons(d, true), 'Bite Shoes: pozisyonu değişecek', 'harm'); if (t) { t.pos = t.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: t.owner, card: t }); } });
  flip('Cyber Jar', async (d, p, c) => {
    for (const m of fieldMons(d)) await d.destroy(m, c);
    for (const who of [p, O(p)]) {
      const top = d.P(who).deck.splice(0, 5);
      for (const x of top) {
        if (isMon(x) && lvl(x) <= 4 && d.freeZone(who, 'mz') >= 0) { d.P(who).deck.unshift(x); await d.specialSummon(who, x); }
        else { d.P(who).hand.push(x); await d.ev('search', { p: who, card: x }); }
      }
    }
  });
  flip('Des Koala', async (d, p) => { await d.damage(O(p), 400 * d.P(O(p)).hand.length); });
  flip('Gale Lizard', async (d, p) => { const t = await pick(d, p, d.monsters(O(p)), 'Bounce', 'harm'); if (t) await d.bounce(t); });
  flip("Gravekeeper's Guard", async (d, p) => { const t = await pick(d, p, d.monsters(O(p)), 'Bounce', 'harm'); if (t) await d.bounce(t); });
  flip("Gravekeeper's Spy", async (d, p) => { const t = await pick(d, p, d.P(p).deck.filter(c => isMon(c) && /Gravekeeper/.test(c.d.name) && c.d.atk <= 1500), 'Gravekeeper\'s Spy: çağır', 'help'); if (t) await d.specialSummon(p, t); });
  flip('Hade-Hane', async (d, p) => { for (let i = 0; i < 3; i++) { const t = await pick(d, p, d.monsters(O(p)), `Hade-Hane: eline dönecek (${i + 1}/3)`, 'harm'); if (t) await d.bounce(t); } });
  const stealFlip = (n, f = () => true) => flip(n, async (d, p) => { const t = await pick(d, p, d.monsters(O(p), true).filter(f), `${n}: kontrol alınacak`, 'harm'); if (t) await d.takeControl(t, p, true); });
  stealFlip('Jowls of Dark Demise'); stealFlip('Rafflesia Seduction'); stealFlip('Dragon Manipulator', c => c.d.race === 'Dragon');
  flip('Night Assailant', async (d, p, c) => { const t = await pick(d, p, d.monsters(O(p)), 'Yok edilecek', 'harm'); if (t) await d.destroy(t, c); });
  flip('Old Vindictive Magician', async (d, p, c) => { const t = await pick(d, p, d.monsters(O(p)), 'Yok edilecek', 'harm'); if (t) await d.destroy(t, c); });
  flip('Nobleman-Eater Bug', async (d, p, c) => { for (let i = 0; i < 2; i++) { const t = await pick(d, p, fieldMons(d).filter(x => x !== c), `Yok edilecek (${i + 1}/2)`, 'harm'); if (t) await d.destroy(t, c); } });
  flip('Poison Mummy', async (d, p) => { await d.damage(O(p), 500); });
  flip('Princess of Tsurugi', async (d, p) => { await d.damage(O(p), 500 * (d.P(p).st.filter(Boolean).length + (d.P(p).field ? 1 : 0))); });
  flip('Tornado Bird', async (d, p) => { for (let i = 0; i < 2; i++) { const t = await pick(d, p, anyST(d), `Eline dönecek S/T (${i + 1}/2)`, 'harm'); if (t) await d.bounce(t); } });
  flip('Magical Merchant', async (d, p) => {
    for (let i = 0; i < 5 && d.P(p).deck.length; i++) {
      const c = d.P(p).deck.shift();
      if (c.d.kind !== 'monster') { d.P(p).hand.push(c); await d.ev('search', { p, card: c }); return; }
      d.P(p).grave.push(c);
    }
  });
  flip('Dark Mimic LV1', async (d, p) => { await d.draw(p, 1); });
  flip('Iron Blacksmith Kotetsu', async (d, p) => { const c = await pick(d, p, d.P(p).deck.filter(c => FX[c.d.name] && FX[c.d.name].sub === 'equip'), 'Equip Büyüsü al', 'help'); if (c) await toHand(d, p, c); });
  flip('Spirit Caller', async (d, p) => { const c = await pick(d, p, graveMons(d, p, c => c.d.type === 'Normal Monster' && lvl(c) <= 3), 'Spirit Caller: çağır', 'revive'); if (c) await d.specialSummon(p, c); });
  flip('Lady Assailant of Flames', async (d, p) => { for (let i = 0; i < 3 && d.P(p).deck.length; i++) await d.banish(d.P(p).deck[0]); await d.damage(O(p), 800); });
  flip('Weather Report', async (d, p) => { for (const c of stZone(d, O(p)).filter(c => c.d.name === 'Swords of Revealing Light')) await d.destroy(c); });
  flip('The Immortal of Thunder', async (d, p) => { await d.heal(p, 3000); }, { async onGrave(d, p) { await d.damage(p, 5000); } });
  flip('Witch Doctor of Chaos', async (d, p) => { const c = await pick(d, p, [...graveMons(d, 0), ...graveMons(d, 1)], 'Çıkarılacak canavar', 'harm'); if (c) await d.banish(c); });
  flip('Des Feral Imp', async (d, p) => { const c = await pick(d, p, d.P(p).grave, 'Desteye dönecek kart', 'help'); if (c) { d.removeFromWherever(c); d.P(p).deck.push(c); E.shuffle(d.P(p).deck, d.rng); } });
  flip('Summoner of Illusions', async (d, p, c) => {
    const t = await pick(d, p, d.monsters(p).filter(m => m !== c), 'Summoner of Illusions: tribute', 'tribute'); if (!t) return;
    const fs = d.P(p).extra.filter(f => lvl(f) <= 6 && lvl(f) === lvl(t) + 0 || lvl(f) <= 6);
    const f = await pick(d, p, fs, 'Çağrılacak Fusion', 'revive'); if (!f) return;
    await d.sendToGrave(t, 'tribute'); await d.specialSummon(p, f);
  });
  flip('Spear Cretin', async (d, p) => { for (const who of [p, O(p)]) { const m = await pick(d, who, graveMons(d, who), 'Spear Cretin: mezarlıktan çağır', 'revive'); if (m) await d.specialSummon(who, m); } });
  flip('Mask of Darkness', async (d, p) => { const c = await pick(d, p, d.P(p).grave.filter(c => c.d.kind === 'trap'), 'Mezarlıktan Tuzak al', 'help'); if (c) await toHand(d, p, c); });

  // --- Doğrudan saldıranlar
  for (const n of ['Jinzo #7', 'Leghul', 'Ooguchi', "Queen's Double", 'Rainbow Flower', 'Mystic Lamp', 'Servant of Catabolism', 'Nightmare Horse', 'Raging Flame Sprite', 'Mucus Yolk']) mon(n, { direct: true });
  // --- Piercing
  for (const n of ['Dark Driceratops', 'Mad Sword Beast', 'Mefist the Infernal General', "Gravekeeper's Spear Soldier", 'Spear Dragon', 'Airknight Parshath']) mon(n, { pierce: true });
  FX['Airknight Parshath'].onBattleDamage = async (d, p) => { await d.draw(p, 1); };
  // --- Kendi istatistik formülleri
  const selfStat = (n, fn) => mon(n, { selfMod: (c, key, d) => fn(c, key, d) || 0 });
  selfStat('Chaos Necromancer', (c, key, d) => (key === 'atk' ? 300 * graveMons(d, c.owner).length - c.d.atk : 0));
  selfStat('Muka Muka', (c, key, d) => 300 * d.P(c.owner).hand.length);
  selfStat('Enraged Muka Muka', (c, key, d) => 400 * d.P(c.owner).hand.length);
  selfStat('Flash Assailant', (c, key, d) => -400 * d.P(c.owner).hand.length);
  selfStat('Shadow Ghoul', (c, key, d) => (key === 'atk' ? 100 * graveMons(d, c.owner).length : 0));
  selfStat('Mudora', (c, key, d) => (key === 'atk' ? 200 * graveMons(d, c.owner, x => x.d.race === 'Fairy').length : 0));
  selfStat('Perfect Machine King', (c, key, d) => (key === 'atk' ? 500 * fieldMons(d, true).filter(x => x !== c && x.d.race === 'Machine').length : 0));
  selfStat('Theban Nightmare', (c, key, d) => (key === 'atk' && !d.P(c.owner).hand.length && !d.P(c.owner).st.some(Boolean) && !d.P(c.owner).field ? 1500 : 0));
  selfStat('Ultimate Baseball Kid', (c, key, d) => (key === 'atk' ? 1000 * fieldMons(d, true).filter(x => x !== c && x.d.attr === 'FIRE').length : 0));
  selfStat('Lava Battleguard', (c, key, d) => (key === 'atk' ? 500 * d.monsters(c.owner, true).filter(x => x.d.name === 'Swamp Battleguard').length : 0));
  selfStat('Swamp Battleguard', (c, key, d) => (key === 'atk' ? 500 * d.monsters(c.owner, true).filter(x => x.d.name === 'Lava Battleguard').length : 0));
  selfStat('Gren Maju Da Eiza', (c, key, d) => 400 * d.P(c.owner).banished.length - c.d[key]);
  selfStat('Goblin King', (c, key, d) => 1000 * d.monsters(c.owner, true).filter(x => x !== c && x.d.race === 'Fiend').length);
  const aura = (n, up, down) => mon(n, { mod(c, key) { return isMon(c) ? (c.d.attr === up ? (key === 'atk' ? 500 : 0) : c.d.attr === down ? (key === 'atk' ? -400 : 0) : 0) : 0; } });
  aura('Bladefly', 'WIND', 'EARTH'); aura('Star Boy', 'WATER', 'FIRE'); aura('Little Chimera', 'FIRE', 'WATER'); aura('Milus Radiant', 'EARTH', 'WIND');
  aura("Witch's Apprentice", 'DARK', 'LIGHT'); aura('Hoshiningen', 'LIGHT', 'DARK');
  mon('Harpie Lady 1', { mod(c) { return isMon(c) && c.d.attr === 'WIND' ? 300 : 0; } });
  mon('Harpie Lady 2', { partial: true });
  mon('Harpie Lady 3', { partial: true });
  mon('Harpie Lady Sisters', { summonReq: () => 'Yalnızca Elegant Egotist ile çağrılır' });
  mon('Harpie Lady Sisters', FX['Harpie Lady Sisters']);

  // --- Bekleme / son faz
  mon('Bowganian', { async standby(d, p) { await d.damage(O(p), 600); } });
  mon('Darklord Marie', { async standby(d, p) { await d.heal(p, 200); } });
  mon('Mushroom Man #2', { async standby(d, p) { await d.damage(p, 300); } });
  mon('Solar Flare Dragon', { async endPhase(d, p) { await d.damage(O(p), 500); } });
  mon('Skull Archfiend of Lightning', { async standby(d, p, c) { if (d.allField().some(x => x.up && x.d.name === 'Pandemonium')) return; if (d.P(p).lp > 500) await d.damage(p, 500); else await d.destroy(c); } });
  mon('Gaia Soul the Combustible Collective', { async endPhase(d, p, c) { await d.destroy(c); } });

  // --- Çağrılınca
  summ('Gravekeeper\'s Curse', async (d, p) => { await d.damage(O(p), 500); });
  summ('Byser Shock', async (d, p) => { for (const c of [...stZone(d, 0), ...stZone(d, 1)].filter(c => !c.up)) await d.bounce(c); });
  summ('Dragon Seeker', async (d, p, c) => { const t = await pick(d, p, fieldMons(d, true).filter(m => m.d.race === 'Dragon' && m !== c), 'Dragon Seeker: yok edilecek Dragon', 'harm'); if (t) await d.destroy(t, c); }, { async onFlip(d, p, c) { await FX['Dragon Seeker'].onSummon(d, p, c); } });
  summ('Dark Jeroid', async (d, p) => { const t = await pick(d, p, d.monsters(O(p), true), 'Dark Jeroid: -800 ATK', 'harm'); if (t) t.bonus.atk -= 800; });
  summ('Ryu-Kishin Clown', async (d, p) => { const t = await pick(d, p, d.monsters(O(p), true), 'Pozisyonu değişecek', 'harm'); if (t) { t.pos = t.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p: t.owner, card: t }); } });
  summ('Sacred Crane', async (d, p, c) => { if (c.special) await d.draw(p, 1); });
  summ('Marauding Captain', async (d, p, c) => { const t = await pick(d, p, d.P(p).hand.filter(x => isMon(x) && lvl(x) <= 4 && !FX[x.d.name]?.handSummon), 'Marauding Captain: çağır', 'revive'); if (t) await d.specialSummon(p, t); });
  tribSumm('Thestalos the Firestorm Monarch', async (d, p) => { const r = randOf(d, d.P(O(p)).hand); if (r) { const l = isMon(r) ? lvl(r) : 0; await d.sendToGrave(r, 'discard'); if (isMon(r)) await d.damage(O(p), 100 * l); } });
  tribSumm('Zaborg the Thunder Monarch', async (d, p, c) => { const t = await pick(d, p, fieldMons(d).filter(m => m !== c), 'Zaborg: yok edilecek canavar', 'harm'); if (t) await d.destroy(t, c); });
  tribSumm('Mobius the Frost Monarch', async (d, p, c) => { for (let i = 0; i < 2; i++) { const t = await pick(d, p, anyST(d), `Mobius: yok edilecek S/T (${i + 1}/2)`, 'harm'); if (t) await d.destroy(t, c); } });
  const ritFetch = (n, test) => summ(n, async (d, p) => { const c = await pick(d, p, d.P(p).deck.filter(test), `${n}: desteden al`, 'help'); if (c) await toHand(d, p, c); });
  ritFetch('Manju of the Ten Thousand Hands', c => (isMon(c) && /Ritual/.test(c.d.type)) || (c.d.kind === 'spell' && c.d.ritual));
  ritFetch('Senju of the Thousand Hands', c => isMon(c) && /Ritual/.test(c.d.type));
  ritFetch('Sonic Bird', c => c.d.kind === 'spell' && c.d.ritual);
  mon('Dark Dust Spirit', { spirit: true, async onSummon(d, p, c) { const t = await pick(d, p, fieldMons(d, true).filter(m => m !== c), 'Dark Dust Spirit: yok edilecek canavar', 'harm'); if (t) await d.destroy(t, c); } });
  mon('Fushi No Tori', { spirit: true, async onBattleDamage(d, p, c, amt) { await d.heal(p, amt); } });
  mon('Yata-Garasu', { spirit: true, async onBattleDamage(d, p) { d.flags.skipDraw[O(p)] = (d.flags.skipDraw[O(p)] || 0) + 1; } });
  for (const n of ['Asura Priest', 'Great Long Nose', 'Hino-Kagu-Tsuchi', 'Inaba White Rabbit', 'Maharaghi', 'Otohime', 'Susa Soldier', 'Tsukuyomi', 'Yamata Dragon']) mon(n, { spirit: true, partial: true });

  // --- Savaş / mezarlık tetikleri
  mon('Giant Germ', { async onGrave(d, p, c, why) { if (why === 'battle') await d.damage(O(p), 500); } });
  mon('Skull-Mark Ladybug', { async onGrave(d, p) { await d.heal(p, 1000); } });
  mon('Nimble Momonga', { async onGrave(d, p, c, why) { if (why === 'battle') await d.heal(p, 1000); } });
  mon('Burning Algae', { async onGrave(d, p) { await d.heal(O(p), 1000); } });
  mon('Newdoria', { async onGrave(d, p, c, why) { if (why !== 'battle') return; const t = await pick(d, p, fieldMons(d), 'Newdoria: yok edilecek canavar', 'harm'); if (t) await d.destroy(t); } });
  const deckSS = (n, test) => mon(n, { async onGrave(d, p, c, why) { if (why !== 'battle' || d.freeZone(p, 'mz') < 0) return; const t = await pick(d, p, d.P(p).deck.filter(x => isMon(x) && test(x)), `${n}: desteden çağır`, 'help'); if (t) await d.specialSummon(p, t); } });
  deckSS('Masked Dragon', x => x.d.race === 'Dragon' && x.d.atk <= 1500); deckSS('Pyramid Turtle', x => x.d.race === 'Zombie' && x.d.def <= 2000); deckSS('UFO Turtle', x => x.d.attr === 'FIRE' && x.d.atk <= 1500);
  mon('Guardian Angel Joan', { async onKill(d, p, c, v) { await d.heal(p, v.d.atk || 0); } });
  mon('Insect Princess', { async onKill(d, p, c, v) { if (v.d.race === 'Insect') c.bonus.atk += 500; } });
  mon('Dark Magician of Chaos', { async onKill(d, p, c, v) { if (d.P(v.owner).grave.includes(v)) await d.banish(v); }, async endPhase(d, p, c) { if (c.placedTurn === d.turn) { const t = await pick(d, p, d.P(p).grave.filter(x => x.d.kind === 'spell'), 'Dark Magician of Chaos: Büyü al', 'help'); if (t) await toHand(d, p, t); } } });
  for (const n of ['Giant Orc', 'Goblin Attack Force']) mon(n, { async afterAttack(d, p, c) { c.pos = 'def'; await d.ev('pos', { p, card: c }); } });
  mon('Mataza the Zapper', { multiAttack: 2 });

  // --- Manuel yetenekler (Main Phase, turda bir kez)
  const abil = (n, a, extra) => mon(n, Object.assign({ ability: a }, extra));
  abil('Cannon Soldier', { label: 'Tribute: 500 hasar', can: (d, p, c) => d.monsters(p).length > 0, async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p), 'Tribute edilecek canavar', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); await d.damage(O(p), 500, c); } });
  abil('Catapult Turtle', { label: 'Tribute: hasar', can: (d, p, c) => d.monsters(p).filter(m => m !== c).length > 0, async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p).filter(m => m !== c), 'Tribute edilecek canavar', 'tribute'); if (!t) return false; const dm = Math.floor(d.atk(t) / 2); await d.sendToGrave(t, 'tribute'); await d.damage(O(p), dm, c); } });
  abil('Anti-Aircraft Flower', { label: 'Tribute Insect: 800 hasar', can: (d, p) => d.monsters(p).some(m => m.d.race === 'Insect'), async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p).filter(m => m.d.race === 'Insect'), 'Insect tribute', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); await d.damage(O(p), 800, c); } });
  abil("Man-Thro' Tro'", { label: 'Tribute Normal: 1000 hasar', can: (d, p) => d.monsters(p).some(m => m.d.type === 'Normal Monster'), async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p).filter(m => m.d.type === 'Normal Monster'), 'Normal canavar tribute', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); await d.damage(O(p), 1000, c); } });
  abil('Hysteric Fairy', { label: '2 tribute: +1000 LP', can: (d, p) => d.monsters(p).length >= 3, async resolve(d, p) { for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.monsters(p).filter(m => m.d.name !== 'Hysteric Fairy'), 'Tribute', 'tribute'); if (t) await d.sendToGrave(t, 'tribute'); } await d.heal(p, 1000); } });
  abil('Exiled Force', { label: 'Tribute: canavar yok et', can: d => fieldMons(d).length > 1, async resolve(d, p, c) { const t = await pick(d, p, fieldMons(d).filter(m => m !== c), 'Yok edilecek canavar', 'harm'); if (!t) return false; await d.sendToGrave(c, 'tribute'); await d.destroy(t); } });
  abil('Throwstone Unit', { label: 'Tribute Warrior: canavar yok et', can: (d, p, c) => d.monsters(p).some(m => m.d.race === 'Warrior' && m !== c) && d.monsters(O(p), true).length > 0, async resolve(d, p) { const w = await pick(d, p, d.monsters(p).filter(m => m.d.race === 'Warrior'), 'Warrior tribute', 'tribute'); const t = await pick(d, p, d.monsters(O(p), true), 'Yok edilecek canavar', 'harm'); if (!w || !t) return false; await d.sendToGrave(w, 'tribute'); await d.destroy(t); } });
  abil('Time Wizard', {
    label: 'Yazı-tura', can: d => true,
    async resolve(d, p, c) {
      if ((await d.toss(p))[0]) { for (const m of d.monsters(O(p))) await d.destroy(m, c); }
      else { let sum = 0; for (const m of d.monsters(p)) { sum += d.atk(m); await d.destroy(m, c); } await d.damage(p, Math.floor(sum / 2)); }
    },
  });
  FX['Cannon Soldier'].ability.ai = (d, p) => d.monsters(p).length >= 2 && d.P(O(p)).lp <= 1500;
  FX['Catapult Turtle'].ability.ai = (d, p) => d.monsters(p).length >= 2 && d.P(O(p)).lp <= 1200;
  FX['Exiled Force'].ability.ai = (d, p) => d.monsters(O(p), true).some(m => d.atk(m) >= 2200);
  for (const n of ['Messenger of Peace', 'Final Countdown', 'Insect Barrier', 'Vengeful Bog Spirit', 'Gravity Bind', 'Toon World', 'Mushroom Man #2', 'Mask of Brutality', 'Stim-Pack', 'Dark Energy']) if (FX[n]) FX[n].noAI = FX[n].noAI || ['Messenger of Peace', 'Final Countdown', 'Mask of Brutality'].includes(n);

  // --- Partial/vanilla'a yakın
  const partial = ['Chaos Command Magician', 'Skilled Dark Magician', 'Skilled White Magician', 'Magical Marionette', 'Royal Magical Library', 'Apprentice Magician', 'White Magician Pikeru', 'Dark Elf Mage'];
  for (const n of partial) mon(n, { partial: true });
  // Yalnızca temel istatistikleriyle de sorunsuz oynanan etkili canavarlar (ikincil cümle kodlanmadı)
  const light = ['Amazoness Archer', 'Cave Dragon', 'Kuriboh', 'Berserk Gorilla', 'Kaiser Glider', 'Great Moth', 'Petit Moth', 'Larvae Moth', 'Cocoon of Evolution', 'Basic Insect', 'Hercules Beetle'];
  for (const n of light) mon(n, { partial: true });

  // Ek: Final Countdown / Messenger "standby" yalnızca sahibin sırasında çalışır (Duel.hook)
  return FX;
});
