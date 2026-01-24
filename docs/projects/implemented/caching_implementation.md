# Submission Data Caching Implementation

**Date:** 2022-12-22
**Branch:** fix/policy-tab-performance
**Author:** Claude Code

## Problem

Users experienced perceived UI slowness when interacting with submissions. Every click, keystroke, or tab switch in Streamlit triggers a full script rerun, which was causing repeated database queries.

## Solution

Added `@st.cache_data(ttl=30)` caching to data loading functions, with cache invalidation on save operations.

## How It Works

### Without Caching (Before)
```
Click button → Streamlit reruns → Query DB → Render
Click tab    → Streamlit reruns → Query DB → Render
Type letter  → Streamlit reruns → Query DB → Render
```
Every interaction = database round-trip = slow

### With Caching (After)
```
Click button → Streamlit reruns → Use cached data → Render (fast)
Click tab    → Streamlit reruns → Use cached data → Render (fast)
Save button  → Update DB → Clear cache → Rerun → Query DB → Render
```
Only saves hit the database. Browsing uses cache.

## Files Modified

### pages_workflows/submissions.py

1. **Added cached data loaders:**
   ```python
   @st.cache_data(ttl=30)
   def load_submissions(where_clause: str, params: tuple) -> pd.DataFrame:

   @st.cache_data(ttl=30)
   def load_documents(submission_id: str) -> pd.DataFrame:

   @st.cache_data(ttl=30)
   def load_submission(submission_id: str) -> pd.DataFrame:

   @st.cache_data(ttl=30)
   def load_policy_tab_data(submission_id: str) -> dict:
   ```

2. **Added cache clearing helper:**
   ```python
   def clear_submission_caches():
       """Clear all submission-related caches. Call after any save operation."""
       load_submissions.clear()
       load_documents.clear()
       load_submission.clear()
       load_policy_tab_data.clear()
   ```

3. **Added `clear_submission_caches()` after all save operations:**
   - Line ~609: Policy period save
   - Line ~671: Broker assignment save
   - Line ~893: Hazard class override
   - Line ~921: Control adjustment
   - Line ~537: Document upload
   - Line ~1510: Business summary save
   - Line ~1553: Annual revenue save
   - Line ~1607: Cyber exposures save
   - Line ~1651: NIST controls summary save
   - Line ~1695: Bullet point summary save

4. **Changed `params` from list to tuple** for `load_submissions()` calls (required for caching - lists aren't hashable):
   - `pages_workflows/submissions.py` line ~698-701
   - `pages_components/similar_submissions_panel.py` line ~50

## Potential Issues

### 1. Stale Data After Save
**Symptom:** After saving, UI shows old values
**Cause:** `clear_submission_caches()` not called after a save operation
**Fix:** Find the save operation and add `clear_submission_caches()` after the commit

### 2. Data Not Refreshing
**Symptom:** Changes made by another user or process don't appear
**Cause:** Cache TTL is 30 seconds
**Fix:** Wait 30 seconds, or manually call `st.cache_data.clear()` to clear all caches

### 3. TypeError: unhashable type 'list'
**Symptom:** Error when calling `load_submissions()`
**Cause:** Passing a list instead of tuple for params
**Fix:** Change `params = [...]` to `params = (...)`

### 4. Missing Save Operations
If a new save operation is added in the future, remember to add `clear_submission_caches()` after it.

## How to Disable Caching (Rollback)

If caching causes issues, remove the `@st.cache_data(ttl=30)` decorators from:
- `load_submissions()`
- `load_documents()`
- `load_submission()`
- `load_policy_tab_data()`

And change `params: tuple` back to `params: list` in `load_submissions()`.

## Configuration

- **TTL (Time To Live):** 30 seconds - cache expires and refetches after this time
- **Scope:** Per-function, per-argument - `load_submission("abc")` and `load_submission("xyz")` are cached separately

To change TTL:
```python
@st.cache_data(ttl=60)  # 60 seconds instead of 30
```

To disable TTL (cache forever until cleared):
```python
@st.cache_data  # No ttl parameter
```

## Related Discussion

The original discussion also covered a "checkout/checkin" pattern for preventing two underwriters from editing the same submission simultaneously. This was NOT implemented but could be added later using:

```sql
ALTER TABLE submissions ADD COLUMN locked_by TEXT;
ALTER TABLE submissions ADD COLUMN locked_at TIMESTAMPTZ;
```

See conversation history for implementation details if needed.
