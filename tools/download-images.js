// Kart görsellerini yerel diske indirir (YGOPRODeck hotlink yapılmamasını ister).
// Kullanım: node tools/download-images.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.dm.json'), 'utf8'));
const dir = path.join(root, 'data', 'images');
fs.mkdirSync(dir, { recursive: true });

const CONCURRENCY = 4;
const DELAY_MS = 60; // nazik hız (saniyede ~60 istek altında)

function get(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(res.statusCode)); }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const todo = [...new Set(cards.map(c => c.img))].filter(id => !fs.existsSync(path.join(dir, id + '.jpg')));
  console.log('İndirilecek:', todo.length);
  let done = 0, fail = 0;
  async function worker() {
    while (todo.length) {
      const id = todo.pop();
      try {
        await get(`https://images.ygoprodeck.com/images/cards/${id}.jpg`, path.join(dir, id + '.jpg'));
      } catch (e) {
        fail++;
        try { fs.unlinkSync(path.join(dir, id + '.jpg')); } catch {}
        console.log('HATA', id, e.message);
      }
      if (++done % 100 === 0) console.log(done, 'bitti');
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('Bitti. Hata:', fail);
})();
