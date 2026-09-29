#include <WiFi.h>

// --- Wi-Fi Credentials ---
const char* ssid     = "JioFi5_50F0B3";
const char* password = "immortal";

// --- Server Configuration ---
const char* server_ip   = "10.67.14.71"; // Your PC's local IP
const int   server_port = 8080;
const char* ws_path     = "/ws/robot";

// --- Robot Identity ---
const char* robotId = "R1";

WiFiClient client;
bool isConnected = false;
unsigned long lastConnectAttempt = 0;

void sendWsText(const String& msg) {
  if (!client.connected()) return;
  size_t len = msg.length();

  // Byte 1: FIN (0x80) | Text Opcode (0x01) = 0x81
  client.write((uint8_t)0x81);

  // Client frames MUST be masked (0x80 | length)
  uint8_t mask[4] = { 0x1A, 0x2B, 0x3C, 0x4D };

  if (len < 126) {
    client.write((uint8_t)(0x80 | len));
  } else if (len <= 65535) {
    client.write((uint8_t)(0x80 | 126));
    client.write((uint8_t)((len >> 8) & 0xFF));
    client.write((uint8_t)(len & 0xFF));
  } else {
    return; // Frame too large
  }

  client.write(mask, 4);

  // Send masked payload
  for (size_t i = 0; i < len; i++) {
    client.write((uint8_t)(msg[i] ^ mask[i % 4]));
  }
}

bool wsConnect() {
  Serial.printf("[WS] Connecting to %s:%d%s ...\n", server_ip, server_port, ws_path);
  if (!client.connect(server_ip, server_port)) {
    Serial.println("[WS] Connection failed");
    return false;
  }

  // RFC 6455 WebSocket Upgrade Handshake
  client.print("GET ");
  client.print(ws_path);
  client.print(" HTTP/1.1\r\n");
  client.print("Host: ");
  client.print(server_ip);
  client.print(":");
  client.print(server_port);
  client.print("\r\n");
  client.print("Upgrade: websocket\r\n");
  client.print("Connection: Upgrade\r\n");
  client.print("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n");
  client.print("Sec-WebSocket-Version: 13\r\n\r\n");

  unsigned long timeout = millis() + 4000;
  bool is101 = false;
  while (client.connected() && millis() < timeout) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line.indexOf("101") > 0) is101 = true;
      if (line == "\r" || line.length() == 0) break; // End of HTTP headers
    }
  }

  if (!is101) {
    Serial.println("[WS] Handshake failed (Server did not return 101)");
    client.stop();
    return false;
  }

  Serial.println("[WS] Connected to Palletron server!");
  isConnected = true;

  // Send registration hello message
  String hello = "{\"type\":\"hello\",\"robotId\":\"" + String(robotId) + "\"}";
  sendWsText(hello);
  Serial.println("[WS] Registered: " + hello);
  return true;
}

void handleCommand(const String& payload) {
  // Extract command fields simply
  if (payload.indexOf("\"action\":\"forward\"") >= 0) {
    Serial.println(">>> ACTION: Moving FORWARD");
    // TODO: Add motor forward call
  } else if (payload.indexOf("\"action\":\"left\"") >= 0) {
    Serial.println(">>> ACTION: Turning LEFT");
    // TODO: Add motor turn left call
  } else if (payload.indexOf("\"action\":\"right\"") >= 0) {
    Serial.println(">>> ACTION: Turning RIGHT");
    // TODO: Add motor turn right call
  } else if (payload.indexOf("\"type\":\"stop\"") >= 0) {
    Serial.println(">>> ACTION: STOP");
    // TODO: Add motor stop call
  } else if (payload.indexOf("\"type\":\"config\"") >= 0) {
    Serial.println(">>> CONFIG received");
  }

  // Send status acknowledgment back to backend
  String ack = "{\"type\":\"status\",\"robotId\":\"" + String(robotId) + "\",\"state\":\"done\"}";
  sendWsText(ack);
}

void readWs() {
  if (!client.available()) return;

  uint8_t b1 = client.read();
  if (!client.available()) return;
  uint8_t b2 = client.read();

  uint8_t opcode = b1 & 0x0F;
  bool isMasked = (b2 & 0x80) != 0;
  uint64_t payloadLen = b2 & 0x7F;

  if (payloadLen == 126) {
    uint8_t l1 = client.read();
    uint8_t l2 = client.read();
    payloadLen = (l1 << 8) | l2;
  }

  uint8_t mask[4] = {0};
  if (isMasked) {
    client.readBytes(mask, 4);
  }

  // Ping (0x09) -> Respond with Pong (0x0A)
  if (opcode == 0x09) {
    client.write((uint8_t)0x8A);
    client.write((uint8_t)0x80);
    client.write(mask, 4);
    return;
  }

  // Close (0x08)
  if (opcode == 0x08) {
    client.stop();
    isConnected = false;
    Serial.println("[WS] Server closed connection.");
    return;
  }

  // Text message (0x01)
  String payload = "";
  for (uint64_t i = 0; i < payloadLen; i++) {
    uint8_t c = client.read();
    if (isMasked) c ^= mask[i % 4];
    payload += (char)c;
  }

  Serial.printf("[WS] Received: %s\n", payload.c_str());
  handleCommand(payload);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.printf("\nConnecting to %s ...\n", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWi-Fi connected! ESP32 IP: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (!client.connected()) {
    isConnected = false;
    if (millis() - lastConnectAttempt > 3000) {
      lastConnectAttempt = millis();
      wsConnect();
    }
  } else {
    readWs();
  }
}
