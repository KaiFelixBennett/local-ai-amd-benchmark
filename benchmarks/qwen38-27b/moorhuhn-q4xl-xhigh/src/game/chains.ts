/**
 * Kettenreaktionen: Schießst du eine Umgebungsstation (z. B. Laterne),
 * reagierte die nächste im Zeitfenster mit eigener Wirkung (Wasserschwall,
 * Sporen, Glockenläuten) und gibt Punkte. Nach der letzten Station kommt
 * das Finale: Extra-Ziel, Bonuszeit oder Score-Multiplikator.
 */
import type { ChainDef } from '../config/gameConfig';

/** Zeitfenster, in dem die nächste Station noch manuell getroffen werden kann. */
const STATION_DELAY_MS = 900;

export interface ActiveChain {
  def: ChainDef;
  startedAt: number;
  nextStationAt: number;
  /** Index der nächsten auszulösenden Station. */
  nextIndex: number;
  /** Stations, die bereits ausgelöst wurden (Punkte). */
  scored: number;
}

export interface ChainCallbacks {
  /** Station getroffen: liefert (x, y, stationId, stage). */
  onStation: (stationId: string, stage: number, chainId: string) => void;
  /** Finale erreicht. */
  onFinale: (chain: ActiveChain) => void;
}

export class ChainSystem {
  private active: ActiveChain | null = null;
  private cb: ChainCallbacks;
  private chains: ChainDef[];
  private finished: Set<string> = new Set();

  constructor(chains: ChainDef[], cb: ChainCallbacks) {
    this.chains = chains;
    this.cb = cb;
  }

  /** Wird diese Umgebungsstation Teil einer Kette? */
  private findChainForStation(stationId: string): ChainDef | null {
    for (const def of this.chains) {
      if (def.stations[0] === stationId && !this.finished.has(def.id)) return def;
    }
    return null;
  }

  /**
   * Wird aufgerufen, wenn eine Umgebungsstation getroffen wird.
   * @returns true, wenn eine Kette gestartet wurde.
   */
  tryStart(stationId: string, nowMs: number): boolean {
    if (this.active) return false;
    const def = this.findChainForStation(stationId);
    if (!def) return false;
    this.active = {
      def,
      startedAt: nowMs,
      nextStationAt: nowMs + STATION_DELAY_MS,
      nextIndex: 1,
      scored: 1,
    };
    this.finished.add(def.id);
    this.cb.onStation(stationId, 0, def.id);
    return true;
  }

  /** Getroffene Station weiterführen (nur wenn nächste Station). */
  feedStation(stationId: string, nowMs: number): boolean {
    const a = this.active;
    if (!a || a.nextIndex >= a.def.stations.length) return false;
    if (a.def.stations[a.nextIndex] !== stationId) return false;
    const stage = a.nextIndex;
    a.nextIndex++;
    a.scored++;
    a.nextStationAt = nowMs + STATION_DELAY_MS;
    this.cb.onStation(stationId, stage, a.def.id);
    return true;
  }

  /**
   * Tick: prüft, ob das Zeitfenster der nächsten Station abgelaufen ist.
   * @returns 'station' | 'finale' | null
   */
  tick(nowMs: number): 'station' | 'finale' | null {
    const a = this.active;
    if (!a) return null;
    if (a.nextIndex >= a.def.stations.length) {
      // Finale
      this.active = null;
      this.cb.onFinale(a);
      return 'finale';
    }
    if (nowMs >= a.nextStationAt) {
      // Nächste Station automatisch auslösen (Umgebungsobjekt "reagiert")
      const stationId = a.def.stations[a.nextIndex];
      const stage = a.nextIndex;
      a.nextIndex++;
      a.scored++;
      a.nextStationAt = nowMs + STATION_DELAY_MS;
      this.cb.onStation(stationId, stage, a.def.id);
      return 'station';
    }
    return null;
  }

  /** Station aus der aktuellen Kette entfernen (wird getroffen, bevor die Kette dort ankommt). */
  stationHitById(stationId: string, nowMs: number): void {
    const a = this.active;
    if (!a) return;
    const idx = a.def.stations.indexOf(stationId);
    if (idx === -1 || idx < a.nextIndex) return;
    // Kette beschleunigt: springt direkt zu dieser Station
    a.nextIndex = idx;
    a.nextStationAt = nowMs;
  }

  get current(): ActiveChain | null {
    return this.active;
  }

  reset(): void {
    this.active = null;
    this.finished.clear();
  }
}
