# NIST Info Tooltip

**Priority:** Low
**Added:** 2025-01-24

## Problem

NIST controls appear on the Analysis V2 tab but users may not know what NIST is or why it matters.

## Solution

Add an info icon (ⓘ or ?) next to "NIST Controls" heading that shows a tooltip on hover explaining:
- What NIST is (National Institute of Standards and Technology)
- What the controls framework means for cyber security
- Why it matters for underwriting

## Tooltip Content (draft)

```
NIST Cybersecurity Framework

Industry-standard security controls from the National Institute
of Standards and Technology. Used to assess an organization's
security posture across five areas:

• Identify - Asset management, risk assessment
• Protect - Access control, training, data security
• Detect - Monitoring, anomaly detection
• Respond - Incident response planning
• Recover - Recovery planning, improvements

Strong NIST alignment generally indicates lower cyber risk.
```

## UI

```
NIST Controls ⓘ
             ↑
         [hover shows tooltip]
```

## Location

- Analysis V2 tab
- Wherever NIST controls/scores appear

## Implementation

- Simple tooltip component
- Could use existing tooltip library or CSS-only
