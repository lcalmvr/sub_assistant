"""
Statistics API endpoints
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.db import get_conn
from broker_portal.api.auth import get_current_broker_from_session
from broker_portal.api.submissions import get_broker_submission_ids
from broker_portal.api.models import StatsResponse

router = APIRouter()


@router.get("", response_model=StatsResponse)
async def get_statistics(broker: dict = Depends(get_current_broker_from_session)):
    """
    Get detailed statistics for the broker's submissions.
    """
    # Get submission IDs the broker can access
    submission_ids = get_broker_submission_ids(broker)
    
    if not submission_ids:
        return StatsResponse(
            total_submissions=0,
            submissions_by_status={},
            submissions_by_outcome={},
            bound_rate=0.0,
            lost_rate=0.0,
            total_premium=0.0,
            average_premium=0.0,
            average_deal_size=0.0,
            average_time_to_quote_days=None,
            average_time_to_bind_days=None
        )
    
    with get_conn() as conn:
        # Basic counts - use IN clause with proper parameter binding
        # Convert to list of UUID strings for SQL
        submission_ids_list = [str(sid) for sid in submission_ids]
        # Use unnest with array parameter
        result = conn.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE submission_status = 'received') as received,
                COUNT(*) FILTER (WHERE submission_status = 'pending_info') as pending_info,
                COUNT(*) FILTER (WHERE submission_status = 'quoted') as quoted,
                COUNT(*) FILTER (WHERE submission_status = 'declined') as declined,
                COUNT(*) FILTER (WHERE submission_outcome = 'pending') as pending,
                COUNT(*) FILTER (WHERE submission_outcome = 'bound') as bound,
                COUNT(*) FILTER (WHERE submission_outcome = 'lost') as lost,
                COUNT(*) FILTER (WHERE submission_outcome = 'declined') as declined_outcome
            FROM submissions
            WHERE id::text IN (SELECT unnest(CAST(:submission_ids AS text[])))
        """), {"submission_ids": submission_ids_list})
        
        row = result.fetchone()
        total = row[0] or 0
        received = row[1] or 0
        pending_info = row[2] or 0
        quoted = row[3] or 0
        declined = row[4] or 0
        pending_outcome = row[5] or 0
        bound_count = row[6] or 0
        lost_count = row[7] or 0
        declined_outcome = row[8] or 0
        
        submissions_by_status = {
            "received": received,
            "pending_info": pending_info,
            "quoted": quoted,
            "declined": declined
        }
        
        submissions_by_outcome = {
            "pending": pending_outcome,
            "bound": bound_count,
            "lost": lost_count,
            "declined": declined_outcome
        }
        
        # Calculate rates
        quoted_count = quoted
        bound_rate = (bound_count / quoted_count * 100) if quoted_count > 0 else 0.0
        lost_rate = (lost_count / quoted_count * 100) if quoted_count > 0 else 0.0
        
        # Premium statistics
        result = conn.execute(text("""
            SELECT
                COALESCE(SUM(sold_premium), 0) as total_premium,
                COALESCE(AVG(sold_premium), 0) as avg_premium,
                COUNT(*) as bound_count
            FROM insurance_towers
            WHERE submission_id::text IN (SELECT unnest(CAST(:submission_ids AS text[])))
            AND is_bound = TRUE
            AND sold_premium IS NOT NULL
        """), {"submission_ids": submission_ids_list})
        
        row = result.fetchone()
        total_premium = float(row[0]) if row[0] else 0.0
        average_premium = float(row[1]) if row[1] else 0.0
        
        # Average deal size (policy limit for bound quotes)
        # Extract from tower_json - try to get aggregate limit from first layer
        result = conn.execute(text("""
            SELECT
                COALESCE(AVG(
                    CASE 
                        WHEN tower_json->0->>'aggregate_limit' IS NOT NULL 
                        THEN (tower_json->0->>'aggregate_limit')::numeric
                        ELSE NULL
                    END
                ), 0) as avg_deal_size
            FROM insurance_towers
            WHERE submission_id::text IN (SELECT unnest(CAST(:submission_ids AS text[])))
            AND is_bound = TRUE
            AND tower_json IS NOT NULL
            AND jsonb_array_length(tower_json) > 0
        """), {"submission_ids": submission_ids_list})
        
        row = result.fetchone()
        average_deal_size = float(row[0]) if row[0] else 0.0
        
        # Timeline metrics: time to quote
        result = conn.execute(text("""
            SELECT
                AVG(EXTRACT(EPOCH FROM (status_updated_at - date_received)) / 86400) as avg_days
            FROM submissions
            WHERE id::text IN (SELECT unnest(CAST(:submission_ids AS text[])))
            AND submission_status = 'quoted'
            AND status_updated_at IS NOT NULL
            AND date_received IS NOT NULL
        """), {"submission_ids": submission_ids_list})
        
        row = result.fetchone()
        average_time_to_quote_days = float(row[0]) if row[0] else None
        
        # Timeline metrics: time to bind
        result = conn.execute(text("""
            SELECT
                AVG(EXTRACT(EPOCH FROM (status_updated_at - date_received)) / 86400) as avg_days
            FROM submissions
            WHERE id::text IN (SELECT unnest(CAST(:submission_ids AS text[])))
            AND submission_outcome = 'bound'
            AND status_updated_at IS NOT NULL
            AND date_received IS NOT NULL
        """), {"submission_ids": submission_ids_list})
        
        row = result.fetchone()
        average_time_to_bind_days = float(row[0]) if row[0] else None
    
    return StatsResponse(
        total_submissions=total,
        submissions_by_status=submissions_by_status,
        submissions_by_outcome=submissions_by_outcome,
        bound_rate=round(bound_rate, 2),
        lost_rate=round(lost_rate, 2),
        total_premium=total_premium,
        average_premium=average_premium,
        average_deal_size=average_deal_size,
        average_time_to_quote_days=round(average_time_to_quote_days, 1) if average_time_to_quote_days else None,
        average_time_to_bind_days=round(average_time_to_bind_days, 1) if average_time_to_bind_days else None
    )

