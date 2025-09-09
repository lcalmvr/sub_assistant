#!/usr/bin/env python3
"""
Test script for controls parsing function
"""

from app.pipeline import parse_controls_from_summary

# Test case matching your submission's bullet summary
test_bullet_summary = """
• Endpoint Detection and Response (EDR): CrowdStrike is used, implying EDR capabilities.
• Multi-Factor Authentication (MFA): Email MFA is enabled for remote access.
• Patch Management: Central patch management with critical patches within 1 week.
• Network Security: Traditional/Next-Gen Firewall and IDS/IPS are deployed.
"""

test_nist_summary = """
## Protect ✅
Strong controls implemented including endpoint protection via CrowdStrike and MFA for remote access.

## Detect ⚠️ 
Intrusion detection systems present but coverage details unclear.
"""

def test_parsing():
    print("Testing controls parsing function...")
    print(f"Input bullet summary: {test_bullet_summary}")
    print(f"Input NIST summary: {test_nist_summary}")
    
    result = parse_controls_from_summary(test_bullet_summary, test_nist_summary)
    print(f"Parsed controls: {result}")
    
    # Expected: should detect MFA, EDR based on the patterns
    expected_controls = ["MFA", "EDR"]
    
    for control in expected_controls:
        if control in result:
            print(f"✅ {control} correctly detected")
        else:
            print(f"❌ {control} NOT detected (expected)")
    
    print(f"\nFinal parsed controls list: {result}")
    return result

if __name__ == "__main__":
    test_parsing()