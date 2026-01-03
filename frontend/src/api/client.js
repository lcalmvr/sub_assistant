import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Submissions
export const getSubmissions = () => api.get('/submissions');
export const getSubmission = (id) => api.get(`/submissions/${id}`);
export const updateSubmission = (id, data) => api.patch(`/submissions/${id}`, data);

// Credibility & Conflicts
export const getCredibility = (submissionId) => api.get(`/submissions/${submissionId}/credibility`);
export const getConflicts = (submissionId) => api.get(`/submissions/${submissionId}/conflicts`);
export const resolveConflict = (submissionId, conflictId, data) =>
  api.post(`/submissions/${submissionId}/conflicts/${conflictId}/resolve`, data);

// Extractions
export const getExtractions = (submissionId) => api.get(`/submissions/${submissionId}/extractions`);
export const triggerExtraction = (submissionId, documentId = null) =>
  api.post(`/submissions/${submissionId}/extract`, { document_id: documentId });
export const correctExtraction = (extractionId, correctedValue, reason = null) =>
  api.post(`/extractions/${extractionId}/correct`, { corrected_value: correctedValue, reason });
export const acceptExtraction = (extractionId) =>
  api.post(`/extractions/${extractionId}/accept`);
export const triggerTextractExtraction = (submissionId, documentId = null) =>
  api.post(`/submissions/${submissionId}/extract-textract`, { document_id: documentId });

// Feedback tracking
export const saveFeedback = (submissionId, feedback) =>
  api.post(`/submissions/${submissionId}/feedback`, feedback);
export const getSubmissionFeedback = (submissionId) =>
  api.get(`/submissions/${submissionId}/feedback`);
export const getFeedbackAnalytics = () => api.get('/feedback/analytics');

// Extraction stats
export const getExtractionStats = (days = 30) => api.get(`/extraction/stats?days=${days}`);

// Document content (for PDF viewer)
export const getDocumentContent = (documentId) => api.get(`/documents/${documentId}/content`, { responseType: 'blob' });
export const getDocumentUrl = (documentId) => `/api/documents/${documentId}/content`;

// Document upload
export const uploadSubmissionDocument = (submissionId, file, documentType = null) => {
  const formData = new FormData();
  formData.append('file', file);
  const params = documentType ? `?document_type=${encodeURIComponent(documentType)}` : '';
  return api.post(`/submissions/${submissionId}/documents${params}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Quote Options
export const getQuoteOptions = (submissionId) => api.get(`/submissions/${submissionId}/quotes`);
export const getQuoteOption = (id) => api.get(`/quotes/${id}`);
export const getQuoteDocuments = (id) => api.get(`/quotes/${id}/documents`);
export const getLatestDocument = (submissionId) => api.get(`/submissions/${submissionId}/latest-document`);
export const getSubmissionDocuments = (submissionId) => api.get(`/submissions/${submissionId}/documents`);
export const createQuoteOption = (submissionId, data) => api.post(`/submissions/${submissionId}/quotes`, data);
export const updateQuoteOption = (id, data) => api.patch(`/quotes/${id}`, data);
export const deleteQuoteOption = (id) => api.delete(`/quotes/${id}`);
export const cloneQuoteOption = (id) => api.post(`/quotes/${id}/clone`);
export const applyToAllQuotes = (id, data) => api.post(`/quotes/${id}/apply-to-all`, data);
export const bindQuoteOption = (id) => api.post(`/quotes/${id}/bind`);
export const unbindQuoteOption = (id) => api.post(`/quotes/${id}/unbind`);

// Documents
export const generateQuoteDocument = (quoteId) => api.post(`/quotes/${quoteId}/generate-document`);
export const generateBinderDocument = (quoteId) => api.post(`/quotes/${quoteId}/generate-binder`);
export const generatePolicyDocument = (quoteId) => api.post(`/quotes/${quoteId}/generate-policy`);

// Endorsements
export const createEndorsement = (submissionId, data) => api.post(`/submissions/${submissionId}/endorsements`, data);
export const issueEndorsement = (endorsementId) => api.post(`/endorsements/${endorsementId}/issue`);
export const voidEndorsement = (endorsementId) => api.post(`/endorsements/${endorsementId}/void`);
export const reinstateEndorsement = (endorsementId) => api.post(`/endorsements/${endorsementId}/reinstate`);
export const deleteEndorsement = (endorsementId) => api.delete(`/endorsements/${endorsementId}`);

// Package Builder
export const getPackageDocuments = (position = 'primary') => api.get(`/package-documents/${position}`);
export const getQuoteEndorsements = (quoteId) => api.get(`/quotes/${quoteId}/endorsements`);
export const getQuoteAutoEndorsements = (quoteId) => api.get(`/quotes/${quoteId}/auto-endorsements`);
export const generateQuotePackage = (quoteId, data) => api.post(`/quotes/${quoteId}/generate-package`, data);

// Quote Endorsements (junction table)
export const linkEndorsementToQuote = (quoteId, endorsementId, fieldValues = {}) =>
  api.post(`/quotes/${quoteId}/endorsements/${endorsementId}`, { field_values: fieldValues });
export const unlinkEndorsementFromQuote = (quoteId, endorsementId) =>
  api.delete(`/quotes/${quoteId}/endorsements/${endorsementId}`);
export const updateEndorsementFieldValues = (quoteId, endorsementId, fieldValues) =>
  api.patch(`/quotes/${quoteId}/endorsements/${endorsementId}`, { field_values: fieldValues });
export const getSubmissionEndorsements = (submissionId) =>
  api.get(`/submissions/${submissionId}/endorsements`);

// Rating
export const calculatePremium = (submissionId, params) => api.post(`/submissions/${submissionId}/calculate-premium`, params);
export const calculatePremiumGrid = (submissionId) => api.post(`/submissions/${submissionId}/calculate-premium-grid`);

// Comparables
export const getComparables = (submissionId, params = {}) => {
  const queryParams = new URLSearchParams(params).toString();
  return api.get(`/submissions/${submissionId}/comparables${queryParams ? `?${queryParams}` : ''}`);
};
export const getComparablesMetrics = (submissionId) => api.get(`/submissions/${submissionId}/comparables/metrics`);

// Policy
export const getPolicyData = (submissionId) => api.get(`/submissions/${submissionId}/policy`);

// Stats
export const getStatsSummary = () => api.get('/stats/summary');
export const getUpcomingRenewals = (days = 90) => api.get(`/stats/upcoming-renewals?days=${days}`);
export const getRenewalsNotReceived = () => api.get('/stats/renewals-not-received');
export const getRetentionMetrics = () => api.get('/stats/retention-metrics');

// Admin
export const getBoundPolicies = (search = '') => {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return api.get(`/admin/bound-policies${params}`);
};
export const getPendingSubjectivities = () => api.get('/admin/pending-subjectivities');
export const markSubjectivityReceived = (id) => api.post(`/admin/subjectivities/${id}/received`);
export const waiveSubjectivity = (id) => api.post(`/admin/subjectivities/${id}/waive`);
export const searchPolicies = (q) => api.get(`/admin/search-policies?q=${encodeURIComponent(q)}`);

// Subjectivities (junction table architecture)
export const getSubjectivityTemplates = (position = null, includeInactive = false) => {
  const query = new URLSearchParams();
  if (position) query.append('position', position);
  if (includeInactive) query.append('include_inactive', 'true');
  const queryStr = query.toString();
  return api.get(`/subjectivity-templates${queryStr ? `?${queryStr}` : ''}`);
};
export const createSubjectivityTemplate = (data) => api.post('/subjectivity-templates', data);
export const updateSubjectivityTemplate = (templateId, data) => api.patch(`/subjectivity-templates/${templateId}`, data);
export const deleteSubjectivityTemplate = (templateId) => api.delete(`/subjectivity-templates/${templateId}`);
export const getSubmissionSubjectivities = (submissionId) => api.get(`/submissions/${submissionId}/subjectivities`);
export const getQuoteSubjectivities = (quoteId) => api.get(`/quotes/${quoteId}/subjectivities`);
export const createSubjectivity = (submissionId, data) => api.post(`/submissions/${submissionId}/subjectivities`, data);
export const updateSubjectivity = (subjectivityId, data) => api.patch(`/subjectivities/${subjectivityId}`, data);
export const deleteSubjectivity = (subjectivityId) => api.delete(`/subjectivities/${subjectivityId}`);
export const linkSubjectivityToQuote = (quoteId, subjectivityId) => api.post(`/quotes/${quoteId}/subjectivities/${subjectivityId}/link`);
export const unlinkSubjectivityFromQuote = (quoteId, subjectivityId) => api.delete(`/quotes/${quoteId}/subjectivities/${subjectivityId}/link`);
export const unlinkSubjectivityFromPosition = (subjectivityId, position) => api.delete(`/subjectivities/${subjectivityId}/position/${position}`);
export const pullSubjectivitiesFromQuote = (quoteId, sourceQuoteId) => api.post(`/quotes/${quoteId}/subjectivities/pull/${sourceQuoteId}`);

// Endorsement Component Templates (header, lead_in, closing)
export const getEndorsementComponentTemplates = (params = {}) => {
  const query = new URLSearchParams();
  if (params.component_type) query.append('component_type', params.component_type);
  if (params.position) query.append('position', params.position);
  if (params.defaults_only) query.append('defaults_only', 'true');
  const queryStr = query.toString();
  return api.get(`/endorsement-component-templates${queryStr ? `?${queryStr}` : ''}`);
};
export const getEndorsementComponentTemplate = (templateId) => api.get(`/endorsement-component-templates/${templateId}`);
export const createEndorsementComponentTemplate = (data) => api.post('/endorsement-component-templates', data);
export const updateEndorsementComponentTemplate = (templateId, data) => api.patch(`/endorsement-component-templates/${templateId}`, data);
export const deleteEndorsementComponentTemplate = (templateId) => api.delete(`/endorsement-component-templates/${templateId}`);

// Compliance
export const getComplianceStats = () => api.get('/compliance/stats');
export const getComplianceRules = (params = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  if (params.state) query.append('state', params.state);
  if (params.product) query.append('product', params.product);
  if (params.search) query.append('search', params.search);
  if (params.status) query.append('status', params.status);
  const queryStr = query.toString();
  return api.get(`/compliance/rules${queryStr ? `?${queryStr}` : ''}`);
};
export const getComplianceRule = (code) => api.get(`/compliance/rules/${encodeURIComponent(code)}`);

// UW Guide
export const getConflictRules = (params = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  if (params.severity) query.append('severity', params.severity);
  if (params.source) query.append('source', params.source);
  const queryStr = query.toString();
  return api.get(`/uw-guide/conflict-rules${queryStr ? `?${queryStr}` : ''}`);
};
export const getMarketNews = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.category) query.append('category', params.category);
  if (params.limit) query.append('limit', params.limit);
  const queryStr = query.toString();
  return api.get(`/uw-guide/market-news${queryStr ? `?${queryStr}` : ''}`);
};
export const createMarketNews = (data) => api.post('/uw-guide/market-news', data);
export const deleteMarketNews = (id) => api.delete(`/uw-guide/market-news/${id}`);

// Brokers (brkr_* schema)
// Organizations
export const getBrkrOrganizations = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.org_type) query.append('org_type', params.org_type);
  const queryStr = query.toString();
  return api.get(`/brkr/organizations${queryStr ? `?${queryStr}` : ''}`);
};
export const createBrkrOrganization = (data) => api.post('/brkr/organizations', data);
export const updateBrkrOrganization = (orgId, data) => api.patch(`/brkr/organizations/${orgId}`, data);

// Offices
export const getBrkrOffices = (params = {}) => {
  const query = new URLSearchParams();
  if (params.org_id) query.append('org_id', params.org_id);
  if (params.search) query.append('search', params.search);
  const queryStr = query.toString();
  return api.get(`/brkr/offices${queryStr ? `?${queryStr}` : ''}`);
};
export const createBrkrOffice = (data) => api.post('/brkr/offices', data);
export const updateBrkrOffice = (officeId, data) => api.patch(`/brkr/offices/${officeId}`, data);

// People
export const getBrkrPeople = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.org_id) query.append('org_id', params.org_id);
  const queryStr = query.toString();
  return api.get(`/brkr/people${queryStr ? `?${queryStr}` : ''}`);
};
export const createBrkrPerson = (data) => api.post('/brkr/people', data);
export const updateBrkrPerson = (personId, data) => api.patch(`/brkr/people/${personId}`, data);

// Employments
export const getBrkrEmployments = (params = {}) => {
  const query = new URLSearchParams();
  if (params.org_id) query.append('org_id', params.org_id);
  if (params.office_id) query.append('office_id', params.office_id);
  if (params.active_only !== undefined) query.append('active_only', params.active_only);
  const queryStr = query.toString();
  return api.get(`/brkr/employments${queryStr ? `?${queryStr}` : ''}`);
};
export const createBrkrEmployment = (data) => api.post('/brkr/employments', data);
export const updateBrkrEmployment = (employmentId, data) => api.patch(`/brkr/employments/${employmentId}`, data);

// Teams
export const getBrkrTeams = (params = {}) => {
  const query = new URLSearchParams();
  if (params.org_id) query.append('org_id', params.org_id);
  if (params.search) query.append('search', params.search);
  const queryStr = query.toString();
  return api.get(`/brkr/teams${queryStr ? `?${queryStr}` : ''}`);
};
export const createBrkrTeam = (data) => api.post('/brkr/teams', data);
export const getBrkrTeamMembers = (teamId) => api.get(`/brkr/teams/${teamId}/members`);
export const addBrkrTeamMember = (teamId, data) => api.post(`/brkr/teams/${teamId}/members`, data);

// DBAs
export const getBrkrDbas = (orgId = null) => {
  const params = orgId ? `?org_id=${orgId}` : '';
  return api.get(`/brkr/dbas${params}`);
};
export const createBrkrDba = (data) => api.post('/brkr/dbas', data);

// Addresses
export const getBrkrAddresses = (orgId = null) => {
  const params = orgId ? `?org_id=${orgId}` : '';
  return api.get(`/brkr/addresses${params}`);
};
export const createBrkrAddress = (data) => api.post('/brkr/addresses', data);

// Account Dashboard
export const getSubmissionStatusCounts = (days = 30) => api.get(`/dashboard/submission-status-counts?days=${days}`);
export const getDashboardSubmissions = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.status) query.append('status', params.status);
  if (params.outcome) query.append('outcome', params.outcome);
  if (params.limit) query.append('limit', params.limit);
  const queryStr = query.toString();
  return api.get(`/dashboard/recent-submissions${queryStr ? `?${queryStr}` : ''}`);
};
export const getAccountsList = (params = {}) => {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);
  const queryStr = query.toString();
  return api.get(`/accounts${queryStr ? `?${queryStr}` : ''}`);
};
export const getRecentAccounts = (limit = 10) => api.get(`/accounts/recent?limit=${limit}`);
export const getAccountDetails = (accountId) => api.get(`/accounts/${accountId}`);
export const getAccountWrittenPremium = (accountId) => api.get(`/accounts/${accountId}/written-premium`);
export const getAccountSubmissions = (accountId) => api.get(`/accounts/${accountId}/submissions`);

// Coverage Catalog
export const getCoverageCatalogStats = () => api.get('/coverage-catalog/stats');
export const getCoverageStandardTags = () => api.get('/coverage-catalog/tags');
export const getCoveragePendingReviews = () => api.get('/coverage-catalog/pending');
export const getCoverageCarriers = () => api.get('/coverage-catalog/carriers');
export const getCoverageByCarrier = (carrierName, approvedOnly = false) =>
  api.get(`/coverage-catalog/carrier/${encodeURIComponent(carrierName)}?approved_only=${approvedOnly}`);
export const lookupCoverageMapping = (carrierName, coverageOriginal) =>
  api.get(`/coverage-catalog/lookup?carrier_name=${encodeURIComponent(carrierName)}&coverage_original=${encodeURIComponent(coverageOriginal)}`);
export const approveCoverageMapping = (id) => api.post(`/coverage-catalog/${id}/approve`);
export const rejectCoverageMapping = (id) => api.post(`/coverage-catalog/${id}/reject`);
export const resetCoverageMapping = (id) => api.post(`/coverage-catalog/${id}/reset`);
export const updateCoverageTags = (id, tags) => api.patch(`/coverage-catalog/${id}/tags`, { coverage_normalized: tags });
export const deleteCoverageMapping = (id) => api.delete(`/coverage-catalog/${id}`);
export const deleteRejectedCoverages = () => api.delete('/coverage-catalog/rejected');
export const explainCoverageClassification = (id) => api.post(`/coverage-catalog/${id}/explain`);

// Document Library
export const getDocumentLibraryEntries = (params = {}) => {
  const query = new URLSearchParams();
  if (params.document_type) query.append('document_type', params.document_type);
  if (params.category) query.append('category', params.category);
  if (params.position) query.append('position', params.position);
  if (params.status) query.append('status', params.status);
  if (params.search) query.append('search', params.search);
  if (params.include_archived) query.append('include_archived', params.include_archived);
  const queryStr = query.toString();
  return api.get(`/document-library${queryStr ? `?${queryStr}` : ''}`);
};
export const getDocumentLibraryCategories = () => api.get('/document-library/categories');
export const getDocumentLibraryEntry = (entryId) => api.get(`/document-library/${entryId}`);
export const createDocumentLibraryEntry = (data) => api.post('/document-library', data);
export const updateDocumentLibraryEntry = (entryId, data) => api.patch(`/document-library/${entryId}`, data);
export const activateDocumentLibraryEntry = (entryId) => api.post(`/document-library/${entryId}/activate`);
export const archiveDocumentLibraryEntry = (entryId) => api.post(`/document-library/${entryId}/archive`);

// Policy Form Catalog
export const getPolicyFormCatalog = (params = {}) => {
  const query = new URLSearchParams();
  if (params.carrier) query.append('carrier', params.carrier);
  if (params.form_type) query.append('form_type', params.form_type);
  if (params.search) query.append('search', params.search);
  const queryStr = query.toString();
  return api.get(`/policy-form-catalog${queryStr ? `?${queryStr}` : ''}`);
};
export const getPolicyForm = (formId) => api.get(`/policy-form-catalog/${formId}`);
export const lookupPolicyForm = (formNumber, carrier = null) => {
  const params = new URLSearchParams({ form_number: formNumber });
  if (carrier) params.append('carrier', carrier);
  return api.get(`/policy-form-catalog/lookup?${params.toString()}`);
};
export const getFormExtractionQueue = (status = null) => {
  const params = status ? `?status=${status}` : '';
  return api.get(`/policy-form-catalog/queue${params}`);
};

export const resyncFormCoverages = (formId) => api.post(`/policy-form-catalog/${formId}/resync-coverages`);

export default api;
