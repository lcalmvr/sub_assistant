// Unified Financial Crimes Response - Typst version
// Compile: typst compile unified-financial-crimes-response.typ
// Watch:   typst watch unified-financial-crimes-response.typ

// === Page Setup ===
#set page(
  paper: "us-letter",
  margin: (x: 1in, y: 1in),
  footer: context {
    if counter(page).get().first() > 1 {
      align(center, text(size: 9pt, fill: luma(120))[
        Page #counter(page).display() of #counter(page).final().first()
      ])
    }
  }
)

// === Typography ===
#set text(font: "Helvetica Neue", size: 11pt, fill: luma(30))
#set par(leading: 0.7em, justify: true)

// === Headings ===
#show heading.where(level: 1): it => {
  set text(size: 24pt, weight: 600, fill: rgb("#1a365d"))
  block(below: 8pt, it.body)
}

#show heading.where(level: 2): it => {
  set text(size: 15pt, weight: 600, fill: rgb("#1a365d"))
  v(24pt)
  block(below: 12pt, it.body)
  line(length: 100%, stroke: 0.5pt + luma(200))
  v(8pt)
}

#show heading.where(level: 3): it => {
  set text(size: 13pt, weight: 600, fill: rgb("#2c5282"))
  block(above: 16pt, below: 8pt, it.body)
}

// === Custom Components ===
#let callout(title: none, body) = {
  block(
    width: 100%,
    fill: rgb("#f7fafc"),
    stroke: (left: 4pt + rgb("#3182ce")),
    radius: (right: 6pt),
    inset: 16pt,
    above: 16pt,
    below: 16pt,
  )[
    #if title != none {
      text(weight: 600, size: 13pt, fill: rgb("#1a365d"))[#title]
      v(8pt)
    }
    #body
  ]
}

#let status-pill(label, color) = {
  box(
    fill: color.lighten(80%),
    radius: 3pt,
    inset: (x: 6pt, y: 3pt),
    text(weight: 500, size: 10pt, fill: color)[#label]
  )
}

#let covered = status-pill("COVERED", rgb("#38a169"))
#let maybe = status-pill("MAYBE", rgb("#d69e2e"))
#let sublimited = status-pill("SUB-LIMITED", rgb("#d69e2e"))
#let excluded = status-pill("EXCLUDED", rgb("#e53e3e"))
#let denied = status-pill("DENIED", rgb("#e53e3e"))
#let grey-area = status-pill("GREY AREA", rgb("#718096"))

#let tier-box(amount, label, color) = {
  block(
    width: 100%,
    fill: color.lighten(85%),
    stroke: 1pt + color.lighten(40%),
    radius: 6pt,
    inset: 16pt,
  )[
    #align(center)[
      #text(size: 20pt, weight: 600, fill: rgb("#1a365d"))[#amount]
      #v(4pt)
      #text(size: 10pt, fill: luma(100))[#label]
    ]
  ]
}

#let vendor-card(title, role, description) = {
  block(
    width: 100%,
    fill: rgb("#f7fafc"),
    radius: 6pt,
    inset: 16pt,
    above: 12pt,
    below: 12pt,
  )[
    #text(weight: 600, fill: rgb("#2c5282"))[#title]
    #v(6pt)
    #text(weight: 500)[Role: #role]
    #v(4pt)
    #text(fill: luma(100))[#description]
  ]
}

#let battle-step(title, content) = {
  block(
    width: 100%,
    fill: rgb("#ffffff").transparentize(85%),
    radius: 6pt,
    inset: 12pt,
    above: 8pt,
  )[
    #text(weight: 600, size: 11pt)[#title]
    #v(6pt)
    #content
  ]
}

// ============================================
// DOCUMENT CONTENT
// ============================================

// Header banner - full width geometric art
#block(
  width: 100%,
  clip: true,
  radius: 8pt,
  below: 24pt,
)[
  #image("header-banner.png", width: 100%)
]

= Unified Financial Crimes Response

#text(fill: luma(100))[Cyber & Tech E&O Underwriting | January 2026]

#v(16pt)

== Executive Summary

#callout(title: "The Problem")[
  Our current response to Funds Transfer Fraud (FTF) is fragmented. When an Insured loses funds, they face a "definitions roulette" to determine if the loss is covered by Crime (Theft), Cyber (Hacking), or Professional Liability (Negligence). This hesitation causes latency, and in wire fraud, latency guarantees a total loss.
]

#callout(title: "The Opportunity")[
  We propose a *Unified Financial Crimes Overlay* that sits above all three lines. By shifting focus from "Liability Defense" to "Asset Recovery," we can:

  - *Reduce Net Payouts:* Recovering the asset eliminates the claim
  - *Increase Limits Safely:* Offer market-leading capacity (\$1M+) conditional on speed
  - *End Coverage Disputes:* If the money is recovered, the "Cyber vs. Crime" argument becomes moot
]

== The Market Failure

Current policies force the Insured to navigate complex exclusionary language during a crisis.

#v(8pt)

#table(
  columns: (1.2fr, 1fr, 1fr, 1fr),
  stroke: none,
  inset: 10pt,
  fill: (x, y) => if y == 0 { rgb("#1a365d") } else if calc.odd(y) { white } else { rgb("#f7fafc") },

  // Header
  text(fill: white, weight: 500)[*Scenario*],
  text(fill: white, weight: 500)[*Commercial Crime*],
  text(fill: white, weight: 500)[*Cyber Liability*],
  text(fill: white, weight: 500)[*Professional Liability*],

  // Row 1
  [*The "Hack"* \ #text(size: 9pt, fill: luma(120), style: "italic")[Hacker accesses bank portal]],
  [#covered \ Computer Fraud],
  [#maybe \ If Endorsed],
  [#excluded \ Not a professional error],

  // Row 2
  [*The "Phish"* \ #text(size: 9pt, fill: luma(120), style: "italic")[CFO tricked into wiring funds]],
  [#sublimited \ Social Engineering],
  [#excluded \ No system breach],
  [#excluded \ Not a professional error],

  // Row 3
  [*The "Trust Account"* \ #text(size: 9pt, fill: luma(120), style: "italic")[Lawyer tricked with client funds]],
  [#denied \ 3rd Party Property],
  [#denied \ Not 1st party loss],
  [#grey-area \ Exclusion for Theft],
)

#v(12pt)

*The strategy:* The gap is the product. We introduce a service layer that ignores _how_ the money was lost and focuses entirely on getting it back.

#pagebreak()

== The Mechanism: Conditional Limits

We trade capacity for speed. We can offer a higher sub-limit (\$1M) because we only pay it if the Insured gives us a fighting chance to recover the funds.

#v(12pt)

#block(
  width: 100%,
  stroke: 2pt + rgb("#1a365d"),
  radius: 8pt,
  inset: 20pt,
)[
  #text(size: 10pt, weight: 600, fill: rgb("#1a365d"), tracking: 0.5pt)[DRAFT ENDORSEMENT CONCEPT]

  #v(12pt)

  #grid(
    columns: (1fr, 1fr),
    gutter: 16pt,
    tier-box("\$100,000", [Base Sub-Limit \ ("Cold Loss" Tier)], rgb("#e53e3e")),
    tier-box("\$1,000,000", [Enhanced Sub-Limit \ ("Hot Loss" Tier)], rgb("#38a169")),
  )

  #v(16pt)

  #text(size: 10pt, weight: 600, fill: rgb("#1a365d"), tracking: 0.5pt)[CONDITIONS FOR ENHANCEMENT]

  #v(8pt)

  The Enhanced Sub-Limit applies *only* to Loss reported to the Company's Financial Crimes Response Center within *72 hours* (or 5 days) of the initial transfer of funds.

  Any Loss reported after this period shall be subject to the Base Sub-Limit, regardless of when the Insured discovered the Loss.
]

=== Why This Works

- *Operational Reality:* It ties coverage to the "Transaction Date," not the subjective "Discovery Date."
- *Risk Control:* We don't insure "negligence" (waiting 2 weeks); we insure "operational response" (acting fast).

#pagebreak()

== The Vendor Ecosystem

To execute this, we need a specialist panel distinct from our General Breach Counsel.

#vendor-card(
  "1. The \"Specialized Unit\" Model (e.g., McDonald Hopkins)",
  "Operations & Banking Liaison",
  "Differentiates \"Wire Fraud Response\" from general data privacy. Focuses purely on the financial kill chain."
)

#vendor-card(
  "2. The \"Hybrid Intelligence\" Model (e.g., Clark Hill)",
  "Technical Asset Tracking",
  "Bridges the gap between legal counsel and forensic accounting. Uses intelligence specialists to track SWIFT flows."
)

#vendor-card(
  "3. The \"Scale\" Model (e.g., Mullen Coughlin)",
  "Volume & Benchmarking",
  "High-volume handling of BEC (Business Email Compromise) with deep contacts at FBI field offices."
)

#pagebreak()

== The Sales Tool: Battle Card

Marketing one-pager to be distributed with all Cyber, Crime, and PL quotes.

#v(8pt)

#block(
  width: 100%,
  fill: gradient.linear(rgb("#1a365d"), rgb("#2c5282"), angle: 135deg),
  radius: 10pt,
  inset: 24pt,
)[
  #set text(fill: white)

  #text(size: 16pt, weight: 600)[Financial Crimes Rapid Response Program]
  #v(4pt)
  #text(size: 12pt)[Turn Your Policy Into a Recovery Engine]

  #v(12pt)

  #text(size: 10pt)[Speed is the only currency that matters. In a Funds Transfer Fraud event, the window to recover stolen assets is less than 72 hours. Traditional insurance claims processes are too slow. We've replaced the "Claim Form" with the "Kill Chain."]

  #v(16pt)

  #battle-step("Step 1: The First Mile (0-1 Hour)")[
    - Call your bank immediately
    - Demand the "Fraud Department"
    - Request a "SWIFT Recall"
  ]

  #battle-step("Step 2: The Second Mile (1-2 Hours)")[
    *Activate the Hotline: 1-800-XXX-XXXX*
    - < 72 Hours from Transfer: Unlocks your \$1,000,000 Limit
    - > 72 Hours from Transfer: Limits coverage to \$100,000
  ]

  #battle-step("Step 3: The Recovery")[
    Our team will activate the FBI "Recovery Asset Team" (RAT) protocols to freeze funds before they leave the country.
  ]
]

#pagebreak()

== Proof of Concept: A Tale of Two Wires

*The Scenario:* A paralegal at a Law Firm wires \$2,000,000 of client money to a hacker on a Friday afternoon.

#v(12pt)

#table(
  columns: (0.8fr, 1fr, 1fr),
  stroke: none,
  inset: 10pt,
  fill: (x, y) => if y == 0 { rgb("#1a365d") } else if calc.odd(y) { white } else { rgb("#f7fafc") },

  text(fill: white, weight: 500)[*Feature*],
  text(fill: white, weight: 500)[*Path A: Siloed (Current)*],
  text(fill: white, weight: 500)[*Path B: Unified (Future)*],

  [*First Action*],
  table.cell(fill: rgb("#fff5f5"))[Broker debates if it's a Crime or PL claim],
  table.cell(fill: rgb("#f0fff4"))[Insured calls 24/7 Hotline immediately],

  [*Weekend Activity*],
  table.cell(fill: rgb("#fff5f5"))[Claims sits in a queue. Hackers move money.],
  table.cell(fill: rgb("#f0fff4"))[Specialist activates Bank Kill Chain & FBI RAT],

  [*Monday Morning*],
  table.cell(fill: rgb("#fff5f5"))[Crime & PL carriers issue "Reservation of Rights" letters denying coverage],
  table.cell(fill: rgb("#f0fff4"))[Specialist presents Indemnity Agreement to bank. Funds reversed.],

  [*Outcome*],
  [#text(fill: rgb("#e53e3e"), weight: 600)[\$2.2M Net Loss] \ (Payout + Legal Fees)],
  [#text(fill: rgb("#38a169"), weight: 600)[\$15k Net Loss] \ (Vendor Fees Only)],

  [*Insured Sentiment*],
  table.cell(fill: rgb("#fff5f5"))["Insurance is a scam."],
  table.cell(fill: rgb("#f0fff4"))["You saved our business."],
)

#v(24pt)

#block(
  width: 100%,
  fill: rgb("#1a365d"),
  radius: 8pt,
  inset: 24pt,
)[
  #set text(fill: white)

  #text(size: 15pt, weight: 600)[Decision Required]
  #v(4pt)
  #line(length: 100%, stroke: 0.5pt + rgb("#ffffff").transparentize(70%))
  #v(12pt)

  Approval to form a cross-departmental Working Group (Cyber, Crime, Claims) to:

  #v(8pt)

  - Vet and select the "Wire Fraud Specialist" vendor
  - Finalize the "Conditional Limits" endorsement wording
  - Launch a Pilot Program in Q2
]
