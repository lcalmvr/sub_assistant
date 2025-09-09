"""
Configuration settings for Streamlit application
"""
import os

# Database
DATABASE_URL = os.getenv("DATABASE_URL")

# User
CURRENT_USER = os.getenv("USER", "unknown")

# Industry mapping for rating engine
INDUSTRY_SLUG_MAPPING = {
    "Media Buying Agencies": "Advertising_Marketing_Technology",
    "Advertising Agencies": "Advertising_Marketing_Technology", 
    "Marketing Consultants": "Advertising_Marketing_Technology",
    "Software Publishers": "Software_as_a_Service_SaaS",
    "Computer Systems Design Services": "Professional_Services_Consulting",
    "Management Consultants": "Professional_Services_Consulting",
    # Add more mappings as needed
}

DEFAULT_INDUSTRY_SLUG = "Professional_Services_Consulting"

# Supabase settings (for file storage)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET_NAME = "submissions"

def map_industry_to_slug(industry_name: str) -> str:
    """Map NAICS industry names to rating engine slugs"""
    return INDUSTRY_SLUG_MAPPING.get(industry_name, DEFAULT_INDUSTRY_SLUG)