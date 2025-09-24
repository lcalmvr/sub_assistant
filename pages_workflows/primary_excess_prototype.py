"""
Primary vs. Excess Prototype - Simplified
=========================================

A clean Streamlit interface for capturing insurance tower structures.
Features:
- Natural language input box above the table
- AI processing to populate the tower table
- Simple table for recording primary carrier and excess carriers
"""

import os
import pandas as pd
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

# ───────────────────────── Helper Functions ─────────────────────────

def _parse_amount(val) -> float:
    """Parse dollar and K/M-suffixed numbers into float dollars."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    
    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return 0.0
    
    try:
        if s.endswith("K"):
            return float(s[:-1] or 0) * 1_000
        if s.endswith("M"):
            return float(s[:-1] or 0) * 1_000_000
        return float(s)
    except Exception:
        return 0.0


def _format_amount(amount: float) -> str:
    """Format dollar amounts with K/M suffixes."""
    if not amount:
        return ""
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"${int(amount // 1_000_000)}M"
    if amount >= 1_000 and amount % 1_000 == 0:
        return f"${int(amount // 1_000)}K"
    return f"${amount:,.0f}"


def _format_rpm(rpm: float) -> str:
    """Format rate per million."""
    if not rpm:
        return ""
    k = rpm / 1000.0
    return f"{int(k)}K" if abs(k - int(k)) < 1e-6 else f"{k:.2f}K"


def _format_percent(percent: float) -> str:
    """Format percentage values."""
    if not percent:
        return ""
    return f"{percent:.0f}%" if percent == int(percent) else f"{percent:.1f}%"


def _layers_to_dataframe(layers: list) -> pd.DataFrame:
    """Convert layers list to DataFrame for display."""
    if not layers:
        return pd.DataFrame(columns=["carrier", "limit", "attachment", "premium", "rpm", "ilf"])
    
    rows = []
    for layer in layers:
        rows.append({
            "carrier": layer.get("carrier", ""),
            "limit": _format_amount(layer.get("limit", 0)),
            "attachment": _format_amount(layer.get("attachment", 0)),
            "premium": _format_amount(layer.get("premium", 0)) if layer.get("premium") else "",
            "rpm": _format_rpm(layer.get("rpm", 0)) if layer.get("rpm") else "",
            "ilf": layer.get("ilf", ""),
        })
    
    return pd.DataFrame(rows)


def _dataframe_to_layers(df: pd.DataFrame) -> list:
    """Convert DataFrame back to layers list."""
    layers = []
    for _, row in df.iterrows():
        if not any(str(row.get(col, "")).strip() for col in ["carrier", "limit", "attachment"]):
            continue
            
        layers.append({
            "carrier": str(row.get("carrier", "")).strip(),
            "limit": _parse_amount(row.get("limit", 0)),
            "attachment": _parse_amount(row.get("attachment", 0)),
            "premium": _parse_amount(row.get("premium", 0)) if str(row.get("premium", "")).strip() else None,
            "rpm": _parse_amount(row.get("rpm", 0)) if str(row.get("rpm", "")).strip() else None,
            "ilf": str(row.get("ilf", "")).strip() or None,
        })
    
    return layers


# ───────────────────────── Main Interface ─────────────────────────

def render():
    st.title("🧪 Insurance Tower Builder")
    st.markdown("Enter natural language descriptions to build your insurance tower structure.")
    
    # Initialize session state
    if "tower_layers" not in st.session_state:
        st.session_state.tower_layers = []
    
    # Natural Language Input Box (above the table)
    user_input = st.text_area(
        "Describe your insurance tower:",
        placeholder="Example: 'Primary carrier is ABC Insurance with 5M limit and 100K retention. Excess layers: Coalition 5M x 5M at 50K premium, Beazley 5M x 10M at 40K premium, Corvus 5M x 15M at 30K premium.'",
        height=100,
        key="tower_input"
    )
    
    # Process Button
    col1, col2 = st.columns([1, 4])
    with col1:
        process_button = st.button("Process with AI", type="primary")
    
    with col2:
        if st.button("Clear Tower"):
            st.session_state.tower_layers = []
            st.rerun()
    
    # Process the natural language input
    if process_button and user_input.strip():
        try:
            from ai.tower_intel import run_command_with_ai
            
            # Get current layers for context
            current_layers = st.session_state.tower_layers
            
            # Call AI processing
            result = run_command_with_ai(current_layers, user_input, 0.0, None)
            
            # Debug: Show what AI returned
            with st.expander("Debug: AI Response", expanded=False):
                st.json(result)
            
            # Update the tower layers - use the layers exactly as the AI returns them
            layers = result.get("layers", [])
            primary = result.get("primary")
            
            # If we have a primary, update the first layer with primary data
            if primary and layers:
                # Update the first layer with primary information
                layers[0].update({
                    "premium": primary.get("premium"),
                    "rpm": primary.get("rpm"),
                    "ilf": "TBD"
                })
            
            # Apply ILF calculations if we have a primary with RPM
            if primary and primary.get("rpm") and len(layers) > 1:
                base_rpm = primary.get("rpm")
                for i in range(1, len(layers)):
                    # Apply 80% ILF to each subsequent layer
                    new_rpm = base_rpm * (0.8 ** i)
                    layers[i]["rpm"] = new_rpm
                    if layers[i]["limit"]:
                        layers[i]["premium"] = new_rpm * (layers[i]["limit"] / 1_000_000.0)
                    layers[i]["ilf"] = "80%"
            
            # Fix attachment points to stack properly
            running_attachment = 0
            for layer in layers:
                layer["attachment"] = running_attachment
                running_attachment += layer.get("limit", 0)
            
            st.session_state.tower_layers = layers
            
            st.success("✅ Tower updated successfully!")
            
        except Exception as e:
            st.error(f"❌ Error processing input: {str(e)}")
            st.exception(e)
    
    # Tower Table
    st.subheader("Insurance Tower")
    
    # Convert layers to DataFrame for editing
    df = _layers_to_dataframe(st.session_state.tower_layers)
    
    # Display and edit the table
    edited_df = st.data_editor(
        df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "carrier": st.column_config.TextColumn("Carrier", width="medium"),
            "limit": st.column_config.TextColumn("Limit", width="small"),
            "attachment": st.column_config.TextColumn("Attachment", width="small"),
            "premium": st.column_config.TextColumn("Premium", width="small"),
            "rpm": st.column_config.TextColumn("RPM", width="small"),
            "ilf": st.column_config.TextColumn("ILF", width="small"),
        },
        key="tower_editor"
    )
    
    # Update session state when table is edited
    if not edited_df.equals(df):
        st.session_state.tower_layers = _dataframe_to_layers(edited_df)
        st.rerun()
    
    # Tower Summary
    if st.session_state.tower_layers:
        st.subheader("Tower Summary")
        
        total_limit = sum(layer.get("limit", 0) for layer in st.session_state.tower_layers)
        total_premium = sum(layer.get("premium", 0) for layer in st.session_state.tower_layers if layer.get("premium"))
        
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Layers", len(st.session_state.tower_layers))
        with col2:
            st.metric("Total Limit", _format_amount(total_limit))
        with col3:
            st.metric("Total Premium", _format_amount(total_premium))
        
        # Show tower structure
        st.markdown("**Tower Structure:**")
        for i, layer in enumerate(st.session_state.tower_layers):
            carrier = layer.get("carrier", "Unknown")
            limit = _format_amount(layer.get("limit", 0))
            attachment = _format_amount(layer.get("attachment", 0))
            premium = _format_amount(layer.get("premium", 0)) if layer.get("premium") else "TBD"
            
            if i == 0:
                st.markdown(f"• **Primary**: {carrier} - {limit} above {attachment} (Premium: {premium})")
            else:
                st.markdown(f"• **Layer {i}**: {carrier} - {limit} x {attachment} (Premium: {premium})")


# Backwards-compat entry
if __name__ == "__main__":
    st.set_page_config(page_title="Insurance Tower Builder", layout="wide")
    render()
