"""
Fix Dollar Signs in Compliance Rules
====================================
Updates existing compliance rules to escape dollar signs for proper markdown display
"""

import sys
import os

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from core.db import get_conn
from sqlalchemy import text


def fix_dollar_signs():
    """Update all compliance rules to escape dollar signs in description, requirements, and procedures."""
    
    print("🔄 Fixing dollar sign formatting in compliance rules...")
    
    with get_conn() as conn:
        # Get all rules with dollar signs
        result = conn.execute(text("""
            SELECT id, code, description, requirements, procedures
            FROM compliance_rules
            WHERE description LIKE '%$%' 
               OR requirements LIKE '%$%' 
               OR procedures LIKE '%$%'
        """))
        
        rules = result.fetchall()
        updated_count = 0
        
        for rule_id, code, description, requirements, procedures in rules:
            updates = []
            params = {"rule_id": rule_id}
            
            if description and "$" in description:
                new_description = description.replace("$", "\\$")
                if new_description != description:
                    updates.append("description = :description")
                    params["description"] = new_description
            
            if requirements and "$" in requirements:
                new_requirements = requirements.replace("$", "\\$")
                if new_requirements != requirements:
                    updates.append("requirements = :requirements")
                    params["requirements"] = new_requirements
            
            if procedures and "$" in procedures:
                new_procedures = procedures.replace("$", "\\$")
                if new_procedures != procedures:
                    updates.append("procedures = :procedures")
                    params["procedures"] = new_procedures
            
            if updates:
                updates.append("updated_at = now()")
                conn.execute(text(f"""
                    UPDATE compliance_rules
                    SET {', '.join(updates)}
                    WHERE id = :rule_id
                """), params)
                print(f"✅ Updated {code}")
                updated_count += 1
        
        print(f"\n📊 Summary: Updated {updated_count} rules")


if __name__ == "__main__":
    fix_dollar_signs()

