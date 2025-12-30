import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SubmissionLayout from './layouts/SubmissionLayout';
import SubmissionsListPage from './pages/SubmissionsListPage';
import StatsPage from './pages/StatsPage';
import AdminPage from './pages/AdminPage';
import CompliancePage from './pages/CompliancePage';
import UWGuidePage from './pages/UWGuidePage';
import AccountPage from './pages/AccountPage';
import ReviewPage from './pages/ReviewPage';
import UWPage from './pages/UWPage';
import CompsPage from './pages/CompsPage';
import RatingPage from './pages/RatingPage';
import QuotePage from './pages/QuotePage';
import PolicyPage from './pages/PolicyPage';

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Submissions List */}
          <Route path="/" element={<SubmissionsListPage />} />

          {/* Statistics */}
          <Route path="/stats" element={<StatsPage />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminPage />} />

          {/* Compliance */}
          <Route path="/compliance" element={<CompliancePage />} />

          {/* UW Guide */}
          <Route path="/uw-guide" element={<UWGuidePage />} />

          {/* Individual Submission with Tabs */}
          <Route path="/submissions/:submissionId" element={<SubmissionLayout />}>
            <Route index element={<Navigate to="account" replace />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="uw" element={<UWPage />} />
            <Route path="comps" element={<CompsPage />} />
            <Route path="rating" element={<RatingPage />} />
            <Route path="quote" element={<QuotePage />} />
            <Route path="policy" element={<PolicyPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
