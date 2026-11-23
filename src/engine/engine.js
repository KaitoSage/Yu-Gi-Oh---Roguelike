// Yu-Gi-Oh! düello motoru (Duel Links hızlı formatı: 4000 LP, 3 canavar + 3 büyü/tuzak + 1 saha bölgesi)
// UMD: hem Node (test) hem tarayıcı (Electron) içinde çalışır.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YGO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RULES = { LP: 4000, ZONES: 3, HAND: 5, HAND_LIMIT: 6, MAX_TURNS: 60 };
  const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];
  const PHASE_TR = { draw: 'Draw Phase', standby: 'Standby Phase', main1: 'Main Phase 1', battle: 'Battle Phase', main2: 'Main Phase 2', end: 'End Phase' };
  const NEXT_OK = { main1: ['battle', 'end'], battle: ['main2', 'end'], main2: ['end'] };

  const FX = {}; // kart adına göre efekt tablosu (effects.js doldurur)
  const QP_TRIGGERS = ['attack', 'phase']; // Quick-Play Büyülerin varsayılan tepki pencereleri

  const EXODIA = [
    'Exodia the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One',
    'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One',
  ];

  let UID = 1;
  const other = p => 1 - p;

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const tributesNeeded = level => (level >= 7 ? 2 : level >= 5 ? 1 : 0);
  const isFieldSpell = c => !!(FX[c.d.name] && FX[c.d.name].sub === 'field');

  // Hedef alan bir efektin iptal edilmesi (BEWD White Phantom Beast gibi): aktif efektin çözümünü sessizce keser
  class Negated extends Error {}

  class Duel {
    /**
     * @param {object} o
     * @param {number[][]} o.decks    ana desteler (id listesi)
     * @param {number[][]} [o.extras] extra desteler (Fusion)
     * @param {Map<number,object>} o.db
     * @param {object[]} o.ctl  [{act, pick, confirmTrap, error}, ...]
     * @param {function} [o.onEvent]
     */
    constructor(o) {
      this.db = o.db;
      this.ctl = o.ctl;
      this.onEvent = o.onEvent || (async () => {});
      this.rng = o.rng || Math.random;
      const extras = o.extras || [[], []];
      this.players = [0, 1].map(i => ({
        idx: i,
        lp: (o.startLP && o.startLP[i]) || RULES.LP,
        deck: shuffle(o.decks[i].map(id => this.inst(id, i)), this.rng),
        extra: (extras[i] || []).map(id => this.inst(id, i)),
        hand: [], grave: [], banished: [],
        mz: Array(RULES.ZONES).fill(null),
        st: Array(RULES.ZONES).fill(null),
        field: null,
        summoned: false,
      }));
      this.turn = 0;
      this.phase = 'draw';
      this.active = o.first ?? 0;
      this.over = false;
      this.winner = null;
      this.reason = '';
      this.flags = { waboku: [false, false], skipDraw: [false, false] };
      this.maxTurns = o.maxTurns || RULES.MAX_TURNS;
    }

    inst(id, owner) {
      const d = this.db.get(id);
      if (!d) throw new Error('Bilinmeyen kart id: ' + id);
      return {
        uid: UID++, id, d, owner, origOwner: owner, pos: 'atk', up: true, placedTurn: 0,
        attacked: false, moved: false, bonus: { atk: 0, def: 0 }, equipTo: null, counter: 0,
      };
    }

    async ev(type, data = {}) { await this.onEvent({ type, ...data }); }
    // Klasik Yu-Gi-Oh yazı-tura (true = yazı/Heads) ve altın zar; arayüz animasyonu 'coin' / 'dice' olaylarıyla oynar
    async toss(p, n = 1) {
      let r = Array.from({ length: n }, () => this.rng() < 0.5); await this.ev('coin', { p, results: r });
      const sc = this.allField().find(c => c.up && FX[c.d.name] && FX[c.d.name].redoToss && c.redoTurn !== this.turn); // Second Coin Toss
      if (sc && (await this.ask(sc.owner, sc, 'Second Coin Toss: yazı-turayı yeniden at?'))) { sc.redoTurn = this.turn; r = Array.from({ length: n }, () => this.rng() < 0.5); await this.ev('coin', { p, results: r }); }
      return r;
    }
    // Geçici tür/özellik/Level değişimi: kart verisinin örneğe özel kopyası (sahadan çıkınca sıfırlanır). key: kaynak kart (aynı kaynak tekrar yazar)
    setD(c, key, patch) {
      if (!c.d0) c.d0 = c.d;
      c.dpSrc = Object.assign({}, c.dpSrc, { [key]: patch });
      c.d = Object.assign({}, c.d0, ...Object.values(c.dpSrc));
    }
    clrD(c, key) {
      if (!c.d0 || !c.dpSrc) return;
      delete c.dpSrc[key];
      if (!Object.keys(c.dpSrc).length) { c.d = c.d0; c.d0 = null; c.dpSrc = null; }
      else c.d = Object.assign({}, c.d0, ...Object.values(c.dpSrc));
    }
    async roll(p, n = 1) {
      let r = Array.from({ length: n }, () => 1 + Math.floor(this.rng() * 6)); await this.ev('dice', { p, results: r });
      if (this.flags.dieReroll === this.turn) { this.flags.dieReroll = -1; r = Array.from({ length: n }, () => 1 + Math.floor(this.rng() * 6)); await this.ev('dice', { p, results: r }); } // Dice Re-Roll
      return r;
    }

    // ---------- Yardımcılar ----------
    P(i) { return this.players[i]; }
    fx(c) { return FX[c.d.name] || null; }
    freeZone(p, kind) { if (this.fieldCapFull(p)) return -1; return this.P(p)[kind].findIndex((z, i) => !z && !(kind === 'mz' && this.zoneBlocked(p, i))); }
    // Spatial Collapse: oyuncunun sahasındaki kart sayısı sınırı
    fieldCapFull(p) {
      let cap = 0;
      for (const f of this.allField()) { const x = f.up && this.fx(f); if (x && x.fieldCap && (!cap || x.fieldCap < cap)) cap = x.fieldCap; }
      if (!cap) return false;
      const P = this.P(p);
      return P.mz.filter(Boolean).length + P.st.filter(Boolean).length + (P.field ? 1 : 0) >= cap;
    }
    // Yüzü açık kartın etkisi şu an iptal mi? (Metal Detector, Mystic Probe, World Suppression, Talisman'lar, Silent Swordsman LV7)
    cardNegated(x) {
      const f = this.fx(x); if (!f || x.d.kind === 'monster') return false;
      const t = this.turn, fl = this.flags;
      if (x.d.kind === 'trap' && f.sub === 'continuous' && fl.negContTrap === t) return true;
      if (x.d.kind === 'spell' && f.sub === 'continuous' && fl.negContSpell === t) return true;
      if (f.sub === 'field' && fl.negField === t) return true;
      if (x.d.kind === 'spell' && f.sub !== 'field' && this.allField().some(y => y.up && y !== x && this.fx(y) && this.fx(y).negateSpellFx && !this.negatedMon(y))) return true;
      if (x.d.kind === 'spell' && this.allField().some(y => y.up && y !== x && this.fx(y) && this.fx(y).sealSpells)) return true;
      if (x.d.kind === 'trap' && this.allField().some(y => y.up && y !== x && this.fx(y) && this.fx(y).sealTraps)) return true;
      return false;
    }
    equipNeg() { return this.flags.equipOff === this.turn || this.allField().some(x => x.up && this.fx(x) && this.fx(x).negEquip); }
    noTribute(t) { return this.allField().some(x => x.up && this.fx(x) && this.fx(x).noTributeAny) || (t && t.up && this.fx(t) && this.fx(t).noTribute); }
    // Tribute değeri: Double Coston / Kaiser Sea Horse / Trojan Horse / Unshaven Angler 2 tribute sayılır
    tribVal(c, t) { const f = this.fx(t); return f && f.doubleTrib && t.up && f.doubleTrib(c, this) ? 2 : 1; }
    // Soul Exchange: bu tur tribute edilen canavar, seçilen rakip canavarı olmak zorunda
    soulTarget(p) { const se = this.flags.soulEx; return se && se.p === p && se.turn === this.turn && this.onField(se.c) ? se.c : null; }
    tribNeed(p, c) {
      const sfx = this.fx(c);
      let need = (sfx && sfx.freeTribute && sfx.freeTribute(this, p, c)) ? 0 : tributesNeeded(this.effLevel(c));
      if (need > 0 && this.soulTarget(p)) need--;
      return need;
    }
    // Çağırma kısıtları (Kaiser Colosseum, Narrow Pass, Prohibition, Non Aggression Area...): hata metni ya da null
    summonRestricted(p, c, kind) {
      if (c.d.kind === 'monster' && this.flags.noSummonP && this.flags.noSummonP[p] === this.turn) return 'Bu tur çağıramazsın (Non Aggression Area)';
      for (const f of this.allField()) {
        if (!f.up) continue;
        const x = this.fx(f);
        if (x && x.restrictSummon && !this.cardNegated(f)) { const e = x.restrictSummon(this, f, p, c, kind); if (e) return e; }
        if (x && x.banName && f.banned === c.d.name && !this.cardNegated(f)) return `Prohibition: ${c.d.name} kullanılamaz`;
      }
      return null;
    }
    // Chain Energy: eldeki kartı oynamanın LP bedeli
    async payHandCost(p) {
      let n = 0;
      for (const f of this.allField()) { const x = f.up && this.fx(f); if (x && x.handCost && !this.cardNegated(f)) n += x.handCost(this, f, p) || 0; }
      if (!n) return true;
      if (this.P(p).lp <= n) return false;
      await this.damage(p, n);
      return true;
    }
    // Eli açık oynanan oyuncu (Ceremonial Bell, Mind on Air, Respect Play, The Eye of Truth)
    handRevealed(p) {
      return this.allField().some(x => { const f = x.up && this.fx(x); return f && f.revealHand && !this.negatedMon(x) && f.revealHand(this, x, p); });
    }
    sealedST(c) { return this.allField().some(x => x.up && x.sealed && x.sealed.includes(c.uid)); }
    monsters(p, onlyUp) { return this.P(p).mz.filter(c => c && (!onlyUp || c.up)); }
    allField() { return [0, 1].flatMap(p => [...this.P(p).mz, ...this.P(p).st, this.P(p).field]).filter(Boolean); }

    locate(c) {
      for (const p of [0, 1]) {
        const P = this.P(p);
        for (const k of ['mz', 'st']) {
          const i = P[k].indexOf(c);
          if (i >= 0) return { p, kind: k, idx: i };
        }
        if (P.field === c) return { p, kind: 'field', idx: 0 };
        for (const k of ['hand', 'deck', 'extra', 'grave', 'banished']) {
          const i = P[k].indexOf(c);
          if (i >= 0) return { p, kind: k, idx: i };
        }
      }
      return null;
    }
    onField(c) { const l = this.locate(c); return !!l && (l.kind === 'mz' || l.kind === 'st' || l.kind === 'field'); }
    inMZ(c) { const l = this.locate(c); return !!l && l.kind === 'mz'; }

    stat(c, key) {
      let v = c.d[key] + c.bonus[key];
      for (const f of this.allField()) {
        if (!f.up) continue;
        const fx = this.fx(f);
        if (fx && fx.mod && f !== c && !(f.equipTo != null && this.equipNeg()) && !this.cardNegated(f)) v += fx.mod(c, key, this, f) || 0;
      }
      const own = this.fx(c);
      if (own && own.selfMod) v += own.selfMod(c, key, this) || 0;
      if (this.flags.reverse === this.turn) v = 2 * c.d[key] - v; // Reverse Trap: artış/azalışlar ters çevrilir
      return Math.max(0, v);
    }
    atk(c) { return this.stat(c, 'atk'); }
    def(c) { return this.stat(c, 'def'); }

    // ---------- Kart hareketleri ----------
    removeFromWherever(c) {
      const loc = this.locate(c);
      if (!loc) return null;
      const P = this.P(loc.p);
      if (loc.kind === 'field') P.field = null;
      else if (loc.kind === 'mz' || loc.kind === 'st') P[loc.kind][loc.idx] = null;
      else P[loc.kind].splice(loc.idx, 1);
      if (c.d0 && (loc.kind === 'mz' || loc.kind === 'st' || loc.kind === 'field')) { c.d = c.d0; c.d0 = null; c.dpSrc = null; } // tür/özellik/Level değişimleri sahadan çıkınca sıfırlanır
      return loc;
    }

    // ---------- Efekt koruma / hedefleme / iptal altyapısı (v4) ----------
    // Kartın şu an etkisi altında olmadığı efekt türleri (fx.immune)
    immune(c, kind) {
      const fx = this.fx(c);
      if (fx && fx.immune && c.up && this.onField(c) && fx.immune(this, c, kind)) return true;
      if (c.d.kind === 'monster') { // başka kartın verdiği koruma (Dust Barrier, Non-Spellcasting Area, White Hole)
        for (const x of this.allField()) { const g = x.up && x !== c && this.fx(x) && this.fx(x).guardMon; if (g && !this.cardNegated(x) && g(this, x, c, kind)) return true; }
        const sh = this.flags.shield;
        if (sh && sh.turn === this.turn && c.owner === sh.p && this.src && this.src.card && this.src.card.d.name === sh.src) return true;
      }
      if (c.d.kind !== 'monster' && !c.up && (this.flags.timidity || -1) >= this.turn && kind === 'destroy') return true; // Timidity
      // Başka bir kartın verdiği koruma (örn. Black Chaos: Büyü/Tuzaklar rakip efektiyle yok edilemez / çıkarılamaz)
      if (c.d.kind !== 'monster') {
        for (const x of this.allField()) {
          const g = x.up && x !== c && x.owner === c.owner && this.fx(x) && this.fx(x).guardST;
          if (g && g(this, c, kind)) return true;
        }
      }
      return false;
    }
    // Rakibin efektinin c'yi hedef alıp almadığı (hedef alıyorsa "hedef almayanlardan etkilenmez" korumaları geçmez)
    isTargeted(c) { return !!(this.tgt && this.tgt.has(c.uid)); }
    flipNegated() { return this.allField().some(x => x.up && this.fx(x) && this.fx(x).negateFlip); }
    summonBlocked() { return this.allField().some(x => x.up && this.fx(x) && this.fx(x).noSummon); }
    zoneBlocked(p, i) { return this.allField().some(x => x.up && (x.blockBoth || x.owner !== p) && x.blockZones && x.blockZones.includes(i)); }
    respBlocked(card) { return (this.flags.noResp || []).some(x => x.name === card.d.name && this.turn <= x.until); }
    // Şu an çözülen efekt c'nin rakibinden mi geliyor? kinds: ['spell','trap','monster'] (verilmezse hepsi)
    fromOpp(c, kinds) {
      const s = this.src || { p: this.active, kind: 'monster' };
      return s.p !== c.owner && (!kinds || kinds.includes(s.kind));
    }
    // Oyuncuya evet/hayır sorar (AI her zaman evet der)
    // Bildirim/seçim: options = string listesi; oyuncu 1 tanesini seçer (kontrolcüde choose yoksa ilki)
    async choose(p, title, options) { const c = this.ctl[p]; return c && c.choose ? c.choose(this, p, title, options) : options[0]; }
    // Saldırı hedefi kısıtı (Raregold Armor, Prickle Fairy...): saldırı yapılamıyorsa hata metni döner
    targetRestricted(atk, def) {
      for (const f of this.allField()) {
        if (!f.up) continue;
        const fx = this.fx(f);
        if (fx && fx.noAttackOn && !this.negatedMon(f)) { const e = fx.noAttackOn(this, f, atk, def); if (e) return e; }
      }
      return null;
    }
    async ask(p, card, text) { return !!(await this.ctl[p].confirmTrap(this, p, card, { text })); }
    // "Hedef alınamaz" kartları seçim listesinden çıkarır
    filterTargets(cards, hint) {
      if (hint === 'tribute' || hint === 'discard' || hint === 'cost') return cards;
      const shield = this.allField().filter(x => x.up && FX[x.d.name] && FX[x.d.name].noTargetRace !== undefined);
      return cards.filter(c => !(this.onField(c) && c.up && this.fx(c) && this.fx(c).untargetable)
        && !(this.onField(c) && c.up && c.d.kind === 'monster' && shield.some(x => FX[x.d.name].noTargetRace === c.d.race))
        && !(this.onField(c) && c.up && this.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].noTargetName && FX[x.d.name].noTargetName.test(c.d.name))));
    }
    // Bir efekt c'yi hedef aldı: c'nin onTargeted'ı true dönerse efekt iptal edilir
    async targeted(c, hint) {
      if (c && hint !== 'tribute' && hint !== 'discard' && hint !== 'cost' && !c.up && c.d.kind === 'monster' && this.src && this.src.kind === 'spell' && this.src.p !== c.owner && this.onField(c)) { // kapalı canavarı hedef alan Büyü (Big Shield Gardna)
        const ff = this.fx(c);
        if (ff && ff.fdTarget && (await ff.fdTarget(this, c.owner, c))) throw new Negated();
        return;
      }
      if (!c || hint === 'tribute' || hint === 'discard' || hint === 'cost' || !this.src || !this.onField(c) || !c.up) return;
      (this.tgt = this.tgt || new Set()).add(c.uid);
      for (const x of this.allField()) { // başkasını koruyan kartlar (Frontier Wiseman)
        const g = x.up && this.fx(x) && this.fx(x).guardTarget;
        if (g && !this.cardNegated(x) && (await g(this, x, c, this.src))) throw new Negated();
      }
      if (this.src.p !== c.owner) { // set tuzaklar hedef alınmaya karşılık verir (Dramatic Rescue, Hand Mirror'lar)
        for (const t of [...this.P(c.owner).st]) {
          const tf = t && !t.up && t.d.kind === 'trap' && t.placedTurn < this.turn && this.fx(t) && this.fx(t).onTargetedTrap;
          if (!tf || this.trapsNegated(c.owner)) continue;
          if (this.fx(t).targetCan && !this.fx(t).targetCan(this, c.owner, t, c, this.src)) continue;
          if (!(await this.ask(c.owner, t, `${c.d.name} hedef alındı: ${t.d.name} aktive edilsin mi?`))) continue;
          t.up = true; await this.ev('trap', { p: c.owner, card: t });
          const neg = await tf(this, c.owner, t, c, this.src);
          if (this.onField(t) && this.fx(t).sub !== 'continuous') await this.sendToGrave(t, 'trap');
          if (neg) throw new Negated();
        }
      }
      const fx = this.fx(c);
      if (fx && fx.destroyWhenTargeted) (this.tdQueue = this.tdQueue || []).push(c); // efekt çözüldükten sonra yok olur
      if (fx && fx.onTargeted && this.src.p !== c.owner && (await fx.onTargeted(this, c.owner, c))) throw new Negated();
    }
    // Efekt çözümü bitti: hedef alınma kayıtlarını temizle, "hedef alınınca yok olan" kartları yok et
    async flushTargets() {
      this.flags.muko = -1; // Muko: yalnızca o efektin çekişleri
      const q = this.tdQueue || []; this.tdQueue = []; this.tgt = null;
      for (const c of q) if (this.onField(c) && !this.over) await this.destroy(c, null);
    }
    // Rakibin aktive ettiği kartı/efekti iptal edebilen sahadaki canavarlar (fx.negator). true = iptal edildi
    async negationWindow(card, activator) {
      if (this.respBlocked(card)) return false; // Phara: bu karta karşılık verilemez
      for (const x of this.allField()) {
        if (this.over) return false;
        const ng = x.up && x !== card && this.fx(x) && this.fx(x).negator;
        if (!ng || x.owner === activator || !this.onField(x)) continue;
        if (ng.once && x.negTurn === this.turn) continue;
        if (ng.can && !ng.can(this, x, card, activator)) continue;
        if (!(await this.ask(x.owner, x, ng.text ? ng.text(card) : 'Aktivasyonu iptal et?'))) continue;
        if (ng.cost && (await ng.cost(this, x.owner, x)) === false) continue;
        x.negTurn = this.turn;
        await this.ev('negate', { p: x.owner, card: x, target: card });
        if (ng.after) await ng.after(this, x.owner, x, card);
        return true;
      }
      // Eldeki kartlar (Gravekeeper's Watcher): rakibin aktivasyonunu eldeyken iptal eder
      for (const h of [...this.P(other(activator)).hand]) {
        const hn = this.fx(h) && this.fx(h).handNegator;
        if (!hn || this.over) continue;
        if (hn.can && !hn.can(this, h, card, activator)) continue;
        if (!(await this.ask(h.owner, h, hn.text ? hn.text(card) : 'Aktivasyonu iptal et?'))) continue;
        await this.sendToGrave(h, 'cost');
        await this.ev('negate', { p: h.owner, card: h, target: card });
        return true;
      }
      // Set Counter Trap'ler: rakibin aktivasyonunu iptal eder (fx.counter: {kinds, can, text, cost, after})
      const o = other(activator);
      const jin = this.trapsNegated(o);
      for (const c of [...this.P(o).st]) {
        if (this.over || jin) break;
        if (!c || c.up || c.d.kind !== 'trap' || c === card || c.placedTurn >= this.turn) continue;
        const cn = this.fx(c) && this.fx(c).counter;
        if (!cn) continue;
        const kind = card.d.kind === 'monster' ? 'monster' : card.d.kind;
        if (!(cn.kinds || ['spell', 'trap', 'monster']).includes(kind)) continue;
        if (cn.can && !cn.can(this, o, c, card, activator)) continue;
        if (!(await this.ask(o, c, cn.text ? cn.text(card) : `${card.d.name} aktive edildi: Counter Trap ile iptal et?`))) continue;
        if (cn.cost && (await cn.cost(this, o, c, card)) === false) continue;
        c.up = true;
        await this.ev('trap', { p: o, card: c });
        await this.notify('onTrapActivate', o, c);
        if (cn.after) await cn.after(this, o, c, card, activator);
        if (this.onField(c)) await this.sendToGrave(c, 'trap');
        return true;
      }
      return false;
    }
    // Eldeki kartların tepki efektleri (BEWD: desteden ele eklenince / savaşta canavar yok olunca)
    async handReact(kind, p, evCard) {
      for (const c of [...this.P(p).hand]) {
        if (this.over) return;
        const fx = this.fx(c); const hr = fx && fx.handReact && fx.handReact[kind];
        if (!hr || c.hrKey === this.turn + ':' + kind) continue;
        if (hr.can && !hr.can(this, p, c, evCard)) continue;
        if (!(await this.ask(p, c, hr.text))) continue;
        c.hrKey = this.turn + ':' + kind;
        await hr.resolve(this, p, c, evCard);
      }
    }

    // Sahadaki yüzü açık kartların `name` kancasını çalıştırır (sürekli kartlar: Dark Room of Nightmare, Soul Absorption...)
    // Jinzo benzeri: oyuncunun Tuzakları iptal ediliyor mu? (Amplifier donatılmış Jinzo kendi Tuzaklarını iptal etmez)
    trapsNegated(p) {
      return this.allField().some(y => y.up && y.d.kind === 'monster' && this.fx(y) && this.fx(y).negateTraps
        && !(y.owner === p && this.allField().some(f => f.equipTo === y.uid && this.fx(f) && this.fx(f).amplify)));
    }
    async notify(name, ...args) {
      for (const x of this.allField()) {
        if (this.over) return;
        if (!x.up) continue;
        const f = FX[x.d.name];
        if (!f || !f[name]) continue;
        if (x.d.kind === 'monster' && this.negatedMon(x)) continue;
        if (this.cardNegated(x)) continue;
        await f[name](this, x.owner, x, ...args);
      }
    }
    // Skill Drain benzeri: yüzü açık canavarın efekti yok sayılıyor mu?
    negatedMon(c) {
      if (c.d.kind !== 'monster' || !c.up) return false;
      return this.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].skillDrain && x !== c);
    }

    async sendToGrave(c, why = 'grave') {
      const loc = this.removeFromWherever(c);
      if (!loc) return;
      c.wasUp = c.up; // yüzü açık mıydı? (Dark Coffin / Statue of the Wicked kapalıyken yok olunca çalışır)
      if ((why === 'discard' || why === 'tribute') && c.d.race === 'Dragon' && c.d.kind === 'monster') (this.dragonLog = this.dragonLog || []).push({ turn: this.turn, owner: c.owner }); // Super Rejuvenation
      if (c.d.type === 'Token') { c.owner = c.origOwner; await this.ev('toGrave', { card: c, from: loc.kind, why, token: true }); await this.sweepEquips(); return; } // Token'lar mezarlığa gitmez
      c.owner = c.origOwner; // kontrolü değişmiş kart sahibinin mezarlığına gider
      c.up = true; c.pos = 'atk'; c.bonus = { atk: 0, def: 0 };
      if (why === 'battle' && c.d.kind === 'monster' && this.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].battleShuffle)) { // Grave Protector
        this.P(c.owner).deck.push(c); shuffle(this.P(c.owner).deck, this.rng);
        await this.ev('toGrave', { card: c, from: loc.kind, why, shuffled: true });
        await this.sweepEquips();
        return;
      }
      if (why !== 'banished' && this.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].banishGrave && !this.negatedMon(x))) { // Banisher of the Light: mezarlık yerine çıkar
        this.P(c.owner).banished.push(c);
        await this.ev('banish', { card: c });
        await this.sweepEquips();
        return;
      }
      this.P(c.owner).grave.push(c);
      c.graveInfo = { turn: this.turn, why, from: loc.kind, srcP: this.src ? this.src.p : null };
      await this.ev('toGrave', { card: c, from: loc.kind, why });
      if (loc.kind === 'deck' && this.fx(c) && this.fx(c).onMilled && this.src && this.src.p !== c.owner && !this.over) await this.fx(c).onMilled(this, c.owner, c); // Penguin Knight
      await this.notify('onGraveAny', c, loc.kind);
      if (why === 'discard' && loc.kind === 'hand') await this.notify('onDiscard', c);
      if (loc.kind === 'mz' || loc.kind === 'st' || loc.kind === 'field') await this.notify('onFieldToGrave', c, loc.kind);
      if (loc.kind === 'hand' && FX[c.d.name] && FX[c.d.name].onHandToGrave && !this.over) await FX[c.d.name].onHandToGrave(this, c.owner, c, why); // Roc from the Valley of Haze
      if (loc.kind === 'mz') {
        await this.sweepEquips();
        const fx = this.fx(c);
        if (fx && fx.onGrave && !this.graveFxNegated(c, why)) await fx.onGrave(this, c.owner, c, why);
      } else if (loc.kind === 'st' || loc.kind === 'field') {
        const fx = this.fx(c);
        if (fx && fx.onLeaveField) await fx.onLeaveField(this, c.owner, c, why);
      }
      if (loc.kind === 'mz' && c.d.kind === 'monster' && !this.over) await this.trapWindow('monGrave', { card: c, why, stop: false }, c.owner); // Michizure / Rope of Life
      if ((loc.kind === 'st' || loc.kind === 'field') && c.d.kind !== 'monster' && why === 'destroy' && this.src && this.src.p !== c.owner && !this.over) await this.trapWindow('stLost', { card: c, kind: c.d.kind, stop: false, text: `${c.d.name} rakibin efektiyle yok edildi` }, c.owner); // Gust / Driving Snow
      // Büyü/Tuzak efektiyle elden/sahadan mezarlığa gönderilince (Phara)
      if ((loc.kind === 'hand' || loc.kind === 'mz') && this.src && (this.src.kind === 'spell' || this.src.kind === 'trap') && why !== 'tribute' && why !== 'cost') {
        const sfx = this.fx(c);
        if (sfx && sfx.onSentBySpell && !this.over) await sfx.onSentBySpell(this, c.owner, c, why);
      }
    }

    // Savaşta yok edilen canavarın mezarlık efekti iptal mi? (Dark Ruler Ha Des, Twin-Headed Wolf, Terrorking, Element Saurus/Soldier)
    graveFxNegated(c, why) {
      if (why !== 'battle' || !c.killedBy) return false;
      const k = c.killedBy;
      return this.allField().some(x => { const f = x.up && this.fx(x); return f && f.negateKilled && !this.negatedMon(x) && f.negateKilled(this, x, k, c); });
    }
    async destroy(c, by, how = 'effect') {
      if (!this.locate(c)) return;
      if (how !== 'battle' && c.d.kind === 'trap' && !c.up && this.src && this.src.p !== c.owner) { // Fake Trap: set tuzak yerine bu kart yok olur
        const ft = this.P(c.owner).st.find(x => x && !x.up && x !== c && x.placedTurn < this.turn && this.fx(x) && this.fx(x).fakeTrap);
        if (ft && !this.trapsNegated(c.owner) && (await this.ask(c.owner, ft, 'Fake Trap: yok edilecek Tuzak yerine bu kart yok olsun mu?'))) { ft.up = true; await this.ev('trap', { p: c.owner, card: ft }); await this.sendToGrave(ft, 'trap'); return; }
      }
      if (how !== 'battle' && this.immune(c, 'destroy')) return;
      if (how !== 'battle' && c.mr > 0) { c.mr--; await this.ev('negate', { p: c.owner, card: c, target: c }); return; } // Magic Reflector sayacı
      if (c.d.kind === 'monster' && this.inMZ(c)) { // Union canavar donatılmışsa onun yerine Union yok edilir
        const un = this.allField().find(u => u.equipTo === c.uid && u.up && u.d.kind === 'monster' && this.fx(u) && this.fx(u).union && (how === 'battle' || this.fx(u).unionSubAll));
        if (un) { await this.sendToGrave(un, 'destroy'); return; }
      }
      if (how === 'battle') { // savaşta yok olmama: donatılmış kartlar / geçici korumalar (Heart of Clear Water, Ninjitsu Art of Decoy, Charm of Shabti)
        if (this.allField().some(x => { const f = x.up && this.fx(x); return f && f.protectBattle && f.protectBattle(this, x, c); })) return;
        if ((this.flags.safe || []).some(s => s.turn === this.turn && s.fn(c))) return;
      }
      if (how === 'battle' && c.up) { // savaşta yok olmama (Spirit Reaper...) / yerine başka kartı feda etme (Relinquished)
        const bf = this.fx(c);
        if (bf && (bf.noBattleDestroy === true || (typeof bf.noBattleDestroy === 'function' && bf.noBattleDestroy(this, c)))) return;
        if (bf && bf.battleSub && (await bf.battleSub(this, c))) return;
      }
      const wasMon = c.d.kind === 'monster' && this.inMZ(c), owner = c.owner;
      c.killedBy = by || null;
      await this.ev('destroy', { card: c, by });
      await this.sendToGrave(c, how === 'battle' ? 'battle' : 'destroy');
      await this.checkWin();
      if (how === 'battle' && wasMon && !this.over) await this.handReact('battleDestroyed', owner, c);
    }

    async bounce(c) {
      if (this.immune(c, 'bounce')) return;
      const loc = this.removeFromWherever(c);
      if (!loc) return;
      c.owner = c.origOwner;
      c.up = true; c.pos = 'atk'; c.bonus = { atk: 0, def: 0 };
      if (c.d.type !== 'Token') this.P(c.owner)[c.d.type === 'Fusion Monster' ? 'extra' : 'hand'].push(c);
      await this.ev('bounce', { card: c });
      await this.sweepEquips();
      if (loc.kind === 'mz') await this.notify('onBounce', c);
      if (loc.kind === 'mz' && this.src && this.src.p !== c.owner && !this.over) await this.trapWindow('bounce', { card: c, stop: false }, c.owner); // Major Riot
    }

    // Kartı oyuna geri koy: Deck'in üstüne/altına (Serpentine Princess tetiklenir)
    async toDeck(c, bottom = true) {
      const loc = this.removeFromWherever(c);
      if (!loc) return;
      c.owner = c.origOwner; c.up = true; c.pos = 'atk'; c.bonus = { atk: 0, def: 0 }; c.equipTo = null;
      if (c.d.type !== 'Token') { if (bottom) this.P(c.owner).deck.push(c); else this.P(c.owner).deck.unshift(c); }
      await this.ev('bounce', { card: c });
      await this.sweepEquips();
      const f = this.fx(c);
      if (loc.kind === 'mz' && f && f.onToDeck && !this.over) await f.onToDeck(this, c.owner, c);
    }

    async banish(c) {
      if (this.immune(c, 'banish')) return;
      const l0 = this.locate(c);
      const se = this.flags.spiritElim; // Spirit Elimination: mezarlıktaki canavar yerine kendi canavarın çıkar
      if (l0 && l0.kind === 'grave' && c.d.kind === 'monster' && se && se.turn === this.turn) {
        const sub = this.monsters(se.p).sort((a, b) => this.atk(a) - this.atk(b))[0];
        if (sub) { const o = this.flags.spiritElim; this.flags.spiritElim = null; await this.banish(sub); this.flags.spiritElim = o; return; }
      }
      const loc = this.removeFromWherever(c);
      if (!loc) return;
      c.owner = c.origOwner; c.up = true; c.pos = 'atk'; c.bonus = { atk: 0, def: 0 };
      if (c.d.type !== 'Token') this.P(c.owner).banished.push(c);
      await this.ev('banish', { card: c });
      await this.sweepEquips();
      await this.notify('onBanish', c);
      const bf = this.fx(c);
      if (bf && bf.onBanished && !this.over) await bf.onBanished(this, c.owner, c);
    }

    // Kontrol değiştir (Change of Heart / Mind Control...). untilEnd: tur sonunda geri döner.
    async takeControl(c, p, untilEnd) {
      const from = c.owner;
      const zi = this.freeZone(p, 'mz');
      if (zi < 0 || from === p || !this.inMZ(c) || this.immune(c, 'control')) return false;
      this.removeFromWherever(c);
      c.owner = p; c.moved = true; c.attacked = false; c.placedTurn = this.turn;
      this.P(p).mz[zi] = c;
      if (untilEnd) (this.loans = this.loans || []).push({ c, back: from });
      await this.ev('control', { p, card: c });
      const cf = this.fx(c);
      if (cf && cf.onControl && !this.over) await cf.onControl(this, p, c, from); // Ameba / Griggle
      return true;
    }
    async returnLoans() {
      for (const l of (this.loans || [])) {
        const c = l.c;
        if (!this.inMZ(c) || c.owner === l.back) continue;
        const zi = this.freeZone(l.back, 'mz');
        if (zi < 0) { await this.sendToGrave(c, 'loan'); continue; }
        this.removeFromWherever(c);
        c.owner = l.back; this.P(l.back).mz[zi] = c;
        await this.ev('control', { p: l.back, card: c });
      }
      this.loans = [];
    }

    // Faz kancası: oyuncunun yüzü açık kartlarının `name` efektini çalıştırır (standby/endPhase)
    async hook(name, p) {
      // her iki oyuncunun kartları için "…Any" kancası (turdaki oyuncu = p): Burning Land, Ectoplasmer...
      for (const c of this.allField()) {
        if (!c || !c.up || this.over) continue;
        const fx0 = this.fx(c);
        if (fx0 && fx0[name + 'Any'] && !this.cardNegated(c)) await fx0[name + 'Any'](this, p, c);
      }
      const P = this.P(p);
      for (const c of [...P.mz, ...P.st, P.field]) {
        if (!c || !c.up || this.over) continue;
        const fx = this.fx(c);
        if (fx && fx[name] && !this.cardNegated(c)) await fx[name](this, p, c);
      }
      if (name === 'standby') { // mezarlıktan standby'da çalışan kartlar (Sinister Serpent) ve set tuzakların standby tepkileri (Non Aggression Area, Thunder of Ruler)
        for (const c of [...P.grave]) { const fx = this.fx(c); if (fx && fx.graveStandby && !this.over && !this.allField().some(x => x.up && this.fx(x) && this.fx(x).blockGrave)) await fx.graveStandby(this, p, c); }
        for (const q of [p, other(p)]) {
          if (this.trapsNegated(q)) continue;
          for (const c of [...this.P(q).st]) {
            const fx = c && !c.up && c.d.kind === 'trap' && c.placedTurn < this.turn && this.fx(c);
            if (!fx || !fx.standbyTrap || this.over) continue;
            if (fx.standbyTrap.own !== (q === p)) continue;
            if (fx.standbyTrap.can && !fx.standbyTrap.can(this, q, c)) continue;
            if (!(await this.ask(q, c, fx.standbyTrap.text || `${c.d.name} aktive edilsin mi?`))) continue;
            c.up = true; await this.ev('trap', { p: q, card: c });
            this.src = { p: q, kind: 'trap', card: c };
            try { await fx.resolve(this, q, c); } catch (e) { if (!(e instanceof Negated)) throw e; } finally { this.src = null; await this.flushTargets(); }
            if (this.onField(c) && fx.sub !== 'continuous') await this.sendToGrave(c, 'trap');
          }
        }
      }
    }

    // Royal Oppression: iki oyuncudan biri 800 LP ödeyip Özel Çağırmayı iptal edebilir
    async royalOpp(p, c) {
      this.curSS = { p, c };
      for (const q of [other(p), p]) {
        const r = this.allField().find(x => x.up && this.fx(x) && this.fx(x).royal);
        if (!r) return false;
        if (this.P(q).lp > 800 && (await this.ask(q, r, `Royal Oppression: 800 LP ödeyip ${c.d.name} çağrısını iptal et?`))) {
          await this.damage(q, 800);
          await this.ev('negate', { p: q, card: r, target: c });
          if (this.locate(c)) await this.sendToGrave(c, 'destroy');
          return true;
        }
      }
      return false;
    }
    // Özel çağırma (Fusion, Ritual, Monster Reborn...). Başarılıysa true.
    // muted: efektleri bu tur kullanılamaz / çağırma efekti tetiklenmez (Dark Magical Curtain)
    async specialSummon(p, c, { pos = 'atk', muted = false } = {}) {
      const zi = this.freeZone(p, 'mz');
      if (zi < 0 || this.summonBlocked()) return false;
      const loc0 = this.locate(c), fx0 = this.fx(c);
      if (loc0 && loc0.kind === 'grave' && ((fx0 && fx0.noGraveSS) || this.allField().some(x => x.up && this.fx(x) && this.fx(x).blockGrave && !this.negatedMon(x)))) return false; // The End of Anubis / "mezarlıktan çağrılamaz" canavarlar
      if (this.summonRestricted(p, c, 'special')) return false;
      if (this.allField().some(x => x.up && this.fx(x) && this.fx(x).royal) && (await this.royalOpp(p, c))) return false; // Royal Oppression
      const loc = this.removeFromWherever(c);
      c.from = loc ? loc.kind : null; // nereden çağrıldı (hand/deck/grave/extra...)
      c.owner = p; c.up = true; c.pos = pos; c.placedTurn = this.turn; c.attacked = false; c.moved = false; c.bonus = { atk: 0, def: 0 }; c.tribSum = false; c.special = true;
      if (muted) c.mutedTurn = this.turn;
      this.P(p).mz[zi] = c;
      await this.ev('summon', { p, card: c, zone: zi, special: true });
      const fx = this.fx(c);
      if (fx && fx.onSummon && !muted) await fx.onSummon(this, p, c);
      await this.notify('onSpecial', c, c.from);
      await this.notify('onAnySummon', c);
      return true;
    }

    async sweepEquips() {
      for (const c of this.allField()) {
        if (c.equipTo != null && !this.allField().some(m => m.uid === c.equipTo)) await this.sendToGrave(c, 'equip-lost');
      }
    }

    async draw(p, n = 1) {
      const P = this.P(p);
      for (let i = 0; i < n; i++) {
        if (this.drawLocked(p)) return; // Protector of the Sanctuary vb.
        if (!P.deck.length) { await this.win(other(p), 'Deste bitti'); return; }
        const c = this.flags.deckFlip ? P.deck.pop() : P.deck.shift(); // Convulsion of Nature: Deste ters çevrilmiş
        c.up = true;
        P.hand.push(c);
        await this.ev('draw', { p, card: c });
        const dfx = this.fx(c);
        if (dfx && dfx.onDrawn && !this.over) await dfx.onDrawn(this, p, c); // Parasite Paracide / Pharaoh's Treasure
        if (this.flags.muko === this.turn && !this.normalDraw && P.hand.includes(c)) { await this.sendToGrave(c, 'discard'); continue; } // Muko
        await this.handReact('deckToHand', p, c);
        await this.notify('onDrawCard', p, c, !!this.normalDraw);
        if (this.normalDraw) await this.trapWindow('draw', { card: c, p, stop: false }, other(p)); // Drop Off
      }
      this.checkExodia(p);
    }
    // Rakibin efekt çekişini kilitleyen kartlar (yalnızca Draw Phase'de çekebilir)
    drawLocked(p) {
      if (this.normalDraw) return false;
      return this.allField().some(x => x.up && x.owner !== p && FX[x.d.name] && FX[x.d.name].lockOppDraw && !this.negatedMon(x));
    }

    checkExodia(p) {
      const names = new Set(this.P(p).hand.map(c => c.d.name));
      if (EXODIA.every(n => names.has(n))) this.win(p, 'EXODIA! Yasak Olan Yüzünü Göster!');
    }

    async damage(p, n, src) {
      if (n <= 0 || this.over) return;
      const battle = !!(this.battle && src && src.d && src.d.kind === 'monster' && !(this.fx(src) && this.fx(src).battleAsEffect)); // Gravekeeper's Vassal: savaş hasarı efekt hasarı sayılır
      if ((this.flags.noDmg || [])[p] === this.turn) return; // Hallowed Life Barrier: bu tur hiç hasar almazsın
      if ((this.flags.noEffDmg || [])[p] === this.turn && !battle) return; // Pikeru's Circle / Hallowed Life Barrier: bu tur efekt hasarı 0
      for (const f of this.allField()) { // hasar kalkanları (Spirit Barrier...)
        if (!f.up) continue;
        const fx = this.fx(f);
        if (fx && fx.shield && f.owner === p) n = fx.shield(this, p, n, src, f);
        if (fx && fx.shieldAny) n = fx.shieldAny(this, p, n, src, f); // iki tarafın hasarını da etkileyen (The Sanctuary in the Sky)
      }
      // Amazoness Swords Woman: savaşa katılan (yok olmuş olsa bile) kart aldığın savaş hasarını rakibe yansıtır
      const rb = battle && this.battle && !this.reflecting && [this.battle.a, this.battle.d].find(x => x && x.owner === p && FX[x.d.name] && FX[x.d.name].reflectBattle);
      if (rb && n > 0) { this.reflecting = true; const r = n; n = 0; try { await this.damage(other(p), r, rb); } finally { this.reflecting = false; } }
      if (n <= 0) return;
      if (!this.inDmgWindow) { // set tuzaklar hasara karşılık verebilir (Barrel Behind the Door, Nutrient Z...)
        this.inDmgWindow = true;
        const ctx = { p, amount: n, src, battle, negated: false, stop: false };
        try { await this.trapWindow('damage', ctx, p); } finally { this.inDmgWindow = false; }
        if (this.over) return;
        if (ctx.negated) return;
        n = ctx.amount;
        if (n <= 0) return;
      }
      this.P(p).lp = Math.max(0, this.P(p).lp - n);
      if (!battle && this.active === p && (!src || src.owner === p || (this.src && this.src.p === p))) (this.lpPaid = this.lpPaid || [0, 0])[p] += n; // Life Absorbing Machine: ödenen LP
      await this.ev('damage', { p, amount: n, src });
      if (!battle) await this.notify('onEffectDamage', p, n, src);
      await this.checkWin();
    }
    async heal(p, n) {
      const rev = this.allField().find(x => x.up && x.owner !== p && FX[x.d.name] && FX[x.d.name].reverseHeal); // Bad Reaction to Simochi
      if (rev) return this.damage(p, n, rev);
      this.P(p).lp += n; await this.ev('heal', { p, amount: n }); await this.notify('onHeal', p, n); }

    async checkWin() {
      if (this.over) return;
      if (!this.inState) { // durum kontrolü (Heart of Clear Water, Gradius' Option, Rivalry of Warlords, 7...)
        this.inState = true;
        try { await this.notify('stateCheck'); } finally { this.inState = false; }
        if (this.over) return;
      }
      if (this.P(0).lp <= 0 && this.P(1).lp <= 0) return this.win(null, 'Çifte yenilgi');
      if (this.P(0).lp <= 0) return this.win(1, 'LP 0');
      if (this.P(1).lp <= 0) return this.win(0, 'LP 0');
    }
    async win(p, reason) {
      if (this.over) return;
      this.over = true; this.winner = p; this.reason = reason;
      await this.ev('end', { winner: p, reason });
    }

    // ---------- Tur akışı ----------
    async run() {
      for (let i = 0; i < 2; i++) {
        for (let k = 0; k < RULES.HAND; k++) {
          const c = this.P(i).deck.shift();
          if (c) this.P(i).hand.push(c);
        }
      }
      await this.ev('start');
      while (!this.over) {
        this.turn++;
        if (this.turn > this.maxTurns) { await this.win(null, 'Tur sınırı'); break; }
        await this.playTurn();
        if (this.over) break;
        this.active = other(this.active);
      }
      return { winner: this.winner, reason: this.reason };
    }

    async setPhase(name) {
      this.phase = name;
      await this.ev('phase', { phase: name, p: this.active });
    }

    async playTurn() {
      const p = this.active;
      const P = this.P(p);
      P.summoned = false; P.extraNS = 0; this.skipToEnd = false;
      this.lpPrev = this.lpPrev || [0, 0]; this.lpPaid = this.lpPaid || [0, 0]; this.lpPrev[p] = this.lpPaid[p]; this.lpPaid[p] = 0; // Life Absorbing Machine
      this.flags.waboku = [false, false];
      for (const c of P.mz) if (c) { c.attacked = false; c.moved = false; c.atkCount = 0; c.hit = null; }
      await this.ev('turn', { p, turn: this.turn });

      await this.setPhase('draw');
      if (this.turn > 1) {
        if (this.flags.skipDraw[p] > 0) this.flags.skipDraw[p]--; // Offerings to the Doomed / Time Seal
        else { this.normalDraw = true; try { await this.draw(p, 1); } finally { this.normalDraw = false; } }
      }
      if (this.over) return;
      await this.setPhase('standby');
      if ((this.flags.skipStandby || [])[p] === true) this.flags.skipStandby[p] = false; // Solomon's Lawbook
      else await this.hook('standby', p);
      // Dimensionhole / Different Dimension Capsule / Lightforce Sword: bekleyen geri dönüşler
      for (const r of [...(this.pendingReturn || [])]) {
        if (r.p !== p || this.over) continue;
        if (--r.n > 0) continue;
        this.pendingReturn.splice(this.pendingReturn.indexOf(r), 1);
        await r.fn(this);
      }
      if (this.over) return;

      await this.setPhase('main1');
      let next = 'battle';
      if ((this.flags.skipMain1 || [])[p] === true) this.flags.skipMain1[p] = false; // Timeater: Main Phase 1 atlanır
      else next = await this.phaseLoop('main1');
      if (next === 'battle' && (this.flags.skipBattle || [])[p] === true) { this.flags.skipBattle[p] = false; next = 'end'; } // Frozen Soul
      if (this.over) return;
      if (next === 'battle') {
        await this.setPhase('battle');
        this.bpAttacked = new Set(); this.endBattle = false;
        await this.trapWindow('phase', { phase: 'battle', stop: false }, other(p)); // rakip Battle Phase başında karşılık verebilir
        if (this.over) return;
        next = await this.phaseLoop('battle');
        if (this.over) return;
        await this.notify('onBattleEnd', p); // Sword Hunter
        if (this.over) return;
        if (next === 'main2') {
          await this.setPhase('main2');
          next = await this.phaseLoop('main2');
          if (this.over) return;
        }
      }
      await this.setPhase('end');
      await this.trapWindow('phase', { phase: 'end', stop: false }, other(p));
      if (this.over) return;
      await this.endTurn();
    }

    // Faz içinde kontrolcüden aksiyon alır. Sonraki fazı döndürür.
    async phaseLoop(name) {
      const p = this.active;
      const ctl = this.ctl[p];
      while (!this.over) {
        if (this.skipToEnd) return 'end'; // Neko Mane King: tur hemen End Phase olur
        if (this.endBattle && name === 'battle') { this.endBattle = false; return 'end'; } // Negate Attack: Battle Phase biter
        const a = await ctl.act(this, p);
        if (!a || a.type === 'end') return 'end';
        if (a.type === 'phase') {
          if (!NEXT_OK[name].includes(a.to)) { if (ctl.error) ctl.error('Bu fazdan oraya geçilemez'); continue; }
          if (a.to === 'battle' && this.turn === 1) { if (ctl.error) ctl.error('İlk turda Battle Phase yok'); continue; }
          return a.to;
        }
        const r = await this.perform(p, a);
        if (r && r.error && ctl.error) ctl.error(r.error);
      }
      return 'end';
    }

    async endTurn() {
      const p = this.active;
      const P = this.P(p);
      await this.hook('endPhase', p);
      const eq = this.endQueue || []; this.endQueue = []; // "End Phase'de ..." efektleri (Gilford)
      for (const fn of eq) { if (!this.over) await fn(); }
      for (const r of [...(this.endWatch || [])]) { // sonraki End Phase'de çalışan beklemeler (Sinister Serpent)
        if (this.over || r.p !== p || this.turn <= r.after) continue;
        this.endWatch.splice(this.endWatch.indexOf(r), 1); await r.fn(this);
      }
      const keepSpirit = this.allField().some(x => x.up && this.fx(x) && this.fx(x).keepSpirits);
      for (const c of [...P.mz]) { // Spirit canavarlar çağrıldıkları tur sonunda ele döner
        const sfx = c && this.fx(c);
        if (sfx && sfx.spirit && c.up && c.placedTurn === this.turn && this.inMZ(c) && !keepSpirit) await this.bounce(c);
      }
      await this.returnLoans();
      this.clearTemps();
      for (const m of (this.flags.limiter || [])) if (this.inMZ(m)) await this.destroy(m); // Limiter Removal
      this.flags.limiter = [];
      if (this.over) return;
      for (const c of this.P(other(p)).st) {
        if (c && c.up && c.counter > 0) {
          c.counter--;
          if (c.counter === 0) await this.sendToGrave(c, 'expire');
        }
      }
      const noLimit = this.allField().some(x => x.up && FX[x.d.name] && FX[x.d.name].noHandLimit);
      let limitNow = (this.flags.handLimit && this.flags.handLimit[p] > 0) ? this.flags.handLimit[p] : RULES.HAND_LIMIT; // Hieroglyph Lithograph: 7
      if (this.allField().some(x => x.up && x.owner !== p && FX[x.d.name] && FX[x.d.name].limitOppHand)) limitNow = Math.min(limitNow, 5); // Enervating Mist
      while (!noLimit && P.hand.length > limitNow) {
        const c = await this.ctl[p].pick(this, p, P.hand.map(card => ({ card })), 'Elde fazla kart: atılacak kartı seç', 'discard');
        await this.sendToGrave(c || P.hand[P.hand.length - 1], 'discard');
      }
      await this.ev('endTurn', { p });
    }

    // ---------- Aksiyon denetimleri ----------
    inMain() { return this.phase === 'main1' || this.phase === 'main2'; }

    canSummon(p, hi) {
      const P = this.P(p);
      const c = P.hand[hi];
      if (!c || c.d.kind !== 'monster') return { ok: false, err: 'Canavar değil' };
      if (!this.inMain()) return { ok: false, err: 'Sadece Main Phase\'de' };
      if (/Ritual/.test(c.d.type)) return { ok: false, err: 'Ritual canavar yalnızca Ritual Büyüsü ile çağrılır' };
      if (P.summoned && !(P.extraNS > 0)) return { ok: false, err: 'Bu tur zaten Normal Summon / Set yaptın' };
      if (this.summonBlocked()) return { ok: false, err: 'Canavar çağrılamaz (The Last Warrior from Another Planet)' };
      const sfx = this.fx(c);
      if (sfx && sfx.handSummon && !sfx.alsoNormal) return { ok: false, err: 'Normal çağrılamaz (Özel Çağır kullan)' };
      if (sfx && sfx.summonReq) { const e = sfx.summonReq(this, p, c); if (e) return { ok: false, err: e }; }
      const sr = this.summonRestricted(p, c, 'normal'); if (sr) return { ok: false, err: sr };
      const need = this.tribNeed(p, c);
      if (need > 0 && this.noTribute()) return { ok: false, err: 'Mask of Restrict: tribute edilemez', need };
      const avail = P.mz.reduce((s, t) => s + (t && !this.noTribute(t) ? this.tribVal(c, t) : 0), 0);
      if (avail < need) return { ok: false, err: `${need} tribute gerekir`, need };
      if (need === 0 && this.freeZone(p, 'mz') < 0) return { ok: false, err: 'Canavar bölgesi dolu', need };
      return { ok: true, need };
    }

    // Cost Down: bu tur eldeki canavarların Level'i 2 azalır
    effLevel(c) { return Math.max(1, (c.d.level || 0) - ((this.flags.costDown && this.flags.costDown[c.owner] === this.turn) ? 2 : 0)); }
    isQuickSpell(c) { return !!(c && c.d.kind === 'spell' && c.d.race === 'Quick-Play'); }

    canActivateFromHand(p, hi) {
      const c = this.P(p).hand[hi];
      if (!c || c.d.kind !== 'spell') return false;
      if (!this.inMain() && !(this.phase === 'battle' && this.isQuickSpell(c))) return false; // Quick-Play: Battle Phase'de de
      const fx = this.fx(c);
      if (!fx) return false;
      if (this.allField().some(x => x.up && this.fx(x) && (this.fx(x).sealSpells || this.fx(x).noHandSpell))) return false; // Talisman of Spell Sealing / Anti-Spell Fragrance
      if (this.summonRestricted(p, c, 'spell')) return false; // Prohibition
      if (fx.sub !== 'field' && this.freeZone(p, 'st') < 0) return false;
      return !fx.can || !!fx.can(this, p, c);
    }

    canSetST(p, hi) {
      const c = this.P(p).hand[hi];
      if (!c || c.d.kind === 'monster' || !this.inMain()) return false;
      if (this.fx(c) && this.fx(c).noSet) return false; // Spirit Message: yalnızca Destiny Board koyabilir
      return isFieldSpell(c) ? !this.P(p).field : this.freeZone(p, 'st') >= 0;
    }

    canAttack(p, zi) {
      const c = this.P(p).mz[zi];
      if (!c) return { ok: false, err: 'Canavar yok' };
      if (this.phase !== 'battle') return { ok: false, err: 'Sadece Battle Phase\'de' };
      if (!c.up || c.pos !== 'atk') return { ok: false, err: 'Saldıran canavar saldırı pozisyonunda olmalı' };
      if (c.attacked) return { ok: false, err: 'Bu canavar zaten saldırdı' };
      if (this.P(other(p)).st.some(s => s && s.up && s.d.name === 'Swords of Revealing Light')) {
        return { ok: false, err: 'Swords of Revealing Light: saldıramazsın' };
      }
      const afx = this.fx(c);
      if (c.cantAttackTurn === this.turn) return { ok: false, err: 'Bu tur saldıramaz' };
      if (this.flags.noAttackTurn && this.flags.noAttackTurn[p] === this.turn) return { ok: false, err: 'Bu tur saldırı ilan edemezsin (Teva)' };
      if (afx && afx.canAttack) { const e = afx.canAttack(this, p, c); if (e) return { ok: false, err: e }; }
      for (const f of this.allField()) {
        if (!f.up) continue;
        const fx = this.fx(f);
        if (fx && fx.restrictAttack) { const e = fx.restrictAttack(this, c, f); if (e) return { ok: false, err: e }; }
      }
      return { ok: true };
    }

    // Rakibin canavarı olsa da direkt saldırabilir mi?
    canDirect(p, c) {
      if (this.flags.noDirect && this.flags.noDirect[c.owner] === this.turn && !/^Blue-Eyes/.test(c.d.name)) return false; // BEWD White Phantom Beast
      const fx = this.fx(c);
      if (fx && fx.noDirectAtk) return false; // Zombyra the Dark
      if (c.directTurn === this.turn || (this.flags.directAll && this.flags.directAll[c.owner] === this.turn)) return true; // Secret Pass / Gear Golem / Absolute End
      if (!this.P(other(p)).mz.some(Boolean)) return true;
      const dd = fx && fx.direct;
      if (this.equipFlag(c, 'givesDirect')) return true;
      return typeof dd === 'function' ? !!dd(this, p, c) : !!dd;
    }

    // Eldeki "yalnızca özel çağrılan" canavar (Toon vb.)
    canHandSummon(p, hi) {
      const P = this.P(p);
      const c = P.hand[hi];
      const fx = c && this.fx(c);
      if (!c || !fx || !fx.handSummon) return { ok: false, err: 'Özel çağrılamaz' };
      if (!this.inMain()) return { ok: false, err: 'Sadece Main Phase\'de' };
      if (this.summonBlocked()) return { ok: false, err: 'Canavar çağrılamaz (The Last Warrior from Another Planet)' };
      const hs = fx.handSummon;
      const need = hs.tributes || 0;
      if (hs.can) { const e = hs.can(this, p, c); if (e) return { ok: false, err: e, need }; }
      const sr = this.summonRestricted(p, c, 'special'); if (sr) return { ok: false, err: sr, need };
      const tgt = hs.opp ? other(p) : p; // Lava Golem: rakibin sahasına çağrılır
      if (P.mz.filter(Boolean).length < need) return { ok: false, err: `${need} tribute gerekir`, need };
      if (need === 0 && !hs.opp && !hs.costFrees && this.freeZone(tgt, 'mz') < 0) return { ok: false, err: 'Canavar bölgesi dolu', need };
      return { ok: true, need };
    }

    // Elden kullanılan canavar efekti (Thunder Dragon: at → desteden al; Phara: Büyü/Tuzak göster). fx.handEffect {label, can, resolve, ai}
    canHandEffect(p, hi) {
      const c = this.P(p).hand[hi];
      const he = c && c.d.kind === 'monster' && this.fx(c) && this.fx(c).handEffect;
      if (!he) return { ok: false, err: 'Elde kullanılacak efekt yok' };
      if (!this.inMain()) return { ok: false, err: 'Sadece Main Phase\'de' };
      if (c.heTurn === this.turn) return { ok: false, err: 'Bu tur zaten kullanıldı' };
      if (he.can && !he.can(this, p, c)) return { ok: false, err: 'Şartlar sağlanmıyor' };
      return { ok: true };
    }
    async doHandEffect(p, hi) {
      const chk = this.canHandEffect(p, hi);
      if (!chk.ok) return { error: chk.err };
      const c = this.P(p).hand[hi];
      const he = this.fx(c).handEffect;
      c.heTurn = this.turn;
      await this.ev('ability', { p, card: c });
      this.src = { p, kind: 'monster', card: c };
      let r;
      try { r = await he.resolve(this, p, c); }
      catch (e) { if (!(e instanceof Negated)) throw e; }
      finally { this.src = null; await this.flushTargets(); }
      if (r === false) { c.heTurn = -1; return { error: 'Hedef yok / iptal' }; }
      await this.checkWin();
      return { ok: true };
    }

    // Canavarın manuel yeteneği (Main Phase, turda bir kez)
    canAbility(p, zi) {
      const c = this.P(p).mz[zi];
      const ab = c && this.fx(c) && this.fx(c).ability;
      if (!c || !c.up || !ab) return { ok: false, err: 'Yetenek yok' };
      if (c.mutedTurn === this.turn) return { ok: false, err: 'Bu tur efekti kullanılamaz' };
      const phaseOk = ab.battleOnly ? this.phase === 'battle' : (this.inMain() || (ab.battle && this.phase === 'battle'));
      if (!phaseOk) return { ok: false, err: ab.battleOnly ? 'Sadece Battle Phase\'de' : 'Şu an kullanılamaz' };
      const times = typeof ab.times === 'function' ? ab.times(this, c) : (ab.times || 1);
      if (c.abilityTurn === this.turn && (c.abilityN || 1) >= times) return { ok: false, err: 'Bu tur zaten kullanıldı' };
      if (ab.can && !ab.can(this, p, c)) return { ok: false, err: 'Şartlar sağlanmıyor' };
      return { ok: true };
    }

    // ---------- Aksiyonlar ----------
    async perform(p, a) {
      const P = this.P(p);
      if (a.type === 'attack') {
        if (this.phase !== 'battle') return { error: 'Saldırı için Battle Phase gerekir' };
        return this.doAttack(p, a.zone, a.target);
      }
      // Battle Phase'de yalnızca yetenekler ve Quick-Play Büyüler (elden ya da set) kullanılabilir
      const qpNow = a.type === 'activate' && this.phase === 'battle' && ((a.hand != null && this.isQuickSpell(P.hand[a.hand])) || (a.st != null && this.isQuickSpell(P.st[a.st])));
      if (!this.inMain() && !(a.type === 'ability' && this.phase === 'battle') && !qpNow) return { error: 'Bu hamle sadece Main Phase\'de yapılır' };
      switch (a.type) {
        case 'summon': return this.doSummon(p, a.hand, a.zone, a.tributes || [], false);
        case 'set': {
          const c = P.hand[a.hand];
          if (!c) return { error: 'Kart yok' };
          if (c.d.kind === 'monster') return this.doSummon(p, a.hand, a.zone, a.tributes || [], true);
          return this.doSetST(p, a.hand, a.zone);
        }
        case 'activate': return this.doActivate(p, a);
        case 'hsummon': return this.doHandSummon(p, a.hand, a.tributes || []);
        case 'ability': return this.doAbility(p, a.zone);
        case 'stability': return this.doStAbility(p, a.field ? 'field' : 'st', a.st, a.i || 0);
        case 'heffect': return this.doHandEffect(p, a.hand);
        case 'pos': return this.doPos(p, a.zone);
        default: return { error: 'Bilinmeyen aksiyon' };
      }
    }

    async doSummon(p, hi, zi, tributes, set) {
      const P = this.P(p);
      const chk = this.canSummon(p, hi);
      if (!chk.ok) return { error: chk.err };
      const c = P.hand[hi];
      const sfx0 = this.fx(c);
      const need = this.tribNeed(p, c);
      const soul = need < tributesNeeded(this.effLevel(c)) && !(sfx0 && sfx0.freeTribute && sfx0.freeTribute(this, p, c)) ? this.soulTarget(p) : null; // Soul Exchange
      c.freeTrib = need === 0 && !soul && tributesNeeded(this.effLevel(c)) > 0;
      let sum = 0;
      for (const t of tributes) { if (!P.mz[t]) return { error: 'Geçersiz tribute' }; if (this.noTribute(P.mz[t])) return { error: 'Bu canavar tribute edilemez' }; sum += this.tribVal(c, P.mz[t]); }
      if (sum < need || tributes.length > need) return { error: `${need} tribute seçmelisin` };
      if (!(await this.payHandCost(p))) return { error: 'Chain Energy: LP yetmiyor' };
      const trCards = tributes.map(t => P.mz[t]);
      if (soul) trCards.push(soul);
      for (const t of trCards) await this.sendToGrave(t, 'tribute');
      zi = this.freeZone(p, 'mz');
      if (zi < 0) return { error: 'Boş bölge yok' };
      const forceDef = set && this.allField().some(x => x.up && this.fx(x) && this.fx(x).noSetMon); // Light of Intervention: Set yerine açık savunmada Normal Summon
      if (forceDef) set = false;
      P.hand.splice(P.hand.indexOf(c), 1);
      P.mz[zi] = c;
      c.up = !set; c.pos = (set || forceDef) ? 'def' : 'atk'; c.placedTurn = this.turn; c.attacked = false; c.moved = false; c.tribSum = trCards.length > 0 && !set; c.special = false;
      if (P.summoned) P.extraNS--; // Ultimate Offering ile ek çağırma
      P.summoned = true;
      await this.ev(set ? 'set' : 'summon', { p, card: c, zone: zi });
      c.tributed = trCards.map(t => ({ d: t.d, owner: t.owner }));
      await this.notify('onNormalSet', p, c, set);
      for (const w of [...(this.watch || [])]) if (!set && (await w(this, 'normalSummon', p, c))) this.watch.splice(this.watch.indexOf(w), 1); // Dora of Fate
      if (!set) {
        const fx = this.fx(c);
        if (fx && fx.onSummon) await fx.onSummon(this, p, c);
        for (const t of trCards) { const tf = FX[t.d.name]; if (tf && tf.onTributed) await tf.onTributed(this, p, t, c); }
        if (need >= 2) await this.notify('onBigTribute', c, need);
        await this.notify('onAnySummon', c);
        // Eagle Eye / Invasion of Flames vb.: "Normal Summon edilince Tuzak aktive edilemez"
        await this.trapWindow('summon', { monster: c, summoner: p, stop: !!(fx && fx.stopTraps) }, other(p));
      }
      return { ok: true };
    }

    async doHandSummon(p, hi, tributes) {
      const P = this.P(p);
      const chk = this.canHandSummon(p, hi);
      if (!chk.ok) return { error: chk.err };
      const c = P.hand[hi];
      const fx = this.fx(c);
      if (tributes.length !== chk.need) return { error: `${chk.need} tribute seçmelisin` };
      for (const t of tributes) if (!P.mz[t]) return { error: 'Geçersiz tribute' };
      const trCards = tributes.map(t => P.mz[t]);
      if (!(await this.payHandCost(p))) return { error: 'Chain Energy: LP yetmiyor' };
      if (fx.handSummon.cost && (await fx.handSummon.cost(this, p, c, trCards)) === false) return { error: 'Maliyet ödenemedi / geçersiz tribute' };
      for (const t of trCards) await this.sendToGrave(t, 'tribute');
      const tgt = fx.handSummon.opp ? other(p) : p;
      if (this.freeZone(tgt, 'mz') < 0) return { error: 'Boş bölge yok' };
      await this.specialSummon(tgt, c);
      return { ok: true };
    }

    // Sahadaki Büyü/Tuzak/Union kartının manuel yeteneği (Union çöz, Pitch-Black Power Stone, Ultimate Offering, Fusion Gate...). fx.stAb: [{label, can, resolve, ai}]
    canStAbility(p, kind, zi, i = 0) {
      const c = kind === 'field' ? this.P(p).field : this.P(p).st[zi];
      const ab = c && c.up && this.fx(c) && this.fx(c).stAb && this.fx(c).stAb[i];
      if (!ab) return { ok: false, err: 'Yetenek yok' };
      if (this.cardNegated(c)) return { ok: false, err: 'Bu kartın efekti iptal edildi' };
      const key = 'sa' + i;
      if (!ab.multi && c[key] === this.turn) return { ok: false, err: 'Bu tur zaten kullanıldı' };
      if (!(ab.battle ? (this.inMain() || this.phase === 'battle') : this.inMain())) return { ok: false, err: 'Şu an kullanılamaz' };
      if (ab.can && !ab.can(this, p, c)) return { ok: false, err: 'Şartlar sağlanmıyor' };
      return { ok: true };
    }
    async doStAbility(p, kind, zi, i = 0) {
      const chk = this.canStAbility(p, kind, zi, i);
      if (!chk.ok) return { error: chk.err };
      const c = kind === 'field' ? this.P(p).field : this.P(p).st[zi];
      const ab = this.fx(c).stAb[i];
      const prev = c['sa' + i];
      c['sa' + i] = this.turn;
      await this.ev('ability', { p, card: c });
      if (await this.negationWindow(c, p)) return { ok: true };
      this.src = { p, kind: c.d.kind === 'monster' ? 'monster' : c.d.kind, card: c };
      let r;
      try { r = await ab.resolve(this, p, c); } catch (e) { if (!(e instanceof Negated)) throw e; } finally { this.src = null; await this.flushTargets(); }
      if (r === false) { c['sa' + i] = prev; return { error: 'Hedef yok / iptal' }; }
      await this.checkWin();
      return { ok: true };
    }

    async doAbility(p, zi) {
      const chk = this.canAbility(p, zi);
      if (!chk.ok) return { error: chk.err };
      const c = this.P(p).mz[zi];
      const ab = this.fx(c).ability;
      const prevTurn = c.abilityTurn, prevN = c.abilityN;
      c.abilityN = c.abilityTurn === this.turn ? (c.abilityN || 1) + 1 : 1;
      c.abilityTurn = this.turn;
      await this.ev('ability', { p, card: c });
      if (await this.negationWindow(c, p)) return { ok: true }; // efekt iptal edildi (kullanım hakkı harcandı)
      const ectx = { card: c, activator: p, negated: false, stop: false };
      await this.trapWindow('effect', ectx, other(p)); // rakibin Quick efektleri / tuzakları karşılık verebilir
      if (this.over || ectx.negated) return { ok: true };
      let r;
      this.src = { p, kind: 'monster', card: c };
      try { r = await ab.resolve(this, p, c); }
      catch (e) { if (!(e instanceof Negated)) throw e; }
      finally { this.src = null; await this.flushTargets(); }
      if (r === false) { c.abilityTurn = prevTurn; c.abilityN = prevN; return { error: 'Hedef yok / iptal' }; }
      await this.checkWin();
      return { ok: true };
    }

    async doSetST(p, hi) {
      const P = this.P(p);
      const c = P.hand[hi];
      if (!c || c.d.kind === 'monster') return { error: 'Büyü/Tuzak değil' };
      if (!this.canSetST(p, hi)) return { error: isFieldSpell(c) ? 'Saha bölgesi dolu' : 'Büyü/Tuzak bölgesi dolu' };
      if (!(await this.payHandCost(p))) return { error: 'Chain Energy: LP yetmiyor' };
      P.hand.splice(hi, 1);
      if (isFieldSpell(c)) { P.field = c; }
      else P.st[this.freeZone(p, 'st')] = c;
      c.up = false; c.placedTurn = this.turn;
      await this.ev('setST', { p, card: c });
      return { ok: true };
    }

    // a: {hand} | {st} | {field:true}
    async doActivate(p, a) {
      const P = this.P(p);
      let c, fromHand = false;
      if (a.hand != null) {
        c = P.hand[a.hand];
        if (!c || c.d.kind !== 'spell') return { error: 'Büyü değil' };
        if (!this.canActivateFromHand(p, a.hand)) return { error: 'Şu an aktive edilemez' };
        if (!(await this.payHandCost(p))) return { error: 'Chain Energy: LP yetmiyor' };
        if (c.lent === this.turn) await this.damage(p, 2000); // Graverobber: ödünç alınan Büyü
        fromHand = true;
        const fx = this.fx(c);
        P.hand.splice(a.hand, 1);
        if (fx.sub === 'field') {
          if (P.field) await this.sendToGrave(P.field, 'replace');
          P.field = c;
        } else P.st[this.freeZone(p, 'st')] = c;
      } else {
        c = a.field ? P.field : P.st[a.st];
        if (!c || c.up) return { error: 'Aktive edilemez' };
        const fx0 = this.fx(c);
        if (c.d.kind === 'trap') { // elle aktive edilen tuzaklar (Call of the Haunted, Gravity Bind...)
          if (!fx0 || !fx0.manual) return { error: 'Bu tuzak rakip hamlesine karşı otomatik tetiklenir' };
          if (c.placedTurn >= this.turn) return { error: 'Tuzak, set edildiği tur aktive edilemez' };
          if (this.trapsNegated(p)) return { error: 'Jinzo: Tuzaklar aktive edilemez' };
          if (this.allField().some(x => x.up && this.fx(x) && this.fx(x).sealTraps)) return { error: 'Talisman of Trap Sealing: Tuzaklar aktive edilemez' };
          if (this.sealedST(c)) return { error: 'Xing Zhen Hu: bu kart aktive edilemez' };
        } else if (c.d.kind !== 'spell') { return { error: 'Aktive edilemez' }; }
        else if (this.allField().some(x => x.up && this.fx(x) && this.fx(x).sealSpells)) { return { error: 'Talisman of Spell Sealing: Büyüler aktive edilemez' }; }
        else if (this.sealedST(c)) { return { error: 'Xing Zhen Hu: bu kart aktive edilemez' }; }
        else if (this.allField().some(x => x.up && this.fx(x) && this.fx(x).noHandSpell) && c.placedTurn >= this.turn && c.d.kind === 'spell') { return { error: 'Anti-Spell Fragrance: Büyü set edildiği tur aktive edilemez' }; }
        else if (this.isQuickSpell(c) && this.allField().some(x => x.up && x.owner !== p && FX[x.d.name] && FX[x.d.name].lockQuick)) { return { error: 'Invader of Darkness: Quick-Play Büyü aktive edilemez' }; }
        else if (this.isQuickSpell(c) && c.placedTurn >= this.turn) { return { error: 'Quick-Play Büyü, set edildiği tur aktive edilemez (elden aktive edebilirsin)' }; }
        if (!fx0 || (fx0.can && !fx0.can(this, p, c))) return { error: 'Şu an aktive edilemez' };
      }
      const fx = this.fx(c);
      c.up = true; c.placedTurn = this.turn;
      await this.ev(c.d.kind === 'trap' ? 'trap' : 'activate', { p, card: c, zone: a.st });
      const persistent = fx.sub === 'equip' || fx.sub === 'field' || fx.sub === 'continuous';
      if (c.d.kind === 'spell' && ((this.flags.noSpell || [])[p] >= this.turn || this.allField().some(x => x !== c && x.up && FX[x.d.name] && FX[x.d.name].negateSpells && !this.negatedMon(x)))) { // Spell Canceller / Imperial Order
        if (this.onField(c)) await this.sendToGrave(c, 'negated');
        return { ok: true };
      }
      if (c.d.kind === 'spell' && fx.sub !== 'field') { // rakibin "Büyü aktive edilince" tuzakları (Magic Jammer...)
        const sctx = { spell: c, activator: p, negated: false, stop: false };
        await this.trapWindow('spell', sctx, other(p));
        if (sctx.negated) { if (this.onField(c)) await this.sendToGrave(c, 'negated'); return { ok: true }; }
        if (this.over) return { ok: true };
        if (await this.negationWindow(c, p)) { if (this.onField(c)) await this.sendToGrave(c, 'negated'); return { ok: true }; }
      }
      if (c.d.kind === 'spell' && fx.sub === 'field') await this.trapWindow('fieldAct', { card: c, activator: p, stop: false }, other(p)); // World Suppression
      if (c.d.kind === 'spell' && c.d.race === 'Normal' && !persistent && !this.over) await this.trapWindow('ownSpell', { spell: c, activator: p, stop: false, text: 'Normal Büyü aktive ettin' }, p); // Serial Spell: kendi Normal Büyüne karşılık
      if (c.d.kind === 'trap') { // elle aktive edilen tuzak: Counter Trap / A-Team iptal penceresi, Royal Decree
        await this.notify('onTrapActivate', p, c);
        if (fx.sub === 'continuous') await this.trapWindow('trapAct', { card: c, activator: p, stop: false }, other(p)); // Metal Detector
        const roy = this.allField().some(x => x !== c && x.up && FX[x.d.name] && FX[x.d.name].negateOtherTraps);
        if (roy || (await this.negationWindow(c, p))) { if (this.onField(c)) await this.sendToGrave(c, 'negated'); return { ok: true }; }
      }
      let ok;
      this.src = { p, kind: c.d.kind, card: c };
      try { ok = fx.resolve ? await fx.resolve(this, p, c) : undefined; } // sürekli kartlar: efekt kancalarla çalışır, çözümü yok
      catch (e) { if (!(e instanceof Negated)) throw e; ok = true; }
      finally { this.src = null; await this.flushTargets(); }
      if (ok === false) {
        // iptal: kartı eski haline döndür
        if (fromHand) { this.removeFromWherever(c); P.hand.push(c); c.up = true; }
        else c.up = false;
        return { error: 'Hedef yok / iptal' };
      }
      if (!this.over) await this.notify(c.d.kind === 'trap' ? 'onTrapResolved' : 'onSpellResolved', p, c);
      if (!persistent && this.onField(c)) await this.sendToGrave(c, 'spell');
      await this.checkWin();
      return { ok: true };
    }

    async doPos(p, zi) {
      const c = this.P(p).mz[zi];
      if (!c) return { error: 'Canavar yok' };
      if (c.moved) return { error: 'Bu tur zaten pozisyon değiştirdi' };
      if (c.attacked) return { error: 'Saldıran canavar pozisyon değiştiremez' };
      if (c.placedTurn === this.turn && !c.up) return { error: 'Bu tur set edilen canavar çevrilemez' };
      if (this.flags.noPos && this.flags.noPos[p] === this.turn) return { error: 'Bu tur pozisyon değiştiremezsin (Mesmeric Control)' };
      for (const f of this.allField()) { // Thousand-Eyes Restrict: diğer canavarlar pozisyon değiştiremez
        const rp = f.up && this.fx(f) && this.fx(f).restrictPos;
        const e = rp && rp(this, c, f); if (e) return { error: e };
      }
      c.moved = true;
      if (!c.up) {
        c.up = true; c.pos = 'atk';
        await this.ev('flipSummon', { p, card: c });
        const fx = this.fx(c);
        if (fx && fx.onFlip && !this.flipNegated()) await fx.onFlip(this, p, c);
        await this.notify('onFlipSummon', c);
        await this.notify('onFlip', c);
        await this.trapWindow('summon', { monster: c, summoner: p, stop: false }, other(p));
      } else {
        const from = c.pos;
        c.pos = c.pos === 'atk' ? 'def' : 'atk';
        if (from === 'atk') await this.trapWindow('pos', { card: c, owner: p, stop: false }, other(p)); // Tragedy
        await this.ev('pos', { p, card: c });
        const pfx = this.fx(c);
        if (pfx && pfx.onPos && !this.over) await pfx.onPos(this, p, c, from, c.pos);
      }
      return { ok: true };
    }

    // Tur sonuna kadar geçerli ATK/DEF değişimi
    addTemp(c, atk, def = 0) {
      c.bonus.atk += atk; c.bonus.def += def;
      (this.temps = this.temps || []).push({ c, atk, def });
    }
    clearTemps() {
      for (const t of (this.temps || [])) { t.c.bonus.atk -= t.atk; t.c.bonus.def -= t.def; }
      this.temps = [];
    }
    // Ekipman kartından gelen yetenek (piercing / direkt saldırı)
    equipFlag(c, flag) {
      return !this.equipNeg() && this.allField().some(f => f.up && f.equipTo === c.uid && this.fx(f) && this.fx(f)[flag]);
    }

    async doAttack(p, zi, target) {
      const atk0 = this.P(p).mz[zi];
      let r;
      try { r = await this._doAttack(p, zi, target); } finally { this.battle = null; }
      const fx = atk0 && this.fx(atk0);
      if (r && r.ok && fx && fx.afterAttack && this.inMZ(atk0) && !this.over) await fx.afterAttack(this, p, atk0);
      return r;
    }

    async _doAttack(p, zi, target) {
      const chk = this.canAttack(p, zi);
      if (!chk.ok) return { error: chk.err };
      const atker = this.P(p).mz[zi];
      const q = other(p);
      const O = this.P(q);
      let defender = null;
      if (target === 'direct') {
        if (!this.canDirect(p, atker)) return { error: 'Rakibin canavarı varken direkt saldırı yok' };
      } else {
        defender = O.mz[target];
        if (!defender) return { error: 'Hedef yok' };
        const tr = this.targetRestricted(atker, defender);
        if (tr) return { error: tr };
      }
      const afx = this.fx(atker);
      if (this.flags.forceTarget && this.flags.forceTarget.turn === this.turn && this.flags.forceTarget.q === q && this.onField(this.flags.forceTarget.c) && (!defender || defender !== this.flags.forceTarget.c)) return { error: 'Zorunlu hedef: yalnızca seçilen canavara saldırılabilir' }; // Taunt / Staunch Defender
      const pat = this.allField().find(x => x.up && x.owner === q && this.fx(x) && this.fx(x).chooseAttackTarget && !this.negatedMon(x)); // Patrician of Darkness
      if (pat && O.mz.some(Boolean) && defender !== null) {
        const cands = O.mz.filter(Boolean);
        const ch = cands.length > 1 ? await this.ctl[q].pick(this, q, cands.map(card => ({ card })), 'Patrician of Darkness: saldırının hedefini sen seç', 'help') : cands[0];
        if (ch) defender = ch;
      }
      if (defender && !defender.up && this.flags.noFD === this.turn) return { error: 'A Feint Plan: kapalı canavara saldırılamaz' };
      atker.battledTurn = this.turn; if (defender) defender.battledTurn = this.turn;
      const allAtk = !!(afx && afx.attackAll) || atker.attackAllTurn === this.turn;
      if (allAtk && defender && atker.hit && atker.hit.has(defender.uid)) return { error: 'Bu canavara bu tur zaten saldırdı' };
      atker.atkCount = (atker.atkCount || 0) + 1;
      const mA = afx && afx.multiAttack;
      atker.attacked = atker.atkCount >= Math.max((typeof mA === 'function' ? mA(this, atker) : mA) || 1, atker.multiTurn === this.turn || this.equipFlag(atker, 'givesDouble') ? 2 : 1);
      if (allAtk && defender) { // Dark Paladin - Wave-Motion / Diffusion Wave-Motion: her rakip canavara bir kez saldırabilir
        (atker.hit = atker.hit || new Set()).add(defender.uid);
        atker.attacked = !O.mz.some(m => m && !atker.hit.has(m.uid));
      }
      if (afx && afx.attackCost) {
        if (!(await afx.attackCost(this, p, atker))) { atker.attacked = false; atker.atkCount--; return { error: 'Maliyet ödenemedi' }; }
      }
      for (const f of this.allField()) { // Toll / Gravekeeper's Servant: saldırı bedeli
        const tf = f.up && FX[f.d.name] && FX[f.d.name].attackToll;
        if (tf && !this.negatedMon(f) && !(await tf(this, f.owner, atker, p))) { atker.attacked = false; atker.atkCount--; return { error: 'Saldırı bedeli ödenemedi' }; }
      }
      (this.bpAttacked = this.bpAttacked || new Set()).add(atker.uid);
      if (defender) { // saldırı yönlendirme: Astral Barrier (direkt yap), Dreamsprite / Jam Defender (başka canavara çevir)
        for (const f of [...this.allField()]) {
          const rf = f.up && f.owner === q && this.fx(f) && this.fx(f).redirectAttack;
          if (!rf || this.cardNegated(f) || this.negatedMon(f) || !this.inMZ(defender)) continue;
          const r = await rf(this, f, atker, defender);
          if (r === 'direct') { defender = null; break; }
          if (r && r !== defender && this.inMZ(r)) { defender = r; break; }
        }
      }
      if (defender) defender.battledTurn = this.turn;
      await this.ev('attack', { p, attacker: atker, target: defender || 'direct' });
      if (afx && afx.onDeclare && !this.over) await afx.onDeclare(this, p, atker, defender); // Gravekeeper's Assailant
      await this.notify('onAttackAny', atker, defender); // Mirror Wall
      const ctx = { attacker: atker, target: defender, negated: false, stop: false };
      await this.trapWindow('attack', ctx, q);
      if (this.over) return { ok: true };
      if (ctx.negated || !this.inMZ(atker)) return { ok: true };
      if (ctx.redirect && this.inMZ(ctx.redirect)) { defender = ctx.redirect; defender.battledTurn = this.turn; await this.ev('attack', { p, attacker: atker, target: defender }); } // Dark Spirit of the Silent / Shift
      if (defender && !this.inMZ(defender)) return { ok: true };

      this.battle = { a: atker, d: defender, direct: !defender };
      const dealt = async (target2, amt) => {
        const rodE = this.allField().find(f => f.up && f.equipTo === atker.uid && this.fx(f) && this.fx(f).fixedDmg != null && !this.equipNeg());
        if (rodE && amt > 0) amt = this.fx(rodE).fixedDmg; // Rod of the Mind's Eye
        if (afx && afx.dmgMult) amt = Math.floor(amt * afx.dmgMult(this, atker, !defender)); // Piranha Army...
        await this.damage(target2, amt, atker);
        if (amt > 0 && !this.over) await this.notify('onBattleDmg', atker, amt, target2, !defender);
        if (amt > 0 && afx && afx.onBattleDamage && !this.over && this.inMZ(atker)) await afx.onBattleDamage(this, p, atker, amt, target2, !defender);
      };
      if (!defender) { await dealt(q, this.atk(atker)); return { ok: true }; }
      if (!defender.up) {
        if (afx && afx.killsFacedown) { this.battle.fd = true; await this.destroy(defender, atker, 'battle'); await this.killHook(atker, defender); return { ok: true }; } // Mystic Swordsman / Sasuke Samurai
        const fdx = this.fx(defender);
        if (fdx && fdx.fdAttacked && !this.flipNegated() && (await fdx.fdAttacked(this, q, defender, atker))) return { ok: true }; // Kiseitai: hasar hesabı yapılmaz
        defender.up = true; this.battle.fd = true;
        await this.ev('flip', { p: q, card: defender });
        const dfx = this.fx(defender);
        if (dfx && dfx.onFlip && !this.flipNegated()) await dfx.onFlip(this, q, defender);
        await this.notify('onFlip', defender);
        if (this.over || !this.inMZ(atker) || !this.inMZ(defender)) return { ok: true };
      }
      await this.ev('impact', { attacker: atker, target: defender });
      this.battle.dpos = defender.pos; // savunmadaki canavar yok olunca pos sıfırlanır; Andro Sphinx / Teleia bu bilgiyi kullanır
      for (const [c0, o0, other0] of [[atker, p, defender], [defender, q, atker]]) { // Spirit Ryu: savaş sırasında Quick Effect
        const bb = this.fx(c0) && this.fx(c0).battleBoost;
        if (bb && c0.up && this.inMZ(c0) && !this.over) await bb(this, o0, c0, other0);
      }
      const waboku = this.flags.waboku[q];
      const A = this.atk(atker);
      if (defender.pos === 'atk') {
        const D = this.atk(defender);
        if (A > D) { if (!waboku) { await this.destroy(defender, atker, 'battle'); await dealt(q, A - D); await this.killHook(atker, defender); } }
        else if (A < D) { if (!this.flags.waboku[p]) { await this.destroy(atker, defender, 'battle'); await this.damage(p, (D - A) * ((this.fx(defender) && this.fx(defender).reflectMult) || 1), defender); await this.killHook(defender, atker); } }
        else if (!waboku) { // eşit ATK: ikisi de yok olur (Kishido Spirit sahibinin canavarını korur)
          const tieSafe = c => this.allField().some(x => x.up && x.owner === c.owner && FX[x.d.name] && FX[x.d.name].tieSafe);
          if (!tieSafe(atker)) await this.destroy(atker, defender, 'battle');
          if (!tieSafe(defender)) await this.destroy(defender, atker, 'battle');
        }
      } else {
        if (afx && afx.killsDefMin != null && this.def(defender) >= afx.killsDefMin) { await this.destroy(defender, atker, 'battle'); await this.killHook(atker, defender); return { ok: true }; } // Disc Fighter / Ninja Grandmaster Sasuke
        const D = this.def(defender);
        if (A > D) {
          if (!waboku) { await this.destroy(defender, atker, 'battle'); await this.killHook(atker, defender); if ((afx && afx.pierce) || this.equipFlag(atker, 'givesPierce') || (this.flags.pierceAll && this.flags.pierceAll[p] === this.turn) || this.allField().some(f => f.up && FX[f.d.name] && FX[f.d.name].pierceMod && FX[f.d.name].pierceMod(this, atker, f))) await dealt(q, A - D); }
        } else if (A < D) {
          if (!this.flags.waboku[p]) {
            await this.damage(p, (D - A) * ((this.fx(defender) && this.fx(defender).reflectMult) || 1), defender);
            const dwx = this.fx(defender); // Des Kangaroo: ATK'sı DEF'inden düşük saldıranı yok et
            if (dwx && dwx.defWin && this.inMZ(defender) && this.inMZ(atker) && !this.over) await dwx.defWin(this, q, defender, atker);
            if (this.inMZ(defender) && this.inMZ(atker) && !this.over) await this.notify('onDefWin', defender, atker); // Continuous Destruction Punch
          }
        }
      }
      // Savaş sonrası kancalar: afterDefended (saldırılan), afterBattle (iki taraf)
      if (defender && !this.over) {
        const dfx2 = this.fx(defender);
        if (dfx2 && dfx2.afterDefended && this.inMZ(defender) && this.inMZ(atker)) await dfx2.afterDefended(this, q, defender, atker);
        for (const [a1, b1] of [[atker, defender], [defender, atker]]) {
          const f1 = this.fx(a1);
          if (f1 && f1.afterBattle && this.inMZ(a1) && this.inMZ(b1) && !this.over) await f1.afterBattle(this, a1.owner, a1, b1);
        }
      }
      return { ok: true };
    }

    // Savaşta bir canavarı yok eden kartın onKill efekti
    async killHook(winner, victim) {
      if (this.over) return;
      const fx = this.fx(winner);
      if (fx && fx.onKill && this.inMZ(winner) && !this.inMZ(victim)) await fx.onKill(this, winner.owner, winner, victim);
      if (this.inMZ(winner) && !this.inMZ(victim)) await this.notify('onKillAny', winner, victim); // Union canavarlar (Des Dendle, Zombie Tiger)
    }

    // Tepki pencereleri: rakibin (owner) set tuzakları, set Quick-Play Büyüleri ve yüzü açık canavarlarının Quick efektleri.
    // trigger: 'attack' | 'summon' | 'spell' | 'effect' | 'phase' | 'damage'
    async trapWindow(trigger, ctx, owner) {
      const jinzo = this.trapsNegated(owner) || this.allField().some(x => x.up && this.fx(x) && this.fx(x).sealTraps);
      const noBp = this.phase === 'battle' && this.allField().some(x => x.up && x.owner !== owner && FX[x.d.name] && FX[x.d.name].noTrapsBattle && !this.negatedMon(x));
      const P = this.P(owner);
      const label = c2 => Object.assign({}, c2, { text: c2.text || (c2.phase ? `Rakibin ${c2.phase === 'battle' ? 'Battle' : 'End'} Phase'i` : c2.amount ? `${c2.amount} hasar alacaksın` : c2.card ? `${c2.card.d.name} efekti aktive edildi` : '') });
      const handTrap = (this.flags.trapHand || [])[owner] === this.turn; // Makyura the Destructor: elden Tuzak aktive edilebilir
      const slots = P.st.map((c, i) => ({ c, i, hand: false }));
      if (handTrap) for (const h of P.hand) if (h.d.kind === 'trap') slots.push({ c: h, i: -1, hand: true });
      for (const { c, i, hand } of slots) {
        if (this.over || ctx.stop) return;
        if (!c || (c.up && !hand)) continue;
        if (hand && !P.hand.includes(c)) continue;
        const isTrap = c.d.kind === 'trap', isQP = this.isQuickSpell(c);
        if (!isTrap && !isQP) continue;
        const fx = this.fx(c);
        if (!fx) continue;
        if (isTrap && (jinzo || noBp)) continue;
        if (typeof fx.resolve !== 'function') continue; // yalnızca kancalarla çalışan sürekli kartlar tepki penceresine girmez
        if (isQP ? !(fx.triggers || QP_TRIGGERS).includes(trigger) : fx.trigger !== trigger) continue;
        if (c.placedTurn >= this.turn && !hand) continue;
        if (this.sealedST(c)) continue;
        if (fx.can && !fx.can(this, owner, c, ctx)) continue;
        const yes = await this.ctl[owner].confirmTrap(this, owner, c, label(ctx));
        if (!yes) continue;
        if (hand) { const z = this.freeZone(owner, 'st'); if (z < 0) continue; this.flags.trapHand[owner] = -1; this.removeFromWherever(c); P.st[z] = c; } // eldeki Tuzak sahaya konup aktive edilir
        c.up = true;
        await this.ev(isTrap ? 'trap' : 'activate', { p: owner, card: c, zone: P.st.indexOf(c) });
        await this.notify(isTrap ? 'onTrapActivate' : 'onSpellActivate', owner, c);
        if (await this.negationWindow(c, owner)) { if (this.onField(c)) await this.sendToGrave(c, 'negated'); continue; }
        if (isTrap && this.allField().some(x => x !== c && x.up && FX[x.d.name] && FX[x.d.name].negateOtherTraps)) { if (this.onField(c)) await this.sendToGrave(c, 'negated'); continue; } // Royal Decree
        this.src = { p: owner, kind: isTrap ? 'trap' : 'spell', card: c };
        try { await fx.resolve(this, owner, c, ctx); }
        catch (e) { if (!(e instanceof Negated)) throw e; }
        finally { this.src = null; await this.flushTargets(); }
        if (this.onField(c) && fx.sub !== 'continuous' && fx.sub !== 'equip') await this.sendToGrave(c, isTrap ? 'trap' : 'spell');
      }
      // Yüzü açık canavarların Quick efektleri (fx.quick: {triggers, can, text, cost, resolve, ai})
      for (const m of [...P.mz]) {
        if (this.over || ctx.stop) return;
        if (!m || !m.up || this.negatedMon(m)) continue;
        const qf = this.fx(m) && this.fx(m).quick;
        if (!qf || !(qf.triggers || [qf.trigger]).includes(trigger) || m.mutedTurn === this.turn) continue;
        if (qf.once && m.qTurn === this.turn) continue;
        if (qf.can && !qf.can(this, owner, m, ctx)) continue;
        if (!(await this.ctl[owner].confirmTrap(this, owner, m, Object.assign(label(ctx), { text: qf.text ? qf.text(ctx, m) : 'Quick efektini aktive et?' })))) continue;
        if (qf.cost && (await qf.cost(this, owner, m, ctx)) === false) continue;
        m.qTurn = this.turn;
        await this.ev('ability', { p: owner, card: m });
        this.src = { p: owner, kind: 'monster', card: m };
        try { await qf.resolve(this, owner, m, ctx); }
        catch (e) { if (!(e instanceof Negated)) throw e; }
        finally { this.src = null; await this.flushTargets(); }
      }
    }
  }
  return { Duel, Negated, RULES, FX, EXODIA, PHASES, PHASE_TR, NEXT_OK, shuffle, tributesNeeded, other, isFieldSpell };
});
