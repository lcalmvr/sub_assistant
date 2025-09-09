# Developer Quick Reference

## 🚀 Common Commands

### Setup & Initialization
```bash
# Database setup
python init_db.py
python enable_pgvector.py
python setup_embeddings.py

# Add revenue column to existing databases (if needed)
python add_revenue_column.py

# Load sample data
python scripts/load_guidelines.py

# Run admin interface
streamlit run viewer.py
```

### Testing & Development
```bash
# Process local fixtures
python ingest_local.py --dir fixtures/acme/
python ingest_local.py --dir fixtures/other_company/

# Test rating engine
python -c "
from rating_engine.engine import price
result = price({
    'industry': 'fintech',
    'revenue': 50000000,
    'limit': 2000000,
    'retention': 25000,
    'controls': ['MFA', 'EDR']
})
print(f'Premium: ${result[\"premium\"]:,.2f}')
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
SELECT applicant_name, revenue, 
       CASE 
           WHEN revenue < 10000000 THEN '<10M'
           WHEN revenue < 50000000 THEN '10M-50M'
           WHEN revenue < 250000000 THEN '50M-250M'
           ELSE '>250M'
       END as revenue_band
FROM submissions 
WHERE revenue IS NOT NULL;

# Review AI recommendations
SELECT id, applicant_name, summary, flags 
FROM submissions 
WHERE flags IS NOT NULL;
```

## 🔧 Configuration Files

### Rating Engine Config
```yaml
# rating_engine/config/industry_hazard_map.yml
fintech: 4
healthcare: 5
ecommerce: 3
logistics: 2

# rating_engine/config/hazard_base_rates.yml
1: # Low hazard
  "<10M": 0.15
  "10M-50M": 0.12
5: # High hazard
  "<10M": 0.85
  "10M-50M": 0.72
```

### Environment Variables
```bash
# Required in .env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
DATABASE_URL=postgresql://user:pass@host:port/db
SUPABASE_URL=https://...
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_ROLE=eyJ...
```

## 📁 File Structure

```
sub_assistant/
├── app/                    # Core application logic
│   ├── pipeline.py        # Document processing pipeline
│   ├── db.py             # Database operations
│   └── storage.py        # File storage utilities
├── rating_engine/         # Rating and pricing engine
│   ├── engine.py         # Main rating logic
│   ├── config/           # YAML configuration files
│   └── templates/        # Quote templates
├── fixtures/              # Test data
│   ├── acme/             # Sample company data
│   └── other_company/    # Additional test data
├── scripts/               # Utility scripts
├── ingest_local.py        # Local testing script
├── poll_inbox.py          # Email polling script
├── viewer.py              # Admin interface
└── requirements.txt       # Dependencies
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
client = OpenAI(api_key='your-key-here')
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

#### Missing Dependencies
```bash
# Install all requirements
pip install -r requirements.txt

# Common missing packages
pip install psycopg2-binary pgvector streamlit openai tavily-python
```

#### Streamlit Issues
```bash
# Clear Streamlit cache
rm -rf ~/.streamlit/cache/

# Run with debug info
streamlit run viewer.py --logger.level=debug
```

### Performance Optimization

#### Database Indexes
```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_submissions_date ON submissions(date_received);
CREATE INDEX CONCURRENTLY idx_submissions_quote_ready ON submissions(quote_ready);
CREATE INDEX CONCURRENTLY idx_documents_type ON documents(document_type);
```

#### Embedding Optimization
```python
# Batch embedding generation
def batch_embed(texts, batch_size=100):
    embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=batch
        )
        embeddings.extend([e.embedding for e in response.data])
    return embeddings
```

## 📊 Monitoring & Debugging

### Log Analysis
```bash
# Check application logs
tail -f app.log | grep ERROR

# Monitor database performance
psql $DATABASE_URL -c "
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;
"
```

### Performance Metrics
```python
# Add timing to pipeline
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

### 1. Local Development
```bash
# Set up local environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Test with fixtures
python ingest_local.py --dir fixtures/acme/
```

### 2. Testing Changes
```bash
# Test specific components
python -c "from app.pipeline import extract_applicant_info; print(extract_applicant_info({'applicantname': 'Test Corp'}))"

# Run admin interface
streamlit run viewer.py
```

### 3. Database Changes
```bash
# Test database operations
python -c "
from app.db import get_conn
with get_conn() as conn:
    result = conn.execute('SELECT COUNT(*) FROM submissions').scalar()
    print(f'Total submissions: {result}')
"
```

### 4. Production Deployment
```bash
# Set up email polling
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

1. Check the main README.md for comprehensive documentation
2. Review PROCESS_FLOW.md for workflow details
3. Check console output for error messages
4. Verify environment variables and API keys
5. Test individual components in isolation
