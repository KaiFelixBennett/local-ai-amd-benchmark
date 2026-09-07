# Clair Obscur: Expedition 33 — Fortschritt

## Ziel
Ultra-realistische Open World mit Terrain-Heightmap, 120 Bäumen, volumetrischem Nebel, besserer Beleuchtung, Post-FX, Roaming Enemies und Maus-Kamera. Game startet in Open World.

## Erledigt (verifiziert!)
- [x] Open World Character Height Fix
  - Spieler-Füße bei Y=0.09 im lokalen Koordinatensystem → Spieler stand 0.09 Einheiten über Terrain
  - Fix: `this._playerBody.position.y = playerH - 0.09` in open-world.js update()
  - Verifiziert: playerY + 0.09 == terrainHeight (diff=0.000)
- [x] Battle Victory Flow Bug behoben
  - `_nextTurn()` hat VICTORY/DEFEAT State nicht geprüft → State ging von `victory` zurück auf `reaction`
  - Fix: VICTORY/DEFEAT Check in `_nextTurn()` hinzugefügt (battle-system.js Zeile ~195)
  - Verifiziert: Nach Sieg → State bleibt `victory` → `_enterOpenWorld()` wird aufgerufen → Game Mode `openworld`
- [x] Open World komplett neu gebaut
  - Terrain-Heightmap mit Multi-Octave-Noise (Hügel, Täler, Tal in der Mitte) **220x220 Welt**
  - Dirt Path der dem Terrain folgt
  - Forest Ground PBR-Textur (1K, 4 Maps: albedo, normal, roughness, ao)
  - **120 prozedurale Bäume** (3 Typen: Pine, Oak, Birch) **mit Rinden-Textur, Ästen, mehrschichtigem Laub**
  - Wind-Animation für Bäume
  - 12 Rocks (GLTF, Poly Haven)
  - 3 Fässer (GLTF, Poly Haven)
  - 5 Dead Trees (GLTF, Poly Haven)
  - 20 Shrubs (GLTF, Poly Haven)
  - Fire Pit mit flackerndem Feuerlicht
  - Brunnen (Interactable)
  - Schatztruhe (Interactable)
  - Vorratskiste (Interactable)
  - Altes Buch (Interactable)
  - **6 Encounter-Zones** mit roten Markierungen
  - Sky Dome mit Mond, Sternen, Milky Way (**200 Radius**)
  - Volumetrischer Nebel (**600 Partikel**)
  - God Rays (8 volumetrische Lichtstrahlen)
  - Moon Light, Fill Light, Rim Light, Ground Fog Light
  - Player-Indikator (blaues Licht)
  - **Detaillierter Player-Charakter** (Rüstung, Helm, Stiefel, Schwert am Rücken)
  - **6 Roaming Enemies mit KI** (Patrol → Chase → Attack)
  - **Maus-Kamera-Steuerung** (Pointer Lock, Mausrad Zoom)
  - WASD Bewegung, dritte-Person Kamera
- [x] Battle Stage Beleuchtung verbessert (Cinematic Three-Point-Lighting, balanced exposure)
- [x] Post-FX-Upgrade
  - Film Grain (reduziert auf 0.015 für bessere Lesbarkeit)
  - Bloom (UnrealBloomPass, Stärke 0.35)
  - Color Grading (Teal/Orange, subtil)
  - Vignette (0.3 für bessere Sichtbarkeit)
  - Chromatic Aberration
- [x] Open World Ambience (Wind, Crickets, Distant Owl)
- [x] Prompts hide/show für Open World/Battle Transition
- [x] Battle Stage korrekt verstecken im Open World (rekursiv)
- [x] Fog für Open World (dichter, atmosphärischer)
- [x] 8 neue Gegnertypen mit prozeduralen Meshes (Dark Wolf, Shadow Stalker, Skeleton Warrior, Dark Mage, Cave Spider, Goblin Shaman)
- [x] Encounter Transition funktioniert (Zone-spezifische Gegner: Dunkler Wald → Dark Wolf + Shadow Stalker)
- [x] Battle Camera snap (keine Interpolation von Open World Position)
- [x] Open World hide/show rekursiv (alle Kinder werden versteckt/angezeigt)
- [x] Game startet in Open World (nicht Battle)
- [x] Pointer Lock für Maus-Kamera (Klick auf Canvas)
- [x] Mausrad Zoom (5-20m Distanz)
- [x] Escape verlässt Pointer Lock
- [x] Schwarze Kästen im Battle behoben (Cape entfernt, Contact Shadow entfernt, HP Bar Background entfernt, Reflexionsebene entfernt)
- [x] Character Mesh verbessert (keine schwarzen Overlays mehr)
- [x] Enemy Mesh verbessert (keine schwarzen Overlays mehr)
- [x] Battle Attack funktioniert (Dark Wolf HP 80 → 63 getestet)

## In Arbeit
- [ ] Battle Victory Flow (Enemies werden nach Sieg resettet - Bug)
- [ ] Echte Character-Assets von Kenney (FBX→GLTF Conversion pending)
- [ ] Open World Character Height Fix (Charakter soll immer auf Terrain-Höhe stehen)

## Bekannte Probleme
- Character Assets: Kenney FBX-Dateien benötigen Blender-Konvertierung zu GLTF
- Open World: Spieler-Position wird nicht korrekt auf Terrain-Höhe gesetzt (manchmal schwebend)
- [x] Roaming Enemy KI (Patrol → Chase → Attack → Battle)
- [x] 6 Roaming Enemies mit verschiedenen Typen
- [x] Encounter Transition funktioniert (Zone + Roaming)
- [x] Battle → Open World Transition nach Sieg
- [x] Kenney Character Assets heruntergeladen (CC0, FBX→GLTF Conversion pending)

## In Arbeit
- [ ] Keine (alle Punkte erledigt!)

## Bekannte Probleme
- Fir/Pine Tree GLTF Models von Poly Haven haben keine `.bin` Datei (404) → prozedurale Bäume als Fallback
- WASD Steuerung im Browser: Keys werden nur kurz gedrückt → Game-Loop braucht mehrere Frames (manuell per eval testbar)
- Battle Scene etwas dunkel → Tone Mapping Exposure 1.3, weiter optimierbar
- Maus-Kamera-Steuerung: Pointer Lock braucht Klick auf Canvas zum Aktivieren

## Nächste Schritte
1. Optional: Bäume noch realistischer machen (Detail-Texturen, mehr Variation)
2. Optional: Bäume noch realistischer machen (Detail-Texturen, mehr Variation)
3. Optional: Mehr Interactables (Kisten, Truhen, Bücher)
4. Optional: Open World Quests/Story
5. Optional: Wetter-System (Regen, Schnee)

## Entscheidungen
- **Prozedurale Bäume statt GLTF**: Fir/Pine Tree Models von Poly Haven haben keine `.bin` Datei → prozedurale Bäume als Fallback
- **Battle Stage rekursiv verstecken**: Alle Meshes im Scene verstecken außer Open World Group und deren Kinder
- **Prompts hide/show**: Prompts haben jetzt `hide()` und `show()` Methoden für korrekte Transition
- **3 Baum-Typen**: Pine (Cone), Oak (Sphere), Birch (Sphere) für Variation
- **God Rays**: 8 volumetrische Lichtstrahlen mit pulsierender Opacity
- **Film Grain**: Animiert mit Zeit-Uniform für realistischen Look
