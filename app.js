(() => {
  const $app = document.getElementById('app');
  const topicName = Object.fromEntries(TOPICS.map(t => [t.k, t.name]));
  // Official numbering from the professor's list; removed problems never appear.
  const LIVE = BANK.filter(p => !REMOVED.has(p.id)).map(p => Object.assign(p, { no: OFFICIAL[p.id] })).sort((a, b) => a.no - b.no);
  const MAXNO = Math.max(...LIVE.map(p => p.no));
  const SET_SIZE = 7;

  // ── storage (per-viewer convenience only) ──
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };
  const DEF = { mode: 'cycle', covered: 150, count: 7, from: 1, to: 20, topics: ['grav'], numbers: 'new', style: 'exam', timer: 20, tol: 1 };
  let S = Object.assign({}, DEF, store.get('set3.settings', {}));
  let stats = store.get('set3.stats', {});
  let cycle = store.get('set3.cycle', null);
  const saveS = () => store.set('set3.settings', S);
  const saveStats = () => store.set('set3.stats', stats);
  const saveCycle = () => store.set('set3.cycle', cycle);
  let exam = null, tick = null;

  // ── number formatting ──
  function sci(x, sf) {
    if (x === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = Number((x / 10 ** e).toPrecision(sf));
    if (Math.abs(m) >= 10) { m = Number((m / 10).toPrecision(sf)); e += 1; }
    return `${m}×10<sup>${String(e).replace('-', '−')}</sup>`;
  }
  const fmtParam = (v, sp) => !sp ? String(v) : sp.sci ? sci(v, sp.sf) : String(Number(v.toPrecision(Math.max(sp.sf, 2))));
  function fmtAns(x, sf = 5) {
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return sci(x, sf);
    return String(Number(x.toPrecision(sf)));
  }
  const render = (prob, p) => prob.text.replace(/\{(\w+)\}/g, (_, k) => {
    const s = prob.params[k];
    return fmtParam(p[k], s ? spec(s) : null);
  });
  const fmtNum2 = x => x.toFixed(2).replace('.', ',');

  // ── answer parsing: one box, number then unit, like the real quiz ──
  const NUM_RE = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))(?:\s*(?:[x×*·]\s*10\s*\^?\s*\(?\s*([+-]?\d+)\s*\)?|e([+-]?\d+)))?/i;
  function parseAns(str) {
    const s = String(str).trim().replace(/−/g, '-').replace(/(\d)\s+(?=\d)/g, '$1');
    if (!s) return { v: null, unit: '' };
    const m = s.match(NUM_RE);
    if (!m) return { v: NaN, unit: '' };
    let mant = m[1];
    mant = /,/.test(mant) && !/\./.test(mant) ? mant.replace(',', '.') : mant.replace(/,/g, '');
    const exp = m[2] ?? m[3];
    return { v: parseFloat(mant) * (exp !== undefined ? 10 ** parseInt(exp, 10) : 1), unit: s.slice(m[0].length).trim() };
  }
  const normU = s => String(s || '').toLowerCase().replace(/[\s*·⋅^()]/g, '').replace(/²/g, '2').replace(/³/g, '3').replace(/⁻¹/g, '-1').replace(/[−–]/g, '-');
  const NONE = ['', '-', 'none', '1', 'nounit', 'unitless'];
  const UNITS = {
    'km': ['km'], 'm': ['m', 'meter', 'meters', 'metre', 'metres'], 'm/s²': ['m/s2', 'ms-2', 'm/s/s'], 'rad/s': ['rad/s', 'rads-1', '1/s', 's-1', '/s'],
    'm/s': ['m/s', 'ms-1'], '': NONE, 'N': ['n', 'newton', 'newtons', 'kgm/s2'], 'kg': ['kg'], 'J': ['j', 'joule', 'joules', 'nm', 'kgm2/s2'],
    'kg/m³': ['kg/m3', 'kgm-3'], 's': ['s', 'sec', 'secs', 'second', 'seconds'], 'Hz': ['hz', '1/s', 's-1', '/s'], 'N/m': ['n/m', 'nm-1', 'kg/s2'],
    's/s': ['s/s', ...NONE], 's⁻¹': ['s-1', '1/s', '/s', 'hz'], '%': ['%', 'percent'],
    'dB': ['db', 'decibel', 'decibels'], 'W/m²': ['w/m2', 'wm-2'], 'Pa': ['pa', 'pascal', 'n/m2', 'nm-2'], 'W': ['w', 'watt', 'watts', 'j/s'],
  };
  const unitOk = (typed, unit) => (UNITS[unit] || [normU(unit)]).includes(normU(typed));
  const relErr = (u, a) => Math.abs(Math.abs(u) - a) / Math.abs(a);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const FLAG = '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M1 1v12M1 1.5h8.5L7.8 4.5l1.7 3H1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  const ICO_OK = '<svg class="ico" viewBox="0 0 24 24" aria-label="Верно"><circle cx="12" cy="12" r="10" fill="none" stroke="#357a32" stroke-width="2"/><path d="M7.5 12.3l3 3 6-6.6" fill="none" stroke="#357a32" stroke-width="2.2"/></svg>';
  const ICO_PART = '<svg class="ico" viewBox="0 0 24 24" aria-label="Частично правильный"><circle cx="12" cy="12" r="10" fill="none" stroke="#f0ad4e" stroke-width="2"/><path d="M7.5 12.3l3 3 6-6.6" fill="none" stroke="#f0ad4e" stroke-width="2.2"/></svg>';
  const UNIT_PENALTY = 0.1;
  const figHtml = pr => FIGS[pr.id] ? `<p><img class="qfig" src="img/${FIGS[pr.id]}.jpeg" alt="${esc(pr.fig || 'Figure')}"></p>` : pr.fig ? `<div class="fig">Figure: ${pr.fig}</div>` : '';
  const ICO_NO = '<svg class="ico" viewBox="0 0 24 24" aria-label="Неверно"><circle cx="12" cy="12" r="10" fill="none" stroke="#ca3120" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#ca3120" stroke-width="2.2"/></svg>';

  // ── pools ──
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const byId = Object.fromEntries(LIVE.map(p => [p.id, p]));
  const mistakes = () => LIVE.filter(p => { const s = stats[p.id]; return s && (s.c < s.a || s.last === false); })
    .sort((a, b) => (stats[a.id].c / stats[a.id].a) - (stats[b.id].c / stats[b.id].a));
  function pool() {
    if (S.mode === 'mock') return LIVE.filter(p => p.no <= S.covered);
    if (S.mode === 'topic') return LIVE.filter(p => S.topics.includes(p.t));
    if (S.mode === 'range') return LIVE.filter(p => p.no >= Math.min(S.from, S.to) && p.no <= Math.max(S.from, S.to));
    return mistakes();
  }
  const pick = (pl, n) => S.mode === 'mistakes' ? shuffle(pl.slice(0, n * 2)).slice(0, n) : shuffle(pl).slice(0, n);

  // ── review-all cycle: every live problem exactly once, dealt into papers of 7 with mixed topics ──
  function newCycle() {
    const nSets = Math.ceil(LIVE.length / SET_SIZE);
    const deck = shuffle(TOPICS.map(t => t.k)).flatMap(k => shuffle(LIVE.filter(p => p.t === k).map(p => p.id)));
    const sets = Array.from({ length: nSets }, () => []);
    deck.forEach((id, i) => sets[i % nSets].push(id));
    cycle = { started: Date.now(), sets: sets.map(shuffle), res: {} };
    saveCycle();
  }
  const cycleValid = () => cycle && Array.isArray(cycle.sets) && cycle.sets.flat().length === LIVE.length && cycle.sets.flat().every(id => byId[id]);
  if (!cycleValid()) newCycle();
  const nextSet = () => { const i = cycle.sets.findIndex((_, k) => !cycle.res[k]); return i < 0 ? 0 : i; };
  function cycleProbs(k) {
    const ids = cycle.sets[k].slice();
    // a short paper is topped up with already-seen problems so every paper has 7
    if (ids.length < SET_SIZE) shuffle(LIVE.map(p => p.id).filter(id => !ids.includes(id))).slice(0, SET_SIZE - ids.length).forEach(id => ids.push(id));
    return ids.map(id => byId[id]);
  }

  function shell(inner, active = 'trainer') {
    const vals = Object.values(stats);
    const a = vals.reduce((s, x) => s + x.a, 0), c = vals.reduce((s, x) => s + x.c, 0);
    return `<header class="mbar">
      <div class="brand">PHYS161<small>Exam 3 practice</small></div>
      <nav><a href="./" ${active === 'trainer' ? 'aria-current="page"' : ''}>Тест</a><a href="units.html">Units</a></nav>
      <div class="who">${a ? `Record: ${c} / ${a} correct` : 'Practice quiz'}</div>
    </header><div class="mpage">${inner}</div>`;
  }

  // ── start page ──
  function setup() {
    stopTick(); exam = null;
    const cyc = S.mode === 'cycle';
    const pl = cyc ? [] : pool(), n = Math.min(S.count, pl.length), mk = mistakes().length;
    const range = k => { const nos = LIVE.filter(p => p.t === k).map(p => p.no); return `P${Math.min(...nos)}–${Math.max(...nos)}`; };
    const opt = (k, t, d, extra = '') => `<button class="opt" data-mode="${k}" aria-pressed="${S.mode === k}"><span class="dot"></span><span><b>${t}</b> <span class="muted">· ${d}</span></span>${extra}</button>`;
    const seg = (attr, items) => `<span class="seg">${items.map(([v, l]) => `<button data-${attr}="${v}" aria-pressed="${S[attr] === v}">${l}</button>`).join('')}</span>`;
    const done = Object.keys(cycle.res).length, total = cycle.sets.length, nx = nextSet();
    const seen = Object.keys(cycle.res).reduce((s, k) => s + cycle.sets[k].length, 0);

    $app.innerHTML = shell(`
      <div class="crumbs">PHYS161 / Exam 3 / Practice</div>
      <h1>Exam 3 practice quiz</h1>
      <div class="cols"><div>
        <div class="card">
          <h2>Paper</h2>
          <div class="opts">
            ${opt('cycle', 'Review all', `all ${LIVE.length} problems, ${total} papers of ${SET_SIZE}, nothing repeats`, `<span class="r">${seen} / ${LIVE.length} done</span>`)}
            ${opt('mock', 'Random mock', 'random from everything covered', `<span class="r" onclick="event.stopPropagation()">P1 – P<input class="num-in" id="covered" type="number" min="1" max="${MAXNO}" value="${S.covered}" aria-label="Covered up to"></span>`)}
            ${opt('topic', 'By topic', 'only the topics ticked below', `<span class="r">${S.topics.length} ticked</span>`)}
            ${opt('range', 'By range', 'a block of problems', `<span class="r" onclick="event.stopPropagation()">P<input class="num-in" id="from" type="number" min="1" max="${MAXNO}" value="${S.from}" aria-label="From"> – P<input class="num-in" id="to" type="number" min="1" max="${MAXNO}" value="${S.to}" aria-label="To"></span>`)}
            ${opt('mistakes', 'My mistakes', 'problems you got wrong before', `<span class="r">${mk} waiting</span>`)}
          </div>
          <p class="small" style="margin:12px 0 0">Numbering follows the professor's official list. Removed problems (P87, P105, P106, P122, P125) never appear.</p>
        </div>

        ${cyc ? `<div class="card">
          <h2>Review all · paper ${Math.min(nx + 1, total)} of ${total}</h2>
          <div class="cyc-top"><div class="prog"><i style="width:${100 * done / total}%"></i></div><span class="small">${done} of ${total} papers done</span></div>
          <div class="sets">${cycle.sets.map((ids, k) => { const r = cycle.res[k];
            const cls = r ? (r.right / r.n >= 0.6 ? 'done' : 'low') : k === nx ? 'next' : '';
            return `<button class="set ${cls}" data-set="${k}" title="Paper ${k + 1}: ${ids.map(id => 'P' + byId[id].no).join(', ')}"><span class="s1">${k + 1}</span><span class="s2">${r ? `${+r.right.toFixed(1)}/${r.n}` : k === nx ? 'next' : `${ids.length} q`}</span></button>`; }).join('')}</div>
          <p class="small" style="margin:12px 0 0">Each paper mixes topics, like the real exam. Click any paper to sit it again. ${cycle.sets.some(s => s.length < SET_SIZE) ? `Papers with ${Math.min(...cycle.sets.map(s => s.length))} new problems get one already-seen problem added, so every paper has ${SET_SIZE}.` : ''}</p>
          <p style="margin:10px 0 0"><button class="mlink" id="reshuffle">Start a new shuffle</button></p>
          <div class="confirm" id="reshBox" hidden><p style="margin:0 0 12px">Deal all ${LIVE.length} problems into new papers? Your paper scores for this round are cleared (your overall record stays).</p>
            <div class="row"><button class="mbtn" id="reshYes">New shuffle</button><button class="mbtn sec" id="reshNo">Cancel</button></div></div>
        </div>` : ''}

        ${S.mode === 'topic' ? `<div class="card"><h2>Topics</h2><div class="opts">${TOPICS.map(t => `<button class="opt chk" data-topic="${t.k}" aria-pressed="${S.topics.includes(t.k)}"><span class="dot"></span><span>${t.name}</span><span class="r">${range(t.k)}</span></button>`).join('')}</div></div>` : ''}

        <div class="card">
          <h2>Settings</h2>
          <div class="form">
            ${cyc ? '' : `<div class="k">Questions</div><div><input class="num-in" id="count" type="number" min="1" max="30" value="${S.count}" aria-label="Number of questions"></div>`}
            <div class="k">Mode</div><div>${seg('style', [['exam', 'Exam'], ['practice', 'Practice']])} <span class="small">${S.style === 'exam' ? 'no help, marked at the end' : 'check each answer, see the formula'}</span></div>
            <div class="k">Numbers</div><div>${seg('numbers', [['new', 'New'], ['original', 'Original']])}</div>
            <div class="k">Time limit</div><div><select class="msel" id="timer">${[0, 10, 15, 20, 30, 45].map(m => `<option value="${m}" ${+S.timer === m ? 'selected' : ''}>${m ? m + ' min' : 'No limit'}</option>`).join('')}</select></div>
            <div class="k">Accept within</div><div><select class="msel" id="tol">${[0.5, 1, 2, 3].map(t => `<option value="${t}" ${+S.tol === t ? 'selected' : ''}>±${t}%</option>`).join('')}</select></div>
            <div class="k">Answer format</div><div class="small">Number and unit in one box, like the real quiz: <code>25006.249 m/s</code>, <code>3.9e-10 N</code>, <code>2.5*10^-11 N</code></div>
          </div>
        </div>

        <div class="row" style="margin-bottom:22px">
          ${cyc ? `<button class="mbtn" id="start">Start paper ${nx + 1} · ${SET_SIZE} questions</button>`
          : `<button class="mbtn" id="start" ${n ? '' : 'disabled'}>Start attempt · ${n} question${n === 1 ? '' : 's'}</button>
             ${pl.length ? `<span class="small">${pl.length} problems in this pool</span>` : `<span class="warnline">${S.mode === 'mistakes' ? 'No mistakes yet. Do a paper first.' : S.mode === 'topic' ? 'Tick at least one topic.' : 'No problems in that range.'}</span>`}`}
        </div>
        ${record()}
      </div>
      <aside class="navblock"><div class="card"><h3>This quiz</h3>
        <table class="mtable"><tr><th style="width:auto">Problems</th><td>${LIVE.length}</td></tr><tr><th style="width:auto">Removed</th><td>5</td></tr><tr><th style="width:auto">Real exam</th><td>7 questions</td></tr></table>
      </div></aside></div>`);

    $app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; saveS(); setup(); });
    $app.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => { const k = b.dataset.topic; S.topics = S.topics.includes(k) ? S.topics.filter(x => x !== k) : [...S.topics, k]; saveS(); setup(); });
    $app.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { S.style = b.dataset.style; saveS(); setup(); });
    $app.querySelectorAll('[data-numbers]').forEach(b => b.onclick = () => { S.numbers = b.dataset.numbers; saveS(); setup(); });
    $app.querySelectorAll('[data-set]').forEach(b => b.onclick = () => start(cycleProbs(+b.dataset.set), +b.dataset.set));
    const num = (id, key, lo, hi, mode) => { const el = document.getElementById(id); if (!el) return;
      el.onclick = e => e.stopPropagation();
      el.onchange = () => { S[key] = Math.min(hi, Math.max(lo, parseInt(el.value, 10) || lo)); if (mode) S.mode = mode; saveS(); setup(); }; };
    num('covered', 'covered', 1, MAXNO, 'mock'); num('from', 'from', 1, MAXNO, 'range'); num('to', 'to', 1, MAXNO, 'range'); num('count', 'count', 1, 30);
    document.getElementById('timer').onchange = e => { S.timer = +e.target.value; saveS(); };
    document.getElementById('tol').onchange = e => { S.tol = +e.target.value; saveS(); };
    const resh = document.getElementById('reshuffle');
    if (resh) resh.onclick = () => {
      const box = document.getElementById('reshBox'); box.hidden = false;
      document.getElementById('reshYes').onclick = () => { newCycle(); setup(); };
      document.getElementById('reshNo').onclick = () => { box.hidden = true; };
    };
    const reset = document.getElementById('resetStats');
    if (reset) reset.onclick = () => {
      const box = document.getElementById('resetBox'); box.hidden = false;
      document.getElementById('resetYes').onclick = () => { stats = {}; saveStats(); setup(); };
      document.getElementById('resetNo').onclick = () => { box.hidden = true; };
    };
    document.getElementById('start').onclick = () => cyc ? start(cycleProbs(nx), nx) : start(pick(pl, n));
  }

  function record() {
    const total = Object.values(stats).reduce((s, x) => s + x.a, 0);
    if (!total) return `<div class="card"><h2>Your record</h2><p class="small" style="margin:0">Empty so far. After your first paper this shows accuracy per topic, and every miss goes into "My mistakes". Saved in this browser only.</p></div>`;
    const rows = TOPICS.map(t => {
      let a = 0, c = 0; LIVE.filter(p => p.t === t.k).forEach(p => { const s = stats[p.id]; if (s) { a += s.a; c += s.c; } });
      const pct = a ? Math.round(100 * c / a) : 0;
      return `<tr><td>${t.name}</td><td class="bar"><span><i style="width:${pct}%"></i></span></td><td class="p">${a ? pct + '%' : '–'}</td></tr>`;
    }).join('');
    const weak = mistakes().slice(0, 16);
    return `<div class="card"><h2>Your record</h2>
      <table class="rec">${rows}</table>
      ${weak.length ? `<p style="margin:12px 0 0"><span class="small">Redo:</span> ${weak.map(p => 'P' + p.no).join(', ')}</p>` : ''}
      <p style="margin:12px 0 0"><button class="mlink" id="resetStats">Clear record</button></p>
      <div class="confirm" id="resetBox" hidden><p style="margin:0 0 12px">Clear your whole record? This can't be undone.</p>
        <div class="row"><button class="mbtn" id="resetYes">Clear record</button><button class="mbtn sec" id="resetNo">Keep it</button></div></div>
    </div>`;
  }

  // ── attempt ──
  function start(probs, setIdx = null) {
    const qs = probs.map(prob => { const { p, ans } = genParams(prob, S.numbers === 'original'); return { prob, p, ans, html: render(prob, p), user: '', flag: false, checked: null, hint: false, reveal: false, firstWrong: false }; });
    exam = { qs, setIdx, style: S.style, tol: S.tol / 100, limit: +S.timer * 60, t0: Date.now(), done: false };
    drawAttempt(); window.scrollTo({ top: 0 }); startTick();
  }
  function startTick() { stopTick(); tick = setInterval(updClock, 1000); updClock(); }
  function stopTick() { if (tick) clearInterval(tick); tick = null; }
  const hms = s => { s = Math.floor(s); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const minsec = s => { s = Math.round(s); const m = Math.floor(s / 60); return m ? `${m} мин. ${s % 60} сек.` : `${s} сек.`; };
  function updClock() {
    if (!exam) return;
    const el = document.getElementById('clock'); if (!el) return;
    const used = (Date.now() - exam.t0) / 1000;
    if (exam.limit) {
      const left = Math.max(0, exam.limit - used);
      el.innerHTML = `Оставшееся время <b>${hms(left)}</b>`; el.classList.toggle('low', left < 60);
      if (left <= 0 && !exam.done) finish(true);
    } else el.innerHTML = `Прошло времени <b>${hms(used)}</b>`;
  }
  const title = () => exam.setIdx !== null ? `Review all · paper ${exam.setIdx + 1} of ${cycle.sets.length}` : 'Practice attempt';

  function navBlock(review) {
    return `<aside class="navblock"><div class="card">
      <h3>Навигация по тесту</h3>
      ${review ? '' : '<div class="timer" id="clock"></div>'}
      <nav class="qnav" aria-label="Вопросы">${exam.qs.map((x, i) => `<a href="#q${i}" id="nav${i}" aria-label="Вопрос ${i + 1}">${i + 1}</a>`).join('')}</nav>
      ${review ? '<button class="mlink" id="endReview">Закончить обзор</button>' : '<button class="mlink" id="toSummary">Завершить попытку...</button>'}
    </div></aside>`;
  }
  function drawAttempt() {
    const practice = exam.style === 'practice';
    $app.innerHTML = shell(`
      <div class="crumbs">PHYS161 / Exam 3 / ${title()}</div>
      <div class="cols"><div>
        ${exam.qs.map((x, i) => qBlock(x, i, practice)).join('')}
        <div class="row" style="justify-content:flex-end"><button class="mbtn" id="toSummary2">Закончить попытку...</button></div>
      </div>${navBlock(false)}</div>`);
    exam.qs.forEach((x, i) => wireQ(i));
    document.getElementById('toSummary').onclick = summary;
    document.getElementById('toSummary2').onclick = summary;
    wireNav();
    updNav();
  }
  function wireNav() {
    $app.querySelectorAll('.qnav a').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1)).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  const status = x => x.checked === true ? 'Верно' : x.checked === 'part' ? 'Частично правильный' : x.checked === false ? 'Неверно' : x.user.trim() ? 'Ответ сохранен' : 'Пока нет ответа';
  function qBlock(x, i, practice) {
    const pr = x.prob;
    return `<div class="que" id="q${i}">
      <div class="qinfo">
        <div class="qno">Вопрос <b>${i + 1}</b></div>
        <div class="st" id="st${i}">${status(x)}</div>
        <div class="grade">Балл: 1,00</div>
        <button class="flagq" id="flag${i}" aria-pressed="${x.flag}">${FLAG}<span>${x.flag ? 'Убрать отметку' : 'Отметить вопрос'}</span></button>
        <div class="src">P${pr.no} · ${topicName[pr.t]}</div>
      </div>
      <div class="qcontent"><div class="formulation">
        <p>${x.html}</p>
        ${figHtml(pr)}
        <div class="ans"><label for="in${i}">Ответ:</label><input id="in${i}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(x.user)}"></div>
        ${practice ? `<div class="chk-row"><button class="mbtn sec" id="chk${i}">Проверить</button><button class="mlink" id="hb${i}">Formula</button></div>` : ''}
        <div id="fb${i}" aria-live="polite"></div>
        <div class="outcome" id="hint${i}" ${x.hint ? '' : 'hidden'}><p class="rightans">${pr.hint}</p></div>
      </div></div>
    </div>`;
  }
  function wireQ(i) {
    const x = exam.qs[i], inp = document.getElementById('in' + i);
    inp.oninput = () => { x.user = inp.value; x.checked = null; document.getElementById('fb' + i).innerHTML = ''; updNav(); };
    inp.onkeydown = e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      if (exam.style === 'practice') check(i);
      else { const nx = document.getElementById('in' + (i + 1)); if (nx) nx.focus(); else document.getElementById('toSummary2').focus(); }
    };
    document.getElementById('flag' + i).onclick = e => { x.flag = !x.flag; e.currentTarget.setAttribute('aria-pressed', x.flag); e.currentTarget.querySelector('span').textContent = x.flag ? 'Убрать отметку' : 'Отметить вопрос'; updNav(); };
    const chk = document.getElementById('chk' + i); if (chk) chk.onclick = () => check(i);
    const hb = document.getElementById('hb' + i); if (hb) hb.onclick = () => { x.hint = !x.hint; document.getElementById('hint' + i).hidden = !x.hint; };
  }
  function check(i) {
    const x = exam.qs[i], fb = document.getElementById('fb' + i), { v: u, unit } = parseAns(x.user);
    if (u === null) { fb.innerHTML = '<div class="inline-fb no">Write an answer first.</div>'; return; }
    if (Number.isNaN(u)) { fb.innerHTML = '<div class="inline-fb no">Start with a number, then the unit: 2.5e-11 N</div>'; return; }
    const e = relErr(u, x.ans), uok = unitOk(unit, x.prob.unit);
    if (x.checked === null && !(e <= exam.tol && uok)) x.firstWrong = true;
    x.checked = e <= exam.tol ? (uok ? true : 'part') : false;
    if (x.checked === true) fb.innerHTML = `<div class="inline-fb ok">Верно: ${fmtAns(x.ans)} ${x.prob.unit}</div>`;
    else if (x.checked === 'part') fb.innerHTML = `<div class="inline-fb part">Частично правильный: 0,90 из 1,00 (unit: ${x.prob.unit || 'none'})</div>`;
    else {
      const dir = Math.abs(u) > x.ans ? 'too high' : 'too low';
      const off = e < 1 ? `${(e * 100).toFixed(e < 0.1 ? 1 : 0)}%` : `${Math.round(Math.abs(u) / x.ans)}×`;
      const pow = [1e3, 1e-3, 1e2, 1e-2, 1e4, 1e-4, 1e6, 1e-6].some(f => relErr(u * f, x.ans) <= exam.tol) ? ' Right digits, wrong power of 10: km/m, cm/m, g/kg?' : '';
      const msg = `${dir} by ${off}.${pow}`;
      fb.innerHTML = `<div class="inline-fb no">Неверно. ${msg} <button class="mlink" id="rv${i}" style="margin-left:6px">Show answer</button></div>`;
      document.getElementById('rv' + i).onclick = () => { x.reveal = true; fb.innerHTML = `<div class="outcome"><p class="rightans">Один из возможных правильных ответов: ${fmtAns(x.ans, 9)} ${x.prob.unit}</p></div>`; };
    }
    document.getElementById('st' + i).textContent = status(x);
    updNav();
  }
  function updNav() {
    exam.qs.forEach((x, i) => {
      const a = document.getElementById('nav' + i); if (!a) return;
      a.className = (x.checked === true ? 'ok ' : x.checked === 'part' ? 'part ' : x.checked === false ? 'no ' : x.user.trim() ? 'answered ' : '') + (x.flag ? 'flag' : '');
      const st = document.getElementById('st' + i); if (st) st.textContent = status(x);
    });
  }

  // ── attempt summary (before submitting) ──
  function summary() {
    $app.innerHTML = shell(`
      <div class="crumbs">PHYS161 / Exam 3 / ${title()}</div>
      <h1>Сводка попытки</h1>
      <div class="cols"><div><div class="card">
        <table class="mtable list"><tr><th>Вопрос</th><th>Состояние</th><th>Отмечен</th></tr>
        ${exam.qs.map((x, i) => `<tr><td><a href="#" data-go="${i}">${i + 1}</a></td><td class="${x.user.trim() ? '' : 'bad'}">${x.user.trim() ? 'Ответ сохранен' : 'Пока нет ответа'}</td><td>${x.flag ? 'Да' : ''}</td></tr>`).join('')}
        </table>
        <div class="row" style="margin-top:18px;justify-content:center;flex-direction:column">
          <button class="mbtn sec" id="back">Вернуться к попытке</button>
          <button class="mbtn" id="submit">Отправить всё и завершить тест</button>
        </div>
        <div id="confirmBox"></div>
      </div></div>${navBlock(false).replace('<button class="mlink" id="toSummary">Завершить попытку...</button>', '')}</div>`);
    updNav(); updClock();
    const back = i => { drawAttempt(); if (i != null) document.getElementById('q' + i).scrollIntoView({ block: 'start' }); };
    document.getElementById('back').onclick = () => back(null);
    $app.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); back(+a.dataset.go); });
    $app.querySelectorAll('.qnav a').forEach((a, i) => a.onclick = e => { e.preventDefault(); back(i); });
    document.getElementById('submit').onclick = () => {
      const blank = exam.qs.filter(x => !x.user.trim()).length;
      document.getElementById('confirmBox').innerHTML = `<div class="confirm" role="alertdialog" aria-label="Подтверждение">
        <h3>Подтверждение</h3>
        <p style="margin:0 0 14px">${blank ? `Без ответа: ${blank}. ` : ''}После отправки вы больше не сможете изменить свои ответы на этот тест.</p>
        <div class="row"><button class="mbtn" id="yes">Отправить всё и завершить тест</button><button class="mbtn sec" id="no">Отмена</button></div></div>`;
      document.getElementById('yes').onclick = () => finish(false);
      document.getElementById('no').onclick = () => { document.getElementById('confirmBox').innerHTML = ''; };
    };
  }

  // ── review ──
  const when = t => new Date(t).toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function finish(timeUp) {
    if (exam.done) return;
    exam.done = true; stopTick();
    const t1 = Date.now(), used = Math.min((t1 - exam.t0) / 1000, exam.limit || Infinity);
    let right = 0;
    exam.qs.forEach(x => {
      const { v: u, unit } = parseAns(x.user);
      x.u = u; x.unitTyped = unit; x.blank = u === null || Number.isNaN(u);
      x.numOk = !x.blank && relErr(u, x.ans) <= exam.tol;
      x.unitOk = unitOk(unit, x.prob.unit);
      x.ok = x.numOk && x.unitOk;
      x.score = x.ok ? 1 : x.numOk ? 1 - UNIT_PENALTY : 0;
      const credit = x.ok && !(exam.style === 'practice' && (x.reveal || x.firstWrong));
      right += x.score;
      const s = stats[x.prob.id] || { a: 0, c: 0 };
      s.a++; if (credit) s.c++; s.last = credit; stats[x.prob.id] = s;
    });
    saveStats();
    if (exam.setIdx !== null) { cycle.res[exam.setIdx] = { right, n: exam.qs.length, at: t1 }; saveCycle(); }
    const n = exam.qs.length, pct = Math.round(100 * right / n);
    const last = exam.setIdx !== null && Object.keys(cycle.res).length === cycle.sets.length;
    $app.innerHTML = shell(`
      <div class="crumbs">PHYS161 / Exam 3 / ${title()} / Просмотр</div>
      <div class="cols"><div>
        <div class="card" style="padding:0;overflow:hidden"><table class="mtable">
          <tr><th>Тест начат</th><td>${when(exam.t0)}</td></tr>
          <tr><th>Состояние</th><td>Завершены${timeUp ? ' (время истекло)' : ''}</td></tr>
          <tr><th>Завершен</th><td>${when(t1)}</td></tr>
          <tr><th>Прошло времени</th><td>${minsec(used)}</td></tr>
          <tr><th>Баллы</th><td>${fmtNum2(right)}/${fmtNum2(n)}</td></tr>
          <tr><th>Оценка</th><td><b>${pct}</b>%</td></tr>
        </table></div>
        ${last ? `<div class="card"><b>All ${cycle.sets.length} papers done.</b> You have seen every problem once. Redo the red papers, or start a new shuffle from the start page.</div>` : ''}
        <div class="row" style="margin-bottom:22px">
          ${exam.setIdx !== null && !last ? `<button class="mbtn" id="nextPaper">Next paper (${nextSet() + 1})</button>` : ''}
          <button class="mbtn ${exam.setIdx !== null && !last ? 'sec' : ''}" id="again">Same problems, new numbers</button>
          ${exam.qs.some(x => !x.ok) ? '<button class="mbtn sec" id="wrongOnly">Redo the wrong ones</button>' : ''}
          ${exam.setIdx === null ? '<button class="mbtn sec" id="newset">New paper</button>' : ''}
        </div>
        ${exam.qs.map((x, i) => reviewQ(x, i)).join('')}
        <div class="row" style="justify-content:flex-end"><button class="mbtn" id="endReview2">Закончить обзор</button></div>
      </div>${navBlock(true)}</div>`);
    exam.qs.forEach((x, i) => { const a = document.getElementById('nav' + i); a.className = (x.ok ? 'ok' : x.score ? 'part' : 'no') + (x.flag ? ' flag' : ''); });
    wireNav();
    const probs = exam.qs.map(x => x.prob), setIdx = exam.setIdx;
    document.getElementById('again').onclick = () => start(probs, setIdx);
    const np = document.getElementById('nextPaper'); if (np) np.onclick = () => { const k = nextSet(); start(cycleProbs(k), k); };
    const ns = document.getElementById('newset'); if (ns) ns.onclick = () => { const pl = pool(); start(pick(pl, Math.min(S.count, pl.length))); };
    const wo = document.getElementById('wrongOnly'); if (wo) wo.onclick = () => start(exam.qs.filter(x => !x.ok).map(x => x.prob));
    document.getElementById('endReview').onclick = setup;
    document.getElementById('endReview2').onclick = setup;
    window.scrollTo({ top: 0 });
  }
  function reviewQ(x, i) {
    const pr = x.prob;
    const why = x.ok ? '' : x.blank ? (x.user.trim() ? 'The answer has to start with a number.' : 'No answer given.')
      : x.numOk ? `−0,10 for the unit: ${x.unitTyped ? `you wrote "${esc(x.unitTyped)}"` : 'no unit typed'}, expected ${pr.unit || 'no unit'}.`
      : `Off by ${(relErr(x.u, x.ans) * 100).toFixed(2)}%.`;
    return `<div class="que" id="q${i}">
      <div class="qinfo">
        <div class="qno">Вопрос <b>${i + 1}</b></div>
        <div class="st">${x.ok ? 'Верно' : x.score ? 'Частично правильный' : x.blank && !x.user.trim() ? 'Нет ответа' : 'Неверно'}</div>
        <div class="grade">Баллов: ${fmtNum2(x.score)} из 1,00</div>
        ${x.flag ? `<div class="flagq" aria-pressed="true">${FLAG}<span>Отмечен</span></div>` : ''}
        <div class="src">P${pr.no} · ${topicName[pr.t]}</div>
      </div>
      <div class="qcontent">
        <div class="formulation">
          <p>${x.html}</p>
          ${figHtml(pr)}
          <div class="ans"><label>Ответ:</label><input readonly value="${esc(x.user)}" aria-label="Ваш ответ">${x.ok ? ICO_OK : x.score ? ICO_PART : ICO_NO}</div>
          <div class="outcome"><p class="rightans">Один из возможных правильных ответов: ${fmtAns(x.ans, 9)} ${pr.unit}</p>${why ? `<p style="margin-top:6px">${why}</p>` : ''}<div class="formula">${pr.hint}</div></div>
        </div>
        <div class="outcome"><p>${x.ok ? 'Your answer is correct.' : x.score ? 'Your answer is partially correct.' : 'Your answer is incorrect.'}</p></div>
      </div>
    </div>`;
  }

  setup();
})();
