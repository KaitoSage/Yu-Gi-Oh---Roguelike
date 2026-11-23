// Kart efektleri — 3. paket: Overframe (Prismatic) efsane kartları.
// Bu kartlar Duel Monsters sonrası dönemdendir; oyuna özel `data/cards.custom.json` ile eklenir ve yalnızca paketlerden çıkar.
//   Dark Magician, the Pharaoh's Servant · Dark Magical Curtain · Red-Eyes Dark Dragoon
//   Blue-Eyes White Dragon, the White Phantom Beast · Blue-Eyes Ultimate Dragon, the God-Surpassing Servant
//   Red-Eyes Black Dragon Exceed
// Basitleştirmeler: "Quick Effect" yetenekleri yalnızca kendi turunda (Dragoon'un iptali hariç: rakibin aktivasyonuna karşı çalışır);
// Exceed'in "Dark Time Wizard" şartı yerine Time Wizard malzeme sayılır, alternatif çağırma yolu yok.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { require('./effects2.js'); module.exports = factory(require('./engine.js')); }
  else factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;
  const O = p => 1 - p;

  async function pick(d, p, cards, prompt, hint) {
    cards = d.filterTargets(cards, hint);
    if (!cards.length) return null;
    const c = await d.ctl[p].pick(d, p, cards.map(card => ({ card })), prompt, hint);
    if (c) await d.targeted(c, hint);
    return c;
  }
  const stZone = (d, p) => [d.P(p).field, ...d.P(p).st].filter(Boolean);
  const isSpell = c => c.d.kind === 'spell';
  const mentionsDM = c => (c.d.kind === 'spell' || c.d.kind === 'trap') && /Dark Magician/.test(c.d.desc || '');
  const turnMark = (d, key, p) => { d.flags[key] = d.flags[key] || [-1, -1]; return d.flags[key][p] === d.turn; };
  const setMark = (d, key, p) => { d.flags[key] = d.flags[key] || [-1, -1]; d.flags[key][p] = d.turn; };

  // Desteden Büyü/Tuzak'ı kapalı koy (Set)
  const canSetFromDeck = (d, p, c) => (E.isFieldSpell(c) ? !d.P(p).field : d.freeZone(p, 'st') >= 0);
  async function setFromDeck(d, p, c) {
    d.removeFromWherever(c);
    if (E.isFieldSpell(c)) d.P(p).field = c; else d.P(p).st[d.freeZone(p, 'st')] = c;
    c.up = false; c.placedTurn = d.turn;
    await d.ev('setST', { p, card: c });
  }
  async function discardOne(d, p, prompt, filter = () => true) {
    const c = await pick(d, p, d.P(p).hand.filter(filter), prompt, 'discard');
    if (!c) return false;
    await d.sendToGrave(c, 'discard');
    return true;
  }

  // ============================================================ Dark Magician, the Pharaoh's Servant
  const DMPS = "Dark Magician, the Pharaoh's Servant";
  FX[DMPS] = {
    alsoNormal: true,
    // Elden: "Dark Magician, the Pharaoh's Servant" adlı bu kartın 2 efektinden yalnızca 1'i, tur başına bir kez
    handSummon: {
      tributes: 0,
      can(d, p, c) {
        if (turnMark(d, 'dmps', p)) return 'Bu tur Pharaoh\'s Servant efekti zaten kullanıldı';
        if (!d.P(p).hand.some(x => x !== c && isSpell(x))) return 'Elinde gösterecek Büyü yok';
      },
      async cost(d, p, c) {
        const s = await pick(d, p, d.P(p).hand.filter(x => x !== c && isSpell(x)), 'Göster: elindeki bir Büyü', 'help');
        if (!s) return false;
        await d.ev('reveal', { p, card: s });
        setMark(d, 'dmps', p);
        c.pendingSet = true;
      },
    },
    async onSummon(d, p, c) {
      if (!c.pendingSet) return;
      c.pendingSet = false;
      const cs = d.P(p).deck.filter(x => mentionsDM(x) && canSetFromDeck(d, p, x));
      if (!cs.length) return;
      const t = await pick(d, p, cs, 'Desteden Set edilecek "Dark Magician" Büyü/Tuzağı', 'help');
      if (t) await setFromDeck(d, p, t);
    },
    // Quick Effect (burada: kendi turunda): 1 Büyü at → rakibin tüm Büyü/Tuzaklarını yok et
    ability: {
      label: '1 Büyü at → rakibin Büyü/Tuzaklarını yok et', battle: true,
      can: (d, p, c) => !turnMark(d, 'dmps', p) && d.P(p).hand.some(isSpell) && stZone(d, O(p)).length > 0,
      async resolve(d, p, c) {
        if (!(await discardOne(d, p, 'At: 1 Büyü', isSpell))) return false;
        setMark(d, 'dmps', p);
        for (const x of stZone(d, O(p))) await d.destroy(x, c);
      },
      ai: (d, p) => stZone(d, O(p)).length >= 2 && d.P(p).hand.filter(isSpell).length >= 1 && d.P(p).hand.length >= 3,
    },
  };

  // ============================================================ Dark Magical Curtain
  const darkSpellcaster = c => c.d.kind === 'monster' && c.d.attr === 'DARK' && c.d.race === 'Spellcaster';
  FX['Dark Magical Curtain'] = {
    can: (d, p) => !turnMark(d, 'curtain', p) && d.freeZone(p, 'mz') >= 0 && [...d.P(p).hand, ...d.P(p).deck].some(darkSpellcaster),
    async resolve(d, p, self) {
      setMark(d, 'curtain', p);
      let dmSummoned = false;
      // Her iki oyuncu da elinden/destesinden 1 DARK Spellcaster çağırabilir (efektleri bu tur kullanılamaz)
      for (const q of [p, O(p)]) {
        if (d.freeZone(q, 'mz') < 0) continue;
        const cs = [...d.P(q).hand, ...d.P(q).deck].filter(darkSpellcaster);
        if (!cs.length) continue;
        const c = await pick(d, q, cs, 'Dark Magical Curtain: çağrılacak DARK Spellcaster', 'revive');
        if (!c) continue;
        const orig = c.d.name;
        if (await d.specialSummon(q, c, { muted: true }) && q === p && (orig === 'Dark Magician' || orig === 'Dark Magician Girl')) dmSummoned = true;
      }
      if (dmSummoned) {
        const cs = d.P(p).deck.filter(x => mentionsDM(x) && x.d.name !== 'Dark Magical Curtain');
        const t = await pick(d, p, cs, 'Ele eklenecek "Dark Magician" Büyü/Tuzağı', 'help');
        if (t) { d.removeFromWherever(t); d.P(p).hand.push(t); await d.ev('search', { p, card: t }); await d.handReact('deckToHand', p, t); }
      }
    },
  };

  // ============================================================ Blue-Eyes White Dragon, the White Phantom Beast
  const BEWD = 'Blue-Eyes White Dragon, the White Phantom Beast';
  const bewdSummon = {
    can: (d, p, c) => d.freeZone(p, 'mz') >= 0,
    async resolve(d, p, c) { await d.ev('reveal', { p, card: c }); await d.specialSummon(p, c); },
  };
  FX[BEWD] = {
    // Hedef alan bir efekt aktive edilince: 1 kart at → o efekti iptal et
    async onTargeted(d, p, c) {
      if (!d.P(p).hand.length) return false;
      if (!(await d.ask(p, c, 'Bu karta hedef alan bir efekt aktive edildi: 1 kart atıp o efekti iptal et?'))) return false;
      return discardOne(d, p, 'At: 1 kart (efekti iptal eder)');
    },
    handReact: {
      deckToHand: Object.assign({ text: 'Desteden ele eklendi: elinden göstererek Special Summon et?' }, bewdSummon),
      battleDestroyed: Object.assign({ text: 'Canavarın savaşta yok edildi: bu kartı elinden Special Summon et?' }, bewdSummon),
    },
    // Elden veya Desteden Special Summon: rakibin tüm canavarlarını yok et; bu tur Blue-Eyes dışı direkt saldıramaz
    async onSummon(d, p, c) {
      if (!c.special || (c.from !== 'hand' && c.from !== 'deck')) return;
      if (!(await d.ask(p, c, 'Rakibin tüm canavarlarını yok et? (bu tur Blue-Eyes dışı canavarlar direkt saldıramaz)'))) return;
      for (const m of d.monsters(O(p))) await d.destroy(m, c);
      d.flags.noDirect = d.flags.noDirect || [];
      d.flags.noDirect[p] = d.turn;
    },
  };

  // ============================================================ Blue-Eyes Ultimate Dragon, the God-Surpassing Servant
  const faceDownOrNew = (d, p) => [
    ...d.P(p).mz.filter(m => m && !m.up),
    ...d.P(p).mz.filter(m => m && m.up && m.special && m.placedTurn === d.turn),
    ...d.P(p).st.filter(s => s && !s.up),
    ...(d.P(p).field && !d.P(p).field.up ? [d.P(p).field] : []),
  ];
  FX['Blue-Eyes Ultimate Dragon, the God-Surpassing Servant'] = {
    multiAttack: 3,
    // Kart efektiyle yok edilemez; rakibin turunda rakibin aktive ettiği efektlerden etkilenmez
    immune: (d, c, kind) => kind === 'destroy' || (d.active !== c.owner && d.fromOpp(c)),
    ability: {
      label: 'Savaşta: rakibin kapalı kartını / bu tur çağrılan canavarını yok et (tur başı 3)', battleOnly: true, times: 3,
      can: (d, p) => faceDownOrNew(d, O(p)).length > 0,
      async resolve(d, p, c) {
        const t = await pick(d, p, faceDownOrNew(d, O(p)), 'Yok edilecek rakip kartı', 'harm');
        if (!t) return false;
        await d.destroy(t, c);
      },
      ai: (d, p) => faceDownOrNew(d, O(p)).length > 0,
    },
  };

  // ============================================================ Red-Eyes Black Dragon Exceed
  FX['Red-Eyes Black Dragon Exceed'] = {
    // Rakibin aktive ettiği canavar ve Büyü efektlerinden etkilenmez
    immune: (d, c) => d.fromOpp(c, ['spell', 'monster']),
    async onSummon(d, p, c) {
      if (!c.special) return;
      const cs = [...d.P(p).hand, ...d.P(p).grave].filter(m => m.d.kind === 'monster' && (m.d.level || 0) <= 8 && m.d.type !== 'Fusion Monster');
      if (!cs.length || d.freeZone(p, 'mz') < 0) return;
      const t = await pick(d, p, cs, 'Red-Eyes Black Dragon Exceed: elden/mezarlıktan çağrılacak Level 8 veya altı canavar', 'revive');
      if (t) await d.specialSummon(p, t);
    },
  };

  // ============================================================ Red-Eyes Dark Dragoon
  FX['Red-Eyes Dark Dragoon'] = {
    immune: (d, c, kind) => kind === 'destroy', // kart efektleriyle yok edilemez
    untargetable: true,                          // hiçbir oyuncu kart efektleriyle hedef alamaz
    // Ana Faz: 1 rakip canavarını yok et, orijinal ATK'sı kadar hasar ver. Tur başı kullanım = malzeme olarak kullanılan Normal canavar sayısı
    ability: {
      label: 'Rakip canavarı yok et + orijinal ATK kadar hasar', times: (d, c) => c.fusionNormals || 0,
      can: (d, p, c) => (c.fusionNormals || 0) > 0 && d.monsters(O(p)).length > 0,
      async resolve(d, p, c) {
        const t = await pick(d, p, d.monsters(O(p)), 'Yok edilecek rakip canavarı', 'harm');
        if (!t) return false;
        const atk = t.d.atk || 0;
        await d.destroy(t, c);
        if (!d.onField(t)) await d.damage(O(p), atk, c);
      },
      ai: (d, p) => d.monsters(O(p)).length > 0,
    },
    // Rakip bir kart/efekt aktive edince: 1 kart at → aktivasyonu iptal et, o kartı yok et, +1000 ATK (tur başı 1)
    negator: {
      once: true,
      can: (d, x) => d.P(x.owner).hand.length > 0,
      text: card => `${card.d.name} aktive edildi: 1 kart atıp iptal et ve yok et? (Red-Eyes Dark Dragoon)`,
      cost: (d, p) => discardOne(d, p, 'At: 1 kart (aktivasyonu iptal eder)'),
      async after(d, p, x, src) {
        x.bonus.atk += 1000;
        if (d.onField(src) && src.d.kind === 'monster') await d.destroy(src, x);
      },
    },
  };
  // ============================================================ 2. parti: Ritual / Phara / Toon / Gilford / Wave-Motion
  // Rakibin efektlerinden etkilenmez; yalnızca kendini hedef alan efektler işler (hedef alma pick sırasında kaydedilir)
  const unaffectedUnlessTargeted = (d, c) => d.fromOpp(c) && !d.isTargeted(c);
  const fieldAndGraveSpell = isSpell;

  // --- Black Luster Soldier - Soldier of Light and Darkness (Ritual, "Light and Darkness Ritual" ile)
  FX['Black Luster Soldier - Soldier of Light and Darkness'] = {
    noBattleDestroy: true,
    immune: (d, c) => unaffectedUnlessTargeted(d, c),
    // Özel çağrılınca: rakibin 1 kartını çıkar (tur başı 1)
    async onSummon(d, p, c) {
      if (!c.special || c.e1Turn === d.turn) return;
      const t = await pick(d, p, [...stZone(d, O(p)), ...d.monsters(O(p))], 'Black Luster Soldier: çıkarılacak rakip kartı', 'harm');
      if (!t) return;
      c.e1Turn = d.turn;
      await d.banish(t);
    },
    // Savaşta canavar yok edince: +1500 ATK ve arka arkaya ikinci saldırı (tur başı 1)
    async onKill(d, p, c) {
      if (c.e3Turn === d.turn) return;
      if (!(await d.ask(p, c, '+1500 ATK kazan ve bir kez daha saldır?'))) return;
      c.e3Turn = d.turn; c.bonus.atk += 1500; c.attacked = false;
    },
  };

  // --- Magician of Dark Chaos - Black Chaos
  FX['Magician of Dark Chaos - Black Chaos'] = {
    immune: (d, c) => unaffectedUnlessTargeted(d, c),
    // Senin Büyü/Tuzaklarını rakip efektiyle yok edemez / çıkaramaz
    guardST: (d, st, kind) => (kind === 'destroy' || kind === 'banish') && d.fromOpp(st),
    async onSummon(d, p, c) {
      if (!c.special || c.e1Turn === d.turn) return;
      const cs = d.P(p).grave.filter(fieldAndGraveSpell);
      if (!cs.length) return;
      const t = await pick(d, p, cs, 'Black Chaos: mezarlıktan ele alınacak Büyü', 'help');
      if (!t) return;
      c.e1Turn = d.turn;
      d.removeFromWherever(t); d.P(p).hand.push(t); await d.ev('search', { p, card: t });
    },
    ability: {
      label: 'Rakibin 1 kartını kapalı çıkar',
      can: (d, p) => d.monsters(O(p)).length + stZone(d, O(p)).length > 0,
      async resolve(d, p, c) {
        const t = await pick(d, p, [...stZone(d, O(p)), ...d.monsters(O(p))], 'Kapalı çıkarılacak rakip kartı', 'harm');
        if (!t) return false;
        await d.banish(t);
      },
      ai: () => true,
    },
  };

  // --- Phara the Primordial Goddess
  FX['Phara the Primordial Goddess'] = {
    // Elden: Büyü/Tuzak göster; açıklanan kartın adıyla aktivasyonlara bir sonraki tur sonuna kadar karşılık verilemez
    handEffect: {
      label: 'Büyü/Tuzak göster: karşılık verilemesin',
      can: (d, p, c) => c.e1Turn !== d.turn && d.P(p).hand.some(x => x !== c && (x.d.kind === 'spell' || x.d.kind === 'trap')),
      async resolve(d, p, c) {
        const s = await pick(d, p, d.P(p).hand.filter(x => x !== c && (x.d.kind === 'spell' || x.d.kind === 'trap')), 'Göster: elindeki Büyü/Tuzak', 'help');
        if (!s) return false;
        c.e1Turn = d.turn;
        await d.ev('reveal', { p, card: c }); await d.ev('reveal', { p, card: s });
        (d.flags.noResp = d.flags.noResp || []).push({ name: s.d.name, until: d.turn + 1 });
      },
    },
    // Büyü/Tuzak efektiyle elden/sahadan mezarlığa gönderilince: Special Summon
    async onSentBySpell(d, p, c) {
      if (c.e2Turn === d.turn || d.freeZone(p, 'mz') < 0) return;
      if (!(await d.ask(p, c, 'Büyü/Tuzak efektiyle mezarlığa gönderildi: Special Summon et?'))) return;
      c.e2Turn = d.turn;
      await d.specialSummon(p, c);
    },
    // Mezarlıktan çağrılınca: rakibin en yüksek ATK'lı canavarının kontrolünü al
    async onSummon(d, p, c) {
      if (!c.special || c.from !== 'grave' || c.e3Turn === d.turn) return;
      const opp = d.monsters(O(p)); if (!opp.length) return;
      const top = Math.max(...opp.map(m => d.atk(m)));
      const cands = opp.filter(m => d.atk(m) === top);
      if (!(await d.ask(p, c, 'En yüksek ATK\'lı rakip canavarın kontrolünü al?'))) return;
      const t = cands.length > 1 ? await pick(d, p, cands, 'Kontrolü alınacak canavar', 'harm') : cands[0];
      if (!t) return;
      c.e3Turn = d.turn;
      await d.takeControl(t, p, false);
    },
  };

  // --- Toon Dark Magician Girl (Toon World gerekir, 1 tribute ile elden çağrılır)
  const dmCount = d => [0, 1].reduce((s, i) => s + d.P(i).grave.filter(g => (g.d.alias || g.d.name) === 'Dark Magician' || g.d.name === 'Magician of Black Chaos').length, 0);
  E.toonFx('Toon Dark Magician Girl', 1, {
    async attackCost() { return true; }, // bu kartın saldırı için LP ödemesi yok
    selfMod: (c, key, d) => (key === 'atk' ? dmCount(d) * 300 : 0),
  });

  // --- Gilford the Lightning, the Warrior of Thunderbolts
  FX['Gilford the Lightning, the Warrior of Thunderbolts'] = {
    handSummon: { tributes: 3 },
    // Bu şekilde çağrılınca rakip tüm canavarlarını mezarlığa gönderir
    async onSummon(d, p, c) {
      if (!c.special || c.from !== 'hand') return;
      for (const m of d.monsters(O(p))) await d.sendToGrave(m, 'effect');
    },
    // Mezarlığa gidince: bu turun End Phase'inde desteden 1 Warrior al (tur başı 1)
    async onGrave(d, p, c) {
      if (c.e2Turn === d.turn || !d.P(p).deck.some(x => x.d.kind === 'monster' && x.d.race === 'Warrior')) return;
      if (!(await d.ask(p, c, 'Mezarlığa gönderildi: End Phase\'de desteden 1 Warrior ele alınsın?'))) return;
      c.e2Turn = d.turn;
      (d.endQueue = d.endQueue || []).push(async () => {
        const cs = d.P(p).deck.filter(x => x.d.kind === 'monster' && x.d.race === 'Warrior'); if (!cs.length) return;
        const t = await pick(d, p, cs, 'Gilford: desteden ele alınacak Warrior', 'help'); if (!t) return;
        d.removeFromWherever(t); d.P(p).hand.push(t); await d.ev('search', { p, card: t });
      });
    },
  };

  // --- Dark Paladin - Wave-Motion
  FX['Dark Paladin - Wave-Motion'] = {
    attackAll: true,
    selfMod: (c, key, d) => (key === 'atk' ? 500 * d.allField().filter(x => x !== c && x.d.kind === 'monster').length : 0),
    // Rakip Büyü aktive edince: iptal et, sonra sahadan 1 kartı yok edebilirsin (tur başı 1)
    negator: {
      once: true,
      can: (d, x, card) => card.d.kind === 'spell',
      text: card => `${card.d.name} aktive edildi: iptal et? (Dark Paladin - Wave-Motion)`,
      async after(d, p, x) {
        const cs = d.allField().filter(y => y !== x && d.onField(y));
        if (!cs.length || !(await d.ask(p, x, 'Sahadan 1 kartı yok etmek ister misin?'))) return;
        const t = await pick(d, p, cs, 'Yok edilecek kart', 'harm');
        if (t) await d.destroy(t, x);
      },
    },
  };
});
