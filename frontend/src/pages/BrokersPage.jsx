import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBrkrOrganizations,
  createBrkrOrganization,
  updateBrkrOrganization,
  getBrkrOffices,
  createBrkrOffice,
  updateBrkrOffice,
  getBrkrPeople,
  createBrkrPerson,
  updateBrkrPerson,
  getBrkrEmployments,
  createBrkrEmployment,
  updateBrkrEmployment,
  getBrkrTeams,
  createBrkrTeam,
  getBrkrTeamMembers,
  addBrkrTeamMember,
  getBrkrDbas,
  createBrkrDba,
  getBrkrAddresses,
  createBrkrAddress,
} from '../api/client';

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function formatAddress(addr) {
  if (!addr) return '—';
  const parts = [addr.line1];
  if (addr.line2) parts.push(addr.line2);
  parts.push(`${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}`);
  return parts.filter(p => p.trim()).join(', ');
}

// ─────────────────────────────────────────────────────────────
// Organizations Tab
// ─────────────────────────────────────────────────────────────

function OrganizationsTab() {
  const [search, setSearch] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: organizations = [], isLoading } = useQuery({
    queryKey: ['brkr-organizations', search],
    queryFn: () => getBrkrOrganizations({ search }).then(res => res.data),
  });

  const selectedOrg = organizations.find(o => o.org_id === selectedOrgId);

  const updateMutation = useMutation({
    mutationFn: ({ orgId, data }) => updateBrkrOrganization(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-organizations'] });
      setSelectedOrgId('');
    },
  });

  const createMutation = useMutation({
    mutationFn: createBrkrOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-organizations'] });
      setShowNewForm(false);
    },
  });

  return (
    <div className="space-y-6">
      {/* Search + Select */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-80">
          <select
            className="form-select w-full"
            value={selectedOrgId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__new__') {
                setShowNewForm(true);
                setSelectedOrgId('');
              } else {
                setShowNewForm(false);
                setSelectedOrgId(val);
              }
            }}
          >
            <option value="">— Choose an organization —</option>
            <option value="__new__">+ Add a new organization</option>
            {organizations.map(org => (
              <option key={org.org_id} value={org.org_id}>
                {org.name} [{org.org_type}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Organization Form */}
      {showNewForm && (
        <NewOrganizationForm
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setShowNewForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* Edit Organization Form */}
      {selectedOrg && (
        <EditOrganizationForm
          org={selectedOrg}
          onSave={(data) => updateMutation.mutate({ orgId: selectedOrg.org_id, data })}
          onCancel={() => setSelectedOrgId('')}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Organizations Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading organizations...</div>
      ) : organizations.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No organizations found. Add your first organization above.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Type</th>
                <th className="table-header text-right">Offices</th>
                <th className="table-header text-right">People</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {organizations.map((org) => (
                <tr
                  key={org.org_id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedOrgId === org.org_id ? 'bg-purple-50' : ''}`}
                  onClick={() => { setSelectedOrgId(org.org_id); setShowNewForm(false); }}
                >
                  <td className="table-cell font-medium">{org.name}</td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 text-xs rounded ${
                      org.org_type === 'brokerage' ? 'bg-blue-100 text-blue-700' :
                      org.org_type === 'carrier' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {org.org_type}
                    </span>
                  </td>
                  <td className="table-cell text-right">{org.office_count || 0}</td>
                  <td className="table-cell text-right">{org.people_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewOrganizationForm({ onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    name: '',
    org_type: 'brokerage',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium mb-4">Add New Organization</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          className="form-input w-full"
          placeholder="Organization Name *"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <select
          className="form-select w-full"
          value={formData.org_type}
          onChange={(e) => setFormData({ ...formData, org_type: e.target.value })}
        >
          <option value="brokerage">Brokerage</option>
          <option value="carrier">Carrier</option>
          <option value="vendor">Vendor</option>
          <option value="competitor">Competitor</option>
          <option value="other">Other</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EditOrganizationForm({ org, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    name: org.name || '',
    org_type: org.org_type || 'brokerage',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium mb-4">Edit Organization</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          className="form-input w-full"
          placeholder="Organization Name *"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <select
          className="form-select w-full"
          value={formData.org_type}
          onChange={(e) => setFormData({ ...formData, org_type: e.target.value })}
        >
          <option value="brokerage">Brokerage</option>
          <option value="carrier">Carrier</option>
          <option value="vendor">Vendor</option>
          <option value="competitor">Competitor</option>
          <option value="other">Other</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Offices Tab
// ─────────────────────────────────────────────────────────────

function OfficesTab() {
  const [orgFilter, setOrgFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: organizations = [] } = useQuery({
    queryKey: ['brkr-organizations'],
    queryFn: () => getBrkrOrganizations({}).then(res => res.data),
  });

  const { data: offices = [], isLoading } = useQuery({
    queryKey: ['brkr-offices', orgFilter, search],
    queryFn: () => getBrkrOffices({ org_id: orgFilter || undefined, search: search || undefined }).then(res => res.data),
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ['brkr-addresses', orgFilter],
    queryFn: () => getBrkrAddresses(orgFilter || null).then(res => res.data),
  });

  const selectedOffice = offices.find(o => o.office_id === selectedOfficeId);

  const createMutation = useMutation({
    mutationFn: createBrkrOffice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-offices'] });
      setShowNewForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ officeId, data }) => updateBrkrOffice(officeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-offices'] });
      setSelectedOfficeId('');
    },
  });

  const orgsMap = Object.fromEntries(organizations.map(o => [o.org_id, o.name]));

  return (
    <div className="space-y-6">
      {/* Organization Filter */}
      <select
        className="form-select w-full"
        value={orgFilter}
        onChange={(e) => setOrgFilter(e.target.value)}
      >
        <option value="">All organizations</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>

      {/* Search + Select */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search offices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-80">
          <select
            className="form-select w-full"
            value={selectedOfficeId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__new__') {
                setShowNewForm(true);
                setSelectedOfficeId('');
              } else {
                setShowNewForm(false);
                setSelectedOfficeId(val);
              }
            }}
          >
            <option value="">— Choose an office —</option>
            <option value="__new__">+ Add a new office</option>
            {offices.map(off => (
              <option key={off.office_id} value={off.office_id}>
                {off.office_name} — {orgsMap[off.org_id] || off.org_id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Office Form */}
      {showNewForm && (
        <NewOfficeForm
          organizations={organizations}
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setShowNewForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* Edit Office Form */}
      {selectedOffice && (
        <EditOfficeForm
          office={selectedOffice}
          organizations={organizations}
          onSave={(data) => updateMutation.mutate({ officeId: selectedOffice.office_id, data })}
          onCancel={() => setSelectedOfficeId('')}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Offices Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading offices...</div>
      ) : offices.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No offices found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Organization</th>
                <th className="table-header">Office Name</th>
                <th className="table-header">Address</th>
                <th className="table-header">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {offices.map((off) => (
                <tr
                  key={off.office_id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedOfficeId === off.office_id ? 'bg-purple-50' : ''}`}
                  onClick={() => { setSelectedOfficeId(off.office_id); setShowNewForm(false); }}
                >
                  <td className="table-cell">{orgsMap[off.org_id] || off.org_id}</td>
                  <td className="table-cell font-medium">{off.office_name}</td>
                  <td className="table-cell text-sm text-gray-600">{formatAddress(off.address)}</td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 text-xs rounded ${
                      off.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {off.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewOfficeForm({ organizations, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    org_id: '',
    office_name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    status: 'active',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.org_id || !formData.line1 || !formData.city || !formData.state) {
      alert('Organization, Line1, City, and State are required');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium mb-4">Add New Office</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <select
          className="form-select w-full"
          value={formData.org_id}
          onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
        >
          <option value="">Select Organization *</option>
          {organizations.map(org => (
            <option key={org.org_id} value={org.org_id}>{org.name}</option>
          ))}
        </select>
        <input
          type="text"
          className="form-input w-full"
          placeholder="Office Name"
          value={formData.office_name}
          onChange={(e) => setFormData({ ...formData, office_name: e.target.value })}
        />
        <input
          type="text"
          className="form-input w-full"
          placeholder="Address Line 1 *"
          value={formData.line1}
          onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
        />
        <input
          type="text"
          className="form-input w-full"
          placeholder="Address Line 2"
          value={formData.line2}
          onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            type="text"
            className="form-input"
            placeholder="City *"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
          <input
            type="text"
            className="form-input"
            placeholder="State *"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Postal Code"
            value={formData.postal_code}
            onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EditOfficeForm({ office, organizations, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    org_id: office.org_id || '',
    office_name: office.office_name || '',
    status: office.status || 'active',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium mb-4">Edit Office</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <select
          className="form-select w-full"
          value={formData.org_id}
          onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
        >
          <option value="">Select Organization *</option>
          {organizations.map(org => (
            <option key={org.org_id} value={org.org_id}>{org.name}</option>
          ))}
        </select>
        <input
          type="text"
          className="form-input w-full"
          placeholder="Office Name"
          value={formData.office_name}
          onChange={(e) => setFormData({ ...formData, office_name: e.target.value })}
        />
        <select
          className="form-select w-full"
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DBAs Tab
// ─────────────────────────────────────────────────────────────

function DbasTab() {
  const [orgFilter, setOrgFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: organizations = [] } = useQuery({
    queryKey: ['brkr-organizations'],
    queryFn: () => getBrkrOrganizations({}).then(res => res.data),
  });

  const { data: dbas = [], isLoading } = useQuery({
    queryKey: ['brkr-dbas', orgFilter],
    queryFn: () => getBrkrDbas(orgFilter || null).then(res => res.data),
  });

  const filteredDbas = search
    ? dbas.filter(d => d.name?.toLowerCase().includes(search.toLowerCase()))
    : dbas;

  const createMutation = useMutation({
    mutationFn: createBrkrDba,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-dbas'] });
      setShowNewForm(false);
    },
  });

  const orgsMap = Object.fromEntries(organizations.map(o => [o.org_id, o.name]));

  return (
    <div className="space-y-6">
      {/* Organization Filter */}
      <select
        className="form-select w-full"
        value={orgFilter}
        onChange={(e) => setOrgFilter(e.target.value)}
      >
        <option value="">All organizations</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>

      {/* Search + Add Button */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search DBAs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowNewForm(!showNewForm)}
        >
          {showNewForm ? 'Cancel' : '+ Add DBA'}
        </button>
      </div>

      {/* New DBA Form */}
      {showNewForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">Add New DBA</h4>
          <NewDbaForm
            organizations={organizations}
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setShowNewForm(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {/* DBAs Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading DBAs...</div>
      ) : filteredDbas.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No DBAs found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">DBA Name</th>
                <th className="table-header">Organization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDbas.map((dba) => (
                <tr key={dba.dba_id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{dba.name}</td>
                  <td className="table-cell">{orgsMap[dba.org_id] || dba.org_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewDbaForm({ organizations, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    org_id: '',
    name: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.org_id || !formData.name.trim()) {
      alert('Organization and DBA Name are required');
      return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <select
        className="form-select w-full"
        value={formData.org_id}
        onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
      >
        <option value="">Select Organization *</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>
      <input
        type="text"
        className="form-input w-full"
        placeholder="DBA Name *"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Teams Tab
// ─────────────────────────────────────────────────────────────

function TeamsTab() {
  const [orgFilter, setOrgFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: organizations = [] } = useQuery({
    queryKey: ['brkr-organizations'],
    queryFn: () => getBrkrOrganizations({}).then(res => res.data),
  });

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['brkr-teams', orgFilter, search],
    queryFn: () => getBrkrTeams({ org_id: orgFilter || undefined, search: search || undefined }).then(res => res.data),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['brkr-team-members', selectedTeamId],
    queryFn: () => selectedTeamId ? getBrkrTeamMembers(selectedTeamId).then(res => res.data) : Promise.resolve([]),
    enabled: !!selectedTeamId,
  });

  const { data: people = [] } = useQuery({
    queryKey: ['brkr-people'],
    queryFn: () => getBrkrPeople({}).then(res => res.data),
  });

  const selectedTeam = teams.find(t => t.team_id === selectedTeamId);

  const createMutation = useMutation({
    mutationFn: createBrkrTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-teams'] });
      setShowNewForm(false);
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, data }) => addBrkrTeamMember(teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-team-members', selectedTeamId] });
    },
  });

  const orgsMap = Object.fromEntries(organizations.map(o => [o.org_id, o.name]));

  return (
    <div className="space-y-6">
      {/* Organization Filter */}
      <select
        className="form-select w-full"
        value={orgFilter}
        onChange={(e) => setOrgFilter(e.target.value)}
      >
        <option value="">All organizations</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>

      {/* Search + Select */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-80">
          <select
            className="form-select w-full"
            value={selectedTeamId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__new__') {
                setShowNewForm(true);
                setSelectedTeamId('');
              } else {
                setShowNewForm(false);
                setSelectedTeamId(val);
              }
            }}
          >
            <option value="">— Choose a team —</option>
            <option value="__new__">+ Add a new team</option>
            {teams.map(team => (
              <option key={team.team_id} value={team.team_id}>
                {team.team_name} — {orgsMap[team.org_id] || ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Team Form */}
      {showNewForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">Add New Team</h4>
          <NewTeamForm
            organizations={organizations}
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setShowNewForm(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {/* Team Details + Members */}
      {selectedTeam && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">{selectedTeam.team_name} — Members</h4>
          {teamMembers.length === 0 ? (
            <p className="text-gray-500 text-sm mb-4">No members yet.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {teamMembers.map((m) => (
                <div key={m.team_membership_id} className="flex items-center justify-between p-2 bg-white rounded border">
                  <span>{m.person_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()}</span>
                  <span className={`text-xs px-2 py-1 rounded ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Add Member */}
          <div className="border-t pt-4">
            <h5 className="text-sm font-medium mb-2">Add Member</h5>
            <div className="flex gap-2">
              <select
                className="form-select flex-1"
                id="add-member-select"
              >
                <option value="">Select person...</option>
                {people.map(p => (
                  <option key={p.person_id} value={p.person_id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const select = document.getElementById('add-member-select');
                  const personId = select?.value;
                  if (personId) {
                    addMemberMutation.mutate({ teamId: selectedTeamId, data: { person_id: personId } });
                    select.value = '';
                  }
                }}
                disabled={addMemberMutation.isPending}
              >
                {addMemberMutation.isPending ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teams Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No teams found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Team Name</th>
                <th className="table-header">Organization</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right">Members</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teams.map((team) => (
                <tr
                  key={team.team_id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedTeamId === team.team_id ? 'bg-purple-50' : ''}`}
                  onClick={() => { setSelectedTeamId(team.team_id); setShowNewForm(false); }}
                >
                  <td className="table-cell font-medium">{team.team_name}</td>
                  <td className="table-cell">{orgsMap[team.org_id] || ''}</td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 text-xs rounded ${
                      team.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {team.status}
                    </span>
                  </td>
                  <td className="table-cell text-right">{team.member_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewTeamForm({ organizations, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    team_name: '',
    org_id: '',
    description: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.team_name.trim()) {
      alert('Team name is required');
      return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        className="form-input w-full"
        placeholder="Team Name *"
        value={formData.team_name}
        onChange={(e) => setFormData({ ...formData, team_name: e.target.value })}
      />
      <select
        className="form-select w-full"
        value={formData.org_id}
        onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
      >
        <option value="">Select Organization (optional)</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>
      <textarea
        className="form-input w-full"
        rows={2}
        placeholder="Description (optional)"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// People Tab
// ─────────────────────────────────────────────────────────────

function PeopleTab() {
  const [search, setSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['brkr-people', search],
    queryFn: () => getBrkrPeople({ search }).then(res => res.data),
  });

  const selectedPerson = people.find(p => p.person_id === selectedPersonId);

  const createMutation = useMutation({
    mutationFn: createBrkrPerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-people'] });
      setShowNewForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ personId, data }) => updateBrkrPerson(personId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-people'] });
      setSelectedPersonId('');
    },
  });

  return (
    <div className="space-y-6">
      {/* Search + Select */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-80">
          <select
            className="form-select w-full"
            value={selectedPersonId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__new__') {
                setShowNewForm(true);
                setSelectedPersonId('');
              } else {
                setShowNewForm(false);
                setSelectedPersonId(val);
              }
            }}
          >
            <option value="">— Choose a person —</option>
            <option value="__new__">+ Add a new person</option>
            {people.map(p => (
              <option key={p.person_id} value={p.person_id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Person Form */}
      {showNewForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">Add New Person</h4>
          <NewPersonForm
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setShowNewForm(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit Person Form */}
      {selectedPerson && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">Edit Person</h4>
          <EditPersonForm
            person={selectedPerson}
            onSave={(data) => updateMutation.mutate({ personId: selectedPerson.person_id, data })}
            onCancel={() => setSelectedPersonId('')}
            isPending={updateMutation.isPending}
          />
        </div>
      )}

      {/* People Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading people...</div>
      ) : people.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No people found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Organization</th>
                <th className="table-header">Email</th>
                <th className="table-header">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {people.map((p) => (
                <tr
                  key={p.person_id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedPersonId === p.person_id ? 'bg-purple-50' : ''}`}
                  onClick={() => { setSelectedPersonId(p.person_id); setShowNewForm(false); }}
                >
                  <td className="table-cell font-medium">{p.first_name} {p.last_name}</td>
                  <td className="table-cell">{p.org_name || '—'}</td>
                  <td className="table-cell">{p.email || '—'}</td>
                  <td className="table-cell">{p.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewPersonForm({ onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      alert('First name and last name are required');
      return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          className="form-input"
          placeholder="First Name *"
          value={formData.first_name}
          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
        />
        <input
          type="text"
          className="form-input"
          placeholder="Last Name *"
          value={formData.last_name}
          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditPersonForm({ person, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    first_name: person.first_name || '',
    last_name: person.last_name || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      alert('First name and last name are required');
      return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          className="form-input"
          placeholder="First Name *"
          value={formData.first_name}
          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
        />
        <input
          type="text"
          className="form-input"
          placeholder="Last Name *"
          value={formData.last_name}
          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Employment Tab
// ─────────────────────────────────────────────────────────────

function EmploymentTab() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: organizations = [] } = useQuery({
    queryKey: ['brkr-organizations'],
    queryFn: () => getBrkrOrganizations({}).then(res => res.data),
  });

  const { data: offices = [] } = useQuery({
    queryKey: ['brkr-offices-all'],
    queryFn: () => getBrkrOffices({}).then(res => res.data),
  });

  const { data: people = [] } = useQuery({
    queryKey: ['brkr-people'],
    queryFn: () => getBrkrPeople({}).then(res => res.data),
  });

  const { data: employments = [], isLoading } = useQuery({
    queryKey: ['brkr-employments', showInactive],
    queryFn: () => getBrkrEmployments({ active_only: !showInactive }).then(res => res.data),
  });

  const filteredEmployments = search
    ? employments.filter(e => {
        const text = `${e.person_name || ''} ${e.org_name || ''} ${e.email || ''}`.toLowerCase();
        return text.includes(search.toLowerCase());
      })
    : employments;

  const selectedEmp = employments.find(e => e.employment_id === selectedEmpId);

  const createMutation = useMutation({
    mutationFn: createBrkrEmployment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-employments'] });
      setShowNewForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ empId, data }) => updateBrkrEmployment(empId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brkr-employments'] });
      setSelectedEmpId('');
    },
  });

  return (
    <div className="space-y-6">
      {/* Search + Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search employments (person/org/email)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <div className="w-80">
          <select
            className="form-select w-full"
            value={selectedEmpId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__new__') {
                setShowNewForm(true);
                setSelectedEmpId('');
              } else {
                setShowNewForm(false);
                setSelectedEmpId(val);
              }
            }}
          >
            <option value="">— Choose employment —</option>
            <option value="__new__">+ Add new employment</option>
            {filteredEmployments.map(e => (
              <option key={e.employment_id} value={e.employment_id}>
                {e.person_name || '?'} — {e.org_name || '?'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Employment Form */}
      {showNewForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">Add New Employment</h4>
          <NewEmploymentForm
            people={people}
            organizations={organizations}
            offices={offices}
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setShowNewForm(false)}
            isPending={createMutation.isPending}
          />
        </div>
      )}

      {/* Edit Employment Form */}
      {selectedEmp && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium mb-4">Edit Employment</h4>
          <EditEmploymentForm
            employment={selectedEmp}
            organizations={organizations}
            offices={offices}
            onSave={(data) => updateMutation.mutate({ empId: selectedEmp.employment_id, data })}
            onCancel={() => setSelectedEmpId('')}
            isPending={updateMutation.isPending}
          />
        </div>
      )}

      {/* Employment Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading employments...</div>
      ) : filteredEmployments.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No employments found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Person</th>
                <th className="table-header">Organization</th>
                <th className="table-header">Email</th>
                <th className="table-header">Phone</th>
                <th className="table-header">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEmployments.map((emp) => (
                <tr
                  key={emp.employment_id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedEmpId === emp.employment_id ? 'bg-purple-50' : ''}`}
                  onClick={() => { setSelectedEmpId(emp.employment_id); setShowNewForm(false); }}
                >
                  <td className="table-cell font-medium">{emp.person_name || '—'}</td>
                  <td className="table-cell">{emp.org_name || '—'}</td>
                  <td className="table-cell">{emp.email || '—'}</td>
                  <td className="table-cell">{emp.phone || '—'}</td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 text-xs rounded ${
                      emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {emp.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewEmploymentForm({ people, organizations, offices, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    person_id: '',
    org_id: '',
    office_id: '',
    email: '',
    phone: '',
    active: true,
  });

  const filteredOffices = formData.org_id
    ? offices.filter(o => o.org_id === formData.org_id)
    : offices;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.person_id || !formData.org_id) {
      alert('Person and Organization are required');
      return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <select
        className="form-select w-full"
        value={formData.person_id}
        onChange={(e) => setFormData({ ...formData, person_id: e.target.value })}
      >
        <option value="">Select Person *</option>
        {people.map(p => (
          <option key={p.person_id} value={p.person_id}>
            {p.first_name} {p.last_name}
          </option>
        ))}
      </select>
      <select
        className="form-select w-full"
        value={formData.org_id}
        onChange={(e) => setFormData({ ...formData, org_id: e.target.value, office_id: '' })}
      >
        <option value="">Select Organization *</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>
      {filteredOffices.length > 0 && (
        <select
          className="form-select w-full"
          value={formData.office_id}
          onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
        >
          <option value="">Select Office (optional)</option>
          {filteredOffices.map(off => (
            <option key={off.office_id} value={off.office_id}>{off.office_name}</option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="email"
          className="form-input"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <input
          type="text"
          className="form-input"
          placeholder="Phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditEmploymentForm({ employment, organizations, offices, onSave, onCancel, isPending }) {
  const [formData, setFormData] = useState({
    org_id: employment.org_id || '',
    office_id: employment.office_id || '',
    email: employment.email || '',
    phone: employment.phone || '',
    active: employment.active ?? true,
  });

  const filteredOffices = formData.org_id
    ? offices.filter(o => o.org_id === formData.org_id)
    : offices;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <select
        className="form-select w-full"
        value={formData.org_id}
        onChange={(e) => setFormData({ ...formData, org_id: e.target.value, office_id: '' })}
      >
        <option value="">Select Organization *</option>
        {organizations.map(org => (
          <option key={org.org_id} value={org.org_id}>{org.name}</option>
        ))}
      </select>
      {filteredOffices.length > 0 && (
        <select
          className="form-select w-full"
          value={formData.office_id}
          onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
        >
          <option value="">Select Office (optional)</option>
          {filteredOffices.map(off => (
            <option key={off.office_id} value={off.office_id}>{off.office_name}</option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input
          type="email"
          className="form-input"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <input
          type="text"
          className="form-input"
          placeholder="Phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={formData.active}
          onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
        />
        Active
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────

export default function BrokersPage() {
  const [activeTab, setActiveTab] = useState('organizations');

  const tabs = [
    { id: 'organizations', label: 'Organizations' },
    { id: 'offices', label: 'Offices' },
    { id: 'dbas', label: 'DBAs' },
    { id: 'teams', label: 'Teams' },
    { id: 'people', label: 'People' },
    { id: 'employment', label: 'Employment' },
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
            <Link to="/uw-guide" className="nav-link">UW Guide</Link>
            <span className="nav-link-active">Brokers</span>
            <Link to="/coverage-catalog" className="nav-link">Coverage Catalog</Link>
            <Link to="/accounts" className="nav-link">Accounts</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Broker Management</h2>
          <p className="text-sm text-gray-500">Manage organizations, teams, people, and employment records</p>
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

          {/* Tab content */}
          {activeTab === 'organizations' && <OrganizationsTab />}
          {activeTab === 'offices' && <OfficesTab />}
          {activeTab === 'dbas' && <DbasTab />}
          {activeTab === 'teams' && <TeamsTab />}
          {activeTab === 'people' && <PeopleTab />}
          {activeTab === 'employment' && <EmploymentTab />}
        </div>
      </main>
    </div>
  );
}
