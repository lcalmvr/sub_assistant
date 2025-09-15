import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

migration_sql = """
-- Add submission status columns to submissions table
ALTER TABLE submissions 
ADD COLUMN submission_status TEXT DEFAULT 'pending_decision' CHECK (submission_status IN ('pending_decision', 'quoted', 'declined')),
ADD COLUMN submission_outcome TEXT CHECK (submission_outcome IN ('pending', 'bound', 'lost', 'declined')),
ADD COLUMN outcome_reason TEXT,
ADD COLUMN status_updated_at TIMESTAMP DEFAULT now();

-- Create indexes for performance
CREATE INDEX idx_submissions_status ON submissions(submission_status);
CREATE INDEX idx_submissions_outcome ON submissions(submission_outcome);

-- Set default outcome based on status
UPDATE submissions 
SET submission_outcome = 'pending' 
WHERE submission_status = 'pending_decision';

UPDATE submissions 
SET submission_outcome = 'declined' 
WHERE submission_status = 'declined';

-- Add constraint to ensure outcome matches status logic
ALTER TABLE submissions 
ADD CONSTRAINT check_status_outcome_logic 
CHECK (
    (submission_status = 'pending_decision' AND submission_outcome = 'pending') OR
    (submission_status = 'quoted' AND submission_outcome IN ('bound', 'lost')) OR
    (submission_status = 'declined' AND submission_outcome = 'declined')
);

-- Add constraint to ensure reason is provided for lost/declined outcomes
ALTER TABLE submissions 
ADD CONSTRAINT check_outcome_reason 
CHECK (
    (submission_outcome IN ('lost', 'declined') AND outcome_reason IS NOT NULL AND LENGTH(outcome_reason) > 0) OR
    (submission_outcome NOT IN ('lost', 'declined'))
);
"""

def main():
    print("Connecting to DB...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    try:
        cur.execute(migration_sql)
        conn.commit()
        print("✅ Submission status columns added successfully.")
        
        # Verify the migration worked
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'submissions' AND column_name IN ('submission_status', 'submission_outcome', 'outcome_reason', 'status_updated_at');")
        columns = [row[0] for row in cur.fetchall()]
        print(f"✅ Verified columns added: {columns}")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()