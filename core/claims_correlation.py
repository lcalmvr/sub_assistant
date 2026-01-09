"""
Claims Correlation Module (Phase 5)

Correlates bind-time security controls with claims outcomes to:
1. Calculate which controls reduce loss ratios (lift analysis)
2. Analyze performance by importance version
3. Generate recommendations for importance updates
"""

from typing import Optional
import json
from datetime import date

from sqlalchemy import text
from core.db import get_conn

# Default thresholds
DEFAULT_MIN_SAMPLE_SIZE = 10
DEFAULT_MIN_EXPOSURE_MONTHS = 12

# Lift thresholds for importance recommendations
LIFT_THRESHOLDS = {
    'critical': 25,      # 25%+ lift = recommend critical
    'important': 10,     # 10-25% lift = recommend important
    'nice_to_know': 0,   # 0-10% lift = nice to know
}

# Boolean control fields to analyze
BOOLEAN_CONTROL_FIELDS = [
    'emailMfa',
    'remoteAccessMfa',
    'privilegedAccountMfa',
    'backupMfa',
    'hasEdr',
    'hasSecurityAwarenessTraining',
    'hasOfflineBackups',
    'hasOffsiteBackups',
    'hasImmutableBackups',
    'hasEncryptedBackups',
    'hasSiem',
    'hasIncidentResponsePlan',
    'hasVulnerabilityScanning',
    'hasDlp',
    'hasNetworkSegmentation',
]


def get_claims_analytics_summary() -> dict:
    """
    Get overall claims analytics summary for dashboard.

    Returns:
        dict with total_bound_policies, total_earned_premium, total_claims,
        total_incurred, avg_loss_ratio, median_loss_ratio, policies_with_claims,
        claim_frequency_pct
    """
    with get_conn() as conn:
        result = conn.execute(text("SELECT * FROM v_claims_analytics_summary"))
        row = result.mappings().fetchone()

    if not row:
        return {
            'total_bound_policies': 0,
            'total_earned_premium': 0,
            'total_claims': 0,
            'total_incurred': 0,
            'loss_ratio': None,
            'policies_with_claims': 0,
            'claim_frequency_pct': 0,
        }

    return {
        'total_bound_policies': row['total_bound_policies'] or 0,
        'total_earned_premium': float(row['total_earned_premium'] or 0),
        'total_claims': row['total_claims'] or 0,
        'total_incurred': float(row['total_incurred'] or 0),
        'loss_ratio': float(row['loss_ratio']) if row['loss_ratio'] else None,
        'policies_with_claims': row['policies_with_claims'] or 0,
        'claim_frequency_pct': float(row['claim_frequency_pct']) if row['claim_frequency_pct'] else 0,
    }


def get_control_impact_analysis(
    field_keys: list[str] = None,
    min_sample_size: int = DEFAULT_MIN_SAMPLE_SIZE,
    min_exposure_months: int = DEFAULT_MIN_EXPOSURE_MONTHS,
) -> list[dict]:
    """
    Analyze loss ratio impact for each control field.

    Args:
        field_keys: List of field keys to analyze (default: all boolean controls)
        min_sample_size: Minimum policies per group for statistical validity
        min_exposure_months: Minimum months since bind for claims to develop

    Returns:
        List of dicts with field_key, field_name, current_importance,
        with_count, without_count, loss_ratio_with, loss_ratio_without,
        lift_pct, confidence, recommended_importance, change_recommended
    """
    if not field_keys:
        field_keys = BOOLEAN_CONTROL_FIELDS

    results = []

    with get_conn() as conn:
        # Get field metadata and current importance
        result = conn.execute(text("""
            SELECT sf.key, sf.display_name, fis.importance
            FROM schema_fields sf
            LEFT JOIN field_importance_settings fis ON fis.field_key = sf.key
            LEFT JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
            WHERE sf.key = ANY(:field_keys)
        """), {"field_keys": field_keys})
        field_meta = {r[0]: {'key': r[0], 'display_name': r[1], 'importance': r[2]} for r in result.fetchall()}

        # Analyze each field
        for field_key in field_keys:
            meta = field_meta.get(field_key, {})

            result = conn.execute(text("""
                SELECT * FROM calculate_control_impact(:field_key, :min_sample, :min_months)
            """), {
                "field_key": field_key,
                "min_sample": min_sample_size,
                "min_months": min_exposure_months
            })
            row = result.mappings().fetchone()

            if not row or (row['value_present_count'] == 0 and row['value_absent_count'] == 0):
                continue

            # Calculate recommended importance based on lift
            lift = float(row['lift_pct']) if row['lift_pct'] else 0
            if lift >= LIFT_THRESHOLDS['critical']:
                recommended = 'critical'
            elif lift >= LIFT_THRESHOLDS['important']:
                recommended = 'important'
            else:
                recommended = 'nice_to_know'

            current_importance = meta.get('importance') or 'none'

            results.append({
                'field_key': field_key,
                'field_name': meta.get('display_name', field_key),
                'current_importance': current_importance,
                'with_count': row['value_present_count'] or 0,
                'without_count': row['value_absent_count'] or 0,
                'loss_ratio_with': float(row['loss_ratio_with']) if row['loss_ratio_with'] else None,
                'loss_ratio_without': float(row['loss_ratio_without']) if row['loss_ratio_without'] else None,
                'lift_pct': float(row['lift_pct']) if row['lift_pct'] else None,
                'confidence': row['statistical_confidence'] or 'low',
                'premium_with': float(row['premium_with']) if row['premium_with'] else 0,
                'premium_without': float(row['premium_without']) if row['premium_without'] else 0,
                'recommended_importance': recommended,
                'change_recommended': recommended != current_importance and row['statistical_confidence'] in ('high', 'medium'),
            })

    # Sort by lift (highest first)
    results.sort(key=lambda x: x['lift_pct'] or 0, reverse=True)
    return results


def get_loss_ratio_by_version() -> list[dict]:
    """
    Get aggregate loss ratio by importance version.
    Used to compare portfolio performance across different priority configurations.

    Returns:
        List of dicts with version_id, version_number, version_name, is_active,
        policy_count, total_premium, total_incurred, total_claims,
        aggregate_loss_ratio, avg_loss_ratio
    """
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT * FROM v_loss_ratio_by_version
            ORDER BY version_number DESC
        """))
        rows = result.mappings().fetchall()

    return [
        {
            'version_id': str(r['version_id']),
            'version_number': r['version_number'],
            'version_name': r['version_name'],
            'is_active': r['is_active'],
            'version_created': r['version_created'].isoformat() if r['version_created'] else None,
            'based_on_claims_through': r['based_on_claims_through'].isoformat() if r['based_on_claims_through'] else None,
            'policy_count': r['policy_count'] or 0,
            'total_premium': float(r['total_premium'] or 0),
            'total_incurred': float(r['total_incurred'] or 0),
            'total_claims': r['total_claims'] or 0,
            'aggregate_loss_ratio': float(r['aggregate_loss_ratio']) if r['aggregate_loss_ratio'] else None,
            'avg_loss_ratio': float(r['avg_loss_ratio']) if r['avg_loss_ratio'] else None,
        }
        for r in rows
    ]


def generate_importance_recommendations(
    min_sample_size: int = DEFAULT_MIN_SAMPLE_SIZE,
    min_exposure_months: int = DEFAULT_MIN_EXPOSURE_MONTHS,
    created_by: str = 'system',
) -> dict:
    """
    Generate and store importance change recommendations based on claims data.

    Args:
        min_sample_size: Minimum policies per group
        min_exposure_months: Minimum exposure period
        created_by: Who triggered the analysis

    Returns:
        The created recommendation record with id, recommendations, status
    """
    # Get control impact analysis
    impacts = get_control_impact_analysis(
        min_sample_size=min_sample_size,
        min_exposure_months=min_exposure_months,
    )

    # Filter to only those with recommended changes and sufficient confidence
    recommendations = [
        {
            'field_key': imp['field_key'],
            'field_name': imp['field_name'],
            'current_importance': imp['current_importance'],
            'recommended_importance': imp['recommended_importance'],
            'lift_pct': imp['lift_pct'],
            'sample_size': imp['with_count'] + imp['without_count'],
            'confidence': imp['confidence'],
            'rationale': f"{imp['lift_pct']:.1f}% loss ratio reduction when control present" if imp['lift_pct'] else "Insufficient data",
        }
        for imp in impacts
        if imp['change_recommended']
    ]

    # Store recommendation
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO claims_correlation_recommendations
            (analyzed_by, claims_through, min_sample_size, min_exposure_months,
             recommendations, total_fields_analyzed, fields_with_changes)
            VALUES (:created_by, CURRENT_DATE, :min_sample, :min_months, :recs, :total, :changes)
            RETURNING id, analyzed_at, recommendations, status
        """), {
            "created_by": created_by,
            "min_sample": min_sample_size,
            "min_months": min_exposure_months,
            "recs": json.dumps(recommendations),
            "total": len(impacts),
            "changes": len(recommendations),
        })
        row = result.mappings().fetchone()

    return {
        'id': str(row['id']),
        'analyzed_at': row['analyzed_at'].isoformat(),
        'recommendations': row['recommendations'],
        'status': row['status'],
        'total_fields_analyzed': len(impacts),
        'fields_with_changes': len(recommendations),
    }


def get_recommendations(status: Optional[str] = None, limit: int = 50) -> list[dict]:
    """
    Get stored recommendation records.

    Args:
        status: Filter by status (pending, reviewed, applied, rejected)
        limit: Maximum records to return

    Returns:
        List of recommendation records
    """
    with get_conn() as conn:
        if status:
            result = conn.execute(text("""
                SELECT id, analyzed_at, analyzed_by, claims_through,
                       min_sample_size, min_exposure_months,
                       recommendations, total_fields_analyzed, fields_with_changes,
                       status, reviewed_by, reviewed_at, review_notes, applied_version_id
                FROM claims_correlation_recommendations
                WHERE status = :status
                ORDER BY analyzed_at DESC
                LIMIT :limit
            """), {"status": status, "limit": limit})
        else:
            result = conn.execute(text("""
                SELECT id, analyzed_at, analyzed_by, claims_through,
                       min_sample_size, min_exposure_months,
                       recommendations, total_fields_analyzed, fields_with_changes,
                       status, reviewed_by, reviewed_at, review_notes, applied_version_id
                FROM claims_correlation_recommendations
                ORDER BY analyzed_at DESC
                LIMIT :limit
            """), {"limit": limit})
        rows = result.mappings().fetchall()

    return [
        {
            'id': str(r['id']),
            'analyzed_at': r['analyzed_at'].isoformat() if r['analyzed_at'] else None,
            'analyzed_by': r['analyzed_by'],
            'claims_through': r['claims_through'].isoformat() if r['claims_through'] else None,
            'min_sample_size': r['min_sample_size'],
            'min_exposure_months': r['min_exposure_months'],
            'recommendations': r['recommendations'],
            'total_fields_analyzed': r['total_fields_analyzed'],
            'fields_with_changes': r['fields_with_changes'],
            'status': r['status'],
            'reviewed_by': r['reviewed_by'],
            'reviewed_at': r['reviewed_at'].isoformat() if r['reviewed_at'] else None,
            'review_notes': r['review_notes'],
            'applied_version_id': str(r['applied_version_id']) if r['applied_version_id'] else None,
        }
        for r in rows
    ]


def apply_recommendations(
    recommendation_id: str,
    version_name: str,
    version_description: str,
    applied_by: str = 'admin',
) -> dict:
    """
    Apply a set of recommendations by creating a new importance version.

    Args:
        recommendation_id: UUID of the recommendation record
        version_name: Name for the new version
        version_description: Description explaining the changes
        applied_by: Who is applying the changes

    Returns:
        Dict with version_id, version_number, changes_applied

    Raises:
        ValueError: If recommendation not found or already processed
    """
    with get_conn() as conn:
        # Get the recommendation
        result = conn.execute(text("""
            SELECT * FROM claims_correlation_recommendations
            WHERE id = :rec_id AND status = 'pending'
        """), {"rec_id": recommendation_id})
        rec = result.mappings().fetchone()

        if not rec:
            raise ValueError("Recommendation not found or already processed")

        recommendations = rec['recommendations']
        claims_through = rec['claims_through']

        # Get next version number
        result = conn.execute(text("SELECT COALESCE(MAX(version_number), 0) + 1 FROM importance_versions"))
        next_ver = result.fetchone()[0]

        # Create new version
        result = conn.execute(text("""
            INSERT INTO importance_versions
            (version_number, name, description, is_active, created_by, based_on_claims_through)
            VALUES (:ver_num, :name, :desc, false, :by, :claims_through)
            RETURNING id
        """), {
            "ver_num": next_ver,
            "name": version_name,
            "desc": version_description,
            "by": applied_by,
            "claims_through": claims_through,
        })
        new_version_id = result.fetchone()[0]

        # Copy existing settings from active version
        result = conn.execute(text("""
            INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
            SELECT :new_ver, field_key, importance, rationale
            FROM field_importance_settings fis
            JOIN importance_versions iv ON iv.id = fis.version_id AND iv.is_active = true
        """), {"new_ver": new_version_id})
        copied_count = result.rowcount

        # Apply the recommended changes
        for rec_item in recommendations:
            conn.execute(text("""
                INSERT INTO field_importance_settings (version_id, field_key, importance, rationale)
                VALUES (:ver_id, :field_key, :importance, :rationale)
                ON CONFLICT (version_id, field_key)
                DO UPDATE SET importance = EXCLUDED.importance, rationale = EXCLUDED.rationale
            """), {
                "ver_id": new_version_id,
                "field_key": rec_item['field_key'],
                "importance": rec_item['recommended_importance'],
                "rationale": rec_item['rationale'],
            })

        # Update recommendation status
        conn.execute(text("""
            UPDATE claims_correlation_recommendations
            SET status = 'applied',
                reviewed_by = :by,
                reviewed_at = NOW(),
                applied_version_id = :ver_id
            WHERE id = :rec_id
        """), {"by": applied_by, "ver_id": new_version_id, "rec_id": recommendation_id})

    return {
        'version_id': str(new_version_id),
        'version_number': next_ver,
        'changes_applied': len(recommendations),
        'fields_copied': copied_count,
    }


def refresh_materialized_view():
    """Refresh the claims correlation materialized view."""
    with get_conn() as conn:
        conn.execute(text("SELECT refresh_claims_correlation()"))
    return {'status': 'refreshed'}
