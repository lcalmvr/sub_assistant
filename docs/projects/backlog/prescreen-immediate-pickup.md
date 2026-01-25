# Prescreen Immediate Pickup

**Priority:** Medium
**Added:** 2025-01-24

## Problem

Current prescreen flow requires voting (Pursue/Pass/Unsure) before a submission moves to "Ready to Work" and can be claimed. Sometimes UWs know immediately they want to work a submission and voting is an unnecessary step.

## Solution

Allow UWs to skip voting and claim a submission directly from the prescreen queue.

## Use Cases

- Obvious fit (known broker, clear appetite match)
- Renewals from existing accounts
- Urgent submissions that need immediate attention
- UW sees enough info in the card to decide

## UI Options

### Option A: Add "Claim Now" Button
```
┌─────────────────────────────────────────┐
│ CloudTech Solutions          PRE-SCREEN │
│ B2B SaaS, $75M revenue, SOC2           │
│                                         │
│ [👍 Pursue] [👎 Pass] [❓ Unsure]       │
│                                         │
│ [Claim Now →]                           │
└─────────────────────────────────────────┘
```

### Option B: Claim is Always Available
- Remove the two-step (vote → claim) flow
- "Claim" button on every prescreen card
- Voting becomes optional feedback, not a gate

### Option C: Quick Actions on Hover
- Hover reveals "Claim" action
- Keeps UI clean, power-user friendly

## Behavior

When "Claim Now" is clicked:
1. Auto-record a "Pursue" vote (for tracking/metrics)
2. Assign submission to current UW
3. Navigate to submission detail page (or stay on queue)

## Considerations

- **Metrics:** Still want to track pursuit rate, so auto-vote on claim
- **Permissions:** Should all UWs be able to bypass voting, or just seniors?
- **Queue management:** If someone claims, remove from others' vote queue

## Related

- Vote queue page: `frontend/src/pages/VoteQueuePage.jsx`
- Current flow requires vote → ready to work → claim
