import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getConflictRules,
  getMarketNews,
  createMarketNews,
  deleteMarketNews,
} from '../api/client';

// Format date
function formatDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────
// Common Conflicts Tab
// ─────────────────────────────────────────────────────────────

function ConflictsTab() {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['conflict-rules', categoryFilter, severityFilter, sourceFilter],
    queryFn: () => getConflictRules({
      category: categoryFilter || undefined,
      severity: severityFilter || undefined,
      source: sourceFilter || undefined,
    }).then(res => res.data),
  });

  const severityColors = {
    critical: { icon: '🔴', class: 'text-red-600' },
    high: { icon: '🟠', class: 'text-orange-600' },
    medium: { icon: '🟡', class: 'text-yellow-600' },
    low: { icon: '🟢', class: 'text-green-600' },
  };

  const sourceLabels = {
    system: '📦 System',
    llm_discovered: '🤖 AI Discovered',
    uw_added: '👤 UW Added',
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Known contradiction patterns found in cyber insurance applications. These conflicts are automatically detected during application processing.
      </p>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-4">
        <select
          className="form-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="edr">EDR</option>
          <option value="mfa">MFA</option>
          <option value="backup">Backup</option>
          <option value="business_model">Business Model</option>
          <option value="scale">Scale</option>
          <option value="access_control">Access Control</option>
          <option value="incident_response">Incident Response</option>
          <option value="data_handling">Data Handling</option>
        </select>
        <select
          className="form-select"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="form-select"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="">All Sources</option>
          <option value="system">System</option>
          <option value="llm_discovered">AI Discovered</option>
          <option value="uw_added">UW Added</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading conflict rules...</div>
      ) : !rules || rules.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No conflict rules found matching the filters.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-gray-500">{rules.length} conflict rules in catalog</div>
          {rules.map((rule) => {
            const severity = severityColors[rule.severity] || { icon: '⚪', class: 'text-gray-600' };
            const totalResolutions = (rule.times_confirmed || 0) + (rule.times_dismissed || 0);
            const confRate = totalResolutions > 0 ? (rule.times_confirmed / totalResolutions * 100) : null;

            return (
              <ConflictRuleCard
                key={rule.id}
                rule={rule}
                severity={severity}
                sourceLabels={sourceLabels}
                confRate={confRate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConflictRuleCard({ rule, severity, sourceLabels, confRate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2">
          <span>{severity.icon}</span>
          <span className="font-medium">{rule.title || rule.rule_name}</span>
          {(rule.times_detected || 0) > 0 && (
            <span className="text-sm text-gray-500 italic">
              — {rule.times_detected} detections
            </span>
          )}
        </div>
        <span className="text-gray-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-4 gap-4 text-sm mb-3">
            <div>
              <span className="text-gray-500">Category:</span>{' '}
              <code className="bg-gray-200 px-1 rounded">{rule.category}</code>
            </div>
            <div>
              <span className="text-gray-500">Severity:</span>{' '}
              <code className="bg-gray-200 px-1 rounded">{rule.severity}</code>
            </div>
            <div>
              <span className="text-gray-500">Source:</span>{' '}
              {sourceLabels[rule.source] || rule.source}
            </div>
            <div>
              <span className="text-gray-500">Confirmation Rate:</span>{' '}
              {confRate !== null ? `${confRate.toFixed(0)}%` : 'N/A'}
            </div>
          </div>

          {rule.description && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">Description:</div>
              <p className="text-sm text-gray-600">{rule.description}</p>
            </div>
          )}

          {rule.example_bad && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">Example of Conflict:</div>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
                {typeof rule.example_bad === 'string' ? rule.example_bad : JSON.stringify(rule.example_bad, null, 2)}
              </pre>
              {rule.example_explanation && (
                <p className="text-sm text-gray-500 italic mt-1">{rule.example_explanation}</p>
              )}
            </div>
          )}

          {rule.requires_review && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-700">
              This rule was discovered by AI and needs review
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Market News Tab
// ─────────────────────────────────────────────────────────────

function MarketNewsTab() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showPostForm, setShowPostForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ['market-news', search, category],
    queryFn: () => getMarketNews({ search, category }).then(res => res.data),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMarketNews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-news'] });
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Team-curated cyber insurance and cybersecurity articles. Searchable and reusable as a knowledge base.
      </p>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search titles, sources, summaries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44 flex-shrink-0">
          <select
            className="form-select w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All</option>
            <option value="cyber_insurance">Cyber Insurance</option>
            <option value="cybersecurity">Cybersecurity</option>
          </select>
        </div>
        <button
          onClick={() => setShowPostForm(true)}
          className="btn btn-primary flex-shrink-0"
        >
          Post Article
        </button>
      </div>

      {showPostForm && (
        <PostArticleForm
          onClose={() => setShowPostForm(false)}
          onSuccess={() => {
            setShowPostForm(false);
            queryClient.invalidateQueries({ queryKey: ['market-news'] });
          }}
        />
      )}

      {isLoading ? (
        <div className="text-gray-500">Loading articles...</div>
      ) : !articles || articles.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No articles yet. Post the first one.
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onDelete={() => {
                if (window.confirm('Delete this article?')) {
                  deleteMutation.mutate(article.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostArticleForm({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    source: '',
    category: 'cyber_insurance',
    tags: '',
    summary: '',
    internal_notes: '',
  });

  const createMutation = useMutation({
    mutationFn: createMarketNews,
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim() && !formData.url.trim()) {
      alert('Please provide a title or URL');
      return;
    }
    createMutation.mutate({
      ...formData,
      title: formData.title.trim() || formData.url.trim(),
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium">Post Article</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="url"
            className="form-input"
            placeholder="URL"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          />
          <select
            className="form-select"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            <option value="cyber_insurance">Cyber Insurance</option>
            <option value="cybersecurity">Cybersecurity</option>
          </select>
        </div>
        <input
          type="text"
          className="form-input w-full"
          placeholder="Title (optional if URL provided)"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
        <input
          type="text"
          className="form-input w-full"
          placeholder="Source (e.g., wsj.com, advisen.com)"
          value={formData.source}
          onChange={(e) => setFormData({ ...formData, source: e.target.value })}
        />
        <input
          type="text"
          className="form-input w-full"
          placeholder="Tags (comma-separated: claims, regs, ransomware...)"
          value={formData.tags}
          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
        />
        <textarea
          className="form-input w-full"
          rows={3}
          placeholder="Summary (bullet points)"
          value={formData.summary}
          onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ArticleCard({ article, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const metaParts = [];
  if (article.source) metaParts.push(article.source);
  if (article.published_at) metaParts.push(formatDate(article.published_at));
  metaParts.push(article.category === 'cyber_insurance' ? 'Cyber Insurance' : 'Cybersecurity');

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 text-left"
      >
        <span className="font-medium">{article.title}</span>
        <span className="text-gray-400">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="text-sm text-gray-500">{metaParts.join(' · ')}</div>
              <div className="text-xs text-gray-400">
                Posted {formatDate(article.created_at)} by {article.created_by || '—'}
              </div>
            </div>
            <div className="flex gap-2">
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-600 hover:text-purple-800"
                >
                  Open article
                </a>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            </div>
          </div>

          {article.tags && article.tags.length > 0 && (
            <div className="text-sm text-gray-500 mb-2">
              Tags: {article.tags.join(', ')}
            </div>
          )}

          {article.summary && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{article.summary}</div>
          )}

          {article.internal_notes && (
            <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-600">
              <div className="font-medium text-xs text-gray-500 mb-1">Notes:</div>
              {article.internal_notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field Definitions Tab
// ─────────────────────────────────────────────────────────────

function FieldDefinitionsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Reference guide for common application fields and their meanings.
      </p>

      <ExpandableSection title="EDR (Endpoint Detection & Response)" icon="🛡️">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>hasEdr</strong> - Does the organization have EDR deployed?</p>
          <p><strong>edrVendor</strong> - Which EDR product is used? Common vendors:</p>
          <ul className="list-disc list-inside ml-4 text-gray-600">
            <li>CrowdStrike Falcon</li>
            <li>SentinelOne</li>
            <li>Microsoft Defender for Endpoint</li>
            <li>Carbon Black</li>
            <li>Cortex XDR</li>
          </ul>
          <p><strong>edrEndpointCoveragePercent</strong> - What percentage of endpoints have EDR installed?</p>
          <p><strong>eppedrOnDomainControllers</strong> - Is EDR specifically deployed on domain controllers?</p>
        </div>
      </ExpandableSection>

      <ExpandableSection title="MFA (Multi-Factor Authentication)" icon="🔐">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>hasMfa</strong> - Does the organization use MFA?</p>
          <p><strong>mfaType</strong> - Type of MFA used:</p>
          <ul className="list-disc list-inside ml-4 text-gray-600">
            <li>Authenticator App (TOTP)</li>
            <li>Hardware Token (FIDO2/YubiKey)</li>
            <li>SMS (less secure)</li>
            <li>Push Notification</li>
            <li>Biometric</li>
          </ul>
          <p><strong>remoteAccessMfa</strong> - Is MFA required for remote access?</p>
          <p><strong>mfaForCriticalInfoAccess</strong> - Is MFA required for accessing critical systems?</p>
          <p><strong>emailMfa</strong> - Is MFA required for email access?</p>
        </div>
      </ExpandableSection>

      <ExpandableSection title="Backups" icon="💾">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>hasBackups</strong> - Does the organization perform regular backups?</p>
          <p><strong>backupFrequency</strong> - How often are backups performed? (Real-time, Daily, Weekly, Monthly)</p>
          <p><strong>offlineBackups</strong> - Are backups stored offline (air-gapped)?</p>
          <p><strong>offsiteBackups</strong> - Are backups stored at a different location?</p>
          <p><strong>immutableBackups</strong> - Are backups immutable (cannot be modified or deleted)?</p>
          <p><strong>encryptedBackups</strong> - Are backups encrypted?</p>
          <p><strong>backupTestingFrequency</strong> - How often are backup restorations tested?</p>
        </div>
      </ExpandableSection>

      <ExpandableSection title="Business Model" icon="🏢">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>businessModel</strong> - B2B, B2C, or B2B2C</p>
          <p><strong>collectsPii</strong> - Does the business collect Personally Identifiable Information?</p>
          <p className="text-gray-500 ml-4">B2C businesses almost always collect PII</p>
          <p><strong>handlesCreditCards</strong> - Does the business handle credit card data?</p>
          <p className="text-gray-500 ml-4">E-commerce businesses typically handle payment data</p>
          <p><strong>hasCustomerData</strong> - Does the business store customer data?</p>
          <p><strong>employeeCount</strong> - Number of employees (used for scale-based checks)</p>
        </div>
      </ExpandableSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Guidelines Tab
// ─────────────────────────────────────────────────────────────

function GuidelinesTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        General guidelines and best practices for cyber underwriting.
      </p>

      <ExpandableSection title="Credibility Score Interpretation" icon="📊" defaultOpen>
        <div className="text-sm text-gray-700 space-y-3">
          <p>The <strong>Application Credibility Score</strong> measures the consistency and sophistication of application responses.</p>

          <table className="w-full text-sm border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Dimension</th>
                <th className="px-3 py-2 text-left">Weight</th>
                <th className="px-3 py-2 text-left">What it Measures</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2">Consistency</td><td className="px-3 py-2">40%</td><td className="px-3 py-2">Are answers internally coherent?</td></tr>
              <tr><td className="px-3 py-2">Plausibility</td><td className="px-3 py-2">35%</td><td className="px-3 py-2">Do answers fit the business model?</td></tr>
              <tr><td className="px-3 py-2">Completeness</td><td className="px-3 py-2">25%</td><td className="px-3 py-2">Were questions answered thoughtfully?</td></tr>
            </tbody>
          </table>

          <table className="w-full text-sm border border-gray-200 rounded mt-4">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Score</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 text-left">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-green-50"><td className="px-3 py-2">90-100</td><td className="px-3 py-2">Excellent</td><td className="px-3 py-2">Standard review</td></tr>
              <tr className="bg-green-50"><td className="px-3 py-2">80-89</td><td className="px-3 py-2">Good</td><td className="px-3 py-2">Note issues, proceed</td></tr>
              <tr className="bg-yellow-50"><td className="px-3 py-2">70-79</td><td className="px-3 py-2">Fair</td><td className="px-3 py-2">Extra scrutiny</td></tr>
              <tr className="bg-orange-50"><td className="px-3 py-2">60-69</td><td className="px-3 py-2">Poor</td><td className="px-3 py-2">Request clarification</td></tr>
              <tr className="bg-red-50"><td className="px-3 py-2">&lt;60</td><td className="px-3 py-2">Very Poor</td><td className="px-3 py-2">May need new application</td></tr>
            </tbody>
          </table>
        </div>
      </ExpandableSection>

      <ExpandableSection title="Red Flags to Watch For" icon="🚨">
        <div className="text-sm text-gray-700 space-y-3">
          <div>
            <p className="font-medium">Direct Contradictions:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>"No EDR" but names an EDR vendor</li>
              <li>"No MFA" but specifies MFA type</li>
              <li>"No backups" but specifies backup frequency</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Business Model Implausibility:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>B2C e-commerce claiming no PII collection</li>
              <li>Healthcare provider claiming no PHI</li>
              <li>SaaS company claiming no customer data</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Scale Mismatches:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>500+ employees with no dedicated security team</li>
              <li>$100M+ revenue with no written security policies</li>
              <li>Large company with no incident response plan</li>
            </ul>
          </div>
        </div>
      </ExpandableSection>

      <ExpandableSection title="Mandatory Controls" icon="✅">
        <div className="text-sm text-gray-700 space-y-3">
          <p>The following controls are considered mandatory for most cyber policies:</p>
          <div>
            <p className="font-medium">Authentication:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>MFA for email access</li>
              <li>MFA for remote access</li>
              <li>MFA for privileged accounts</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Endpoint Security:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>EDR on all endpoints</li>
              <li>EDR on domain controllers</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Backup & Recovery:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600">
              <li>Regular backups</li>
              <li>Offline/air-gapped backups</li>
              <li>Encrypted backups</li>
              <li>Immutable backups</li>
            </ul>
          </div>
          <p className="text-gray-500 italic">Controls marked as "Not Asked" in the application may require follow-up.</p>
        </div>
      </ExpandableSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Supplemental Questions Tab
// ─────────────────────────────────────────────────────────────

function SupplementalQuestionsTab() {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = [
    'All',
    'Wrongful Collection',
    'Biometric Data',
    'OT/ICS Exposure',
    'Healthcare/PHI',
    'Financial Services',
    'Cryptocurrency',
    'AI/ML Operations',
    'Media/Content',
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Use these supplemental questions when the application or business profile indicates specific risk exposures.
      </p>

      <select
        className="form-select w-64"
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
      >
        {categories.map(cat => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

      {(selectedCategory === 'All' || selectedCategory === 'Wrongful Collection') && (
        <ExpandableSection
          title="Wrongful Collection / Privacy Violations"
          icon="🔒"
          defaultOpen={selectedCategory === 'Wrongful Collection'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: B2C companies, marketing/advertising firms, data brokers, companies with significant web presence, mobile apps, or customer analytics.
            </p>
            <div>
              <p className="font-medium">Data Collection Practices:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you collect personal data from website visitors (cookies, tracking pixels, analytics)?</li>
                <li>Do you purchase or license consumer data from third-party data brokers?</li>
                <li>Do you share or sell consumer data to third parties?</li>
                <li>Do you use pixel tracking from Meta, Google, or other ad networks?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">Consent & Compliance:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>Do you have a documented process for obtaining consent before collecting personal data?</li>
                <li>Is your privacy policy reviewed by legal counsel at least annually?</li>
                <li>Do you have a mechanism for consumers to opt-out or request deletion?</li>
                <li>Have you conducted a data mapping exercise to identify all PII collected?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> No privacy policy, uses tracking pixels without disclosure, purchases consumer data without consent chain, B2C company claiming "no PII collection"
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'Biometric Data') && (
        <ExpandableSection
          title="Biometric Data Exposure"
          icon="👁️"
          defaultOpen={selectedCategory === 'Biometric Data'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Companies using facial recognition, fingerprint scanners, voice recognition, employee time clocks with biometrics.
            </p>
            <div>
              <p className="font-medium">Biometric Data Collection:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you collect any biometric data (fingerprints, facial geometry, voiceprints)?</li>
                <li>What is the purpose of biometric data collection?</li>
                <li>Approximately how many individuals' biometric data do you store?</li>
                <li>Where is biometric data stored?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">BIPA Compliance (Illinois):</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>Do you have a written policy for biometric data retention and destruction?</li>
                <li>Do you obtain written consent before collecting biometric data?</li>
                <li>Is consent obtained separately from general employment agreements?</li>
                <li>Do you inform individuals of the purpose and duration of biometric data use?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> Uses biometric time clocks but unaware of BIPA, no written policy, biometric data shared with vendors without protections, Illinois employees with biometric collection
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'OT/ICS Exposure') && (
        <ExpandableSection
          title="Operational Technology (OT/ICS) Exposure"
          icon="🏭"
          defaultOpen={selectedCategory === 'OT/ICS Exposure'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Manufacturing, utilities, oil & gas, transportation, water treatment, building automation.
            </p>
            <div>
              <p className="font-medium">OT Environment:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you operate any ICS, SCADA, PLCs, or other OT systems?</li>
                <li>What critical processes are controlled by OT systems?</li>
                <li>Are OT systems connected to the corporate IT network?</li>
                <li>Do you have remote access capabilities to OT systems?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">Network Segmentation:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>Is there a DMZ between IT and OT networks?</li>
                <li>Are OT systems on a physically or logically separate network?</li>
                <li>What controls prevent lateral movement from IT to OT?</li>
                <li>Do you use unidirectional security gateways (data diodes)?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> OT systems directly connected to internet, no network segmentation, default credentials on OT devices, no visibility into OT traffic, remote access without MFA
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'Healthcare/PHI') && (
        <ExpandableSection
          title="Healthcare / PHI Exposure"
          icon="🏥"
          defaultOpen={selectedCategory === 'Healthcare/PHI'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Healthcare providers, health tech companies, insurers, business associates, anyone handling PHI.
            </p>
            <div>
              <p className="font-medium">PHI Handling:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you create, receive, maintain, or transmit PHI?</li>
                <li>Approximately how many patient/member records do you maintain?</li>
                <li>Do you process PHI on behalf of covered entities (business associate)?</li>
                <li>Is PHI stored in cloud environments?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">HIPAA Compliance:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>Have you conducted a HIPAA Security Risk Assessment in the past 12 months?</li>
                <li>Do you have documented HIPAA policies and procedures?</li>
                <li>Do you have a designated HIPAA Security Officer and Privacy Officer?</li>
                <li>Do all workforce members complete HIPAA training annually?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> No recent HIPAA risk assessment, PHI in unencrypted emails, missing BAAs with vendors, no designated HIPAA officers
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'Financial Services') && (
        <ExpandableSection
          title="Financial Services / PCI Exposure"
          icon="🏦"
          defaultOpen={selectedCategory === 'Financial Services'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Banks, credit unions, fintech, payment processors, e-commerce, companies with PCI scope.
            </p>
            <div>
              <p className="font-medium">Payment Card Data:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you store, process, or transmit payment card data?</li>
                <li>What is your PCI DSS compliance level (1-4)?</li>
                <li>When was your last PCI DSS assessment/SAQ completed?</li>
                <li>Do you use a payment gateway, or handle card data directly?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">Wire Transfer Controls:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>What controls are in place for wire transfers or large payments?</li>
                <li>Do you require dual authorization for payments above a threshold?</li>
                <li>Do you use out-of-band verification for payment instruction changes?</li>
                <li>Have you experienced any BEC attempts?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> Storing card data without PCI compliance, no dual controls on wire transfers, direct card processing without tokenization
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'Cryptocurrency') && (
        <ExpandableSection
          title="Cryptocurrency / Digital Assets"
          icon="₿"
          defaultOpen={selectedCategory === 'Cryptocurrency'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Crypto exchanges, DeFi platforms, NFT marketplaces, companies holding crypto treasury.
            </p>
            <div>
              <p className="font-medium">Digital Asset Holdings:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you hold cryptocurrency or digital assets on behalf of customers?</li>
                <li>What is the approximate value of digital assets under custody?</li>
                <li>Do you hold cryptocurrency in your corporate treasury?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">Wallet Security:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={4}>
                <li>What percentage of assets are held in cold storage vs. hot wallets?</li>
                <li>Do you use multi-signature wallets for significant holdings?</li>
                <li>What is your key management process for private keys?</li>
                <li>Are private keys stored in hardware security modules (HSMs)?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> Majority of assets in hot wallets, no smart contract audits, single-signature wallets for large holdings
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'AI/ML Operations') && (
        <ExpandableSection
          title="AI/ML Operations"
          icon="🤖"
          defaultOpen={selectedCategory === 'AI/ML Operations'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Companies deploying AI/ML in production, especially for decision-making or customer-facing apps.
            </p>
            <div>
              <p className="font-medium">AI/ML Usage:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you use AI/ML models in production systems?</li>
                <li>What decisions are influenced by AI/ML (underwriting, content, recommendations)?</li>
                <li>Do you use third-party AI services or build your own models?</li>
                <li>Are AI outputs reviewed by humans before customer-facing use?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">Training Data & Bias:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>What data is used to train your AI models?</li>
                <li>Have you assessed your models for bias or discriminatory outcomes?</li>
                <li>Do you have documentation of training data sources?</li>
                <li>How do you handle personal data in training datasets?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> AI making autonomous high-stakes decisions, no bias testing, training on data without proper rights, no human review
            </div>
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'Media/Content') && (
        <ExpandableSection
          title="Media / Content Liability"
          icon="📺"
          defaultOpen={selectedCategory === 'Media/Content'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Publishers, broadcasters, ad agencies, social media companies, UGC platforms.
            </p>
            <div>
              <p className="font-medium">Content Operations:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1">
                <li>Do you publish, broadcast, or distribute content?</li>
                <li>Do you host user-generated content on your platforms?</li>
                <li>What content moderation practices do you have in place?</li>
                <li>Do you use AI for content moderation or generation?</li>
              </ol>
            </div>
            <div>
              <p className="font-medium">Intellectual Property:</p>
              <ol className="list-decimal list-inside ml-4 text-gray-600 space-y-1" start={5}>
                <li>Do you have processes to verify rights/licenses for content?</li>
                <li>How do you handle DMCA takedown requests?</li>
                <li>Have you received any copyright infringement claims?</li>
                <li>Do you use stock media with verified licensing?</li>
              </ol>
            </div>
            <div className="bg-red-50 p-2 rounded text-red-700">
              <strong>Red Flags:</strong> No content moderation for UGC, no editorial review process, history of IP/defamation claims, unclear licensing
            </div>
          </div>
        </ExpandableSection>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared Components
// ─────────────────────────────────────────────────────────────

function ExpandableSection({ title, icon, children, defaultOpen = false }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 text-left"
      >
        <span className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="font-medium">{title}</span>
        </span>
        <span className="text-gray-400">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────

export default function UWGuidePage() {
  const [activeTab, setActiveTab] = useState('conflicts');

  const tabs = [
    { id: 'conflicts', label: 'Common Conflicts' },
    { id: 'news', label: 'Market News' },
    { id: 'fields', label: 'Field Definitions' },
    { id: 'guidelines', label: 'Guidelines' },
    { id: 'supplemental', label: 'Supplemental Questions' },
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
            <Link to="/compliance" className="nav-link">Compliance</Link>
            <span className="nav-link-active">UW Guide</span>
            <Link to="/brokers" className="nav-link">Brokers</Link>
            <Link to="/coverage-catalog" className="nav-link">Coverage Catalog</Link>
            <Link to="/accounts" className="nav-link">Accounts</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Underwriter Guide</h2>
        <p className="text-gray-600 mb-6">Reference materials and tools for underwriting decisions</p>

        {/* Tabs */}
        <div className="card">
          <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'conflicts' && <ConflictsTab />}
          {activeTab === 'news' && <MarketNewsTab />}
          {activeTab === 'fields' && <FieldDefinitionsTab />}
          {activeTab === 'guidelines' && <GuidelinesTab />}
          {activeTab === 'supplemental' && <SupplementalQuestionsTab />}
        </div>
      </main>
    </div>
  );
}
