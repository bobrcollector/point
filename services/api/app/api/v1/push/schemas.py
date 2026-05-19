from __future__ import annotations

from pydantic import BaseModel


class VapidPublicKeyResponse(BaseModel):
    enabled: bool
    public_key: str


class PushSubscribeKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeBody(BaseModel):
    endpoint: str
    keys: PushSubscribeKeys
