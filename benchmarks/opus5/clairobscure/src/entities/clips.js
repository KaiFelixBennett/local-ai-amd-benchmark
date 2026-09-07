/**
 * Keyframed animation data.
 *
 * A clip is `{ dur, loop, keys:[{t, pose}] }` where `t` is normalised 0..1 and
 * `pose` is a sparse map of jointName -> [rotX, rotY, rotZ] radians, plus the
 * pseudo-joints `rootPos` and `rootRot` for root motion.
 *
 * Two rest poses / clip tables exist: humanoid (party members, the boss) and
 * creature (the Nevrons), which uses a simplified core/arms/legs skeleton.
 */

// ---------------------------------------------------------------------------
// Humanoid clips
// ---------------------------------------------------------------------------

const GUARD = {
  hips: [0.04, 0.34, 0], spine: [0.05, -0.1, 0], chest: [0.02, -0.16, 0],
  head: [0.06, -0.24, 0],
  shoulderR: [-0.86, 0.1, -0.62], elbowR: [-1.16, 0, 0.2], wristR: [0.1, 0, -0.3],
  shoulderL: [-0.42, 0, 0.68], elbowL: [-1.5, 0, -0.3], wristL: [0, 0, 0],
  hipL: [-0.2, 0, 0.16], kneeL: [0.42, 0, 0], ankleL: [-0.16, 0, 0],
  hipR: [0.16, 0, -0.14], kneeR: [0.34, 0, 0], ankleR: [-0.1, 0, 0],
  rootPos: [0, -0.07, 0],
};

const GUARD_BREATH = {
  ...GUARD,
  hips: [0.06, 0.34, 0], chest: [0.06, -0.16, 0],
  shoulderR: [-0.8, 0.1, -0.58], shoulderL: [-0.38, 0, 0.64],
  rootPos: [0, -0.04, 0],
};

export const HUMANOID_CLIPS = {
  idle: {
    dur: 3.4, loop: true,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0], hips: [0, 0.02, 0], chest: [0.02, -0.02, 0] } },
      {
        t: 0.3,
        pose: {
          rootPos: [0, -0.018, 0], hips: [0.03, 0.06, 0.01], chest: [0.05, -0.05, -0.01],
          head: [0.02, 0.09, 0], shoulderL: [0.07, 0, 0.2], shoulderR: [0.05, 0, -0.19],
          kneeL: [0.11, 0, 0], kneeR: [0.09, 0, 0],
        },
      },
      {
        t: 0.62,
        pose: {
          rootPos: [0, 0.012, 0], hips: [-0.02, -0.04, -0.01], chest: [-0.01, 0.04, 0.01],
          head: [-0.03, -0.07, 0], shoulderL: [-0.03, 0, 0.13], shoulderR: [-0.02, 0, -0.13],
        },
      },
      { t: 1, pose: { rootPos: [0, 0, 0], hips: [0, 0.02, 0], chest: [0.02, -0.02, 0] } },
    ],
  },

  guard: {
    dur: 2.1, loop: true,
    keys: [
      { t: 0, pose: GUARD },
      { t: 0.5, pose: GUARD_BREATH },
      { t: 1, pose: GUARD },
    ],
  },

  run: {
    dur: 0.56, loop: true, linear: true,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, 0.04, 0], hips: [0.16, 0, 0], chest: [-0.1, 0.16, 0],
          hipL: [-0.72, 0, 0.06], kneeL: [0.5, 0, 0], hipR: [0.5, 0, -0.06], kneeR: [0.9, 0, 0],
          shoulderL: [0.7, 0, 0.24], elbowL: [-1.0, 0, 0], shoulderR: [-0.8, 0, -0.24], elbowR: [-1.2, 0, 0],
        },
      },
      {
        t: 0.25,
        pose: {
          rootPos: [0, 0.11, 0], hips: [0.2, 0, 0],
          hipL: [-0.2, 0, 0.06], kneeL: [0.3, 0, 0], hipR: [0.05, 0, -0.06], kneeR: [0.55, 0, 0],
          shoulderL: [0.2, 0, 0.2], shoulderR: [-0.3, 0, -0.2],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [0, 0.04, 0], hips: [0.16, 0, 0], chest: [-0.1, -0.16, 0],
          hipR: [-0.72, 0, -0.06], kneeR: [0.5, 0, 0], hipL: [0.5, 0, 0.06], kneeL: [0.9, 0, 0],
          shoulderR: [0.7, 0, -0.24], elbowR: [-1.0, 0, 0], shoulderL: [-0.8, 0, 0.24], elbowL: [-1.2, 0, 0],
        },
      },
      {
        t: 0.75,
        pose: {
          rootPos: [0, 0.11, 0], hips: [0.2, 0, 0],
          hipR: [-0.2, 0, -0.06], kneeR: [0.3, 0, 0], hipL: [0.05, 0, 0.06], kneeL: [0.55, 0, 0],
          shoulderR: [0.2, 0, -0.2], shoulderL: [-0.3, 0, 0.2],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, 0.04, 0], hips: [0.16, 0, 0], chest: [-0.1, 0.16, 0],
          hipL: [-0.72, 0, 0.06], kneeL: [0.5, 0, 0], hipR: [0.5, 0, -0.06], kneeR: [0.9, 0, 0],
          shoulderL: [0.7, 0, 0.24], elbowL: [-1.0, 0, 0], shoulderR: [-0.8, 0, -0.24], elbowR: [-1.2, 0, 0],
        },
      },
    ],
  },

  slash: {
    dur: 0.78, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.3,
        pose: {
          rootPos: [0, -0.05, -0.14], hips: [0.02, 0.66, 0], spine: [0, 0.2, 0], chest: [-0.16, 0.34, 0],
          head: [0.06, -0.36, 0],
          shoulderR: [-1.05, 0.4, -1.5], elbowR: [-1.5, 0, 0.2], wristR: [0, 0, -0.5],
          shoulderL: [-0.3, 0, 0.8], elbowL: [-1.2, 0, -0.3],
          hipL: [-0.34, 0, 0.16], kneeL: [0.6, 0, 0], hipR: [0.3, 0, -0.14], kneeR: [0.45, 0, 0],
        },
      },
      {
        t: 0.47,
        pose: {
          rootPos: [0, -0.02, 0.4], hips: [0.06, -0.5, 0], spine: [0.08, -0.24, 0], chest: [0.22, -0.4, 0],
          head: [0.16, 0.2, 0],
          shoulderR: [-2.4, -0.3, 0.55], elbowR: [-0.18, 0, 0.1], wristR: [0.2, 0, 0.35],
          shoulderL: [0.5, 0, 0.5], elbowL: [-0.7, 0, -0.2],
          hipL: [-0.7, 0, 0.16], kneeL: [0.32, 0, 0], hipR: [0.55, 0, -0.14], kneeR: [0.9, 0, 0],
        },
      },
      {
        t: 0.66,
        pose: {
          rootPos: [0, -0.04, 0.3], hips: [0.04, -0.34, 0], chest: [0.16, -0.3, 0],
          shoulderR: [-2.0, -0.2, 0.3], elbowR: [-0.5, 0, 0.1],
          shoulderL: [0.2, 0, 0.5], elbowL: [-0.9, 0, -0.2],
          hipL: [-0.5, 0, 0.16], kneeL: [0.4, 0, 0], hipR: [0.4, 0, -0.14], kneeR: [0.7, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  thrust: {
    dur: 0.72, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.34,
        pose: {
          rootPos: [0, -0.08, -0.2], hips: [0.04, 0.8, 0], chest: [-0.05, 0.3, 0], head: [0.04, -0.5, 0],
          shoulderR: [-0.5, 0.6, -0.5], elbowR: [-2.1, 0, 0.2], wristR: [0, 0, -0.2],
          shoulderL: [-0.7, 0, 0.9], elbowL: [-1.7, 0, -0.4],
          hipL: [-0.3, 0, 0.18], kneeL: [0.75, 0, 0], hipR: [0.28, 0, -0.16], kneeR: [0.5, 0, 0],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [0, -0.14, 0.62], hips: [0.02, 0.1, 0], chest: [0.06, -0.12, 0], head: [0.1, 0, 0],
          shoulderR: [-1.62, 0.05, -0.12], elbowR: [-0.06, 0, 0.05], wristR: [0, 0, 0],
          shoulderL: [0.6, 0, 0.7], elbowL: [-0.6, 0, -0.3],
          hipL: [-0.95, 0, 0.16], kneeL: [0.25, 0, 0], hipR: [0.6, 0, -0.14], kneeR: [1.05, 0, 0],
        },
      },
      {
        t: 0.68,
        pose: {
          rootPos: [0, -0.12, 0.46], hips: [0.02, 0.2, 0],
          shoulderR: [-1.4, 0.05, -0.2], elbowR: [-0.3, 0, 0.05],
          hipL: [-0.8, 0, 0.16], kneeL: [0.3, 0, 0], hipR: [0.5, 0, -0.14], kneeR: [0.95, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  flurry: {
    dur: 0.34, loop: false,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, -0.06, 0.06], hips: [0, 0.5, 0], chest: [-0.1, 0.26, 0],
          shoulderR: [-1.5, 0.3, -0.9], elbowR: [-1.5, 0, 0.2],
          shoulderL: [-0.5, 0, 0.7], elbowL: [-1.4, 0, -0.3],
          hipL: [-0.24, 0, 0.16], kneeL: [0.5, 0, 0], hipR: [0.2, 0, -0.14], kneeR: [0.4, 0, 0],
        },
      },
      {
        t: 0.42,
        pose: {
          rootPos: [0, -0.04, 0.32], hips: [0.03, -0.3, 0], chest: [0.16, -0.34, 0],
          shoulderR: [-2.2, -0.2, 0.4], elbowR: [-0.2, 0, 0.1],
          shoulderL: [0.3, 0, 0.5], elbowL: [-0.8, 0, -0.2],
          hipL: [-0.5, 0, 0.16], kneeL: [0.35, 0, 0], hipR: [0.42, 0, -0.14], kneeR: [0.72, 0, 0],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, -0.06, 0.1], hips: [0, 0.42, 0], chest: [-0.06, 0.2, 0],
          shoulderR: [-1.3, 0.25, -0.8], elbowR: [-1.4, 0, 0.2],
          shoulderL: [-0.45, 0, 0.66], elbowL: [-1.35, 0, -0.3],
          hipL: [-0.26, 0, 0.16], kneeL: [0.48, 0, 0], hipR: [0.22, 0, -0.14], kneeR: [0.42, 0, 0],
        },
      },
    ],
  },

  cast: {
    dur: 1.05, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.3,
        pose: {
          rootPos: [0, -0.06, -0.06], hips: [0, 0.1, 0], spine: [-0.12, 0, 0], chest: [-0.2, 0, 0],
          head: [-0.24, 0, 0],
          shoulderR: [-2.5, 0, -0.3], elbowR: [-0.5, 0, 0.1], wristR: [0, 0, 0],
          shoulderL: [-2.2, 0, 0.5], elbowL: [-0.6, 0, -0.1],
          hipL: [-0.1, 0, 0.1], kneeL: [0.2, 0, 0], hipR: [0.08, 0, -0.1], kneeR: [0.2, 0, 0],
        },
      },
      {
        t: 0.58,
        pose: {
          rootPos: [0, 0.03, 0], hips: [0, 0, 0], spine: [-0.2, 0, 0], chest: [-0.3, 0, 0],
          head: [-0.34, 0, 0],
          shoulderR: [-2.85, 0, -0.16], elbowR: [-0.16, 0, 0.05],
          shoulderL: [-2.7, 0, 0.3], elbowL: [-0.2, 0, -0.05],
          hipL: [0, 0, 0.1], kneeL: [0.1, 0, 0], hipR: [0, 0, -0.1], kneeR: [0.1, 0, 0],
        },
      },
      {
        t: 0.76,
        pose: {
          rootPos: [0, -0.1, 0.16], hips: [0.12, 0, 0], spine: [0.16, 0, 0], chest: [0.28, 0, 0],
          head: [0.2, 0, 0],
          shoulderR: [-1.5, 0, -0.5], elbowR: [-0.8, 0, 0.1],
          shoulderL: [-1.4, 0, 0.6], elbowL: [-0.9, 0, -0.1],
          hipL: [-0.2, 0, 0.12], kneeL: [0.4, 0, 0], hipR: [0.16, 0, -0.12], kneeR: [0.36, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  shot: {
    dur: 0.66, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.3,
        pose: {
          rootPos: [0, -0.05, 0], hips: [0, 0.42, 0], chest: [-0.04, -0.18, 0], head: [0.02, -0.2, 0],
          shoulderR: [-1.5, 0.1, -0.2], elbowR: [-0.3, 0, 0.05], wristR: [0, 0, 0],
          shoulderL: [-1.2, 0, 0.7], elbowL: [-1.1, 0, -0.5],
          hipL: [-0.2, 0, 0.14], kneeL: [0.4, 0, 0], hipR: [0.16, 0, -0.12], kneeR: [0.34, 0, 0],
        },
      },
      {
        t: 0.42,
        pose: {
          rootPos: [0, -0.05, -0.1], hips: [0, 0.42, 0], chest: [-0.16, -0.18, 0],
          shoulderR: [-1.75, 0.1, -0.2], elbowR: [-0.62, 0, 0.05], wristR: [-0.4, 0, 0],
          shoulderL: [-1.3, 0, 0.7], elbowL: [-1.3, 0, -0.5],
          hipL: [-0.2, 0, 0.14], kneeL: [0.44, 0, 0], hipR: [0.16, 0, -0.12], kneeR: [0.36, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  aim: {
    dur: 2.6, loop: true,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, -0.05, 0], hips: [0, 0.34, 0], chest: [-0.05, -0.14, 0], head: [0.02, -0.18, 0],
          shoulderR: [-1.5, 0.08, -0.18], elbowR: [-0.28, 0, 0.05],
          shoulderL: [-1.25, 0, 0.66], elbowL: [-1.15, 0, -0.5],
          hipL: [-0.18, 0, 0.14], kneeL: [0.38, 0, 0], hipR: [0.14, 0, -0.12], kneeR: [0.32, 0, 0],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [0, -0.03, 0], hips: [0.02, 0.34, 0], chest: [-0.02, -0.14, 0], head: [0.04, -0.18, 0],
          shoulderR: [-1.46, 0.08, -0.18], elbowR: [-0.3, 0, 0.05],
          shoulderL: [-1.22, 0, 0.66], elbowL: [-1.18, 0, -0.5],
          hipL: [-0.18, 0, 0.14], kneeL: [0.36, 0, 0], hipR: [0.14, 0, -0.12], kneeR: [0.3, 0, 0],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, -0.05, 0], hips: [0, 0.34, 0], chest: [-0.05, -0.14, 0], head: [0.02, -0.18, 0],
          shoulderR: [-1.5, 0.08, -0.18], elbowR: [-0.28, 0, 0.05],
          shoulderL: [-1.25, 0, 0.66], elbowL: [-1.15, 0, -0.5],
          hipL: [-0.18, 0, 0.14], kneeL: [0.38, 0, 0], hipR: [0.14, 0, -0.12], kneeR: [0.32, 0, 0],
        },
      },
    ],
  },

  parry: {
    dur: 0.52, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.16,
        pose: {
          rootPos: [0, -0.11, -0.1], hips: [0.02, 0.62, 0], chest: [-0.16, 0.1, 0], head: [0.02, -0.42, 0],
          shoulderR: [-1.9, 0.5, -0.5], elbowR: [-1.35, 0, 0.4], wristR: [0.5, 0, -0.9],
          shoulderL: [-0.9, 0, 0.9], elbowL: [-1.7, 0, -0.5],
          hipL: [-0.36, 0, 0.2], kneeL: [0.66, 0, 0], hipR: [0.3, 0, -0.16], kneeR: [0.56, 0, 0],
        },
      },
      {
        t: 0.44,
        pose: {
          rootPos: [0, -0.09, 0.08], hips: [0.02, 0.1, 0], chest: [0.06, -0.24, 0], head: [0.08, 0.1, 0],
          shoulderR: [-1.5, -0.2, 0.5], elbowR: [-0.9, 0, 0.2], wristR: [0, 0, 0.4],
          shoulderL: [-0.4, 0, 0.7], elbowL: [-1.2, 0, -0.4],
          hipL: [-0.3, 0, 0.18], kneeL: [0.5, 0, 0], hipR: [0.26, 0, -0.14], kneeR: [0.48, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  dodge: {
    dur: 0.56, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.22,
        pose: {
          rootPos: [-0.55, -0.02, -0.32], rootRot: [0, 0, 0.22],
          hips: [-0.16, 0.5, 0.14], chest: [-0.2, 0.16, -0.1], head: [-0.1, -0.3, 0],
          shoulderR: [-0.5, 0.3, -1.1], elbowR: [-1.3, 0, 0.3],
          shoulderL: [-0.2, 0, 1.2], elbowL: [-1.0, 0, -0.4],
          hipL: [-0.5, 0, 0.3], kneeL: [0.7, 0, 0], hipR: [0.5, 0, -0.3], kneeR: [0.4, 0, 0],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [-0.42, -0.06, -0.2], rootRot: [0, 0, 0.12],
          hips: [-0.06, 0.44, 0.06], chest: [-0.06, 0.06, -0.04],
          shoulderR: [-0.8, 0.2, -0.8], elbowR: [-1.2, 0, 0.2],
          shoulderL: [-0.4, 0, 0.9], elbowL: [-1.3, 0, -0.3],
          hipL: [-0.3, 0, 0.2], kneeL: [0.5, 0, 0], hipR: [0.3, 0, -0.2], kneeR: [0.42, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  counter: {
    dur: 0.62, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.2,
        pose: {
          rootPos: [0, -0.14, -0.08], hips: [0.04, 0.9, 0], chest: [-0.2, 0.4, 0],
          shoulderR: [-0.9, 0.5, -1.7], elbowR: [-1.7, 0, 0.3], wristR: [0.3, 0, -0.6],
          shoulderL: [-0.4, 0, 1.0], elbowL: [-1.5, 0, -0.4],
          hipL: [-0.4, 0, 0.2], kneeL: [0.8, 0, 0], hipR: [0.34, 0, -0.16], kneeR: [0.6, 0, 0],
        },
      },
      {
        t: 0.4,
        pose: {
          rootPos: [0, -0.06, 0.72], hips: [0.08, -0.7, 0], spine: [0.1, -0.3, 0], chest: [0.3, -0.5, 0],
          head: [0.2, 0.3, 0],
          shoulderR: [-2.7, -0.4, 0.7], elbowR: [-0.12, 0, 0.1], wristR: [0.3, 0, 0.5],
          shoulderL: [0.7, 0, 0.6], elbowL: [-0.5, 0, -0.2],
          hipL: [-0.9, 0, 0.16], kneeL: [0.25, 0, 0], hipR: [0.7, 0, -0.14], kneeR: [1.0, 0, 0],
        },
      },
      {
        t: 0.62,
        pose: {
          rootPos: [0, -0.08, 0.5], hips: [0.05, -0.4, 0], chest: [0.2, -0.35, 0],
          shoulderR: [-2.2, -0.3, 0.4], elbowR: [-0.5, 0, 0.1],
          hipL: [-0.6, 0, 0.16], kneeL: [0.35, 0, 0], hipR: [0.5, 0, -0.14], kneeR: [0.8, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  hurt: {
    dur: 0.55, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.16,
        pose: {
          rootPos: [0, -0.02, -0.34], rootRot: [-0.1, 0, 0],
          hips: [-0.3, 0.14, 0], spine: [-0.22, 0, 0.1], chest: [-0.3, 0, 0.14], head: [-0.4, 0.16, 0.2],
          shoulderR: [0.5, 0, -0.7], elbowR: [-0.5, 0, 0.2],
          shoulderL: [0.6, 0, 0.8], elbowL: [-0.5, 0, -0.2],
          hipL: [-0.4, 0, 0.2], kneeL: [0.7, 0, 0], hipR: [0.2, 0, -0.2], kneeR: [0.5, 0, 0],
        },
      },
      {
        t: 0.46,
        pose: {
          rootPos: [0, -0.09, -0.14], hips: [-0.1, 0.24, 0], chest: [-0.12, -0.08, 0.06],
          head: [-0.16, 0.06, 0.08],
          shoulderR: [-0.3, 0, -0.7], elbowR: [-0.9, 0, 0.2],
          shoulderL: [0.1, 0, 0.8], elbowL: [-1.0, 0, -0.3],
          hipL: [-0.3, 0, 0.18], kneeL: [0.55, 0, 0], hipR: [0.24, 0, -0.16], kneeR: [0.45, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  item: {
    dur: 0.85, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.35,
        pose: {
          rootPos: [0, -0.03, 0], hips: [0, 0.1, 0], chest: [-0.1, 0, 0], head: [-0.16, 0, 0],
          shoulderL: [-2.2, 0, 0.4], elbowL: [-1.0, 0, -0.2],
          shoulderR: [-1.0, 0, -0.5], elbowR: [-1.2, 0, 0.2],
        },
      },
      {
        t: 0.6,
        pose: {
          rootPos: [0, 0.02, 0], hips: [0, 0.1, 0], chest: [0.08, 0, 0], head: [0.1, 0, 0],
          shoulderL: [-2.7, 0, 0.25], elbowL: [-0.3, 0, -0.1],
          shoulderR: [-0.8, 0, -0.5], elbowR: [-1.3, 0, 0.2],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  slam: {
    dur: 0.95, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.36,
        pose: {
          rootPos: [0, 0.12, -0.1], hips: [-0.1, 0, 0], spine: [-0.2, 0, 0], chest: [-0.34, 0, 0],
          head: [-0.4, 0, 0],
          shoulderR: [-2.9, 0, -0.2], elbowR: [-0.2, 0, 0.05],
          shoulderL: [-2.9, 0, 0.2], elbowL: [-0.2, 0, -0.05],
          hipL: [0.1, 0, 0.1], kneeL: [0.05, 0, 0], hipR: [0.1, 0, -0.1], kneeR: [0.05, 0, 0],
        },
      },
      {
        t: 0.54,
        pose: {
          rootPos: [0, -0.24, 0.2], hips: [0.4, 0, 0], spine: [0.3, 0, 0], chest: [0.4, 0, 0],
          head: [0.3, 0, 0],
          shoulderR: [-0.2, 0, -0.4], elbowR: [-0.3, 0, 0.1],
          shoulderL: [-0.2, 0, 0.4], elbowL: [-0.3, 0, -0.1],
          hipL: [-0.7, 0, 0.24], kneeL: [1.2, 0, 0], hipR: [-0.6, 0, -0.24], kneeR: [1.1, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  ultimate: {
    dur: 1.9, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.26,
        pose: {
          rootPos: [0, -0.16, -0.16], hips: [0.2, 0, 0], spine: [0.14, 0, 0], chest: [0.24, 0, 0],
          head: [0.3, 0, 0],
          shoulderR: [-0.2, 0, -1.3], elbowR: [-1.9, 0, 0.4],
          shoulderL: [-0.2, 0, 1.3], elbowL: [-1.9, 0, -0.4],
          hipL: [-0.5, 0, 0.3], kneeL: [1.0, 0, 0], hipR: [-0.45, 0, -0.3], kneeR: [0.95, 0, 0],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [0, 0.34, 0], hips: [-0.24, 0, 0], spine: [-0.2, 0, 0], chest: [-0.4, 0, 0],
          head: [-0.5, 0, 0],
          shoulderR: [-3.0, 0, -0.16], elbowR: [-0.1, 0, 0.05],
          shoulderL: [-3.0, 0, 0.16], elbowL: [-0.1, 0, -0.05],
          hipL: [0.3, 0, 0.1], kneeL: [0.4, 0, 0], hipR: [0.3, 0, -0.1], kneeR: [0.4, 0, 0],
        },
      },
      {
        t: 0.68,
        pose: {
          rootPos: [0, -0.2, 0.5], hips: [0.34, -0.5, 0], spine: [0.2, -0.2, 0], chest: [0.44, -0.4, 0],
          head: [0.3, 0.2, 0],
          shoulderR: [-2.6, -0.4, 0.7], elbowR: [-0.16, 0, 0.1],
          shoulderL: [0.5, 0, 0.6], elbowL: [-0.6, 0, -0.2],
          hipL: [-0.9, 0, 0.2], kneeL: [0.3, 0, 0], hipR: [0.7, 0, -0.2], kneeR: [1.0, 0, 0],
        },
      },
      { t: 1, pose: GUARD },
    ],
  },

  death: {
    dur: 1.5, loop: false,
    keys: [
      { t: 0, pose: GUARD },
      {
        t: 0.18,
        pose: {
          rootPos: [0, -0.1, -0.3], hips: [-0.4, 0.2, 0], chest: [-0.4, 0, 0.2], head: [-0.5, 0.2, 0.3],
          shoulderR: [0.6, 0, -0.9], elbowR: [-0.4, 0, 0.2],
          shoulderL: [0.7, 0, 1.0], elbowL: [-0.4, 0, -0.2],
          hipL: [-0.5, 0, 0.3], kneeL: [0.9, 0, 0], hipR: [0.2, 0, -0.3], kneeR: [0.6, 0, 0],
        },
      },
      {
        t: 0.55,
        pose: {
          rootPos: [0, -0.62, -0.3], rootRot: [0, 0, 0.3],
          hips: [0.3, 0.3, 0.2], spine: [0.2, 0, 0.1], chest: [0.3, 0, 0.2], head: [0.4, 0.2, 0.2],
          shoulderR: [-0.4, 0, -1.2], elbowR: [-0.9, 0, 0.3],
          shoulderL: [-0.3, 0, 1.2], elbowL: [-0.9, 0, -0.3],
          hipL: [-1.4, 0, 0.4], kneeL: [2.0, 0, 0], hipR: [-1.2, 0, -0.4], kneeR: [1.9, 0, 0],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, -0.82, -0.42], rootRot: [-0.2, 0, 0.5],
          hips: [0.5, 0.4, 0.3], spine: [0.3, 0, 0.15], chest: [0.4, 0, 0.25], head: [0.5, 0.3, 0.3],
          shoulderR: [-0.2, 0, -1.4], elbowR: [-1.1, 0, 0.3],
          shoulderL: [-0.1, 0, 1.4], elbowL: [-1.1, 0, -0.3],
          hipL: [-1.6, 0, 0.5], kneeL: [2.2, 0, 0], hipR: [-1.4, 0, -0.5], kneeR: [2.1, 0, 0],
        },
      },
    ],
  },

  victory: {
    dur: 3.2, loop: true,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, 0, 0], hips: [0, 0.16, 0], chest: [-0.1, -0.1, 0], head: [-0.1, -0.14, 0],
          shoulderR: [-2.85, 0, -0.3], elbowR: [-0.25, 0, 0.1],
          shoulderL: [0.1, 0, 0.3], elbowL: [-0.6, 0, -0.2],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [0, 0.05, 0], hips: [0.02, 0.2, 0], chest: [-0.16, -0.12, 0], head: [-0.2, -0.1, 0],
          shoulderR: [-2.95, 0, -0.24], elbowR: [-0.18, 0, 0.08],
          shoulderL: [0.16, 0, 0.36], elbowL: [-0.55, 0, -0.2],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, 0, 0], hips: [0, 0.16, 0], chest: [-0.1, -0.1, 0], head: [-0.1, -0.14, 0],
          shoulderR: [-2.85, 0, -0.3], elbowR: [-0.25, 0, 0.1],
          shoulderL: [0.1, 0, 0.3], elbowL: [-0.6, 0, -0.2],
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Creature clips
// ---------------------------------------------------------------------------

/** Simplified skeleton shared by every Nevron. */
export const CREATURE_REST = {
  core: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0],
  armL: [0, 0, 0.3], foreL: [-0.3, 0, 0],
  armR: [0, 0, -0.3], foreR: [-0.3, 0, 0],
  legL: [0, 0, 0.1], legR: [0, 0, -0.1],
  tail: [0, 0, 0],
  rootPos: [0, 0, 0], rootRot: [0, 0, 0],
};

export const CREATURE_CLIPS = {
  idle: {
    dur: 2.9, loop: true,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0], core: [0.02, 0, 0], head: [0, 0.1, 0] } },
      {
        t: 0.35,
        pose: {
          rootPos: [0, 0.07, 0], core: [-0.06, 0.06, 0.02], torso: [0.04, 0, 0], head: [-0.08, -0.14, 0.03],
          armL: [-0.14, 0, 0.42], foreL: [-0.44, 0, 0], armR: [-0.1, 0, -0.38], foreR: [-0.4, 0, 0],
          legL: [0.06, 0, 0.12], legR: [-0.04, 0, -0.12], tail: [0.12, 0.2, 0],
        },
      },
      {
        t: 0.7,
        pose: {
          rootPos: [0, -0.03, 0], core: [0.06, -0.06, -0.02], head: [0.06, 0.16, -0.03],
          armL: [0.08, 0, 0.24], armR: [0.06, 0, -0.22], tail: [-0.08, -0.2, 0],
        },
      },
      { t: 1, pose: { rootPos: [0, 0, 0], core: [0.02, 0, 0], head: [0, 0.1, 0] } },
    ],
  },

  /** Wind-up: the pose held while the telegraph ring closes. */
  windup: {
    dur: 0.9, loop: false,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0], core: [0, 0, 0] } },
      {
        t: 0.62,
        pose: {
          rootPos: [0, 0.06, -0.5], core: [-0.34, 0.16, 0], torso: [-0.2, 0.1, 0], head: [-0.36, 0, 0],
          armL: [-1.5, 0.3, 0.7], foreL: [-1.5, 0, 0], armR: [-1.7, -0.3, -0.7], foreR: [-1.6, 0, 0],
          legL: [0.24, 0, 0.16], legR: [0.2, 0, -0.16], tail: [-0.4, 0, 0],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, 0.09, -0.62], core: [-0.44, 0.2, 0], torso: [-0.26, 0.12, 0], head: [-0.46, 0, 0],
          armL: [-1.8, 0.36, 0.8], foreL: [-1.7, 0, 0], armR: [-2.0, -0.36, -0.8], foreR: [-1.8, 0, 0],
          legL: [0.3, 0, 0.16], legR: [0.26, 0, -0.16], tail: [-0.5, 0, 0],
        },
      },
    ],
  },

  /** Strike: the follow-through from wind-up into contact. */
  strike: {
    dur: 0.24, loop: false, linear: true,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, 0.09, -0.62], core: [-0.44, 0.2, 0], torso: [-0.26, 0.12, 0], head: [-0.46, 0, 0],
          armL: [-1.8, 0.36, 0.8], foreL: [-1.7, 0, 0], armR: [-2.0, -0.36, -0.8], foreR: [-1.8, 0, 0],
          legL: [0.3, 0, 0.16], legR: [0.26, 0, -0.16], tail: [-0.5, 0, 0],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, -0.1, 0.95], core: [0.5, -0.24, 0], torso: [0.3, -0.14, 0], head: [0.44, 0, 0],
          armL: [0.7, -0.3, 0.2], foreL: [-0.2, 0, 0], armR: [0.9, 0.3, -0.2], foreR: [-0.25, 0, 0],
          legL: [-0.5, 0, 0.16], legR: [0.5, 0, -0.16], tail: [0.6, 0, 0],
        },
      },
    ],
  },

  recover: {
    dur: 0.5, loop: false,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, -0.1, 0.95], core: [0.5, -0.24, 0], torso: [0.3, -0.14, 0], head: [0.44, 0, 0],
          armL: [0.7, -0.3, 0.2], armR: [0.9, 0.3, -0.2],
          legL: [-0.5, 0, 0.16], legR: [0.5, 0, -0.16],
        },
      },
      { t: 1, pose: { rootPos: [0, 0, 0], core: [0.02, 0, 0], head: [0, 0.1, 0] } },
    ],
  },

  cast: {
    dur: 1.0, loop: false,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0] } },
      {
        t: 0.55,
        pose: {
          rootPos: [0, 0.34, -0.1], core: [-0.3, 0, 0], head: [-0.4, 0, 0],
          armL: [-2.5, 0, 0.7], foreL: [-0.4, 0, 0], armR: [-2.5, 0, -0.7], foreR: [-0.4, 0, 0],
        },
      },
      {
        t: 0.78,
        pose: {
          rootPos: [0, 0.1, 0.2], core: [0.3, 0, 0], head: [0.34, 0, 0],
          armL: [-0.8, 0, 0.4], armR: [-0.8, 0, -0.4],
        },
      },
      { t: 1, pose: { rootPos: [0, 0, 0], core: [0.02, 0, 0] } },
    ],
  },

  hurt: {
    dur: 0.42, loop: false,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0] } },
      {
        t: 0.2,
        pose: {
          rootPos: [0, 0.04, -0.34], core: [-0.4, 0.16, 0.14], torso: [-0.2, 0, 0.1], head: [-0.5, 0.2, 0.2],
          armL: [0.5, 0, 0.7], armR: [0.6, 0, -0.7], legL: [-0.3, 0, 0.2], legR: [0.24, 0, -0.2],
        },
      },
      { t: 1, pose: { rootPos: [0, 0, 0], core: [0.02, 0, 0] } },
    ],
  },

  stagger: {
    dur: 2.0, loop: true,
    keys: [
      {
        t: 0,
        pose: {
          rootPos: [0, -0.22, -0.2], core: [0.44, 0.1, 0.1], torso: [0.2, 0, 0], head: [0.5, 0.1, 0.15],
          armL: [0.5, 0, 0.9], foreL: [-0.2, 0, 0], armR: [0.55, 0, -0.9], foreR: [-0.2, 0, 0],
          legL: [-0.4, 0, 0.3], legR: [0.4, 0, -0.3],
        },
      },
      {
        t: 0.5,
        pose: {
          rootPos: [0, -0.28, -0.16], core: [0.5, -0.1, -0.08], head: [0.55, -0.1, -0.12],
          armL: [0.6, 0, 0.85], armR: [0.62, 0, -0.85],
          legL: [-0.34, 0, 0.3], legR: [0.34, 0, -0.3],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, -0.22, -0.2], core: [0.44, 0.1, 0.1], torso: [0.2, 0, 0], head: [0.5, 0.1, 0.15],
          armL: [0.5, 0, 0.9], foreL: [-0.2, 0, 0], armR: [0.55, 0, -0.9], foreR: [-0.2, 0, 0],
          legL: [-0.4, 0, 0.3], legR: [0.4, 0, -0.3],
        },
      },
    ],
  },

  roar: {
    dur: 1.4, loop: false,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0] } },
      {
        t: 0.3,
        pose: {
          rootPos: [0, 0.16, -0.2], core: [-0.4, 0, 0], torso: [-0.2, 0, 0], head: [-0.7, 0, 0],
          armL: [-1.4, 0, 1.2], foreL: [-0.9, 0, 0], armR: [-1.5, 0, -1.2], foreR: [-0.9, 0, 0],
          legL: [0.2, 0, 0.24], legR: [0.2, 0, -0.24],
        },
      },
      {
        t: 0.62,
        pose: {
          rootPos: [0, 0.22, -0.16], core: [-0.5, 0.06, 0], head: [-0.8, 0.08, 0],
          armL: [-1.6, 0, 1.35], armR: [-1.7, 0, -1.35],
        },
      },
      { t: 1, pose: { rootPos: [0, 0, 0], core: [0.02, 0, 0] } },
    ],
  },

  death: {
    dur: 1.6, loop: false,
    keys: [
      { t: 0, pose: { rootPos: [0, 0, 0] } },
      {
        t: 0.22,
        pose: {
          rootPos: [0, 0.14, -0.2], core: [-0.5, 0, 0], head: [-0.7, 0, 0],
          armL: [-1.2, 0, 1.2], armR: [-1.3, 0, -1.2],
        },
      },
      {
        t: 1,
        pose: {
          rootPos: [0, -0.75, -0.5], rootRot: [0.35, 0.2, 0.3],
          core: [0.7, 0.2, 0.2], torso: [0.4, 0, 0.1], head: [0.7, 0.3, 0.3],
          armL: [0.8, 0, 1.4], foreL: [-0.2, 0, 0], armR: [0.9, 0, -1.4], foreR: [-0.2, 0, 0],
          legL: [-1.2, 0, 0.5], legR: [-1.0, 0, -0.5], tail: [0.8, 0.4, 0],
        },
      },
    ],
  },
};
