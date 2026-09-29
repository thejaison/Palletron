#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// --- Wi-Fi Credentials ---
const char* ssid     = "JioFi5_50F0B3";
const char* password = "immortal";

// --- Server Configuration ---
const char* server_ip   = "10.67.14.71"; // Your PC's local IP
const int   server_port = 8080;
const char* ws_path     = "/ws/robot";

// --- Robot Identity ---
const char* robotId = "R1";

WebSocketsClient webSocket;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from server.");
      break;

    case WStype_CONNECTED: {
      Serial.println("[WS] Connected to Palletron server!");

      // 1. Send "hello" handshake to register as R1
      StaticJsonDocument<128> doc;
      doc["type"]    = "hello";
      doc["robotId"] = robotId;

      String jsonOut;
      serializeJson(doc, jsonOut);
      webSocket.sendTXT(jsonOut);
      Serial.println("[WS] Registered: " + jsonOut);
      break;
    }

    case WStype_TEXT: {
      Serial.printf("[WS] Received: %s\n", payload);

      // Parse incoming command from server
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, payload);
      if (err) {
        Serial.println("[WS] JSON parse error");
        return;
      }

      String cmdType = doc["type"] | "";
      String action  = doc["action"] | "";
      double value   = doc["value"] | 0.0;
      const char* cmdId = doc["cmdId"] | "";

      if (cmdType == "move") {
        if (action == "forward") {
          Serial.printf(">>> ACTION: Moving FORWARD %.2f mm\n", value);
          // TODO: Call your motor driver forward function
        } else if (action == "left") {
          Serial.printf(">>> ACTION: Turning LEFT %.2f deg\n", value);
          // TODO: Call your motor driver turn left function
        } else if (action == "right") {
          Serial.printf(">>> ACTION: Turning RIGHT %.2f deg\n", value);
          // TODO: Call your motor driver turn right function
        }
      } else if (cmdType == "stop") {
        Serial.println(">>> ACTION: STOP");
        // TODO: Call your motor driver stop function
      } else if (cmdType == "config") {
        double speed = doc["speed"] | 0.0;
        Serial.printf(">>> CONFIG: Speed set to %.2f mm/s\n", speed);
      }

      // Send status acknowledgement back to server
      StaticJsonDocument<128> ack;
      ack["type"]   = "status";
      ack["action"] = action;
      ack["state"]  = "done";
      if (strlen(cmdId) > 0) ack["cmdId"] = cmdId;

      String ackOut;
      serializeJson(ack, ackOut);
      webSocket.sendTXT(ackOut);
      break;
    }

    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Connect to Router Wi-Fi
  Serial.printf("\nConnecting to %s ...\n", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWi-Fi connected! ESP32 IP: %s\n", WiFi.localIP().toString().c_str());

  // Connect WebSocket to Spring Boot backend
  webSocket.begin(server_ip, server_port, ws_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000); // Reconnect every 3s if disconnected
}

void loop() {
  webSocket.loop();
}
