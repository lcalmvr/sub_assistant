# Sub Assistant - Cyber Insurance Submission Processing System

A comprehensive system for processing cyber insurance submissions, analyzing documents, and generating quotes using AI-powered analysis and rating engines.

## 🏗️ System Architecture

The system consists of several key components that work together to process insurance submissions:

- **Document Processing Pipeline** - Handles document ingestion and standardization
- **AI Analysis Engine** - Provides underwriting recommendations using RAG
- **Rating Engine** - Calculates premiums based on risk factors
- **Database Layer** - PostgreSQL with pgvector for embeddings
- **Admin Interface** - Streamlit-based viewer for underwriters

## 📋 Process Flow Overview

```
1. Submission Ingestion → 2. Document Processing → 3. AI Analysis → 4. Rating → 5. Quote Generation
```

### 1. Submission Ingestion
- **Email Polling**: `poll_inbox.py` monitors email inbox for new submissions
- **Local Testing**: `ingest_local.py` processes local fixture data for development
- **Document Attachments**: Supports PDF, JSON, DOCX, and other formats

### 2. Document Processing
- **Pipeline**: `app/pipeline.py` handles document parsing and data extraction
- **Standardization**: Converts various formats to standardized JSON
- **Metadata Extraction**: Identifies document types and key information
- **Revenue Extraction**: Automatically extracts annual revenue from application data

### 3. AI Analysis
- **Guideline RAG**: `guideline_rag.py` provides underwriting recommendations
- **Risk Assessment**: Analyzes business operations and security controls
- **Decision Support**: Quote/Decline/Refer recommendations with citations

### 4. Rating & Pricing
- **Rating Engine**: `rating_engine/engine.py` calculates premiums
- **Risk Factors**: Industry hazard mapping, revenue bands, policy limits
- **Control Modifiers**: Security control credits and debits

### 5. Quote Generation
- **Template Rendering**: HTML to PDF conversion using Jinja2 templates
- **Storage**: Supabase storage for quote PDFs
- **Admin Interface**: `viewer.py` provides underwriter workflow

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- PostgreSQL with pgvector extension
- OpenAI API key
- Tavily API key
- Supabase account

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd sub_assistant

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and database URLs
```

### Database Setup
```bash
# Initialize database schema
python init_db.py

# Enable pgvector extension
python enable_pgvector.py

# Set up embeddings column (if needed - archived)
python archive/setup_scripts/setup_embeddings.py

# If you have an existing database, add the revenue column (if needed - archived)
python archive/setup_scripts/add_revenue_column.py
```

### Load Sample Data
```bash
# Load underwriting guidelines
python scripts/load_guidelines.py
```

## 📁 Current Project Structure

### 🎯 Active Files
- `viewer_with_modular_rating.py` - **Production admin interface**
- `viewer.py` - Original admin interface (legacy)
- `components/rating_panel_v2.py` - Reusable rating component
- `rating_engine/engine.py` - Core rating logic
- `app/pipeline.py` - Document processing with controls parsing
- `guideline_rag.py` - AI underwriting recommendations

### 🗃️ Archived Files
- `archive/legacy_viewers/` - Backup viewer versions
- `archive/failed_modular/` - Over-simplified modular attempt
- `archive/setup_scripts/` - One-time migration scripts
- `archive/dev_scripts/` - Development utilities
- `archive/tests/` - Development test files
- `archive/README.md` - Documentation of archived files

## 📁 Script Reference

### Core Processing Scripts

#### `ingest_local.py`
Processes local fixture data for development and testing.
```bash
python ingest_local.py --dir fixtures/acme/
```
- Reads `email.txt` for subject/body
- Processes JSON attachments with type hints
- Calls the main processing pipeline

#### `poll_inbox.py`
Email polling script for production use.
- Monitors email inbox for new submissions
- Processes email attachments
- Integrates with the processing pipeline

### Database & Setup Scripts

#### `init_db.py`
Creates the initial database schema:
- `submissions` table for submission metadata (including revenue field)
- `documents` table for document storage
- `quotes` table for generated quotes

#### `setup_embeddings.py`
Adds vector embedding support:
- Enables pgvector extension
- Adds embedding columns to submissions table

#### `enable_pgvector.py`
Enables PostgreSQL vector extension for similarity search.

### Data Loading Scripts



#### `scripts/load_guidelines.py`
Loads underwriting guidelines into the vector database.

### Analysis & Rating Scripts

#### `guideline_rag.py`
AI-powered underwriting assistant:
- Uses RAG (Retrieval Augmented Generation)
- Provides Quote/Decline/Refer recommendations
- Cites relevant guideline sections

#### `rating_engine/engine.py`
Config-driven rating engine:
- Industry hazard mapping (1-5 scale)
- Revenue band-based pricing
- Security control modifiers
- Policy limit and retention factors

### Admin Interface

#### `viewer.py`
Original Streamlit-based admin interface:
- Submission review and editing
- AI recommendation display
- Quote generation and PDF export
- Document management

#### `viewer_with_modular_rating.py` ⭐ **CURRENT PRODUCTION VERSION**
Modular Streamlit interface with extracted rating component:
- All functionality of original viewer
- Modular rating system using `components/rating_panel_v2.py`
- Cleaner architecture for future enhancements
- Ready for alternate rating mechanism integration

## 🔧 Configuration

### Rating Engine Configuration
Located in `rating_engine/config/`:
- `industry_hazard_map.yml` - Maps industries to hazard classes
- `hazard_base_rates.yml` - Base rates by hazard class and revenue band
- `limit_factors.yml` - Multipliers by policy limit
- `retention_factors.yml` - Multipliers by retention/deductible
- `control_modifiers.yml` - Credits/debits for security controls

### Environment Variables
Required in `.env`:
```bash
OPENAI_API_KEY=your_openai_key
TAVILY_API_KEY=your_tavily_key
DATABASE_URL=postgresql://user:pass@host:port/db
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SUPABASE_SERVICE_ROLE=your_service_role_key
```

## 📊 Data Flow

### Submission Processing
1. **Email/Attachment Reception** → Document parsing and standardization
2. **Data Extraction** → Applicant info, operations, controls extraction
3. **AI Analysis** → Guideline matching and risk assessment
4. **Rating Calculation** → Premium calculation based on risk factors
5. **Quote Generation** → PDF generation and storage

### Document Types Supported
- **Applications**: General information, operations, controls
- **Loss Runs**: Claims history and loss data
- **Supporting Documents**: Financials, contracts, policies

## 🧪 Testing & Development

### Local Development
```bash
# Process local fixtures
python ingest_local.py --dir fixtures/acme/

# Run admin interface (production version)
streamlit run viewer_with_modular_rating.py

# Run original admin interface (legacy)
streamlit run viewer.py

# Test rating engine
python -c "from rating_engine.engine import price_with_breakdown; print(price_with_breakdown({'industry': 'Advertising_Marketing_Technology', 'revenue': 50000000, 'limit': 2000000, 'retention': 25000, 'controls': ['MFA', 'EDR']}))"
```

### Fixture Structure
```
fixtures/
├── acme/
│   ├── email.txt
│   ├── application.standardized.json
│   └── lossrun1.standardized.json
└── other_company/
    ├── email.txt
    └── application.standardized.json
```

## 🔍 Monitoring & Debugging

### Database Queries
```sql
-- View recent submissions
SELECT * FROM submissions ORDER BY created_at DESC LIMIT 10;

-- Check document processing
SELECT s.applicant_name, d.filename, d.document_type 
FROM submissions s 
JOIN documents d ON s.id = d.submission_id;

-- Review AI recommendations
SELECT id, applicant_name, summary, flags FROM submissions WHERE flags IS NOT NULL;
```

### Logs and Debugging
- Check console output for processing status
- Review database for data consistency
- Use Streamlit interface for visual debugging

## 🚀 Production Deployment

### Email Integration
- Configure `poll_inbox.py` with your email server settings
- Set up background worker for continuous monitoring
- Implement error handling and retry logic

### Scaling Considerations
- Database connection pooling
- Async processing for high-volume submissions
- Caching for frequently accessed guidelines
- Monitoring and alerting for system health

## 🤝 Contributing

1. Follow the existing code structure
2. Add tests for new functionality
3. Update documentation for API changes
4. Use type hints and docstrings

## 📄 License

[Add your license information here]

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Review existing issues
3. Create a new issue with detailed information