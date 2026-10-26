/* Shared-node graph utilities for branching BlueMap fairway corridors. */
(function (root) {
  "use strict";

  const corridor = item => item?.type === "fairway" && item.geometry !== "polygon" && Array.isArray(item.points);

  function ensureNodeId(point, nextId) {
    if (!point.nodeId) point.nodeId = nextId();
    return point.nodeId;
  }

  function createBranch(items, item, index, nextId) {
    if (!corridor(item) || !item.points[index]) return null;
    const point = item.points[index], nodeId = ensureNodeId(point, nextId);
    const branch = {
      id: nextId(), type: "fairway", geometry: "corridor",
      title: "Branch of " + (item.title || "Fairway"), subtitle: "",
      color: item.color || "#00bfff", fill: item.fill ?? 0.25,
      width: item.width ?? 40, y: item.y ?? 64,
      points: [{ id: nextId(), nodeId, name: point.name || "", x: Number(point.x), z: Number(point.z) }]
    };
    items.push(branch);
    return branch;
  }

  function findNearbyNode(items, current, screenX, screenY, project, radius = 14) {
    let best = null, distance = radius;
    for (const item of items) {
      if (!corridor(item) || item === current) continue;
      for (const point of item.points) {
        const loc = project(point, item);
        if (!loc || !Number.isFinite(loc.x) || !Number.isFinite(loc.y)) continue;
        const delta = Math.hypot(screenX - loc.x, screenY - loc.y);
        if (delta <= distance) { best = point; distance = delta; }
      }
    }
    return best;
  }

  function connectPoint(items, target, other, nextId) {
    if (!corridor(target) || !other) return null;
    const nodeId = ensureNodeId(other, nextId);
    const point = {
      id: nextId(), nodeId, name: other.name || "",
      x: Number(other.x), z: Number(other.z)
    };
    const previous = target.points.at(-1);
    if (previous && Math.hypot(Number(previous.x) - point.x, Number(previous.z) - point.z) < 1e-6) return null;
    if (previous?.nodeId && previous.nodeId === nodeId) return null;
    target.points.push(point);
    return point;
  }

  function propagate(items, source) {
    if (!source?.nodeId) return 0;
    let changes = 0;
    for (const item of items) {
      if (!corridor(item)) continue;
      for (const point of item.points) {
        if (point === source || point.nodeId !== source.nodeId) continue;
        point.x = Number(source.x); point.z = Number(source.z);
        point.name = String(source.name || "");
        changes++;
      }
    }
    return changes;
  }

  // Normalized graph view. Legacy point IDs stay local until explicitly linked.
  function buildGraph(items) {
    const nodes = new Map(), edges = [];
    for (const item of items) {
      if (!corridor(item)) continue;
      const ids = item.points.map((point, index) => {
        const id = point.nodeId || "local:" + item.id + ":" + (point.id || index);
        if (!nodes.has(id)) nodes.set(id, {
          id, name: point.name || "", x: Number(point.x), z: Number(point.z)
        });
        return id;
      });
      for (let i = 1; i < ids.length; i++) {
        if (ids[i - 1] === ids[i]) continue;
        edges.push({
          id: item.id + ":" + (i - 1), from: ids[i - 1], to: ids[i],
          fairwayId: item.id, width: Number(item.width) || 40
        });
      }
    }
    return { nodes: [...nodes.values()], edges };
  }

  const api = Object.freeze({ corridor, ensureNodeId, createBranch, findNearbyNode, connectPoint, propagate, buildGraph });
  root.XYNFairwayNetwork = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
