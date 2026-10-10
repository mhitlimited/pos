# ProPOS v8 — Free Offline Point of Sale (PWA)

Runs without a server, installable on mobile. Data stays on the device and can auto-backup to your Google Drive.

**Features:** Sales, due/credit, customer ledger, suppliers & purchases, expenses, returns, hold bills, reports & profit, dark mode, PIN lock, barcode scan, Bluetooth print, CSV export, Google Drive cloud backup.

## Changes in this build
- **Local file backup removed.** Backup is cloud-only via Google Drive (optional sign-in).
- **Full UI in English** (previously Bengali).

## Google Drive setup (one-time, free)
1. https://console.cloud.google.com → new project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → app name → Scopes: `drive.appdata`, `email`, `profile`, `openid` → **Publish app**.
4. **Credentials → OAuth client ID → Web application**.
5. Add **Authorized JavaScript origins** (no path, no trailing slash), e.g. `https://username.github.io`.
6. Put Client ID in `js/config.js`:
   ```js
   window.PROPOS_CONFIG = { googleClientId: 'xxxx.apps.googleusercontent.com' };
   ```

## Cloud backup
- Data is stored in your Drive **private app data folder** as `propos-data.json` (scope `drive.appdata` only).
- Auto-sync ~12 seconds after changes.
- Daily snapshots (last 14) can be restored from Settings / account card.
- Conflict between devices prompts which data to keep.

## Legal
- Privacy: `privacy.html`
- Terms: `terms.html`
- Provider: MH IT Limited
