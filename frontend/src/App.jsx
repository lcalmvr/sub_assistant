import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component } from 'react';

// Error boundary for catching render errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
            <h1 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">{this.state.error?.message || 'Unknown error'}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="btn btn-primary"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Fallback for unmatched routes
function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Page Not Found</h1>
        <p className="text-gray-600 mb-6">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">Go to Submissions</Link>
      </div>
    </div>
  );
}

import SubmissionLayout from './layouts/SubmissionLayout';
import SubmissionsListPage from './pages/SubmissionsListPage';
import StatsPage from './pages/StatsPage';
import AdminPage from './pages/AdminPage';
import CompliancePage from './pages/CompliancePage';
import UWGuidePage from './pages/UWGuidePage';
import BrokersPage from './pages/BrokersPage';
import CoverageCatalogPage from './pages/CoverageCatalogPage';
import AccountDashboardPage from './pages/AccountDashboardPage';
import DocumentLibraryPage from './pages/DocumentLibraryPage';
import VoteQueuePage from './pages/VoteQueuePage';
import AccountPage from './pages/AccountPage';
import ReviewPage from './pages/ReviewPage';
import SetupPage from './pages/SetupPage';
import UWPage from './pages/UWPage';
import AnalyzePage from './pages/AnalyzePage';
import AnalyzePageV2 from './pages/AnalyzePageV2';
import CompsPage from './pages/CompsPage';
import RatingPage from './pages/RatingPage';
import QuotePage from './pages/QuotePage';
import QuotePageV2 from './pages/QuotePageV2';
import PolicyPage from './pages/PolicyPage';
import RenewalPage from './pages/RenewalPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      retry: 1,
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
          {/* Submissions List */}
          <Route path="/" element={<SubmissionsListPage />} />

          {/* Vote Queue */}
          <Route path="/vote-queue" element={<VoteQueuePage />} />

          {/* Statistics */}
          <Route path="/stats" element={<StatsPage />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminPage />} />

          {/* Compliance */}
          <Route path="/compliance" element={<CompliancePage />} />

          {/* UW Guide */}
          <Route path="/uw-guide" element={<UWGuidePage />} />

          {/* Brokers */}
          <Route path="/brokers" element={<BrokersPage />} />

          {/* Coverage Catalog */}
          <Route path="/coverage-catalog" element={<CoverageCatalogPage />} />

          {/* Account Dashboard */}
          <Route path="/accounts" element={<AccountDashboardPage />} />

          {/* Document Library */}
          <Route path="/document-library" element={<DocumentLibraryPage />} />

          {/* Individual Submission with Tabs */}
          <Route path="/submissions/:submissionId" element={<SubmissionLayout />}>
            <Route index element={<Navigate to="setup" replace />} />
            {/* Renewal summary page (conditional, only for renewals) */}
            <Route path="renewal" element={<RenewalPage />} />
            {/* Phase 1: Setup page (Account + Review merged) */}
            <Route path="setup" element={<SetupPage />} />
            {/* Phase 2: Analyze page (UW + Rating + Comps merged) */}
            <Route path="analyze" element={<AnalyzePage />} />
            {/* V2 Analyze page for A/B testing */}
            <Route path="analyze-v2" element={<AnalyzePageV2 />} />
            {/* Legacy routes redirect */}
            <Route path="account" element={<Navigate to="../setup" replace />} />
            <Route path="review" element={<Navigate to="../setup" replace />} />
            <Route path="uw" element={<Navigate to="../analyze" replace />} />
            <Route path="comps" element={<Navigate to="../analyze" replace />} />
            <Route path="rating" element={<Navigate to="../analyze" replace />} />
            {/* Quote and Policy remain unchanged */}
            <Route path="quote" element={<QuotePage />} />
            {/* V2 Quote page for testing */}
            <Route path="quote-v2" element={<QuotePageV2 />} />
            <Route path="policy" element={<PolicyPage />} />
          </Route>

          {/* Catch-all for unmatched routes */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
