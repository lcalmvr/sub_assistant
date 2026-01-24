# AI Agent UI Design

## Overview

Add a centralized AI agent accessible from the top bar that provides contextual assistance throughout the UW workflow.

---

## Design Decision: Single Agent with Context Awareness

Rather than separate UW/Admin/Quote assistants, implement a **single AI agent** that:
- Knows the current page context (Setup, Analyze, Quote, Policy)
- Knows the submission state (received, quoted, bound)
- Offers relevant actions based on context

This is simpler and more intuitive than switching between multiple agents.

---

## UI Location: Top Bar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ UW Portal › Acme Corp  [Quoted]    Chicago, IL · Tech · $50M    [Docs] [AI] │
│ ─────────────────────────────────────────────────────────────────────────── │
│ [Setup] [Analyze] [Analyze V2] [Quote] [Policy]                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                       ↑
                                                              AI Agent Button
```

### AI Button Design

- Icon: Sparkles (✨) or chat bubble with sparkle
- Position: Between Docs and Corrections badges
- Badge indicator: Shows pending actions (e.g., "3 items need attention")
- Tooltip: "AI Assistant"

---

## Agent Panel: Slide-Out from Right

When clicked, a panel slides in from the right (similar to DocsPanel pattern):

```
┌────────────────────────────────────┐
│ AI Assistant              [x]      │
├────────────────────────────────────┤
│                                    │
│ Quick Actions:                     │
│ ┌────────────┐ ┌────────────┐     │
│ │ Summarize  │ │ Show Gaps  │     │
│ └────────────┘ └────────────┘     │
│ ┌────────────┐ ┌────────────┐     │
│ │ Parse Email│ │ NIST Eval  │     │
│ └────────────┘ └────────────┘     │
│                                    │
│ ───────────────────────────────── │
│                                    │
│  Chat History:                     │
│                                    │
│  [AI] I analyzed the submission.   │
│  Here are 3 critical gaps...       │
│                                    │
│  [You] What about MFA?             │
│                                    │
│  [AI] The application shows...     │
│                                    │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ Ask me anything...          ⏎  │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

---

## Panel Sections

### 1. Header
- Title: "AI Assistant"
- Close button (X)
- Optional: Context indicator (e.g., "Analyzing: Acme Corp")

### 2. Quick Actions (Context-Aware)

Shown as chips/buttons at the top. Changes based on current page and state:

**On Setup Page:**
- Summarize submission
- Check documents

**On Analyze Page:**
- Show gaps (critical fields missing)
- Generate NIST assessment
- Parse broker response

**On Quote Page:**
- Generate options (1M, 3M, 5M)
- Build tower structure
- Apply to all options

**On Policy Page (if bound):**
- Extend policy
- Change broker (BOR)
- Mark subjectivity received
- Generate binder

### 3. Chat History
- Scrollable message list
- AI messages in gray bubbles (left-aligned)
- User messages in blue bubbles (right-aligned)
- Code/JSON in monospace blocks
- Action previews with Confirm/Cancel buttons

### 4. Input Area
- Text input with placeholder "Ask me anything..."
- Send button (or Enter to send)
- Optional: Voice input button (future)

---

## Interaction Patterns

### Pattern A: Quick Action Click

1. User clicks "Show Gaps"
2. Agent immediately runs the action
3. Response streams into chat with structured data
4. If actionable: shows confirmation buttons

```
┌────────────────────────────────────┐
│ [AI] Found 3 critical gaps:        │
│                                    │
│ ❌ MFA for Email - Not confirmed   │
│ ❌ Immutable Backups - Unknown     │
│ ❌ EDR Coverage - Not confirmed    │
│                                    │
│ Would you like me to:              │
│ [Draft broker email] [Dismiss]     │
└────────────────────────────────────┘
```

### Pattern B: Free-Form Question

1. User types: "What's the MFA situation?"
2. Agent searches extracted values and documents
3. Response with source citations

```
┌────────────────────────────────────┐
│ [AI] Based on the application:     │
│                                    │
│ • Email MFA: Yes (Azure AD)        │
│   Source: Application p.3          │
│                                    │
│ • Remote Access MFA: Unknown       │
│   Not mentioned in documents       │
│                                    │
│ • Privileged MFA: Unknown          │
│   Not mentioned in documents       │
└────────────────────────────────────┘
```

### Pattern C: Admin Command (Policy Page)

1. User types: "Extend 30 days"
2. Agent shows preview for confirmation
3. User confirms → Action executed

```
┌────────────────────────────────────┐
│ [AI] Ready to extend policy:       │
│                                    │
│ • Policy: Acme Corp                │
│ • Current exp: 2026-06-01          │
│ • New exp: 2026-07-01 (+30 days)   │
│ • Premium change: +$4,167          │
│                                    │
│ [Confirm Extension] [Cancel]       │
└────────────────────────────────────┘

→ User clicks Confirm

┌────────────────────────────────────┐
│ [AI] ✓ Policy extended to          │
│ 2026-07-01. Endorsement created.   │
└────────────────────────────────────┘
```

### Pattern D: Broker Response Parsing

1. User clicks "Parse Email" or pastes email text
2. Agent extracts information
3. Shows proposed updates for confirmation

```
┌────────────────────────────────────┐
│ [AI] Parsed broker response:       │
│                                    │
│ I found these confirmations:       │
│                                    │
│ ✓ MFA Email - "Yes, Azure AD"      │
│ ✓ EDR - "CrowdStrike deployed"     │
│ ? Backups - Unclear, need follow-up│
│                                    │
│ [Apply Updates] [Edit First]       │
└────────────────────────────────────┘
```

---

## State Management

### Session State (React Context)
```javascript
{
  isOpen: boolean,
  messages: [
    { role: 'user' | 'assistant', content: string, timestamp: Date },
    ...
  ],
  pendingAction: {
    type: 'extend_policy' | 'parse_response' | ...,
    preview: { ... },
  } | null,
  isStreaming: boolean,
}
```

### Context Injection

The agent receives context with each request:
```javascript
{
  submission_id: "...",
  page: "analyze" | "quote" | "policy",
  submission_state: {
    status: "quoted",
    outcome: "waiting",
    is_bound: false,
    applicant_name: "Acme Corp",
    ...
  },
  user: "Sarah",
}
```

---

## API Design

### Endpoint: POST `/api/agents/chat`

```javascript
// Request
{
  submission_id: "uuid",
  page_context: "analyze",
  message: "What are the critical gaps?",
  conversation_history: [...], // Last N messages
}

// Response (streaming)
{
  type: "text" | "action_preview" | "structured_data",
  content: "...",
  // For action_preview:
  action: {
    type: "extend_policy",
    params: { ... },
    description: "Extend policy 30 days",
  },
}
```

---

## Quick Actions by Page

### Setup Page
| Action | Description |
|--------|-------------|
| Summarize | Generate 3-bullet summary of submission |
| Check Docs | Verify all required documents present |
| Explain Risk | AI interpretation of key risk factors |

### Analyze Page
| Action | Description |
|--------|-------------|
| Show Gaps | List critical/important fields not confirmed |
| Parse Email | Extract info from broker response |
| NIST Assessment | Generate/refresh NIST framework evaluation |
| Compare to Peers | Show how this risk compares to similar accounts |

### Quote Page
| Action | Description |
|--------|-------------|
| Generate Options | Create multiple limit options |
| Build Tower | Configure tower structure from description |
| Price Guidance | Suggest premium based on risk factors |

### Policy Page (Bound)
| Action | Description |
|--------|-------------|
| Extend Policy | Create extension endorsement |
| Change Broker | Process BOR change |
| Mark Subjectivity | Mark subjectivity as received |
| Generate Binder | Create/regenerate binder document |
| Flat Cancel | Cancel policy flat |
| Pro-rata Cancel | Cancel policy with pro-rata return |

---

## Implementation Components

```
frontend/src/components/
├── AiAgentButton.jsx       # Top bar button with badge
├── AiAgentPanel.jsx        # Slide-out panel container
├── AiAgentChat.jsx         # Message list + input
├── AiAgentQuickActions.jsx # Context-aware action chips
├── AiAgentMessage.jsx      # Single message component
└── AiAgentActionPreview.jsx # Confirmation card for actions

frontend/src/hooks/
└── useAiAgent.js           # Hook for agent state and API

api/
└── ai/react_agents.py      # Backend agent orchestration
```

---

## Design Decisions

1. **Persistence**: Session-only (cleared on page refresh)
   - But: "Save to Notes" button on AI messages to export useful responses
   - Can save summaries, broker response analysis, etc. as submission notes

2. **Multi-tab**: Each submission has own agent context (scoped by submission_id)

3. **Keyboard shortcut**: Cmd+K to toggle agent panel

4. **Notifications**: Pull-based only for v1 (user asks, agent responds)
   - Proactive notifications planned for Phase 6 (see PROJECT_ROADMAP.md)
