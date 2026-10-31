(() => {
  const $app = document.getElementById('app');
  const topicName = Object.fromEntries(TOPICS.map(t => [t.k, t.name]));
  const MAXID = Math.max(...BANK.map(p => p.id));

  // ── storage (per-viewer convenience only) ──
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };
  const DEF = { mode: 'mock', covered: 150, count: 7, from: 1, to: 20, topics: ['grav'], numbers: 'new', style: 'exam', timer: 15, tol: 1 };
  let S = Object.assign({}, DEF, store.get('set3.settings', {}));
  let stats = store.get('set3.stats', {});
  const saveS = () => store.set('set3.settings', S);
  const saveStats = () => store.set('set3.stats', stats);
  let exam = null, tick = null;

  // ── number formatting ──
  function sci(x, sf) {
    if (x === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = Number((x / 10 ** e).toPrecision(sf));
    if (Math.abs(m) >= 10) { m = Number((m / 10).toPrecision(sf)); e += 1; }
    return `${m} × 10<sup>${String(e).replace('-', '−')}</sup>`;
  }
  const fmtParam = (v, sp) => !sp ? String(v) : sp.sci ? sci(v, sp.sf) : String(Number(v.toPrecision(Math.max(sp.sf, 2))));
  function fmtAns(x) {
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return sci(x, 4);
    return String(Number(x.toPrecision(5)));
  }
  const render = (prob, p) => prob.text.replace(/\{(\w+)\}/g, (_, k) => {
    const s = prob.params[k];
    return `<span class="num">${fmtParam(p[k], s ? spec(s) : null)}</span>`;
  });

  // ── answer parsing ──
  function parseAns(str) {
    let s = String(str).trim().replace(/\s+/g, '').replace(/−/g, '-');
    if (!s) return null;
    if (!s.includes('.') && /^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    s = s.replace(/,/g, '');
    const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(?:(?:[x×*·]10\^?\(?([+-]?\d+)\)?)|(?:e([+-]?\d+)))?$/i);
    if (!m) return NaN;
    const exp = m[2] ?? m[3];
    return parseFloat(m[1]) * (exp !== undefined ? 10 ** parseInt(exp, 10) : 1);
  }
  // ── units: you type them, we accept the usual spellings ──
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
  const showU = u => u || 'no unit';
  const relErr = (u, a) => Math.abs(Math.abs(u) - a) / Math.abs(a);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  // ── pools ──
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const mistakes = () => BANK.filter(p => { const s = stats[p.id]; return s && (s.c < s.a || s.last === false); })
    .sort((a, b) => (stats[a.id].c / stats[a.id].a) - (stats[b.id].c / stats[b.id].a));
  function pool() {
    if (S.mode === 'mock') return BANK.filter(p => p.id <= S.covered);
    if (S.mode === 'topic') return BANK.filter(p => S.topics.includes(p.t));
    if (S.mode === 'range') return BANK.filter(p => p.id >= Math.min(S.from, S.to) && p.id <= Math.max(S.from, S.to));
    return mistakes();
  }
  const pick = (pl, n) => S.mode === 'mistakes' ? shuffle(pl.slice(0, n * 2)).slice(0, n) : shuffle(pl).slice(0, n);

  function header(sub) {
    const vals = Object.values(stats);
    const a = vals.reduce((s, x) => s + x.a, 0), c = vals.reduce((s, x) => s + x.c, 0);
    return `<header class="ph">
      <div class="course">PHYS161 · Physics I <nav class="tabs"><a href="./" aria-current="page">Trainer</a><a href="units.html">Units</a></nav></div>
      <div class="rightc">${a ? `Record: ${c} / ${a} correct` : 'Practice paper'}</div>
      <h1>Set 3 Trainer</h1>
      <div class="instr">${sub}</div>
    </header><hr class="dbl">`;
  }

  // ── cover sheet ──
  function setup() {
    stopTick(); exam = null;
    const pl = pool(), n = Math.min(S.count, pl.length), mk = mistakes().length;
    const range = k => { const ids = BANK.filter(p => p.t === k).map(p => p.id); return `P${ids[0]}–${ids[ids.length - 1]}`; };
    const opt = (k, t, d, extra = '') => `<button class="opt" data-mode="${k}" aria-pressed="${S.mode === k}"><span class="tick"></span><span><span class="t">${t}</span> <span class="d">${d}</span></span><span class="lead"></span>${extra}</button>`;
    const radio = (attr, val, label) => `<button class="radio" data-${attr}="${val}" aria-pressed="${S[attr] === val}"><i></i>${label}</button>`;
    $app.innerHTML = `<div class="paper">
      ${header(`Exam 3 problem pool, P1–P${MAXID}. Same problems as the PDF; only the numbers change.`)}
      <section class="sec">
        <h2><b>1</b> Choose the paper</h2>
        <div>
          ${opt('mock', 'Mock exam', 'random from everything covered', `<span class="r inl" onclick="event.stopPropagation()">P1 – P<input class="uline" id="covered" type="number" min="1" max="${MAXID}" value="${S.covered}" aria-label="Covered up to"></span>`)}
          ${opt('topic', 'By topic', 'only the topics ticked below', `<span class="r">${S.topics.length} ticked</span>`)}
          ${opt('range', 'By range', 'a block of problems', `<span class="r inl" onclick="event.stopPropagation()">P<input class="uline" id="from" type="number" min="1" max="${MAXID}" value="${S.from}" aria-label="From"> – P<input class="uline" id="to" type="number" min="1" max="${MAXID}" value="${S.to}" aria-label="To"></span>`)}
          ${opt('mistakes', 'My mistakes', 'problems you got wrong before', `<span class="r">${mk} waiting</span>`)}
        </div>
      </section>
      <section class="sec" ${S.mode === 'topic' ? '' : 'hidden'}>
        <h2><b>1a</b> Topics</h2>
        <div>${TOPICS.map(t => `<button class="opt" data-topic="${t.k}" aria-pressed="${S.topics.includes(t.k)}"><span class="tick"></span><span class="t" style="font-weight:400">${t.name}</span><span class="lead"></span><span class="r">${range(t.k)}</span></button>`).join('')}</div>
      </section>
      <section class="sec">
        <h2><b>2</b> Conditions</h2>
        <div class="conds">
          <div class="k">Questions</div><div><input class="uline" id="count" type="number" min="1" max="30" value="${S.count}" aria-label="Number of questions"></div>
          <div class="k">Mode</div><div class="radios">${radio('style', 'exam', 'Exam <span class="small">(no help, marked at the end)</span>')}${radio('style', 'practice', 'Practice <span class="small">(check + formula)</span>')}</div>
          <div class="k">Numbers</div><div class="radios">${radio('numbers', 'new', 'New')}${radio('numbers', 'original', 'Original (from the PDF)')}</div>
          <div class="k">Time allowed</div><div><select class="sel" id="timer">${[0, 10, 15, 20, 30, 45].map(m => `<option value="${m}" ${+S.timer === m ? 'selected' : ''}>${m ? m + ' min' : 'No limit'}</option>`).join('')}</select></div>
          <div class="k">Accept within</div><div><select class="sel" id="tol">${[0.5, 1, 2, 3].map(t => `<option value="${t}" ${+S.tol === t ? 'selected' : ''}>±${t}%</option>`).join('')}</select> <span class="small">Answers like 2.5e-11, 2.5*10^-11 or 1638.9, then the unit (m/s2, N, Hz…)</span></div>
        </div>
      </section>
      <div class="begin">
        <button class="btn" id="start" ${n ? '' : 'disabled'}>Begin paper · ${n} question${n === 1 ? '' : 's'}</button>
        ${pl.length ? `<span class="small">${pl.length} problems in this pool</span>`
        : `<span class="warnline">${S.mode === 'mistakes' ? 'No mistakes yet. Do a paper first.' : S.mode === 'topic' ? 'Tick at least one topic.' : 'No problems in that range.'}</span>`}
      </div>
      ${record()}
    </div>`;

    $app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; saveS(); setup(); });
    $app.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => { const k = b.dataset.topic; S.topics = S.topics.includes(k) ? S.topics.filter(x => x !== k) : [...S.topics, k]; saveS(); setup(); });
    $app.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { S.style = b.dataset.style; saveS(); setup(); });
    $app.querySelectorAll('[data-numbers]').forEach(b => b.onclick = () => { S.numbers = b.dataset.numbers; saveS(); setup(); });
    const num = (id, key, lo, hi, mode) => { const el = document.getElementById(id); if (!el) return;
      el.onclick = e => e.stopPropagation();
      el.onchange = () => { S[key] = Math.min(hi, Math.max(lo, parseInt(el.value, 10) || lo)); if (mode) S.mode = mode; saveS(); setup(); }; };
    num('covered', 'covered', 1, MAXID, 'mock'); num('from', 'from', 1, MAXID, 'range'); num('to', 'to', 1, MAXID, 'range'); num('count', 'count', 1, 30);
    document.getElementById('timer').onchange = e => { S.timer = +e.target.value; saveS(); };
    document.getElementById('tol').onchange = e => { S.tol = +e.target.value; saveS(); };
    const reset = document.getElementById('resetStats');
    if (reset) reset.onclick = () => {
      const box = document.getElementById('resetBox'); box.hidden = false;
      document.getElementById('resetYes').onclick = () => { stats = {}; saveStats(); setup(); };
      document.getElementById('resetNo').onclick = () => { box.hidden = true; };
    };
    document.getElementById('start').onclick = () => start(pick(pl, n));
  }

  function record() {
    const total = Object.values(stats).reduce((s, x) => s + x.a, 0);
    if (!total) return `<section class="sec"><h2><b>3</b> Your record</h2><p class="small" style="margin:0">Empty so far. After your first paper this shows your accuracy per topic, and every problem you miss goes into "My mistakes". Saved in this browser only.</p></section>`;
    const rows = TOPICS.map(t => {
      let a = 0, c = 0; BANK.filter(p => p.t === t.k).forEach(p => { const s = stats[p.id]; if (s) { a += s.a; c += s.c; } });
      const pct = a ? Math.round(100 * c / a) : 0;
      return `<tr><td>${t.name}</td><td class="bar"><span><i style="width:${pct}%"></i></span></td><td class="p">${a ? pct + '%' : '–'}</td></tr>`;
    }).join('');
    const weak = mistakes().slice(0, 16);
    return `<section class="sec"><h2><b>3</b> Your record</h2>
      <table class="rec">${rows}</table>
      ${weak.length ? `<p style="margin:12px 0 0"><span class="small">Redo:</span> <span class="redo">${weak.map(p => 'P' + p.id).join(', ')}</span></p>` : ''}
      <p style="margin:12px 0 0"><button class="link" id="resetStats">Clear record</button></p>
      <div class="handin" id="resetBox" hidden><p>Clear your whole record? This can't be undone.</p>
        <div class="actions" style="margin:0"><button class="btn" id="resetYes">Clear record</button><button class="btn ghost" id="resetNo">Keep it</button></div></div>
    </section>`;
  }

  // ── exam ──
  function start(probs) {
    const qs = probs.map(prob => { const { p, ans } = genParams(prob, S.numbers === 'original'); return { prob, p, ans, html: render(prob, p), user: '', unit: '', flag: false, checked: null, hint: false, reveal: false, firstWrong: false }; });
    exam = { qs, style: S.style, tol: S.tol / 100, limit: +S.timer * 60, t0: Date.now(), done: false };
    drawExam(); window.scrollTo({ top: 0 }); startTick();
  }
  function startTick() { stopTick(); tick = setInterval(updClock, 1000); updClock(); }
  function stopTick() { if (tick) clearInterval(tick); tick = null; }
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function updClock() {
    if (!exam) return;
    const el = document.getElementById('clock'); if (!el) return;
    const used = (Date.now() - exam.t0) / 1000;
    if (exam.limit) {
      const left = Math.max(0, exam.limit - used);
      el.textContent = mmss(left) + ' left'; el.classList.toggle('low', left < 60);
      if (left <= 0 && !exam.done) finish(true);
    } else el.textContent = mmss(used);
  }

  function drawExam() {
    const practice = exam.style === 'practice';
    $app.innerHTML = `
      <div class="strip">
        <nav class="boxes" aria-label="Questions">${exam.qs.map((x, i) => `<a href="#q${i}" id="nav${i}">${i + 1}</a>`).join('')}</nav>
        <span class="clock" id="clock"></span>
        <button class="btn" id="finish">Hand in</button>
      </div>
      <div class="examwrap"><div class="paper">
        ${exam.qs.map((x, i) => qBlock(x, i, practice)).join('')}
        <div id="confirmBox"></div>
      </div></div>`;
    exam.qs.forEach((x, i) => wireQ(i));
    document.getElementById('finish').onclick = askFinish;
    $app.querySelectorAll('.boxes a').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1)).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    updNav();
  }
  function qBlock(x, i, practice) {
    const pr = x.prob;
    return `<article class="q" id="q${i}">
      <div class="mg"><span class="n">${i + 1}</span><span class="src">P${pr.id}</span></div>
      <div class="body">
        <div class="topic"><span>${topicName[pr.t]}</span><button class="flagb" id="flag${i}" aria-pressed="${x.flag}">${x.flag ? '⚑ Flagged' : 'Flag for review'}</button></div>
        <p class="stmt">${x.html}</p>
        ${pr.fig ? `<div class="fig">Figure: ${pr.fig}</div>` : ''}
        <div class="ansrow">
          <label class="abox"><span class="lab">Answer</span><input id="in${i}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(x.user)}" aria-label="Answer to question ${i + 1}"><input class="u" id="un${i}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="unit" value="${esc(x.unit)}" aria-label="Unit for question ${i + 1}"></label>
          ${practice ? `<div class="tools"><button class="link" id="chk${i}">Check</button><button class="link" id="hb${i}">Formula</button></div>` : ''}
        </div>
        <div id="fb${i}" aria-live="polite"></div>
        <div class="sheet" id="hint${i}" ${x.hint ? '' : 'hidden'}>${pr.hint}</div>
      </div>
    </article>`;
  }
  function wireQ(i) {
    const x = exam.qs[i], inp = document.getElementById('in' + i);
    inp.oninput = () => { x.user = inp.value; x.checked = null; document.getElementById('fb' + i).innerHTML = ''; updNav(); };
    const un = document.getElementById('un' + i);
    un.oninput = () => { x.unit = un.value; x.checked = null; document.getElementById('fb' + i).innerHTML = ''; updNav(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); un.focus(); } };
    un.onkeydown = e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      if (exam.style === 'practice') check(i);
      else { const nx = document.getElementById('in' + (i + 1)); (nx || document.getElementById('finish')).focus(); }
    };
    document.getElementById('flag' + i).onclick = e => { x.flag = !x.flag; e.currentTarget.setAttribute('aria-pressed', x.flag); e.currentTarget.textContent = x.flag ? '⚑ Flagged' : 'Flag for review'; updNav(); };
    const chk = document.getElementById('chk' + i); if (chk) chk.onclick = () => check(i);
    const hb = document.getElementById('hb' + i); if (hb) hb.onclick = () => { x.hint = !x.hint; document.getElementById('hint' + i).hidden = !x.hint; };
  }
  function check(i) {
    const x = exam.qs[i], fb = document.getElementById('fb' + i), u = parseAns(x.user);
    if (u === null) { fb.innerHTML = '<div class="warn">Write an answer first.</div>'; return; }
    if (Number.isNaN(u)) { fb.innerHTML = '<div class="warn">Write a plain number, like 2.5e-11 or 2.5*10^-11.</div>'; return; }
    const e = relErr(u, x.ans), uok = unitOk(x.unit, x.prob.unit);
    if (e <= exam.tol && uok) { x.checked = true; fb.innerHTML = `<div class="pen">✓ Correct, ${fmtAns(x.ans)} ${x.prob.unit}</div>`; }
    else if (e <= exam.tol) {
      if (x.checked === null) x.firstWrong = true;
      x.checked = false;
      fb.innerHTML = `<div class="pen">✗ Number right, unit wrong. <button class="link" id="rv${i}" style="margin-left:8px;color:var(--ink)">Show unit</button> <a class="link" href="units.html" target="_blank" style="margin-left:8px;color:var(--ink)">Units page</a></div>`;
      document.getElementById('rv' + i).onclick = () => { x.reveal = true; fb.innerHTML = `<div class="pen">→ ${showU(x.prob.unit)}</div>`; };
    }
    else {
      if (x.checked === null) x.firstWrong = true;
      x.checked = false;
      const dir = Math.abs(u) > x.ans ? 'too high' : 'too low';
      const off = e < 1 ? `${(e * 100).toFixed(e < 0.1 ? 1 : 0)}%` : `${Math.round(Math.abs(u) / x.ans)}×`;
      const units = [1e3, 1e-3, 1e2, 1e-2, 1e6, 1e-6].some(f => relErr(u * f, x.ans) <= exam.tol) ? ' Right digits, wrong units: km/m, cm/m, g/kg?' : '';
      fb.innerHTML = `<div class="pen">✗ ${dir} by ${off}.${units} <button class="link" id="rv${i}" style="margin-left:8px;color:var(--ink)">Show answer</button></div>`;
      document.getElementById('rv' + i).onclick = () => { x.reveal = true; fb.innerHTML = `<div class="pen">→ ${fmtAns(x.ans)} ${x.prob.unit}</div>`; };
    }
    updNav();
  }
  function updNav() {
    exam.qs.forEach((x, i) => {
      const a = document.getElementById('nav' + i); if (!a) return;
      a.className = (x.checked === true ? 'ok ' : x.checked === false ? 'no ' : x.user.trim() ? 'done ' : '') + (x.flag ? 'flag' : '');
      a.textContent = x.checked === true ? '✓' : x.checked === false ? '✗' : i + 1;
    });
  }
  function askFinish() {
    const blank = exam.qs.filter(x => !x.user.trim()).length, flagged = exam.qs.filter(x => x.flag).length;
    const parts = []; if (blank) parts.push(`${blank} unanswered`); if (flagged) parts.push(`${flagged} flagged`);
    const box = document.getElementById('confirmBox');
    box.innerHTML = `<div class="handin" role="alertdialog" aria-label="Hand in">
      <p>${parts.length ? `You still have ${parts.join(' and ')}. ` : 'All questions answered. '}Hand in the paper for marking?</p>
      <div class="actions" style="margin:0"><button class="btn" id="yes">Hand in and mark</button><button class="btn ghost" id="no">Keep working</button></div></div>`;
    document.getElementById('yes').onclick = () => finish(false);
    document.getElementById('no').onclick = () => { box.innerHTML = ''; };
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── marked paper ──
  function finish(timeUp) {
    if (exam.done) return;
    exam.done = true; stopTick();
    const used = Math.min((Date.now() - exam.t0) / 1000, exam.limit || Infinity);
    let right = 0;
    exam.qs.forEach(x => {
      const u = parseAns(x.user);
      x.u = u; x.blank = u === null || Number.isNaN(u);
      x.numOk = !x.blank && relErr(u, x.ans) <= exam.tol;
      x.unitOk = unitOk(x.unit, x.prob.unit);
      x.ok = x.numOk && x.unitOk;
      const credit = x.ok && !(exam.style === 'practice' && (x.reveal || x.firstWrong));
      if (x.ok) right++;
      const s = stats[x.prob.id] || { a: 0, c: 0 };
      s.a++; if (credit) s.c++; s.last = credit; stats[x.prob.id] = s;
    });
    saveStats();
    const n = exam.qs.length, pct = Math.round(100 * right / n);
    const remark = pct === 100 ? 'Full marks.' : pct >= 85 ? 'Very good.' : pct >= 60 ? 'Getting there. Redo the crossed ones.' : 'Go back over the formulas below.';
    $app.innerHTML = `<div class="paper">
      ${header(timeUp ? 'Time was up, so the paper was handed in automatically.' : `Marked. Answers within ±${exam.tol * 100}% of the key count as correct.`)}
      <div class="total">
        <div class="circle">${right}/${n}</div>
        <div class="meta"><span class="pen">${pct}%. ${remark}</span><span class="small">Time ${mmss(used)}${exam.limit ? ' of ' + mmss(exam.limit) : ''} · ${exam.style === 'exam' ? 'Exam' : 'Practice'} mode</span></div>
      </div>
      <div class="actions">
        <button class="btn" id="again">Same problems, new numbers</button>
        ${exam.qs.some(x => !x.ok) ? '<button class="btn ghost" id="wrongOnly">Redo the wrong ones</button>' : ''}
        <button class="btn ghost" id="newset">New paper</button>
        <button class="btn ghost" id="back">Cover sheet</button>
      </div>
      <div style="margin-top:14px">${exam.qs.map((x, i) => marked(x, i)).join('')}</div>
    </div>`;
    const probs = exam.qs.map(x => x.prob);
    document.getElementById('again').onclick = () => start(probs);
    document.getElementById('newset').onclick = () => { const pl = pool(); start(pick(pl, Math.min(S.count, pl.length))); };
    const wo = document.getElementById('wrongOnly'); if (wo) wo.onclick = () => start(exam.qs.filter(x => !x.ok).map(x => x.prob));
    document.getElementById('back').onclick = setup;
    window.scrollTo({ top: 0 });
  }
  function marked(x, i) {
    const mark = x.ok ? '✓' : '✗';
    const yours = x.blank ? (x.user.trim() ? esc(x.user) : '<i class="small">blank</i>') : `${fmtAns(x.u)}`;
    const ut = x.unit.trim() ? esc(x.unit) : '<i class="small">no unit</i>';
    const off = x.blank ? '' : `<span><b>Off by</b><span class="num">${(relErr(x.u, x.ans) * 100).toFixed(2)}%</span></span>`;
    return `<article class="q">
      <div class="mg"><span class="n">${i + 1}</span><span class="src">P${x.prob.id}</span><span class="mark" aria-label="${x.ok ? 'Correct' : 'Wrong'}">${mark}</span></div>
      <div class="body">
        <div class="topic"><span>${topicName[x.prob.t]}</span></div>
        <p class="stmt">${x.html}</p>
        <div class="cmp">
          <span><b>Yours</b><span class="num ${x.numOk ? '' : 'struck'}">${yours}</span> <span class="num ${x.unitOk ? '' : 'struck'}">${ut}</span></span>
          ${x.ok ? '' : `<span class="pen">→ ${fmtAns(x.ans)} ${showU(x.prob.unit)}${x.numOk && !x.unitOk ? ' (unit!)' : ''}</span>`}
          ${off}
        </div>
        <div class="sheet">${x.prob.hint}</div>
      </div>
    </article>`;
  }

  setup();
})();
