import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getComplianceStats, getComplianceRules } from '../api/client';

const CATEGORY_LABELS = {
  ofac: 'OFAC Compliance',
  service_of_suit: 'Service of Suit',
  nyftz: 'NY Free Trade Zone',
  state_rule: 'State Rules',
  notice_stamping: 'Notice & Stamping',
  other: 'Other',
};

const PRIORITY_ICONS = {
  critical: { icon: '🔴', color: 'text-red-600' },
  high: { icon: '🟠', color: 'text-orange-600' },
  normal: { icon: '🟡', color: 'text-yellow-600' },
  low: { icon: '🟢', color: 'text-green-600' },
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

// Rule Card Component
function RuleCard({ rule }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_ICONS[rule.priority] || PRIORITY_ICONS.normal;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span>{priority.icon}</span>
            <span className="font-semibold text-gray-900">{rule.code}</span>
            <span className="text-gray-600">—</span>
            <span className="text-gray-900">{rule.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">
              {CATEGORY_LABELS[rule.category] || rule.category}
            </span>
            {rule.subcategory && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-sm text-gray-500">{rule.subcategory}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-gray-500">Priority: {rule.priority}</div>
          {rule.applies_to_states && rule.applies_to_states.length > 0 && (
            <div className="text-gray-500 mt-1">
              States: {rule.applies_to_states.slice(0, 3).join(', ')}
              {rule.applies_to_states.length > 3 && ` +${rule.applies_to_states.length - 3}`}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {rule.description && (
        <p className="text-sm text-gray-700 mt-3">{rule.description}</p>
      )}

      {/* Flags */}
      <div className="flex flex-wrap gap-2 mt-3">
        {rule.requires_endorsement && (
          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
            Requires Endorsement {rule.required_endorsement_code && `(${rule.required_endorsement_code})`}
          </span>
        )}
        {rule.requires_notice && (
          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
            Requires Notice
          </span>
        )}
        {rule.requires_stamping && (
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
            Requires Stamping {rule.stamping_office && `(${rule.stamping_office})`}
          </span>
        )}
      </div>

      {/* Expandable details */}
      {(rule.requirements || rule.procedures || rule.legal_reference || rule.source_url) && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-purple-600 hover:text-purple-800"
          >
            {expanded ? '▼ Hide details' : '▶ Show details'}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-200">
              {rule.requirements && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Requirements</div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{rule.requirements}</p>
                </div>
              )}
              {rule.procedures && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Procedures</div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{rule.procedures}</p>
                </div>
              )}
              {rule.notice_text && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Required Notice Text</div>
                  <pre className="text-sm text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-wrap">
                    {rule.notice_text}
                  </pre>
                </div>
              )}
              <div className="flex gap-4 text-sm">
                {rule.legal_reference && (
                  <span className="text-gray-500">Legal: {rule.legal_reference}</span>
                )}
                {rule.source_url && (
                  <a
                    href={rule.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800"
                  >
                    Source →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stats Section
function StatsSection() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['compliance-stats'],
    queryFn: () => getComplianceStats().then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading stats...</div>;
  }

  if (!stats?.table_exists) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
        Compliance rules table not set up. Run the migration script to enable this feature.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        <div className="text-sm text-gray-600">Total Rules</div>
      </div>
      <div className="bg-green-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        <div className="text-sm text-gray-600">Active</div>
      </div>
      <div className="bg-red-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-red-600">{stats.ofac_count}</div>
        <div className="text-sm text-gray-600">OFAC</div>
      </div>
      <div className="bg-orange-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-orange-600">{stats.nyftz_count}</div>
        <div className="text-sm text-gray-600">NYFTZ</div>
      </div>
      <div className="bg-blue-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-blue-600">{stats.state_rule_count}</div>
        <div className="text-sm text-gray-600">State Rules</div>
      </div>
    </div>
  );
}

// Browse Tab
function BrowseTab() {
  const [category, setCategory] = useState('');
  const [state, setState] = useState('');
  const [product, setProduct] = useState('');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['compliance-rules', { category, state, product }],
    queryFn: () => getComplianceRules({
      category: category || undefined,
      state: state || undefined,
      product: product || undefined,
    }).then(res => res.data),
  });

  // Group rules by category if no category filter
  const groupedRules = !category && rules ? rules.reduce((acc, rule) => {
    const cat = rule.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {}) : null;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="form-label">Category</label>
          <select
            className="form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">State</label>
          <select
            className="form-select"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">All States</option>
            {US_STATES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Product</label>
          <select
            className="form-select"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">All Products</option>
            <option value="cyber">Cyber</option>
            <option value="tech_eo">Tech E&O</option>
            <option value="both">Both</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="text-gray-500">Loading rules...</div>
      ) : !rules || rules.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No compliance rules found matching the selected filters.
        </div>
      ) : groupedRules ? (
        // Grouped view
        <div className="space-y-6">
          <div className="text-sm text-gray-500">{rules.length} rules found</div>
          {Object.entries(groupedRules).map(([cat, catRules]) => (
            <div key={cat}>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                {CATEGORY_LABELS[cat] || cat} ({catRules.length})
              </h3>
              <div className="space-y-3">
                {catRules.map((rule) => (
                  <RuleCard key={rule.id} rule={rule} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat view
        <div className="space-y-3">
          <div className="text-sm text-gray-500">{rules.length} rules found</div>
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
}

// Search Tab
function SearchTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearch = (value) => {
    setSearchTerm(value);
    clearTimeout(window.complianceSearchTimeout);
    window.complianceSearchTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { data: rules, isLoading } = useQuery({
    queryKey: ['compliance-rules-search', debouncedSearch],
    queryFn: () => getComplianceRules({ search: debouncedSearch }).then(res => res.data),
    enabled: debouncedSearch.length >= 2,
  });

  return (
    <div className="space-y-4">
      <input
        type="text"
        className="form-input w-full"
        placeholder="Search rules by title, description, or code..."
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
      />

      {!debouncedSearch && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          Enter a search term to find compliance rules.
        </div>
      )}

      {isLoading && debouncedSearch && (
        <div className="text-gray-500">Searching...</div>
      )}

      {debouncedSearch && rules && rules.length === 0 && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No rules found matching "{debouncedSearch}"
        </div>
      )}

      {rules && rules.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-gray-500">{rules.length} results</div>
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
}

// Quick Reference Tab
function QuickReferenceTab() {
  const { data: ofacRules } = useQuery({
    queryKey: ['compliance-rules', { category: 'ofac' }],
    queryFn: () => getComplianceRules({ category: 'ofac' }).then(res => res.data),
  });

  const { data: nyftzRules } = useQuery({
    queryKey: ['compliance-rules', { category: 'nyftz' }],
    queryFn: () => getComplianceRules({ category: 'nyftz' }).then(res => res.data),
  });

  const { data: sosRules } = useQuery({
    queryKey: ['compliance-rules', { category: 'service_of_suit' }],
    queryFn: () => getComplianceRules({ category: 'service_of_suit' }).then(res => res.data),
  });

  return (
    <div className="space-y-4">
      {/* OFAC Guide */}
      <details className="border border-gray-200 rounded-lg" open>
        <summary className="px-4 py-3 bg-red-50 cursor-pointer font-medium text-gray-900 rounded-t-lg">
          🔴 OFAC Compliance Checklist
        </summary>
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-700">
            <strong>Key Requirements:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Screen all parties (insured, officers, beneficiaries) against SDN list</li>
              <li>Screen at application, policy changes, claims, and payments</li>
              <li>Block transactions if match found</li>
              <li>Report to OFAC within 10 business days</li>
              <li>Maintain records for 5 years</li>
            </ul>
          </div>
          {ofacRules && ofacRules.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Related Rules:</div>
              {ofacRules.map((rule) => (
                <div key={rule.id} className="text-sm text-gray-600">
                  • <strong>{rule.code}</strong>: {rule.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* NYFTZ Guide */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 bg-orange-50 cursor-pointer font-medium text-gray-900 rounded-t-lg">
          🟠 NY Free Trade Zone Eligibility
        </summary>
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-700">
            <strong>Eligibility Criteria:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Class 1:</strong> Premium ≥ $100K for one kind, or ≥ $200K for multiple</li>
              <li><strong>Class 2:</strong> Unusual, high hazard, or difficult to place risks</li>
            </ul>
            <div className="mt-3">
              <strong>Requirements:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Insurer must hold Article 63 license</li>
                <li>File Annual FTZ Report</li>
                <li>File Schedule C-1 quarterly reports</li>
                <li>Comply with NYDFS Cybersecurity Regulation for cyber policies</li>
              </ul>
            </div>
          </div>
          {nyftzRules && nyftzRules.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Related Rules:</div>
              {nyftzRules.map((rule) => (
                <div key={rule.id} className="text-sm text-gray-600">
                  • <strong>{rule.code}</strong>: {rule.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* Service of Suit Guide */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 bg-blue-50 cursor-pointer font-medium text-gray-900 rounded-t-lg">
          🔵 Service of Suit Requirements
        </summary>
        <div className="p-4 space-y-3">
          <div className="text-sm text-gray-700">
            <strong>General Requirements:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Include Service of Suit clause in all policies</li>
              <li>Designate agent authorized to accept service of process</li>
              <li>Ensure compliance with state-specific requirements</li>
            </ul>
            <div className="mt-3">
              <strong>State-Specific:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>California: Designate CA-licensed agent or Insurance Commissioner</li>
                <li>Other states: Follow NAIC Service of Suit Model Regulation</li>
              </ul>
            </div>
          </div>
          {sosRules && sosRules.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Related Rules:</div>
              {sosRules.map((rule) => (
                <div key={rule.id} className="text-sm text-gray-600">
                  • <strong>{rule.code}</strong>: {rule.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* State Rules Guide */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 bg-green-50 cursor-pointer font-medium text-gray-900 rounded-t-lg">
          🟢 State-Specific Requirements
        </summary>
        <div className="p-4">
          <div className="text-sm text-gray-700">
            <strong>Common State Requirements:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Surplus Lines Stamping:</strong> Required in FL, TX, IL, and others</li>
              <li><strong>Cancellation Notices:</strong> Vary by state (CA: 10-60 days)</li>
              <li><strong>Disclosure Notices:</strong> Required in NY and other states</li>
              <li><strong>Tax Requirements:</strong> State-specific surplus lines taxes</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}

export default function CompliancePage() {
  const [activeTab, setActiveTab] = useState('browse');

  const tabs = [
    { id: 'browse', label: 'Browse by Category' },
    { id: 'search', label: 'Search Rules' },
    { id: 'reference', label: 'Quick Reference' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Underwriting Portal</h1>
          <nav className="flex items-center gap-6">
            <Link to="/" className="nav-link">Submissions</Link>
            <Link to="/stats" className="nav-link">Statistics</Link>
            <Link to="/admin" className="nav-link">Admin</Link>
            <span className="nav-link-active">Compliance</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Compliance Resources</h2>
          <p className="text-gray-500 mt-1">Reference library and rules engine for compliance requirements</p>
        </div>

        {/* Stats */}
        <div className="card mb-6">
          <StatsSection />
        </div>

        {/* Tabs */}
        <div className="card">
          <div className="flex border-b border-gray-200 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'browse' && <BrowseTab />}
          {activeTab === 'search' && <SearchTab />}
          {activeTab === 'reference' && <QuickReferenceTab />}
        </div>
      </main>
    </div>
  );
}
