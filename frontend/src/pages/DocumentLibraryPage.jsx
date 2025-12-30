import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDocumentLibraryEntries,
  getDocumentLibraryCategories,
  createDocumentLibraryEntry,
  updateDocumentLibraryEntry,
  activateDocumentLibraryEntry,
  archiveDocumentLibraryEntry,
} from '../api/client';

const DOCUMENT_TYPES = {
  endorsement: 'Endorsements',
  marketing: 'Marketing Materials',
  claims_sheet: 'Claims Sheets',
  specimen: 'Specimen Forms',
};

const POSITION_OPTIONS = {
  primary: 'Primary Only',
  excess: 'Excess Only',
  either: 'Primary or Excess',
};

const STATUS_OPTIONS = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export default function DocumentLibraryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('endorsement');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [previewEntry, setPreviewEntry] = useState(null);

  // Fetch entries
  const { data: entriesData, isLoading: loadingEntries } = useQuery({
    queryKey: ['document-library', activeTab, search, statusFilter, positionFilter, categoryFilter, includeArchived],
    queryFn: () => getDocumentLibraryEntries({
      document_type: activeTab === 'all' ? undefined : activeTab,
      search: search || undefined,
      status: statusFilter || undefined,
      position: positionFilter || undefined,
      category: categoryFilter || undefined,
      include_archived: includeArchived,
    }),
    select: (res) => res.data,
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['document-library-categories'],
    queryFn: getDocumentLibraryCategories,
    select: (res) => res.data,
  });

  const entries = entriesData || [];
  const categories = categoriesData?.categories || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createDocumentLibraryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-library'] });
      setShowForm(false);
      setEditingEntry(null);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateDocumentLibraryEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-library'] });
      setShowForm(false);
      setEditingEntry(null);
    },
  });

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: activateDocumentLibraryEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-library'] }),
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: archiveDocumentLibraryEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-library'] }),
  });

  const tabs = [
    { key: 'endorsement', label: 'Endorsements' },
    { key: 'marketing', label: 'Marketing' },
    { key: 'claims_sheet', label: 'Claims Sheets' },
    { key: 'specimen', label: 'Specimen' },
    { key: 'all', label: 'All' },
  ];

  const handleNew = () => {
    setEditingEntry(null);
    setShowForm(true);
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setShowForm(true);
  };

  const handleSave = (formData) => {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Document Library</h1>
        <nav style={{ display: 'flex', gap: 16, fontSize: 14 }}>
          <Link to="/">Submissions</Link>
          <Link to="/stats">Stats</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/compliance">Compliance</Link>
          <Link to="/uw-guide">UW Guide</Link>
          <Link to="/brokers">Brokers</Link>
          <Link to="/coverage-catalog">Coverage Catalog</Link>
          <Link to="/accounts">Accounts</Link>
          <span style={{ fontWeight: 600, color: '#2563eb' }}>Docs</span>
        </nav>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: activeTab === tab.key ? '#2563eb' : 'transparent',
              color: activeTab === tab.key ? '#fff' : '#374151',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search code, title, content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, width: 250 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_OPTIONS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
        >
          <option value="">All Positions</option>
          {Object.entries(POSITION_OPTIONS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include Archived
        </label>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleNew}
          style={{
            padding: '8px 16px',
            background: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + New Document
        </button>
      </div>

      {/* Entry Count */}
      <p style={{ color: '#6b7280', marginBottom: 16 }}>
        {entries.length} document{entries.length !== 1 ? 's' : ''} found
      </p>

      {/* Table */}
      {loadingEntries ? (
        <p>Loading...</p>
      ) : entries.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No documents found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Code</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Title</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Type</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Category</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Position</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Status</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>Version</th>
              <th style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontSize: 13 }}>{entry.code}</td>
                <td style={{ padding: '12px 8px' }}>{entry.title}</td>
                <td style={{ padding: '12px 8px' }}>{DOCUMENT_TYPES[entry.document_type] || entry.document_type}</td>
                <td style={{ padding: '12px 8px' }}>{entry.category || '-'}</td>
                <td style={{ padding: '12px 8px' }}>{POSITION_OPTIONS[entry.position] || entry.position}</td>
                <td style={{ padding: '12px 8px' }}>
                  <StatusBadge status={entry.status} />
                </td>
                <td style={{ padding: '12px 8px' }}>v{entry.version || 1}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setPreviewEntry(entry)}
                      style={{
                        padding: '4px 10px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleEdit(entry)}
                      style={{
                        padding: '4px 10px',
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Edit
                    </button>
                    {entry.status === 'draft' && (
                      <button
                        onClick={() => activateMutation.mutate(entry.id)}
                        style={{
                          padding: '4px 10px',
                          background: '#059669',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Activate
                      </button>
                    )}
                    {entry.status !== 'archived' && (
                      <button
                        onClick={() => archiveMutation.mutate(entry.id)}
                        style={{
                          padding: '4px 10px',
                          background: '#dc2626',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Form Modal */}
      {showForm && (
        <FormModal
          entry={editingEntry}
          categories={categories}
          defaultType={activeTab === 'all' ? 'endorsement' : activeTab}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingEntry(null); }}
          isSaving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Preview Modal */}
      {previewEntry && (
        <PreviewModal
          entry={previewEntry}
          onClose={() => setPreviewEntry(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    draft: { background: '#fef3c7', color: '#92400e' },
    active: { background: '#d1fae5', color: '#065f46' },
    archived: { background: '#f3f4f6', color: '#6b7280' },
  };
  const style = styles[status] || styles.draft;

  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 500,
      ...style,
    }}>
      {STATUS_OPTIONS[status] || status}
    </span>
  );
}

function FormModal({ entry, categories, defaultType, onSave, onClose, isSaving }) {
  const [formData, setFormData] = useState({
    code: entry?.code || '',
    title: entry?.title || '',
    document_type: entry?.document_type || defaultType,
    category: entry?.category || '',
    position: entry?.position || 'either',
    midterm_only: entry?.midterm_only || false,
    default_sort_order: entry?.default_sort_order || 100,
    content_html: entry?.content_html || '',
    status: entry?.status || 'draft',
    version_notes: '',
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 32,
        width: '90%',
        maxWidth: 800,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <h2 style={{ margin: '0 0 24px 0' }}>{entry ? 'Edit Document' : 'New Document'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                required
                placeholder="e.g., END-WAR-001"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
                placeholder="Document title"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Document Type *</label>
              <select
                value={formData.document_type}
                onChange={(e) => handleChange('document_type', e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              >
                {Object.entries(DOCUMENT_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                placeholder="e.g., Coverage Extensions"
                list="category-list"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              />
              <datalist id="category-list">
                {categories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Position</label>
              <select
                value={formData.position}
                onChange={(e) => handleChange('position', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              >
                {Object.entries(POSITION_OPTIONS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Sort Order</label>
              <input
                type="number"
                value={formData.default_sort_order}
                onChange={(e) => handleChange('default_sort_order', parseInt(e.target.value) || 100)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Status</label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              >
                {Object.entries(STATUS_OPTIONS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 28 }}>
              <input
                type="checkbox"
                id="midterm_only"
                checked={formData.midterm_only}
                onChange={(e) => handleChange('midterm_only', e.target.checked)}
              />
              <label htmlFor="midterm_only">Mid-term Only</label>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Content (HTML)</label>
            <textarea
              value={formData.content_html}
              onChange={(e) => handleChange('content_html', e.target.value)}
              rows={12}
              placeholder="<p>Document content here...</p>"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          {entry && (
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Version Notes</label>
              <input
                type="text"
                value={formData.version_notes}
                onChange={(e) => handleChange('version_notes', e.target.value)}
                placeholder="Describe changes made..."
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PreviewModal({ entry, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 32,
        width: '90%',
        maxWidth: 900,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0' }}>{entry.title}</h2>
            <p style={{ margin: 0, color: '#6b7280' }}>
              {entry.code} | {DOCUMENT_TYPES[entry.document_type]} | v{entry.version || 1}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <span style={{ padding: '4px 12px', background: '#f3f4f6', borderRadius: 6, fontSize: 13 }}>
            Position: {POSITION_OPTIONS[entry.position]}
          </span>
          {entry.category && (
            <span style={{ padding: '4px 12px', background: '#f3f4f6', borderRadius: 6, fontSize: 13 }}>
              Category: {entry.category}
            </span>
          )}
          {entry.midterm_only && (
            <span style={{ padding: '4px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 13 }}>
              Mid-term Only
            </span>
          )}
          <StatusBadge status={entry.status} />
        </div>

        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 24,
          background: '#fafafa',
          minHeight: 200,
        }}>
          {entry.content_html ? (
            <div dangerouslySetInnerHTML={{ __html: entry.content_html }} />
          ) : (
            <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>No content available</p>
          )}
        </div>

        {entry.auto_attach_rules && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Auto-Attach Rules</h4>
            <pre style={{
              background: '#f3f4f6',
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              overflow: 'auto',
            }}>
              {JSON.stringify(entry.auto_attach_rules, null, 2)}
            </pre>
          </div>
        )}

        {entry.fill_in_mappings && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Fill-In Mappings</h4>
            <pre style={{
              background: '#f3f4f6',
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              overflow: 'auto',
            }}>
              {JSON.stringify(entry.fill_in_mappings, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
