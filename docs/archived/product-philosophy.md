# Product Philosophy Guide

Strategic decisions on AI vs. manual workflows, performance expectations, and technology choices.

---

## AI-First vs. Manual-First Development

### The Core Question

When building a feature, should you:
1. **Manual-first** - Build the human workflow, then layer AI on top
2. **AI-first** - Design for AI to do the work, with manual as fallback

### Decision Framework

| Build Manual-First When | Build AI-First When |
|-------------------------|---------------------|
| Domain is complex, still learning it | Task is clearly automatable |
| Failure is costly (wrong premium, missed exclusion) | Failure is cheap to fix |
| Users need to trust/verify output | Manual would be tedious busywork |
| Need baseline to measure AI accuracy | You already understand the domain |

### The Right Pattern: AI Proposes, Human Disposes

The hybrid approach that works:
- AI extracts submission data → human reviews
- AI suggests conflicts → human resolves
- AI drafts documents → human approves
- Manual workflows exist as fallback/override

### Trap to Avoid

Building elaborate manual UI for something AI should just *do*. If you're building a 10-field form for something GPT could extract from a PDF in 2 seconds, stop and reconsider.

---

## Performance & User Experience

### The Lag Tolerance Equation

**Key insight:** Acceptable lag depends on the AI/human work split.

| Scenario | Lag Tolerance |
|----------|---------------|
| AI does 90%, UW reviews 10% | Higher - fewer interactions per submission |
| 50/50 split | Medium - noticeable friction |
| UW does 90%, AI assists 10% | Low - every micro-lag compounds |

### Excel vs. Web Apps

Users compare everything to Excel, which is locally responsive:
- Every keystroke = instant
- Navigate 1000 rows = instant
- The *work* is fast (sharing is the pain)

Web apps (including Streamlit) are server-first:
- Every action = network round-trip
- Micro-lag on every interaction
- Breaks flow state for high-frequency tasks

**Implication:** If AI-first succeeds, the UI becomes a "review dashboard" not a "work tool." Dashboards can be laggy. Work tools cannot.

### Performance Benchmarks

| Interaction | Frustrating | Tolerable | Good |
|-------------|-------------|-----------|------|
| Button click | >500ms | 200-500ms | <100ms |
| Tab switch | >1s | 300ms-1s | <300ms |
| Form submit | >2s | 500ms-2s | <500ms |
| Page load | >3s | 1-3s | <1s |

---

## Streamlit vs. React

### Architectural Differences

| Streamlit | React |
|-----------|-------|
| Every click = full Python script rerun | Only affected components rerender |
| Server round-trip for ALL interactions | Client-side state updates instantly |
| Entire page rerenders | Virtual DOM diffs only changes |
| Synchronous/blocking | Async with loading states |
| ~200-500ms minimum per interaction | ~16ms for simple state changes |

### Streamlit Limitations

Streamlit will never feel like Excel. It's architecturally impossible. You can optimize from 500ms to 200ms, but you can't get to 16ms local responsiveness.

### When Each Makes Sense

**Streamlit:**
- Rapid prototyping and validation
- AI-first product where UI is secondary
- Internal tools with tolerant users
- When development speed > runtime speed

**React:**
- High-frequency user interactions
- Manual-heavy workflows
- Consumer-grade UX expectations
- When you know exactly what to build

### Migration Strategy

1. **Don't prematurely migrate** - "Let me rewrite in React first" is how projects die
2. **Keep shipping in Streamlit** - Validate the product, not the tech stack
3. **Working app = clear spec** - When you migrate, you know exactly what to build
4. **Plan for later** - AI-assisted migration with working reference is efficient

**The variable that decides everything:** Can you make the AI good enough that the UI becomes secondary? If yes, Streamlit may be fine forever. If no, React is the endgame.

---

## Summary

1. **AI-first for grunt work, manual-first for core workflows** - Know which is which
2. **Lag tolerance scales with AI success** - More AI = less clicking = more tolerance
3. **Streamlit is fine for now** - Ship, validate, migrate later if needed
4. **Don't gaslight yourself** - The lag is real, it's a limitation, planning for React later is valid

---

*Last updated: 2025-12-27*
