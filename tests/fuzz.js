// Rastgele oyuncu (fuzzer): insan arayüzünün kullandığı TÜM aksiyon türlerini (yetenekler, stAb, manuel tuzaklar, hsummon, heffect...)
// rastgele dener; motorda istisna / sonsuz döngü / kart kopyalanması arar. Kullanım: node tests/fuzz.js [düello sayısı] [yalnızca-yeni-kartlar=1]
const E = require('../src/engine/engine.js');
for (let i = 1; i <= 12; i++) require('../src/engine/effects' + (i === 1 ? '' : i) + '.js');
const KEYS12 = new Set(Object.keys(E.FX));
for (let i = 13; i <= 14; i++) require('../src/engine/effects' + i + '.js');
const makeAI = require('../src/engine/ai.js');
const Decks = require('../src/engine/decks.js');
const cards = require('../data/cards.dm.json');
E.setup(cards);
const db = new Map(cards.map(c => [c.id, c]));
const N = +(process.argv[2] || 200), ONLY_NEW = process.argv[3] !== '0';
const FX = E.FX;
const NEW = new Set(Object.keys(E.FX).filter(n => !KEYS12.has(n)));
let rngSeed = +(process.env.SEED || Date.now()) % 2147483647;
const rng = () => (rngSeed = (rngSeed * 48271) % 2147483647) / 2147483647;
const r = n => Math.floor(rng() * n);
const pickOf = a => a[r(a.length)];

const HIST = {}, USED = new Set();
function randomCtl() {
  return {
    error() { HIST.error = (HIST.error || 0) + 1; },
    async choose(d, p, title, options) { return pickOf(options); },
    async pick(d, p, cands) { return rng() < 0.08 ? null : pickOf(cands).card; },
    async confirmTrap() { return rng() < 0.6; },
    async act(d, p) {
      const a = await this.act0(d, p); HIST[a.type] = (HIST[a.type] || 0) + 1;
      const P0 = d.P(p), c0 = a.hand != null ? P0.hand[a.hand] : a.zone != null ? P0.mz[a.zone] : a.st != null ? P0.st[a.st] : null; if (c0) USED.add(c0.d.name);
      return a;
    },
    async act0(d, p) {
      const P = d.P(p), ph = d.phase, opts = [];
      if (ph === 'main1' || ph === 'main2') {
        P.hand.forEach((c, i) => {
          if (c.d.kind === 'monster') {
            const s = d.canSummon(p, i); if (s.ok) { const mz = P.mz.map((m, z) => (m ? z : -1)).filter(z => z >= 0); const trib = []; let val = 0; const cc = [...mz]; while (val < s.need && cc.length) { const z = cc.splice(r(cc.length), 1)[0]; trib.push(z); val += d.tribVal(c, P.mz[z]); } if (val >= s.need) { opts.push({ type: 'summon', hand: i, tributes: trib }); opts.push({ type: 'set', hand: i, tributes: trib }); } }
            const hs = d.canHandSummon(p, i); if (hs.ok) { const mz = P.mz.map((m, z) => (m ? z : -1)).filter(z => z >= 0).sort(() => rng() - 0.5).slice(0, hs.need); opts.push({ type: 'hsummon', hand: i, tributes: mz }); }
            if (d.canHandEffect(p, i).ok) opts.push({ type: 'heffect', hand: i });
          } else {
            if (d.canActivateFromHand(p, i)) opts.push({ type: 'activate', hand: i });
            if (d.canSetST(p, i)) opts.push({ type: 'set', hand: i });
          }
        });
        P.mz.forEach((m, z) => { if (!m) return; if (d.canAbility(p, z).ok) opts.push({ type: 'ability', zone: z }); opts.push({ type: 'pos', zone: z }); });
        P.st.forEach((c, z) => { if (!c) return; if (!c.up) opts.push({ type: 'activate', st: z }); const sab = c.up && FX[c.d.name] && FX[c.d.name].stAb; if (sab) sab.forEach((a, i) => { if (d.canStAbility(p, 'st', z, i).ok) opts.push({ type: 'stability', st: z, i }); }); });
        if (P.field) { if (!P.field.up) opts.push({ type: 'activate', field: true }); const sab = P.field.up && FX[P.field.d.name] && FX[P.field.d.name].stAb; if (sab) sab.forEach((a, i) => { if (d.canStAbility(p, 'field', 0, i).ok) opts.push({ type: 'stability', field: true, i }); }); }
        if (!opts.length || rng() < 0.12) return rng() < 0.5 ? { type: 'phase', to: 'battle' } : { type: 'end' };
        return pickOf(opts);
      }
      if (ph === 'battle') {
        P.mz.forEach((m, z) => { if (!m) return; if (d.canAbility(p, z).ok) opts.push({ type: 'ability', zone: z }); if (d.canAttack(p, z).ok) { const O = d.P(1 - p); if (!O.mz.some(Boolean) || d.canDirect(p, m)) opts.push({ type: 'attack', zone: z, target: 'direct' }); O.mz.forEach((t, tz) => { if (t) opts.push({ type: 'attack', zone: z, target: tz }); }); } });
        P.st.forEach((c, z) => { if (c && c.up && FX[c.d.name] && FX[c.d.name].stAb) FX[c.d.name].stAb.forEach((a, i) => { if (d.canStAbility(p, 'st', z, i).ok) opts.push({ type: 'stability', st: z, i }); }); });
        if (!opts.length || rng() < 0.15) return { type: 'phase', to: 'main2' };
        return pickOf(opts);
      }
      return { type: 'end' };
    },
  };
}

function invariants(d) {
  const bad = [];
  for (const p of [0, 1]) {
    const P = d.P(p);
    if (P.mz.length !== 3 || P.st.length !== 3) bad.push('bölge sayısı');
    if (P.lp < 0) bad.push('LP<0');
    const all = [...P.deck, ...P.extra, ...P.hand, ...P.grave, ...P.banished, ...P.mz.filter(Boolean), ...P.st.filter(Boolean), ...(P.field ? [P.field] : [])];
    if (new Set(all.map(c => c.uid)).size !== all.length) bad.push('kart kopyalandı (oyuncu ' + p + ')');
  }
  const all2 = [0, 1].flatMap(p => [...d.P(p).deck, ...d.P(p).hand, ...d.P(p).grave, ...d.P(p).banished, ...d.P(p).mz.filter(Boolean), ...d.P(p).st.filter(Boolean), ...(d.P(p).field ? [d.P(p).field] : [])]);
  if (new Set(all2.map(c => c.uid)).size !== all2.length) bad.push('kart iki oyuncuda birden');
  return bad;
}

(async () => {
  const pl = Decks.buildPool(cards).all.filter(c => c.type !== 'Fusion Monster' && !c.ritual && c.name !== 'Polymerization');
  const newCards = pl.filter(c => NEW.has(c.name)), baseCards = pl.filter(c => !NEW.has(c.name));
  const mk = () => { const m = []; while (m.length < 32) { const src = ONLY_NEW && newCards.length && rng() < 0.75 ? newCards : pl; const c = pickOf(src); if (m.filter(i => i === c.id).length < Decks.copyLimit(c)) m.push(c.id); } return m; };
  let bad = 0, errs = {};
  for (let g = 0; g < N; g++) {
    const seed = rngSeed;
    const d = new E.Duel({ decks: [mk(), mk()], db, ctl: [randomCtl(), g % 3 === 0 ? randomCtl() : makeAI()], first: g % 2, maxTurns: 25, rng });
    try {
      await Promise.race([d.run(), new Promise((_, rj) => setTimeout(() => rj(new Error('zaman aşımı (sonsuz döngü?)')), 10000))]);
      const iv = invariants(d); if (iv.length) { bad++; console.error('İNVARYANT:', iv.join(', '), 'seed', seed); }
    } catch (e) {
      bad++; const key = e.message + ' @ ' + (e.stack.split('\n').find(l => /effects1[34]|engine\.js|effects\d/.test(l)) || '').trim().replace(/.*src[\\/]engine[\\/]/, '');
      errs[key] = (errs[key] || 0) + 1; if (errs[key] === 1) console.error('HATA:', e.message, '\n', e.stack.split('\n').slice(1, 5).join('\n'));
    }
  }
  console.log('Aksiyonlar:', JSON.stringify(HIST), '· oynanan farklı kart:', USED.size, '· bunlardan yeni:', [...USED].filter(n => NEW.has(n)).length, '/', NEW.size);
  console.log(`Fuzz bitti: ${N} düello, ${bad} sorun`); if (Object.keys(errs).length) console.log(errs);
  process.exit(bad ? 1 : 0);
})();
