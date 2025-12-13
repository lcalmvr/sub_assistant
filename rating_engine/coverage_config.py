"""
Coverage configuration loader and utilities.

Loads coverage defaults from YAML and provides functions to:
- Get coverages for a specific policy form
- Generate coverage schedules with proper limits
- Validate sublimits against aggregate
"""

import yaml
from pathlib import Path
from typing import Optional

# Load config on module import
_CONFIG_PATH = Path(__file__).parent / "coverage_defaults.yml"
_config: Optional[dict] = None


def _load_config() -> dict:
    """Load the coverage defaults configuration (always fresh for dev)."""
    with open(_CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def get_policy_forms() -> list[dict]:
    """
    Get list of available policy forms.

    Returns:
        List of dicts with 'id', 'label', 'description' keys
    """
    config = _load_config()
    return config["policy_forms"]


def get_default_policy_form() -> str:
    """Get the default policy form ID."""
    config = _load_config()
    return config["default_form"]


def get_sublimit_options() -> list[int]:
    """
    Get standard sublimit dropdown options.

    Returns:
        List of integers (e.g., [100000, 250000, 500000, 1000000])
    """
    config = _load_config()
    return config["sublimit_options"]


def get_aggregate_coverage_definitions() -> list[dict]:
    """
    Get raw aggregate coverage definitions from config.

    Returns:
        List of coverage dicts with id, label, and form-specific values
    """
    config = _load_config()
    return config["aggregate_coverages"]


def get_sublimit_coverage_definitions() -> list[dict]:
    """
    Get raw sublimit coverage definitions from config.

    Returns:
        List of coverage dicts with id, label, default, and form-specific values
    """
    config = _load_config()
    return config["sublimit_coverages"]


def get_coverages_for_form(policy_form: str, aggregate_limit: int) -> dict:
    """
    Generate a complete coverage schedule for a given policy form and aggregate limit.

    Args:
        policy_form: One of 'cyber', 'cyber_tech', 'tech'
        aggregate_limit: The policy aggregate limit (e.g., 1000000 for $1M)

    Returns:
        Dict with structure:
        {
            "policy_form": "cyber",
            "aggregate_limit": 1000000,
            "aggregate_coverages": {
                "network_security_privacy": 1000000,
                "tech_eo": 0,
                ...
            },
            "sublimit_coverages": {
                "social_engineering": 250000,
                ...
            }
        }
    """
    config = _load_config()

    # Build aggregate coverages
    aggregate_coverages = {}
    for cov in config["aggregate_coverages"]:
        form_value = cov.get(policy_form, 0)
        if form_value == "aggregate":
            aggregate_coverages[cov["id"]] = aggregate_limit
        else:
            aggregate_coverages[cov["id"]] = 0

    # Build sublimit coverages
    sublimit_coverages = {}
    for cov in config["sublimit_coverages"]:
        form_value = cov.get(policy_form, 0)
        if form_value == "sublimit":
            # Use default, but cap at aggregate
            default_val = cov.get("default", 0)
            sublimit_coverages[cov["id"]] = min(default_val, aggregate_limit)
        else:
            sublimit_coverages[cov["id"]] = 0

    return {
        "policy_form": policy_form,
        "aggregate_limit": aggregate_limit,
        "aggregate_coverages": aggregate_coverages,
        "sublimit_coverages": sublimit_coverages,
    }


def validate_sublimit(value: int, aggregate_limit: int) -> int:
    """
    Validate a sublimit value, capping at aggregate if needed.

    Args:
        value: The proposed sublimit value
        aggregate_limit: The policy aggregate limit

    Returns:
        The validated sublimit (capped at aggregate)
    """
    if value < 0:
        return 0
    return min(value, aggregate_limit)


def get_coverage_label(coverage_id: str) -> str:
    """
    Get the display label for a coverage ID.

    Args:
        coverage_id: The coverage identifier (e.g., 'network_security_privacy')

    Returns:
        Display label string, or the ID if not found
    """
    config = _load_config()

    # Check aggregate coverages
    for cov in config["aggregate_coverages"]:
        if cov["id"] == coverage_id:
            return cov["label"]

    # Check sublimit coverages
    for cov in config["sublimit_coverages"]:
        if cov["id"] == coverage_id:
            return cov["label"]

    return coverage_id


def get_all_coverage_labels() -> dict[str, str]:
    """
    Get a mapping of all coverage IDs to their labels.

    Returns:
        Dict mapping coverage_id -> label
    """
    config = _load_config()
    labels = {}

    for cov in config["aggregate_coverages"]:
        labels[cov["id"]] = cov["label"]

    for cov in config["sublimit_coverages"]:
        labels[cov["id"]] = cov["label"]

    return labels


def merge_coverage_overrides(
    base_coverages: dict,
    overrides: Optional[dict] = None
) -> dict:
    """
    Merge user overrides into a base coverage schedule.

    Args:
        base_coverages: Result from get_coverages_for_form()
        overrides: Optional dict with same structure for overriding specific values

    Returns:
        Merged coverage schedule
    """
    if not overrides:
        return base_coverages

    result = base_coverages.copy()
    aggregate_limit = result["aggregate_limit"]

    # Merge aggregate coverage overrides
    if "aggregate_coverages" in overrides:
        result["aggregate_coverages"] = result["aggregate_coverages"].copy()
        for cov_id, value in overrides["aggregate_coverages"].items():
            if cov_id in result["aggregate_coverages"]:
                result["aggregate_coverages"][cov_id] = validate_sublimit(value, aggregate_limit)

    # Merge sublimit coverage overrides
    if "sublimit_coverages" in overrides:
        result["sublimit_coverages"] = result["sublimit_coverages"].copy()
        for cov_id, value in overrides["sublimit_coverages"].items():
            if cov_id in result["sublimit_coverages"]:
                result["sublimit_coverages"][cov_id] = validate_sublimit(value, aggregate_limit)

    return result


def format_limit_display(value: int) -> str:
    """
    Format a limit value for display.

    Args:
        value: Limit in dollars (e.g., 1000000)

    Returns:
        Formatted string (e.g., "$1,000,000" or "$1M")
    """
    if value == 0:
        return "$0"
    elif value >= 1000000 and value % 1000000 == 0:
        return f"${value // 1000000}M"
    elif value >= 1000 and value % 1000 == 0:
        return f"${value // 1000}K"
    else:
        return f"${value:,}"


def parse_limit_input(text: str, aggregate_limit: int) -> Optional[int]:
    """
    Parse user input for a limit value.

    Args:
        text: User input (e.g., "250K", "1M", "500000", "Aggregate")
        aggregate_limit: The policy aggregate limit for "Aggregate" option

    Returns:
        Integer value or None if invalid
    """
    text = text.strip().upper()

    if text == "AGGREGATE":
        return aggregate_limit

    # Remove $ and commas
    text = text.replace("$", "").replace(",", "")

    try:
        if text.endswith("M"):
            return int(float(text[:-1]) * 1000000)
        elif text.endswith("K"):
            return int(float(text[:-1]) * 1000)
        else:
            return int(text)
    except ValueError:
        return None
