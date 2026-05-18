from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class CategoryRef(BaseModel):
    id: int
    name: str


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    role: str
    account_type: str
    avatar_url: str | None = None
    bio: str | None = None
    organizer_description: str | None = None
    phone: str | None = None
    city: str | None = None
    email_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserMeResponse(UserPublic):
    notify_email: bool
    notify_push: bool
    locale: str
    profile_visibility: str
    interests: list[CategoryRef] = []


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = Field(default=None, max_length=2000)
    organizer_description: str | None = Field(default=None, max_length=4000)
    phone: str | None = Field(default=None, max_length=32)
    city: str | None = Field(default=None, max_length=120)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserSettingsRequest(BaseModel):
    notify_email: bool | None = None
    notify_push: bool | None = None
    locale: str | None = Field(default=None, pattern="^(ru|en)$")
    profile_visibility: str | None = Field(default=None, pattern="^(public|friends|private)$")


class InterestsRequest(BaseModel):
    category_ids: list[int]


class OrganizerRequestResponse(BaseModel):
    id: int
    status: str
    description: str
    document_path: str
    admin_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str
