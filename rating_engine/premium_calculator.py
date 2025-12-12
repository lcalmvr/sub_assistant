"""
rating_engine/premium_calculator.py
===================================

Single source of truth for premium calculations.
Both Rating tab and Quote tab should use this module to ensure consistent premiums.
"""
from __future__ import annotations
import json
from rating_engine.engine import price_with_breakdown

# Industry slug mapping - converts NAICS titles and common names to rating engine slugs
INDUSTRY_SLUG_MAP = {
    # Direct slug mappings (already valid)
    "Software_as_a_Service_SaaS": "Software_as_a_Service_SaaS",
    "Professional_Services_Consulting": "Professional_Services_Consulting",
    "Healthcare_Provider_Digital_Health": "Healthcare_Provider_Digital_Health",
    "FinTech_Payments": "FinTech_Payments",
    "Manufacturing_Discrete": "Manufacturing_Discrete",
    "Ecommerce_Online_Retail": "Ecommerce_Online_Retail",
    "Educational_Technology": "Educational_Technology",
    "Advertising_Marketing_Technology": "Advertising_Marketing_Technology",
    "Government_IT_Contractor": "Government_IT_Contractor",
    "Energy_Utility_Critical_Infrastructure": "Energy_Utility_Critical_Infrastructure",

    # Common short names
    "SaaS": "Software_as_a_Service_SaaS",
    "Technology": "Software_as_a_Service_SaaS",
    "Professional Services": "Professional_Services_Consulting",
    "Consulting": "Professional_Services_Consulting",
    "Healthcare": "Healthcare_Provider_Digital_Health",
    "FinTech": "FinTech_Payments",
    "Manufacturing": "Manufacturing_Discrete",
    "Ecommerce": "Ecommerce_Online_Retail",
    "Education": "Educational_Technology",
    "Advertising": "Advertising_Marketing_Technology",
    "Marketing": "Advertising_Marketing_Technology",
    "Government": "Government_IT_Contractor",
    "Energy": "Energy_Utility_Critical_Infrastructure",
}

# Default slug when industry not found in map
DEFAULT_INDUSTRY_SLUG = "Software_as_a_Service_SaaS"


def map_industry_to_slug(industry_name: str) -> str:
    """
    Map any industry name to a valid rating engine slug.

    Args:
        industry_name: Raw industry name (NAICS title, common name, or slug)

    Returns:
        Valid rating engine slug
    """
    if not industry_name:
        return DEFAULT_INDUSTRY_SLUG

    # First check exact match
    if industry_name in INDUSTRY_SLUG_MAP:
        return INDUSTRY_SLUG_MAP[industry_name]

    # Check case-insensitive and partial matches
    industry_lower = industry_name.lower()

    # Keyword-based mapping for common NAICS titles
    keyword_mapping = {
        "software": "Software_as_a_Service_SaaS",
        "saas": "Software_as_a_Service_SaaS",
        "technology": "Software_as_a_Service_SaaS",
        "tech": "Software_as_a_Service_SaaS",
        "consulting": "Professional_Services_Consulting",
        "professional": "Professional_Services_Consulting",
        "legal": "Professional_Services_Consulting",
        "accounting": "Professional_Services_Consulting",
        "healthcare": "Healthcare_Provider_Digital_Health",
        "medical": "Healthcare_Provider_Digital_Health",
        "hospital": "Healthcare_Provider_Digital_Health",
        "health": "Healthcare_Provider_Digital_Health",
        "fintech": "FinTech_Payments",
        "financial": "FinTech_Payments",
        "payment": "FinTech_Payments",
        "banking": "FinTech_Payments",
        "insurance": "FinTech_Payments",
        "manufacturing": "Manufacturing_Discrete",
        "industrial": "Manufacturing_Discrete",
        "ecommerce": "Ecommerce_Online_Retail",
        "retail": "Ecommerce_Online_Retail",
        "online retail": "Ecommerce_Online_Retail",
        "education": "Educational_Technology",
        "school": "Educational_Technology",
        "university": "Educational_Technology",
        "advertising": "Advertising_Marketing_Technology",
        "marketing": "Advertising_Marketing_Technology",
        "media": "Advertising_Marketing_Technology",
        "government": "Government_IT_Contractor",
        "public sector": "Government_IT_Contractor",
        "energy": "Energy_Utility_Critical_Infrastructure",
        "utility": "Energy_Utility_Critical_Infrastructure",
        "oil": "Energy_Utility_Critical_Infrastructure",
        "gas": "Energy_Utility_Critical_Infrastructure",
        # Travel/Hospitality - map to Ecommerce as closest match
        "travel": "Ecommerce_Online_Retail",
        "hotel": "Ecommerce_Online_Retail",
        "hospitality": "Ecommerce_Online_Retail",
        "accommodation": "Ecommerce_Online_Retail",
        "lodging": "Ecommerce_Online_Retail",
        "airbnb": "Ecommerce_Online_Retail",
        "vacation": "Ecommerce_Online_Retail",
    }

    for keyword, slug in keyword_mapping.items():
        if keyword in industry_lower:
            return slug

    # Default fallback
    return DEFAULT_INDUSTRY_SLUG


def calculate_premium(
    revenue: float,
    limit: int,
    retention: int,
    industry: str,
    hazard_override: int = None,
    control_adjustment: float = 0,
) -> dict:
    """
    Calculate technical and risk-adjusted premiums.

    This is the SINGLE SOURCE OF TRUTH for premium calculations.
    Both Rating tab and Quote tab should use this function.

    Args:
        revenue: Annual revenue in USD
        limit: Policy limit (e.g., 1_000_000)
        retention: Retention/deductible (e.g., 25_000)
        industry: Industry name (will be mapped to slug)
        hazard_override: Optional hazard class override (1-5)
        control_adjustment: Control adjustment factor (e.g., -0.10 for 10% credit)

    Returns:
        dict with keys:
            - technical_premium: Premium before control adjustments
            - risk_adjusted_premium: Premium after control adjustments
            - breakdown: Detailed breakdown from rating engine
            - error: Error message if calculation failed (only present on error)
    """
    try:
        # Map industry to valid slug
        industry_slug = map_industry_to_slug(industry)

        # Build rating input
        rating_input = {
            "revenue": float(revenue),
            "limit": limit,
            "retention": retention,
            "industry": industry_slug,
            "controls": [],  # Empty - control adjustment applied separately
        }

        # Get base premium from rating engine
        result = price_with_breakdown(rating_input)
        breakdown = result.get("breakdown", {})
        base_premium = result.get("premium", 0)

        # Start with base premium
        technical_premium = base_premium
        risk_adjusted_premium = base_premium

        # Apply hazard override if set
        effective_hazard = hazard_override
        if effective_hazard and breakdown.get("hazard_class") != effective_hazard:
            original_hazard = breakdown.get("hazard_class", 3)
            hazard_diff = effective_hazard - original_hazard
            # Each hazard level is ~20% difference
            hazard_factor = 1 + (hazard_diff * 0.20)
            technical_premium = int(technical_premium * hazard_factor)
            risk_adjusted_premium = int(risk_adjusted_premium * hazard_factor)

        # Apply control adjustment (only affects risk-adjusted premium)
        if control_adjustment:
            adj_factor = 1 + control_adjustment
            risk_adjusted_premium = int(risk_adjusted_premium * adj_factor)

        # Update breakdown with effective values
        breakdown["effective_hazard"] = effective_hazard or breakdown.get("hazard_class", 3)
        breakdown["control_adjustment"] = control_adjustment
        breakdown["industry_slug"] = industry_slug

        return {
            "technical_premium": technical_premium,
            "risk_adjusted_premium": risk_adjusted_premium,
            "breakdown": breakdown,
        }

    except Exception as e:
        import traceback
        return {
            "error": f"Calculation error: {str(e)}",
            "traceback": traceback.format_exc(),
            "technical_premium": 0,
            "risk_adjusted_premium": 0,
        }


def calculate_premium_for_submission(
    submission_id: str,
    limit: int,
    retention: int,
    db_conn_func=None,
) -> dict:
    """
    Calculate premiums for a submission, automatically loading hazard/control overrides.

    This is a convenience wrapper that loads submission data and calls calculate_premium.

    Args:
        submission_id: Submission UUID
        limit: Policy limit
        retention: Retention/deductible
        db_conn_func: Function that returns a database connection (optional)

    Returns:
        Same as calculate_premium(), plus:
            - error: Set if submission not found or missing required data
    """
    # Import here to avoid circular imports
    if db_conn_func is None:
        from pages_components.tower_db import get_conn
        db_conn_func = get_conn

    try:
        with db_conn_func().cursor() as cur:
            cur.execute(
                """
                SELECT annual_revenue, naics_primary_title, hazard_override, control_overrides
                FROM submissions
                WHERE id = %s
                """,
                (submission_id,)
            )
            row = cur.fetchone()

        if not row:
            return {"error": "Submission not found", "technical_premium": 0, "risk_adjusted_premium": 0}

        revenue, industry, hazard_override, control_overrides_raw = row

        if revenue is None:
            return {"error": "No revenue - add on Details tab", "technical_premium": 0, "risk_adjusted_premium": 0}

        # Parse control overrides JSON
        control_adj = 0
        if control_overrides_raw:
            try:
                if isinstance(control_overrides_raw, str):
                    control_overrides = json.loads(control_overrides_raw)
                else:
                    control_overrides = control_overrides_raw
                control_adj = control_overrides.get("overall", 0)
            except:
                control_adj = 0

        # Call the main calculation function
        return calculate_premium(
            revenue=revenue,
            limit=limit,
            retention=retention,
            industry=industry or "Technology",
            hazard_override=hazard_override,
            control_adjustment=control_adj,
        )

    except Exception as e:
        import traceback
        return {
            "error": f"Database error: {str(e)}",
            "traceback": traceback.format_exc(),
            "technical_premium": 0,
            "risk_adjusted_premium": 0,
        }
