-- Update coverage change endorsement templates to use new structured change_details format
-- The {{coverage_changes_table}} placeholder renders a proper old/new comparison table

-- COV-001: Additional Coverage
UPDATE document_library
SET content_html = '<h2>Coverage Modification</h2>

<p>This endorsement modifies the coverage provided under the policy to which it is attached.</p>

<h3>Coverage Changes</h3>

{{coverage_changes_table}}

<h3>Effective Date</h3>
<blockquote>
<strong>Effective:</strong> {{endorsement_effective_date}} at 12:01 AM local time
</blockquote>

<h3>Premium Adjustment</h3>
<p><strong>Additional Premium:</strong> {{premium_change}} (pro-rata for remaining policy period)</p>

<h3>Terms</h3>
<ol>
<li>This additional coverage is subject to all terms, conditions, and exclusions of the policy unless specifically modified herein;</li>
<li>The limit shown above is part of, not in addition to, the policy aggregate limit unless otherwise stated;</li>
<li>Coverage applies only to Claims first made on or after the effective date shown above.</li>
</ol>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    updated_at = now()
WHERE code = 'COV-001';

-- LIM-001: Limit Increase
UPDATE document_library
SET content_html = '<h2>Limit of Liability Increase</h2>

<p>This endorsement increases the limit of liability under the policy to which it is attached.</p>

<h3>Limit Changes</h3>

{{coverage_changes_table}}

<h3>Effective Date</h3>
<blockquote>
<strong>Effective:</strong> {{endorsement_effective_date}} at 12:01 AM local time
</blockquote>

<h3>Premium Adjustment</h3>
<p><strong>Additional Premium:</strong> {{premium_change}}</p>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    updated_at = now()
WHERE code = 'LIM-001';

-- LIM-002: Limit Decrease
UPDATE document_library
SET content_html = '<h2>Limit of Liability Decrease</h2>

<p>This endorsement decreases the limit of liability under the policy to which it is attached.</p>

<h3>Limit Changes</h3>

{{coverage_changes_table}}

<h3>Effective Date</h3>
<blockquote>
<strong>Effective:</strong> {{endorsement_effective_date}} at 12:01 AM local time
</blockquote>

<h3>Premium Adjustment</h3>
<p><strong>Return Premium:</strong> {{premium_change}}</p>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    updated_at = now()
WHERE code = 'LIM-002';

-- RET-001: Retention Change
UPDATE document_library
SET content_html = '<h2>Retention Modification</h2>

<p>This endorsement modifies the retention (deductible) under the policy to which it is attached.</p>

<h3>Retention Changes</h3>

{{coverage_changes_table}}

<h3>Effective Date</h3>
<blockquote>
<strong>Effective:</strong> {{endorsement_effective_date}} at 12:01 AM local time
</blockquote>

<h3>Premium Adjustment</h3>
<p><strong>Premium Change:</strong> {{premium_change}}</p>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    updated_at = now()
WHERE code = 'RET-001';

-- COV-002: Coverage Exclusion
UPDATE document_library
SET content_html = '<h2>Coverage Exclusion</h2>

<p>This endorsement excludes or reduces coverage under the policy to which it is attached.</p>

<h3>Coverage Changes</h3>

{{coverage_changes_table}}

<h3>Effective Date</h3>
<blockquote>
<strong>Effective:</strong> {{endorsement_effective_date}} at 12:01 AM local time
</blockquote>

<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    updated_at = now()
WHERE code = 'COV-002';

-- Insert these templates into document_library if they don't exist
-- (They exist in endorsement_catalog but may not have document_library entries)

INSERT INTO document_library (code, title, document_type, category, position, midterm_only, status, default_sort_order, content_html, content_plain, created_by, auto_attach_rules)
VALUES
(
    'COV-001',
    'Endorsement - Additional Coverage',
    'endorsement',
    'coverage_change',
    'either',
    true,
    'active',
    50,
    '<h2>Coverage Modification</h2>
<p>This endorsement modifies the coverage provided under the policy to which it is attached.</p>
<h3>Coverage Changes</h3>
{{coverage_changes_table}}
<h3>Effective Date</h3>
<blockquote><strong>Effective:</strong> {{endorsement_effective_date}} at 12:01 AM local time</blockquote>
<h3>Premium Adjustment</h3>
<p><strong>Additional Premium:</strong> {{premium_change}} (pro-rata for remaining policy period)</p>
<h3>Terms</h3>
<ol>
<li>This additional coverage is subject to all terms, conditions, and exclusions of the policy unless specifically modified herein;</li>
<li>The limit shown above is part of, not in addition to, the policy aggregate limit unless otherwise stated;</li>
<li>Coverage applies only to Claims first made on or after the effective date shown above.</li>
</ol>
<p><em>All other terms and conditions of the policy remain unchanged.</em></p>',
    'Coverage Modification. This endorsement modifies the coverage provided under the policy.',
    'system',
    '{"condition": "endorsement_type", "value": "coverage_change"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
    content_html = EXCLUDED.content_html,
    content_plain = EXCLUDED.content_plain,
    auto_attach_rules = EXCLUDED.auto_attach_rules,
    updated_at = now();
