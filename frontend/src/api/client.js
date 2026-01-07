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

// Brokers
export const getBrokers = () => api.get('/brokers');
export const getBrokerContacts = () => api.get('/broker-contacts');
export const createBroker = (data) => api.post('/brokers', data);
export const createBrokerContact = (data) => api.post('/broker-contacts', data);

// Credibility & Conflicts
export const getCredibility = (submissionId) => api.get(`/submissions/${submissionId}/credibility`);
export const getConflicts = (submissionId) => api.get(`/submissions/${submissionId}/conflicts`);
export const resolveConflict = (submissionId, conflictId, data) =>
  api.post(`/submissions/${submissionId}/conflicts/${conflictId}/resolve`, data);

// Field Verifications (SetupPage HITL workflow)
export const getFieldVerifications = (submissionId) =>
  api.get(`/submissions/${submissionId}/verifications`);
export const updateFieldVerification = (submissionId, fieldName, data) =>
  api.patch(`/submissions/${submissionId}/verifications/${fieldName}`, data);

// Extractions
export const getExtractions = (submissionId) => api.get(`/submissions/${submissionId}/extractions`);
export const triggerExtraction = (submissionId, documentId = null) =>
  api.post(`/submissions/${submissionId}/extract`, { document_id: documentId });
export const correctExtraction = (extractionId, correctedValue, reason = null) =>
  api.post(`/extractions/${extractionId}/correct`, { corrected_value: correctedValue, reason });
export const acceptExtraction = (extractionId) =>
  api.post(`/extractions/${extractionId}/accept`);
export const unacceptExtraction = (extractionId) =>
  api.post(`/extractions/${extractionId}/unaccept`);
export const triggerTextractExtraction = (submissionId, documentId = null) =>
  api.post(`/submissions/${submissionId}/extract-textract`, { document_id: documentId });

// Feedback tracking
export const saveFeedback = (submissionId, feedback) =>
  api.post(`/submissions/${submissionId}/feedback`, feedback);
export const getSubmissionFeedback = (submissionId) =>
  api.get(`/submissions/${submissionId}/feedback`);
export const getFeedbackAnalytics = () => api.get('/feedback/analytics');

// Loss History
export const getLossHistory = (submissionId) =>
  api.get(`/submissions/${submissionId}/loss-history`);
export const updateClaimNotes = (claimId, notes) =>
  api.patch(`/claims/${claimId}/notes`, notes);

// AI Corrections Review
export const getAiCorrections = (submissionId) =>
  api.get(`/submissions/${submissionId}/ai-corrections`);
export const acceptAiCorrection = (correctionId, editedValue = null) =>
  api.post(`/corrections/${correctionId}/accept`, { edited_value: editedValue });
export const rejectAiCorrection = (correctionId) =>
  api.post(`/corrections/${correctionId}/reject`);

// AI Research Tasks (flagged items for AI to investigate)
export const createAiResearchTask = (submissionId, taskType, flagType, uwContext = null, originalValue = null) =>
  api.post(`/submissions/${submissionId}/ai-research-tasks`, {
    task_type: taskType,
    flag_type: flagType,
    uw_context: uwContext,
    original_value: originalValue,
  });
export const getAiResearchTasks = (submissionId) =>
  api.get(`/submissions/${submissionId}/ai-research-tasks`);
export const getAiResearchTask = (taskId) =>
  api.get(`/ai-research-tasks/${taskId}`);
export const reviewAiResearchTask = (taskId, reviewOutcome, finalValue = null) =>
  api.post(`/ai-research-tasks/${taskId}/review`, {
    review_outcome: reviewOutcome,
    final_value: finalValue,
  });

// Extraction stats
export const getExtractionStats = (days = 30) => api.get(`/extraction/stats?days=${days}`);

// Document content (for PDF viewer)
export const getDocumentContent = (documentId) => api.get(`/documents/${documentId}/content`, { responseType: 'blob' });
export const getDocumentUrl = (documentId) => `/api/documents/${documentId}/content`;

// Document bbox data for highlighting
export const getDocumentBbox = (documentId, searchText = null, page = null) => {
  const params = new URLSearchParams();
  if (searchText) params.append('search_text', searchText);
  if (page) params.append('page', page);
  const queryString = params.toString();
  return api.get(`/documents/${documentId}/bbox${queryString ? '?' + queryString : ''}`);
};

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
export const getBindValidation = (id) => api.get(`/quotes/${id}/bind-validation`);
export const getBindReadiness = (submissionId) => api.get(`/submissions/${submissionId}/bind-readiness`);
export const bindQuoteOption = (id, force = false) => api.post(`/quotes/${id}/bind`, { force });
export const unbindQuoteOption = (id, reason, performedBy = 'frontend_user') =>
  api.post(`/quotes/${id}/unbind`, { reason, performed_by: performedBy });

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
export const getRenewalComparison = (submissionId) => api.get(`/submissions/${submissionId}/renewal-comparison`);
export const getRenewalPricing = (submissionId) => api.get(`/submissions/${submissionId}/renewal-pricing`);
export const getDecisionHistory = (submissionId) => api.get(`/submissions/${submissionId}/decision-history`);
export const getRenewalQueue = () => api.get('/renewals/queue');
export const createRenewalExpectation = (submissionId) => api.post(`/renewals/${submissionId}/create-expectation`);
export const markRenewalReceived = (submissionId) => api.post(`/renewals/${submissionId}/mark-received`);
export const markRenewalNotReceived = (submissionId, reason = '') =>
  api.post(`/renewals/${submissionId}/mark-not-received?reason=${encodeURIComponent(reason)}`);

// Expiring Tower (Incumbent Coverage)
export const getExpiringTower = (submissionId) =>
  api.get(`/submissions/${submissionId}/expiring-tower`);
export const saveExpiringTower = (submissionId, data) =>
  api.post(`/submissions/${submissionId}/expiring-tower`, data);
export const updateExpiringTower = (submissionId, data) =>
  api.patch(`/submissions/${submissionId}/expiring-tower`, data);
export const deleteExpiringTower = (submissionId) =>
  api.delete(`/submissions/${submissionId}/expiring-tower`);
export const getTowerComparison = (submissionId) =>
  api.get(`/submissions/${submissionId}/tower-comparison`);
export const captureExpiringTower = (submissionId, priorSubmissionId) =>
  api.post(`/submissions/${submissionId}/capture-expiring-tower?prior_submission_id=${priorSubmissionId}`);
export const getIncumbentAnalytics = () =>
  api.get('/admin/incumbent-analytics');

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

// Conflict Rules CRUD
export const getConflictRule = (ruleId) => api.get(`/conflict-rules/${ruleId}`);
export const createConflictRule = (data) => api.post('/conflict-rules', data);
export const updateConflictRule = (ruleId, data) => api.patch(`/conflict-rules/${ruleId}`, data);
export const deleteConflictRule = (ruleId) => api.delete(`/conflict-rules/${ruleId}`);

// Supplemental Questions
export const getSupplementalQuestions = (category = null) => {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return api.get(`/supplemental-questions${params}`);
};
export const getQuestionCategories = () => api.get('/supplemental-questions/categories');
export const getSubmissionAnswers = (submissionId) =>
  api.get(`/submissions/${submissionId}/answers`);
export const saveSubmissionAnswers = (submissionId, answers, answeredBy = 'frontend') =>
  api.post(`/submissions/${submissionId}/answers`, { answers, answered_by: answeredBy });
export const saveSubmissionAnswer = (submissionId, questionId, answerValue, answeredBy = 'frontend') =>
  api.post(`/submissions/${submissionId}/answers`, {
    question_id: questionId,
    answer_value: answerValue,
    answered_by: answeredBy,
  });
export const getAnswerProgress = (submissionId) =>
  api.get(`/submissions/${submissionId}/answers/progress`);
export const getUnansweredQuestions = (submissionId, category = null) => {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return api.get(`/submissions/${submissionId}/answers/unanswered${params}`);
};
export const deleteSubmissionAnswer = (submissionId, questionId) =>
  api.delete(`/submissions/${submissionId}/answers/${questionId}`);

// Credibility Score Breakdown
export const getCredibilityBreakdown = (submissionId) =>
  api.get(`/submissions/${submissionId}/credibility-breakdown`);

// UW Guide - Comprehensive Reference Data
export const getUWAppetite = (params = {}) => {
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  if (params.hazard_class) query.append('hazard_class', params.hazard_class);
  const queryStr = query.toString();
  return api.get(`/uw-guide/appetite${queryStr ? `?${queryStr}` : ''}`);
};

export const getUWMandatoryControls = (params = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  const queryStr = query.toString();
  return api.get(`/uw-guide/mandatory-controls${queryStr ? `?${queryStr}` : ''}`);
};

export const getUWDeclinationRules = (params = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  const queryStr = query.toString();
  return api.get(`/uw-guide/declination-rules${queryStr ? `?${queryStr}` : ''}`);
};

export const getUWReferralTriggers = (params = {}) => {
  const query = new URLSearchParams();
  if (params.category) query.append('category', params.category);
  const queryStr = query.toString();
  return api.get(`/uw-guide/referral-triggers${queryStr ? `?${queryStr}` : ''}`);
};

export const getUWPricingGuidelines = (params = {}) => {
  const query = new URLSearchParams();
  if (params.hazard_class) query.append('hazard_class', params.hazard_class);
  const queryStr = query.toString();
  return api.get(`/uw-guide/pricing-guidelines${queryStr ? `?${queryStr}` : ''}`);
};

export const getUWGeographicRestrictions = (params = {}) => {
  const query = new URLSearchParams();
  if (params.restriction_type) query.append('restriction_type', params.restriction_type);
  const queryStr = query.toString();
  return api.get(`/uw-guide/geographic-restrictions${queryStr ? `?${queryStr}` : ''}`);
};

// UW Guide CRUD Operations
export const createUWAppetite = (data) => api.post('/uw-guide/appetite', data);
export const updateUWAppetite = (id, data) => api.patch(`/uw-guide/appetite/${id}`, data);
export const deleteUWAppetite = (id) => api.delete(`/uw-guide/appetite/${id}`);

export const createUWControl = (data) => api.post('/uw-guide/mandatory-controls', data);
export const updateUWControl = (id, data) => api.patch(`/uw-guide/mandatory-controls/${id}`, data);
export const deleteUWControl = (id) => api.delete(`/uw-guide/mandatory-controls/${id}`);

export const createUWDeclinationRule = (data) => api.post('/uw-guide/declination-rules', data);
export const updateUWDeclinationRule = (id, data) => api.patch(`/uw-guide/declination-rules/${id}`, data);
export const deleteUWDeclinationRule = (id) => api.delete(`/uw-guide/declination-rules/${id}`);

export const createUWReferralTrigger = (data) => api.post('/uw-guide/referral-triggers', data);
export const updateUWReferralTrigger = (id, data) => api.patch(`/uw-guide/referral-triggers/${id}`, data);
export const deleteUWReferralTrigger = (id) => api.delete(`/uw-guide/referral-triggers/${id}`);

export const createUWPricingGuideline = (data) => api.post('/uw-guide/pricing-guidelines', data);
export const updateUWPricingGuideline = (id, data) => api.patch(`/uw-guide/pricing-guidelines/${id}`, data);
export const deleteUWPricingGuideline = (id) => api.delete(`/uw-guide/pricing-guidelines/${id}`);

export const createUWGeoRestriction = (data) => api.post('/uw-guide/geographic-restrictions', data);
export const updateUWGeoRestriction = (id, data) => api.patch(`/uw-guide/geographic-restrictions/${id}`, data);
export const deleteUWGeoRestriction = (id) => api.delete(`/uw-guide/geographic-restrictions/${id}`);

// UW Drift Review & Decision Logging
export const getDriftReviewQueue = () => api.get('/uw-guide/drift-review');
export const getDriftPatterns = () => api.get('/uw-guide/drift-patterns');
export const getSimilarPatterns = (params = {}) => {
  const query = new URLSearchParams();
  if (params.industry) query.append('industry', params.industry);
  if (params.hazard_class) query.append('hazard_class', params.hazard_class);
  if (params.revenue_band) query.append('revenue_band', params.revenue_band);
  const queryStr = query.toString();
  return api.get(`/uw-guide/similar-patterns${queryStr ? `?${queryStr}` : ''}`);
};
export const getDecisionLog = (submissionId) => api.get(`/decision-log/${submissionId}`);
export const recordUWDecision = (logId, data) => api.post(`/decision-log/${logId}/record`, data);
export const getRuleAmendments = (status = null) => {
  const params = status ? `?status=${status}` : '';
  return api.get(`/rule-amendments${params}`);
};
export const createRuleAmendment = (data) => api.post('/rule-amendments', data);
export const reviewRuleAmendment = (amendmentId, data) => api.post(`/rule-amendments/${amendmentId}/review`, data);

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

// Extraction Schemas
export const getSchemas = () => api.get('/schemas');
export const getActiveSchema = () => api.get('/schemas/active');
export const getSchema = (schemaId) => api.get(`/schemas/${schemaId}`);
export const createSchema = (data) => api.post('/schemas', data);
export const updateSchema = (schemaId, data) => api.patch(`/schemas/${schemaId}`, data);
export const addSchemaField = (schemaId, category, fieldKey, fieldDef) =>
  api.post(`/schemas/${schemaId}/fields`, { category, field_key: fieldKey, field_def: fieldDef });
export const removeSchemaField = (schemaId, fieldKey) =>
  api.delete(`/schemas/${schemaId}/fields/${fieldKey}`);
export const getSchemaRecommendations = (status = 'pending') =>
  api.get(`/schemas/recommendations?status=${status}`);
export const actionSchemaRecommendation = (recId, action, notes = null) =>
  api.post(`/schemas/recommendations/${recId}`, { action, notes });

// Field Importance Settings
export const getActiveImportanceSettings = () => api.get('/extraction-schema/importance');
export const getImportanceVersions = () => api.get('/extraction-schema/importance-versions');
export const createImportanceVersion = (data) => api.post('/extraction-schema/importance-versions', data);
export const updateFieldImportance = (versionId, fieldKey, importance, rationale = null) =>
  api.put(`/extraction-schema/importance-versions/${versionId}/fields`, { field_key: fieldKey, importance, rationale });
export const activateImportanceVersion = (versionId) =>
  api.post(`/extraction-schema/importance-versions/${versionId}/activate`);

// Collaborative Workflow
export const getWorkflowStages = () => api.get('/workflow/stages');
export const getWorkflowQueue = (userName = null) =>
  api.get('/workflow/queue', { params: { user_name: userName } });
export const getWorkflowSummary = () => api.get('/workflow/summary');
export const getMyWork = (userName) =>
  api.get('/workflow/my-work', { params: { user_name: userName } });
export const getSubmissionWorkflow = (submissionId) =>
  api.get(`/workflow/${submissionId}`);
export const getWorkflowHistory = (submissionId) =>
  api.get(`/workflow/${submissionId}/history`);
export const startPrescreen = (submissionId) =>
  api.post(`/workflow/${submissionId}/start-prescreen`);
export const recordVote = (submissionId, vote) =>
  api.post(`/workflow/${submissionId}/vote`, vote);
export const addWorkflowComment = (submissionId, userName, comment) =>
  api.post(`/workflow/${submissionId}/comment`, { user_name: userName, comment });
export const claimSubmission = (submissionId, userName) =>
  api.post(`/workflow/${submissionId}/claim`, { user_name: userName });
export const unclaimSubmission = (submissionId, userName) =>
  api.post(`/workflow/${submissionId}/unclaim`, { user_name: userName });
export const submitForReview = (submissionId, recommendation) =>
  api.post(`/workflow/${submissionId}/submit-for-review`, recommendation);
export const getUwRecommendation = (submissionId) =>
  api.get(`/workflow/${submissionId}/recommendation`);
export const getWorkflowNotifications = (userName, unreadOnly = false) =>
  api.get('/workflow/notifications', { params: { user_name: userName, unread_only: unreadOnly } });
export const markNotificationRead = (notificationId) =>
  api.post(`/workflow/notifications/${notificationId}/read`);
export const markAllNotificationsRead = (userName) =>
  api.post('/workflow/notifications/read-all', null, { params: { user_name: userName } });

// Underwriter Assignment (submission-level)
export const assignSubmission = (submissionId, assignedTo, assignedBy, reason = 'assigned') =>
  api.post(`/submissions/${submissionId}/assign`, { assigned_to: assignedTo, assigned_by: assignedBy, reason });
export const unassignSubmission = (submissionId, unassignedBy, reason = 'released') =>
  api.post(`/submissions/${submissionId}/unassign`, { unassigned_by: unassignedBy, reason });
export const getAssignmentHistory = (submissionId) =>
  api.get(`/submissions/${submissionId}/assignment-history`);
export const getAssignmentWorkload = () =>
  api.get('/assignment-workload');

// Pending Declines
export const getPendingDeclines = () =>
  api.get('/pending-declines');
export const getPendingDecline = (declineId) =>
  api.get(`/pending-declines/${declineId}`);
export const updatePendingDecline = (declineId, data) =>
  api.patch(`/pending-declines/${declineId}`, data);
export const sendDecline = (declineId, userName) =>
  api.post(`/pending-declines/${declineId}/send`, { user_name: userName });
export const cancelPendingDecline = (declineId, userName) =>
  api.post(`/pending-declines/${declineId}/cancel`, null, { params: { user_name: userName } });

// Submission Controls (security controls tracking) - LEGACY, use Extracted Values instead
export const getSubmissionControls = (submissionId) =>
  api.get(`/submissions/${submissionId}/controls`);
export const getControlsNeedingInfo = (submissionId) =>
  api.get(`/submissions/${submissionId}/controls/needing-info`);
export const updateControl = (submissionId, controlId, data) =>
  api.patch(`/submissions/${submissionId}/controls/${controlId}`, data);
export const parseBrokerResponse = (submissionId, data) =>
  api.post(`/submissions/${submissionId}/controls/parse-response`, data);
export const applyControlUpdates = (submissionId, data) =>
  api.post(`/submissions/${submissionId}/controls/apply-updates`, data);
export const getControlHistory = (submissionId, controlId) =>
  api.get(`/submissions/${submissionId}/controls/${controlId}/history`);

// Extracted Values (Phase 1.9 - unified data model)
export const getExtractedValues = (submissionId) =>
  api.get(`/submissions/${submissionId}/extracted-values`);
export const getExtractedValuesNeedingConfirmation = (submissionId) =>
  api.get(`/submissions/${submissionId}/extracted-values/needing-confirmation`);
export const updateExtractedValue = (submissionId, fieldKey, data) =>
  api.patch(`/submissions/${submissionId}/extracted-values/${fieldKey}`, data);

// AI Agent
export const agentChat = (submissionId, message, context = {}, conversationHistory = []) =>
  api.post(`/agent/chat`, {
    submission_id: submissionId,
    message,
    context,
    conversation_history: conversationHistory,
  });

export const agentAction = (submissionId, action, context = {}, params = {}) =>
  api.post(`/agent/action`, {
    submission_id: submissionId,
    action,
    context,
    params,
  });

export const agentConfirm = (submissionId, actionId, confirmed = true) =>
  api.post(`/agent/confirm`, {
    submission_id: submissionId,
    action_id: actionId,
    confirmed,
  });

export const getAgentCapabilities = () => api.get('/agent/capabilities');

export const submitFeatureRequest = (description, useCase = null, submissionId = null) =>
  api.post('/agent/feature-requests', {
    description,
    use_case: useCase,
    submission_id: submissionId,
  });

// Remarket Detection (Prior Submission Linking)
export const findPriorSubmissions = (submissionId) =>
  api.get(`/submissions/${submissionId}/prior-submissions`);

export const linkPriorSubmission = (submissionId, priorSubmissionId, options = {}) =>
  api.post(`/submissions/${submissionId}/link-prior`, {
    prior_submission_id: priorSubmissionId,
    import_extracted_values: options.importExtractedValues ?? true,
    import_uw_notes: options.importUwNotes ?? true,
  });

export const unlinkPriorSubmission = (submissionId) =>
  api.delete(`/submissions/${submissionId}/prior-link`);

export const getRemarketStatus = (submissionId) =>
  api.get(`/submissions/${submissionId}/remarket-status`);

// Remarket Analytics
export const getRemarketAnalytics = () => api.get('/analytics/remarket');

// Policy Issuance
export const getIssuanceStatus = (submissionId) =>
  api.get(`/submissions/${submissionId}/issuance-status`);

export const issuePolicy = (submissionId) =>
  api.post(`/submissions/${submissionId}/issue-policy`);

// Admin: Pending Subjectivities
export const getAdminPendingSubjectivities = (filter = 'all', limit = 100) =>
  api.get(`/admin/pending-subjectivities?filter=${filter}&limit=${limit}`);

export const setSubjectivityCritical = (subjectivityId, isCritical) =>
  api.patch(`/subjectivities/${subjectivityId}/critical`, null, {
    params: { is_critical: isCritical },
  });

export default api;
