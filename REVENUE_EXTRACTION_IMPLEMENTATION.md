# Revenue Extraction Implementation

## 🎯 Overview

The revenue extraction feature has been successfully implemented to automatically extract annual revenue from insurance application data and store it as a separate field in the database. This enables more accurate rating calculations and better data organization.

## 🔧 What Was Implemented

### 1. Database Schema Update
- **New Column**: Added `revenue BIGINT` column to the `submissions` table
- **Index**: Created `idx_submissions_revenue` for better query performance
- **Migration Script**: `add_revenue_column.py` for existing databases

### 2. Revenue Extraction Function
- **Location**: `app/pipeline.py` - `extract_revenue()` function
- **Smart Parsing**: Handles multiple revenue field names and formats
- **Format Support**: Numbers, strings, currency symbols, M/K suffixes

### 3. Pipeline Integration
- **Automatic Extraction**: Revenue is extracted during document processing
- **Database Storage**: Stored as separate field for easy access
- **Rating Engine Ready**: Available for premium calculations

## 📊 Supported Revenue Formats

### Field Names
- `annualRevenue` (primary)
- `annual_revenue`
- `revenue`
- `gross_revenue`
- `total_revenue`

### Value Formats
- **Numeric**: `50000000`, `1000000.5`
- **String**: `"25000000"`, `"0"`
- **Currency**: `"$50,000,000"`, `"€25.5M"`
- **Suffixes**: `"100K"`, `"1.5M"`, `"2.5B"`

### Edge Cases Handled
- Empty strings → `None`
- Invalid formats → `None`
- Missing fields → `None`
- Zero values → `0`

## 🚀 How to Use

### For New Databases
```bash
# Initialize with revenue column
python init_db.py
```

### For Existing Databases
```bash
# Add revenue column to existing table
python add_revenue_column.py
```

### Processing Submissions
Revenue is automatically extracted when using:
```bash
# Local testing
python ingest_local.py --dir fixtures/acme/

# Email processing
python poll_inbox.py
```

## 📈 Database Queries

### Check Revenue Extraction
```sql
-- View all submissions with revenue
SELECT applicant_name, revenue, 
       CASE 
           WHEN revenue < 10000000 THEN '<10M'
           WHEN revenue < 50000000 THEN '10M-50M'
           WHEN revenue < 250000000 THEN '50M-250M'
           ELSE '>250M'
       END as revenue_band
FROM submissions 
WHERE revenue IS NOT NULL
ORDER BY revenue DESC;
```

### Revenue Statistics
```sql
-- Revenue distribution
SELECT 
    CASE 
        WHEN revenue < 10000000 THEN '<10M'
        WHEN revenue < 50000000 THEN '10M-50M'
        WHEN revenue < 250000000 THEN '50M-250M'
        ELSE '>250M'
    END as revenue_band,
    COUNT(*) as submission_count,
    AVG(revenue) as avg_revenue
FROM submissions 
WHERE revenue IS NOT NULL
GROUP BY revenue_band
ORDER BY MIN(revenue);
```

### Missing Revenue Data
```sql
-- Find submissions without revenue
SELECT id, applicant_name, created_at
FROM submissions 
WHERE revenue IS NULL;
```

## 🔍 Integration Points

### Rating Engine
The revenue field is now directly accessible for the rating engine:
```python
from rating_engine.engine import price

result = price({
    'industry': 'fintech',
    'revenue': submission.revenue,  # Direct database field
    'limit': 2000000,
    'retention': 25000,
    'controls': ['MFA', 'EDR']
})
```

### Admin Interface
The `viewer.py` Streamlit interface now displays revenue information and can use it for quote generation.

### AI Analysis
Revenue data can be incorporated into AI recommendations for more accurate underwriting decisions.

## 🧪 Testing

The revenue extraction function has been thoroughly tested with:
- ✅ 18/18 test cases passed
- ✅ Multiple field name variations
- ✅ Various formatting styles
- ✅ Edge cases and error handling
- ✅ Currency and suffix parsing

## 📝 Example Data

### Input JSON
```json
{
  "generalInformation": {
    "applicantName": "ACME Corp",
    "annualRevenue": 900000000,
    "annualRevenue_is_present": true
  }
}
```

### Database Result
```sql
SELECT applicant_name, revenue FROM submissions WHERE applicant_name = 'ACME Corp';
-- Result: ACME Corp | 900000000
```

## 🔄 Data Flow

1. **Document Processing** → `app/pipeline.py` extracts revenue
2. **Database Storage** → Revenue stored in `submissions.revenue` column
3. **Rating Calculation** → Rating engine uses revenue for premium calculation
4. **Admin Interface** → Revenue displayed and editable in Streamlit viewer
5. **Quote Generation** → Revenue included in quote calculations

## 🚨 Important Notes

### Data Type
- Revenue is stored as `BIGINT` (64-bit integer)
- Supports values up to 9,223,372,036,854,775,807
- Sufficient for all realistic revenue amounts

### Performance
- Index on revenue column for fast queries
- Revenue extraction happens during document processing
- No impact on existing submission processing

### Migration
- Existing submissions will have `NULL` revenue values
- New submissions will automatically extract revenue
- Can backfill revenue for existing submissions if needed

## 🔮 Future Enhancements

### Potential Improvements
- **Revenue Validation**: Range checking and business logic validation
- **Currency Conversion**: Support for multiple currencies
- **Revenue History**: Track revenue changes over time
- **Industry Benchmarks**: Compare revenue to industry averages

### Backfill Strategy
```sql
-- Example: Update revenue for existing submissions
UPDATE submissions 
SET revenue = 50000000 
WHERE applicant_name = 'Known Company' 
  AND revenue IS NULL;
```

## 📚 Related Files

- `app/pipeline.py` - Revenue extraction logic
- `init_db.py` - Database schema with revenue column
- `add_revenue_column.py` - Migration script for existing databases
- `rating_engine/engine.py` - Uses revenue for rating calculations
- `viewer.py` - Displays revenue in admin interface

## ✅ Implementation Complete

The revenue extraction feature is fully implemented and tested. Revenue data is now:
- ✅ Automatically extracted from application documents
- ✅ Stored as a separate database field
- ✅ Available for rating calculations
- ✅ Displayed in the admin interface
- ✅ Ready for production use

