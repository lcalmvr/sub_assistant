import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getQuoteOptions,
  getSubmission,
  createQuoteOption,
  updateQuoteOption,
  cloneQuoteOption,
  bindQuoteOption,
  unbindQuoteOption,
} from '../api/client';

// Format currency
function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format compact currency (e.g., $5M, $25K)
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${value / 1_000}K`;
  return `$${value}`;
}

// Get limit from tower_json
function getTowerLimit(quote) {
  if (!quote.tower_json || !quote.tower_json.length) return null;
  const cmaiLayer = quote.tower_json.find(l => l.carrier === 'CMAI') || quote.tower_json[0];
  return cmaiLayer?.limit;
}

// Quote option card component
function QuoteOptionCard({ quote, isSelected, onSelect }) {
  const limit = getTowerLimit(quote);
  const premium = quote.sold_premium || quote.risk_adjusted_premium;
  const isBound = quote.is_bound;

  let cardClass = 'response-card cursor-pointer transition-all hover:shadow-md';
  if (isBound) {
    cardClass += ' response-card-quoted';
  } else if (isSelected) {
    cardClass += ' border-l-purple-500 border border-purple-200 bg-purple-50';
  } else {
    cardClass += ' border-l-gray-300 border border-gray-200';
  }

  return (
    <div className={cardClass} onClick={onSelect}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {isBound ? (
            <span className="text-green-600 text-lg">✓</span>
          ) : (
            <span className="text-gray-400 text-lg">○</span>
          )}
          <span className="font-semibold text-gray-900">{quote.quote_name || 'Unnamed Option'}</span>
        </div>
        {isBound && <span className="badge badge-bound">BOUND</span>}
        {!isBound && premium && <span className="badge badge-quoted">QUOTED</span>}
      </div>

      <div className="flex items-end gap-6">
        <div>
          <div className="premium-large">{formatCurrency(premium)}</div>
          <div className="premium-label">Annual Premium</div>
        </div>
        <div className="flex gap-2">
          <span className="info-pill">Limit: {formatCompact(limit)}</span>
          <span className="info-pill">Retention: {formatCompact(quote.primary_retention)}</span>
        </div>
      </div>
    </div>
  );
}

// Create Quote Modal
function CreateQuoteModal({ isOpen, onClose, onSubmit, isPending }) {
  const [quoteName, setQuoteName] = useState('');
  const [retention, setRetention] = useState(25000);
  const [limit, setLimit] = useState(1000000);
  const [policyForm, setPolicyForm] = useState('claims_made');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      quote_name: quoteName,
      primary_retention: retention,
      policy_form: policyForm,
      tower_json: [{ carrier: 'CMAI', limit, attachment: 0, premium: null }],
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Quote Option</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Quote Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Option A - $1M Primary"
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Policy Limit</label>
              <select
                className="form-select"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={1000000}>$1M</option>
                <option value={2000000}>$2M</option>
                <option value={3000000}>$3M</option>
                <option value={5000000}>$5M</option>
              </select>
            </div>
            <div>
              <label className="form-label">Retention</label>
              <select
                className="form-select"
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
              >
                <option value={25000}>$25K</option>
                <option value={50000}>$50K</option>
                <option value={100000}>$100K</option>
                <option value={150000}>$150K</option>
                <option value={250000}>$250K</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Policy Form</label>
            <select
              className="form-select"
              value={policyForm}
              onChange={(e) => setPolicyForm(e.target.value)}
            >
              <option value="claims_made">Claims Made</option>
              <option value="occurrence">Occurrence</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              className="btn btn-outline flex-1"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isPending || !quoteName.trim()}
            >
              {isPending ? 'Creating...' : 'Create Quote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Quote detail panel
function QuoteDetailPanel({ quote, submission, onRefresh }) {
  const queryClient = useQueryClient();
  const [editedRetention, setEditedRetention] = useState(quote.primary_retention);
  const [editedPolicyForm, setEditedPolicyForm] = useState(quote.policy_form || '');
  const [editedSoldPremium, setEditedSoldPremium] = useState(quote.sold_premium || '');

  const limit = getTowerLimit(quote);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateQuoteOption(quote.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes', submission.id]);
    },
  });

  // Bind mutation
  const bindMutation = useMutation({
    mutationFn: () => bindQuoteOption(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes', submission.id]);
      queryClient.invalidateQueries(['policy', submission.id]);
    },
  });

  // Unbind mutation
  const unbindMutation = useMutation({
    mutationFn: () => unbindQuoteOption(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes', submission.id]);
      queryClient.invalidateQueries(['policy', submission.id]);
    },
  });

  // Clone mutation
  const cloneMutation = useMutation({
    mutationFn: () => cloneQuoteOption(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes', submission.id]);
    },
  });

  const handleSaveConfig = () => {
    const updates = {};
    if (editedRetention !== quote.primary_retention) {
      updates.primary_retention = editedRetention;
    }
    if (editedPolicyForm !== quote.policy_form) {
      updates.policy_form = editedPolicyForm;
    }
    if (editedSoldPremium && editedSoldPremium !== quote.sold_premium) {
      updates.sold_premium = Number(editedSoldPremium);
    }
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges =
    editedRetention !== quote.primary_retention ||
    editedPolicyForm !== (quote.policy_form || '') ||
    (editedSoldPremium && Number(editedSoldPremium) !== quote.sold_premium);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">{quote.quote_name}</h3>
        <div className="flex gap-2">
          {quote.is_bound ? (
            <span className="badge badge-bound">BOUND</span>
          ) : (
            <span className="badge badge-quoted">QUOTED</span>
          )}
        </div>
      </div>

      {/* Premium Summary */}
      <div className="card">
        <h4 className="form-section-title">Premium Summary</h4>
        <div className="grid grid-cols-3 gap-6">
          <div className="metric-card">
            <div className="metric-label">Technical Premium</div>
            <div className="metric-value">{formatCurrency(quote.technical_premium)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Risk-Adjusted Premium</div>
            <div className="metric-value text-blue-600">{formatCurrency(quote.risk_adjusted_premium)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Sold Premium</div>
            <input
              type="number"
              className="form-input text-green-600 font-semibold text-lg"
              value={editedSoldPremium}
              onChange={(e) => setEditedSoldPremium(e.target.value)}
              placeholder="Enter sold premium"
            />
          </div>
        </div>
      </div>

      {/* Policy Configuration */}
      <div className="card">
        <h4 className="form-section-title">Policy Configuration</h4>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="form-label">Policy Limit</label>
            <div className="form-input bg-gray-50 text-gray-700">{formatCompact(limit)}</div>
          </div>
          <div>
            <label className="form-label">Retention/Deductible</label>
            <select
              className="form-select"
              value={editedRetention}
              onChange={(e) => setEditedRetention(Number(e.target.value))}
            >
              <option value={25000}>$25K</option>
              <option value={50000}>$50K</option>
              <option value={100000}>$100K</option>
              <option value={150000}>$150K</option>
              <option value={250000}>$250K</option>
            </select>
          </div>
          <div>
            <label className="form-label">Policy Form</label>
            <select
              className="form-select"
              value={editedPolicyForm}
              onChange={(e) => setEditedPolicyForm(e.target.value)}
            >
              <option value="">Select form</option>
              <option value="claims_made">Claims Made</option>
              <option value="occurrence">Occurrence</option>
            </select>
          </div>
        </div>
        {hasChanges && (
          <div className="mt-4 flex items-center gap-3">
            <button
              className="btn btn-primary"
              onClick={handleSaveConfig}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            {updateMutation.isSuccess && (
              <span className="text-sm text-green-600">Saved!</span>
            )}
          </div>
        )}
      </div>

      {/* Tower Visualization */}
      {quote.tower_json && quote.tower_json.length > 0 && (
        <div className="card">
          <h4 className="form-section-title">Tower Structure</h4>
          <div className="space-y-2">
            {[...quote.tower_json].reverse().map((layer, idx) => {
              const isCMAI = layer.carrier === 'CMAI';
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-2 ${
                    isCMAI ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`font-semibold ${isCMAI ? 'text-purple-700' : 'text-gray-700'}`}>
                        {layer.carrier}
                      </span>
                      {isCMAI && (
                        <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">
                          Our Layer
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-gray-600">
                        Limit: <span className="font-medium text-gray-900">{formatCompact(layer.limit)}</span>
                      </span>
                      {layer.attachment > 0 && (
                        <span className="text-gray-600">
                          xs <span className="font-medium text-gray-900">{formatCompact(layer.attachment)}</span>
                        </span>
                      )}
                      {layer.premium && (
                        <span className="text-gray-600">
                          Premium: <span className="font-medium text-green-600">{formatCurrency(layer.premium)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coverages */}
      {quote.coverages && Object.keys(quote.coverages).length > 0 && (
        <div className="card">
          <h4 className="form-section-title">Coverages</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(quote.coverages).map(([name, config]) => (
              <div key={name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">{name}</span>
                <span className="text-sm font-medium text-gray-900">
                  {typeof config === 'object' ? formatCompact(config.limit) : formatCompact(config)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card">
        <h4 className="form-section-title">Actions</h4>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-primary" disabled>
            Generate Quote Document
          </button>
          {quote.is_bound ? (
            <button
              className="btn bg-red-100 text-red-700 hover:bg-red-200"
              onClick={() => unbindMutation.mutate()}
              disabled={unbindMutation.isPending}
            >
              {unbindMutation.isPending ? 'Unbinding...' : 'Unbind Quote'}
            </button>
          ) : (
            <button
              className="btn bg-green-600 text-white hover:bg-green-700"
              onClick={() => bindMutation.mutate()}
              disabled={bindMutation.isPending}
            >
              {bindMutation.isPending ? 'Binding...' : 'Bind Quote'}
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={() => cloneMutation.mutate()}
            disabled={cloneMutation.isPending}
          >
            {cloneMutation.isPending ? 'Cloning...' : 'Clone Option'}
          </button>
        </div>
        {bindMutation.isSuccess && (
          <p className="text-sm text-green-600 mt-2">Quote bound successfully!</p>
        )}
        {unbindMutation.isSuccess && (
          <p className="text-sm text-yellow-600 mt-2">Quote unbound.</p>
        )}
        {cloneMutation.isSuccess && (
          <p className="text-sm text-blue-600 mt-2">Quote cloned!</p>
        )}
      </div>
    </div>
  );
}

export default function QuotePage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes', submissionId],
    queryFn: () => getQuoteOptions(submissionId).then(res => res.data),
  });

  // Create quote mutation
  const createMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['quotes', submissionId]);
      setShowCreateModal(false);
      // Select the newly created quote
      if (response.data?.id) {
        setSelectedQuoteId(response.data.id);
      }
    },
  });

  // Auto-select first quote if none selected
  const selectedQuote = quotes?.find(q => q.id === selectedQuoteId) || quotes?.[0];

  if (isLoading) {
    return <div className="text-gray-500">Loading quotes...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Quote Options Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Quote Options</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + New Option
        </button>
      </div>

      {/* Info Pills */}
      {submission && (
        <div className="flex gap-2">
          <span className="info-pill">Submission: {submission.applicant_name}</span>
          {selectedQuote && (
            <>
              <span className="info-pill">Limit: {formatCompact(getTowerLimit(selectedQuote))}</span>
              <span className="info-pill">Retention: {formatCompact(selectedQuote.primary_retention)}</span>
            </>
          )}
        </div>
      )}

      {quotes?.length > 0 ? (
        <div className="grid grid-cols-3 gap-4">
          {/* Quote Options List */}
          <div className="col-span-1 space-y-3">
            {quotes.map((quote) => (
              <QuoteOptionCard
                key={quote.id}
                quote={quote}
                isSelected={selectedQuote?.id === quote.id}
                onSelect={() => setSelectedQuoteId(quote.id)}
              />
            ))}
          </div>

          {/* Selected Quote Details */}
          <div className="col-span-2">
            {selectedQuote && (
              <QuoteDetailPanel
                key={selectedQuote.id}
                quote={selectedQuote}
                submission={submission}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No quote options yet</p>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Create First Option
          </button>
        </div>
      )}

      {/* Create Quote Modal */}
      <CreateQuoteModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
