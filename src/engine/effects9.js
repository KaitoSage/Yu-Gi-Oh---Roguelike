// Kart efektleri — 9. paket: ek efekt canavarlar (Level Up zincirleri, Chaos/özel çağırmalar, savaş ve yetenek canavarları).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects8.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;
  const M = (name, def) => { if (!FX[name]) FX[name] = def; };

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
  const randHand = (d, p) => { const H = d.P(p).hand; return H.length ? H[Math.floor(d.rng() * H.length)] : null; };
  async function discardOne(d, p, prompt, filter = () => true) {
    const c = await pick(d, p, d.P(p).hand.filter(filter), prompt, 'discard');
    if (!c) return false;
    await d.sendToGrave(c, 'discard');
    return true;
  }
  const coins = (d, n) => Array.from({ length: n }, () => d.rng() < 0.5);

  // Level Up: bu turun savaşında canavar yok ettiyse End Phase'de bir üst seviyeye geçer (elden/desteden çağrılır)
  const levelUp = (nextName) => ({
    async onKill(d, p, c) { c.lvTurn = d.turn; },
    async endPhase(d, p, c) {
      if (c.lvTurn !== d.turn || !d.inMZ(c)) return;
      const nx = [...d.P(p).hand, ...d.P(p).deck].find(x => x.d.name === nextName);
      if (!nx || !(await d.ask(p, c, `${nextName} çağırılsın mı? (Level Up)`))) return;
      await d.sendToGrave(c, 'tribute');
      await d.specialSummon(p, nx);
    },
  });
  const onlyBy = msg => ({ summonReq: () => msg });

  // ======================================================================== LEVEL UP SERİLERİ
  M('Armed Dragon LV3', {
    async standby(d, p, c) {
      const nx = d.P(p).deck.find(x => x.d.name === 'Armed Dragon LV5');
      if (!nx || !(await d.ask(p, c, 'Armed Dragon LV5 çağırılsın mı?'))) return;
      await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, nx);
    },
  });
  M('Armed Dragon LV5', Object.assign(levelUp('Armed Dragon LV7'), {
    ability: {
      label: '1 canavar at: ATK\'sı atılandan düşük rakip canavarı yok et',
      can: (d, p) => d.P(p).hand.some(isMon) && d.monsters(O(p)).length > 0,
      async resolve(d, p) {
        const h = await pick(d, p, d.P(p).hand.filter(isMon), 'At: canavar', 'discard'); if (!h) return false;
        const a = h.d.atk || 0; await d.sendToGrave(h, 'discard');
        const t = await pick(d, p, d.monsters(O(p)).filter(m => d.atk(m) <= a), 'Yok edilecek canavar', 'harm'); if (t) await d.destroy(t);
      },
      ai: (d, p) => d.P(p).hand.filter(isMon).length >= 2 && d.monsters(O(p)).length > 0,
    },
  }));
  M('Armed Dragon LV7', Object.assign(onlyBy('Armed Dragon LV5 ile çağrılır'), {
    ability: {
      label: '1 canavar at: ATK\'sı atılandan düşük tüm rakip canavarları yok et',
      can: (d, p) => d.P(p).hand.some(isMon) && d.monsters(O(p)).length > 0,
      async resolve(d, p) {
        const h = await pick(d, p, d.P(p).hand.filter(isMon), 'At: canavar', 'discard'); if (!h) return false;
        const a = h.d.atk || 0; await d.sendToGrave(h, 'discard');
        for (const m of d.monsters(O(p)).filter(m => d.atk(m) <= a)) await d.destroy(m);
      },
      ai: (d, p) => d.P(p).hand.filter(isMon).length >= 2 && d.monsters(O(p)).length > 0,
    },
  }));
  M('Horus the Black Flame Dragon LV4', Object.assign(levelUp('Horus the Black Flame Dragon LV6'), { immune: (d, c, kind) => kind === 'control' }));
  M('Horus the Black Flame Dragon LV6', Object.assign(levelUp('Horus the Black Flame Dragon LV8'), { immune: (d, c, kind) => d.src && d.src.kind === 'spell' && d.fromOpp(c) || kind === 'control' }));
  M('Horus the Black Flame Dragon LV8', Object.assign(onlyBy('Horus LV6 ile çağrılır'), { immune: (d, c) => !!(d.src && d.src.kind === 'spell') }));
  M("Horus' Servant", { noTargetName: /^Horus the Black Flame Dragon/ });

  // ======================================================================== CHAOS / BANISH İLE ÖZEL ÇAĞIRMA
  function banishPair(a1, a2) {
    return {
      tributes: 0,
      can: (d, p) => (graveMons(d, p, x => x.d.attr === a1).length && graveMons(d, p, x => x.d.attr === a2).length ? null : `Mezarlığında 1 ${a1} ve 1 ${a2} canavar olmalı`),
      async cost(d, p) {
        for (const a of [a1, a2]) { const t = await pick(d, p, graveMons(d, p, x => x.d.attr === a), `Çıkarılacak ${a} canavar`, 'cost'); if (!t) return false; await d.banish(t); }
      },
    };
  }
  function banishRace(race, n) {
    return {
      tributes: 0,
      can: (d, p) => (graveMons(d, p, x => x.d.race === race).length >= n ? null : `Mezarlığında ${n} ${race} canavar olmalı`),
      async cost(d, p) { for (let i = 0; i < n; i++) { const t = await pick(d, p, graveMons(d, p, x => x.d.race === race), `Çıkarılacak ${race} (${i + 1}/${n})`, 'cost'); if (!t) return false; await d.banish(t); } },
    };
  }
  M('Black Luster Soldier - Envoy of the Beginning', {
    handSummon: banishPair('LIGHT', 'DARK'),
    ability: {
      label: 'Rakibin 1 canavarını çıkar (bu tur saldıramaz)', can: (d, p, c) => d.monsters(O(p)).length > 0 && !c.attacked,
      async resolve(d, p, c) { const t = await pick(d, p, d.monsters(O(p)), 'Çıkarılacak rakip canavarı', 'harm'); if (!t) return false; await d.banish(t); c.attacked = true; },
      ai: (d, p) => d.monsters(O(p)).length > 0 && d.phase !== 'battle',
    },
  });
  M('Chaos Sorcerer', {
    handSummon: banishPair('LIGHT', 'DARK'),
    ability: {
      label: 'Yüzü açık 1 canavarı çıkar (bu tur saldıramaz)', can: (d, p, c) => fieldMons(d, true).some(m => m !== c) && !c.attacked,
      async resolve(d, p, c) { const t = await pick(d, p, fieldMons(d, true).filter(m => m !== c), 'Çıkarılacak canavar', 'harm'); if (!t) return false; await d.banish(t); c.attacked = true; },
      ai: (d, p) => d.monsters(O(p)).some(m => m.up) && d.phase !== 'battle',
    },
  });
  M('Chaos Emperor Dragon - Envoy of the End', {
    handSummon: banishPair('LIGHT', 'DARK'),
    ability: {
      label: '1000 LP öde: eller ve sahadaki tüm kartları mezarlığa gönder (kart başı 300 hasar)', can: (d, p) => d.P(p).lp > 1000,
      async resolve(d, p, c) {
        await d.damage(p, 1000); if (d.over) return;
        let n = 0;
        for (const x of [...d.P(0).hand, ...d.P(1).hand, ...d.allField().filter(y => y !== c)]) { await d.sendToGrave(x, 'effect'); n++; }
        await d.damage(O(p), 300 * n, c);
      },
    },
  });
  M('Blue-Eyes Shining Dragon', {
    handSummon: { tributes: 1, can: () => null, cost: async (d, p, c, tr) => tr.every(t => t.d.name === 'Blue-Eyes Ultimate Dragon') && tr.length === 1 },
    selfMod: (c, key, d) => (key === 'atk' ? 300 * graveMons(d, c.owner, x => x.d.race === 'Dragon').length : 0),
  });
  M('Red-Eyes Darkness Dragon', {
    handSummon: { tributes: 1, can: () => null, cost: async (d, p, c, tr) => tr.length === 1 && tr[0].d.name === 'Red-Eyes Black Dragon' },
    selfMod: (c, key, d) => (key === 'atk' ? 300 * graveMons(d, c.owner, x => x.d.race === 'Dragon').length : 0),
  });
  M('Gate Guardian', {
    handSummon: { tributes: 3, can: () => null, cost: async (d, p, c, tr) => ['Sanga of the Thunder', 'Kazejin', 'Suijin'].every(n => tr.some(t => t.d.name === n)) },
  });
  M('Dark Magician Knight', {
    summonReq: () => 'Knight\'s Title ile çağrılır',
    async onSummon(d, p, c) { if (!c.special) return; const t = await pick(d, p, d.allField().filter(x => x !== c), 'Dark Magician Knight: yok edilecek kart', 'harm'); if (t) await d.destroy(t, c); },
  });
  M('Dark Necrofear', { partial: true, handSummon: banishRace('Fiend', 3) });
  M('Swift Gaia the Fierce Knight', { freeTribute: (d, p, c) => d.P(p).hand.length === 1 });
  M('Fusilier Dragon, the Dual-Mode Beast', {
    freeTribute: () => true,
    selfMod: (c, key) => (c.freeTrib ? -Math.floor((c.d[key] || 0) / 2) : 0),
  });
  M('Magical Scientist', fusionPay(1000, 6));
  M('Cyber-Stein', fusionPay(5000, 12));
  function fusionPay(cost, maxLv) {
    return {
      ability: {
        label: `${cost} LP öde: Extra Deck'ten Fusion çağır`,
        can: (d, p) => d.P(p).lp > cost && d.freeZone(p, 'mz') >= 0 && d.P(p).extra.some(f => (f.d.level || 0) <= maxLv),
        async resolve(d, p) {
          const f = await pick(d, p, d.P(p).extra.filter(x => (x.d.level || 0) <= maxLv), 'Çağrılacak Fusion canavar', 'revive'); if (!f) return false;
          await d.damage(p, cost); if (!d.over) await d.specialSummon(p, f);
        },
      },
    };
  }

  // ======================================================================== SAVAŞ / HASAR
  M('Amazoness Swords Woman', { reflectBattle: true });
  M('Barrel Dragon', coinDestroy('monster'));
  M('Blowback Dragon', coinDestroy('card'));
  function coinDestroy(kind) {
    return {
      ability: {
        label: '3 yazı-tura: en az 2 yazıysa hedefi yok et',
        can: (d, p) => (kind === 'monster' ? d.monsters(O(p)).length : d.monsters(O(p)).length + stZone(d, O(p)).length) > 0,
        async resolve(d, p, c) {
          const pool = kind === 'monster' ? d.monsters(O(p)) : [...d.monsters(O(p)), ...stZone(d, O(p))];
          const t = await pick(d, p, pool, 'Yok edilecek rakip kartı', 'harm'); if (!t) return false;
          const r = await d.toss(p, 3);
          if (r.filter(Boolean).length >= 2) await d.destroy(t, c);
        },
        ai: (d, p) => d.monsters(O(p)).length > 0,
      },
    };
  }
  M('Bazoo the Soul-Eater', {
    ability: {
      label: 'Mezarlıktan en çok 3 canavar çıkar: her biri +300 ATK (tur sonuna kadar)', can: (d, p) => graveMons(d, p).length > 0,
      async resolve(d, p, c) { let n = 0; for (let i = 0; i < 3; i++) { const t = await pick(d, p, graveMons(d, p), `Çıkarılacak canavar (${i + 1}/3)`, 'cost'); if (!t) break; await d.banish(t); n++; } if (!n) return false; d.addTemp(c, 300 * n, 0); },
      ai: (d, p) => graveMons(d, p).length >= 2 && d.phase === 'main1',
    },
  });
  M('Roulette Barrel', {
    ability: {
      label: '2 zar at: sonuçla aynı Level\'daki bir canavarı yok et', can: d => fieldMons(d).length > 0,
      async resolve(d, p, c) {
        const rolls = await d.roll(p, 2);
        for (const r of rolls) { const t = d.monsters(O(p)).find(m => (m.d.level || 0) === r) || fieldMons(d).find(m => m !== c && (m.d.level || 0) === r && m.owner !== p); if (t) { await d.destroy(t, c); return; } }
      },
      ai: (d, p) => d.monsters(O(p)).length > 0,
    },
  });
  M('Electric Lizard', { async afterDefended(d, p, c, atker) { if (atker.d.race !== 'Zombie') atker.cantAttackTurn = d.turn + 2; } });
  M('Thousand Needles', { async defWin(d, p, c, atker) { if (d.def(c) > d.atk(atker)) await d.destroy(atker, c); } });
  M('Two Thousand Needles', { async defWin(d, p, c, atker) { if (d.def(c) > d.atk(atker)) await d.destroy(atker, c); } });
  M('Enraged Battle Ox', { pierceMod: (d, atker, f) => atker.owner === f.owner && ['Beast', 'Beast-Warrior', 'Winged Beast'].includes(atker.d.race) });
  M('Gear Golem the Moving Fortress', {
    ability: { label: '800 LP öde: bu tur direkt saldırabilir', can: (d, p, c) => d.phase === 'main1' && d.P(p).lp > 800 && c.directTurn !== d.turn, async resolve(d, p, c) { await d.damage(p, 800); c.directTurn = d.turn; } },
  });
  M('Tyrant Dragon', { async afterAttack(d, p, c) { if (c.tdTurn !== d.turn && d.monsters(O(p)).length > 0 && d.inMZ(c)) { c.tdTurn = d.turn; c.attacked = false; } } });
  M('Kycoo the Ghost Destroyer', { async onBattleDamage(d, p, c, amt, victim) { if (victim === p) return; for (const m of graveMons(d, victim).sort((a, b) => (b.d.atk || 0) - (a.d.atk || 0)).slice(0, 2)) await d.banish(m); } });
  M('Dark Scorpion Burglars', {
    async onBattleDamage(d, p, c, amt, victim) { if (victim === p) return; const t = await pick(d, victim, d.P(victim).deck.filter(x => x.d.kind === 'spell'), 'Mezarlığa gönderilecek Büyü (desteden)', 'discard'); if (t) await d.sendToGrave(t, 'effect'); },
  });
  M('Nubian Guard', { async onBattleDamage(d, p, c, amt, victim) { if (victim === p) return; const t = d.P(p).grave.find(x => x.d.kind === 'spell' && FX[x.d.name] && FX[x.d.name].sub === 'continuous'); if (t) await toHand(d, p, t); } });
  M('Aswan Apparition', { async onBattleDamage(d, p, c, amt, victim) { if (victim === p) return; const t = d.P(p).grave.find(x => x.d.kind === 'trap'); if (t) await toHand(d, p, t); } });
  M('The Unhappy Maiden', { async onGrave(d, p, c, why) { if (why === 'battle') d.endBattle = true; } });
  M('Grave Protector', { battleShuffle: true });
  M('Fire Princess', { async onHeal(d, p, x, who) { if (who === p) await d.damage(O(p), 500, x); } });
  M('Freed the Matchless General', {
    async guardTarget(d, x, target, src) { if (target !== x || src.kind !== 'spell') return false; if (src.card && d.onField(src.card)) await d.destroy(src.card, x); return true; },
  });
  M('Gora Turtle of Illusion', { async guardTarget(d, x, target, src) { return target === x && (src.kind === 'spell' || src.kind === 'trap'); } });
  M('Different Dimension Dragon', { immune: (d, c, kind) => kind === 'destroy' && !!d.src && (d.src.kind === 'spell' || d.src.kind === 'trap') && !d.isTargeted(c) });
  M('Invader of Darkness', { lockQuick: true });
  M('Kotodama', {
    async onAnySummon(d) { const ms = fieldMons(d, true); for (const m of ms.filter(a => ms.filter(b => b.d.name === a.d.name).length > 1)) if (d.inMZ(m)) await d.destroy(m); },
  });
  M('Mysterious Puppeteer', { async onAnySummon(d, p, x, c) { if (!c.special) await d.heal(p, 500); } });
  M('Teva', { async onSummon(d, p, c) { if (c.tribSum) { d.flags.noAttackTurn = d.flags.noAttackTurn || [-1, -1]; d.flags.noAttackTurn[O(p)] = d.turn + 1; } } });
  M('Moisture Creature', { async onSummon(d, p, c) { if (c.tributed && c.tributed.length === 3) for (const s of anyST(d)) await d.destroy(s, c); } });
  M('Molten Zombie', { async onSummon(d, p, c) { if (c.special && c.from === 'grave') await d.draw(p, 1); } });

  // ======================================================================== GY / EL TEPKİLERİ
  M('Emissary of the Afterlife', {
    async onGrave(d, p) {
      for (const q of [p, O(p)]) { const t = await pick(d, q, d.P(q).deck.filter(c => c.d.type === 'Normal Monster' && (c.d.level || 0) <= 3), 'Desteden ele alınacak Level 3 veya altı Normal canavar', 'help'); if (t) { await toHand(d, q, t); shuffleDeck(d, q); } }
    },
  });
  const spellSent = how => async function (d, p, c) {
    if (!d.src || d.src.p === p) return;
    if (how === 'summon') { if (d.freeZone(p, 'mz') >= 0 && d.P(p).grave.includes(c)) await d.specialSummon(p, c); }
    else if (d.P(p).grave.includes(c)) { await toHand(d, p, c); }
  };
  M('Fear from the Dark', { onSentBySpell: spellSent('summon') });
  M('Despair from the Dark', { onSentBySpell: spellSent('summon') });
  M('Regenerating Mummy', { onSentBySpell: spellSent('hand') });
  M('Roc from the Valley of Haze', { async onHandToGrave(d, p, c) { if (d.P(p).grave.includes(c)) { d.removeFromWherever(c); d.P(p).deck.push(c); shuffleDeck(d, p); } } });
  M('Watapon', {
    handReact: {
      deckToHand: { text: 'Desteden efektle ele eklendi: Special Summon et?', can: (d, p) => !!d.src && d.freeZone(p, 'mz') >= 0, async resolve(d, p, c) { await d.specialSummon(p, c); } },
    },
  });
  M('Peten the Dark Clown', {
    async onGrave(d, p, c) {
      const o = d.P(p).deck.find(x => x.d.name === 'Peten the Dark Clown');
      if (!o || d.freeZone(p, 'mz') < 0 || !(await d.ask(p, c, 'Peten: mezarlıktan çıkarıp destedeki Peten\'i çağır?'))) return;
      await d.banish(c); await d.specialSummon(p, o); shuffleDeck(d, p);
    },
  });
  const fromHandOnGrave = (filter, text) => async function (d, p, c) {
    if (d.freeZone(p, 'mz') < 0) return;
    const cs = d.P(p).hand.filter(x => isMon(x) && filter(x));
    if (!cs.length || !(await d.ask(p, c, text))) return;
    const t = await pick(d, p, cs, text, 'revive'); if (t) await d.specialSummon(p, t);
  };
  M('Pinch Hopper', { onGrave: fromHandOnGrave(x => x.d.race === 'Insect', 'Elinden bir Insect çağırılsın mı?') });
  M('The Thing in the Crater', { onGrave: fromHandOnGrave(x => x.d.race === 'Pyro', 'Elinden bir Pyro çağırılsın mı?') });
  M('Revival Jam', {
    async onGrave(d, p, c, why) {
      if (why !== 'battle' || d.P(p).lp <= 1000 || d.freeZone(p, 'mz') < 0 || !(await d.ask(p, c, '1000 LP öde: Revival Jam kendini çağırsın mı?'))) return;
      await d.damage(p, 1000); if (!d.over && d.P(p).grave.includes(c)) await d.specialSummon(p, c);
    },
  });
  M('Gilasaurus', {
    handSummon: { tributes: 0 },
    async onSummon(d, p, c) { if (!c.special || c.from !== 'hand') return; const q = O(p); if (d.freeZone(q, 'mz') < 0) return; const t = await pick(d, q, graveMons(d, q), 'Gilasaurus: mezarlığından çağırabilirsin', 'revive'); if (t) await d.specialSummon(q, t); },
  });
  M('Don Turtle', { async onSummon(d, p, c) { for (const t of d.P(p).hand.filter(x => x.d.name === 'Don Turtle')) { if (d.freeZone(p, 'mz') < 0) break; await d.specialSummon(p, t); } } });
  M('Avatar of The Pot', {
    handEffect: {
      label: 'Pot of Greed at: 3 kart çek', can: (d, p) => d.P(p).hand.some(x => x.d.name === 'Pot of Greed'),
      async resolve(d, p, c) { const pg = d.P(p).hand.find(x => x.d.name === 'Pot of Greed'); if (!pg) return false; await d.sendToGrave(pg, 'discard'); await d.draw(p, 3); },
      ai: (d, p) => d.P(p).hand.some(x => x.d.name === 'Pot of Greed'),
    },
  });

  // ======================================================================== YETENEKLER / STANDBY / END PHASE
  const returnDead = (name) => M(name, {
    ability: {
      label: 'Tribute: bu tur savaşta yok olan canavarını ele al', battle: true,
      can: (d, p) => d.P(p).grave.some(g => isMon(g) && g.graveInfo && g.graveInfo.turn === d.turn && g.graveInfo.why === 'battle'),
      async resolve(d, p, c) { const t = await pick(d, p, d.P(p).grave.filter(g => isMon(g) && g.graveInfo && g.graveInfo.turn === d.turn && g.graveInfo.why === 'battle'), 'Ele dönecek canavar', 'help'); if (!t) return false; await d.sendToGrave(c, 'tribute'); await toHand(d, p, t); },
    },
  });
  returnDead('Lady Panther'); returnDead('Crimson Sentry');
  M('Goddess of Whim', {
    ability: { label: 'Yazı-tura: tutturursan ATK 2 katı (tur sonuna dek)', can: (d, p, c) => !c.whim, async resolve(d, p, c) { c.whim = true; if ((await d.toss(p))[0]) d.addTemp(c, c.d.atk, 0); }, ai: () => true },
  });
  M('Winged Minion', {
    ability: {
      label: 'Tribute: bir Fiend +700 ATK/DEF (tur sonuna dek)', can: d => fieldMons(d, true).some(m => m.d.race === 'Fiend'),
      async resolve(d, p, c) { const t = await pick(d, p, fieldMons(d, true).filter(m => m.d.race === 'Fiend' && m !== c), 'Güçlenecek Fiend', 'help'); if (!t) return false; await d.sendToGrave(c, 'tribute'); d.addTemp(t, 700, 700); },
    },
  });
  M('The Little Swordsman of Aile', {
    ability: {
      label: 'Başka bir canavarı tribute et: +700 ATK (tur sonuna dek)', can: (d, p, c) => d.monsters(p).some(m => m !== c),
      async resolve(d, p, c) { const t = await pick(d, p, d.monsters(p).filter(m => m !== c), 'Tribute edilecek canavar', 'tribute'); if (!t) return false; await d.sendToGrave(t, 'tribute'); d.addTemp(c, 700, 0); },
    },
  });
  M('Little-Winguard', { async endPhase(d, p, c) { c.pos = c.pos === 'atk' ? 'def' : 'atk'; await d.ev('pos', { p, card: c }); } });
  M('The Wicked Worm Beast', { async endPhase(d, p, c) { await d.bounce(c); } });
  M('Dark Zebra', { async standby(d, p, c) { if (d.monsters(p).length === 1 && c.pos === 'atk') { c.pos = 'def'; await d.ev('pos', { p, card: c }); } } });
  M('The Unfriendly Amazon', {
    async standby(d, p, c) { const t = await pick(d, p, d.monsters(p).filter(m => m !== c), 'Tribute edilecek canavar', 'tribute'); if (t) await d.sendToGrave(t, 'tribute'); else await d.destroy(c); },
  });
  const nyan = async (d, p, c) => { if (d.monsters(p).some(m => m !== c && m.d.attr !== 'LIGHT')) await d.destroy(c); };
  M('Thunder Nyan Nyan', { standby: nyan, endPhase: nyan });
  M('Desertapir', { async onFlip(d, p, c) { const t = await pick(d, p, fieldMons(d, true).filter(m => m !== c), 'Desertapir: kapalı savunmaya çevrilecek canavar', 'harm'); if (t) { t.up = false; t.pos = 'def'; await d.ev('pos', { p: t.owner, card: t }); } } });
  M('Cobra Jar', { async onFlip(d, p) { if (d.freeZone(p, 'mz') >= 0) await E.makeToken(d, p, 'Poisonous Snake Token', 'atk'); } });
  M('Bubonic Vermin', { async onFlip(d, p) { const o = d.P(p).deck.find(x => x.d.name === 'Bubonic Vermin'); if (o && d.freeZone(p, 'mz') >= 0 && (await d.specialSummon(p, o, { pos: 'def' }))) { o.up = false; shuffleDeck(d, p); } } });
});
