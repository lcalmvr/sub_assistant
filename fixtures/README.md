# Fixtures

Test data for development and testing the extraction pipeline.

## Contents

| Folder/File | Description |
|-------------|-------------|
| `acme/` | Sample submission (email + standardized output) |
| `karbon steel/` | Full sample submission (email, PDF app, standardized JSON) |
| `karbon_steel_LM/` | Variant of karbon steel test case |
| `moog/` | Full sample submission with ProAssurance app |
| `email_dumps/` | Sample email JSON dumps for testing email ingestion |
| `*.json` | Sample standardized outputs |
| `email.txt` | Sample email text |

## Usage

These fixtures are used to test:
- Document extraction pipeline
- Email parsing and ingestion
- Standardized JSON output format
- AI extraction accuracy

## Adding New Fixtures

Create a folder with the company name containing:
- `email.txt` - The submission email
- `*.pdf` - Application documents
- `application.standardized.json` - Expected extraction output
