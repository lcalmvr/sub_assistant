import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getConflictRules,
  getMarketNews,
  createMarketNews,
  deleteMarketNews,
  getUWAppetite,
  getUWMandatoryControls,
  getUWDeclinationRules,
  getUWReferralTriggers,
  getUWPricingGuidelines,
  getUWGeographicRestrictions,
  createUWAppetite,
  updateUWAppetite,
  deleteUWAppetite,
  createUWControl,
  updateUWControl,
  deleteUWControl,
  createUWDeclinationRule,
  updateUWDeclinationRule,
  deleteUWDeclinationRule,
  createUWReferralTrigger,
  updateUWReferralTrigger,
  deleteUWReferralTrigger,
  createUWPricingGuideline,
  updateUWPricingGuideline,
  deleteUWPricingGuideline,
  createUWGeoRestriction,
  updateUWGeoRestriction,
  deleteUWGeoRestriction,
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

// Format currency
function formatCurrency(amount, decimals = 0) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

// ─────────────────────────────────────────────────────────────
// Reusable Modal Component
// ─────────────────────────────────────────────────────────────

function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. APPETITE TAB
// Industry classification, excluded classes, geographic restrictions
// ─────────────────────────────────────────────────────────────

function AppetiteTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [hazardFilter, setHazardFilter] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [geoEditModalOpen, setGeoEditModalOpen] = useState(false);
  const [geoEditItem, setGeoEditItem] = useState(null);

  const { data: appetite, isLoading: loadingAppetite } = useQuery({
    queryKey: ['uw-appetite', statusFilter, hazardFilter],
    queryFn: () => getUWAppetite({
      status: statusFilter || undefined,
      hazard_class: hazardFilter || undefined,
    }).then(res => res.data),
  });

  const { data: geoRestrictions, isLoading: loadingGeo } = useQuery({
    queryKey: ['uw-geographic'],
    queryFn: () => getUWGeographicRestrictions().then(res => res.data),
  });

  // Appetite mutations
  const createAppetiteMutation = useMutation({
    mutationFn: createUWAppetite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uw-appetite'] });
      setEditModalOpen(false);
      setEditItem(null);
    },
  });

  const updateAppetiteMutation = useMutation({
    mutationFn: ({ id, data }) => updateUWAppetite(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uw-appetite'] });
      setEditModalOpen(false);
      setEditItem(null);
    },
  });

  const deleteAppetiteMutation = useMutation({
    mutationFn: deleteUWAppetite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uw-appetite'] }),
  });

  // Geo mutations
  const createGeoMutation = useMutation({
    mutationFn: createUWGeoRestriction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uw-geographic'] });
      setGeoEditModalOpen(false);
      setGeoEditItem(null);
    },
  });

  const updateGeoMutation = useMutation({
    mutationFn: ({ id, data }) => updateUWGeoRestriction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uw-geographic'] });
      setGeoEditModalOpen(false);
      setGeoEditItem(null);
    },
  });

  const deleteGeoMutation = useMutation({
    mutationFn: deleteUWGeoRestriction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uw-geographic'] }),
  });

  const handleSaveAppetite = (formData) => {
    if (editItem?.id) {
      updateAppetiteMutation.mutate({ id: editItem.id, data: formData });
    } else {
      createAppetiteMutation.mutate(formData);
    }
  };

  const handleSaveGeo = (formData) => {
    if (geoEditItem?.id) {
      updateGeoMutation.mutate({ id: geoEditItem.id, data: formData });
    } else {
      createGeoMutation.mutate(formData);
    }
  };

  const statusColors = {
    preferred: { bg: 'bg-green-100', text: 'text-green-800', label: 'Preferred' },
    standard: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Standard' },
    restricted: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Restricted' },
    excluded: { bg: 'bg-red-100', text: 'text-red-800', label: 'Excluded' },
  };

  const hazardColors = {
    1: 'bg-green-500',
    2: 'bg-lime-500',
    3: 'bg-yellow-500',
    4: 'bg-orange-500',
    5: 'bg-red-500',
  };

  // Group appetite by status for summary cards
  const appetiteByStatus = (appetite || []).reduce((acc, item) => {
    acc[item.appetite_status] = acc[item.appetite_status] || [];
    acc[item.appetite_status].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {['preferred', 'standard', 'restricted', 'excluded'].map((status) => {
          const items = appetiteByStatus[status] || [];
          const colors = statusColors[status];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                statusFilter === status
                  ? `${colors.bg} border-gray-400`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`text-sm font-medium ${colors.text}`}>{colors.label}</div>
              <div className="text-2xl font-bold mt-1">{items.length}</div>
              <div className="text-xs text-gray-500">industries</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          className="form-select w-48"
          value={hazardFilter}
          onChange={(e) => setHazardFilter(e.target.value)}
        >
          <option value="">All Hazard Classes</option>
          <option value="1">Hazard 1 (Low Risk)</option>
          <option value="2">Hazard 2</option>
          <option value="3">Hazard 3 (Moderate)</option>
          <option value="4">Hazard 4</option>
          <option value="5">Hazard 5 (High Risk)</option>
        </select>
        {(statusFilter || hazardFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setHazardFilter(''); }}
            className="text-sm text-purple-600 hover:text-purple-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Industry List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Industry Appetite Matrix</h3>
          <button
            onClick={() => { setEditItem({}); setEditModalOpen(true); }}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            + Add Industry
          </button>
        </div>
        {loadingAppetite ? (
          <div className="text-gray-500">Loading...</div>
        ) : !appetite?.length ? (
          <div className="text-gray-500">No industries found</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Industry</th>
                  <th className="px-4 py-2 text-center font-medium w-24">Hazard</th>
                  <th className="px-4 py-2 text-center font-medium w-28">Status</th>
                  <th className="px-4 py-2 text-right font-medium w-28">Max Limit</th>
                  <th className="px-4 py-2 text-right font-medium w-28">Min Retention</th>
                  <th className="px-4 py-2 text-left font-medium">Notes</th>
                  <th className="px-4 py-2 text-center font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appetite.map((row) => {
                  const colors = statusColors[row.appetite_status] || {};
                  return (
                    <tr
                      key={row.id}
                      onClick={() => { setEditItem(row); setEditModalOpen(true); }}
                      className="hover:bg-purple-50 cursor-pointer group"
                    >
                      <td className="px-4 py-2 font-medium">{row.industry_name}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block w-6 h-6 rounded-full text-white text-xs font-bold leading-6 ${hazardColors[row.hazard_class]}`}>
                          {row.hazard_class}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                          {colors.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {row.max_limit_millions ? `$${row.max_limit_millions}M` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {row.min_retention ? formatCurrency(row.min_retention) : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {row.appetite_status === 'excluded' ? row.declination_reason : row.notes}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${row.industry_name}"?`)) {
                              deleteAppetiteMutation.mutate(row.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Geographic Restrictions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Geographic Restrictions</h3>
          <button
            onClick={() => { setGeoEditItem({}); setGeoEditModalOpen(true); }}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            + Add Territory
          </button>
        </div>
        {loadingGeo ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {['preferred', 'standard', 'restricted', 'excluded'].map((status) => {
              const items = (geoRestrictions || []).filter(g => g.restriction_type === status);
              if (!items.length) return null;
              const colors = statusColors[status];
              return (
                <div key={status} className={`p-4 rounded-lg ${colors.bg}`}>
                  <div className={`text-sm font-medium ${colors.text} mb-2`}>{colors.label} Territories</div>
                  <div className="space-y-1">
                    {items.map((geo) => (
                      <div
                        key={geo.id}
                        onClick={() => { setGeoEditItem(geo); setGeoEditModalOpen(true); }}
                        className="flex justify-between items-center text-sm group cursor-pointer hover:bg-white/50 -mx-1 px-1 rounded"
                      >
                        <span>{geo.territory_name}</span>
                        <div className="flex items-center gap-2">
                          {geo.max_limit_millions && (
                            <span className="text-gray-600">Max ${geo.max_limit_millions}M</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete "${geo.territory_name}"?`)) {
                                deleteGeoMutation.mutate(geo.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-600"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Industry Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditItem(null); }}
        title={editItem?.id ? 'Edit Industry' : 'Add Industry'}
      >
        <AppetiteForm
          initialData={editItem}
          onSave={handleSaveAppetite}
          onCancel={() => { setEditModalOpen(false); setEditItem(null); }}
          isLoading={createAppetiteMutation.isPending || updateAppetiteMutation.isPending}
        />
      </Modal>

      {/* Geographic Edit Modal */}
      <Modal
        isOpen={geoEditModalOpen}
        onClose={() => { setGeoEditModalOpen(false); setGeoEditItem(null); }}
        title={geoEditItem?.id ? 'Edit Territory' : 'Add Territory'}
      >
        <GeoRestrictionForm
          initialData={geoEditItem}
          onSave={handleSaveGeo}
          onCancel={() => { setGeoEditModalOpen(false); setGeoEditItem(null); }}
          isLoading={createGeoMutation.isPending || updateGeoMutation.isPending}
        />
      </Modal>
    </div>
  );
}

// Appetite Form Component
function AppetiteForm({ initialData, onSave, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    industry_name: initialData?.industry_name || '',
    industry_code: initialData?.industry_code || '',
    hazard_class: initialData?.hazard_class || 3,
    appetite_status: initialData?.appetite_status || 'standard',
    max_limit_millions: initialData?.max_limit_millions || '',
    min_retention: initialData?.min_retention || '',
    max_revenue_millions: initialData?.max_revenue_millions || '',
    notes: initialData?.notes || '',
    declination_reason: initialData?.declination_reason || '',
    enforcement_level: initialData?.enforcement_level || 'advisory',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    // Convert empty strings to null for numeric fields
    if (data.max_limit_millions === '') data.max_limit_millions = null;
    if (data.min_retention === '') data.min_retention = null;
    if (data.max_revenue_millions === '') data.max_revenue_millions = null;
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry Name *</label>
          <input
            type="text"
            required
            className="form-input w-full"
            value={formData.industry_name}
            onChange={(e) => setFormData({ ...formData, industry_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Industry Code</label>
          <input
            type="text"
            className="form-input w-full"
            value={formData.industry_code}
            onChange={(e) => setFormData({ ...formData, industry_code: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hazard Class *</label>
          <select
            required
            className="form-select w-full"
            value={formData.hazard_class}
            onChange={(e) => setFormData({ ...formData, hazard_class: parseInt(e.target.value) })}
          >
            <option value="1">1 - Low Risk</option>
            <option value="2">2</option>
            <option value="3">3 - Moderate</option>
            <option value="4">4</option>
            <option value="5">5 - High Risk</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Appetite Status *</label>
          <select
            required
            className="form-select w-full"
            value={formData.appetite_status}
            onChange={(e) => setFormData({ ...formData, appetite_status: e.target.value })}
          >
            <option value="preferred">Preferred</option>
            <option value="standard">Standard</option>
            <option value="restricted">Restricted</option>
            <option value="excluded">Excluded</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enforcement Level</label>
          <select
            className="form-select w-full"
            value={formData.enforcement_level}
            onChange={(e) => setFormData({ ...formData, enforcement_level: e.target.value })}
          >
            <option value="hard">Hard (Must follow)</option>
            <option value="advisory">Advisory (Strong guidance)</option>
            <option value="flexible">Flexible (UW judgment)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Limit ($M)</label>
          <input
            type="number"
            step="0.5"
            className="form-input w-full"
            value={formData.max_limit_millions}
            onChange={(e) => setFormData({ ...formData, max_limit_millions: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Retention ($)</label>
          <input
            type="number"
            className="form-input w-full"
            value={formData.min_retention}
            onChange={(e) => setFormData({ ...formData, min_retention: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Revenue ($M)</label>
          <input
            type="number"
            step="1"
            className="form-input w-full"
            value={formData.max_revenue_millions}
            onChange={(e) => setFormData({ ...formData, max_revenue_millions: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            className="form-textarea w-full"
            rows={2}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
        {formData.appetite_status === 'excluded' && (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Declination Reason</label>
            <input
              type="text"
              className="form-input w-full"
              value={formData.declination_reason}
              onChange={(e) => setFormData({ ...formData, declination_reason: e.target.value })}
            />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// Geographic Restriction Form Component
function GeoRestrictionForm({ initialData, onSave, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    territory_type: initialData?.territory_type || 'state',
    territory_code: initialData?.territory_code || '',
    territory_name: initialData?.territory_name || '',
    restriction_type: initialData?.restriction_type || 'standard',
    max_limit_millions: initialData?.max_limit_millions || '',
    restriction_reason: initialData?.restriction_reason || '',
    enforcement_level: initialData?.enforcement_level || 'advisory',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (data.max_limit_millions === '') data.max_limit_millions = null;
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Territory Type *</label>
          <select
            required
            className="form-select w-full"
            value={formData.territory_type}
            onChange={(e) => setFormData({ ...formData, territory_type: e.target.value })}
          >
            <option value="state">State</option>
            <option value="country">Country</option>
            <option value="region">Region</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Territory Code *</label>
          <input
            type="text"
            required
            className="form-input w-full"
            placeholder="e.g., CA, US"
            value={formData.territory_code}
            onChange={(e) => setFormData({ ...formData, territory_code: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Territory Name *</label>
          <input
            type="text"
            required
            className="form-input w-full"
            value={formData.territory_name}
            onChange={(e) => setFormData({ ...formData, territory_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Restriction Type *</label>
          <select
            required
            className="form-select w-full"
            value={formData.restriction_type}
            onChange={(e) => setFormData({ ...formData, restriction_type: e.target.value })}
          >
            <option value="preferred">Preferred</option>
            <option value="standard">Standard</option>
            <option value="restricted">Restricted</option>
            <option value="excluded">Excluded</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enforcement Level</label>
          <select
            className="form-select w-full"
            value={formData.enforcement_level}
            onChange={(e) => setFormData({ ...formData, enforcement_level: e.target.value })}
          >
            <option value="hard">Hard (Must follow)</option>
            <option value="advisory">Advisory (Strong guidance)</option>
            <option value="flexible">Flexible (UW judgment)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Limit ($M)</label>
          <input
            type="number"
            step="0.5"
            className="form-input w-full"
            value={formData.max_limit_millions}
            onChange={(e) => setFormData({ ...formData, max_limit_millions: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Restriction Reason</label>
          <input
            type="text"
            className="form-input w-full"
            value={formData.restriction_reason}
            onChange={(e) => setFormData({ ...formData, restriction_reason: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. UNDERWRITING REQUIREMENTS TAB
// Mandatory controls, declination criteria, referral triggers
// ─────────────────────────────────────────────────────────────

function RequirementsTab() {
  const queryClient = useQueryClient();
  const [controlCategory, setControlCategory] = useState('');
  const [showDeclinations, setShowDeclinations] = useState(true);
  const [showReferrals, setShowReferrals] = useState(true);

  // Edit states
  const [controlEditOpen, setControlEditOpen] = useState(false);
  const [controlEditItem, setControlEditItem] = useState(null);
  const [declineEditOpen, setDeclineEditOpen] = useState(false);
  const [declineEditItem, setDeclineEditItem] = useState(null);
  const [referralEditOpen, setReferralEditOpen] = useState(false);
  const [referralEditItem, setReferralEditItem] = useState(null);

  const { data: controls, isLoading: loadingControls } = useQuery({
    queryKey: ['uw-controls', controlCategory],
    queryFn: () => getUWMandatoryControls({ category: controlCategory || undefined }).then(res => res.data),
  });

  const { data: declinations } = useQuery({
    queryKey: ['uw-declinations'],
    queryFn: () => getUWDeclinationRules().then(res => res.data),
  });

  const { data: referrals } = useQuery({
    queryKey: ['uw-referrals'],
    queryFn: () => getUWReferralTriggers().then(res => res.data),
  });

  // Control mutations
  const createControlMutation = useMutation({
    mutationFn: createUWControl,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-controls'] }); setControlEditOpen(false); },
  });
  const updateControlMutation = useMutation({
    mutationFn: ({ id, data }) => updateUWControl(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-controls'] }); setControlEditOpen(false); },
  });
  const deleteControlMutation = useMutation({
    mutationFn: deleteUWControl,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uw-controls'] }),
  });

  // Declination mutations
  const createDeclineMutation = useMutation({
    mutationFn: createUWDeclinationRule,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-declinations'] }); setDeclineEditOpen(false); },
  });
  const updateDeclineMutation = useMutation({
    mutationFn: ({ id, data }) => updateUWDeclinationRule(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-declinations'] }); setDeclineEditOpen(false); },
  });
  const deleteDeclineMutation = useMutation({
    mutationFn: deleteUWDeclinationRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uw-declinations'] }),
  });

  // Referral mutations
  const createReferralMutation = useMutation({
    mutationFn: createUWReferralTrigger,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-referrals'] }); setReferralEditOpen(false); },
  });
  const updateReferralMutation = useMutation({
    mutationFn: ({ id, data }) => updateUWReferralTrigger(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-referrals'] }); setReferralEditOpen(false); },
  });
  const deleteReferralMutation = useMutation({
    mutationFn: deleteUWReferralTrigger,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uw-referrals'] }),
  });

  const controlCategories = [
    { value: '', label: 'All Categories' },
    { value: 'access_control', label: 'Access Control' },
    { value: 'endpoint_security', label: 'Endpoint Security' },
    { value: 'backup', label: 'Backup & Recovery' },
    { value: 'network', label: 'Network Security' },
    { value: 'operations', label: 'Security Operations' },
    { value: 'data_protection', label: 'Data Protection' },
  ];

  return (
    <div className="space-y-6">
      {/* Mandatory Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Mandatory Controls by Tier</h3>
          <div className="flex items-center gap-3">
            <select
              className="form-select w-48 text-sm"
              value={controlCategory}
              onChange={(e) => setControlCategory(e.target.value)}
            >
              {controlCategories.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <button
              onClick={() => { setControlEditItem({}); setControlEditOpen(true); }}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
            >
              + Add Control
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Controls become mandatory based on hazard class, revenue, or limit thresholds. Click a row to edit.
        </p>

        {loadingControls ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Control</th>
                  <th className="px-4 py-2 text-left font-medium w-32">Category</th>
                  <th className="px-4 py-2 text-center font-medium w-24">Mandatory</th>
                  <th className="px-4 py-2 text-center font-medium w-20">Decline?</th>
                  <th className="px-4 py-2 text-center font-medium w-20">Refer?</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Credit</th>
                  <th className="px-4 py-2 text-right font-medium w-24">Debit</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(controls || []).map((ctrl) => (
                  <tr
                    key={ctrl.id}
                    onClick={() => { setControlEditItem(ctrl); setControlEditOpen(true); }}
                    className="hover:bg-purple-50 cursor-pointer group"
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">{ctrl.control_name}</div>
                      {ctrl.description && (
                        <div className="text-xs text-gray-500">{ctrl.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {ctrl.control_category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs">
                      {ctrl.mandatory_above_hazard != null && (
                        <div>Hazard &gt; {ctrl.mandatory_above_hazard}</div>
                      )}
                      {ctrl.mandatory_above_revenue_millions && (
                        <div>Rev &gt; ${ctrl.mandatory_above_revenue_millions}M</div>
                      )}
                      {!ctrl.mandatory_above_hazard && !ctrl.mandatory_above_revenue_millions && (
                        <span className="text-red-600 font-medium">Always</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {ctrl.is_declination_trigger && (
                        <span className="text-red-600 font-bold">Yes</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {ctrl.is_referral_trigger && (
                        <span className="text-orange-600 font-bold">Yes</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-green-600">
                      {ctrl.credit_if_present ? `${ctrl.credit_if_present}%` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-red-600">
                      {ctrl.debit_if_missing ? `+${ctrl.debit_if_missing}%` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${ctrl.control_name}"?`)) deleteControlMutation.mutate(ctrl.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Declination Criteria */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowDeclinations(!showDeclinations)}
            className="flex items-center gap-2 font-medium text-gray-900"
          >
            <span>{showDeclinations ? '−' : '+'}</span>
            <span>Declination Criteria ({declinations?.length || 0})</span>
          </button>
          <button
            onClick={() => { setDeclineEditItem({}); setDeclineEditOpen(true); }}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            + Add Rule
          </button>
        </div>
        {showDeclinations && (
          <div className="space-y-2">
            {(declinations || []).map((rule) => (
              <div
                key={rule.id}
                onClick={() => { setDeclineEditItem(rule); setDeclineEditOpen(true); }}
                className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-purple-300 hover:bg-purple-50/50 group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rule.severity === 'hard' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {rule.severity === 'hard' ? 'Auto-Decline' : 'Soft Decline'}
                      </span>
                      <span className="font-medium">{rule.rule_name}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                    {rule.decline_message && (
                      <p className="text-sm text-gray-500 italic mt-2">"{rule.decline_message}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {rule.override_allowed && (
                      <span className="text-xs text-gray-500">Override: {rule.override_requires}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${rule.rule_name}"?`)) deleteDeclineMutation.mutate(rule.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referral Triggers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowReferrals(!showReferrals)}
            className="flex items-center gap-2 font-medium text-gray-900"
          >
            <span>{showReferrals ? '−' : '+'}</span>
            <span>Referral Triggers ({referrals?.length || 0})</span>
          </button>
          <button
            onClick={() => { setReferralEditItem({}); setReferralEditOpen(true); }}
            className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            + Add Trigger
          </button>
        </div>
        {showReferrals && (
          <div className="space-y-2">
            {(referrals || []).map((trigger) => (
              <div
                key={trigger.id}
                onClick={() => { setReferralEditItem(trigger); setReferralEditOpen(true); }}
                className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-purple-300 hover:bg-purple-50/50 group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        trigger.referral_level === 'management' ? 'bg-purple-100 text-purple-700' :
                        trigger.referral_level === 'senior_uw' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {trigger.referral_level?.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="font-medium">{trigger.trigger_name}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{trigger.description}</p>
                    {trigger.referral_reason && (
                      <p className="text-sm text-gray-500 mt-1">Reason: {trigger.referral_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                      {trigger.category}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${trigger.trigger_name}"?`)) deleteReferralMutation.mutate(trigger.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Control Edit Modal */}
      <Modal
        isOpen={controlEditOpen}
        onClose={() => { setControlEditOpen(false); setControlEditItem(null); }}
        title={controlEditItem?.id ? 'Edit Control' : 'Add Control'}
      >
        <ControlForm
          initialData={controlEditItem}
          onSave={(data) => controlEditItem?.id ? updateControlMutation.mutate({ id: controlEditItem.id, data }) : createControlMutation.mutate(data)}
          onCancel={() => { setControlEditOpen(false); setControlEditItem(null); }}
          isLoading={createControlMutation.isPending || updateControlMutation.isPending}
        />
      </Modal>

      {/* Declination Edit Modal */}
      <Modal
        isOpen={declineEditOpen}
        onClose={() => { setDeclineEditOpen(false); setDeclineEditItem(null); }}
        title={declineEditItem?.id ? 'Edit Declination Rule' : 'Add Declination Rule'}
      >
        <DeclinationForm
          initialData={declineEditItem}
          onSave={(data) => declineEditItem?.id ? updateDeclineMutation.mutate({ id: declineEditItem.id, data }) : createDeclineMutation.mutate(data)}
          onCancel={() => { setDeclineEditOpen(false); setDeclineEditItem(null); }}
          isLoading={createDeclineMutation.isPending || updateDeclineMutation.isPending}
        />
      </Modal>

      {/* Referral Edit Modal */}
      <Modal
        isOpen={referralEditOpen}
        onClose={() => { setReferralEditOpen(false); setReferralEditItem(null); }}
        title={referralEditItem?.id ? 'Edit Referral Trigger' : 'Add Referral Trigger'}
      >
        <ReferralForm
          initialData={referralEditItem}
          onSave={(data) => referralEditItem?.id ? updateReferralMutation.mutate({ id: referralEditItem.id, data }) : createReferralMutation.mutate(data)}
          onCancel={() => { setReferralEditOpen(false); setReferralEditItem(null); }}
          isLoading={createReferralMutation.isPending || updateReferralMutation.isPending}
        />
      </Modal>
    </div>
  );
}

// Control Form Component
function ControlForm({ initialData, onSave, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    control_name: initialData?.control_name || '',
    control_key: initialData?.control_key || '',
    control_category: initialData?.control_category || 'access_control',
    description: initialData?.description || '',
    mandatory_above_hazard: initialData?.mandatory_above_hazard ?? '',
    mandatory_above_revenue_millions: initialData?.mandatory_above_revenue_millions ?? '',
    is_declination_trigger: initialData?.is_declination_trigger || false,
    is_referral_trigger: initialData?.is_referral_trigger || false,
    credit_if_present: initialData?.credit_if_present ?? '',
    debit_if_missing: initialData?.debit_if_missing ?? '',
    enforcement_level: initialData?.enforcement_level || 'advisory',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (data.mandatory_above_hazard === '') data.mandatory_above_hazard = null;
    if (data.mandatory_above_revenue_millions === '') data.mandatory_above_revenue_millions = null;
    if (data.credit_if_present === '') data.credit_if_present = null;
    if (data.debit_if_missing === '') data.debit_if_missing = null;
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Control Name *</label>
          <input type="text" required className="form-input w-full" value={formData.control_name}
            onChange={(e) => setFormData({ ...formData, control_name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Control Key *</label>
          <input type="text" required className="form-input w-full" placeholder="e.g., has_mfa" value={formData.control_key}
            onChange={(e) => setFormData({ ...formData, control_key: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select className="form-select w-full" value={formData.control_category}
            onChange={(e) => setFormData({ ...formData, control_category: e.target.value })}>
            <option value="access_control">Access Control</option>
            <option value="endpoint_security">Endpoint Security</option>
            <option value="backup">Backup & Recovery</option>
            <option value="network">Network Security</option>
            <option value="operations">Security Operations</option>
            <option value="data_protection">Data Protection</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea className="form-textarea w-full" rows={2} value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mandatory Above Hazard</label>
          <select className="form-select w-full" value={formData.mandatory_above_hazard}
            onChange={(e) => setFormData({ ...formData, mandatory_above_hazard: e.target.value })}>
            <option value="">Always mandatory</option>
            <option value="1">Hazard &gt; 1</option>
            <option value="2">Hazard &gt; 2</option>
            <option value="3">Hazard &gt; 3</option>
            <option value="4">Hazard &gt; 4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mandatory Above Revenue ($M)</label>
          <input type="number" step="1" className="form-input w-full" value={formData.mandatory_above_revenue_millions}
            onChange={(e) => setFormData({ ...formData, mandatory_above_revenue_millions: e.target.value })} />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.is_declination_trigger}
              onChange={(e) => setFormData({ ...formData, is_declination_trigger: e.target.checked })} />
            <span className="text-sm text-red-600 font-medium">Decline if missing</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.is_referral_trigger}
              onChange={(e) => setFormData({ ...formData, is_referral_trigger: e.target.checked })} />
            <span className="text-sm text-orange-600 font-medium">Refer if missing</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enforcement Level</label>
          <select className="form-select w-full" value={formData.enforcement_level}
            onChange={(e) => setFormData({ ...formData, enforcement_level: e.target.value })}>
            <option value="hard">Hard</option>
            <option value="advisory">Advisory</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Credit if Present (%)</label>
          <input type="number" step="0.5" className="form-input w-full" value={formData.credit_if_present}
            onChange={(e) => setFormData({ ...formData, credit_if_present: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Debit if Missing (%)</label>
          <input type="number" step="0.5" className="form-input w-full" value={formData.debit_if_missing}
            onChange={(e) => setFormData({ ...formData, debit_if_missing: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// Declination Form Component
function DeclinationForm({ initialData, onSave, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    rule_name: initialData?.rule_name || '',
    rule_key: initialData?.rule_key || '',
    description: initialData?.description || '',
    category: initialData?.category || 'security',
    severity: initialData?.severity || 'soft',
    override_allowed: initialData?.override_allowed ?? true,
    override_requires: initialData?.override_requires || '',
    decline_message: initialData?.decline_message || '',
    enforcement_level: initialData?.enforcement_level || 'advisory',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
          <input type="text" required className="form-input w-full" value={formData.rule_name}
            onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rule Key *</label>
          <input type="text" required className="form-input w-full" placeholder="e.g., no_mfa" value={formData.rule_key}
            onChange={(e) => setFormData({ ...formData, rule_key: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select className="form-select w-full" value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
            <option value="security">Security</option>
            <option value="operations">Operations</option>
            <option value="claims">Claims</option>
            <option value="compliance">Compliance</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea className="form-textarea w-full" rows={2} value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Severity *</label>
          <select required className="form-select w-full" value={formData.severity}
            onChange={(e) => setFormData({ ...formData, severity: e.target.value })}>
            <option value="hard">Hard (Auto-Decline)</option>
            <option value="soft">Soft (Recommend Decline)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enforcement Level</label>
          <select className="form-select w-full" value={formData.enforcement_level}
            onChange={(e) => setFormData({ ...formData, enforcement_level: e.target.value })}>
            <option value="hard">Hard</option>
            <option value="advisory">Advisory</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.override_allowed}
              onChange={(e) => setFormData({ ...formData, override_allowed: e.target.checked })} />
            <span className="text-sm">Override allowed</span>
          </label>
        </div>
        {formData.override_allowed && (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Override Requires</label>
            <input type="text" className="form-input w-full" placeholder="e.g., Management approval" value={formData.override_requires}
              onChange={(e) => setFormData({ ...formData, override_requires: e.target.value })} />
          </div>
        )}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Decline Message</label>
          <input type="text" className="form-input w-full" value={formData.decline_message}
            onChange={(e) => setFormData({ ...formData, decline_message: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// Referral Form Component
function ReferralForm({ initialData, onSave, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    trigger_name: initialData?.trigger_name || '',
    trigger_key: initialData?.trigger_key || '',
    description: initialData?.description || '',
    category: initialData?.category || 'risk',
    referral_level: initialData?.referral_level || 'senior_uw',
    referral_reason: initialData?.referral_reason || '',
    enforcement_level: initialData?.enforcement_level || 'advisory',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Name *</label>
          <input type="text" required className="form-input w-full" value={formData.trigger_name}
            onChange={(e) => setFormData({ ...formData, trigger_name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Key *</label>
          <input type="text" required className="form-input w-full" placeholder="e.g., high_revenue" value={formData.trigger_key}
            onChange={(e) => setFormData({ ...formData, trigger_key: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select className="form-select w-full" value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
            <option value="risk">Risk</option>
            <option value="limits">Limits</option>
            <option value="claims">Claims</option>
            <option value="controls">Controls</option>
            <option value="operations">Operations</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea className="form-textarea w-full" rows={2} value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referral Level *</label>
          <select required className="form-select w-full" value={formData.referral_level}
            onChange={(e) => setFormData({ ...formData, referral_level: e.target.value })}>
            <option value="senior_uw">Senior UW</option>
            <option value="management">Management</option>
            <option value="actuarial">Actuarial</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enforcement Level</label>
          <select className="form-select w-full" value={formData.enforcement_level}
            onChange={(e) => setFormData({ ...formData, enforcement_level: e.target.value })}>
            <option value="hard">Hard</option>
            <option value="advisory">Advisory</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Referral Reason</label>
          <input type="text" className="form-input w-full" value={formData.referral_reason}
            onChange={(e) => setFormData({ ...formData, referral_reason: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. RATING & PRICING TAB
// Base rates, control credits, minimum premiums
// ─────────────────────────────────────────────────────────────

function PricingTab() {
  const queryClient = useQueryClient();
  const [selectedHazard, setSelectedHazard] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const { data: pricing, isLoading } = useQuery({
    queryKey: ['uw-pricing', selectedHazard],
    queryFn: () => getUWPricingGuidelines({ hazard_class: selectedHazard || undefined }).then(res => res.data),
  });

  const { data: controls } = useQuery({
    queryKey: ['uw-controls-all'],
    queryFn: () => getUWMandatoryControls().then(res => res.data),
  });

  const createMutation = useMutation({
    mutationFn: createUWPricingGuideline,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-pricing'] }); setEditOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateUWPricingGuideline(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['uw-pricing'] }); setEditOpen(false); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteUWPricingGuideline,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uw-pricing'] }),
  });

  const hazardColors = {
    1: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', label: 'Low Risk' },
    2: { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-800', label: 'Moderate-Low' },
    3: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', label: 'Moderate' },
    4: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', label: 'Moderate-High' },
    5: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', label: 'High Risk' },
  };

  const revenueBandLabels = {
    'under_10m': 'Under $10M',
    '10m_50m': '$10M - $50M',
    '50m_250m': '$50M - $250M',
    'over_250m': 'Over $250M',
  };

  // Group pricing by hazard class
  const pricingByHazard = (pricing || []).reduce((acc, p) => {
    acc[p.hazard_class] = acc[p.hazard_class] || [];
    acc[p.hazard_class].push(p);
    return acc;
  }, {});

  // Get controls with credits/debits
  const controlModifiers = (controls || []).filter(c => c.credit_if_present || c.debit_if_missing);

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedHazard('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              !selectedHazard ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Classes
          </button>
          {[1, 2, 3, 4, 5].map((h) => {
            const colors = hazardColors[h];
            return (
              <button
                key={h}
                onClick={() => setSelectedHazard(h.toString())}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedHazard === h.toString()
                    ? 'bg-purple-600 text-white'
                    : `${colors.bg} ${colors.text} hover:opacity-80`
                }`}
              >
                Class {h}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { setEditItem(null); setEditOpen(true); }}
          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
        >
          + Add Pricing
        </button>
      </div>

      {/* Pricing Tables by Hazard */}
      {isLoading ? (
        <div className="text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(pricingByHazard).map(([hazard, rows]) => {
            const colors = hazardColors[hazard];
            return (
              <div key={hazard} className={`rounded-lg border ${colors.border} overflow-hidden`}>
                <div className={`px-4 py-2 ${colors.bg} border-b ${colors.border}`}>
                  <span className={`font-medium ${colors.text}`}>
                    Hazard Class {hazard} — {colors.label}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Revenue Band</th>
                      <th className="px-4 py-2 text-right font-medium">Min Rate</th>
                      <th className="px-4 py-2 text-right font-medium">Target Rate</th>
                      <th className="px-4 py-2 text-right font-medium">Max Rate</th>
                      <th className="px-4 py-2 text-right font-medium">Min Premium</th>
                      <th className="px-4 py-2 text-right font-medium">Max Limit</th>
                      <th className="px-4 py-2 text-right font-medium">Std Retention</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => { setEditItem(row); setEditOpen(true); }}
                        className="hover:bg-purple-50 cursor-pointer group"
                      >
                        <td className="px-4 py-2 font-medium">
                          {revenueBandLabels[row.revenue_band] || row.revenue_band}
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.min_rate_per_million)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(row.target_rate_per_million)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.max_rate_per_million)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.min_premium)}</td>
                        <td className="px-4 py-2 text-right">${row.max_limit_millions}M</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.standard_retention)}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete pricing for ${revenueBandLabels[row.revenue_band] || row.revenue_band}?`)) {
                                deleteMutation.mutate(row.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows[0]?.notes && (
                  <div className={`px-4 py-2 text-xs text-gray-500 ${colors.bg}`}>
                    Note: {rows[0].notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Control Credits/Debits */}
      <div className="space-y-3">
        <h3 className="font-medium text-gray-900">Control Rate Modifiers</h3>
        <p className="text-sm text-gray-600">
          Rate credits for having controls in place, debits for missing controls.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {/* Credits */}
          <div className="border border-green-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-green-50 border-b border-green-200 font-medium text-green-800">
              Rate Credits (if present)
            </div>
            <div className="divide-y divide-gray-100">
              {controlModifiers.filter(c => c.credit_if_present).map((ctrl) => (
                <div key={ctrl.id} className="px-4 py-2 flex justify-between">
                  <span className="text-sm">{ctrl.control_name}</span>
                  <span className="text-green-600 font-medium">{ctrl.credit_if_present}%</span>
                </div>
              ))}
            </div>
          </div>
          {/* Debits */}
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-red-50 border-b border-red-200 font-medium text-red-800">
              Rate Debits (if missing)
            </div>
            <div className="divide-y divide-gray-100">
              {controlModifiers.filter(c => c.debit_if_missing).map((ctrl) => (
                <div key={ctrl.id} className="px-4 py-2 flex justify-between">
                  <span className="text-sm">{ctrl.control_name}</span>
                  <span className="text-red-600 font-medium">+{ctrl.debit_if_missing}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit/Create Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={editItem ? 'Edit Pricing Guideline' : 'Add Pricing Guideline'}>
        <PricingForm
          initialData={editItem}
          onSave={(data) => {
            if (editItem) {
              updateMutation.mutate({ id: editItem.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          onCancel={() => setEditOpen(false)}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      </Modal>
    </div>
  );
}

function PricingForm({ initialData, onSave, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    hazard_class: initialData?.hazard_class ?? 1,
    revenue_band: initialData?.revenue_band || 'under_10m',
    min_rate_per_million: initialData?.min_rate_per_million ?? '',
    target_rate_per_million: initialData?.target_rate_per_million ?? '',
    max_rate_per_million: initialData?.max_rate_per_million ?? '',
    min_premium: initialData?.min_premium ?? '',
    max_limit_millions: initialData?.max_limit_millions ?? '',
    standard_retention: initialData?.standard_retention ?? '',
    notes: initialData?.notes || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    // Convert empty strings to null for numeric fields
    ['min_rate_per_million', 'target_rate_per_million', 'max_rate_per_million', 'min_premium', 'max_limit_millions', 'standard_retention'].forEach(field => {
      if (data[field] === '') data[field] = null;
    });
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hazard Class *</label>
          <select className="form-select w-full" value={formData.hazard_class}
            onChange={(e) => setFormData({ ...formData, hazard_class: parseInt(e.target.value) })}>
            <option value={1}>Class 1 - Low Risk</option>
            <option value={2}>Class 2 - Moderate-Low</option>
            <option value={3}>Class 3 - Moderate</option>
            <option value={4}>Class 4 - Moderate-High</option>
            <option value={5}>Class 5 - High Risk</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Revenue Band *</label>
          <select className="form-select w-full" value={formData.revenue_band}
            onChange={(e) => setFormData({ ...formData, revenue_band: e.target.value })}>
            <option value="under_10m">Under $10M</option>
            <option value="10m_50m">$10M - $50M</option>
            <option value="50m_250m">$50M - $250M</option>
            <option value="over_250m">Over $250M</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Rate/Million ($)</label>
          <input type="number" step="100" className="form-input w-full" value={formData.min_rate_per_million}
            onChange={(e) => setFormData({ ...formData, min_rate_per_million: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Rate/Million ($) *</label>
          <input type="number" step="100" required className="form-input w-full" value={formData.target_rate_per_million}
            onChange={(e) => setFormData({ ...formData, target_rate_per_million: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Rate/Million ($)</label>
          <input type="number" step="100" className="form-input w-full" value={formData.max_rate_per_million}
            onChange={(e) => setFormData({ ...formData, max_rate_per_million: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Premium ($)</label>
          <input type="number" step="1000" className="form-input w-full" value={formData.min_premium}
            onChange={(e) => setFormData({ ...formData, min_premium: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Limit ($M)</label>
          <input type="number" step="1" className="form-input w-full" value={formData.max_limit_millions}
            onChange={(e) => setFormData({ ...formData, max_limit_millions: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Standard Retention ($)</label>
          <input type="number" step="5000" className="form-input w-full" value={formData.standard_retention}
            onChange={(e) => setFormData({ ...formData, standard_retention: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="form-textarea w-full" rows={2} value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">Cancel</button>
        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
          {isLoading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. RISK ASSESSMENT TAB
// Credibility score interpretation, red flags, claims guidelines
// ─────────────────────────────────────────────────────────────

function RiskAssessmentTab() {
  return (
    <div className="space-y-6">
      {/* Credibility Score */}
      <ExpandableSection title="Credibility Score Interpretation" defaultOpen>
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

      {/* Red Flags */}
      <ExpandableSection title="Red Flags to Watch For" defaultOpen>
        <div className="text-sm text-gray-700 space-y-4">
          <div>
            <p className="font-medium mb-2">Direct Contradictions:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600 space-y-1">
              <li>"No EDR" but names an EDR vendor</li>
              <li>"No MFA" but specifies MFA type</li>
              <li>"No backups" but specifies backup frequency</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Business Model Implausibility:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600 space-y-1">
              <li>B2C e-commerce claiming no PII collection</li>
              <li>Healthcare provider claiming no PHI</li>
              <li>SaaS company claiming no customer data</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">Scale Mismatches:</p>
            <ul className="list-disc list-inside ml-4 text-gray-600 space-y-1">
              <li>500+ employees with no dedicated security team</li>
              <li>$100M+ revenue with no written security policies</li>
              <li>Large company with no incident response plan</li>
            </ul>
          </div>
        </div>
      </ExpandableSection>

      {/* Claims History Guidelines */}
      <ExpandableSection title="Claims History Guidelines">
        <div className="text-sm text-gray-700 space-y-3">
          <table className="w-full text-sm border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Claims Pattern</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2">No claims in 5 years</td>
                <td className="px-3 py-2 text-green-600">Standard processing, potential credit</td>
              </tr>
              <tr>
                <td className="px-3 py-2">1-2 minor claims (&lt;$50K)</td>
                <td className="px-3 py-2">Request loss runs, review remediation</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Any claim &gt;$250K</td>
                <td className="px-3 py-2 text-orange-600">Refer to senior UW, detailed loss analysis</td>
              </tr>
              <tr>
                <td className="px-3 py-2">3+ claims in 3 years</td>
                <td className="px-3 py-2 text-orange-600">Frequency concern, refer to senior UW</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Active breach/incident</td>
                <td className="px-3 py-2 text-red-600">Cannot bind until resolved</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Ransomware payment</td>
                <td className="px-3 py-2 text-orange-600">Review remediation steps, higher retention</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ExpandableSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. SUPPLEMENTAL QUESTIONS TAB
// By exposure type, by industry
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
          defaultOpen={selectedCategory === 'Cryptocurrency'}
        >
          <div className="text-sm text-gray-700 space-y-3">
            <p className="text-gray-500 italic">
              When to Ask: Crypto exchanges, DeFi platforms, NFT marketplaces, companies holding crypto treasury.
            </p>
            <div className="bg-red-100 border border-red-300 rounded p-3 text-red-800">
              <strong>Note:</strong> Cryptocurrency/blockchain businesses are typically EXCLUDED from appetite.
              These questions are for disclosure purposes only.
            </div>
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
          </div>
        </ExpandableSection>
      )}

      {(selectedCategory === 'All' || selectedCategory === 'AI/ML Operations') && (
        <ExpandableSection
          title="AI/ML Operations"
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
// 6. REFERENCE TAB
// Field definitions, conflict rules, market news
// ─────────────────────────────────────────────────────────────

function ReferenceTab() {
  const [activeSubTab, setActiveSubTab] = useState('conflicts');

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {[
          { id: 'conflicts', label: 'Conflict Rules' },
          { id: 'fields', label: 'Field Definitions' },
          { id: 'news', label: 'Market News' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSubTab === tab.id
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'conflicts' && <ConflictsSubTab />}
      {activeSubTab === 'fields' && <FieldDefinitionsSubTab />}
      {activeSubTab === 'news' && <MarketNewsSubTab />}
    </div>
  );
}

function ConflictsSubTab() {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['conflict-rules', categoryFilter, severityFilter],
    queryFn: () => getConflictRules({
      category: categoryFilter || undefined,
      severity: severityFilter || undefined,
    }).then(res => res.data),
  });

  const severityColors = {
    critical: { bg: 'bg-red-100', text: 'text-red-700' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    low: { bg: 'bg-green-100', text: 'text-green-700' },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Known contradiction patterns automatically detected in cyber insurance applications.
      </p>

      <div className="flex gap-4">
        <select
          className="form-select w-48"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="edr">EDR</option>
          <option value="mfa">MFA</option>
          <option value="backup">Backup</option>
          <option value="business_model">Business Model</option>
          <option value="scale">Scale</option>
        </select>
        <select
          className="form-select w-48"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-2">
          {(rules || []).map((rule) => {
            const colors = severityColors[rule.severity] || {};
            return (
              <ExpandableSection
                key={rule.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {rule.severity}
                    </span>
                    <span>{rule.title || rule.rule_name}</span>
                    {rule.times_detected > 0 && (
                      <span className="text-xs text-gray-500">({rule.times_detected} detections)</span>
                    )}
                  </div>
                }
              >
                <div className="text-sm space-y-2">
                  <p className="text-gray-600">{rule.description}</p>
                  {rule.example_bad && (
                    <div className="bg-gray-100 p-2 rounded text-xs">
                      <div className="font-medium mb-1">Example:</div>
                      <pre className="whitespace-pre-wrap">
                        {typeof rule.example_bad === 'string' ? rule.example_bad : JSON.stringify(rule.example_bad, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </ExpandableSection>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldDefinitionsSubTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Reference guide for common application fields and their meanings.
      </p>

      <ExpandableSection title="EDR (Endpoint Detection & Response)">
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
        </div>
      </ExpandableSection>

      <ExpandableSection title="MFA (Multi-Factor Authentication)">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>hasMfa</strong> - Does the organization use MFA?</p>
          <p><strong>mfaType</strong> - Type of MFA used:</p>
          <ul className="list-disc list-inside ml-4 text-gray-600">
            <li>Authenticator App (TOTP)</li>
            <li>Hardware Token (FIDO2/YubiKey)</li>
            <li>SMS (less secure)</li>
            <li>Push Notification</li>
          </ul>
          <p><strong>remoteAccessMfa</strong> - Is MFA required for remote access?</p>
          <p><strong>emailMfa</strong> - Is MFA required for email access?</p>
        </div>
      </ExpandableSection>

      <ExpandableSection title="Backups">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>hasBackups</strong> - Does the organization perform regular backups?</p>
          <p><strong>backupFrequency</strong> - How often are backups performed?</p>
          <p><strong>offlineBackups</strong> - Are backups stored offline (air-gapped)?</p>
          <p><strong>immutableBackups</strong> - Are backups immutable?</p>
          <p><strong>encryptedBackups</strong> - Are backups encrypted?</p>
        </div>
      </ExpandableSection>

      <ExpandableSection title="Business Information">
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>businessModel</strong> - B2B, B2C, or B2B2C</p>
          <p><strong>collectsPii</strong> - Does the business collect PII?</p>
          <p><strong>handlesCreditCards</strong> - Does the business handle credit card data?</p>
          <p><strong>employeeCount</strong> - Number of employees</p>
          <p><strong>annualRevenue</strong> - Annual revenue</p>
        </div>
      </ExpandableSection>
    </div>
  );
}

function MarketNewsSubTab() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showPostForm, setShowPostForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ['market-news', search, category],
    queryFn: () => getMarketNews({ search, category: category !== 'all' ? category : undefined }).then(res => res.data),
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
        Team-curated cyber insurance and cybersecurity articles.
      </p>

      <div className="flex items-center gap-4">
        <input
          type="text"
          className="form-input flex-1"
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select w-44"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All</option>
          <option value="cyber_insurance">Cyber Insurance</option>
          <option value="cybersecurity">Cybersecurity</option>
        </select>
        <button
          onClick={() => setShowPostForm(true)}
          className="btn btn-primary"
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
        <div className="text-gray-500">Loading...</div>
      ) : !articles?.length ? (
        <div className="text-gray-500">No articles found</div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <div key={article.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{article.title}</div>
                  <div className="text-sm text-gray-500">
                    {article.source && `${article.source} · `}
                    {formatDate(article.published_at)}
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
                      Open
                    </a>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this article?')) {
                        deleteMutation.mutate(article.id);
                      }
                    }}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {article.summary && (
                <p className="text-sm text-gray-600 mt-2">{article.summary}</p>
              )}
            </div>
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
          placeholder="Source (e.g., wsj.com)"
          value={formData.source}
          onChange={(e) => setFormData({ ...formData, source: e.target.value })}
        />
        <textarea
          className="form-input w-full"
          rows={2}
          placeholder="Summary"
          value={formData.summary}
          onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared Components
// ─────────────────────────────────────────────────────────────

function ExpandableSection({ title, children, defaultOpen = false }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 text-left"
      >
        <span className="font-medium">{typeof title === 'string' ? title : title}</span>
        <span className="text-gray-400">{expanded ? '-' : '+'}</span>
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
  const [activeTab, setActiveTab] = useState('appetite');

  const tabs = [
    { id: 'appetite', label: 'Appetite' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'pricing', label: 'Rating & Pricing' },
    { id: 'assessment', label: 'Risk Assessment' },
    { id: 'supplemental', label: 'Supplemental Qs' },
    { id: 'reference', label: 'Reference' },
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
            <Link to="/document-library" className="nav-link">Docs</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Cyber Underwriting Guide</h2>
        <p className="text-gray-600 mb-6">Comprehensive reference for underwriting decisions, appetite, pricing, and risk assessment</p>

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
          {activeTab === 'appetite' && <AppetiteTab />}
          {activeTab === 'requirements' && <RequirementsTab />}
          {activeTab === 'pricing' && <PricingTab />}
          {activeTab === 'assessment' && <RiskAssessmentTab />}
          {activeTab === 'supplemental' && <SupplementalQuestionsTab />}
          {activeTab === 'reference' && <ReferenceTab />}
        </div>
      </main>
    </div>
  );
}
