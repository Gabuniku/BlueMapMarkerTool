/* Shared centerline-to-corridor geometry for BlueMap fairways. */
(function (root) {
  "use strict";

  const EPS = 1e-7;

  function signedArea(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  }

  function properlyCross(a, b, c, d) {
    const abC = signedArea(a, b, c), abD = signedArea(a, b, d);
    const cdA = signedArea(c, d, a), cdB = signedArea(c, d, b);
    return abC * abD < -EPS && cdA * cdB < -EPS;
  }

  function hasSelfIntersection(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const a = polygon[i], b = polygon[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent closing edge
        if (properlyCross(a, b, polygon[j], polygon[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  // Width is measured in world blocks; the centerline is open (not a polygon).
  // Consecutive duplicate points are ignored, and near-U turns are rejected.
  // Invalid/self-crossing corridors return [] instead of displaying broken areas.
  function corridorPolygon(points, width) {
    if (!Array.isArray(points) || points.length > 4096) return [];
    const half = Number(width) / 2;
    if (!Number.isFinite(half) || half <= 0) return [];
    const clean = [];
    for (const p of points) {
      const x = Number(p?.x), z = Number(p?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      if (!clean.length || Math.hypot(x - clean[clean.length - 1].x, z - clean[clean.length - 1].z) > EPS)
        clean.push({ x, z });
    }
    if (clean.length < 2) return [];

    const normals = [];
    for (let i = 0; i < clean.length - 1; i++) {
      const dx = clean[i + 1].x - clean[i].x;
      const dz = clean[i + 1].z - clean[i].z;
      const len = Math.hypot(dx, dz);
      normals.push({ x: -dz / len, z: dx / len });
    }

    const left = [], right = [];
    for (let i = 0; i < clean.length; i++) {
      const before = normals[Math.max(0, i - 1)];
      const after = normals[Math.min(normals.length - 1, i)];
      // Reversal of direction cannot be widened into a single simple corridor.
      if (before.x * after.x + before.z * after.z < -0.999) return [];

      const sumX = before.x + after.x, sumZ = before.z + after.z;
      const magnitude = Math.hypot(sumX, sumZ);
      const miter = magnitude < EPS ? after : { x: sumX / magnitude, z: sumZ / magnitude };
      const dot = miter.x * after.x + miter.z * after.z;
      const offset = Math.min(half * 2.5, half / Math.max(0.25, dot));

      left.push({ x: clean[i].x + miter.x * offset, z: clean[i].z + miter.z * offset });
      right.push({ x: clean[i].x - miter.x * offset, z: clean[i].z - miter.z * offset });
    }
    const polygon = left.concat(right.reverse());
    return hasSelfIntersection(polygon) ? [] : polygon;
  }

  const api = Object.freeze({ corridorPolygon, hasSelfIntersection });
  root.XYNFairwayGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
