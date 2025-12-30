import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSubmission } from '../api/client';

const tabs = [
  { name: 'Account', path: 'account' },
  { name: 'Review', path: 'review' },
  { name: 'UW', path: 'uw' },
  { name: 'Comps', path: 'comps' },
  { name: 'Rating', path: 'rating' },
  { name: 'Quote', path: 'quote' },
  { name: 'Policy', path: 'policy' },
];

export default function SubmissionLayout() {
  const { submissionId } = useParams();

  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg font-bold text-gray-900 hover:text-gray-700">
              Underwriting Portal
            </Link>
            <span className="text-gray-300">›</span>
            <span className="text-gray-600">{submission?.applicant_name || 'Loading...'}</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link to="/" className="nav-link">Submissions</Link>
            <span className="nav-link">Statistics</span>
            <span className="nav-link">Settings</span>
          </nav>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `tab-link ${isActive ? 'tab-link-active' : 'tab-link-inactive'}`
                }
              >
                {tab.name}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
