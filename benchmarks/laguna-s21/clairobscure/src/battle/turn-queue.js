/**
 * Initiative/speed-based turn queue with upcoming-turns preview.
 */

export class TurnQueue {
    constructor(rng) {
        this.rng = rng;
        this.queue = [];
        this.currentIndex = 0;
    }

    /** Add a combatant to the queue */
    add(combatant) {
        // Speed determines base initiative, with RNG variance
        const initiative = combatant.speed + this.rng.nextFloat(-2, 2);
        this.queue.push({ combatant, initiative });
    }

    /** Sort queue by initiative (highest first) */
    sort() {
        this.queue.sort((a, b) => b.initiative - a.initiative);
        this.currentIndex = 0;
    }

    /** Get the next combatant in queue */
    next() {
        if (this.queue.length === 0) return null;

        while (this.currentIndex < this.queue.length) {
            const entry = this.queue[this.currentIndex];
            this.currentIndex++;

            // Skip dead combatants
            if (!entry.combatant.isAlive) continue;

            // Re-roll initiative for next round (wrap around)
            if (this.currentIndex >= this.queue.length) {
                this.currentIndex = 0;
                // Re-roll initiative for next round
                for (const entry of this.queue) {
                    entry.initiative = entry.combatant.speed + this.rng.nextFloat(-2, 2);
                }
                this.queue.sort((a, b) => b.initiative - a.initiative);
            }

            return entry.combatant;
        }

        return null;
    }

    /** Get upcoming turns for preview */
    getUpcoming(count = 5) {
        const upcoming = [];
        const seen = new Set();

        for (let i = this.currentIndex; i < this.queue.length && upcoming.length < count; i++) {
            const entry = this.queue[i];
            if (entry.combatant.isAlive && !seen.has(entry.combatant)) {
                upcoming.push(entry.combatant);
                seen.add(entry.combatant);
            }
        }

        // Wrap around if needed
        if (upcoming.length < count && this.queue.length > 0) {
            for (let i = 0; i < this.queue.length && upcoming.length < count; i++) {
                const entry = this.queue[i];
                if (entry.combatant.isAlive && !seen.has(entry.combatant)) {
                    upcoming.push(entry.combatant);
                    seen.add(entry.combatant);
                }
            }
        }

        return upcoming;
    }

    /** Clear the queue */
    clear() {
        this.queue = [];
        this.currentIndex = 0;
    }

    /** Remove a combatant from the queue */
    remove(combatant) {
        this.queue = this.queue.filter(e => e.combatant !== combatant);
    }
}
