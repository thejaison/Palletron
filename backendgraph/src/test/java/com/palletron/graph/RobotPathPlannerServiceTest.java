package com.palletron.graph;

import com.palletron.graph.entity.GraphReo;
import com.palletron.graph.entity.MapPlot;
import com.palletron.graph.repository.GraphReoRepository;
import com.palletron.graph.repository.MapPlotRepository;
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
        // Once R1 clears L1->I1 at 1.0s, R2 can depart.
        double r2DepartL1 = resp2.scheduleTimes.get(0);
        double r2ArriveI1 = resp2.scheduleTimes.get(1);
        assertTrue(r2ArriveI1 >= 1.0 + 1.0, "R2 must not arrive at I1 until R1 has cleared the edge plus transit time");
    }
}
