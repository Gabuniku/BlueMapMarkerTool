package net.xywren.bluemapmarkertool;

import de.bluecolored.bluemap.api.BlueMapAPI;
import de.bluecolored.bluemap.api.BlueMapMap;
import de.bluecolored.bluemap.api.markers.HtmlMarker;
import de.bluecolored.bluemap.api.markers.MarkerSet;
import de.bluecolored.bluemap.api.markers.ShapeMarker;
import de.bluecolored.bluemap.api.math.Color;
import de.bluecolored.bluemap.api.math.Shape;
import com.flowpowered.math.vector.Vector2d;
import com.flowpowered.math.vector.Vector2i;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * Persists markers to disk and syncs area and text markers to BlueMapAPI.
 */
public class MarkerStore {

    private final Path dataFile;
    private String cachedJson = "{\"items\":[]}";

    public MarkerStore(Path serverRoot) {
        Path configDir = serverRoot.resolve("config").resolve("xynovia");
        try { Files.createDirectories(configDir); } catch (IOException ignored) {}
        this.dataFile = configDir.resolve("markers.json");

        loadFromDisk();

        BlueMapAPI.onEnable(api -> {
            BlueMapMarkerTool.LOGGER.info("[BlueMapMarkerTool] BlueMap enabled — deploying web assets and pushing markers.");
            deployWebAssets(api);
            pushToBlueMap(api);
        });
    }

    public synchronized String getJson() {
        return cachedJson;
    }

    public synchronized void saveJson(String json) {
        cachedJson = json;
        try {
            Files.writeString(dataFile, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            BlueMapMarkerTool.LOGGER.error("[BlueMapMarkerTool] Failed to save markers.json", e);
        }
        BlueMapAPI.getInstance().ifPresent(this::pushToBlueMap);
    }

    private void deployWebAssets(BlueMapAPI api) {
        try {
            Path webRoot = api.getWebApp().getWebRoot();
            Files.createDirectories(webRoot);

            Path target = webRoot.resolve("area-draw.js");
            try (InputStream in = getClass().getResourceAsStream("/assets/bluemap_marker_tool/area-draw.js")) {
                if (in == null) {
                    BlueMapMarkerTool.LOGGER.error("[BlueMapMarkerTool] Bundled area-draw.js not found in jar!");
                    return;
                }
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }

            int port = ((Integer) MarkerConfig.API_PORT.get()).intValue();
            Files.writeString(webRoot.resolve("xyn-config.json"),
                "{\"apiPort\":" + port + "}", StandardCharsets.UTF_8);

            api.getWebApp().registerScript("area-draw.js?v=" + BlueMapMarkerTool.VERSION);

            BlueMapMarkerTool.LOGGER.info("[BlueMapMarkerTool] Web assets deployed to {} (apiPort={})", webRoot, port);
        } catch (IOException e) {
            BlueMapMarkerTool.LOGGER.error("[BlueMapMarkerTool] Failed to deploy web assets", e);
        }
    }

    private void loadFromDisk() {
        if (Files.exists(dataFile)) {
            try {
                cachedJson = Files.readString(dataFile, StandardCharsets.UTF_8);
                BlueMapMarkerTool.LOGGER.info("[BlueMapMarkerTool] Loaded markers from disk.");
            } catch (IOException e) {
                BlueMapMarkerTool.LOGGER.error("[BlueMapMarkerTool] Failed to load markers.json", e);
            }
        }
    }

    private void pushToBlueMap(BlueMapAPI api) {
        String mapId = (String) MarkerConfig.MAP_ID.get();
        Optional<BlueMapMap> mapOpt = api.getMap(mapId);
        if (mapOpt.isEmpty()) {
            BlueMapMarkerTool.LOGGER.warn("[BlueMapMarkerTool] Map '{}' not found in BlueMap.", mapId);
            return;
        }
        BlueMapMap map = mapOpt.get();

        map.getMarkerSets().remove("xyn-areas");

        MarkerSet areas = new MarkerSet("Areas");
        areas.setToggleable(true);
        MarkerSet labels = new MarkerSet("Text Labels");
        labels.setToggleable(true);
        MarkerSet fairways = new MarkerSet("Fairways");
        fairways.setToggleable(true);

        parseAndAddMarkers(areas, labels, fairways);

        if (!areas.getMarkers().isEmpty()) {
            map.getMarkerSets().put("areas", areas);
        } else {
            map.getMarkerSets().remove("areas");
        }
        if (!labels.getMarkers().isEmpty()) {
            map.getMarkerSets().put("labels", labels);
        } else {
            map.getMarkerSets().remove("labels");
        }
        if (!fairways.getMarkers().isEmpty()) map.getMarkerSets().put("fairways", fairways);
        else map.getMarkerSets().remove("fairways");
    }

    private void parseAndAddMarkers(MarkerSet areas, MarkerSet labels, MarkerSet fairways) {
        try {
            List<Map<String, Object>> items = parseItems(cachedJson);
            for (Map<String, Object> item : items) {
                String type = (String) item.get("type");
                if ("area".equals(type)) {
                    addAreaMarker(areas, item);
                } else if ("text".equals(type)) {
                    addTextMarker(labels, item);
                } else if ("fairway".equals(type)) {
                    addFairwayMarker(fairways, item);
                }
            }
        } catch (Exception e) {
            BlueMapMarkerTool.LOGGER.error("[BlueMapMarkerTool] Failed to parse markers for BlueMap push", e);
        }
    }

    private void addAreaMarker(MarkerSet set, Map<String, Object> item) {
        String id = (String) item.getOrDefault("id", "marker");
        String title = (String) item.getOrDefault("title", "");
        String subtitle = (String) item.getOrDefault("subtitle", "");
        String colorHex = (String) item.getOrDefault("color", "#4caf50");
        double fill = toDouble(item.getOrDefault("fill", 0.25));
        double y = toDouble(item.getOrDefault("y", 64.0));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rawPts = (List<Map<String, Object>>) item.get("points");
        if (rawPts == null || rawPts.size() < 3) return;

        int[] rgb = hexToRgb(colorHex);
        Color lineColor = new Color(rgb[0], rgb[1], rgb[2], 1f);
        Color fillColor = new Color(rgb[0], rgb[1], rgb[2], (float) fill);

        Shape.Builder shapeBuilder = Shape.builder();
        for (Map<String, Object> pt : rawPts) {
            shapeBuilder.addPoint(new Vector2d(toDouble(pt.get("x")), toDouble(pt.get("z"))));
        }
        Shape shape = shapeBuilder.build();

        String safeTitle = escapeHtml(title);
        String safeSubtitle = escapeHtml(subtitle);
        String detail = safeSubtitle.isEmpty() ? safeTitle : safeTitle + "<br><i>" + safeSubtitle + "</i>";

        ShapeMarker marker = new ShapeMarker(title, shape, (float) y);
        marker.setDetail(detail);
        marker.setLineColor(lineColor);
        marker.setFillColor(fillColor);
        marker.setLineWidth(3);
        marker.setDepthTestEnabled(false);

        set.getMarkers().put(id, marker);
    }

    // Widen a centerline into a polygon using offset vectors and bounded miter joins.
    private List<Vector2d> fairwayPolygon(List<Map<String, Object>> points, double width) {
        List<Vector2d> clean = new ArrayList<>();
        if (!Double.isFinite(width) || width <= 0) return clean;
        for (Map<String, Object> point : points) {
            double x = toDouble(point.get("x")), z = toDouble(point.get("z"));
            if (!Double.isFinite(x) || !Double.isFinite(z)) return List.of();
            Vector2d next = new Vector2d(x, z);
            if (clean.isEmpty() || next.distance(clean.get(clean.size() - 1)) > 1e-6) clean.add(next);
        }
        if (clean.size() < 2) return List.of();
        List<Vector2d> normals = new ArrayList<>();
        for (int i = 0; i < clean.size() - 1; i++) {
            Vector2d delta = clean.get(i + 1).sub(clean.get(i));
            normals.add(new Vector2d(-delta.getY(), delta.getX()).normalize());
        }
        List<Vector2d> left = new ArrayList<>(), right = new ArrayList<>();
        double half = width / 2;
        for (int i = 0; i < clean.size(); i++) {
            Vector2d before = normals.get(Math.max(0, i - 1));
            Vector2d after = normals.get(Math.min(normals.size() - 1, i));
            Vector2d sum = before.add(after);
            Vector2d miter = sum.length() < 1e-6 ? after : sum.normalize();
            double dot = miter.dot(after);
            double offset = Math.min(half * 2.5, half / Math.max(0.25, dot));
            left.add(clean.get(i).add(miter.mul(offset)));
            right.add(clean.get(i).sub(miter.mul(offset)));
        }
        Collections.reverse(right); left.addAll(right); return left;
    }

    private void addFairwayMarker(MarkerSet set, Map<String, Object> item) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> points = (List<Map<String, Object>>) item.get("points");
        if (points == null) return;
        String geometry = (String) item.getOrDefault("geometry", "corridor");
        List<Vector2d> shapePoints = new ArrayList<>();
        if ("corridor".equals(geometry)) {
            shapePoints = fairwayPolygon(points, toDouble(item.getOrDefault("width", 40)));
        } else if ("polygon".equals(geometry)) {
            for (Map<String, Object> p : points)
                shapePoints.add(new Vector2d(toDouble(p.get("x")), toDouble(p.get("z"))));
        } else return;
        if (shapePoints.size() < 3) return;
        Shape.Builder builder = Shape.builder();
        for (Vector2d pt : shapePoints) builder.addPoint(pt);
        String title = (String) item.getOrDefault("title", "Fairway");
        String subtitle = (String) item.getOrDefault("subtitle", "");
        String colorHex = (String) item.getOrDefault("color", "#00bfff");
        int[] rgb = hexToRgb(colorHex);
        double fill = Math.max(0, Math.min(1, toDouble(item.getOrDefault("fill", 0.25))));
        ShapeMarker marker = new ShapeMarker(title, builder.build(), (float) toDouble(item.getOrDefault("y", 64)));
        marker.setDetail(escapeHtml(title) + (subtitle.isBlank() ? "" : "<br>" + escapeHtml(subtitle)));
        marker.setLineColor(new Color(rgb[0], rgb[1], rgb[2], 1f));
        marker.setFillColor(new Color(rgb[0], rgb[1], rgb[2], (float) fill));
        marker.setLineWidth(2); marker.setDepthTestEnabled(false);
        set.getMarkers().put((String) item.getOrDefault("id", "fairway"), marker);
    }

    private void addTextMarker(MarkerSet set, Map<String, Object> item) {
        String id = (String) item.getOrDefault("id", "marker");
        String title = (String) item.getOrDefault("title", "");
        String subtitle = (String) item.getOrDefault("subtitle", "");
        String colorHex = (String) item.getOrDefault("color", "#ffffff");
        double y = toDouble(item.getOrDefault("y", 64.0));
        double minDist = toDouble(item.getOrDefault("minDist", 0.0));
        double maxDist = toDouble(item.getOrDefault("maxDist", 0.0));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rawPts = (List<Map<String, Object>>) item.get("points");
        if (rawPts == null || rawPts.isEmpty()) return;

        Map<String, Object> point = rawPts.get(0);
        double x = toDouble(point.get("x"));
        double z = toDouble(point.get("z"));

        int[] rgb = hexToRgb(colorHex);
        String safeColor = String.format("#%02x%02x%02x", rgb[0], rgb[1], rgb[2]);
        String safeTitle = escapeHtml(title);
        String safeSubtitle = escapeHtml(subtitle);
        String html = "<div class=\"xyn-label\" style=\"color:" + safeColor + "\">"
            + "<div class=\"xyn-title\">" + safeTitle + "</div>"
            + (safeSubtitle.isEmpty() ? "" : "<div class=\"xyn-sub\">" + safeSubtitle + "</div>")
            + "</div>";

        String label = !title.isBlank() ? title : (!subtitle.isBlank() ? subtitle : "Text");

        HtmlMarker marker = new HtmlMarker(label,
            new com.flowpowered.math.vector.Vector3d(x, y, z),
            html,
            new Vector2i(0, 0));
        marker.setStyleClasses(List.of("xyn-text-marker"));
        marker.setListed(true);
        marker.setMinDistance(minDist);
        if (maxDist > 0) marker.setMaxDistance(maxDist);
        set.getMarkers().put(id, marker);
    }

    private String escapeHtml(String value) {
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }

    private List<Map<String, Object>> parseItems(String json) {
        int start = json.indexOf("\"items\"");
        if (start < 0) return Collections.emptyList();
        int arrStart = json.indexOf('[', start);
        if (arrStart < 0) return Collections.emptyList();
        int arrEnd = matchingBracket(json, arrStart, '[', ']');
        if (arrEnd < 0) return Collections.emptyList();
        String arrStr = json.substring(arrStart + 1, arrEnd).trim();
        return parseObjectArray(arrStr);
    }

    private List<Map<String, Object>> parseObjectArray(String s) {
        List<Map<String, Object>> result = new ArrayList<>();
        int i = 0;
        while (i < s.length()) {
            int objStart = s.indexOf('{', i);
            if (objStart < 0) break;
            int objEnd = matchingBracket(s, objStart, '{', '}');
            if (objEnd < 0) break;
            result.add(parseObject(s.substring(objStart + 1, objEnd)));
            i = objEnd + 1;
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseObject(String s) {
        Map<String, Object> map = new LinkedHashMap<>();
        int i = 0;
        while (i < s.length()) {
            int kq = s.indexOf('"', i); if (kq < 0) break;
            int kq2 = s.indexOf('"', kq + 1); if (kq2 < 0) break;
            String key = s.substring(kq + 1, kq2);
            int colon = s.indexOf(':', kq2 + 1); if (colon < 0) break;
            i = colon + 1;
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
            if (i >= s.length()) break;
            char c = s.charAt(i);
            if (c == '"') {
                int vq2 = s.indexOf('"', i + 1); if (vq2 < 0) break;
                map.put(key, s.substring(i + 1, vq2));
                i = vq2 + 1;
            } else if (c == '{') {
                int end = matchingBracket(s, i, '{', '}'); if (end < 0) break;
                map.put(key, parseObject(s.substring(i + 1, end)));
                i = end + 1;
            } else if (c == '[') {
                int end = matchingBracket(s, i, '[', ']'); if (end < 0) break;
                String inner = s.substring(i + 1, end).trim();
                if (inner.startsWith("{")) map.put(key, parseObjectArray(inner));
                else map.put(key, inner);
                i = end + 1;
            } else {
                int end = i;
                while (end < s.length() && s.charAt(end) != ',' && s.charAt(end) != '}') end++;
                String val = s.substring(i, end).trim();
                if ("true".equals(val)) map.put(key, Boolean.TRUE);
                else if ("false".equals(val)) map.put(key, Boolean.FALSE);
                else if ("null".equals(val)) map.put(key, null);
                else { try { map.put(key, Double.parseDouble(val)); } catch (NumberFormatException ignored) { map.put(key, val); } }
                i = end;
            }
        }
        return map;
    }

    private int matchingBracket(String s, int open, char openCh, char closeCh) {
        int depth = 0;
        boolean inStr = false;
        for (int i = open; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' && (i == 0 || s.charAt(i - 1) != '\\')) inStr = !inStr;
            if (inStr) continue;
            if (c == openCh) depth++;
            else if (c == closeCh) { depth--; if (depth == 0) return i; }
        }
        return -1;
    }

    private double toDouble(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof String str) { try { return Double.parseDouble(str); } catch (NumberFormatException ignored) {} }
        return 0.0;
    }

    private int[] hexToRgb(String hex) {
        hex = hex.replace("#", "");
        if (hex.length() == 3) hex = "" + hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        int r = Integer.parseInt(hex.substring(0, 2), 16);
        int g = Integer.parseInt(hex.substring(2, 4), 16);
        int b = Integer.parseInt(hex.substring(4, 6), 16);
        return new int[]{r, g, b};
    }
}
