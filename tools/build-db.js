// Ham YGOPRODeck verisinden iki dosya üretir:
//   data/cards.all.json  -> TÜM kartlar (era etiketli: DM / GX / 5DS / ...). Oyun şimdilik kullanmaz, saklı kalır.
//   data/cards.dm.json   -> oyunda kullanılan Duel Monsters (era === 'DM') kartları
// Kullanım: node tools/build-db.js   (data/cardinfo_raw.json ve data/cardsets_raw.json gerekir)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cardinfo_raw.json'), 'utf8')).data;
const setList = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cardsets_raw.json'), 'utf8'));

// Set adı -> TCG çıkış tarihi
const setDate = new Map();
for (const s of setList) if (s.tcg_date) setDate.set(s.set_name, s.tcg_date);

// Duel Monsters dönemi: ilk TCG basımı bu tarihten önce
const DM_END = '2005-02-28';
function eraOf(date) {
  if (!date) return 'OTHER';
  if (date <= DM_END) return 'DM';
  if (date < '2008-06-01') return 'GX';
  if (date < '2011-01-01') return '5DS';
  return 'LATER';
}

const CORE_SETS = ['LOB', 'MRD', 'MRL', 'PSV', 'LON', 'LOD', 'PGD', 'MFC', 'DCR', 'IOC', 'AST', 'SOD', 'RDS'];
const CORE = new Set(CORE_SETS);

const RARITY_RANK = { N: 0, R: 1, SR: 2, UR: 3, PR: 4 };
function mapRarity(r) {
  r = (r || '').toLowerCase();
  if (r.includes('prismatic') || r.includes('ghost') || r.includes('secret') || r.includes('ultimate')) return 'PR';
  if (r.includes('ultra') || r.includes('gold')) return 'UR';
  if (r.includes('super')) return 'SR';
  if (r.includes('rare')) return 'R';
  return 'N';
}

function parseFusion(desc) {
  const first = desc.split('\n')[0];
  const m = first.match(/^("[^"]+"(?:\s*\+\s*"[^"]+")+)/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
}

function parseRitual(desc) {
  const t = desc.match(/Ritual Summon "([^"]+)"/);
  const a = desc.match(/any (LIGHT|DARK|EARTH|WATER|FIRE|WIND|DIVINE) Ritual Monster/);
  const more = desc.match(/(\d+) or more/);
  if (!t && !a) return null;
  return { target: t ? t[1] : null, attr: a ? a[1] : null, level: more ? +more[1] : null, exact: !more };
}

const MONSTER_TYPES = new Set([
  'Normal Monster', 'Effect Monster', 'Flip Effect Monster', 'Spirit Monster', 'Toon Monster', 'Gemini Monster',
  'Union Effect Monster', 'Ritual Monster', 'Ritual Effect Monster', 'Fusion Monster', 'Tuner Monster', 'Normal Tuner Monster',
]);

const all = [];
for (const c of raw) {
  const isMonster = c.type.includes('Monster');
  if (c.type === 'Skill Card' || c.type === 'Token') continue;
  const sets = c.card_sets || [];
  let earliest = null;
  for (const s of sets) {
    const dt = setDate.get(s.set_name);
    if (dt && (!earliest || dt < earliest)) earliest = dt;
  }
  const era = eraOf(earliest);
  const coreSets = sets.filter(s => CORE.has(s.set_code.split('-')[0]));
  const rpool = coreSets.length ? coreSets : sets;
  let best = 'N';
  for (const s of rpool) {
    const m = mapRarity(s.set_rarity);
    if (RARITY_RANK[m] > RARITY_RANK[best]) best = m;
  }
  if (!coreSets.length && RARITY_RANK[best] > RARITY_RANK.SR) best = 'SR';
  const card = {
    id: c.id, name: c.name, type: c.type,
    kind: isMonster ? 'monster' : c.type === 'Spell Card' ? 'spell' : 'trap',
    frame: c.frameType, desc: c.desc, race: c.race, attr: c.attribute || null,
    atk: isMonster ? c.atk ?? 0 : undefined, def: isMonster ? c.def ?? 0 : undefined, level: isMonster ? c.level ?? 0 : undefined,
    rarity: best, era, date: earliest,
    ban: (c.banlist_info && c.banlist_info.ban_tcg) || null, // güncel TCG Forbidden/Limited/Semi-Limited listesi
    packs: [...new Set(coreSets.map(s => s.set_code.split('-')[0]))],
    img: c.card_images?.[0]?.id ?? c.id,
  };
  if (c.type === 'Fusion Monster') card.materials = parseFusion(c.desc);
  if (c.type === 'Spell Card' && c.race === 'Ritual') card.ritual = parseRitual(c.desc);
  all.push(card);
}
all.sort((a, b) => a.name.localeCompare(b.name));

const dm = all.filter(c => c.era === 'DM' && (c.kind !== 'monster' || MONSTER_TYPES.has(c.type)));
fs.writeFileSync(path.join(root, 'data', 'cards.all.json'), JSON.stringify(all));
fs.writeFileSync(path.join(root, 'data', 'cards.dm.json'), JSON.stringify(dm));

const count = (arr, f) => arr.reduce((m, c) => ((m[f(c)] = (m[f(c)] || 0) + 1), m), {});
console.log('Tüm kartlar:', all.length, count(all, c => c.era));
console.log('DM kartları:', dm.length, count(dm, c => c.kind), count(dm, c => c.rarity));
console.log('Fusion (parse edilmiş):', dm.filter(c => c.materials).length, '/', dm.filter(c => c.type === 'Fusion Monster').length);
console.log('Ritual büyü (parse edilmiş):', dm.filter(c => c.ritual).length, '/', dm.filter(c => c.race === 'Ritual' && c.kind === 'spell').length);

// Özel Overframe kartlarını işle (data/cards.custom.json)
require('./merge-custom.js');
