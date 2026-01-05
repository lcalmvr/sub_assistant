-- Seed the initial extraction schema for ransomware/cyber applications
-- Based on common fields across At Bay, Axis, Coalition, and other carriers

INSERT INTO extraction_schemas (id, name, version, description, is_active, schema_definition, created_by)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Cyber Ransomware Application',
    1,
    'Standard schema for cyber insurance and ransomware supplemental applications',
    true,
    '{
        "generalInformation": {
            "description": "Basic information about the applicant",
            "displayName": "General Information",
            "displayOrder": 1,
            "fields": {
                "applicantName": {"type": "string", "displayName": "Applicant Name", "description": "Legal name of the applying organization"},
                "dba": {"type": "string", "displayName": "DBA", "description": "Doing business as name if different"},
                "primaryIndustry": {"type": "string", "displayName": "Primary Industry", "description": "Main business industry or NAICS code"},
                "annualRevenue": {"type": "number", "displayName": "Annual Revenue", "description": "Total annual revenue in USD"},
                "employeeCount": {"type": "number", "displayName": "Employee Count", "description": "Total number of employees"},
                "websiteDomain": {"type": "string", "displayName": "Website/Email Domain", "description": "Primary web and email domain"}
            }
        },
        "securityManagement": {
            "description": "IT infrastructure and security management practices",
            "displayName": "Security Management",
            "displayOrder": 2,
            "fields": {
                "networkManagement": {"type": "enum", "displayName": "Network Infrastructure Management", "description": "Who manages network infrastructure", "enumValues": ["in-house", "outsourced", "hybrid"]},
                "securityManagement": {"type": "enum", "displayName": "Security Management", "description": "Who manages security operations", "enumValues": ["in-house", "outsourced", "hybrid"]},
                "hasMdr": {"type": "boolean", "displayName": "Has MDR/Third-Party Monitoring", "description": "Uses managed detection and response service"},
                "mdr24x7": {"type": "boolean", "displayName": "MDR 24/7 Coverage", "description": "MDR provides round-the-clock monitoring"},
                "hasSoc": {"type": "boolean", "displayName": "Has SOC", "description": "Has security operations center"},
                "socIs24x7": {"type": "boolean", "displayName": "SOC 24/7 Coverage", "description": "SOC operates 24/7"},
                "hasEndOfLifeSoftware": {"type": "boolean", "displayName": "End-of-Life Software", "description": "Uses software past end-of-life/support"}
            }
        },
        "patchManagement": {
            "description": "Patch management practices and timelines",
            "displayName": "Patch Management",
            "displayOrder": 3,
            "fields": {
                "hasCentralPatchManagement": {"type": "boolean", "displayName": "Centralized Patch Management", "description": "Uses centralized patch management system"},
                "criticalPatchTimeframe": {"type": "enum", "displayName": "Critical Patch Timeframe", "description": "Time to deploy critical/emergency patches", "enumValues": ["24-hours", "48-hours", "7-days", "14-days", "30-days", "more-than-30-days"]},
                "normalPatchTimeframe": {"type": "enum", "displayName": "Normal Patch Timeframe", "description": "Time to deploy routine patches", "enumValues": ["7-days", "14-days", "30-days", "60-days", "90-days", "more-than-90-days"]}
            }
        },
        "accessManagement": {
            "description": "Access control and authentication practices",
            "displayName": "Access Management",
            "displayOrder": 4,
            "fields": {
                "hasSso": {"type": "boolean", "displayName": "Single Sign-On (SSO)", "description": "Uses SSO for user authentication"},
                "emailMfa": {"type": "boolean", "displayName": "Email MFA", "description": "MFA required for email access"},
                "remoteMfa": {"type": "boolean", "displayName": "Remote Access MFA", "description": "MFA required for remote/VPN access"},
                "adminMfa": {"type": "boolean", "displayName": "Admin/Privileged MFA", "description": "MFA required for privileged accounts"},
                "mfaMethods": {"type": "array", "displayName": "MFA Methods", "description": "Types of MFA in use", "enumValues": ["authenticator-app", "hardware-token", "sms", "email", "biometric", "push-notification"]},
                "hasPasswordManager": {"type": "boolean", "displayName": "Password Manager", "description": "Uses enterprise password manager"},
                "hasPam": {"type": "boolean", "displayName": "Privileged Access Management", "description": "Uses PAM solution for privileged accounts"},
                "adminAccountCount": {"type": "number", "displayName": "Domain Admin Count", "description": "Number of domain admin accounts"},
                "monitorsAdminAccess": {"type": "boolean", "displayName": "Monitors Admin Access", "description": "Monitors/logs privileged account usage"}
            }
        },
        "networkSecurity": {
            "description": "Network security controls and segmentation",
            "displayName": "Network Security",
            "displayOrder": 5,
            "fields": {
                "hasFirewall": {"type": "boolean", "displayName": "Firewall", "description": "Has network firewall deployed"},
                "hasIds": {"type": "boolean", "displayName": "Intrusion Detection/Prevention", "description": "Has IDS/IPS deployed"},
                "hasNetworkSegmentation": {"type": "boolean", "displayName": "Network Segmentation", "description": "Network is segmented"},
                "segmentationBasis": {"type": "array", "displayName": "Segmentation Basis", "description": "How network is segmented", "enumValues": ["department", "data-sensitivity", "application", "environment"]}
            }
        },
        "endpointSecurity": {
            "description": "Endpoint protection and detection",
            "displayName": "Endpoint Security",
            "displayOrder": 6,
            "fields": {
                "hasEpp": {"type": "boolean", "displayName": "Endpoint Protection (EPP)", "description": "Has endpoint protection/antivirus"},
                "hasEdr": {"type": "boolean", "displayName": "Endpoint Detection & Response (EDR)", "description": "Has EDR solution deployed"},
                "edrEndpointCoverage": {"type": "number", "displayName": "EDR Endpoint Coverage %", "description": "Percentage of endpoints with EDR"},
                "edrServerCoverage": {"type": "number", "displayName": "EDR Server Coverage %", "description": "Percentage of servers with EDR"},
                "edrOnDomainControllers": {"type": "boolean", "displayName": "EPP/EDR on Domain Controllers", "description": "Domain controllers have EPP/EDR"}
            }
        },
        "emailSecurity": {
            "description": "Email security controls",
            "displayName": "Email Security",
            "displayOrder": 7,
            "fields": {
                "emailPlatform": {"type": "enum", "displayName": "Email Platform", "description": "Primary email platform", "enumValues": ["microsoft-365", "google-workspace", "on-premise-exchange", "other"]},
                "hasEmailFiltering": {"type": "boolean", "displayName": "Email Filtering/Gateway", "description": "Has email security gateway or filtering"},
                "hasEmailSandboxing": {"type": "boolean", "displayName": "Email Sandboxing", "description": "Sandboxes email attachments"},
                "hasDmarc": {"type": "boolean", "displayName": "DMARC Enabled", "description": "Has DMARC email authentication"},
                "hasPhishingReportButton": {"type": "boolean", "displayName": "Phishing Report Button", "description": "Users can report suspicious emails"}
            }
        },
        "remoteAccess": {
            "description": "Remote access and VPN configuration",
            "displayName": "Remote Access",
            "displayOrder": 8,
            "fields": {
                "allowsRemoteAccess": {"type": "boolean", "displayName": "Allows Remote Access", "description": "Employees can access network remotely"},
                "remoteAccessMfa": {"type": "boolean", "displayName": "Remote Access MFA", "description": "Remote access requires MFA"},
                "remoteAccessSolutions": {"type": "array", "displayName": "Remote Access Solutions", "description": "Methods for remote access", "enumValues": ["vpn", "ztna", "virtual-desktop", "rdp", "ssh"]},
                "rdpExposed": {"type": "boolean", "displayName": "RDP Internet Exposed", "description": "RDP accessible from internet"},
                "rdpMfa": {"type": "boolean", "displayName": "RDP MFA", "description": "RDP requires MFA"}
            }
        },
        "backupAndRecovery": {
            "description": "Backup strategy and disaster recovery",
            "displayName": "Backup And Recovery",
            "displayOrder": 9,
            "fields": {
                "hasBackups": {"type": "boolean", "displayName": "Has Backups", "description": "Maintains regular data backups"},
                "backupFrequency": {"type": "enum", "displayName": "Backup Frequency", "description": "How often critical data is backed up", "enumValues": ["real-time", "daily", "weekly", "monthly"]},
                "hasOffsiteBackups": {"type": "boolean", "displayName": "Offsite Backups", "description": "Stores backups offsite or in cloud"},
                "offsiteBackupFrequency": {"type": "enum", "displayName": "Offsite Backup Frequency", "description": "How often backups are sent offsite", "enumValues": ["daily", "weekly", "monthly", "quarterly", "none"]},
                "hasOfflineBackups": {"type": "boolean", "displayName": "Offline/Air-Gapped Backups", "description": "Maintains offline or air-gapped backups"},
                "offlineBackupFrequency": {"type": "enum", "displayName": "Offline Backup Frequency", "description": "How often offline backups are made", "enumValues": ["daily", "weekly", "monthly", "quarterly", "none"]},
                "backupsEncrypted": {"type": "boolean", "displayName": "Encrypted Backups", "description": "Backups are encrypted"},
                "uniqueBackupCredentials": {"type": "boolean", "displayName": "Unique Backup Credentials", "description": "Backup systems use separate credentials"},
                "testsBackupRestores": {"type": "boolean", "displayName": "Tests Backup Restores", "description": "Regularly tests backup restoration"},
                "backupTestFrequency": {"type": "enum", "displayName": "Backup Test Frequency", "description": "How often backup restores are tested", "enumValues": ["monthly", "quarterly", "annually", "never"]},
                "recoveryTimeObjective": {"type": "enum", "displayName": "Recovery Time Objective", "description": "Target time to restore critical systems", "enumValues": ["less-than-8-hours", "8-12-hours", "12-24-hours", "24-48-hours", "more-than-48-hours"]}
            }
        },
        "trainingAndAwareness": {
            "description": "Security awareness training programs",
            "displayName": "Training And Awareness",
            "displayOrder": 10,
            "fields": {
                "hasSecurityTraining": {"type": "boolean", "displayName": "Security Awareness Training", "description": "Provides security awareness training"},
                "trainingFrequency": {"type": "enum", "displayName": "Training Frequency", "description": "How often training is conducted", "enumValues": ["onboarding-only", "annually", "semi-annually", "quarterly", "monthly"]},
                "hasPhishingSimulations": {"type": "boolean", "displayName": "Phishing Simulations", "description": "Conducts phishing simulation exercises"},
                "phishingSimFrequency": {"type": "enum", "displayName": "Phishing Simulation Frequency", "description": "How often phishing tests are run", "enumValues": ["monthly", "quarterly", "semi-annually", "annually"]}
            }
        },
        "incidentResponse": {
            "description": "Incident response capabilities",
            "displayName": "Incident Response",
            "displayOrder": 11,
            "fields": {
                "hasIrPlan": {"type": "boolean", "displayName": "Incident Response Plan", "description": "Has documented IR plan"},
                "irPlanTested": {"type": "boolean", "displayName": "IR Plan Tested", "description": "IR plan has been tested"},
                "hasIrRetainer": {"type": "boolean", "displayName": "IR Retainer", "description": "Has incident response retainer with vendor"},
                "hasCyberInsurance": {"type": "boolean", "displayName": "Current Cyber Insurance", "description": "Has existing cyber insurance policy"}
            }
        }
    }'::jsonb,
    'system'
) ON CONFLICT (name, version) DO UPDATE SET
    schema_definition = EXCLUDED.schema_definition,
    updated_at = NOW();

-- Insert categories for easier querying (denormalized from schema_definition)
INSERT INTO schema_categories (schema_id, key, display_name, description, display_order)
SELECT
    'a0000000-0000-0000-0000-000000000001',
    key,
    (value->>'displayName')::text,
    (value->>'description')::text,
    (value->>'displayOrder')::integer
FROM jsonb_each(
    (SELECT schema_definition FROM extraction_schemas WHERE id = 'a0000000-0000-0000-0000-000000000001')
)
ON CONFLICT (schema_id, key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order;
