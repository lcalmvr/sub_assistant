#!/usr/bin/env python3
"""
Simple test of modular components without Streamlit dependencies
"""

def test_imports():
    """Test that our modular components can be imported"""
    print("Testing modular component imports...")
    
    try:
        from app.streamlit.config.settings import map_industry_to_slug, INDUSTRY_SLUG_MAPPING
        print("✅ Config settings imported")
        
        # Test industry mapping
        result = map_industry_to_slug("Software Publishers")
        assert result == "Software_as_a_Service_SaaS"
        print(f"✅ Industry mapping works: 'Software Publishers' -> '{result}'")
        
    except Exception as e:
        print(f"❌ Config import failed: {e}")
    
    try:
        from app.streamlit.utils.formatting import parse_dollar_input, format_dollar_display
        print("✅ Formatting utils imported")
        
        # Test dollar parsing
        assert parse_dollar_input("1M") == 1_000_000
        assert parse_dollar_input("50K") == 50_000
        assert format_dollar_display(2_000_000) == "2M"
        print("✅ Dollar parsing/formatting works")
        
    except Exception as e:
        print(f"❌ Formatting import failed: {e}")
    
    try:
        # Test database utils (without actual DB connection)
        import sys
        import os
        
        # Mock streamlit to avoid import error
        class MockStreamlit:
            class session_state:
                @staticmethod
                def get(key, default=None):
                    return default
        
        sys.modules['streamlit'] = MockStreamlit()
        
        from app.streamlit.utils.database import load_submissions
        print("✅ Database utils imported (with mocked streamlit)")
        
    except Exception as e:
        print(f"❌ Database import failed: {e}")
    
    print("\nModular structure test completed!")

def test_rating_engine():
    """Test that we can still access the rating engine"""
    try:
        # Test that we can import the controls parsing
        from app.pipeline import parse_controls_from_summary
        
        # Test parsing
        test_summary = "CrowdStrike EDR deployed, MFA enabled for all users"
        controls = parse_controls_from_summary(test_summary)
        print(f"✅ Controls parsing works: '{test_summary}' -> {controls}")
        
    except ImportError as e:
        print(f"❌ Pipeline import failed (expected due to missing deps): {e}")
    except Exception as e:
        print(f"❌ Controls parsing failed: {e}")

if __name__ == "__main__":
    test_imports()
    test_rating_engine()