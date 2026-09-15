import type { MapId, ModeId } from '../types';

/** Level required to unlock each map / mode. */
export const MAP_UNLOCK_LEVEL: Record<MapId, number> = {
  nebelmoor: 1,
  sturmklippen: 2,
  mondbruch: 5,
};

export const MODE_UNLOCK_LEVEL: Record<ModeId, number> = {
  classic: 1,
  blitz: 1,
  zen: 1,
  precision: 2,
  daily: 3,
  endless: 4,
};
