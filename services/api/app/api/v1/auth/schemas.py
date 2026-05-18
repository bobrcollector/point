from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=120)
    account_type: Literal["viewer", "organizer"] = "viewer"
    organizer_description: str | None = Field(default=None, min_length=20, max_length=4000)

    @model_validator(mode="after")
    def organizer_requires_description(self) -> "RegisterRequest":
        if self.account_type == "organizer" and not (self.organizer_description or "").strip():
            raise ValueError("organizer_description_required")
        return self

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str
