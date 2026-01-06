import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmission,
  updateSubmission,
  getLossHistory,
  calculatePremium,
  createQuoteOption,
  getComparables,
  getCredibility,
  getExtractedValuesNeedingConfirmation,
  updateExtractedValue,
  parseBrokerResponse,
  applyControlUpdates,
} from '../api/client';
import CompsPage from './CompsPage';

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─────────────────────────────────────────────────────────────
// Company Header Card (with expandable App Quality)
// ─────────────────────────────────────────────────────────────

function CompanyHeaderCard({ submission, credibility }) {
  const [qualityExpanded, setQualityExpanded] = useState(false);

  // Parse industry tags
  let industryTags = [];
  if (submission?.industry_tags) {
    if (Array.isArray(submission.industry_tags)) {
      industryTags = submission.industry_tags;
    } else if (typeof submission.industry_tags === 'string') {
      try { industryTags = JSON.parse(submission.industry_tags); } catch { industryTags = []; }
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-700';
    if (score >= 60) return 'text-yellow-700';
    return 'text-red-700';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-50 text-green-700';
    if (score >= 60) return 'bg-yellow-50 text-yellow-700';
    return 'bg-red-50 text-red-700';
  };

  const getBarColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatDimensionName = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {submission?.applicant_name || 'Unknown Company'}
          </h1>
          <p className="text-sm text-slate-500">
            {submission?.naics_primary_title || 'Industry not set'}
            {submission?.naics_primary_code && ` (${submission.naics_primary_code})`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">
            {formatCompact(submission?.annual_revenue)}
          </div>
          <div className="text-xs text-slate-500 uppercase font-medium">Annual Revenue</div>
        </div>
      </div>

      {/* Quality Indicators */}
      <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
        {credibility?.has_score && (
          <button
            onClick={() => setQualityExpanded(!qualityExpanded)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${getScoreBg(credibility.total_score)} hover:ring-2 hover:ring-purple-200`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>App Quality: {Math.round(credibility.total_score)}/100</span>
            <svg
              className={`w-3 h-3 transition-transform ${qualityExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {industryTags.length > 0 && (
          <div className="flex gap-2">
            {industryTags.slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-1 bg-gray-100 text-slate-600 text-xs rounded border border-gray-200">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded App Quality Details */}
      {qualityExpanded && credibility?.has_score && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">How complete and consistent is this application?</p>
            {credibility.label && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${getScoreBg(credibility.total_score)}`}>
                {credibility.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {credibility.dimensions && Object.entries(credibility.dimensions).map(([name, score]) => (
              <div key={name} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium text-slate-600">
                    {formatDimensionName(name)}
                  </span>
                  <span className={`text-sm font-bold ${getScoreColor(score)}`}>
                    {score ? Math.round(score) : '—'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${getBarColor(score)}`}
                    style={{ width: `${score || 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {credibility.issue_count > 0 && credibility.total_score < 80 && (
            <div className="mt-3 p-2 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-700">
                <span className="font-medium">{credibility.issue_count} flag{credibility.issue_count !== 1 ? 's' : ''}</span>
                <span className="text-amber-600"> — review recommended</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Business Summary Section (with expand for long text)
// ─────────────────────────────────────────────────────────────

function BusinessSummarySection({ submission }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const summary = submission?.business_summary || '';
  const isLong = summary.length > 400;
  const displayText = isExpanded || !isLong ? summary : summary.substring(0, 400) + '...';

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        Business Summary
      </h3>
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          {displayText || 'No business summary available.'}
        </p>
        {isLong && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-xs text-purple-600 font-medium hover:text-purple-800"
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// NIST Security Controls Section (with expandable context)
// ─────────────────────────────────────────────────────────────

function SecurityControlRow({ control, config }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContext = control.description || control.details || control.notes || control.one_liner;
  const contextText = control.description || control.details || control.notes || '';

  // Prefer one_liner if available, otherwise extract from description
  const getSummaryText = (ctrl, text) => {
    // Use structured one_liner if available (new format)
    if (ctrl.one_liner) return ctrl.one_liner;

    if (!text) return '';

    // Fallback: extract from description text
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l && !/^(implemented|weaknesses|unclear|gaps|missing):$/i.test(l));

    for (const line of lines) {
      if (/^(implemented|weaknesses|unclear|gaps|missing):?$/i.test(line)) continue;

      let cleaned = line
        .replace(/^(implemented|weaknesses|unclear|gaps|missing):\s*/i, '')
        .replace(/^\*\*[^*]+\*\*[:\s]*/g, '')
        .replace(/^[-•]\s*/, '')
        .replace(/\*\*/g, '')
        .trim();

      if (cleaned.length > 15) return cleaned;
    }
    return '';
  };

  const summaryText = getSummaryText(control, contextText);

  return (
    <div
      className={`p-4 ${config.bg} ${hasContext ? 'cursor-pointer' : ''}`}
      onClick={() => hasContext && setIsExpanded(!isExpanded)}
    >
      {/* Row with inline text flow for natural wrapping */}
      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full ${config.dot} flex-shrink-0 mt-1`}></div>
        <p className="flex-1 min-w-0 text-sm leading-snug">
          <span className="font-semibold text-slate-800 capitalize">{control.name}</span>
          {hasContext && !isExpanded && summaryText && (
            <span className="text-xs text-slate-500"> — {summaryText}</span>
          )}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${config.color}`}>
            {config.label}
          </span>
          {hasContext && (
            <svg
              className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {/* Expanded full content */}
      {hasContext && isExpanded && (
        <div className="mt-2 ml-4 p-2 bg-white/50 rounded border border-gray-100">
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{contextText}</p>
        </div>
      )}
    </div>
  );
}

function SecurityControlsSection({ submission }) {
  // Parse per-domain details from nist_controls_summary
  const parseNistSummaryDetails = (summaryText) => {
    if (!summaryText) return {};

    const details = {};
    const domains = ['identify', 'protect', 'detect', 'respond', 'recover'];

    // Try to find each domain section in the summary
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      // Look for patterns like "Identify ⚠️" or "**Identify –" at start of line
      const patterns = [
        new RegExp(`\\*\\*${domain}[^*]*\\*\\*([\\s\\S]*?)(?=\\*\\*(?:${domains.filter(d => d !== domain).join('|')})|$)`, 'i'),
        new RegExp(`^${domain}\\s*[–-]?\\s*[✅⚠️❌]?[^\\n]*\\n([\\s\\S]*?)(?=^(?:${domains.filter(d => d !== domain).join('|')})\\s*[–-]?\\s*[✅⚠️❌]?|$)`, 'im'),
        new RegExp(`${domain}\\s*[–-]?\\s*[✅⚠️❌]?[:\\s]*([\\s\\S]*?)(?=(?:${domains.filter(d => d !== domain).join('|')})\\s*[–-]?\\s*[✅⚠️❌]?|---|\$)`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = summaryText.match(pattern);
        if (match && match[1]) {
          const content = match[1].trim();
          if (content.length > 20) { // Only use if meaningful content
            details[domain] = content;
            break;
          }
        }
      }
    }

    return details;
  };

  const summaryDetails = parseNistSummaryDetails(submission?.nist_controls_summary);

  // Parse NIST controls (flags + optional one_liner)
  let controls = [];
  if (submission?.nist_controls) {
    if (Array.isArray(submission.nist_controls)) {
      controls = submission.nist_controls;
    } else if (typeof submission.nist_controls === 'object') {
      controls = Object.entries(submission.nist_controls).map(([key, value]) => {
        const isStructured = typeof value === 'object';
        return {
          name: key,
          status: isStructured ? value.status : value,
          one_liner: isStructured ? value.one_liner : null,
          // Inject parsed detail from summary as fallback
          description: summaryDetails[key.toLowerCase()] || null,
        };
      });
    }
  }

  // Check if we have any actual data
  const hasControlData = controls.length > 0;
  const hasSummary = submission?.nist_controls_summary;

  // Default NIST framework categories if no data
  const defaultControls = [
    { name: 'Identify', status: 'unknown', description: summaryDetails['identify'] || null },
    { name: 'Protect', status: 'unknown', description: summaryDetails['protect'] || null },
    { name: 'Detect', status: 'unknown', description: summaryDetails['detect'] || null },
    { name: 'Respond', status: 'unknown', description: summaryDetails['respond'] || null },
    { name: 'Recover', status: 'unknown', description: summaryDetails['recover'] || null },
  ];

  // Use controls with parsed data, or defaults with parsed data
  const displayControls = hasControlData ? controls : defaultControls;

  const normalizeStatus = (status) => {
    if (!status) return 'unknown';
    const s = String(status).toLowerCase().trim();
    if (s.includes('✅') || s.includes('implemented') || s === 'yes' || s === 'true') return 'implemented';
    if (s.includes('⚠') || s === 'partial') return 'partial';
    if (s.includes('❌') || s === 'not_implemented' || s === 'no' || s === 'false') return 'not_implemented';
    if (s === 'not_asked' || s === 'n/a' || s.includes('—')) return 'not_asked';
    return 'unknown';
  };

  const getStatusConfig = (status) => {
    const normalized = normalizeStatus(status);
    const configs = {
      implemented: { label: 'Implemented', color: 'text-green-700 bg-green-100', dot: 'bg-green-500', bg: '' },
      partial: { label: 'Partial', color: 'text-amber-600 bg-amber-100', dot: 'bg-amber-500', bg: 'bg-amber-50/30' },
      not_implemented: { label: 'Not Implemented', color: 'text-red-600 bg-red-100', dot: 'bg-red-500', bg: 'bg-red-50/30' },
      not_asked: { label: 'Not Asked', color: 'text-gray-500 bg-gray-100', dot: 'bg-gray-400', bg: '' },
      unknown: { label: 'Unknown', color: 'text-gray-500 bg-gray-100', dot: 'bg-gray-400', bg: '' },
    };
    return configs[normalized] || configs.unknown;
  };

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        NIST Security Controls
        {!hasControlData && !hasSummary && (
          <span className="text-xs font-normal text-slate-400">(no data)</span>
        )}
      </h3>
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Control rows */}
        <div className="divide-y divide-gray-100">
          {displayControls.map((control, idx) => {
            const config = getStatusConfig(control.status);
            return (
              <SecurityControlRow
                key={idx}
                control={control}
                config={config}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Key Exposures Section
// ─────────────────────────────────────────────────────────────

function parseExposureText(text) {
  // Parse patterns like "**Title**: Description" or "**Title** Description"
  const match = text.match(/^\*\*([^*]+)\*\*[:\s]*(.*)$/);
  if (match) {
    return { title: match[1].trim(), description: match[2].trim() };
  }
  // Also handle "Title: Description" without markdown
  const colonMatch = text.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch && colonMatch[1].length < 50) {
    return { title: colonMatch[1].trim(), description: colonMatch[2].trim() };
  }
  return { title: text, description: '' };
}

function KeyExposuresSection({ submission }) {
  let exposures = [];
  if (submission?.cyber_exposures) {
    if (Array.isArray(submission.cyber_exposures)) {
      exposures = submission.cyber_exposures.map(e => {
        if (typeof e === 'string') return parseExposureText(e);
        return { title: e.name || e.type || 'Exposure', description: e.description || '' };
      });
    } else if (typeof submission.cyber_exposures === 'string') {
      try {
        const parsed = JSON.parse(submission.cyber_exposures);
        if (Array.isArray(parsed)) {
          exposures = parsed.map(e => {
            if (typeof e === 'string') return parseExposureText(e);
            return { title: e.name || e.type || 'Exposure', description: e.description || '' };
          });
        }
      } catch {
        // If it's markdown text, split into bullet points
        const lines = submission.cyber_exposures.split('\n').filter(l => l.trim().startsWith('-'));
        exposures = lines.map(l => parseExposureText(l.replace(/^-\s*/, '').trim()));
      }
    }
  }

  if (exposures.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Key Exposures
        </h3>
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 text-sm text-slate-500 italic">
          No cyber exposures identified yet.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Key Exposures
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {exposures.slice(0, 6).map((exposure, idx) => (
          <div key={idx} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <h4 className="text-sm font-semibold text-purple-700 mb-1">
              {exposure.title}
            </h4>
            {exposure.description && (
              <p className="text-xs text-slate-600 leading-relaxed">{exposure.description}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Controls Checklist Section (bullet_point_summary)
// ─────────────────────────────────────────────────────────────

function ControlsChecklistSection({ submission }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const bulletSummary = submission?.bullet_point_summary;

  if (!bulletSummary) {
    return null; // Don't show section if no data
  }

  // Parse the markdown into sections
  const parseControlsMarkdown = (text) => {
    const sections = [];
    const lines = text.split('\n');
    let currentSection = null;
    let currentCategory = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Section headers (### ✅ PRESENT CONTROLS, ### ❌ NOT PRESENT, ### ⚠️ NOT ASKED)
      if (trimmed.startsWith('### ✅')) {
        currentSection = { type: 'present', title: 'Present Controls', categories: [], icon: '✅', color: 'green' };
        sections.push(currentSection);
        currentCategory = null;
      } else if (trimmed.startsWith('### ❌')) {
        currentSection = { type: 'not_present', title: 'Not Present', categories: [], icon: '❌', color: 'red' };
        sections.push(currentSection);
        currentCategory = null;
      } else if (trimmed.startsWith('### ⚠️')) {
        currentSection = { type: 'not_asked', title: 'Not Asked (Mandatory)', categories: [], icon: '⚠️', color: 'amber' };
        sections.push(currentSection);
        currentCategory = null;
      }
      // Category headers (**Authentication & Access**)
      else if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.startsWith('- ')) {
        const categoryName = trimmed.replace(/\*\*/g, '');
        currentCategory = { name: categoryName, items: [] };
        if (currentSection) {
          currentSection.categories.push(currentCategory);
        }
      }
      // Bullet items
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const item = trimmed.substring(2);
        if (currentCategory) {
          currentCategory.items.push(item);
        } else if (currentSection) {
          // Direct items without category (like NOT ASKED section)
          if (!currentSection.categories.length) {
            currentSection.categories.push({ name: null, items: [] });
          }
          currentSection.categories[currentSection.categories.length - 1].items.push(item);
        }
      }
    }
    return sections;
  };

  const sections = parseControlsMarkdown(bulletSummary);

  // Count items with mandatory markers
  const countMandatory = (sections) => {
    let present = 0, missing = 0, notAsked = 0;
    for (const section of sections) {
      for (const cat of section.categories) {
        for (const item of cat.items) {
          if (item.includes('⭐')) present++;
          if (item.includes('🔴')) missing++;
          if (item.includes('🔶')) notAsked++;
        }
      }
    }
    return { present, missing, notAsked };
  };

  const { present, missing, notAsked } = countMandatory(sections);

  // Color configs
  const colorConfig = {
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  };

  return (
    <section>
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        Controls Checklist
      </h3>
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Summary bar */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            {present > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                <span className="text-sm">⭐</span> {present} mandatory present
              </span>
            )}
            {missing > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-700">
                <span className="text-sm">🔴</span> {missing} mandatory missing
              </span>
            )}
            {notAsked > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                <span className="text-sm">🔶</span> {notAsked} not asked
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-gray-200 divide-y divide-gray-100">
            {sections.map((section, sIdx) => {
              const colors = colorConfig[section.color];
              return (
                <div key={sIdx} className={`p-4 ${colors.bg}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{section.icon}</span>
                    <span className={`text-sm font-bold ${colors.text}`}>{section.title}</span>
                  </div>
                  <div className="space-y-4">
                    {section.categories.map((cat, cIdx) => (
                      <div key={cIdx}>
                        {cat.name && (
                          <div className="text-xs font-semibold text-slate-700 mb-1">{cat.name}</div>
                        )}
                        <ul className="space-y-1">
                          {cat.items.map((item, iIdx) => (
                            <li key={iIdx} className="text-xs text-slate-600 flex items-start gap-1.5">
                              <span className="text-slate-400 mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Loss History Section
// ─────────────────────────────────────────────────────────────

function LossHistorySection({ submissionId }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: lossData, isLoading } = useQuery({
    queryKey: ['loss-history', submissionId],
    queryFn: () => getLossHistory(submissionId).then(res => res.data),
  });

  const summary = lossData?.summary;
  const claims = lossData?.claims || [];

  return (
    <section className="pb-10">
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Loss History
      </h3>
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200 text-center">
          <div>
            <div className="text-xs text-slate-500 uppercase">Total Paid</div>
            <div className="font-bold text-slate-900">{formatCurrency(summary?.total_paid)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Claims</div>
            <div className="font-bold text-slate-900">{lossData?.count || 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Open</div>
            <div className="font-bold text-slate-900">{summary?.open_claims || 0}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase">Avg Claim</div>
            <div className="font-bold text-slate-900">{formatCompact(summary?.avg_paid)}</div>
          </div>
        </div>

        {/* Expandable Claims Table */}
        {claims.length > 0 && (
          <>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full px-4 py-2 text-xs text-purple-600 font-medium hover:bg-purple-50 flex items-center justify-center gap-1"
            >
              {isExpanded ? 'Hide' : 'Show'} {claims.length} claim{claims.length !== 1 ? 's' : ''}
              <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpanded && (
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-slate-500 font-semibold border-t border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {claims.map((claim) => (
                    <tr key={claim.id}>
                      <td className="px-4 py-3 text-slate-600">
                        {claim.loss_date ? new Date(claim.loss_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs border border-purple-100">
                          {claim.loss_type || 'Claim'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-xs">{claim.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(claim.paid_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {claims.length === 0 && !isLoading && (
          <div className="px-4 py-3 text-sm text-slate-500 text-center">No claims on file</div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// AI Recommendation Card (with inline expand like Business Summary)
// ─────────────────────────────────────────────────────────────

function AIRecommendationCard({ submission }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const recommendation = submission?.ai_recommendation;

  // Determine recommendation type from text
  let recType = 'refer';
  if (recommendation) {
    const lower = recommendation.toLowerCase();
    if (lower.includes('accept') || lower.includes('approve') || lower.includes('recommend binding')) {
      recType = 'accept';
    } else if (lower.includes('decline') || lower.includes('reject')) {
      recType = 'decline';
    }
  }

  const config = {
    accept: { label: 'Accept', color: 'bg-green-100 text-green-700', border: 'border-l-green-500' },
    decline: { label: 'Decline', color: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
    refer: { label: 'Refer', color: 'bg-amber-100 text-amber-700', border: 'border-l-amber-500' },
  };

  const c = config[recType];
  // Clean up markdown formatting for display
  const cleanText = recommendation?.replace(/[#*]/g, '').trim() || '';
  const isLong = cleanText.length > 120;
  const displayText = isExpanded || !isLong ? cleanText : cleanText.substring(0, 120) + '...';

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm p-4 border-l-4 ${c.border}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-sm text-slate-900">AI Recommendation</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.color}`}>{c.label}</span>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">
        {displayText || 'No AI recommendation available yet.'}
      </p>
      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-purple-600 font-medium hover:text-purple-800"
        >
          {isExpanded ? 'Show less' : 'Click to read more'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pricing Configuration Panel
// ─────────────────────────────────────────────────────────────

function PricingPanel({ submissionId, submission, onShowComps }) {
  const queryClient = useQueryClient();

  const [retention, setRetention] = useState(25000);
  const [controlAdj, setControlAdj] = useState(0);
  const [quotedLimits, setQuotedLimits] = useState(new Set());
  const [premiumGrid, setPremiumGrid] = useState({});
  const [calculating, setCalculating] = useState(false);

  // Comps summary
  const { data: comparables } = useQuery({
    queryKey: ['comparables', submissionId, 'primary'],
    queryFn: () => getComparables(submissionId, { layer: 'primary', limit: 20 }).then(res => res.data),
    enabled: !!submissionId,
  });

  // Calculate premiums on mount and when params change
  useState(() => {
    if (!submissionId || !submission?.annual_revenue) return;

    const calculateGrid = async () => {
      setCalculating(true);
      const limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000];
      const results = {};
      try {
        for (const limit of limits) {
          const res = await calculatePremium(submissionId, { limit, retention, control_adjustment: controlAdj });
          results[limit] = res.data;
        }
        setPremiumGrid(results);
      } catch (err) {
        console.error('Premium calculation error:', err);
      } finally {
        setCalculating(false);
      }
    };
    calculateGrid();
  }, [submissionId, retention, controlAdj, submission?.annual_revenue]);

  const createQuoteMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['quotes', submissionId]);
      // Mark this limit as quoted
      setQuotedLimits(prev => new Set([...prev, variables.limit]));
    },
  });

  const handleQuote = (limit) => {
    const premium = premiumGrid[limit];
    createQuoteMutation.mutate({
      limit, // Track which limit was quoted
      quote_name: `${formatCompact(limit)} Primary @ ${formatCompact(retention)} Retention`,
      primary_retention: retention,
      policy_form: 'claims_made',
      tower_json: [{ carrier: 'CMAI', limit, attachment: 0, premium: premium?.risk_adjusted_premium || null }],
    });
  };

  // Comps stats
  const compsWithRates = comparables?.filter(c => c.rate_per_mil) || [];
  const avgRate = compsWithRates.length > 0 ? compsWithRates.reduce((sum, c) => sum + c.rate_per_mil, 0) / compsWithRates.length : null;
  const rateRange = compsWithRates.length > 0 ? {
    min: Math.min(...compsWithRates.map(c => c.rate_per_mil)),
    max: Math.max(...compsWithRates.map(c => c.rate_per_mil)),
  } : null;

  const retentionOptions = [
    { value: 25000, label: '$25,000' },
    { value: 50000, label: '$50,000' },
    { value: 100000, label: '$100,000' },
  ];

  const adjOptions = [
    { value: -0.15, label: '-15%' },
    { value: -0.10, label: '-10%' },
    { value: 0, label: 'None' },
    { value: 0.10, label: '+10%' },
    { value: 0.15, label: '+15%' },
  ];

  const limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header Inputs */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pricing Configuration</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Retention</label>
            <select
              className="w-full bg-white border border-gray-300 rounded text-sm py-1.5 px-2 text-slate-700 font-medium"
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            >
              {retentionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Control Adj</label>
            <select
              className="w-full bg-white border border-gray-300 rounded text-sm py-1.5 px-2 text-slate-700 font-medium"
              value={controlAdj}
              onChange={(e) => setControlAdj(Number(e.target.value))}
            >
              {adjOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Calculated Options */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="text-xs font-semibold text-slate-900 mb-3">Calculated Options</h4>
        <div className="space-y-2">
          {limits.map((limit) => {
            const result = premiumGrid[limit] || {};
            const isQuoted = quotedLimits.has(limit);
            return (
              <div
                key={limit}
                className={`flex justify-between items-center p-2 rounded ${
                  isQuoted ? 'bg-green-50 border border-green-100' : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <span className="font-medium text-sm text-slate-700">{formatCompact(limit)}</span>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm ${isQuoted ? 'font-bold text-green-700' : 'text-slate-600'}`}>
                    {calculating ? '...' : formatCurrency(result.risk_adjusted_premium)}
                  </span>
                  <button
                    onClick={() => handleQuote(limit)}
                    disabled={calculating || createQuoteMutation.isPending || isQuoted}
                    className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                      isQuoted
                        ? 'bg-green-600 text-white cursor-default'
                        : 'bg-white border border-gray-200 text-purple-600 hover:bg-purple-50'
                    }`}
                  >
                    {isQuoted ? 'Quoted' : 'Quote'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Market Benchmark */}
      <div className="p-4 bg-slate-50">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-xs font-semibold text-slate-900">Market Benchmark</h4>
          <span className="text-[10px] text-slate-500">{comparables?.length || 0} comps</span>
        </div>
        {avgRate ? (
          <>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs text-slate-500">Avg Rate</span>
              <span className="text-sm font-bold text-slate-700">
                ${avgRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} / mil
              </span>
            </div>
            <div className="flex justify-between items-baseline mb-4">
              <span className="text-xs text-slate-500">Range</span>
              <span className="text-xs text-slate-600">
                ${rateRange?.min?.toLocaleString(undefined, { maximumFractionDigits: 0 })} - ${rateRange?.max?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500 mb-4">No benchmark data available</p>
        )}
        <button
          onClick={onShowComps}
          className="w-full py-2 bg-white border border-purple-200 text-purple-700 text-xs font-medium rounded hover:bg-purple-50 flex justify-center items-center gap-2 shadow-sm"
        >
          View Full Comp Analysis
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Decision Widget
// ─────────────────────────────────────────────────────────────

function DecisionWidget({ submission, submissionId }) {
  const [decisionReason, setDecisionReason] = useState(submission?.decision_reason || '');
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => queryClient.invalidateQueries(['submission', submissionId]),
  });

  const handleDecision = (decision) => {
    const payload = {
      decision_tag: decision,
      decision_reason: decisionReason || null,
    };
    if (decision === 'decline') {
      payload.submission_status = 'declined';
      payload.submission_outcome = 'declined';
      payload.outcome_reason = decisionReason || 'Declined by underwriter';
    } else if (decision === 'accept') {
      payload.submission_status = 'pending_decision';
      payload.submission_outcome = 'pending';
    }
    updateMutation.mutate(payload);
  };

  const currentDecision = submission?.decision_tag;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-3">Decision</h3>
      <textarea
        className="w-full text-sm border border-gray-300 rounded p-2 h-20 mb-3 focus:ring-2 focus:ring-purple-500 outline-none resize-none"
        placeholder="Add underwriting notes..."
        value={decisionReason}
        onChange={(e) => setDecisionReason(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => handleDecision('decline')}
          disabled={updateMutation.isPending}
          className={`py-2 rounded text-sm font-medium transition-colors ${
            currentDecision === 'decline'
              ? 'bg-red-600 text-white'
              : 'border border-gray-200 text-slate-600 hover:bg-gray-50'
          }`}
        >
          Decline
        </button>
        <button
          onClick={() => handleDecision('refer')}
          disabled={updateMutation.isPending}
          className={`py-2 rounded text-sm font-medium transition-colors ${
            currentDecision === 'refer'
              ? 'bg-amber-500 text-white'
              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
          }`}
        >
          Refer
        </button>
        <button
          onClick={() => handleDecision('accept')}
          disabled={updateMutation.isPending}
          className={`py-2 rounded text-sm font-medium transition-colors ${
            currentDecision === 'accept'
              ? 'bg-green-600 text-white'
              : 'border border-green-200 text-green-700 hover:bg-green-50'
          }`}
        >
          Accept
        </button>
      </div>
      {updateMutation.isPending && (
        <p className="text-xs text-slate-500 mt-2 text-center">Saving...</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Information Needed Widget (critical/important fields awaiting confirmation)
// Phase 1.9: Uses extracted values endpoint instead of legacy controls
// ─────────────────────────────────────────────────────────────

function InformationNeededWidget({ submissionId }) {
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: fieldsData, isLoading } = useQuery({
    queryKey: ['extracted-values-needing-confirmation', submissionId],
    queryFn: () => getExtractedValuesNeedingConfirmation(submissionId).then(res => res.data),
    enabled: !!submissionId,
  });

  const fields = fieldsData?.fields || [];
  const criticalCount = fieldsData?.critical_count || 0;
  const importantCount = fieldsData?.important_count || 0;

  if (isLoading || fields.length === 0) {
    return null; // Don't show widget if no fields need confirmation
  }

  return (
    <>
      {/* Compact collapsed view */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="flex items-center justify-center px-1.5 h-5 bg-red-500 text-white text-xs font-bold rounded-full">
              {criticalCount}
            </span>
          )}
          {importantCount > 0 && (
            <span className="flex items-center justify-center px-1.5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full">
              {importantCount}
            </span>
          )}
          <span className="text-sm font-medium text-amber-800">
            {criticalCount > 0 ? 'critical' : ''}{criticalCount > 0 && importantCount > 0 ? ' + ' : ''}{importantCount > 0 ? 'important' : ''} fields need confirmation
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-amber-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded list */}
      {isExpanded && (
        <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
            {fields.map(field => (
              <div key={field.field_key} className="px-3 py-2 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  field.importance === 'critical' ? 'bg-red-400' : 'bg-amber-400'
                }`} />
                <span className="text-xs text-slate-600">{field.field_name}</span>
                <span className="text-[10px] text-slate-400">({field.category_name})</span>
              </div>
            ))}
          </div>
          <div className="p-3 bg-gray-50 border-t border-gray-200">
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-2 text-xs font-medium text-purple-700 bg-white border border-purple-200 rounded hover:bg-purple-50 flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Broker Response
            </button>
          </div>
        </div>
      )}

      {/* Broker Response Modal */}
      {showModal && (
        <BrokerResponseModal
          submissionId={submissionId}
          fieldsNeeded={fields}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Broker Response Modal (parse text/email for control updates)
// Phase 1.9: Updated to use fieldsNeeded prop and invalidate new query cache
// Note: Still uses legacy parse/apply endpoints - TODO migrate these
// ─────────────────────────────────────────────────────────────

function BrokerResponseModal({ submissionId, fieldsNeeded, onClose }) {
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState('paste');
  const [responseText, setResponseText] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedUpdates, setSelectedUpdates] = useState(new Set());

  const parseMutation = useMutation({
    mutationFn: (data) => parseBrokerResponse(submissionId, data),
    onSuccess: (res) => {
      // API returns { results: [...], controls_checked: [...] }
      const results = res.data.results || [];
      setAnalysisResult({ controls: results, source_type: res.data.source_type });
      // Auto-select high confidence updates
      const autoSelect = new Set();
      results.forEach(c => {
        if (c.confidence === 'high' && c.status !== 'not_addressed') {
          autoSelect.add(c.control_name);
        }
      });
      setSelectedUpdates(autoSelect);
    },
    onError: (err) => {
      console.error('Parse error:', err);
    },
  });

  const applyMutation = useMutation({
    mutationFn: (data) => applyControlUpdates(submissionId, data),
    onSuccess: () => {
      // Invalidate both old and new query caches during transition
      queryClient.invalidateQueries(['controls-needing-info', submissionId]);
      queryClient.invalidateQueries(['extracted-values-needing-confirmation', submissionId]);
      onClose();
    },
  });

  const handleAnalyze = () => {
    if (!responseText.trim()) return;
    setIsAnalyzing(true);
    parseMutation.mutate({
      source_type: sourceType,
      response_text: responseText,
      // Map field names to control names for legacy API compatibility
      controls_needed: fieldsNeeded.map(f => f.field_name),
    });
    setIsAnalyzing(false);
  };

  const handleApply = () => {
    const updates = (analysisResult?.controls || [])
      .filter(c => selectedUpdates.has(c.control_name))
      .map(c => ({
        control_name: c.control_name,
        status: c.status,
        source_text: c.source_text,
      }));
    applyMutation.mutate({
      updates,
      source_type: sourceType === 'paste' ? 'synthetic' : sourceType,
    });
  };

  const toggleUpdate = (controlName) => {
    const next = new Set(selectedUpdates);
    if (next.has(controlName)) {
      next.delete(controlName);
    } else {
      next.add(controlName);
    }
    setSelectedUpdates(next);
  };

  const getStatusIcon = (status) => {
    if (status === 'present') return { icon: '✅', color: 'text-green-600 bg-green-50' };
    if (status === 'not_present') return { icon: '❌', color: 'text-red-600 bg-red-50' };
    return { icon: '⏳', color: 'text-gray-500 bg-gray-50' };
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[600px] bg-white rounded-xl shadow-2xl z-50 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Add Broker Response</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!analysisResult ? (
            // Input Phase
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Source Type</label>
                <div className="flex gap-3">
                  {[
                    { value: 'paste', label: 'Paste Text' },
                    { value: 'email', label: 'Upload Email' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                        sourceType === opt.value
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sourceType"
                        value={opt.value}
                        checked={sourceType === opt.value}
                        onChange={(e) => setSourceType(e.target.value)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {sourceType === 'paste' ? 'Broker Response Text' : 'Upload Email File'}
                </label>
                {sourceType === 'paste' ? (
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-3 h-48 text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                    placeholder="Paste the broker's response here..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                  />
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <p className="text-sm text-slate-500">Email upload coming soon</p>
                    <p className="text-xs text-slate-400 mt-1">For now, please copy/paste the email text</p>
                  </div>
                )}
              </div>

              <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs font-medium text-slate-600 mb-2">Looking for:</p>
                <div className="flex flex-wrap gap-1.5">
                  {fieldsNeeded.map(f => (
                    <span
                      key={f.field_key}
                      className={`px-2 py-0.5 text-xs rounded ${
                        f.importance === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {f.field_name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            // Analysis Results Phase
            <>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Analysis Results</h3>
                <div className="space-y-2">
                  {(analysisResult.controls || []).map(control => {
                    const { icon, color } = getStatusIcon(control.status);
                    const isSelected = selectedUpdates.has(control.control_name);
                    const isAddressable = control.status !== 'not_addressed';
                    return (
                      <div
                        key={control.control_name}
                        className={`p-3 rounded-lg border ${
                          isSelected ? 'border-purple-300 bg-purple-50/50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {isAddressable && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleUpdate(control.control_name)}
                              className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
                                {icon} {control.status === 'not_addressed' ? 'Not Addressed' : control.status === 'present' ? 'Present' : 'Not Present'}
                              </span>
                              <span className="font-medium text-sm text-slate-800">{control.control_name}</span>
                              {control.confidence && (
                                <span className={`text-[10px] uppercase font-bold ${
                                  control.confidence === 'high' ? 'text-green-600' : control.confidence === 'medium' ? 'text-amber-600' : 'text-gray-400'
                                }`}>
                                  {control.confidence}
                                </span>
                              )}
                            </div>
                            {control.source_text && (
                              <p className="text-xs text-slate-500 italic">"{control.source_text}"</p>
                            )}
                            {control.status === 'not_addressed' && (
                              <p className="text-xs text-slate-400">No mention in response</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {analysisResult.rating_impact && (
                <div className="p-3 bg-slate-50 rounded-lg mb-4">
                  <p className="text-xs text-slate-600">
                    <span className="font-medium">Rating Impact:</span> {analysisResult.rating_impact}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          {!analysisResult ? (
            <button
              onClick={handleAnalyze}
              disabled={!responseText.trim() || parseMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {parseMutation.isPending ? 'Analyzing...' : 'Analyze'}
            </button>
          ) : (
            <>
              <button
                onClick={() => setAnalysisResult(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-gray-200 rounded-lg"
              >
                Edit
              </button>
              <button
                onClick={handleApply}
                disabled={selectedUpdates.size === 0 || applyMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyMutation.isPending ? 'Applying...' : `Apply ${selectedUpdates.size} Update${selectedUpdates.size !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Comparables Modal (uses full CompsPage component)
// ─────────────────────────────────────────────────────────────

function ComparablesModal({ onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-4 md:inset-8 lg:inset-12 bg-white rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Comparable Analysis</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <CompsPage />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main AnalyzePageV2 Component
// ─────────────────────────────────────────────────────────────

export default function AnalyzePageV2() {
  const { submissionId } = useParams();
  const [showCompsModal, setShowCompsModal] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: credibility } = useQuery({
    queryKey: ['credibility', submissionId],
    queryFn: () => getCredibility(submissionId).then(res => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: The Case File (Scrollable Evidence) */}
        <div className="col-span-8 space-y-8">
          <CompanyHeaderCard submission={submission} credibility={credibility} />
          <BusinessSummarySection submission={submission} />
          <SecurityControlsSection submission={submission} />
          <ControlsChecklistSection submission={submission} />
          <KeyExposuresSection submission={submission} />
          <LossHistorySection submissionId={submissionId} />
        </div>

        {/* RIGHT COLUMN: The Workbench (Sticky) */}
        <div className="col-span-4 space-y-6 sticky top-6">
          <AIRecommendationCard submission={submission} />
          <InformationNeededWidget submissionId={submissionId} />
          <PricingPanel
            submissionId={submissionId}
            submission={submission}
            onShowComps={() => setShowCompsModal(true)}
          />
          <DecisionWidget submission={submission} submissionId={submissionId} />
        </div>
      </div>

      {/* Comparables Modal */}
      {showCompsModal && (
        <ComparablesModal onClose={() => setShowCompsModal(false)} />
      )}
    </>
  );
}
