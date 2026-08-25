// Paste this in the browser console of the SlideSmith tab where you uploaded the
// app-slide screenshots. It downloads every screenshot as a file named
// `<presetKey>-<gender>.<ext>` and prints the manifest JSON to paste into
// public/app-shots/manifest.json. Drop the downloaded files into
// public/app-shots/ and commit -> they become defaults for every user.
(async () => {
  const map = JSON.parse(localStorage.getItem('slidesmith:preset-appshots') || '{}');
  const db = await new Promise((res, rej) => {
    const q = indexedDB.open('slidesmith-library', 1);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  const recs = await new Promise((res, rej) => {
    const q = db.transaction('images', 'readonly').objectStore('images').getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  const shots = {};
  for (const [key, id] of Object.entries(map)) {
    const rec = recs.find((r) => r.id === id);
    if (!rec) { console.warn('missing blob for', key); continue; }
    const ext = ((rec.blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')).replace('+xml', '');
    const name = key.replace(':', '-') + '.' + ext;
    shots[key] = name;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(rec.blob);
    a.download = name;
    a.click();
    await new Promise((r) => setTimeout(r, 250)); // let the browser queue each download
  }
  console.log(JSON.stringify({ shots }, null, 2));
})();
