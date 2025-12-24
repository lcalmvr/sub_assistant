"""
Compliance Management Module
============================
Database operations for compliance rules management
"""

from typing import Optional, List, Dict, Any
from datetime import date
import json
from core.db import get_conn
from sqlalchemy import text


def check_table_exists() -> bool:
    """Check if compliance_rules table exists."""
    try:
        with get_conn() as conn:
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'compliance_rules'
                )
            """))
            return result.fetchone()[0]
    except Exception:
        return False


def get_all_compliance_rules(
    category: Optional[str] = None,
    status: str = "active",
    state: Optional[str] = None,
    product: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get all compliance rules with optional filters."""
    if not check_table_exists():
        return []
    
    with get_conn() as conn:
        query = """
            SELECT 
                id, code, title, category, subcategory, rule_type,
                applies_to_states, applies_to_jurisdictions,
                applies_to_products, applies_to_lifecycle_stage,
                description, requirements, procedures, legal_reference, source_url,
                check_config, requires_endorsement, required_endorsement_code,
                requires_notice, notice_text, requires_stamping, stamping_office,
                priority, effective_date, expiration_date, status,
                version, created_at, updated_at
            FROM compliance_rules
            WHERE 1=1
        """
        params = {}
        
        if status:
            query += " AND status = :status"
            params["status"] = status
        
        if category:
            query += " AND category = :category"
            params["category"] = category
        
        if state:
            query += " AND (applies_to_states IS NULL OR :state = ANY(applies_to_states))"
            params["state"] = state
        
        if product:
            query += " AND (applies_to_products IS NULL OR :product = ANY(applies_to_products) OR 'both' = ANY(applies_to_products))"
            params["product"] = product
        
        query += " ORDER BY priority DESC, category, title"
        
        result = conn.execute(text(query), params)
        rows = result.fetchall()
        
        return [_row_to_dict(row) for row in rows]


def get_compliance_rule_by_code(code: str) -> Optional[Dict[str, Any]]:
    """Get a specific compliance rule by code."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT 
                id, code, title, category, subcategory, rule_type,
                applies_to_states, applies_to_jurisdictions,
                applies_to_products, applies_to_lifecycle_stage,
                description, requirements, procedures, legal_reference, source_url,
                check_config, requires_endorsement, required_endorsement_code,
                requires_notice, notice_text, requires_stamping, stamping_office,
                priority, effective_date, expiration_date, status,
                version, created_at, updated_at
            FROM compliance_rules
            WHERE code = :code
        """), {"code": code})
        
        row = result.fetchone()
        return _row_to_dict(row) if row else None


def create_compliance_rule(
    code: str,
    title: str,
    category: str,
    description: str,
    subcategory: Optional[str] = None,
    rule_type: str = "reference",
    applies_to_states: Optional[List[str]] = None,
    applies_to_jurisdictions: Optional[List[str]] = None,
    applies_to_products: Optional[List[str]] = None,
    applies_to_lifecycle_stage: Optional[List[str]] = None,
    requirements: Optional[str] = None,
    procedures: Optional[str] = None,
    legal_reference: Optional[str] = None,
    source_url: Optional[str] = None,
    check_config: Optional[Dict[str, Any]] = None,
    requires_endorsement: bool = False,
    required_endorsement_code: Optional[str] = None,
    requires_notice: bool = False,
    notice_text: Optional[str] = None,
    requires_stamping: bool = False,
    stamping_office: Optional[str] = None,
    priority: str = "normal",
    effective_date: Optional[date] = None,
    expiration_date: Optional[date] = None,
    status: str = "active",
    created_by: Optional[str] = None
) -> str:
    """Create a new compliance rule."""
    with get_conn() as conn:
        result = conn.execute(text("""
            INSERT INTO compliance_rules (
                code, title, category, subcategory, rule_type,
                applies_to_states, applies_to_jurisdictions,
                applies_to_products, applies_to_lifecycle_stage,
                description, requirements, procedures, legal_reference, source_url,
                check_config, requires_endorsement, required_endorsement_code,
                requires_notice, notice_text, requires_stamping, stamping_office,
                priority, effective_date, expiration_date, status, created_by
            ) VALUES (
                :code, :title, :category, :subcategory, :rule_type,
                :applies_to_states, :applies_to_jurisdictions,
                :applies_to_products, :applies_to_lifecycle_stage,
                :description, :requirements, :procedures, :legal_reference, :source_url,
                :check_config, :requires_endorsement, :required_endorsement_code,
                :requires_notice, :notice_text, :requires_stamping, :stamping_office,
                :priority, :effective_date, :expiration_date, :status, :created_by
            )
            RETURNING id
        """), {
            "code": code,
            "title": title,
            "category": category,
            "subcategory": subcategory,
            "rule_type": rule_type,
            "applies_to_states": applies_to_states,
            "applies_to_jurisdictions": applies_to_jurisdictions,
            "applies_to_products": applies_to_products,
            "applies_to_lifecycle_stage": applies_to_lifecycle_stage,
            "description": description,
            "requirements": requirements,
            "procedures": procedures,
            "legal_reference": legal_reference,
            "source_url": source_url,
            "check_config": json.dumps(check_config) if check_config else None,
            "requires_endorsement": requires_endorsement,
            "required_endorsement_code": required_endorsement_code,
            "requires_notice": requires_notice,
            "notice_text": notice_text,
            "requires_stamping": requires_stamping,
            "stamping_office": stamping_office,
            "priority": priority,
            "effective_date": effective_date,
            "expiration_date": expiration_date,
            "status": status,
            "created_by": created_by,
        })
        
        return str(result.fetchone()[0])


def update_compliance_rule(
    rule_id: str,
    title: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    updated_by: Optional[str] = None,
    **kwargs
) -> bool:
    """Update a compliance rule. Pass other fields as kwargs."""
    updates = []
    params = {"rule_id": rule_id}
    
    if title is not None:
        updates.append("title = :title")
        params["title"] = title
    if category is not None:
        updates.append("category = :category")
        params["category"] = category
    if description is not None:
        updates.append("description = :description")
        params["description"] = description
    if status is not None:
        updates.append("status = :status")
        params["status"] = status
    if updated_by is not None:
        updates.append("updated_by = :updated_by")
        params["updated_by"] = updated_by
    
    # Handle other kwargs (for flexibility)
    for key, value in kwargs.items():
        if value is not None:
            updates.append(f"{key} = :{key}")
            params[key] = value
    
    if not updates:
        return False
    
    updates.append("updated_at = now()")
    
    with get_conn() as conn:
        conn.execute(text(f"""
            UPDATE compliance_rules
            SET {', '.join(updates)}
            WHERE id = :rule_id
        """), params)
        
        return True


def get_compliance_stats() -> Dict[str, Any]:
    """Get statistics about compliance rules."""
    if not check_table_exists():
        raise Exception("compliance_rules table does not exist. Please run the migration script first.")
    
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE category = 'ofac') as ofac_count,
                COUNT(*) FILTER (WHERE category = 'service_of_suit') as sos_count,
                COUNT(*) FILTER (WHERE category = 'nyftz') as nyftz_count,
                COUNT(*) FILTER (WHERE category = 'state_rule') as state_rule_count,
                COUNT(*) FILTER (WHERE category = 'notice_stamping') as notice_stamping_count,
                COUNT(DISTINCT category) as categories
            FROM compliance_rules
        """))
        
        row = result.fetchone()
        return {
            "total": row[0] or 0,
            "active": row[1] or 0,
            "ofac_count": row[2] or 0,
            "sos_count": row[3] or 0,
            "nyftz_count": row[4] or 0,
            "state_rule_count": row[5] or 0,
            "notice_stamping_count": row[6] or 0,
            "categories": row[7] or 0,
        }


def _row_to_dict(row) -> Dict[str, Any]:
    """Convert a database row to a dictionary."""
    # Handle JSONB field - may come as string or already parsed dict
    check_config = row[15] if len(row) > 15 else None
    if check_config and isinstance(check_config, str):
        check_config = json.loads(check_config)
    
    return {
        "id": str(row[0]),
        "code": row[1],
        "title": row[2],
        "category": row[3],
        "subcategory": row[4],
        "rule_type": row[5],
        "applies_to_states": row[6],
        "applies_to_jurisdictions": row[7],
        "applies_to_products": row[8],
        "applies_to_lifecycle_stage": row[9],
        "description": row[10],
        "requirements": row[11],
        "procedures": row[12],
        "legal_reference": row[13],
        "source_url": row[14],
        "check_config": check_config,
        "requires_endorsement": row[16] if len(row) > 16 else False,
        "required_endorsement_code": row[17] if len(row) > 17 else None,
        "requires_notice": row[18] if len(row) > 18 else False,
        "notice_text": row[19] if len(row) > 19 else None,
        "requires_stamping": row[20] if len(row) > 20 else False,
        "stamping_office": row[21] if len(row) > 21 else None,
        "priority": row[22] if len(row) > 22 else "normal",
        "effective_date": row[23] if len(row) > 23 else None,
        "expiration_date": row[24] if len(row) > 24 else None,
        "status": row[25] if len(row) > 25 else "active",
        "version": row[26] if len(row) > 26 else 1,
        "created_at": row[27] if len(row) > 27 else None,
        "updated_at": row[28] if len(row) > 28 else None,
    }

