# Archive Directory

This directory contains files that are no longer part of the main workflow but are preserved for reference and historical purposes.

## Directory Structure

### `legacy_viewers/`
- `viewer_backup_20250908_155611.py` - Backup of original viewer before modular refactoring
- `viewer_with_upload_backup.py` - Earlier version with upload functionality

### `failed_modular/`
- `viewer_modular.py` - Simplified modular version that removed too much functionality
- `streamlit/` - Complete failed modular architecture (proved too simplified for production)

### `dev_scripts/`
- `replace_rating_section.py` - One-time script to replace rating code with modular component
- `compare_versions.py` - Development helper for comparing file versions

### `setup_scripts/`
- `add_revenue_column.py` - One-time database migration script
- `fix_documents_placement.py` - One-time fix for document placement issues
- `setup_*.py` - Various setup and initialization scripts

### `tests/`
- `test_*.py` - Development test files for various features
- Includes controls parsing tests, rating tests, performance tests, etc.

## Why These Files Are Archived

These files represent the evolution of the codebase but are no longer needed for the main workflow:
- **Legacy viewers**: Replaced by `viewer_with_modular_rating.py`
- **Failed modular**: Full modularization that removed too much functionality
- **Dev scripts**: One-time use scripts that served their purpose
- **Setup scripts**: Migration scripts already executed
- **Tests**: Development tests that may be useful for reference

## Main Workflow Files (Active)

The current active files in the main directory are:
- `viewer.py` - Original full-featured viewer
- `viewer_with_modular_rating.py` - Current production viewer with modular rating
- `components/rating_panel_v2.py` - Reusable rating component
- Core application files (`app/`, `rating_engine/`, etc.)