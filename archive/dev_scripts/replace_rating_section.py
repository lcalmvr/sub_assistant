#!/usr/bin/env python3
"""
Replace the rating section in viewer_with_modular_rating.py with the modular component call
"""

def replace_rating_section():
    # Read the file
    with open('viewer_with_modular_rating.py', 'r') as f:
        lines = f.readlines()
    
    # Find the start and end of the rating section
    start_line = None
    end_line = None
    
    for i, line in enumerate(lines):
        if "# ------------------- Rating --------------------" in line:
            start_line = i
        elif "# ------------------- Feedback History --------------------" in line:
            end_line = i
            break
    
    if start_line is None or end_line is None:
        print("Could not find rating section boundaries")
        return
    
    print(f"Found rating section: lines {start_line + 1} to {end_line}")
    
    # Create the replacement text
    replacement = [
        "    # ------------------- Rating --------------------\n",
        "    render_rating_panel(sub_id, get_conn)\n",
        "    \n"
    ]
    
    # Replace the section
    new_lines = lines[:start_line] + replacement + lines[end_line:]
    
    # Write back to file
    with open('viewer_with_modular_rating.py', 'w') as f:
        f.writelines(new_lines)
    
    removed_lines = end_line - start_line - len(replacement)
    print(f"✅ Replaced {end_line - start_line} lines with {len(replacement)} lines")
    print(f"✅ Removed {removed_lines} lines of rating code")
    print(f"✅ Updated viewer_with_modular_rating.py")

if __name__ == "__main__":
    replace_rating_section()