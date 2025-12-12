"""
Unified AI Command Box Component
Single input for all quote configuration - options generation and tower building.
"""
from __future__ import annotations

import re
import streamlit as st
from typing import Optional


def render_ai_command_box(sub_id: str):
    """
    Render a unified AI command input that handles:
    - Primary: Generate multiple quote options (e.g., "1M, 3M, 5M at 50K retention")
    - Excess: Build tower structure (e.g., "XL primary $5M, CMAI $5M xs $5M")
    - Coverage commands (e.g., "set SE to 250K")
    """
    # Single input box
    command = st.text_input(
        "AI Assistant",
        placeholder="Try: '1M, 3M, 5M at 50K ret' or 'XL Primary 5M x 50K SIR, CMAI 5M x 5M for 45K'",
        key=f"ai_command_{sub_id}",
        label_visibility="collapsed"
    )

    col_apply, col_help = st.columns([1, 3])

    with col_apply:
        apply_clicked = st.button("Apply", key=f"apply_command_{sub_id}", type="primary", disabled=not command.strip())

    with col_help:
        with st.popover("💡 Examples"):
            st.markdown("""
**Primary (CMAI only):**
- `1M, 3M, 5M options at 50K retention`
- `quote 2M and 5M with 25K ret`

**Excess (CMAI sits above primary):**
- `XL Primary 5M x 50K SIR, CMAI 5M x 5M for 45K`
- `XL primary $5M for 100K, CMAI $5M xs $5M for 90K`

**Modify tower:**
- `change CMAI premium to 50K`
- `add Berkley $3M xs $10M`
            """)

    if apply_clicked and command.strip():
        result = _process_command(sub_id, command)
        if result["success"]:
            st.success(f"✓ {result['message']}")
            st.rerun()
        else:
            st.warning(result["message"])


def _process_command(sub_id: str, command: str) -> dict:
    """
    Route command to appropriate handler based on content analysis.
    """
    cmd_lower = command.lower().strip()

    # Check for multiple options pattern first (primary use case)
    if _is_options_command(cmd_lower):
        return _handle_options_command(sub_id, command)

    # Check for tower/excess command
    if _is_tower_command(cmd_lower):
        return _handle_tower_command(sub_id, command)

    # If tower exists and command mentions a carrier in the tower, route to tower handler
    existing_tower = st.session_state.get("tower_layers", [])
    if existing_tower:
        tower_carriers = [layer.get("carrier", "").lower() for layer in existing_tower]
        for carrier in tower_carriers:
            if carrier and carrier in cmd_lower:
                return _handle_tower_command(sub_id, command)

    # Check for coverage command
    if _is_coverage_command(cmd_lower):
        return _handle_coverage_command(sub_id, command)

    # Try AI to figure it out
    return _handle_ai_routing(sub_id, command)


def _is_options_command(cmd: str) -> bool:
    """Check if command is requesting multiple quote options."""
    patterns = [
        r'\boptions?\b',  # "options" or "option"
        r'\bquote\s+\d+[mk]?\s*(,|and)',  # "quote 1M, 2M" or "quote 1M and 2M"
        r'\d+[mk]?\s*,\s*\d+[mk]?\s*(,|and)?\s*\d*[mk]?\s*(option|at|with|retention)',  # "1M, 3M, 5M at 50K"
        r'(give|create|generate|make)\s+(me\s+)?\d+[mk]',  # "give me 1M, 2M, 3M"
    ]
    return any(re.search(p, cmd) for p in patterns)


def _is_tower_command(cmd: str) -> bool:
    """Check if command is tower-related."""
    tower_keywords = [
        r'\bxs\b',  # "xs" = excess of
        r'\bexcess\s+(of|option|quote)',
        r'\bprimary\b.*\bfor\b',  # "primary ... for 100K"
        r'\bmake\s+\w+\s+(the\s+)?primary',  # "make XL the primary"
        r'\b(xl|berkley|beazley|axa|chubb|zurich|liberty|hartford|travelers)\b.*\d+[mk]',
        r'\badd\s+(layer|carrier|cmai)',
        r'\bremove\s+layer',
        r'\btower\b',
        r'\battachment',
        r'\bretention.*primary',
        r'\bsir\b',  # "SIR" = self-insured retention
        r'\b\d+[mk]\s*x\s*\d+[mk]',  # "5M x 5M" pattern
        r'(xl|berkley|beazley|axa|chubb|zurich|liberty|hartford|travelers)\s+primary',  # "XL Primary"
        r'make\s+an?\s+excess',  # "make an excess option"
    ]
    return any(re.search(kw, cmd) for kw in tower_keywords)


def _is_coverage_command(cmd: str) -> bool:
    """Check if command is coverage-related."""
    coverage_keywords = [
        r'\bset\s+.+\s+to\s+\d+',
        r'\bchange\s+.+\s+to\s+\d+',
        r'\badd\s+.+\s+sublimit',
        r'\bremove\s+.+\s+coverage',
        r'\bsocial\s+engineering',
        r'\bftf\b',
        r'\bfunds\s+transfer',
        r'\bransomware',
        r'\bcryptojacking',
        r'\bsublimit',
    ]
    return any(re.search(kw, cmd) for kw in coverage_keywords)


# ═══════════════════════════════════════════════════════════════════════════════
# OPTIONS HANDLER - For generating multiple primary quote options
# ═══════════════════════════════════════════════════════════════════════════════

def _handle_options_command(sub_id: str, command: str) -> dict:
    """
    Handle commands that generate multiple quote options.
    E.g., "1M, 3M, 5M options at 50K retention"
    """
    try:
        parsed = _ai_parse_options_command(command)
        if parsed and parsed.get("limits"):
            return _apply_options(sub_id, parsed)

        # Fallback to regex
        return _handle_options_fallback(sub_id, command)
    except Exception as e:
        return {"success": False, "message": f"Error: {e}"}


def _ai_parse_options_command(command: str) -> dict:
    """Use AI to parse options command."""
    try:
        import openai
        import json
        import os

        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        prompt = f"""Parse this insurance quote options request.

Command: "{command}"

The user wants to generate multiple quote options for CMAI (our company) as primary insurer.
Extract:
- "limits": array of limit amounts in dollars (e.g., [1000000, 3000000, 5000000])
- "retention": retention/deductible amount in dollars (e.g., 50000)

Examples:
- "1M, 3M, 5M options at 50K retention" -> {{"limits": [1000000, 3000000, 5000000], "retention": 50000}}
- "quote 2M and 5M with 25K retention" -> {{"limits": [2000000, 5000000], "retention": 25000}}
- "give me 1M, 2M, 3M, 5M at 100K" -> {{"limits": [1000000, 2000000, 3000000, 5000000], "retention": 100000}}

Convert: K = thousands (50K = 50000), M = millions (5M = 5000000).
Return ONLY valid JSON."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=200
        )

        result_text = response.choices[0].message.content.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()

        return json.loads(result_text)

    except Exception:
        return None


def _handle_options_fallback(sub_id: str, command: str) -> dict:
    """Fallback regex parsing for options."""
    cmd_lower = command.lower()

    # Find all amounts (e.g., 1M, 3M, 5M, 50K)
    amounts = re.findall(r'(\d+(?:\.\d+)?)\s*([mk])?', cmd_lower)

    limits = []
    retention = None

    for amt_str, suffix in amounts:
        amount = _parse_amount(amt_str, suffix)
        # Amounts >= 500K are likely limits, < 500K are likely retention
        if amount >= 500_000:
            limits.append(amount)
        else:
            retention = amount

    if limits:
        return _apply_options(sub_id, {"limits": limits, "retention": retention or 25_000})

    return {"success": False, "message": "Could not parse options. Try: '1M, 3M, 5M at 50K retention'"}


def _apply_options(sub_id: str, parsed: dict) -> dict:
    """Apply parsed options to session state."""
    from pages_components.quote_options_cards import add_quote_options

    limits = parsed.get("limits", [])
    retention = parsed.get("retention", 25_000)

    # Create options list
    options = []
    for limit in limits:
        options.append({
            "limit": limit,
            "retention": retention,
            "premium": None,  # Will be calculated by cards component
        })

    # Store options
    add_quote_options(sub_id, options)

    # Also create tower for first option (primary CMAI)
    first_limit = limits[0] if limits else 1_000_000
    st.session_state.tower_layers = [{
        "carrier": "CMAI",
        "limit": first_limit,
        "attachment": 0,
        "premium": None,
        "retention": retention,
        "rpm": None,
    }]
    st.session_state.primary_retention = retention

    limit_strs = [_format_short(l) for l in limits]
    return {
        "success": True,
        "message": f"Created {len(limits)} options: {', '.join(limit_strs)} at {_format_short(retention)} retention"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# TOWER HANDLER - For building excess/tower structures
# ═══════════════════════════════════════════════════════════════════════════════

def _handle_tower_command(sub_id: str, command: str) -> dict:
    """Handle tower-related commands using AI for intelligent parsing."""
    try:
        # Check if tower exists - if so, this is an update
        existing_tower = st.session_state.get("tower_layers", [])

        result = _ai_parse_tower_command(command, existing_tower if existing_tower else None)
        if result:
            return _apply_tower_changes(sub_id, result)
        return _handle_tower_command_fallback(sub_id, command)
    except Exception as e:
        return {"success": False, "message": f"Error: {e}"}


def _ai_parse_tower_command(command: str, existing_tower: list = None) -> dict:
    """
    Parse tower commands using a command-based approach.

    If tower exists: AI identifies WHAT to change (atomic operations - can be multiple)
    If no tower: AI builds the initial structure
    """
    try:
        import openai
        import json
        import os

        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        if existing_tower:
            # COMMAND MODE: Tower exists, identify atomic operations
            tower_description = []
            for i, layer in enumerate(existing_tower):
                carrier = layer.get("carrier", "Unknown")
                limit = layer.get("limit", 0)
                attachment = layer.get("attachment", 0)
                premium = layer.get("premium")
                retention = layer.get("retention")
                tower_description.append(
                    f"Layer {i+1}: {carrier}, limit=${limit:,}, attachment=${attachment:,}, premium={'$'+str(premium) if premium else 'none'}, retention={'$'+str(retention) if retention else 'none'}"
                )
            tower_str = "\n".join(tower_description)

            prompt = f"""Current tower:
{tower_str}

User command: "{command}"

Parse into atomic operations. The user may want MULTIPLE changes. Return a JSON array of commands to execute IN ORDER.

Available commands:
1. Set retention: {{"cmd": "set_retention", "value": DOLLARS}}
2. Set a single field: {{"cmd": "set_field", "carrier": "NAME", "field": "premium|limit", "value": DOLLARS}}
3. Set multiple fields on existing carrier: {{"cmd": "set_layer", "carrier": "NAME", "limit": DOLLARS_OR_NULL, "attachment": DOLLARS_OR_NULL, "premium": DOLLARS_OR_NULL}}
4. Add a new layer: {{"cmd": "add_layer", "carrier": "NAME", "limit": DOLLARS, "attachment": DOLLARS_OR_NULL, "premium": DOLLARS_OR_NULL}}
5. Remove a layer: {{"cmd": "remove_layer", "carrier": "NAME"}}
6. Move carrier to position: {{"cmd": "move_layer", "carrier": "NAME", "position": 1_INDEXED_NUMBER}}

IMPORTANT:
- "5M x 20M" means limit=5M, attachment=20M (for existing carrier, use set_layer)
- Use set_layer to change limit, attachment, and/or premium for carriers that ALREADY exist in the tower
- Use add_layer only for NEW carriers not yet in tower
- Convert K=thousands, M=millions

Return ONLY a JSON array like: [{{"cmd": "...", ...}}, {{"cmd": "...", ...}}]
For single operations, still return an array: [{{"cmd": "...", ...}}]"""

        else:
            # BUILD MODE: No tower exists, create new one
            prompt = f"""Parse this insurance tower request into JSON.

Request: "{command}"

Return ONLY valid JSON with this exact structure:
{{"action": "build", "layers": [{{"carrier": "NAME", "limit": DOLLARS, "attachment": DOLLARS, "premium": DOLLARS_OR_NULL}}], "retention": DOLLARS_OR_NULL}}

Rules:
- Primary layer (1st carrier mentioned) has attachment=0
- Each excess layer's attachment = sum of limits below it
- Convert K=thousands (50K=50000), M=millions (5M=5000000)
- SIR/retention goes in the "retention" field
- If premium is mentioned, include it; otherwise use null

Example: "XL primary 5M x 50K SIR for 100K, Beazley 5M xs 5M for 45K"
Returns: {{"action": "build", "layers": [{{"carrier": "XL", "limit": 5000000, "attachment": 0, "premium": 100000}}, {{"carrier": "Beazley", "limit": 5000000, "attachment": 5000000, "premium": 45000}}], "retention": 50000}}

Return ONLY the JSON, no explanation."""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=400
        )

        result_text = response.choices[0].message.content.strip()

        # Extract JSON from the response
        if "```json" in result_text:
            json_start = result_text.find("```json") + 7
            json_end = result_text.find("```", json_start)
            json_text = result_text[json_start:json_end].strip()
        elif "```" in result_text:
            json_start = result_text.find("```") + 3
            json_end = result_text.find("```", json_start)
            json_text = result_text[json_start:json_end].strip()
        elif "[" in result_text and (result_text.find("[") < result_text.find("{") if "{" in result_text else True):
            # Array response (compound commands)
            json_start = result_text.find("[")
            json_end = result_text.rfind("]") + 1
            json_text = result_text[json_start:json_end]
        elif "{" in result_text:
            json_start = result_text.find("{")
            json_end = result_text.rfind("}") + 1
            json_text = result_text[json_start:json_end]
        else:
            return None

        parsed = json.loads(json_text)

        # If we got an array of commands, wrap it for compound handling
        if isinstance(parsed, list):
            return {"action": "compound", "commands": parsed}

        return parsed

    except Exception as e:
        print(f"Tower parse error: {e}")
        return None


def _execute_atomic_command(sub_id: str, parsed: dict, tower_layers: list) -> dict:
    """
    Execute an atomic command on the tower.
    The AI identified WHAT to change, we execute it deterministically.
    """
    cmd = parsed.get("cmd")

    if cmd == "set_retention":
        value = parsed.get("value", 0)
        st.session_state.primary_retention = value
        if tower_layers:
            tower_layers[0]["retention"] = value
        st.session_state.tower_layers = tower_layers
        return {"success": True, "message": f"Set retention to ${_format_short(value)}"}

    elif cmd == "set_field":
        carrier = parsed.get("carrier", "").upper()
        field = parsed.get("field", "")
        value = parsed.get("value", 0)

        for layer in tower_layers:
            if carrier in str(layer.get("carrier", "")).upper():
                layer[field] = value
                # Recalculate RPM/ILF after changing premium or limit
                _calculate_rpm_ilf(tower_layers)
                st.session_state.tower_layers = tower_layers
                return {"success": True, "message": f"Set {layer['carrier']} {field} to ${_format_short(value)}"}

        return {"success": False, "message": f"Carrier '{carrier}' not found in tower"}

    elif cmd == "add_layer":
        carrier = parsed.get("carrier", "Unknown")
        limit = parsed.get("limit", 0)
        premium = parsed.get("premium")
        attachment = parsed.get("attachment")  # Can be explicit now

        # If attachment not provided, calculate based on existing layers
        if attachment is None:
            attachment = sum(l.get("limit", 0) for l in tower_layers)

        tower_layers.append({
            "carrier": carrier,
            "limit": limit,
            "attachment": attachment,
            "premium": premium,
            "rpm": None,
        })

        # Sort by attachment and recalculate
        tower_layers.sort(key=lambda x: x.get("attachment", 0))
        _recalculate_attachments(tower_layers)
        _calculate_rpm_ilf(tower_layers)
        st.session_state.tower_layers = tower_layers
        return {"success": True, "message": f"Added {carrier} ${_format_short(limit)} xs ${_format_short(attachment)}"}

    elif cmd == "set_layer":
        # Update multiple fields for a carrier at once (limit, attachment, premium)
        carrier = parsed.get("carrier", "").upper()
        limit = parsed.get("limit")
        attachment = parsed.get("attachment")
        premium = parsed.get("premium")

        for layer in tower_layers:
            if carrier in str(layer.get("carrier", "")).upper():
                if limit is not None:
                    layer["limit"] = limit
                if attachment is not None:
                    layer["attachment"] = attachment
                if premium is not None:
                    layer["premium"] = premium

                # Re-sort and recalculate
                tower_layers.sort(key=lambda x: x.get("attachment", 0))
                _recalculate_attachments(tower_layers)
                _calculate_rpm_ilf(tower_layers)
                st.session_state.tower_layers = tower_layers

                changes = []
                if limit is not None:
                    changes.append(f"limit=${_format_short(limit)}")
                if attachment is not None:
                    changes.append(f"att=${_format_short(attachment)}")
                if premium is not None:
                    changes.append(f"prem=${_format_short(premium)}")
                return {"success": True, "message": f"Set {layer['carrier']} {', '.join(changes)}"}

        return {"success": False, "message": f"Carrier '{carrier}' not found in tower"}

    elif cmd == "remove_layer":
        carrier = parsed.get("carrier", "").upper()

        for i, layer in enumerate(tower_layers):
            if carrier in str(layer.get("carrier", "")).upper():
                removed = tower_layers.pop(i)
                _recalculate_attachments(tower_layers)
                _calculate_rpm_ilf(tower_layers)
                st.session_state.tower_layers = tower_layers
                return {"success": True, "message": f"Removed {removed['carrier']}"}

        return {"success": False, "message": f"Carrier '{carrier}' not found"}

    elif cmd == "move_layer":
        carrier = parsed.get("carrier", "").upper()
        position = parsed.get("position", 1) - 1  # Convert to 0-indexed

        # Find and remove the layer
        layer_to_move = None
        for i, layer in enumerate(tower_layers):
            if carrier in str(layer.get("carrier", "")).upper():
                layer_to_move = tower_layers.pop(i)
                break

        if not layer_to_move:
            return {"success": False, "message": f"Carrier '{carrier}' not found"}

        # Insert at new position
        position = max(0, min(position, len(tower_layers)))
        tower_layers.insert(position, layer_to_move)

        _recalculate_attachments(tower_layers)
        _calculate_rpm_ilf(tower_layers)
        st.session_state.tower_layers = tower_layers
        return {"success": True, "message": f"Moved {layer_to_move['carrier']} to position {position + 1}"}

    return {"success": False, "message": f"Unknown command: {cmd}"}


def _apply_tower_changes(sub_id: str, parsed: dict) -> dict:
    """Apply parsed tower changes to session state."""
    tower_layers = st.session_state.get("tower_layers", [])

    # Handle compound commands (multiple atomic operations)
    if parsed.get("action") == "compound":
        commands = parsed.get("commands", [])
        results = []
        for cmd_obj in commands:
            result = _execute_atomic_command(sub_id, cmd_obj, tower_layers)
            results.append(result)
            # Refresh tower_layers after each command (it may have been modified)
            tower_layers = st.session_state.get("tower_layers", [])

        # Summarize results
        successes = [r for r in results if r.get("success")]
        failures = [r for r in results if not r.get("success")]

        if successes and not failures:
            msgs = [r.get("message", "") for r in successes]
            return {"success": True, "message": " | ".join(msgs)}
        elif failures:
            msgs = [r.get("message", "") for r in failures]
            return {"success": False, "message": "Some commands failed: " + "; ".join(msgs)}
        else:
            return {"success": False, "message": "No commands executed"}

    # Handle atomic commands (new command-based approach)
    cmd = parsed.get("cmd")
    if cmd:
        return _execute_atomic_command(sub_id, parsed, tower_layers)

    # Legacy: handle build/add/update actions
    action = parsed.get("action", "add")
    layers = parsed.get("layers", [])
    retention = parsed.get("retention")

    if action == "build":
        # Replace entire tower
        tower_layers = []
        for layer in layers:
            tower_layers.append({
                "carrier": layer.get("carrier", "Unknown"),
                "limit": layer.get("limit", 0),
                "attachment": layer.get("attachment", 0),
                "premium": layer.get("premium"),
                "rpm": None,
            })

        # Sort by attachment and recalculate
        tower_layers.sort(key=lambda x: x.get("attachment", 0))
        _recalculate_attachments(tower_layers)
        _calculate_rpm_ilf(tower_layers)

        st.session_state.tower_layers = tower_layers

        # Set retention
        if retention:
            st.session_state.primary_retention = retention
            if tower_layers:
                tower_layers[0]["retention"] = retention

        # Also create as single quote option for excess
        _create_tower_option(sub_id, tower_layers, retention)

        layer_summary = ", ".join([f"{l['carrier']} ${_format_short(l['limit'])}" for l in tower_layers])
        msg = f"Built tower: {layer_summary}"
        if retention:
            msg += f" | Retention: ${_format_short(retention)}"
        return {"success": True, "message": msg}

    elif action == "add":
        # Add layers to existing tower
        for layer in layers:
            tower_layers.append({
                "carrier": layer.get("carrier", "Unknown"),
                "limit": layer.get("limit", 0),
                "attachment": layer.get("attachment", 0),
                "premium": layer.get("premium"),
                "rpm": None,
            })

        tower_layers.sort(key=lambda x: x.get("attachment", 0))
        _recalculate_attachments(tower_layers)
        _calculate_rpm_ilf(tower_layers)

        st.session_state.tower_layers = tower_layers

        added = layers[0] if layers else {}
        return {"success": True, "message": f"Added {added.get('carrier', 'layer')} ${_format_short(added.get('limit', 0))}"}

    elif action == "update":
        # AI returns ALL layers (modified and unmodified) - replace the tower
        tower_layers = []
        for layer in layers:
            tower_layers.append({
                "carrier": layer.get("carrier", "Unknown"),
                "limit": layer.get("limit", 0),
                "attachment": layer.get("attachment", 0),
                "premium": layer.get("premium"),
                "rpm": None,
            })

        tower_layers.sort(key=lambda x: x.get("attachment", 0))
        _recalculate_attachments(tower_layers)
        _calculate_rpm_ilf(tower_layers)

        st.session_state.tower_layers = tower_layers

        if retention:
            st.session_state.primary_retention = retention
            if tower_layers:
                tower_layers[0]["retention"] = retention

        return {"success": True, "message": "Tower updated"}

    elif action == "remove":
        return {"success": False, "message": "Remove not implemented yet. Try: 'remove layer 2'"}

    return {"success": False, "message": "Unknown action"}


def _create_tower_option(sub_id: str, tower_layers: list, retention: Optional[int]):
    """Create a quote option from the tower structure for excess position."""
    from pages_components.quote_options_cards import add_quote_options

    # Find CMAI layer in tower
    cmai_layer = None
    for layer in tower_layers:
        if "CMAI" in str(layer.get("carrier", "")).upper():
            cmai_layer = layer
            break

    if cmai_layer:
        option = {
            "limit": cmai_layer.get("limit", 0),
            "retention": retention or 0,
            "premium": cmai_layer.get("premium"),
            "tower": tower_layers,  # Store full tower structure
        }
        add_quote_options(sub_id, [option])


def _recalculate_attachments(layers: list) -> None:
    """
    Recalculate attachments for all layers based on cumulative limits.
    Layer 0 (primary): attachment = 0
    Layer N (excess): attachment = sum of limits from layers 0 to N-1
    """
    if not layers:
        return

    running_attachment = 0
    for idx, layer in enumerate(layers):
        if idx == 0:
            layer["attachment"] = 0  # Primary layer
        else:
            layer["attachment"] = running_attachment
        running_attachment += layer.get("limit", 0) or 0


def _calculate_rpm_ilf(layers: list) -> None:
    """
    Calculate RPM and ILF for all layers.
    RPM = Premium / (Limit in millions)
    ILF = Layer RPM / Primary RPM
    """
    if not layers:
        return

    # First pass: calculate RPM for all layers with premium
    for layer in layers:
        premium = layer.get("premium")
        limit = layer.get("limit", 0) or 0
        if premium and limit:
            exposure = limit / 1_000_000.0
            if exposure > 0:
                layer["rpm"] = premium / exposure
            else:
                layer["rpm"] = None
        else:
            layer["rpm"] = None

    # Second pass: calculate ILF based on primary RPM
    primary = layers[0] if layers else {}
    base_rpm = primary.get("rpm")

    for layer in layers:
        layer_rpm = layer.get("rpm")
        if base_rpm and layer_rpm:
            layer["ilf"] = f"{layer_rpm / base_rpm:.2f}"
        else:
            layer["ilf"] = None


def _handle_tower_command_fallback(sub_id: str, command: str) -> dict:
    """Fallback regex-based tower command parsing."""
    tower_layers = st.session_state.get("tower_layers", [])
    cmd_lower = command.lower()

    # Pattern: add CMAI/carrier $XM xs $YM
    add_match = re.search(
        r'add\s+(cmai|[\w\s]+?)\s*\$?(\d+(?:\.\d+)?)\s*([mk])?\s*(?:xs|excess|over)\s*\$?(\d+(?:\.\d+)?)\s*([mk])?',
        cmd_lower
    )
    if add_match:
        carrier = add_match.group(1).strip().upper()
        if carrier == "CMAI":
            carrier = "CMAI"
        else:
            carrier = add_match.group(1).strip().title()

        limit = _parse_amount(add_match.group(2), add_match.group(3))
        attachment = _parse_amount(add_match.group(4), add_match.group(5))

        tower_layers.append({
            "carrier": carrier,
            "limit": limit,
            "attachment": attachment,
            "premium": None,
            "rpm": None,
        })
        tower_layers.sort(key=lambda x: x.get("attachment", 0))
        _recalculate_attachments(tower_layers)
        _calculate_rpm_ilf(tower_layers)
        st.session_state.tower_layers = tower_layers
        return {"success": True, "message": f"Added {carrier} ${_format_short(limit)} xs ${_format_short(attachment)}"}

    # Pattern: remove layer N
    remove_match = re.search(r'remove\s+layer\s+(\d+)', cmd_lower)
    if remove_match:
        layer_num = int(remove_match.group(1)) - 1
        if 0 <= layer_num < len(tower_layers):
            removed = tower_layers.pop(layer_num)
            _recalculate_attachments(tower_layers)
            _calculate_rpm_ilf(tower_layers)
            st.session_state.tower_layers = tower_layers
            return {"success": True, "message": f"Removed layer {layer_num + 1} ({removed.get('carrier', 'Unknown')})"}
        return {"success": False, "message": f"Layer {layer_num + 1} not found"}

    return {"success": False, "message": "Could not parse tower command. Try: 'XL primary $5M, CMAI $5M xs $5M'"}


# ═══════════════════════════════════════════════════════════════════════════════
# COVERAGE HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

def _handle_coverage_command(sub_id: str, command: str) -> dict:
    """Handle coverage-related commands."""
    try:
        session_key = f"coverages_{sub_id}"
        coverages = st.session_state.get(session_key, [])

        result = _ai_parse_coverage_command(command, coverages)
        if result:
            action = result.get("action")
            coverage_name = result.get("coverage_name", "")
            amount = result.get("amount", 0)

            if action == "set" and coverage_name:
                target_lower = coverage_name.lower()
                for cov in coverages:
                    cov_name_lower = cov.get("coverage", "").lower()
                    if target_lower in cov_name_lower or _fuzzy_match(target_lower, cov_name_lower):
                        cov["primary_limit"] = amount
                        cov["our_limit"] = amount
                        st.session_state[session_key] = coverages
                        return {"success": True, "message": f"Set {cov['coverage']} to ${_format_short(amount)}"}
                return {"success": False, "message": f"Coverage '{coverage_name}' not found"}

            elif action == "add" and coverage_name:
                coverages.append({
                    "coverage": coverage_name.title(),
                    "primary_limit": amount,
                    "is_sublimit": True,
                    "treatment": "included",
                    "our_limit": amount,
                    "our_attachment": 0,
                })
                st.session_state[session_key] = coverages
                return {"success": True, "message": f"Added {coverage_name.title()} at ${_format_short(amount)}"}

            elif action == "remove" and coverage_name:
                original_len = len(coverages)
                target_lower = coverage_name.lower()
                coverages = [cov for cov in coverages
                            if not (target_lower in cov.get("coverage", "").lower()
                                   or _fuzzy_match(target_lower, cov.get("coverage", "").lower()))]
                if len(coverages) < original_len:
                    st.session_state[session_key] = coverages
                    return {"success": True, "message": f"Removed coverage matching '{coverage_name}'"}
                return {"success": False, "message": f"Coverage '{coverage_name}' not found"}

        return {"success": False, "message": "Could not parse coverage command. Try: 'set social engineering to 250K'"}

    except Exception as e:
        return {"success": False, "message": f"Error: {e}"}


def _ai_parse_coverage_command(command: str, coverages: list) -> dict:
    """Use AI to parse coverage command."""
    try:
        import openai
        import json
        import os

        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        coverage_names = [cov.get("coverage", "") for cov in coverages]
        coverage_list = ", ".join(coverage_names) if coverage_names else "No coverages defined yet"

        prompt = f"""Parse this insurance coverage command.

Command: "{command}"
Existing coverages: {coverage_list}

Return JSON with:
- "action": "set", "add", or "remove"
- "coverage_name": coverage being referenced
- "amount": dollar amount (convert K/M to numbers)

Return ONLY valid JSON."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=200
        )

        result_text = response.choices[0].message.content.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        return json.loads(result_text.strip())

    except Exception:
        return None


def _fuzzy_match(target: str, candidate: str) -> bool:
    """Simple fuzzy matching for coverage names."""
    aliases = {
        "se": "social engineering",
        "ftf": "funds transfer fraud",
        "bi": "business interruption",
        "ransom": "ransomware",
        "crypto": "cryptojacking",
    }
    if target in aliases:
        return aliases[target] in candidate
    target_words = target.split()
    return all(word in candidate for word in target_words)


# ═══════════════════════════════════════════════════════════════════════════════
# AI ROUTING FALLBACK
# ═══════════════════════════════════════════════════════════════════════════════

def _handle_ai_routing(sub_id: str, command: str) -> dict:
    """Try AI to route ambiguous commands."""
    # Try options first (most common for quick quotes)
    result = _ai_parse_options_command(command)
    if result and result.get("limits"):
        return _apply_options(sub_id, result)

    # Try tower
    result = _ai_parse_tower_command(command)
    if result and result.get("layers"):
        return _apply_tower_changes(sub_id, result)

    return {
        "success": False,
        "message": "Command not recognized. Try '1M, 3M, 5M at 50K retention' for options or 'XL primary $5M, CMAI xs $5M' for tower."
    }


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_amount(value: str, suffix: str = None) -> int:
    """Parse amount with optional K/M suffix."""
    try:
        num = float(value)
        if suffix:
            suffix = suffix.lower()
            if suffix == 'k':
                return int(num * 1_000)
            elif suffix == 'm':
                return int(num * 1_000_000)
        if num >= 1000:
            return int(num)
        return int(num * 1_000_000)  # Assume millions for small numbers
    except (ValueError, TypeError):
        return 0


def _format_short(amount: int) -> str:
    """Format amount as short string (1M, 500K, etc.)"""
    if not amount:
        return "0"
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"{int(amount // 1_000_000)}M"
    if amount >= 1_000 and amount % 1_000 == 0:
        return f"{int(amount // 1_000)}K"
    return f"{amount:,}"
