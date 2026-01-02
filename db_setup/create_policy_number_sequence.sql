-- Policy Number Sequence Table
-- Sequential numbering for issued policies: P-YYYY-000001

CREATE TABLE IF NOT EXISTS policy_number_sequence (
    year INTEGER PRIMARY KEY,
    next_number INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initialize current year if not exists
INSERT INTO policy_number_sequence (year, next_number)
VALUES (EXTRACT(YEAR FROM NOW())::integer, 1)
ON CONFLICT (year) DO NOTHING;

-- Function to get next policy number atomically
CREATE OR REPLACE FUNCTION get_next_policy_number()
RETURNS TEXT AS $$
DECLARE
    current_year INTEGER;
    seq_num INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::integer;

    -- Ensure the year exists, insert if not
    INSERT INTO policy_number_sequence (year, next_number)
    VALUES (current_year, 1)
    ON CONFLICT (year) DO NOTHING;

    -- Atomically increment and return the sequence number
    UPDATE policy_number_sequence
    SET next_number = next_number + 1,
        updated_at = NOW()
    WHERE year = current_year
    RETURNING next_number - 1 INTO seq_num;

    -- Format as P-YYYY-000001
    RETURN 'P-' || current_year::text || '-' || LPAD(seq_num::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT get_next_policy_number();  -- Returns 'P-2025-000001'
-- SELECT get_next_policy_number();  -- Returns 'P-2025-000002'
