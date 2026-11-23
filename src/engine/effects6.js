// Kart efektleri — 6. paket: Tuzaklar (Counter Trap'ler, hasar/saldırı/çağırma tepkileri, sürekli tuzaklar).
// Counter Trap'ler engine'in negationWindow()'una `counter` olarak bağlanır; hasara karşılık verenler 'damage' penceresini kullanır.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects5.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const S = (name, def) => { if (!FX[name]) FX[name] = def; };
  const T = (name, def) => S(name, Object.assign({ manual: true }, def)); // elle (kendi turunda) aktive edilen tuzaklar

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
  async function discardN(d, p, n, prompt, filter = () => true) {
    if (d.P(p).hand.filter(filter).length < n) return false;
    for (let i = 0; i < n; i++) {
      const c = await pick(d, p, d.P(p).hand.filter(filter), `${prompt} (${i + 1}/${n})`, 'discard');
      if (!c) return false;
      await d.sendToGrave(c, 'discard');
    }
    return true;
  }
  const flagFor = (d, key, p, v) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = v; };
  const pay = (n) => async (d, p) => { if (d.P(p).lp <= n) return false; await d.damage(p, n); };
  const descHas = (c, re) => re.test(c.d.desc || '');

  // ======================================================================== COUNTER TRAP'LER (rakibin aktivasyonunu iptal eder)
  S('Armor Break', { counter: { kinds: ['spell'], can: (d, p, c, card) => !!(FX[card.d.name] && FX[card.d.name].sub === 'equip'), text: card => `${card.d.name} (Equip) aktive edildi: Armor Break ile iptal et?` } });
  S('Cursed Seal of the Forbidden Spell', {
    counter: {
      kinds: ['spell'], can: (d, p) => d.P(p).hand.some(c => c.d.kind === 'spell'),
      cost: async (d, p) => discardN(d, p, 1, 'Cursed Seal: Büyü at', c => c.d.kind === 'spell'),
      text: card => `${card.d.name} aktive edildi: 1 Büyü atıp iptal et ve yok et?`,
    },
  });
  S('Divine Wrath', {
    counter: {
      kinds: ['monster'], can: (d, p) => d.P(p).hand.length > 0,
      cost: async (d, p) => discardN(d, p, 1, 'Divine Wrath: at'),
      text: card => `${card.d.name} efekti aktive edildi: 1 kart atıp iptal et ve canavarı yok et?`,
      async after(d, p, c, card) { if (d.onField(card)) await d.destroy(card, c); },
    },
  });
  S('Judgment of Anubis', {
    counter: {
      kinds: ['spell'], can: (d, p, c, card) => d.P(p).hand.length > 0 && descHas(card, /destroy.*Spell|destroy.*Trap/i),
      cost: async (d, p) => discardN(d, p, 1, 'Judgment of Anubis: at'),
      text: card => `${card.d.name} (Büyü/Tuzak yok eden): 1 kart atıp iptal et, rakibin 1 canavarını yok et?`,
      async after(d, p) { const t = await pick(d, p, d.monsters(O(p)), 'Yok edilecek rakip canavarı', 'harm'); if (t) { const a = d.atk(t); await d.destroy(t); await d.damage(O(p), Math.floor(a / 2)); } },
    },
  });
  S('Curse of Royal', { counter: { kinds: ['spell', 'trap'], can: (d, p, c, card) => descHas(card, /destroy.*(Spell|Trap)/i), text: card => `${card.d.name} aktive edildi: Curse of Royal ile iptal et?` } });
  S('Magic Drain', {
    counter: {
      kinds: ['spell'],
      async cost(d, p, c, card) { // rakip 1 Büyü atarak iptali önleyebilir
        const act = card.owner;
        if (d.P(act).hand.some(x => x.d.kind === 'spell') && (await d.ask(act, card, 'Magic Drain: iptal edilmemesi için 1 Büyü atar mısın?'))) { if (await discardN(d, act, 1, 'At: 1 Büyü', x => x.d.kind === 'spell')) return false; }
      },
      text: card => `${card.d.name} aktive edildi: Magic Drain ile iptal et?`,
    },
  });
  S('Seven Tools of the Bandit', { counter: { kinds: ['trap'], cost: pay(1000), text: card => `${card.d.name} aktive edildi: 1000 LP ödeyip iptal et ve yok et?` } });
  S('Trap Jammer', { counter: { kinds: ['trap'], can: d => d.phase === 'battle', text: card => `${card.d.name} aktive edildi (Battle Phase): Trap Jammer ile iptal et?` } });

  // ======================================================================== HASAR / SALDIRI / ÇAĞIRMA TEPKİLERİ
  S('Barrel Behind the Door', { trigger: 'damage', can: (d, p, c, ctx) => !ctx.battle, async resolve(d, p, c, ctx) { const n = ctx.amount; ctx.negated = true; await d.damage(O(p), n, c); } });
  S("Pikeru's Circle of Enchantment", { trigger: 'damage', can: (d, p, c, ctx) => !ctx.battle, async resolve(d, p, c, ctx) { ctx.negated = true; flagFor(d, 'noEffDmg', p, d.turn); } });
  S('Hallowed Life Barrier', {
    trigger: 'damage', can: (d, p) => d.P(p).hand.length > 0,
    async resolve(d, p, c, ctx) { if (!(await discardN(d, p, 1, 'Hallowed Life Barrier: at'))) return false; ctx.negated = true; flagFor(d, 'noDmg', p, d.turn); },
  });
  S('Nutrient Z', { trigger: 'damage', can: (d, p, c, ctx) => ctx.battle && ctx.amount >= 2000, async resolve(d, p) { await d.heal(p, 4000); } });
  S('Attack and Receive', { trigger: 'damage', async resolve(d, p) { await d.damage(O(p), 700); } });
  S('Numinous Healer', { trigger: 'damage', async resolve(d, p) { await d.heal(p, 1000); } });
  S('A Hero Emerges', {
    trigger: 'attack', can: (d, p) => d.P(p).hand.length > 0,
    async resolve(d, p, c) {
      const H = d.P(p).hand; const r = H[Math.floor(d.rng() * H.length)];
      await d.ev('reveal', { p, card: r });
      if (isMon(r) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, r);
    },
  });
  S('Blast Held by a Tribute', {
    trigger: 'attack', can: (d, p, c, ctx) => !!ctx.attacker.tribSum,
    async resolve(d, p, c, ctx) { for (const m of d.monsters(ctx.attacker.owner).filter(x => x.up && x.pos === 'atk')) await d.destroy(m, c); },
  });
  S('Castle Walls', { trigger: 'attack', can: (d, p, c, ctx) => !!(ctx.target && ctx.target.owner === p && ctx.target.pos === 'def'), async resolve(d, p, c, ctx) { d.addTemp(ctx.target, 0, 500); } });
  S('Ring of Destruction', {
    trigger: 'attack', can: (d, p, c, ctx) => d.atk(ctx.attacker) <= d.P(p).lp,
    async resolve(d, p, c, ctx) { const a = d.atk(ctx.attacker); await d.destroy(ctx.attacker, c); ctx.negated = true; await d.damage(p, a); await d.damage(O(p), a); },
  });
  S('Chain Destruction', {
    trigger: 'summon', can: (d, p, c, ctx) => (ctx.monster.d.atk || 0) <= 2000 && ctx.monster.up,
    async resolve(d, p, c, ctx) {
      const m = ctx.monster, q = m.owner;
      await d.destroy(m, c);
      for (const z of [...d.P(q).hand, ...d.P(q).deck].filter(x => x.d.name === m.d.name)) await d.sendToGrave(z, 'destroy');
    },
  });
  S('Chain Disappearance', {
    trigger: 'summon', can: (d, p, c, ctx) => (ctx.monster.d.atk || 0) <= 1000 && ctx.monster.up,
    async resolve(d, p, c, ctx) {
      const m = ctx.monster, q = m.owner;
      await d.banish(m);
      for (const z of [...d.P(q).hand, ...d.P(q).deck, ...d.P(q).grave].filter(x => x.d.name === m.d.name)) await d.banish(z);
    },
  });
  S('Anti Raigeki', { trigger: 'spell', can: (d, p, c, ctx) => ctx.spell.d.name === 'Raigeki', async resolve(d, p, c, ctx) { ctx.negated = true; for (const m of d.monsters(O(p))) await d.destroy(m, c); } });
  S('Call of the Grave', { trigger: 'spell', can: (d, p, c, ctx) => ctx.spell.d.name === 'Monster Reborn', async resolve(d, p, c, ctx) { ctx.negated = true; } });
  S('Gryphon Wing', { trigger: 'spell', can: (d, p, c, ctx) => ctx.spell.d.name === "Harpie's Feather Duster", async resolve(d, p, c, ctx) { ctx.negated = true; for (const s of anyST(d).filter(x => x !== ctx.spell)) await d.destroy(s, c); } });

  // ======================================================================== ELLE AKTİVE EDİLEN NORMAL TUZAKLAR
  T('Altar for Tribute', { can: (d, p) => d.monsters(p).length > 0, async resolve(d, p) { const t = await pick(d, p, d.monsters(p), 'Altar for Tribute: feda edilecek canavar', 'tribute'); if (!t) return false; const a = d.atk(t); await d.sendToGrave(t, 'tribute'); await d.heal(p, a); } });
  T('Bubble Crash', {
    can: d => [0, 1].some(i => d.P(i).hand.length + d.allField().filter(c => c.owner === i).length >= 6),
    async resolve(d) {
      for (const i of [0, 1]) {
        while (d.P(i).hand.length + d.allField().filter(c => c.owner === i).length > 5) {
          const c = await pick(d, i, [...d.P(i).hand, ...d.allField().filter(x => x.owner === i)], 'Bubble Crash: mezarlığa gidecek kart (5 kalana dek)', 'discard');
          if (!c) break;
          await d.sendToGrave(c, 'destroy');
        }
      }
    },
  });
  T('Burst Breath', {
    can: (d, p) => d.monsters(p).some(c => c.d.race === 'Dragon'),
    async resolve(d, p) {
      const t = await pick(d, p, d.monsters(p).filter(c => c.d.race === 'Dragon'), 'Burst Breath: tribute edilecek Dragon', 'tribute'); if (!t) return false;
      const a = d.atk(t); await d.sendToGrave(t, 'tribute');
      for (const m of fieldMons(d, true).filter(m => d.def(m) <= a)) await d.destroy(m);
    },
  });
  T('Curse of Aging', {
    can: (d, p) => d.P(p).hand.length >= 1 && d.monsters(O(p)).length > 0,
    async resolve(d, p) { if (!(await discardN(d, p, 1, 'Curse of Aging: at'))) return false; for (const m of d.monsters(O(p))) { m.bonus.atk -= 500; m.bonus.def -= 500; } },
  });
  T('Curse of Anubis', {
    can: d => fieldMons(d, true).some(c => /Effect/.test(c.d.type)),
    async resolve(d) { for (const m of fieldMons(d, true).filter(c => /Effect/.test(c.d.type))) { m.pos = 'def'; d.addTemp(m, 0, -(m.d.def || 0)); await d.ev('pos', { p: m.owner, card: m }); } },
  });
  T('Disturbance Strategy', { async resolve(d, p) { const q = O(p), n = d.P(q).hand.length; for (const c of d.P(q).hand.splice(0)) d.P(q).deck.push(c); shuffleDeck(d, q); await d.draw(q, n); } });
  T('Disappear', { can: (d, p) => d.P(O(p)).grave.length > 0, async resolve(d, p) { const t = await pick(d, p, d.P(O(p)).grave, 'Disappear: çıkarılacak kart', 'harm'); if (!t) return false; await d.banish(t); } });
  T('Energy Drain', { can: (d, p) => myUp(d, p).length > 0 && d.P(O(p)).hand.length > 0, async resolve(d, p) { const t = await pick(d, p, myUp(d, p), 'Energy Drain: hedef', 'help'); if (!t) return false; const n = d.P(O(p)).hand.length * 200; d.addTemp(t, n, n); } });
  T('Deal of Phantom', { can: (d, p) => fieldMons(d, true).length > 0, async resolve(d, p) { const t = await pick(d, p, fieldMons(d, true), 'Deal of Phantom: hedef', 'help'); if (!t) return false; d.addTemp(t, 100 * d.P(p).grave.filter(isMon).length, 0); } });
  T('Heavy Slump', { can: (d, p) => d.P(O(p)).hand.length >= 8, async resolve(d, p) { const q = O(p); for (const c of d.P(q).hand.splice(0)) d.P(q).deck.push(c); shuffleDeck(d, q); await d.draw(q, 2); } });
  T('Interdimensional Matter Transporter', {
    can: (d, p) => myUp(d, p).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, myUp(d, p), 'Banish edilecek canavar (End Phase\'de döner)', 'help'); if (!t) return false;
      const card = t; await d.banish(t);
      (d.endQueue = d.endQueue || []).push(async () => { if (d.P(p).banished.includes(card) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, card); });
    },
  });
  T('Micro Ray', { can: d => fieldMons(d, true).length > 0, async resolve(d, p) { const t = await pick(d, p, fieldMons(d, true), 'Micro Ray: DEF\'i 0 olacak canavar', 'harm'); if (!t) return false; d.addTemp(t, 0, -d.def(t)); } });
  T('Skull Dice', { can: (d, p) => d.monsters(O(p)).length > 0, async resolve(d, p) { const n = (await d.roll(p))[0] * 100; for (const m of d.monsters(O(p))) d.addTemp(m, -n, -n); } });
  T('Snake Fang', { can: d => fieldMons(d, true).length > 0, async resolve(d, p) { const t = await pick(d, p, fieldMons(d, true), 'Snake Fang: DEF -500', 'harm'); if (!t) return false; d.addTemp(t, 0, -500); } });
  T("Solomon's Lawbook", { async resolve(d, p) { flagFor(d, 'skipStandby', p, true); } });
  T('Ready for Intercepting', {
    can: d => fieldMons(d, true).some(c => c.d.race === 'Warrior' || c.d.race === 'Spellcaster'),
    async resolve(d, p) { const t = await pick(d, p, fieldMons(d, true).filter(c => c.d.race === 'Warrior' || c.d.race === 'Spellcaster'), 'Kapalı savunmaya çevrilecek canavar', 'harm'); if (!t) return false; t.up = false; t.pos = 'def'; await d.ev('pos', { p: t.owner, card: t }); },
  });
  T('Really Eternal Rest', { can: d => d.allField().some(c => c.equipTo != null), async resolve(d) { const ts = new Set(d.allField().filter(c => c.equipTo != null).map(c => c.equipTo)); for (const m of fieldMons(d).filter(m => ts.has(m.uid))) await d.destroy(m); } });
  T('Return from the Different Dimension', {
    can: (d, p) => d.P(p).banished.some(isMon) && d.P(p).lp > 1,
    async resolve(d, p) {
      await d.damage(p, Math.floor(d.P(p).lp / 2)); if (d.over) return;
      const back = [];
      for (const c of d.P(p).banished.filter(isMon)) { if (d.freeZone(p, 'mz') < 0) break; if (await d.specialSummon(p, c)) back.push(c); }
      (d.endQueue = d.endQueue || []).push(async () => { for (const c of back) if (d.inMZ(c)) await d.banish(c); });
    },
  });
  T('Trap Dustshoot', {
    can: (d, p) => d.P(O(p)).hand.length >= 4 && d.P(O(p)).hand.some(isMon),
    async resolve(d, p) { const q = O(p); const t = await pick(d, p, d.P(q).hand.filter(isMon), 'Trap Dustshoot: desteye dönecek canavar', 'harm'); if (!t) return false; d.removeFromWherever(t); d.P(q).deck.push(t); shuffleDeck(d, q); },
  });
  T('Beckoning Light', {
    can: (d, p) => d.P(p).hand.length >= 2 && graveMons(d, p, c => c.d.attr === 'LIGHT').length > 0,
    async resolve(d, p, self) {
      const n = d.P(p).hand.length;
      for (const c of [...d.P(p).hand]) await d.sendToGrave(c, 'discard');
      for (let i = 0; i < n; i++) { const t = await pick(d, p, graveMons(d, p, c => c.d.attr === 'LIGHT'), `Beckoning Light: ele al (${i + 1}/${n})`, 'help'); if (!t) break; await toHand(d, p, t); }
    },
  });
  T('Ray of Hope', {
    can: (d, p) => graveMons(d, p, c => c.d.attr === 'LIGHT').length >= 1,
    async resolve(d, p) { for (let i = 0; i < 2; i++) { const t = await pick(d, p, graveMons(d, p, c => c.d.attr === 'LIGHT'), 'Desteye dönecek LIGHT canavar', 'help'); if (!t) break; d.removeFromWherever(t); d.P(p).deck.push(t); } shuffleDeck(d, p); },
  });
  T('Hidden Spellbook', {
    can: (d, p) => d.P(p).grave.filter(c => c.d.kind === 'spell').length >= 2,
    async resolve(d, p) { for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.P(p).grave.filter(c => c.d.kind === 'spell'), 'Desteye karışacak Büyü', 'help'); if (!t) break; d.removeFromWherever(t); d.P(p).deck.push(t); } shuffleDeck(d, p); },
  });
  T('Mind Haxorz', { can: (d, p) => d.P(p).lp > 500, async resolve(d, p) { await d.damage(p, 500); } });

  // ======================================================================== SÜREKLİ TUZAKLAR (notify kancaları)
  const HARM = new Set(['Curse of Darkness', 'Chain Burst', 'Greed', 'Imperial Order']);
  const cont = (name, def) => T(name, Object.assign({ sub: 'continuous', aiOk: () => !HARM.has(name) }, def));
  cont('Backfire', { async onFieldToGrave(d, p, x, c, from) { if (from === 'mz' && c.origOwner === p && c.d.attr === 'FIRE') await d.damage(O(p), 500, x); } });
  cont('Coffin Seller', { async onFieldToGrave(d, p, x, c, from) { if (from === 'mz' && isMon(c) && c.origOwner === O(p)) await d.damage(O(p), 300, x); } });
  cont('Skull Invitation', { async onGraveAny(d, p, x, c) { await d.damage(c.origOwner, 300, x); } });
  cont('Fatal Abacus', { async onFieldToGrave(d, p, x, c, from) { if (from === 'mz' && isMon(c)) await d.damage(c.origOwner, 500, x); } });
  cont('Magical Thorn', { async onDiscard(d, p, x, c) { if (c.origOwner === O(p)) await d.damage(O(p), 500, x); } });
  cont('Solemn Wishes', { async onDrawCard(d, p, x, who) { if (who === p) await d.heal(p, 500); } });
  cont("Robbin' Goblin", { async onBattleDmg(d, p, x, atker, amt, victim) { if (atker.owner === p && victim === O(p)) { const H = d.P(victim).hand; if (H.length) await d.sendToGrave(H[Math.floor(d.rng() * H.length)], 'discard'); } } });
  cont("Robbin' Zombie", { async onBattleDmg(d, p, x, atker, amt, victim) { if (atker.owner === p && victim === O(p) && d.P(victim).deck.length) { const c = d.P(victim).deck.shift(); d.P(victim).grave.push(c); c.graveInfo = { turn: d.turn, why: 'mill', from: 'deck' }; await d.ev('toGrave', { card: c, from: 'deck', why: 'mill' }); } } });
  cont('Curse of Darkness', { async onSpellResolved(d, p, x, who) { await d.damage(who, 1000, x); } });
  cont('Chain Burst', { async onTrapResolved(d, p, x, who, card) { if (card !== x) await d.damage(who, 1000, x); } });
  cont('Des Counterblow', { async onBattleDmg(d, p, x, atker, amt, victim, direct) { if (direct && d.inMZ(atker)) await d.destroy(atker, x); } });
  cont('Begone, Knave!', { async onBattleDmg(d, p, x, atker, amt, victim, direct) { if (d.inMZ(atker)) await d.bounce(atker); } });
  cont("Dragon's Rage", { pierceMod: (d, atker, f) => f.owner === atker.owner && atker.d.race === 'Dragon' });
  cont('Royal Decree', { negateOtherTraps: true });
  cont('Imperial Order', { negateSpells: true, async standby(d, p, x) { if (d.P(p).lp > 700) await d.damage(p, 700); else await d.destroy(x); } });
  cont('Greed', { async onDrawCard(d, p, x, who, card, normal) { if (!normal) await d.damage(who, 500, x); } });
  cont('Spellbinding Circle', {
    can: d => fieldMons(d, true).length > 0,
    async resolve(d, p, self) { const t = await pick(d, p, d.monsters(O(p)), 'Spellbinding Circle: hedef', 'harm'); if (!t) return false; self.lock = t.uid; },
    restrictAttack: (d, c, f) => (f.lock === c.uid ? 'Spellbinding Circle: saldıramaz' : null),
    restrictPos: (d, c, f) => (f.lock === c.uid ? 'Spellbinding Circle: pozisyon değiştiremez' : null),
  });
  cont('Nightmare Wheel', {
    can: (d, p) => d.monsters(O(p)).length > 0,
    async resolve(d, p, self) { const t = await pick(d, p, d.monsters(O(p)), 'Nightmare Wheel: hedef', 'harm'); if (!t) return false; self.lock = t.uid; },
    restrictAttack: (d, c, f) => (f.lock === c.uid ? 'Nightmare Wheel: saldıramaz' : null),
    restrictPos: (d, c, f) => (f.lock === c.uid ? 'Nightmare Wheel: pozisyon değiştiremez' : null),
    async standby(d, p) { await d.damage(O(p), 500); },
  });
  cont('Shadow Spell', {
    can: (d, p) => d.monsters(O(p)).length > 0,
    async resolve(d, p, self) { const t = await pick(d, p, d.monsters(O(p)), 'Shadow Spell: hedef', 'harm'); if (!t) return false; self.lock = t.uid; },
    restrictAttack: (d, c, f) => (f.lock === c.uid ? 'Shadow Spell: saldıramaz' : null),
    restrictPos: (d, c, f) => (f.lock === c.uid ? 'Shadow Spell: pozisyon değiştiremez' : null),
    mod: (c, key, d, f) => (f.lock === c.uid && key === 'atk' ? -700 : 0),
  });
});
