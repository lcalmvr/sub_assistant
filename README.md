# Sub Assistant - Cyber Insurance Submission Processing System

A comprehensive AI-powered system for processing cyber insurance submissions, analyzing documents, and generating quotes with automated risk assessment.

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- PostgreSQL with pgvector extension
- OpenAI API key

### Installation
```bash
# Clone and setup
git clone <repository-url>
cd sub_assistant
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys and database URL

# Initialize database
python init_db.py
python enable_pgvector.py
```

### Run the Application
```bash
# Production interface (recommended)
streamlit run viewer_with_modular_rating.py

# Process test data
python ingest_local.py --dir fixtures/acme/
```

## 🏗️ System Overview

**Core Components:**
- **Document Processing Pipeline** - Handles PDF/JSON ingestion and standardization
- **AI Analysis Engine** - Provides underwriting recommendations using RAG
- **Modular Rating Engine** - Calculates premiums based on risk factors and security controls
- **Admin Interface** - Streamlit-based viewer for underwriters

**Process Flow:**
```
Email/Upload → Document Processing → AI Analysis → Rating → Quote Generation
```

## 📁 Key Files

- `viewer_with_modular_rating.py` - **Production admin interface**
- `components/rating_panel_v2.py` - Reusable rating component
- `rating_engine/engine.py` - Core pricing logic
- `app/pipeline.py` - Document processing with controls parsing
- `guideline_rag.py` - AI underwriting recommendations

## 📚 Documentation

For detailed documentation, see the [`docs/`](docs/) directory:

- **[Developer Guide](docs/developer-guide.md)** - Complete development reference
- **[Architecture](docs/architecture.md)** - System architecture and workflows  
- **[Archived Docs](docs/archived/)** - Historical implementation notes

## 🔧 Project Structure

```
sub_assistant/
├── viewer_with_modular_rating.py  # 🎯 Production interface
├── components/                    # Modular UI components
├── rating_engine/                 # Pricing and rating logic
├── app/                          # Core processing pipeline
├── archive/                      # Archived code and utilities
├── docs/                         # 📚 All documentation
└── fixtures/                     # Test data
```

## 🎯 Features

- **Automated Revenue Extraction** - Smart parsing from application data
- **Security Controls Detection** - Identifies MFA, EDR, backups from text
- **AI-Powered Underwriting** - Quote/Decline/Refer recommendations with citations
- **Modular Rating System** - Configurable industry hazard mapping and control modifiers
- **PDF Quote Generation** - Professional quote documents with detailed breakdowns

## 🤝 Contributing

1. Check [Developer Guide](docs/developer-guide.md) for setup details
2. Use the modular component architecture for new features
3. Test with fixture data before production changes

## 📄 License

[Add your license information here]