# UI Style Guide for Streamlit

**Status: Legacy** - Streamlit is no longer the primary frontend. React is the primary UI. This guide is kept for reference while Streamlit remains runnable.

---

## Currency Formatting - CRITICAL

**Problem:** Dollar signs (`$`) in st.markdown() are interpreted as LaTeX math delimiters, causing weird spacing like "1, 000, 000" instead of "1,000,000".

### Rules:
1. **st.markdown()** - ALWAYS escape: `\\$`
2. **st.caption()** - ALWAYS escape: `\\$`
3. **st.text()** - No escaping needed (plain text)
4. **st.metric()** - No escaping needed (plain text)
5. **st.dataframe()** - No escaping needed (plain text)

### Standard currency helper - COPY THIS:
```python
def fmt_currency(val, millions=False):
    """Format currency with \\$ escaping for markdown/caption."""
    if val is None:
        return "—"
    v = float(val)
    if millions:
        return f"\\${v/1e6:.0f}M"
    return f"\\${v:,.0f}"
```

### WRONG examples:
```python
st.markdown(f"${value:,.0f}")           # LaTeX mode - BROKEN
st.caption(f"${value:,.0f}")            # LaTeX mode - BROKEN
html = f"<b>${value}</b>"               # HTML doesn't work in Streamlit
st.markdown(html, unsafe_allow_html=True)  # Still broken
```

## Text Separators

**Use middot (·) not pipes, dashes, or bullets:**
```python
st.caption(f"{revenue} · {industry}")   # CORRECT
st.caption(f"{revenue} | {industry}")   # WRONG
st.caption(f"{revenue} - {industry}")   # WRONG
```

## Card Layouts

### CRITICAL: Avoiding double spacing

Each `st.markdown()` or `st.caption()` call adds vertical margin. To get tight single-line spacing:

**Use single markdown block with soft line breaks (`  \n` = two spaces + newline):**
```python
lines = [
    f"**{name}**",
    f"{revenue} · {industry}",
    f"**Primary:** {limit} · {retention}",
    f"{premium} · {rate_per_mil}",
]
st.markdown("  \n".join(lines))  # Two spaces before \n = soft line break
```

**WRONG - causes double spacing:**
```python
st.markdown(f"**{name}**")           # Each call adds margin
st.markdown(f"{revenue}")            # More margin
st.caption(f"{industry}")            # Even more margin
```

### Card with description:
```python
with st.container(border=True):
    lines = [f"**{title}**", f"{metric1} · {metric2}"]
    st.markdown("  \n".join(lines))
    st.caption(description)  # Gray text for secondary content
```

### Comparison cards (side-by-side):
```python
col1, col2 = st.columns(2)
with col1:
    st.markdown("**Left Title**")
    with st.container(border=True):
        lines = [f"**{name}**", f"{rev} · {ind}", f"**Layer:** {limit} · {ret}"]
        st.markdown("  \n".join(lines))
        st.caption(description)

with col2:
    st.markdown("**Right Title**")
    with st.container(border=True):
        lines = [f"**{name}**", f"{rev} · {ind}", f"**Layer:** {limit} · {ret}"]
        st.markdown("  \n".join(lines))
        st.caption(description)
```

## Reusable Utilities

**For policy/quote summaries, use `utils/policy_summary.py`:**
```python
from utils.policy_summary import render_policy_summary_card, render_comparison_card, fmt_currency

# Policy tab summary
render_policy_summary_card(
    name=name, status_icon="🟢", status_text="Active",
    eff_date_str="01/01/2025", exp_date_str="01/01/2026",
    limit=2000000, retention=50000, premium=60000, policy_form="cyber"
)

# Benchmarking comparison cards
render_comparison_card(
    name=name, revenue=50000000, industry="Software",
    layer_type="primary", limit=2000000, retention=50000, premium=60000,
    description="Company description...", is_current=True
)
```

## Component Selection Guide

| Need | Use | Escaping |
|------|-----|----------|
| Bold text with $ | st.markdown() | \\$ required |
| Secondary text with $ | st.caption() | \\$ required |
| Plain text | st.text() | None |
| Single big number | st.metric() | None |
| Table data | st.dataframe() | None |
| Section break | st.divider() | N/A |

## Never Use

- **HTML in markdown** - Streamlit renders it as LaTeX/text, not HTML
- **st.metric()** for dense displays - takes too much vertical space
- **Multiple st.text() calls** for multi-line content - use single st.caption() with `·` separators
- **Emojis** unless user specifically requests them
- **Unescaped $** in any markdown or caption
