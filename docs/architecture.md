# System Architecture

Technical architecture and workflow documentation for the Sub Assistant cyber insurance processing system.

## 🔄 System Workflow

### High-Level Process Flow

```mermaid
graph TD
    A[Email Submission] --> B[Email Polling<br/>poll_inbox.py]
    C[Local Testing] --> D[Local Ingestion<br/>ingest_local.py]
    
    B --> E[Document Processing<br/>core/pipeline.py]
    D --> E
    
    E --> F[Document Standardization]
    F --> G[Data Extraction]
    G --> H[Revenue Extraction]
    H --> I[Controls Parsing]
    
    I --> J[AI Analysis<br/>guideline_rag.py]
    J --> K[Risk Assessment]
    K --> L[Quote/Decline/Refer<br/>Recommendation]
    
    L --> M[Rating Engine<br/>rating_engine/engine.py]
    M --> N[Premium Calculation]
    N --> O[Control Modifiers]
    
    O --> P[Quote Generation]
    P --> Q[PDF Creation]
    Q --> R[Storage<br/>Supabase]
    
    R --> S[React Frontend]
    S --> T[Underwriter Review]
```

### Detailed Component Architecture

```mermaid
graph LR
    subgraph "Data Ingestion"
        A1[Email Polling]
        A2[Local Upload]
        A3[Document Parser]
    end
    
    subgraph "Processing Pipeline"
        B1[Document Standardization]
        B2[Revenue Extraction]
        B3[Controls Parsing]
        B4[Vector Embeddings]
    end
    
    subgraph "AI Analysis Layer"
        C1[RAG Retrieval]
        C2[GPT Analysis]
        C3[Recommendation Engine]
    end
    
    subgraph "Rating Engine"
        D1[Industry Mapping]
        D2[Hazard Classification]
        D3[Control Modifiers]
        D4[Premium Calculation]
    end
    
    subgraph "Output Generation"
        E1[Quote Templates]
        E2[PDF Generation]
        E3[Storage Layer]
    end
    
    subgraph "User Interface"
        F1[Modular Rating Panel]
        F2[Document Viewer]
        F3[AI Recommendations]
        F4[Quote Management]
    end
    
    A1 --> B1
    A2 --> B1
    A3 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4
    D4 --> E1
    E1 --> E2
    E2 --> E3
    E3 --> F1
    F1 --> F2
    F2 --> F3
    F3 --> F4
```

## 🏗️ Component Details

### 1. Document Processing Pipeline (`core/pipeline.py`)

**Purpose**: Standardizes incoming documents and extracts structured data

**Key Functions**:
- `process_submission()` - Main entry point
- `extract_revenue()` - Smart revenue parsing from various formats
- `parse_controls_from_summary()` - **NEW**: Extracts security controls from text
- `standardize_document()` - Converts various formats to JSON

**Data Flow**:
```
Raw Documents → Parsing → Standardization → Data Extraction → Database Storage
```

### 2. AI Analysis Engine (`guideline_rag.py`)

**Purpose**: Provides underwriting recommendations using Retrieval Augmented Generation

**Components**:
- **Vector Database**: pgvector with underwriting guidelines
- **Retrieval**: Similarity search for relevant guidelines
- **Analysis**: GPT-4 evaluation with guideline context
- **Output**: Quote/Decline/Refer recommendation with citations

**Process**:
```
Submission Data → Vector Search → Guideline Retrieval → GPT Analysis → Recommendation
```

### 3. Modular Rating Engine (`rating_engine/engine.py`)

**Purpose**: Calculates insurance premiums based on configurable risk factors

**Key Components**:
- **Industry Hazard Mapping**: Maps NAICS codes to hazard classes (1-5)
- **Revenue Band Pricing**: Base rates by revenue size
- **Control Modifiers**: Credits/debits for security controls
- **Policy Configuration**: Limit and retention factors

**Configuration Structure**:
```yaml
# Example configuration
industry_hazard_map.yml:
  Software_as_a_Service_SaaS: 4
  Professional_Services_Consulting: 2

control_modifiers.yml:
  MFA: -0.05      # 5% credit
  EDR: -0.03      # 3% credit
  No_EDR: 0.10    # 10% debit
```

**Rating Process**:
```
Industry + Revenue → Base Rate → Control Adjustments → Limit/Retention Factors → Final Premium
```

### 4. UI Architecture

**Current Structure**:
- **React Frontend** (`frontend/`) - Primary user interface
- **FastAPI Backend** (`api/main.py`) - REST API serving the frontend
- **Reusable Components** (`frontend/src/components/`) - Modular React components

**Key Pages**:
- `QuotePageV3` - Tower visualization and quote management
- `SetupPage` - Account and review (consolidated)
- `AnalyzePage` - UW, rating, and benchmarking (consolidated)
- `PolicyPage` - Policy issuance and management

## 🔧 Technical Stack

### Core Technologies
- **Frontend**: React + Vite
- **Backend**: Python 3.11+, FastAPI
- **Database**: PostgreSQL via Supabase (with pgvector)
- **AI/ML**: Claude (Anthropic), AWS Textract
- **Storage**: Supabase storage

### Database Schema
```sql
-- Core tables
submissions (
    id UUID PRIMARY KEY,
    applicant_name TEXT,
    annual_revenue BIGINT,
    business_summary TEXT,
    bullet_point_summary TEXT,
    nist_controls_summary TEXT,
    embedding VECTOR(1536),
    quote_ready BOOLEAN,
    created_at TIMESTAMP
);

documents (
    id UUID PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),
    filename TEXT,
    document_type TEXT,
    content TEXT,
    created_at TIMESTAMP
);

quotes (
    id UUID PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),
    premium DECIMAL,
    policy_limit BIGINT,
    retention BIGINT,
    quote_data JSONB,
    pdf_url TEXT,
    created_at TIMESTAMP
);
```

## 🚀 Deployment Architecture

### Development Environment
```
Local Machine
├── FastAPI backend (uvicorn)
├── React dev server (Vite)
├── Supabase (cloud database)
└── AI APIs (Claude, Textract)
```

### Production Considerations
```
Cloud Environment
├── Managed PostgreSQL (AWS RDS/DigitalOcean)
├── Container deployment (Docker)
├── Supabase storage
├── Background email polling
└── Load balancer for multiple instances
```

## 🔄 Data Flow Patterns

### 1. Submission Processing Flow
```
Email/Upload → Document Parsing → Data Extraction → Vector Embedding → Database Storage
```

### 2. Rating Calculation Flow
```
Submission Data → Industry Mapping → Hazard Classification → Control Detection → Premium Calculation
```

### 3. AI Analysis Flow
```
Submission Context → Vector Search → Guideline Retrieval → GPT Analysis → Recommendation Generation
```

### 4. Quote Generation Flow
```
Rating Result → Template Selection → PDF Generation → Storage Upload → URL Generation
```

## 🔧 Configuration Management

### Environment Variables
```bash
# Core APIs
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Storage
SUPABASE_URL=https://...
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_ROLE=eyJ...
```

### Rating Engine Configuration
All rating logic is externalized to YAML files for easy updates:

```
rating_engine/config/
├── industry_hazard_map.yml    # Industry risk classifications
├── hazard_base_rates.yml      # Base rates by hazard class
├── limit_factors.yml          # Policy limit multipliers
├── retention_factors.yml      # Deductible multipliers
└── control_modifiers.yml      # Security control adjustments
```

## 🧪 Testing Strategy

### Unit Testing
- **Rating Engine**: Test premium calculations with known inputs
- **Controls Parsing**: Verify EDR/MFA detection from text
- **Revenue Extraction**: Test various revenue formats

### Integration Testing
- **End-to-End**: Process fixture data through complete pipeline
- **AI Analysis**: Test with known guideline scenarios
- **Database**: Verify data persistence and retrieval

### Performance Testing
- **API Response Times**: Backend endpoint latency
- **Large Documents**: Processing performance with large PDFs
- **Vector Search**: Retrieval performance with large guideline database

## 📊 Monitoring & Observability

### Key Metrics
- **Processing Time**: Document processing duration
- **Rating Accuracy**: Premium calculation consistency
- **AI Response Quality**: Recommendation relevance
- **System Performance**: Response times and error rates

### Logging Strategy
```python
# Example logging implementation
import logging

logger = logging.getLogger(__name__)

def process_submission_with_logging(submission_data):
    logger.info(f"Processing submission {submission_data['id']}")
    start_time = time.time()
    
    try:
        result = process_submission(submission_data)
        duration = time.time() - start_time
        logger.info(f"Successfully processed in {duration:.2f}s")
        return result
    except Exception as e:
        duration = time.time() - start_time
        logger.error(f"Processing failed after {duration:.2f}s: {e}")
        raise
```

This architecture provides a robust, scalable foundation for cyber insurance submission processing with clear separation of concerns and modular design principles.