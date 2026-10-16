# DeadlineBuddy design

**Concept:** a smart display on the kitchen counter. Alexa+ (simulated) turns "I have a science project due Friday" into a week plan you can see from across the room.

**Memorable element:** the week strip, stacked time bars for each day with a flag on each deadline. It changes every time the agent re-plans.

| Token | Hex | Role |
|---|---|---|
| ink | #17202B | text, device bezel |
| chalk | #EAF0EE | screen background (cool, not cream) |
| signal | #0E9AA0 | voice bar, the agent speaking |
| marigold | #F0AE2E | today |
| tomato | #E0483A | behind / at risk |
| plum | #5B4B8A | second task colour |

**Type:** Bricolage Grotesque for the display's big lines (it reads like a kitchen label). Atkinson Hyperlegible for body, built for reading at a distance.

**Layout:** desktop = device on the left (16:10 screen in a thick rounded bezel), conversation on the right, agent-actions trace under the device. Phone = device on top, then chat.

**Principles:** say it in one big sentence; every agent action is visible (tool name + result); red only when you're actually behind.

**Rejected:** chat-bot-only UI (judges can't see the agent work), Amazon's blue light ring (not ours to copy), card-grid dashboard.
