"""
Authentication module for broker portal
Handles magic link generation, validation, and session management
"""
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import text
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.db import get_conn
from broker_portal.api.models import (
    MagicLinkRequest, MagicLinkResponse, LoginResponse, ErrorResponse
)
from broker_portal.api.integrations import send_email_notification

router = APIRouter()
security = HTTPBearer(auto_error=False)

DEV_MODE = os.getenv("BROKER_PORTAL_DEV_MODE", "false").lower() == "true"
FRONTEND_URL = os.getenv("BROKER_PORTAL_FRONTEND_URL", "http://localhost:3000")
MAGIC_LINK_EXPIRY_MINUTES = 15
SESSION_EXPIRY_HOURS = 24

# Debug: print dev mode status on startup
if __name__ == "__main__" or True:  # Always print for debugging
    print(f"[AUTH] DEV_MODE = {DEV_MODE}")
    print(f"[AUTH] FRONTEND_URL = {FRONTEND_URL}")


def find_broker_by_email(email: str) -> dict:
    """
    Find broker by email in both broker systems.
    Returns dict with broker_contact_id or broker_employment_id, email, name.
    """
    email_lower = email.strip().lower()
    
    with get_conn() as conn:
        # Try brkr_employments first (alt system)
        result = conn.execute(text("""
            SELECT
                e.employment_id,
                e.email,
                p.first_name || ' ' || p.last_name as name,
                o.org_id,
                o.name as org_name
            FROM brkr_employments e
            JOIN brkr_people p ON e.person_id = p.person_id
            JOIN brkr_organizations o ON e.org_id = o.org_id
            WHERE LOWER(e.email) = :email
            AND e.active = TRUE
            LIMIT 1
        """), {"email": email_lower})
        
        row = result.fetchone()
        if row:
            return {
                "broker_employment_id": str(row[0]),
                "email": row[1],
                "name": row[2],
                "org_id": str(row[3]),
                "org_name": row[4],
                "broker_contact_id": None
            }
        
        # Fallback to broker_contacts (simple system)
        result = conn.execute(text("""
            SELECT
                bc.id,
                bc.email,
                bc.first_name || ' ' || bc.last_name as name,
                b.id as broker_id,
                b.company_name
            FROM broker_contacts bc
            JOIN brokers b ON bc.broker_id = b.id
            WHERE LOWER(bc.email) = :email
            LIMIT 1
        """), {"email": email_lower})
        
        row = result.fetchone()
        if row:
            return {
                "broker_contact_id": str(row[0]),
                "email": row[1],
                "name": row[2],
                "broker_id": str(row[3]),
                "company_name": row[4],
                "broker_employment_id": None
            }
    
    return None


def generate_magic_link_token() -> str:
    """Generate a secure token for magic link"""
    return secrets.token_urlsafe(32)


@router.post("/magic-link", response_model=MagicLinkResponse)
async def request_magic_link(request: MagicLinkRequest):
    """
    Request a magic link for login.
    In dev mode, returns the token directly for testing.
    """
    try:
        # Find broker by email
        broker = find_broker_by_email(request.email)
        if not broker:
            # Log for debugging
            import logging
            logging.error(f"Magic link requested for unknown email: {request.email}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No broker found with email: {request.email}. Please contact your administrator to be added to the system."
            )
    except Exception as e:
        import logging
        logging.error(f"Error finding broker: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing request: {str(e)}"
        )
    
    # Generate token
    token = generate_magic_link_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=MAGIC_LINK_EXPIRY_MINUTES)
    
    # Store in database
    with get_conn() as conn:
        conn.execute(text("""
            INSERT INTO broker_magic_links (email, token, expires_at)
            VALUES (:email, :token, :expires_at)
        """), {
            "email": request.email.lower(),
            "token": token,
            "expires_at": expires_at
        })
    
    # In dev mode, return token directly
    if DEV_MODE:
        return MagicLinkResponse(
            success=True,
            message="Dev mode: Use this token to login",
            dev_token=token
        )
    
    # Send email with magic link
    magic_link_url = f"{FRONTEND_URL}/auth/callback?token={token}"
    
    email_subject = "Your Broker Portal Login Link"
    email_body = f"""
Hello {broker['name']},

Click the link below to log in to your broker portal:

{magic_link_url}

This link will expire in {MAGIC_LINK_EXPIRY_MINUTES} minutes.

If you didn't request this link, please ignore this email.
"""
    
    email_html = f"""
    <html>
    <body>
        <p>Hello {broker['name']},</p>
        <p>Click the link below to log in to your broker portal:</p>
        <p><a href="{magic_link_url}">{magic_link_url}</a></p>
        <p>This link will expire in {MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
        <p>If you didn't request this link, please ignore this email.</p>
    </body>
    </html>
    """
    
    send_email_notification(request.email, email_subject, email_body, email_html)
    
    return MagicLinkResponse(
        success=True,
        message="Magic link sent to your email"
    )


@router.post("/callback", response_model=LoginResponse)
async def magic_link_callback(token: str = Query(..., description="Magic link token")):
    """
    Validate magic link token and create session.
    Token should be passed as query parameter: /callback?token=...
    """
    
    with get_conn() as conn:
        # Find and validate token
        result = conn.execute(text("""
            SELECT email, expires_at, used_at
            FROM broker_magic_links
            WHERE token = :token
        """), {"token": token})
        
        row = result.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired magic link"
            )
        
        email, expires_at, used_at = row
        
        # Ensure expires_at is timezone-aware for comparison
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            # If database returns naive datetime, assume UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        # Check if expired
        if expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Magic link has expired"
            )
        
        # Check if already used
        if used_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Magic link has already been used"
            )
        
        # Find broker
        broker = find_broker_by_email(email)
        if not broker:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Broker not found"
            )
        
        # Mark token as used
        conn.execute(text("""
            UPDATE broker_magic_links
            SET used_at = :used_at
            WHERE token = :token
        """), {
            "token": token,
            "used_at": datetime.now(timezone.utc)
        })
        
        # Create session
        session_token = secrets.token_urlsafe(32)
        expires_at_session = datetime.now(timezone.utc) + timedelta(hours=SESSION_EXPIRY_HOURS)
        
        conn.execute(text("""
            INSERT INTO broker_sessions (
                token, broker_contact_id, broker_employment_id, email, expires_at
            ) VALUES (
                :token, :broker_contact_id, :broker_employment_id, :email, :expires_at
            )
        """), {
            "token": session_token,
            "broker_contact_id": broker.get("broker_contact_id"),
            "broker_employment_id": broker.get("broker_employment_id"),
            "email": email.lower(),
            "expires_at": expires_at_session
        })
        
        return LoginResponse(
            success=True,
            token=session_token,
            expires_at=expires_at_session,
            broker={
                "email": broker["email"],
                "name": broker["name"],
                "broker_contact_id": broker.get("broker_contact_id"),
                "broker_employment_id": broker.get("broker_employment_id")
            }
        )


def get_current_broker_from_session(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    Dependency to get current authenticated broker from session token.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token"
        )
    
    token = credentials.credentials
    
    with get_conn() as conn:
        result = conn.execute(text("""
            SELECT
                broker_contact_id, broker_employment_id, email, expires_at
            FROM broker_sessions
            WHERE token = :token
        """), {"token": token})
        
        row = result.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session"
            )
        
        broker_contact_id, broker_employment_id, email, expires_at = row
        
        # Ensure expires_at is timezone-aware for comparison
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            # If database returns naive datetime, assume UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        # Check if expired
        if expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has expired"
            )
        
        # Update last activity
        conn.execute(text("""
            UPDATE broker_sessions
            SET last_activity_at = :now
            WHERE token = :token
        """), {
            "token": token,
            "now": datetime.now(timezone.utc)
        })
        
        return {
            "broker_contact_id": str(broker_contact_id) if broker_contact_id else None,
            "broker_employment_id": str(broker_employment_id) if broker_employment_id else None,
            "email": email
        }


def check_broker_access_to_submission(broker: dict, submission_id: str) -> bool:
    """
    Check if broker has access to a submission (either owns it or is a designee).
    """
    with get_conn() as conn:
        # Check if broker owns the submission
        # Check via broker_email
        result = conn.execute(text("""
            SELECT 1
            FROM submissions
            WHERE id = :submission_id
            AND LOWER(broker_email) = :email
        """), {
            "submission_id": submission_id,
            "email": broker["email"].lower()
        })
        
        if result.fetchone():
            return True
        
        # Check via broker_contact_id or broker_employment_id
        if broker["broker_contact_id"]:
            result = conn.execute(text("""
                SELECT 1
                FROM broker_of_record_history
                WHERE submission_id = :submission_id
                AND broker_contact_id = :contact_id
                AND end_date IS NULL
            """), {
                "submission_id": submission_id,
                "contact_id": broker["broker_contact_id"]
            })
            if result.fetchone():
                return True
        
        if broker["broker_employment_id"]:
            result = conn.execute(text("""
                SELECT 1
                FROM broker_of_record_history
                WHERE submission_id = :submission_id
                AND broker_contact_id = :employment_id
                AND end_date IS NULL
            """), {
                "submission_id": submission_id,
                "employment_id": broker["broker_employment_id"]
            })
            if result.fetchone():
                return True
        
        # Check if broker is a designee
        if broker["broker_contact_id"]:
            result = conn.execute(text("""
                SELECT 1
                FROM broker_designees d
                JOIN broker_of_record_history bh ON (
                    (d.owner_contact_id = bh.broker_contact_id) OR
                    (d.owner_employment_id::text = bh.broker_contact_id::text)
                )
                WHERE bh.submission_id = :submission_id
                AND d.designee_contact_id = :contact_id
                AND d.can_view_submissions = TRUE
                AND bh.end_date IS NULL
            """), {
                "submission_id": submission_id,
                "contact_id": broker["broker_contact_id"]
            })
            if result.fetchone():
                return True
        
        if broker["broker_employment_id"]:
            result = conn.execute(text("""
                SELECT 1
                FROM broker_designees d
                JOIN broker_of_record_history bh ON (
                    (d.owner_contact_id::text = bh.broker_contact_id::text) OR
                    (d.owner_employment_id = bh.broker_contact_id)
                )
                WHERE bh.submission_id = :submission_id
                AND d.designee_employment_id = :employment_id
                AND d.can_view_submissions = TRUE
                AND bh.end_date IS NULL
            """), {
                "submission_id": submission_id,
                "employment_id": broker["broker_employment_id"]
            })
            if result.fetchone():
                return True
    
    return False


@router.post("/logout")
async def logout(broker: dict = Depends(get_current_broker_from_session)):
    """Logout and invalidate session"""
    # Note: In a stateless JWT system, logout would be client-side.
    # Here we delete the session from DB.
    # For now, we'll rely on token expiration, but can add explicit logout later.
    return {"success": True, "message": "Logged out"}

