const assert = require("node:assert/strict");
const net = require("../src/main/resources/assets/bluemap_marker_tool/fairway-network.js");
let next = 0; const uid = () => "n" + (++next);
const first = {
  id: "f1", type: "fairway", geometry: "corridor", title: "Main channel",
  width: 40, color: "#00bfff", fill: 0.2, y: 64,
  points: [
    { id: "p1", x: 0, z: 0, name: "" },
    { id: "p2", x: 100, z: 0, name: "Junction" },
    { id: "p3", x: 200, z: 0, name: "" }
  ]
};
const items = [first];
const branch = net.createBranch(items, first, 1, uid);
assert.equal(items.length, 2);
assert.equal(branch.points.length, 1);
assert.equal(branch.points[0].nodeId, first.points[1].nodeId);
assert.equal(branch.points[0].name, "Junction");
const snapped = net.findNearbyNode(items, branch, 101, 0, p => ({ x: p.x, y: p.z }));
assert.equal(snapped, first.points[1]);
assert.equal(net.connectPoint(items, branch, snapped, uid), null, "reject coincident connection");
branch.points.push({ id: "end", x: 100, z: 100 });
let graph = net.buildGraph(items);
assert.equal(graph.edges.length, 3);
assert.equal(graph.nodes.length, 4);
assert.equal(graph.edges[1].to, graph.edges[2].from);
assert.equal(graph.edges[2].width, 40);
first.points[1].x = 110;
first.points[1].name = 'East Junction';
assert.equal(net.propagate(items, first.points[1]), 1);
assert.equal(branch.points[0].x, 110);
assert.equal(branch.points[0].name, "East Junction");
const second = {
  id: "f2", type: "fairway", geometry: "corridor", width: 20,
  points: [{ id: "q1", x: 500, z: 0 }]
};
items.push(second);
const join = net.connectPoint(items, second, branch.points[1], uid);
assert(join);
assert.equal(join.x, 100);
assert.equal(join.z, 100);
assert.equal(join.nodeId, branch.points[1].nodeId);
graph = net.buildGraph(items);
assert.equal(graph.edges.length, 4);
assert.equal(graph.nodes.length, 5);
branch.points[1].z = 150;
net.propagate(items, branch.points[1]);
assert.equal(second.points[1].z, 150);
assert.equal(net.createBranch(items, { type: "fairway", geometry: "polygon", points: [{x:0,z:0}] }, 0, uid), null);
console.log("Branching fairway network tests: PASS");
