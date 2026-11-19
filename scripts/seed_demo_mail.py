#!/usr/bin/env python3
"""Seed a FrontDesk demo mailbox with correctly dated mail.

Outlook and Exchange stamp the send/receive time when a message is submitted,
so you cannot backdate a message from the compose window. This script creates
messages directly in Inbox, Sent Items or Drafts through Microsoft Graph and
sets the MAPI timestamps that Graph exposes as sentDateTime / receivedDateTime:

    Integer  0x0E07  PR_MESSAGE_FLAGS           4 = submitted (not a draft)
    SystemTime 0x0039  PR_CLIENT_SUBMIT_TIME    -> sentDateTime
    SystemTime 0x0E06  PR_MESSAGE_DELIVERY_TIME -> receivedDateTime

Nothing is actually sent: the messages are written straight into the folders.
That is exactly what a demo needs, and it never mails a real person.

Requirements
------------
The Entra app registration needs delegated ``Mail.ReadWrite`` for the seeding
run (in addition to the read scopes the app itself uses) and public client /
device-code flow enabled. Use a separate app registration if you want to keep
the FrontDesk app read-only.

Usage
-----
    python3 scripts/seed_demo_mail.py --file scripts/demo_mail.json --list
    python3 scripts/seed_demo_mail.py --file scripts/demo_mail.json
    python3 scripts/seed_demo_mail.py --file scripts/demo_mail.json --only sent
    python3 scripts/seed_demo_mail.py --file scripts/demo_mail.json --dry-run

The script prints what it created and then reads each message back so you can
see the timestamps Graph actually stored.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEVICE_CODE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_URL = "https://graph.microsoft.com/v1.0"
SCOPES = "offline_access User.Read Mail.ReadWrite"

FOLDERS = {
    "inbox": "inbox",
    "sent": "sentitems",
    "sentitems": "sentitems",
    "drafts": "drafts",
}


def post_form(url: str, data: dict[str, str]) -> dict[str, Any]:
    body = urllib.parse.urlencode(data).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def graph(
    method: str,
    path: str,
    token: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{GRAPH_URL}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise SystemExit(
            f"Graph {method} {path} failed with HTTP {error.code}:\n{detail}"
        ) from error


def device_code_token(client_id: str, tenant: str) -> str:
    flow = post_form(
        DEVICE_CODE_URL.replace("/common/", f"/{tenant}/"),
        {"client_id": client_id, "scope": SCOPES},
    )
    print(flow.get("message") or f"Open {flow['verification_uri']} and enter {flow['user_code']}")
    print(f"\nWaiting for sign-in (code {flow['user_code']})…", flush=True)

    interval = int(flow.get("interval", 5))
    deadline = time.time() + int(flow.get("expires_in", 900))
    while time.time() < deadline:
        time.sleep(interval)
        try:
            token = post_form(
                TOKEN_URL.replace("/common/", f"/{tenant}/"),
                {
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "client_id": client_id,
                    "device_code": flow["device_code"],
                },
            )
            return token["access_token"]
        except urllib.error.HTTPError as error:
            payload = json.loads(error.read().decode(errors="replace") or "{}")
            reason = payload.get("error")
            if reason == "authorization_pending":
                continue
            if reason == "slow_down":
                interval += 5
                continue
            raise SystemExit(f"Sign-in failed: {reason or error}")
    raise SystemExit("The device code expired. Run the script again.")


def html_paragraphs(text: str) -> str:
    """Turn blank-line separated text into simple HTML paragraphs."""
    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    blocks = [block for block in escaped.strip().split("\n\n") if block.strip()]
    return "".join(
        "<p>" + "<br>".join(block.splitlines()) + "</p>" for block in blocks
    )


def load_people(document: dict[str, Any], me: dict[str, Any]) -> dict[str, dict[str, str]]:
    domain = document.get("domain") or (me.get("mail") or "").split("@")[-1]
    people: dict[str, dict[str, str]] = {
        "me": {
            "name": me.get("displayName") or "Me",
            "address": me.get("mail") or me.get("userPrincipalName") or "",
        }
    }
    for alias, person in document.get("people", {}).items():
        address = person.get("address") or ""
        if address and "@" not in address:
            address = f"{address}@{domain}"
        people[alias] = {"name": person.get("name") or alias, "address": address}
    return people


def recipient(people: dict[str, dict[str, str]], alias: str) -> dict[str, Any]:
    person = people.get(alias)
    if not person or not person["address"]:
        raise SystemExit(f"Unknown person alias: {alias}")
    return {
        "emailAddress": {
            "name": person["name"],
            "address": person["address"],
        }
    }


def existing_subjects(token: str, folder: str) -> set[str]:
    path = (
        f"/me/mailFolders/{folder}/messages"
        "?$top=250&$select=subject&$orderby=receivedDateTime desc"
    )
    try:
        payload = graph("GET", path, token)
    except SystemExit:
        return set()
    return {
        (message.get("subject") or "").strip()
        for message in payload.get("value", [])
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--client-id", default=None)
    parser.add_argument("--tenant", default="common")
    parser.add_argument(
        "--only",
        choices=("sent", "inbox", "drafts"),
        help="Seed only one folder.",
    )
    parser.add_argument("--list", action="store_true", help="Preview and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Build payloads but do not POST.")
    parser.add_argument(
        "--allow-duplicates",
        action="store_true",
        help="Create messages even if the subject already exists in the folder.",
    )
    args = parser.parse_args()

    document = json.loads(args.file.read_text(encoding="utf-8"))
    messages = document.get("messages", [])
    if not messages:
        raise SystemExit(f"No messages found in {args.file}")

    if args.list:
        for message in messages:
            folder = FOLDERS.get(message.get("folder", "inbox"), "inbox")
            print(f"{message.get('date')}  {folder:9}  {message.get('subject')}")
        print(f"\n{len(messages)} message(s)")
        return 0

    client_id = args.client_id or document.get("clientId")
    if not client_id:
        raise SystemExit(
            "Pass --client-id or add \"clientId\" to the JSON file."
        )

    token = device_code_token(client_id, args.tenant)
    me = graph("GET", "/me?$select=displayName,mail,userPrincipalName", token)
    people = load_people(document, me)
    print(f"\nSigned in as {people['me']['name']} <{people['me']['address']}>")

    created = 0
    for message in messages:
        folder = FOLDERS.get(message.get("folder", "inbox"), "inbox")
        if args.only and folder != FOLDERS[args.only]:
            continue

        if not args.allow_duplicates and not args.dry_run:
            if (message.get("subject") or "").strip() in existing_subjects(token, folder):
                print(f"skip (already there)  {folder:9}  {message.get('subject')}")
                continue

        timestamp = message["date"]
        payload: dict[str, Any] = {
            "subject": message.get("subject") or "(no subject)",
            "body": {
                "contentType": "html",
                "content": html_paragraphs(message.get("body") or ""),
            },
            "from": recipient(people, message.get("from", "me")),
            "toRecipients": [
                recipient(people, alias) for alias in message.get("to", [])
            ],
            "ccRecipients": [
                recipient(people, alias) for alias in message.get("cc", [])
            ],
            "isRead": bool(message.get("read", True)),
            "importance": message.get("importance", "normal"),
            "singleValueExtendedProperties": [
                # PR_MESSAGE_FLAGS: submitted, so the item is not a draft.
                {"id": "Integer 0x0E07", "value": "4"},
                # PR_CLIENT_SUBMIT_TIME -> sentDateTime
                {"id": "SystemTime 0x0039", "value": timestamp},
                # PR_MESSAGE_DELIVERY_TIME -> receivedDateTime
                {"id": "SystemTime 0x0E06", "value": timestamp},
            ],
        }
        if message.get("flag"):
            payload["flag"] = {"flagStatus": "flagged"}

        if args.dry_run:
            print(f"would create         {folder:9}  {timestamp}  {payload['subject']}")
            continue

        result = graph(
            "POST",
            f"/me/mailFolders/{folder}/messages",
            token,
            payload,
        )
        created += 1
        print(f"created {folder:9}  {timestamp}  {payload['subject']}")

        check = graph(
            "GET",
            (
                f"/me/messages/{result['id']}"
                "?$select=subject,isDraft,sentDateTime,receivedDateTime"
            ),
            token,
        )
        print(
            "         stored sent={sent} received={received} draft={draft}".format(
                sent=check.get("sentDateTime"),
                received=check.get("receivedDateTime"),
                draft=check.get("isDraft"),
            )
        )

    print(f"\nDone. {created} message(s) created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
