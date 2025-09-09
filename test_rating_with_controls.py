#!/usr/bin/env python3
"""
Test rating engine with parsed controls to verify EDR penalty removal
"""
import yaml
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP

# Load control modifiers directly
CFG_DIR = Path("rating_engine/config")
with open(CFG_DIR / "control_modifiers.yml") as f:
    CTRL_MODS = yaml.safe_load(f)

print("Control modifiers from config:")
for ctrl, mod in CTRL_MODS.items():
    print(f"  {ctrl}: {mod:+.0%}")

# Test scenarios
print("\n" + "="*50)
print("TESTING RATING ENGINE CONTROLS LOGIC")
print("="*50)

# Scenario 1: No controls (current state)
controls_empty = []
print(f"\nScenario 1 - Controls: {controls_empty}")
applied_modifiers = []
for ctrl_slug, mod in CTRL_MODS.items():
    if ctrl_slug.startswith("No_"):
        positive_slug = ctrl_slug[3:]
        if positive_slug not in controls_empty:
            applied_modifiers.append({"control": ctrl_slug, "modifier": mod, "reason": f"Missing {positive_slug}"})
    elif ctrl_slug in controls_empty:
        applied_modifiers.append({"control": ctrl_slug, "modifier": mod, "reason": f"Has {ctrl_slug}"})

print("Applied modifiers:")
for mod in applied_modifiers:
    print(f"  • {mod['reason']}: {mod['modifier']:+.1%}")

# Scenario 2: With parsed controls
controls_parsed = ["MFA", "EDR"]
print(f"\nScenario 2 - Controls: {controls_parsed}")
applied_modifiers = []
for ctrl_slug, mod in CTRL_MODS.items():
    if ctrl_slug.startswith("No_"):
        positive_slug = ctrl_slug[3:]
        if positive_slug not in controls_parsed:
            applied_modifiers.append({"control": ctrl_slug, "modifier": mod, "reason": f"Missing {positive_slug}"})
    elif ctrl_slug in controls_parsed:
        applied_modifiers.append({"control": ctrl_slug, "modifier": mod, "reason": f"Has {ctrl_slug}"})

print("Applied modifiers:")
for mod in applied_modifiers:
    print(f"  • {mod['reason']}: {mod['modifier']:+.1%}")

# Calculate difference
total_mod_empty = sum(m['modifier'] for m in applied_modifiers if controls_empty == [])
total_mod_parsed = sum(m['modifier'] for m in applied_modifiers if controls_parsed == ["MFA", "EDR"])

# Let's recalculate this properly
print(f"\n" + "="*30)
print("MODIFIER CALCULATION")
print("="*30)

# Empty controls
total_empty = 0
print("Empty controls:")
for ctrl_slug, mod in CTRL_MODS.items():
    if ctrl_slug.startswith("No_"):
        positive_slug = ctrl_slug[3:]
        if positive_slug not in []:  # empty controls
            print(f"  {ctrl_slug}: +{mod:.1%} (Missing {positive_slug})")
            total_empty += mod

# Parsed controls  
total_parsed = 0
print(f"\nParsed controls {controls_parsed}:")
for ctrl_slug, mod in CTRL_MODS.items():
    if ctrl_slug.startswith("No_"):
        positive_slug = ctrl_slug[3:]
        if positive_slug not in controls_parsed:
            print(f"  {ctrl_slug}: +{mod:.1%} (Missing {positive_slug})")
            total_parsed += mod
    elif ctrl_slug in controls_parsed:
        print(f"  {ctrl_slug}: {mod:+.1%} (Has {ctrl_slug})")
        total_parsed += mod

print(f"\nTotal modifier - Empty controls: {total_empty:+.1%}")
print(f"Total modifier - Parsed controls: {total_parsed:+.1%}")
print(f"Improvement: {total_empty - total_parsed:+.1%}")