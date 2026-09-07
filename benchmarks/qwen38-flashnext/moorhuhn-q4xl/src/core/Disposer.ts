import type { GameEvents } from '../core/EventBus';

type Handler<T> = (payload: T) => void;
type EmitterLike = {
  on<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): () => void;
};

/** Helper to register UI listeners and dispose of them together. */
export class Disposer {
  private fns: (() => void)[] = [];

  listen<K extends keyof GameEvents>(
    emitter: EmitterLike,
    key: K,
    fn: Handler<GameEvents[K]>,
  ): void {
    this.fns.push(emitter.on(key, fn));
  }

  add(fn: () => void): void {
    this.fns.push(fn);
  }

  dispose(): void {
    for (const fn of this.fns) fn();
    this.fns = [];
  }
}
