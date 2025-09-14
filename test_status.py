from app.submission_status import get_status_summary, get_submissions_by_status

print("Testing submission status functionality...")

# Test status summary
try:
    summary = get_status_summary()
    print("\n📊 Status Summary:")
    for status, outcomes in summary.items():
        print(f"  {status}: {outcomes}")
except Exception as e:
    print(f"Error getting status summary: {e}")

# Test getting submissions by status
try:
    pending_subs = get_submissions_by_status("pending_decision")
    print(f"\n🔍 Found {len(pending_subs)} pending submissions")
    
    if pending_subs:
        print("First submission:", str(pending_subs[0]['id'])[:8], "-", pending_subs[0].get('broker_email', 'N/A'))
except Exception as e:
    print(f"Error getting submissions by status: {e}")

print("\n✅ Status system test complete!")