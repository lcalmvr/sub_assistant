"""
utils/quote_formatting.py
=========================

Single source of truth for quote naming and formatting.
Used by UI components and will be used for PDF export.
"""
from __future__ import annotations
from datetime import datetime


def format_currency(amount: int) -> str:
    """
    Format amount for display.

    Examples:
        1_000_000 -> "$1M"
        500_000 -> "$500K"
        25_000 -> "$25K"
        1_234 -> "$1,234"
    """
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"${amount // 1_000_000}M"
    elif amount >= 1_000 and amount % 1_000 == 0:
        return f"${amount // 1_000}K"
    return f"${amount:,}"


def generate_quote_name(
    limit: int,
    retention: int,
    position: str = "primary",
    attachment: int = None,
) -> str:
    """
    Generate a descriptive name for a quote.

    Format: $1M x $25K - 12.17.25
    For excess with attachment: $1M xs $500K x $25K - 12.17.25

    Args:
        limit: Policy limit
        retention: Retention/deductible
        position: "primary" or "excess"
        attachment: Attachment point for excess layers (optional)

    Returns:
        Formatted quote name string
    """
    limit_str = format_currency(limit)
    ret_str = format_currency(retention)
    date_str = datetime.now().strftime("%m.%d.%y")

    # For excess with attachment, show attachment point
    if position == "excess" and attachment and attachment > 0:
        attach_str = format_currency(attachment)
        return f"{limit_str} xs {attach_str} x {ret_str} - {date_str}"

    return f"{limit_str} x {ret_str} - {date_str}"
