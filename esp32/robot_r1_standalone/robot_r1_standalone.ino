/*
 * =====================================================================================
 *                           PALLETRON WAREHOUSE NAVIGATION SYSTEM
 *                   ESP32 STANDALONE FIRMWARE - ROBOT 1 (R1)
 *                     (ZERO EXTERNAL LIBRARIES REQUIRED)
 * =====================================================================================
 * Features:
 * - Built-in native RFC-6455 WebSocket client using only <WiFi.h>
 * - No need to install WebSocketsClient or ArduinoJson libraries!
 * - Handshake with robotId: "R1"
 * - Full Motor Driver PWM controls (L298N / TB6612FNG) with Core 2.x/3.x compatibility
 * - Ultrasonic HC-SR04 collision avoidance & auto-resume
 * - Non-blocking execution state machine
 * =====================================================================================
 */

#include <WiFi.h>

// --- Robot Identity ---
const char* robotId = "R1";

// --- Wi-Fi Credentials ---
const char* ssid     = "JioFi5_50F0B3";
const char* password = "immortal";

// --- Server Configuration ---
const char* server_ip   = "10.153.1.71";
const int   server_port = 8080;
const char* ws_path     = "/ws/robot";

// --- Hardware Pins (ESP32 DevKit V1) ---
#define PIN_MOTOR_L_PWM  14
#define PIN_MOTOR_L_IN1  27
#define PIN_MOTOR_L_IN2  26
#define PIN_MOTOR_R_PWM  13
#define PIN_MOTOR_R_IN3  25
#define PIN_MOTOR_R_IN4  33

#define PIN_TRIG          4
#define PIN_ECHO         35
#define PIN_STATUS_LED    2

// --- Calibration ---
const double CALIB_MS_PER_CM    = 40.0; // ms per cm
const double CALIB_MS_PER_DEG   = 5.5;  // ms per degree turn
const float  SAFETY_DISTANCE_CM = 15.0; // cm

const int PWM_MIN_START         = 95;
const int PWM_MAX_CRUISE        = 220;
const int PWM_TURN_SPEED        = 160;

// --- PWM Compatibility ---
#define PWM_FREQ        1000
#define PWM_RESOLUTION  8
#define PWM_CH_LEFT     0
#define PWM_CH_RIGHT    1

void initPwmPin(uint8_t pin, uint8_t channel) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(pin, PWM_FREQ, PWM_RESOLUTION);
#else
  ledcSetup(channel, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(pin, channel);
#endif
}

void writePwmDuty(uint8_t pin, uint8_t channel, uint32_t duty) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(pin, duty);
#else
  ledcWrite(channel, duty);
#endif
}

// --- Motor Controls ---
void stopMotors() {
  digitalWrite(PIN_MOTOR_L_IN1, LOW);
  digitalWrite(PIN_MOTOR_L_IN2, LOW);
  digitalWrite(PIN_MOTOR_R_IN3, LOW);
  digitalWrite(PIN_MOTOR_R_IN4, LOW);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, 0);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, 0);
}

void setMotorsForward(int pwm) {
  digitalWrite(PIN_MOTOR_L_IN1, HIGH);
  digitalWrite(PIN_MOTOR_L_IN2, LOW);
  digitalWrite(PIN_MOTOR_R_IN3, HIGH);
  digitalWrite(PIN_MOTOR_R_IN4, LOW);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, pwm);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, pwm);
}

void setMotorsPivotLeft(int pwm) {
  digitalWrite(PIN_MOTOR_L_IN1, LOW);
  digitalWrite(PIN_MOTOR_L_IN2, HIGH);
  digitalWrite(PIN_MOTOR_R_IN3, HIGH);
  digitalWrite(PIN_MOTOR_R_IN4, LOW);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, pwm);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, pwm);
}

void setMotorsPivotRight(int pwm) {
  digitalWrite(PIN_MOTOR_L_IN1, HIGH);
  digitalWrite(PIN_MOTOR_L_IN2, LOW);
  digitalWrite(PIN_MOTOR_R_IN3, LOW);
  digitalWrite(PIN_MOTOR_R_IN4, HIGH);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, pwm);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, pwm);
}

float readUltrasonicDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long dur = pulseIn(PIN_ECHO, HIGH, 25000);
  if (dur <= 0) return 999.0;
  return (float)(dur * 0.0343) / 2.0;
}

// --- WebSocket State ---
WiFiClient client;
bool isConnected = false;
unsigned long lastConnectAttempt = 0;

enum RobotState {
  STATE_IDLE,
  STATE_MOVING_FORWARD,
  STATE_TURNING_LEFT,
  STATE_TURNING_RIGHT,
  STATE_OBSTACLE_HALTED
};

RobotState currentState = STATE_IDLE;
RobotState preObstacleState = STATE_IDLE;

String currentAction = "";
String currentCmdId = "";
unsigned long motionStartTime = 0;
unsigned long motionTotalDuration = 0;
unsigned long motionElapsedBeforeHalt = 0;
unsigned long lastSonarCheck = 0;

void sendWsText(const String& msg) {
  if (!client.connected()) return;
  size_t len = msg.length();
  client.write((uint8_t)0x81); // FIN | Text
  uint8_t mask[4] = { 0x1A, 0x2B, 0x3C, 0x4D };

  if (len < 126) {
    client.write((uint8_t)(0x80 | len));
  } else if (len <= 65535) {
    client.write((uint8_t)(0x80 | 126));
    client.write((uint8_t)((len >> 8) & 0xFF));
    client.write((uint8_t)(len & 0xFF));
  } else {
    return;
  }

  client.write(mask, 4);
  for (size_t i = 0; i < len; i++) {
    client.write((uint8_t)(msg[i] ^ mask[i % 4]));
  }
}

void sendStatusDone(const String& action, const String& cmdId) {
  String ack = "{\"type\":\"status\",\"robotId\":\"" + String(robotId) +
               "\",\"action\":\"" + action + "\",\"state\":\"done\"";
  if (cmdId.length() > 0) {
    ack += ",\"cmdId\":\"" + cmdId + "\"";
  }
  ack += "}";
  sendWsText(ack);
  Serial.printf("[WS] Ack sent: %s\n", ack.c_str());
}

void sendObstacleAlert(float distCm) {
  String alert = "{\"type\":\"status\",\"robotId\":\"" + String(robotId) +
                 "\",\"action\":\"" + currentAction +
                 "\",\"state\":\"obstacle\",\"distance\":" + String(distCm, 1);
  if (currentCmdId.length() > 0) {
    alert += ",\"cmdId\":\"" + currentCmdId + "\"";
  }
  alert += "}";
  sendWsText(alert);
  Serial.printf("[SAFETY] Obstacle alert: %s\n", alert.c_str());
}

bool wsConnect() {
  Serial.printf("[WS] Connecting to %s:%d%s ...\n", server_ip, server_port, ws_path);
  if (!client.connect(server_ip, server_port)) {
    Serial.println("[WS] Connection failed");
    return false;
  }

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
      if (line == "\r" || line.length() == 0) break;
    }
  }

  if (!is101) {
    Serial.println("[WS] Handshake failed");
    client.stop();
    return false;
  }

  Serial.println("[WS] Connected to Palletron server!");
  isConnected = true;
  digitalWrite(PIN_STATUS_LED, HIGH);

  String hello = "{\"type\":\"hello\",\"robotId\":\"" + String(robotId) + "\"}";
  sendWsText(hello);
  Serial.println("[WS] Registered: " + hello);
  return true;
}

String extractJsonField(const String& json, const String& key) {
  int idx = json.indexOf("\"" + key + "\"");
  if (idx < 0) return "";
  int colon = json.indexOf(":", idx);
  if (colon < 0) return "";
  int start = colon + 1;
  while (start < json.length() && (json[start] == ' ' || json[start] == '\"')) start++;
  int end = start;
  while (end < json.length() && json[end] != '\"' && json[end] != ',' && json[end] != '}') end++;
  return json.substring(start, end);
}

double extractJsonDouble(const String& json, const String& key) {
  String val = extractJsonField(json, key);
  return val.toDouble();
}

void handleCommand(const String& payload) {
  String cmdType = extractJsonField(payload, "type");
  String action  = extractJsonField(payload, "action");
  String cmdId   = extractJsonField(payload, "cmdId");
  double value   = extractJsonDouble(payload, "value");

  if (cmdType == "config") {
    Serial.println(">>> [CONFIG] Acknowledged");
    sendStatusDone("config", cmdId);
    return;
  }

  if (cmdType == "stop") {
    Serial.println(">>> [CMD] STOP");
    stopMotors();
    currentState = STATE_IDLE;
    sendStatusDone("stop", cmdId);
    return;
  }

  if (cmdType == "move") {
    currentAction = action;
    currentCmdId  = cmdId;
    motionStartTime = millis();
    motionElapsedBeforeHalt = 0;

    if (action == "forward") {
      double distCm = value > 500 ? (value / 10.0) : (value <= 0 ? 10.0 : value);
      motionTotalDuration = (unsigned long)(distCm * CALIB_MS_PER_CM);
      currentState = STATE_MOVING_FORWARD;
      Serial.printf(">>> [MOVE] Forward %.1f cm (%lu ms)\n", distCm, motionTotalDuration);
    } else if (action == "left") {
      double angle = value > 0 ? value : 90.0;
      motionTotalDuration = (unsigned long)(angle * CALIB_MS_PER_DEG);
      currentState = STATE_TURNING_LEFT;
      setMotorsPivotLeft(PWM_TURN_SPEED);
      Serial.printf(">>> [MOVE] Left %.1f deg (%lu ms)\n", angle, motionTotalDuration);
    } else if (action == "right") {
      double angle = value > 0 ? value : 90.0;
      motionTotalDuration = (unsigned long)(angle * CALIB_MS_PER_DEG);
      currentState = STATE_TURNING_RIGHT;
      setMotorsPivotRight(PWM_TURN_SPEED);
      Serial.printf(">>> [MOVE] Right %.1f deg (%lu ms)\n", angle, motionTotalDuration);
    }
  }
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
  if (isMasked) client.readBytes(mask, 4);

  if (opcode == 0x09) { // Ping
    client.write((uint8_t)0x8A); client.write((uint8_t)0x80); client.write(mask, 4);
    return;
  }
  if (opcode == 0x08) { // Close
    client.stop(); isConnected = false; stopMotors(); return;
  }

  String payload = "";
  for (uint64_t i = 0; i < payloadLen; i++) {
    uint8_t c = client.read();
    if (isMasked) c ^= mask[i % 4];
    payload += (char)c;
  }

  Serial.printf("[WS] Received: %s\n", payload.c_str());
  handleCommand(payload);
}

void updateMotion() {
  if (currentState == STATE_IDLE) return;

  if (currentState == STATE_OBSTACLE_HALTED) {
    if (millis() - lastSonarCheck >= 150) {
      lastSonarCheck = millis();
      float dist = readUltrasonicDistanceCm();
      if (dist > SAFETY_DISTANCE_CM + 5.0) {
        Serial.printf("[SAFETY] Obstacle cleared (%.1f cm). Resuming...\n", dist);
        motionStartTime = millis();
        currentState = preObstacleState;
      }
    }
    return;
  }

  if (currentState == STATE_MOVING_FORWARD) {
    if (millis() - lastSonarCheck >= 60) {
      lastSonarCheck = millis();
      float dist = readUltrasonicDistanceCm();
      if (dist > 0 && dist <= SAFETY_DISTANCE_CM) {
        Serial.printf("[SAFETY] Obstacle detected at %.1f cm! Holding...\n", dist);
        stopMotors();
        preObstacleState = currentState;
        currentState = STATE_OBSTACLE_HALTED;
        motionElapsedBeforeHalt += (millis() - motionStartTime);
        sendObstacleAlert(dist);
        return;
      }
    }

    unsigned long elapsed = motionElapsedBeforeHalt + (millis() - motionStartTime);
    if (elapsed >= motionTotalDuration) {
      stopMotors();
      currentState = STATE_IDLE;
      Serial.println(">>> [DONE] Forward motion completed!");
      sendStatusDone("forward", currentCmdId);
      return;
    }

    // Kinematic ramp
    unsigned long ramp = motionTotalDuration * 0.25;
    if (ramp < 100) ramp = 100;
    int pwm = PWM_MAX_CRUISE;
    if (elapsed < ramp) {
      pwm = PWM_MIN_START + (int)(((float)elapsed / ramp) * (PWM_MAX_CRUISE - PWM_MIN_START));
    } else if (elapsed > (motionTotalDuration - ramp)) {
      pwm = PWM_MIN_START + (int)(((float)(motionTotalDuration - elapsed) / ramp) * (PWM_MAX_CRUISE - PWM_MIN_START));
    }
    setMotorsForward(pwm);
    return;
  }

  if (currentState == STATE_TURNING_LEFT || currentState == STATE_TURNING_RIGHT) {
    if (millis() - motionStartTime >= motionTotalDuration) {
      stopMotors();
      String act = (currentState == STATE_TURNING_LEFT) ? "left" : "right";
      currentState = STATE_IDLE;
      Serial.printf(">>> [DONE] %s turn completed!\n", act.c_str());
      sendStatusDone(act, currentCmdId);
      return;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nPALLETRON ROBOT 1 (STANDALONE) BOOTING...");

  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_MOTOR_L_IN1, OUTPUT);
  pinMode(PIN_MOTOR_L_IN2, OUTPUT);
  pinMode(PIN_MOTOR_R_IN3, OUTPUT);
  pinMode(PIN_MOTOR_R_IN4, OUTPUT);

  initPwmPin(PIN_MOTOR_L_PWM, PWM_CH_LEFT);
  initPwmPin(PIN_MOTOR_R_PWM, PWM_CH_RIGHT);
  stopMotors();

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
    Serial.print(".");
  }
  digitalWrite(PIN_STATUS_LED, HIGH);
  Serial.printf("\nWi-Fi Connected: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (!client.connected()) {
    isConnected = false;
    digitalWrite(PIN_STATUS_LED, LOW);
    stopMotors();
    if (millis() - lastConnectAttempt > 3000) {
      lastConnectAttempt = millis();
      wsConnect();
    }
  } else {
    readWs();
  }
  updateMotion();
}
