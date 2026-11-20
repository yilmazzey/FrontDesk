# Microsoft demo setup — step by step

This is the checklist for the **dedicated Microsoft account + Entra app registration** used by the FrontDesk desktop demo.

Target time: **60–90 minutes** for the full setup.  
Fast path: **30 minutes** if you only create the account, the app registration and one OneNote page / one calendar event / one email so we can test the connection.

> **Do not use real Pfizer notes.** The hackathon asks for sample manager notes you create yourselves. Use synthetic names, projects and decisions.

> **No Microsoft 365 sandbox is required.** A sandbox is a hosted Microsoft 365 tenant with sample data. We only need an Entra app registration and a Microsoft account that has OneNote, Calendar and Mail data.

---

## 0. What you are creating

You will create:

1. **A dedicated Microsoft account** — the demo identity.
2. **An Entra app registration** — lets the FrontDesk desktop app sign in to that account.
3. **Synthetic demo data** — OneNote pages, calendar events and emails for the demo.

Simplest approach: **one new personal Microsoft account** used for both the app registration and the demo data.

You will send me:
- Application (client) ID
- Tenant ID or tenant type
- Test results from four Graph calls

You will **not** send me:
- Password
- Access token
- Refresh token
- Client secret (there should not be one)

---

## 1. Create the dedicated Microsoft account

- [ ] Open a private/incognito browser window.
- [ ] Go to <https://signup.live.com>.
- [ ] Create a new personal Microsoft account, e.g. `frontdesk-demo-<date>@outlook.com`.
- [ ] Use a password manager. Do not reuse a personal password.
- [ ] Enable two-step verification.
- [ ] Add a recovery email/phone.
- [ ] Sign in at <https://outlook.com> and confirm the mailbox opens.
- [ ] Send one test email to yourself so the inbox is not empty.
- [ ] Open <https://onenote.com> and confirm OneNote opens.
- [ ] Open <https://outlook.com/calendar> and confirm Calendar opens.
- [ ] Record the account email somewhere private. Do **not** commit it to the repo.

**If OneNote, Calendar or Mail is unavailable:** stop here and tell me. A Microsoft account without those services cannot provide the demo data.

---

## 2. Get an Entra tenant / app registration

An app registration needs an **Entra ID tenant**, not an M365 sandbox.

### 2a. Check whether you already have a tenant

- [ ] Go to <https://entra.microsoft.com>.
- [ ] Sign in with the new demo account.
- [ ] Look for **App registrations** in the left navigation.

If **App registrations** is visible, skip to step 2c.

### 2b. If there is no tenant

- [ ] Go to <https://azure.microsoft.com/free>.
- [ ] Sign up with the same demo account.
- [ ] If you have **Azure for Students**, use that option instead.
- [ ] This creates a default Entra directory. You do **not** need to create any paid Azure resources.
- [ ] If Azure asks for a credit card and you do not want to use one, **stop and tell me**. Do not spend hackathon time on billing.

An app registration itself is free. The Microsoft 365 Developer Program sandbox is not required.

### 2c. Create the app registration

- [ ] Open **Microsoft Entra admin center → App registrations → New registration**.
- [ ] Name: `FrontDesk Demo`.
- [ ] Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
  - This is the safest option if the registration tenant and the demo account are different.
  - If you are certain both are the same personal account, “Personal Microsoft accounts only” also works.
  - Do **not** choose single-tenant if you want to sign in with a personal account from another tenant.
- [ ] Redirect URI: leave blank for device-code flow.
  - Optional fallback: add a **Public client/native** redirect URI of `http://localhost`.
- [ ] Click **Register**.

### 2d. Record the IDs

- [ ] Copy **Application (client) ID**.
- [ ] Copy **Directory (tenant) ID**.
- [ ] Note the tenant type you want to use: `common` (recommended), `organizations`, or `consumers`.

The client ID and tenant ID are not secrets. The client **secret** would be, but we are not creating one.

---

## 3. Configure authentication and permissions

### 3a. Enable public client flows

- [ ] App registration → **Authentication**.
- [ ] Scroll to **Advanced settings**.
- [ ] Set **Allow public client flows** to **Yes**.
- [ ] Save.

This is required for the device-code login used by the desktop app.

### 3b. Add delegated Microsoft Graph permissions

- [ ] App registration → **API permissions** → **Add a permission**.
- [ ] Choose **Microsoft Graph** → **Delegated permissions**.
- [ ] Add:

| Permission | Why |
| --- | --- |
| `User.Read` | Read the signed-in account name/email, department and job title |
| `Notes.Read` | Read the user’s OneNote notebooks/pages |
| `Mail.Read` | Read the user’s mailbox, including Sent Items |
| `Calendars.Read` | Read the user’s calendar |
| `offline_access` | Get a refresh token so the app can reconnect |

- [ ] Read-only permissions only for the FrontDesk app. Do **not** add write permissions to the app registration the app signs in with.
- [ ] `Files.Read` and `Mail.Read.Shared` are optional and **not requested by the app yet**. Add them only when the OneDrive/shared-mailbox connectors exist. `Mail.Read.Shared` is work/school-only and will break sign-in for personal accounts.
- [ ] To seed backdated demo mail, create a **second** app registration with delegated `Mail.ReadWrite` (see 4c). The FrontDesk app never requests that scope.
- [ ] Do **not** add `Notes.Read.All`. That is for reading every user in a tenant and usually needs admin consent.
- [ ] If **Grant admin consent** is available and you are the tenant admin, click it.
- [ ] If it is not available, user consent will be requested at first sign-in.
- [ ] Do **not** create a client secret under **Certificates & secrets**.

### 3c. If you use a Pfizer work account

- [ ] A work/school tenant may require an administrator to grant consent.
- [ ] If admin consent is blocked, switch the demo to a personal Microsoft account.
- [ ] Do not spend the hackathon waiting for tenant admin approval.

---

## 4. Create synthetic demo data

Create a small, consistent story. The demo needs one decision, one older conflicting note, one open action and one email.

### 4a. OneNote pages

- [ ] Create a notebook named `FrontDesk Demo`.
- [ ] Create a section named `Pricing`.
- [ ] Create these pages (copy the text):

**Page 1 — `Q3 Pricing — Decision`**

```text
Decision (3 Nov): Enterprise pricing moves to usage-based from 1 January.
Finance approved the overage rate.
Legal must review clause 4.2 before rollout.
Owner: Ada. Due: 20 November.
```

**Page 2 — `Pricing sync — 10 Nov`**

```text
Open action: Sam to confirm legal review of clause 4.2 by 18 November.
Ada to prepare customer comms.
We did not reopen the seat-based option in this meeting.
```

**Page 3 — `Whiteboard — 22 Oct`**

```text
Keep seat-based pricing for enterprise?
Check with finance before changing anything.
```

- [ ] Optionally insert a photo of a handwritten whiteboard/page into page 3. The app will OCR it locally.

### 4b. Calendar events

- [ ] Open <https://outlook.com/calendar>.
- [ ] Create **Pricing sync**, recurring weekly, with the next occurrence within the next 1–2 days.
- [ ] Add attendees: the demo account and optionally 1–2 synthetic addresses.
- [ ] Event body:

```text
Agenda:
- Decision recap: usage-based enterprise pricing
- Legal review: clause 4.2 (Sam, due 18 Nov)
- Customer comms: Ada
- Finance overage rate: approved
```

- [ ] Create **1:1 with Ada** tomorrow.
- [ ] Event body:

```text
Topics: pricing rollout, hiring plan, Q3 review.
```

- [ ] Create one older event in the past, e.g. **Pricing options review — 22 Oct**, with body:

```text
Options discussed: seat-based vs usage-based. No final decision.
```

### 4c. Outlook emails

- [ ] Send these emails to yourself (or between the demo aliases) so they land in the inbox:

| Subject | Body |
| --- | --- |
| `Recap: pricing sync` | `We decided usage-based pricing for enterprise. Legal review of clause 4.2 is still open.` |
| `Legal review — clause 4.2` | `Sam: clause 4.2 needs a redline. Aiming for 18 November.` |
| `Finance sign-off` | `Overage rate approved. Usage-based pricing can start 1 January.` |
| `Customer question — enterprise pricing` | `Customer asks whether seat-based pricing is still available. Answer: transition to usage-based from January.` |

- [ ] Confirm all four appear in the inbox.
- [ ] Grant the OneNote notebook (and optionally a local notes folder) so the people graph can cite note evidence.

**Backdating mail (Outlook cannot do this).** Exchange stamps `sentDateTime` and `receivedDateTime` when a message is submitted, so composing "now" always gives today's date. To build a story that spans weeks, seed the mailbox through Graph and set the MAPI timestamps. `scripts/demo-seed/seed_demo_mail.py` does exactly that:

```bash
# Preview the story without touching the mailbox
python3 scripts/demo-seed/seed_demo_mail.py --file scripts/demo-seed/demo_mail.json --list

# Seed it (device-code sign-in; asks for Mail.ReadWrite)
python3 scripts/demo-seed/seed_demo_mail.py \
  --file scripts/demo-seed/demo_mail.json \
  --client-id "$SEED_CLIENT_ID" \
  --tenant frontdeskdemo.onmicrosoft.com
```

The script writes items straight into Inbox, Sent Items or Drafts and sets `PR_CLIENT_SUBMIT_TIME` (`0x0039`) and `PR_MESSAGE_DELIVERY_TIME` (`0x0E06`), plus `PR_MESSAGE_FLAGS` (`0x0E07 = 4`) so the item is not a draft. It then reads each message back and prints the timestamps Graph actually stored. Nothing is sent to a real address.

Use the **seeding app registration** with delegated `Mail.ReadWrite`. Do not add `Mail.ReadWrite` to the read-only app the FrontDesk app uses.

`scripts/demo-seed/demo_mail.json` contains the full Kestrel story: 6 sent messages, 14 inbox messages, 1 draft and 3 noise messages, with the cast already renamed to Manager, Anika, Zeynep and Damla. Placeholder addresses use `domain` in the JSON; `me` resolves to the signed-in account. Reruns skip subjects that already exist unless you pass `--allow-duplicates`.

### 4d. Local handwritten note

- [ ] Write a synthetic handwritten page or whiteboard:

```text
Pricing decision: usage-based.
Legal 4.2 — Sam — 18 Nov.
```

- [ ] Take a clear photo.
- [ ] Save it outside the repo, e.g. `~/Documents/FrontDesk Demo/handwriting/pricing-whiteboard.jpg`.
- [ ] You will grant that folder to FrontDesk during the demo.

Do not use a real handwritten note from work.

---

## 5. Verify the account has the right data

- [ ] Open <https://developer.microsoft.com/graph/graph-explorer>.
- [ ] Sign in with the demo account.
- [ ] Run these calls and confirm `200` with data:

```http
GET https://graph.microsoft.com/v1.0/me
GET https://graph.microsoft.com/v1.0/me/onenote/pages?$top=5
GET https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=2026-11-16T00:00:00Z&endDateTime=2026-12-16T00:00:00Z
GET https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=5
```

- [ ] Record the counts:
  - OneNote pages: ____
  - Calendar events in window: ____
  - Inbox messages: ____

If Graph Explorer returns `403` for OneNote, the account or tenant does not allow OneNote access. Tell me before we build against it.

---

## 6. Test the app registration with device code

You can skip this and let me test through the app, but doing it once now catches configuration problems early.

Replace `CLIENT_ID` with your Application (client) ID.

### 6a. Request a device code

```bash
CLIENT_ID="paste-your-client-id"

curl -s -X POST \
  "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode" \
  -d "client_id=$CLIENT_ID" \
  -d "scope=offline_access User.Read Notes.Read Mail.Read Calendars.Read"
```

- [ ] Copy the `user_code` from the response.
- [ ] Open the `verification_uri` shown in the response (usually <https://microsoft.com/devicelogin>).
- [ ] Enter the code and sign in with the demo account.
- [ ] Approve the requested read-only permissions.

### 6b. Poll for the token

```bash
DEVICE_CODE="paste-device-code-from-step-6a"

curl -s -X POST \
  "https://login.microsoftonline.com/common/oauth2/v2.0/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
  -d "client_id=$CLIENT_ID" \
  -d "device_code=$DEVICE_CODE"
```

- [ ] You should get an `access_token` and `refresh_token`.
- [ ] Do **not** send me either token.
- [ ] If you get `authorization_pending`, wait a few seconds and poll again.
- [ ] If you get `slow_down`, wait longer between polls.
- [ ] If you get `expired_token`, request a new device code.

### 6c. Test Graph with the token

```bash
TOKEN="paste-access-token"

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://graph.microsoft.com/v1.0/me/onenote/pages?$top=3"
```

- [ ] Confirm the response contains your demo pages.

---

## 7. Put the client ID into the app (local only)

The desktop app reads the client ID from a local env file.

- [ ] Copy `desktop/.env.example` to `desktop/.env.local`.
- [ ] Set:

```bash
VITE_MICROSOFT_CLIENT_ID="paste-your-application-client-id"
```

- [ ] Do not commit `desktop/.env.local` — it is gitignored.
- [ ] Restart the desktop app after changing the file.
- [ ] Open **Settings → Microsoft account → Connect**, follow the device-code prompt, and approve the read-only permissions.

The app keeps Microsoft tokens in memory only, so you will reconnect after restarting the app. That is intentional for the current build; token persistence in the OS keychain is a separate hardening step.

## 8. Send me these details

- [ ] Application (client) ID:
- [ ] Directory (tenant) ID:
- [ ] Tenant authority to use: `common` / `organizations` / `consumers`
- [ ] Supported account type you selected:
- [ ] Consent granted: yes / no / admin consent required
- [ ] Device-code test worked: yes / no
- [ ] OneNote pages found: ____
- [ ] Calendar events found: ____
- [ ] Inbox messages found: ____
- [ ] Demo account type: personal / work / school

Do not send:
- password
- access token
- refresh token
- client secret

---

## 9. Troubleshooting

| Error | Meaning | Fix |
| --- | --- | --- |
| `AADSTS50020` | Account is not in the app’s tenant | Use `common`, or change supported account types |
| `AADSTS65001` | Consent required | Sign in and approve permissions, or grant admin consent |
| `AADSTS700016` | App not found in tenant | Check client ID and tenant authority |
| `AADSTS50076` / MFA prompt | Multi-factor authentication required | Complete the MFA prompt in the browser |
| `AADSTS53003` | Conditional Access blocked the flow | Try a personal account; device code may be blocked by policy |
| OneNote `403` | `Notes.Read` not consented or OneNote unavailable | Recheck delegated permissions; test with Graph Explorer |
| Empty calendar/mail | Account has no data | Create the synthetic events/emails in step 4 |
| No **App registrations** | No Entra tenant | Create a free Azure account/tenant, or use Azure for Students |
| Azure asks for a card | Billing verification | Stop; tell me before using a card |

### Stop conditions

If any of these happen, message me instead of spending more time:

- You cannot see **App registrations** after 20–30 minutes.
- Azure asks for a card and you do not want to use one.
- Device code is blocked by Conditional Access.
- OneNote returns `403` for the demo account.
- The demo account has no mailbox, calendar or OneNote.

---

## 10. Definition of done

- [ ] Dedicated Microsoft account created with MFA.
- [ ] Mailbox, OneNote and Calendar all open.
- [ ] Entra app registration created.
- [ ] Client ID and tenant ID recorded.
- [ ] **Allow public client flows** enabled.
- [ ] Delegated `User.Read`, `Notes.Read`, `Mail.Read`, `Calendars.Read`, `offline_access` added.
- [ ] Consent granted (or admin consent requested).
- [ ] Graph Explorer shows OneNote pages, calendar events and inbox messages.
- [ ] Synthetic OneNote pages created.
- [ ] Synthetic calendar events created.
- [ ] Synthetic emails created.
- [ ] Handwritten note photo saved locally.
- [ ] Device-code test works.
- [ ] Client ID + tenant details sent to me.
- [ ] No passwords, tokens or client secrets sent.

Once the client ID is in place, connect from Settings and check the per-connector diagnostics. Mail, calendar and OneNote are read-only and can be revoked together from the same panel.
