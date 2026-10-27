/*
 * =====================================================================================
 *                           PALLETRON WAREHOUSE NAVIGATION SYSTEM
 *                           ESP32 FIRMWARE - ROBOT 1 (R1)
 * =====================================================================================
 * Architecture:
 * - Real-time WebSocket connection to Spring Boot backend (ws://<server_ip>:8080/ws/robot)
 * - Self-registration handshake with robotId: "R1"
 * - Full kinematic motion execution (Trapezoidal ramp for Forward, Left, Right, Stop)
 * - Simulation 3/4th Advance & Standoff compatible
 * - Real-time ultrasonic collision avoidance (HC-SR04) with obstacle alerts
 * - Optional RFID (MFRC522) warehouse node localization
 * - Non-blocking state machine loop (never blocks WebSocket ping/pong or safety stops)
 * - Compatible with ESP32 Arduino Core 2.x and 3.x, and ArduinoJson v6 and v7
 * =====================================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// =====================================================================================
// 1. CONFIGURATION & CREDENTIALS
// =====================================================================================

// --- Robot Identity ---
const char* robotId = "R1";  // Robot 1 Identifier

// --- Wi-Fi Credentials ---
const char* ssid     = "don't byte";      // Your Wi-Fi SSID
const char* password = "immortal";        // Replace with your Wi-Fi Password

// --- Server Configuration ---
const char* server_ip   = "10.153.1.71";   // Your PC's Local IP running Spring Boot
const int   server_port = 8080;            // Backend port
const char* ws_path     = "/ws/robot";    // WebSocket path

// =====================================================================================
// 2. HARDWARE PIN DEFINITIONS (ESP32 DevKit V1)
// =====================================================================================

// --- Left Motor (L298N / TB6612FNG Driver) ---
#define PIN_MOTOR_L_PWM  14   // ENA (PWM Speed Control)
#define PIN_MOTOR_L_IN1  27   // IN1 (Direction)
#define PIN_MOTOR_L_IN2  26   // IN2 (Direction)

// --- Right Motor (L298N / TB6612FNG Driver) ---
#define PIN_MOTOR_R_PWM  13   // ENB (PWM Speed Control)
#define PIN_MOTOR_R_IN3  25   // IN3 (Direction)
#define PIN_MOTOR_R_IN4  33   // IN4 (Direction)

// --- Ultrasonic Sensor (HC-SR04) ---
#define PIN_TRIG          4   // Ultrasonic Trigger Pin
#define PIN_ECHO         35   // Ultrasonic Echo Pin (Input only)

// --- Built-in Status LED ---
#define PIN_STATUS_LED    2   // Blinks on Wi-Fi connect, solid during motion

// --- Optional RFID Reader (MFRC522 SPI) ---
// Set ENABLE_RFID to 1 if you have MFRC522 wired to VSPI pins (SCK:18, MISO:19, MOSI:23, SS:5, RST:22)
#define ENABLE_RFID       0

#if ENABLE_RFID
  #include <SPI.h>
  #include <MFRC522.h>
  #define PIN_RFID_SS     5
  #define PIN_RFID_RST   22
  MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
#endif

// =====================================================================================
// 3. MOTION & KINEMATICS CALIBRATION
// =====================================================================================

// Robot physical parameters (Adjust these according to your physical robot chassis)
const double DEFAULT_SPEED_CM_S    = 25.0; // Default cruise speed in cm/s
const double DEFAULT_ACCEL_CM_S2   = 25.0; // Default acceleration in cm/s^2
const double DEFAULT_DECEL_CM_S2   = 25.0; // Default deceleration in cm/s^2

// Calibration factors (Fine-tune these by timing a 50cm drive and 360° turn):
// Time in milliseconds to travel 1 centimeter at 100% PWM
const double CALIB_MS_PER_CM       = 40.0; // e.g. 100cm takes 4000ms -> 40ms/cm
// Time in milliseconds to rotate 1 degree during in-place pivot turn
const double CALIB_MS_PER_DEG      = 5.5;  // e.g. 90° turn takes ~495ms -> 5.5ms/deg

// PWM bounds (8-bit: 0 - 255)
const int PWM_MIN_START            = 95;   // Minimum PWM to overcome friction
const int PWM_MAX_CRUISE           = 220;  // Maximum PWM cruise speed
const int PWM_TURN_SPEED           = 160;  // PWM speed during rotation

// Safety distance threshold in centimeters
const float SAFETY_DISTANCE_CM     = 15.0; // Stop immediately if obstacle closer than 15cm

// =====================================================================================
// 4. PWM CORE COMPATIBILITY (ESP32 Core 2.x & 3.x)
// =====================================================================================
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

// =====================================================================================
// 5. GLOBAL STATE & DATA STRUCTURES
// =====================================================================================
WebSocketsClient webSocket;

enum RobotState {
  STATE_IDLE,
  STATE_MOVING_FORWARD,
  STATE_TURNING_LEFT,
  STATE_TURNING_RIGHT,
  STATE_OBSTACLE_HALTED
};

RobotState currentState = STATE_IDLE;
RobotState preObstacleState = STATE_IDLE;

// Current Active Command
String currentAction   = "";
String currentCmdId    = "";
unsigned long motionStartTime   = 0;
unsigned long motionTotalDuration = 0;
unsigned long motionPausedTime  = 0;
unsigned long motionElapsedBeforeHalt = 0;

// Configurable kinematic parameters
double cruiseSpeedCmPerSec = DEFAULT_SPEED_CM_S;
double accelCmPerSec2      = DEFAULT_ACCEL_CM_S2;
double decelCmPerSec2      = DEFAULT_DECEL_CM_S2;

// Obstacle detection timing
unsigned long lastSonarCheck = 0;
const unsigned long SONAR_INTERVAL_MS = 60; // Check sonar every 60ms during forward movement
bool obstacleReported = false;

// =====================================================================================
// 6. HARDWARE MOTOR CONTROL FUNCTIONS
// =====================================================================================

void stopMotors() {
  digitalWrite(PIN_MOTOR_L_IN1, LOW);
  digitalWrite(PIN_MOTOR_L_IN2, LOW);
  digitalWrite(PIN_MOTOR_R_IN3, LOW);
  digitalWrite(PIN_MOTOR_R_IN4, LOW);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, 0);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, 0);
}

void setMotorsForward(int pwmLeft, int pwmRight) {
  digitalWrite(PIN_MOTOR_L_IN1, HIGH);
  digitalWrite(PIN_MOTOR_L_IN2, LOW);
  digitalWrite(PIN_MOTOR_R_IN3, HIGH);
  digitalWrite(PIN_MOTOR_R_IN4, LOW);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, constrain(pwmLeft, 0, 255));
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, constrain(pwmRight, 0, 255));
}

void setMotorsPivotLeft(int pwm) {
  // Left motor BACKWARD, Right motor FORWARD (In-place counter-clockwise rotation)
  digitalWrite(PIN_MOTOR_L_IN1, LOW);
  digitalWrite(PIN_MOTOR_L_IN2, HIGH);
  digitalWrite(PIN_MOTOR_R_IN3, HIGH);
  digitalWrite(PIN_MOTOR_R_IN4, LOW);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, pwm);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, pwm);
}

void setMotorsPivotRight(int pwm) {
  // Left motor FORWARD, Right motor BACKWARD (In-place clockwise rotation)
  digitalWrite(PIN_MOTOR_L_IN1, HIGH);
  digitalWrite(PIN_MOTOR_L_IN2, LOW);
  digitalWrite(PIN_MOTOR_R_IN3, LOW);
  digitalWrite(PIN_MOTOR_R_IN4, HIGH);
  writePwmDuty(PIN_MOTOR_L_PWM, PWM_CH_LEFT, pwm);
  writePwmDuty(PIN_MOTOR_R_PWM, PWM_CH_RIGHT, pwm);
}

// =====================================================================================
// 7. SENSORS: ULTRASONIC & RFID
// =====================================================================================

float readUltrasonicDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duration = pulseIn(PIN_ECHO, HIGH, 25000); // 25ms timeout (~4.3m max distance)
  if (duration <= 0) return 999.0;                // No echo received, path clear
  return (float)(duration * 0.0343) / 2.0;        // Convert echo time to cm
}

void checkRfidCheckpoint() {
#if ENABLE_RFID
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uidStr = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uidStr += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
    uidStr += String(rfid.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();
  Serial.printf("[RFID] Node Tag Scanned: %s\n", uidStr.c_str());

  // Send node checkpoint notification to Palletron server
  #if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
  #else
    StaticJsonDocument<256> doc;
  #endif
  doc["type"]    = "status";
  doc["robotId"] = robotId;
  doc["state"]   = "node_reached";
  doc["tag"]     = uidStr;

  String jsonOut;
  serializeJson(doc, jsonOut);
  webSocket.sendTXT(jsonOut);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
#endif
}

// =====================================================================================
// 8. WEBSOCKET MESSAGING & HANDSHAKE
// =====================================================================================

void sendStatusDone(const String& action, const String& cmdId) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<256> doc;
#endif
  doc["type"]    = "status";
  doc["robotId"] = robotId;
  doc["action"]  = action;
  doc["state"]   = "done";
  if (cmdId.length() > 0) doc["cmdId"] = cmdId;

  String jsonOut;
  serializeJson(doc, jsonOut);
  webSocket.sendTXT(jsonOut);
  Serial.printf("[WS] Ack sent: %s\n", jsonOut.c_str());
}

void sendObstacleAlert(float distCm) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<256> doc;
#endif
  doc["type"]     = "status";
  doc["robotId"]  = robotId;
  doc["action"]   = currentAction;
  doc["state"]    = "obstacle";
  doc["distance"] = distCm;
  if (currentCmdId.length() > 0) doc["cmdId"] = currentCmdId;

  String jsonOut;
  serializeJson(doc, jsonOut);
  webSocket.sendTXT(jsonOut);
  Serial.printf("[SAFETY] Obstacle alert dispatched to backend: %.1f cm\n", distCm);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from Palletron backend! Halting motors for safety.");
      stopMotors();
      currentState = STATE_IDLE;
      digitalWrite(PIN_STATUS_LED, LOW);
      break;

    case WStype_CONNECTED: {
      Serial.println("[WS] Connected to Palletron server!");
      digitalWrite(PIN_STATUS_LED, HIGH);

      // Send initial registration handshake
      #if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument doc;
      #else
        StaticJsonDocument<128> doc;
      #endif
      doc["type"]    = "hello";
      doc["robotId"] = robotId;

      String jsonOut;
      serializeJson(doc, jsonOut);
      webSocket.sendTXT(jsonOut);
      Serial.printf("[WS] Registered successfully: %s\n", jsonOut.c_str());
      break;
    }

    case WStype_TEXT: {
      Serial.printf("[WS] Received: %s\n", payload);

      #if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument doc;
      #else
        DynamicJsonDocument doc(1024);
      #endif
      DeserializationError err = deserializeJson(doc, payload);
      if (err) {
        Serial.printf("[WS] JSON Deserialization failed: %s\n", err.c_str());
        return;
      }

      String cmdType = doc["type"] | "";
      String action  = doc["action"] | "";
      double value   = doc["value"] | 0.0;
      const char* idStr = doc["cmdId"] | "";
      String cmdId   = String(idStr);

      if (cmdType == "config") {
        double spd = doc["speed"] | 0.0;
        double acc = doc["acceleration"] | 0.0;
        double dec = doc["deceleration"] | 0.0;
        if (spd > 0) cruiseSpeedCmPerSec = spd;
        if (acc > 0) accelCmPerSec2 = acc;
        if (dec > 0) decelCmPerSec2 = dec;
        Serial.printf(">>> [CONFIG] Speed=%.1f cm/s, Accel=%.1f, Decel=%.1f\n",
                      cruiseSpeedCmPerSec, accelCmPerSec2, decelCmPerSec2);
        sendStatusDone("config", cmdId);
        return;
      }

      if (cmdType == "stop") {
        Serial.println(">>> [CMD] Emergency / Commanded STOP");
        stopMotors();
        currentState = STATE_IDLE;
        currentAction = "";
        sendStatusDone("stop", cmdId);
        return;
      }

      if (cmdType == "move") {
        currentAction = action;
        currentCmdId  = cmdId;
        motionStartTime = millis();
        motionElapsedBeforeHalt = 0;
        obstacleReported = false;

        if (action == "forward") {
          // If value is in mm (e.g. > 200 mm), convert if needed, or assume cm
          double distanceCm = value;
          if (distanceCm > 500) {
            // Value received was in millimeters from RobotController
            distanceCm = value / 10.0;
          }
          if (distanceCm <= 0) distanceCm = 10.0;

          // Compute duration based on distance and calibrated speed
          motionTotalDuration = (unsigned long)(distanceCm * CALIB_MS_PER_CM);
          currentState = STATE_MOVING_FORWARD;
          Serial.printf(">>> [MOVE] Forward %.1f cm (Target duration: %lu ms)\n",
                        distanceCm, motionTotalDuration);

        } else if (action == "left") {
          double angleDeg = value > 0 ? value : 90.0;
          motionTotalDuration = (unsigned long)(angleDeg * CALIB_MS_PER_DEG);
          currentState = STATE_TURNING_LEFT;
          setMotorsPivotLeft(PWM_TURN_SPEED);
          Serial.printf(">>> [MOVE] Pivot LEFT %.1f deg (Duration: %lu ms)\n",
                        angleDeg, motionTotalDuration);

        } else if (action == "right") {
          double angleDeg = value > 0 ? value : 90.0;
          motionTotalDuration = (unsigned long)(angleDeg * CALIB_MS_PER_DEG);
          currentState = STATE_TURNING_RIGHT;
          setMotorsPivotRight(PWM_TURN_SPEED);
          Serial.printf(">>> [MOVE] Pivot RIGHT %.1f deg (Duration: %lu ms)\n",
                        angleDeg, motionTotalDuration);
        }
      }
      break;
    }

    default:
      break;
  }
}

// =====================================================================================
// 9. NON-BLOCKING MOTION STATE MACHINE
// =====================================================================================

void updateMotionStateMachine() {
  if (currentState == STATE_IDLE) {
    return;
  }

  // --- OBSTACLE HALTED STATE: Auto-recover when obstacle is removed ---
  if (currentState == STATE_OBSTACLE_HALTED) {
    if (millis() - lastSonarCheck >= 150) {
      lastSonarCheck = millis();
      float dist = readUltrasonicDistanceCm();
      if (dist > SAFETY_DISTANCE_CM + 5.0) { // Hysteresis buffer
        Serial.printf("[SAFETY] Obstacle cleared (%.1f cm). Resuming motion...\n", dist);
        // Resume remaining movement
        motionStartTime = millis();
        currentState = preObstacleState;
        obstacleReported = false;
      }
    }
    return;
  }

  // --- ACTIVE MOVING FORWARD WITH TRAPEZOIDAL SPEED RAMP ---
  if (currentState == STATE_MOVING_FORWARD) {
    // 1. Ultrasonic safety check
    if (millis() - lastSonarCheck >= SONAR_INTERVAL_MS) {
      lastSonarCheck = millis();
      float dist = readUltrasonicDistanceCm();
      if (dist > 0 && dist <= SAFETY_DISTANCE_CM) {
        Serial.printf("[SAFETY] Obstacle detected at %.1f cm! Holding robot...\n", dist);
        stopMotors();
        preObstacleState = currentState;
        currentState = STATE_OBSTACLE_HALTED;
        motionElapsedBeforeHalt += (millis() - motionStartTime);
        if (!obstacleReported) {
          sendObstacleAlert(dist);
          obstacleReported = true;
        }
        return;
      }
    }

    // 2. Kinematic velocity ramp calculation
    unsigned long elapsed = motionElapsedBeforeHalt + (millis() - motionStartTime);
    if (elapsed >= motionTotalDuration) {
      // Completed distance!
      stopMotors();
      currentState = STATE_IDLE;
      Serial.println(">>> [DONE] Forward motion completed!");
      sendStatusDone("forward", currentCmdId);
      return;
    }

    // Calculate trapezoidal PWM profile:
    // Ramp up in first 25% of duration, cruise in middle 50%, ramp down in final 25%
    unsigned long rampTime = motionTotalDuration * 0.25;
    if (rampTime < 100) rampTime = 100;
    int targetPwm = PWM_MAX_CRUISE;

    if (elapsed < rampTime) {
      // Acceleration phase
      float factor = (float)elapsed / (float)rampTime;
      targetPwm = PWM_MIN_START + (int)(factor * (PWM_MAX_CRUISE - PWM_MIN_START));
    } else if (elapsed > (motionTotalDuration - rampTime)) {
      // Deceleration phase
      unsigned long rem = motionTotalDuration - elapsed;
      float factor = (float)rem / (float)rampTime;
      targetPwm = PWM_MIN_START + (int)(factor * (PWM_MAX_CRUISE - PWM_MIN_START));
    }

    setMotorsForward(targetPwm, targetPwm);
    return;
  }

  // --- ACTIVE TURNING (LEFT OR RIGHT) ---
  if (currentState == STATE_TURNING_LEFT || currentState == STATE_TURNING_RIGHT) {
    unsigned long elapsed = millis() - motionStartTime;
    if (elapsed >= motionTotalDuration) {
      stopMotors();
      String finishedAction = (currentState == STATE_TURNING_LEFT) ? "left" : "right";
      currentState = STATE_IDLE;
      Serial.printf(">>> [DONE] %s turn completed!\n", finishedAction.c_str());
      sendStatusDone(finishedAction, currentCmdId);
      return;
    }
  }
}

// =====================================================================================
// 10. ARDUINO SETUP & MAIN LOOP
// =====================================================================================

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==========================================");
  Serial.printf("   PALLETRON ROBOT 1 (R1) BOOTING UP\n");
  Serial.println("==========================================");

  // Status LED
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Motor direction pins
  pinMode(PIN_MOTOR_L_IN1, OUTPUT);
  pinMode(PIN_MOTOR_L_IN2, OUTPUT);
  pinMode(PIN_MOTOR_R_IN3, OUTPUT);
  pinMode(PIN_MOTOR_R_IN4, OUTPUT);

  // Motor PWM pins
  initPwmPin(PIN_MOTOR_L_PWM, PWM_CH_LEFT);
  initPwmPin(PIN_MOTOR_R_PWM, PWM_CH_RIGHT);
  stopMotors();

  // Ultrasonic sensor pins
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

#if ENABLE_RFID
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("[HARDWARE] MFRC522 RFID Reader initialized on VSPI.");
#endif

  // Connect to Wi-Fi
  Serial.printf("[WIFI] Connecting to SSID: %s\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED)); // Blink while connecting
    Serial.print(".");
  }
  digitalWrite(PIN_STATUS_LED, HIGH);
  Serial.printf("\n[WIFI] Connected! Assigned IP: %s\n", WiFi.localIP().toString().c_str());

  // Connect to Spring Boot WebSocket Server
  Serial.printf("[WS] Connecting to ws://%s:%d%s\n", server_ip, server_port, ws_path);
  webSocket.begin(server_ip, server_port, ws_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(2500); // Attempt reconnection every 2.5s if disconnected
}

void loop() {
  webSocket.loop();              // Maintain WebSocket framing & ping-pong
  updateMotionStateMachine();    // Non-blocking motion ramp & safety monitoring

#if ENABLE_RFID
  static unsigned long lastRfidScan = 0;
  if (millis() - lastRfidScan >= 200) {
    lastRfidScan = millis();
    checkRfidCheckpoint();
  }
#endif
}
