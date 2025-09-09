#!/usr/bin/env python3
"""
Script to move the documents section back to main content area in viewer.py
"""

def fix_documents_placement():
    # Read the current viewer.py file
    with open('viewer.py', 'r') as f:
        content = f.read()
    
    # Find the documents section in the sidebar
    docs_start = content.find('    # ------------------- documents --------------------')
    if docs_start == -1:
        print("Could not find documents section")
        return
    
    # Find the end of the sidebar (look for the next major section)
    sidebar_end = content.find('# ------------------- End Sidebar --------------------', docs_start)
    if sidebar_end == -1:
        # If no explicit end, find the next major section
        sidebar_end = content.find('    # -------------------', docs_start + 1)
        if sidebar_end == -1:
            print("Could not find end of sidebar")
            return
    
    # Extract the documents section
    documents_section = content[docs_start:sidebar_end]
    
    # Remove the documents section from the sidebar
    content_without_docs = content[:docs_start] + content[sidebar_end:]
    
    # Find where to insert the documents section in main content
    # Look for the end of the sidebar section
    sidebar_end_pos = content_without_docs.find('# ------------------- End Sidebar --------------------')
    if sidebar_end_pos == -1:
        print("Could not find end of sidebar section")
        return
    
    # Find the next line after the sidebar
    next_line = content_without_docs.find('\n', sidebar_end_pos)
    if next_line == -1:
        print("Could not find next line after sidebar")
        return
    
    # Insert the documents section into the main content
    # Remove the leading spaces from documents section to match main content indentation
    import re
    documents_section_main = re.sub(r'^    ', '', documents_section, flags=re.MULTILINE)
    
    new_content = (
        content_without_docs[:next_line] + 
        '\n' + documents_section_main +
        content_without_docs[next_line:]
    )
    
    # Write the modified content back
    with open('viewer.py', 'w') as f:
        f.write(new_content)
    
    print("Successfully moved documents section back to main content")

if __name__ == "__main__":
    fix_documents_placement()

