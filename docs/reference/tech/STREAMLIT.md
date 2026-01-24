# Streamlit Documentation

This document provides Claude Code context for using Streamlit in this project.

## Project Usage

Streamlit is the primary frontend framework:

| Location | Purpose |
|----------|---------|
| `app.py` | Main entry point |
| `pages/` | Streamlit multipage app pages |
| `pages_workflows/` | Heavy page implementations |
| `pages_components/` | Reusable UI components |

## Key Documentation

- API Reference: https://docs.streamlit.io/develop/api-reference
- Changelog: https://docs.streamlit.io/develop/quick-reference/changelog

## Session State

### Basic Usage

```python
import streamlit as st

# Initialize state
if 'count' not in st.session_state:
    st.session_state.count = 0

# Access state
current_count = st.session_state.count

# Update state
st.session_state.count += 1
```

### Project Conventions

From `CLAUDE.md`:
- Prefix internal keys with `_` (e.g., `_active_tab`, `_create_option_success`)
- Clear/pop state after consuming to avoid stale data

```python
# Set state
st.session_state['_active_tab'] = 'Quote'

# Clear after use
if '_success_message' in st.session_state:
    st.success(st.session_state.pop('_success_message'))
```

## Callbacks

### Button Callbacks

```python
def increment_counter():
    st.session_state.count += 1

st.button('Increment', on_click=increment_counter)
```

### Callbacks with Arguments

```python
def change_name(name):
    st.session_state['name'] = name

st.button('Jane', on_click=change_name, args=['Jane Doe'])
```

### Selectbox with on_change

```python
def on_status_change():
    # Access new value via session state key
    new_status = st.session_state.status_selector
    save_to_database(new_status)

st.selectbox(
    "Status",
    options=["Draft", "Pending", "Approved"],
    key="status_selector",
    on_change=on_status_change
)
```

## Tabs

### Basic Tabs

```python
tab1, tab2, tab3 = st.tabs(["Charts", "Data", "Settings"])

with tab1:
    st.header("Visualization")
    st.line_chart(data)

with tab2:
    st.header("Raw Data")
    st.dataframe(data)
```

### Tab State Management

From project's `utils/tab_state.py`:

```python
# Set active tab before rerun
st.session_state['_active_tab'] = 'Quote'

# Use default parameter (Streamlit 1.41+)
st.tabs(["Account", "Review", "Quote"], default="Quote")
```

### Stay on Tab Pattern

```python
# In utils/tab_state.py
def on_change_stay_on_quote_tab():
    st.session_state['_active_tab'] = 'Quote'

# Usage
st.selectbox(
    "Coverage",
    options=coverages,
    key="coverage_select",
    on_change=on_change_stay_on_quote_tab
)
```

## Forms

### Basic Form

```python
with st.form('my_form'):
    name = st.text_input('Name')
    email = st.text_input('Email')
    submitted = st.form_submit_button('Submit')

if submitted:
    st.write(f"Hello {name}!")
```

### Form with Callback

```python
def form_callback():
    # Access values via session state keys
    name = st.session_state.form_name
    save_data(name)

with st.form(key='my_form'):
    st.text_input('Name', key='form_name')
    st.form_submit_button('Submit', on_click=form_callback)
```

## Data Editor

### Basic Usage

```python
edited_df = st.data_editor(
    df,
    num_rows="dynamic",  # Allow adding rows
    hide_index=True
)
```

### With Column Configuration

```python
edited_df = st.data_editor(
    df,
    column_config={
        "premium": st.column_config.NumberColumn(
            "Premium",
            format="$%d",
            min_value=0
        ),
        "approved": st.column_config.CheckboxColumn(
            "Approved",
            default=False
        ),
        "status": st.column_config.SelectboxColumn(
            "Status",
            options=["Draft", "Pending", "Approved"]
        )
    },
    disabled=["id", "created_at"]  # Read-only columns
)
```

### Row Selection

```python
def dataframe_with_selections(df):
    df_with_selections = df.copy()
    df_with_selections.insert(0, "Select", False)

    edited_df = st.data_editor(
        df_with_selections,
        hide_index=True,
        column_config={
            "Select": st.column_config.CheckboxColumn(required=True)
        },
        disabled=df.columns,  # Only Select column is editable
    )

    selected_rows = edited_df[edited_df.Select]
    return selected_rows.drop('Select', axis=1)
```

## Fragments

Isolate reruns to a section:

```python
@st.fragment
def toggle_section():
    if st.button("Toggle"):
        st.session_state.show = not st.session_state.get('show', False)

    if st.session_state.get('show'):
        st.write("Content shown!")

toggle_section()
```

**Note from CLAUDE.md**: Avoid fragments for content that must render on initial page load.

## Layout

### Columns

```python
col1, col2, col3 = st.columns([2, 1, 1])  # Width ratios

with col1:
    st.write("Wide column")

with col2:
    st.metric("Premium", "$50,000")
```

### Expander

```python
with st.expander("Advanced Options"):
    st.slider("Threshold", 0, 100, 50)
```

### Sidebar

```python
with st.sidebar:
    st.title("Navigation")
    page = st.selectbox("Page", ["Home", "Settings"])
```

## Messages and Feedback

```python
# Success message (only lasts one render)
st.success("Saved successfully!")

# Warning
st.warning("Check your input")

# Error
st.error("Something went wrong")

# Info
st.info("Tip: You can also...")

# Toast (Streamlit 1.30+)
st.toast("Quick notification!")
```

**Note from CLAUDE.md**: `st.success()` only lasts one render. If calling `st.rerun()`, the message disappears.

## Rerun Patterns

### Avoid Double Reruns

From `CLAUDE.md`:
- Single rerun preferred
- For buttons: Use `on_click` callback for tab state, avoid explicit `st.rerun()` when possible
- For selectboxes: Use `on_change` callback; DB saves happen during natural rerun

### When to Use st.rerun()

```python
# After navigation that needs immediate state update
if st.button("Go to Settings"):
    st.session_state['_active_page'] = 'Settings'
    st.rerun()

# After async operation completes
if operation_complete:
    st.session_state['_result'] = result
    st.rerun()
```

## Currency Formatting

From `CLAUDE.md`: Always escape `$` as `\\$` in `st.markdown()` and `st.caption()`:

```python
# Correct
st.markdown(f"Premium: \\${premium:,.0f}")
st.caption(f"Total: \\${total:,.0f}")

# Will trigger LaTeX mode (incorrect)
st.markdown(f"Premium: ${premium:,.0f}")
```

## Performance Tips

1. **Cache Data**: Use `@st.cache_data` for expensive computations
2. **Cache Resources**: Use `@st.cache_resource` for database connections
3. **Minimize State**: Only store what's needed in session state
4. **Avoid Full Reruns**: Use fragments for isolated updates

```python
@st.cache_data(ttl=3600)  # Cache for 1 hour
def load_data():
    return pd.read_csv("large_file.csv")

@st.cache_resource
def get_database_connection():
    return create_engine(DATABASE_URL)
```

## Project-Specific Patterns

### Tab State Helper (utils/tab_state.py)

```python
def rerun_on_quote_tab():
    """Set active tab to Quote and rerun."""
    st.session_state['_active_tab'] = 'Quote'
    st.rerun()

def on_change_stay_on_rating_tab():
    """Callback to stay on Rating tab after widget change."""
    st.session_state['_active_tab'] = 'Rating'
```

### Component Pattern

```python
# pages_components/coverage_editor.py
def render_coverage_editor(sub_id: str):
    """Render coverage editor for a submission."""
    with get_conn() as conn:
        coverages = load_coverages(conn, sub_id)

    edited = st.data_editor(coverages, key=f"cov_{sub_id}")

    if st.button("Save", key=f"save_cov_{sub_id}"):
        save_coverages(sub_id, edited)
        st.success("Saved!")
```

## References

- [Streamlit API Reference](https://docs.streamlit.io/develop/api-reference)
- [Streamlit Changelog](https://docs.streamlit.io/develop/quick-reference/changelog)
- [Session State](https://docs.streamlit.io/develop/concepts/architecture/session-state)
- [Forms](https://docs.streamlit.io/develop/concepts/architecture/forms)
