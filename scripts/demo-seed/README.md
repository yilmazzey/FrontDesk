# Demo mail seeder (standalone)

> **Legacy:** this Kestrel mailbox story is not used by the current demo. See
> [`docs/demo/ASSETS.md`](../../docs/demo/ASSETS.md) for the Zeynep Yılmaz /
> Anika Srivastava copy.

This folder is **not used by the FrontDesk app** and has nothing to do with
Settings → Connect. It is a standalone utility that writes the demo mailbox.

It needs a Microsoft Entra app registration with delegated `Mail.ReadWrite`
and device-code flow enabled. The app's read-only registration is not enough.

```bash
python3 scripts/demo-seed/seed_demo_mail.py \
  --file scripts/demo-seed/demo_mail.json \
  --client-id "<seed-app-client-id>" \
  --tenant "<tenant-id-or-domain>"
```

The code it prints expires after 15 minutes. Do not mix it up with the code
shown inside FrontDesk Settings.
