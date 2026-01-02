# Batch Edit Rollback Guide

If Option 3 (Batch Edit as third tab) doesn't work well, here's how to roll back to Option 2 (button at bottom, full width).

## Changes to revert in `coverages_panel.py`:

```python
# REMOVE the batch_edit_tab_content parameter
# REPLACE with button at bottom:

updated_coverages = render_coverage_editor(
    editor_id=f"quote_{sub_id}",
    current_coverages=coverages,
    aggregate_limit=aggregate_limit,
    mode=mode,
    on_change=on_coverage_change if not readonly else None,
    show_header=False,
    batch_edit_tab_content=None,  # Remove this
)

# Add button at bottom instead:
if not readonly and not hide_bulk_edit:
    st.markdown("---")
    if st.button("Batch Edit", key=f"batch_edit_btn_{sub_id}", type="primary", use_container_width=True):
        # Trigger the modal instead
        render_bulk_coverage_buttons(sub_id, coverages, "this option")
```

## Changes to keep in `coverage_editor.py`:

The `batch_edit_tab_content` parameter is optional and falls back gracefully, so no changes needed there unless you want to remove the parameter entirely.

