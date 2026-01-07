"""
Supplemental Questions Module

Manages dynamic questionnaires stored in the database.
Questions can have conditional display logic and various input types.

Categories: security_controls, incident_response, training
Input types: text, select, multiselect, boolean, number

See docs/uw-knowledge-base.md for full documentation.
"""

from __future__ import annotations

import json
from typing import Optional

from sqlalchemy import text

from core.db import get_conn


def get_active_questions(category: Optional[str] = None) -> list[dict]:
    """
    Get all active supplemental questions.

    Args:
        category: Optional category filter (e.g., 'security_controls')

    Returns:
        List of question dictionaries ordered by category and display_order
    """
    sql = """
        SELECT
            id,
            question_key,
            question_text,
            category,
            display_order,
            input_type,
            is_required,
            options,
            depends_on,
            help_text,
            validation_pattern
        FROM supplemental_questions
        WHERE is_active = true
    """
    params = {}

    if category:
        sql += " AND category = :category"
        params["category"] = category

    sql += " ORDER BY category, display_order"

    with get_conn() as conn:
        result = conn.execute(text(sql), params)
        rows = result.fetchall()

    return [
        {
            "id": str(row.id),
            "question_key": row.question_key,
            "question_text": row.question_text,
            "category": row.category,
            "display_order": row.display_order,
            "input_type": row.input_type,
            "is_required": row.is_required,
            "options": row.options,
            "depends_on": row.depends_on,
            "help_text": row.help_text,
            "validation_pattern": row.validation_pattern,
        }
        for row in rows
    ]


def get_categories() -> list[dict]:
    """
    Get all question categories with counts.

    Returns:
        List of category dictionaries with question_count and required_count
    """
    sql = """
        SELECT
            category,
            COUNT(*) as question_count,
            COUNT(*) FILTER (WHERE is_required) as required_count
        FROM supplemental_questions
        WHERE is_active = true
        GROUP BY category
        ORDER BY category
    """

    with get_conn() as conn:
        result = conn.execute(text(sql))
        rows = result.fetchall()

    return [
        {
            "category": row.category,
            "question_count": row.question_count,
            "required_count": row.required_count,
        }
        for row in rows
    ]


def get_submission_answers(submission_id: str) -> dict[str, dict]:
    """
    Get all answers for a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        Dictionary keyed by question_key with answer details
    """
    sql = """
        SELECT
            sq.question_key,
            sq.question_text,
            sq.category,
            sq.input_type,
            sa.answer_value,
            sa.answered_by,
            sa.answered_at,
            sa.source,
            sa.confidence
        FROM submission_answers sa
        JOIN supplemental_questions sq ON sq.id = sa.question_id
        WHERE sa.submission_id = :submission_id
    """

    with get_conn() as conn:
        result = conn.execute(text(sql), {"submission_id": submission_id})
        rows = result.fetchall()

    return {
        row.question_key: {
            "question_text": row.question_text,
            "category": row.category,
            "input_type": row.input_type,
            "answer_value": row.answer_value,
            "answered_by": row.answered_by,
            "answered_at": row.answered_at.isoformat() if row.answered_at else None,
            "source": row.source,
            "confidence": float(row.confidence) if row.confidence else None,
        }
        for row in rows
    }


def save_answer(
    submission_id: str,
    question_id: str,
    answer_value: str,
    answered_by: str = "system",
    source: str = "manual",
    confidence: Optional[float] = None,
) -> dict:
    """
    Save or update an answer for a submission.

    Args:
        submission_id: UUID of the submission
        question_id: UUID of the question
        answer_value: The answer value as string
        answered_by: Who provided the answer
        source: 'manual', 'ai_extracted', or 'broker_provided'
        confidence: For AI-extracted answers (0-1)

    Returns:
        The saved answer record
    """
    sql = """
        INSERT INTO submission_answers (
            submission_id, question_id, answer_value, answered_by, source, confidence
        ) VALUES (
            :submission_id, :question_id, :answer_value, :answered_by, :source, :confidence
        )
        ON CONFLICT (submission_id, question_id) DO UPDATE SET
            answer_value = EXCLUDED.answer_value,
            answered_by = EXCLUDED.answered_by,
            source = EXCLUDED.source,
            confidence = EXCLUDED.confidence,
            updated_at = now()
        RETURNING id, answered_at
    """

    with get_conn() as conn:
        result = conn.execute(
            text(sql),
            {
                "submission_id": submission_id,
                "question_id": question_id,
                "answer_value": answer_value,
                "answered_by": answered_by,
                "source": source,
                "confidence": confidence,
            },
        )
        row = result.fetchone()

    return {
        "id": str(row.id),
        "submission_id": submission_id,
        "question_id": question_id,
        "answer_value": answer_value,
        "answered_at": row.answered_at.isoformat() if row.answered_at else None,
    }


def save_answers_bulk(
    submission_id: str,
    answers: list[dict],
    answered_by: str = "system",
) -> int:
    """
    Save multiple answers at once.

    Args:
        submission_id: UUID of the submission
        answers: List of dicts with question_id and answer_value
        answered_by: Who provided the answers

    Returns:
        Number of answers saved
    """
    if not answers:
        return 0

    # Use the database function for efficiency
    sql = """
        SELECT save_submission_answers(
            :submission_id,
            :answers::jsonb,
            :answered_by
        ) as count
    """

    answers_json = json.dumps(answers)

    with get_conn() as conn:
        result = conn.execute(
            text(sql),
            {
                "submission_id": submission_id,
                "answers": answers_json,
                "answered_by": answered_by,
            },
        )
        row = result.fetchone()

    return row.count if row else 0


def get_unanswered_questions(submission_id: str, category: Optional[str] = None) -> list[dict]:
    """
    Get questions that haven't been answered for a submission.

    Args:
        submission_id: UUID of the submission
        category: Optional category filter

    Returns:
        List of unanswered question dictionaries
    """
    sql = """
        SELECT
            sq.id,
            sq.question_key,
            sq.question_text,
            sq.category,
            sq.input_type,
            sq.is_required,
            sq.options,
            sq.depends_on,
            sq.help_text
        FROM supplemental_questions sq
        LEFT JOIN submission_answers sa
            ON sa.question_id = sq.id
            AND sa.submission_id = :submission_id
        WHERE sq.is_active = true
          AND sa.id IS NULL
    """
    params = {"submission_id": submission_id}

    if category:
        sql += " AND sq.category = :category"
        params["category"] = category

    sql += " ORDER BY sq.category, sq.display_order"

    with get_conn() as conn:
        result = conn.execute(text(sql), params)
        rows = result.fetchall()

    return [
        {
            "id": str(row.id),
            "question_key": row.question_key,
            "question_text": row.question_text,
            "category": row.category,
            "input_type": row.input_type,
            "is_required": row.is_required,
            "options": row.options,
            "depends_on": row.depends_on,
            "help_text": row.help_text,
        }
        for row in rows
    ]


def get_answer_progress(submission_id: str) -> dict:
    """
    Get answer progress for a submission.

    Args:
        submission_id: UUID of the submission

    Returns:
        Progress dictionary with totals and percentages by category
    """
    sql = """
        SELECT
            sq.category,
            COUNT(sq.id) as total_questions,
            COUNT(sa.id) as answered_count,
            COUNT(sq.id) FILTER (WHERE sq.is_required) as required_total,
            COUNT(sa.id) FILTER (WHERE sq.is_required) as required_answered
        FROM supplemental_questions sq
        LEFT JOIN submission_answers sa
            ON sa.question_id = sq.id
            AND sa.submission_id = :submission_id
        WHERE sq.is_active = true
        GROUP BY sq.category
        ORDER BY sq.category
    """

    with get_conn() as conn:
        result = conn.execute(text(sql), {"submission_id": submission_id})
        rows = result.fetchall()

    categories = {}
    total_questions = 0
    total_answered = 0
    total_required = 0
    total_required_answered = 0

    for row in rows:
        categories[row.category] = {
            "total": row.total_questions,
            "answered": row.answered_count,
            "required_total": row.required_total,
            "required_answered": row.required_answered,
            "completion_pct": round(
                row.answered_count / row.total_questions * 100, 1
            ) if row.total_questions > 0 else 0,
        }
        total_questions += row.total_questions
        total_answered += row.answered_count
        total_required += row.required_total
        total_required_answered += row.required_answered

    return {
        "categories": categories,
        "total": {
            "questions": total_questions,
            "answered": total_answered,
            "required_total": total_required,
            "required_answered": total_required_answered,
            "completion_pct": round(
                total_answered / total_questions * 100, 1
            ) if total_questions > 0 else 0,
            "required_complete": total_required_answered >= total_required,
        },
    }


def delete_answer(submission_id: str, question_id: str) -> bool:
    """
    Delete an answer for a submission.

    Args:
        submission_id: UUID of the submission
        question_id: UUID of the question

    Returns:
        True if deleted, False if not found
    """
    sql = """
        DELETE FROM submission_answers
        WHERE submission_id = :submission_id
          AND question_id = :question_id
        RETURNING id
    """

    with get_conn() as conn:
        result = conn.execute(
            text(sql),
            {"submission_id": submission_id, "question_id": question_id},
        )
        return result.fetchone() is not None


def create_question(
    question_key: str,
    question_text: str,
    category: str,
    input_type: str = "text",
    is_required: bool = False,
    options: Optional[list] = None,
    depends_on: Optional[dict] = None,
    help_text: Optional[str] = None,
    display_order: int = 0,
) -> dict:
    """
    Create a new supplemental question.

    Args:
        question_key: Unique key (e.g., 'edr_vendor')
        question_text: Display text
        category: Category name
        input_type: 'text', 'select', 'multiselect', 'boolean', 'number'
        is_required: Whether answer is required
        options: For select types
        depends_on: Conditional display logic
        help_text: Tooltip text
        display_order: Sort order within category

    Returns:
        The created question record
    """
    sql = """
        INSERT INTO supplemental_questions (
            question_key, question_text, category, input_type,
            is_required, options, depends_on, help_text, display_order
        ) VALUES (
            :question_key, :question_text, :category, :input_type,
            :is_required, :options, :depends_on, :help_text, :display_order
        )
        RETURNING id, created_at
    """

    with get_conn() as conn:
        result = conn.execute(
            text(sql),
            {
                "question_key": question_key,
                "question_text": question_text,
                "category": category,
                "input_type": input_type,
                "is_required": is_required,
                "options": json.dumps(options) if options else None,
                "depends_on": json.dumps(depends_on) if depends_on else None,
                "help_text": help_text,
                "display_order": display_order,
            },
        )
        row = result.fetchone()

    return {
        "id": str(row.id),
        "question_key": question_key,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def update_question(question_id: str, updates: dict) -> Optional[dict]:
    """
    Update a supplemental question.

    Args:
        question_id: UUID of the question
        updates: Fields to update

    Returns:
        Updated question or None if not found
    """
    allowed_fields = {
        "question_text", "category", "input_type", "is_required",
        "options", "depends_on", "help_text", "display_order", "is_active"
    }

    # Filter to allowed fields
    updates = {k: v for k, v in updates.items() if k in allowed_fields}
    if not updates:
        return None

    # Handle JSON fields
    if "options" in updates and updates["options"] is not None:
        updates["options"] = json.dumps(updates["options"])
    if "depends_on" in updates and updates["depends_on"] is not None:
        updates["depends_on"] = json.dumps(updates["depends_on"])

    set_clauses = [f"{k} = :{k}" for k in updates]
    set_clauses.append("updated_at = now()")

    sql = f"""
        UPDATE supplemental_questions
        SET {', '.join(set_clauses)}
        WHERE id = :question_id
        RETURNING id, question_key, updated_at
    """

    updates["question_id"] = question_id

    with get_conn() as conn:
        result = conn.execute(text(sql), updates)
        row = result.fetchone()

    if not row:
        return None

    return {
        "id": str(row.id),
        "question_key": row.question_key,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def deactivate_question(question_id: str) -> bool:
    """
    Soft-delete a question by marking it inactive.

    Args:
        question_id: UUID of the question

    Returns:
        True if deactivated, False if not found
    """
    sql = """
        UPDATE supplemental_questions
        SET is_active = false, updated_at = now()
        WHERE id = :question_id
        RETURNING id
    """

    with get_conn() as conn:
        result = conn.execute(text(sql), {"question_id": question_id})
        return result.fetchone() is not None
