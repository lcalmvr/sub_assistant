#!/usr/bin/env python3
"""
Test script for RAG performance monitoring
Tests the performance monitoring system without requiring the full RAG setup
"""

import time
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).resolve().parents[0] / ".env")

def test_performance_monitor():
    """Test the performance monitoring system"""
    print("🧪 Testing RAG Performance Monitoring")
    print("=" * 40)
    
    try:
        from performance_monitor import monitor
        print("✅ Performance monitor imported successfully")
        
        # Test 1: Start tracking
        print("\n📊 Test 1: Starting performance tracking...")
        context = monitor.start_tracking(
            operation_type='test_operation',
            query='Test query for performance monitoring',
            submission_id='test-submission-123'
        )
        print("✅ Tracking started")
        
        # Simulate some work
        time.sleep(0.1)  # 100ms
        
        # Test 2: Mark retrieval start
        print("📊 Test 2: Marking retrieval start...")
        monitor.mark_retrieval_start(context)
        time.sleep(0.05)  # 50ms
        
        # Test 3: Mark generation start
        print("📊 Test 3: Marking generation start...")
        monitor.mark_generation_start(context)
        time.sleep(0.1)  # 100ms
        
        # Test 4: Finish tracking
        print("📊 Test 4: Finishing tracking...")
        metrics = monitor.finish_tracking(
            context,
            num_documents=5,
            num_tokens_input=100,
            num_tokens_output=50
        )
        
        print("✅ Metrics collected:")
        print(f"   - Response time: {metrics.response_time_ms:.1f}ms")
        print(f"   - Retrieval time: {metrics.retrieval_time_ms:.1f}ms")
        print(f"   - Generation time: {metrics.generation_time_ms:.1f}ms")
        print(f"   - Documents retrieved: {metrics.num_documents_retrieved}")
        
        # Test 5: Get performance stats
        print("\n📊 Test 5: Getting performance statistics...")
        stats = monitor.get_performance_stats(days=1)
        
        if "error" in stats:
            print(f"⚠️  Could not retrieve stats: {stats['error']}")
            print("   This is expected if the database table doesn't exist yet.")
        elif "message" in stats:
            print(f"ℹ️  {stats['message']}")
        else:
            print("✅ Performance stats retrieved:")
            print(f"   - Total operations: {stats['total_operations']}")
            print(f"   - Avg response time: {stats['avg_response_time_ms']:.1f}ms")
            print(f"   - Error rate: {stats['error_rate']:.1%}")
        
        print("\n🎉 Performance monitoring test completed successfully!")
        return True
        
    except ImportError as e:
        print(f"❌ Could not import performance monitor: {e}")
        return False
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        return False

def test_with_error():
    """Test error handling in performance monitoring"""
    print("\n🧪 Testing Error Handling")
    print("=" * 30)
    
    try:
        from performance_monitor import monitor
        
        # Start tracking
        context = monitor.start_tracking('error_test', 'Test query that will fail')
        
        # Simulate an error
        time.sleep(0.05)
        
        # Finish with error
        metrics = monitor.finish_tracking(context, error="Simulated test error")
        
        print("✅ Error tracking test completed")
        print(f"   - Error recorded: {metrics.error_message}")
        return True
        
    except Exception as e:
        print(f"❌ Error handling test failed: {e}")
        return False

def main():
    """Main test function"""
    print("🚀 RAG Performance Monitoring Test Suite")
    print("=" * 50)
    
    # Check environment
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE"):
        print("❌ Missing Supabase environment variables")
        print("Please ensure your .env file contains SUPABASE_URL and SUPABASE_SERVICE_ROLE")
        return False
    
    # Run tests
    success1 = test_performance_monitor()
    success2 = test_with_error()
    
    if success1 and success2:
        print("\n🎉 All tests passed! Performance monitoring is ready.")
        print("\nNext steps:")
        print("1. Create the rag_metrics table in Supabase (see setup_performance_metrics.py output)")
        print("2. Run your RAG system to start collecting real metrics")
        print("3. Use the performance dashboard in the viewer")
        return True
    else:
        print("\n❌ Some tests failed. Please check the errors above.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

