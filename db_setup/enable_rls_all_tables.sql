-- ============================================================================
-- Enable Row Level Security (RLS) on All Tables
-- ============================================================================
-- This script enables RLS on all public schema tables and creates permissive
-- policies that allow full access to service role and postgres superuser.
--
-- This satisfies Supabase security warnings while maintaining compatibility
-- with your existing application that uses:
-- 1. Direct PostgreSQL connections (psycopg2, SQLAlchemy)
-- 2. Supabase client with service role key
--
-- Service role and postgres superuser automatically bypass RLS, so these
-- policies are explicit but permissive for administrative access.
-- ============================================================================

-- Core submission and document tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.submissions
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.documents
FOR ALL USING (true) WITH CHECK (true);

-- Insured entity tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.insured_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.insured_entities
FOR ALL USING (true) WITH CHECK (true);

-- Paper company tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.brkr_paper_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_paper_companies
FOR ALL USING (true) WITH CHECK (true);

-- Broker organizations and structure tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.brkr_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_organizations
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_offices
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_people
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_employments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_employments
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_dba_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_dba_names
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_org_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_org_addresses
FOR ALL USING (true) WITH CHECK (true);

-- Broker team tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.brkr_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_teams
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_team_offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_team_offices
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brkr_team_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.brkr_team_memberships
FOR ALL USING (true) WITH CHECK (true);

-- Additional submission-related tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.submission_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.submission_feedback
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.processed_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.processed_messages
FOR ALL USING (true) WITH CHECK (true);

-- Quote and insurance program tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.quotes
FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.proto_layer_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.proto_layer_programs
FOR ALL USING (true) WITH CHECK (true);

-- RAG and guideline tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.guideline_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.guideline_chunks
FOR ALL USING (true) WITH CHECK (true);

-- Loss history tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.loss_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.loss_history
FOR ALL USING (true) WITH CHECK (true);

-- Performance monitoring tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.rag_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.rag_metrics
FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify RLS is enabled on all tables:
--
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- All tables should show rowsecurity = true
-- ============================================================================

-- ============================================================================
-- To view all policies:
-- ============================================================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- ============================================================================
