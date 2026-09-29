package com.palletron.graph.websocket;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Keeps every connected ESP32 (by robotId) and sends commands to them. */
@Component
public class RobotWebSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(RobotWebSocketHandler.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private final Map<String, WebSocketSession> robots = new ConcurrentHashMap<>();
    private final Map<String, JsonNode> lastStatus = new ConcurrentHashMap<>();

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        JsonNode json = mapper.readTree(message.getPayload());
        String type = json.path("type").asText();

        switch (type) {
            case "hello" -> {                       // ESP32 registers itself
                String id = json.path("robotId").asText();
                session.getAttributes().put("robotId", id);
                robots.put(id, session);
                log.info("Robot connected: {}", id);
            }
            case "status" -> {                      // ack / done / error from ESP32
                String id = (String) session.getAttributes().get("robotId");
                lastStatus.put(id, json);
                log.info("[{}] {}", id, json);
            }
            default -> log.warn("Unknown message: {}", message.getPayload());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Object id = session.getAttributes().get("robotId");
        if (id != null) { robots.remove(id.toString(), session); log.info("Robot disconnected: {}", id); }
    }

    public boolean send(String robotId, Object command) throws IOException {
        WebSocketSession s = robots.get(robotId);
        if (s == null || !s.isOpen()) return false;
        String payload = mapper.writeValueAsString(command);
        synchronized (s) { s.sendMessage(new TextMessage(payload)); }  // sessions aren't thread-safe
        return true;
    }

    public Set<String> connectedRobots() { return robots.keySet(); }
    public JsonNode status(String id) { return lastStatus.get(id); }
}
