import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)

migration_sql = """
-- Drop the existing constraint
ALTER TABLE submissions 
DROP CONSTRAINT IF EXISTS check_outcome_reason;

-- Drop the existing status outcome logic constraint
ALTER TABLE submissions 
DROP CONSTRAINT IF EXISTS check_status_outcome_logic;

-- Update the submission_outcome check constraint to include waiting_for_response
ALTER TABLE submissions 
ADD CONSTRAINT check_submission_outcome 
CHECK (submission_outcome IN ('pending', 'bound', 'lost', 'declined', 'waiting_for_response'));

-- Add updated constraint to ensure outcome matches status logic including waiting_for_response
ALTER TABLE submissions 
ADD CONSTRAINT check_status_outcome_logic 
CHECK (
    (submission_status = 'pending_decision' AND submission_outcome = 'pending') OR
    (submission_status = 'quoted' AND submission_outcome IN ('bound', 'lost', 'waiting_for_response')) OR
    (submission_status = 'declined' AND submission_outcome = 'declined')
);

-- Add constraint to ensure reason is provided for lost/declined outcomes only
ALTER TABLE submissions 
ADD CONSTRAINT check_outcome_reason 
CHECK (
    (submission_outcome IN ('lost', 'declined') AND outcome_reason IS NOT NULL AND LENGTH(outcome_reason) > 0) OR
    (submission_outcome NOT IN ('lost', 'declined'))
);
"""

def main():
    print("Connecting to DB...")
    with engine.connect() as conn:
        try:
            conn.execute(text(migration_sql))
            conn.commit()
            print("✅ Outcome constraint updated successfully.")
            
            # Verify the constraint worked by checking if we can insert waiting_for_response
            result = conn.execute(text("""
                SELECT constraint_name, check_clause 
                FROM information_schema.check_constraints 
                WHERE constraint_name LIKE '%outcome%' 
                AND constraint_schema = 'public'
            """))
            
            constraints = result.fetchall()
            print(f"✅ Verified constraints: {len(constraints)} outcome-related constraints found")
            for constraint in constraints:
                print(f"  - {constraint[0]}")
            
        except Exception as e:
            print(f"❌ Migration failed: {e}")
            conn.rollback()

if __name__ == "__main__":
    main()