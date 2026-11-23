// Basit sezgisel yapay zekâ kontrolcüsü (faz farkındalıklı).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.YGO.makeAI = factory(root.YGO);
})(typeof self !== 'undefined' ? self : this, function (E) {
  const { FX } = E;

  function makeAI() {
    let tried = new Set();
    let lastKey = null;
    let lastTurn = -1;

    const value = (d, c) => (c.d.kind === 'monster' ? (c.d.atk || 0) + (c.d.def || 0) * 0.4 + (c.d.level || 0) * 10 : 600);

    function mainAction(d, p, mk, phase) {
      const P = d.P(p);
      const O = d.P(1 - p);
      const oppAtkBest = Math.max(0, ...O.mz.filter(c => c && c.up && c.pos === 'atk').map(c => d.atk(c)));

      // 1) Büyüler
      for (let i = 0; i < P.hand.length; i++) {
        const c = P.hand[i];
        if (c.d.kind !== 'spell' || !d.canActivateFromHand(p, i)) continue;
        const n = c.d.name;
        if (FX[n] && FX[n].noAI) continue;
        const myAtk = d.monsters(p).reduce((s, m) => s + d.atk(m), 0);
        const opAtk = d.monsters(1 - p).reduce((s, m) => s + d.atk(m), 0);
        if (n === 'Dark Hole' && !(opAtk > myAtk + 500)) continue;
        if (n === 'Raigeki' && O.mz.filter(Boolean).length < 1) continue;
        if (n === 'Heavy Storm' && !(O.st.some(Boolean) || O.field)) continue;
        if (n === 'Mystical Space Typhoon' && !(O.st.some(Boolean) || O.field)) continue;
        if (n === 'Swords of Revealing Light' && opAtk < 1000) continue;
        if (n === 'Nobleman of Crossout' && !O.mz.some(m => m && !m.up)) continue;
        if (n === 'Nobleman of Extermination' && ![...O.st, O.field].some(x => x && !x.up)) continue;
        if (n === 'Offerings to the Doomed' && !(oppAtkBest >= 1800)) continue;
        if (n === 'Giant Trunade' && !(O.st.filter(Boolean).length >= 2 && P.st.filter(Boolean).length <= 1)) continue;
        if (n === "Harpie's Feather Duster" && !(O.st.some(Boolean) || O.field)) continue;
        if (n === 'Book of Moon') continue;
        if (n === 'Card Destruction' && P.hand.length > 3) continue;
        if (n === 'Graceful Charity' && P.hand.length > 4) continue;
        if (n === 'Rain of Mercy' && !(P.lp < O.lp)) continue;
        if (n === 'Premature Burial' && P.lp <= 1500) continue;
        if (n === 'Hammer Shot' && !(oppAtkBest > Math.max(0, ...P.mz.filter(m => m && m.up && m.pos === 'atk').map(m => d.atk(m))))) continue;
        if (n === 'Dian Keto the Cure Master' && P.lp > 3000) continue;
        if (n === 'Red Medicine' && P.lp > 3300) continue;
        const a = mk({ type: 'activate', hand: i });
        if (a) return a;
      }

      // 1b) Eldeki özel çağrılan canavarlar (Toon vb.)
      for (let i = 0; i < P.hand.length; i++) {
        const r = d.canHandSummon(p, i);
        if (!r.ok) continue;
        const mons = P.mz.map((m, zi) => ({ m, zi })).filter(x => x.m).sort((a, b) => d.atk(a.m) - d.atk(b.m));
        const tributes = mons.slice(0, r.need).map(x => x.zi);
        if (tributes.length < r.need) continue;
        const a = mk({ type: 'hsummon', hand: i, tributes });
        if (a) return a;
      }
      // 1b2) Elden kullanılan efektler (Thunder Dragon...)
      for (let i = 0; i < P.hand.length; i++) {
        const he = P.hand[i].d.kind === 'monster' && FX[P.hand[i].d.name] && FX[P.hand[i].d.name].handEffect;
        if (!he || !he.ai || !d.canHandEffect(p, i).ok || !he.ai(d, p, P.hand[i])) continue;
        const a = mk({ type: 'heffect', hand: i });
        if (a) return a;
      }
      // 1c) Canavar yetenekleri
      for (let zi = 0; zi < P.mz.length; zi++) {
        const m = P.mz[zi];
        const ab = m && FX[m.d.name] && FX[m.d.name].ability;
        if (!ab || !ab.ai || !d.canAbility(p, zi).ok || !ab.ai(d, p, m)) continue;
        const a = mk({ type: 'ability', zone: zi });
        if (a) return a;
      }
      // 1c2) Sahadaki Büyü/Tuzak/Union yetenekleri (stAb)
      for (const [kind, zi, c] of [...P.st.map((c, zi) => ['st', zi, c]), ['field', 0, P.field]]) {
        const sab = c && c.up && FX[c.d.name] && FX[c.d.name].stAb;
        if (!sab) continue;
        for (let i = 0; i < sab.length; i++) {
          if (!sab[i].ai || !d.canStAbility(p, kind, zi, i).ok || !sab[i].ai(d, p, c)) continue;
          const a = mk(kind === 'field' ? { type: 'stability', field: true, i } : { type: 'stability', st: zi, i });
          if (a) return a;
        }
      }
      // 1d) Manuel aktive edilen tuzaklar
      for (let zi = 0; zi < P.st.length; zi++) {
        const c = P.st[zi];
        const fx = c && !c.up && c.d.kind === 'trap' && FX[c.d.name];
        if (!fx || !fx.manual || c.placedTurn >= d.turn || (fx.can && !fx.can(d, p, c))) continue;
        const n = c.d.name;
        const good = ['Call of the Haunted', 'Soul Resurrection', 'Just Desserts', 'Cemetary Bomb', 'Secret Barrel', 'Solar Ray', 'Minor Goblin Official', 'Jar of Greed', 'Spirit Barrier'];
        const ok = good.includes(n)
          || (n === 'Compulsory Evacuation Device' && oppAtkBest > Math.max(0, ...P.mz.filter(m => m && m.up).map(m => d.atk(m))))
          || (n === 'Raigeki Break' && P.hand.length >= 2 && oppAtkBest >= 1800)
          || (n === 'Gift of The Mystical Elf' && d.allField().filter(x => x.d.kind === 'monster').length >= 3)
          || (n === 'Needle Ceiling' && d.monsters(p).length < d.monsters(1 - p).length)
          || (n === 'Time Seal')
          || (fx.aiOk && fx.aiOk(d, p, c));
        if (!ok) continue;
        const a = mk({ type: 'activate', st: zi });
        if (a) return a;
      }

      // 2) Canavar çağır
      if (!P.summoned) {
        const opts = [];
        P.hand.forEach((c, i) => {
          const r = d.canSummon(p, i);
          if (r.ok) opts.push({ c, i, need: r.need });
        });
        opts.sort((a, b) => b.c.d.atk - a.c.d.atk);
        for (const o of opts) {
          const mons = P.mz.map((m, zi) => ({ m, zi })).filter(x => x.m).sort((a, b) => d.atk(a.m) - d.atk(b.m));
          let tributes = [];
          if (o.need) {
            tributes = mons.slice(0, o.need).map(x => x.zi);
            const lost = mons.slice(0, o.need).reduce((s, x) => s + d.atk(x.m), 0);
            if (o.c.d.atk <= lost + 300) continue;
          }
          const strongEnough = o.c.d.atk >= oppAtkBest || !oppAtkBest;
          if (FX[o.c.d.name] && FX[o.c.d.name].handSummon) continue;
          const hasFlip = FX[o.c.d.name] && FX[o.c.d.name].onFlip;
          const a = mk({ type: hasFlip || !strongEnough ? 'set' : 'summon', hand: o.i, tributes });
          if (a) return a;
        }
      }

      // 3) Büyü/Tuzak set
      for (let i = 0; i < P.hand.length; i++) {
        const c = P.hand[i];
        const wantsSet = c.d.kind === 'trap' || (c.d.kind === 'spell' && !d.canActivateFromHand(p, i));
        if (wantsSet && d.canSetST(p, i)) {
          const a = mk({ type: 'set', hand: i });
          if (a) return a;
        }
      }

      // 4) Set büyüleri aç
      for (let zi = 0; zi < P.st.length; zi++) {
        const c = P.st[zi];
        if (c && !c.up && c.d.kind === 'spell' && FX[c.d.name] && !FX[c.d.name].noAI &&(!FX[c.d.name].can || FX[c.d.name].can(d, p, c))) {
          const a = mk({ type: 'activate', st: zi });
          if (a) return a;
        }
      }

      // 5) Flip summon
      for (let zi = 0; zi < P.mz.length; zi++) {
        const c = P.mz[zi];
        if (c && !c.up && c.placedTurn < d.turn && !c.moved && FX[c.d.name] && FX[c.d.name].onFlip) {
          const a = mk({ type: 'pos', zone: zi });
          if (a) return a;
        }
      }

      // 6) Main 2: zayıf canavarları savunmaya al
      if (phase === 'main2') {
        for (let zi = 0; zi < P.mz.length; zi++) {
          const m = P.mz[zi];
          if (m && m.up && m.pos === 'atk' && !m.moved && !m.attacked && d.atk(m) < oppAtkBest && m.d.def >= m.d.atk) {
            const a = mk({ type: 'pos', zone: zi });
            if (a) return a;
          }
        }
      }
      return null;
    }

    function battleAction(d, p, mk) {
      const P = d.P(p);
      const O = d.P(1 - p);
      const oppMons = O.mz.map((c, zi) => ({ c, zi })).filter(x => x.c);
      // Battle Phase yetenekleri (Blue-Eyes Ultimate Dragon, the God-Surpassing Servant gibi)
      for (let zi = 0; zi < P.mz.length; zi++) {
        const m = P.mz[zi];
        const ab = m && FX[m.d.name] && FX[m.d.name].ability;
        if (!ab || !(ab.battle || ab.battleOnly) || !ab.ai || !d.canAbility(p, zi).ok || !ab.ai(d, p, m)) continue;
        const a = mk({ type: 'ability', zone: zi });
        if (a) return a;
      }
      for (let zi = 0; zi < P.mz.length; zi++) {
        const m = P.mz[zi];
        if (!m || !d.canAttack(p, zi).ok) continue;
        const A = d.atk(m);
        if (!oppMons.length || d.canDirect(p, m)) {
          const a = mk({ type: 'attack', zone: zi, target: 'direct' });
          if (a) return a;
          continue;
        }
        let best = null;
        for (const t of oppMons) {
          let score;
          if (!t.c.up) score = A >= 1500 ? 1 : -1;
          else if (t.c.pos === 'atk') score = A > d.atk(t.c) ? 3 + d.atk(t.c) / 1000 : -1;
          else score = A > d.def(t.c) ? 2 : -1;
          if (score > 0 && (!best || score > best.score)) best = { score, t };
        }
        if (best) {
          const a = mk({ type: 'attack', zone: zi, target: best.t.zi });
          if (a) return a;
        }
      }
      return null;
    }

    return {
      error() { if (lastKey) tried.add(lastKey); },
      async choose(d, p, title, options) { return options[Math.floor(d.rng() * options.length)]; },

      async pick(d, p, cands, prompt, hint) {
        const cs = cands.map(x => x.card);
        if (!cs.length) return null;
        const mine = cs.filter(c => c.owner === p);
        const theirs = cs.filter(c => c.owner !== p);
        const byAtk = (a, b) => value(d, b) - value(d, a);
        if (hint === 'harm') {
          if (theirs.length) return theirs.sort(byAtk)[0];
          return mine.sort((a, b) => -byAtk(a, b))[0] || null;
        }
        if (hint === 'discard' || hint === 'tribute') return cs.sort((a, b) => -byAtk(a, b))[0];
        if (hint === 'revive' || hint === 'help') return cs.sort(byAtk)[0];
        return cs[0];
      },

      // Tepki pencereleri: kartın ai() ipucu varsa ona uyar; Quick-Play Büyüler ipucu yoksa kullanılmaz; diğerleri evet
      async confirmTrap(d, p, card, ctx) {
        const f = FX[card.d.name];
        if (!f) return true;
        const g = f.ai || (f.quick && f.quick.ai) || (f.negator && f.negator.ai) || (f.counter && f.counter.ai);
        if (g) return !!g(d, p, card, ctx);
        return card.d.kind !== 'spell';
      },

      async act(d, p) {
        if (d.turn !== lastTurn) { tried = new Set(); lastTurn = d.turn; }
        const phase = d.phase;
        const mk = a => { lastKey = phase + JSON.stringify(a); return tried.has(lastKey) ? null : a; };
        if (phase === 'main1' || phase === 'main2') {
          const a = mainAction(d, p, mk, phase);
          if (a) return a;
          if (phase === 'main1') {
            const canFight = d.turn > 1 && d.P(p).mz.some(m => m && m.up && m.pos === 'atk' && !m.attacked);
            return canFight ? { type: 'phase', to: 'battle' } : { type: 'end' };
          }
          return { type: 'end' };
        }
        if (phase === 'battle') {
          const a = battleAction(d, p, mk);
          if (a) return a;
          return { type: 'phase', to: 'main2' };
        }
        return { type: 'end' };
      },
    };
  }
  return makeAI;
});
