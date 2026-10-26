const assert = require("node:assert/strict");
const { corridorPolygon } = require("../../main/resources/assets/bluemap_marker_tool/fairway-geometry.js");

const line = corridorPolygon([{ x: 0, z: 0 }, { x: 100, z: 0 }], 40);
assert.equal(line.length, 4);
assert.deepEqual(line, [
  { x: 0, z: 20 }, { x: 100, z: 20 },
  { x: 100, z: -20 }, { x: 0, z: -20 }
]);
assert.deepEqual(corridorPolygon([{ x: 0, z: 0 }], 40), []);
assert.deepEqual(corridorPolygon([{ x: 0, z: 0 }, { x: 0, z: 0 }], 40), []);
assert.deepEqual(corridorPolygon([{ x: 0, z: 0 }, { x: 1, z: 0 }], 0), []);
const elbow = corridorPolygon([
  { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }
], 20);
assert.equal(elbow.length, 6);
assert.ok(elbow.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)));
console.log("fairway geometry tests passed");
