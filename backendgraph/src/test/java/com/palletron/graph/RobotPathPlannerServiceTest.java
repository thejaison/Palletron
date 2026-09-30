package com.palletron.graph;

import com.palletron.graph.entity.GraphReo;
import com.palletron.graph.entity.MapPlot;
import com.palletron.graph.repository.GraphReoRepository;
import com.palletron.graph.repository.MapPlotRepository;
import com.palletron.graph.dto.RobotInstruction;
import com.palletron.graph.service.RobotPathPlannerService;
import com.palletron.graph.service.RobotPathPlannerService.RobotRequest;
import com.palletron.graph.service.RobotPathPlannerService.RobotResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class RobotPathPlannerServiceTest {

    @Mock
    private MapPlotRepository mapPlotRepository;

    @Mock
    private GraphReoRepository graphReoRepository;

    @InjectMocks
    private RobotPathPlannerService plannerService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void testThreeRobotsConvergingIntersection() throws Exception {
        // Build graph with 3 loading points (L1, L2, L3) converging to 1 intersection (I1) and unloading (U1)
        // Edge L3 -> I1: distance = 25.0
        // Edge L2 -> I1: distance = 50.0
        // Edge L1 -> I1: distance = 100.0
        // Edge I1 -> U1: distance = 10.0
        String canvasData = "{"
            + "\"nodes\": ["
            + "  {\"id\": \"L1\", \"label\": \"L1\", \"type\": \"loading\"},"
            + "  {\"id\": \"L2\", \"label\": \"L2\", \"type\": \"loading\"},"
            + "  {\"id\": \"L3\", \"label\": \"L3\", \"type\": \"loading\"},"
            + "  {\"id\": \"I1\", \"label\": \"I1\", \"type\": \"intersection\"},"
            + "  {\"id\": \"U1\", \"label\": \"U1\", \"type\": \"unloading\"}"
            + "],"
            + "\"edges\": ["
            + "  {\"id\": \"e1\", \"from\": \"L1\", \"to\": \"I1\", \"distance\": 100.0},"
            + "  {\"id\": \"e2\", \"from\": \"L2\", \"to\": \"I1\", \"distance\": 50.0},"
            + "  {\"id\": \"e3\", \"from\": \"L3\", \"to\": \"I1\", \"distance\": 25.0},"
            + "  {\"id\": \"e4\", \"from\": \"I1\", \"to\": \"U1\", \"distance\": 10.0}"
            + "]"
            + "}";

        MapPlot plot = new MapPlot();
        plot.setId(1L);
        plot.setKeyId("test-key");
        plot.setPlotName("Test Plot");

        GraphReo graphReo = new GraphReo();
        graphReo.setPlotId(1L);
        graphReo.setCanvasData(canvasData);

        when(mapPlotRepository.findByKeyId("test-key")).thenReturn(Optional.of(plot));
        when(graphReoRepository.findById(1L)).thenReturn(Optional.of(graphReo));

        // R1: L1 -> U1, speed 20.0
        // R2: L2 -> U1, speed 20.0
        // R3: L3 -> U1, speed 20.0
        RobotRequest r1 = new RobotRequest();
        r1.id = 0;
        r1.startNodeId = "L1";
        r1.endNodeId = "U1";
        r1.speedCmPerSec = 20.0;

        RobotRequest r2 = new RobotRequest();
        r2.id = 1;
        r2.startNodeId = "L2";
        r2.endNodeId = "U1";
        r2.speedCmPerSec = 20.0;

        RobotRequest r3 = new RobotRequest();
        r3.id = 2;
        r3.startNodeId = "L3";
        r3.endNodeId = "U1";
        r3.speedCmPerSec = 20.0;

        List<RobotResponse> responses = plannerService.planRoutes("test-key", Arrays.asList(r1, r2, r3));
        assertNotNull(responses);
        assertEquals(3, responses.size());

        RobotResponse resp1 = responses.stream().filter(r -> r.id == 0).findFirst().orElseThrow();
        RobotResponse resp2 = responses.stream().filter(r -> r.id == 1).findFirst().orElseThrow();
        RobotResponse resp3 = responses.stream().filter(r -> r.id == 2).findFirst().orElseThrow();

        // Check path finding
        assertEquals(Arrays.asList("L1", "I1", "U1"), resp1.path);
        assertEquals(Arrays.asList("L2", "I1", "U1"), resp2.path);
        assertEquals(Arrays.asList("L3", "I1", "U1"), resp3.path);

        System.out.println("=== 3/4th Advance Verification ===");
        System.out.println("R3 Schedule Times: " + resp3.scheduleTimes);
        System.out.println("R2 Schedule Times: " + resp2.scheduleTimes);
        System.out.println("R1 Schedule Times: " + resp1.scheduleTimes);

        // Verify arrival times at I1:
        // R3 (weight 25/20 = 1.25) arrives at I1 first at 1.25s
        double r3ArrI1 = resp3.scheduleTimes.get(1);
        assertEquals(1.25, r3ArrI1, 0.01);

        // R2 arrives after R3 clears
        double r2ArrI1 = resp2.scheduleTimes.get(1);
        assertTrue(r2ArrI1 >= r3ArrI1 + 0.5, "R2 must arrive after R3 with safety margin");

        // R1 arrives after R2 clears
        double r1ArrI1 = resp1.scheduleTimes.get(1);
        assertTrue(r1ArrI1 >= r2ArrI1 + 0.5, "R1 must arrive after R2 with safety margin");
    }

    @Test
    void testSameEdgeOccupancyHolding() throws Exception {
        // Two robots on the exact same route: L1 -> I1 -> U1
        String canvasData = "{"
            + "\"nodes\": ["
            + "  {\"id\": \"L1\", \"label\": \"L1\", \"type\": \"loading\"},"
            + "  {\"id\": \"I1\", \"label\": \"I1\", \"type\": \"intersection\"},"
            + "  {\"id\": \"U1\", \"label\": \"U1\", \"type\": \"unloading\"}"
            + "],"
            + "\"edges\": ["
            + "  {\"id\": \"e1\", \"from\": \"L1\", \"to\": \"I1\", \"distance\": 50.0},"
            + "  {\"id\": \"e2\", \"from\": \"I1\", \"to\": \"U1\", \"distance\": 50.0}"
            + "]"
            + "}";

        MapPlot plot = new MapPlot();
        plot.setId(2L);
        plot.setKeyId("same-edge-key");
        plot.setPlotName("Same Edge Plot");

        GraphReo graphReo = new GraphReo();
        graphReo.setPlotId(2L);
        graphReo.setCanvasData(canvasData);

        when(mapPlotRepository.findByKeyId("same-edge-key")).thenReturn(Optional.of(plot));
        when(graphReoRepository.findById(2L)).thenReturn(Optional.of(graphReo));

        RobotRequest r1 = new RobotRequest();
        r1.id = 0;
        r1.startNodeId = "L1";
        r1.endNodeId = "U1";
        r1.speedCmPerSec = 50.0;

        RobotRequest r2 = new RobotRequest();
        r2.id = 1;
        r2.startNodeId = "L1";
        r2.endNodeId = "U1";
        r2.speedCmPerSec = 50.0;

        List<RobotResponse> responses = plannerService.planRoutes("same-edge-key", Arrays.asList(r1, r2));
        assertNotNull(responses);
        assertEquals(2, responses.size());

        RobotResponse resp1 = responses.stream().filter(r -> r.id == 0).findFirst().orElseThrow();
        RobotResponse resp2 = responses.stream().filter(r -> r.id == 1).findFirst().orElseThrow();

        System.out.println("=== Same Edge Occupancy Test ===");
        System.out.println("R1: " + resp1.scheduleTimes);
        System.out.println("R2: " + resp2.scheduleTimes);

        // R1: arrives at I1 at 1.0s, arrives at U1 at 2.0s
        assertEquals(1.0, resp1.scheduleTimes.get(1), 0.01);
        assertEquals(2.0, resp1.scheduleTimes.get(2), 0.01);

        // R2 must NOT advance into L1->I1 while R1 is on that edge. It must wait at L1.
        // Once R1 clears L1->I1 and clears I1 by 50cm, R2 can depart.
        double r2ArriveI1 = resp2.scheduleTimes.get(1);
        assertTrue(r2ArriveI1 >= 1.0 + 1.0, "R2 must not arrive at I1 until R1 has cleared the edge plus transit time");
    }

    @Test
    void testRobotStopsWhenEdgeOccupiedEvenWhenChangingDirection() throws Exception {
        // L1 (0,0) -> I1 (60,0) -> U1 (60,-60) [90 degree right turn at I1]
        // R1: moves L1 -> I1 (60cm), turns 90 degrees at I1 (changing direction), then moves I1 -> U1 (60cm)
        // R2: moves L1 -> I1 -> U1 behind R1
        // R2 MUST stop at L1 while R1 is on L1->I1 AND while R1 is changing its direction at I1!
        String canvasData = "{"
            + "\"nodes\": ["
            + "  {\"id\": \"L1\", \"label\": \"L1\", \"type\": \"loading\", \"x\": 0, \"y\": 0},"
            + "  {\"id\": \"I1\", \"label\": \"I1\", \"type\": \"intersection\", \"x\": 60, \"y\": 0},"
            + "  {\"id\": \"U1\", \"label\": \"U1\", \"type\": \"unloading\", \"x\": 60, \"y\": -60}"
            + "],"
            + "\"edges\": ["
            + "  {\"id\": \"e1\", \"from\": \"L1\", \"to\": \"I1\", \"distance\": 60.0},"
            + "  {\"id\": \"e2\", \"from\": \"I1\", \"to\": \"U1\", \"distance\": 60.0}"
            + "]"
            + "}";

        MapPlot plot = new MapPlot();
        plot.setId(3L);
        plot.setKeyId("turn-edge-key");
        plot.setPlotName("Turn Edge Plot");

        GraphReo graphReo = new GraphReo();
        graphReo.setPlotId(3L);
        graphReo.setCanvasData(canvasData);

        when(mapPlotRepository.findByKeyId("turn-edge-key")).thenReturn(Optional.of(plot));
        when(graphReoRepository.findById(3L)).thenReturn(Optional.of(graphReo));

        RobotRequest r1 = new RobotRequest();
        r1.id = 0;
        r1.startNodeId = "L1";
        r1.endNodeId = "U1";
        r1.speedCmPerSec = 30.0; // 60cm / 30cm/s = 2.0s

        RobotRequest r2 = new RobotRequest();
        r2.id = 1;
        r2.startNodeId = "L1";
        r2.endNodeId = "U1";
        r2.speedCmPerSec = 30.0;

        List<RobotResponse> responses = plannerService.planRoutes("turn-edge-key", Arrays.asList(r1, r2));
        assertNotNull(responses);
        assertEquals(2, responses.size());

        RobotResponse resp1 = responses.stream().filter(r -> r.id == 0).findFirst().orElseThrow();
        RobotResponse resp2 = responses.stream().filter(r -> r.id == 1).findFirst().orElseThrow();

        double r1ArrI1 = resp1.scheduleTimes.get(1); // R1 arrival at I1 = 2.0s
        double r2ArrI1 = resp2.scheduleTimes.get(1);

        System.out.println("=== Robot Stops When Edge Occupied & Changing Direction Test ===");
        System.out.println("R1 schedule: " + resp1.scheduleTimes);
        System.out.println("R2 schedule: " + resp2.scheduleTimes);

        assertEquals(2.0, r1ArrI1, 0.01);
        // R2 must wait at L1 while R1 is on L1->I1 and while R1 is changing its direction at I1
        // Therefore R2 arrival at I1 must be strictly after R1 arrival + turn duration + clearance
        assertTrue(r2ArrI1 > r1ArrI1 + 2.0, "R2 must wait at L1 while R1 is on the edge and changing direction at I1");
    }

    @Test
    void testKinematicsAccelerationDeceleration() {
        // Test trapezoidal profile: distance = 100cm, speed = 50cm/s, a = 50cm/s², d = 50cm/s²
        // accelDist = 25cm, decelDist = 25cm, minDist = 50cm. Distance 100 >= 50 => T = 1.0 + (50/50) + 1.0 = 3.0s
        double tTrapezoidal = RobotPathPlannerService.computeTravelTime(100.0, 50.0, 50.0, 50.0);
        assertEquals(3.0, tTrapezoidal, 0.001);

        // Test triangular profile: distance = 25cm, speed = 50cm/s, a = 50cm/s², d = 50cm/s²
        // Distance 25 < 50 => T = sqrt(2 * 25 * 50 * 50 / 100) / 50 * 2 = sqrt(2.0) = 1.4142s
        double tTriangular = RobotPathPlannerService.computeTravelTime(25.0, 50.0, 50.0, 50.0);
        assertEquals(Math.sqrt(2.0), tTriangular, 0.001);

        // Backward compatibility: acceleration <= 0 and deceleration <= 0 => distance / speed
        double tLinear = RobotPathPlannerService.computeTravelTime(100.0, 50.0, 0.0, 0.0);
        assertEquals(2.0, tLinear, 0.001);
    }

    @Test
    void testInstructionGeneration() throws Exception {
        // L1 (0,0) -> I1 (120,0) -> I2 (120,-80) -> U1 (200,-80)
        // 1. FORWARD 120cm
        // 2. LEFT 90°, distance 0cm
        // 3. FORWARD 80cm
        // 4. RIGHT 90°, distance 0cm
        // 5. FORWARD 80cm
        // 6. STOP, distance 0cm
        String canvasData = "{"
            + "\"nodes\": ["
            + "  {\"id\": \"L1\", \"label\": \"L1\", \"type\": \"loading\", \"x\": 0, \"y\": 0},"
            + "  {\"id\": \"I1\", \"label\": \"I1\", \"type\": \"intersection\", \"x\": 120, \"y\": 0},"
            + "  {\"id\": \"I2\", \"label\": \"I2\", \"type\": \"intersection\", \"x\": 120, \"y\": -80},"
            + "  {\"id\": \"U1\", \"label\": \"U1\", \"type\": \"unloading\", \"x\": 200, \"y\": -80}"
            + "],"
            + "\"edges\": ["
            + "  {\"id\": \"e1\", \"from\": \"L1\", \"to\": \"I1\", \"distance\": 120.0},"
            + "  {\"id\": \"e2\", \"from\": \"I1\", \"to\": \"I2\", \"distance\": 80.0},"
            + "  {\"id\": \"e3\", \"from\": \"I2\", \"to\": \"U1\", \"distance\": 80.0}"
            + "]"
            + "}";

        MapPlot plot = new MapPlot();
        plot.setId(10L);
        plot.setKeyId("instructions-key");
        plot.setPlotName("Instructions Plot");

        GraphReo graphReo = new GraphReo();
        graphReo.setPlotId(10L);
        graphReo.setCanvasData(canvasData);

        when(mapPlotRepository.findByKeyId("instructions-key")).thenReturn(Optional.of(plot));
        when(graphReoRepository.findById(10L)).thenReturn(Optional.of(graphReo));

        RobotRequest req = new RobotRequest();
        req.id = 1;
        req.startNodeId = "L1";
        req.endNodeId = "U1";
        req.speedCmPerSec = 40.0;
        req.accelerationCmPerSec2 = 20.0;
        req.decelerationCmPerSec2 = 20.0;

        List<RobotResponse> responses = plannerService.planRoutes("instructions-key", Collections.singletonList(req));
        assertNotNull(responses);
        assertEquals(1, responses.size());

        RobotResponse resp = responses.get(0);
        assertEquals(40.0, resp.speedCmPerSec);
        assertEquals(20.0, resp.accelerationCmPerSec2);
        assertEquals(20.0, resp.decelerationCmPerSec2);

        List<RobotInstruction> instructions = resp.instructions;
        assertNotNull(instructions);
        assertEquals(6, instructions.size());

        // 1. FORWARD distance: 120 cm
        assertEquals("FORWARD", instructions.get(0).command);
        assertEquals(120.0, instructions.get(0).distanceCm, 0.01);
        assertEquals(0.0, instructions.get(0).angleDegrees, 0.01);
        assertEquals(40.0, instructions.get(0).speedCmPerSec);

        // 2. LEFT 90° distance: 0 cm
        assertEquals("LEFT", instructions.get(1).command);
        assertEquals(90.0, instructions.get(1).angleDegrees, 0.01);
        assertEquals(0.0, instructions.get(1).distanceCm, 0.01);

        // 3. FORWARD distance: 80 cm
        assertEquals("FORWARD", instructions.get(2).command);
        assertEquals(80.0, instructions.get(2).distanceCm, 0.01);
        assertEquals(0.0, instructions.get(2).angleDegrees, 0.01);

        // 4. RIGHT 90° distance: 0 cm
        assertEquals("RIGHT", instructions.get(3).command);
        assertEquals(90.0, instructions.get(3).angleDegrees, 0.01);
        assertEquals(0.0, instructions.get(3).distanceCm, 0.01);

        // 5. FORWARD distance: 80 cm
        assertEquals("FORWARD", instructions.get(4).command);
        assertEquals(80.0, instructions.get(4).distanceCm, 0.01);
        assertEquals(0.0, instructions.get(4).angleDegrees, 0.01);

        // 6. STOP distance: 0 cm
        assertEquals("STOP", instructions.get(5).command);
        assertEquals(0.0, instructions.get(5).distanceCm, 0.01);
        assertEquals(0.0, instructions.get(5).angleDegrees, 0.01);
        assertEquals(0.0, instructions.get(5).speedCmPerSec);
    }

    @Test
    void testCustomSafetyDistanceAndResponse() throws Exception {
        String canvasData = "{"
            + "\"nodes\": ["
            + "  {\"id\": \"L1\", \"label\": \"L1\", \"type\": \"loading\"},"
            + "  {\"id\": \"U1\", \"label\": \"U1\", \"type\": \"unloading\"}"
            + "],"
            + "\"edges\": ["
            + "  {\"id\": \"e1\", \"from\": \"L1\", \"to\": \"U1\", \"distance\": 100.0}"
            + "]"
            + "}";

        MapPlot plot = new MapPlot();
        plot.setId(20L);
        plot.setKeyId("safety-dist-key");
        plot.setPlotName("Safety Dist Plot");

        GraphReo graphReo = new GraphReo();
        graphReo.setPlotId(20L);
        graphReo.setCanvasData(canvasData);

        when(mapPlotRepository.findByKeyId("safety-dist-key")).thenReturn(Optional.of(plot));
        when(graphReoRepository.findById(20L)).thenReturn(Optional.of(graphReo));

        RobotRequest req = new RobotRequest();
        req.id = 0;
        req.startNodeId = "L1";
        req.endNodeId = "U1";
        req.speedCmPerSec = 50.0;
        req.safetyDistanceCm = 75.0;

        List<RobotResponse> responses = plannerService.planRoutes("safety-dist-key", Collections.singletonList(req));
        assertNotNull(responses);
        assertEquals(1, responses.size());
        assertEquals(75.0, responses.get(0).safetyDistanceCm, 0.01);
    }
}
