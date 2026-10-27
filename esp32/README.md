# Palletron ESP32 Multi-Robot Firmware Guide (R1 & R2)

This directory contains the production firmware for **Robot 1 (R1)** and **Robot 2 (R2)** designed to synchronize physical ESP32 robots with the **Palletron Simulation & Graph Path Planner**.

---

## 📁 Firmware Directory Structure

```text
esp32/
├── robot_r1/
│   └── robot_r1.ino             <-- Robot 1 (Uses WebSocketsClient + ArduinoJson)
├── robot_r2/
│   └── robot_r2.ino             <-- Robot 2 (Uses WebSocketsClient + ArduinoJson)
├── robot_r1_standalone/
│   └── robot_r1_standalone.ino  <-- Robot 1 (Zero external libraries, stock WiFi.h only)
├── robot_r2_standalone/
│   └── robot_r2_standalone.ino  <-- Robot 2 (Zero external libraries, stock WiFi.h only)
└── test_robots.ps1              <-- Quick test script for R1 & R2 via Spring Boot API
```

---

## ⚡ Hardware Pinout (ESP32 DevKit V1)

Both Robot 1 and Robot 2 use the identical safe pinout:

| Component | Pin Function | ESP32 GPIO | Description / Notes |
|---|---|---|---|
| **Left Motor (ENA)** | PWM Speed | **GPIO 14** | 0-255 Speed control via LEDC PWM |
| **Left Motor (IN1)** | Direction A | **GPIO 27** | Forward: HIGH, Reverse: LOW |
| **Left Motor (IN2)** | Direction B | **GPIO 26** | Forward: LOW, Reverse: HIGH |
| **Right Motor (ENB)** | PWM Speed | **GPIO 13** | 0-255 Speed control via LEDC PWM |
| **Right Motor (IN3)** | Direction A | **GPIO 25** | Forward: HIGH, Reverse: LOW |
| **Right Motor (IN4)** | Direction B | **GPIO 33** | Forward: LOW, Reverse: HIGH |
| **HC-SR04 Ultrasonic**| TRIG | **GPIO 4** | 10µs trigger pulse |
| **HC-SR04 Ultrasonic**| ECHO | **GPIO 35** | Echo pulse (Input-only safe pin) |
| **Status LED** | Onboard LED | **GPIO 2** | Blinks on Wi-Fi search, solid on WS connect |
| **RFID MFRC522 (VSPI)** | SCK / MISO / MOSI | **18 / 19 / 23** | Optional RFID Node reader |
| **RFID MFRC522 (VSPI)** | SS (SDA) / RST | **5 / 22** | Enabled when `#define ENABLE_RFID 1` |

> [!NOTE]
> Connect common **GND** between the ESP32 and your motor driver battery pack!

---

## ⚙️ Calibration Guide (Matching Simulation Physics)

To ensure your physical robots cover the exact distance and angle calculated by the Palletron path planner:

1. **Distance Calibration (`CALIB_MS_PER_CM`)**:
   - Default is `40.0` ms per cm (i.e., travelling 50 cm takes 2000 ms at cruise PWM).
   - If your robot travels **too far**, decrease `CALIB_MS_PER_CM` (e.g. to `35.0`).
   - If your robot stops **too short**, increase `CALIB_MS_PER_CM` (e.g. to `45.0`).

2. **Turn Calibration (`CALIB_MS_PER_DEG`)**:
   - Default is `5.5` ms per degree (i.e., a 90° turn takes ~495 ms).
   - If your robot turns **more than 90°**, decrease `CALIB_MS_PER_DEG` (e.g. to `5.0`).
   - If your robot turns **less than 90°**, increase `CALIB_MS_PER_DEG` (e.g. to `6.0`).

3. **Trapezoidal Kinematic Ramp**:
   - The firmware ramps speed up for the first 25% of transit, cruises for 50%, and decelerates smoothly for the final 25%, preventing wheel slip and replicating the simulation's velocity profiles!

---

## 🌐 WebSocket & Spring Boot Protocol

When the ESP32 boots up:
1. Connects to Wi-Fi (`ssid`, `password`).
2. Opens WebSocket connection to `ws://<server_ip>:8080/ws/robot`.
3. Sends registration handshake:
   ```json
   {"type": "hello", "robotId": "R1"}
   ```
4. Listens for commands from `RobotController`:
   - Forward: `{"type": "move", "action": "forward", "value": 150.0, "cmdId": "..."}`
   - Turn Left: `{"type": "move", "action": "left", "value": 90.0, "cmdId": "..."}`
   - Turn Right: `{"type": "move", "action": "right", "value": 90.0, "cmdId": "..."}`
   - Stop / Standoff Hold: `{"type": "stop", "cmdId": "..."}`
   - Config: `{"type": "config", "speed": 25.0, "acceleration": 25.0, "deceleration": 25.0, "cmdId": "..."}`
5. Acknowledges completion back to backend:
   ```json
   {"type": "status", "robotId": "R1", "action": "forward", "state": "done", "cmdId": "..."}
   ```
6. Real-time safety obstacle alert (Ultrasonic):
   ```json
   {"type": "status", "robotId": "R1", "action": "forward", "state": "obstacle", "distance": 11.4}
   ```

---

## 🚀 How to Flash & Run

1. Open **Arduino IDE**.
2. Select Board: **ESP32 Dev Module**.
3. For **Robot 1**: Open `esp32/robot_r1/robot_r1.ino`.
   - Update `ssid`, `password`, and `server_ip` (your computer's IPv4 address).
   - Click **Upload**.
4. For **Robot 2**: Open `esp32/robot_r2/robot_r2.ino`.
   - Update `ssid`, `password`, and `server_ip`.
   - Click **Upload**.
5. Start Spring Boot (`mvn spring-boot:run` or via IDE).
6. Both robots will show up in `http://localhost:8080/api/robots` as `["R1", "R2"]`!
