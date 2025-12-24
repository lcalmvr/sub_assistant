"""
Seed Compliance Rules
====================
Populates the compliance_rules table with initial compliance requirements
"""

import sys
import os
from datetime import date

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from core.compliance_management import create_compliance_rule
from core.db import get_conn
from sqlalchemy import text


def check_table_exists() -> bool:
    """Check if compliance_rules table exists."""
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'compliance_rules'
            )
        """))
        return result.fetchone()[0]


def seed_compliance_rules():
    """Seed the compliance_rules table with initial data."""
    
    if not check_table_exists():
        print("❌ compliance_rules table does not exist. Please run create_compliance_rules.sql first.")
        return
    
    print("🌱 Seeding compliance rules...")
    
    rules = [
        # OFAC Rules
        {
            "code": "OFAC-001",
            "title": "OFAC SDN List Screening Requirement",
            "category": "ofac",
            "subcategory": "screening",
            "rule_type": "automatic_check",
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["quote", "binder", "policy", "renewal"],
            "description": "All applicants, policyholders, beneficiaries, and claimants must be screened against the OFAC Specially Designated Nationals (SDN) list. Transactions with blocked parties are prohibited.",
            "requirements": "1. Screen all parties against SDN list at application, policy changes, claims processing, and payments\n2. If match found, block transaction immediately\n3. Report to OFAC within 10 business days",
            "procedures": "1. Implement automated screening system using OFAC SDN list\n2. Screen names of all insured entities, officers, and beneficiaries\n3. Monitor for false positives using name matching algorithms\n4. Document all screening results\n5. Maintain records for 5 years",
            "legal_reference": "31 CFR Part 501, Office of Foreign Assets Control Regulations",
            "source_url": "https://ofac.treasury.gov/faqs/62",
            "check_config": {
                "field": "insured_name",
                "check": "ofac_screening",
                "required": True,
                "message": "OFAC screening required for all parties"
            },
            "priority": "critical",
            "status": "active"
        },
        {
            "code": "OFAC-002",
            "title": "OFAC Blocking and Reporting Requirements",
            "category": "ofac",
            "subcategory": "reporting",
            "rule_type": "requirement",
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["quote", "binder", "policy"],
            "description": "If an OFAC match is identified, the transaction must be blocked and reported to OFAC within 10 business days.",
            "requirements": "1. Block transaction immediately upon positive match\n2. Do not process policy, premium payment, or claims\n3. Report to OFAC using Form TD F 90-22.50 within 10 business days\n4. Maintain all related records",
            "procedures": "1. Stop all processing upon positive OFAC match\n2. Notify compliance officer immediately\n3. Prepare blocking report with all transaction details\n4. File report with OFAC via online portal or mail\n5. Retain all documentation",
            "legal_reference": "31 CFR 501.603",
            "source_url": "https://ofac.treasury.gov/faqs/63",
            "priority": "critical",
            "status": "active"
        },
        
        # Service of Suit Rules
        {
            "code": "SOS-001",
            "title": "Service of Suit Clause - General Requirement",
            "category": "service_of_suit",
            "subcategory": "clause_requirement",
            "rule_type": "requirement",
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["binder", "policy"],
            "description": "Service of Suit clauses designate an agent within a jurisdiction to accept legal documents on behalf of the insurer, ensuring compliance with local legal processes and demonstrating commitment to jurisdictional compliance.",
            "requirements": "Include a Service of Suit clause in all policies to facilitate legal proceedings in the insured's jurisdiction",
            "procedures": "1. Identify the appropriate Service of Suit agent for the jurisdiction\n2. Include standard Service of Suit endorsement in policy documents\n3. Ensure agent is authorized to accept service of process\n4. Document agent information in policy file",
            "legal_reference": "NAIC Service of Suit Model Regulation",
            "priority": "high",
            "requires_endorsement": True,
            "required_endorsement_code": "SOS-END-001",
            "status": "active"
        },
        {
            "code": "SOS-CA-001",
            "title": "California Service of Suit Requirement",
            "category": "service_of_suit",
            "subcategory": "state_specific",
            "rule_type": "requirement",
            "applies_to_states": ["CA"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["binder", "policy"],
            "description": "California requires Service of Suit clauses for surplus lines insurers. The clause must designate a California-licensed agent or the California Insurance Commissioner as agent for service of process.",
            "requirements": "Service of Suit clause must be included in all surplus lines policies issued to California residents or risks",
            "procedures": "1. Include Service of Suit clause in policy\n2. Designate California-licensed agent or Insurance Commissioner\n3. Ensure clause meets California Insurance Code requirements\n4. File copy with surplus lines broker",
            "legal_reference": "California Insurance Code Section 1764.5",
            "priority": "high",
            "requires_endorsement": True,
            "status": "active"
        },
        
        # NYFTZ Rules
        {
            "code": "NYFTZ-001",
            "title": "NY Free Trade Zone - Class 1 Eligibility",
            "category": "nyftz",
            "subcategory": "eligibility",
            "rule_type": "automatic_check",
            "applies_to_states": ["NY"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["quote", "binder"],
            "description": "Policies with annual premiums of at least \\$100,000 for one kind of insurance, or \\$200,000 for multiple kinds (with no single kind exceeding \\$100,000) qualify for issuance in the New York Free Trade Zone.",
            "requirements": "1. Premium must meet minimum thresholds\n2. Insurer must hold special risk license under Article 63 of NY Insurance Law\n3. Required reports must be filed with NYDFS",
            "procedures": "1. Calculate total annual premium\n2. Determine if premium thresholds are met\n3. Verify insurer holds Article 63 license\n4. Mark policy as NYFTZ eligible if criteria met\n5. File required reports with NYDFS",
            "legal_reference": "NY Insurance Law Article 63, NYDFS Regulation 41",
            "source_url": "https://www.dfs.ny.gov/apps_and_licensing/property_insurers/free_trade_zone_faqs",
            "check_config": {
                "field": "annual_premium",
                "condition": "gte",
                "value": 100000,
                "message": "NYFTZ eligible - Premium threshold met",
                "jurisdiction": "NY"
            },
            "priority": "high",
            "status": "active"
        },
        {
            "code": "NYFTZ-CYBER-001",
            "title": "NYFTZ Cyber Insurance - DFS Cybersecurity Regulation",
            "category": "nyftz",
            "subcategory": "cyber",
            "rule_type": "requirement",
            "applies_to_states": ["NY"],
            "applies_to_products": ["cyber"],
            "applies_to_lifecycle_stage": ["quote", "binder", "policy"],
            "description": "Cyber insurance policies issued in New York must comply with NYDFS Cybersecurity Regulation (23 NYCRR Part 500), which mandates comprehensive cybersecurity programs, risk assessments, multi-factor authentication, and incident reporting for covered entities.",
            "requirements": "1. Verify insured entity compliance with NYDFS Part 500 if applicable\n2. Include cybersecurity requirements in policy terms\n3. Ensure incident reporting requirements align with NYDFS 72-hour reporting rule\n4. Document cybersecurity program assessments",
            "procedures": "1. Determine if insured is a Covered Entity under Part 500\n2. Review insured's cybersecurity program documentation\n3. Verify compliance with key requirements (MFA, encryption, access controls)\n4. Document compliance status in underwriting file\n5. Include appropriate policy terms reflecting NYDFS requirements",
            "legal_reference": "23 NYCRR Part 500, NYDFS Cybersecurity Regulation",
            "source_url": "https://www.dfs.ny.gov/industry_guidance/cybersecurity",
            "priority": "high",
            "status": "active"
        },
        {
            "code": "NYFTZ-002",
            "title": "NYFTZ Reporting Requirements",
            "category": "nyftz",
            "subcategory": "reporting",
            "rule_type": "requirement",
            "applies_to_states": ["NY"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["policy"],
            "description": "Insurers writing in the NY Free Trade Zone must file Annual Free Trade Zone Reports and Schedule C-1 quarterly filings with the NYDFS.",
            "requirements": "1. File Annual Free Trade Zone Report annually\n2. File Schedule C-1 quarterly reports\n3. Maintain records of all NYFTZ policies\n4. Report aggregate premiums and policy counts",
            "procedures": "1. Track all NYFTZ policies in reporting system\n2. Prepare quarterly Schedule C-1 filings\n3. Prepare annual FTZ report by deadline\n4. Submit reports to NYDFS via designated portal\n5. Maintain copies of all filed reports",
            "legal_reference": "NY Insurance Law Article 63, NYDFS Regulation 41",
            "source_url": "https://www.dfs.ny.gov/apps_and_licensing/property_insurers/free_trade_zone",
            "priority": "high",
            "status": "active"
        },
        
        # State-Based Rules
        {
            "code": "STATE-CA-CANCEL-001",
            "title": "California Cancellation Notice Requirements",
            "category": "state_rule",
            "subcategory": "cancellation",
            "rule_type": "requirement",
            "applies_to_states": ["CA"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["policy", "midterm"],
            "description": "California requires specific notice periods and content for policy cancellations. For non-payment, 10 days notice is required. For other reasons, 30-60 days notice depending on circumstances.",
            "requirements": "1. Provide written notice to insured and broker\n2. Include required statutory language\n3. Meet minimum notice periods\n4. Provide reason for cancellation if required",
            "procedures": "1. Determine reason for cancellation\n2. Calculate required notice period\n3. Prepare cancellation notice with required language\n4. Send via certified mail or approved method\n5. Document delivery date and method",
            "legal_reference": "California Insurance Code Section 677.2",
            "priority": "high",
            "requires_notice": True,
            "status": "active"
        },
        {
            "code": "STATE-FL-SURPLUS-001",
            "title": "Florida Surplus Lines Stamping Requirement",
            "category": "notice_stamping",
            "subcategory": "surplus_lines",
            "rule_type": "requirement",
            "applies_to_states": ["FL"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["binder", "policy"],
            "description": "Florida requires all surplus lines policies to be filed with and stamped by the Florida Surplus Lines Service Office (FSLSO). Stamping must occur within 30 days of binding.",
            "requirements": "1. File policy with FSLSO within 30 days of binding\n2. Pay applicable stamping fee\n3. Include required policy information\n4. Obtain stamping certificate",
            "procedures": "1. Prepare policy for filing with FSLSO\n2. Submit policy documents via FSLSO portal\n3. Pay stamping fee (typically 0.15% of premium)\n4. Receive stamped policy back from FSLSO\n5. Maintain stamped policy in file",
            "legal_reference": "Florida Statutes Section 626.918",
            "source_url": "https://www.fslso.com",
            "priority": "high",
            "requires_stamping": True,
            "stamping_office": "FSLSO",
            "status": "active"
        },
        {
            "code": "STATE-TX-SURPLUS-001",
            "title": "Texas Surplus Lines Stamping Requirement",
            "category": "notice_stamping",
            "subcategory": "surplus_lines",
            "rule_type": "requirement",
            "applies_to_states": ["TX"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["binder", "policy"],
            "description": "Texas requires surplus lines policies to be filed with the Texas Surplus Lines Stamping Office (TSLSO) within 30 days of binding. Stamping fee is 0.175% of premium.",
            "requirements": "1. File policy with TSLSO within 30 days\n2. Pay stamping fee (0.175% of premium)\n3. Include all required declarations and forms\n4. Obtain stamping confirmation",
            "procedures": "1. Prepare policy package for TSLSO filing\n2. Submit via TSLSO online system\n3. Calculate and pay stamping fee\n4. Receive stamped confirmation\n5. File stamped copy in policy record",
            "legal_reference": "Texas Insurance Code Section 981.004",
            "source_url": "https://www.tslso.com",
            "priority": "high",
            "requires_stamping": True,
            "stamping_office": "TSLSO",
            "status": "active"
        },
        {
            "code": "STATE-NY-DISCLOSURE-001",
            "title": "New York Surplus Lines Disclosure Notice",
            "category": "state_rule",
            "subcategory": "disclosure",
            "rule_type": "requirement",
            "applies_to_states": ["NY"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["quote", "binder"],
            "description": "New York requires surplus lines brokers to provide a disclosure notice to insureds explaining that the policy is not protected by the New York State Security Fund and providing other important information.",
            "requirements": "1. Provide disclosure notice before binding\n2. Obtain signed acknowledgment from insured\n3. Include required statutory language\n4. Maintain signed notice in file",
            "procedures": "1. Prepare NY Surplus Lines Disclosure Notice\n2. Present to insured before binding\n3. Obtain written acknowledgment\n4. Include notice in policy package\n5. Retain signed notice permanently",
            "legal_reference": "NY Insurance Law Section 2118",
            "priority": "high",
            "requires_notice": True,
            "notice_text": "This insurance is placed with an insurer not licensed by the State of New York. In the event of the insolvency of the insurer, losses will not be paid by the New York State Security Fund.",
            "status": "active"
        },
        {
            "code": "STATE-IL-SURPLUS-001",
            "title": "Illinois Surplus Lines Tax and Filing",
            "category": "notice_stamping",
            "subcategory": "tax_filing",
            "rule_type": "requirement",
            "applies_to_states": ["IL"],
            "applies_to_products": ["cyber", "tech_eo", "both"],
            "applies_to_lifecycle_stage": ["policy"],
            "description": "Illinois requires surplus lines policies to be filed with the Illinois Department of Insurance and requires payment of surplus lines tax (3% of premium).",
            "requirements": "1. File policy with IL DOI\n2. Pay 3% surplus lines tax\n3. File within 30 days of binding\n4. Maintain filing records",
            "procedures": "1. Calculate surplus lines tax (3% of premium)\n2. Prepare policy filing package\n3. Submit to IL DOI with tax payment\n4. Obtain filing confirmation\n5. Record tax payment in accounting system",
            "legal_reference": "215 ILCS 5/445",
            "priority": "high",
            "requires_stamping": True,
            "stamping_office": "IL DOI",
            "status": "active"
        },
    ]
    
    created_count = 0
    skipped_count = 0
    
    for rule in rules:
        try:
            # Check if rule already exists
            with get_conn() as conn:
                result = conn.execute(text("SELECT id FROM compliance_rules WHERE code = :code"), {"code": rule["code"]})
                if result.fetchone():
                    print(f"⏭️  Skipping {rule['code']} - already exists")
                    skipped_count += 1
                    continue
            
            # Create the rule
            rule_id = create_compliance_rule(**rule, created_by="system")
            print(f"✅ Created {rule['code']}: {rule['title']}")
            created_count += 1
            
        except Exception as e:
            print(f"❌ Error creating {rule['code']}: {e}")
    
    print(f"\n📊 Summary: Created {created_count} rules, skipped {skipped_count} existing rules")


if __name__ == "__main__":
    seed_compliance_rules()

