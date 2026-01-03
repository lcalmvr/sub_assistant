"""
Document Routing and Extraction Strategy Selection

Routes documents to appropriate extraction pipelines based on:
- Document type (application, loss runs, policy, etc.)
- Page count
- Structure detection

Cost-optimized for different document types.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional, List
import re


class ExtractionStrategy(Enum):
    """Available extraction strategies with cost per page."""

    TEXTRACT_DETECT = "textract_detect"      # $0.0015/page - basic OCR only
    TEXTRACT_TABLES = "textract_tables"      # $0.015/page - tables extraction
    TEXTRACT_FORMS = "textract_forms"        # $0.05/page - forms + checkboxes
    CLAUDE_VISION = "claude_vision"          # $0.01-0.02/page - unstructured
    TIERED_POLICY = "tiered_policy"          # Multi-phase for large policies
    QUOTE_ADAPTIVE = "quote_adaptive"        # Adaptive for quotes


# Cost per page by strategy
COST_PER_PAGE = {
    ExtractionStrategy.TEXTRACT_DETECT: 0.0015,
    ExtractionStrategy.TEXTRACT_TABLES: 0.015,
    ExtractionStrategy.TEXTRACT_FORMS: 0.05,
    ExtractionStrategy.CLAUDE_VISION: 0.015,  # Average
    ExtractionStrategy.TIERED_POLICY: 0.01,   # Average with smart extraction
    ExtractionStrategy.QUOTE_ADAPTIVE: 0.02,  # Average
}


@dataclass
class ExtractionPlan:
    """Plan for how to extract a document."""

    strategy: ExtractionStrategy
    estimated_cost: float
    pages_to_extract: Optional[List[int]] = None  # None = all pages
    phases: Optional[List[dict]] = None  # For multi-phase strategies
    notes: Optional[str] = None


def route_document(
    doc_type: str,
    page_count: int,
    filename: Optional[str] = None,
    has_checkboxes: Optional[bool] = None,
) -> ExtractionPlan:
    """
    Determine extraction strategy based on document characteristics.

    Args:
        doc_type: Document classification (application, loss_runs, policy, etc.)
        page_count: Number of pages
        filename: Original filename (for hints)
        has_checkboxes: Whether document has checkboxes (if known)

    Returns:
        ExtractionPlan with strategy and cost estimate
    """

    # Normalize doc type
    doc_type = doc_type.lower().replace(" ", "_").replace("-", "_")

    # ─────────────────────────────────────────────────────────────
    # Application forms - Textract Forms for checkbox detection
    # ─────────────────────────────────────────────────────────────
    if doc_type in [
        "application",
        "application_primary",
        "application_supplemental",
        "supplemental_application",
        "ransomware_application",
    ]:
        return ExtractionPlan(
            strategy=ExtractionStrategy.TEXTRACT_FORMS,
            estimated_cost=page_count * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS],
            notes="Full Textract Forms extraction for checkbox detection",
        )

    # ─────────────────────────────────────────────────────────────
    # Loss runs & financials - Textract Tables
    # ─────────────────────────────────────────────────────────────
    if doc_type in ["loss_runs", "loss_run", "financials", "financial_statement", "schedule"]:
        return ExtractionPlan(
            strategy=ExtractionStrategy.TEXTRACT_TABLES,
            estimated_cost=page_count * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_TABLES],
            notes="Textract Tables for structured tabular data",
        )

    # ─────────────────────────────────────────────────────────────
    # Underlying quotes - Adaptive strategy
    # ─────────────────────────────────────────────────────────────
    if doc_type in ["underlying_quote", "quote", "binder", "certificate"]:
        return _plan_quote_extraction(page_count)

    # ─────────────────────────────────────────────────────────────
    # Policy documents - Tiered extraction
    # ─────────────────────────────────────────────────────────────
    if doc_type in ["policy", "policy_form", "endorsement", "policy_document"]:
        return _plan_policy_extraction(page_count)

    # ─────────────────────────────────────────────────────────────
    # Emails and narratives - Claude Vision
    # ─────────────────────────────────────────────────────────────
    if doc_type in ["email", "broker_email", "narrative", "broker_note", "cover_letter"]:
        return ExtractionPlan(
            strategy=ExtractionStrategy.CLAUDE_VISION,
            estimated_cost=page_count * COST_PER_PAGE[ExtractionStrategy.CLAUDE_VISION],
            notes="Claude Vision for unstructured text with context understanding",
        )

    # ─────────────────────────────────────────────────────────────
    # Large unknown documents - Use tiered approach
    # ─────────────────────────────────────────────────────────────
    if page_count > 20:
        return _plan_policy_extraction(page_count)

    # ─────────────────────────────────────────────────────────────
    # Default - Claude Vision
    # ─────────────────────────────────────────────────────────────
    return ExtractionPlan(
        strategy=ExtractionStrategy.CLAUDE_VISION,
        estimated_cost=page_count * COST_PER_PAGE[ExtractionStrategy.CLAUDE_VISION],
        notes="Default: Claude Vision for unknown document type",
    )


def _plan_quote_extraction(page_count: int) -> ExtractionPlan:
    """
    Plan extraction for underlying quotes.

    Short quotes (<=5 pages): Full Textract Forms
    Long quotes (>5 pages): Dec pages only + endorsement scan
    """

    if page_count <= 5:
        # Short quote - extract everything
        return ExtractionPlan(
            strategy=ExtractionStrategy.QUOTE_ADAPTIVE,
            estimated_cost=page_count * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS],
            pages_to_extract=list(range(1, page_count + 1)),
            phases=[
                {
                    "phase": 1,
                    "name": "full_extraction",
                    "strategy": "textract_forms",
                    "pages": "all",
                }
            ],
            notes="Short quote - full Textract Forms extraction",
        )
    else:
        # Long quote (likely has policy form attached)
        # Phase 1: Dec pages (1-3)
        # Phase 2: Cheap scan for endorsement fill-ins
        dec_cost = 3 * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]
        scan_cost = (page_count - 3) * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_DETECT]

        return ExtractionPlan(
            strategy=ExtractionStrategy.QUOTE_ADAPTIVE,
            estimated_cost=dec_cost + scan_cost,
            pages_to_extract=[1, 2, 3],  # Initially just dec pages
            phases=[
                {
                    "phase": 1,
                    "name": "declarations",
                    "strategy": "textract_forms",
                    "pages": [1, 2, 3],
                },
                {
                    "phase": 2,
                    "name": "endorsement_scan",
                    "strategy": "textract_detect",
                    "pages": "remaining",
                    "purpose": "Find fill-in values and form numbers",
                },
            ],
            notes=f"Quote with attached policy ({page_count} pages) - dec pages + endorsement scan",
        )


def _plan_policy_extraction(page_count: int) -> ExtractionPlan:
    """
    Plan tiered extraction for policy documents.

    Phase 1: Cheap scan to find key pages
    Phase 2: Textract Forms on dec pages
    Phase 3: Textract Forms on endorsement fill-ins
    Phase 4: Catalog lookup for boilerplate
    """

    # Estimate costs
    scan_cost = page_count * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_DETECT]
    dec_cost = 3 * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]  # ~3 dec pages
    endorsement_estimate = min(10, page_count // 5) * COST_PER_PAGE[ExtractionStrategy.TEXTRACT_FORMS]

    return ExtractionPlan(
        strategy=ExtractionStrategy.TIERED_POLICY,
        estimated_cost=scan_cost + dec_cost + endorsement_estimate,
        phases=[
            {
                "phase": 1,
                "name": "page_scan",
                "strategy": "textract_detect",
                "pages": "all",
                "purpose": "Find dec page, endorsement schedule, form numbers",
            },
            {
                "phase": 2,
                "name": "declarations",
                "strategy": "textract_forms",
                "pages": "detected_dec_pages",
                "purpose": "Extract limits, dates, named insured",
            },
            {
                "phase": 3,
                "name": "endorsement_fill_ins",
                "strategy": "textract_forms",
                "pages": "detected_fill_in_pages",
                "purpose": "Extract sublimits, scheduled items",
            },
            {
                "phase": 4,
                "name": "catalog_lookup",
                "strategy": "catalog",
                "pages": None,
                "purpose": "Match form numbers to catalog, queue unknown forms",
            },
        ],
        notes=f"Tiered policy extraction ({page_count} pages)",
    )


def estimate_submission_cost(documents: List[dict]) -> dict:
    """
    Estimate total extraction cost for a submission.

    Args:
        documents: List of {"doc_type": str, "page_count": int, "filename": str}

    Returns:
        {"total_cost": float, "by_document": [...], "by_strategy": {...}}
    """

    results = {
        "total_cost": 0,
        "by_document": [],
        "by_strategy": {},
    }

    for doc in documents:
        plan = route_document(
            doc_type=doc.get("doc_type", "unknown"),
            page_count=doc.get("page_count", 1),
            filename=doc.get("filename"),
        )

        results["total_cost"] += plan.estimated_cost
        results["by_document"].append({
            "filename": doc.get("filename"),
            "doc_type": doc.get("doc_type"),
            "page_count": doc.get("page_count"),
            "strategy": plan.strategy.value,
            "estimated_cost": plan.estimated_cost,
        })

        strategy_name = plan.strategy.value
        if strategy_name not in results["by_strategy"]:
            results["by_strategy"][strategy_name] = 0
        results["by_strategy"][strategy_name] += plan.estimated_cost

    return results


# ─────────────────────────────────────────────────────────────
# Form Number Detection
# ─────────────────────────────────────────────────────────────

# Common form number patterns
FORM_NUMBER_PATTERNS = [
    # ISO forms: CG 00 01 04 13
    r'\b([A-Z]{2})\s*(\d{2})\s*(\d{2})(?:\s*(\d{2})\s*(\d{2}))?\b',
    # Carrier forms: BZ-CY-001-2023
    r'\b([A-Z]{2,4})[-\s]?([A-Z]{2,4})[-\s]?(\d{2,4})[-\s]?(\d{2,4})?\b',
    # Edition references
    r'(?:Form|Edition|Policy Form)[:\s]+([A-Z0-9][-A-Z0-9\s]{3,20})',
]


def detect_form_numbers(text: str) -> List[str]:
    """
    Detect policy form numbers in text.

    Returns list of detected form numbers.
    """
    # Common false positive patterns to filter out
    FALSE_POSITIVE_PATTERNS = [
        # Page references
        r'^PA\s*GE\s*\d',       # "PAGE 14", "PA GE 14"
        r'^OF\s*\d+\s*\d*$',    # "OF 36", "OF 36 11"
        r'^\d+\s*OF\s*\d+$',    # "1 OF 36"
        # Legal act references
        r'^ACT\s*OF\s*\d{4}$',  # "ACT OF 1996"
        r'^CHAP\s*TER\s*\d',    # "CHAPTER 11"
        # Sentence fragments
        r'^(THE|THIS|THAT|WITH|WHICH|FOR|AND|NOT|ANY|ALL)\s',
        r'^NO\s+PART',
        r'^PART\s+OF',
        r'^A\s+[A-Z]+LY\s',     # "A LEGALLY..."
        r'\s(IS|ARE|THE|OF|TO|IN|FOR|AND|OR|BY|AS|AT)$',
        # Years alone
        r'^(19|20)\d{2}$',
        r'^\d{4}$',
        # Newline/multiline matches (indicates sentence fragments)
        r'\n',
        # Common words that aren't form numbers
        r'^NUMBER\b',
        r'\bREPRE',
    ]

    found = set()

    for pattern in FORM_NUMBER_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            if isinstance(match, tuple):
                form_num = " ".join(p for p in match if p).upper()
            else:
                form_num = match.upper()

            # Filter out obvious non-form-numbers
            if len(form_num) < 5 or form_num.isdigit():
                continue

            # Check against false positive patterns
            is_false_positive = False
            for fp_pattern in FALSE_POSITIVE_PATTERNS:
                if re.search(fp_pattern, form_num, re.IGNORECASE):
                    is_false_positive = True
                    break

            if not is_false_positive:
                found.add(form_num)

    return list(found)


def find_key_pages(pages_text: List[str]) -> dict:
    """
    Identify key pages in a policy document.

    Args:
        pages_text: List of text content by page (index 0 = page 1)

    Returns:
        {
            "dec_pages": [1, 2],
            "endorsement_schedule_page": 3,
            "endorsement_pages": [15, 16, 17, ...],
            "form_numbers": ["CG 00 01", ...]
        }
    """

    result = {
        "dec_pages": [],
        "endorsement_schedule_page": None,
        "endorsement_pages": [],
        "form_numbers": [],
    }

    dec_keywords = ["declarations", "policy number", "named insured", "policy period", "limits of"]
    endorsement_keywords = ["endorsement", "schedule of forms", "forms and endorsements"]
    fill_in_indicators = ["$", "sublimit", "retention", "deductible", "limit:", "amount:"]

    all_form_numbers = set()

    for i, text in enumerate(pages_text):
        page_num = i + 1
        text_lower = text.lower()

        # Check for declarations page
        dec_score = sum(1 for kw in dec_keywords if kw in text_lower)
        if dec_score >= 2:
            result["dec_pages"].append(page_num)

        # Check for endorsement schedule
        if any(kw in text_lower for kw in ["schedule of forms", "forms and endorsements"]):
            result["endorsement_schedule_page"] = page_num

        # Check for endorsement pages with fill-ins
        if "endorsement" in text_lower:
            fill_in_score = sum(1 for ind in fill_in_indicators if ind.lower() in text_lower)
            if fill_in_score >= 1:
                result["endorsement_pages"].append(page_num)

        # Detect form numbers
        forms = detect_form_numbers(text)
        all_form_numbers.update(forms)

    result["form_numbers"] = list(all_form_numbers)

    # Default dec pages if none found
    if not result["dec_pages"]:
        result["dec_pages"] = [1, 2, 3]

    return result
