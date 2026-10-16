# DeadlineBuddy — Devpost submission (entrant: adult account)

**Project name:** DeadlineBuddy

**Elevator pitch (under 200 chars):**
A simulated Alexa+ experience for students: say what's due, and it plans every day before the deadline, remembers your week, and re-plans when you fall behind.

**Track:** Alexa+ (simulated Alexa+ experience path)
**Mini challenges:** none

**Built with:** javascript, html5, css3, web-speech-api, localstorage, service-worker, github-pages, claude

**Try it out:**
- https://tomerbot.github.io/deadlinebuddy/
- https://github.com/Tomerbot/deadlinebuddy

**Video demo:** https://www.youtube.com/watch?v=mOxur8U-hkM

---

## Inspiration
Big school work fails the same way every time: "due Friday" is easy to say on Monday and impossible to fix on Thursday night. A to-do list doesn't help, because nobody turns "5 hours, due Friday" into "30 minutes tonight" on their own. A voice assistant on the kitchen counter is the one screen a family already looks at every day, so I wanted Alexa+ to do that planning out loud.

## What it does
DeadlineBuddy is a simulated Alexa+ experience on an Echo Show style display.
- You say what's due in plain words: "I have a science fair project due Friday, about 5 hours." It works out the task, the deadline and the time (or makes a guess and says so).
- It plans the days before the deadline, earliest deadline first, never past your daily limit. The week strip shows every block and a flag on each deadline.
- It remembers you across sessions: busy days ("soccer on Tuesdays" gets only 30 minutes), your daily limit, and your progress. Open it tomorrow and it says "welcome back" with today's plan.
- When the work doesn't fit, it says exactly how short you are and offers a fix ("extend my day").
- When the day ends with work undone, it re-plans on its own and speaks first the next morning.
- Every tool the agent calls (create task, schedule reminder, set busy day, re-plan) is shown in a "What the agent did" panel, so you can see the agent work.

## How we built it
I built it with Claude, Anthropic's AI assistant, which wrote the code from my description. It's plain HTML, CSS and JavaScript with no build step and no paid APIs, hosted on GitHub Pages.
- `agent.js` understands what you say (offline, pattern-based), runs the planner (15-minute blocks, earliest deadline first, per-day capacity, busy days) and exposes its actions as tools with a name, input and result, shaped like MCP tools.
- `app.js` draws the display and the week strip, keeps the conversation, saves memory in localStorage, and uses the Web Speech API for voice input and spoken replies.
- A simulated clock ("Next day") makes the re-planning visible in a two-minute demo.

## Challenges we ran into
Spreading work evenly while respecting busy days and other deadlines: the planner fills days in rounds so no single day is overloaded, then reports the exact shortfall instead of silently cramming. Making the agent's work visible was the other challenge, which is why every tool call is on screen.

## Accomplishments that we're proud of
The overnight re-plan: you skip an hour, and the next morning Buddy has already moved it and tells you whether you're still on track.

## What we learned
A planner is only useful if it's honest about what doesn't fit. And for a voice product, a short spoken summary matters more than a detailed screen.

## What's next for DeadlineBuddy
Serve the same tools from a self-hosted MCP server (Streamable HTTP) so the real Alexa+ can call them, connect a real calendar, and send the evening-before reminders as Alexa notifications.

---

## Product feedback (required field)
DeadlineBuddy uses the simulated Alexa+ path, so no Amazon SDK runs in it. What I used: the browser's Web Speech API (worked well in Chrome and Edge for voice input; spoken replies sound robotic and voice input isn't available in Firefox), localStorage for memory across sessions (simple and reliable), and GitHub Pages for hosting. On the Alexa+ side, having a simulated path made it possible to design the conversation first. What would help most: a public Alexa+ simulator or test console where a self-hosted MCP server can be tried without a device, and a sample MCP server for a productivity use case.

## Feature requests (optional)
- A browser-based Alexa+ simulator that connects to a self-hosted MCP server (important).
- Proactive notifications from MCP tools ("you're behind on your science project") (important).
