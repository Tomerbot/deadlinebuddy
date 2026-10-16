// DeadlineBuddy UI: the smart-display screen, the conversation, and the agent trace.
// agent.js (loaded first) provides D, mins, exampleState, respond, nextDay, todayBlocks, active, capFor, DAY_NAMES.

const params = new URLSearchParams(location.search);
const KEY = 'deadlinebuddy-v1';
const startDate = params.get('date') || new Date().toISOString().slice(0, 10);
const quiet = params.has('quiet');
const $ = id => document.getElementById(id);

let s = load();
let cardMode = 'week';
let focus = null;

function load() {
  if (!params.has('fresh')) {
    try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved && saved.tasks) return { ...saved, welcomeBack: true }; } catch (e) { /* storage blocked: start fresh */ }
  }
  return exampleState(startDate);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...s, welcomeBack: undefined })); } catch (e) { /* not saved */ } }

// ---------- conversation ----------
function addMsg(who, text) {
  s.chat.push({ who, text });
  if (s.chat.length > 30) s.chat.shift();
}
function handle(input) {
  if (!input.trim()) return;
  addMsg('you', input.trim());
  const r = respond(s, input);
  answer(r);
}
function answer(r) {
  addMsg('buddy', r.say);
  cardMode = r.card || 'week';
  focus = r.focus || null;
  showNotice(r.notice);
  speak(r.say);
  save();
  render();
}
function speak(text) {
  const bar = $('voicebar');
  bar.classList.remove('talking'); void bar.offsetWidth; bar.classList.add('talking');
  setTimeout(() => bar.classList.remove('talking'), Math.min(6000, 900 + text.length * 35));
  if (quiet || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.speak(u);
}
function showNotice(kind) {
  const n = $('notice');
  if (!kind) { n.hidden = true; return; }
  n.hidden = false;
  n.className = 'notice ' + kind;
  n.textContent = kind === 'behind' ? 'You fell behind. Your week was re-planned.' : 'Re-planned overnight';
}

// ---------- rendering ----------
function render() {
  $('clock-date').textContent = D.nice(s.today);
  renderCard(); renderWeek(); renderChat(); renderTrace(); renderMemory(); renderChips();
}

function lastBuddyLine() {
  for (let i = s.chat.length - 1; i >= 0; i--) if (s.chat[i].who === 'buddy') return s.chat[i].text;
  return '';
}

function renderCard() {
  const card = $('card');
  const line = lastBuddyLine() || 'Tell me what is due. I will plan your days.';
  if (cardMode === 'today') {
    const blocks = todayBlocks(s);
    const left = blocks.filter(b => !b.done).reduce((a, b) => a + b.min, 0);
    card.innerHTML = `
      <div class="card-head"><h1>Today</h1><span class="big-min">${left ? mins(left) + ' left' : 'All done'}</span></div>
      <ul class="today-list">${blocks.length ? blocks.map(b => `
        <li class="${b.done ? 'done' : ''}" style="--c:${b.t.color}">
          <span class="tick" aria-hidden="true">${b.done ? '✓' : ''}</span>
          <span class="name">${esc(b.t.name)}</span>
          <span class="len">${mins(b.min)}</span>
          <span class="due">due ${DAY_NAMES[D.dow(b.t.due)].slice(0, 3)}</span>
        </li>`).join('') : '<li class="empty">Nothing planned today</li>'}</ul>
      <p class="said">${esc(line)}</p>`;
  } else {
    card.innerHTML = `<p class="said lead">${esc(line)}</p>`;
  }
}

function renderWeek() {
  const days = [];
  const first = D.add(s.today, -1);
  for (let i = 0; i < 7; i++) days.push(D.add(first, i));
  const total = d => (s.plan[d] || []).reduce((a, b) => a + b.min, 0);
  const maxCap = Math.max(s.capacity, ...days.map(total), 60) * 1.3; // headroom for deadline flags
  $('week').innerHTML = days.map(d => {
    const blocks = s.plan[d] || [];
    const cap = capFor(s, d);
    const busy = s.busy[D.dow(d)];
    const dues = s.tasks.filter(t => t.due === d);
    const past = d < s.today;
    const bars = blocks.map(b => {
      const t = s.tasks.find(x => x.id === b.task);
      if (!t) return '';
      const cls = [b.done ? 'done' : '', past && !b.done ? 'missed' : '', focus === t.id ? 'focus' : ''].join(' ');
      return `<div class="blk ${cls}" style="--c:${t.color};height:${(b.min / maxCap) * 100}%" title="${esc(t.name)} ${mins(b.min)}"><span>${b.min >= 45 ? mins(b.min) : ''}</span></div>`;
    }).join('');
    return `<div class="day ${d === s.today ? 'is-today' : ''} ${past ? 'past' : ''}">
      <div class="col">
        <div class="cap" style="height:${(cap / maxCap) * 100}%"></div>
        <div class="stack">${bars}</div>
        ${dues.map(t => `<div class="flag" style="--c:${t.color}">${esc(t.name)}</div>`).join('')}
      </div>
      <div class="lbl"><b>${D.short(d)}</b> ${D.parse(d).getUTCDate()}${busy ? `<i>${esc(busy.label.split(' ')[0])}</i>` : ''}</div>
    </div>`;
  }).join('');
}

function renderChat() {
  const c = $('chat');
  c.innerHTML = s.chat.map(m => `<p class="msg ${m.who}">${esc(m.text)}</p>`).join('');
  c.scrollTop = c.scrollHeight;
  requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

function renderTrace() {
  const items = s.trace.slice(-4).reverse();
  $('trace').innerHTML = items.length ? items.map(t => `<li><code>${t.tool}</code><span>${traceText(t)}</span></li>`).join('')
    : '<li class="empty">Every tool the agent calls shows up here.</li>';
}
function traceText(t) {
  const a = t.args, r = t.result;
  switch (t.tool) {
    case 'planner.create_task': return `${esc(a.name)}, ${mins(a.est)}, due ${D.short(a.due)} → ${r.blocks} day${r.blocks === 1 ? '' : 's'}${r.short ? `, ${mins(r.short)} short` : ''}`;
    case 'planner.replan': return r.short ? `re-planned, ${mins(r.short)} short` : 're-planned, everything fits';
    case 'planner.complete_block': return r.ok ? `${mins(r.min)} marked done` : 'nothing to mark';
    case 'memory.set_busy_day': return `${DAY_NAMES[a.dow]}s: ${esc(a.label)}, max ${mins(a.cap)}`;
    case 'memory.set_daily_limit': return `normal day = ${mins(a.minutes)}`;
    case 'planner.cancel_task': return 'task removed';
    case 'reminders.schedule': return `${D.short(a.at.slice(0, 10))} ${a.at.slice(11)}: ${esc(a.text)}`;
    default: return '';
  }
}

function renderMemory() {
  const items = [`A normal day has ${mins(s.capacity)} for schoolwork`];
  for (const [dow, b] of Object.entries(s.busy)) items.push(`${DAY_NAMES[dow]}s: ${b.label}, so only ${mins(b.cap)}`);
  for (const t of active(s)) items.push(`${t.name}: ${mins(t.done)} of ${mins(t.est)} done, due ${D.short(t.due)}`);
  $('memory').innerHTML = items.map(i => `<li>${esc(i)}</li>`).join('');
}

const CHIPS = [
  ['chip-add', 'I have a science fair project due Friday, about 5 hours'],
  ['chip-today', 'What should I do today?'],
  ['chip-extend', 'Extend my day'],
  ['chip-status', 'How am I doing?'],
];
function renderChips() {
  $('chips').innerHTML = CHIPS.map(([id, t]) => `<button type="button" id="${id}" class="chip">${esc(t)}</button>`).join('');
}

function esc(x) { return String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- events ----------
$('ask').addEventListener('submit', e => { e.preventDefault(); const v = $('say').value; $('say').value = ''; handle(v); });
$('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) handle(b.textContent); });
$('next-day').addEventListener('click', () => answer(nextDay(s)));
$('reset').addEventListener('click', () => {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  s = exampleState(startDate); cardMode = 'week'; showNotice(null); greet(); render();
});

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Rec) {
  const rec = new Rec(); rec.lang = 'en-US'; rec.interimResults = false;
  rec.onresult = e => handle(e.results[0][0].transcript);
  rec.onend = () => $('mic').classList.remove('on');
  $('mic').addEventListener('click', () => { $('mic').classList.add('on'); rec.start(); });
} else {
  $('mic').disabled = true; $('mic').title = 'Voice input needs Chrome or Edge. Type instead.';
}

function greet() {
  if (s.welcomeBack) {
    const left = todayBlocks(s).filter(b => !b.done).reduce((a, b) => a + b.min, 0);
    addMsg('buddy', `Welcome back. I still remember your week: ${active(s).length} thing${active(s).length === 1 ? '' : 's'} due, ${left ? mins(left) + ' planned for today' : 'nothing left for today'}.`);
    s.welcomeBack = false;
  } else if (!s.chat.length) {
    const t = active(s)[0];
    addMsg('buddy', t ? `Hi! Your ${t.name} is on ${DAY_NAMES[D.dow(t.due)]}, and I already planned it around soccer on Tuesday. What else is coming up?` : 'Hi! What is due this week?');
  }
}
greet();
save();
render();
if (document.fonts) document.fonts.ready.then(renderChat); // web fonts change line heights after the first paint
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
