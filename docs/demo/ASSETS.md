# Demo assets to create

Only two names are used: **Zeynep Yılmaz** and **Anika Srivastava**. Everything stays inside your one demo account — no separate mailboxes, aliases or accounts needed.

**No external mail is sent.** FrontDesk never sends mail; it only reads the mailbox, calendar and OneNote you grant. The calendar's placeholder attendees are not emailed.

FrontDesk reads both **Inbox** (mail from other people) and **Sent Items**. You do not need external mail for the demo; the self-notes are enough. If you want a “received from someone else” example, send one synthetic note from an existing personal account to the demo account — no new account needed.

## Already created for you

```text
~/Documents/FrontDesk Demo/
  notes/01-launch-scope.md
  notes/02-vendor-shortlist.md
  notes/03-q1-budget.md
  notes/04-monday-16-november.md
  handwriting/launch-whiteboard.png

~/Documents/FrontDesk Saved/
  Decision/pilot-rollout-decision-20261121-090000.md
  Todo/launch-review-actions-20261121-091500.md
```

Grant **`/Users/zeynep_yilmaz/Documents/FrontDesk Demo`** as the source folder. Set **`/Users/zeynep_yilmaz/Documents/FrontDesk Saved`** as the saved folder. Do not put the saved folder inside the granted folder.

A print-ready version of the handwritten page is at `docs/demo/launch-whiteboard-print.pdf`.

### Date questions

Ask `What happened on 16 November?` or `What happened on previous Monday?`.

The app resolves explicit dates (`16 November`, `16th November 2026`, `2026-11-16`, `16/11/2026`), `today`, `yesterday`, `previous Monday` and `last Monday`. It filters sources by the same date the Timeline shows, then answers with citations. The date is the **source date** — received or modified — not necessarily the event date.

`notes/04-monday-16-november.md` is dated 16 November in its file metadata, so the date demo works even if Microsoft is disconnected.

---

## Minimum viable set (about 5 minutes)

- [ ] **Calendar:** import `docs/demo/frontdesk-demo.ics` (one event).
- [ ] **Email:** Zeynep's revised-scope email.
- [ ] **OneNote:** page *Launch scope — decision*.
- [ ] **Handwriting:** use the PNG already in the folder, or print and photograph it.
- [ ] **Grants:** local folder + saved folder + Microsoft sign-in.

The optional items below add texture but are not needed for the four scenes.

---

## 1. Email (one required)

Send them from the demo account to yourself. Because you are both sender and recipient, write them as **notes to self** — no greeting and no sign-off. The local notes already link Zeynep and Anika in the people graph, so the signature was redundant.

### Launch scope note — required

**Subject**

```text
Launch scope — revised plan for Monday
```

**Body**

```text
Two-phase plan is agreed. Phase 1 stays small until the budget is signed off.

The revised scope needs to be in the pack before Monday's launch review.

Budget sign-off target: Friday 27 November, after Anika confirms the final vendor costs.
```

### Vendor shortlist note — optional

Send this from the demo account too, as a note about Anika's shortlist. No second mailbox.

**Subject**

```text
Vendor shortlist — three options for Monday
```

**Body**

```text
Anika sent the shortlist for Monday. Three options:

- Northlight — strongest creative, can hold a December slot. £18.4k.
- Bramble — best value, slower turnaround.
- Arden — can start immediately, limited capacity.

She recommends Northlight for phase 1, with Bramble as the fallback, and will confirm final costs at the launch review.
```

---

## 2. Calendar event (one required)

**Fastest:** double-click `docs/demo/frontdesk-demo.ics` to import it, then check it in Outlook. Importing does not email anyone; FrontDesk only reads the calendar.

```text
Title: Launch review — Zeynep Yılmaz & Anika Srivastava
When:  Monday 23 November 2026, 10:00–10:45

Agenda:
- Revised launch scope (Zeynep)
- Vendor shortlist and costs (Anika)
- Pilot sites and phase 2 gate
- Legal: data-processing addendum (DPA)
- Budget sign-off date
```

The ICS lists **Anika Srivastava** as a placeholder attendee; Zeynep is the account owner/organizer. Import it **before opening People** — the event seeds Anika in the people graph, and the notes and shortlist email then add evidence. Importing does not send invitations. Create the event on the demo account so it appears in the calendar view.

---

## 3. OneNote

Notebook: **FrontDesk Demo**  
Section: **Launch**

### Page 1 — `Launch scope — decision` (required)

```text
Decision (21 Nov): launch in two phases.

Phase 1: pilot sites only. Keep the first wave small.
Phase 2: national rollout after budget sign-off and legal clearance.

Owners:
- Zeynep: revised scope before Monday's launch review.
- Zeynep: budget sign-off target Friday 27 November.
- Anika: vendor shortlist and final costs by Monday 23 November.
- Legal: data-processing addendum signed before any pilot goes live.

Do not reopen the single-phase option. Supply cannot support a national launch in February.
```

### Page 2 — `Vendor shortlist — 20 Nov` (optional)

```text
Three options from Anika:

Northlight — strongest creative, December slot held. £18.4k.
Bramble — best value, slower turnaround.
Arden — available now, limited capacity.

Recommendation: Northlight for phase 1. Bramble as fallback.
Anika can hold the December slot until Friday 27 November.
Decision at Monday's launch review. Anika to confirm final costs.
```

---

## 4. Handwriting

**Fast path:** use the PNG already in `/Users/zeynep_yilmaz/Documents/FrontDesk Demo/handwriting/launch-whiteboard.png`.

**Real path (5 minutes):** print `docs/demo/launch-whiteboard-print.pdf` as a guide, or copy this onto a blank lined page in large blue or black ink:

```text
Launch review — 21 Nov

Phase 1 stays small. No national comms yet.

Phase 1: 3 pilot sites
Leeds · Manchester · Bristol

Phase 2: national after sign-off

Anika — vendor shortlist by Mon 23
Zeynep — budget sign-off before Fri 27
Legal — DPA before pilot starts

decision: Northlight for phase 1
```

Photograph it straight on, with the page filling the frame and no shadow across the text. Save it as:

```text
/Users/zeynep_yilmaz/Documents/FrontDesk Demo/handwriting/launch-whiteboard.png
```

Overwrite the generated PNG if you photograph the real note. Keep it upright; Apple Vision handles ordinary handwriting, not extreme perspective.

---

## 5. Grants and sign-in

- [ ] **Settings → Microsoft account → Connect** and approve the read-only scopes.
- [ ] **Settings → Sources & access** → paste `/Users/zeynep_yilmaz/Documents/FrontDesk Demo` → **Grant**.
- [ ] Confirm **Outlook**, **Calendar** and **OneNote** are listed as grants.
- [ ] **Saved → Choose saved folder** → `/Users/zeynep_yilmaz/Documents/FrontDesk Saved`.

---

## 6. People graph — what to demonstrate

You do **not** need more accounts. The graph is relationship intelligence, not a headcount. Two real people are enough:

- **Zeynep Yılmaz** — the account owner; Launch Lead, Commercial
- **Anika Srivastava** — Vendor Manager, Procurement

The calendar event seeds Anika. The local notes and the shortlist email add note and mention evidence. Legal is a team, not a person; the DPA stays in the notes and open loops.

### Set the roles once

1. Open **People** after importing the calendar event.
2. Click Zeynep (or the self node) → **Edit** → role `Launch Lead`, department `Commercial` → **Save**.
3. Click Anika → **Edit** → role `Vendor Manager`, department `Procurement` → **Save**.

These are **local overrides**; no Microsoft directory change and no account needed. If the self node shows the account name instead of Zeynep, rename it in the same editor.

### Then show

1. **Two clusters** — Commercial and Procurement, with one link between Zeynep and Anika.
2. **Connection filters** — toggle **Mail**, **Meetings**, **Mentions** and **Notes**. The edge lights up from different sources: the calendar invite, the shortlist email, the notes.
3. **Click Anika** — the evidence panel lists the 1:1 note, the vendor shortlist note, the calendar event and the shortlist email, plus last met/next met and role.
4. **Ask FrontDesk about Anika** — a cited catch-up that pulls her open actions, not a generic summary.
5. Optional: **Add person** shows that a local person can be added without an account. Do not add a fake name in the demo; two people tell the story.

If the demo account already has Microsoft contacts, the directory may add more nodes automatically. Do not depend on it; the two-node graph is predictable.

## Test before the demo

- [ ] Dashboard **Next up** shows the launch review.
- [ ] Open loops shows the Zeynep/Anika items and no **hidden** link.
- [ ] Ask `What am I waiting on from Zeynep?` returns a cited answer. Clear the chat afterwards.
- [ ] Search `pilot sites` finds the scan.
- [ ] Ask `How many pilot sites are we starting with?` returns **three** and cites the scan.
- [ ] Ask `What happened on 16 November?` cites the dated note, or the mail/OneNote from that day.
- [ ] People shows Zeynep and Anika with the roles and departments set above.
- [ ] Clicking Anika shows evidence; **Ask FrontDesk about Anika** returns a cited catch-up.
- [ ] Meetings records and transcribes 5 seconds.
- [ ] `⌘⇧P` blurs and unblurs.
