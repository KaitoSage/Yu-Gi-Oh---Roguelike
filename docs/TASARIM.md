# Yu-Gi-Oh! Roguelike — Tasarım Belgesi (v0.1)

> Kişisel/prototip proje. Public yayın yok. Kart verisi ve görseller YGOPRODeck veritabanından, yerel önbelleğe alınır.

## Çekirdek
- **Tür:** Slay the Spire tarzı roguelike harita + Yu-Gi-Oh! düellosu.
- **Platform:** PC, Electron ile `.exe`.
- **İlk harita:** Duel Monsters (anime sezon 0–1). Kart havuzu LOB → RDS dönemi.

## Düello kuralları (Duel Links bazlı hızlı format)
| Kural | Değer |
|---|---|
| Can (LP) | 4000 |
| Canavar bölgesi | 3 |
| Büyü/Tuzak bölgesi | 3 |
| Başlangıç eli | 5 |
| El limiti | 6 (tur sonu) |
| Deste | min 20, max 40 |
| Tribute | Lv5-6: 1, Lv7+: 2 |
| İlk tur | İlk oyuncu çekmez, saldırmaz |
| Normal Summon | Tur başına 1 |

Geri kalan her şey orijinal Yu-Gi-Oh! kuralları: pozisyonlar, set, flip, savaş hasarı, direkt saldırı, tuzak tetikleri.

## Roguelike döngü
Harita (dallanan yol) → düğümler:
- ⚔ Düello (normal rakip)
- ★ Elit düello (güçlü rakip, nadir ödül)
- ✦ Mağaza (kart al/çıkar)
- ❓ Olay (risk/ödül)
- ♥ Dinlenme (LP başlangıç bonusu / kart yükselt)
- ☠ Boss (örn. Yugi, Kaiba, Pegasus…)

Run başında starter deste (20 kart), her düello sonrası 3 karttan 1 seç. Run ölünce biter, meta-ilerleme (kilit açılan kartlar/başlangıç desteleri) kalır.

## Kart görünümü
Resmi kart çerçevesi korunur, üstüne nadirliğe göre efekt:
- **N:** efekt yok
- **R:** gümüş parlama
- **SR:** holografik kayan ışık
- **UR:** altın overframe + folyo parlaması
- **PR (Prismatic):** gökkuşağı prizma + parıltı

## Yol haritası
1. ✅ Kart DB + görsel indirme
2. 🔧 Düello motoru (async, AI rakip) + düello UI
3. Harita + run akışı + ödül/mağaza
4. Fusion / Ritual, daha fazla efekt
5. Boss'lar, karakter deste temaları, meta ilerleme
