/*
 * =====================================================================================
 *                       PALLETRON MOTOR HARDWARE DIAGNOSTIC TEST
 * =====================================================================================
 * Flash this sketch to your ESP32 to immediately diagnose which motor/pin is not working.
 * It tests Left and Right motors independently and prints diagnostic info to Serial Monitor.
 *
 * Open Serial Monitor at 115200 baud after uploading.
 * =====================================================================================
 */

#include <Arduino.h>

// --- PIN ASSIGNMENTS TO TEST ---
// Left Motor
#define PIN_L_IN1   27
#define PIN_L_IN2   26
#define PIN_L_PWM   14  // ENA (or leave 5V jumper on L298N)

// Right Motor (Primary candidate)
#define PIN_R_IN3   25
#define PIN_R_IN4   33  // If your wire is on 32 instead of 33, change this!
#define PIN_R_PWM   13  // ENB (or leave 5V jumper on L298N)

void stopAll() {
  digitalWrite(PIN_L_IN1, LOW);
  digitalWrite(PIN_L_IN2, LOW);
  digitalWrite(PIN_L_PWM, LOW);

  digitalWrite(PIN_R_IN3, LOW);
  digitalWrite(PIN_R_IN4, LOW);
  digitalWrite(PIN_R_PWM, LOW);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("     PALLETRON MOTOR HARDWARE DIAGNOSTIC TEST     ");
  Serial.println("==================================================");
  Serial.printf("Configured Pins:\n");
  Serial.printf("  LEFT  Motor -> IN1: GPIO %d, IN2: GPIO %d, ENA: GPIO %d\n", PIN_L_IN1, PIN_L_IN2, PIN_L_PWM);
  Serial.printf("  RIGHT Motor -> IN3: GPIO %d, IN4: GPIO %d, ENB: GPIO %d\n", PIN_R_IN3, PIN_R_IN4, PIN_R_PWM);
  Serial.println("--------------------------------------------------");
  Serial.println("IMPORTANT L298N TIP:");
  Serial.println("If your L298N motor driver has black jumper caps on");
  Serial.println("ENA and ENB, leave them ON (tied to 5V). You only need");
  Serial.println("IN1, IN2, IN3, IN4 connected to the ESP32!");
  Serial.println("==================================================\n");

  pinMode(PIN_L_IN1, OUTPUT);
  pinMode(PIN_L_IN2, OUTPUT);
  pinMode(PIN_L_PWM, OUTPUT);

  pinMode(PIN_R_IN3, OUTPUT);
  pinMode(PIN_R_IN4, OUTPUT);
  pinMode(PIN_R_PWM, OUTPUT);

  // Set ENA and ENB HIGH (100% full digital power)
  digitalWrite(PIN_L_PWM, HIGH);
  digitalWrite(PIN_R_PWM, HIGH);

  stopAll();
}

void loop() {
  // TEST 1: LEFT MOTOR ONLY
  Serial.println("\n>>> [TEST 1] Running LEFT motor ONLY for 3 seconds...");
  Serial.printf("    Setting IN1 (GPIO %d) = HIGH, IN2 (GPIO %d) = LOW, ENA = HIGH\n", PIN_L_IN1, PIN_L_IN2);
  digitalWrite(PIN_L_PWM, HIGH);
  digitalWrite(PIN_L_IN1, HIGH);
  digitalWrite(PIN_L_IN2, LOW);
  delay(3000);
  stopAll();
  Serial.println("    LEFT motor stopped.");
  delay(1500);

  // TEST 2: RIGHT MOTOR ONLY (FORWARD DIRECTION)
  Serial.println("\n>>> [TEST 2] Running RIGHT motor ONLY (Forward) for 3 seconds...");
  Serial.printf("    Setting IN3 (GPIO %d) = HIGH, IN4 (GPIO %d) = LOW, ENB = HIGH\n", PIN_R_IN3, PIN_R_IN4);
  digitalWrite(PIN_R_PWM, HIGH);
  digitalWrite(PIN_R_IN3, HIGH);
  digitalWrite(PIN_R_IN4, LOW);
  delay(3000);
  stopAll();
  Serial.println("    RIGHT motor stopped.");
  delay(1500);

  // TEST 3: RIGHT MOTOR ONLY (REVERSE DIRECTION)
  Serial.println("\n>>> [TEST 3] Running RIGHT motor ONLY (Reverse) for 3 seconds...");
  Serial.printf("    Setting IN3 (GPIO %d) = LOW, IN4 (GPIO %d) = HIGH, ENB = HIGH\n", PIN_R_IN3, PIN_R_IN4);
  digitalWrite(PIN_R_PWM, HIGH);
  digitalWrite(PIN_R_IN3, LOW);
  digitalWrite(PIN_R_IN4, HIGH);
  delay(3000);
  stopAll();
  Serial.println("    RIGHT motor stopped.");
  delay(1500);

  // TEST 4: BOTH MOTORS FORWARD TOGETHER
  Serial.println("\n>>> [TEST 4] Running BOTH motors Forward for 3 seconds...");
  digitalWrite(PIN_L_PWM, HIGH);
  digitalWrite(PIN_R_PWM, HIGH);
  digitalWrite(PIN_L_IN1, HIGH);
  digitalWrite(PIN_L_IN2, LOW);
  digitalWrite(PIN_R_IN3, HIGH);
  digitalWrite(PIN_R_IN4, LOW);
  delay(3000);
  stopAll();
  Serial.println("    Both motors stopped.");
  delay(3000);
}
