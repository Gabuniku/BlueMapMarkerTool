package net.xywren.bluemapmarkertool;

import com.flowpowered.math.vector.Vector2d;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Expands an open waterway centerline into a bounded-width polygon.
 * Geometry agrees with the web editor's fairway-geometry.js.
 */
public final class FairwayGeometry {
    private static final double EPS = 1e-7;

    private FairwayGeometry() {}

    public static List<Vector2d> corridorPolygon(List<Vector2d> points, double width) {
        if (points == null || points.size() > 4096 ||
                !Double.isFinite(width) || width <= 0) return List.of();

        List<Vector2d> clean = new ArrayList<>();
        for (Vector2d point : points) {
            if (point == null || !Double.isFinite(point.getX()) || !Double.isFinite(point.getY())) {
                return List.of();
            }
            if (clean.isEmpty() || clean.get(clean.size() - 1).distance(point) > EPS) {
                clean.add(point);
            }
        }
        if (clean.size() < 2) return List.of();

        List<Vector2d> normals = new ArrayList<>();
        for (int i = 0; i < clean.size() - 1; i++) {
            double dx = clean.get(i + 1).getX() - clean.get(i).getX();
            double dz = clean.get(i + 1).getY() - clean.get(i).getY();
            double length = Math.hypot(dx, dz);
            normals.add(new Vector2d(-dz / length, dx / length));
        }

        double half = width / 2;
        List<Vector2d> left = new ArrayList<>();
        List<Vector2d> right = new ArrayList<>();
        for (int i = 0; i < clean.size(); i++) {
            Vector2d before = normals.get(Math.max(0, i - 1));
            Vector2d after = normals.get(Math.min(normals.size() - 1, i));
            if (before.dot(after) < -0.999) return List.of();

            Vector2d sum = before.add(after);
            double magnitude = sum.length();
            Vector2d miter = magnitude < EPS ? after : sum.div(magnitude);
            double dot = miter.dot(after);
            double offset = Math.min(half * 2.5, half / Math.max(0.25, dot));

            left.add(clean.get(i).add(miter.mul(offset)));
            right.add(clean.get(i).sub(miter.mul(offset)));
        }
        Collections.reverse(right);
        left.addAll(right);

        return hasSelfIntersection(left) ? List.of() : left;
    }

    public static boolean hasSelfIntersection(List<Vector2d> polygon) {
        if (polygon == null || polygon.size() < 3) return false;
        int n = polygon.size();
        for (int i = 0; i < n; i++) {
            Vector2d a = polygon.get(i);
            Vector2d b = polygon.get((i + 1) % n);
            for (int j = i + 2; j < n; j++) {
                if (i == 0 && j == n - 1) continue;
                if (properlyCross(a, b, polygon.get(j), polygon.get((j + 1) % n))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static double orient(Vector2d a, Vector2d b, Vector2d c) {
        return (b.getX() - a.getX()) * (c.getY() - a.getY())
                - (b.getY() - a.getY()) * (c.getX() - a.getX());
    }

    private static boolean properlyCross(Vector2d a, Vector2d b, Vector2d c, Vector2d d) {
        double abC = orient(a, b, c);
        double abD = orient(a, b, d);
        double cdA = orient(c, d, a);
        double cdB = orient(c, d, b);
        return abC * abD < -EPS && cdA * cdB < -EPS;
    }
}
