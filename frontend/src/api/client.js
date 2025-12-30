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

// Quote Options
export const getQuoteOptions = (submissionId) => api.get(`/submissions/${submissionId}/quotes`);
export const getQuoteOption = (id) => api.get(`/quotes/${id}`);
export const getQuoteDocuments = (id) => api.get(`/quotes/${id}/documents`);
export const createQuoteOption = (submissionId, data) => api.post(`/submissions/${submissionId}/quotes`, data);
export const updateQuoteOption = (id, data) => api.patch(`/quotes/${id}`, data);
export const deleteQuoteOption = (id) => api.delete(`/quotes/${id}`);
export const cloneQuoteOption = (id) => api.post(`/quotes/${id}/clone`);
export const bindQuoteOption = (id) => api.post(`/quotes/${id}/bind`);
export const unbindQuoteOption = (id) => api.post(`/quotes/${id}/unbind`);

// Documents
export const generateQuoteDocument = (quoteId) => api.post(`/quotes/${quoteId}/generate-document`);
export const generateBinderDocument = (quoteId) => api.post(`/quotes/${quoteId}/generate-binder`);
export const generatePolicyDocument = (quoteId) => api.post(`/quotes/${quoteId}/generate-policy`);

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

export default api;
