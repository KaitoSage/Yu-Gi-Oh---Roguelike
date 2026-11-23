// Kart efektleri (kart adına göre). Yeni efekt eklemek = buraya bir giriş eklemek.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const other = p => 1 - p;

  const ST_ZONE = (d, p) => d.P(p).st.filter(Boolean);
  const hasMonsters = (d, p) => d.monsters(p).length > 0;

  // Ortak: hedef seçtir (null dönebilir)
  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }

  // ----------------------------------------------------------- BÜYÜLER
  FX['Pot of Greed'] = { async resolve(d, p) { await d.draw(p, 2); } };

  FX['Dark Hole'] = {
    can: d => d.allField().some(c => c.d.kind === 'monster'),
    async resolve(d) {
      for (const c of d.allField().filter(c => c.d.kind === 'monster' && d.locate(c).kind === 'mz')) await d.destroy(c);
    },
  };

  FX['Raigeki'] = {
    can: (d, p) => hasMonsters(d, other(p)),
    async resolve(d, p) {
      for (const c of d.monsters(other(p))) await d.destroy(c);
    },
  };

  FX['Hinotama'] = { async resolve(d, p) { await d.damage(other(p), 500); } };
  FX['Sparks'] = { async resolve(d, p) { await d.damage(other(p), 200); } };
  FX['Ookazi'] = { async resolve(d, p) { await d.damage(other(p), 800); } };
  FX['Dian Keto the Cure Master'] = { async resolve(d, p) { await d.heal(p, 1000); } };
  FX['Red Medicine'] = { async resolve(d, p) { await d.heal(p, 500); } };

  FX['Fissure'] = {
    can: (d, p) => d.monsters(other(p), true).length > 0,
    async resolve(d, p) {
      const ms = d.monsters(other(p), true).sort((a, b) => d.atk(a) - d.atk(b));
      if (ms[0]) await d.destroy(ms[0]);
    },
  };

  FX['Monster Reborn'] = {
    can: (d, p) => d.freeZone(p, 'mz') >= 0 && [0, 1].some(i => d.P(i).grave.some(c => c.d.kind === 'monster')),
    async resolve(d, p) {
      const cands = [0, 1].flatMap(i => d.P(i).grave.filter(c => c.d.kind === 'monster'));
      const c = await pick(d, p, cands, 'Monster Reborn: canlandırılacak canavarı seç', 'revive');
      if (!c) return false;
      await d.specialSummon(p, c);
    },
  };

  FX['Mystical Space Typhoon'] = {
    can: (d, p) => d.allField().some(c => c.d.kind !== 'monster' && !(c.d.name === 'Mystical Space Typhoon')),
    async resolve(d, p, self) {
      const cands = d.allField().filter(c => c.d.kind !== 'monster' && c !== self);
      const t = await pick(d, p, cands, 'Mystical Space Typhoon: yok edilecek Büyü/Tuzak', 'harm');
      if (!t) return false;
      await d.destroy(t, self);
    },
  };

  FX['Heavy Storm'] = {
    can: (d, p) => d.allField().some(c => c.d.kind !== 'monster'),
    async resolve(d, p, self) {
      for (const c of d.allField().filter(c => c.d.kind !== 'monster' && c !== self)) await d.destroy(c, self);
    },
  };

  FX['Stop Defense'] = {
    can: (d, p) => d.monsters(other(p), true).some(c => c.pos === 'def'),
    async resolve(d, p) {
      const c = await pick(d, p, d.monsters(other(p), true).filter(c => c.pos === 'def'), 'Stop Defense: Saldırı pozisyonuna çevir', 'harm');
      if (!c) return false;
      c.pos = 'atk';
      await d.ev('pos', { p: c.owner, card: c });
    },
  };

  FX['Reinforcement of the Army'] = {
    can: (d, p) => d.P(p).deck.some(c => c.d.race === 'Warrior' && c.d.level <= 4),
    async resolve(d, p) {
      const c = await pick(d, p, d.P(p).deck.filter(c => c.d.race === 'Warrior' && c.d.level <= 4), 'Desteden bir Warrior (Lv ≤4) ele ekle', 'help');
      if (!c) return false;
      d.removeFromWherever(c);
      d.P(p).hand.push(c);
      await d.ev('search', { p, card: c });
    },
  };

  FX['Swords of Revealing Light'] = {
    sub: 'continuous',
    can: (d, p) => hasMonsters(d, other(p)),
    async resolve(d, p, c) {
      c.counter = 3;
      for (const m of d.monsters(other(p))) if (!m.up) { m.up = true; await d.ev('flip', { p: other(p), card: m }); }
    },
  };

  // Ekipmanlar
  // race: tür adı | null; ya da filtre fonksiyonu (canavar => bool)
  function equip(name, race, atk, def, extra = {}) {
    const ok = m => !race || (typeof race === 'function' ? race(m) : m.d.race === race || m.d.attr === race);
    FX[name] = Object.assign({
      sub: 'equip', ok,
      can: (d, p) => d.monsters(p, true).some(ok),
      async resolve(d, p, c) {
        const t = await pick(d, p, d.monsters(p, true).filter(ok), `${name}: ekipman verilecek canavar`, 'help');
        if (!t) return false;
        c.equipTo = t.uid;
        await d.ev('equip', { p, card: c, target: t });
        await d.notify('onEquip', p, c, t);
      },
      // bonus kart sahada kaldığı sürece geçerli (kart yok edilirse bonus da gider)
      mod(m, key, d, f) { return f.equipTo === m.uid ? (key === 'atk' ? atk : def) : 0; },
    }, extra);
  }
  E.equipHelper = equip;
  equip('Legendary Sword', 'Warrior', 300, 300);
  equip('Book of Secret Arts', 'Spellcaster', 300, 300);
  equip('Dragon Treasure', 'Dragon', 300, 300);
  equip('Sword of Dark Destruction', null, 400, -200);

  // Saha büyüleri (race listeleri: +200 / -200)
  function field(name, up, down) {
    FX[name] = {
      sub: 'field',
      async resolve() {},
      mod(c, key, d, f) {
        if (c.d.kind !== 'monster') return 0;
        if (up.includes(c.d.race)) return 200;
        if (down && down.includes(c.d.race)) return -200;
        return 0;
      },
    };
  }
  field('Forest', ['Insect', 'Beast', 'Plant', 'Beast-Warrior']);
  field('Mountain', ['Dragon', 'Winged Beast', 'Thunder']);
  field('Sogen', ['Warrior', 'Beast-Warrior']);
  field('Wasteland', ['Dinosaur', 'Zombie', 'Rock']);
  field('Umi', ['Fish', 'Sea Serpent', 'Thunder', 'Aqua'], ['Machine', 'Pyro']);
  field('Yami', ['Fiend', 'Spellcaster'], ['Fairy']);

  // ----------------------------------------------------------- TUZAKLAR
  FX['Trap Hole'] = {
    trigger: 'summon',
    can: (d, p, c, ctx) => d.atk(ctx.monster) >= 1000 && d.locate(ctx.monster)?.kind === 'mz',
    async resolve(d, p, c, ctx) { await d.destroy(ctx.monster, c); },
  };

  FX['Mirror Force'] = {
    trigger: 'attack',
    async resolve(d, p, c, ctx) {
      for (const m of d.monsters(other(p)).filter(m => m.pos === 'atk')) await d.destroy(m, c);
      ctx.negated = true;
    },
  };

  FX['Sakuretsu Armor'] = {
    trigger: 'attack',
    async resolve(d, p, c, ctx) { await d.destroy(ctx.attacker, c); ctx.negated = true; },
  };

  FX['Negate Attack'] = { // Counter Trap: saldırıyı iptal eder ve Battle Phase'i bitirir
    trigger: 'attack',
    async resolve(d, p, c, ctx) { ctx.negated = true; d.endBattle = true; },
  };

  FX['Magic Cylinder'] = {
    trigger: 'attack',
    async resolve(d, p, c, ctx) {
      ctx.negated = true;
      await d.damage(other(p), d.atk(ctx.attacker), c);
    },
  };

  FX['Waboku'] = {
    trigger: 'attack',
    async resolve(d, p) { d.flags.waboku[p] = true; },
  };

  FX['Dust Tornado'] = {
    trigger: 'attack',
    can: (d, p) => d.allField().some(c => c.owner === other(p) && c.d.kind !== 'monster'),
    async resolve(d, p, c, ctx) {
      const t = await pick(d, p, d.allField().filter(x => x.owner === other(p) && x.d.kind !== 'monster'), 'Dust Tornado: yok edilecek kart', 'harm');
      if (t) await d.destroy(t, c);
    },
  };

  // ----------------------------------------------------------- CANAVARLAR
  FX['Man-Eater Bug'] = {
    async onFlip(d, p, c) {
      const cands = d.allField().filter(x => x.d.kind === 'monster' && x !== c);
      const t = await pick(d, p, cands, 'Man-Eater Bug: yok edilecek canavar', 'harm');
      if (t) await d.destroy(t, c);
    },
  };

  FX['Hane-Hane'] = {
    async onFlip(d, p, c) {
      const t = await pick(d, p, d.allField().filter(x => x.d.kind === 'monster' && x !== c), 'Hane-Hane: eline dönecek canavar', 'harm');
      if (t) await d.bounce(t);
    },
  };

  FX['Penguin Soldier'] = {
    async onFlip(d, p, c) {
      for (let i = 0; i < 2; i++) {
        const t = await pick(d, p, d.allField().filter(x => x.d.kind === 'monster' && x !== c), `Penguin Soldier: eline dönecek canavar (${i + 1}/2)`, 'harm');
        if (t) await d.bounce(t);
      }
    },
  };

  FX['Magician of Faith'] = {
    async onFlip(d, p) {
      const t = await pick(d, p, d.P(p).grave.filter(x => x.d.kind === 'spell'), 'Magician of Faith: mezarlıktan Büyü seç', 'help');
      if (!t) return;
      d.removeFromWherever(t);
      d.P(p).hand.push(t);
      await d.ev('search', { p, card: t });
    },
  };

  FX['Sangan'] = {
    async onGrave(d, p) {
      const c = await pick(d, p, d.P(p).deck.filter(x => x.d.kind === 'monster' && x.d.atk <= 1500), 'Sangan: desteden ATK ≤1500 canavar al', 'help');
      if (!c) return;
      d.removeFromWherever(c);
      d.P(p).hand.push(c);
      await d.ev('search', { p, card: c });
    },
  };

  FX['Witch of the Black Forest'] = {
    async onGrave(d, p) {
      const c = await pick(d, p, d.P(p).deck.filter(x => x.d.kind === 'monster' && x.d.def <= 1500), 'Witch of the Black Forest: desteden DEF ≤1500 canavar al', 'help');
      if (!c) return;
      d.removeFromWherever(c);
      d.P(p).hand.push(c);
      await d.ev('search', { p, card: c });
    },
  };

  FX['Dark Magician Girl'] = {
    selfMod(c, key, d) {
      const n = [0, 1].reduce((s, i) => s + d.P(i).grave.filter(g => (g.d.alias || g.d.name) === 'Dark Magician' || g.d.name === 'Magician of Black Chaos').length, 0);
      return key === 'atk' || key === 'def' ? n * 300 : 0;
    },
  };

  FX['Dark Elf'] = {
    async attackCost(d, p, c) {
      if (d.P(p).lp <= 1000) return false;
      await d.damage(p, 1000, c);
      return true;
    },
  };

  // Exodia parçaları: yalnızca kombinasyon kazandırır
  for (const n of E.EXODIA) FX[n] = FX[n] || {};

  // ----------------------------------------------------------- GENİŞLETİLMİŞ KART HAVUZU (v2)
  const faceDownMons = d => [0, 1].flatMap(i => d.P(i).mz.filter(c => c && !c.up));
  const stCards = (d, p, onlyDown) => [d.P(p).field, ...d.P(p).st].filter(c => c && (!onlyDown || !c.up));

  // --- Büyüler
  FX['Premature Burial'] = {
    sub: 'equip',
    can: (d, p) => d.P(p).lp > 800 && d.freeZone(p, 'mz') >= 0 && [0, 1].some(i => d.P(i).grave.some(c => c.d.kind === 'monster')),
    async resolve(d, p, c) {
      const cands = [0, 1].flatMap(i => d.P(i).grave.filter(x => x.d.kind === 'monster'));
      const m = await pick(d, p, cands, 'Premature Burial: canlandırılacak canavar (800 LP öde)', 'revive');
      if (!m) return false;
      await d.damage(p, 800, c);
      if (d.over) return;
      if (!(await d.specialSummon(p, m))) return false;
      c.equipTo = m.uid; // canavar sahadan çıkarsa bu kart da gider
    },
  };

  FX['Nobleman of Crossout'] = {
    can: d => faceDownMons(d).length > 0,
    async resolve(d, p) {
      const t = await pick(d, p, faceDownMons(d), 'Nobleman of Crossout: yok edilip çıkarılacak kapalı canavar', 'harm');
      if (!t) return false;
      await d.ev('flip', { p: t.owner, card: t }); t.up = true;
      await d.banish(t);
    },
  };

  FX['Nobleman of Extermination'] = {
    can: (d, p) => [0, 1].some(i => stCards(d, i, true).length > 0),
    async resolve(d, p, self) {
      const cands = [0, 1].flatMap(i => stCards(d, i, true)).filter(c => c !== self);
      const t = await pick(d, p, cands, 'Nobleman of Extermination: çıkarılacak kapalı Büyü/Tuzak', 'harm');
      if (!t) return false;
      t.up = true; await d.banish(t);
    },
  };

  FX['Offerings to the Doomed'] = {
    can: d => d.allField().some(c => c.d.kind === 'monster' && c.up),
    async resolve(d, p) {
      const t = await pick(d, p, d.allField().filter(c => c.d.kind === 'monster' && c.up), 'Offerings to the Doomed: yok edilecek canavar (sonraki Draw atlanır)', 'harm');
      if (!t) return false;
      await d.destroy(t);
      d.flags.skipDraw[p] = true;
    },
  };

  FX['Card Destruction'] = {
    async resolve(d, p) {
      for (const who of [p, other(p)]) {
        const n = d.P(who).hand.length;
        for (const c of [...d.P(who).hand]) await d.sendToGrave(c, 'discard');
        await d.draw(who, n);
      }
    },
  };

  FX['Graceful Charity'] = {
    async resolve(d, p) {
      await d.draw(p, 3);
      for (let i = 0; i < 2; i++) {
        const c = await pick(d, p, d.P(p).hand, `Graceful Charity: at (${i + 1}/2)`, 'discard');
        if (c) await d.sendToGrave(c, 'discard');
      }
    },
  };

  FX['Rain of Mercy'] = { async resolve(d, p) { await d.heal(p, 1000); await d.heal(other(p), 1000); } };

  FX['Giant Trunade'] = {
    can: d => d.allField().some(c => c.d.kind !== 'monster'),
    async resolve(d, p, self) {
      for (const c of d.allField().filter(x => x.d.kind !== 'monster' && x !== self)) await d.bounce(c);
    },
  };

  FX["Harpie's Feather Duster"] = {
    can: (d, p) => stCards(d, other(p)).length > 0,
    async resolve(d, p, self) { for (const c of stCards(d, other(p))) await d.destroy(c, self); },
  };

  FX['Book of Moon'] = {
    can: d => d.allField().some(c => c.d.kind === 'monster' && c.up),
    async resolve(d, p) {
      const t = await pick(d, p, d.allField().filter(c => c.d.kind === 'monster' && c.up), 'Book of Moon: kapalı savunmaya çevrilecek canavar', 'harm');
      if (!t) return false;
      t.up = false; t.pos = 'def';
      await d.ev('pos', { p: t.owner, card: t });
    },
  };

  FX['Smashing Ground'] = {
    can: (d, p) => d.monsters(other(p)).length > 0,
    async resolve(d, p) {
      const ms = d.monsters(other(p)).sort((a, b) => d.def(b) - d.def(a));
      if (ms[0]) await d.destroy(ms[0]);
    },
  };

  FX['Hammer Shot'] = {
    can: d => d.allField().some(c => c.d.kind === 'monster' && c.up && c.pos === 'atk'),
    async resolve(d) {
      const ms = d.allField().filter(c => c.d.kind === 'monster' && c.up && c.pos === 'atk').sort((a, b) => d.atk(b) - d.atk(a));
      if (ms[0]) await d.destroy(ms[0]);
    },
  };

  // Mage Power: kontrol ettiğin her Büyü/Tuzak için +500/+500
  FX['Mage Power'] = {
    sub: 'equip',
    can: (d, p) => d.monsters(p, true).length > 0,
    async resolve(d, p, c) {
      const t = await pick(d, p, d.monsters(p, true), 'Mage Power: ekipman verilecek canavar', 'help');
      if (!t) return false;
      c.equipTo = t.uid;
      await d.ev('equip', { p, card: c, target: t });
    },
    mod(m, key, d, f) {
      if (f.equipTo !== m.uid) return 0;
      const P = d.P(f.owner);
      return 500 * (P.st.filter(Boolean).length + (P.field ? 1 : 0));
    },
  };

  FX['Black Pendant'] = {
    sub: 'equip',
    can: (d, p) => d.monsters(p, true).length > 0,
    async resolve(d, p, c) {
      const t = await pick(d, p, d.monsters(p, true), 'Black Pendant: ekipman verilecek canavar', 'help');
      if (!t) return false;
      t.bonus.atk += 500; c.equipTo = t.uid;
      await d.ev('equip', { p, card: c, target: t });
    },
    async onLeaveField(d, p, c) { await d.damage(other(p), 500, c); },
  };

  equip('Machine Conversion Factory', 'Machine', 300, 300);

  function fieldAttr(name, attr, atk, def) {
    FX[name] = {
      sub: 'field',
      async resolve() {},
      mod(c, key) { return c.d.kind === 'monster' && c.d.attr === attr ? (key === 'atk' ? atk : def) : 0; },
    };
  }
  fieldAttr('Gaia Power', 'EARTH', 500, -400);
  fieldAttr('Mystic Plasma Zone', 'DARK', 500, -400);

  // --- Tuzaklar
  FX['Bottomless Trap Hole'] = {
    trigger: 'summon',
    can: (d, p, c, ctx) => d.atk(ctx.monster) >= 1500 && d.inMZ(ctx.monster),
    async resolve(d, p, c, ctx) { await d.banish(ctx.monster); },
  };

  FX['Torrential Tribute'] = {
    trigger: 'summon',
    async resolve(d, p, c) { for (const m of d.allField().filter(x => x.d.kind === 'monster')) await d.destroy(m, c); },
  };

  FX['Draining Shield'] = {
    trigger: 'attack',
    async resolve(d, p, c, ctx) { ctx.negated = true; await d.heal(p, d.atk(ctx.attacker)); },
  };

  // --- Canavarlar
  FX['Jinzo'] = { negateTraps: true }; // Jinzo açıkken Tuzak Kartları aktive edilemez
  FX['Hayabusa Knight'] = { multiAttack: 2 };
  FX['Buster Blader'] = {
    selfMod(c, key, d) {
      if (key !== 'atk') return 0;
      const o = other(c.owner);
      const n = d.monsters(o, true).filter(m => m.d.race === 'Dragon').length + d.P(o).grave.filter(m => m.d.race === 'Dragon').length;
      return 500 * n;
    },
  };
  FX['Breaker the Magical Warrior'] = {
    async onSummon(d, p, c) {
      const cands = stCards(d, other(p));
      if (!cands.length) return;
      const t = await pick(d, p, cands, 'Breaker: ATK -300 karşılığında yok edilecek Büyü/Tuzak', 'harm');
      if (!t) return;
      c.bonus.atk -= 300;
      await d.destroy(t, c);
    },
  };

  // "Savaşta yok edilince desteden aynı özellikte ATK ≤1500 canavar çağır" ailesi
  function battleTutor(name, attr) {
    FX[name] = {
      async onGrave(d, p, c, why) {
        if (why !== 'battle' || d.freeZone(p, 'mz') < 0) return;
        const cands = d.P(p).deck.filter(x => x.d.kind === 'monster' && x.d.attr === attr && x.d.atk <= 1500);
        const t = await pick(d, p, cands, `${name}: desteden ${attr} canavar çağır`, 'help');
        if (t) await d.specialSummon(p, t);
      },
    };
  }
  battleTutor('Mystic Tomato', 'DARK');
  battleTutor('Giant Rat', 'EARTH');
  battleTutor('Mother Grizzly', 'WATER');
  battleTutor('Shining Angel', 'LIGHT');

  // Efekti yoksayılabilir (isteğe bağlı alternatif çağırma yöntemi) olan canavarlar: istatistikleriyle oynanır
  FX['The Fiend Megacyber'] = {};
  FX['Cyber Harpie Lady'] = {};

  // ----------------------------------------------------------- FUSION & RITUAL
  const lvl = c => c.d.level || 0;

  // Polymerization: elden/sahadan, extra deck'teki Fusion'ın malzemeleri adıyla eşleşir
  function fusionOptions(d, p) {
    const avail = [...d.P(p).hand.filter(c => c.d.kind === 'monster'), ...d.monsters(p)];
    const out = [];
    for (const f of d.P(p).extra) {
      const mats = f.d.materials;
      if (!mats) continue;
      const used = new Set();
      const chosen = [];
      const alt = f.d.matAlt || [];
      // Malzeme eşleşmesi: ad (sahadaki "Dark Magician, the Pharaoh's Servant" Dark Magician sayılır) veya matAlt {names, race, type}
      const nameOf = x => (d.inMZ(x) && x.d.alias) || x.d.name;
      const fits = (x, name, i) => { const s = alt[i]; return nameOf(x) === name || !!(s && ((s.names || []).includes(nameOf(x)) || (s.race && x.d.race === s.race && (!s.type || x.d.type === s.type)) || (s.minLevel && x.d.kind === 'monster' && (x.d.level || 0) >= s.minLevel))); };
      let subUsed = false;
      const ok = mats.every((name, i) => {
        let m = avail.find(x => !used.has(x) && fits(x, name, i));
        if (!m && !subUsed && mats.length > 1) { m = avail.find(x => !used.has(x) && FX[x.d.name] && FX[x.d.name].substitute); if (m) subUsed = true; } // Beastking of the Swamps vb.: 1 malzemenin yerine geçer
        if (!m) return false;
        used.add(m); chosen.push(m);
        return true;
      });
      if (!ok) continue;
      const fieldMats = chosen.filter(m => d.inMZ(m)).length;
      if (d.freeZone(p, 'mz') >= 0 || fieldMats > 0) out.push({ fusion: f, mats: chosen });
    }
    return out;
  }
  E.fusionOptions = fusionOptions;

  FX['Polymerization'] = {
    can: (d, p) => fusionOptions(d, p).length > 0,
    async resolve(d, p) {
      const opts = fusionOptions(d, p);
      const f = await pick(d, p, opts.map(o => o.fusion), 'Polymerization: Fusion Summon edilecek canavar', 'help');
      if (!f) return false;
      const o = opts.find(x => x.fusion === f);
      f.fusionNormals = o.mats.filter(m => m.d.type === 'Normal Monster').length; // Red-Eyes Dark Dragoon: kullanılan Normal canavar sayısı
      for (const m of o.mats) await d.sendToGrave(m, 'fusion');
      await d.specialSummon(p, f);
    },
  };

  // Ritual büyüleri: kart verisindeki `ritual` alanından otomatik üretilir
  function ritualOptions(d, p, r) {
    const rits = d.P(p).hand.filter(c => c.d.kind === 'monster' && /Ritual/.test(c.d.type)
      && (r.targets ? r.targets.includes(c.d.name) : r.target ? c.d.name === r.target : c.d.attr === r.attr));
    const out = [];
    for (const m of rits) {
      const need = r.exact ? lvl(m) : (r.level || lvl(m));
      const pool = [...d.P(p).hand.filter(c => c !== m && c.d.kind === 'monster'), ...d.monsters(p), ...(r.gy ? d.P(p).grave.filter(c => c.d.kind === 'monster') : [])]; // r.gy: mezarlıktan çıkarılarak (banish) da malzeme olur
      const total = pool.reduce((s, c) => s + lvl(c), 0);
      const roomOk = d.freeZone(p, 'mz') >= 0 || d.monsters(p).length > 0;
      if (roomOk && total >= need && (!r.exact || subsetSum(pool.map(lvl), need))) out.push({ ritual: m, need, pool });
    }
    return out;
  }
  function subsetSum(arr, target) {
    const reach = new Set([0]);
    for (const v of arr) for (const s of [...reach]) if (s + v <= target) reach.add(s + v);
    return reach.has(target);
  }
  function exactCombo(pool, target) {
    // en düşük "değerli" kombinasyonu bul (basit DFS)
    let best = null;
    const rec = (i, sum, chosen) => {
      if (sum === target) { if (!best || chosen.length < best.length) best = [...chosen]; return; }
      if (i >= pool.length || sum > target) return;
      chosen.push(pool[i]); rec(i + 1, sum + lvl(pool[i]), chosen); chosen.pop();
      rec(i + 1, sum, chosen);
    };
    rec(0, 0, []);
    return best;
  }

  function registerRitual(name, r) {
    FX[name] = {
      can: (d, p) => ritualOptions(d, p, r).length > 0,
      async resolve(d, p) {
        const opts = ritualOptions(d, p, r);
        const m = await pick(d, p, opts.map(o => o.ritual), `${name}: Ritual Summon edilecek canavar`, 'help');
        if (!m) return false;
        const o = opts.find(x => x.ritual === m);
        let tributes = [];
        if (r.exact) tributes = exactCombo(o.pool, o.need) || [];
        else {
          let sum = 0;
          let left = [...o.pool];
          while (sum < o.need && left.length) {
            let cands = left;
            // bölgeler doluysa en az bir tribute sahadan olmalı
            if (d.freeZone(p, 'mz') < 0 && !tributes.some(t => d.inMZ(t))) cands = left.filter(c => d.inMZ(c));
            const t = await pick(d, p, cands, `Tribute seç (${sum}/${o.need} Level)`, 'tribute');
            if (!t) break;
            tributes.push(t); sum += lvl(t); left = left.filter(c => c !== t);
          }
          if (sum < o.need) return false;
        }
        for (const t of tributes) { if (d.P(p).grave.includes(t)) await d.banish(t); else await d.sendToGrave(t, 'tribute'); }
        await d.specialSummon(p, m);
      },
    };
  }

  // Kart veritabanından dinamik efektleri kaydet (Ritual büyüleri). UI ve testler boot'ta çağırır.
  E.registerRitual = registerRitual;
  E.setup = function (cards) {
    for (const c of cards) if (c.ritual) registerRitual(c.name, c.ritual);
  };

  // Destek: efekti olan kartların desteklendiği liste (havuz filtresi için)
  E.supported = name => !!FX[name];
  return FX;
});
