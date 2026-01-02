# API Contract Specification

This document defines the API contract that the FastAPI layer will implement. The mock broker platform is built to this specification.

## Base URL

```
http://localhost:8000/api/v1
```

(Production URL will be different)

## Authentication

**Planned:** API Key authentication
- Header: `Authorization: Bearer <api_key>`
- API keys will be issued to broker platforms

## Endpoints

### 1. Submit Quote Request

**POST** `/api/v1/quote`

Submit a quote request with submission data.

**Request Body:**
```json
{
  "company_name": "Acme Corporation",
  "website": "https://acme.com",
  "annual_revenue": 5000000,
  "industry": "Software_as_a_Service_SaaS",
  "security_controls": ["MFA", "EDR", "Backups", "Encryption"],
  "policy_limit": 5000000,
  "retention": 50000,
  "effective_date": "2024-01-01",  // Optional
  "expiration_date": "2025-01-01"  // Optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "quote": {
    "quote_id": "QUOTE-1234567890",
    "submission_id": "SUB-1234567890",
    "company_name": "Acme Corporation",
    "premium": 45000,
    "policy_limit": 5000000,
    "retention": 50000,
    "effective_date": "2024-01-01",
    "expiration_date": "2025-01-01",
    "status": "quoted",
    "quote_details": {
      "base_premium": 50000,
      "control_credits": 5000,
      "industry": "Software_as_a_Service_SaaS",
      "revenue": 5000000,
      "hazard_class": 4,
      "rating_breakdown": {
        "base_rate": 0.01,
        "industry_modifier": 1.2,
        "control_modifiers": {
          "MFA": -0.05,
          "EDR": -0.03,
          "Backups": -0.02
        }
      }
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid submission data",
  "details": {
    "field": "annual_revenue",
    "message": "Annual revenue is required"
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid API key)
- `500` - Internal Server Error

---

### 2. Get Quote Status

**GET** `/api/v1/quote/{quote_id}`

Retrieve quote details by quote ID.

**Response:**
```json
{
  "success": true,
  "quote": {
    "quote_id": "QUOTE-1234567890",
    "submission_id": "SUB-1234567890",
    "company_name": "Acme Corporation",
    "premium": 45000,
    "policy_limit": 5000000,
    "retention": 50000,
    "status": "quoted",
    "effective_date": "2024-01-01",
    "expiration_date": "2025-01-01",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

**Status Codes:**
- `200` - Success
- `404` - Quote not found
- `401` - Unauthorized

---

### 3. Create Submission

**POST** `/api/v1/submission`

Create a new submission (for broker-initiated submissions).

**Request Body:**
```json
{
  "company_name": "Acme Corporation",
  "website": "https://acme.com",
  "annual_revenue": 5000000,
  "industry": "Software_as_a_Service_SaaS",
  "business_summary": "SaaS platform for...",
  "security_controls": ["MFA", "EDR"],
  "broker_email": "broker@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "submission": {
    "submission_id": "SUB-1234567890",
    "status": "pending",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

---

## Data Types

### Industry Values

- `Software_as_a_Service_SaaS`
- `Professional_Services_Consulting`
- `Advertising_Marketing_Technology`
- `Healthcare_Services`
- `Financial_Services`
- `Retail_E_Commerce`
- `Manufacturing`
- `Other`

### Security Controls

- `MFA` - Multi-Factor Authentication
- `EDR` - Endpoint Detection & Response
- `Backups` - Automated Backups
- `Encryption` - Data Encryption at Rest
- `SIEM` - Security Information & Event Management
- `SOC` - Security Operations Center

### Quote Status

- `pending` - Quote request received, processing
- `quoted` - Quote generated successfully
- `declined` - Quote declined
- `expired` - Quote expired
- `bound` - Quote bound (policy issued)

## ACORD Compliance

**Future Enhancement:** The API will support ACORD XML/JSON formats for broker platform integration.

**ACORD Fields (to be added):**
- Policy number
- Producer information
- Insured information (structured)
- Coverage details
- Premium breakdown
- Terms and conditions

## Rate Limiting

**Planned:**
- 100 requests per minute per API key
- 1000 requests per hour per API key

## Error Handling

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "error_code": "ERROR_CODE",
  "details": {
    // Additional error details
  }
}
```

## Versioning

API version is specified in the URL path: `/api/v1/`

Future versions will be: `/api/v2/`, etc.

## Webhooks (Future)

**Planned:** Webhook support for async quote updates

- `quote.updated` - Quote status changed
- `quote.expired` - Quote expired
- `quote.bound` - Quote bound

## Implementation Notes

- All dates in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)
- All monetary values in cents (or specify currency)
- All IDs are UUIDs (string format)
- All endpoints return JSON

## Testing

Use the mock broker platform to test the API contract before building FastAPI.

When FastAPI is built, update `mock-api.js` to call the real endpoints.





