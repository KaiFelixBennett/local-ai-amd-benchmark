/**
 * Spawn-Regie-Tests (pure chooseSpawn-Logik): Event-Vorrang, Karte-
 * Exklusivität, Event-Gehte (sturmvogel), maxConcurrent, seltene Ziele,
 * Schwärme.
 */
import { describe, it, expect } from 'vitest';
import { chooseSpawn, type SelectionContext } from '../src/game/spawner';
import { Rng } from '../src/core/rng';

function ctx(over: Partial<SelectionContext> = {}): SelectionContext {
  return {
    mapId: 'nebelmoor',
    mode: 'classic',
    eventExtra: null,
    activeEvent: null,
    activeCounts: {},
    rng: new Rng('spawn-test'),
    progress: 0.5,
    ...over,
  };
}

describe('chooseSpawn', () => {
  it('Event-Zusatzziel hat Vorrang', () => {
    for (let i = 0; i < 50; i++) {
      const c = ctx({ rng: new Rng(`x${i}`), eventExtra: 'schwarmvogel' });
      const req = chooseSpawn(c);
      expect(req?.targetId).toBe('schwarmvogel');
    }
  });

  it('nimmt kein Event-Zusatzziel, wenn maxConcurrent erreicht ist', () => {
    // goldschnabel hat maxConcurrent 1
    const c = ctx({ eventExtra: 'goldschnabel', activeCounts: { goldschnabel: 1 } });
    const req = chooseSpawn(c);
    expect(req?.targetId).not.toBe('goldschnabel');
  });

  it('sturmvogel erscheint nur auf sturmklippen UND nur via crosswind-Event', () => {
    // 1) Auf sturmklippen ohne crosswind: nie (requiresEvent + spawnWeight 0)
    for (let i = 0; i < 100; i++) {
      const c = ctx({ rng: new Rng(`s${i}`), mapId: 'sturmklippen' });
      const req = chooseSpawn(c);
      expect(req?.targetId).not.toBe('sturmvogel');
    }
    // 2) Auf anderer Karte selbst mit crosswind: nie (Exklusivität)
    for (let i = 0; i < 100; i++) {
      const c = ctx({ rng: new Rng(`o${i}`), mapId: 'nebelmoor', activeEvent: 'crosswind' });
      const req = chooseSpawn(c);
      expect(req?.targetId).not.toBe('sturmvogel');
    }
    // 3) Nur als Event-Zusatzziel (eventExtra) wird er gesendet
    const c = ctx({ mapId: 'sturmklippen', eventExtra: 'sturmvogel' });
    expect(chooseSpawn(c)?.targetId).toBe('sturmvogel');
  });

  it('Exklusivziele erscheinen nur auf ihrer Karte', () => {
    // nebelfluesterer: nebelmoor + mondbruch, NICHT sturmklippen
    for (let i = 0; i < 150; i++) {
      const c = ctx({ rng: new Rng(`m${i}`), mapId: 'sturmklippen' });
      const req = chooseSpawn(c);
      expect(req?.targetId).not.toBe('nebelfluesterer');
    }
  });

  it('respektiert maxConcurrent (keine Überfüllung)', () => {
    // moorflatterer maxConcurrent 4
    const c = ctx({ activeCounts: { moorflatterer: 4 } });
    for (let i = 0; i < 50; i++) {
      const r = chooseSpawn({ ...c, rng: new Rng(`oc${i}`) });
      expect(r?.targetId).not.toBe('moorflatterer');
    }
  });

  it('Schwärme erzeugen groupId und mehrere Vögel', () => {
    let swarm = false;
    for (let i = 0; i < 1000; i++) {
      const c = ctx({ rng: new Rng(`sw${i}`) });
      const req = chooseSpawn(c);
      if (req && req.groupId !== null) {
        swarm = true;
        expect(req.count).toBeGreaterThanOrEqual(3);
        expect(req.count).toBeLessThanOrEqual(5);
        break;
      }
    }
    expect(swarm).toBe(true);
  });

  it('liefert null, wenn keine Kandidaten übrig sind', () => {
    // Alle Kandidaten auf maxConcurrent -> leer
    const c = ctx({
      activeCounts: {
        moorflatterer: 99,
        schnellfeder: 99,
        korkenzieher: 99,
        panzerpelz: 99,
        goldschnabel: 99,
        nebelfluesterer: 99,
        taeuscher: 99,
        schwarmvogel: 99,
        kurvensegler: 99,
      },
    });
    expect(chooseSpawn(c)).toBeNull();
  });
});
