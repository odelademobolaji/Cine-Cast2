# CineCast — LG TV (webOS) Setup Guide

## Overview

CineCast runs as a **hosted web app** on your LG TV.  
The TV app (in `webos/`) is a launcher that connects to a CineCast server running on your home network or a cloud host.

```
[LG TV — webOS app] ──HTTP──▶ [Home server: Next.js frontend + Python backend]
```

---

## Part 1 — Run the Server

Run this on any machine on your home network (laptop, Raspberry Pi, NAS, etc.).

### 1a. Install dependencies

```bash
# Python backend
cd backend
pip install -r requirements.txt

# Node.js frontend
cd ../frontend
npm install
```

### 1b. Set your TMDB API key

Edit `config.yaml`:
```yaml
tmdb:
  api_key: "YOUR_KEY_HERE"   # free key from themoviedb.org
```

### 1c. Start both services

```bash
# From the repo root — starts backend (port 8030) + frontend (port 3000)
python3 run.py
```

Or start them separately:
```bash
# Terminal 1 — backend
cd backend && uvicorn main:app --reload --port 8030

# Terminal 2 — frontend
cd frontend && npm run dev
```

### 1d. Find your server's IP address

```bash
# Linux / Mac
ip route get 1 | awk '{print $7}'

# Windows
ipconfig | findstr "IPv4"
```

Example: `192.168.1.42` → your server URL is `http://192.168.1.42:3000`

---

## Part 2 — Install the webOS App on your LG TV

### Option A — Developer Mode (recommended for personal use)

1. **Enable Developer Mode on your TV**
   - Open the LG Content Store on your TV
   - Search for and install **Developer Mode**
   - Enable it and note the TV's IP address

2. **Install the webOS CLI on your computer**
   ```bash
   npm install -g @webos-tools/cli
   ```

3. **Add your TV as a device**
   ```bash
   ares-setup-device
   # Follow prompts — use the TV's IP, port 9922
   # Name the device: tv
   ```

4. **Package and install CineCast**
   ```bash
   # From repo root
   npm run webos:package    # builds the .ipk
   npm run webos:install    # installs on TV
   npm run webos:launch     # launches the app
   ```

   Or all in one step:
   ```bash
   npm run webos:dev
   ```

### Option B — USB sideload (older TVs)

1. Enable Developer Mode on the TV
2. Run `npm run webos:package` to create `dist/com.cinecast.tv_1.0.0_all.ipk`
3. Copy the `.ipk` to a USB drive
4. On the TV: Settings → Support → Developer Mode → Install from USB

---

## Part 3 — First Launch

1. Open **CineCast** from your TV's app launcher
2. A setup screen appears asking for your server URL
3. Enter `http://YOUR_SERVER_IP:3000` (e.g., `http://192.168.1.42:3000`)
4. Press **Connect** (or OK on remote)
5. CineCast loads — the URL is saved for future launches

To change the server URL later: open the app, press Back on the remote to return to setup, then press **Forget saved server**.

---

## Remote Control Mapping

| Button | Action |
|---|---|
| ▲ ▼ ◀ ▶ | Navigate between items |
| OK / Enter | Select / confirm |
| Back | Previous page / exit |
| Play ▶ | Play video |
| Pause ⏸ | Pause video |
| Play/Pause ⏯ | Toggle play/pause |
| ⏪ Rewind | Seek −30 s |
| ⏩ Fast forward | Seek +30 s |
| ⏹ Stop | Stop and return to start |

---

## TV UI Features

- **Large text and cards** — optimised for viewing at distance
- **Focus ring** — red outline shows which item is selected
- **Horizontal rows** — use ◀▶ to scroll through movie/TV rows
- **Source switching** — use ◀▶ to cycle embed providers in the player
- **Back button** — works on all pages

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App shows "Connecting…" forever | Wrong server URL — press Back, re-enter IP |
| Videos won't play | Check CORS in `config.yaml` — add your TV's IP to `cors_origins` |
| Blank screen after setup | Ensure frontend is running on port 3000 |
| App not found on TV | Re-run `npm run webos:install`, check developer mode is on |
| Images not loading | Make sure server is reachable from TV network |
