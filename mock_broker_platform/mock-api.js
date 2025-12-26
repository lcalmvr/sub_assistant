/**
 * Mock API Client
 * 
 * This simulates API calls to the FastAPI backend.
 * When the real FastAPI is built, replace these functions
 * with actual fetch() calls to the API endpoints.
 */

// API Configuration
const API_CONFIG = {
    baseUrl: 'http://localhost:8000/api/v1', // Will be replaced with real API URL
    useMock: true // Set to false when real API is ready
};

/**
 * Format currency for display
 */
function formatCurrency(amount) {
    if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toLocaleString()}`;
}

/**
 * Mock API: Submit to multiple carriers
 * 
 * This simulates submitting one submission to multiple carriers
 * and getting different responses (quoted, declined, additional info needed)
 */
async function submitToMultipleCarriers(submissionData) {
    if (API_CONFIG.useMock) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const revenue = parseInt(submissionData.annualRevenue);
        const limit = parseInt(submissionData.policyLimit);
        const retention = parseInt(submissionData.retention);
        const controls = submissionData.controls || [];
        
        // Calculate premium for CMAI (your carrier)
        let basePremium = 0;
        if (revenue < 2000000) {
            basePremium = limit * 0.015;
        } else if (revenue < 10000000) {
            basePremium = limit * 0.012;
        } else {
            basePremium = limit * 0.010;
        }
        
        let premium = basePremium;
        if (controls.includes('MFA')) premium *= 0.95;
        if (controls.includes('EDR')) premium *= 0.97;
        if (controls.includes('Backups')) premium *= 0.98;
        if (controls.includes('Encryption')) premium *= 0.99;
        if (controls.includes('SIEM')) premium *= 0.96;
        if (controls.includes('SOC')) premium *= 0.94;
        if (retention > 50000) premium *= 0.95;
        premium = Math.round(premium);
        
        // Simulate multiple carrier responses
        const carriers = [
            {
                name: 'CMAI',
                isYourCarrier: true,
                status: 'quoted',
                statusText: 'Quoted',
                premium: premium,
                limit: limit,
                retention: retention,
                quoteId: `QUOTE-CMAI-${Date.now()}`
            },
            {
                name: 'Carrier A',
                isYourCarrier: false,
                status: 'declined',
                statusText: 'Declined',
                reason: 'Revenue threshold not met for this risk class'
            },
            {
                name: 'Carrier B',
                isYourCarrier: false,
                status: 'quoted',
                statusText: 'Quoted',
                premium: Math.round(premium * 1.15), // 15% higher
                limit: limit,
                retention: retention,
                quoteId: `QUOTE-B-${Date.now()}`
            },
            {
                name: 'Carrier C',
                isYourCarrier: false,
                status: 'quoted',
                statusText: 'Quoted',
                premium: Math.round(premium * 1.25), // 25% higher
                limit: limit,
                retention: retention,
                quoteId: `QUOTE-C-${Date.now()}`
            },
            {
                name: 'Carrier D',
                isYourCarrier: false,
                status: 'additional_info',
                statusText: 'Additional Info Required',
                questions: [
                    'Please provide details on incident response plan',
                    'Can you confirm SOC monitoring is 24/7?',
                    'Please provide last security audit report'
                ]
            }
        ];
        
        return {
            success: true,
            carriers: carriers,
            submissionId: `SUB-${Date.now()}`
        };
    } else {
        // Real API call - would submit to multiple carriers
        // This would be implemented when FastAPI is built
        return {
            success: false,
            error: 'Real API not yet implemented'
        };
    }
}

/**
 * Mock API: Submit quote request
 * 
 * This simulates: POST /api/v1/quote
 * 
 * Real API will:
 * - Accept ACORD-compliant submission data
 * - Process through rating engine
 * - Return quote with premium calculation
 */
async function submitQuoteRequest(submissionData) {
    if (API_CONFIG.useMock) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mock response based on submission data
        const revenue = parseInt(submissionData.annualRevenue);
        const limit = parseInt(submissionData.policyLimit);
        const retention = parseInt(submissionData.retention);
        const controls = submissionData.controls || [];
        
        // Simple mock premium calculation
        let basePremium = 0;
        if (revenue < 2000000) {
            basePremium = limit * 0.015; // 1.5% of limit
        } else if (revenue < 10000000) {
            basePremium = limit * 0.012; // 1.2% of limit
        } else {
            basePremium = limit * 0.010; // 1.0% of limit
        }
        
        // Apply control modifiers
        let premium = basePremium;
        if (controls.includes('MFA')) premium *= 0.95; // 5% credit
        if (controls.includes('EDR')) premium *= 0.97; // 3% credit
        if (controls.includes('Backups')) premium *= 0.98; // 2% credit
        if (controls.includes('Encryption')) premium *= 0.99; // 1% credit
        if (controls.includes('SIEM')) premium *= 0.96; // 4% credit
        if (controls.includes('SOC')) premium *= 0.94; // 6% credit
        
        // Retention adjustment
        if (retention > 50000) {
            premium *= 0.95; // Lower retention = higher premium
        }
        
        premium = Math.round(premium);
        
        return {
            success: true,
            quote: {
                quote_id: `QUOTE-${Date.now()}`,
                submission_id: `SUB-${Date.now()}`,
                company_name: submissionData.companyName,
                premium: premium,
                policy_limit: limit,
                retention: retention,
                effective_date: new Date().toISOString().split('T')[0],
                expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'quoted',
                quote_details: {
                    base_premium: Math.round(basePremium),
                    control_credits: controls.length > 0 ? Math.round(basePremium - premium) : 0,
                    industry: submissionData.industry,
                    revenue: revenue
                }
            }
        };
    } else {
        // Real API call (when FastAPI is ready)
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}/quote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_CONFIG.apiKey}` // When auth is implemented
                },
                body: JSON.stringify({
                    company_name: submissionData.companyName,
                    website: submissionData.website,
                    annual_revenue: parseInt(submissionData.annualRevenue),
                    industry: submissionData.industry,
                    security_controls: submissionData.controls,
                    policy_limit: parseInt(submissionData.policyLimit),
                    retention: parseInt(submissionData.retention)
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

/**
 * Mock API: Get quote status
 * 
 * This simulates: GET /api/v1/quote/{quote_id}
 */
async function getQuoteStatus(quoteId) {
    if (API_CONFIG.useMock) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
            success: true,
            quote: {
                quote_id: quoteId,
                status: 'quoted',
                // ... other quote data
            }
        };
    } else {
        // Real API call
        const response = await fetch(`${API_CONFIG.baseUrl}/quote/${quoteId}`, {
            headers: {
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            }
        });
        return await response.json();
    }
}

/**
 * Mock API: Create submission
 * 
 * This simulates: POST /api/v1/submission
 */
async function createSubmission(submissionData) {
    if (API_CONFIG.useMock) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
            success: true,
            submission: {
                submission_id: `SUB-${Date.now()}`,
                status: 'pending',
                created_at: new Date().toISOString()
            }
        };
    } else {
        // Real API call
        const response = await fetch(`${API_CONFIG.baseUrl}/submission`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            },
            body: JSON.stringify(submissionData)
        });
        return await response.json();
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        submitToMultipleCarriers,
        submitQuoteRequest,
        getQuoteStatus,
        createSubmission,
        formatCurrency
    };
}

