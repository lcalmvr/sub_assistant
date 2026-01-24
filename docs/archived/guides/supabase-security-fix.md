# Supabase Security Warnings - Fix Guide

This guide addresses all 20 RLS errors and 4 security warnings from your Supabase database linter.

## 📋 Summary of Issues

### RLS Errors (20 tables)
- ❌ 20 tables in `public` schema have RLS disabled
- Risk: Tables exposed via PostgREST API without access control

### Security Warnings (4 items)
1. ⚠️ `match_guidelines` function - mutable search_path
2. ⚠️ `update_loss_history_updated_at` function - mutable search_path
3. ⚠️ `vector` extension in public schema
4. ⚠️ PostgreSQL version needs security patches

## 🚀 Step-by-Step Fix

### Step 1: Enable RLS on All Tables (CRITICAL)

**File:** `enable_rls_all_tables.sql`

**What it does:**
- Enables Row Level Security on all 20 tables
- Creates permissive policies allowing service role full access
- Won't break your app (service role bypasses RLS automatically)

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste contents of `enable_rls_all_tables.sql`
3. Click **Run**
4. Verify with:
   ```sql
   SELECT schemaname, tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```
   All 20 tables should show `rowsecurity = true`

**Tables covered (20):**
- submissions
- documents
- brkr_organizations
- brkr_offices
- rag_metrics
- brkr_people
- brkr_employments
- brkr_teams
- brkr_team_offices
- brkr_org_addresses
- brkr_dba_names
- brkr_team_memberships
- submission_feedback
- processed_messages
- quotes
- insured_entities
- proto_layer_programs
- guideline_chunks
- loss_history
- brkr_paper_companies

---

### Step 2: Fix Function Security Warnings (RECOMMENDED)

**File:** `fix_function_security_warnings.sql`

**What it does:**
- Sets explicit `search_path` on functions to prevent search path hijacking
- Fixes 2 function security warnings

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste contents of `fix_function_security_warnings.sql`
3. Click **Run**

**Functions fixed:**
- `match_guidelines` - vector similarity search function
- `update_loss_history_updated_at` - trigger function for timestamps

---

### Step 3: Move Vector Extension (OPTIONAL)

**Warning:** `vector` extension in public schema

**Fix:**
```sql
-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move vector extension to extensions schema
ALTER EXTENSION vector SET SCHEMA extensions;

-- Update search_path to include extensions schema
ALTER DATABASE postgres SET search_path TO public, extensions;
```

**Note:** This may require updating function definitions that use vector types. **Only do this if you're comfortable with schema management.**

---

### Step 4: Upgrade PostgreSQL (RECOMMENDED)

**Warning:** `supabase-postgres-17.4.1.064` has security patches available

**Fix:**
1. Go to Supabase Dashboard → Settings → Infrastructure
2. Click **Upgrade** to latest PostgreSQL version
3. Schedule maintenance window
4. Follow upgrade prompts

**Reference:** https://supabase.com/docs/guides/platform/upgrading

---

## ✅ Post-Fix Verification

After running the scripts, verify all warnings are resolved:

1. Go to Supabase Dashboard → **Database** → **Linter**
2. All RLS errors should be gone ✅
3. Function warnings should be gone ✅

## ⚠️ Important Notes

### Will this break my app?
**No.** Your app will continue working exactly as before because:
- You use `SUPABASE_SERVICE_ROLE` which automatically bypasses RLS
- Direct PostgreSQL connections use `postgres` superuser which bypasses RLS
- The policies are permissive (`USING (true)`) for all operations

### Why enable RLS if it's bypassed?
- Satisfies Supabase security requirements
- Protects against accidental API exposure
- Best practice for future-proofing
- Required if you ever add user authentication

### What if I get errors?
If any table doesn't exist, you'll see an error like:
```
ERROR: relation "public.table_name" does not exist
```

Simply comment out that section and continue. The script is idempotent - you can run it multiple times safely.

## 📞 Support

If you encounter issues:
1. Check the Supabase logs for specific error messages
2. Verify you're using the service role key (not anon key)
3. Ensure your Streamlit app has `SUPABASE_SERVICE_ROLE` in secrets

## 🎯 Expected Outcome

After completing Steps 1 and 2:
- ✅ 20 RLS errors → 0 errors
- ✅ 2 function warnings → 0 warnings
- ✅ App continues working normally
- ✅ Database is more secure
