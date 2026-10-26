const assert = require("node:assert/strict");
const { corridorPolygon, hasSelfIntersection } = require("../src/main/resources/assets/bluemap_marker_tool/fairway-geometry.js");

const straight = corridorPolygon([{ x: 0, z: 0 }, { x: 100, z: 0 }], 40);
assert.deepEqual(straight, [
  { x: 0, z: 20 }, { x: 100, z: 20 },
  { x: 100, z: -20 }, { x: 0, z: -20 }
]);

const rightAngle = corridorPolygon([
  { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }
], 20);
assert.equal(rightAngle.length, 6);
assert(rightAngle.every(point => Number.isFinite(point.x) && Number.isFinite(point.z)));
assert.equal(hasSelfIntersection(rightAngle), false);

assert.equal(corridorPolygon([{ x: 0, z: 0 }], 40).length, 0);
assert.equal(corridorPolygon([{ x: 0, z: 0 }, { x: 0, z: 0 }], 40).length, 0);
assert.equal(corridorPolygon([{ x: 0, z: 0 }, { x: 1, z: 0 }], 0).length, 0);
assert.equal(corridorPolygon([{ x: 0, z: 0 }, { x: 1, z: 0 }], -3).length, 0);
assert.equal(corridorPolygon([{ x: 0, z: 0 }, { x: 1, z: 0 }], Infinity).length, 0);
assert.equal(corridorPolygon([{ x: 0, z: 0 }, { x: NaN, z: 0 }], 40).length, 0);

// Reject self-overlapping U-turn centerlines rather than emitting broken polygons.
assert.equal(corridorPolygon([
  { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 0, z: 0 }
], 40).length, 0);

// A manually specified bow-tie polygon is also considered invalid.
assert.equal(hasSelfIntersection([
  { x: 0, z: 0 }, { x: 20, z: 20 },
  { x: 0, z: 20 }, { x: 20, z: 0 }
]), true);

console.log("Fairway geometry regression tests: PASS");
