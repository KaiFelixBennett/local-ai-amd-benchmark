// turn-queue.js — initiative/speed ordering, upcoming-turn preview.
// Pure ranking: returns an ordered array of actor references by current spd (speed).

export function speedOf(actor) {
    let spd = actor.spd || 10;
    if (actor.statuses && actor.statuses.some(s => s.type === 'stun')) spd *= 0.85;
    if (actor.buffs && actor.buffs['spd-up']) spd *= actor.buffs['spd-up'];
    return spd;
}

// Deterministic tiebreak: lower tieId wins (stable ordering between runs).
export function buildTurnQueue(actors) {
    const alive = actors.filter(a => !a.dead && a.hp > 0);
    const sorted = alive.slice().sort((a, b) => {
        const d = speedOf(b) - speedOf(a);
        if (Math.abs(d) < 0.001) return (a.tieId ?? 0) - (b.tieId ?? 0);
        return d;
    });
    return sorted;
}

// Upcoming preview: the next N (default 5) actors in phase order, cycling.
export function previewActors(queue, n = 5) {
    const out = [];
    if (!queue.length) return out;
    for (let i = 0; i < n; i++) {
        out.push(queue[i % queue.length]);
    }
    return out;
}

// Advance: pop the head and return it, keeping the rest for preview.
export function popTurn(queue) {
    if (!queue.length) return null;
    return queue.shift();
}

// Push an actor back into the queue at the tail (used when acting out of order).
export function pushBack(queue, actor) {
    queue.push(actor);
    return queue;
}
