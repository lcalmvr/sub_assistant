# UI Style Guide for Streamlit

## Currency Formatting - CRITICAL ⚠️

**Problem:** Dollar signs (`$`) in st.markdown() are interpreted as LaTeX math delimiters, causing weird spacing like "1, 000, 000" instead of "1,000,000".

### ALWAYS escape $ with backslash in f-strings:
```python
# CORRECT - escape the $
limit_str = f"\\${value:,.0f}"          # Renders: $1,000,000
st.markdown(f"**Limit:** \\${limit}M")  # Works correctly

# WRONG - causes LaTeX math mode
limit_str = f"${value:,.0f}"            # Renders: 1, 000, 000 (broken!)
st.markdown(f"**Limit:** ${limit}M")    # Math mode activated
```

### Alternative: use st.text() for plain currency display:
```python
st.text(f"${value:,.0f}")               # Plain text, no markdown issues
```

### For database data containing $, sanitize it:
```python
def safe_name(name):
    return name.replace("$", "").replace("  ", " ") if name else ""
```

## Standard Currency Display Patterns

```python
# Format helper function - use throughout codebase
def fmt_money(val):
    """Format currency with proper escaping for markdown."""
    if val is None:
        return "—"
    if val >= 1_000_000:
        return f"\\${val / 1_000_000:.0f}M"
    elif val >= 1_000:
        return f"\\${val / 1_000:.0f}K"
    return f"\\${val:,.0f}"
```

## Clean Text Summaries

**Preferred format for policy/quote summaries:**
```
$2M limit · $100K retention · $60,000 premium
```

**Use middot (·) not pipes or dashes for separators**

## Card Layouts

Keep cards simple:
- Title line (bold)
- One summary line with key metrics
- Optional caption for secondary info

```python
with st.container(border=True):
    st.markdown(f"**✓ {name}** — BOUND")
    st.markdown(f"\\$2M limit · \\$100K retention · \\$60,000 premium")
    st.caption("Primary · cyber_tech")
```

## Avoid

- `st.metric()` for dense displays (takes too much space)
- Multiple columns for simple text (adds visual noise)
- Expanders for short content (just show it)
- Emojis unless specifically requested
