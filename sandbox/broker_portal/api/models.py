"""
Pydantic models for API request/response validation
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkResponse(BaseModel):
    success: bool
    message: str
    dev_token: Optional[str] = None  # Only in dev mode


class LoginResponse(BaseModel):
    success: bool
    token: str
    expires_at: datetime
    broker: dict


class SubmissionSummary(BaseModel):
    id: str
    applicant_name: Optional[str]
    account_name: Optional[str]
    status: str
    outcome: Optional[str]
    date_received: Optional[datetime]  # Can be None for some submissions
    premium: Optional[float] = None
    policy_limit: Optional[float] = None
    retention: Optional[float] = None


class SubmissionDetail(BaseModel):
    id: str
    applicant_name: Optional[str]
    account_name: Optional[str]
    status: str
    outcome: Optional[str]
    outcome_reason: Optional[str]
    date_received: datetime
    status_updated_at: Optional[datetime]
    business_summary: Optional[str]
    premium: Optional[float] = None
    policy_limit: Optional[float] = None
    retention: Optional[float] = None
    effective_date: Optional[str] = None
    expiration_date: Optional[str] = None
    status_history: List[dict] = []


class StatsResponse(BaseModel):
    total_submissions: int
    submissions_by_status: dict
    submissions_by_outcome: dict
    bound_rate: float
    lost_rate: float
    total_premium: float
    average_premium: float
    average_deal_size: float
    average_time_to_quote_days: Optional[float] = None
    average_time_to_bind_days: Optional[float] = None


class DocumentInfo(BaseModel):
    id: str
    filename: str
    document_type: Optional[str]
    page_count: Optional[int]
    created_at: datetime


class DocumentUploadResponse(BaseModel):
    success: bool
    document_id: str
    message: str


class DesigneeInfo(BaseModel):
    id: str
    name: str
    email: str
    can_view_submissions: bool
    created_at: datetime


class AddDesigneeRequest(BaseModel):
    email: EmailStr
    can_view_submissions: bool = True


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    error_code: Optional[str] = None

