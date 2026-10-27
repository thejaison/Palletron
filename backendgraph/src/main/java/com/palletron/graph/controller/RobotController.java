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
    public ResponseEntity<?> config(@PathVariable("id") String id, @RequestBody Map<String, Object> body) throws IOException {
        double speed = body.containsKey("speed") ? ((Number) body.get("speed")).doubleValue() : 25.0;
        double accel = body.containsKey("acceleration") ? ((Number) body.get("acceleration")).doubleValue() : 25.0;
        double decel = body.containsKey("deceleration") ? ((Number) body.get("deceleration")).doubleValue() : 25.0;
        return dispatch(id, Map.of("type", "config", "speed", speed, "acceleration", accel, "deceleration", decel));
    }

    @PostMapping("/{id}/forward")
    public ResponseEntity<?> forward(@PathVariable("id") String id, @RequestBody Map<String, Object> body) throws IOException {
        double dist = body.containsKey("distance") ? ((Number) body.get("distance")).doubleValue()
                    : body.containsKey("value") ? ((Number) body.get("value")).doubleValue() : 0.0;
        return dispatch(id, Map.of("type", "move", "action", "forward", "value", dist));
    }

    @PostMapping("/{id}/left")
    public ResponseEntity<?> left(@PathVariable("id") String id, @RequestBody Map<String, Object> body) throws IOException {
        double angle = body.containsKey("angle") ? ((Number) body.get("angle")).doubleValue()
                     : body.containsKey("value") ? ((Number) body.get("value")).doubleValue() : 90.0;
        return dispatch(id, Map.of("type", "move", "action", "left", "value", angle));
    }

    @PostMapping("/{id}/right")
    public ResponseEntity<?> right(@PathVariable("id") String id, @RequestBody Map<String, Object> body) throws IOException {
        double angle = body.containsKey("angle") ? ((Number) body.get("angle")).doubleValue()
                     : body.containsKey("value") ? ((Number) body.get("value")).doubleValue() : 90.0;
        return dispatch(id, Map.of("type", "move", "action", "right", "value", angle));
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
