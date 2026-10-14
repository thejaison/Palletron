package com.palletron.graph.service;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import com.palletron.graph.dto.RobotInstruction;
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
        public double accelerationCmPerSec2;
        public double decelerationCmPerSec2;
        public Double accelTimeSec;
        public Double decelTimeSec;

        public Double safetyDistanceCm;
    }

    // DTO for planning response
    public static class RobotResponse {
        public int id;

        public List<String> path;

        public List<String> scheduleNodes;

        public List<Double> scheduleTimes;

        public double speedCmPerSec;

        public double accelerationCmPerSec2;

        public double decelerationCmPerSec2;

        public double safetyDistanceCm;

        public List<RobotInstruction> instructions;
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

                    // Populate from -> to direction and to -> from direction (bidirectional)
                    connections[fromIdx][toIdx] = tFrom + tTo;
                    connections[toIdx][fromIdx] = tTo + tFrom;

                    if (weights[fromIdx][toIdx] > 0.0 && distance == 1000.0 && weights[fromIdx][toIdx] != 1000.0) {
                        // Preserve previously assigned custom distance
                    } else {
                        weights[fromIdx][toIdx] = distance;
                        weights[toIdx][fromIdx] = distance;
                    }
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

            double accel = req.accelerationCmPerSec2;
            if (accel <= 0.0 && req.accelTimeSec != null && req.accelTimeSec > 0.0 && req.speedCmPerSec > 0.0) {
                accel = req.speedCmPerSec / req.accelTimeSec;
            }

            double decel = req.decelerationCmPerSec2;
            if (decel <= 0.0 && req.decelTimeSec != null && req.decelTimeSec > 0.0 && req.speedCmPerSec > 0.0) {
                decel = req.speedCmPerSec / req.decelTimeSec;
            }

            Robot r = new Robot(req.id, src, dst, req.speedCmPerSec, accel,
                    decel, req.safetyDistanceCm);
            r.path = shortestPath(r.src, r.dst, connections, weights);
            r.freeRunDistance = pathDistance(r.path, weights);
            r.freeRunTime = 0.0;
            for (int i = 0; i + 1 < r.path.size(); i++) {
                double segDist = weights[r.path.get(i)][r.path.get(i + 1)];
                double segTravel = computeTravelTime(segDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                        r.decelerationCmPerSec2);
                int prevI = i >= 1 ? r.path.get(i - 1) : -1;
                double segTurn = computeTurnDuration(prevI, r.path.get(i), r.path.get(i + 1), nodes, segTravel);
                r.freeRunTime += segTurn + segTravel;
            }
            robots.add(r);
        }

        // Detect opposing edge overlaps and establish planning order & constraints
        Map<Robot, Set<Robot>> adj = new HashMap<>();
        Map<Robot, Integer> inDegree = new HashMap<>();
        for (Robot r : robots) {
            adj.put(r, new HashSet<>());
            inDegree.put(r, 0);
        }

        Map<Robot, List<Constraint>> robotConstraints = new HashMap<>();
        for (Robot r : robots) {
            robotConstraints.put(r, new ArrayList<>());
        }

        for (int i = 0; i < robots.size(); i++) {
            Robot rI = robots.get(i);
            for (int j = i + 1; j < robots.size(); j++) {
                Robot rJ = robots.get(j);

                for (int k = 0; k < rI.path.size() - 1; k++) {
                    int u = rI.path.get(k);
                    int v = rI.path.get(k + 1);

                    for (int l = 0; l < rJ.path.size() - 1; l++) {
                        if (rJ.path.get(l) == v && rJ.path.get(l + 1) == u) {
                            // Opposing edge overlap found! Compare priorities
                            int priorityI = k + 1;
                            int priorityJ = l + 1;

                            int comp = Integer.compare(priorityI, priorityJ);
                            if (comp == 0) {
                                comp = Integer.compare(rI.id, rJ.id);
                            }

                            if (comp < 0) {
                                // rJ has priority. rJ must be planned before rI.
                                if (adj.get(rJ).add(rI)) {
                                    inDegree.put(rI, inDegree.get(rI) + 1);
                                }
                                Constraint c = new Constraint(k, rJ, l + 1);
                                robotConstraints.get(rI).add(c);
                            } else {
                                // rI has priority. rI must be planned before rJ.
                                if (adj.get(rI).add(rJ)) {
                                    inDegree.put(rJ, inDegree.get(rJ) + 1);
                                }
                                Constraint c = new Constraint(l, rI, k + 1);
                                robotConstraints.get(rJ).add(c);
                            }
                        }
                    }
                }
            }
        }

        // Kahn's algorithm for topological sorting of planning order
        Queue<Robot> queue = new LinkedList<>();
        List<Robot> zeroInDegree = new ArrayList<>();
        for (Robot r : robots) {
            if (inDegree.get(r) == 0) {
                zeroInDegree.add(r);
            }
        }
        // Base sorting: freeRunTime ascending, tie-breaker by ID
        zeroInDegree.sort((a, b) -> {
            int c = Double.compare(a.freeRunTime, b.freeRunTime);
            if (c != 0)
                return c;
            return Integer.compare(a.id, b.id);
        });
        queue.addAll(zeroInDegree);

        List<Robot> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            Robot u = queue.poll();
            order.add(u);

            List<Robot> neighbors = new ArrayList<>(adj.get(u));
            neighbors.sort((a, b) -> {
                int c = Double.compare(a.freeRunTime, b.freeRunTime);
                if (c != 0)
                    return c;
                return Integer.compare(a.id, b.id);
            });

            for (Robot v : neighbors) {
                inDegree.put(v, inDegree.get(v) - 1);
                if (inDegree.get(v) == 0) {
                    queue.add(v);
                }
            }
        }

        // Fallback for cycles
        if (order.size() < robots.size()) {
            for (Robot r : robots) {
                if (!order.contains(r)) {
                    order.add(r);
                }
            }
        }

        double safetyMarginSec = 0.5;
        Map<Integer, List<double[]>> reservedNode = new HashMap<>();
        Map<String, List<double[]>> reservedEdge = new HashMap<>();

        for (Robot r : order) {
            if (r.path.isEmpty()) {
                continue;
            }

            // Calculate base t_min timeline (earliest possible arrivals)
            double[] t_min = new double[r.path.size()];
            t_min[0] = 0.0;
            for (int idx = 1; idx < r.path.size(); idx++) {
                int prevIdx = idx >= 2 ? r.path.get(idx - 2) : -1;
                int posIdx = r.path.get(idx - 1);
                int nextIdx = r.path.get(idx);
                double segDist = weights[posIdx][nextIdx];
                double travelTime = computeTravelTime(segDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                        r.decelerationCmPerSec2);
                double turnDuration = computeTurnDuration(prevIdx, posIdx, nextIdx, nodes, travelTime);
                t_min[idx] = t_min[idx - 1] + turnDuration + travelTime;
            }

            // Apply opposing edge wait constraints from higher priority robots
            for (Constraint c : robotConstraints.getOrDefault(r, Collections.emptyList())) {
                if (c.partner.scheduleTimes.size() > c.partnerIdx) {
                    double tPartnerArrival = c.partner.scheduleTimes.get(c.partnerIdx);
                    t_min[c.k] = Math.max(t_min[c.k], tPartnerArrival + safetyMarginSec);
                }
            }

            // Propagate t_min forward to maintain consistent arrival timeline
            for (int idx = 1; idx < r.path.size(); idx++) {
                int prevIdx = idx >= 2 ? r.path.get(idx - 2) : -1;
                int posIdx = r.path.get(idx - 1);
                int nextIdx = r.path.get(idx);
                double segDist = weights[posIdx][nextIdx];
                double travelTime = computeTravelTime(segDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                        r.decelerationCmPerSec2);
                double turnDuration = computeTurnDuration(prevIdx, posIdx, nextIdx, nodes, travelTime);
                t_min[idx] = Math.max(t_min[idx], t_min[idx - 1] + turnDuration + travelTime);
            }

            double t = 0.0;
            int pos = r.path.get(0);
            r.scheduleNodes.add(pos);
            r.scheduleTimes.add(t);
            reserveNode(reservedNode, pos, t - safetyMarginSec, t + safetyMarginSec);

            for (int idx = 1; idx < r.path.size(); idx++) {
                int prevIdx = idx >= 2 ? r.path.get(idx - 2) : -1;
                int next = r.path.get(idx);
                double edgeDist = weights[pos][next];
                double travelTime = computeTravelTime(edgeDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                        r.decelerationCmPerSec2);
                double turnDuration = computeTurnDuration(prevIdx, pos, next, nodes, travelTime);
                double stepDuration = turnDuration + travelTime;

                // Adjust tStart to respect t_min constraint
                double tStart = Math.max(t, t_min[idx] - stepDuration);
                double tEnd = tStart + stepDuration;

                String eKey = edgeKey(pos, next);

                // Compute time required for robot to change direction (turn) at 'next'
                // and clear safety distance away from 'next' along its subsequent segment
                double nextTurnDuration = 0.0;
                double tClearDist = 0.0;
                if (idx < r.path.size() - 1) {
                    int nextNext = r.path.get(idx + 1);
                    double nextDist = weights[next][nextNext];
                    double nextTravelTime = computeTravelTime(nextDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                            r.decelerationCmPerSec2);
                    nextTurnDuration = computeTurnDuration(pos, next, nextNext, nodes, nextTravelTime);
                    double clearDist = Math.min(r.safetyDistanceCm, nextDist);
                    tClearDist = computeTravelTime(clearDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                            r.decelerationCmPerSec2);
                }

                while (true) {
                    double pushTo = -1.0;

                    // 1. Edge Occupancy Conflict on edgeKey(pos, next):
                    // If another vehicle has occupied this edge (in either direction, or is
                    // changing its direction),
                    // this robot MUST ALWAYS STOP at 'pos' until the edge is completely clear!
                    for (double[] iv : reservedEdge.getOrDefault(eKey, Collections.emptyList())) {
                        if (overlaps(tStart, tEnd, iv[0], iv[1])) {
                            pushTo = Math.max(pushTo, iv[1]);
                        }
                    }

                    if (pushTo > 0) {
                        tStart = pushTo;
                        tEnd = tStart + stepDuration;
                        continue;
                    }

                    // 2. Node Conflict at 'next' (Converging traffic or preceding vehicle at
                    // 'next' or edge connected to 'next' occupied):
                    double nodePushTo = -1.0;
                    double nodeRequiredEnd = (idx == r.path.size() - 1)
                            ? (tEnd + safetyMarginSec)
                            : (tEnd + nextTurnDuration + tClearDist + safetyMarginSec);
                    for (double[] iv : reservedNode.getOrDefault(next, Collections.emptyList())) {
                        if (overlaps(tEnd - safetyMarginSec, nodeRequiredEnd, iv[0], iv[1])) {
                            nodePushTo = Math.max(nodePushTo, iv[1] + safetyMarginSec);
                        }
                    }

                    if (nodePushTo <= 0) {
                        // All clear! No conflict!
                        break;
                    }

                    // 3/4th Distance Advance Algorithm:
                    // If the approaching robot's edge (pos -> next) is NOT occupied by another
                    // vehicle,
                    // all other robots approaching the occupied edge/node advance 3/4th of the edge
                    // distance
                    // and wait at the 3/4th standoff point until the edge/node clears!
                    double t34TravelTime = computeTravelTime(0.75 * edgeDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                            r.decelerationCmPerSec2);
                    double standoffArrival = tStart + turnDuration + t34TravelTime;
                    boolean edgeOccupied = false;
                    for (double[] iv : reservedEdge.getOrDefault(eKey, Collections.emptyList())) {
                        if (overlaps(tStart, standoffArrival, iv[0], iv[1])) {
                            edgeOccupied = true;
                            break;
                        }
                    }

                    if (edgeOccupied) {
                        // Edge is occupied: robot stops itself at pos until destination node clears
                        tStart = Math.max(tStart, nodePushTo - stepDuration);
                        tEnd = tStart + stepDuration;
                        continue;
                    }

                    // Edge is vacant: advance 3/4 distance to standoff waypoint and hold there
                    double remTravelTime = computeTravelTime(0.25 * edgeDist, r.speedCmPerSec, r.accelerationCmPerSec2,
                            r.decelerationCmPerSec2);
                    tEnd = Math.max(tStart + stepDuration, Math.max(standoffArrival, nodePushTo) + remTravelTime);

                    boolean recheckNeeded = false;
                    for (double[] iv : reservedNode.getOrDefault(next, Collections.emptyList())) {
                        if (overlaps(tEnd - safetyMarginSec, tEnd + safetyMarginSec, iv[0], iv[1])) {
                            tEnd = Math.max(tEnd, iv[1] + safetyMarginSec + remTravelTime);
                            recheckNeeded = true;
                        }
                    }

                    if (!recheckNeeded)
                        break;
                }

                // Reserve edge: occupied from departure through arrival, direction change
                // (turn) at 'next',
                // and safety distance clearance onto the next segment
                double edgeClearEnd = (idx == r.path.size() - 1)
                        ? (tEnd + safetyMarginSec)
                        : (tEnd + nextTurnDuration + tClearDist);
                reserveEdge(reservedEdge, pos, next, tStart, edgeClearEnd);

                // Reserve pos while waiting and turning (from arrival t through departure
                // tStart + turnDuration)
                reserveNode(reservedNode, pos, t - safetyMarginSec, tStart + turnDuration + safetyMarginSec);

                // Reserve next node around arrival and through turn and clearance distance
                double nodeClearEnd = (idx == r.path.size() - 1)
                        ? (tEnd + safetyMarginSec)
                        : (tEnd + nextTurnDuration + tClearDist + safetyMarginSec);
                reserveNode(reservedNode, next, tEnd - safetyMarginSec, nodeClearEnd);

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
            res.speedCmPerSec = r.speedCmPerSec;
            res.accelerationCmPerSec2 = r.accelerationCmPerSec2;
            res.decelerationCmPerSec2 = r.decelerationCmPerSec2;
            res.safetyDistanceCm = r.safetyDistanceCm;
            res.instructions = generateInstructions(r, nodes, weights);
            responses.add(res);
        }

        return responses;
    }

    private static class Constraint {
        int k;
        Robot partner;
        int partnerIdx;

        Constraint(int k, Robot partner, int partnerIdx) {
            this.k = k;
            this.partner = partner;
            this.partnerIdx = partnerIdx;
        }
    }

    private static class Robot {
        int id, src, dst;
        double speedCmPerSec;
        double accelerationCmPerSec2;
        double decelerationCmPerSec2;
        double safetyDistanceCm;

        List<Integer> path = new ArrayList<>();
        @SuppressWarnings("unused")
        double freeRunDistance;
        double freeRunTime;
        List<Integer> scheduleNodes = new ArrayList<>();
        List<Double> scheduleTimes = new ArrayList<>();

        Robot(int id, int src, int dst,
                double speedCmPerSec,
                double accelerationCmPerSec2,
                double decelerationCmPerSec2,
                Double safetyDistanceCm) {

            this.id = id;
            this.src = src;
            this.dst = dst;

            this.speedCmPerSec = speedCmPerSec;
            this.accelerationCmPerSec2 = accelerationCmPerSec2;
            this.decelerationCmPerSec2 = decelerationCmPerSec2;
            this.safetyDistanceCm = (safetyDistanceCm != null && safetyDistanceCm > 0) ? safetyDistanceCm : 50.0;
        }
    }

    private static List<RobotInstruction> generateInstructions(
            Robot robot,
            List<Map<String, Object>> nodes,
            double[][] weights) {

        List<RobotInstruction> instructions = new ArrayList<>();

        if (robot.path.isEmpty()) {
            return instructions;
        }

        for (int i = 0; i < robot.path.size() - 1; i++) {

            int current = robot.path.get(i);
            int next = robot.path.get(i + 1);

            // Add turn instruction before moving to next node
            if (i > 0) {

                int previous = robot.path.get(i - 1);

                double angle = calculateTurnAngle(
                        previous,
                        current,
                        next,
                        nodes);

                if (Math.abs(angle) > 5.0) {

                    RobotInstruction turn = new RobotInstruction();

                    turn.speedCmPerSec = robot.speedCmPerSec;
                    turn.accelerationCmPerSec2 = robot.accelerationCmPerSec2;
                    turn.decelerationCmPerSec2 = robot.decelerationCmPerSec2;

                    turn.distanceCm = 0.0;
                    turn.angleDegrees = Math.abs(angle);

                    if (angle > 0) {
                        turn.command = "LEFT";
                    } else {
                        turn.command = "RIGHT";
                    }

                    instructions.add(turn);
                }
            }

            // Forward instruction
            RobotInstruction forward = new RobotInstruction();

            forward.speedCmPerSec = robot.speedCmPerSec;
            forward.accelerationCmPerSec2 = robot.accelerationCmPerSec2;
            forward.decelerationCmPerSec2 = robot.decelerationCmPerSec2;

            forward.command = "FORWARD";
            forward.angleDegrees = 0.0;
            forward.distanceCm = weights[current][next];

            instructions.add(forward);
        }

        // Final stop
        RobotInstruction stop = new RobotInstruction();

        stop.speedCmPerSec = 0.0;
        stop.accelerationCmPerSec2 = robot.accelerationCmPerSec2;
        stop.decelerationCmPerSec2 = robot.decelerationCmPerSec2;

        stop.command = "STOP";
        stop.angleDegrees = 0.0;
        stop.distanceCm = 0.0;

        instructions.add(stop);

        return instructions;
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

    public static String edgeKey(int u, int v) {
        return Math.min(u, v) + "_" + Math.max(u, v);
    }

    private static void reserveEdge(Map<String, List<double[]>> map, int u, int v, double start, double end) {
        map.computeIfAbsent(edgeKey(u, v), k -> new ArrayList<>()).add(new double[] { start, end });
    }

    public static double computeTravelTime(
            double distance,
            double speed,
            double acceleration,
            double deceleration) {

        if (speed <= 0.0 || distance <= 0.0) {
            return 0.0;
        }

        if (acceleration <= 0.0 || deceleration <= 0.0) {
            return distance / speed;
        }

        // Distance required to accelerate from 0 -> speed
        double accelDistance = (speed * speed) / (2.0 * acceleration);

        // Distance required to decelerate from speed -> 0
        double decelDistance = (speed * speed) / (2.0 * deceleration);

        double minimumDistanceForFullSpeed = accelDistance + decelDistance;

        // Robot can reach target speed
        if (distance >= minimumDistanceForFullSpeed) {

            double accelTime = speed / acceleration;
            double decelTime = speed / deceleration;

            double cruiseDistance = distance - minimumDistanceForFullSpeed;

            double cruiseTime = cruiseDistance / speed;

            return accelTime + cruiseTime + decelTime;
        }

        // Triangular velocity profile
        double peakSpeed = Math.sqrt(
                (2.0 * distance * acceleration * deceleration)
                        / (acceleration + deceleration));

        double accelTime = peakSpeed / acceleration;
        double decelTime = peakSpeed / deceleration;

        return accelTime + decelTime;
    }

    public static double calculateTurnAngle(int prevIdx, int currIdx, int nextIdx, List<Map<String, Object>> nodes) {
        if (prevIdx < 0 || currIdx < 0 || nextIdx < 0 || nodes == null) {
            return 0.0;
        }
        if (prevIdx >= nodes.size() || currIdx >= nodes.size() || nextIdx >= nodes.size()) {
            return 0.0;
        }
        Map<String, Object> pNode = nodes.get(prevIdx);
        Map<String, Object> cNode = nodes.get(currIdx);
        Map<String, Object> nNode = nodes.get(nextIdx);

        double prevH = getSegmentHeading(pNode, cNode);
        double segH = getSegmentHeading(cNode, nNode);

        return ((segH - prevH + 540.0) % 360.0) - 180.0;
    }

    private static double getSegmentHeading(Map<String, Object> fromNode, Map<String, Object> toNode) {
        if (fromNode == null || toNode == null)
            return 0.0;
        String fromType = (String) fromNode.get("type");
        String toType = (String) toNode.get("type");
        String toId = (String) toNode.get("id");
        String fromId = (String) fromNode.get("id");

        if ("intersection".equals(fromType) && fromNode.get("connectionAngles") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> angles = (Map<String, Object>) fromNode.get("connectionAngles");
            if (angles != null && angles.containsKey(toId) && angles.get(toId) instanceof Number) {
                return ((Number) angles.get(toId)).doubleValue();
            }
        }
        if ("intersection".equals(toType) && toNode.get("connectionAngles") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> angles = (Map<String, Object>) toNode.get("connectionAngles");
            if (angles != null && angles.containsKey(fromId) && angles.get(fromId) instanceof Number) {
                return (((Number) angles.get(fromId)).doubleValue() + 180.0) % 360.0;
            }
        }
        return getCompassAngle(fromNode, toNode);
    }

    private static double getCompassAngle(Map<String, Object> uNode, Map<String, Object> vNode) {
        if (uNode == null || vNode == null)
            return 0.0;
        Number ux = (Number) uNode.get("x");
        Number uy = (Number) uNode.get("y");
        Number vx = (Number) vNode.get("x");
        Number vy = (Number) vNode.get("y");
        if (ux == null || uy == null || vx == null || vy == null)
            return 0.0;
        double cdx = vx.doubleValue() - ux.doubleValue();
        double cdy = uy.doubleValue() - vy.doubleValue(); // Invert SVG y: Up is North (positive)
        double deg = Math.toDegrees(Math.atan2(cdy, cdx));
        return (deg + 360.0) % 360.0;
    }

    public static double computeTurnDuration(int prevIdx, int currIdx, int nextIdx, List<Map<String, Object>> nodes,
            double travelTime) {
        double angleDiff = calculateTurnAngle(prevIdx, currIdx, nextIdx, nodes);
        double absAngle = Math.abs(angleDiff);

        if (absAngle <= 5.0) {
            return 0.0;
        }

        double desiredTurnTime = 0.6 + (absAngle / 180.0) * 1.2;
        double maxTurnTime = travelTime * 0.40;
        return Math.min(desiredTurnTime, maxTurnTime);
    }
}