# Multiplayer-Plan — Echtes PvP über WebSocket

Plan für **Trainerkämpfe gegen echte Spieler** in der Pokémon GBC Edition.
Architektur: **autoritativer Node-WebSocket-Server auf dem VPS** (wss://), genau
im Stil der übrigen celox.io-Apps. Die Lobby-UI ist bereits im Spiel umgesetzt
(`js/ui.js` → `OnlineScreen`/`OnlineSearchScreen`/`OnlineCodeScreen`) und spricht
nur das Transport-Interface aus `js/net.js` an — der Server klinkt sich dort ein,
die Screens bleiben unverändert.

> **🟢 LIVE:** Echtes PvP läuft auf `wss://pokemon.celox.io/ws`. Pausenmenü →
> ONLINE → Schnellkampf / Raum öffnen (Code) / Code eingeben → Kampf im
> GBC-Look. Der Server ist autoritativ (Node + ws, systemd `pkmn-battle`).
>
> **✅ Phase P0 erledigt** — `js/battle-core.js` (isomorph Browser + Node),
> seedbare RNG (`makeRng`/mulberry32), gemeinsame Quelle der Wahrheit.
>
> **✅ Phase P1 erledigt** — `resolveTurn` (event-basiert) im Core, autoritativer
> `server/server.js` (Matchmaking, Räume, Team-Validierung, Turn-Loop, erzwungene
> Wechsel, Timeouts, Disconnect→Forfeit), `WebSocketTransport` + `OnlineBattleScreen`
> im Client, nginx-`/ws`-Proxy + systemd-Service. Headless- UND Browser-E2E grün.

---

## 1. Designziele & Constraints

| Ziel | Entscheidung |
|------|--------------|
| **Cheat-Sicherheit** | Server ist autoritativ. Clients senden nur *Absichten* (Zug/Wechsel/Item), der Server berechnet Schaden/RNG/Status mit der **geteilten** Kampflogik. Clients berechnen nie verbindlich. |
| **Determinismus** | RNG-Seed kommt vom Server; beide Clients animieren dasselbe Ergebnis. |
| **Look & Feel** | Alles im 160×144-GBC-Stil. Lobby, Suche, Code-Eingabe, Kampf identisch zur Solo-UI. |
| **Infra-Fit** | Node + systemd + nginx-Reverse-Proxy auf `69.62.121.168`, wie xword/xchange. Ein Port (loopback), `wss://pokemon.celox.io/ws`. |
| **Offline bleibt offline** | Der Solo-Teil läuft weiter komplett ohne Netz (gebündelter Pokédex). Online ist rein additiv. |
| **Fairness** | Team-Validierung serverseitig (Teamgröße, Levelcap, legale Movesets, keine Legendären-Sperre konfigurierbar). |

---

## 2. Komponentenübersicht

```
┌── Browser A ──┐                              ┌── Browser B ──┐
│ ui.js Lobby   │                              │ ui.js Lobby   │
│ net.js (WS)   │── wss://pokemon.celox.io/ws ─┤ net.js (WS)   │
│ battle-core ◄─┼─ animiert nur Server-Events ─┼─► battle-core │
└───────────────┘            │                 └───────────────┘
                             ▼
                  ┌─────────────────────────┐
                  │  pkmn-battle-server      │  Node + ws
                  │  (systemd, Port 4250)    │
                  │  • Matchmaking/Räume     │
                  │  • battle-core (Solo!)   │  ← dieselbe Engine wie der Client
                  │  • Team-Validierung      │
                  │  • RNG-Seed + Auflösung  │
                  └─────────────────────────┘
                             ▲
                  nginx: location /ws { proxy → 127.0.0.1:4250; Upgrade }
```

### 2.1 Geteilte Kampf-Engine (`battle-core`)

Früher steckte die Kampfmechanik komplett in `js/battle.js`, verwoben mit dem
`BattleScreen` (Rendering + Eingabe). **P0 (erledigt)** hat die *reine* Logik in
das isomorphe Modul **`js/battle-core.js`** ausgelagert (läuft in Browser **und**
Node, UMD: Browser-Global `BattleCore` bzw. `require()`):

- ✅ `effectiveness`, `calcStats`, `expFor`, `damage`, `catchChance`, `EVO`, `CHART`, `SPECIAL`
- ✅ seedbarer RNG (`makeRng(seed)` = `mulberry32`) statt `Math.random()`, damit
  Server und beide Clients bitgleich rechnen. `damage(att, def, move, rng)` nimmt
  die RNG als Parameter (Default `Math.random` → Solo unverändert).
- ⬜ **offen:** `resolveTurn(state, actionA, actionB, rng)` → `events[]`
  (deterministische, event-basierte Rundenauflösung) — kommt in P1.

`battle.js` (Client) wird in P1 zu einem dünnen *Renderer*, der `events[]`
abspielt — egal ob lokal (Solo) oder vom Server (PvP). Der Server importiert
exakt dieselbe `battle-core.js`. Eine Quelle der Wahrheit.

---

## 3. Lobby-Flows (bereits im offiziellen Look gebaut)

Erreichbar über **Pausenmenü → ONLINE**. Screens existieren schon in `ui.js`:

```
 ONLINE-KAMPF                 SUCHE GEGNER...            CODE EINGEBEN
┌──────────────────┐         ┌──────────────────┐      ┌──────────────────┐
│ ● VERBUNDEN      │         │      (◓ Ball)    │      │   ^   ^   ^   ^   │
│ ID: TR-7F3A      │         │   SUCHE GEGNER..  │      │  [A] [B] [3] [K] │
│ > SCHNELLKAMPF   │   ──►   │                   │      │   v   v   v   v   │
│   RAUM ERSTELLEN │         │  CODE  4K7P       │      │  A: Beitreten    │
│   CODE EINGEBEN  │         │  B: Abbrechen     │      │  B: Zurueck      │
│   ZURUECK        │         └──────────────────┘      └──────────────────┘
└──────────────────┘
```

- **SCHNELLKAMPF** → `quickMatch()` (Matchmaking-Queue).
- **RAUM ERSTELLEN** → `createRoom()` zeigt 4-stelligen CODE, wartet (`waitForJoin`).
- **CODE EINGEBEN** → GBC-Code-Picker → `joinRoom(code)`.
- Status-Punkt: gelb = verbinde, grün = verbunden, rot = offline.
- Trainer-ID (`TR-XXXX`) ist anonym & gerätelokal (`localStorage` `pkmn_netid`).

Heute enden alle Pfade höflich im „Online-Dienst startet bald"-Hinweis
(Mock). Mit dem Server liefern dieselben Methoden ein `{ opponent }` und der
Übergang in den PvP-Kampf wird aktiv (`OnlineSearchScreen.onMatched`, dort
markiertes TODO).

---

## 4. Wire-Protokoll (JSON über WebSocket)

Ein Nachrichtenobjekt pro Frame: `{ t: <type>, ... }`. Server ist Schiedsrichter.

### Handshake / Lobby
| → Server | Bedeutung |
|----------|-----------|
| `{t:'hello', id, ver}` | Client meldet Trainer-ID + Spielversion |
| `{t:'queue'}` | in Schnellkampf-Warteschlange |
| `{t:'create'}` | privaten Raum öffnen |
| `{t:'join', code}` | Raum per Code betreten |
| `{t:'cancel'}` | Suche/Warten abbrechen |

| ← Server | Bedeutung |
|----------|-----------|
| `{t:'welcome', id}` | Verbindung bestätigt |
| `{t:'room', code}` | Raum erstellt, Code anzeigen |
| `{t:'matched', battleId, seed, you, opp}` | Gegner gefunden, Seed + Slots |
| `{t:'error', code}` | `no-room` / `bad-team` / `version` / `timeout` |

### Kampf
| → Server | Bedeutung |
|----------|-----------|
| `{t:'team', mons[]}` | gewähltes 6er-Team (Spezies/Level/Moves/Status) |
| `{t:'action', turn, kind:'move'|'switch'|'item', data}` | Zug-Absicht der Runde |

| ← Server | Bedeutung |
|----------|-----------|
| `{t:'start', first}` | beide Teams valide, Kampf beginnt |
| `{t:'turn', turn, events[]}` | aufgelöste Runde (Schaden, Status, K.O., Wechselzwang …) — Client **animiert** nur |
| `{t:'request', turn, options}` | du bist dran (Wechsel-/Item-Optionen) |
| `{t:'end', result, reason}` | `win`/`lose`/`draw`, Grund (`ko`/`forfeit`/`timeout`/`disconnect`) |

**Rundenablauf:** beide schicken `action` → Server sammelt beide → `resolveTurn`
mit dem `battleId`-Seed → broadcastet identische `events[]` → beide Clients
spielen sie mit der vorhandenen Animationspipeline ab. Niemand wartet auf den
Gegner-Client für die Berechnung; nur auf dessen *Absicht* (mit Timeout).

---

## 5. Team-Validierung (serverseitig, P1)

Bei `{t:'team'}` prüft der Server hart:
- Teamgröße 1–6, jede Spezies ∈ 1…151.
- Level ≤ **Levelcap** des Modus (Default 50; „Flat-Rules": alle auf 50
  normalisiert → faire Kämpfe unabhängig vom Spielfortschritt — empfohlen).
- Movesets aus dem legalen Pool (`Data.movesFor`) — keine injizierten Moves.
- Stats werden serverseitig aus Basiswerten **neu berechnet** (Client-Stats ignoriert).
- Optional: Klausel-Set (Legendären-Sperre, Spezies-Klausel) pro Raum.

So ist ein manipulierter `localStorage`-Spielstand im PvP wirkungslos.

---

## 6. Robustheit

- **Zug-Timeout:** 30 s pro Runde; Ablauf = zufälliger Move (oder Forfeit nach 2×).
- **Reconnect:** `battleId` + kurzlebiges Token; Wiederverbinden innerhalb 30 s
  setzt den Kampf fort, sonst Sieg für den verbliebenen Spieler.
- **Heartbeat:** ws-Ping alle 20 s; tote Sockets werden geräumt.
- **Rate-Limit:** max. N Nachrichten/s pro Socket; ungültige Schemas → Disconnect.
- **Versions-Gate:** `ver`-Mismatch → freundlicher Hinweis „Bitte Seite neu laden".

---

## 7. Infrastruktur & Deployment (VPS 69.62.121.168)

Analog zu xword/xchange — neuer systemd-Service + nginx-Location.

**Service** `/opt/pkmn-battle-server/` (Repo: `pepperonas/pkmn-battle-server`):
```
server.js          ws-Server, Matchmaking, Räume
battle-core.js     Symlink/Kopie aus dem Spiel-Repo (eine Quelle der Wahrheit)
package.json       deps: ws
```
```ini
# /etc/systemd/system/pkmn-battle.service
[Service]
ExecStart=/usr/bin/node /opt/pkmn-battle-server/server.js
Environment=PORT=4250
Restart=always
User=www-data
```

**nginx** (im `pokemon.celox.io`-Block):
```nginx
location /ws {
    proxy_pass http://127.0.0.1:4250;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;          # lange Kämpfe / Heartbeat
}
```

**Client-Umschaltung** (`js/net.js`): `makeTransport()` von `MockTransport` auf
`WebSocketTransport('wss://pokemon.celox.io/ws')` umstellen und `available=true`.
Lokale Entwicklung gegen `ws://localhost:4250`.

**Aufwand:** RAM/CPU vernachlässigbar (Text-Frames, keine Assets). Skaliert für
Hobby-Last locker auf dem bestehenden VPS; bei Bedarf später Cluster + sticky.

---

## 8. Phasenplan

| Phase | Inhalt | Ergebnis |
|-------|--------|----------|
| **P0 ✅** | `battle-core.js` aus `battle.js` extrahiert, seedbarer RNG, Solo nutzt es weiter | Engine isomorph & testbar, Solo unverändert |
| **P1 ✅** | `resolveTurn` (event-basiert), `server/server.js` (queue/create/join), `WebSocketTransport` + `OnlineBattleScreen`, Team-Validierung, Timeouts, Disconnect→Forfeit | **Echter PvP-Kampf live** auf wss://pokemon.celox.io/ws |
| **P2 ✅** | PvP-Team-Auswahl (Party+Box), Legendären-Klausel (Schnellkampf), Zug-Timer, Reconnect (Grace + Resume-Token) | Stabiler & fairer, Disconnect ≠ sofort verloren |
| **P3** | Wertung (ELO), Sieg-/Niederlage-Statistik, optional Rangliste, Spectate | Kompetitives Online-Meta |

P0 ist reine Client-Refaktorierung (kein Risiko, sofort startbar). Ab P1 läuft
der Server. Die Lobby-Screens stehen bereits.

---

## 9. Sicherheit & Datenschutz

- Keine Accounts, kein PII: nur die anonyme `TR-XXXX`-ID (gerätelokal).
- Server speichert nur flüchtigen Match-State (RAM), keine Persistenz nötig (P1/P2).
- `Origin`-Check auf `https://pokemon.celox.io`; striktes JSON-Schema; alles
  Spielrelevante wird serverseitig nachgerechnet (Stats/Schaden/RNG).
- wss/TLS terminiert nginx (Let's Encrypt, schon vorhanden).

---

## 10. Offene Entscheidungen

1. **Regelwerk:** Flat-50 (empfohlen, fair) vs. „bring dein Team wie es ist".
2. **Legendäre** im PvP erlauben/sperren (pro Raum konfigurierbar?).
3. **Matchmaking** P1 simpel (FIFO-Queue) — ELO erst ab P3.
4. **Repo-Layout:** eigenes `pkmn-battle-server`-Repo vs. `server/`-Unterordner
   im Spiel-Repo (Letzteres erleichtert den geteilten `battle-core`-Import).
