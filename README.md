# Token Board

ABA-style token board for kids. Child-facing UI is in English. Parents configure via the hidden ⚙ settings.

**Live app (free, iPhone):** https://gysa0421-rgb.github.io/token-board-web/

Add to Home Screen in Safari for an app-like icon.

---

## Features

- Reinforcer reward image (camera, photo library, saved library)
- Star tokens (1–12), child lock on +1 / −1
- Per-star countdown timer with Ready sound
- Cheerful +1 / sad −1 sounds
- Celebration screen: **Good Job!** + reward photo (tap to dismiss → board resets)
- Settings: star count, time thinning, dev mode (seconds), reset board

---

## Project layout

```
token-board-web/
  index.html          Main page
  css/style.css       Styles
  js/
    app.js            Main UI and logic
    settings.js       Star/timer settings (localStorage)
    reinforcer-library.js   Reward images (IndexedDB)
    timer.js          Countdown logic
    sound.js          Audio
  assets/             Icons and sound files
```

Related Expo/native project (development): `../token-board-app/`

---

## Run locally

```bash
cd token-board-web
python3 -m http.server 8765
```

Open `http://localhost:8765` (phone: same Wi‑Fi, use your Mac’s IP).

---

## Update the live site

1. Edit files in `token-board-web/`
2. Open **GitHub Desktop** → repo `token-board-web`
3. **Commit** → **Push origin**
4. Wait 2–3 minutes for GitHub Pages
5. On iPhone: reopen the app or re-add to Home Screen if cache is stale

**Pages settings:** Deploy from branch `main`, folder `/ (root)`.

---

## Family install (iPhone, free)

1. Safari → https://gysa0421-rgb.github.io/token-board-web/
2. Share → **Add to Home Screen**
3. Parent: tap ⚙ → **Choose Reward Image** (full-screen picker on small phones)

---

## Data & offline

- Stars, settings, and reward photos are stored **on the device** (localStorage + IndexedDB).
- No account or cloud sync.
- **First open** needs internet to load the site. After that, use works without network until the browser needs to reload files. True offline install would need a service worker (not added yet).

---

## Parent quick reference

| Action | How |
|--------|-----|
| Settings | Tap ⚙ (top right) |
| Reward image | Settings → **Choose Reward Image** |
| Unlock +1 / −1 | Two-finger hold 2s, or tap lock 3× |
| Dev test (fast timer) | Settings → **Dev Mode (Test in Seconds)** |

---

## Cache busting

`index.html` loads `js/app.js?v=N`. Bump `N` after JS changes if phones show an old version.
