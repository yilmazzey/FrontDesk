# FrontDesk — 4-minute demo

**Story:** a manager gets through the week without opening seven apps. The dashboard shows what is next, Ask answers with citations, a handwritten note is searchable, and a meeting becomes notes locally.

The demo is **four scenes**. A three-minute cut is at the bottom.

---

## Before you start (5 minutes)

- [ ] Open the app. If macOS asks for keychain access on launch, click **Always Allow** once and enter your login password. Then reconnect Microsoft: **Settings → Microsoft account → Connect**. Tokens live in memory only, so this is required after every restart.
- [ ] **Settings → Sources & access**: confirm Outlook, Calendar, OneNote and `/Users/zeynep_yilmaz/Documents/FrontDesk Demo` are granted.
- [ ] **Saved → Choose saved folder**: choose `/Users/zeynep_yilmaz/Documents/FrontDesk Saved`.
- [ ] Dashboard: confirm **Next up** shows *Launch review — Zeynep Yılmaz & Anika Srivastava*. If not, check the event date and time zone.
- [ ] If Open loops says **1 hidden**, click **Restore on Open loops** so the swipe item is visible.
- [ ] Run one search for `pilot sites`, then clear it. This proves the scan is readable before you are on stage.
- [ ] Ask one question and then clear the chat. This loads the local model so the first live answer is quick.
- [ ] Click through **Timeline**, **Search**, **Saved** and **People** once. This warms each connector and catches an expired token before the demo.
- [ ] **People → Edit**: set Zeynep to `Launch Lead / Commercial` and Anika to `Vendor Manager / Procurement`. These are local overrides; no accounts.
- [ ] **Meetings**: record 5 seconds to confirm microphone permission, delete that test, then record the 25-second meeting script once and **keep it** as a fallback.
- [ ] Open `/Users/zeynep_yilmaz/Documents/FrontDesk Demo/handwriting/launch-whiteboard.png` in Preview and leave it behind the app.
- [ ] Put the landing page in a browser tab.
- [ ] Do Not Disturb on. Close Slack, Teams and notifications.

---

## Scene 1 — Dashboard and Ask (90s)

**Do**

1. Start on **Dashboard**.
2. Point at **Next up**, **Open loops**, **Deadlines**, **People**.
3. Ask: `What am I waiting on from Zeynep?`
4. Point at the inline `[1]` and the source card under the answer.
5. Click **Set deadline** → title `Zeynep budget sign-off`, Friday 27 November, 17:00 → **Set deadline**.
6. Open the **Open loops** page from the sidebar (or click **Review commitments**) → swipe `Send Zeynep the revised launch scope` left (or click the drawer handle) → **Done** → back to **Dashboard**.

**Say**

> This is the day, not another inbox. Next up comes from the calendar, open loops from notes and mail, deadlines are mine. Ask only reads what is on this Mac. The answer is one sentence and every claim has a citation. If it is not in a source, it says so. I can turn the answer into a deadline — the counter is live — and a commitment I have finished disappears with a swipe. I can restore it later.

**Features:** dashboard, calendar, people, open loops, retrieval + citations, local model, deadline + live counter, persistence.

---

## Scene 2 — Handwriting, search and citation (60s)

**Do**

1. **Settings → Sources & access** → point at the granted local folder. Go back.
2. **Search** → type `pilot sites` → open the `launch-whiteboard` result. The original opens in Preview. Close it.
3. Ask: `How many pilot sites are we starting with?`
4. Point at the answer and its citation to the scan.
5. **Timeline** → show the scan read and the ask on Today.

**Say**

> This is a scan of a handwritten page, not a text file. macOS reads it on-device with Apple Vision, so "pilot sites" is searchable. The original never moves. Asking the same question returns the number and cites the scan itself.

**Features:** local folder, on-device OCR, handwriting, search across scans, citation to the scan, timeline/audit.

---

## Scene 3 — Meeting, notes, saved, privacy (75s)

**Do**

1. **Meetings** → record. Read the script below at a normal pace.
2. **Stop & transcribe**. Wait for the notes. If it is slow, open the pre-recorded meeting from the list and keep talking.
3. Point at the actions in the notes.
4. **Saved** → filter **Decision**, open the pre-saved decision.
5. **People** → show the two clusters; toggle **Notes**/Mail; click **Anika** to show the evidence; click **Ask FrontDesk about Anika** (optional).
6. Press `⌘⇧P` to blur, then again to unblur.

**Meeting script (about 25 seconds)**

> Launch review update. We are keeping phase one small: three pilot sites — Leeds, Manchester and Bristol. Anika will bring the vendor shortlist and final costs on Monday. Zeynep still needs to sign off the budget by Friday the twenty-seventh. Legal needs the data-processing addendum signed before the first pilot goes live. Decision for Monday: Northlight for phase one, with Bramble as the fallback.

**Say**

> Recording stays on this Mac. Whisper transcribes locally, the local model writes the notes, and the audio is deleted after transcription. Saved answers are plain Markdown in my folder — FrontDesk keeps no copy. People is built from the calendar, mail and notes, and every edge has evidence. I can ask for a catch-up on Anika without opening her mail. And if someone screen-shares, the window blurs; `⌘⇧P` does it on demand.

**Features:** local microphone capture, Whisper, local LLM notes, audio deletion, saved Markdown, people graph, privacy shield.

---

## Close (10s)

> Four scenes, one local workspace: calendar, mail, notes, handwriting and meetings — all cited, nothing uploaded.

---

## Three-minute cut

Use the same assets, drop the extras.

| Time | Scene | Keep |
| --- | --- | --- |
| 0:00–0:10 | Landing page | The desk, the Pfizer × Newpage mark |
| 0:10–1:20 | Dashboard + Ask | Next up, Ask, citation, Set deadline, one swipe |
| 1:20–2:10 | Handwriting | Search `pilot sites`, open scan, ask the number |
| 2:10–3:00 | Meeting + People | Record, notes, Anika’s evidence, `⌘⇧P` blur |

Skip **Saved** if the clock is tight. Keep **People** — the evidence panel is the strongest proof that this is not a generic org chart.

## If Microsoft is not connected

Do not debug on stage. The local folder and sample notes still drive the dashboard, Ask, open loops, search, OCR, deadlines, meetings and privacy. Say: “The Microsoft connectors are read-only and need a fresh sign-in; the local workspace is the same.”

## If the model is slow

**Settings → Answer mode → Extractive**. The answer is still cited; it quotes the source instead of writing a sentence. Switch back to **Chat** after the demo.

## Honest boundaries

- The app cannot send mail, create calendar events or create OneNote pages for you.
- Microsoft tokens are memory-only in this build.
- Handwriting OCR is macOS-only; Windows and Linux fall back to printed-text OCR.
