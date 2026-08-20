package com.palletron.graph.service;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import com.palletron.graph.entity.GraphReo;
import com.palletron.graph.entity.MapPlot;
import com.palletron.graph.repository.GraphReoRepository;
import com.palletron.graph.repository.MapPlotRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class RobotPathPlannerService {

    @Autowired
    private MapPlotRepository mapPlotRepository;

    @Autowired
    private GraphReoRepository graphReoRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // DTO for incoming planning request
    public static class RobotRequest {
        public int id;
        public String startNodeId;
        public String endNodeId;
        public double speedCmPerSec;
    }

    // DTO for planning response
    public static class RobotResponse {
        public int id;
        public List<String> path;
        public List<String> scheduleNodes;
        public List<Double> scheduleTimes;
    }

    public List<RobotResponse> planRoutes(String keyId, List<RobotRequest> robotRequests) throws Exception {
        MapPlot mapPlot = mapPlotRepository.findByKeyId(keyId)
                .orElseThrow(() -> new IllegalArgumentException("Plot not found for key: " + keyId));

        GraphReo graphReo = graphReoRepository.findById(mapPlot.getId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Graph representation not found for plot: " + mapPlot.getPlotName()));

        // Parse canvasData to map node ID string -> matrix index
        String canvasDataStr = graphReo.getCanvasData();
        Map<String, Object> canvasData = objectMapper.readValue(canvasDataStr,
                new TypeReference<Map<String, Object>>() {
                });
        List<Map<String, Object>> nodes = objectMapper.convertValue(canvasData.get("nodes"),
                new TypeReference<List<Map<String, Object>>>() {
                });

        if (nodes == null || nodes.isEmpty()) {
            throw new IllegalArgumentException("No nodes defined in the graph.");
        }

        int N = nodes.size();
        Map<String, Integer> idToIndex = new HashMap<>();
        Map<Integer, String> indexToId = new HashMap<>();
        for (int i = 0; i < N; i++) {
            String nodeId = (String) nodes.get(i).get("id");
            idToIndex.put(nodeId, i);
            indexToId.put(i, nodeId);
        }

        // Build the connections and weights matrices dynamically from canvasData.nodes
        // and canvasData.edges
        // to ensure correctness and compatibility with both unidirectional and
        // bidirectional databases.
        String[][] connections = new String[N][N];
        double[][] weights = new double[N][N];
        for (int i = 0; i < N; i++) {
            Arrays.fill(connections[i], "X");
            Arrays.fill(weights[i], 0.0);
        }

        List<Map<String, Object>> edges = objectMapper.convertValue(canvasData.get("edges"),
                new TypeReference<List<Map<String, Object>>>() {
                });
        if (edges != null) {
            for (Map<String, Object> edge : edges) {
                String fromNodeId = (String) edge.get("from");
                String toNodeId = (String) edge.get("to");
                Integer fromIdx = idToIndex.get(fromNodeId);
                Integer toIdx = idToIndex.get(toNodeId);

                if (fromIdx != null && toIdx != null) {
                    Map<String, Object> fromNode = nodes.get(fromIdx);
                    Map<String, Object> toNode = nodes.get(toIdx);

                    String tFrom = ((String) fromNode.get("type")).substring(0, 1).toUpperCase();
                    String tTo = ((String) toNode.get("type")).substring(0, 1).toUpperCase();

                    Number distNum = (Number) edge.get("distance");
                    double distance = distNum != null ? distNum.doubleValue() : 10.0;

                    // Populate from -> to direction
                    connections[fromIdx][toIdx] = tFrom + tTo;
                    weights[fromIdx][toIdx] = distance;

                    // Populate to -> from direction (bidirectional graph representation)
                    connections[toIdx][fromIdx] = tTo + tFrom;
                    weights[toIdx][fromIdx] = distance;
                }
            }
        }

        // Run the path planner algorithm
        List<Robot> robots = new ArrayList<>();
        for (RobotRequest req : robotRequests) {
            Integer src = idToIndex.get(req.startNodeId);
            Integer dst = idToIndex.get(req.endNodeId);

            if (src == null || dst == null) {
                throw new IllegalArgumentException("Robot start or end node not found in graph.");
            }

            Robot r = new Robot(req.id, src, dst, req.speedCmPerSec);
            r.path = shortestPath(r.src, r.dst, connections, weights);
            r.freeRunDistance = pathDistance(r.path, weights);
            r.freeRunTime = r.speedCmPerSec > 0 ? r.freeRunDistance / r.speedCmPerSec : Double.POSITIVE_INFINITY;
            robots.add(r);
        }

        // Sort by priority (freeRunTime ascending, tie-breaker by ID)
        List<Robot> order = new ArrayList<>(robots);
        order.sort((a, b) -> {
            int c = Double.compare(a.freeRunTime, b.freeRunTime);
            if (c != 0)
                return c;
            return Integer.compare(a.id, b.id);
        });

        double safetyMarginSec = 0.5;
        Map<Integer, List<double[]>> reservedNode = new HashMap<>();
        Map<String, List<double[]>> reservedEdge = new HashMap<>();

        for (Robot r : order) {
            if (r.path.isEmpty()) {
                continue;
            }
            double t = 0.0;
            int pos = r.path.get(0);
            r.scheduleNodes.add(pos);
            r.scheduleTimes.add(t);
            reserveNode(reservedNode, pos, t - safetyMarginSec, t + safetyMarginSec);

            for (int idx = 1; idx < r.path.size(); idx++) {
                int next = r.path.get(idx);
                double travelTime = weights[pos][next] / r.speedCmPerSec;

                double tStart = t;
                double tEnd = tStart + travelTime;

                while (true) {
                    double pushTo = -1;

                    // swap conflict
                    for (double[] iv : reservedEdge.getOrDefault(next + "_" + pos, Collections.emptyList())) {
                        if (overlaps(tStart, tEnd, iv[0], iv[1])) {
                            pushTo = Math.max(pushTo, iv[1]);
                        }
                    }
                    // node conflict
                    for (double[] iv : reservedNode.getOrDefault(next, Collections.emptyList())) {
                        if (overlaps(tEnd - safetyMarginSec, tEnd + safetyMarginSec, iv[0], iv[1])) {
                            pushTo = Math.max(pushTo, iv[1] + safetyMarginSec);
                        }
                    }

                    if (pushTo < 0)
                        break;

                    tStart = pushTo;
                    tEnd = tStart + travelTime;
                }

                reserveEdge(reservedEdge, pos, next, tStart, tEnd);
                reserveNode(reservedNode, next, tEnd - safetyMarginSec, tEnd + safetyMarginSec);

                r.scheduleNodes.add(next);
                r.scheduleTimes.add(tEnd);
                t = tEnd;
                pos = next;
            }
        }

        // Map back to response objects
        List<RobotResponse> responses = new ArrayList<>();
        for (Robot r : robots) {
            RobotResponse res = new RobotResponse();
            res.id = r.id;

            res.path = new ArrayList<>();
            for (int idx : r.path) {
                res.path.add(indexToId.get(idx));
            }

            res.scheduleNodes = new ArrayList<>();
            for (int idx : r.scheduleNodes) {
                res.scheduleNodes.add(indexToId.get(idx));
            }

            res.scheduleTimes = r.scheduleTimes;
            responses.add(res);
        }

        return responses;
    }

    private static class Robot {
        int id, src, dst;
        double speedCmPerSec;
        List<Integer> path = new ArrayList<>();
        double freeRunDistance;
        double freeRunTime;
        List<Integer> scheduleNodes = new ArrayList<>();
        List<Double> scheduleTimes = new ArrayList<>();

        Robot(int id, int src, int dst, double speedCmPerSec) {
            this.id = id;
            this.src = src;
            this.dst = dst;
            this.speedCmPerSec = speedCmPerSec;
        }
    }

    private static List<Integer> shortestPath(int src, int dst, String[][] connections, double[][] weights) {
        int N = weights.length;
        double[] dist = new double[N];
        int[] prev = new int[N];
        boolean[] visited = new boolean[N];
        Arrays.fill(dist, Double.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[src] = 0.0;

        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingDouble(a -> dist[a[0]]));
        pq.add(new int[] { src });

        while (!pq.isEmpty()) {
            int u = pq.poll()[0];
            if (visited[u])
                continue;
            visited[u] = true;
            if (u == dst)
                break;

            for (int v = 0; v < N; v++) {
                if (!allowed(u, v, connections, weights))
                    continue;
                double nd = dist[u] + weights[u][v];
                if (nd < dist[v]) {
                    dist[v] = nd;
                    prev[v] = u;
                    pq.add(new int[] { v });
                }
            }
        }

        if (dist[dst] == Double.MAX_VALUE)
            return Collections.emptyList();

        LinkedList<Integer> path = new LinkedList<>();
        for (int at = dst; at != -1; at = prev[at]) {
            path.addFirst(at);
        }
        return path;
    }

    private static boolean allowed(int i, int j, String[][] connections, double[][] weights) {
        if (i == j)
            return false;
        String lbl = connections[i][j];
        if (lbl.equals("X"))
            return false;
        if (lbl.equals("IL"))
            return false;
        if (lbl.equals("UI"))
            return false;
        if (lbl.equals("UL"))
            return false;
        return weights[i][j] > 0;
    }

    private static double pathDistance(List<Integer> path, double[][] weights) {
        double d = 0;
        for (int i = 0; i + 1 < path.size(); i++) {
            d += weights[path.get(i)][path.get(i + 1)];
        }
        return d;
    }

    private static boolean overlaps(double s1, double e1, double s2, double e2) {
        return s1 < e2 && s2 < e1;
    }

    private static void reserveNode(Map<Integer, List<double[]>> map, int node, double start, double end) {
        map.computeIfAbsent(node, k -> new ArrayList<>()).add(new double[] { start, end });
    }

    private static void reserveEdge(Map<String, List<double[]>> map, int u, int v, double start, double end) {
        map.computeIfAbsent(u + "_" + v, k -> new ArrayList<>()).add(new double[] { start, end });
    }
}
