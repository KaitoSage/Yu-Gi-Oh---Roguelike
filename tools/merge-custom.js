// data/cards.custom.json içindeki özel kartları (Overframe efsane kartları) ve görsel yamalarını data/cards.dm.json'a işler.
//   - id'si veritabanında olan giriş mevcut kartı yamalar (örn. Dark Magician Girl'e `of` Overframe görseli ekler)
//   - yeni id'li giriş yeni kart olarak eklenir (custom:true)
// Tekrar çalıştırmak güvenlidir. build-db.js sonrası da çalıştırılmalıdır.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dmPath = path.join(root, 'data', 'cards.dm.json');
const customPath = path.join(root, 'data', 'cards.custom.json');

const dm = JSON.parse(fs.readFileSync(dmPath, 'utf8')).filter(c => !c.custom);
const custom = JSON.parse(fs.readFileSync(customPath, 'utf8'));
const byId = new Map(dm.map(c => [c.id, c]));
let patched = 0, added = 0;
for (const e of custom) {
  const base = byId.get(e.id);
  if (base) { Object.assign(base, e); patched++; }
  else { dm.push(Object.assign({ custom: true }, e)); added++; }
}
dm.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(dmPath, JSON.stringify(dm));
console.log(`Özel kartlar: ${added} eklendi, ${patched} yamalandı. Toplam: ${dm.length}`);
