package com.palletron.graph.config;

import com.palletron.graph.websocket.RobotWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final RobotWebSocketHandler handler;

    public WebSocketConfig(RobotWebSocketHandler handler) { this.handler = handler; }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // ESP32 connects to ws://<server-ip>:8080/ws/robot
        registry.addHandler(handler, "/ws/robot").setAllowedOrigins("*");
    }
}
