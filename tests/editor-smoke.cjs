const assert = require("node:assert/strict");
const fs = require("node:fs");

const script = fs.readFileSync("src/main/resources/assets/bluemap_marker_tool/area-draw.js", "utf8");
const geometry = require("../src/main/resources/assets/bluemap_marker_tool/fairway-geometry.js");
const network = require("../src/main/resources/assets/bluemap_marker_tool/fairway-network.js");

class Element {
  constructor(tag) {
    this.tag = tag;
    this.id = "";
    this.style = {};
    this.children = [];
    this.value = "";
    this.dataset = {};
    this._html = "";
    this.listeners = {};
    this.queries = {};
    this.selectorCache = {};
  }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = value; this.selectorCache = {}; }
  appendChild(x) { this.children.push(x); return x; }
  removeChild(x) { this.children = this.children.filter(y => x !== y); }
  get firstChild() { return this.children[0] || null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelector(selector) { return this.queries[selector] ??= new Element(selector); }
  querySelectorAll(selector) {
    if (this.selectorCache[selector]) return this.selectorCache[selector];
    if (!selector.startsWith("[data-route-")) return [];
    const attr = selector.slice(1, -1);
    const matches = [...this.innerHTML.matchAll(new RegExp(attr + '="(\\d+)"', "g"))];
    const attrKey = attr.slice(5).replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase());
    const elements = matches.map(match => {
      const input = new Element("input");
      input.dataset[attrKey] = match[1];
      return input;
    });
    return this.selectorCache[selector] = elements;
  }
  contains() { return false; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  remove() {}
}

class Vector {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  project() { this.x /= 1000; this.y /= 1000; this.z = 0.5; return this; }
}

async function main() {
  const canvas = new Element("canvas"), viewer = new Element("viewer");
  viewer.querySelector = () => canvas;

  const sets = new Map([["another-plugin", { label: "Unrelated marker set" }]]);
  const markerRoot = {
    markerSets: sets,
    updateMarkerSetFromData(id, value) { sets.set(id, value); },
    remove(value) { for (const [id, markerSet] of sets) if (markerSet === value) sets.delete(id); }
  };
  const mapViewer = {
    rootElement: viewer, markers: markerRoot,
    _camera: { position: { x: 0, y: 200, z: 0 } },
    raycaster: {
      ray: { origin: new Vector(0, 200, 0), direction: { x: 1, y: -1, z: 1 } },
      setFromCamera(v) { this.ray.direction = { x: 1 + v.x, y: -1, z: 1 + v.y }; }
    }
  };
  const body = new Element("body");
  const document = {
    body, head: new Element("head"),
    createElement: tag => new Element(tag),
    createElementNS: (_ns, tag) => new Element(tag),
    addEventListener() {}
  };
  const initial = {
    items: [
      { id: "area-1", type: "area", title: "Existing Area", color: "#4caf50", fill: 0.25, y: 64,
        points: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }] },
      { id: "text-1", type: "text", title: "Existing Text", color: "#ffffff", y: 70,
        points: [{ x: 1, z: 1 }] }
    ]
  };
  const writes = [];
  let exported = "";
  const fetch = (url, options) => {
    if (url === "/xyn-config.json") return Promise.resolve({ ok: true, json: async () => ({ apiPort: 8034 }) });
    if (options?.method === "POST") {
      writes.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true, status: 200 });
    }
    return Promise.resolve({ ok: true, json: async () => initial });
  };
  const window = {
    XYNFairwayGeometry: geometry,
    XYNFairwayNetwork: network,
    bluemap: { mapViewer, markerFileManager: {} },
    location: { protocol: "https:", origin: "https://example.invalid", hostname: "example.invalid" }
  };
  const navigator = { clipboard: { writeText(value) { exported = value; return Promise.resolve(); } } };
  new Function(
    "window", "document", "fetch", "setTimeout", "requestAnimationFrame",
    "innerWidth", "innerHeight", "navigator", "console", script
  )(
    window, document, fetch, () => {}, () => {}, 800, 600, navigator,
    { log() {}, warn() {} }
  );
  for (let i = 0; i < 12; i++) await Promise.resolve();

  const panel = body.children.find(element => element.id === "xynPanel");
  assert(panel);
  assert(sets.has("areas"));
  assert(sets.has("labels"));

  function clickMap(x, y = 290) {
    const event = { button: 0, clientX: x, clientY: y, target: canvas,
                    stopPropagation() {}, preventDefault() {} };
    for (const listener of canvas.listeners.pointerdown || []) listener(event);
    for (const listener of canvas.listeners.pointerup || []) listener(event);
  }

  for (const name of ["Road", "Sea", "Air"]) {
    const create = panel.querySelector("#xNew" + name);
    assert.equal(typeof create.onclick, "function");
    create.onclick();
    clickMap(320); clickMap(380);
  }

  for (const id of ["roads", "sea_routes", "air_routes"]) {
    assert(sets.has(id), "Missing " + id);
    const markers = Object.values(sets.get(id).markers);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].type, "line");
    assert.equal(markers[0].line.length, 2);
  }

  const newFairway = panel.querySelector("#xNewFairway");
  assert.equal(typeof newFairway.onclick, "function");
  newFairway.onclick();
  clickMap(320); clickMap(380);

  assert(sets.has("fairways"));
  let fairway = Object.values(sets.get("fairways").markers)[0];
  assert.equal(fairway.type, "shape");
  assert.equal(fairway.shape.length, 4);
  assert.equal(sets.has("waypoints"), false);

  let field = panel.querySelector("#xFairwayWidth");
  assert.equal(typeof field.onchange, "function");
  field.onchange({ target: { value: "20" } });
  fairway = Object.values(sets.get("fairways").markers)[0];
  assert.equal(fairway.shape.length, 4);

  // Name the first centerline waypoint. This produces a separate default-hidden
  // native HTML-marker layer, without altering the fairway geometry.
  const editor = panel.querySelector("#xEdit");
  const names = editor.querySelectorAll("[data-route-name]");
  assert.equal(names.length, 2);
  assert.equal(typeof names[0].onchange, "function");
  names[0].value = 'Harbor "North" & East';
  names[0].onchange();

  assert(sets.has("waypoints"));
  assert.equal(sets.get("waypoints").defaultHidden, true);
  const waypointMarker = Object.values(sets.get("waypoints").markers)[0];
  assert.equal(waypointMarker.type, "html");
  assert.equal(waypointMarker.label, names[0].value);
  assert(waypointMarker.html.includes("&amp;"));
  assert(waypointMarker.html.includes('"North"')); // text in HTML content, not an attribute

  // Change corridor to manually drawn polygon and add the third vertex.
  panel.querySelector("#xGeometry").onchange({ target: { value: "polygon" } });
  clickMap(380, 260);
  fairway = Object.values(sets.get("fairways").markers)[0];
  assert.equal(fairway.shape.length, 3);
  assert.equal(sets.get("waypoints").defaultHidden, true);

  for (const id of ["areas", "labels", "roads", "sea_routes", "air_routes", "fairways", "waypoints", "another-plugin"]) {
    assert(sets.has(id), id + " disappeared");
  }

  panel.querySelector("#xExport").onclick();
  for (const id of ["roads", "sea_routes", "air_routes", "fairways", "waypoints"]) {
    assert(exported.includes(id + ": {"), id + " missing from export");
  }
  assert(writes.length >= 8);
  assert.equal(writes.at(-1).items.find(item => item.type === "fairway").points[0].name, names[0].value);
  // A second navigable corridor supports a branch from an existing junction.
  newFairway.onclick();
  clickMap(320); clickMap(380);
  const corridor = writes.at(-1).items.at(-1);
  assert.equal(corridor.geometry, "corridor");
  const branches = editor.querySelectorAll("[data-route-branch]");
  assert.equal(branches.length, 2);
  assert.equal(typeof branches[0].onclick, "function");
  branches[0].onclick();
  let doc = writes.at(-1);
  let child = doc.items.at(-1);
  const parent = doc.items.at(-2);
  assert.equal(child.points.length, 1);
  assert.equal(child.points[0].nodeId, parent.points[0].nodeId);
  clickMap(700); // new branch endpoint
  doc = writes.at(-1); child = doc.items.at(-1);
  assert.equal(child.points.length, 2);
  assert.equal(network.buildGraph(doc.items).edges.length >= 2, true);

  // Renaming the branch junction updates its counterpart on the original fairway.
  const sharedNames = editor.querySelectorAll("[data-route-name]");
  sharedNames[0].value = "River junction";
  sharedNames[0].onchange();
  doc = writes.at(-1);
  assert.equal(doc.items.at(-2).points[0].name, "River junction");
  assert.equal(doc.items.at(-1).points[0].name, "River junction");
  const sharedLabels = Object.keys(sets.get("waypoints").markers).filter(k => k.startsWith("shared-wp-"));
  assert.equal(sharedLabels.length, 1, "Connected node should have just one label");

  // A fresh fairway snaps to the existing second node rather than duplicating it.
  newFairway.onclick();
  clickMap(452, 281); // near the visible second waypoint in the mocked projection
  doc = writes.at(-1);
  assert.equal(doc.items.at(-1).points.length, 1);
  assert(doc.items.at(-1).points[0].nodeId, "expected actual snap, not undefined === undefined");
  assert.equal(doc.items.at(-1).points[0].nodeId, doc.items.at(-3).points[1].nodeId);
  clickMap(730);
  doc = writes.at(-1);
  assert.equal(doc.items.at(-1).points.length, 2);
  assert.equal(network.buildGraph(doc.items).edges.length >= 3, true);
  // Switching an actively connected corridor to Polygon breaks only this
  // fairway's junction links. Local IDs, names and coordinates must survive.
  const beforeSwitch = writes.at(-1).items.at(-1).points
    .map(p => ({ id: p.id, name: p.name, x: p.x, z: p.z }));
  const linkedId = writes.at(-1).items.at(-1).points[0].nodeId;
  assert(linkedId);
  const linkedOriginal = writes.at(-1).items.at(-3).points[1].name;
  panel.querySelector("#xGeometry").onchange({ target: { value: "polygon" } });
  doc = writes.at(-1);
  assert.equal(doc.items.at(-1).geometry, "polygon");
  assert(doc.items.at(-1).points.every(p => !("nodeId" in p)));
  assert.deepEqual(doc.items.at(-1).points.map(p => ({
    id: p.id, name: p.name, x: p.x, z: p.z
  })), beforeSwitch);
  assert.equal(doc.items.at(-3).points[1].nodeId, linkedId);
  const detachedName = editor.querySelectorAll("[data-route-name]")[0];
  detachedName.value = "Independent harbor boundary";
  detachedName.onchange();
  doc = writes.at(-1);
  assert.equal(doc.items.at(-1).points[0].name, detachedName.value);
  assert.equal(doc.items.at(-3).points[1].name, linkedOriginal);
  assert.equal(network.buildGraph(doc.items).nodes.some(node => node.name === detachedName.value), false);

  console.log("Marker editor, fairway branching, snapping safety, and polygon detach tests: PASS");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
