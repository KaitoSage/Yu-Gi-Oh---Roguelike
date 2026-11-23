// Kart efektleri — 7. paket: Efekt canavarlar (stat formülleri, savaş efektleri, Flip, GY'den çağırmalar, Quick efektler).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects6.js'); module.exports = factory(require('./engine.js')); }
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
  const flagFor = (d, key, p, v) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = v; };
  const foeOf = (d, c) => (d.battle ? (d.battle.a === c ? d.battle.d : d.battle.d === c ? d.battle.a : null) : null);
  const randHand = (d, p) => { const H = d.P(p).hand; return H.length ? H[Math.floor(d.rng() * H.length)] : null; };
  async function discardOne(d, p, prompt, filter = () => true) {
    const c = await pick(d, p, d.P(p).hand.filter(filter), prompt, 'discard');
    if (!c) return false;
    await d.sendToGrave(c, 'discard');
    return true;
  }
  const both = (key, f) => ({ [key]: f });

  // ======================================================================== STAT FORMÜLLERİ (selfMod / mod)
  const count = (d, p, f) => d.monsters(p, true).filter(f).length;
  M('Amazoness Paladin', { selfMod: (c, key, d) => (key === 'atk' ? 100 * count(d, c.owner, m => /^Amazoness/.test(m.d.name)) : 0) });
  M('Amazoness Tiger', {
    summonReq: (d, p) => (d.monsters(p).some(m => m.d.name === 'Amazoness Tiger') ? 'Zaten bir Amazoness Tiger kontrol ediyorsun' : null),
    selfMod: (c, key, d) => (key === 'atk' ? 400 * count(d, c.owner, m => /^Amazoness/.test(m.d.name)) : 0),
  });
  M('Amazoness Fighter', { shield: (d, p, n, src, f) => (d.battle && (d.battle.a === f || d.battle.d === f) ? 0 : n) });
  M('Arsenal Bug', { selfMod: (c, key, d) => (count(d, c.owner, m => m !== c && m.d.race === 'Insect') === 0 ? -1000 : 0) });
  M('Blade Knight', { selfMod: (c, key, d) => (key === 'atk' && d.P(c.owner).hand.length <= 1 ? 400 : 0) });
  M('Command Knight', {
    selfMod: (c, key) => (key === 'atk' ? 400 : 0),
    mod: (m, key, d, f) => (key === 'atk' && m.owner === f.owner && m.d.race === 'Warrior' ? 400 : 0),
  });
  M('Fairy King Truesdale', {
    selfMod: (c, key) => (c.pos === 'def' ? 500 : 0),
    mod: (m, key, d, f) => (f.pos === 'def' && m.owner === f.owner && m.d.race === 'Plant' ? 500 : 0),
  });
  M("Harpie's Pet Dragon", { selfMod: (c, key, d) => 300 * d.allField().filter(m => isMon(m) && m.up && /Harpie Lady/.test(m.d.name)).length });
  M('Machine King', { selfMod: (c, key, d) => (key === 'atk' ? 100 * d.allField().filter(m => isMon(m) && m.up && m.d.race === 'Machine').length : 0) });
  M('Wodan the Resident of the Forest', { selfMod: (c, key, d) => (key === 'atk' ? 100 * d.allField().filter(m => isMon(m) && m.up && m.d.race === 'Plant').length : 0) });
  M('Maha Vailo', { selfMod: (c, key, d) => (key === 'atk' ? 500 * d.allField().filter(m => m.equipTo === c.uid).length : 0) });
  M('Insect Soldiers of the Sky', { selfMod: (c, key, d) => { const f = foeOf(d, c); return key === 'atk' && d.battle && d.battle.a === c && f && f.d.attr === 'WIND' ? 1000 : 0; } });
  M('Luminous Soldier', { selfMod: (c, key, d) => { const f = foeOf(d, c); return key === 'atk' && f && f.d.attr === 'DARK' ? 500 : 0; } });
  M('Penumbral Soldier Lady', { selfMod: (c, key, d) => { const f = foeOf(d, c); return key === 'atk' && f && f.d.attr === 'LIGHT' ? 1000 : 0; } });
  M('Cipher Soldier', { selfMod: (c, key, d) => { const f = foeOf(d, c); return f && f.d.race === 'Warrior' ? 2000 : 0; } });
  M('Gyaku-Gire Panda', { pierce: true, selfMod: (c, key, d) => (key === 'atk' ? 500 * d.monsters(O(c.owner)).length : 0) });
  M('Great Maju Garzett', { selfMod: (c, key) => (key === 'atk' && c.tributed && c.tributed.length ? 2 * Math.max(...c.tributed.map(t => t.d.atk || 0)) : 0) });
  M('Maju Garzett', { selfMod: (c, key) => (key === 'atk' && c.tributed && c.tributed.length ? c.tributed.reduce((s, t) => s + (t.d.atk || 0), 0) + 1 : 0) });
  M('The Rock Spirit', { selfMod: (c, key, d) => (key === 'atk' && d.phase === 'battle' && d.active !== c.owner ? 300 : 0) });
  M('Spirit of Flames', { selfMod: (c, key, d) => (key === 'atk' && d.phase === 'battle' && d.active === c.owner ? 300 : 0) });
  M('Soul of Purity and Light', { mod: (m, key, d, f) => (key === 'atk' && m.owner !== f.owner && d.phase === 'battle' && d.active === m.owner ? -300 : 0) });

  // ======================================================================== SAVAŞ EFEKTLERİ
  M('D.D. Crazy Beast', { async onKill(d, p, c, v) { if (d.P(v.owner).grave.includes(v)) await d.banish(v); } });
  M('Masked Sorcerer', { async onBattleDamage(d, p, c, amt, victim, direct) { if (victim !== p) await d.draw(p, 1); } });
  M('White Magical Hat', { async onBattleDamage(d, p, c, amt, victim) { if (victim !== p) { const r = randHand(d, victim); if (r) await d.sendToGrave(r, 'discard'); } } });
  M('The Bistro Butcher', { async onBattleDamage(d, p, c, amt, victim) { if (victim !== p) await d.draw(victim, 2); } });
  M('Absorbing Kid from the Sky', { async onKill(d, p, c, v) { await d.heal(p, (v.d.level || 0) * 300); } });
  M('Helping Robo for Combat', {
    async onKill(d, p) {
      await d.draw(p, 1);
      const c = await pick(d, p, d.P(p).hand, 'Destenin altına konacak kart', 'discard');
      if (c) { d.removeFromWherever(c); d.P(p).deck.push(c); }
    },
  });
  M('Timeater', { async onKill(d, p) { flagFor(d, 'skipMain1', O(p), true); } });
  M('Fenrir', {
    handSummon: banishCost('WATER', 2),
    async onKill(d, p) { d.flags.skipDraw[O(p)] = (d.flags.skipDraw[O(p)] || 0) + 1; },
  });
  M('Inferno', { handSummon: banishCost('FIRE', 1), async onKill(d, p) { await d.damage(O(p), 1500); } });
  M('Obnoxious Celtic Guard', { noBattleDestroy: (d, c) => { const f = foeOf(d, c); return !!(f && d.atk(f) >= 1900); } });
  M('Twinheaded Beast', { multiAttack: 2 });
  M('Piranha Army', { dmgMult: (d, c, direct) => (direct ? 2 : 1) });
  M('Stone Statue of the Aztecs', { reflectMult: 2 });
  M('Ryu Kokki', { async afterBattle(d, p, c, o) { if (o.d.race === 'Warrior' || o.d.race === 'Spellcaster') await d.destroy(o, c); } });
  M('Getsu Fuhma', { async afterBattle(d, p, c, o) { if (o.d.race === 'Fiend' || o.d.race === 'Zombie') await d.destroy(o, c); } });
  M('Wall of Illusion', { async afterDefended(d, p, c, atker) { await d.bounce(atker); } });
  M('Kelbek', { async afterDefended(d, p, c, atker) { await d.bounce(atker); } });
  M('Yomi Ship', { async onGrave(d, p, c, why) { if (why === 'battle' && c.killedBy && d.onField(c.killedBy)) await d.destroy(c.killedBy, c); } });
  M('Slate Warrior', {
    async onFlip(d, p, c) { c.bonus.atk += 500; c.bonus.def += 500; },
    async onGrave(d, p, c, why) { if (why === 'battle' && c.killedBy && d.onField(c.killedBy)) { c.killedBy.bonus.atk -= 500; c.killedBy.bonus.def -= 500; } },
  });
  M('Birdface', { async onGrave(d, p, c, why) { if (why !== 'battle') return; const h = d.P(p).deck.find(x => x.d.name === 'Harpie Lady'); if (h && (await d.ask(p, c, 'Desteden Harpie Lady ele alınsın mı?'))) { await toHand(d, p, h); shuffleDeck(d, p); } } });
  const reviveFromDeck = (filter, text) => async function (d, p, c, why) {
    if (why !== 'battle' || d.freeZone(p, 'mz') < 0) return;
    const cs = d.P(p).deck.filter(x => isMon(x) && filter(x) && x.d.type !== 'Fusion Monster');
    if (!cs.length || !(await d.ask(p, c, text))) return;
    const t = await pick(d, p, cs, text, 'revive');
    if (t) { await d.specialSummon(p, t); shuffleDeck(d, p); }
  };
  M('Flying Kamakiri #1', { onGrave: reviveFromDeck(x => x.d.attr === 'WIND' && (x.d.atk || 0) <= 1500, 'Desteden ATK 1500 veya altı WIND canavar çağırılsın mı?') });
  M('Howling Insect', { onGrave: reviveFromDeck(x => x.d.race === 'Insect' && (x.d.atk || 0) <= 1500, 'Desteden ATK 1500 veya altı Insect çağırılsın mı?') });
  M('Troop Dragon', { onGrave: reviveFromDeck(x => x.d.name === 'Troop Dragon', 'Desteden Troop Dragon çağırılsın mı?') });
  M('Dark Mimic LV3', { async onGrave(d, p, c, why) { if (why === 'battle') await d.draw(p, 1); } });
  M('Lord Poison', { async onGrave(d, p, c, why) { if (why !== 'battle' || d.freeZone(p, 'mz') < 0) return; const t = await pick(d, p, graveMons(d, p, x => x.d.race === 'Plant' && x.d.name !== 'Lord Poison'), 'Lord Poison: mezarlıktan çağrılacak Plant', 'revive'); if (t) await d.specialSummon(p, t); } });
  M('Gigantes', { handSummon: banishCost('EARTH', 1), async onGrave(d, p, c, why) { if (why === 'battle') for (const s of anyST(d)) await d.destroy(s, c); } });
  M('Silpheed', { handSummon: banishCost('WIND', 1), async onGrave(d, p, c, why) { if (why === 'battle') { const r = randHand(d, O(p)); if (r) await d.sendToGrave(r, 'discard'); } } });
  M('Mystical Knight of Jackal', { async onKill(d, p, c, v) { if (d.P(v.owner).grave.includes(v) && (await d.ask(p, c, 'Yok ettiğin canavar rakibin destesinin üstüne konsun mu?'))) { d.removeFromWherever(v); d.P(v.owner).deck.unshift(v); } } });

  // Direkt saldırı koşulları
  const onlyOppCards = (d, c, pred) => { const O1 = d.P(O(c.owner)); return !O1.st.some(Boolean) && !O1.field && O1.mz.some(Boolean) && O1.mz.every(m => !m || pred(m)); };
  M('Drillago', { direct: (d, p, c) => onlyOppCards(d, c, m => m.up && d.atk(m) >= 1600) });
  M('Rocket Jumper', { direct: (d, p, c) => onlyOppCards(d, c, m => m.pos === 'def') });
  M('Black Tyranno', { direct: (d, p, c) => onlyOppCards(d, c, m => m.pos === 'def') });

  // ======================================================================== KORUMA / KİLİT
  M('Lord of D.', { noTargetRace: 'Dragon' });
  M('Blindly Loyal Goblin', { immune: (d, c, kind) => kind === 'control' });
  for (const n of ['Eagle Eye', 'Invasion of Flames', 'Creeping Doom Manta', 'Tactical Espionage Expert']) M(n, { stopTraps: true });
  M('Mirage Dragon', { noTrapsBattle: true });
  M('Pitch-Black Warwolf', { noTrapsBattle: true });
  M('Spell Canceller', { negateSpells: true });
  M('Protector of the Sanctuary', { lockOppDraw: true });
  M('Banisher of the Light', { banishGrave: true });
  M('Zombyra the Dark', { noDirectAtk: true });

  // ======================================================================== STANDBY (LP kazanma / bakım bedeli)
  M('Cure Mermaid', { async standby(d, p) { await d.heal(p, 800); } });
  M('Dancing Fairy', { async standby(d, p, c) { if (c.pos === 'def') await d.heal(p, 1000); } });
  M('Spirit of the Breeze', { async standby(d, p, c) { if (c.pos === 'atk') await d.heal(p, 1000); } });
  const upkeep = n => async function (d, p, c) { if (d.allField().some(x => x.up && x.d.name === 'Pandemonium')) return; if (d.P(p).lp > n) await d.damage(p, n, c); else await d.destroy(c); };
  M('Darkbishop Archfiend', { standby: upkeep(500) });
  M('Desrook Archfiend', { standby: upkeep(500) });
  M('Infernalqueen Archfiend', { standby: upkeep(500) });
  M('Vilepawn Archfiend', { standby: upkeep(500) });
  M('Shadowknight Archfiend', { standby: upkeep(900) });
  M('Granadora', { async onSummon(d, p) { await d.heal(p, 1000); }, async onFlip(d, p) { await d.heal(p, 1000); }, async onGrave(d, p) { await d.damage(p, 2000); } });
  M('Elephant Statue of Blessing', { async onSentBySpell(d, p) { if (d.src && d.src.p !== p) await d.heal(p, 2000); } });
  M('Elephant Statue of Disaster', { async onSentBySpell(d, p) { if (d.src && d.src.p !== p) await d.damage(O(p), 2000); } });
  M('Zolga', { async onTributed(d, p) { await d.heal(p, 2000); } });
  M('Cockroach Knight', { async onGrave(d, p, c) { if (d.P(p).grave.includes(c)) { d.removeFromWherever(c); d.P(p).deck.unshift(c); } } });
  M('Outstanding Dog Marron', { async onGrave(d, p, c) { if (d.P(p).grave.includes(c)) { d.removeFromWherever(c); d.P(p).deck.push(c); shuffleDeck(d, p); } } });

  // ======================================================================== ELDEN ÖZEL ÇAĞIRMA (GY'den canavar çıkararak)
  function banishCost(attr, n) {
    return {
      tributes: 0,
      can: (d, p) => (graveMons(d, p, x => x.d.attr === attr).length >= n ? null : `Mezarlığında ${n} ${attr} canavar olmalı`),
      async cost(d, p) {
        for (let i = 0; i < n; i++) {
          const t = await pick(d, p, graveMons(d, p, x => x.d.attr === attr), `Çıkarılacak ${attr} canavar (${i + 1}/${n})`, 'cost');
          if (!t) return false;
          await d.banish(t);
        }
      },
    };
  }
  M('Aqua Spirit', { handSummon: banishCost('WATER', 1) });
  M('Garuda the Wind Spirit', { handSummon: banishCost('WIND', 1) });
  // Stat formülü yukarıda tanımlı olan GY-banish canavarlarına çağırma yöntemi eklenir
  FX['Spirit of Flames'].handSummon = banishCost('FIRE', 1);
  FX['The Rock Spirit'].handSummon = banishCost('EARTH', 1);
  FX['Soul of Purity and Light'].handSummon = banishCost('LIGHT', 2);

  // ======================================================================== YETENEKLER (Main Phase / Quick)
  const tributeSummon = (name, target) => M(name, {
    ability: {
      label: `Tribute: elinden ${target} çağır`,
      can: (d, p) => d.P(p).hand.some(x => x.d.name === target) && d.monsters(p).length > 0,
      async resolve(d, p, c) { const t = d.P(p).hand.find(x => x.d.name === target); if (!t) return false; await d.sendToGrave(c, 'tribute'); await d.specialSummon(p, t); },
      ai: (d, p) => d.P(p).hand.some(x => x.d.name === target),
    },
  });
  tributeSummon('Kaibaman', 'Blue-Eyes White Dragon');
  tributeSummon('The Creator Incarnate', 'The Creator');
  tributeSummon("Black Dragon's Chick", 'Red-Eyes Black Dragon');
  M('The Creator', {
    ability: {
      label: '1 kart at: mezarlıktan canavar çağır',
      can: (d, p) => d.P(p).hand.length > 0 && graveMons(d, p).length > 0 && d.freeZone(p, 'mz') >= 0,
      async resolve(d, p) { if (!(await discardOne(d, p, 'The Creator: at'))) return false; const t = await pick(d, p, graveMons(d, p), 'Çağrılacak canavar', 'revive'); if (t) await d.specialSummon(p, t); },
      ai: (d, p) => d.P(p).hand.length >= 2 && graveMons(d, p).some(m => (m.d.atk || 0) >= 1800),
    },
  });
  M('Karate Man', {
    ability: {
      label: 'Orijinal ATK ikiye katlansın (End Phase\'de yok olur)', can: (d, p, c) => !c.karate,
      async resolve(d, p, c) { c.karate = true; c.bonus.atk += c.d.atk; (d.endQueue = d.endQueue || []).push(async () => { if (d.onField(c)) await d.destroy(c); }); },
      ai: (d, p, c) => d.phase === 'main1',
    },
  });
  M('Gray Wing', {
    ability: {
      label: '1 kart at: bu tur iki kez saldırabilir', can: (d, p) => d.phase === 'main1' && d.P(p).hand.length > 0,
      async resolve(d, p, c) { if (!(await discardOne(d, p, 'Gray Wing: at'))) return false; c.multiTurn = d.turn; },
      ai: (d, p) => d.P(p).hand.length >= 3,
    },
  });
  M('Jowgen the Spiritualist', {
    ability: {
      label: 'Rastgele 1 kart at: tüm Special Summon canavarları yok et', can: (d, p) => d.P(p).hand.length > 0 && fieldMons(d, true).some(c => c.special),
      async resolve(d, p) { const r = randHand(d, p); if (r) await d.sendToGrave(r, 'discard'); for (const c of fieldMons(d, true).filter(m => m.special)) await d.destroy(c); },
    },
  });
  M('Sand Gambler', {
    ability: {
      label: '3 yazı-tura: hepsi yazı → rakibin canavarları yok',
      can: (d, p) => d.phase === 'main1' || d.phase === 'main2',
      async resolve(d, p) {
        const t = await d.toss(p, 3);
        if (t.every(Boolean)) for (const m of d.monsters(O(p))) await d.destroy(m); else if (t.every(x => !x)) for (const m of d.monsters(p)) await d.destroy(m);
      },
    },
  });
  M('Tribe-Infecting Virus', {
    ability: {
      label: '1 kart at: en kalabalık rakip türünü yok et', can: (d, p) => d.P(p).hand.length > 0 && d.monsters(O(p)).some(m => m.up),
      async resolve(d, p) {
        const tally = {}; for (const m of fieldMons(d, true)) tally[m.d.race] = (tally[m.d.race] || 0) + (m.owner === p ? -1 : 1);
        const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        if (!best || best[1] <= 0) return false;
        if (!(await discardOne(d, p, 'Tribe-Infecting Virus: at'))) return false;
        for (const m of fieldMons(d, true).filter(x => x.d.race === best[0])) await d.destroy(m);
      },
      ai: (d, p) => d.P(p).hand.length >= 3 && d.monsters(O(p)).length >= 2,
    },
  });

  // ======================================================================== FLIP EFEKTLERİ
  const flip = (name, fn, extra) => M(name, Object.assign({ onFlip: fn }, extra));
  flip('Sonic Jammer', async (d, p) => { flagFor(d, 'noSpell', O(p), d.turn + 1); });
  flip('Dimension Jar', async (d, p) => {
    for (const q of [p, O(p)]) { const cs = graveMons(d, O(q)).sort((a, b) => (b.d.atk || 0) - (a.d.atk || 0)).slice(0, 3); for (const c of cs) await d.banish(c); }
  });
  flip('Invader of the Throne', async (d, p, c) => {
    if (d.phase === 'battle') return;
    const t = await pick(d, p, d.monsters(O(p)), 'Invader of the Throne: kontrol değişecek rakip canavarı', 'harm');
    if (!t || d.immune(t, 'control')) return;
    const mi = d.P(p).mz.indexOf(c), ti = d.P(t.owner).mz.indexOf(t);
    if (mi < 0 || ti < 0) return;
    const q = t.owner;
    d.P(p).mz[mi] = t; d.P(q).mz[ti] = c;
    t.owner = p; c.owner = q; t.moved = true; c.moved = true; t.placedTurn = d.turn; c.placedTurn = d.turn;
    await d.ev('control', { p, card: t });
  });
  flip('Fiber Jar', async (d) => {
    for (const q of [0, 1]) {
      const P = d.P(q);
      const cards = [...P.hand, ...P.grave, ...d.allField().filter(x => x.origOwner === q)];
      for (const c of cards) { d.removeFromWherever(c); if (c.d.type !== 'Token') { c.up = true; c.pos = 'atk'; c.owner = c.origOwner; c.bonus = { atk: 0, def: 0 }; c.equipTo = null; P.deck.push(c); } }
      shuffleDeck(d, q);
    }
    await d.ev('reset', {});
    await d.draw(0, 5); await d.draw(1, 5);
  });
  flip('Morphing Jar', async (d) => { for (const q of [0, 1]) for (const c of [...d.P(q).hand]) await d.sendToGrave(c, 'discard'); await d.draw(0, 5); await d.draw(1, 5); });
  flip('Arsenal Summoner', async (d, p) => {
    const bad = ['Celtic Guardian', 'Winged Dragon, Guardian of the Fortress #1', 'Winged Dragon, Guardian of the Fortress #2', 'Guardian of the Labyrinth', 'The Reliable Guardian'];
    const t = await pick(d, p, d.P(p).deck.filter(x => /Guardian/.test(x.d.name) && !bad.includes(x.d.name)), 'Arsenal Summoner: ele alınacak Guardian', 'help');
    if (t) { await toHand(d, p, t); shuffleDeck(d, p); }
  });
  flip('Greenkappa', async (d, p) => {
    for (let i = 0; i < 2; i++) { const t = await pick(d, p, anyST(d).filter(x => !x.up), `Greenkappa: yok edilecek set Büyü/Tuzak (${i + 1}/2)`, 'harm'); if (!t) break; await d.destroy(t); }
  });
  flip('Trap Master', async (d, p) => { const t = await pick(d, p, anyST(d).filter(x => x.d.kind === 'trap'), 'Trap Master: yok edilecek Tuzak', 'harm'); if (t) await d.destroy(t); });
  flip('Fire Sorcerer', async (d, p) => {
    if (d.P(p).hand.length < 2) return;
    for (let i = 0; i < 2; i++) { const r = randHand(d, p); if (r) await d.banish(r); }
    await d.damage(O(p), 800);
  });
  flip('Needle Worm', async (d, p) => { for (let i = 0; i < 5; i++) { const c = d.P(O(p)).deck.shift(); if (!c) break; d.P(O(p)).grave.push(c); c.graveInfo = { turn: d.turn, why: 'mill', from: 'deck' }; await d.ev('toGrave', { card: c, from: 'deck', why: 'mill' }); } });
  flip('Dark Cat with White Tail', async (d, p) => {
    for (let i = 0; i < 2; i++) { const t = await pick(d, p, d.monsters(O(p)), `Dark Cat: ele dönecek rakip canavarı (${i + 1}/2)`, 'harm'); if (t) await d.bounce(t); }
    const m = await pick(d, p, d.monsters(p), 'Dark Cat: ele dönecek kendi canavarın', 'help'); if (m) await d.bounce(m);
  });
  flip("Hiro's Shadow Scout", async (d, p) => {
    const q = O(p); const before = d.P(q).hand.length; await d.draw(q, 3);
    for (const c of d.P(q).hand.slice(before).filter(x => x.d.kind === 'spell')) await d.sendToGrave(c, 'discard');
  });
  flip('An Owl of Luck', async (d, p) => { const t = await pick(d, p, d.P(p).deck.filter(x => E.isFieldSpell(x)), 'Destenin üstüne konacak Saha Büyüsü', 'help'); if (t) { d.removeFromWherever(t); d.P(p).deck.unshift(t); } });
  flip('A Cat of Ill Omen', async (d, p) => { const t = await pick(d, p, d.P(p).deck.filter(x => x.d.kind === 'trap'), 'Destenin üstüne konacak Tuzak', 'help'); if (t) { d.removeFromWherever(t); d.P(p).deck.unshift(t); } });
  flip('Dekoichi the Battlechanted Locomotive', async (d, p) => { await d.draw(p, 1 + d.monsters(p, true).filter(m => m.d.name === 'Bokoichi the Freightening Car').length); });

  // ======================================================================== QUICK EFEKTLER (rakibin turunda tepki penceresi: fx.quick)
  // Saldırıldığında: saldıran canavarın ATK'sını 0 yapar (Kazejin / Sanga of the Thunder / Suijin; tur başı 1)
  const attackedShrink = {
    triggers: ['attack'], once: true,
    can: (d, p, c, ctx) => ctx.target === c && ctx.attacker && d.inMZ(ctx.attacker),
    text: (ctx, c) => `${c.d.name} saldırıldı: saldıranın ATK'sını 0 yap?`,
    async resolve(d, p, c, ctx) { d.addTemp(ctx.attacker, -d.atk(ctx.attacker), 0); },
    ai: (d, p, c, ctx) => !!(ctx && ctx.attacker && d.atk(ctx.attacker) > d.atk(c)),
  };
  for (const n of ['Kazejin', 'Sanga of the Thunder', 'Suijin']) M(n, { quick: attackedShrink });
  // Strike Ninja: GY'den 2 DARK canavar çıkar → kendini End Phase'e kadar çıkarır (efekt/Büyü/saldırıdan kaçış)
  M('Strike Ninja', {
    quick: {
      triggers: ['attack', 'spell', 'effect'], once: true,
      can: (d, p, c, ctx) => graveMons(d, p, x => x.d.attr === 'DARK').length >= 2 && (ctx.attacker ? ctx.target === c : true),
      text: (ctx, c) => 'Strike Ninja: 2 DARK canavar çıkarıp kendini End Phase\'e kadar çıkar?',
      async cost(d, p) { for (let i = 0; i < 2; i++) { const t = await pick(d, p, graveMons(d, p, x => x.d.attr === 'DARK'), `Çıkarılacak DARK canavar (${i + 1}/2)`, 'cost'); if (!t) return false; await d.banish(t); } },
      async resolve(d, p, c, ctx) {
        const me = c; await d.banish(me); if (ctx) ctx.negated = true;
        (d.endQueue = d.endQueue || []).push(async () => { if (d.P(p).banished.includes(me) && d.freeZone(p, 'mz') >= 0) await d.specialSummon(p, me); });
      },
      ai: (d, p, c, ctx) => !!(ctx && ctx.attacker && d.atk(ctx.attacker) > d.def(c) && d.atk(ctx.attacker) > d.atk(c)),
    },
  });
  // Injection Fairy Lily: saldırıldığında 2000 LP ödeyip ATK +3000
  M('Injection Fairy Lily', {
    quick: {
      triggers: ['attack'], once: true,
      can: (d, p, c, ctx) => ctx.target === c && d.P(p).lp > 2000,
      text: () => 'Injection Fairy Lily: 2000 LP öde, ATK +3000?',
      async cost(d, p) { await d.damage(p, 2000); },
      async resolve(d, p, c) { d.addTemp(c, 3000, 0); },
      ai: (d, p, c, ctx) => !!(ctx && ctx.attacker && d.P(p).lp > 3000 && d.atk(ctx.attacker) > d.atk(c) && d.atk(ctx.attacker) < d.atk(c) + 3000),
    },
  });
  // A-Team: Trap Disposal Unit: rakip Tuzak aktive edince kendini tribute et → iptal et ve yok et (her iki oyuncunun turunda)
  M('A-Team: Trap Disposal Unit', {
    negator: {
      can: (d, x, card) => card.d.kind === 'trap',
      text: card => `${card.d.name} aktive edildi: A-Team'i tribute edip iptal et ve yok et?`,
      cost: async (d, p, x) => { await d.sendToGrave(x, 'tribute'); },
      async after(d, p, x, src) { if (d.onField(src)) await d.destroy(src, x); },
    },
  });
});
