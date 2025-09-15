-- Create loss_history table for tracking claim/loss data
CREATE TABLE IF NOT EXISTS loss_history (
    id SERIAL PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),
    loss_date DATE,
    loss_type VARCHAR(100),  -- e.g., 'Cyber', 'GL', 'Property', etc.
    loss_description TEXT,
    loss_amount DECIMAL(15,2),
    claim_status VARCHAR(50), -- e.g., 'Open', 'Closed', 'Pending'
    claim_number VARCHAR(100),
    carrier_name VARCHAR(255),
    policy_period_start DATE,
    policy_period_end DATE,
    deductible DECIMAL(15,2),
    reserve_amount DECIMAL(15,2),
    paid_amount DECIMAL(15,2),
    recovery_amount DECIMAL(15,2),
    loss_ratio DECIMAL(5,4), -- calculated field
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups by submission
CREATE INDEX IF NOT EXISTS idx_loss_history_submission_id ON loss_history(submission_id);

-- Create index for loss date queries
CREATE INDEX IF NOT EXISTS idx_loss_history_loss_date ON loss_history(loss_date);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_loss_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_loss_history_updated_at_trigger ON loss_history;
CREATE TRIGGER update_loss_history_updated_at_trigger
    BEFORE UPDATE ON loss_history
    FOR EACH ROW
    EXECUTE FUNCTION update_loss_history_updated_at();