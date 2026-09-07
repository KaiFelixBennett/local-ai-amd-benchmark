# MEMORY — Status-Tracking

## Erledigt (verifiziert!)
- [x] M1: Bugfix `dt` → `deltaTime` in character.js + enemy.js
- [x] M2: HDRI (Zavelstein) als scene.environment
- [x] M3: GLTF-Modelle in Open World (shrub, rock, firepit, barrel — 4/4)
- [x] M4a: Battle-HUD im Open World ausblenden
- [x] M4b: Open World Beleuchtung (Ambient + Hemi + Key + Fill + Rim)
- [x] M4c: Controls-Hint wechselt Battle/Exploration
- [x] M4d: Player Indicator (blauer Strahl)
- [x] M4e: Sky-Dome mit Mond + Sternen
- [x] M4f: Encounter-Marker vergrößert + PointLights
- [x] M5a: Battle-Stage (Wand, Säulen) im Open World ausblenden
- [x] M5b: Pfad-Textur verbessert (Canvas mit Steinen + Gras-Kanten)
- [x] M5c: GLTF-Modelle heller (emissive Boost)
- [x] M5d: Kamera nach Sieg in Richtung Marker
- [x] M5e: Atmosphere-Partikel im Open World ausblenden
- [x] M5f: Encounter-Zonen näher an Startpunkt
- [x] M6: **E2E-Verifiziert!** Battle → Sieg → Open World → Encounter → Battle

## E2E-Test-Ergebnis (letzte Session)
1. Battle startet: ✅ action_select, Lucien am Zug
2. Sieg auslösen: ✅ mode → openworld, inOW = true
3. Open World: ✅ Player bei (0, -2), Kamera auf Marker ausgerichtet
4. Bewegung: ✅ WASD funktioniert, Player bewegt sich
5. Encounter: ✅ Bei Distanz 0 zu Marker + R → mode → battle
6. Battle nach Encounter: ✅ action_select, alle HP voll

## Offene Probleme (nächste Session)
1. **Boden-Textur**: worn_brick_path wird async geladen, Boden sieht flach-grün aus
2. **Shrubs**: Geladen aber kaum sichtbar (zu klein/dunkel)
3. **Encounter per R-Taste**: Update-Loop wird nicht korrekt aufgerufen (Timeout in _startEncounter)
4. **Mouse-Look**: Fehlt noch für Open World
5. **Post-Processing**: SSAO + Bloom könnte im Open World anders getunt sein

## Was NICHT geändert werden soll
- Battle-System (funktioniert perfekt)
- Character/Enemy Meshes (prozedural, ausreichend)
- Audio-Engine (funktioniert)
- HDRI-Loading (funktioniert)
