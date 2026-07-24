"""
Real WebAuthn (passkey) device binding — the PROOF layer.
=========================================================
WHY A LIBRARY (py_webauthn, by Duo Security) AND NOT HAND-ROLLED:
WebAuthn's security lives entirely in server-side verification steps that are
individually easy to omit — and a ceremony that omits them still *looks* like it
works in manual testing. The library enforces all of them:
  • challenge is random, single-use and bound to THIS attempt
  • clientData.type is exactly webauthn.create / webauthn.get
  • origin matches EXACTLY            <- this is what actually stops phishing
  • RP-ID hash matches
  • signature counter strictly increases  <- this is the CLONE detection
  • attestation / COSE public-key parsing is correct
Skip the challenge binding or the origin check and you get a REPLAYABLE login
that passes every hand test. So: don't hand-roll it.

WHY THIS MATTERS FOR US:
Our old "device binding" was a canvas hash cached in localStorage. That is
client-asserted — anyone can open devtools and set it to any value, so it is a
cookie, not a proof. Here the private key is generated inside the device's
secure hardware and never leaves it, so the device *proves* itself with a
signature over a fresh server challenge. That is the real device factor.

Real UPI does the equivalent with an outbound SMS from the SIM + the NPCI
Common Library (both unavailable to a web app); WebAuthn is the closest
honest, cryptographically-real substitute the web platform offers.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

import webauthn
from webauthn.helpers import options_to_json
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

router = APIRouter(prefix="/auth/webauthn", tags=["webauthn"])

# Relying Party = who the credential is bound to. Origin must match EXACTLY or
# the library rejects the ceremony (that exact-match is the anti-phishing bit).
RP_ID = os.environ.get("WEBAUTHN_RP_ID", "localhost")
RP_NAME = "Payit"
EXPECTED_ORIGINS = [
    o.strip() for o in os.environ.get(
        "WEBAUTHN_ORIGINS",
        "http://localhost:5173,http://localhost:5174,http://localhost:5180"
    ).split(",")
]

# Single-use challenge store. Demo-scale: in production this belongs in Redis
# with a TTL. The security property that matters is that a challenge is issued
# by the server, used once, and discarded — which this preserves.
_challenges: dict[str, str] = {}

_bearer = HTTPBearer()


def _authed_account(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    """The caller's OWN account, resolved from their session token.

    Enrollment must be gated on an existing session. A passkey is only as strong
    as whatever was allowed to enrol it, and enrolment — not the crypto — is where
    passkey systems actually get broken. These routes used to take a bare `vpa`,
    and a VPA is public (you hand it out to get paid, /accounts/{vpa} resolves it),
    so anyone could bind THEIR authenticator to YOUR account and then log in as you
    with no credential at all.

    Imported lazily: server.app imports this router at the end of its own module,
    so a module-level import here would be circular.
    """
    from server.app import get_current_user
    return get_current_user(credentials)


def _assert_own_vpa(current_user: dict, vpa: str):
    if current_user["vpa"] != vpa:
        raise HTTPException(403, "Unauthorized to enrol a passkey for this VPA")


class OptionsReq(BaseModel):
    vpa: str


class VerifyReq(BaseModel):
    vpa: str
    credential: dict | None = None           # raw JSON from @simplewebauthn/browser
    fingerprint: dict | None = None   # env snapshot -> baseline / drift signal
    credential_id: str | None = None
    public_key: str | None = None
    client_data_json: str | None = None
    attestation_object: str | None = None
    authenticator_data: str | None = None
    signature: str | None = None


def _user(con, vpa: str):
    row = con.execute(
        "SELECT a.user_id, a.vpa, u.name FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.vpa=?",
        (vpa,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "account not found")
    return row


def _fp_drift(baseline_json: str | None, current: dict | None) -> dict:
    """Compare a fingerprint snapshot against the baseline captured at
    registration. The fingerprint is NEVER an auth decision — a passkey already
    proved the device. This is purely a RISK SIGNAL: the same hardware key
    reporting a different browser/screen/timezone is worth scoring."""
    if not baseline_json or not current:
        return {"drift_score": 0, "changed": [], "note": "no baseline"}
    try:
        base = json.loads(baseline_json)
    except Exception:
        return {"drift_score": 0, "changed": [], "note": "bad baseline"}
    changed = [k for k in ("ua", "lang", "screen", "tz", "canvas")
               if k in base and k in current and base[k] != current[k]]
    # timezone / canvas changing under the same hardware key is the loudest signal
    weights = {"canvas": 40, "tz": 25, "screen": 20, "ua": 10, "lang": 5}
    return {"drift_score": min(sum(weights.get(k, 5) for k in changed), 100),
            "changed": changed}


# --------------------------------------------------------------- registration
@router.post("/auth/webauthn/register-options")
def register_options(req: OptionsReq, current_user: dict = Depends(_authed_account)):
    from server.app import db
    _assert_own_vpa(current_user, req.vpa)
    con = db()
    u = _user(con, req.vpa)
    con.close()

    opts = webauthn.generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=str(u["user_id"]).encode(),
        user_name=req.vpa,
        user_display_name=u["name"],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    _challenges[req.vpa] = webauthn.helpers.bytes_to_base64url(opts.challenge)
    return json.loads(options_to_json(opts))


@router.post("/auth/webauthn/register")
def register_verify(req: VerifyReq, current_user: dict = Depends(_authed_account)):
    from server.app import db, now_iso
    _assert_own_vpa(current_user, req.vpa)
    expected = _challenges.pop(req.vpa, None)      # single use
    if not expected:
        raise HTTPException(400, "no pending challenge — request options first")

    if not req.credential:
        req.credential = {
            "id": req.credential_id,
            "rawId": req.credential_id,
            "type": "public-key",
            "response": {
                "clientDataJSON": req.client_data_json,
                "attestationObject": req.attestation_object
            }
        }

    con = db()
    u = _user(con, req.vpa)
    try:
        v = webauthn.verify_registration_response(
            credential=req.credential,
            expected_challenge=webauthn.helpers.base64url_to_bytes(expected),
            expected_rp_id=RP_ID,
            expected_origin=EXPECTED_ORIGINS,
        )
    except Exception as e:
        con.close()
        raise HTTPException(400, f"passkey registration failed: {e}")

    cred_id = webauthn.helpers.bytes_to_base64url(v.credential_id)
    pub = webauthn.helpers.bytes_to_base64url(v.credential_public_key)
    con.execute(
        """INSERT INTO webauthn_credentials
           (user_id, credential_id, public_key, sign_count, fp_baseline, created_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT (credential_id) DO UPDATE
             SET public_key=EXCLUDED.public_key, sign_count=EXCLUDED.sign_count""",
        (u["user_id"], cred_id, pub, v.sign_count,
         json.dumps(req.fingerprint or {}), now_iso()))
    con.commit()
    con.close()
    return {"result": "registered", "credential_id": cred_id,
            "message": "Passkey bound to this device (private key stays in hardware)."}


# --------------------------------------------------------------- authentication
@router.post("/auth/webauthn/login-options")
def login_options(req: OptionsReq):
    from server.app import db
    con = db()
    u = _user(con, req.vpa)
    rows = con.execute(
        "SELECT credential_id FROM webauthn_credentials WHERE user_id=?",
        (u["user_id"],)).fetchall()
    con.close()
    if not rows:
        raise HTTPException(404, "no passkey registered for this account")

    opts = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=[
            webauthn.helpers.structs.PublicKeyCredentialDescriptor(
                id=webauthn.helpers.base64url_to_bytes(r["credential_id"]))
            for r in rows
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    _challenges[req.vpa] = webauthn.helpers.bytes_to_base64url(opts.challenge)
    return json.loads(options_to_json(opts))


@router.post("/auth/webauthn/login")
def login_verify(req: VerifyReq):
    from server.app import db, now_iso, _issue_token_for_user
    expected = _challenges.pop(req.vpa, None)      # single use
    if not expected:
        raise HTTPException(400, "no pending challenge — request options first")

    if not req.credential:
        req.credential = {
            "id": req.credential_id,
            "rawId": req.credential_id,
            "type": "public-key",
            "response": {
                "authenticatorData": req.authenticator_data,
                "clientDataJSON": req.client_data_json,
                "signature": req.signature
            }
        }

    con = db()
    u = _user(con, req.vpa)
    cred_id = req.credential.get("id")
    row = con.execute(
        "SELECT * FROM webauthn_credentials WHERE credential_id=? AND user_id=?",
        (cred_id, u["user_id"])).fetchone()
    if not row:
        con.close()
        raise HTTPException(404, "unknown passkey for this account")

    try:
        v = webauthn.verify_authentication_response(
            credential=req.credential,
            expected_challenge=webauthn.helpers.base64url_to_bytes(expected),
            expected_rp_id=RP_ID,
            expected_origin=EXPECTED_ORIGINS,
            credential_public_key=webauthn.helpers.base64url_to_bytes(row["public_key"]),
            credential_current_sign_count=row["sign_count"],
        )
    except Exception as e:
        con.close()
        raise HTTPException(401, f"passkey verification failed: {e}")

    # CLONE DETECTION: the authenticator's counter must strictly increase.
    # A counter that stalls or goes backwards means the credential was copied.
    if v.new_sign_count and v.new_sign_count <= row["sign_count"]:
        con.close()
        raise HTTPException(401, "passkey clone suspected (signature counter did not advance)")

    drift = _fp_drift(row["fp_baseline"], req.fingerprint)
    con.execute("UPDATE webauthn_credentials SET sign_count=?, last_used_at=? WHERE id=?",
                (v.new_sign_count, now_iso(), row["id"]))
    con.commit()
    out = _issue_token_for_user(con, u["user_id"], req.vpa)
    con.close()
    # drift is returned as a SIGNAL for the fraud layer, never as an auth verdict
    out["device_proof"] = "webauthn"
    out["fingerprint_drift"] = drift
    return out