#!/usr/bin/env python3
"""
Migration script to update all quote_name values to match generateOptionName() logic.

This syncs the stored quote_name with the computed name from tower structure.
Format:
  - Primary: "$1M x $25K"
  - Excess: "$1M xs $6M x $25K"
  - QS Excess: "$5M po $10M xs $5M x $25K"

Run: python db_setup/migrate_quote_names.py [--dry-run]
"""
import sys
import json
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from core.db import get_conn


def format_compact(value: float) -> str:
    """Format currency compactly: 1000000 -> $1M, 25000 -> $25K"""
    if not value:
        return "—"
    if value >= 1_000_000:
        m = value / 1_000_000
        return f"${int(m)}M" if m == int(m) else f"${m}M"
    if value >= 1_000:
        k = value / 1_000
        return f"${int(k)}K" if k == int(k) else f"${k}K"
    return f"${int(value)}"


def calculate_attachment(layers: list, target_idx: int) -> float:
    """
    Calculate attachment for a specific layer index.
    Handles quota share: consecutive layers with same quota_share are ONE layer.
    """
    if not layers or len(layers) == 0:
        return 0

    target_layer = layers[target_idx] if target_idx < len(layers) else None

    # Special case: if target is index 0 and it's CMAI, calculate from all non-CMAI layers
    if target_idx == 0 and target_layer and "CMAI" in (target_layer.get("carrier") or "").upper():
        attachment = 0
        for layer in layers:
            carrier = (layer.get("carrier") or "").upper()
            if "CMAI" not in carrier:
                if layer.get("quota_share"):
                    attachment += layer["quota_share"]
                else:
                    attachment += layer.get("limit") or 0
        return attachment

    if target_idx <= 0:
        return 0

    # If this layer is part of a QS group, find the first layer of the group
    effective_idx = target_idx

    if target_layer and target_layer.get("quota_share"):
        qs_full_layer = target_layer["quota_share"]
        # Walk backwards to find the start of this QS group
        while (effective_idx > 0 and
               layers[effective_idx - 1].get("quota_share") == qs_full_layer):
            effective_idx -= 1

    # Calculate attachment by summing layers below effective_idx
    attachment = 0
    i = 0

    while i < effective_idx:
        layer = layers[i]

        if layer.get("quota_share"):
            # QS layer - add full layer size once, skip consecutive same QS
            qs_full_layer = layer["quota_share"]
            attachment += qs_full_layer
            while i < effective_idx and layers[i].get("quota_share") == qs_full_layer:
                i += 1
        else:
            # Regular layer
            attachment += layer.get("limit") or 0
            i += 1

    return attachment


def generate_option_name(tower_json: list, position: str, primary_retention: float) -> str:
    """
    Generate option name from tower structure.
    Matches the JS generateOptionName() function.
    """
    tower = tower_json or []

    # Find CMAI layer
    cmai_idx = -1
    for i, layer in enumerate(tower):
        carrier = (layer.get("carrier") or "").upper()
        if "CMAI" in carrier:
            cmai_idx = i
            break

    cmai_layer = tower[cmai_idx] if cmai_idx >= 0 else (tower[0] if tower else None)

    if not cmai_layer:
        return "Option"

    limit = cmai_layer.get("limit") or 0
    limit_str = format_compact(limit)

    # Check if CMAI is in a quota share layer
    cmai_qs = cmai_layer.get("quota_share")
    qs_str = f" po {format_compact(cmai_qs)}" if cmai_qs else ""

    # Get retention from primary layer or quote
    primary_layer = tower[0] if tower else None
    retention = (primary_layer.get("retention") if primary_layer else None) or primary_retention or 25000
    retention_str = format_compact(retention)

    if position == "excess" and cmai_idx >= 0:
        attachment = calculate_attachment(tower, cmai_idx)
        attach_str = format_compact(attachment)
        return f"{limit_str}{qs_str} xs {attach_str} x {retention_str}"

    return f"{limit_str} x {retention_str}"


def migrate_quote_names(dry_run: bool = True):
    """Update all quote_name values to match computed names."""

    with get_conn() as conn:
        # Fetch all quotes with tower_json
        result = conn.execute(text("""
            SELECT id, quote_name, tower_json, position, primary_retention
            FROM insurance_towers
            WHERE tower_json IS NOT NULL
            ORDER BY created_at
        """))

        quotes = result.fetchall()
        print(f"Found {len(quotes)} quotes to check\n")

        updates = []
        unchanged = 0

        for row in quotes:
            quote_id = row[0]
            old_name = row[1]
            tower_json = row[2] if isinstance(row[2], list) else json.loads(row[2]) if row[2] else []
            position = row[3] or "primary"
            primary_retention = row[4] or 25000

            new_name = generate_option_name(tower_json, position, primary_retention)

            # Strip date from old name for comparison (old format had " - MM.DD.YY")
            old_name_stripped = old_name
            if old_name:
                import re
                old_name_stripped = re.sub(r'\s*-\s*\d{1,2}\.\d{1,2}\.\d{2,4}$', '', old_name)

            if old_name_stripped != new_name:
                updates.append({
                    "id": quote_id,
                    "old": old_name,
                    "new": new_name
                })
                print(f"  {old_name or '(empty)'}")
                print(f"  -> {new_name}")
                print()
            else:
                unchanged += 1

        print(f"\nSummary:")
        print(f"  Unchanged: {unchanged}")
        print(f"  To update: {len(updates)}")

        if not updates:
            print("\nNo updates needed!")
            return

        if dry_run:
            print("\n[DRY RUN] No changes made. Run with --apply to update database.")
        else:
            print("\nApplying updates...")
            for update in updates:
                conn.execute(
                    text("UPDATE insurance_towers SET quote_name = :name WHERE id = :id"),
                    {"id": update["id"], "name": update["new"]}
                )
            conn.commit()
            print(f"Updated {len(updates)} quote names.")


if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv

    if dry_run:
        print("=== DRY RUN MODE ===")
        print("Pass --apply to actually update the database\n")
    else:
        print("=== APPLYING CHANGES ===\n")

    migrate_quote_names(dry_run=dry_run)
