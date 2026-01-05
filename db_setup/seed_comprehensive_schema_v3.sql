-- Comprehensive Cyber Insurance Extraction Schema v3
-- Generated from analysis of 12 carrier training applications
-- Categories: 19, Fields: 220

BEGIN;

-- First, deactivate any existing active schemas
UPDATE extraction_schemas SET is_active = false WHERE is_active = true;

-- Insert the new comprehensive schema
INSERT INTO extraction_schemas (
    version,
    name,
    description,
    is_active,
    schema_definition,
    created_by
) VALUES (
    3,
    'Comprehensive Cyber Insurance Schema',
    'Schema derived from analysis of 12 carrier applications including Coalition, At Bay, Corvus, Cowbell, AIG, Axis, and others. Covers 19 categories with 220 fields.',
    true,
    $SCHEMA$
{
  "companyProfile": {
    "displayName": "Company Profile",
    "description": "Basic company information and business operations",
    "fields": {
      "legalName": {
        "displayName": "Legal Entity Name",
        "type": "string",
        "description": "Full legal name of the applicant"
      },
      "dba": {
        "displayName": "DBA / Trade Names",
        "type": "string",
        "description": "Any doing-business-as or trade names"
      },
      "address": {
        "displayName": "Business Address",
        "type": "string",
        "description": "Primary business address"
      },
      "website": {
        "displayName": "Website",
        "type": "string",
        "description": "Company website URL"
      },
      "yearEstablished": {
        "displayName": "Year Established",
        "type": "number",
        "description": "Year the company was founded"
      },
      "industryDescription": {
        "displayName": "Industry/Business Description",
        "type": "string",
        "description": "Description of primary business activities"
      },
      "naicsCode": {
        "displayName": "NAICS Code",
        "type": "string",
        "description": "North American Industry Classification System code"
      },
      "annualRevenue": {
        "displayName": "Annual Revenue",
        "type": "currency",
        "description": "Annual gross revenue"
      },
      "totalEmployees": {
        "displayName": "Total Employees",
        "type": "number",
        "description": "Total number of employees including full-time and part-time"
      },
      "fullTimeEmployees": {
        "displayName": "Full-Time Employees",
        "type": "number",
        "description": "Number of full-time employees"
      },
      "remoteEmployees": {
        "displayName": "Remote Employees",
        "type": "number",
        "description": "Number of employees working remotely"
      },
      "contractorsFreelancers": {
        "displayName": "Contractors/Freelancers",
        "type": "number",
        "description": "Number of contractors, freelancers, or independent workers"
      },
      "subsidiaries": {
        "displayName": "Subsidiaries",
        "type": "string",
        "description": "List of subsidiaries requiring coverage"
      },
      "countriesOfOperation": {
        "displayName": "Countries of Operation",
        "type": "string",
        "description": "Countries where the company operates"
      },
      "isPubliclyTraded": {
        "displayName": "Publicly Traded",
        "type": "boolean",
        "description": "Is the company publicly traded?"
      },
      "isSubsidiary": {
        "displayName": "Is Subsidiary",
        "type": "boolean",
        "description": "Is the applicant a subsidiary of another company?"
      },
      "parentCompany": {
        "displayName": "Parent Company",
        "type": "string",
        "description": "Name of parent company if applicable"
      },
      "recentMergersAcquisitions": {
        "displayName": "Recent M&A Activity",
        "type": "string",
        "description": "Any mergers, acquisitions, or divestitures in past 12 months"
      }
    }
  },
  "dataInventory": {
    "displayName": "Data Inventory & Classification",
    "description": "Types and volumes of sensitive data handled",
    "fields": {
      "hasPII": {
        "displayName": "Handles PII",
        "type": "boolean",
        "description": "Does the company collect/store Personally Identifiable Information?"
      },
      "piiRecordCount": {
        "displayName": "PII Record Count",
        "type": "number",
        "description": "Estimated number of PII records stored"
      },
      "piiRecordCountRange": {
        "displayName": "PII Record Range",
        "type": "string",
        "description": "Range of PII records (e.g., 1-10K, 10K-100K, 100K-1M, 1M+)"
      },
      "hasPHI": {
        "displayName": "Handles PHI",
        "type": "boolean",
        "description": "Does the company handle Protected Health Information?"
      },
      "phiRecordCount": {
        "displayName": "PHI Record Count",
        "type": "number",
        "description": "Estimated number of PHI records stored"
      },
      "hasPCI": {
        "displayName": "Processes Payment Cards",
        "type": "boolean",
        "description": "Does the company process payment card information?"
      },
      "annualPCITransactions": {
        "displayName": "Annual PCI Transactions",
        "type": "number",
        "description": "Estimated annual volume of payment card transactions"
      },
      "pciComplianceLevel": {
        "displayName": "PCI Compliance Level",
        "type": "string",
        "description": "PCI DSS compliance level (1-4)"
      },
      "hasBiometricData": {
        "displayName": "Collects Biometric Data",
        "type": "boolean",
        "description": "Does the company collect biometric data (fingerprints, facial recognition)?"
      },
      "hasGeneticHealthData": {
        "displayName": "Genetic/Health Data",
        "type": "boolean",
        "description": "Does the company handle DNA, genetic, or detailed health data?"
      },
      "hasChildrenData": {
        "displayName": "Children's Data",
        "type": "boolean",
        "description": "Does the company collect data from children under 13?"
      },
      "hasEUData": {
        "displayName": "EU Resident Data",
        "type": "boolean",
        "description": "Does the company process data of EU residents (GDPR)?"
      },
      "dataRetentionPolicy": {
        "displayName": "Data Retention Policy",
        "type": "boolean",
        "description": "Does the company have a formal data retention/destruction policy?"
      },
      "processesThirdPartyData": {
        "displayName": "Processes Third Party Data",
        "type": "boolean",
        "description": "Does the company process data on behalf of third parties?"
      },
      "dataClassificationProgram": {
        "displayName": "Data Classification Program",
        "type": "boolean",
        "description": "Does the company have a formal data classification program?"
      }
    }
  },
  "networkSecurity": {
    "displayName": "Network Security",
    "description": "Network infrastructure and perimeter security controls",
    "fields": {
      "hasFirewall": {
        "displayName": "Has Firewall",
        "type": "boolean",
        "description": "Does the company use firewalls?"
      },
      "firewallType": {
        "displayName": "Firewall Type",
        "type": "string",
        "description": "Type of firewall (e.g., next-gen, WAF, traditional)"
      },
      "hasIDS": {
        "displayName": "Has IDS/IPS",
        "type": "boolean",
        "description": "Does the company use Intrusion Detection/Prevention Systems?"
      },
      "networkSegmented": {
        "displayName": "Network Segmented",
        "type": "boolean",
        "description": "Is the network segmented?"
      },
      "segmentationLevel": {
        "displayName": "Segmentation Level",
        "type": "string",
        "description": "Level of network segmentation (basic, moderate, advanced)"
      },
      "hasDMZ": {
        "displayName": "Has DMZ",
        "type": "boolean",
        "description": "Does the company use a demilitarized zone (DMZ)?"
      },
      "hasVPN": {
        "displayName": "Has VPN",
        "type": "boolean",
        "description": "Does the company use VPN for remote access?"
      },
      "rdpEnabled": {
        "displayName": "RDP Enabled",
        "type": "boolean",
        "description": "Is Remote Desktop Protocol (RDP) enabled?"
      },
      "rdpInternetExposed": {
        "displayName": "RDP Internet Exposed",
        "type": "boolean",
        "description": "Is RDP exposed to the internet?"
      },
      "rdpControls": {
        "displayName": "RDP Controls",
        "type": "string",
        "description": "What controls are implemented for RDP?"
      },
      "wifiSecurity": {
        "displayName": "WiFi Security",
        "type": "string",
        "description": "WiFi security protocol used (WPA2, WPA3, etc.)"
      },
      "hasNetworkMonitoring": {
        "displayName": "Network Monitoring",
        "type": "boolean",
        "description": "Does the company monitor network traffic?"
      },
      "managedInternally": {
        "displayName": "Network Managed Internally",
        "type": "boolean",
        "description": "Is network infrastructure managed internally?"
      },
      "managedByMSP": {
        "displayName": "Network Managed by MSP",
        "type": "boolean",
        "description": "Is network infrastructure managed by an MSP?"
      }
    }
  },
  "endpointSecurity": {
    "displayName": "Endpoint Security",
    "description": "Endpoint protection and device security",
    "fields": {
      "hasAntivirus": {
        "displayName": "Has Antivirus",
        "type": "boolean",
        "description": "Does the company use antivirus software?"
      },
      "antivirusVendor": {
        "displayName": "Antivirus Vendor",
        "type": "string",
        "description": "Name of antivirus/anti-malware vendor"
      },
      "hasEDR": {
        "displayName": "Has EDR",
        "type": "boolean",
        "description": "Does the company use Endpoint Detection and Response (EDR)?"
      },
      "edrVendor": {
        "displayName": "EDR Vendor",
        "type": "string",
        "description": "Name of EDR vendor/product"
      },
      "edrEndpointCoverage": {
        "displayName": "EDR Endpoint Coverage %",
        "type": "number",
        "description": "Percentage of endpoints with EDR deployed"
      },
      "edrServerCoverage": {
        "displayName": "EDR Server Coverage %",
        "type": "number",
        "description": "Percentage of servers with EDR deployed"
      },
      "edrOnDomainControllers": {
        "displayName": "EDR on Domain Controllers",
        "type": "boolean",
        "description": "Is EDR deployed on all domain controllers?"
      },
      "hasEPP": {
        "displayName": "Has EPP",
        "type": "boolean",
        "description": "Does the company use Endpoint Protection Platform (EPP)?"
      },
      "mobileDeviceManagement": {
        "displayName": "Mobile Device Management",
        "type": "boolean",
        "description": "Does the company use MDM for mobile devices?"
      },
      "byodPolicy": {
        "displayName": "BYOD Policy",
        "type": "boolean",
        "description": "Does the company have a BYOD policy?"
      },
      "portableMediaEncrypted": {
        "displayName": "Portable Media Encrypted",
        "type": "boolean",
        "description": "Are portable media devices encrypted?"
      },
      "usersHaveAdminRights": {
        "displayName": "Users Have Admin Rights",
        "type": "boolean",
        "description": "Do end users have administrator rights on their devices?"
      },
      "privilegedAccessWorkstations": {
        "displayName": "Privileged Access Workstations",
        "type": "boolean",
        "description": "Are privileged access workstations (PAWs) used?"
      }
    }
  },
  "accessControl": {
    "displayName": "Access Control & Identity",
    "description": "Authentication and identity management",
    "fields": {
      "hasMFA": {
        "displayName": "Has MFA",
        "type": "boolean",
        "description": "Does the company use Multi-Factor Authentication?"
      },
      "mfaRemoteAccess": {
        "displayName": "MFA for Remote Access",
        "type": "boolean",
        "description": "Is MFA required for remote/VPN access?"
      },
      "mfaEmail": {
        "displayName": "MFA for Email",
        "type": "boolean",
        "description": "Is MFA required for email access?"
      },
      "mfaAdminAccess": {
        "displayName": "MFA for Admin Access",
        "type": "boolean",
        "description": "Is MFA required for administrative/privileged access?"
      },
      "mfaCriticalSystems": {
        "displayName": "MFA for Critical Systems",
        "type": "boolean",
        "description": "Is MFA required for critical systems?"
      },
      "mfaCloudApps": {
        "displayName": "MFA for Cloud Apps",
        "type": "boolean",
        "description": "Is MFA required for cloud applications?"
      },
      "mfaThirdPartyAccess": {
        "displayName": "MFA for Third Party Access",
        "type": "boolean",
        "description": "Is MFA required for third-party/vendor access?"
      },
      "mfaType": {
        "displayName": "MFA Type",
        "type": "string",
        "description": "Type of MFA used (app, SMS, hardware token, biometric)"
      },
      "hasSSO": {
        "displayName": "Has SSO",
        "type": "boolean",
        "description": "Does the company use Single Sign-On?"
      },
      "ssoProvider": {
        "displayName": "SSO Provider",
        "type": "string",
        "description": "SSO/Identity provider used"
      },
      "hasPasswordPolicy": {
        "displayName": "Has Password Policy",
        "type": "boolean",
        "description": "Does the company have a formal password policy?"
      },
      "passwordManager": {
        "displayName": "Uses Password Manager",
        "type": "boolean",
        "description": "Does the company use a password manager?"
      },
      "passwordManagerProduct": {
        "displayName": "Password Manager Product",
        "type": "string",
        "description": "Password manager product used"
      },
      "hasPAM": {
        "displayName": "Has PAM",
        "type": "boolean",
        "description": "Does the company use Privileged Access Management?"
      },
      "pamVendor": {
        "displayName": "PAM Vendor",
        "type": "string",
        "description": "PAM solution vendor"
      },
      "serviceAccountManagement": {
        "displayName": "Service Account Management",
        "type": "boolean",
        "description": "Are service accounts formally managed?"
      },
      "domainAdminCount": {
        "displayName": "Domain Admin Count",
        "type": "number",
        "description": "Number of domain administrator accounts"
      },
      "accessReviewsPerformed": {
        "displayName": "Access Reviews Performed",
        "type": "boolean",
        "description": "Are regular access reviews/recertifications performed?"
      },
      "rbacImplemented": {
        "displayName": "RBAC Implemented",
        "type": "boolean",
        "description": "Is Role-Based Access Control implemented?"
      }
    }
  },
  "emailSecurity": {
    "displayName": "Email Security",
    "description": "Email protection and anti-phishing controls",
    "fields": {
      "hasEmailFiltering": {
        "displayName": "Has Email Filtering",
        "type": "boolean",
        "description": "Does the company use email filtering?"
      },
      "emailFilteringVendor": {
        "displayName": "Email Filtering Vendor",
        "type": "string",
        "description": "Email security/filtering vendor"
      },
      "hasAntiPhishing": {
        "displayName": "Has Anti-Phishing",
        "type": "boolean",
        "description": "Does the company have anti-phishing controls?"
      },
      "hasDMARC": {
        "displayName": "Has DMARC",
        "type": "boolean",
        "description": "Is DMARC implemented?"
      },
      "dmarcPolicy": {
        "displayName": "DMARC Policy",
        "type": "string",
        "description": "DMARC policy setting (none, quarantine, reject)"
      },
      "hasSPF": {
        "displayName": "Has SPF",
        "type": "boolean",
        "description": "Is SPF (Sender Policy Framework) implemented?"
      },
      "hasDKIM": {
        "displayName": "Has DKIM",
        "type": "boolean",
        "description": "Is DKIM implemented?"
      },
      "externalEmailFlagging": {
        "displayName": "External Email Flagging",
        "type": "boolean",
        "description": "Are external emails flagged/labeled?"
      },
      "phishingReportButton": {
        "displayName": "Phishing Report Button",
        "type": "boolean",
        "description": "Can users easily report suspicious emails?"
      },
      "usesOffice365": {
        "displayName": "Uses Office 365",
        "type": "boolean",
        "description": "Does the company use Microsoft 365/Office 365?"
      },
      "hasATPDefender": {
        "displayName": "Has ATP/Defender",
        "type": "boolean",
        "description": "Is Microsoft ATP/Defender for Office 365 enabled?"
      },
      "usesGoogleWorkspace": {
        "displayName": "Uses Google Workspace",
        "type": "boolean",
        "description": "Does the company use Google Workspace?"
      }
    }
  },
  "backupRecovery": {
    "displayName": "Backup & Disaster Recovery",
    "description": "Data backup and business continuity",
    "fields": {
      "hasBackups": {
        "displayName": "Has Backups",
        "type": "boolean",
        "description": "Does the company maintain data backups?"
      },
      "backupFrequency": {
        "displayName": "Backup Frequency",
        "type": "string",
        "description": "How often are backups performed?"
      },
      "backupsOffline": {
        "displayName": "Backups Offline/Air-Gapped",
        "type": "boolean",
        "description": "Are backups stored offline or air-gapped?"
      },
      "backupsEncrypted": {
        "displayName": "Backups Encrypted",
        "type": "boolean",
        "description": "Are backups encrypted?"
      },
      "backupsTested": {
        "displayName": "Backups Tested",
        "type": "boolean",
        "description": "Are backups regularly tested for recoverability?"
      },
      "backupTestFrequency": {
        "displayName": "Backup Test Frequency",
        "type": "string",
        "description": "How often are backups tested?"
      },
      "backupsImmutable": {
        "displayName": "Backups Immutable",
        "type": "boolean",
        "description": "Are backups immutable/protected from modification?"
      },
      "backupVendor": {
        "displayName": "Backup Vendor/Product",
        "type": "string",
        "description": "Backup solution vendor or product"
      },
      "hasBCP": {
        "displayName": "Has BCP",
        "type": "boolean",
        "description": "Does the company have a Business Continuity Plan?"
      },
      "hasDRP": {
        "displayName": "Has DRP",
        "type": "boolean",
        "description": "Does the company have a Disaster Recovery Plan?"
      },
      "drpTested": {
        "displayName": "DRP Tested",
        "type": "boolean",
        "description": "Has the DRP been tested in the last 12 months?"
      },
      "rtoHours": {
        "displayName": "RTO (Hours)",
        "type": "number",
        "description": "Recovery Time Objective for critical systems"
      },
      "rpoHours": {
        "displayName": "RPO (Hours)",
        "type": "number",
        "description": "Recovery Point Objective for critical data"
      },
      "ransomwareRecoveryPlan": {
        "displayName": "Ransomware Recovery Plan",
        "type": "boolean",
        "description": "Does backup/restore plan include ransomware scenarios?"
      }
    }
  },
  "securityOperations": {
    "displayName": "Security Operations & Monitoring",
    "description": "Security monitoring and detection capabilities",
    "fields": {
      "hasSOC": {
        "displayName": "Has SOC",
        "type": "boolean",
        "description": "Does the company have a Security Operations Center?"
      },
      "socInternalExternal": {
        "displayName": "SOC Internal/External",
        "type": "string",
        "description": "Is SOC internal, external (MSSP), or hybrid?"
      },
      "soc247": {
        "displayName": "SOC 24/7",
        "type": "boolean",
        "description": "Does the SOC operate 24/7?"
      },
      "hasSIEM": {
        "displayName": "Has SIEM",
        "type": "boolean",
        "description": "Does the company use a SIEM solution?"
      },
      "siemVendor": {
        "displayName": "SIEM Vendor",
        "type": "string",
        "description": "SIEM solution vendor"
      },
      "hasMDR": {
        "displayName": "Has MDR",
        "type": "boolean",
        "description": "Does the company use Managed Detection & Response?"
      },
      "mdrVendor": {
        "displayName": "MDR Vendor",
        "type": "string",
        "description": "MDR provider name"
      },
      "mdrInterventionAllowed": {
        "displayName": "MDR Intervention Allowed",
        "type": "boolean",
        "description": "Is the MDR provider allowed to take action without prior consent?"
      },
      "logsRetentionDays": {
        "displayName": "Log Retention (Days)",
        "type": "number",
        "description": "How long are security logs retained?"
      },
      "domainControllerLogging": {
        "displayName": "Domain Controller Logging",
        "type": "boolean",
        "description": "Are domain controller logs ingested into SIEM?"
      },
      "threatIntelligence": {
        "displayName": "Uses Threat Intelligence",
        "type": "boolean",
        "description": "Does the company use threat intelligence feeds/services?"
      },
      "securityAlertsMonitored": {
        "displayName": "Security Alerts Monitored",
        "type": "boolean",
        "description": "Are security alerts actively monitored and triaged?"
      }
    }
  },
  "vulnerabilityManagement": {
    "displayName": "Vulnerability Management",
    "description": "Patching, scanning, and vulnerability remediation",
    "fields": {
      "hasPatchManagement": {
        "displayName": "Has Patch Management",
        "type": "boolean",
        "description": "Does the company have a patch management process?"
      },
      "patchManagementCentralized": {
        "displayName": "Centralized Patch Management",
        "type": "boolean",
        "description": "Is patch management centralized?"
      },
      "criticalPatchSLA": {
        "displayName": "Critical Patch SLA (Days)",
        "type": "number",
        "description": "SLA for deploying critical patches (in days)"
      },
      "tracksPatchCompliance": {
        "displayName": "Tracks Patch Compliance",
        "type": "boolean",
        "description": "Does the company track patch compliance metrics?"
      },
      "hasVulnScanning": {
        "displayName": "Has Vulnerability Scanning",
        "type": "boolean",
        "description": "Does the company perform vulnerability scanning?"
      },
      "vulnScanFrequency": {
        "displayName": "Scan Frequency",
        "type": "string",
        "description": "How often are vulnerability scans performed?"
      },
      "vulnScanningTool": {
        "displayName": "Scanning Tool",
        "type": "string",
        "description": "Vulnerability scanning tool/vendor"
      },
      "hasPenTesting": {
        "displayName": "Has Penetration Testing",
        "type": "boolean",
        "description": "Does the company perform penetration testing?"
      },
      "penTestFrequency": {
        "displayName": "Pen Test Frequency",
        "type": "string",
        "description": "How often is penetration testing performed?"
      },
      "penTestLastDate": {
        "displayName": "Last Pen Test Date",
        "type": "string",
        "description": "Date of most recent penetration test"
      },
      "hasSecureSDLC": {
        "displayName": "Has Secure SDLC",
        "type": "boolean",
        "description": "Does the company follow a secure software development lifecycle?"
      },
      "codeReviews": {
        "displayName": "Code Reviews Performed",
        "type": "boolean",
        "description": "Are code reviews performed for custom applications?"
      }
    }
  },
  "encryption": {
    "displayName": "Encryption & Data Protection",
    "description": "Data encryption and loss prevention",
    "fields": {
      "encryptionAtRest": {
        "displayName": "Encryption at Rest",
        "type": "boolean",
        "description": "Is sensitive data encrypted at rest?"
      },
      "encryptionAtRestPct": {
        "displayName": "Encryption at Rest %",
        "type": "number",
        "description": "Percentage of sensitive data encrypted at rest"
      },
      "encryptionInTransit": {
        "displayName": "Encryption in Transit",
        "type": "boolean",
        "description": "Is data encrypted in transit?"
      },
      "fullDiskEncryption": {
        "displayName": "Full Disk Encryption",
        "type": "boolean",
        "description": "Is full disk encryption used on laptops/endpoints?"
      },
      "databaseEncryption": {
        "displayName": "Database Encryption",
        "type": "boolean",
        "description": "Are databases encrypted?"
      },
      "emailEncryption": {
        "displayName": "Email Encryption",
        "type": "boolean",
        "description": "Is email encryption available/used?"
      },
      "hasDLP": {
        "displayName": "Has DLP",
        "type": "boolean",
        "description": "Does the company use Data Loss Prevention tools?"
      },
      "dlpVendor": {
        "displayName": "DLP Vendor",
        "type": "string",
        "description": "DLP solution vendor"
      },
      "encryptionStandard": {
        "displayName": "Encryption Standard",
        "type": "string",
        "description": "Encryption standard used (AES-256, etc.)"
      }
    }
  },
  "securityAwareness": {
    "displayName": "Security Awareness & Training",
    "description": "Employee security training and awareness",
    "fields": {
      "hasSecurityTraining": {
        "displayName": "Has Security Training",
        "type": "boolean",
        "description": "Does the company provide security awareness training?"
      },
      "trainingFrequency": {
        "displayName": "Training Frequency",
        "type": "string",
        "description": "How often is security training provided?"
      },
      "trainingMandatory": {
        "displayName": "Training Mandatory",
        "type": "boolean",
        "description": "Is security training mandatory for all employees?"
      },
      "phishingSimulations": {
        "displayName": "Phishing Simulations",
        "type": "boolean",
        "description": "Does the company conduct phishing simulations?"
      },
      "phishingSimFrequency": {
        "displayName": "Phishing Sim Frequency",
        "type": "string",
        "description": "How often are phishing simulations conducted?"
      },
      "privilegedUserTraining": {
        "displayName": "Privileged User Training",
        "type": "boolean",
        "description": "Do privileged users receive additional training?"
      },
      "newHireTraining": {
        "displayName": "New Hire Training",
        "type": "boolean",
        "description": "Is security training part of new hire onboarding?"
      },
      "roleBasedTraining": {
        "displayName": "Role-Based Training",
        "type": "boolean",
        "description": "Is role-based security training provided?"
      }
    }
  },
  "incidentResponse": {
    "displayName": "Incident Response",
    "description": "Incident response planning and capabilities",
    "fields": {
      "hasIRPlan": {
        "displayName": "Has IR Plan",
        "type": "boolean",
        "description": "Does the company have a documented Incident Response Plan?"
      },
      "irPlanTested": {
        "displayName": "IR Plan Tested",
        "type": "boolean",
        "description": "Has the IR plan been tested in the last 12 months?"
      },
      "hasIRTeam": {
        "displayName": "Has IR Team",
        "type": "boolean",
        "description": "Does the company have a designated IR team?"
      },
      "irRetainer": {
        "displayName": "IR Retainer",
        "type": "boolean",
        "description": "Does the company have an IR/forensics retainer?"
      },
      "irRetainerVendor": {
        "displayName": "IR Retainer Vendor",
        "type": "string",
        "description": "Name of IR retainer vendor"
      },
      "hasRansomwarePlaybook": {
        "displayName": "Has Ransomware Playbook",
        "type": "boolean",
        "description": "Does the company have a ransomware-specific response plan?"
      },
      "ransomwareExerciseDate": {
        "displayName": "Last Ransomware Exercise",
        "type": "string",
        "description": "Date of most recent ransomware tabletop exercise"
      },
      "breachNotificationProcess": {
        "displayName": "Breach Notification Process",
        "type": "boolean",
        "description": "Is there a documented breach notification process?"
      },
      "averageTriageTime": {
        "displayName": "Average Triage Time",
        "type": "string",
        "description": "Average time to triage security incidents"
      }
    }
  },
  "thirdPartyRisk": {
    "displayName": "Third Party & Vendor Risk",
    "description": "Vendor management and third-party security",
    "fields": {
      "usesMSP": {
        "displayName": "Uses MSP",
        "type": "boolean",
        "description": "Does the company use a Managed Service Provider?"
      },
      "mspName": {
        "displayName": "MSP Name",
        "type": "string",
        "description": "Name of the MSP used"
      },
      "vendorRiskProgram": {
        "displayName": "Vendor Risk Program",
        "type": "boolean",
        "description": "Does the company have a vendor risk management program?"
      },
      "vendorSecurityAssessments": {
        "displayName": "Vendor Security Assessments",
        "type": "boolean",
        "description": "Are vendor security assessments performed?"
      },
      "vendorContractsReviewed": {
        "displayName": "Vendor Contracts Reviewed",
        "type": "boolean",
        "description": "Are vendor contracts reviewed for security requirements?"
      },
      "mspMFARequired": {
        "displayName": "MSP MFA Required",
        "type": "boolean",
        "description": "Is MFA required for MSP/vendor access?"
      },
      "outsourcesITSecurity": {
        "displayName": "Outsources IT/Security",
        "type": "boolean",
        "description": "Does the company outsource IT or security functions?"
      },
      "outsourcesPCIDSS": {
        "displayName": "Outsources PCI DSS",
        "type": "boolean",
        "description": "Are PCI DSS duties outsourced?"
      },
      "cloudProviders": {
        "displayName": "Cloud Providers",
        "type": "string",
        "description": "Major cloud providers used (AWS, Azure, GCP, etc.)"
      }
    }
  },
  "complianceRegulatory": {
    "displayName": "Compliance & Regulatory",
    "description": "Regulatory compliance and certifications",
    "fields": {
      "hipaaCompliant": {
        "displayName": "HIPAA Compliant",
        "type": "boolean",
        "description": "Is the company HIPAA compliant?"
      },
      "pciDSSCompliant": {
        "displayName": "PCI DSS Compliant",
        "type": "boolean",
        "description": "Is the company PCI DSS compliant?"
      },
      "soc2Certified": {
        "displayName": "SOC 2 Certified",
        "type": "boolean",
        "description": "Does the company have SOC 2 certification?"
      },
      "iso27001Certified": {
        "displayName": "ISO 27001 Certified",
        "type": "boolean",
        "description": "Does the company have ISO 27001 certification?"
      },
      "gdprCompliant": {
        "displayName": "GDPR Compliant",
        "type": "boolean",
        "description": "Is the company GDPR compliant?"
      },
      "ccpaCompliant": {
        "displayName": "CCPA Compliant",
        "type": "boolean",
        "description": "Is the company CCPA compliant?"
      },
      "nistFramework": {
        "displayName": "Uses NIST Framework",
        "type": "boolean",
        "description": "Does the company follow NIST Cybersecurity Framework?"
      },
      "regulatoryOversight": {
        "displayName": "Regulatory Oversight",
        "type": "string",
        "description": "Primary regulatory bodies with oversight"
      },
      "lastSecurityAudit": {
        "displayName": "Last Security Audit",
        "type": "string",
        "description": "Date of most recent security audit"
      },
      "privacyPolicy": {
        "displayName": "Has Privacy Policy",
        "type": "boolean",
        "description": "Does the company have a published privacy policy?"
      },
      "informationSecurityPolicy": {
        "displayName": "Has InfoSec Policy",
        "type": "boolean",
        "description": "Does the company have a formal information security policy?"
      }
    }
  },
  "claimsHistory": {
    "displayName": "Claims & Loss History",
    "description": "Prior cyber incidents and claims",
    "fields": {
      "priorCyberClaims": {
        "displayName": "Prior Cyber Claims",
        "type": "boolean",
        "description": "Has the company had any prior cyber insurance claims?"
      },
      "claimsLast3Years": {
        "displayName": "Claims Last 3 Years",
        "type": "number",
        "description": "Number of cyber claims in the last 3 years"
      },
      "claimsLast5Years": {
        "displayName": "Claims Last 5 Years",
        "type": "number",
        "description": "Number of cyber claims in the last 5 years"
      },
      "largestClaimAmount": {
        "displayName": "Largest Claim Amount",
        "type": "currency",
        "description": "Largest cyber claim amount"
      },
      "priorBreaches": {
        "displayName": "Prior Breaches",
        "type": "boolean",
        "description": "Has the company experienced a data breach?"
      },
      "priorRansomware": {
        "displayName": "Prior Ransomware",
        "type": "boolean",
        "description": "Has the company experienced a ransomware attack?"
      },
      "ransomwarePaid": {
        "displayName": "Ransomware Paid",
        "type": "boolean",
        "description": "Was ransom ever paid?"
      },
      "regulatoryActions": {
        "displayName": "Regulatory Actions",
        "type": "boolean",
        "description": "Has the company faced cyber/privacy regulatory actions?"
      },
      "knownCircumstances": {
        "displayName": "Known Circumstances",
        "type": "boolean",
        "description": "Is the company aware of circumstances that could give rise to a claim?"
      },
      "priorDeniedCoverage": {
        "displayName": "Prior Denied Coverage",
        "type": "boolean",
        "description": "Has the company been denied cyber coverage?"
      },
      "currentCyberPolicy": {
        "displayName": "Current Cyber Policy",
        "type": "boolean",
        "description": "Does the company have current cyber insurance?"
      },
      "currentCarrier": {
        "displayName": "Current Carrier",
        "type": "string",
        "description": "Name of current cyber insurance carrier"
      }
    }
  },
  "financialControls": {
    "displayName": "Financial Controls",
    "description": "Wire transfer and payment fraud prevention",
    "fields": {
      "dualAuthWireTransfer": {
        "displayName": "Dual Auth Wire Transfer",
        "type": "boolean",
        "description": "Is dual authorization required for wire transfers?"
      },
      "wireVerificationThreshold5K": {
        "displayName": "Wire Verification >$5K",
        "type": "boolean",
        "description": "Is verification required for wire transfers over $5,000?"
      },
      "wireVerificationThreshold25K": {
        "displayName": "Wire Verification >$25K",
        "type": "boolean",
        "description": "Is verification required for wire transfers over $25,000?"
      },
      "callbackVerification": {
        "displayName": "Callback Verification",
        "type": "boolean",
        "description": "Is callback verification used for payment requests?"
      },
      "bankingChangeVerification": {
        "displayName": "Banking Change Verification",
        "type": "boolean",
        "description": "Is verification required for changes to banking/ACH details?"
      },
      "vendorPaymentVerification": {
        "displayName": "Vendor Payment Verification",
        "type": "boolean",
        "description": "Are new vendor banking details verified before payment?"
      },
      "socialEngineeringTraining": {
        "displayName": "Social Engineering Training",
        "type": "boolean",
        "description": "Do employees receive social engineering awareness training?"
      },
      "expenseApprovalProcess": {
        "displayName": "Expense Approval Process",
        "type": "boolean",
        "description": "Is there a formal expense/payment approval process?"
      }
    }
  },
  "cloudSecurity": {
    "displayName": "Cloud Security",
    "description": "Cloud services and cloud security controls",
    "fields": {
      "usesCloudServices": {
        "displayName": "Uses Cloud Services",
        "type": "boolean",
        "description": "Does the company use cloud services?"
      },
      "primaryCloudProvider": {
        "displayName": "Primary Cloud Provider",
        "type": "string",
        "description": "Primary cloud provider (AWS, Azure, GCP, etc.)"
      },
      "cloudSecurityPolicy": {
        "displayName": "Cloud Security Policy",
        "type": "boolean",
        "description": "Does the company have a formal cloud security policy?"
      },
      "cloudDataClassified": {
        "displayName": "Cloud Data Classified",
        "type": "boolean",
        "description": "Is data in the cloud classified and labeled?"
      },
      "cloudAccessMonitored": {
        "displayName": "Cloud Access Monitored",
        "type": "boolean",
        "description": "Is access to cloud services monitored?"
      },
      "casb": {
        "displayName": "Uses CASB",
        "type": "boolean",
        "description": "Does the company use a Cloud Access Security Broker?"
      },
      "saasApplicationsInventoried": {
        "displayName": "SaaS Apps Inventoried",
        "type": "boolean",
        "description": "Are SaaS applications inventoried?"
      },
      "shadowIT": {
        "displayName": "Shadow IT Program",
        "type": "boolean",
        "description": "Does the company have a program to address shadow IT?"
      }
    }
  },
  "websiteMediaLiability": {
    "displayName": "Website & Media Liability",
    "description": "Website content and intellectual property risks",
    "fields": {
      "hasWebsite": {
        "displayName": "Has Website",
        "type": "boolean",
        "description": "Does the company operate a website?"
      },
      "collectsDataOnline": {
        "displayName": "Collects Data Online",
        "type": "boolean",
        "description": "Does the website collect user data?"
      },
      "hasContentReviewProcess": {
        "displayName": "Content Review Process",
        "type": "boolean",
        "description": "Is there a content review process before publication?"
      },
      "usesUserContent": {
        "displayName": "Uses User Content",
        "type": "boolean",
        "description": "Does the company use user-generated content?"
      },
      "advertisingActivities": {
        "displayName": "Advertising Activities",
        "type": "boolean",
        "description": "Does the company engage in advertising?"
      },
      "socialMediaPresence": {
        "displayName": "Social Media Presence",
        "type": "boolean",
        "description": "Does the company have social media accounts?"
      },
      "ipInfringementClaims": {
        "displayName": "IP Infringement Claims",
        "type": "boolean",
        "description": "Has the company faced IP infringement claims?"
      },
      "obtainsMediaReleases": {
        "displayName": "Obtains Media Releases",
        "type": "boolean",
        "description": "Does the company obtain releases for published content?"
      }
    }
  },
  "techEO": {
    "displayName": "Technology E&O",
    "description": "Technology professional services",
    "fields": {
      "providesTechServices": {
        "displayName": "Provides Tech Services",
        "type": "boolean",
        "description": "Does the company provide technology services to clients?"
      },
      "techServicesRevenuePct": {
        "displayName": "Tech Services Revenue %",
        "type": "number",
        "description": "Percentage of revenue from technology services"
      },
      "techServicesTypes": {
        "displayName": "Tech Services Types",
        "type": "string",
        "description": "Types of technology services provided"
      },
      "hasServiceAgreements": {
        "displayName": "Has Service Agreements",
        "type": "boolean",
        "description": "Are formal service agreements used with clients?"
      },
      "limitationOfLiability": {
        "displayName": "Limitation of Liability",
        "type": "boolean",
        "description": "Do contracts include limitation of liability clauses?"
      },
      "hostsSystems": {
        "displayName": "Hosts Systems",
        "type": "boolean",
        "description": "Does the company host systems/data for clients?"
      },
      "developsSoftware": {
        "displayName": "Develops Software",
        "type": "boolean",
        "description": "Does the company develop software?"
      },
      "priorTechClaims": {
        "displayName": "Prior Tech E&O Claims",
        "type": "boolean",
        "description": "Has the company had technology E&O claims?"
      },
      "currentTechEOPolicy": {
        "displayName": "Current Tech E&O Policy",
        "type": "boolean",
        "description": "Does the company have current tech E&O coverage?"
      }
    }
  }
}
$SCHEMA$,
    'system'
);

COMMIT;

-- Summary
SELECT 
    'Schema v3 inserted' as status,
    (SELECT COUNT(*) FROM extraction_schemas) as total_schemas,
    (SELECT version FROM extraction_schemas WHERE is_active = true) as active_version;
