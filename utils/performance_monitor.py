import time
import json
import os
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from supabase import create_client
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

@dataclass
class RAGMetrics:
    """Metrics for a single RAG operation"""
    timestamp: str
    operation_type: str  # 'ai_decision', 'chat', 'similarity_search'
    submission_id: Optional[str]
    query: str
    response_time_ms: float
    retrieval_time_ms: float
    generation_time_ms: float
    num_documents_retrieved: int
    num_tokens_input: Optional[int]
    num_tokens_output: Optional[int]
    user_feedback: Optional[str] = None  # 'helpful', 'not_helpful', 'incorrect'
    accuracy_score: Optional[float] = None  # 0-1 scale
    error_message: Optional[str] = None

class PerformanceMonitor:
    """Monitor and track RAG performance metrics"""
    
    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL"), 
            os.getenv("SUPABASE_SERVICE_ROLE")
        )
        self._ensure_metrics_table()
    
    def _ensure_metrics_table(self):
        """Check if metrics table exists (table should be created manually in Supabase)"""
        try:
            # Just check if table exists by querying it
            self.supabase.table('rag_metrics').select('id').limit(1).execute()
        except Exception as e:
            print(f"Warning: rag_metrics table may not exist. Create it manually in Supabase: {e}")
    
    def start_tracking(self, operation_type: str, query: str, submission_id: str = None) -> Dict[str, Any]:
        """Start tracking a RAG operation"""
        return {
            'start_time': time.time(),
            'operation_type': operation_type,
            'query': query,
            'submission_id': submission_id,
            'retrieval_start': None,
            'generation_start': None
        }
    
    def mark_retrieval_start(self, context: Dict[str, Any]):
        """Mark when retrieval phase starts"""
        context['retrieval_start'] = time.time()
    
    def mark_generation_start(self, context: Dict[str, Any]):
        """Mark when generation phase starts"""
        context['generation_start'] = time.time()
    
    def finish_tracking(self, context: Dict[str, Any], 
                       num_documents: int = 0,
                       num_tokens_input: int = None,
                       num_tokens_output: int = None,
                       error: str = None) -> RAGMetrics:
        """Finish tracking and calculate metrics"""
        
        end_time = time.time()
        total_time_ms = (end_time - context['start_time']) * 1000
        
        retrieval_time_ms = 0
        if context.get('retrieval_start') and context.get('generation_start'):
            retrieval_time_ms = (context['generation_start'] - context['retrieval_start']) * 1000
        
        generation_time_ms = 0
        if context.get('generation_start'):
            generation_time_ms = (end_time - context['generation_start']) * 1000
        
        metrics = RAGMetrics(
            timestamp=datetime.now().isoformat(),
            operation_type=context['operation_type'],
            submission_id=context.get('submission_id'),
            query=context['query'][:500],  # Truncate long queries
            response_time_ms=total_time_ms,
            retrieval_time_ms=retrieval_time_ms,
            generation_time_ms=generation_time_ms,
            num_documents_retrieved=num_documents,
            num_tokens_input=num_tokens_input,
            num_tokens_output=num_tokens_output,
            error_message=error
        )
        
        # Store in database
        self._store_metrics(metrics)
        return metrics
    
    def _store_metrics(self, metrics: RAGMetrics):
        """Store metrics in database"""
        try:
            data = asdict(metrics)
            self.supabase.table('rag_metrics').insert(data).execute()
        except Exception as e:
            print(f"Warning: Could not store metrics: {e}")
    
    def record_user_feedback(self, metrics_id: int, feedback: str, accuracy_score: float = None):
        """Record user feedback on RAG response"""
        try:
            update_data = {'user_feedback': feedback}
            if accuracy_score is not None:
                update_data['accuracy_score'] = accuracy_score
            
            self.supabase.table('rag_metrics').update(update_data).eq('id', metrics_id).execute()
        except Exception as e:
            print(f"Warning: Could not record feedback: {e}")
    
    def get_performance_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get performance statistics for the last N days"""
        try:
            # Get recent metrics
            response = self.supabase.table('rag_metrics').select('*').gte(
                'timestamp', 
                (datetime.now() - timedelta(days=days)).isoformat()
            ).execute()
            
            metrics = response.data
            if not metrics:
                return {"message": "No metrics available"}
            
            # Calculate statistics
            response_times = [m['response_time_ms'] for m in metrics if m['response_time_ms']]
            retrieval_times = [m['retrieval_time_ms'] for m in metrics if m['retrieval_time_ms']]
            
            stats = {
                "total_operations": len(metrics),
                "avg_response_time_ms": sum(response_times) / len(response_times) if response_times else 0,
                "p95_response_time_ms": sorted(response_times)[int(0.95 * len(response_times))] if response_times else 0,
                "avg_retrieval_time_ms": sum(retrieval_times) / len(retrieval_times) if retrieval_times else 0,
                "error_rate": len([m for m in metrics if m['error_message']]) / len(metrics),
                "operations_by_type": {},
                "user_feedback_summary": {},
                "accuracy_scores": [m['accuracy_score'] for m in metrics if m['accuracy_score'] is not None]
            }
            
            # Group by operation type
            for metric in metrics:
                op_type = metric['operation_type']
                stats["operations_by_type"][op_type] = stats["operations_by_type"].get(op_type, 0) + 1
            
            # User feedback summary
            for metric in metrics:
                if metric['user_feedback']:
                    feedback = metric['user_feedback']
                    stats["user_feedback_summary"][feedback] = stats["user_feedback_summary"].get(feedback, 0) + 1
            
            return stats
            
        except Exception as e:
            return {"error": f"Could not retrieve stats: {e}"}

# Global instance
monitor = PerformanceMonitor()

