# Rental Home

A simple iPhone Home Screen PWA for managing a small rental portfolio. Property and tenant details stay in the browser’s `localStorage` — no accounts, backend, payments, or maps.

## Files

- `index.html`, `styles.css`, `app.js` — app
- `manifest.json`, `sw.js`, `icons/` — PWA install / offline shell
- `rental-home.code-workspace` — VS Code / Cursor workspace

## Run locally

```bash
cd rental-home
python3 -m http.server 8000
```

Open http://localhost:8000 — a static server is needed for the service worker (it won’t register from `file://`).

## Deploy

- **GitHub Pages:** push this repo, Settings → Pages → Deploy from branch `main` / root (or `docs` if you move files). No build step.
- **Netlify:** drag the folder onto Netlify Drop, or connect the repo with publish directory = repo root and empty build command.

## iPhone (Mom)

1. Open the site in **Safari** (not Chrome).
2. Tap **Share** → **Add to Home Screen** → Add.
3. Open from the new icon for the standalone app.
4. Use **Backup** regularly (downloads a JSON file). Restore the same way if Safari data is cleared or she gets a new phone.

## Privacy

All data stays on-device. Treat JSON backups like any file with tenant contact info.
