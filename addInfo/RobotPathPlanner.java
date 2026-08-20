import java.util.*;

public class RobotPathPlanner {

    // ---- Graph definition ------------------------------------------------
    // N is derived from the matrix itself, so resizing LABEL/DISTANCE (adding
    // or removing nodes) is all you need to do -- no manual length bookkeeping.

    static final String[][] LABEL = {
        //   0     1     2     3     4     5     6     7     8     9    10    11    12    13    14
        {  "X",  "X",  "X",  "X",  "X",  "X", "LI",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X" }, // 0  L1
        {  "X",  "X",  "X",  "X",  "X",  "X", "LI",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X" }, // 1  L2
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X", "LI",  "X",  "X",  "X",  "X",  "X",  "X",  "X" }, // 2  L3
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "LI", "LI",  "X",  "X",  "X",  "X",  "X" }, // 3  L4
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "LI",  "X",  "X",  "X" }, // 4  L5
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "LI",  "X",  "X",  "X",  "X",  "X" }, // 5  L6
        { "IL", "IL",  "X",  "X",  "X",  "X",  "X", "II",  "X",  "X",  "X",  "X",  "X",  "X",  "X" }, // 6  I1
        {  "X",  "X", "IL",  "X",  "X",  "X", "II",  "X", "II",  "X",  "X",  "X",  "X",  "X",  "X" }, // 7  I2
        {  "X",  "X",  "X", "IL",  "X",  "X",  "X", "II",  "X", "II",  "X",  "X",  "X",  "X",  "X" }, // 8  I3
        {  "X",  "X",  "X", "IL",  "X", "IL",  "X",  "X", "II",  "X", "II",  "X",  "X",  "X",  "X" }, // 9  I4
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "II",  "X", "II", "IU", "IU", "IU" }, // 10 I5
        {  "X",  "X",  "X",  "X", "IL",  "X",  "X",  "X",  "X",  "X", "II",  "X",  "X",  "X",  "X" }, // 11 I6
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "UI",  "X",  "X",  "X",  "X" }, // 12 U1
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "UI",  "X",  "X",  "X",  "X" }, // 13 U2
        {  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X",  "X", "UI",  "X",  "X",  "X",  "X" }  // 14 U3
    };

    // DISTANCE (cm) between connected nodes -- this used to be called WEIGHT.
    // It now represents pure physical path length, not a robot-specific cost.
    // Each robot converts this to its own travel time using: time = distance / speed.
    static final double[][] DISTANCE_CM = {
        //     0      1      2      3      4      5      6      7      8      9     10     11     12     13     14
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  3.42,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 0
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  2.76,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 1
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  3.18,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 2
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  2.64,  3.51,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 3
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  2.89,  0.00,  0.00,  0.00 }, // 4
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  3.07,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 5
        {   3.42,  2.76,  0.00,  0.00,  0.00,  0.00,  0.00,  3.13,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 6
        {   0.00,  0.00,  3.18,  0.00,  0.00,  0.00,  3.13,  0.00,  2.47,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 7
        {   0.00,  0.00,  0.00,  2.64,  0.00,  0.00,  0.00,  2.47,  0.00,  3.66,  0.00,  0.00,  0.00,  0.00,  0.00 }, // 8
        {   0.00,  0.00,  0.00,  3.51,  0.00,  3.07,  0.00,  0.00,  3.66,  0.00,  2.95,  0.00,  0.00,  0.00,  0.00 }, // 9
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  2.95,  0.00,  3.28,  2.41,  3.73,  2.87 }, // 10
        {   0.00,  0.00,  0.00,  0.00,  2.89,  0.00,  0.00,  0.00,  0.00,  0.00,  3.28,  0.00,  0.00,  0.00,  0.00 }, // 11
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  2.41,  0.00,  0.00,  0.00,  0.00 }, // 12
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  3.73,  0.00,  0.00,  0.00,  0.00 }, // 13
        {   0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  2.87,  0.00,  0.00,  0.00,  0.00 }  // 14
    };

    static final String[] NODE_NAME = {
        "L1","L2","L3","L4","L5","L6",
        "I1","I2","I3","I4","I5","I6",
        "U1","U2","U3"
    };

    static final int N = DISTANCE_CM.length; // auto-derived from the matrix size

    // How close (in seconds) two robots' presence at the same node is still
    // treated as a collision. Real robots have physical footprint + reaction
    // time, so "arriving at the exact same instant" isn't the only unsafe case.
    static final double SAFETY_MARGIN_SEC = 0.5;

    // Movement constraint: I->L, U->I, U->L and self loops are forbidden.
    static boolean allowed(int i, int j) {
        if (i == j) return false;
        String lbl = LABEL[i][j];
        if (lbl.equals("X")) return false;
        if (lbl.equals("IL")) return false;
        if (lbl.equals("UI")) return false;
        if (lbl.equals("UL")) return false;
        return DISTANCE_CM[i][j] > 0;
    }

    // ---- Dijkstra (distance-based; path choice doesn't depend on speed) ----

    static List<Integer> shortestPath(int src, int dst) {
        double[] dist = new double[N];
        int[] prev = new int[N];
        boolean[] visited = new boolean[N];
        Arrays.fill(dist, Double.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[src] = 0;

        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingDouble(a -> dist[a[0]]));
        pq.add(new int[]{src});

        while (!pq.isEmpty()) {
            int u = pq.poll()[0];
            if (visited[u]) continue;
            visited[u] = true;
            if (u == dst) break;

            for (int v = 0; v < N; v++) {
                if (!allowed(u, v)) continue;
                double nd = dist[u] + DISTANCE_CM[u][v];
                if (nd < dist[v]) {
                    dist[v] = nd;
                    prev[v] = u;
                    pq.add(new int[]{v});
                }
            }
        }

        if (dist[dst] == Double.MAX_VALUE) return Collections.emptyList();

        LinkedList<Integer> path = new LinkedList<>();
        for (int at = dst; at != -1; at = prev[at]) path.addFirst(at);
        return path;
    }

    // ---- Robot model --------------------------------------------------------

    static class Robot {
        int id, src, dst;
        double speedCmPerSec;
        List<Integer> path;
        double freeRunDistance;      // total cm, ignoring other robots
        double freeRunTime;          // total sec, ignoring other robots
        List<Integer> scheduleNodes = new ArrayList<>();   // node order actually taken
        List<Double> scheduleTimes = new ArrayList<>();    // arrival time (sec) at each node, after collision avoidance

        Robot(int id, int src, int dst, double speedCmPerSec) {
            this.id = id; this.src = src; this.dst = dst; this.speedCmPerSec = speedCmPerSec;
        }
    }

    // ---- Multi-robot scheduling with a continuous-time reservation table --
    // Each robot moves along its own shortest (distance) path. Travel time on
    // an edge = distance(cm) / speed(cm/s). Robots are resolved in priority
    // order; a lower-priority robot delays its departure whenever its transit
    // would overlap another robot's reserved node dwell or would swap places
    // with another robot on the same edge at an overlapping time.

    static List<Robot> plan(List<Object[]> robotDefs) {
        // robotDefs entries: {src(Integer), dst(Integer), speed(Double)}
        List<Robot> robots = new ArrayList<>();
        for (int i = 0; i < robotDefs.size(); i++) {
            Object[] d = robotDefs.get(i);
            Robot r = new Robot(i + 1, (int) d[0], (int) d[1], (double) d[2]);
            r.path = shortestPath(r.src, r.dst);
            r.freeRunDistance = pathDistance(r.path);
            r.freeRunTime = r.speedCmPerSec > 0 ? r.freeRunDistance / r.speedCmPerSec : Double.POSITIVE_INFINITY;
            robots.add(r);
        }

        // Priority: robot that would finish fastest (unimpeded) goes first, tie -> lower id.
        List<Robot> order = new ArrayList<>(robots);
        order.sort((a, b) -> {
            int c = Double.compare(a.freeRunTime, b.freeRunTime);
            if (c != 0) return c;
            return Integer.compare(a.id, b.id);
        });

        Map<Integer, List<double[]>> reservedNode = new HashMap<>();          // node -> list of [start,end]
        Map<String, List<double[]>> reservedEdge = new HashMap<>();           // "u_v" -> list of [start,end]

        for (Robot r : order) {
            if (r.path.isEmpty()) {
                System.out.println("Robot " + r.id + ": NO PATH FOUND from " + name(r.src) + " to " + name(r.dst));
                continue;
            }
            double t = 0.0;
            int pos = r.path.get(0);
            r.scheduleNodes.add(pos);
            r.scheduleTimes.add(t);
            reserveNode(reservedNode, pos, t - SAFETY_MARGIN_SEC, t + SAFETY_MARGIN_SEC);

            for (int idx = 1; idx < r.path.size(); idx++) {
                int next = r.path.get(idx);
                double travelTime = DISTANCE_CM[pos][next] / r.speedCmPerSec;

                double tStart = t;
                double tEnd = tStart + travelTime;

                while (true) {
                    double pushTo = -1;

                    // swap conflict: someone travels next -> pos overlapping our pos -> next transit
                    for (double[] iv : reservedEdge.getOrDefault(next + "_" + pos, Collections.emptyList())) {
                        if (overlaps(tStart, tEnd, iv[0], iv[1])) pushTo = Math.max(pushTo, iv[1]);
                    }
                    // node conflict: someone occupies 'next' around our arrival time
                    for (double[] iv : reservedNode.getOrDefault(next, Collections.emptyList())) {
                        if (overlaps(tEnd - SAFETY_MARGIN_SEC, tEnd + SAFETY_MARGIN_SEC, iv[0], iv[1])) {
                            pushTo = Math.max(pushTo, iv[1] + SAFETY_MARGIN_SEC);
                        }
                    }

                    if (pushTo < 0) break; // no conflict

                    tStart = pushTo;
                    tEnd = tStart + travelTime;
                }

                reserveEdge(reservedEdge, pos, next, tStart, tEnd);
                reserveNode(reservedNode, next, tEnd - SAFETY_MARGIN_SEC, tEnd + SAFETY_MARGIN_SEC);

                r.scheduleNodes.add(next);
                r.scheduleTimes.add(tEnd);
                t = tEnd;
                pos = next;
            }
        }
        return robots;
    }

    static boolean overlaps(double s1, double e1, double s2, double e2) {
        return s1 < e2 && s2 < e1;
    }

    static void reserveNode(Map<Integer, List<double[]>> map, int node, double start, double end) {
        map.computeIfAbsent(node, k -> new ArrayList<>()).add(new double[]{start, end});
    }

    static void reserveEdge(Map<String, List<double[]>> map, int u, int v, double start, double end) {
        map.computeIfAbsent(u + "_" + v, k -> new ArrayList<>()).add(new double[]{start, end});
    }

    static String name(int node) {
        if (node >= 0 && node < NODE_NAME.length) return NODE_NAME[node] + "(" + node + ")";
        return String.valueOf(node);
    }

    static double pathDistance(List<Integer> path) {
        double d = 0;
        for (int i = 0; i + 1 < path.size(); i++) d += DISTANCE_CM[path.get(i)][path.get(i + 1)];
        return d;
    }

    // ---- Interactive input --------------------------------------------------

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        System.out.println("Graph has " + N + " nodes, numbered 0.." + (N - 1) + ":");
        for (int i = 0; i < N; i++) System.out.println("  " + i + " = " + NODE_NAME[i]);
        System.out.println("Distances are in cm, speeds are in cm/sec.");

        int numRobots = readPositiveInt(sc, "\nEnter number of robots: ");

        List<Object[]> robotDefs = new ArrayList<>();
        for (int i = 1; i <= numRobots; i++) {
            int src = readNode(sc, "Robot " + i + " - source node (0.." + (N - 1) + "): ");
            int dst = readNode(sc, "Robot " + i + " - destination node (0.." + (N - 1) + "): ");
            double speed = readPositiveDouble(sc, "Robot " + i + " - speed (cm/sec): ");
            robotDefs.add(new Object[]{src, dst, speed});
        }

        List<Robot> robots = plan(robotDefs);

        System.out.println("\n=== Individual shortest paths (distance-based, ignoring other robots) ===");
        for (Robot r : robots) {
            System.out.printf("R%d (%s -> %s) speed=%.2f cm/s: %s  distance=%.2fcm  freeRunTime=%.2fs%n",
                    r.id, name(r.src), name(r.dst), r.speedCmPerSec, r.path, r.freeRunDistance, r.freeRunTime);
        }

        System.out.println("\n=== Collision-free schedule (real time, seconds) ===");
        for (Robot r : robots) {
            StringBuilder sb = new StringBuilder("R" + r.id + ": ");
            for (int i = 0; i < r.scheduleNodes.size(); i++) {
                sb.append(String.format("%s@%.2fs", name(r.scheduleNodes.get(i)), r.scheduleTimes.get(i)));
                if (i + 1 < r.scheduleNodes.size()) sb.append("  ->  ");
            }
            double totalTime = r.scheduleTimes.isEmpty() ? 0 : r.scheduleTimes.get(r.scheduleTimes.size() - 1);
            double waitTime = totalTime - r.freeRunTime;
            sb.append(String.format("   [arrived at %.2fs, waited %.2fs due to traffic]", totalTime, Math.max(0, waitTime)));
            System.out.println(sb.toString());
        }
    }

    static int readPositiveInt(Scanner sc, String prompt) {
        while (true) {
            System.out.print(prompt);
            String line = sc.nextLine().trim();
            try {
                int v = Integer.parseInt(line);
                if (v > 0) return v;
                System.out.println("Please enter a positive integer.");
            } catch (NumberFormatException e) {
                System.out.println("Not a valid integer, try again.");
            }
        }
    }

    static double readPositiveDouble(Scanner sc, String prompt) {
        while (true) {
            System.out.print(prompt);
            String line = sc.nextLine().trim();
            try {
                double v = Double.parseDouble(line);
                if (v > 0) return v;
                System.out.println("Speed must be greater than 0.");
            } catch (NumberFormatException e) {
                System.out.println("Not a valid number, try again.");
            }
        }
    }

    static int readNode(Scanner sc, String prompt) {
        while (true) {
            System.out.print(prompt);
            String line = sc.nextLine().trim();
            try {
                int v = Integer.parseInt(line);
                if (v >= 0 && v < N) return v;
                System.out.println("Node must be between 0 and " + (N - 1) + ".");
            } catch (NumberFormatException e) {
                System.out.println("Not a valid integer, try again.");
            }
        }
    }
}