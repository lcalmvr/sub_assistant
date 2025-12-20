-- Seed Document Library with Initial Content
-- Common endorsements, claims sheets, and marketing materials

-- War & Terrorism Exclusion
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'END-WAR-001',
    'War & Terrorism Exclusion Endorsement',
    'endorsement',
    'exclusion',
    'either',
    'active',
    10,
    '<h2>War and Terrorism Exclusion</h2>
<p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>

<h3>Exclusion</h3>
<p>This policy does not apply to any <strong>Claim</strong> or <strong>Loss</strong> based upon, arising out of, directly or indirectly resulting from, in consequence of, or in any way involving:</p>

<ol>
<li><strong>War</strong>, including undeclared or civil war;</li>
<li><strong>Warlike action</strong> by a military force, including action in hindering or defending against an actual or expected attack, by any government, sovereign, or other authority using military personnel or other agents;</li>
<li><strong>Insurrection, rebellion, revolution</strong>, usurped power, or action taken by governmental authority in hindering or defending against any of these;</li>
<li>Any <strong>act of terrorism</strong>, regardless of any other cause or event contributing concurrently or in any sequence to the loss.</li>
</ol>

<h3>Definitions</h3>
<p>For purposes of this endorsement, <strong>"terrorism"</strong> means the use, or threatened use, of force or violence against person or property, or commission of an act dangerous to human life or property, or commission of an act that interferes with or disrupts an electronic or communication system, undertaken by any person or group, whether or not acting on behalf of or in any connection with any organization, government, power, authority, or military force, when the effect is to intimidate or coerce a government or to cause public fear or alarm.</p>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    'War and Terrorism Exclusion. This endorsement modifies the insurance provided under the policy. This policy does not apply to any Claim or Loss arising from war, warlike action, insurrection, rebellion, revolution, or any act of terrorism.',
    'system'
) ON CONFLICT (code) DO NOTHING;

-- OFAC Sanctions Exclusion
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'END-OFAC-001',
    'OFAC Sanctions Compliance Endorsement',
    'endorsement',
    'exclusion',
    'either',
    'active',
    11,
    '<h2>OFAC Sanctions Compliance</h2>
<p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>

<h3>Exclusion</h3>
<p>This policy shall not provide coverage, pay any claim, or provide any benefit to any insured or other party, to the extent that providing such coverage, payment, or benefit would expose the insurer to any sanction, prohibition, or restriction under United Nations resolutions or the trade or economic sanctions, laws, or regulations of the European Union, United Kingdom, or United States of America, including but not limited to sanctions administered by the U.S. Department of the Treasury''s Office of Foreign Assets Control (OFAC).</p>

<h3>Compliance</h3>
<p>Each insured represents and warrants that:</p>
<ol>
<li>It is not acting, directly or indirectly, for or on behalf of any person, group, entity, or nation named by the United States Treasury Department as a Specially Designated National and Blocked Person, or for or on behalf of any person, group, entity, or nation designated in Presidential Executive Orders as combatants, combatant combatants, combatant combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants combatants designated in Executive Order 13224 (combating terrorism and terrorist financing);</li>
<li>It is not engaged in any dealings or transactions prohibited by the sanctions programs administered by OFAC;</li>
<li>It will remain in compliance with all applicable sanctions laws and regulations throughout the policy period.</li>
</ol>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    'OFAC Sanctions Compliance Endorsement. This policy shall not provide coverage that would violate UN resolutions or US/EU/UK trade sanctions including those administered by OFAC.',
    'system'
) ON CONFLICT (code) DO NOTHING;

-- Drop Down Over Sublimits
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'END-DROP-001',
    'Drop Down Over Sublimits Endorsement',
    'endorsement',
    'extension',
    'excess',
    'active',
    5,
    '<h2>Drop Down Over Sublimits Coverage</h2>
<p>This endorsement modifies the excess insurance provided under the policy to which it is attached.</p>

<h3>Coverage Extension</h3>
<p>Notwithstanding the provisions of the policy regarding excess coverage attachment, this policy will <strong>drop down</strong> to provide coverage for sublimited coverages when:</p>

<ol>
<li>The underlying policy''s sublimit for a specific coverage has been exhausted by payment of claims; and</li>
<li>The underlying policy''s aggregate limit has not been exhausted.</li>
</ol>

<h3>Applicable Sublimits</h3>
<p>This drop-down coverage applies to the following sublimited coverages as shown in the Declarations or Coverage Schedule:</p>
<ul>
<li>Social Engineering / Fraudulent Transfer</li>
<li>Ransomware / Cyber Extortion</li>
<li>Bricking / System Damage</li>
<li>Reputational Harm</li>
<li>PCI DSS Fines and Penalties</li>
</ul>

<h3>Limit of Liability</h3>
<p>The drop-down coverage provided by this endorsement is subject to the policy''s aggregate limit of liability. The combined coverage under this endorsement and all other coverage provided by this policy shall not exceed the policy''s stated aggregate limit.</p>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    'Drop Down Over Sublimits. This excess policy will drop down to provide coverage for sublimited coverages when the underlying sublimit is exhausted but the aggregate limit is not.',
    'system'
) ON CONFLICT (code) DO NOTHING;

-- Cryptocurrency Exclusion
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'END-CRYPTO-001',
    'Cryptocurrency and Digital Asset Exclusion',
    'endorsement',
    'exclusion',
    'either',
    'active',
    12,
    '<h2>Cryptocurrency and Digital Asset Exclusion</h2>
<p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>

<h3>Exclusion</h3>
<p>This policy does not apply to any <strong>Claim</strong>, <strong>Loss</strong>, or <strong>Expense</strong> based upon, arising out of, directly or indirectly resulting from, in consequence of, or in any way involving:</p>

<ol>
<li>The ownership, custody, control, mining, trading, transfer, or exchange of any <strong>Cryptocurrency</strong> or <strong>Digital Asset</strong>;</li>
<li>Any smart contract or blockchain-based transaction;</li>
<li>The operation of any cryptocurrency exchange, wallet service, or decentralized finance (DeFi) platform;</li>
<li>Any initial coin offering (ICO), token generation event, or similar fundraising mechanism.</li>
</ol>

<h3>Definitions</h3>
<p>For purposes of this endorsement:</p>
<ul>
<li><strong>"Cryptocurrency"</strong> means any digital or virtual currency that uses cryptography for security, including but not limited to Bitcoin, Ethereum, and similar digital currencies.</li>
<li><strong>"Digital Asset"</strong> means any digital representation of value or rights that can be transferred, stored, or traded electronically, including tokens, NFTs, and similar digital instruments.</li>
</ul>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    'Cryptocurrency and Digital Asset Exclusion. This policy does not cover claims arising from cryptocurrency, digital assets, blockchain transactions, DeFi platforms, or ICOs.',
    'system'
) ON CONFLICT (code) DO NOTHING;

-- Biometric Data Exclusion
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'END-BIO-001',
    'Biometric Data Exclusion Endorsement',
    'endorsement',
    'exclusion',
    'either',
    'active',
    13,
    '<h2>Biometric Data Exclusion</h2>
<p>This endorsement modifies the insurance provided under the policy to which it is attached.</p>

<h3>Exclusion</h3>
<p>This policy does not apply to any <strong>Claim</strong> or <strong>Loss</strong> based upon, arising out of, directly or indirectly resulting from, in consequence of, or in any way involving:</p>

<ol>
<li>The collection, capture, receipt, storage, retention, use, disclosure, or destruction of <strong>Biometric Information</strong>;</li>
<li>Any violation of the Illinois Biometric Information Privacy Act (BIPA), Texas Capture or Use of Biometric Identifier Act, Washington Biometric Privacy Act, or any similar federal, state, or local law, statute, or regulation governing the collection or use of biometric data.</li>
</ol>

<h3>Definition</h3>
<p><strong>"Biometric Information"</strong> means any information based on an individual''s biometric identifier used to identify an individual, including but not limited to:</p>
<ul>
<li>Fingerprints</li>
<li>Retina or iris scans</li>
<li>Voiceprints</li>
<li>Facial geometry</li>
<li>Hand geometry</li>
<li>Gait patterns</li>
</ul>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    'Biometric Data Exclusion. This policy does not cover claims arising from the collection, use, or disclosure of biometric information or violations of BIPA or similar biometric privacy laws.',
    'system'
) ON CONFLICT (code) DO NOTHING;

-- Claims Reporting Instructions
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'CLM-RPT-001',
    'Claims Reporting Instructions',
    'claims_sheet',
    'claims',
    'either',
    'active',
    1,
    '<h2>Claims Reporting Instructions</h2>

<h3>When to Report a Claim</h3>
<p>You should report a claim or potential claim to us <strong>as soon as reasonably practicable</strong> after:</p>
<ul>
<li>You become aware of any circumstance that may give rise to a claim under this policy;</li>
<li>You receive notice of any claim, demand, suit, or proceeding;</li>
<li>You discover or suspect a privacy or security incident.</li>
</ul>

<h3>How to Report a Claim</h3>
<p>Claims can be reported through any of the following methods:</p>

<h4>By Email (Preferred)</h4>
<p><strong>claims@cmai-insurance.com</strong></p>

<h4>By Phone</h4>
<p><strong>1-800-555-CLAIM (1-800-555-2524)</strong><br>
Available 24/7 for cyber incidents</p>

<h4>By Mail</h4>
<p>CMAI Insurance Claims Department<br>
123 Insurance Plaza, Suite 500<br>
New York, NY 10001</p>

<h3>Information to Include</h3>
<p>When reporting a claim, please provide:</p>
<ol>
<li>Policy number</li>
<li>Named insured and contact information</li>
<li>Date the incident was discovered</li>
<li>Description of the incident or claim</li>
<li>Names of any third parties involved</li>
<li>Copies of any demands, complaints, or legal documents received</li>
</ol>

<h3>Breach Response Hotline</h3>
<p>For urgent cyber incidents requiring immediate breach response services, call our <strong>24/7 Breach Response Hotline: 1-800-555-BREACH</strong></p>

<p><em>Failure to report claims promptly may affect your coverage.</em></p>',
    'Claims Reporting Instructions. Report claims as soon as reasonably practicable via email to claims@cmai-insurance.com or phone 1-800-555-CLAIM. Include policy number, incident details, and any legal documents received.',
    'system'
) ON CONFLICT (code) DO NOTHING;

-- Marketing Brochure
INSERT INTO document_library (code, title, document_type, category, position, status, default_sort_order, content_html, content_plain, created_by)
VALUES (
    'MKT-CYBER-001',
    'Cyber & Technology E&O Coverage Overview',
    'marketing',
    'overview',
    'either',
    'active',
    1,
    '<h2>Cyber & Technology E&O Insurance</h2>
<h3>Comprehensive Protection for the Digital Age</h3>

<p>CMAI Insurance provides industry-leading cyber liability and technology errors & omissions coverage designed to protect businesses from the evolving landscape of digital risks.</p>

<h3>Coverage Highlights</h3>

<h4>Privacy & Network Security Liability</h4>
<ul>
<li>Data breach response and notification costs</li>
<li>Third-party claims for privacy violations</li>
<li>Network security failures</li>
<li>Media liability</li>
</ul>

<h4>Technology Errors & Omissions</h4>
<ul>
<li>Professional services liability</li>
<li>Software and technology product failures</li>
<li>Failure to deliver contracted services</li>
</ul>

<h4>First-Party Coverages</h4>
<ul>
<li>Business interruption</li>
<li>Data restoration</li>
<li>Cyber extortion / Ransomware</li>
<li>Social engineering fraud</li>
</ul>

<h3>Why Choose CMAI?</h3>
<ul>
<li><strong>Experienced Underwriting</strong> - Specialized cyber expertise</li>
<li><strong>Claims Excellence</strong> - 24/7 breach response support</li>
<li><strong>Broad Coverage</strong> - Comprehensive policy forms</li>
<li><strong>Financial Strength</strong> - A.M. Best rated</li>
</ul>

<p>Contact your broker to learn more about how CMAI can protect your business.</p>',
    'Cyber & Technology E&O Insurance Overview. CMAI provides comprehensive cyber liability and tech E&O coverage including privacy liability, network security, business interruption, and cyber extortion.',
    'system'
) ON CONFLICT (code) DO NOTHING;
