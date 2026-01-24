"""
AI Admin Agent Module

Provides natural language command parsing and execution for administrative
underwriting actions. Designed for both interactive (Policy tab sidebar)
and batch (dedicated Admin page) use cases.

Supported Actions:
- extend_policy: Extend policy expiration date
- process_bor: Change broker of record
- mark_subjectivity: Mark subjectivity as received
- issue_policy: Issue a bound policy (generate binder)
- file_document: File a document for a submission

Architecture:
1. Command Parser (NL -> Intent + Entities)
2. Policy Resolver (flexible lookup: name, ID, partial match)
3. Action Executor (maps intents to core module functions)
4. Confirmation Flow (builds preview before execution)
"""

from __future__ import annotations

import os
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Optional, Any
from openai import OpenAI
from sqlalchemy import text

from core.db import get_conn


# =============================================================================
# INTENT DEFINITIONS
# =============================================================================

class AdminIntent(str, Enum):
    """Supported admin action intents."""
    EXTEND_POLICY = "extend_policy"
    PROCESS_BOR = "process_bor"
    MARK_SUBJECTIVITY = "mark_subjectivity"
    ISSUE_POLICY = "issue_policy"
    FILE_DOCUMENT = "file_document"
    UNKNOWN = "unknown"


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ParsedCommand:
    """Result of parsing a natural language command."""
    intent: AdminIntent
    entities: dict[str, Any] = field(default_factory=dict)
    raw_input: str = ""
    confidence: float = 0.0
    error: Optional[str] = None


@dataclass
class PolicyMatch:
    """A matched policy/submission with confidence score."""
    submission_id: str
    applicant_name: str
    policy_number: Optional[str] = None
    effective_date: Optional[date] = None
    expiration_date: Optional[date] = None
    is_bound: bool = False
    score: float = 1.0


@dataclass
class ActionPreview:
    """Preview of action to be executed, for user confirmation."""
    intent: AdminIntent
    target: PolicyMatch
    description: str
    changes: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    requires_confirmation: bool = True
    executor_params: dict = field(default_factory=dict)


@dataclass
class ActionResult:
    """Result of executing an action."""
    success: bool
    message: str
    created_ids: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# =============================================================================
# COMMAND PARSER
# =============================================================================

PARSER_SYSTEM_PROMPT = """You are an expert insurance admin assistant. Parse natural language commands into structured actions.

Supported intents:
1. extend_policy - Extend a policy's expiration date
   Entities: policy_identifier (OPTIONAL - user may be viewing a specific policy), extension_days OR new_expiration_date

2. process_bor - Change broker of record
   Entities: policy_identifier (OPTIONAL), new_broker_name, effective_date (OPTIONAL - defaults to today, format: YYYY-MM-DD or natural like "1/1/26")

3. mark_subjectivity - Mark a subjectivity as received
   Entities: policy_identifier (OPTIONAL), subjectivity_description

4. issue_policy - Issue/finalize a bound policy
   Entities: policy_identifier (OPTIONAL)

5. file_document - Attach a document to a policy
   Entities: policy_identifier (OPTIONAL), document_type, document_description

IMPORTANT: policy_identifier is OPTIONAL. The user may be viewing a specific policy already.
Commands like "extend the policy 30 days" or "extend 30 days" are valid - they don't need to name the policy.

Return JSON with this structure:
{
    "intent": "<intent_name>",
    "entities": {
        "policy_identifier": "<name, number, or partial match>" OR null if not specified,
        ...other entities based on intent...
    },
    "confidence": 0.0-1.0
}

If the command is unclear or unsupported, return:
{"intent": "unknown", "entities": {}, "confidence": 0.0, "error": "<explanation>"}

Examples:
- "Extend Toyota's policy by 30 days" -> {"intent": "extend_policy", "entities": {"policy_identifier": "Toyota", "extension_days": 30}, "confidence": 0.95}
- "Extend the policy 30 days" -> {"intent": "extend_policy", "entities": {"policy_identifier": null, "extension_days": 30}, "confidence": 0.95}
- "Extend 30 days" -> {"intent": "extend_policy", "entities": {"policy_identifier": null, "extension_days": 30}, "confidence": 0.9}
- "Change broker to Marsh for Acme Corp" -> {"intent": "process_bor", "entities": {"policy_identifier": "Acme Corp", "new_broker_name": "Marsh", "effective_date": null}, "confidence": 0.9}
- "Change broker to Marsh" -> {"intent": "process_bor", "entities": {"policy_identifier": null, "new_broker_name": "Marsh", "effective_date": null}, "confidence": 0.9}
- "Change broker to Marsh effective 1/1/26" -> {"intent": "process_bor", "entities": {"policy_identifier": null, "new_broker_name": "Marsh", "effective_date": "2026-01-01"}, "confidence": 0.9}
- "Mark financials received" -> {"intent": "mark_subjectivity", "entities": {"policy_identifier": null, "subjectivity_description": "financials"}, "confidence": 0.85}
"""


def parse_command(user_input: str) -> ParsedCommand:
    """
    Parse natural language command into structured intent + entities.
    Uses OpenAI JSON mode for reliable extraction.

    Args:
        user_input: Natural language command

    Returns:
        ParsedCommand with intent, entities, and confidence
    """
    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Fast and cheap for parsing
            messages=[
                {"role": "system", "content": PARSER_SYSTEM_PROMPT},
                {"role": "user", "content": user_input}
            ],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=200
        )

        content = response.choices[0].message.content or "{}"
        data = json.loads(content)

        intent_str = data.get("intent", "unknown")
        try:
            intent = AdminIntent(intent_str)
        except ValueError:
            intent = AdminIntent.UNKNOWN

        return ParsedCommand(
            intent=intent,
            entities=data.get("entities", {}),
            raw_input=user_input,
            confidence=data.get("confidence", 0.0),
            error=data.get("error")
        )
    except Exception as e:
        return ParsedCommand(
            intent=AdminIntent.UNKNOWN,
            raw_input=user_input,
            error=f"Parse error: {str(e)}"
        )


# =============================================================================
# POLICY RESOLVER
# =============================================================================

def resolve_policy(
    identifier: str,
    context_submission_id: Optional[str] = None,
    require_bound: bool = False
) -> list[PolicyMatch]:
    """
    Resolve a policy identifier to submission(s).

    Lookup order:
    1. Exact submission ID (UUID) match
    2. Exact policy number match
    3. Exact applicant name match
    4. Fuzzy applicant name match (trigram similarity)

    Args:
        identifier: Name, policy number, or partial string
        context_submission_id: If provided, prioritize this submission
        require_bound: Only return bound policies

    Returns:
        List of matching policies, ordered by confidence score
    """
    if not identifier:
        # If no identifier but we have context, use context
        if context_submission_id:
            return _get_submission_by_id(context_submission_id, require_bound)
        return []

    matches: list[PolicyMatch] = []

    # Try UUID match first
    if _looks_like_uuid(identifier):
        matches = _get_submission_by_id(identifier, require_bound)
        if matches:
            return matches

    # Try policy number match
    matches = _search_by_policy_number(identifier, require_bound)
    if matches:
        return matches

    # Try exact + fuzzy name match
    matches = _search_by_name(identifier, require_bound)

    # Prioritize context submission if provided
    if context_submission_id and matches:
        matches.sort(
            key=lambda m: (m.submission_id == context_submission_id, m.score),
            reverse=True
        )

    return matches


def _looks_like_uuid(s: str) -> bool:
    """Check if string looks like a UUID."""
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    return bool(re.match(uuid_pattern, s.lower()))


def _get_submission_by_id(submission_id: str, require_bound: bool) -> list[PolicyMatch]:
    """Get submission by exact ID."""
    try:
        with get_conn() as conn:
            bound_filter = """
                AND EXISTS (
                    SELECT 1 FROM insurance_towers t
                    WHERE t.submission_id = s.id AND t.is_bound = TRUE
                )
            """ if require_bound else ""

            # Get effective expiration date by checking for extension endorsements
            result = conn.execute(text(f"""
                SELECT
                    s.id, s.applicant_name,
                    s.effective_date,
                    -- Use latest extension endorsement's new_expiration_date, or fall back to original
                    COALESCE(
                        (SELECT (pe.change_details->>'new_expiration_date')::date
                         FROM policy_endorsements pe
                         WHERE pe.submission_id = s.id
                           AND pe.endorsement_type = 'extension'
                           AND pe.status = 'issued'
                         ORDER BY pe.endorsement_number DESC
                         LIMIT 1),
                        s.expiration_date
                    ) as effective_expiration,
                    EXISTS (
                        SELECT 1 FROM insurance_towers t
                        WHERE t.submission_id = s.id AND t.is_bound = TRUE
                    ) as is_bound
                FROM submissions s
                WHERE s.id = CAST(:submission_id AS uuid)
                {bound_filter}
            """), {"submission_id": str(submission_id)})

            row = result.fetchone()
            if row:
                return [PolicyMatch(
                    submission_id=str(row[0]),
                    applicant_name=row[1] or "Unknown",
                    policy_number=None,
                    effective_date=row[2],
                    expiration_date=row[3],  # Now uses effective expiration
                    is_bound=row[4],
                    score=1.0
                )]
    except Exception as e:
        import logging
        logging.warning(f"_get_submission_by_id error: {e}")
    return []


def _search_by_policy_number(number: str, require_bound: bool) -> list[PolicyMatch]:
    """Search by policy number - not currently supported as policy_number isn't in submissions."""
    # Policy numbers aren't stored in submissions table
    # This function is kept for future use when policy numbers are added
    return []


def _search_by_name(name: str, require_bound: bool) -> list[PolicyMatch]:
    """Search by applicant name (exact + fuzzy with trigram)."""
    try:
        with get_conn() as conn:
            bound_filter = """
                AND EXISTS (
                    SELECT 1 FROM insurance_towers t
                    WHERE t.submission_id = s.id AND t.is_bound = TRUE
                )
            """ if require_bound else ""

            # Use trigram similarity for fuzzy matching
            # Note: Requires pg_trgm extension, fall back to ILIKE if not available
            try:
                result = conn.execute(text(f"""
                    SELECT
                        s.id, s.applicant_name,
                        s.effective_date,
                        -- Use latest extension endorsement's new_expiration_date, or fall back to original
                        COALESCE(
                            (SELECT (pe.change_details->>'new_expiration_date')::date
                             FROM policy_endorsements pe
                             WHERE pe.submission_id = s.id
                               AND pe.endorsement_type = 'extension'
                               AND pe.status = 'issued'
                             ORDER BY pe.endorsement_number DESC
                             LIMIT 1),
                            s.expiration_date
                        ) as effective_expiration,
                        EXISTS (
                            SELECT 1 FROM insurance_towers t
                            WHERE t.submission_id = s.id AND t.is_bound = TRUE
                        ) as is_bound,
                        similarity(LOWER(s.applicant_name), LOWER(:name)) as score
                    FROM submissions s
                    WHERE similarity(LOWER(s.applicant_name), LOWER(:name)) > 0.2
                    {bound_filter}
                    ORDER BY score DESC
                    LIMIT 5
                """), {"name": name})
            except Exception:
                # Fallback to ILIKE if trigram not available
                result = conn.execute(text(f"""
                    SELECT
                        s.id, s.applicant_name,
                        s.effective_date,
                        -- Use latest extension endorsement's new_expiration_date, or fall back to original
                        COALESCE(
                            (SELECT (pe.change_details->>'new_expiration_date')::date
                             FROM policy_endorsements pe
                             WHERE pe.submission_id = s.id
                               AND pe.endorsement_type = 'extension'
                               AND pe.status = 'issued'
                             ORDER BY pe.endorsement_number DESC
                             LIMIT 1),
                            s.expiration_date
                        ) as effective_expiration,
                        EXISTS (
                            SELECT 1 FROM insurance_towers t
                            WHERE t.submission_id = s.id AND t.is_bound = TRUE
                        ) as is_bound,
                        CASE WHEN LOWER(s.applicant_name) = LOWER(:name) THEN 1.0
                             ELSE 0.5 END as score
                    FROM submissions s
                    WHERE LOWER(s.applicant_name) ILIKE LOWER(:pattern)
                    {bound_filter}
                    ORDER BY score DESC
                    LIMIT 5
                """), {"name": name, "pattern": f"%{name}%"})

            return [
                PolicyMatch(
                    submission_id=str(row[0]),
                    applicant_name=row[1] or "Unknown",
                    policy_number=None,
                    effective_date=row[2],
                    expiration_date=row[3],  # Now uses effective expiration
                    is_bound=row[4],
                    score=float(row[5])
                )
                for row in result.fetchall()
            ]
    except Exception as e:
        import logging
        logging.warning(f"_search_by_name error: {e}")
    return []


# =============================================================================
# ACTION EXECUTORS
# =============================================================================

class ActionExecutor:
    """Base class for action executors."""

    def preview(self, target: PolicyMatch, entities: dict) -> ActionPreview:
        """Generate preview of action for confirmation."""
        raise NotImplementedError

    def execute(self, preview: ActionPreview) -> ActionResult:
        """Execute the confirmed action."""
        raise NotImplementedError


class ExtendPolicyExecutor(ActionExecutor):
    """Executor for policy extension."""

    def preview(self, target: PolicyMatch, entities: dict) -> ActionPreview:
        from core import bound_option
        from core.endorsement_management import calculate_pro_rata_premium

        current_exp = target.expiration_date

        # Calculate new expiration
        if "new_expiration_date" in entities:
            new_exp = _parse_date(entities["new_expiration_date"])
            days = (new_exp - current_exp).days if new_exp and current_exp else None
        elif "extension_days" in entities:
            days = int(entities["extension_days"])
            new_exp = current_exp + timedelta(days=days) if current_exp else None
        else:
            # Default 30 days
            days = 30
            new_exp = current_exp + timedelta(days=days) if current_exp else None

        # Get base premium for pro-rata calculation
        bound = bound_option.get_bound_option(target.submission_id)
        base_premium = float(bound.get("sold_premium") or 0) if bound else 0

        # Calculate pro-rata premium for extension period
        premium_change = 0.0
        if days and days > 0 and base_premium > 0:
            premium_change = calculate_pro_rata_premium(base_premium, days)

        warnings = []
        if not target.is_bound:
            warnings.append("Policy is not bound - extension requires bound policy")
        if days and days > 90:
            warnings.append("Extension exceeds 90 days - may require additional approval")
        if not current_exp:
            warnings.append("Current expiration date not set")

        changes = [{
            "field": "expiration_date",
            "from": str(current_exp) if current_exp else "N/A",
            "to": str(new_exp) if new_exp else "N/A"
        }]

        # Add premium change to preview
        if premium_change > 0:
            changes.append({
                "field": "premium",
                "from": f"${base_premium:,.0f}",
                "to": f"${base_premium + premium_change:,.0f} (+${premium_change:,.0f})"
            })

        return ActionPreview(
            intent=AdminIntent.EXTEND_POLICY,
            target=target,
            description=f"Extend policy for {target.applicant_name} by {days} days",
            changes=changes,
            warnings=warnings,
            executor_params={
                "new_expiration_date": new_exp.isoformat() if new_exp else None,
                "original_expiration_date": current_exp.isoformat() if current_exp else None,
                "extension_days": days,
                "base_premium": base_premium,
                "premium_change": premium_change
            }
        )

    def execute(self, preview: ActionPreview) -> ActionResult:
        from core import bound_option
        from core import endorsement_management as endorsements

        params = preview.executor_params
        target = preview.target

        try:
            # Get bound tower
            bound = bound_option.get_bound_option(target.submission_id)
            if not bound:
                return ActionResult(
                    success=False,
                    message="No bound option found",
                    errors=["Policy must be bound before extension"]
                )

            new_exp = params.get("new_expiration_date")
            original_exp = params.get("original_expiration_date")
            days = params.get("extension_days", 30)
            base_premium = params.get("base_premium", 0)
            premium_change = params.get("premium_change", 0)

            # Create extension endorsement with premium and original expiration
            endo_id = endorsements.create_endorsement(
                submission_id=target.submission_id,
                tower_id=bound["id"],
                endorsement_type="extension",
                effective_date=date.today(),
                description=f"Policy extended to {new_exp}",
                change_details={
                    "new_expiration_date": new_exp,
                    "original_expiration_date": original_exp
                },
                premium_method="pro_rata",
                premium_change=premium_change,
                original_annual_premium=base_premium,
                days_remaining=days,
                created_by="admin_agent"
            )

            # Auto-issue the endorsement
            endorsements.issue_endorsement(endo_id, issued_by="admin_agent")

            premium_msg = f" (premium +${premium_change:,.0f})" if premium_change > 0 else ""
            return ActionResult(
                success=True,
                message=f"Policy extended to {new_exp}{premium_msg}",
                created_ids=[endo_id]
            )

        except Exception as e:
            return ActionResult(
                success=False,
                message=f"Extension failed: {str(e)}",
                errors=[str(e)]
            )


class ProcessBORExecutor(ActionExecutor):
    """Executor for broker of record changes."""

    def preview(self, target: PolicyMatch, entities: dict) -> ActionPreview:
        from core import bor_management as bor

        new_broker_name = entities.get("new_broker_name", "")
        search_lower = new_broker_name.lower()

        # Parse effective date from entities (or default to today)
        effective_date = date.today()
        if entities.get("effective_date"):
            parsed = _parse_date(entities["effective_date"])
            if parsed:
                effective_date = parsed

        # Search by person name or org name in employments
        # User might type "Steve Smith" (person) or "Panthers Brokerage" (org)
        all_employments = bor.get_all_broker_employments()
        matching_emp = None
        for emp in all_employments:
            if (search_lower in emp["person_name"].lower() or
                search_lower in emp["org_name"].lower()):
                matching_emp = emp
                break

        # Get current broker
        current_broker = bor.get_current_broker(target.submission_id)
        # Build display name for current broker (org + contact if available)
        current_broker_eff_date = None
        if current_broker:
            current_name = current_broker["broker_name"] or "None"
            if current_broker.get("contact_name"):
                current_name = f"{current_name} ({current_broker['contact_name']})"
            current_broker_eff_date = current_broker.get("effective_date")
        else:
            current_name = "None"

        warnings = []
        if not target.is_bound:
            warnings.append("Policy is not bound - BOR change requires bound policy")
        if not matching_emp:
            warnings.append(f"Broker '{new_broker_name}' not found - please select from list")

        # Validate effective date is not before current broker's effective date
        if current_broker_eff_date and effective_date < current_broker_eff_date:
            warnings.append(
                f"Effective date {effective_date} is before current broker's effective date "
                f"({current_broker_eff_date}). Must be on or after {current_broker_eff_date}."
            )

        # Build display name for matched broker (org + person)
        if matching_emp:
            display_name = f"{matching_emp['org_name']} ({matching_emp['person_name']})"
        else:
            display_name = new_broker_name

        # Build changes list with effective date
        changes = [
            {"field": "broker", "from": current_name, "to": display_name},
            {"field": "effective_date", "from": str(current_broker_eff_date) if current_broker_eff_date else "N/A", "to": str(effective_date)}
        ]

        return ActionPreview(
            intent=AdminIntent.PROCESS_BOR,
            target=target,
            description=f"Change broker for {target.applicant_name}",
            changes=changes,
            warnings=warnings,
            executor_params={
                "new_broker_id": matching_emp["org_id"] if matching_emp else None,
                "new_broker_name": matching_emp["org_name"] if matching_emp else new_broker_name,
                "new_contact_id": matching_emp["id"] if matching_emp else None,
                "current_broker": current_broker,
                "effective_date": effective_date.isoformat()
            }
        )

    def execute(self, preview: ActionPreview) -> ActionResult:
        from core import bound_option
        from core import endorsement_management as endorsements
        from core import bor_management as bor

        params = preview.executor_params
        target = preview.target

        if not params.get("new_broker_id"):
            return ActionResult(
                success=False,
                message="Broker not found",
                errors=["Please select a valid broker from the system"]
            )

        try:
            bound = bound_option.get_bound_option(target.submission_id)
            if not bound:
                return ActionResult(
                    success=False,
                    message="No bound option found",
                    errors=["Policy must be bound for BOR change"]
                )

            current = params.get("current_broker") or {}

            # Build change details (including contact if selected)
            change_details = bor.build_bor_change_details(
                previous_broker_id=current.get("broker_id"),
                previous_broker_name=current.get("broker_name", "None"),
                new_broker_id=params["new_broker_id"],
                new_broker_name=params["new_broker_name"],
                previous_contact_id=current.get("broker_contact_id"),
                previous_contact_name=current.get("contact_name"),
                new_contact_id=params.get("new_contact_id"),
                change_reason="BOR change via admin agent"
            )

            # Parse effective date from params (or default to today)
            eff_date_str = params.get("effective_date")
            eff_date = date.fromisoformat(eff_date_str) if eff_date_str else date.today()

            # Create BOR endorsement
            endo_id = endorsements.create_endorsement(
                submission_id=target.submission_id,
                tower_id=bound["id"],
                endorsement_type="bor_change",
                effective_date=eff_date,
                description=f"Broker of Record change to {params['new_broker_name']}",
                change_details=change_details,
                created_by="admin_agent"
            )

            # Issue the endorsement (this triggers broker history updates)
            endorsements.issue_endorsement(endo_id, issued_by="admin_agent")

            return ActionResult(
                success=True,
                message=f"Broker changed to {params['new_broker_name']}",
                created_ids=[endo_id]
            )

        except Exception as e:
            return ActionResult(
                success=False,
                message=f"BOR change failed: {str(e)}",
                errors=[str(e)]
            )


class MarkSubjectivityExecutor(ActionExecutor):
    """Executor for marking subjectivities as received."""

    def preview(self, target: PolicyMatch, entities: dict) -> ActionPreview:
        from core import subjectivity_management as subj_mgmt

        subj_desc = entities.get("subjectivity_description", "")

        # Find matching subjectivity
        matching = subj_mgmt.find_matching_subjectivity(
            target.submission_id,
            subj_desc,
            status="pending"
        )

        warnings = []
        if not matching:
            warnings.append(f"No pending subjectivity matching '{subj_desc}' found")

        return ActionPreview(
            intent=AdminIntent.MARK_SUBJECTIVITY,
            target=target,
            description=f"Mark subjectivity received for {target.applicant_name}",
            changes=[{
                "field": "subjectivity",
                "from": matching["text"][:50] + "..." if matching and len(matching["text"]) > 50 else (matching["text"] if matching else "N/A"),
                "to": "received"
            }] if matching else [],
            warnings=warnings,
            executor_params={
                "subjectivity_id": matching["id"] if matching else None,
                "subjectivity_text": matching["text"] if matching else subj_desc
            }
        )

    def execute(self, preview: ActionPreview) -> ActionResult:
        from core import subjectivity_management as subj_mgmt

        params = preview.executor_params

        if not params.get("subjectivity_id"):
            return ActionResult(
                success=False,
                message="Subjectivity not found",
                errors=[f"No pending subjectivity matching '{params.get('subjectivity_text', '')}' found"]
            )

        try:
            success = subj_mgmt.mark_received(
                subjectivity_id=params["subjectivity_id"],
                received_by="admin_agent",
                notes="Marked via admin agent"
            )

            if success:
                return ActionResult(
                    success=True,
                    message="Subjectivity marked as received"
                )
            else:
                return ActionResult(
                    success=False,
                    message="Failed to update subjectivity",
                    errors=["Database update failed"]
                )

        except Exception as e:
            return ActionResult(
                success=False,
                message=f"Failed to mark subjectivity: {str(e)}",
                errors=[str(e)]
            )


class IssuePolicyExecutor(ActionExecutor):
    """Executor for issuing/binding a policy."""

    def preview(self, target: PolicyMatch, entities: dict) -> ActionPreview:
        from core import subjectivity_management as subj_mgmt

        warnings = []

        # Check pending subjectivities
        pending_count = subj_mgmt.get_pending_count(target.submission_id)
        if pending_count > 0:
            warnings.append(f"{pending_count} subjectivities still pending")

        if target.is_bound:
            warnings.append("Policy is already bound")

        return ActionPreview(
            intent=AdminIntent.ISSUE_POLICY,
            target=target,
            description=f"Issue policy for {target.applicant_name}",
            changes=[{
                "field": "status",
                "from": "quoted",
                "to": "bound"
            }],
            warnings=warnings,
            executor_params={}
        )

    def execute(self, preview: ActionPreview) -> ActionResult:
        from core import bound_option
        from core import document_generator

        target = preview.target

        if target.is_bound:
            # Already bound, just regenerate binder
            try:
                doc = document_generator.generate_document(
                    submission_id=target.submission_id,
                    doc_type="binder"
                )
                return ActionResult(
                    success=True,
                    message="Binder regenerated",
                    created_ids=[doc.get("id")] if doc else []
                )
            except Exception as e:
                return ActionResult(
                    success=False,
                    message=f"Failed to regenerate binder: {str(e)}",
                    errors=[str(e)]
                )

        # Need to bind - but we need a tower_id
        # This action requires the user to select which quote option to bind
        return ActionResult(
            success=False,
            message="Cannot auto-bind: Please select a quote option to bind",
            errors=["Multiple quote options may exist - manual selection required"]
        )


# Executor registry
EXECUTORS: dict[AdminIntent, ActionExecutor] = {
    AdminIntent.EXTEND_POLICY: ExtendPolicyExecutor(),
    AdminIntent.PROCESS_BOR: ProcessBORExecutor(),
    AdminIntent.MARK_SUBJECTIVITY: MarkSubjectivityExecutor(),
    AdminIntent.ISSUE_POLICY: IssuePolicyExecutor(),
    # FILE_DOCUMENT not yet implemented - requires file upload handling
}


# =============================================================================
# MAIN API
# =============================================================================

def process_command(
    user_input: str,
    context_submission_id: Optional[str] = None
) -> tuple[ParsedCommand, list[PolicyMatch], Optional[ActionPreview]]:
    """
    Main entry point for processing admin commands.

    Args:
        user_input: Natural language command
        context_submission_id: Current policy context (from Policy tab)

    Returns:
        Tuple of:
        - Parsed command
        - Matching policies (for disambiguation)
        - Action preview (if single high-confidence match)
    """
    # 1. Parse command
    parsed = parse_command(user_input)

    if parsed.intent == AdminIntent.UNKNOWN:
        return parsed, [], None

    # 2. Resolve policy
    policy_id = parsed.entities.get("policy_identifier")

    # Handle null/None/empty string - if no identifier, use context
    if not policy_id or policy_id == "null":
        policy_id = context_submission_id

    # Determine if bound is required for this action
    require_bound = parsed.intent in [
        AdminIntent.EXTEND_POLICY,
        AdminIntent.PROCESS_BOR
    ]

    matches = resolve_policy(
        identifier=str(policy_id) if policy_id else "",
        context_submission_id=context_submission_id,
        require_bound=require_bound
    )

    if not matches:
        return parsed, [], None

    # 3. If single match, generate preview (lower threshold since user will confirm)
    if len(matches) == 1 and matches[0].score >= 0.3:
        executor = EXECUTORS.get(parsed.intent)
        if executor:
            try:
                preview = executor.preview(matches[0], parsed.entities)
                return parsed, matches, preview
            except Exception:
                pass

    # Multiple matches or low confidence - return for disambiguation
    return parsed, matches, None


def execute_action(preview: ActionPreview) -> ActionResult:
    """Execute a confirmed action."""
    executor = EXECUTORS.get(preview.intent)
    if not executor:
        return ActionResult(
            success=False,
            message=f"No executor for intent: {preview.intent}",
            errors=["Unsupported action"]
        )

    return executor.execute(preview)


def get_action_for_policy(
    intent: AdminIntent,
    submission_id: str,
    entities: dict
) -> Optional[ActionPreview]:
    """
    Get action preview for a specific policy.
    Used when policy is already known (e.g., from Policy tab context).

    Args:
        intent: The action intent
        submission_id: UUID of the submission
        entities: Extracted entities from command

    Returns:
        ActionPreview or None
    """
    matches = resolve_policy(submission_id)
    if not matches:
        return None

    executor = EXECUTORS.get(intent)
    if not executor:
        return None

    try:
        return executor.preview(matches[0], entities)
    except Exception:
        return None


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def _parse_date(date_str: str) -> Optional[date]:
    """Parse various date formats."""
    if not date_str:
        return None

    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%B %d, %Y", "%b %d, %Y"]:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def get_supported_intents() -> list[dict]:
    """Get list of supported intents with descriptions."""
    return [
        {
            "intent": AdminIntent.EXTEND_POLICY.value,
            "name": "Extend Policy",
            "description": "Extend a policy's expiration date",
            "example": "Extend Toyota's policy by 30 days"
        },
        {
            "intent": AdminIntent.PROCESS_BOR.value,
            "name": "Change Broker",
            "description": "Change broker of record",
            "example": "Change broker to Marsh for Acme Corp"
        },
        {
            "intent": AdminIntent.MARK_SUBJECTIVITY.value,
            "name": "Mark Subjectivity",
            "description": "Mark a subjectivity as received",
            "example": "Mark financials received for Toyota"
        },
        {
            "intent": AdminIntent.ISSUE_POLICY.value,
            "name": "Issue Policy",
            "description": "Issue/finalize a bound policy",
            "example": "Issue the policy for XYZ Inc"
        }
    ]
