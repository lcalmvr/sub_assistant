# AI Agent API Contract

## Overview

API design for the AI agent, supporting:
- Chat with streaming responses
- Quick actions (pre-defined operations)
- Admin commands with confirmation flow
- Context-aware behavior

---

## Endpoints

### 1. POST `/api/agent/chat`

Main chat endpoint. Handles free-form questions and commands.

**Request:**
```json
{
  "submission_id": "uuid",
  "message": "What are the critical gaps?",
  "context": {
    "page": "analyze",
    "user_name": "Sarah"
  },
  "conversation_history": [
    {"role": "user", "content": "Summarize this submission"},
    {"role": "assistant", "content": "This is a $50M tech company..."}
  ]
}
```

**Response (Streaming SSE):**
```
event: message
data: {"type": "text", "content": "Based on the extraction data, "}

event: message
data: {"type": "text", "content": "I found 3 critical gaps:\n\n"}

event: message
data: {"type": "structured", "content": {"gaps": [{"field": "MFA Email", "status": "not_confirmed", "importance": "critical"}]}}

event: done
data: {"message_id": "msg_123"}
```

**Response Types:**

| Type | Description |
|------|-------------|
| `text` | Plain text chunk (for streaming) |
| `structured` | JSON data (gaps, summaries, etc.) |
| `action_preview` | Confirmation required before execution |
| `action_result` | Result of executed action |
| `error` | Error message |

---

### 2. POST `/api/agent/action`

Execute a quick action or confirmed command.

**Request:**
```json
{
  "submission_id": "uuid",
  "action": "show_gaps",
  "context": {
    "page": "analyze",
    "user_name": "Sarah"
  }
}
```

**Response:**
```json
{
  "success": true,
  "type": "structured",
  "data": {
    "gaps": [
      {
        "field_key": "mfa_email",
        "field_name": "MFA for Email",
        "category": "Authentication",
        "importance": "critical",
        "status": "not_confirmed",
        "last_source": null
      },
      {
        "field_key": "immutable_backups",
        "field_name": "Immutable Backups",
        "category": "Backup & Recovery",
        "importance": "critical",
        "status": "unknown",
        "last_source": null
      }
    ],
    "summary": "3 critical fields need confirmation before binding"
  }
}
```

---

### 3. POST `/api/agent/confirm`

Confirm and execute a previewed action.

**Request:**
```json
{
  "submission_id": "uuid",
  "action_id": "preview_456",
  "confirmed": true,
  "user_name": "Sarah"
}
```

**Response:**
```json
{
  "success": true,
  "type": "action_result",
  "message": "Policy extended to 2026-07-01. Endorsement #3 created.",
  "created_ids": ["endorsement_789"]
}
```

---

## Quick Actions

### Analyze Page Actions

#### `show_gaps`
Returns critical/important fields missing confirmation.

```json
// Response
{
  "gaps": [
    {
      "field_key": "mfa_email",
      "field_name": "MFA for Email",
      "category": "Authentication",
      "importance": "critical",
      "status": "not_confirmed"
    }
  ],
  "critical_count": 3,
  "important_count": 5
}
```

#### `summarize`
Returns AI-generated summary of submission.

```json
// Response
{
  "summary": "Acme Corp is a $50M technology company based in Chicago...",
  "key_risks": ["No EDR deployed", "Backup strategy unclear"],
  "strengths": ["MFA enabled", "SOC 2 certified"]
}
```

#### `parse_broker_response`
Parses pasted email/text to extract control confirmations.

```json
// Request
{
  "action": "parse_broker_response",
  "params": {
    "text": "Hi, confirming that we have MFA on all email accounts via Azure AD. EDR is CrowdStrike..."
  }
}

// Response (action_preview - needs confirmation)
{
  "type": "action_preview",
  "action_id": "preview_123",
  "description": "Apply broker response updates",
  "updates": [
    {
      "field_key": "mfa_email",
      "field_name": "MFA for Email",
      "new_value": "present",
      "source_text": "MFA on all email accounts via Azure AD",
      "confidence": 0.95
    },
    {
      "field_key": "edr_deployed",
      "field_name": "EDR Deployed",
      "new_value": "present",
      "source_text": "EDR is CrowdStrike",
      "confidence": 0.92
    }
  ]
}
```

#### `nist_assessment`
Generates/refreshes NIST framework evaluation.

```json
// Response
{
  "assessment": {
    "identify": {"score": 3, "max": 5, "notes": "Asset inventory incomplete"},
    "protect": {"score": 4, "max": 5, "notes": "Strong MFA, EDR deployed"},
    "detect": {"score": 2, "max": 5, "notes": "No SIEM mentioned"},
    "respond": {"score": 3, "max": 5, "notes": "IR plan exists"},
    "recover": {"score": 4, "max": 5, "notes": "Immutable backups confirmed"}
  },
  "overall_score": 3.2,
  "generated_at": "2026-01-05T10:30:00Z"
}
```

---

### Quote Page Actions

#### `generate_options`
Generates multiple quote options from description.

```json
// Request
{
  "action": "generate_options",
  "params": {
    "description": "1M, 3M, 5M at 50K retention"
  }
}

// Response (action_preview)
{
  "type": "action_preview",
  "action_id": "preview_456",
  "description": "Create 3 quote options",
  "options": [
    {"limit": 1000000, "retention": 50000, "estimated_premium": null},
    {"limit": 3000000, "retention": 50000, "estimated_premium": null},
    {"limit": 5000000, "retention": 50000, "estimated_premium": null}
  ]
}
```

#### `build_tower`
Builds tower structure from description.

```json
// Request
{
  "action": "build_tower",
  "params": {
    "description": "XL primary 5M x 50K SIR for 100K, CMAI 5M xs 5M for 45K"
  }
}

// Response (action_preview)
{
  "type": "action_preview",
  "action_id": "preview_789",
  "description": "Build 2-layer tower",
  "tower": {
    "retention": 50000,
    "layers": [
      {"carrier": "XL", "limit": 5000000, "attachment": 0, "premium": 100000},
      {"carrier": "CMAI", "limit": 5000000, "attachment": 5000000, "premium": 45000}
    ]
  }
}
```

---

### Policy Page Actions (Bound Policies)

#### `extend_policy`
Extends policy expiration date.

```json
// Request
{
  "action": "extend_policy",
  "params": {
    "days": 30
  }
}

// Response (action_preview)
{
  "type": "action_preview",
  "action_id": "preview_ext_123",
  "description": "Extend policy 30 days",
  "changes": [
    {"field": "expiration_date", "from": "2026-06-01", "to": "2026-07-01"},
    {"field": "premium", "from": "$50,000", "to": "$54,167 (+$4,167)"}
  ],
  "warnings": []
}
```

#### `change_broker`
Process broker of record change.

```json
// Request
{
  "action": "change_broker",
  "params": {
    "new_broker_name": "Marsh",
    "effective_date": "2026-02-01"
  }
}

// Response (action_preview)
{
  "type": "action_preview",
  "action_id": "preview_bor_456",
  "description": "Change broker to Marsh",
  "changes": [
    {"field": "broker", "from": "Aon (Steve Smith)", "to": "Marsh (TBD)"},
    {"field": "effective_date", "from": "N/A", "to": "2026-02-01"}
  ],
  "warnings": [],
  "broker_matches": [
    {"id": "broker_1", "name": "Marsh", "contact": "Jane Doe"},
    {"id": "broker_2", "name": "Marsh McLennan", "contact": "Bob Wilson"}
  ]
}
```

#### `mark_subjectivity`
Mark subjectivity as received.

```json
// Request
{
  "action": "mark_subjectivity",
  "params": {
    "description": "financials"
  }
}

// Response (action_preview)
{
  "type": "action_preview",
  "action_id": "preview_subj_789",
  "description": "Mark subjectivity received",
  "subjectivity": {
    "id": "subj_123",
    "text": "Audited financial statements for last 2 years",
    "current_status": "pending"
  }
}
```

#### `cancel_policy`
Cancel policy (flat or pro-rata).

```json
// Request
{
  "action": "cancel_policy",
  "params": {
    "type": "pro_rata",
    "effective_date": "2026-03-01"
  }
}

// Response (action_preview)
{
  "type": "action_preview",
  "action_id": "preview_cancel_123",
  "description": "Pro-rata cancel effective 2026-03-01",
  "changes": [
    {"field": "status", "from": "bound", "to": "cancelled"},
    {"field": "premium_return", "from": "$0", "to": "$25,000 (6 months)"}
  ],
  "warnings": ["This action cannot be undone"]
}
```

---

## Context Object

Passed with every request:

```json
{
  "page": "analyze | quote | policy | setup",
  "user_name": "Sarah",
  "submission_snapshot": {
    "id": "uuid",
    "applicant_name": "Acme Corp",
    "status": "quoted",
    "outcome": "waiting_for_response",
    "is_bound": false,
    "effective_date": "2026-01-01",
    "expiration_date": "2027-01-01"
  }
}
```

The backend enriches this with full submission data as needed.

---

## Error Handling

```json
{
  "success": false,
  "type": "error",
  "error": {
    "code": "POLICY_NOT_BOUND",
    "message": "This action requires a bound policy",
    "details": null
  }
}
```

Common error codes:
- `POLICY_NOT_BOUND` - Action requires bound policy
- `INVALID_ACTION` - Unknown action type
- `MISSING_PARAMS` - Required parameters not provided
- `NOT_FOUND` - Submission/resource not found
- `PARSE_ERROR` - Could not parse user input
- `EXECUTION_FAILED` - Action failed during execution

---

## Streaming Protocol

Using Server-Sent Events (SSE) for `/api/agent/chat`:

```
POST /api/agent/chat
Accept: text/event-stream
Content-Type: application/json

{"submission_id": "...", "message": "..."}
```

Response stream:
```
event: message
data: {"type": "text", "content": "chunk of text"}

event: message
data: {"type": "text", "content": "more text"}

event: message
data: {"type": "structured", "content": {...}}

event: done
data: {"message_id": "msg_abc", "tokens_used": 450}
```

Frontend handles:
```javascript
const eventSource = new EventSource('/api/agent/chat', {
  method: 'POST',
  body: JSON.stringify(payload)
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'text') {
    appendToMessage(data.content);
  } else if (data.type === 'structured') {
    renderStructuredData(data.content);
  }
};
```

---

## Implementation Notes

### Backend Structure

```python
# api/agent_routes.py

@router.post("/agent/chat")
async def agent_chat(request: AgentChatRequest):
    """Stream chat response."""
    return StreamingResponse(
        stream_chat_response(request),
        media_type="text/event-stream"
    )

@router.post("/agent/action")
async def agent_action(request: AgentActionRequest):
    """Execute quick action (non-streaming)."""
    return execute_action(request)

@router.post("/agent/confirm")
async def agent_confirm(request: AgentConfirmRequest):
    """Confirm and execute previewed action."""
    return confirm_action(request)
```

### Action Registry

```python
# ai/agent_actions.py

ACTION_REGISTRY = {
    "show_gaps": ShowGapsAction,
    "summarize": SummarizeAction,
    "parse_broker_response": ParseBrokerResponseAction,
    "nist_assessment": NistAssessmentAction,
    "generate_options": GenerateOptionsAction,
    "build_tower": BuildTowerAction,
    "extend_policy": ExtendPolicyAction,
    "change_broker": ChangeBrokerAction,
    "mark_subjectivity": MarkSubjectivityAction,
    "cancel_policy": CancelPolicyAction,
}
```

### Reusing Existing Code

Port from Streamlit:
- `ai/admin_agent.py` → `ExtendPolicyAction`, `ChangeBrokerAction`, `MarkSubjectivityAction`
- `pages_components/ai_command_box.py` → `GenerateOptionsAction`, `BuildTowerAction`
