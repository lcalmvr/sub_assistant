# Storage Fallback Tests

**Priority:** Low
**Added:** 2025-01-24
**Context:** Peer review of storage extraction fixes

## Background

The extraction endpoints now have fallback logic: try storage download first, fall back to local `file_path` if storage fails. This path is untested.

## Endpoints to Test

- `POST /api/submissions/{id}/extract-integrated` (api/main.py:902)
- `POST /api/submissions/{id}/extract` (api/main.py:1523)
- `POST /api/submissions/{id}/extract-textract` (api/main.py:1776)
- `POST /api/schemas/analyze-document/{id}` (api/main.py:9227)

## Test Scenarios

1. **Storage configured, download succeeds** - normal path
2. **Storage configured, download fails** - should fall back to file_path
3. **Storage not configured** - should use file_path directly
4. **Neither storage nor file_path available** - should return 400

## Implementation Notes

Requires mocking:
- `storage.is_configured()`
- `storage.download_document()` (to simulate failure)
- Test fixtures with both `storage_key` and `file_path` in doc_metadata

## Related Commits

- `18e1d1d` - fix: add graceful fallback when storage download fails
