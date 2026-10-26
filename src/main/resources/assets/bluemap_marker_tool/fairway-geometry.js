/* Shared fairway geometry; runs in BlueMap and can be imported by Node.js tests. */
(function (root) {
  "use strict";

  // A waterway has a real world width in Minecraft blocks, not pixels on screen.
  // Join offset segments with a bounded miter to avoid giant spikes on sharp bends.
  function corridorPolygon(points, width) {
    if (!Array.isArray(points)) return [];
    const half = Number(width) / 2;
    if (!Number.isFinite(half) || half <= 0) return [];

    const clean = [];
    for (const p of points) {
      const x = Number(p.x), z = Number(p.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      if (!clean.length || Math.hypot(x - clean.at(-1).x, z - clean.at(-1).z) > 1e-6) {
        clean.push({ x, z });
      }
    }
    if (clean.length < 2) return [];

    const normals = [];
    for (let i = 0; i < clean.length - 1; i++) {
      const dx = clean[i + 1].x - clean[i].x, dz = clean[i + 1].z - clean[i].z;
      const len = Math.hypot(dx, dz);
      normals.push({ x: -dz / len, z: dx / len });
    }

    const left = [], right = [];
    for (let i = 0; i < clean.length; i++) {
      const before = normals[Math.max(0, i - 1)];
      const after = normals[Math.min(normals.length - 1, i)];
      const sum = { x: before.x + after.x, z: before.z + after.z };
      const size = Math.hypot(sum.x, sum.z);
      const miter = size < 1e-6 ? after : { x: sum.x / size, z: sum.z / size };
      const dot = miter.x * after.x + miter.z * after.z;
      const offset = Math.min(half * 2.5, half / Math.max(0.25, dot));
      left.push({ x: clean[i].x + miter.x * offset, z: clean[i].z + miter.z * offset });
      right.push({ x: clean[i].x - miter.x * offset, z: clean[i].z - miter.z * offset });
    }
    return left.concat(right.reverse());
  }

  const api = { corridorPolygon };
  root.XYNFairwayGeometry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
