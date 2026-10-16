// DeadlineBuddy agent: understands what you say, calls planner tools, and answers.
// Runs fully in the browser. Each tool has a name, input and result (shaped like MCP tools),
// so the same tools could be served by a real Alexa+ MCP server later.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const STEP = 15; // plan in 15-minute blocks
const COLORS = ['#0E9AA0', '#5B4B8A', '#D9822B', '#2F7D4F', '#B5487A'];

// ---------- dates (plain 'YYYY-MM-DD' strings, UTC math so time zones never shift a day) ----------
const D = {
  parse: s => new Date(s + 'T00:00:00Z'),
  str: d => d.toISOString().slice(0, 10),
  add: (s, n) => { const d = D.parse(s); d.setUTCDate(d.getUTCDate() + n); return D.str(d); },
  dow: s => D.parse(s).getUTCDay(),
  diff: (a, b) => Math.round((D.parse(b) - D.parse(a)) / 864e5),
  short: s => DAY_NAMES[D.dow(s)].slice(0, 3),
  nice: s => `${DAY_NAMES[D.dow(s)]}, ${MONTHS[D.parse(s).getUTCMonth()].replace(/^./, c => c.toUpperCase())} ${D.parse(s).getUTCDate()}`,
};

function mins(m) {
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  if (!r) return h === 1 ? '1 hour' : `${h} hours`;
  return `${h}h ${r}m`;
}
const up15 = m => Math.ceil(m / STEP) * STEP;

// ---------- state ----------
function exampleState(today) {
  // The app opens with a finished example: soccer on Tuesdays is remembered,
  // and a math test on Wednesday is already planned.
  const s = {
    today, capacity: 120,
    busy: { 2: { label: 'soccer practice', cap: 30 } },
    tasks: [], plan: {}, trace: [], chat: [], nextId: 1, missed: 0,
  };
  addTask(s, { name: 'Math test', due: D.add(today, dueOffset(today, 3)), est: 120, kind: 'test' });
  replan(s);
  s.trace = [];
  return s;
}
// Days until the next given weekday (never today).
function dueOffset(today, dow) { const n = (dow - D.dow(today) + 7) % 7; return n || 7; }

function addTask(s, t) {
  const task = { id: s.nextId++, name: t.name, due: t.due, est: t.est, done: 0, kind: t.kind || 'task',
                 color: COLORS[(s.nextId - 2) % COLORS.length] };
  s.tasks.push(task);
  return task;
}
const remaining = t => Math.max(0, t.est - t.done);
const active = s => s.tasks.filter(t => remaining(t) > 0 && t.due > s.today);
const capFor = (s, day) => (s.busy[D.dow(day)] ? s.busy[D.dow(day)].cap : s.capacity);

// Earliest deadline first. Spread each task evenly over the days before it's due,
// filling only the free time left on each day. Finished blocks from today are kept.
function replan(s) {
  const keep = (s.plan[s.today] || []).filter(b => b.done);
  for (const day of Object.keys(s.plan)) if (day >= s.today) delete s.plan[day];
  s.plan[s.today] = keep;
  const free = {};
  const freeOn = day => (day in free ? free[day]
    : (free[day] = capFor(s, day) - (s.plan[day] || []).reduce((a, b) => a + b.min, 0)));
  const short = [];
  const todo = active(s).sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  for (const t of todo) {
    let left = remaining(t);
    const days = [];
    for (let d = s.today; d < t.due; d = D.add(d, 1)) days.push(d);
    while (left > 0) {
      const open = days.filter(d => freeOn(d) > 0);
      if (!open.length) break;
      const share = up15(left / open.length);
      for (const d of open) {
        const give = Math.min(share, freeOn(d), left);
        if (give <= 0) continue;
        const list = (s.plan[d] = s.plan[d] || []);
        const same = list.find(b => b.task === t.id && !b.done);
        if (same) same.min += give; else list.push({ task: t.id, min: give, done: false });
        free[d] -= give; left -= give;
        if (!left) break;
      }
    }
    if (left > 0) short.push({ task: t, min: left });
  }
  s.short = short;
  return short;
}

function todayBlocks(s) {
  return (s.plan[s.today] || []).map(b => ({ ...b, t: s.tasks.find(t => t.id === b.task) }));
}

// ---------- tools (what the agent can do) ----------
const TOOLS = {
  'planner.create_task'(s, a) { const t = addTask(s, a); const short = replan(s); return { id: t.id, blocks: daysFor(s, t).length, short: short.find(x => x.task === t)?.min || 0 }; },
  'planner.replan'(s) { const short = replan(s); return { short: short.reduce((a, b) => a + b.min, 0) }; },
  'planner.complete_block'(s, a) {
    const b = (s.plan[s.today] || []).find(x => x.task === a.task && !x.done);
    if (!b) return { ok: false };
    b.done = true; s.tasks.find(t => t.id === a.task).done += b.min; return { ok: true, min: b.min };
  },
  'memory.set_busy_day'(s, a) { s.busy[a.dow] = { label: a.label, cap: a.cap }; replan(s); return { ok: true }; },
  'memory.set_daily_limit'(s, a) { s.capacity = a.minutes; replan(s); return { ok: true, minutes: a.minutes }; },
  'planner.cancel_task'(s, a) { s.tasks = s.tasks.filter(t => t.id !== a.task); replan(s); return { ok: true }; },
  'reminders.schedule'(s, a) { return { at: a.at, text: a.text }; },
};
function call(s, name, args = {}) {
  const result = TOOLS[name](s, args);
  s.trace.push({ tool: name, args, result, day: s.today });
  if (s.trace.length > 40) s.trace.shift();
  return result;
}
function daysFor(s, t) { return Object.keys(s.plan).sort().filter(d => s.plan[d].some(b => b.task === t.id)); }

// ---------- understanding what was said ----------
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5 };

function parseDue(text, today) {
  const t = text.toLowerCase();
  if (/\btoday\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return D.add(today, 1);
  let m = t.match(/\bin (\d+|\w+) days?\b/);
  if (m) return D.add(today, +m[1] || NUM[m[1]] || 1);
  if (/\bnext week\b/.test(t)) return D.add(today, 7);
  m = t.match(/\b(next )?(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\b/);
  if (m) {
    const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[2].slice(0, 3));
    return D.add(today, dueOffset(today, dow) + (m[1] && dueOffset(today, dow) < 7 ? 7 : 0));
  }
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})/);
  if (m) {
    let y = +today.slice(0, 4);
    let s = `${y}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (s < today) s = `${y + 1}${s.slice(4)}`;
    return s;
  }
  return null;
}

function parseMinutes(text) {
  const t = text.toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:and a half\s*)?(hours?|hrs?|h\b|minutes?|mins?)/);
  if (!m) return null;
  let n = parseFloat(m[1]); if (isNaN(n)) n = NUM[m[1]];
  if (/and a half/.test(m[0])) n += 0.5;
  return up15(/^m/.test(m[2]) ? n : n * 60);
}

function guessKind(name) {
  const n = name.toLowerCase();
  if (/test|exam|quiz|midterm|final/.test(n)) return ['test', 180];
  if (/project|fair|presentation|model/.test(n)) return ['project', 300];
  if (/essay|report|paper|book/.test(n)) return ['essay', 240];
  return ['task', 90];
}

function cleanName(raw) {
  let n = raw.replace(/^(a|an|my|the|this|that|our)\s+/i, '').replace(/\s+(that|which|and it|it'?ll|it will|it takes).*$/i, '').trim();
  n = n.replace(/\b(to (do|finish|study for))\b/i, '').trim();
  return n.replace(/^./, c => c.toUpperCase());
}

function findTask(s, text) {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  let best = null, score = 0;
  for (const t of s.tasks) {
    const tw = t.name.toLowerCase().match(/[a-z]{3,}/g) || [];
    const hit = words.filter(w => tw.some(x => x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4)))).length;
    if (hit > score) { best = t; score = hit; }
  }
  return best;
}

// ---------- the agent ----------
// Returns { say, card } where card tells the screen what to show.
function respond(s, input) {
  const text = input.replace(/^(hey |ok |okay )?alexa[,!.]?\s*/i, '').trim();
  const low = text.toLowerCase();

  // Remember a busy day: "remember I have piano on Thursdays"
  let m = low.match(/(?:remember|note) (?:that )?i (?:have|'ve got|go to|got) (.+?) (?:on|every) (sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?s?\b/);
  if (m) {
    const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[2].slice(0, 3));
    call(s, 'memory.set_busy_day', { dow, label: m[1], cap: 30 });
    return { say: `Got it. ${DAY_NAMES[dow]}s are ${m[1]} days, so I'll keep them to 30 minutes of work.`, card: 'week' };
  }

  // Daily limit: "I can do 2 hours a day", "extend my day"
  m = low.match(/(?:i can (?:do|work)|limit (?:me )?to|up to) (.+?) (?:a|per|each) day/);
  if (m || /extend my day|more time (a|per|each) day|add (more )?time/.test(low)) {
    const want = m ? parseMinutes(m[1]) : s.capacity + Math.max(30, up15((s.short || []).reduce((a, b) => a + b.min, 0) / Math.max(1, workDaysLeft(s))));
    call(s, 'memory.set_daily_limit', { minutes: want });
    const short = (s.short || []).reduce((a, b) => a + b.min, 0);
    return { say: `Done. Your normal day is now ${mins(want)}.` + (short ? ` It still doesn't all fit: ${mins(short)} short.` : ' Everything fits before its deadline now.'), card: 'week' };
  }

  // Cancel: "cancel the math test"
  if (/^(cancel|delete|remove|forget)\b/.test(low)) {
    const t = findTask(s, low);
    if (!t) return { say: "I couldn't find that one. Say its name, like \"cancel math test\".", card: 'week' };
    call(s, 'planner.cancel_task', { task: t.id });
    return { say: `Removed ${t.name} and re-planned your week.`, card: 'week' };
  }

  // Done: "I finished studying for math", "done with today's science"
  if (/\b(finished|done|did|completed|complete)\b/.test(low)) {
    const blocks = todayBlocks(s).filter(b => !b.done);
    if (!blocks.length) return { say: "Nothing left on today's list. Nice.", card: 'today' };
    const all = /everything|all of it|all done|both/.test(low);
    const targets = all ? blocks : [blocks.find(b => b.t === findTask(s, low)) || (blocks.length === 1 ? blocks[0] : null)].filter(Boolean);
    if (!targets.length) return { say: `Which one? Today you have ${blocks.map(b => b.t.name).join(' and ')}.`, card: 'today' };
    for (const b of targets) call(s, 'planner.complete_block', { task: b.task });
    const left = todayBlocks(s).filter(b => !b.done);
    const total = targets.reduce((a, b) => a + b.min, 0);
    return { say: `Nice work. That's ${mins(total)} of ${targets.map(b => b.t.name).join(' and ')} done.` +
      (left.length ? ` Still on today's list: ${left.map(b => `${b.t.name}, ${mins(b.min)}`).join('; ')}.` : ' You are done for today.'), card: 'today' };
  }

  // Today: "what should I do today?"
  if (/\b(today|right now|what should i|what do i|tonight)\b/.test(low) && !parseDue(low.replace(/today'?s?/, ''), s.today)) {
    return todaySay(s);
  }

  // Status: "how am I doing?"
  if (/how am i doing|status|am i (behind|on track)|my week|show (me )?(the |my )?(plan|week)/.test(low)) {
    if (!active(s).length) return { say: 'Your week is clear. Tell me about something that is due.', card: 'week' };
    const lines = active(s).sort((a, b) => a.due.localeCompare(b.due)).map(t => `${t.name}: ${mins(t.done)} of ${mins(t.est)} done, due ${DAY_NAMES[D.dow(t.due)]}`);
    const short = (s.short || []).reduce((a, b) => a + b.min, 0);
    return { say: lines.join('. ') + '.' + (short ? ` You're ${mins(short)} short. Say "extend my day" and I'll make room.` : ' Everything fits.'), card: 'week' };
  }

  // New work: "I have a science fair project due Friday, about 5 hours"
  m = text.match(/(?:i have|i've got|i got|add|there'?s|we have|i need to (?:do|finish|study for))\s+(.+?)\s+(?:due|on|by|for|this|next)\b/i);
  const due = parseDue(low, s.today);
  if (m && due) {
    if (due <= s.today) return { say: "That's due today, so there's no time to plan. Do it first!", card: 'today' };
    const name = cleanName(m[1]);
    const [kind, guess] = guessKind(name);
    const said = parseMinutes(low.replace(m[0].toLowerCase(), ' '));
    const est = said || guess;
    const r = call(s, 'planner.create_task', { name, due, est, kind });
    call(s, 'reminders.schedule', { at: `${D.add(due, -1)} 17:00`, text: `${name} is due tomorrow` });
    const t = s.tasks.find(x => x.id === r.id);
    const days = daysFor(s, t);
    let say = `Okay, ${name}, due ${DAY_NAMES[D.dow(due)]}. ` + (said ? '' : `I'll guess ${mins(est)}, tell me if that's wrong. `);
    say += days.length ? `I split it over ${days.length} day${days.length > 1 ? 's' : ''}: ${days.map(d => `${D.short(d)} ${mins(s.plan[d].filter(b => b.task === t.id).reduce((a, b) => a + b.min, 0))}`).join(', ')}.` : '';
    if (r.short) say += ` It doesn't all fit: you're ${mins(r.short)} short. Say "extend my day" and I'll make room.`;
    else say += ` I'll remind you the evening before it's due.`;
    return { say, card: 'week', focus: t.id };
  }
  if (m && !due) return { say: `When is ${cleanName(m[1])} due? Say a day, like "due Friday".`, card: 'week' };

  if (/help|what can you do/.test(low)) return helpSay();
  return { say: "I didn't catch that. Try \"I have a history essay due Thursday, about 3 hours\" or \"what should I do today?\"", card: 'week' };
}

function workDaysLeft(s) {
  const last = active(s).reduce((a, t) => (t.due > a ? t.due : a), s.today);
  return Math.max(1, D.diff(s.today, last));
}

function todaySay(s) {
  const blocks = todayBlocks(s);
  const left = blocks.filter(b => !b.done);
  if (!blocks.length) return { say: 'Nothing planned today. Enjoy it.', card: 'today' };
  if (!left.length) return { say: "You're done for today. Everything is on track.", card: 'today' };
  const total = left.reduce((a, b) => a + b.min, 0);
  return { say: `Today: ${left.map(b => `${mins(b.min)} of ${b.t.name}`).join(', then ')}. That's ${mins(total)}. Start with ${left[0].t.name}, it's due first.`, card: 'today' };
}

function helpSay() {
  return { say: 'Tell me what is due and roughly how long it takes. I plan your days, remind you, and re-plan if you fall behind.', card: 'week' };
}

// The simulated clock moves to tomorrow. Unfinished blocks are moved and the agent speaks first.
function nextDay(s) {
  const missed = todayBlocks(s).filter(b => !b.done);
  s.today = D.add(s.today, 1);
  const due = s.tasks.filter(t => t.due === s.today && remaining(t) === 0);
  call(s, 'planner.replan');
  const short = (s.short || []).reduce((a, b) => a + b.min, 0);
  let say;
  if (missed.length) {
    const missedMin = missed.reduce((a, b) => a + b.min, 0);
    const names = [...new Set(missed.map(b => b.t.name))];
    const where = names.map(n => {
      const t = s.tasks.find(x => x.name === n);
      return daysFor(s, t).filter(d => d >= s.today).map(d => D.short(d)).join(' and ');
    }).filter(Boolean);
    say = `Good morning. Yesterday ${mins(missedMin)} of ${names.join(' and ')} didn't get done. ` +
      (where.length ? `I moved it to ${where.join('; ')}. ` : '') +
      (short ? `It's tight: you're ${mins(short)} short. Say "extend my day" and I'll make room.` : "You're still on track.");
  } else {
    say = 'Good morning. Yesterday is all done, nice.';
    if (due.length) say += ` ${due.map(t => t.name).join(' and ')} is due today, and you're ready.`;
  }
  return { say, card: missed.length ? 'week' : 'today', notice: missed.length ? (short ? 'behind' : 'moved') : null };
}

window.Buddy = { D, mins, exampleState, respond, nextDay, todayBlocks, todaySay, active, remaining, daysFor, capFor, replan, DAY_NAMES };
