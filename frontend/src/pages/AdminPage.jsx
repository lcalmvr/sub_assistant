import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBoundPolicies,
  getPendingSubjectivities,
  markSubjectivityReceived,
  waiveSubjectivity,
  searchPolicies,
  getSubjectivityTemplates,
  createSubjectivityTemplate,
  updateSubjectivityTemplate,
  deleteSubjectivityTemplate,
  getEndorsementComponentTemplates,
  updateEndorsementComponentTemplate,
  getFeedbackAnalytics,
  getExtractionStats,
  getPolicyFormCatalog,
  getPolicyForm,
  getFormExtractionQueue,
  resyncFormCoverages,
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

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
}

// Policy Search Tab
function PolicySearchTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const handleSearch = (value) => {
    setSearchTerm(value);
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { data: results, isLoading } = useQuery({
    queryKey: ['policy-search', debouncedSearch],
    queryFn: () => searchPolicies(debouncedSearch).then(res => res.data),
    enabled: debouncedSearch.length >= 2,
  });

  return (
    <div className="space-y-4">
      <div>
        <input
          type="text"
          className="form-input w-full"
          placeholder="Search by company name..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {!debouncedSearch && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          Enter a company name to search for policies
        </div>
      )}

      {isLoading && debouncedSearch && (
        <div className="text-gray-500">Searching...</div>
      )}

      {results && results.length === 0 && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No policies found matching "{debouncedSearch}"
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500 mb-2">
            Found {results.length} {results.length === 1 ? 'policy' : 'policies'}
          </div>
          {results.map((policy) => (
            <div
              key={policy.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div>
                <Link
                  to={`/submissions/${policy.id}/account`}
                  className="font-medium text-purple-600 hover:text-purple-800"
                >
                  {policy.applicant_name}
                </Link>
                <div className="text-sm text-gray-500 mt-1">
                  {formatDate(policy.effective_date)} → {formatDate(policy.expiration_date)}
                  {policy.sold_premium && (
                    <span className="ml-3">{formatCurrency(policy.sold_premium)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {policy.is_bound ? (
                  <span className="badge badge-quoted">Bound</span>
                ) : (
                  <span className="badge badge-pending">
                    {(policy.submission_status || 'pending').replace(/_/g, ' ')}
                  </span>
                )}
                <Link
                  to={`/submissions/${policy.id}/policy`}
                  className="btn btn-outline btn-sm"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Pending Subjectivities Tab
function PendingSubjectivitiesTab() {
  const queryClient = useQueryClient();
  const [expandedPolicies, setExpandedPolicies] = useState({});

  const { data: policies, isLoading } = useQuery({
    queryKey: ['pending-subjectivities'],
    queryFn: () => getPendingSubjectivities().then(res => res.data),
  });

  const receivedMutation = useMutation({
    mutationFn: (id) => markSubjectivityReceived(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-subjectivities'] });
    },
  });

  const waiveMutation = useMutation({
    mutationFn: (id) => waiveSubjectivity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-subjectivities'] });
    },
  });

  const toggleExpanded = (id) => {
    setExpandedPolicies(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!policies || policies.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
        No policies have pending subjectivities
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-500 mb-4">
        {policies.length} {policies.length === 1 ? 'policy' : 'policies'} with pending subjectivities
      </div>

      {policies.map((policy) => {
        const isExpanded = expandedPolicies[policy.submission_id];
        const count = policy.subjectivities.length;

        return (
          <div
            key={policy.submission_id}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggleExpanded(policy.submission_id)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span className="font-medium text-gray-900">{policy.applicant_name}</span>
                <span className="text-sm text-gray-500">
                  {count} pending
                </span>
              </div>
              <Link
                to={`/submissions/${policy.submission_id}/policy`}
                className="text-purple-600 hover:text-purple-800 text-sm"
                onClick={(e) => e.stopPropagation()}
              >
                View Policy →
              </Link>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-2">
                {policy.subjectivities.map((subj) => (
                  <div
                    key={subj.id}
                    className="flex items-start justify-between p-3 bg-white rounded-lg border border-gray-200"
                  >
                    <div className="flex-1 pr-4">
                      <p className="text-sm text-gray-700">{subj.text}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => receivedMutation.mutate(subj.id)}
                        disabled={receivedMutation.isPending}
                        className="btn btn-sm bg-green-600 text-white hover:bg-green-700"
                      >
                        Received
                      </button>
                      <button
                        onClick={() => waiveMutation.mutate(subj.id)}
                        disabled={waiveMutation.isPending}
                        className="btn btn-sm btn-outline"
                      >
                        Waive
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Bound Policies Tab
function BoundPoliciesTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const handleSearch = (value) => {
    setSearchTerm(value);
    clearTimeout(window.boundSearchTimeout);
    window.boundSearchTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { data: policies, isLoading } = useQuery({
    queryKey: ['bound-policies', debouncedSearch],
    queryFn: () => getBoundPolicies(debouncedSearch).then(res => res.data),
  });

  return (
    <div className="space-y-4">
      <div>
        <input
          type="text"
          className="form-input w-full"
          placeholder="Search bound policies..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="text-gray-500">Loading...</div>
      )}

      {policies && policies.length === 0 && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          {debouncedSearch ? `No bound policies found matching "${debouncedSearch}"` : 'No bound policies found'}
        </div>
      )}

      {policies && policies.length > 0 && (
        <div className="space-y-2">
          {!debouncedSearch && (
            <div className="text-sm text-gray-500 mb-2">
              Recently bound policies
            </div>
          )}
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div>
                <Link
                  to={`/submissions/${policy.id}/policy`}
                  className="font-medium text-purple-600 hover:text-purple-800"
                >
                  {policy.applicant_name}
                </Link>
                <div className="text-sm text-gray-500 mt-1">
                  {formatDate(policy.effective_date)} → {formatDate(policy.expiration_date)}
                  {policy.quote_name && (
                    <span className="ml-3 text-gray-400">{policy.quote_name}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-medium text-gray-900">
                    {formatCurrency(policy.sold_premium)}
                  </div>
                  {policy.bound_at && (
                    <div className="text-xs text-gray-500">
                      Bound {formatDate(policy.bound_at)}
                    </div>
                  )}
                </div>
                <Link
                  to={`/submissions/${policy.id}/policy`}
                  className="btn btn-outline btn-sm"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Subjectivity Templates Tab
function SubjectivityTemplatesTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    text: '',
    position: '',
    category: 'general',
    display_order: 100,
    auto_apply: false,
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ['subjectivity-templates-admin'],
    queryFn: () => getSubjectivityTemplates(null, true).then(res => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => createSubjectivityTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectivity-templates-admin'] });
      setShowAddForm(false);
      setNewTemplate({ text: '', position: '', category: 'general', display_order: 100, auto_apply: false });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateSubjectivityTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectivity-templates-admin'] });
      setEditingId(null);
      setEditForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteSubjectivityTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectivity-templates-admin'] });
    },
  });

  const startEdit = (template) => {
    setEditingId(template.id);
    setEditForm({
      text: template.text,
      position: template.position || '',
      category: template.category || 'general',
      display_order: template.display_order || 100,
      auto_apply: template.auto_apply || false,
      is_active: template.is_active !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    updateMutation.mutate({
      id: editingId,
      data: {
        ...editForm,
        position: editForm.position || null,
      },
    });
  };

  const handleCreate = () => {
    if (!newTemplate.text.trim()) return;
    createMutation.mutate({
      ...newTemplate,
      position: newTemplate.position || null,
    });
  };

  const positionLabel = (pos) => {
    if (!pos) return 'All';
    return pos.charAt(0).toUpperCase() + pos.slice(1);
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading templates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {templates?.length || 0} subjectivity templates
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn btn-primary btn-sm"
        >
          {showAddForm ? 'Cancel' : '+ Add Template'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-purple-900">New Template</div>
          <div>
            <textarea
              className="form-input w-full text-sm"
              rows={2}
              placeholder="Subjectivity text..."
              value={newTemplate.text}
              onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Position</label>
              <select
                className="form-select text-sm w-full"
                value={newTemplate.position}
                onChange={(e) => setNewTemplate({ ...newTemplate, position: e.target.value })}
              >
                <option value="">All</option>
                <option value="primary">Primary only</option>
                <option value="excess">Excess only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Category</label>
              <select
                className="form-select text-sm w-full"
                value={newTemplate.category}
                onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
              >
                <option value="general">General</option>
                <option value="documentation">Documentation</option>
                <option value="premium">Premium</option>
                <option value="coverage">Coverage</option>
                <option value="binding">Binding</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Order</label>
              <input
                type="number"
                className="form-input text-sm w-full"
                value={newTemplate.display_order}
                onChange={(e) => setNewTemplate({ ...newTemplate, display_order: parseInt(e.target.value) || 100 })}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newTemplate.auto_apply}
                  onChange={(e) => setNewTemplate({ ...newTemplate, auto_apply: e.target.checked })}
                />
                Auto-apply
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newTemplate.text.trim() || createMutation.isPending}
              className="btn btn-primary btn-sm"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      <div className="space-y-2">
        {templates?.map((template) => (
          <div
            key={template.id}
            className={`border rounded-lg p-4 ${
              template.is_active === false ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'
            }`}
          >
            {editingId === template.id ? (
              /* Edit Mode */
              <div className="space-y-3">
                <textarea
                  className="form-input w-full text-sm"
                  rows={2}
                  value={editForm.text}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                />
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Position</label>
                    <select
                      className="form-select text-sm w-full"
                      value={editForm.position}
                      onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                    >
                      <option value="">All</option>
                      <option value="primary">Primary only</option>
                      <option value="excess">Excess only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Category</label>
                    <select
                      className="form-select text-sm w-full"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    >
                      <option value="general">General</option>
                      <option value="documentation">Documentation</option>
                      <option value="premium">Premium</option>
                      <option value="coverage">Coverage</option>
                      <option value="binding">Binding</option>
                      <option value="security">Security</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Order</label>
                    <input
                      type="number"
                      className="form-input text-sm w-full"
                      value={editForm.display_order}
                      onChange={(e) => setEditForm({ ...editForm, display_order: parseInt(e.target.value) || 100 })}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editForm.auto_apply}
                        onChange={(e) => setEditForm({ ...editForm, auto_apply: e.target.checked })}
                      />
                      Auto-apply
                    </label>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={updateMutation.isPending}
                    className="btn btn-primary btn-sm"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} className="btn btn-outline btn-sm">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{template.text}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded ${
                      !template.position ? 'bg-blue-100 text-blue-700' :
                      template.position === 'primary' ? 'bg-green-100 text-green-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {positionLabel(template.position)}
                    </span>
                    <span className="text-gray-400">{template.category}</span>
                    <span className="text-gray-400">Order: {template.display_order}</span>
                    {template.auto_apply && (
                      <span className="text-yellow-600 flex items-center gap-1">
                        <span>⚡</span> Auto-apply
                      </span>
                    )}
                    {template.is_active === false && (
                      <span className="text-red-600">Inactive</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => startEdit(template)}
                    className="text-sm text-purple-600 hover:text-purple-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this template?')) {
                        deleteMutation.mutate(template.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {(!templates || templates.length === 0) && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No subjectivity templates found
        </div>
      )}
    </div>
  );
}

// Endorsement Component Templates Tab
function EndorsementComponentTemplatesTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const { data: templates, isLoading } = useQuery({
    queryKey: ['endorsement-component-templates'],
    queryFn: () => getEndorsementComponentTemplates().then(res => res.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateEndorsementComponentTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endorsement-component-templates'] });
      setEditingId(null);
      setEditForm({});
    },
  });

  const startEdit = (template) => {
    setEditingId(template.id);
    setEditForm({
      name: template.name,
      content_html: template.content_html || '',
      position: template.position || 'either',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    updateMutation.mutate({ id: editingId, data: editForm });
  };

  // Render HTML with sample data for preview
  const renderPreview = (html) => {
    if (!html) return null;
    const sampleData = {
      form_number: 'CMAI-END-001',
      edition_date: '01/25',
      policy_type: 'Commercial Management Liability',
      effective_date: '01/01/2025',
      policy_number: 'CML-2025-001234',
    };
    let rendered = html;
    Object.entries(sampleData).forEach(([key, val]) => {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), val);
    });
    return rendered;
  };

  // Get default template for each type
  const getDefault = (type) => templates?.find(t => t.component_type === type && t.is_default);

  const componentInfo = {
    header: {
      label: 'Header',
      description: 'Company name and form number at the top of each endorsement',
    },
    lead_in: {
      label: 'Lead-in',
      description: 'Standard opening language identifying the policy being modified',
    },
    closing: {
      label: 'Closing',
      description: 'Signature block and "all other terms unchanged" language',
    },
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">How Endorsement Components Work</h3>
        <p className="text-sm text-blue-800 mb-3">
          Every endorsement document is assembled from three reusable components.
          Edit these once, and all endorsements using them will update automatically.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-white border border-blue-300 px-2 py-1 rounded">Header</span>
          <span className="text-blue-400">+</span>
          <span className="bg-white border border-blue-300 px-2 py-1 rounded">Lead-in</span>
          <span className="text-blue-400">+</span>
          <span className="bg-yellow-100 border border-yellow-300 px-2 py-1 rounded">Endorsement Body</span>
          <span className="text-blue-400">+</span>
          <span className="bg-white border border-blue-300 px-2 py-1 rounded">Closing</span>
        </div>
      </div>

      {/* Component Cards */}
      {['header', 'lead_in', 'closing'].map((type) => {
        const info = componentInfo[type];
        const defaultTemplate = getDefault(type);
        const isEditing = editingId === defaultTemplate?.id;

        return (
          <div key={type} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Card Header */}
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">{info.label}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
              </div>
              {defaultTemplate && !isEditing && (
                <button
                  onClick={() => startEdit(defaultTemplate)}
                  className="text-sm text-purple-600 hover:text-purple-800"
                >
                  Edit
                </button>
              )}
            </div>

            {/* Card Body */}
            <div className="p-4">
              {!defaultTemplate ? (
                <div className="text-sm text-gray-400 italic">No template configured</div>
              ) : isEditing ? (
                /* Edit Mode */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">HTML Template</label>
                    <textarea
                      className="form-input w-full text-sm font-mono"
                      rows={6}
                      value={editForm.content_html}
                      onChange={(e) => setEditForm({ ...editForm, content_html: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Placeholders: {'{{form_number}}'}, {'{{edition_date}}'}, {'{{policy_type}}'}, {'{{effective_date}}'}, {'{{policy_number}}'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={updateMutation.isPending}
                      className="btn btn-primary btn-sm"
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={cancelEdit} className="btn btn-outline btn-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Preview Mode - render the HTML */
                <div
                  className="text-sm prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderPreview(defaultTemplate.content_html) }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Policy Form Catalog Tab
function PolicyFormCatalogTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [formTypeFilter, setFormTypeFilter] = useState('');
  const [selectedForm, setSelectedForm] = useState(null);
  const [queueView, setQueueView] = useState(false);
  const [resyncStatus, setResyncStatus] = useState(null);

  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['policy-form-catalog', search, carrierFilter, formTypeFilter],
    queryFn: () => getPolicyFormCatalog({ search, carrier: carrierFilter, form_type: formTypeFilter }).then(res => res.data),
  });

  const { data: formDetail } = useQuery({
    queryKey: ['policy-form', selectedForm],
    queryFn: () => getPolicyForm(selectedForm).then(res => res.data),
    enabled: !!selectedForm,
  });

  const { data: queue } = useQuery({
    queryKey: ['form-extraction-queue'],
    queryFn: () => getFormExtractionQueue().then(res => res.data),
    enabled: queueView,
  });

  const resyncMutation = useMutation({
    mutationFn: (formId) => resyncFormCoverages(formId),
    onSuccess: (response) => {
      const count = response.data?.coverages_synced || 0;
      setResyncStatus({ type: 'success', message: `Re-synced ${count} coverages with AI normalization` });
      queryClient.invalidateQueries({ queryKey: ['policy-form', selectedForm] });
    },
    onError: (error) => {
      setResyncStatus({ type: 'error', message: error.message || 'Failed to resync coverages' });
    },
  });

  const formTypeLabels = {
    base_policy: 'Base Policy',
    endorsement: 'Endorsement',
    schedule: 'Schedule',
  };

  const formTypeColors = {
    base_policy: 'bg-purple-100 text-purple-800',
    endorsement: 'bg-blue-100 text-blue-800',
    schedule: 'bg-gray-100 text-gray-800',
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading policy form catalog...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Policy Form Catalog</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQueueView(false)}
            className={`px-3 py-1 text-sm rounded ${!queueView ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
          >
            Catalog ({catalogData?.count || 0})
          </button>
          <button
            onClick={() => setQueueView(true)}
            className={`px-3 py-1 text-sm rounded ${queueView ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
          >
            Extraction Queue ({queue?.length || '...'})
          </button>
        </div>
      </div>

      {!queueView ? (
        <>
          {/* Filters */}
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search forms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input flex-1"
            />
            <select
              value={carrierFilter}
              onChange={(e) => setCarrierFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All Carriers</option>
              {catalogData?.carriers?.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
            <select
              value={formTypeFilter}
              onChange={(e) => setFormTypeFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All Types</option>
              <option value="base_policy">Base Policies</option>
              <option value="endorsement">Endorsements</option>
              <option value="schedule">Schedules</option>
            </select>
          </div>

          {/* Forms Table */}
          {catalogData?.forms?.length > 0 ? (
            <div className="overflow-hidden border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Form Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Referenced</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {catalogData.forms.map((form) => (
                    <tr key={form.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{form.form_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{form.form_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${formTypeColors[form.form_type] || 'bg-gray-100 text-gray-800'}`}>
                          {formTypeLabels[form.form_type] || form.form_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{form.carrier || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">{form.times_referenced || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedForm(form.id)}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              No policy forms in catalog yet
            </div>
          )}
        </>
      ) : (
        /* Extraction Queue View */
        <div>
          {queue?.length > 0 ? (
            <div className="overflow-hidden border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Form Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source Document</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {queue.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{item.form_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{item.source_filename || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.carrier || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              No forms in extraction queue
            </div>
          )}
        </div>
      )}

      {/* Form Detail Modal */}
      {selectedForm && formDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {formDetail.form_number}
              </h3>
              <button
                onClick={() => setSelectedForm(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-500">Form Name</span>
                  <p className="font-medium">{formDetail.form_name || '—'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Carrier</span>
                  <p className="font-medium">{formDetail.carrier || '—'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Form Type</span>
                  <p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${formTypeColors[formDetail.form_type] || 'bg-gray-100'}`}>
                      {formTypeLabels[formDetail.form_type] || formDetail.form_type}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Times Referenced</span>
                  <p className="font-medium">{formDetail.times_referenced || 0}</p>
                </div>
              </div>

              {formDetail.coverage_grants?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Coverage Grants ({formDetail.coverage_grants.length})</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3">
                    {formDetail.coverage_grants.map((cov, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium text-gray-900">{cov.name || cov.coverage}</span>
                        {cov.description && (
                          <p className="text-gray-500 text-xs mt-0.5">{cov.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formDetail.exclusions?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Exclusions ({formDetail.exclusions.length})</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto bg-red-50 rounded-lg p-3">
                    {formDetail.exclusions.map((exc, i) => (
                      <div key={i} className="text-sm text-red-800">{exc.name || exc}</div>
                    ))}
                  </div>
                </div>
              )}

              {formDetail.definitions?.terms?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Definitions ({formDetail.definitions.terms.length})</h4>
                  <div className="flex flex-wrap gap-1">
                    {formDetail.definitions.terms.slice(0, 20).map((term, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{term}</span>
                    ))}
                    {formDetail.definitions.terms.length > 20 && (
                      <span className="px-2 py-0.5 text-gray-500 text-xs">+{formDetail.definitions.terms.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Resync Coverages Button */}
              {formDetail.coverage_grants?.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">
                        Re-sync coverages to coverage catalog with AI normalization
                      </p>
                      {resyncStatus && (
                        <p className={`text-xs mt-1 ${resyncStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                          {resyncStatus.message}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setResyncStatus(null);
                        resyncMutation.mutate(selectedForm);
                      }}
                      disabled={resyncMutation.isPending}
                      className="btn btn-primary btn-sm"
                    >
                      {resyncMutation.isPending ? 'Re-syncing...' : 'Resync Coverages'}
                    </button>
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-400 pt-4 border-t">
                Extraction: {formDetail.extraction_source} · Cost: ${formDetail.extraction_cost?.toFixed(4) || '0.00'} · Added: {formDetail.created_at ? new Date(formDetail.created_at).toLocaleString() : '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Extraction Stats Tab
function ExtractionStatsTab() {
  const [days, setDays] = useState(30);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['extraction-stats', days],
    queryFn: () => getExtractionStats(days).then(res => res.data),
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading extraction stats...</div>;
  }

  const strategyLabels = {
    textract_forms: 'Textract Forms',
    textract_tables: 'Textract Tables',
    textract_detect: 'Textract Detect',
    tiered_policy: 'Tiered Policy',
    quote_adaptive: 'Quote Adaptive',
    claude_vision: 'Claude Vision',
  };

  const strategyColors = {
    textract_forms: 'bg-blue-100 text-blue-800',
    textract_tables: 'bg-green-100 text-green-800',
    textract_detect: 'bg-gray-100 text-gray-800',
    tiered_policy: 'bg-purple-100 text-purple-800',
    quote_adaptive: 'bg-yellow-100 text-yellow-800',
    claude_vision: 'bg-pink-100 text-pink-800',
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Document Extraction Statistics</h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="form-select text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">
            {stats?.overall?.total_extractions || 0}
          </div>
          <div className="text-sm text-purple-600">Total Extractions</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">
            {stats?.overall?.completed || 0}
          </div>
          <div className="text-sm text-green-600">Completed</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-700">
            {stats?.overall?.failed || 0}
          </div>
          <div className="text-sm text-red-600">Failed</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">
            {stats?.overall?.total_pages?.toLocaleString() || 0}
          </div>
          <div className="text-sm text-blue-600">Pages Processed</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-700">
            ${stats?.overall?.total_cost?.toFixed(2) || '0.00'}
          </div>
          <div className="text-sm text-yellow-600">Total Cost</div>
        </div>
      </div>

      {/* By Strategy */}
      <div>
        <h4 className="text-md font-semibold text-gray-900 mb-3">By Extraction Strategy</h4>
        {stats?.by_strategy?.length > 0 ? (
          <div className="overflow-hidden border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Extractions</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pages</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.by_strategy.map((row) => {
                  const successRate = row.extractions > 0
                    ? ((row.completed / row.extractions) * 100).toFixed(0)
                    : 0;
                  return (
                    <tr key={row.strategy}>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${strategyColors[row.strategy] || 'bg-gray-100 text-gray-800'}`}>
                          {strategyLabels[row.strategy] || row.strategy}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">{row.extractions}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">{row.pages?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">${row.cost?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {row.avg_duration_ms ? `${(row.avg_duration_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-medium ${
                          successRate >= 90 ? 'text-green-600' :
                          successRate >= 70 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {successRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No extractions yet</p>
        )}
      </div>

      {/* Policy Form Catalog & Queue */}
      <div className="grid grid-cols-2 gap-6">
        {/* Catalog Stats */}
        <div className="border rounded-lg p-4">
          <h4 className="text-md font-semibold text-gray-900 mb-3">Policy Form Catalog</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Forms</span>
              <span className="font-medium">{stats?.catalog?.total_forms || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Base Policies</span>
              <span className="font-medium">{stats?.catalog?.base_policies || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Endorsements</span>
              <span className="font-medium">{stats?.catalog?.endorsements || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Carriers</span>
              <span className="font-medium">{stats?.catalog?.carriers || 0}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="text-gray-600">Total References</span>
              <span className="font-medium text-purple-600">{stats?.catalog?.total_references || 0}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Forms in catalog are reused across policies, saving extraction cost.
          </p>
        </div>

        {/* Extraction Queue */}
        <div className="border rounded-lg p-4">
          <h4 className="text-md font-semibold text-gray-900 mb-3">Form Extraction Queue</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pending</span>
              <span className={`font-medium ${stats?.queue?.pending > 0 ? 'text-yellow-600' : ''}`}>
                {stats?.queue?.pending || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Processing</span>
              <span className={`font-medium ${stats?.queue?.processing > 0 ? 'text-blue-600' : ''}`}>
                {stats?.queue?.processing || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Completed</span>
              <span className="font-medium text-green-600">{stats?.queue?.completed || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Failed</span>
              <span className={`font-medium ${stats?.queue?.failed > 0 ? 'text-red-600' : ''}`}>
                {stats?.queue?.failed || 0}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            New policy forms are queued for full extraction and cataloging.
          </p>
        </div>
      </div>

      {/* Recent Extractions */}
      <div>
        <h4 className="text-md font-semibold text-gray-900 mb-3">Recent Extractions</h4>
        {stats?.recent?.length > 0 ? (
          <div className="overflow-hidden border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pages</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.recent.slice(0, 10).map((row, idx) => (
                  <tr key={idx} className={row.status === 'failed' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2 text-sm text-gray-900 max-w-xs truncate" title={row.filename}>
                      {row.filename || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{row.document_type || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${strategyColors[row.strategy] || 'bg-gray-100 text-gray-800'}`}>
                        {strategyLabels[row.strategy] || row.strategy}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 text-right">{row.pages || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 text-right">
                      {row.cost ? `$${row.cost.toFixed(3)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 text-right">
                      {row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.status === 'completed' ? (
                        <span className="text-green-600">✓</span>
                      ) : row.status === 'failed' ? (
                        <span className="text-red-600" title={row.error}>✗</span>
                      ) : (
                        <span className="text-yellow-600">⋯</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No recent extractions</p>
        )}
      </div>

      {/* How it works */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">Extraction Strategies</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li><strong>Textract Forms</strong> ($0.05/page) — Applications with checkboxes and key-value pairs</li>
          <li><strong>Textract Tables</strong> ($0.015/page) — Loss runs and financial statements</li>
          <li><strong>Tiered Policy</strong> (~$0.01/page) — Large policies: scan for forms, extract dec pages, catalog lookup</li>
          <li><strong>Quote Adaptive</strong> — Short quotes get full extraction, long quotes use tiered approach</li>
          <li><strong>Claude Vision</strong> ($0.015/page) — Unstructured documents like emails</li>
        </ul>
      </div>
    </div>
  );
}

// AI Feedback Analytics Tab
function FeedbackAnalyticsTab() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['feedback-analytics'],
    queryFn: () => getFeedbackAnalytics().then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading analytics...</div>;
  }

  const fieldNameLabels = {
    business_summary: 'Business Summary',
    cyber_exposures: 'Cyber Exposures',
    nist_controls_summary: 'NIST Controls',
    bullet_point_summary: 'Key Points',
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">
            {analytics?.totals?.total_feedback || 0}
          </div>
          <div className="text-sm text-purple-600">Total Edits</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">
            {analytics?.totals?.submissions_with_feedback || 0}
          </div>
          <div className="text-sm text-blue-600">Submissions Edited</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">
            {analytics?.totals?.fields_edited || 0}
          </div>
          <div className="text-sm text-green-600">Fields Edited</div>
        </div>
      </div>

      {/* Field Edit Rates */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Rates by Field (Last 30 Days)</h3>
        {analytics?.field_edit_rates?.length > 0 ? (
          <div className="overflow-hidden border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Edits</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Submissions</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Change</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Time</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.field_edit_rates.map((field) => (
                  <tr key={field.field_name}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {fieldNameLabels[field.field_name] || field.field_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {field.total_edits}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {field.submissions_edited}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {field.avg_length_change > 0 ? '+' : ''}{field.avg_length_change || 0} chars
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {field.avg_time_to_edit_seconds || '—'}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No edit data yet. Edits made on the UW page will appear here.</p>
        )}
      </div>

      {/* AI Accuracy */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Accuracy Estimates (Last 30 Days)</h3>
        {analytics?.ai_accuracy?.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {analytics.ai_accuracy.map((field) => (
              <div key={field.field_name} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">
                    {fieldNameLabels[field.field_name] || field.field_name}
                  </span>
                  <span className={`text-lg font-bold ${
                    field.accuracy_pct >= 90 ? 'text-green-600' :
                    field.accuracy_pct >= 70 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {field.accuracy_pct?.toFixed(1) || '—'}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      field.accuracy_pct >= 90 ? 'bg-green-500' :
                      field.accuracy_pct >= 70 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${field.accuracy_pct || 0}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {field.edited_submissions} edited / {field.total_submissions} total
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No accuracy data available yet.</p>
        )}
      </div>

      {/* How it works */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">How Feedback Tracking Works</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>When UWs edit AI-generated fields (Business Summary, Cyber Exposures, etc.), the original and edited values are saved.</li>
          <li>Edit time is tracked to understand review effort.</li>
          <li>Accuracy = % of submissions where the AI output didn't need editing.</li>
          <li>Fields with low accuracy scores may need prompt improvements.</li>
        </ul>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('search');

  const tabs = [
    { id: 'search', label: 'Policy Search' },
    { id: 'subjectivities', label: 'Pending Subjectivities' },
    { id: 'bound', label: 'Bound Policies' },
    { id: 'templates', label: 'Subjectivity Templates' },
    { id: 'endorsement-components', label: 'Endorsement Components' },
    { id: 'form-catalog', label: 'Form Catalog' },
    { id: 'extraction', label: 'Extraction Stats' },
    { id: 'feedback', label: 'AI Feedback' },
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
            <span className="nav-link-active">Admin</span>
            <Link to="/compliance" className="nav-link">Compliance</Link>
            <Link to="/uw-guide" className="nav-link">UW Guide</Link>
            <Link to="/brokers" className="nav-link">Brokers</Link>
            <Link to="/coverage-catalog" className="nav-link">Coverage Catalog</Link>
            <Link to="/accounts" className="nav-link">Accounts</Link>
            <Link to="/document-library" className="nav-link">Docs</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Console</h2>

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

          {/* Tab content */}
          {activeTab === 'search' && <PolicySearchTab />}
          {activeTab === 'subjectivities' && <PendingSubjectivitiesTab />}
          {activeTab === 'bound' && <BoundPoliciesTab />}
          {activeTab === 'templates' && <SubjectivityTemplatesTab />}
          {activeTab === 'endorsement-components' && <EndorsementComponentTemplatesTab />}
          {activeTab === 'form-catalog' && <PolicyFormCatalogTab />}
          {activeTab === 'extraction' && <ExtractionStatsTab />}
          {activeTab === 'feedback' && <FeedbackAnalyticsTab />}
        </div>
      </main>
    </div>
  );
}
