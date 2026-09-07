/// <reference types="vite/client" />

interface Window {
  __mmDebug?: {
    fps: number;
    targets: number;
    particles: number;
    pool: number;
    phase: string;
    difficulty: number;
    seed: number;
    events: string[];
  };
}
