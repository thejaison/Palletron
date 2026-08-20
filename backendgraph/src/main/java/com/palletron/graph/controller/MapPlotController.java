package com.palletron.graph.controller;

import com.palletron.graph.service.MapPlotService;
import com.palletron.graph.service.RobotPathPlannerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/plots")
@CrossOrigin(origins = "*")
public class MapPlotController {

    @Autowired
    private MapPlotService mapPlotService;

    @Autowired
    private RobotPathPlannerService robotPathPlannerService;

    @PostMapping("/create")
    public ResponseEntity<?> createPlot(@RequestBody(required = false) Map<String, String> request) {
        String plotName = request != null ? request.get("plotName") : null;
        try {
            String key = mapPlotService.createPlot(plotName);
            return ResponseEntity.ok(Map.of("key", key));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{key}/configure")
    public ResponseEntity<?> configurePlot(@PathVariable("key") String key, @RequestBody Map<String, Object> request) {
        try {
            Integer loadingPoints = Integer.parseInt(request.get("loadingPoints").toString());
            Integer unloadingPoints = Integer.parseInt(request.get("unloadingPoints").toString());
            String intersection = request.get("intersection").toString();
            Integer noOfRobots = Integer.parseInt(request.get("vehicles").toString());

            mapPlotService.saveDetails(key, loadingPoints, unloadingPoints, intersection, noOfRobots);
            return ResponseEntity.ok(Map.of("message", "Configuration saved successfully"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{key}/graph")
    public ResponseEntity<?> saveGraph(@PathVariable("key") String key, @RequestBody Map<String, String> request) {
        try {
            String connections = request.get("connections");
            String weights = request.get("weights");
            String canvasData = request.get("canvasData");

            mapPlotService.saveGraph(key, connections, weights, canvasData);
            return ResponseEntity.ok(Map.of("message", "Graph representation saved successfully"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{key}")
    public ResponseEntity<?> getPlotData(@PathVariable("key") String key) {
        try {
            Map<String, Object> plotData = mapPlotService.getPlotData(key);
            return ResponseEntity.ok(plotData);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{key}/plan")
    public ResponseEntity<?> planRoutes(@PathVariable("key") String key, @RequestBody List<RobotPathPlannerService.RobotRequest> request) {
        try {
            List<RobotPathPlannerService.RobotResponse> response = robotPathPlannerService.planRoutes(key, request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
