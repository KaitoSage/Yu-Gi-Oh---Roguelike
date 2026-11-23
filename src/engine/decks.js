// Deste yardımcıları: kart havuzu, starter desteler, rakip desteleri, paketler.
// Oyun şimdilik SADECE Duel Monsters (era === 'DM') kartlarını kullanır; diğer era'lar veritabanında saklı kalır.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.YGO.Decks = factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;

  const isDM = c => c.era === 'DM';

  // Fusion'ın efekt metni yoksa (yalnızca malzemeler / "Must be Fusion Summoned") oynanabilir kabul edilir.
  function fusionPlayable(c) {
    if (c.type !== 'Fusion Monster' || !c.materials) return false;
    if (FX[c.name]) return true;
    const rest = c.desc.split('\n').slice(1).join(' ').replace(/\(.*?\)/g, '').replace(/Must be Fusion Summoned\.?/i, '').trim();
    return rest === '';
  }

  function isPlayable(c) {
    if (!isDM(c)) return false;
    if (c.type === 'Fusion Monster') return fusionPlayable(c);
    if (c.type === 'Normal Monster') return c.level <= 8;
    if (c.type === 'Ritual Monster') return true;
    return !!FX[c.name];
  }

  // Güncel TCG Forbidden / Limited listesi (cards.dm.json `ban` alanı, YGOPRODeck'ten): destede izin verilen kopya sayısı.
  // Bu oyunda Yasaklı kartlar da oynanabilir: 1 kopya (Sınırlı gibi); Sınırlı 1, Yarı Sınırlı 2.
  const copyLimit = c => (c.ban === 'Forbidden' ? 1 : c.ban === 'Limited' ? 1 : c.ban === 'Semi-Limited' ? 2 : 3);
  const BAN_TR = { Forbidden: 'Yasaklı → oyunda 1 kopya', Limited: 'Sınırlı (1)', 'Semi-Limited': 'Yarı Sınırlı (2)' };

  // Havuz: { main: Ana deste adayları, extra: Fusion adayları }. Yasaklı kartlar bu oyunda Sınırlı (1 kopya) olarak girer.
  // packOnly: yalnızca paketlerden çıkan Overframe efsane kartları (drop/mağaza/rakip havuzuna girmez; withPackOnly ile dahil edilir)
  function buildPool(cards, withPackOnly) {
    const all = cards.filter(c => isPlayable(c) && (withPackOnly || !c.packOnly));
    return Object.assign(all.filter(c => c.type !== 'Fusion Monster'), {
      extra: all.filter(c => c.type === 'Fusion Monster'),
      all,
    });
  }

  function byName(cards) {
    const m = new Map();
    cards.forEach(c => m.set(c.name, c));
    return m;
  }

  function idsFromNames(cards, names) {
    const n = byName(cards);
    return names.map(x => n.get(x)).filter(Boolean).map(c => c.id);
  }

  function fillRandom(deck, pool, size, filter, rng = Math.random) {
    const cands = pool.filter(filter);
    let guard = 0;
    while (deck.length < size && cands.length && guard++ < 1000) {
      const c = cands[Math.floor(rng() * cands.length)];
      if (deck.filter(i => i === c.id).length < copyLimit(c)) deck.push(c.id);
    }
    return deck;
  }

  const STARTERS = {
    yugi: {
      name: 'Yugi\'nin Starter Destesi',
      desc: 'Dengeli: savaşçılar, büyücüler ve Fusion hileleri.',
      names: [
        'Celtic Guardian', 'Gaia The Fierce Knight', 'Beaver Warrior', 'Feral Imp', 'Giant Soldier of Stone',
        'Mystical Elf', 'Silver Fang', 'Battle Ox', 'Axe Raider', 'Baby Dragon', 'Man-Eater Bug', 'Hane-Hane',
        'Magician of Faith', 'Dark Magician Girl', 'Dian Keto the Cure Master', 'Monster Reborn', 'Curse of Dragon',
        'Trap Hole', 'Polymerization', 'Mystical Space Typhoon',
      ],
      extra: ['Gaia the Dragon Champion'],
    },
    kaiba: {
      name: 'Kaiba\'nın Starter Destesi',
      desc: 'Ağır ejderhalar ve güç: yüksek ATK, zor çağırma.',
      names: [
        'Blue-Eyes White Dragon', 'Hitotsu-Me Giant', 'Mammoth Graveyard', 'Battle Ox', 'Curse of Dragon',
        'Silver Fang', 'Giant Soldier of Stone', 'Feral Imp', 'Dragon Treasure', 'Summoned Skull', 'Baby Dragon',
        'Beaver Warrior', 'Gaia The Fierce Knight', 'Ookazi', 'Raigeki', 'Dark Hole', 'Mirror Force',
        'Trap Hole', 'Red-Eyes Black Dragon', 'Polymerization',
      ],
      extra: ['Black Skull Dragon'],
    },
  };

  // -> {main: id[], extra: id[]}
  function starterDeck(cards, key) {
    const s = STARTERS[key] || STARTERS.yugi;
    const pool = buildPool(cards);
    const main = idsFromNames(cards, s.names).slice(0, 20);
    fillRandom(main, pool, 20, c => c.kind === 'monster' && c.type === 'Normal Monster' && c.level <= 4);
    return { main, extra: idsFromNames(cards, s.extra || []) };
  }

  const ENEMIES = {
    weevil: { name: 'Weevil Underwood', title: 'Böcek Oyuncusu', races: ['Insect', 'Plant'], maxLevel: 6, hp: 3000, size: 22 },
    rex: { name: 'Rex Raptor', title: 'Dinozor Oyuncusu', races: ['Dinosaur', 'Beast'], maxLevel: 7, hp: 3500, size: 22 },
    mai: { name: 'Mai Valentine', title: 'Harpi Hanım', races: ['Winged Beast', 'Beast-Warrior'], maxLevel: 6, hp: 3500, size: 24, fusion: true },
    keith: { name: 'Bandit Keith', title: 'Makine Avcısı', races: ['Machine', 'Warrior'], maxLevel: 7, hp: 4000, size: 24, fusion: true },
    kaiba: { name: 'Seto Kaiba', title: 'Ejderha Patronu', races: ['Dragon', 'Warrior'], maxLevel: 8, hp: 5000, size: 28, boss: true, fusion: true },
    pegasus: { name: 'Maximillion Pegasus', title: 'Binyıl Gözü', races: ['Spellcaster', 'Fiend', 'Fairy'], maxLevel: 8, hp: 6000, size: 30, boss: true, fusion: true },
  };

  function enemyDeck(cards, key, rng = Math.random) {
    const e = ENEMIES[key];
    const pool = buildPool(cards);
    const main = [];
    const extra = [];
    // Fusion paketi: malzemeleri ana desteden çıkabilen bir Fusion + Polymerization
    if (e.fusion) {
      const normals = new Map(pool.filter(c => c.type === 'Normal Monster').map(c => [c.name, c]));
      const cand = pool.extra.filter(f => f.materials.every(m => normals.has(m)));
      if (cand.length) {
        const f = cand[Math.floor(rng() * cand.length)];
        extra.push(f.id);
        for (const m of f.materials) main.push(normals.get(m).id);
        const poly = cards.find(c => c.name === 'Polymerization');
        if (poly) main.push(poly.id);
      }
    }
    fillRandom(main, pool, Math.round(e.size * 0.6), c => c.kind === 'monster' && e.races.includes(c.race) && c.level <= e.maxLevel && c.type === 'Normal Monster', rng);
    fillRandom(main, pool, Math.round(e.size * 0.7), c => c.kind === 'monster' && FX[c.name] && (FX[c.name].onFlip || FX[c.name].onGrave), rng);
    fillRandom(main, pool, e.size, c => (c.kind === 'spell' || c.kind === 'trap') && FX[c.name] && c.name !== 'Polymerization' && !c.ritual, rng);
    fillRandom(main, pool, e.size, c => c.kind === 'monster' && c.type === 'Normal Monster' && c.level <= 5, rng);
    return { main, extra };
  }

  // ---------- Paketler ----------
  const PACKS = {
    LOB: { name: 'Legend of Blue Eyes White Dragon', price: 140 },
    MRD: { name: 'Metal Raiders', price: 140 },
    MRL: { name: 'Magic Ruler', price: 140 },
    PSV: { name: 'Pharaoh\'s Servant', price: 140 },
    LON: { name: 'Labyrinth of Nightmare', price: 150 },
    LOD: { name: 'Legacy of Darkness', price: 150 },
    PGD: { name: 'Pharaonic Guardian', price: 150 },
    MFC: { name: 'Magician\'s Force', price: 160 },
    DCR: { name: 'Dark Crisis', price: 160 },
    IOC: { name: 'Invasion of Chaos', price: 160 },
    AST: { name: 'Ancient Sanctuary', price: 160 },
    SOD: { name: 'Soul of the Duelist', price: 170 },
    RDS: { name: 'Rise of Destiny', price: 170 },
  };

  function packPool(cards, code) {
    return buildPool(cards).all.filter(c => c.packs && c.packs.includes(code));
  }

  const RANK = ['N', 'R', 'SR', 'UR', 'PR'];
  // 5 kart: 3 N/R, 1 R+, 1 SR+ (UR/PR şansı)
  function openPack(cards, code, rng = Math.random) {
    const pool = packPool(cards, code);
    const by = r => pool.filter(c => c.rarity === r);
    const draw = (minRank, roll) => {
      let idx = Math.max(minRank, RANK.indexOf(roll));
      for (; idx >= 0; idx--) { const list = by(RANK[idx]); if (list.length) return list[Math.floor(rng() * list.length)]; }
      return pool[Math.floor(rng() * pool.length)];
    };
    const roll = (w) => { let r = rng() * w.reduce((a, b) => a + b[1], 0); for (const [k, v] of w) { r -= v; if (r <= 0) return k; } return 'N'; };
    const out = [];
    // aynı pakette mümkünse tekrar çıkmasın
    const add = (min, w) => {
      let c;
      for (let t = 0; t < 12; t++) { c = draw(min, roll(w)); if (!out.includes(c)) break; }
      out.push(c);
    };
    for (let i = 0; i < 3; i++) add(0, [['N', 80], ['R', 20]]);
    add(1, [['R', 75], ['SR', 25]]);
    add(2, [['SR', 70], ['UR', 24], ['PR', 6]]);
    return out;
  }

  // ---------- Başlangıç Draft'ı ----------
  // Run başında 20 kartlık deste: her turda 8 kart gelir, 1-2 tanesini seçersin.
  // Her teklifte en az 1 Tuzak, 2 Büyü ve 2 Efektli Canavar bulunur. 2 tur sonra seçimlerine uyan
  // "önerilen" Duel Monsters konsept destesine (arketip) yakın kartlar daha sık gelir.
  const THEMES = {
    yugi: { name: 'Yugi', desc: 'Büyücüler, savaşçılar ve melekler. Fusion ve büyü ağırlıklı.', races: ['Spellcaster', 'Warrior', 'Fairy'], spellBias: 1.4,
      show: ['Dark Magician', 'Celtic Guardian', 'Polymerization'] },
    kaiba: { name: 'Kaiba', desc: 'Ejderhalar, makineler ve saf güç.', races: ['Dragon', 'Machine', 'Thunder'], spellBias: 1,
      show: ['Blue-Eyes White Dragon', 'Hitotsu-Me Giant', 'Raigeki'] },
    joey: { name: 'Joey', desc: 'Savaşçılar, hayvan-savaşçılar ve şans.', races: ['Warrior', 'Beast-Warrior', 'Beast'], spellBias: 1.2,
      show: ['Red-Eyes Black Dragon', 'Axe Raider', 'Battle Ox'] },
  };
  const DRAFT_SIZE = 20, DRAFT_OFFER = 8, DRAFT_MAX_PICK = 2;
  const MIN_TRAP = 1, MIN_SPELL = 2, MIN_EFFECT = 2;
  const ARCH_AFTER_ROUND = 2; // bu kadar tur seçimden sonra arketip eğilimi başlar
  const DRAFT_RARITY = { N: 55, R: 25, SR: 12, UR: 6, PR: 2 };

  // Duel Monsters döneminin bilinen konsept desteleri (çekirdek = kimliği belirleyen, destek = tamamlayanlar).
  // Havuzda olmayan (henüz kodlanmamış) kartlar sessizce yok sayılır.
  const ARCHETYPES = {
    magician: { name: 'Dark Magician Büyücüleri', desc: 'Dark Magician, Dark Magician Girl ve büyücü desteği.',
      core: ['Dark Magician', 'Dark Magician Girl', 'Magician of Faith', 'Breaker the Magical Warrior', 'Skilled Dark Magician', 'Buster Blader', 'Chaos Command Magician', 'Dark Flare Knight', 'Dark Paladin'],
      support: ['Mystical Elf', 'Book of Secret Arts', 'Mage Power', 'Pot of Greed', 'Graceful Charity', 'Card Destruction', 'Monster Reborn', 'Mystical Space Typhoon', 'Magic Cylinder', 'Mirror Force', 'Swords of Revealing Light', 'Polymerization', 'Gemini Elf', 'Dian Keto the Cure Master'],
      races: ['Spellcaster'] },
    blueeyes: { name: 'Blue-Eyes Ejderhaları', desc: 'Kaiba tarzı: ağır ejderhalar ve güç.',
      core: ['Blue-Eyes White Dragon', 'Lord of D.', 'Kaibaman', 'Dragon Capture Jar', 'Dragon Treasure', 'Thousand Dragon', 'Baby Dragon', 'Time Wizard'],
      support: ['Polymerization', 'Monster Reborn', 'Pot of Greed', 'Raigeki', 'Dark Hole', 'Mirror Force', 'Trap Hole', 'Hitotsu-Me Giant', 'Battle Ox', 'Mammoth Graveyard', 'Giant Soldier of Stone', 'Curse of Dragon', 'Premature Burial', 'Torrential Tribute'],
      races: ['Dragon'] },
    exodia: { name: 'Exodia', desc: '5 parçayı topla: anında zafer. Çekme ve savunma desteği.',
      core: ['Exodia the Forbidden One', 'Left Arm of the Forbidden One', 'Right Arm of the Forbidden One', 'Left Leg of the Forbidden One', 'Right Leg of the Forbidden One'],
      support: ['Pot of Greed', 'Graceful Charity', 'Card Destruction', 'Sangan', 'Witch of the Black Forest', 'Swords of Revealing Light', 'Waboku', 'Mirror Force', 'Draining Shield', 'Magic Cylinder', 'Giant Trunade', 'Heavy Storm', 'Dian Keto the Cure Master'],
      races: [] },
    gaia: { name: 'Gaia & Savaşçılar', desc: 'Gaia + Curse of Dragon füzyonu ve ekipman savaşçıları.',
      core: ['Gaia The Fierce Knight', 'Curse of Dragon', 'Gaia the Dragon Champion', 'Celtic Guardian', 'Flame Swordsman', 'Polymerization'],
      support: ['Legendary Sword', 'Axe Raider', 'Battle Ox', 'Beaver Warrior', 'Sogen', 'Gaia Power', 'Mountain', 'Forest', 'Mystical Elf', 'Giant Soldier of Stone', 'Reinforcement of the Army', 'Monster Reborn', 'Sword of Dark Destruction'],
      races: ['Warrior'] },
    redeyes: { name: 'Red-Eyes & Archfiend', desc: 'Joey tarzı: Red-Eyes, Summoned Skull ve Fusion.',
      core: ['Red-Eyes Black Dragon', 'Summoned Skull', 'Black Skull Dragon', 'Dark Elf', 'Feral Imp', 'Polymerization'],
      support: ['Dragon Treasure', 'Baby Dragon', 'Monster Reborn', 'Dark Hole', 'Premature Burial', 'Trap Hole', 'Sakuretsu Armor', 'Hinotama', 'Ookazi', 'Sword of Dark Destruction', 'Mystic Plasma Zone', 'Yami'],
      races: ['Dragon', 'Fiend'] },
    insect: { name: 'Böcek Orduları', desc: 'Weevil tarzı: böcekler, Forest ve tuzaklar.',
      core: ['Hercules Beetle', 'Great Moth', 'Petit Moth', 'Cocoon of Evolution', 'Man-Eater Bug', 'Basic Insect', 'Perfectly Ultimate Great Moth'],
      support: ['Forest', 'Dust Tornado', 'Trap Hole', 'Mirror Force', 'Swords of Revealing Light', 'Pot of Greed', 'Monster Reborn'],
      races: ['Insect', 'Plant'] },
    harpie: { name: 'Harpie Lady', desc: 'Mai tarzı: Harpie Lady ve kanatlı canavarlar.',
      core: ['Harpie Lady', 'Cyber Harpie Lady', 'Harpie Lady Sisters', "Harpie's Pet Dragon", "Harpie's Feather Duster"],
      support: ['Mountain', 'Monster Reborn', 'Pot of Greed', 'Mirror Force', 'Sakuretsu Armor', 'Swords of Revealing Light', 'Raigeki'],
      races: ['Winged Beast'] },
    burn: { name: 'Stall & Burn', desc: 'Savun, hasar ver, kazan: ateş büyüleri ve savunma tuzakları.',
      core: ['Hinotama', 'Ookazi', 'Sparks', 'Swords of Revealing Light', 'Waboku', 'Draining Shield', 'Magic Cylinder', 'Mirror Force', 'Dian Keto the Cure Master', 'Rain of Mercy'],
      support: ['Man-Eater Bug', 'Hane-Hane', 'Penguin Soldier', 'Sakuretsu Armor', 'Giant Soldier of Stone', 'Mystical Elf', 'Pot of Greed', 'Torrential Tribute', 'Trap Hole'],
      races: [] },
    machine: { name: 'Makine & Jinzo', desc: 'Keith tarzı: Jinzo, makineler ve ekipman.',
      core: ['Jinzo', 'Mechanicalchaser', 'Machine Conversion Factory', 'Hayabusa Knight'],
      support: ['Gaia Power', 'Monster Reborn', 'Pot of Greed', 'Raigeki', 'Dark Hole', 'Trap Hole', 'Mirror Force', 'Black Pendant', 'Smashing Ground', 'Hammer Shot'],
      races: ['Machine'] },
  };

  // v3 genişletmesi: yeni kodlanan kartlar konsept destelere eklenir; Toon destesi eklenir.
  const grow = (key, core, support) => { const a = ARCHETYPES[key]; a.core.push(...core); a.support.push(...support); };
  grow('magician', ['Dark Magician of Chaos', 'Dark Magician Knight', "Knight's Title", "Sage's Stone", 'Thousand Knives', 'Dark Magic Attack', 'Dedication through Light and Darkness', 'Time Wizard', 'Skilled White Magician', 'Chaos Command Magician'],
    ['Eternal Rest', 'Magic Jammer', 'Spell Vanishing', 'Change of Heart', 'Elf\'s Light', 'Book of Taiyou', 'Compulsory Evacuation Device', 'Gemini Elf', 'Magical Marionette', 'Royal Magical Library']);
  grow('blueeyes', ['Burst Stream of Destruction', 'The Flute of Summoning Dragon', 'Dragon Seeker', 'Blue-Eyes Shining Dragon', 'Paladin of White Dragon', 'Dragon Capture Jar'],
    ['Stamping Destruction', "Dragon's Gunfire", 'Beast Fangs', 'Compulsory Evacuation Device', 'Call of the Haunted', 'Solemn Judgment', 'Horn of Heaven', 'Fusion Weapon', 'Masked Dragon', 'Different Dimension Dragon']);
  grow('redeyes', ['Inferno Fire Blast', "Archfiend's Roar", 'Red-Eyes Black Metal Dragon', 'Skull Archfiend of Lightning', 'Terrorking Archfiend', 'Metalmorph', 'Darkfire Dragon', 'Dark Blade the Dragon Knight'],
    ['Call of the Haunted', 'Dark Core', 'Tribute to the Doomed', 'Dark Energy', 'Mystik Wok', 'Black Pendant', 'Axe of Despair', 'Solar Flare Dragon', 'Red-Eyes Darkness Dragon', 'Raigeki Break', 'Widespread Ruin']);
  grow('insect', ['Insect Imitation', 'Insect Barrier', 'Basic Insect', 'Insect Princess', 'Dark Dust Spirit', 'Laser Cannon Armor', 'Raise Body Heat', 'Pyramid Turtle', 'Black Tyranno', 'Sacred Crane'],
    ['Violet Crystal', 'Vile Germs', 'Acid Trap Hole', 'Needle Ceiling', 'Compulsory Evacuation Device', 'Gravity Bind', 'Reinforcements', 'Dark Core', 'Giant Germ', 'Skull-Mark Ladybug']);
  ARCHETYPES.insect.name = 'Böcek & Dinozor Orduları'; ARCHETYPES.insect.races.push('Dinosaur');
  grow('harpie', ['Elegant Egotist', "Harpies' Hunting Ground", 'Harpie Lady 1', 'Harpie Lady 2', 'Harpie Lady 3', 'Follow Wind', 'Silver Bow and Arrow', 'Birdface'],
    ['Rising Air Current', 'Gust Fan', 'Widespread Ruin', 'Compulsory Evacuation Device', 'Raigeki Break', 'Change of Heart', 'Solemn Judgment', 'Magic Jammer', 'Sacred Crane']);
  grow('machine', ['Perfect Machine King', 'Limiter Removal', 'Machine Duplication', 'Cyber Jar', 'Cannon Soldier', 'Gadget Soldier', 'Gearfried the Iron Knight', 'XYZ-Dragon Cannon', 'X-Head Cannon', 'Barrel Dragon'],
    ['Metalmorph', 'Rare Metalmorph', 'Eternal Rest', 'Compulsory Evacuation Device', 'Torrential Tribute', 'Needle Ceiling', 'Spell Vanishing', 'Magic Jammer', 'Mass Driver', 'Roulette Barrel']);
  grow('burn', ['Messenger of Peace', 'Spirit Barrier', 'Gravity Bind', 'Final Countdown', 'Bowganian', 'Solar Flare Dragon', 'Just Desserts', 'Cemetary Bomb', 'Secret Barrel', 'Final Flame', 'Raimei', 'Goblin Thief', 'Tremendous Fire'],
    ['Cannon Soldier', 'Poison Mummy', 'Des Koala', 'Gravekeeper\'s Curse', 'Catapult Turtle', 'Destruction Ring', 'Mushroom Man #2', 'Time Seal', 'Magic Jammer', 'Solemn Judgment']);
  ARCHETYPES.toon = { name: 'Toon World', desc: 'Toon World + Toon canavarlar: direkt saldırı ve hız. Toon World yoksa düşerler!',
    core: ['Toon World', 'Toon Summoned Skull', 'Toon Mermaid', 'Toon Gemini Elf', 'Blue-Eyes Toon Dragon', 'Manga Ryu-Ran'],
    support: ['Summoned Skull', 'Gemini Elf', 'Dark Magician Girl', 'Blue-Eyes White Dragon', 'Waboku', 'Magic Cylinder', 'Mirror Force', 'Draining Shield', 'Spirit Barrier', 'Messenger of Peace', 'Monster Reborn', 'Toon Alligator', 'Dian Keto the Cure Master'],
    races: [] };

  // ---------- Card Shop temalı paketler (kalıcı koleksiyona açılır) ----------
  // list = pakete özel kartlar (adıyla), races = bu türlerin oynanabilir canavarları da havuza girer. Tasarım görselleri sonradan gelecek (art: null).
  // Paketler karakter temalıdır: arch = konsept deste (core+support), list = karaktere özel ek kartlar, rx = isim kalıbı.
  // Bir kart yalnızca ilk eşleşen temalı pakete girer; hiçbirine girmeyen her şey 'duel' (Duel Kingdom Random Pack) havuzundadır.
  const THEME_PACKS = {
    arcane: { name: 'Arcane Chronicle', sub: 'Yugi Muto & Yami Yugi', price: 400, art: 'assets/packs/arcane.webp', arch: 'magician',
      legend: ["Dark Magician, the Pharaoh's Servant", 'Dark Magical Curtain', 'Red-Eyes Dark Dragoon', 'Dark Magician Girl', 'Black Luster Soldier - Soldier of Light and Darkness', 'Magician of Dark Chaos - Black Chaos', 'Phara the Primordial Goddess', 'Dark Paladin - Wave-Motion'],
      list: ["Dark Magician, the Pharaoh's Servant", 'Dark Magical Curtain', 'Red-Eyes Dark Dragoon', 'Black Luster Soldier - Soldier of Light and Darkness', 'Magician of Dark Chaos - Black Chaos', 'Phara the Primordial Goddess', 'Dark Paladin - Wave-Motion', 'Light and Darkness Ritual', 'Dark Paladin', 'Black Luster Soldier - Envoy of the Beginning', 'Dark Magician', 'Dark Magician Girl', 'Magician of Faith', 'Breaker the Magical Warrior', 'Skilled Dark Magician', 'Buster Blader', 'Celtic Guardian', 'Gaia The Fierce Knight', 'Curse of Dragon', 'Gaia the Dragon Champion', 'Kuriboh', 'Summoned Skull', 'Silver Fang', 'Giant Soldier of Stone', 'Beaver Warrior', 'Feral Imp', 'Mystical Elf', 'Black Luster Soldier', 'Swordstalker', 'Magical Hats', 'Exodia the Forbidden One', 'Left Arm of the Forbidden One', 'Right Arm of the Forbidden One', 'Left Leg of the Forbidden One', 'Right Leg of the Forbidden One', 'Pot of Greed', 'Monster Reborn', 'Polymerization', 'Mystical Space Typhoon', 'Swords of Revealing Light', 'Magic Cylinder', 'Heavy Storm', 'Graceful Charity', 'Shield & Sword', 'Card of Sanctity', 'Sword of Dark Destruction', 'Dark Hole', 'Mirror Force', 'Trap Hole', 'Legendary Sword', 'Mage Power', 'Rush Recklessly'] },
    azure: { name: 'Azure Dragon Vault', sub: 'Seto Kaiba', price: 400, art: 'assets/packs/azure.webp', arch: 'blueeyes',
      legend: ['Blue-Eyes White Dragon, the White Phantom Beast', 'Blue-Eyes Ultimate Dragon, the God-Surpassing Servant'],
      list: ['XY-Dragon Cannon', 'XYZ-Dragon Cannon', 'XZ-Tank Cannon', 'YZ-Tank Dragon', 'Blue-Eyes White Dragon, the White Phantom Beast', 'Blue-Eyes Ultimate Dragon, the God-Surpassing Servant', 'Blue-Eyes White Dragon', 'Blue-Eyes Ultimate Dragon', 'Blue-Eyes Shining Dragon', 'Kaibaman', 'Lord of D.', 'Battle Ox', 'Vorse Raider', 'Saggi the Dark Clown', 'Judge Man', 'Rogue Doll', 'La Jinn the Mystical Genie of the Lamp', 'Giltia the D. Knight', 'Dragon Master Knight', 'Rude Kaiser', 'Hitotsu-Me Giant', 'Mammoth Graveyard', 'Ryu-Kishin Powered', 'XYZ-Dragon Cannon', 'X-Head Cannon', 'Y-Dragon Head', 'Z-Metal Tank', 'Cyber Jar', 'Cannon Soldier', 'Robbin\' Goblin', 'Vampire Lord', 'Stamping Destruction', 'The Flute of Summoning Dragon', 'Dragon Seeker', 'Paladin of White Dragon', 'Dragon Capture Jar', 'Burst Stream of Destruction', 'Silver Fang', 'Fusion Gate', 'Hyozanryu', 'Spirit of the Harp', 'Dark Blade', 'Maiden of the Moonlight', 'Wall of Illusion'] },
    ember: { name: 'Ember of the Black Dragon', sub: 'Joey Wheeler', price: 400, art: 'assets/packs/ember.webp', arch: 'redeyes',
      legend: ['Red-Eyes Black Dragon', 'Red-Eyes Black Dragon Exceed', 'Red-Eyes Dark Dragoon', 'Gilford the Lightning, the Warrior of Thunderbolts', 'Dark Paladin - Wave-Motion'],
      list: ['Red-Eyes Black Dragon', 'Red-Eyes Black Dragon Exceed', 'Red-Eyes Dark Dragoon', 'Gilford the Lightning, the Warrior of Thunderbolts', 'Dark Paladin - Wave-Motion', 'Gilford the Lightning', 'Dark Flare Knight', 'Dark Paladin', 'Spirit Ryu', 'Ryu Senshi', 'Warrior Dai Grepher', 'Alligator\'s Sword', 'Baby Dragon', 'Time Wizard', 'Flame Swordsman', 'Panther Warrior', 'Gilford the Lightning', 'Rocket Warrior', 'Alligator\'s Sword', 'Axe Raider', 'Karate Man', 'Battle Warrior', 'Swordsman of Landstar', 'Little Swordsman of Aile', 'Jinzo', 'Island Turtle', 'Armed Ninja', 'Tiger Axe', 'Giant Rat', 'Humanoid Slime', 'Gamble', 'Graceful Dice', 'Skull Dice', 'Shield & Sword', 'Hinotama', 'Ookazi', 'Rush Recklessly', 'Alligator\'s Sword Dragon', 'Salamandra', 'Flame Manipulator', 'Jinzo #7', 'Spirit Reaper', 'Mystic Clown', 'Red-Eyes Black Metal Dragon', 'Black Skull Dragon', 'Thousand Dragon', 'Dragon Treasure'] },
    toon: { name: 'Toon Kingdom Carnival', sub: 'Maximillion Pegasus', price: 400, art: 'assets/packs/toon.webp', arch: 'toon', rx: /^Toon |^Manga Ryu-Ran|Toon$/,
      legend: ['Toon Dark Magician Girl', 'Blue-Eyes Toon Dragon'],
      list: ['Toon Dark Magician Girl', 'Black Illusion Ritual', 'Thousand-Eyes Restrict', 'Crass Clown', 'Dream Clown', 'Relinquished', 'Thousand-Eyes Restrict', 'Thousand-Eyes Idol', 'Crass Clown', 'Illusionist Faceless Mage', 'Gemini Elf', 'Dark Magician Girl', 'Blue-Eyes Toon Dragon', 'Cyber Harpie Lady', 'Harpie Lady', 'Harpie Lady Sisters', 'Mystic Tomato', 'Magician of Black Chaos', 'Cartoon', 'Nobleman of Crossout', 'Nobleman of Extermination', 'Seiyaryu', 'Dream Clown', 'Ancient Elf', 'Dark Elf', 'Flame Ghost', 'Pumpking the King of Ghosts', 'Spirit of the Books', 'Wall of Illusion', 'Mind Control', 'Change of Heart', 'Creature Swap', 'Brain Control', 'Magical Marionette', 'Fairy\'s Hand Mirror'] },
    duel: { name: 'Duel Kingdom Random', sub: 'Diğer Tüm Kartlar', price: 250, art: 'assets/packs/duel.webp', arch: null, rest: true },
  };
  const THEME_ORDER = ['arcane', 'azure', 'ember', 'toon'];

  function themeSet(cards, key) {
    const tp = THEME_PACKS[key];
    const a = tp.arch ? ARCHETYPES[tp.arch] : { core: [], support: [] };
    return { coreNames: new Set([...a.core, ...(tp.list || [])]), supNames: new Set(a.support), rx: tp.rx };
  }
  // Havuz: temalı paketlerde karakter kartları (bir kart birden çok pakette olabilir; örn. Red-Eyes Dark Dragoon hem Arcane hem Ember).
  // Duel Kingdom: hiçbir temalı pakete girmeyen tüm kartlar (paketlere özel Overframe kartlar hariç).
  function themePackPool(cards, key) {
    const match = (k, c) => { const s = themeSet(cards, k); return s.coreNames.has(c.name) || s.supNames.has(c.name) || (s.rx && s.rx.test(c.name)); };
    if (key === 'duel') {
      const mine = buildPool(cards).all.filter(c => !THEME_ORDER.some(k => match(k, c)));
      return { core: [], rest: mine, all: mine };
    }
    const s = themeSet(cards, key);
    const mine = buildPool(cards, true).all.filter(c => match(key, c));
    const core = mine.filter(c => s.coreNames.has(c.name) || (s.rx && s.rx.test(c.name)));
    const rest = mine.filter(c => !core.includes(c));
    return { core, rest, all: [...core, ...rest] };
  }

  // 5 kart: 1'i her zaman temanın çekirdek kartlarından; kalanlar tema havuzundan. Nadirlik N/R/SR/UR/PR ağırlıklı.
  // Overframe efsane kartlar (tp.legend) için ayrıca %3 şansla son kart onlardan biri olur.
  function openThemePack(cards, key, rng = Math.random) {
    const { core, rest, all } = themePackPool(cards, key);
    const W = { N: 60, R: 25, SR: 10, UR: 4, PR: 1 };
    const wpick = list => { const t = list.reduce((s, c) => s + (W[c.rarity] || 1), 0); let r = rng() * t; for (const c of list) { r -= (W[c.rarity] || 1); if (r <= 0) return c; } return list[list.length - 1]; };
    const out = [];
    const add = list => { for (let t = 0; t < 14; t++) { const c = wpick(list); if (!out.includes(c)) { out.push(c); return; } } out.push(wpick(list)); };
    if (core.length) add(core);
    while (out.length < 4) add(rest.length ? rest : all);
    // son kart: SR ve üzeri tercih edilir; %3 şansla Overframe efsane kart
    const legends = (THEME_PACKS[key].legend || []).map(n => all.find(c => c.name === n)).filter(Boolean);
    if (legends.length && rng() < 0.03) out.push(legends[Math.floor(rng() * legends.length)]);
    else {
      const rare = all.filter(c => c.rarity === 'SR' || c.rarity === 'UR' || c.rarity === 'PR');
      if (rare.length) add(rare); else add(all);
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  // Deste kartlarına göre arketip puanları (çekirdek +3, destek +1, tür +0.5)
  function archetypeScores(cards, deck) {
    const ids = [...deck.main, ...deck.extra];
    const names = new Map(cards.map(c => [c.id, c]));
    const out = [];
    for (const [key, a] of Object.entries(ARCHETYPES)) {
      let score = 0;
      const have = [];
      for (const id of ids) {
        const c = names.get(id); if (!c) continue;
        if (a.core.includes(c.name)) { score += 3; have.push(c.name); }
        else if (a.support.includes(c.name)) { score += 1; have.push(c.name); }
        else if (c.kind === 'monster' && a.races.includes(c.race)) score += 0.5;
      }
      out.push({ key, name: a.name, desc: a.desc, score, have });
    }
    return out.sort((x, y) => y.score - x.score);
  }
  // Önerilen deste (en az 1 çekirdek kart eşiği)
  function draftInfo(cards, deck) {
    const [top] = archetypeScores(cards, deck);
    return top && top.score >= 3 ? top : null;
  }

  // Ritual canavarı için tetikleyen büyü (hedef adlı ya da aynı özellikteki genel Ritual büyüsü)
  function ritualSpellFor(cards, m) {
    const spells = cards.filter(c => c.kind === 'spell' && c.ritual);
    return spells.find(s => s.ritual.target === m.name) || spells.find(s => s.ritual.attr && s.ritual.attr === m.attr) || null;
  }

  /**
   * Bir kartı seçince desteye girecek her şey.
   * @returns {{main:number[], extra:number[], shown:object[], note:string}|null}  null: eklenemez
   */
  function bundleOf(cards, card, deck) {
    const names = byName(cards);
    const byId = new Map(cards.map(c => [c.id, c]));
    const has = name => deck.main.some(id => (byId.get(id) || {}).name === name);
    if (card.type === 'Fusion Monster') {
      const mats = (card.materials || []).map(n => names.get(n));
      if (mats.some(m => !m)) return null;
      const poly = names.get('Polymerization');
      const main = mats.map(m => m.id);
      const shown = [...mats];
      if (poly && !has('Polymerization')) { main.push(poly.id); shown.push(poly); }
      return { main, extra: [card.id], shown, note: `Fusion: ${mats.map(m => m.name).join(' + ')}${shown.includes(poly) ? ' + Polymerization' : ''}` };
    }
    if (/Ritual/.test(card.type) && card.kind === 'monster') {
      const sp = ritualSpellFor(cards, card);
      if (!sp) return null;
      const already = has(sp.name);
      return { main: already ? [card.id] : [card.id, sp.id], extra: [], shown: already ? [] : [sp], note: `Ritual: ${sp.name}${already ? ' (zaten destede)' : ' birlikte eklenir'}` };
    }
    return { main: [card.id], extra: [], shown: [], note: '' };
  }

  // Kategori: 'trap' | 'spell' | 'effect' (gerçekten kodlanmış efekti olan canavar) | 'mon'
  function draftCategory(c) {
    if (c.kind === 'trap') return 'trap';
    if (c.kind === 'spell') return 'spell';
    const fx = FX[c.name];
    if (fx && Object.keys(fx).length && !E.EXODIA.includes(c.name)) return 'effect';
    return 'mon';
  }

  /**
   * Draft teklifi: DRAFT_OFFER kart. Her teklifte ≥1 Tuzak, ≥2 Büyü, ≥2 Efektli Canavar;
   * arketip eğilimi başladıysa ≥2 kart önerilen konsept destesinden.
   * deck.rounds = tamamlanan seçim turu sayısı (UI artırır).
   */
  function draftOffer(cards, themeKey, deck, rng = Math.random, n = DRAFT_OFFER) {
    const th = THEMES[themeKey] || THEMES.yugi;
    const pool = buildPool(cards);
    const remaining = DRAFT_SIZE - deck.main.length;
    const copies = id => deck.main.filter(i => i === id).length + deck.extra.filter(i => i === id).length;
    const byId = new Map(cards.map(c => [c.id, c]));
    const normals = new Set(pool.filter(c => c.type === 'Normal Monster').map(c => c.name));
    const deckNames = [...deck.main, ...deck.extra].map(id => (byId.get(id) || {}).name);
    const hasExodiaPiece = deckNames.some(x => E.EXODIA.includes(x));

    // arketip eğilimi
    let arch = null, arch2 = null;
    if ((deck.rounds || 0) >= ARCH_AFTER_ROUND) {
      const sc = archetypeScores(cards, deck);
      if (sc[0] && sc[0].score >= 3) arch = ARCHETYPES[sc[0].key];
      if (sc[1] && sc[1].score >= 3) arch2 = ARCHETYPES[sc[1].key];
    }
    const inArch = (a, c) => a && (a.core.includes(c.name) || a.support.includes(c.name));

    const cands = [];
    for (const c of pool.all) {
      const isExo = E.EXODIA.includes(c.name);
      if (copies(c.id) >= Math.min(isExo ? 1 : 3, copyLimit(c))) continue;
      if (c.ritual || c.name === 'Polymerization') continue; // yalnızca paketle gelirler
      if (c.type === 'Fusion Monster') {
        if (deck.extra.length >= 6 || !c.materials.every(m => normals.has(m))) continue;
        if (deck.extra.includes(c.id)) continue;
      }
      const b = bundleOf(cards, c, deck);
      if (!b || b.main.length > remaining) continue;

      let w = DRAFT_RARITY[c.rarity] || 1;
      const cat = draftCategory(c);
      if (c.kind === 'monster') {
        if (th.races.includes(c.race)) w *= 2.5;
        if (c.type === 'Normal Monster') {           // sıradan canavar bolluğunu azalt, güçlüleri öne çıkar
          w *= 0.6;
          if (c.atk >= 2200) w *= 2; else if (c.atk >= 1800) w *= 1.4; else if (c.atk < 1000) w *= 0.5;
        }
        if (cat === 'effect') w *= 1.5;
      } else w *= th.spellBias;
      if (c.type === 'Fusion Monster') w *= 0.6;
      if (isExo) w *= hasExodiaPiece ? 12 : 0.12;
      if (arch && c.kind !== 'ritualspell') {
        if (arch.core.includes(c.name)) w *= 6;
        else if (arch.support.includes(c.name)) w *= 3;
        else if (c.kind === 'monster' && arch.races.includes(c.race)) w *= 1.8;
      }
      if (arch2 && arch2.core.includes(c.name)) w *= 2;
      cands.push({ c, w, cat, arch: inArch(arch, c) });
    }

    const out = [];
    const take = list => {
      const l = list.filter(x => !out.includes(x));
      if (!l.length) return null;
      const tot = l.reduce((s, x) => s + x.w, 0);
      let r = rng() * tot, i = 0;
      for (; i < l.length - 1; i++) { r -= l[i].w; if (r <= 0) break; }
      out.push(l[i]);
      return l[i];
    };
    const count = cat => out.filter(x => x.cat === cat).length;

    if (arch) for (let i = 0; i < 2; i++) take(cands.filter(x => x.arch));   // önerilen deste kartları
    for (const [cat, min] of [['trap', MIN_TRAP], ['spell', MIN_SPELL], ['effect', MIN_EFFECT]]) {
      while (count(cat) < min && take(cands.filter(x => x.cat === cat))) { /* kota doldur */ }
    }
    while (out.length < n && take(cands)) { /* kalan serbest */ }

    // karıştır
    const res = out.slice(0, n).map(x => x.c);
    for (let i = res.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [res[i], res[j]] = [res[j], res[i]]; }
    return res;
  }

  return { copyLimit, BAN_TR, THEME_PACKS, themePackPool, openThemePack, buildPool, isPlayable, fusionPlayable, starterDeck, enemyDeck, STARTERS, ENEMIES, PACKS, packPool, openPack, byName,
    THEMES, ARCHETYPES, DRAFT_SIZE, DRAFT_OFFER, DRAFT_MAX_PICK, MIN_TRAP, MIN_SPELL, MIN_EFFECT, bundleOf, draftOffer, draftInfo, archetypeScores, draftCategory, ritualSpellFor };
});
