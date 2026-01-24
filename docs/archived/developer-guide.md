# Developer Guide

Complete development reference for the Sub Assistant cyber insurance processing system.

## 🚀 Setup & Development

### Prerequisites & Installation
```bash
# Python environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Database setup
python init_db.py
python enable_pgvector.py

# Environment variables (required in .env)
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
DATABASE_URL=postgresql://user:pass@host:port/db
SUPABASE_URL=https://...
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_ROLE=eyJ...
```

### Running the Application
```bash
# Production interface (CURRENT)
streamlit run viewer_with_modular_rating.py

# Legacy interface (reference)
streamlit run viewer.py

# Process test data
python ingest_local.py --dir fixtures/acme/
python ingest_local.py --dir fixtures/moog/
```

## 🧪 Testing & Development

### Core System Testing
```bash
# Test rating engine with detailed breakdown
python -c "
from rating_engine.engine import price_with_breakdown
result = price_with_breakdown({
    'industry': 'Advertising_Marketing_Technology',
    'revenue': 50000000,
    'limit': 2000000,
    'retention': 25000,
    'controls': ['MFA', 'EDR']
})
print(f'Premium: \${result[\"premium\"]:,.2f}')
print(f'Hazard Class: {result[\"breakdown\"][\"hazard_class\"]}')
print(f'Control Modifiers: {len(result[\"breakdown\"][\"control_modifiers\"])} applied')
"

# Test AI analysis
python -c "
from guideline_rag import get_ai_decision
result = get_ai_decision(
    'Tech startup providing SaaS solutions',
    'Handles customer PII and financial data',
    'MFA enabled, EDR deployed, SOC 2 certified'
)
print(result['answer'])
"

# Test controls parsing (fixes EDR contradiction)
python -c "
from app.pipeline import parse_controls_from_summary
bullet_summary = 'CrowdStrike deployed for endpoint protection. Multi-factor authentication required.'
nist_summary = 'AC-2: Account Management implemented with MFA'
controls = parse_controls_from_summary(bullet_summary, nist_summary)
print(f'Parsed controls: {controls}')
# Expected output: ['EDR', 'MFA']
"
```

### Database Operations
```bash
# Connect to database
psql $DATABASE_URL

# View recent submissions
SELECT id, applicant_name, date_received, quote_ready 
FROM submissions 
ORDER BY created_at DESC LIMIT 10;

# Check document processing
SELECT s.applicant_name, d.filename, d.document_type 
FROM submissions s 
JOIN documents d ON s.id = d.submission_id;

# Check revenue extraction
SELECT applicant_name, annual_revenue, 
       CASE 
           WHEN annual_revenue < 10000000 THEN '<10M'
           WHEN annual_revenue < 50000000 THEN '10M-50M'
           WHEN annual_revenue < 250000000 THEN '50M-250M'
           ELSE '>250M'
       END as revenue_band
FROM submissions 
WHERE annual_revenue IS NOT NULL;

# Review AI recommendations
SELECT id, applicant_name, summary, flags 
FROM submissions 
WHERE flags IS NOT NULL;
```

## 🔧 Configuration

### Rating Engine Configuration
The rating engine uses YAML configuration files in `rating_engine/config/`:

```yaml
# industry_hazard_map.yml - Maps industries to hazard classes (1-5)
Advertising_Marketing_Technology: 3
Software_as_a_Service_SaaS: 4
Professional_Services_Consulting: 2

# hazard_base_rates.yml - Base rates by hazard class and revenue band
1: # Low hazard
  "<10M": 0.15
  "10M-50M": 0.12
5: # High hazard
  "<10M": 0.85
  "10M-50M": 0.72

# control_modifiers.yml - Credits/debits for security controls
MFA: -0.05      # 5% credit
EDR: -0.03      # 3% credit
No_EDR: 0.10    # 10% debit
```

### Project Structure Deep Dive
```
sub_assistant/
├── viewer_with_modular_rating.py  # 🎯 Production admin interface
├── viewer.py                      # Legacy interface
├── components/                    # 🆕 Modular UI components
│   └── rating_panel_v2.py        # Reusable rating component
├── rating_engine/                 # Rating and pricing engine
│   ├── engine.py                 # Main rating logic (price_with_breakdown)
│   ├── config/                   # YAML configuration files
│   └── templates/                # Quote PDF templates
├── app/                          # Core application logic
│   ├── pipeline.py              # Document processing with controls parsing
│   ├── db.py                    # Database operations
│   └── storage.py               # File storage utilities
├── archive/                      # 🗃️ Archived files and utilities
│   ├── README.md                # Archive documentation
│   ├── legacy_viewers/          # Old viewer versions
│   ├── failed_modular/          # Over-simplified modular attempt
│   ├── setup_scripts/           # One-time migration scripts
│   ├── dev_scripts/             # Development utilities
│   └── tests/                   # Development test files
├── docs/                         # 📚 All documentation
├── fixtures/                     # Test data
│   ├── acme/                    # Sample company data
│   └── moog/                    # Additional test data
├── scripts/                      # Utility scripts
├── ingest_local.py              # Local testing script
├── poll_inbox.py                # Email polling script
└── guideline_rag.py             # AI underwriting recommendations
```

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check if database is accessible
psql $DATABASE_URL -c "SELECT version();"

# Verify pgvector extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

#### OpenAI API Errors
```bash
# Test API key
python -c "
from openai import OpenAI
client = OpenAI()
try:
    response = client.chat.completions.create(
        model='gpt-4o-mini',
        messages=[{'role': 'user', 'content': 'Hello'}],
        max_tokens=10
    )
    print('✅ API key works')
except Exception as e:
    print(f'❌ API error: {e}')
"
```

#### Streamlit Issues
```bash
# Clear Streamlit cache
rm -rf ~/.streamlit/cache/

# Run with debug info
streamlit run viewer_with_modular_rating.py --logger.level=debug
```

## 🚀 Current Architecture (After Modular Refactoring)

### Key Improvements
1. **Modular Rating Component**: `components/rating_panel_v2.py` can be reused for alternate rating mechanisms
2. **Fixed EDR Bug**: Controls now properly extracted from text summaries using `parse_controls_from_summary()`
3. **Clean Archive**: All obsolete code preserved in `archive/` with documentation
4. **Production Ready**: `viewer_with_modular_rating.py` maintains all functionality with cleaner architecture

### Migration Notes
- **Setup scripts** moved to `archive/setup_scripts/` (run if needed for new environments)
- **Development tests** preserved in `archive/tests/` for reference
- **Legacy viewers** available in `archive/legacy_viewers/`
- **Rating API** updated to use `price_with_breakdown()` for detailed results

## 📊 Performance & Monitoring

### Database Optimization
```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_submissions_date ON submissions(date_received);
CREATE INDEX CONCURRENTLY idx_submissions_quote_ready ON submissions(quote_ready);
CREATE INDEX CONCURRENTLY idx_documents_type ON documents(document_type);
```

### Performance Metrics
```python
# Add timing to pipeline functions
import time

def process_submission_with_timing(*args, **kwargs):
    start_time = time.time()
    try:
        result = process_submission(*args, **kwargs)
        processing_time = time.time() - start_time
        print(f"✅ Processing completed in {processing_time:.2f}s")
        return result
    except Exception as e:
        processing_time = time.time() - start_time
        print(f"❌ Processing failed after {processing_time:.2f}s: {e}")
        raise
```

## 🔄 Development Workflow

### 1. Feature Development
```bash
# Test specific components
python -c "from app.pipeline import extract_applicant_info; print(extract_applicant_info({'applicantname': 'Test Corp'}))"

# Test database operations
python -c "
from app.db import get_conn
with get_conn() as conn:
    result = conn.execute('SELECT COUNT(*) FROM submissions').scalar()
    print(f'Total submissions: {result}')
"
```

### 2. Adding New Rating Components
- Extend `components/rating_panel_v2.py` for new rating logic
- Use existing modular structure for consistency
- Test with fixture data before production deployment

### 3. Production Deployment
```bash
# Set up email polling (production)
nohup python poll_inbox.py > poll_inbox.log 2>&1 &

# Monitor background processes
ps aux | grep poll_inbox
tail -f poll_inbox.log
```

## 📚 Additional Resources

- **OpenAI API Documentation**: https://platform.openai.com/docs
- **PostgreSQL pgvector**: https://github.com/pgvector/pgvector
- **Streamlit Documentation**: https://docs.streamlit.io
- **Supabase Documentation**: https://supabase.com/docs

## 🆘 Getting Help

1. Check this developer guide for setup and troubleshooting
2. Review [`docs/architecture.md`](architecture.md) for system workflows
3. Check console output for error messages
4. Verify environment variables and API keys
5. Test individual components in isolation