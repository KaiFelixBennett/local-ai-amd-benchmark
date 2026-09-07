// postfx.js — EffectComposer + bloom + OutputPass (or graceful passthrough).
// game.js calls renderer.render() either way; this module just wires the composer.
import * as THREE from 'three';

// Try to build the composer. Returns true on success, false on any failure —
// the renderer falls back to plain tone-mapped rendering.
export async function setupPostfx(renderer) {
    try {
        // Resolve addons dynamically; await so `mods` is a real object.
        const mods = await awaitAddons();
        if (!mods) return false;

        const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = mods;

        const composer = new EffectComposer(renderer.renderer);
        composer.addPass(new RenderPass(renderer.scene, renderer.camera));

        const bloom = new UnrealBloomPass(
            new THREE.Vector2(renderer.container.clientWidth, renderer.container.clientHeight),
            1.0,   // strength — subtle, for gilt highlights
            0.35,  // radius
            0.85   // threshold — only emissive accents bloom
        );
        composer.addPass(bloom);

        const output = new OutputPass();
        composer.addPass(output);

        renderer.setComposer(composer);
        renderer._bloom = bloom;
        return true;
    } catch (e) {
        console.warn('[postfx] disabled — plain renderer path active.', e);
        return false;
    }
}

// ---- dynamic import of three addons (lazy, so failure doesn't kill boot) ----
async function awaitAddons() {
    try {
        const tunnel = async () => {
            const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
            const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
            const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
            const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
            return { EffectComposer, RenderPass, UnrealBloomPass, OutputPass };
        };
        const mods = await tunnel();
        return mods && mods.EffectComposer ? mods : null;
    } catch (e) {
        console.error('[postfx] failed to load addons', e);
        return null;
    }
}

export function setBloomStrength(renderer, strength) {
    if (renderer._bloom) renderer._bloom.strength = strength;
}
