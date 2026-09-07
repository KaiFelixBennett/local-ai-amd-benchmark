import * as THREE from 'three';

// Post-processing: EffectComposer + RenderPass + UnrealBloomPass + OutputPass.
// If any part of the import or construction fails, we silently fall back to a
// plain render() passthrough — a correct plain renderer beats a composer that throws.

export async function createPostFX(gameRenderer) {
  const { renderer, scene, camera } = gameRenderer;
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
      await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js')
      ]);

    const size = renderer.getSize(new THREE.Vector2());
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.42,   // strength — subtle, gilded highlights only
      0.65,   // radius
      0.82    // threshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    return {
      kind: 'composer',
      composer,
      bloom,
      setSize(w, h) { composer.setSize(w, h); },
      render() { composer.render(); },
      // Intensity-driven look: desperate fights bloom a touch stronger.
      setMood(intensity) {
        bloom.strength = 0.42 + 0.22 * (1 - intensity);
      },
      dispose() {
        bloom.dispose();
        composer.dispose?.();
      }
    };
  } catch (err) {
    console.warn('[postfx] falling back to plain rendering:', err);
    return {
      kind: 'passthrough',
      setSize() {},
      render() { renderer.render(scene, camera); },
      setMood() {},
      dispose() {}
    };
  }
}
