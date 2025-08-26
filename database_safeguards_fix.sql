-- =============================================================================
-- PROPER DATABASE SAFEGUARDS FOR PARLAYKING
-- =============================================================================

-- 1. Add unique constraint to prevent duplicate recommendations per match per run
ALTER TABLE recommendations 
ADD CONSTRAINT unique_recommendation_per_match_per_run 
UNIQUE (run_id, dt_gmt8, home, away, line);

-- 2. Add index for performance on common queries
CREATE INDEX IF NOT EXISTS idx_recommendations_datetime_ev 
ON recommendations (dt_gmt8 DESC, ev DESC);

-- 3. Add index for CSV export queries
CREATE INDEX IF NOT EXISTS idx_recommendations_recent 
ON recommendations (dt_gmt8) 
WHERE dt_gmt8 >= now() - interval '7 days';

-- 4. Better runs table with proper constraints
ALTER TABLE runs ADD CONSTRAINT unique_run_id UNIQUE (run_id);

-- 5. Add foreign key relationship (optional, for data integrity)
-- ALTER TABLE recommendations 
-- ADD CONSTRAINT fk_recommendations_run 
-- FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;

-- 6. Add check constraints for data quality
ALTER TABLE recommendations 
ADD CONSTRAINT check_ev_reasonable CHECK (ev BETWEEN -1.0 AND 1.0);

ALTER TABLE recommendations 
ADD CONSTRAINT check_odds_reasonable CHECK (odds >= 1.0);

-- 6b. Add King's Call columns if they don't exist (migration for existing tables)
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS kings_call_insight text;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS kings_call_agreement text;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS kings_call_reasoning text;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS kings_call_sources text;

-- 7. Automatic cleanup trigger (optional) - removes old recommendations
CREATE OR REPLACE FUNCTION cleanup_old_recommendations()
RETURNS TRIGGER AS $$
BEGIN
    -- Keep only last 30 days of recommendations
    DELETE FROM recommendations 
    WHERE dt_gmt8 < now() - interval '30 days';
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run cleanup after each insert
DROP TRIGGER IF EXISTS trigger_cleanup_recommendations ON recommendations;
CREATE TRIGGER trigger_cleanup_recommendations
    AFTER INSERT ON recommendations
    FOR EACH STATEMENT
    EXECUTE FUNCTION cleanup_old_recommendations();
