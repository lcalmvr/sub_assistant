"""
rating_engine/engine.py
=======================

Config-driven rating engine using a hazard-class approach.

Required YAML files in rating_engine/config/:
  • industry_hazard_map.yml     ← maps industry slug → hazard class (1-5)
  • hazard_base_rates.yml       ← base rate per $1k revenue by hazard + band
  • limit_factors.yml           ← UW multipliers by policy limit
  • retention_factors.yml       ← UW multipliers by retention/deductible
  • control_modifiers.yml       ← credits (+/-) for security controls

Install dep:
    pip install pyyaml
"""

from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import yaml

CFG_DIR = Path(__file__).parent / "config"

# ---------------------------------------------------------------------------
# YAML loaders
# ---------------------------------------------------------------------------
def _load_yaml(name: str) -> dict:
    path = CFG_DIR / f"{name}.yml"
    if not path.exists():
        raise FileNotFoundError(f"Missing config file {path}")
    with path.open() as f:
        return yaml.safe_load(f)

INDUSTRY_HAZARD = _load_yaml("industry_hazard_map")
HAZARD_BASE     = _load_yaml("hazard_base_rates")
LIMIT_FACTORS   = _load_yaml("limit_factors")
RET_FACTORS     = _load_yaml("retention_factors")
CTRL_MODS       = _load_yaml("control_modifiers")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _revenue_band_key(revenue: int) -> str:
    """Return band string matching YAML keys (<10M, 10M-50M, >250M)."""
    rev_m = revenue / 1_000_000

    for band in ("<10M", "10M-50M", "50M-250M", ">250M"):
        if band.startswith("<"):
            upper = float(band[1:-1])         # "<10M" → 10
            if rev_m < upper:
                return band
        elif band.startswith(">"):
            lower = float(band[1:-1])
            if rev_m >= lower:
                return band
        else:
            lower, upper = map(float, band.replace("M", "").split("-"))
            if lower <= rev_m < upper:
                return band
    raise ValueError("Revenue out of supported bands")

def _nearest_key(d: dict, key: str):
    """If exact key not found, return closest lower key."""
    if key in d:
        return key
    numeric_keys = sorted(
        [float(k.rstrip("M")) for k in d.keys() if k.endswith("M")]
    )
    key_val = float(key.rstrip("M"))
    lower = max([k for k in numeric_keys if k <= key_val], default=numeric_keys[0])
    return f"{int(lower) if lower.is_integer() else lower}M"

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def price_with_breakdown(submission: dict) -> dict:
    """
    Calculate premium with detailed breakdown of rating factors.
    
    Expected submission keys:
        industry   : str  – slug matching YAML map
        revenue    : int  – annual revenue in USD
        limit      : int  – policy limit (e.g. 2_000_000)
        retention  : int  – retention / deductible (e.g. 25_000)
        controls   : list[str] – control slugs present (e.g. ["MFA","EDR"])
    
    Returns detailed breakdown including all rating factors and assumptions.
    """
    industry   = submission["industry"]
    revenue    = submission["revenue"]
    limit      = submission["limit"]
    retention  = submission["retention"]
    controls   = submission.get("controls", [])
    
    # Cast revenue to float so all math is float-based
    revenue = float(revenue)

    # Track breakdown components
    breakdown = {}

    # 1️⃣  Hazard class lookup
    hazard = INDUSTRY_HAZARD.get(industry)
    if hazard is None:
        raise ValueError(f"Unknown industry slug '{industry}' in INDUSTRY_HAZARD map")
    
    breakdown["industry"] = industry
    breakdown["hazard_class"] = hazard

    # 2️⃣  Base rate per $1,000 revenue
    band_key   = _revenue_band_key(revenue)
    rate_table = HAZARD_BASE.get(str(hazard)) or HAZARD_BASE.get(hazard)
    rate_per_k = rate_table[band_key]
    base_prem  = (revenue / 1_000) * rate_per_k
    
    breakdown["revenue_band"] = band_key
    breakdown["base_rate_per_1k"] = rate_per_k
    breakdown["base_premium"] = base_prem

    # 3️⃣  Limit factor
    limit_key = _nearest_key(LIMIT_FACTORS, f"{limit//1_000_000}M")
    limit_factor = LIMIT_FACTORS[limit_key]
    prem = base_prem * limit_factor
    
    breakdown["limit_key"] = limit_key
    breakdown["limit_factor"] = limit_factor
    breakdown["premium_after_limit"] = prem

    # 4️⃣  Retention factor  ─ tolerate str **or** int keys
    ret_factor = RET_FACTORS.get(str(retention)) or RET_FACTORS.get(retention)
    if ret_factor is None:
        # choose the next-higher deductible if exact not found
        numeric_keys = sorted(int(k) if isinstance(k, str) else k
                              for k in RET_FACTORS.keys())
        larger = [k for k in numeric_keys if k > retention]
        chosen = larger[0] if larger else numeric_keys[-1]
        ret_factor = RET_FACTORS.get(str(chosen)) or RET_FACTORS.get(chosen)

    prem *= ret_factor
    
    breakdown["retention_factor"] = ret_factor
    breakdown["premium_after_retention"] = prem

    # 5️⃣  Control modifiers
    applied_modifiers = []
    for ctrl_slug, mod in CTRL_MODS.items():
        if ctrl_slug.startswith("No_"):
            positive_slug = ctrl_slug[3:]
            if positive_slug not in controls:
                prem *= (1 + mod)
                applied_modifiers.append({"control": ctrl_slug, "modifier": mod, "reason": f"Missing {positive_slug}"})
        elif ctrl_slug in controls:
            prem *= (1 + mod)
            applied_modifiers.append({"control": ctrl_slug, "modifier": mod, "reason": f"Has {ctrl_slug}"})
    
    breakdown["control_modifiers"] = applied_modifiers
    breakdown["premium_after_controls"] = prem

    # 6️⃣  Round to nearest 100
    final_prem = Decimal(prem).quantize(Decimal("100"), rounding=ROUND_HALF_UP)
    
    breakdown["final_premium"] = int(final_prem)

    return {
        "hazard_class": hazard,
        "premium": int(final_prem),
        "limit": limit,
        "retention": retention,
        "breakdown": breakdown,
    }

def price(submission: dict) -> dict:
    """
    Calculate premium.

    Expected submission keys:
        industry   : str  – slug matching YAML map
        revenue    : int  – annual revenue in USD
        limit      : int  – policy limit (e.g. 2_000_000)
        retention  : int  – retention / deductible (e.g. 25_000)
        controls   : list[str] – control slugs present (e.g. ["MFA","EDR"])
    """
    industry   = submission["industry"]
    revenue    = submission["revenue"]
    limit      = submission["limit"]
    retention  = submission["retention"]
    controls   = submission.get("controls", [])
    
    # Cast revenue to float so all math is float-based
    revenue = float(revenue)

    # 1️⃣  Hazard class lookup
    hazard = INDUSTRY_HAZARD.get(industry)
    if hazard is None:
        raise ValueError(f"Unknown industry slug '{industry}' in INDUSTRY_HAZARD map")

    # 2️⃣  Base rate per $1,000 revenue
    band_key   = _revenue_band_key(revenue)
    rate_table = HAZARD_BASE.get(str(hazard)) or HAZARD_BASE.get(hazard)
    rate_per_k = rate_table[band_key]
    base_prem  = (revenue / 1_000) * rate_per_k

    # 3️⃣  Limit factor
    limit_key = _nearest_key(LIMIT_FACTORS, f"{limit//1_000_000}M")
    prem = base_prem * LIMIT_FACTORS[limit_key]

    # 4️⃣  Retention factor  ─ tolerate str **or** int keys
    ret_factor = RET_FACTORS.get(str(retention)) or RET_FACTORS.get(retention)
    if ret_factor is None:
        # choose the next-higher deductible if exact not found
        numeric_keys = sorted(int(k) if isinstance(k, str) else k
                              for k in RET_FACTORS.keys())
        larger = [k for k in numeric_keys if k > retention]
        chosen = larger[0] if larger else numeric_keys[-1]
        ret_factor = RET_FACTORS.get(str(chosen)) or RET_FACTORS.get(chosen)

    prem *= ret_factor


    # 5️⃣  Control modifiers
    for ctrl_slug, mod in CTRL_MODS.items():
        if ctrl_slug.startswith("No_"):
            positive_slug = ctrl_slug[3:]
            if positive_slug not in controls:
                prem *= (1 + mod)
        elif ctrl_slug in controls:
            prem *= (1 + mod)

    # 6️⃣  Round to nearest 100
    prem = Decimal(prem).quantize(Decimal("100"), rounding=ROUND_HALF_UP)

    return {
        "hazard_class": hazard,
        "premium": int(prem),
        "limit": limit,
        "retention": retention,
    }

# ---------------------------------------------------------------------------
# Quick manual test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    sample = {
        "industry": "Advertising_Marketing_Technology",
        "revenue": 30_000_000,
        "limit": 2_000_000,
        "retention": 25_000,
        "controls": ["MFA", "Backups"],
    }
    print(price(sample))

