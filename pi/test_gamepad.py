#!/usr/bin/env python3
"""Gamepad diagnostic tool — shows all button/axis/hat activity in real time.

Usage:
    python3 test_gamepad.py

Connect your USB gamepad, then press buttons and move sticks.
The script prints every input event so you can verify button mappings.
Press Ctrl+C to exit.
"""

import os
os.environ['SDL_VIDEODRIVER'] = 'dummy'  # no display needed

import pygame
import time
import sys

pygame.init()
pygame.joystick.init()

# Tiny hidden display (pygame needs one even with dummy driver)
try:
    pygame.display.set_mode((1, 1))
except Exception:
    pass

print("=" * 60)
print("  GAMEPAD DIAGNOSTIC TOOL")
print("=" * 60)
print()

count = pygame.joystick.get_count()
if count == 0:
    print("  NO GAMEPADS DETECTED!")
    print()
    print("  Plug in a USB gamepad and re-run this script.")
    print("  Run 'lsusb' to check if the OS sees the device.")
    sys.exit(1)

print(f"  Found {count} gamepad(s):")
print()

joysticks = []
for i in range(count):
    js = pygame.joystick.Joystick(i)
    js.init()
    joysticks.append(js)
    print(f"  [{i}] {js.get_name()}")
    print(f"      Axes: {js.get_numaxes()}  Buttons: {js.get_numbuttons()}  Hats: {js.get_numhats()}")
    print()

print("=" * 60)
print("  Press buttons, move sticks/dpad. Ctrl+C to quit.")
print()
print("  Current button mapping (config.py):")
print("    A/Cross  (btn 0) = Beam")
print("    B/Circle (btn 1) = Shield")
print("    X/Square (btn 2) = Mine")
print("    Y/Tri    (btn 3) = Boost")
print("    RB/R1    (btn 5) = Detonate")
print("    Start    (btn 7) = Pause")
print("=" * 60)
print()

DEADZONE = 0.3
prev_state = {}

try:
    while True:
        pygame.event.pump()

        for js_idx, js in enumerate(joysticks):
            prefix = f"[Pad {js_idx}]"

            # Axes
            for a in range(js.get_numaxes()):
                val = js.get_axis(a)
                key = f"js{js_idx}_axis{a}"
                if abs(val) > DEADZONE:
                    if key not in prev_state or abs(prev_state[key] - val) > 0.1:
                        label = ""
                        if a == 0:
                            label = " (Left Stick X)" if val != 0 else ""
                        elif a == 1:
                            label = " (Left Stick Y)"
                        elif a == 2:
                            label = " (Right Stick X)"
                        elif a == 3:
                            label = " (Right Stick Y)"
                        elif a == 4:
                            label = " (Left Trigger)"
                        elif a == 5:
                            label = " (Right Trigger)"
                        print(f"  {prefix} Axis {a}{label}: {val:+.2f}")
                        prev_state[key] = val
                else:
                    if key in prev_state:
                        del prev_state[key]

            # Buttons
            for b in range(js.get_numbuttons()):
                pressed = js.get_button(b)
                key = f"js{js_idx}_btn{b}"
                if pressed and key not in prev_state:
                    game_action = {
                        0: "Beam (A/Cross)",
                        1: "Shield (B/Circle)",
                        2: "Mine (X/Square)",
                        3: "Boost (Y/Triangle)",
                        4: "LB/L1",
                        5: "Detonate (RB/R1)",
                        6: "Back/Select",
                        7: "Pause (Start)",
                        8: "L3 (Left stick click)",
                        9: "R3 (Right stick click)",
                        10: "Guide/Home",
                    }.get(b, f"(unmapped)")
                    print(f"  {prefix} Button {b} PRESSED  -->  {game_action}")
                    prev_state[key] = True
                elif not pressed and key in prev_state:
                    del prev_state[key]

            # Hats (D-pad)
            for h in range(js.get_numhats()):
                hx, hy = js.get_hat(h)
                key = f"js{js_idx}_hat{h}"
                hat_val = (hx, hy)
                if hat_val != (0, 0):
                    if prev_state.get(key) != hat_val:
                        dirs = []
                        if hy > 0: dirs.append("UP")
                        if hy < 0: dirs.append("DOWN")
                        if hx < 0: dirs.append("LEFT")
                        if hx > 0: dirs.append("RIGHT")
                        print(f"  {prefix} D-Pad: {' + '.join(dirs)}")
                        prev_state[key] = hat_val
                else:
                    if key in prev_state:
                        del prev_state[key]

        time.sleep(0.016)  # ~60 Hz polling

except KeyboardInterrupt:
    print("\n  Done.")
    pygame.quit()
