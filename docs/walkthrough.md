# Walkthrough: Installer + Setup Wizard (MVP)

This walkthrough demonstrates the MVP installer, doctor, setup wizard, and admin dashboard flows.

## Flow 1: Demo / Setup mode (read-only)

1) Run the guided installer from repo root:

```bash
npm run setup
```

2) Check diagnostics:

```bash
npm run doctor
```

3) Start the frontend dev server:

```bash
cd frontend
npm run dev
```

4) Open the UI:

- `/` → Setup banner appears (read-only).
- `/setup` → Guided wizard (test RPC, copy env snippet).
- `/admin` → Admin dashboard scaffold + audit log.

## Flow 2: Testnet configured

1) In the setup wizard, fill in testnet values and copy the snippet.

2) Paste the snippet into `frontend/.env.local` and restart the dev server.

3) Rerun diagnostics:

```bash
npm run doctor
```

4) Refresh `/` and confirm:

- The setup banner clears once factory + token addresses are configured.
- If any config is missing, the banner highlights the next required step.
