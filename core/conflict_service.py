"""
Conflict Service

Service layer that orchestrates conflict detection based on strategy.
Handles caching, database operations, and the eager/lazy switch.

See docs/conflict_review_implementation_plan.md for full documentation.
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4


class JSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles datetime, date, and Decimal objects."""

    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _json_dumps(obj: Any) -> str:
    """JSON dumps with custom encoder for datetime/date/Decimal."""
    return json.dumps(obj, cls=JSONEncoder)

from sqlalchemy import text

from core.conflict_config import (
    CACHE_TTL_SECONDS,
    TRACKED_FIELDS,
    DetectionStrategy,
    ReviewStatus,
    SourceType,
    get_detection_strategy,
    get_field_priority,
    is_eager_field,
    is_field_tracked,
)
from core.conflict_detection import (
    ConflictResult,
    conflicts_to_dicts,
    detect_conflicts,
)
from core.credibility_score import (
    CredibilityScore,
    calculate_credibility_score,
)

# Dynamic conflict analyzer (LLM-based)
try:
    from ai.conflict_analyzer import (
        analyze_application as analyze_conflicts_dynamic,
        get_detected_conflicts as get_dynamic_conflicts,
        resolve_conflict as resolve_dynamic_conflict,
    )
    HAS_CONFLICT_ANALYZER = True
except ImportError:
    HAS_CONFLICT_ANALYZER = False

# Database connection
import os
import importlib.util
spec = importlib.util.spec_from_file_location("db", os.path.join(os.path.dirname(__file__), "db.py"))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
get_conn = db.get_conn


# =============================================================================
# CONFLICT SERVICE CLASS
# =============================================================================

class ConflictService:
    """
    Orchestrates when conflict detection runs based on strategy.

    The key "switch" is in on_field_value_written():
    - EAGER: Runs detection immediately
    - LAZY: Just invalidates cache
    - HYBRID: Eager for critical fields only
    """

    def on_field_value_written(
        self,
        submission_id: str,
        field_name: str,
    ) -> None:
        """
        Called after writing to field_values table.

        Decides whether to run detection based on current strategy.
        """
        strategy = get_detection_strategy()

        if strategy == DetectionStrategy.LAZY:
            # Just invalidate cache, don't detect yet
            _invalidate_cache(submission_id)
            return

        if strategy == DetectionStrategy.HYBRID:
            if not is_eager_field(field_name):
                # Non-critical field - invalidate but don't detect
                _invalidate_cache(submission_id)
                return

        # EAGER or HYBRID with critical field - detect now
        self._run_and_cache(submission_id)

    def get_conflicts(self, submission_id: str) -> list[dict]:
        """
        Get conflicts for a submission.

        Uses cache if fresh, otherwise runs detection.
        """
        # Check cache first
        cached = _get_cached_conflicts(submission_id)

        if cached is not None and not _is_cache_stale(submission_id):
            return cached

        # Cache miss or stale - run detection
        return self._run_and_cache(submission_id)

    def force_refresh(self, submission_id: str) -> list[dict]:
        """
        Force re-run detection, ignoring cache.
        """
        return self._run_and_cache(submission_id)

    def resolve_conflict(
        self,
        review_item_id: str,
        resolution: dict,
        resolved_by: str,
    ) -> bool:
        """
        Mark a conflict as resolved.

        Args:
            review_item_id: UUID of the review_item
            resolution: Dict with resolution details:
                - chosen_value: The value selected
                - chosen_source: Which source was chosen (or 'manual')
                - notes: Optional notes
            resolved_by: Username/email of resolver

        Returns:
            True if successfully resolved
        """
        with get_conn() as conn:
            result = conn.execute(text("""
                UPDATE review_items
                SET status = 'approved',
                    resolution = :resolution,
                    reviewed_by = :reviewed_by,
                    reviewed_at = :reviewed_at
                WHERE id = :id
            """), {
                "id": review_item_id,
                "resolution": _json_dumps(resolution),
                "reviewed_by": resolved_by,
                "reviewed_at": datetime.utcnow(),
            })

            return result.rowcount > 0

    def reject_conflict(
        self,
        review_item_id: str,
        reason: str,
        rejected_by: str,
    ) -> bool:
        """
        Reject a conflict (mark as invalid/not applicable).
        """
        resolution = {"rejected_reason": reason}

        with get_conn() as conn:
            result = conn.execute(text("""
                UPDATE review_items
                SET status = 'rejected',
                    resolution = :resolution,
                    reviewed_by = :reviewed_by,
                    reviewed_at = :reviewed_at
                WHERE id = :id
            """), {
                "id": review_item_id,
                "resolution": _json_dumps(resolution),
                "reviewed_by": rejected_by,
                "reviewed_at": datetime.utcnow(),
            })

            return result.rowcount > 0

    def defer_conflict(
        self,
        review_item_id: str,
        notes: str,
        deferred_by: str,
    ) -> bool:
        """
        Defer a conflict for later review.
        """
        resolution = {"deferred_notes": notes}

        with get_conn() as conn:
            result = conn.execute(text("""
                UPDATE review_items
                SET status = 'deferred',
                    resolution = :resolution,
                    reviewed_by = :reviewed_by,
                    reviewed_at = :reviewed_at
                WHERE id = :id
            """), {
                "id": review_item_id,
                "resolution": _json_dumps(resolution),
                "reviewed_by": deferred_by,
                "reviewed_at": datetime.utcnow(),
            })

            return result.rowcount > 0

    def get_review_summary(self, submission_id: str) -> dict:
        """
        Get summary counts for UI badges.

        Returns:
            Dict with counts: pending, high_priority, resolved, etc.
        """
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'high') as high_priority,
                    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'medium') as medium_priority,
                    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'low') as low_priority,
                    COUNT(*) FILTER (WHERE status = 'approved') as approved,
                    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                    COUNT(*) FILTER (WHERE status = 'deferred') as deferred,
                    COUNT(*) as total
                FROM review_items
                WHERE submission_id = :submission_id
            """), {"submission_id": submission_id})

            row = result.fetchone()
            if row:
                return {
                    "pending": row[0] or 0,
                    "high_priority": row[1] or 0,
                    "medium_priority": row[2] or 0,
                    "low_priority": row[3] or 0,
                    "approved": row[4] or 0,
                    "rejected": row[5] or 0,
                    "deferred": row[6] or 0,
                    "total": row[7] or 0,
                }

            return {
                "pending": 0,
                "high_priority": 0,
                "medium_priority": 0,
                "low_priority": 0,
                "approved": 0,
                "rejected": 0,
                "deferred": 0,
                "total": 0,
            }

    def has_blocking_conflicts(self, submission_id: str) -> bool:
        """
        Check if there are any high-priority pending conflicts.

        Use this to gate actions like binding.
        """
        summary = self.get_review_summary(submission_id)
        return summary["high_priority"] > 0

    def _run_and_cache(
        self,
        submission_id: str,
        app_data: dict | None = None,
        broker_info: dict | None = None,
    ) -> list[dict]:
        """
        Run detection and store results in review_items.
        """
        # Load field values
        field_values = get_field_values(submission_id)

        # Run pure detection
        conflicts: list[ConflictResult] = detect_conflicts(
            submission_id=submission_id,
            field_values=field_values,
            app_data=app_data,
            broker_info=broker_info,
        )

        # Store conflicts
        _store_conflicts(submission_id, conflicts)

        # Return as dicts
        return conflicts_to_dicts(conflicts)

    def run_full_detection(
        self,
        submission_id: str,
        app_data: dict | None = None,
        broker_info: dict | None = None,
        submission_data: dict | None = None,
    ) -> list[dict]:
        """
        Run full detection including application contradictions.

        Call this from the pipeline when you have access to app_data
        and broker_info.
        """
        conflicts = self._run_and_cache(submission_id, app_data, broker_info)

        # Run dynamic LLM-based conflict detection
        if app_data and HAS_CONFLICT_ANALYZER:
            try:
                # Get submission context for plausibility checks
                context = submission_data or get_submission_context(submission_id)
                submission_context = {
                    "industry": context.get("naics_primary_code"),
                    "business_type": None,  # Could be extracted from industry_tags
                    "annual_revenue": context.get("annual_revenue"),
                    "employee_count": None,  # Not currently tracked
                }

                # Run dynamic analysis
                analyze_conflicts_dynamic(
                    submission_id=submission_id,
                    app_data=app_data,
                    submission_context=submission_context,
                    add_new_to_catalog=True,
                )
            except Exception as e:
                # Don't fail the whole pipeline if dynamic analysis fails
                print(f"Dynamic conflict analysis failed: {e}")

        # Also calculate and store credibility score
        if app_data:
            self.calculate_and_store_credibility(
                submission_id=submission_id,
                app_data=app_data,
                submission_data=submission_data,
            )

        return conflicts

    def get_dynamic_conflicts(self, submission_id: str) -> list[dict]:
        """
        Get dynamically detected conflicts for a submission.

        Returns conflicts detected by the LLM analyzer.
        """
        if not HAS_CONFLICT_ANALYZER:
            return []
        try:
            return get_dynamic_conflicts(submission_id)
        except Exception:
            return []

    def resolve_dynamic_conflict(
        self,
        conflict_id: str,
        status: str,
        resolved_by: str,
        notes: str | None = None,
    ) -> bool:
        """
        Resolve a dynamically detected conflict.

        Args:
            conflict_id: UUID of the detected_conflict
            status: 'confirmed' or 'dismissed'
            resolved_by: Username/email
            notes: Optional resolution notes
        """
        if not HAS_CONFLICT_ANALYZER:
            return False
        try:
            return resolve_dynamic_conflict(conflict_id, status, resolved_by, notes)
        except Exception:
            return False

    def calculate_and_store_credibility(
        self,
        submission_id: str,
        app_data: dict,
        submission_data: dict | None = None,
    ) -> CredibilityScore:
        """
        Calculate and store the credibility score for an application.

        Args:
            submission_id: UUID of the submission
            app_data: The application form data
            submission_data: Additional metadata (NAICS, revenue, etc.)

        Returns:
            The calculated CredibilityScore
        """
        score = calculate_credibility_score(
            app_data=app_data,
            submission_data=submission_data,
        )

        # Store in database
        _store_credibility_score(submission_id, score)

        return score

    def get_credibility_score(self, submission_id: str) -> dict | None:
        """
        Get the stored credibility score for a submission.

        Returns:
            Dict with score data, or None if not calculated
        """
        return _get_credibility_score(submission_id)

    def calculate_credibility_from_stored_data(
        self,
        submission_id: str,
    ) -> CredibilityScore | None:
        """
        Calculate credibility score using app data stored in documents table.

        This is the manual trigger - fetches app_data from documents
        and submission context, then calculates and stores the score.

        Returns:
            The calculated score, or None if no app data found
        """
        app_data = get_app_data_for_submission(submission_id)
        if not app_data:
            return None

        submission_data = get_submission_context(submission_id)

        return self.calculate_and_store_credibility(
            submission_id=submission_id,
            app_data=app_data,
            submission_data=submission_data,
        )


# =============================================================================
# FIELD VALUE STORAGE FUNCTIONS
# =============================================================================

def save_field_value(
    submission_id: str,
    field_name: str,
    value: Any,
    source_type: SourceType,
    confidence: float | None = None,
    source_document_id: str | None = None,
    extraction_metadata: dict | None = None,
    created_by: str = "system",
) -> str | None:
    """
    Save a field value with provenance tracking.

    Only saves if field_name is in TRACKED_FIELDS.

    Args:
        submission_id: UUID of the submission
        field_name: Name of the field
        value: The extracted/entered value
        source_type: How the value was obtained
        confidence: AI confidence score (0-1), None for user edits
        source_document_id: UUID of source document, if applicable
        extraction_metadata: Additional extraction details
        created_by: User or system that created this value

    Returns:
        UUID of the created field_value, or None if not tracked
    """
    if not is_field_tracked(field_name):
        return None

    field_value_id = str(uuid4())

    with get_conn() as conn:
        conn.execute(text("""
            INSERT INTO field_values (
                id, submission_id, field_name, value, source_type,
                source_document_id, confidence, extraction_metadata,
                is_active, created_at, created_by
            ) VALUES (
                :id, :submission_id, :field_name, :value, :source_type,
                :source_document_id, :confidence, :extraction_metadata,
                TRUE, :created_at, :created_by
            )
        """), {
            "id": field_value_id,
            "submission_id": submission_id,
            "field_name": field_name,
            "value": _json_dumps(value),
            "source_type": source_type,
            "source_document_id": source_document_id,
            "confidence": confidence,
            "extraction_metadata": _json_dumps(extraction_metadata) if extraction_metadata else None,
            "created_at": datetime.utcnow(),
            "created_by": created_by,
        })

    # Trigger conflict detection based on strategy
    service = ConflictService()
    service.on_field_value_written(submission_id, field_name)

    return field_value_id


def get_field_values(
    submission_id: str,
    active_only: bool = True,
) -> list[dict]:
    """
    Get all field values for a submission.

    Args:
        submission_id: UUID of the submission
        active_only: If True, only return active (current) values

    Returns:
        List of field value dicts
    """
    where_clause = "submission_id = :submission_id"
    if active_only:
        where_clause += " AND is_active = TRUE"

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT id, submission_id, field_name, value, source_type,
                   source_document_id, confidence, extraction_metadata,
                   is_active, created_at, created_by
            FROM field_values
            WHERE {where_clause}
            ORDER BY field_name, created_at
        """), {"submission_id": submission_id})

        return [
            {
                "id": str(row[0]),
                "submission_id": str(row[1]),
                "field_name": row[2],
                "value": row[3],  # Already JSONB, comes back as Python type
                "source_type": row[4],
                "source_document_id": str(row[5]) if row[5] else None,
                "confidence": float(row[6]) if row[6] is not None else None,
                "extraction_metadata": row[7],
                "is_active": row[8],
                "created_at": row[9],
                "created_by": row[10],
            }
            for row in result.fetchall()
        ]


def get_field_values_for_field(
    submission_id: str,
    field_name: str,
) -> list[dict]:
    """
    Get all values (from all sources) for a specific field.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, submission_id, field_name, value, source_type,
                   source_document_id, confidence, extraction_metadata,
                   is_active, created_at, created_by
            FROM field_values
            WHERE submission_id = :submission_id AND field_name = :field_name
            ORDER BY created_at
        """), {
            "submission_id": submission_id,
            "field_name": field_name,
        })

        return [
            {
                "id": str(row[0]),
                "submission_id": str(row[1]),
                "field_name": row[2],
                "value": row[3],
                "source_type": row[4],
                "source_document_id": str(row[5]) if row[5] else None,
                "confidence": float(row[6]) if row[6] is not None else None,
                "extraction_metadata": row[7],
                "is_active": row[8],
                "created_at": row[9],
                "created_by": row[10],
            }
            for row in result.fetchall()
        ]


def deactivate_field_value(field_value_id: str) -> bool:
    """
    Mark a field value as inactive (historical).

    Use this when a user selects a different value during conflict resolution.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            UPDATE field_values
            SET is_active = FALSE
            WHERE id = :id
        """), {"id": field_value_id})

        return result.rowcount > 0


def set_active_field_value(
    submission_id: str,
    field_name: str,
    field_value_id: str,
) -> bool:
    """
    Set a specific field value as the active one, deactivating others.

    Use this during conflict resolution to select the winning value.
    """
    with get_conn() as conn:
        # Deactivate all values for this field
        conn.execute(text("""
            UPDATE field_values
            SET is_active = FALSE
            WHERE submission_id = :submission_id AND field_name = :field_name
        """), {
            "submission_id": submission_id,
            "field_name": field_name,
        })

        # Activate the chosen value
        result = conn.execute(text("""
            UPDATE field_values
            SET is_active = TRUE
            WHERE id = :id
        """), {"id": field_value_id})

        return result.rowcount > 0


# =============================================================================
# REVIEW ITEM STORAGE FUNCTIONS (PRIVATE)
# =============================================================================

def _store_conflicts(
    submission_id: str,
    conflicts: list[ConflictResult],
) -> None:
    """
    Store detected conflicts in review_items table.

    Clears existing pending conflicts and inserts new ones.
    Preserves resolved/rejected/deferred items.
    """
    with get_conn() as conn:
        # Clear existing pending conflicts (they'll be re-detected)
        conn.execute(text("""
            DELETE FROM review_items
            WHERE submission_id = :submission_id AND status = 'pending'
        """), {"submission_id": submission_id})

        # Insert new conflicts
        for conflict in conflicts:
            conflicting_value_ids = [
                v.get("id") for v in conflict.conflicting_values if v.get("id")
            ]

            # Convert list to PostgreSQL array literal format for UUID[]
            uuid_array_literal = None
            if conflicting_value_ids:
                uuid_array_literal = "{" + ",".join(conflicting_value_ids) + "}"

            conn.execute(text("""
                INSERT INTO review_items (
                    id, submission_id, conflict_type, field_name, priority,
                    status, conflicting_value_ids, conflict_details,
                    detected_at, is_stale
                ) VALUES (
                    :id, :submission_id, :conflict_type, :field_name, :priority,
                    'pending', CAST(:conflicting_value_ids AS uuid[]), :conflict_details,
                    :detected_at, FALSE
                )
            """), {
                "id": str(uuid4()),
                "submission_id": submission_id,
                "conflict_type": conflict.conflict_type,
                "field_name": conflict.field_name,
                "priority": conflict.priority,
                "conflicting_value_ids": uuid_array_literal,
                "conflict_details": _json_dumps({
                    "message": conflict.message,
                    "details": conflict.details,
                    "conflicting_values": conflict.conflicting_values,
                }),
                "detected_at": datetime.utcnow(),
            })


def _get_cached_conflicts(submission_id: str) -> list[dict] | None:
    """
    Get cached conflicts from review_items.

    Returns None if no cached conflicts exist.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT id, conflict_type, field_name, priority, status,
                   conflict_details, resolution, reviewed_by, reviewed_at,
                   detected_at
            FROM review_items
            WHERE submission_id = :submission_id
            ORDER BY
                CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                detected_at
        """), {"submission_id": submission_id})

        rows = result.fetchall()
        if not rows:
            return None

        return [
            {
                "id": str(row[0]),
                "conflict_type": row[1],
                "field_name": row[2],
                "priority": row[3],
                "status": row[4],
                "conflict_details": row[5] or {},
                "resolution": row[6],
                "reviewed_by": row[7],
                "reviewed_at": row[8],
                "detected_at": row[9],
            }
            for row in rows
        ]


def _is_cache_stale(submission_id: str) -> bool:
    """
    Check if cached conflicts are stale.

    Cache is stale if:
    - is_stale flag is set
    - detected_at is older than CACHE_TTL_SECONDS
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                MAX(CASE WHEN is_stale THEN 1 ELSE 0 END) as any_stale,
                MAX(detected_at) as latest_detection
            FROM review_items
            WHERE submission_id = :submission_id AND status = 'pending'
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row or row[1] is None:
            return True  # No cache, consider stale

        any_stale = row[0] == 1
        latest_detection = row[1]

        if any_stale:
            return True

        # Check TTL
        if isinstance(latest_detection, datetime):
            # Handle timezone-aware vs naive datetime comparison
            now = datetime.utcnow()
            if latest_detection.tzinfo is not None:
                # Make now timezone-aware if latest_detection is
                from datetime import timezone
                now = datetime.now(timezone.utc)
            age_seconds = (now - latest_detection).total_seconds()
            return age_seconds > CACHE_TTL_SECONDS

        return False


def _invalidate_cache(submission_id: str) -> None:
    """
    Mark cached conflicts as stale.

    Does not delete them - they'll be refreshed on next read.
    """
    with get_conn() as conn:
        conn.execute(text("""
            UPDATE review_items
            SET is_stale = TRUE
            WHERE submission_id = :submission_id AND status = 'pending'
        """), {"submission_id": submission_id})


# =============================================================================
# REVIEW ITEM QUERY FUNCTIONS
# =============================================================================

def get_review_items(
    submission_id: str,
    status: ReviewStatus | None = None,
) -> list[dict]:
    """
    Get review items for a submission.

    Args:
        submission_id: UUID of the submission
        status: Filter by status (None for all)

    Returns:
        List of review item dicts
    """
    params = {"submission_id": submission_id}
    where_clause = "submission_id = :submission_id"

    if status:
        where_clause += " AND status = :status"
        params["status"] = status

    with get_conn() as conn:
        result = conn.execute(text(f"""
            SELECT id, submission_id, conflict_type, field_name, priority,
                   status, conflicting_value_ids, conflict_details,
                   resolution, reviewed_by, reviewed_at, detected_at, is_stale
            FROM review_items
            WHERE {where_clause}
            ORDER BY
                CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                detected_at
        """), params)

        return [
            {
                "id": str(row[0]),
                "submission_id": str(row[1]),
                "conflict_type": row[2],
                "field_name": row[3],
                "priority": row[4],
                "status": row[5],
                "conflicting_value_ids": row[6] or [],
                "conflict_details": row[7] or {},
                "resolution": row[8],
                "reviewed_by": row[9],
                "reviewed_at": row[10],
                "detected_at": row[11],
                "is_stale": row[12],
            }
            for row in result.fetchall()
        ]


def get_pending_review_count_all() -> dict[str, int]:
    """
    Get count of pending reviews across all submissions.

    Returns:
        Dict mapping submission_id -> pending count
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT submission_id, COUNT(*) as pending_count
            FROM review_items
            WHERE status = 'pending'
            GROUP BY submission_id
        """))

        return {
            str(row[0]): row[1]
            for row in result.fetchall()
        }


# =============================================================================
# DUPLICATE DETECTION (USING VECTOR SIMILARITY)
# =============================================================================

def get_app_data_for_submission(submission_id: str) -> dict | None:
    """
    Retrieve standardized application data for a submission.

    Looks for application.standardized.json in the documents table.
    Returns the nested 'data' object if found, otherwise None.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT extracted_data
            FROM documents
            WHERE submission_id = :submission_id
              AND filename LIKE '%.standardized.json'
            LIMIT 1
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row or not row[0]:
            return None

        extracted = row[0] if isinstance(row[0], dict) else {}
        content = extracted.get("content", {})

        # The actual app data is nested under content.data
        if isinstance(content, dict):
            return content.get("data", content)

        return None


def get_submission_context(submission_id: str) -> dict:
    """
    Get submission metadata for plausibility context.
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT applicant_name, naics_primary_code, annual_revenue,
                   business_summary, industry_tags
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row:
            return {}

        return {
            "applicant_name": row[0],
            "naics_primary_code": row[1],
            "annual_revenue": row[2],
            "business_summary": row[3],
            "industry_tags": row[4],
        }


def check_duplicate_submission(
    submission_id: str,
    similarity_threshold: float = 0.95,
    limit: int = 5,
) -> list[dict]:
    """
    Check for potential duplicate submissions using vector similarity.

    Uses the ops_embedding column for semantic similarity search.

    Args:
        submission_id: UUID of the submission to check
        similarity_threshold: Minimum similarity score (0-1)
        limit: Maximum number of duplicates to return

    Returns:
        List of potential duplicates with similarity scores
    """
    with get_conn() as conn:
        # First get the current submission's embedding
        result = conn.execute(text("""
            SELECT ops_embedding, applicant_name, date_received
            FROM submissions
            WHERE id = :submission_id
        """), {"submission_id": submission_id})

        row = result.fetchone()
        if not row or row[0] is None:
            return []

        embedding = row[0]
        current_name = row[1]
        current_date = row[2]

        # Find similar submissions (excluding self)
        result = conn.execute(text("""
            SELECT
                id, applicant_name, broker_email, date_received,
                1 - (ops_embedding <=> :embedding) as similarity
            FROM submissions
            WHERE id != :submission_id
              AND ops_embedding IS NOT NULL
              AND 1 - (ops_embedding <=> :embedding) >= :threshold
            ORDER BY ops_embedding <=> :embedding
            LIMIT :limit
        """), {
            "submission_id": submission_id,
            "embedding": embedding,
            "threshold": similarity_threshold,
            "limit": limit,
        })

        return [
            {
                "id": str(row[0]),
                "applicant_name": row[1],
                "broker_email": row[2],
                "date_received": row[3],
                "similarity": float(row[4]),
            }
            for row in result.fetchall()
        ]


# =============================================================================
# CREDIBILITY SCORE STORAGE
# =============================================================================

def _store_credibility_score(
    submission_id: str,
    score: CredibilityScore,
) -> None:
    """
    Store or update credibility score for a submission.

    Uses an upsert pattern - inserts if not exists, updates if exists.
    Silently fails if table doesn't exist yet.
    """
    score_data = score.to_dict()

    try:
        with get_conn() as conn:
            # Check if score exists
            result = conn.execute(text("""
                SELECT id FROM credibility_scores WHERE submission_id = :submission_id
            """), {"submission_id": submission_id})

            existing = result.fetchone()

            if existing:
                # Update existing
                conn.execute(text("""
                    UPDATE credibility_scores
                    SET total_score = :total_score,
                        label = :label,
                        consistency_score = :consistency_score,
                        plausibility_score = :plausibility_score,
                        completeness_score = :completeness_score,
                        issue_count = :issue_count,
                        score_details = :score_details,
                        calculated_at = :calculated_at
                    WHERE submission_id = :submission_id
                """), {
                    "submission_id": submission_id,
                    "total_score": score_data["total_score"],
                    "label": score_data["label"],
                    "consistency_score": score_data["dimensions"]["consistency"]["score"],
                    "plausibility_score": score_data["dimensions"]["plausibility"]["score"],
                    "completeness_score": score_data["dimensions"]["completeness"]["score"],
                    "issue_count": len(score_data["issues"]),
                    "score_details": _json_dumps(score_data),
                    "calculated_at": datetime.utcnow(),
                })
            else:
                # Insert new
                conn.execute(text("""
                    INSERT INTO credibility_scores (
                        id, submission_id, total_score, label,
                        consistency_score, plausibility_score, completeness_score,
                        issue_count, score_details, calculated_at
                    ) VALUES (
                        :id, :submission_id, :total_score, :label,
                        :consistency_score, :plausibility_score, :completeness_score,
                        :issue_count, :score_details, :calculated_at
                    )
                """), {
                    "id": str(uuid4()),
                    "submission_id": submission_id,
                    "total_score": score_data["total_score"],
                    "label": score_data["label"],
                    "consistency_score": score_data["dimensions"]["consistency"]["score"],
                    "plausibility_score": score_data["dimensions"]["plausibility"]["score"],
                    "completeness_score": score_data["dimensions"]["completeness"]["score"],
                    "issue_count": len(score_data["issues"]),
                    "score_details": _json_dumps(score_data),
                    "calculated_at": datetime.utcnow(),
                })
    except Exception:
        # Table may not exist yet - silently skip
        pass


def _get_credibility_score(submission_id: str) -> dict | None:
    """
    Get the stored credibility score for a submission.

    Returns:
        Dict with score data, or None if not calculated or table doesn't exist
    """
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT total_score, label, consistency_score, plausibility_score,
                       completeness_score, issue_count, score_details, calculated_at
                FROM credibility_scores
                WHERE submission_id = :submission_id
            """), {"submission_id": submission_id})

            row = result.fetchone()
            if not row:
                return None

            return {
                "total_score": float(row[0]) if row[0] is not None else None,
                "label": row[1],
                "consistency_score": float(row[2]) if row[2] is not None else None,
                "plausibility_score": float(row[3]) if row[3] is not None else None,
                "completeness_score": float(row[4]) if row[4] is not None else None,
                "issue_count": row[5] or 0,
                "details": row[6] or {},
                "calculated_at": row[7],
            }
    except Exception:
        # Table may not exist yet
        return None
