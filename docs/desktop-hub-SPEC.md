# 🖥️ Subunit Desktop — Execution Spec

**Scope:** Cross-Platform Hub-App (Linux + macOS + Windows)
**Owner:** TJ + u1
**Locked Direction:** 2026-05-16
**Related:** `~/subunit/unitone/workspace/projects/subunit-app/PHASE-1-SPEC.md` (iOS), `~/subunit/unitone/workspace/projects/subunit-ecosystem/MASTER-PLAN.md`
**Status:** DRAFT — wartet auf u1/Codex-Review + TJ-Greenlight

---

## 0. Ein-Satz-Mission

**"Ein zentraler Desktop-Hub für alles Subunit — SNI, Synapse, Chat, Decisions, Tasks, Memory — auf Linux/macOS/Windows, mit lokalem Bridge-Sidecar und derselben Backend-Schicht wie die iOS-App."**

Erfolgreich, wenn TJ nach 4 Wochen täglicher Nutzung:
- die Docker-Container `sni` und `synapse` lokal **nicht** mehr im Browser öffnet
- den u1-Hauptchat im Desktop führt, nicht in Telegram
- Tasks & Decisions im Desktop bestätigt, nicht über Telegram-Buttons

---

## 1. Was Subunit Desktop IST (In-Scope)

### 1.1 Module (Sidebar-Navigation)

| Modul | Zweck | Quelle |
|---|---|---|
| **Home** | Dashboard, Today-View (Pending Decisions + Top-Tasks + Cost + Health) | NEU |
| **Chats** | Multi-Thread Chat (u1-Hauptchat, Trading, Sonar-Dev, Synapse, …) | NEU, Bridge-V2 |
| **SNI** | Operator + Customer Dashboard (Cost, Containers, Schedules) | Migration aus `~/Documents/SNI/` |
| **Synapse** | AI Workspace, Gemini-Chat, Ingest, Vector-Search | Migration aus `~/Documents/synapse/` |
| **Inbox** | Unified Stack — Decisions + proaktive Task-Suggestions | NEU, gleiches Modell wie iOS-App |
| **Tasks** | Strukturierte Task-Liste (Linear-light) | Bridge-API existiert |
| **Memory** | Semantic Search über ChromaDB + Quellen-Cards | Memory-Agent API |
| **Activity** | Live-Timeline aller Agents (units/, Cron-Jobs, n8n) | NEU, aus `shared/status/` |
| **Briefings** | Morning / Evening / Weekly Briefings mit Audio-Playback | NEU |
| **Status** | Live-Health (Docker, Disk, RAM, Trading PnL, Cost-Counter) | aus SNI-Logik |
| **Settings** | Auth, Theme, Sidecar, Update, Keys | NEU |

### 1.2 Command Bar (global)

- Hotkey: `Cmd+K` / `Ctrl+K` (macOS / Win+Linux)
- Modi:
  - **Search** — Fuzzy über Threads + Tasks + Decisions + Memory
  - **Compose** — Schnell-Nachricht in beliebigen Thread
  - **Voice** — Push-to-Talk Aufnahme → Whisper → an aktiven Thread
- Inspiration: Raycast / Linear Command-Bar / Arc

### 1.3 Auth & Pairing

- **OAuth via `auth.subunit.ai`** (JWKS) — gleiche Auth-Schicht wie iOS, Bridge, CLI
- **Device-Binding** im OS-Keychain (macOS Keychain / Linux SecretService / Windows Credential Manager via Tauri Stronghold)
- **Single-Operator MVP** — nur TJ, kein Multi-User
- **Auto-Pair mit lokalem Bridge-Sidecar** — kein QR nötig auf demselben Host
- **Remote-Login** für andere Maschinen: Email + Passwort + Device-Code

### 1.4 Sidecar — Bridge-Daemon mitbundeln

Tauri 2 startet beim App-Launch einen mitgelieferten Bun-Binary:
- `bridge-daemon` auf `127.0.0.1:7842` (existiert bereits live unter systemd)
- Wenn systemd-Service schon läuft → Sidecar erkennt das und verbindet statt zu starten
- Sidecar-Logs in App-Settings sichtbar (Debug-Panel)
- Auto-Restart bei Crash

### 1.5 Doppel-Mode: Lokal + Remote

| Scenario | Backend | Use-Case |
|---|---|---|
| **Lokal (TJ-Maschine)** | `localhost:7842` (Sidecar) | Volle Power, Docker-Socket-Zugriff, offline-fähig |
| **Remote (Reise-Laptop)** | `api.subunit.ai` direkt | Read-Only / Limited Write, kein Docker-Steuern |
| **Browser-Fallback** | `sni.subunit.ai`, `synapse.subunit.ai` | Kunden ohne Install (Cloudflare Tunnel bleibt live) |

Der React-Code ist identisch — nur die `BACKEND_BASE_URL` ist anders.

### 1.6 Cross-Platform Distribution

- **Linux:** `.AppImage` (universal) + `.deb` (Ubuntu/Debian) + `.rpm` (Fedora)
- **macOS:** `.dmg` mit Apple-Developer-Signatur + Notarization (Apple ID nötig)
- **Windows:** `.exe` Installer (NSIS) + `.msi` (für Unternehmens-Rollouts)
- **Auto-Update:** Tauri Updater → GitHub Releases als Quelle
- **Channels:** `stable` (default), `beta` (opt-in für TJ/Erik)

### 1.7 UI / Design

- **Theme-Sprache:** geteilt mit iOS (`design/tokens.json`)
- **Cyan #06b6d4 / Deep Navy #0f172a / Dark #030b18** (Brand)
- Light + Dark + Auto (System)
- Tab-Bar / Sidebar inspirierte Layouts:
  - macOS: Native Sidebar mit Source-List
  - Win/Linux: Custom-Sidebar mit gleichem Look
- Window-Controls: nativ pro OS (Tauri default)

### 1.8 Push & Notifications

- OS-Native Notifications via Tauri `notification` API
- Categories:
  - 🔥 **Brennende Decision** (urgent, durchbricht DnD)
  - 💬 **Neue u1-Message**
  - 📋 **Briefing fertig**
  - ⚠️ **System-Alert** (Server down)
- **Quick-Action-Buttons** in Notifications (Approve / Reject / Open)
- Tray-Icon mit Pending-Count

### 1.9 Offline & Sync

- Outbox-Queue lokal via SQLite (im Bridge-Sidecar, existiert bereits)
- Optimistic-UI für Messages / Decisions / Tasks
- Sync-Reconnect via Lamport-Clock (gleich wie iOS-Spec §1.4)
- "Offline"-Badge im Status-Header wenn API/Bridge unreachable

---

## 2. Was Subunit Desktop NICHT ist (Explicit Non-Goals)

❌ **Kein Sonar-Modul**
   - Sonar bleibt eigenständiges Produkt mit eigener Desktop-App + eigener iOS-App
   - Vermischung würde beide Pricing-/Story-Linien verwässern (TJ-Entscheidung 2026-05-16)
   - Subunit-Desktop kann später ein "Sonar-Link"-Button zeigen (Tray → "Open Sonar"), aber **kein** UI-Inline

❌ **Kein Realtime Voice Call mit u1 in v1.0**
   - Phase 4+ Thema (siehe §6), gleiche LiveKit-Stack wie iOS-Spec

❌ **Kein Customer-Space in v1.0**
   - Single-Tenant Operator-Only (analog iOS Phase 1)
   - Customer-Workspace ist Master-Plan Phase 2

❌ **Kein Tauri-Mobile-Build**
   - iOS-App bleibt separates Repo (`subunit-app`, React Native + Expo)
   - Doppelte Codebase, geteiltes Backend (Bridge / API) — bewusste Entscheidung

❌ **Kein In-App-Editor / Terminal in v1.0**
   - Code-Editing bleibt in VSCode / IDEs
   - Terminal-Pane wäre Phase 3+ Thema

❌ **Kein Plugin-System in v1.0**
   - Module sind hardcoded, kein Marketplace
   - Plugin-Architecture frühestens Phase 5+

---

## 3. Architektur

### 3.1 Stack (vorgeschlagen, offen für Review)

| Layer | Technologie | Begründung |
|---|---|---|
| **Shell** | Tauri 2 (Rust + WebView) | ~30 MB Binary, native Windows, kein Chromium-Overhead, Auto-Update built-in |
| **Frontend** | React 19 + Vite + TypeScript 5.7 | SNI/Synapse sind bereits React 19 — 1:1 portierbar |
| **State** | Zustand + TanStack Query 5 | gleiche Stack wie iOS-Spec |
| **Routing** | TanStack Router | typed routes, file-based |
| **UI-Kit** | Radix + Tailwind 4 ODER Tamagui-Web | offen — siehe Open-Question §7.2 |
| **Sidecar** | Bun 1.3 Single-Binary (Bridge-Daemon) | existiert bereits, nur mitbundeln |
| **Local Storage** | Bridge-SQLite (Sidecar) + Tauri Stronghold (Secrets) | Secrets im OS-Keychain |
| **Auth** | JWT via `auth.subunit.ai` (JWKS) | identisch mit Bridge/CLI/iOS |
| **Realtime** | WebSocket gegen Bridge | für Activity-Feed + Chat-Stream |
| **i18n** | i18next, DE/EN | TJ duzt auf Deutsch, Kunden brauchen EN |
| **Testing** | Vitest (Unit) + Playwright (E2E) + Tauri Mock | |
| **Lint** | Biome (ersetzt ESLint+Prettier) | gleiche wie iOS |
| **CI/CD** | GitHub Actions + Tauri Action | Matrix-Build: linux-x64, macos-arm, macos-x64, windows-x64 |

### 3.2 Architektur-Diagramm

```
┌──────────────────────── Subunit.app (Tauri 2) ──────────────────────┐
│                                                                       │
│  Sidebar              │     Main Frame                                 │
│  ┌─────────────┐      │   ┌──────────────────────────────────────┐    │
│  │ Home        │      │   │  React 19 Modules                     │    │
│  │ Chats       │      │   │   - SNI                                │    │
│  │ SNI         │      │   │   - Synapse                            │    │
│  │ Synapse     │      │   │   - Chat                               │    │
│  │ Inbox       │      │   │   - Inbox / Tasks / Memory             │    │
│  │ Tasks       │      │   │   - Activity / Briefings / Status      │    │
│  │ Memory      │      │   │                                        │    │
│  │ Activity    │      │   │  Geteilte Auth + Theme + Hotkeys       │    │
│  │ Briefings   │      │   └──────────────────────────────────────┘    │
│  │ Status      │      │                                                 │
│  │ Settings    │      │   Command Bar (Cmd+K) overlay                  │
│  └─────────────┘      │                                                 │
│                                                                         │
│  Tray: ▢ Subunit  ●Bridge  Pending: 3                                  │
└────────────────┬──────────────────────────────────┬─────────────────────┘
                 │                                  │
        ┌────────▼─────────┐                ┌───────▼────────┐
        │ Bun-Sidecar      │                │ Native APIs    │
        │  • Bridge-Daemon │                │  • OS Keychain │
        │    127.0.0.1:7842│                │  • Notifications│
        │  • SQLite        │                │  • Tray        │
        │  • Outbox        │                │  • Updater     │
        │  • MCP-Server    │                │  • FS / Shell  │
        └────────┬─────────┘                └────────────────┘
                 │
        Cloud (über JWT):
          auth.subunit.ai    (login)
          api.subunit.ai     (sync)
          memory-agent local (embeddings)
```

### 3.3 Backend-Erweiterungen (Bridge + API)

Für die Hub-Funktionalität fehlen aktuell folgende Endpoints — müssen vor Frontend-Build implementiert werden:

| Endpoint | Methode | Zweck | Wo |
|---|---|---|---|
| `/chats/threads` | GET / POST | Thread-Liste, Thread-Anlage | Bridge + API |
| `/chats/threads/:id/messages` | GET / POST | Messages pro Thread | Bridge + API |
| `/chats/threads/:id/subscribe` | WS | Live-Stream Messages | Bridge |
| `/activity/feed` | GET (paginiert) | Agent-Events, Cron-Triggers | Bridge (liest `shared/status/`) |
| `/activity/subscribe` | WS | Live-Activity | Bridge |
| `/briefings/:period` | GET | Morning/Evening/Weekly Briefings | Bridge (liest `workspace/BRIEFING.md` etc.) |
| `/briefings/:id/audio` | GET | TTS-Stream falls vorhanden | Bridge |
| `/sni/proxy/*` | * | Proxy zu lokalem SNI-Server (Docker-Logik weiter dort) | Bridge |
| `/synapse/proxy/*` | * | Proxy zu lokalem Synapse | Bridge |

**Aufwand-Schätzung Bridge-Erweiterung:** ~3-4 Tage (Hono-Routes + SQLite-Migrations + WS-Plumbing)

### 3.4 Migration der bestehenden Apps

| Aktuell | Migration | Aufwand |
|---|---|---|
| Docker-Container `sni` (Port 3099) | Frontend nach `src/modules/sni/`, Backend (server.js mit dockerode) als zweiter Sidecar ODER über Bridge-Proxy | 2-3 Tage |
| Docker-Container `synapse` (Port 3003) | Frontend nach `src/modules/synapse/`, server.js als Sidecar, Gemini-Key in Tauri Secure Store | 2 Tage |
| Cloudflare Tunnel-Routen | bleiben unverändert (für Browser-Zugriff von Kunden) | – |

**Wichtig:** SNI/Synapse-Web-Versionen werden **weiterhin als Docker-Container deployt** für `sni.subunit.ai` / `synapse.subunit.ai`. Desktop-Module sind zweites Build-Target desselben React-Codes. Wir teilen Source, nicht Runtime.

---

## 4. Repo & Code-Layout

### 4.1 Neuer Repo

- **Name:** `subunit-desktop`
- **GitHub Org:** `subunit-ai/` (NICHT `ichbinfrohunddankbar-dev/`)
- **Lokal:** `~/subunit/unitone/workspace/projects/subunit-desktop/`
- **License:** proprietär (closed source)

### 4.2 Layout

```
subunit-desktop/
├─ src-tauri/                  Rust shell, sidecar config, updater
│  ├─ src/main.rs
│  ├─ tauri.conf.json
│  └─ binaries/                gebundelte Sidecars
│     ├─ bridge-daemon-x86_64-unknown-linux-gnu
│     ├─ bridge-daemon-aarch64-apple-darwin
│     ├─ bridge-daemon-x86_64-apple-darwin
│     └─ bridge-daemon-x86_64-pc-windows-msvc.exe
├─ src/                        React frontend
│  ├─ modules/
│  │  ├─ home/
│  │  ├─ chats/
│  │  ├─ sni/                  (Port aus ~/Documents/SNI/src)
│  │  ├─ synapse/              (Port aus ~/Documents/synapse/)
│  │  ├─ inbox/
│  │  ├─ tasks/
│  │  ├─ memory/
│  │  ├─ activity/
│  │  ├─ briefings/
│  │  ├─ status/
│  │  └─ settings/
│  ├─ shared/
│  │  ├─ auth/                 JWT, JWKS, Stronghold-Wrapper
│  │  ├─ bridge-client/        Typed Client für Bridge-API
│  │  ├─ ui/                   Layout, Sidebar, CommandBar, Tray
│  │  ├─ design-tokens/        symlink/dup von ~/subunit-app/design/tokens.json
│  │  └─ i18n/
│  ├─ App.tsx
│  └─ main.tsx
├─ packages/
│  ├─ design-tokens/           geteilt mit iOS (Tamagui-kompatibel)
│  └─ bridge-types/            TypeScript-Typen für Bridge-API (Source of Truth)
├─ scripts/
│  ├─ build-sidecar.sh
│  ├─ build-cross.sh
│  └─ release.sh
├─ .github/workflows/
│  ├─ ci.yml
│  └─ release.yml
└─ SPEC.md (dieses Doc)
```

---

## 5. Sicherheit & Datenfluss

### 5.1 Datenklassifizierung

| Daten | Lokal | Cloud | Verschlüsselung |
|---|---|---|---|
| JWT Access Token | OS-Keychain | ja, kurzlebig | OS-default |
| JWT Refresh Token | OS-Keychain | ja, 30d | OS-default |
| API-Keys (Gemini, ElevenLabs, …) | Stronghold | nein | AES-GCM (Stronghold-default) |
| Chat-Messages | SQLite (Sidecar) | sync via API | TLS in Transit |
| Memory-Embeddings | Memory-Agent lokal | optional Cloud-Backup | – |

### 5.2 Threat-Model (Kurzfassung)

- **App-Lift-Off von anderem User auf demselben Mac:** Tokens im Keychain → ohne TJ-Login nicht entschlüsselbar
- **Compromised Cloud:** Lokaler Bridge-Sidecar funktioniert offline → keine Vendor-Lock-In-Pleite
- **MITM:** TLS via Cloudflare + Pinning für `*.subunit.ai`
- **Sidecar-Tampering:** Tauri verifiziert Binary-Hash beim Start

### 5.3 DSGVO

- Keine Telemetrie ohne Opt-In
- Crash-Reports anonymisiert (Sentry mit `beforeSend` Filter)
- "Export my data" + "Delete account" im Settings-Modul (Pflicht)
- Privacy-Policy-Link

---

## 6. Phasen-Plan

| Phase | Inhalt | Dauer | Done-Definition |
|---|---|---|---|
| **0** | Tauri-Skeleton + Auth-Shell + Sidecar-Wiring | 2 Tage | App startet auf 3 OS, Bridge-Sidecar läuft, Login funktioniert |
| **1** | SNI-Modul-Port | 3 Tage | SNI-Frontend rendert im Desktop, Docker-Logik via Sidecar oder Proxy |
| **2** | Synapse-Modul-Port | 2 Tage | Synapse-Frontend rendert, Gemini-Key aus Stronghold |
| **3** | Chats + Inbox + Tasks (Bridge-V2-Endpoints) | 5 Tage | Multi-Thread-Chat funktioniert end-to-end, Outbox sync |
| **4** | Memory + Activity + Briefings | 4 Tage | alle Bridge-Reads live |
| **5** | Status-Modul + Tray + Command-Bar | 3 Tage | Cmd+K funktioniert, Tray zeigt Counters |
| **6** | Cross-Build + Auto-Update + Signing | 3 Tage | Installer für 3 OS auf GitHub Releases, Auto-Update verifiziert |
| **7** | Polishing + Internal Beta | 1 Woche | TJ + Erik nutzen täglich, Bugs gefixt |

**Gesamt MVP: ~4 Wochen** (Phase 0-7), ohne Voice-Call.

### Phase 8+ (post-MVP, Reihenfolge offen)

- **Voice-Call-Modul** (LiveKit-Sidecar, parallel zu iOS Phase 3)
- **Customer-Workspace** (analog Master-Plan Phase 2)
- **Plugin-System**
- **In-App-Editor / Terminal**

---

## 7. Open Questions (für u1/Codex/TJ-Review)

### 7.1 SNI/Synapse-Backend — Sidecar oder Proxy?

**Option A — Zweiter Sidecar:** SNI-server.js + Synapse-server.js als separate Bun-Sidecars, jeweils eigener Port. Saubere Trennung, aber 3 Sidecars zu managen.

**Option B — Bridge-Proxy:** Bridge-Daemon proxied zu SNI/Synapse-Express-Servern (die als Sub-Prozesse vom Bridge gestartet werden). Ein Sidecar, mehr Logik in Bridge.

**Empfehlung u1:** Option B, weil Bridge eh schon Process-Manager-Rolle hat (siehe `bridge-daemon` MCP-Server). Senior-Dev?

### 7.2 UI-Kit — Radix+Tailwind oder Tamagui-Web?

**Radix+Tailwind:** Web-nativ, riesiges Ecosystem, Desktop-typischer Look. Aber: iOS nutzt Tamagui → zwei Design-Systeme zu pflegen.

**Tamagui-Web:** geteiltes Design-System mit iOS, weniger Code-Duplication. Aber: Tamagui-Web ist weniger reif als Tamagui-RN, manche Komponenten fehlen.

**Empfehlung u1:** Tamagui-Web wegen Design-System-Konsistenz, mit `packages/design-tokens` als Source-of-Truth. Risiko bewusst akzeptiert.

### 7.3 macOS-Signing — eigene Apple-ID oder geteilt?

Apple Developer Account 99$/Jahr nötig. Frage: läuft auf TJ persönlich oder auf "Subunit UG"? Notarization-Pipeline einrichten.

### 7.4 Updater-Strategie — GitHub Releases oder eigener Server?

GitHub Releases ist kostenlos + reicht für Solo/Internal. Eigener Update-Server wäre nur für Privacy-Customer relevant — Phase 8+.

### 7.5 Sync-Mode-Default

Default `lokal` (Sidecar) — was wenn TJ auf Reise-Laptop ohne Sidecar arbeitet? Auto-Fallback auf `api.subunit.ai` mit Warn-Banner.

### 7.6 Beziehung zu Subunit-CLI

Subunit-CLI (`/usr/local/bin/subunit`) bleibt eigenständig. Frage: bei Desktop-Install auch CLI mit-installieren als Bundle?

### 7.7 Doppelte Wartung Web-Container vs Desktop-Modul

Wenn wir SNI in Desktop UND als Docker-Container weiterführen — wie verhindern wir Frontend-Drift? Vorschlag: SNI-Frontend wird Git-Submodule in `subunit-desktop`, Docker-Container baut aus demselben Source. Zustimmung?

---

## 8. Risiken

| Risiko | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sidecar-Bundling kompliziert auf Windows | M | M | Tauri-Best-Practices, externe Hilfe via Codex |
| dockerode auf Windows ohne Docker-Desktop | H | L (Windows-Desktop ist Nice-to-Have, nicht Must) | Feature-Gate: SNI-Modul disabled wenn Docker fehlt |
| Tamagui-Web Reife | M | M | Fallback auf Radix+Tailwind, Module gekapselt |
| macOS-Notarization-Pipeline | M | L | im Worst-Case manuelle Notarization |
| Frontend-Drift SNI Web vs Desktop | M | M | Git-Submodule + Shared-Source-of-Truth |
| Bridge-Sidecar-Crash unbemerkt | L | M | Watchdog im Tauri-Main + Tray-Status-LED |

---

## 9. Erfolgsmetriken (90 Tage post-Launch)

- TJ öffnet `sni.subunit.ai` / `synapse.subunit.ai` im Browser **< 1×/Woche**
- 80% aller Decisions in Desktop-App approved (statt Telegram)
- < 5 Crashes / 1000 Sessions
- Auto-Update auf 3 OS funktioniert mindestens 2× erfolgreich
- u1-Hauptchat: > 50% der täglichen Messages laufen über Desktop, nicht Telegram

---

## 10. Decision-Tree vor Build-Start

Für u1/Codex-Review benötigte Entscheidungen, in dieser Reihenfolge:

1. **Spec-Approval** → Codex GPT-5.5 reviewed dieses Doc, integriert Kritik
2. **Open-Questions §7** → TJ entscheidet
3. **Repo-Init** → `gh repo create subunit-ai/subunit-desktop --private`
4. **Phase-0-Start** → Tauri-Skeleton, dann sequenziell

---

## 11. Verbindung zu anderen Subunit-Projekten

| Projekt | Beziehung |
|---|---|
| `subunit-auth` | Auth-Provider (JWKS-Endpoint) |
| `subunit-bridge` | Sidecar im Desktop |
| `subunit-api` | Cloud-Backend für Remote-Mode |
| `subunit-cli` | Bleibt separat, gleicher Bridge-Client |
| `subunit-app` (iOS) | Geteiltes Backend, geteilte Design-Tokens, KEINE Code-Duplikation in Frontend |
| Sonar (Desktop + iOS) | SEPARATES Produkt — kein Touchpoint außer optionalem Tray-Link |
| `subunit-engine/docker-compose.yml` | SNI + Synapse Container bleiben für Browser-Zugriff, Desktop konsumiert gleichen Source |

---

## 12. Was als nächstes passiert

1. **TJ** schickt diese SPEC durch u1/Telegram zur Review
2. **u1** prüft auf Konsistenz mit Master-Plan + iOS-Spec
3. **Codex GPT-5.5** liefert externe Senior-Dev-Review
4. Kritik wird in SPEC integriert → Status DRAFT → FINAL
5. Repo-Init + Phase 0 Start

---

**Ende SPEC v0.1 — DRAFT 2026-05-16**
