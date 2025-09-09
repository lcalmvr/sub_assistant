#!/usr/bin/env python3
"""
Direct test of controls parsing logic without imports
"""
import re

def parse_controls_from_summary(bullet_summary: str, nist_summary: str = "") -> list[str]:
    """
    Extract structured controls list from text summaries for rating engine.
    Returns list of control slugs matching control_modifiers.yml (MFA, EDR, Backups, Phishing).
    """
    combined_text = (bullet_summary + " " + nist_summary).lower()
    controls = []
    
    # MFA detection - broad patterns for multi-factor authentication
    mfa_patterns = [
        r"multi[- ]?factor", r"two[- ]?factor", r"2fa", r"mfa",
        r"authenticator", r"auth.*app", r"totp", r"sso.*mfa",
        r"email.*mfa", r"remote.*mfa", r"access.*mfa"
    ]
    if any(re.search(pattern, combined_text) for pattern in mfa_patterns):
        controls.append("MFA")
    
    # EDR detection - endpoint detection and response tools
    edr_patterns = [
        r"edr", r"endpoint.*detection", r"crowdstrike", r"sentinelone", 
        r"carbon.*black", r"microsoft.*defender.*atp", r"cylance",
        r"cortex.*xdr", r"managed.*detection", r"mdr.*provider"
    ]
    if any(re.search(pattern, combined_text) for pattern in edr_patterns):
        controls.append("EDR")
    
    # Backups detection
    backup_patterns = [
        r"backup", r"restore", r"recovery", r"snapshot",
        r"offsite.*storage", r"cloud.*storage", r"disaster.*recovery"
    ]
    if any(re.search(pattern, combined_text) for pattern in backup_patterns):
        controls.append("Backups")
    
    # Phishing training detection
    phishing_patterns = [
        r"phishing.*train", r"phishing.*simulat", r"security.*awareness",
        r"awareness.*train", r"phishing.*test", r"social.*engineering.*train"
    ]
    if any(re.search(pattern, combined_text) for pattern in phishing_patterns):
        controls.append("Phishing")
    
    return controls

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