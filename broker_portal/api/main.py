"""
FastAPI application for Broker Portal
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Broker Portal API",
    description="API for broker-facing portal to view submissions and statistics",
    version="1.0.0"
)

# CORS configuration
frontend_url = os.getenv("BROKER_PORTAL_FRONTEND_URL", "http://localhost:3000")
# CORS configuration - allow frontend origins
allowed_origins = [
    frontend_url,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
# Remove duplicates and None values
allowed_origins = list(set([o for o in allowed_origins if o]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors"""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "Internal server error",
            "error_code": "INTERNAL_ERROR"
        }
    )


# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Import and register routers
# Add parent directory to path for imports
import sys
from pathlib import Path
parent_dir = str(Path(__file__).parent.parent.parent)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Now import using absolute path
import broker_portal.api.auth as auth
import broker_portal.api.submissions as submissions
import broker_portal.api.stats as stats
import broker_portal.api.documents as documents
import broker_portal.api.designees as designees

app.include_router(auth.router, prefix="/api/broker/auth", tags=["Authentication"])
app.include_router(submissions.router, prefix="/api/broker/submissions", tags=["Submissions"])
app.include_router(stats.router, prefix="/api/broker/stats", tags=["Statistics"])
app.include_router(documents.router, prefix="/api/broker/submissions", tags=["Documents"])
app.include_router(designees.router, prefix="/api/broker/designees", tags=["Designees"])


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("BROKER_PORTAL_API_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

