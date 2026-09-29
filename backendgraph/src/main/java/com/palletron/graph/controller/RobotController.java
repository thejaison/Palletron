package com.palletron.graph.controller;

import com.palletron.graph.websocket.RobotWebSocketHandler;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.*;

@RestController
@RequestMapping("/api/robots")
@CrossOrigin(origins = "*")
public class RobotController {
    private final RobotWebSocketHandler ws;

    public RobotController(RobotWebSocketHandler ws) { this.ws = ws; }

    // ---- request bodies ----
    public record ConfigReq(double speed, double acceleration, double deceleration) {}   // mm/s, mm/s^2, mm/s^2
    public record DistanceReq(double distance) {}                                        // mm
    public record AngleReq(double angle) {}                                              // degrees

    @GetMapping
    public Set<String> list() { return ws.connectedRobots(); }

    @GetMapping("/{id}/status")
    public Object status(@PathVariable("id") String id) { return ws.status(id); }

    @PostMapping("/{id}/config")
    public ResponseEntity<?> config(@PathVariable("id") String id, @RequestBody ConfigReq r) throws IOException {
        return dispatch(id, Map.of("type", "config", "speed", r.speed(),
                "acceleration", r.acceleration(), "deceleration", r.deceleration()));
    }

    @PostMapping("/{id}/forward")
    public ResponseEntity<?> forward(@PathVariable("id") String id, @RequestBody DistanceReq r) throws IOException {
        return dispatch(id, Map.of("type", "move", "action", "forward", "value", r.distance()));
    }

    @PostMapping("/{id}/left")
    public ResponseEntity<?> left(@PathVariable("id") String id, @RequestBody AngleReq r) throws IOException {
        return dispatch(id, Map.of("type", "move", "action", "left", "value", r.angle()));
    }

    @PostMapping("/{id}/right")
    public ResponseEntity<?> right(@PathVariable("id") String id, @RequestBody AngleReq r) throws IOException {
        return dispatch(id, Map.of("type", "move", "action", "right", "value", r.angle()));
    }

    @PostMapping("/{id}/stop")
    public ResponseEntity<?> stop(@PathVariable("id") String id) throws IOException {
        return dispatch(id, Map.of("type", "stop"));
    }

    private ResponseEntity<?> dispatch(String id, Map<String, Object> cmd) throws IOException {
        Map<String, Object> full = new HashMap<>(cmd);
        full.put("cmdId", UUID.randomUUID().toString());
        return ws.send(id, full)
                ? ResponseEntity.ok(full)
                : ResponseEntity.status(404).body("Robot '" + id + "' not connected");
    }
}
