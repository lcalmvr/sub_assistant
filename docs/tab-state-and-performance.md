# Tab State Management and UI Performance Guide

## The Problem

Streamlit's `st.tabs()` does not preserve the active tab across script reruns. Every time `st.rerun()` is called (explicitly or implicitly via widget interaction), the page reloads and defaults to the **first tab** (Account).

This causes a frustrating UX where users are "bounced" back to the Account tab after performing actions on other tabs.

## Root Cause

```
User clicks button on Quote tab
    ↓
st.rerun() is called
    ↓
Entire Streamlit script re-executes from top
    ↓
st.tabs() renders with first tab (Account) active
    ↓
User sees Account tab instead of Quote tab
```

## Solutions

We use three patterns to address this, in order of preference:

### 1. `@st.fragment` - Best for Isolated Interactions (PREFERRED)

Fragments only rerun a small section of the page, not the entire script. The tab stays where it is because the tabs aren't re-rendered.

```python
@st.fragment
def _render_my_section(submission_id: str):
    """This section reruns independently."""
    items = get_items(submission_id)

    for item in items:
        col1, col2 = st.columns([4, 1])
        with col1:
            st.markdown(f"• {item['text']}")
        with col2:
            if st.button("Delete", key=f"del_{item['id']}"):
                delete_item(item['id'])
                st.rerun(scope="fragment")  # Only reruns this fragment!


def render_my_panel(submission_id: str):
    with st.expander("My Section"):
        _render_my_section(submission_id)  # Call the fragment
```

**When to use:**
- Add/edit/delete operations on lists
- Toggle states
- Any action that doesn't affect other parts of the page

**Examples in codebase:**
- `pages_components/policy_panel.py` - `_render_pending_subjectivities()`
- `pages_components/subjectivities_panel.py` - `_render_subjectivities_content()`
- `pages_components/coverage_summary_panel.py` - `_render_coverage_content()` (policy form changes)

### 2. `@st.dialog` - Best for Confirmations

Dialogs are modal overlays that don't require a page rerun to show/hide.

```python
@st.dialog("Confirm Delete")
def _confirm_delete(item_id: str):
    st.warning("Are you sure you want to delete this?")
    col1, col2 = st.columns(2)
    with col1:
        if st.button("Delete", type="primary"):
            delete_item(item_id)
            st.session_state["_return_to_policy_tab"] = True
            st.rerun()  # Full rerun after actual action
    with col2:
        if st.button("Cancel"):
            st.rerun()  # Just closes the dialog


# In your main code:
if st.button("Delete Item"):
    _confirm_delete(item_id)  # Opens modal instantly
```

**When to use:**
- Confirmation dialogs (delete, unbind, etc.)
- Forms that need user input before an action
- Any two-step action (click → confirm)

**Examples in codebase:**
- `pages_components/policy_panel.py` - Unbind confirmation dialog

### 3. Tab-Aware Reruns - Fallback for Full Page Reruns

When you must do a full page rerun (because the action affects multiple parts of the page), use the tab state helpers:

```python
from utils.tab_state import rerun_on_quote_tab, rerun_on_policy_tab

# Instead of:
st.rerun()  # BAD - bounces to Account tab

# Use:
rerun_on_quote_tab()   # Stays on Quote tab
rerun_on_policy_tab()  # Stays on Policy tab
```

**Available helpers in `utils/tab_state.py`:**
- `rerun_on_quote_tab()`
- `rerun_on_policy_tab()`
- `rerun_on_rating_tab()`
- `rerun_on_review_tab()`
- `rerun_on_account_tab()`
- `rerun_on_tab(tab_name)` - Generic version

**When to use:**
- Actions that change data displayed in multiple places
- Navigation between submissions
- Binding/unbinding (changes entire page state)

**How it works:**
1. Sets `st.session_state["_active_tab"] = "TabName"`
2. Calls `st.rerun()`
3. In `submissions.py`, JavaScript clicks the correct tab after render

## Decision Tree

```
Is the interaction isolated to a small section?
├── YES → Use @st.fragment
│         - Wrap the section in a fragment function
│         - Use st.rerun(scope="fragment")
│
└── NO → Does it need a confirmation step?
         ├── YES → Use @st.dialog
         │         - Define dialog function with @st.dialog decorator
         │         - Call it when button is clicked
         │
         └── NO → Use tab-aware rerun
                  - Import from utils.tab_state
                  - Call rerun_on_X_tab() instead of st.rerun()
```

## Performance Comparison

| Pattern | Speed | Tab Preserved | Use Case |
|---------|-------|---------------|----------|
| `@st.fragment` | Instant | Yes | Isolated CRUD operations |
| `@st.dialog` | Instant | Yes | Confirmations, forms |
| Tab-aware rerun | Slow (full reload) | Yes (with flicker) | Cross-page state changes |
| Raw `st.rerun()` | Slow | NO | Never use directly |

## Common Mistakes

### 1. Using `st.rerun()` directly
```python
# BAD
if st.button("Save"):
    save_data()
    st.rerun()  # Bounces to Account tab!

# GOOD
if st.button("Save"):
    save_data()
    rerun_on_quote_tab()  # Stays on Quote tab
```

### 2. Not using fragments for list operations
```python
# BAD - Full page rerun for each delete
for item in items:
    if st.button(f"Delete {item['id']}"):
        delete_item(item['id'])
        rerun_on_quote_tab()  # Slow, causes flicker

# GOOD - Fragment only reruns the list
@st.fragment
def _render_items():
    for item in items:
        if st.button(f"Delete {item['id']}"):
            delete_item(item['id'])
            st.rerun(scope="fragment")  # Instant!
```

### 3. Forgetting scope="fragment" inside fragments
```python
@st.fragment
def _my_fragment():
    if st.button("Action"):
        do_something()
        st.rerun()  # BAD - defaults to full app rerun!
        st.rerun(scope="fragment")  # GOOD - stays in fragment
```

### 4. Using fragments for form controls that need state reset

When a widget change requires resetting other state (e.g., radio button changing coverage defaults), wrap the entire section in a fragment:

```python
@st.fragment
def _render_coverage_content():
    """Fragment for coverage form and editor - allows isolated reruns."""
    # Radio button for form selection
    selected_form = st.radio("Policy Form", ["Cyber", "Tech"], horizontal=True)

    # Detect if form changed
    prev_form = st.session_state.get("prev_form")
    form_changed = (selected_form != prev_form)

    if form_changed:
        # Reset dependent state
        st.session_state["coverage_defaults"] = get_defaults_for_form(selected_form)
        reset_coverage_editor("my_editor")
        st.session_state["prev_form"] = selected_form
        # Fragment-scoped rerun to apply new state
        st.rerun(scope="fragment")

    # Render editor with current state
    render_coverage_editor(...)

# Call the fragment
with st.expander("Coverage Schedule"):
    _render_coverage_content()
```

**Why this works:**
- Radio button click triggers natural Streamlit rerun
- Fragment detects form changed, resets state, calls `st.rerun(scope="fragment")`
- Only the fragment reruns (instant), not the whole page
- Tab state is preserved because tabs aren't re-rendered

## Files Using These Patterns

### Using `@st.fragment`:
- `pages_components/policy_panel.py` - Subjectivity management
- `pages_components/subjectivities_panel.py` - Add/remove subjectivities
- `pages_components/coverage_summary_panel.py` - Policy form radio button with state reset

### Using `@st.dialog`:
- `pages_components/policy_panel.py` - Unbind confirmation

### Using tab-aware reruns:
- `pages_components/quote_options_panel.py`
- `pages_components/quote_options_table.py`
- `pages_components/quote_options_cards.py`
- `pages_components/tower_panel.py`
- `pages_components/admin_agent_sidebar.py`
- `pages_components/review_queue_panel.py`
- `pages_components/generate_quote_button.py`

## Adding New Components

When creating a new component:

1. **Identify interaction patterns** - What buttons/inputs will trigger updates?

2. **Choose the right pattern:**
   - List with add/edit/delete → `@st.fragment`
   - Destructive action needing confirm → `@st.dialog`
   - Must refresh whole page → Tab-aware rerun

3. **Import the right helpers:**
   ```python
   # For fragments - no import needed, just use @st.fragment

   # For tab-aware reruns:
   from utils.tab_state import rerun_on_quote_tab  # or appropriate tab
   ```

4. **Test the interaction** - Verify no tab bouncing occurs

## Debugging Tab Issues

If users report being bounced to Account tab:

1. **Find the rerun call** - Search for `st.rerun()` in the component
2. **Check if it's in a fragment** - If yes, ensure `scope="fragment"` is used
3. **Check if tab helper is used** - If not in fragment, must use `rerun_on_X_tab()`
4. **Consider converting to fragment** - If the interaction is isolated, fragment is better

## Related Files

- `utils/tab_state.py` - Tab state helper functions
- `pages_workflows/submissions.py` - Tab rendering and JavaScript tab-click injection (lines ~984-1024)
