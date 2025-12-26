/**
 * Main Application Logic
 * Handles form submission and quote display
 */

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('submissionForm');
    const resultsSection = document.getElementById('resultsSection');
    const quoteResults = document.getElementById('quoteResults');
    const submitBtn = document.getElementById('submitBtn');
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Disable submit button
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').style.display = 'none';
        submitBtn.querySelector('.btn-loader').style.display = 'inline';
        
        // Collect form data
        const formData = new FormData(form);
        
        // Normalize website URL (add https:// if missing)
        let website = formData.get('website') || '';
        if (website && !website.match(/^https?:\/\//i)) {
            website = 'https://' + website;
        }
        
        const submissionData = {
            companyName: formData.get('companyName'),
            website: website,
            annualRevenue: formData.get('annualRevenue'),
            industry: formData.get('industry'),
            controls: Array.from(form.querySelectorAll('input[name="controls"]:checked')).map(cb => cb.value),
            policyLimit: formData.get('policyLimit'),
            retention: formData.get('retention')
        };
        
        // Validate required fields
        if (!submissionData.companyName || !submissionData.annualRevenue || 
            !submissionData.industry || !submissionData.policyLimit || !submissionData.retention) {
            alert('Please fill in all required fields');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').style.display = 'inline';
            submitBtn.querySelector('.btn-loader').style.display = 'none';
            return;
        }
        
        // Show loading state
        quoteResults.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Submitting to carriers...</p>
            </div>
        `;
        resultsSection.style.display = 'block';
        
        // Show submission info
        document.getElementById('submissionInfo').innerHTML = `
            <span><strong>Submission:</strong> ${submissionData.companyName}</span>
            <span><strong>Limit:</strong> ${formatCurrency(parseInt(submissionData.policyLimit))}</span>
            <span><strong>Retention:</strong> ${formatCurrency(parseInt(submissionData.retention))}</span>
        `;
        
        resultsSection.scrollIntoView({ behavior: 'smooth' });
        
        try {
            // Call mock API - this simulates submitting to multiple carriers
            const result = await submitToMultipleCarriers(submissionData);
            
            if (result.success) {
                displayCarrierResponses(result.carriers, submissionData);
            } else {
                displayError(result.error || 'Failed to submit to carriers');
            }
        } catch (error) {
            console.error('Error:', error);
            displayError('An error occurred while processing your request');
        } finally {
            // Re-enable submit button
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').style.display = 'inline';
            submitBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });
    
    function displayCarrierResponses(carriers, submissionData) {
        let html = '<div class="carrier-table">';
        
        carriers.forEach((carrier, index) => {
            const statusClass = `status-${carrier.status}`;
            const statusIcon = getStatusIcon(carrier.status);
            
            html += `
                <div class="carrier-row ${carrier.status}">
                    <div class="carrier-info">
                        <div class="carrier-name">
                            ${statusIcon}
                            <strong>${carrier.name}</strong>
                            ${carrier.isYourCarrier ? '<span class="your-carrier-badge">Your Carrier</span>' : ''}
                        </div>
                        <div class="carrier-status">
                            <span class="status-badge ${statusClass}">${carrier.statusText}</span>
                        </div>
                    </div>
                    
                    ${carrier.status === 'quoted' ? `
                        <div class="carrier-quote">
                            <div class="quote-main">
                                <div class="quote-premium">${formatCurrency(carrier.premium)}</div>
                                <div class="quote-label">Annual Premium</div>
                            </div>
                            <div class="quote-details-small">
                                <div>Limit: ${formatCurrency(carrier.limit)}</div>
                                <div>Retention: ${formatCurrency(carrier.retention)}</div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${carrier.status === 'declined' ? `
                        <div class="carrier-message">
                            <p><strong>Reason:</strong> ${carrier.reason || 'Risk profile does not meet underwriting guidelines'}</p>
                        </div>
                    ` : ''}
                    
                    ${carrier.status === 'additional_info' ? `
                        <div class="carrier-message">
                            <p><strong>Additional Information Required:</strong></p>
                            <ul>
                                ${carrier.questions.map(q => `<li>${q}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${carrier.status === 'pending' ? `
                        <div class="carrier-message">
                            <p>Quote request received, processing...</p>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        
        html += `
            <div class="demo-note">
                <strong>Note:</strong> This demonstrates multi-carrier broker platform integration. 
                When connected to the real FastAPI, CMAI (your carrier) will appear as one of the options 
                with AI-powered quotes generated from your rating engine.
            </div>
        `;
        
        quoteResults.innerHTML = html;
    }
    
    function getStatusIcon(status) {
        const icons = {
            'quoted': '✅',
            'declined': '❌',
            'additional_info': '❓',
            'pending': '⏳'
        };
        return icons[status] || '📋';
    }
    
    function displayError(message) {
        quoteResults.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }
});

// Helper function for currency formatting
function formatCurrency(amount) {
    if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toLocaleString()}`;
}

