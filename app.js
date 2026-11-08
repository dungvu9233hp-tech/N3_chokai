'use strict';
/* Chōkai: ứng dụng luyện nghe JLPT. Không cần thư viện ngoài. */
const $ = id => document.getElementById(id);
const au = $('au');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const fmt = x => { x = Math.max(0, x); return Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0'); };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let toastT;
function toast(t) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600);
}

const MONDAI = {
  1: ['課題理解', 'Nghe xong chọn việc sẽ làm đầu tiên'],
  2: ['ポイント理解', 'Nghe câu hỏi, đọc đáp án rồi nghe hội thoại'],
  3: ['概要理解', 'Nghe cả bài rồi chọn nội dung đúng'],
  4: ['発話表現', 'Nhìn tranh, chọn câu nói phù hợp'],
  5: ['即時応答', 'Nghe câu nói, chọn câu trả lời phù hợp']
};
const nChoices = q => q.c.length || 3;

/* ---------- IndexedDB (đề do người dùng thêm) ---------- */
let dbp;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('Trình duyệt không hỗ trợ lưu trữ'));
    const r = indexedDB.open('chokai', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('blob', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
const tx = (stores, mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction(stores, mode); const out = fn(t);
  t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
  t.onerror = t.onabort = () => rej(t.error);
}));
const dbList = () => tx('meta', 'readonly', t => t.objectStore('meta').getAll());
const dbBlob = id => tx('blob', 'readonly', t => t.objectStore('blob').get(id));
const dbPut = (meta, blobs) => tx(['meta', 'blob'], 'readwrite', t => { t.objectStore('meta').put(meta); t.objectStore('blob').put({ id: meta.id, ...blobs }); });
const dbDel = id => tx(['meta', 'blob'], 'readwrite', t => { t.objectStore('meta').delete(id); t.objectStore('blob').delete(id); });

/* ---------- Tiến độ ---------- */
const pk = id => 'chokai.p.' + id;
const getP = id => { const p = LS.get(pk(id), null) || {}; return { res: p.res || {}, marks: p.marks || {}, mock: p.mock || null }; };
const saveP = () => X && LS.set(pk(X.id), P);

let exams = [], X = null, P = null;

function normalize(e) {
  const cnt = {};
  e.qs = e.questions || e.qs;
  e.qs.forEach(q => { cnt[q.m] = (cnt[q.m] || 0) + 1; q.n = cnt[q.m]; q.c = q.c || []; });
  e.offset = e.offset || 0;
  e.end = e.end || Math.max(...e.qs.map(q => q.e)) + 6;
  return e;
}

/* ---------- Thư viện ---------- */
async function loadLibrary() {
  exams = (window.CHOKAI_BUILTIN || []).map(b => normalize({ ...b, builtin: true }));
  try { (await dbList()).forEach(m => exams.push(normalize({ ...m, builtin: false }))); } catch (e) { /* không có IndexedDB */ }
  renderHome();
}
const levelOf = t => (t.match(/N[1-5]/i) || ['聴'])[0].toUpperCase();

function renderHome() {
  $('examList').innerHTML = exams.map(e => {
    const p = getP(e.id), vals = Object.values(p.res), n = e.qs.length, ok = vals.filter(r => r.ok).length;
    const groups = [...new Set(e.qs.map(q => q.m))].map(m => '問題' + m).join('・');
    const stat = vals.length ? `Đã làm ${vals.length}/${n} · đúng ${ok}` + (p.mock ? ` · thi thử gần nhất ${p.mock.score}/${p.mock.total}` : '') : 'Chưa làm câu nào';
    return `<article class="xc" data-id="${esc(e.id)}">
      <div class="stamp" aria-hidden="true">${esc(levelOf(e.title))}</div>
      <div><h3>${esc(e.title)}</h3><p class="meta">${esc(e.sub || groups)} · ${n} câu · khoảng ${Math.round((e.end - e.qs[0].s) / 60)} phút</p>
        <div class="meter" aria-hidden="true"><i style="width:${vals.length / n * 100}%"></i></div><p class="stat">${esc(stat)}</p></div>
      <div class="xc-a"><button class="btn pri" data-a="practice" type="button">Luyện tập</button><button class="btn" data-a="mock" type="button">Thi thử</button>${e.builtin ? '' : '<button class="btn ghost" data-a="del" type="button">Xóa</button>'}</div>
    </article>`;
  }).join('');
}
$('examList').addEventListener('click', async ev => {
  const b = ev.target.closest('button[data-a]'); if (!b) return;
  const id = b.closest('.xc').dataset.id, a = b.dataset.a;
  if (a === 'del') {
    if (b.dataset.sure) { await dbDel(id).catch(() => {}); try { localStorage.removeItem(pk(id)); } catch (e) {} exams = exams.filter(e => e.id !== id); renderHome(); toast('Đã xóa đề'); return; }
    b.dataset.sure = 1; b.textContent = 'Bấm lần nữa để xóa'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Xóa'; } }, 3000); return;
  }
  await openExam(id);
  if (a === 'mock') mockStart();
});

/* ---------- Mở đề ---------- */
function showView(v) { $('home').hidden = v !== 'home'; $('exam').hidden = v !== 'exam'; scrollTo(0, 0); }
async function openExam(id) {
  const e = exams.find(x => x.id === id); if (!e) return;
  X = e; P = getP(id); cur = 0; rev = false; tab = null;
  $('exTitle').textContent = e.title; $('exSub').textContent = e.sub || '';
  $('rv').textContent = 'Ôn lại câu sai'; $('rvn').textContent = '';
  mockQuit(true); showView('exam'); buildNav();
  $('loading').hidden = false; $('loading').textContent = 'Đang tải audio…'; au.pause();
  try {
    if (!e._audio) {
      if (e.builtin) {
        try { const r = await fetch(e.audio); if (!r.ok) throw 0; e._audio = URL.createObjectURL(await r.blob()); }
        catch (err) { e._audio = e.audio; }
        e._imgs = e.images || {};
      } else {
        const b = await dbBlob(e.id); e._audio = URL.createObjectURL(b.audio);
        e._imgs = {}; Object.entries(b.images || {}).forEach(([k, v]) => e._imgs[k] = URL.createObjectURL(v));
      }
    }
    if (X !== e) return;
    au.src = e._audio; $('loading').hidden = true;
  } catch (err) { $('loading').textContent = 'Không đọc được audio của đề này. Hãy xóa và thêm lại đề.'; }
  go(0);
}
$('backBtn').onclick = () => { au.pause(); mockQuit(true); X = null; renderHome(); showView('home'); };

/* ---------- Lưới câu ---------- */
function buildNav() {
  const ms = [...new Set(X.qs.map(q => q.m))];
  $('qnav').innerHTML = ms.map(m => `<div class="grp"><h4>問題${m} <span class="jp">${esc((MONDAI[m] || [''])[0])}</span></h4><div class="qs">${
    X.qs.map((q, i) => q.m === m ? `<button class="qb" type="button" data-i="${i}" aria-label="問題${m} ${q.n}番">${q.n}</button>` : '').join('')}</div></div>`).join('');
}
$('qnav').addEventListener('click', e => { const b = e.target.closest('.qb'); if (b && !mk.on) go(+b.dataset.i); });
function lists() {
  document.querySelectorAll('.qb').forEach(b => {
    const i = +b.dataset.i, r = P.res[i];
    b.className = 'qb' + (i === cur && !mk.on ? ' on' : '') + (r ? (r.ok ? ' ok' : ' no') : '');
  });
  const d = Object.values(P.res), ok = d.filter(r => r.ok).length;
  $('score').textContent = d.length ? `Đúng ${ok}/${d.length} câu đã làm` : '';
  $('scoreChip').hidden = !d.length; $('scoreChip').textContent = `${ok}/${d.length}`;
}

/* ---------- Câu hỏi ---------- */
let cur = 0, pick = 0, done = false, rev = false, tab = null, lastK = -1, raf = 0;
const seg = i => { const m = P.marks[i], q = X.qs[i]; return m ? { s: m.s, e: m.e } : { s: q.s, e: q.e }; };
const T = () => au.currentTime + X.offset;
const seekT = t => { au.currentTime = Math.max(0, t - X.offset); };
const NB = 56;

function waveBars(seed) {
  let x = (seed * 2654435761 + 12345) >>> 0; const r = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
  let v = .5, out = '';
  for (let i = 0; i < NB; i++) { v = .5 * v + .5 * r(); const env = .4 + .6 * Math.pow(Math.sin(Math.PI * (i + .5) / NB), .6); out += `<span style="height:${Math.round(14 + 86 * v * env)}%"></span>`; }
  return out;
}
function imgSrc(k) { return (X._imgs || {})[k]; }
function chBtn(t, k, fn) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ch';
  b.innerHTML = `<b>${k}</b><span class="jp"></span>`;
  if (t.startsWith('img:')) {
    const im = new Image(); im.alt = 'Hình ' + k; const s = imgSrc(t.slice(4)); if (s) im.src = s; b.lastChild.replaceWith(im); b.classList.add('imgc');
  } else b.lastChild.textContent = t;
  b.onclick = () => { fn(); b.blur(); };
  return b;
}
function go(i) {
  if (mk.on && mk.run) return;
  cur = i; pick = 0; done = false; au.pause();
  const s = seg(i), q = X.qs[i];
  seekT(s.s);
  $('ttl').innerHTML = `<small>問題${q.m}</small>${q.n}番`;
  $('tag').textContent = (MONDAI[q.m] || [])[1] || '';
  const hasImg = q.c.some(t => t.startsWith('img:'));
  const qi = $('qimg'), qsrc = q.img && imgSrc(q.img); qi.hidden = !qsrc; qi.innerHTML = ''; if (qsrc) { const im = new Image(); im.alt = 'Hình minh họa'; im.src = qsrc; qi.append(im); }
  const box = $('chs'); box.innerHTML = ''; box.className = 'chs' + (hasImg ? ' g2' : '');
  const n = nChoices(q);
  for (let k = 0; k < n; k++) box.append(chBtn(q.c[k] || '', k + 1, () => choose(k + 1)));
  $('msg').textContent = ''; $('msg').className = 'msg';
  tab = null; renderPanel();
  $('es').value = s.s; $('ee').value = s.e;
  $('wave').innerHTML = waveBars(i + 1); lastK = -1;
  lists(); upd();
}
function choose(k) { if (done) return; pick = k; [...$('chs').children].forEach((b, j) => b.classList.toggle('sel', j + 1 === k)); }
function confirmA() {
  if (done || !pick) { if (!pick && !done) toast('Chọn một đáp án trước'); return; }
  done = true; const a = X.qs[cur].a, ok = pick === a; P.res[cur] = { ok }; saveP();
  [...$('chs').children].forEach((b, j) => { b.classList.remove('sel'); if (j + 1 === a) b.classList.add('right'); else if (j + 1 === pick) b.classList.add('wrong'); });
  $('chs').classList.add('locked');
  $('msg').textContent = ok ? 'Đúng rồi!' : 'Chưa đúng. Đáp án đúng là ' + a + '.'; $('msg').className = 'msg ' + (ok ? 'ok' : 'no');
  lists();
}
$('ok').onclick = confirmA;
const pool = () => X.qs.map((q, i) => i).filter(i => !rev || (P.res[i] && !P.res[i].ok) || i === cur);
$('nx').onclick = () => { const p = pool(); go(p[(p.indexOf(cur) + 1) % p.length]); };

/* ---------- Trình phát ---------- */
function upd() {
  if (!X) return;
  const s = seg(cur), t = T(), len = s.e - s.s, p = clamp((t - s.s) / len);
  const bars = $('wave').children, k = Math.round(p * NB);
  if (k !== lastK) { for (let j = 0; j < bars.length; j++) bars[j].classList.toggle('on', j < k); lastK = k; }
  $('wave').setAttribute('aria-valuenow', Math.round(p * 100));
  $('t0').textContent = fmt(t - s.s); $('t1').textContent = fmt(len);
  const playing = !au.paused;
  $('pt').textContent = playing ? 'Dừng' : 'Phát';
  $('pi').setAttribute('d', playing ? 'M6 4.5h4.2v15H6zM13.8 4.5H18v15h-4.2z' : 'M7 4.5v15l13-7.5z');
}
function loop() { upd(); raf = au.paused ? 0 : requestAnimationFrame(loop); }
au.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); });
au.addEventListener('pause', upd);
au.addEventListener('timeupdate', () => {
  if (!X || mk.on) return;
  const s = seg(cur); if (T() >= s.e) { au.pause(); seekT(s.e - .01); } upd();
});
function toggle() {
  const s = seg(cur), t = T();
  if (au.paused) { if (t < s.s || t >= s.e - .2) seekT(s.s); au.play().catch(() => toast('Không phát được audio')); } else au.pause();
}
$('pl').onclick = toggle;
$('rw').onclick = () => { const s = seg(cur); seekT(Math.max(s.s, T() - 5)); upd(); };
$('rs').onclick = () => { seekT(seg(cur).s); au.play().catch(() => {}); };
document.querySelectorAll('#spd button').forEach(b => b.onclick = () => {
  au.playbackRate = +b.dataset.r; document.querySelectorAll('#spd button').forEach(x => x.setAttribute('aria-pressed', x === b));
});
let drag = false;
const seekFrac = e => { const r = $('wave').getBoundingClientRect(), s = seg(cur); seekT(s.s + (s.e - s.s) * clamp((e.clientX - r.left) / r.width)); upd(); };
$('wave').onpointerdown = e => { drag = true; $('wave').setPointerCapture(e.pointerId); seekFrac(e); };
$('wave').onpointermove = e => { if (drag) seekFrac(e); };
$('wave').onpointerup = $('wave').onpointercancel = () => { drag = false; };
$('wave').onkeydown = e => {
  const s = seg(cur);
  if (e.key === 'ArrowRight') { seekT(Math.min(s.e - .1, T() + 5)); upd(); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { seekT(Math.max(s.s, T() - 5)); upd(); e.preventDefault(); }
};

/* ---------- Script, bản dịch, từ vựng ---------- */
function renderPanel() {
  const p = $('panel'), q = X.qs[cur];
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === tab));
  p.hidden = !tab; if (!tab) return;
  if (tab === 's') {
    p.innerHTML = q.script ? q.script.split('\n').map(l => '<p>' + esc(l).replace(/＊(.+?)＊/g, '<mark>$1</mark>') + '</p>').join('') + '<p class="hint">Phần tô vàng là chỗ dẫn đến đáp án đúng.</p>' : '<p class="hint">Đề này chưa có script.</p>';
  } else if (tab === 'v') {
    p.innerHTML = q.vi && q.vi.length ? q.vi.map(l => '<p class="vn">' + esc(l) + '</p>').join('') : '<p class="hint">Đề này chưa có bản dịch.</p>';
  } else {
    p.innerHTML = q.words && q.words.length ? q.words.map(w => '<p class="vw">' + esc(w) + '</p>').join('') : '<p class="hint">Đề này chưa có danh sách từ vựng.</p>';
  }
}
$('tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = tab === b.dataset.t ? null : b.dataset.t; renderPanel(); };

/* ---------- Ôn tập, làm lại, mốc cắt ---------- */
$('rv').onclick = () => {
  const w = X.qs.map((q, i) => i).filter(i => P.res[i] && !P.res[i].ok);
  if (!rev && !w.length) { $('rvn').textContent = 'Chưa có câu sai nào để ôn.'; return; }
  rev = !rev; $('rv').textContent = rev ? 'Thoát chế độ ôn' : 'Ôn lại câu sai';
  $('rvn').textContent = rev ? `Đang ôn ${w.length} câu sai. Làm đúng thì câu hết bị tính là sai.` : '';
  if (rev) go(w[0]);
};
$('rt').onclick = () => { P.res = {}; saveP(); rev = false; $('rv').textContent = 'Ôn lại câu sai'; $('rvn').textContent = ''; go(0); };
$('gs').onclick = () => { $('es').value = T().toFixed(1); };
$('ge').onclick = () => { $('ee').value = T().toFixed(1); };
$('sv').onclick = () => { const s = +$('es').value, e = +$('ee').value; if (e > s) { P.marks[cur] = { s, e }; saveP(); go(cur); toast('Đã lưu mốc cắt'); } else toast('Mốc kết thúc phải lớn hơn mốc bắt đầu'); };
$('rm').onclick = () => { delete P.marks[cur]; saveP(); go(cur); };

/* ---------- Thi thử ---------- */
const mk = { on: false, run: false, i: -1, p: {}, last: 0, T0: 0 };
const mockEl = $('mock');
function mockStart() {
  mk.on = true; mk.run = false; mk.i = -1; mk.p = {}; au.pause(); mk.T0 = X.qs[0].s - .3;
  $('practice').hidden = true; mockEl.hidden = false; lists();
  mockEl.innerHTML = `<h2 class="mock-h" style="font:700 1.8rem/1.2 var(--serif)">Thi thử ${esc(X.sub || '')}</h2>
  <ul class="mock-list"><li>Audio chạy liền một mạch, dài khoảng ${fmt(X.end - mk.T0)}.</li><li>Không dừng, không tua lại, không đổi tốc độ.</li><li>Chọn đáp án trong lúc nghe, có thể đổi ý đến khi sang câu sau.</li></ul>
  <div class="tools" style="flex-direction:row"><button class="btn pri" id="mgo" type="button">Bắt đầu</button><button class="btn" id="mx" type="button">Thoát</button></div>`;
  $('mgo').onclick = () => { au.playbackRate = 1; seekT(mk.T0); mk.last = au.currentTime; mk.run = true; au.play().catch(() => toast('Không phát được audio')); };
  $('mx').onclick = () => mockQuit();
}
function mockQ() {
  const q = X.qs[mk.i];
  mockEl.innerHTML = `<div class="mock-h"><h2>問題${q.m}　${q.n}番</h2><span class="hint" id="mt" style="margin:0"></span></div><div class="mbar"><i id="mb"></i></div>${q.img && imgSrc(q.img) ? `<div class="qimg"><img alt="Hình minh họa" src="${imgSrc(q.img)}"></div>` : ''}<div class="chs" id="mc"></div>
  <div class="tools" style="flex-direction:row;margin-top:16px"><button class="btn ghost" id="mx" type="button">Dừng thi</button></div>`;
  const c = $('mc'); c.className = 'chs' + (q.c.some(t => t.startsWith('img:')) ? ' g2' : '');
  for (let j = 0; j < nChoices(q); j++) c.append(chBtn(q.c[j] || '', j + 1, () => mockPick(j + 1)));
  $('mx').onclick = () => mockQuit(); mockPick(mk.p[mk.i] || 0);
}
function mockPick(k) { if (!k) return; mk.p[mk.i] = k; [...$('mc').children].forEach((b, j) => b.classList.toggle('sel', j + 1 === k)); }
function mockEnd() {
  if (!mk.run) return; mk.run = false; au.pause(); let ok = 0;
  const rows = X.qs.map((q, i) => {
    const p = mk.p[i] || 0, r = p === q.a; if (r) ok++; P.res[i] = { ok: r };
    return `<div class="rrow"><span class="mk ${r ? 'ok' : 'no'}">${r ? '✓' : '✗'}</span><span>問題${q.m}　${q.n}番</span><span class="hint" style="margin:0">${r ? 'Đáp án ' + q.a : 'Bạn chọn ' + (p || '–') + ' · đúng là ' + q.a}</span></div>`;
  }).join('');
  P.mock = { score: ok, total: X.qs.length, at: Date.now() }; saveP();
  mockEl.innerHTML = `<p class="hint" style="margin:0">Kết quả thi thử</p><div class="big">${ok}/${X.qs.length}</div>${rows}
  <p class="hint">Kết quả đã ghi vào lưới câu. Thoát ra, bấm “Ôn lại câu sai” để làm lại câu sai, và mở Script để xem chỗ dẫn đến đáp án.</p>
  <div class="tools" style="flex-direction:row;margin-top:14px"><button class="btn pri" id="mq" type="button">Xem từng câu</button><button class="btn" id="mr" type="button">Thi lại</button></div>`;
  $('mq').onclick = () => mockQuit(); $('mr').onclick = mockStart; lists();
}
function mockQuit(silent) {
  const was = mk.on; mk.on = false; mk.run = false; au.pause(); mockEl.hidden = true; $('practice').hidden = false;
  if (was && !silent && X) { go(cur); } lists();
}
au.addEventListener('timeupdate', () => {
  if (!mk.on || !mk.run) return;
  const t = T(); mk.last = au.currentTime;
  let i = 0; X.qs.forEach((q, k) => { if (t >= q.s - .3) i = k; });
  if (i !== mk.i) { mk.i = i; mockQ(); }
  const e = $('mt'); if (e) { e.textContent = fmt(t - mk.T0) + ' / ' + fmt(X.end - mk.T0); $('mb').style.width = clamp((t - mk.T0) / (X.end - mk.T0)) * 100 + '%'; }
  if (t >= X.end) mockEnd();
});
au.addEventListener('ended', () => { if (mk.on && mk.run) mockEnd(); });
au.addEventListener('seeking', () => { if (mk.on && mk.run && Math.abs(au.currentTime - mk.last) > 1.5) au.currentTime = mk.last; });
au.addEventListener('pause', () => { if (mk.on && mk.run && T() < X.end - .5 && !au.ended) au.play().catch(() => {}); });
$('te').onclick = mockStart;

/* ---------- Phím tắt ---------- */
document.addEventListener('keydown', e => {
  if (!X || $('exam').hidden || $('dlg').open) return;
  if (e.target.matches('input')) return;
  if (e.key.length === 1 && '1234'.includes(e.key)) { mk.on ? (mk.run && mockPick(+e.key)) : choose(+e.key); return; }
  if (e.target.closest('button,summary,[role=slider]')) return;
  if (mk.on) { if (e.key === ' ') e.preventDefault(); return; }
  if (e.key === 'Enter') confirmA(); else if (e.key === ' ') { e.preventDefault(); toggle(); }
});

/* ---------- Import ---------- */
/* Đọc literal JS (mảng, object, chuỗi, số) mà không dùng eval. */
function parseLit(src, start) {
  let i = start;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const str = () => {
    const q = src[i++]; let o = '';
    while (i < src.length && src[i] !== q) {
      let c = src[i++];
      if (c === '\\') {
        c = src[i++];
        if (c === 'n') o += '\n'; else if (c === 't') o += '\t'; else if (c === 'u') { o += String.fromCharCode(parseInt(src.substr(i, 4), 16)); i += 4; }
        else if (c === 'x') { o += String.fromCharCode(parseInt(src.substr(i, 2), 16)); i += 2; } else o += c;
      } else o += c;
    }
    i++; return o;
  };
  const val = () => {
    ws(); const c = src[i];
    if (c === '[') { i++; const a = []; for (;;) { ws(); if (src[i] === ']') { i++; return a; } a.push(val()); ws(); if (src[i] === ',') i++; } }
    if (c === '{') { i++; const o = {}; for (;;) { ws(); if (src[i] === '}') { i++; return o; } let k; if (/["'`]/.test(src[i])) k = str(); else { const m = /[A-Za-z_$][\w$]*/y; m.lastIndex = i; const r = m.exec(src); if (!r) throw new Error('literal'); k = r[0]; i += k.length; } ws(); if (src[i++] !== ':') throw new Error('literal'); o[k] = val(); ws(); if (src[i] === ',') i++; } }
    if (/["'`]/.test(c)) return str();
    const m = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y; m.lastIndex = i; const r = m.exec(src);
    if (r) { i += r[0].length; return +r[0]; }
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) if (src.startsWith(w, i)) { i += w.length; return v; }
    throw new Error('literal');
  };
  return val();
}
const b64blob = (b64, type) => { const b = atob(b64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Blob([u], { type }); };
const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|opus)$/i;

async function parseLegacy(file) {
  const h = await file.text();
  const am = h.match(/<script type="text\/plain" id="a">([\s\S]*?)<\/script>/);
  if (!am) throw new Error('Không thấy audio nhúng trong file .html này.');
  const sc = h.slice(h.lastIndexOf('<script>') + 8);
  const lit = name => { const i = sc.indexOf('const ' + name + '='); if (i < 0) return null; return parseLit(sc, sc.indexOf('=', i) + 1); };
  let Q, S, V, W, IM;
  try { Q = lit('Q'); S = lit('S') || []; V = lit('V') || []; W = lit('W') || []; IM = lit('IM') || []; } catch (e) { throw new Error('Không đọc được dữ liệu câu hỏi trong file .html này.'); }
  if (!Array.isArray(Q) || !Q.length) throw new Error('File .html này không có danh sách câu hỏi.');
  const off = sc.match(/let OFF=(\d+(\.\d+)?)/), end = sc.match(/END=(\d+(\.\d+)?)/), tt = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || file.name.replace(/\.html?$/i, '');
  const [title, ...rest] = tt.split(/\s+[–-]\s+/);
  const images = {}; IM.forEach((d, k) => { const m = /^data:(image\/[\w+.-]+);base64,(.*)$/.exec(d); if (m) images[k] = b64blob(m[2], m[1]); });
  const questions = Q.map((q, i) => ({ m: q.m, s: q.s, e: q.e, a: q.a, c: q.c, script: S[i] || '', vi: V[i] || [], words: W[i] || [] }));
  return { meta: { id: '', title: title.trim(), sub: rest.join(' – ').replace(/^Luyện nghe\s*/i, '').trim(), offset: off ? +off[1] : 0, end: end ? +end[1] : 0, questions }, audio: b64blob(am[1].trim(), 'audio/mpeg'), images };
}
async function parseJson(file, all) {
  let d; try { d = JSON.parse(await file.text()); } catch (e) { throw new Error('File .json bị lỗi cú pháp: ' + e.message); }
  const qs = d.questions; if (!Array.isArray(qs) || !qs.length) throw new Error('File .json cần có mảng "questions".');
  const audio = all.find(f => f.type.startsWith('audio/') || AUDIO_RE.test(f.name));
  if (!audio) throw new Error('Thiếu file audio. Chọn kèm file .mp3 của đề.');
  const imgFiles = {}; all.filter(f => f.type.startsWith('image/')).forEach(f => imgFiles[f.name] = f);
  const images = {};
  qs.forEach((q, i) => {
    const n = i + 1;
    if (![1, 2, 3, 4, 5].includes(q.m)) throw new Error(`Câu ${n}: "m" (số 問題) phải từ 1 đến 5.`);
    if (!(q.e > q.s) || q.s < 0) throw new Error(`Câu ${n}: cần "s" và "e" là giây, với e lớn hơn s.`);
    if (!Array.isArray(q.c)) q.c = [];
    if (!Number.isInteger(q.a) || q.a < 1 || q.a > nChoices(q)) throw new Error(`Câu ${n}: "a" phải là số thứ tự đáp án đúng, bắt đầu từ 1.`);
    q.c.forEach(t => { if (typeof t === 'string' && t.startsWith('img:')) { const k = t.slice(4); if (!imgFiles[k]) throw new Error(`Câu ${n}: thiếu file hình "${k}".`); images[k] = imgFiles[k]; } });
  });
  return { meta: { id: '', title: String(d.title || file.name.replace(/\.json$/i, '')), sub: String(d.sub || ''), offset: +d.offset || 0, end: +d.end || 0, questions: qs.map(q => ({ m: q.m, s: q.s, e: q.e, a: q.a, c: q.c, script: q.script || '', vi: q.vi || [], words: q.words || [] })) }, audio, images };
}
const TPL = `{
  "title": "N3 2022/12 聴解",
  "sub": "問題1・2",
  "offset": 0,
  "end": 1290,
  "questions": [
    {
      "m": 1, "s": 12.5, "e": 70.2, "a": 2,
      "c": ["本をかえす", "ノートをかう", "img:b.jpg", "でんわをする"],
      "script": "男：…\\n女：＊ノートを買ってきて＊",
      "vi": ["Nam: …", "Nữ: …"],
      "words": ["単語 (たんご): từ vựng"]
    }
  ]
}`;
$('tpl').textContent = TPL;
$('copyTpl').onclick = async () => { try { await navigator.clipboard.writeText(TPL); toast('Đã sao chép mẫu'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('tpl')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Hãy bấm Ctrl+C để sao chép'); } };

const log = (t, c) => { const d = document.createElement('div'); d.className = c || ''; d.textContent = t; $('log').append(d); };
async function doImport(fileList) {
  const files = [...fileList]; $('log').innerHTML = ''; if (!files.length) return;
  try {
    await db();
  } catch (e) { log('Trình duyệt đang chặn lưu trữ nên không thêm đề được. Thử mở app ngoài chế độ riêng tư.', 'err'); return; }
  try {
    log('Đang đọc file…');
    const html = files.find(f => /\.html?$/i.test(f.name)), json = files.find(f => /\.json$/i.test(f.name));
    if (!html && !json) throw new Error('Chọn một file .html cùng kiểu với đề mẫu, hoặc file .json kèm audio.');
    const r = html ? await parseLegacy(html) : await parseJson(json, files);
    const dup = exams.find(e => !e.builtin && e.title === r.meta.title && e.qs.length === r.meta.questions.length);
    r.meta.id = dup ? dup.id : 'u-' + Date.now().toString(36);
    await dbPut(r.meta, { audio: r.audio, images: r.images });
    if (dup) { dup._audio = null; }
    await loadLibrary();
    $('log').innerHTML = ''; log(`${dup ? 'Đã cập nhật' : 'Đã thêm'} “${r.meta.title}” với ${r.meta.questions.length} câu.`, 'ok');
  } catch (e) { $('log').innerHTML = ''; log(e.message || 'Không thêm được đề.', 'err'); }
}
$('addBtn').onclick = () => { $('log').innerHTML = ''; $('fileIn').value = ''; $('dlg').showModal(); };
$('dlgClose').onclick = () => $('dlg').close();
$('fileIn').onchange = e => doImport(e.target.files);
const drop = $('drop');
['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => doImport(e.dataTransfer.files));
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').close(); });

/* ---------- Khởi động ---------- */
loadLibrary();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
