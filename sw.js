const V='chokai-v3';
const CORE=['./','index.html','app.css','app.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','data/n3-2021-07.js','exams/n3-2021-07/img0.jpg','exams/n3-2021-07/img1.jpg','exams/n3-2021-07/img2.jpg','exams/n3-2021-07/img3.jpg','exams/n3-2021-07/audio.mp3','data/n3-2018-07.js','data/n3-2021-12.js','exams/n3-2018-07/m4q1.jpg','exams/n3-2018-07/m4q2.jpg','exams/n3-2018-07/m4q3.jpg','exams/n3-2018-07/m4q4.jpg','exams/n3-2018-07/audio.mp3','exams/n3-2021-12/m1q1_0.jpg','exams/n3-2021-12/m1q1_1.jpg','exams/n3-2021-12/m1q1_2.jpg','exams/n3-2021-12/m1q1_3.jpg','exams/n3-2021-12/m1q3.jpg','exams/n3-2021-12/m1q4_0.jpg','exams/n3-2021-12/m1q4_1.jpg','exams/n3-2021-12/m1q4_2.jpg','exams/n3-2021-12/m1q4_3.jpg','exams/n3-2021-12/m1q6.jpg','exams/n3-2021-12/m4q1.jpg','exams/n3-2021-12/m4q2.jpg','exams/n3-2021-12/m4q3.jpg','exams/n3-2021-12/m4q4.jpg','exams/n3-2021-12/audio.mp3','data/n3-2018-12.js','exams/n3-2018-12/audio.mp3','exams/n3-2018-12/m1q3_0.jpg','exams/n3-2018-12/m1q3_1.jpg','exams/n3-2018-12/m1q3_2.jpg','exams/n3-2018-12/m1q3_3.jpg','exams/n3-2018-12/m1q5.jpg','data/n3-2019-12.js','exams/n3-2019-12/audio.mp3','exams/n3-2019-12/m1q1_0.jpg','exams/n3-2019-12/m1q1_1.jpg','exams/n3-2019-12/m1q1_2.jpg','exams/n3-2019-12/m1q1_3.jpg','exams/n3-2019-12/m1q3_0.jpg','exams/n3-2019-12/m1q3_1.jpg','exams/n3-2019-12/m1q3_2.jpg','exams/n3-2019-12/m1q3_3.jpg','exams/n3-2019-12/m1q6.jpg','data/n3-2020-12.js','exams/n3-2020-12/audio.mp3','exams/n3-2020-12/m1q3_0.jpg','exams/n3-2020-12/m1q3_1.jpg','exams/n3-2020-12/m1q3_2.jpg','exams/n3-2020-12/m1q3_3.jpg','exams/n3-2020-12/m1q6_0.jpg','exams/n3-2020-12/m1q6_1.jpg','exams/n3-2020-12/m1q6_2.jpg','exams/n3-2020-12/m1q6_3.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin===location.origin){
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(h=>h||fetch(r).then(n=>{const c=n.clone();caches.open(V).then(x=>x.put(r,c));return n}).catch(()=>caches.match('index.html'))));
  }else if(/fonts\.(googleapis|gstatic)\.com$/.test(u.host)){
    e.respondWith(caches.open(V).then(c=>c.match(r).then(h=>{const f=fetch(r).then(n=>{c.put(r,n.clone());return n}).catch(()=>h);return h||f})));
  }
});
