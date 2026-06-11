<div align="center">

![Pokémon GBC Edition](assets/thumbnail.png)

# Pokémon GBC Edition

**Ein vollständig spielbares Pokémon-Spiel im Game-Boy-Color-Stil — direkt im Browser.**

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-pokemon.celox.io-f8d030?style=for-the-badge&labelColor=2d2540)](https://pokemon.celox.io)

[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES2020-f7df1e?style=flat-square&logo=javascript&logoColor=black)](js/)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-e34f26?style=flat-square&logo=html5&logoColor=white)](index.html)
[![PokeAPI](https://img.shields.io/badge/Daten-PokeAPI-ef5350?style=flat-square&logo=pokemon&logoColor=white)](https://pokeapi.co)
[![Pokédex](https://img.shields.io/badge/Pokédex-151%2F151_fangbar-30b850?style=flat-square)](#features)
[![Gen 1](https://img.shields.io/badge/Kampfsystem-Gen--1--Formeln-5090e8?style=flat-square)](#gen-1-mechanik)
[![Auflösung](https://img.shields.io/badge/Auflösung-160×144_(GBC)-705898?style=flat-square)](#technik)
[![Kein Build](https://img.shields.io/badge/Build-keiner_nötig-a8b820?style=flat-square)](#schnellstart)
[![Speicherstand](https://img.shields.io/badge/Speichern-localStorage-f8b800?style=flat-square)](#speichern)
[![Mobile](https://img.shields.io/badge/Mobile-Touch--Steuerung-c03028?style=flat-square)](#steuerung)
[![License: MIT](https://img.shields.io/badge/Lizenz-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## Features

- **Alle 151 Gen-1-Pokémon** — Namen, Typen und Basiswerte originalgetreu von der [PokeAPI](https://pokeapi.co), beim ersten Start geladen und in `localStorage` gecacht (danach offline-fähig). Gen-2-Crystal-Sprites für den authentischen GBC-Look.
- **Gen-1-Kampfsystem** — vollständige 15-Typen-Tabelle inkl. aller Quirks (Geist→Psycho = 0, Käfer↔Gift beidseitig 2x), exakte Gen-1-Schadensformel, STAB, Volltreffer, Initiative-Reihenfolge.
- **Evolutionen** — alle Gen-1-Evolutionslinien mit Original-Leveln (Glumanda→Glutexo→Glurak …). Stein-/Tausch-Evolutionen sind auf Level gemappt, Evoli verzweigt zufällig in Aquana/Blitza/Flamara.
- **Attacken-Lernen** — beim Level-Up werden stärkere typgerechte Attacken freigeschaltet.
- **Komplette Spielwelt** — 2 Dörfer, 2 Städte, 3 Routen, eine Höhle, der Siegesweg und die Pokémon-Liga (Karte: 72×60 Tiles, alles prozedural gezeichnet).
- **2 Arenen + Champion** — Rocko (Gestein) und Misty (Wasser) vergeben Orden; nur mit beiden Orden öffnet sich das Tor zum Siegesweg und zur Liga mit Champ-Kampf (5er-Team).
- **8 Streckentrainer** — einmalige Trainerkämpfe (kein Fangen/Fliehen, 1,5x EXP) mit Belohnungen.
- **5 Legendäre** — Arktos (Felsgrotte), Zapdos (Route 2), Lavados (Siegesweg), Mewtu (Geheimkammer, erst nach dem Champion-Sieg) und Mew (versteckt hinter der Liga).
- **Fangen, Team & Box** — HP-abhängige Fangchance mit Ball-Wurf-Animation, Team (max. 6), Box, Tauschen.
- **Pokédex** — alle 151 Einträge: gefangen = farbig mit Basiswerten, gesehen = Silhouette, unbekannt = `----`. **Alle 151 sind fangbar** (Zonen-Encounter + Evolutionen + Legendäre, seltene Wild-Starter).
- **Items** — Pokébälle und Tränke im Kampf, Nachschub in jedem Poké-Center und von besiegten Trainern.

<div align="center">

| Titel | Overworld | Kampf |
|:---:|:---:|:---:|
| ![Titel](assets/screen-title.png) | ![Overworld](assets/screen-world.png) | ![Kampf](assets/screen-battle.png) |

</div>

## Schnellstart

**Online spielen:** [pokemon.celox.io](https://pokemon.celox.io)

**Lokal:** `index.html` doppelklicken — fertig. Oder mit einem statischen Server:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Beim ersten Start wird Internet benötigt (PokeAPI + Sprites + Pixel-Font), danach läuft fast alles aus dem Cache.

## Steuerung

| Aktion | Desktop | Mobile |
|---|---|---|
| Laufen | Pfeiltasten / WASD | D-Pad |
| Bestätigen / Reden / Menü | `Z` / `Enter` | `A` |
| Abbrechen / Zurück | `X` / `Esc` | `B` |

Auf Touch-Geräten erscheinen D-Pad und A/B-Buttons automatisch (Pointer-Events, kein 300-ms-Delay, kein Scroll/Zoom).

## Spielverlauf

```
KIEFERNDORF (Start + Starterwahl)
   │  Route 1 (L2-6)
WALDDORF ── Route 2 (L10-15) ── FELSGROTTE (L14-19) ⛰ Arktos
   ┌──────────────────────────────────┘
STEINSTADT 🥇 Arena 1: ROCKO (Gestein)
   │  Route 3 (L17-23)
KUESTENDORF 🥈 Arena 2: MISTY (Wasser) 🌊 Lapras am Strand
   │  Tor: nur mit 2 ORDEN
SIEGESWEG (L26-34) ── POKEMON-LIGA 👑 CHAMP SIEGFRIED
   └─ danach: MEWTU in der Geheimkammer der Felsgrotte
```

Wer beim Kampf verliert, erwacht geheilt am zuletzt besuchten Heilpunkt.

## Speichern

Ja — **alles liegt in `localStorage`**:

- `pkmn_save_v1` — Spielstand: Team & Box (Spezies/Level/EXP/KP), Bälle, Tränke, Orden, Trainer-/Arena-/Champion-/Legendären-Flags, Position, Respawn-Punkt, Pokédex (gesehen/gefangen). **Auto-Save nach jedem Kampf** + manuell über Menü → SPEICHERN.
- `pkmn_data_v1` — Pokédex-Datencache (einmalig von der PokeAPI geladen, ~30 KB).

## Technik

| Datei | Inhalt |
|---|---|
| `js/data.js` | PokeAPI-Laden/-Caching, deutsche Namen, Move-Pools mit Lern-Leveln, Sprite-Cache mit Flood-Fill-Transparenz |
| `js/battle.js` | Typen-Tabelle, Schadensformel, Stats/EXP, Evolutionstabelle, Fangen, kompletter Kampfbildschirm (wild + Trainer) |
| `js/world.js` | 72×60-Tilemap, Zonen-Encounter, Trainer, Arenen, Tore, Legendäre, NPCs, prozedurale Tiles & Charsets |
| `js/ui.js` | Textbox/Menü-Helfer, Titel, Starterwahl, Pausenmenü, Team, Box, Pokédex |
| `js/main.js` | Game-Loop, Screen-Stack, Eingaben (Tastatur + Touch), Speichern/Laden, pixel-perfekte Skalierung |

Nativ **160×144 px** (GBC), ganzzahlig hochskaliert mit `image-rendering: pixelated`. Kein Framework, kein Build-Schritt, keine Abhängigkeiten außer der PokeAPI und der Pixel-Font.

Der Kampfablauf ist als **async-Koroutine** implementiert: `await say(…)` / `await choose(…)` warten über ein pro Frame aufgelöstes Promise (`Game.nextFrame()`) auf den Game-Loop — der Kampf liest sich dadurch wie ein lineares Skript.

## Gen-1-Mechanik

Schadensformel exakt nach Spezifikation:

```
dmg = floor(floor(floor((2·Level/5 + 2) · Power · Atk/Def) / 50) + 2)
      · STAB(1.5) · Typ-Effektivität · Zufall(0.85…1.0)
```

Stats nach Gen-1-Formel mit festen IVs (8), EXP-Kurve „Medium Fast" (Level³), EXP-Gewinn `baseExp · Level / 7` (Trainer: ×1,5).

**Bewusste Abkürzungen** (im Code kommentiert, für spätere Erweiterung):

- Kein PP-System, keine Status-Attacken/-Effekte
- Vereinfachte Fangformel (ohne speziesabhängige Catch-Rate)
- Volltreffer als simple 2x-Chance statt Gen-1-Crit-Stages
- Stein-/Tausch-Evolutionen als Level-Evolutionen; Evoli-Zweig zufällig
- Fix-Schaden-Attacken (Drachenwut, Nachtnebel) als normale Power-Moves

## Deployment

```bash
rsync -avz --delete --exclude='.DS_Store' ./ root@<server>:/var/www/pokemon.celox.io/
```

Statisches Hosting genügt (Nginx/Apache/GitHub Pages) — es gibt kein Backend.

## Lizenz

[MIT](LICENSE) — © 2026 [Martin Pfeffer](https://celox.io)

Pokémon und alle zugehörigen Namen sind Marken von Nintendo/Game Freak/Creatures Inc. Dieses Projekt ist ein nicht-kommerzielles Fan-/Lernprojekt ohne jegliche Verbindung zu den Rechteinhabern. Spieldaten via [PokeAPI](https://pokeapi.co).
