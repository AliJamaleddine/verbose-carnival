/* ================================================================
   Procedural Noise Utilities
   Value Noise + Fractal Brownian Motion (FBM)
   ================================================================ */

const NoiseUtils = (function () {

  /**
   * Deterministic pseudo-random hash for two integers.
   * Returns a value in [0, 1).
   */
  function hash2(ix, iy) {
    const n = ix + iy * 57 + (ix ^ iy) * 131;
    const s = Math.sin(n) * 43758.5453;
    return s - Math.floor(s);
  }

  /**
   * Smooth-step (cubic Hermite) interpolation.
   */
  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  /**
   * 2-D Value Noise — bilinear interpolation of random lattice values.
   * @param {number} x
   * @param {number} y
   * @returns {number} value in [0, 1)
   */
  function valueNoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const ux = smoothstep(fx);
    const uy = smoothstep(fy);

    const v00 = hash2(ix,     iy);
    const v10 = hash2(ix + 1, iy);
    const v01 = hash2(ix,     iy + 1);
    const v11 = hash2(ix + 1, iy + 1);

    // Bilinear mix
    return (
      v00
      + (v10 - v00) * ux
      + (v01 - v00) * uy
      + (v11 - v10 - v01 + v00) * ux * uy
    );
  }

  /**
   * Fractal Brownian Motion — sums several octaves of value noise.
   * @param {number} x
   * @param {number} y
   * @param {number} octaves  — typically 4–8
   * @returns {number} value in [0, 1) (approximately)
   */
  function fbm(x, y, octaves) {
    let value     = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let norm      = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * valueNoise(x * frequency, y * frequency);
      norm      += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value / norm;
  }

  /**
   * Ridged FBM — gives sharper, mountain-like ridges.
   */
  function ridgedFbm(x, y, octaves) {
    let value     = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let norm      = 0;

    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(valueNoise(x * frequency, y * frequency) * 2 - 1);
      value += amplitude * (n * n);
      norm      += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value / norm;
  }

  return { valueNoise, fbm, ridgedFbm };
})();
