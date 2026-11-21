#!/usr/bin/env python3
"""Probe the live Clerk instance for the email+password flow.

Runs against the *development* instance using only the publishable key, the
same way the browser does. Uses Clerk's test-email convention
(`+clerk_test`) so the emailed code is always 424242 and no inbox is needed.

Exit code 0 means every step behaved as the Jova UI expects.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

PK = "pk_test_YnVzeS1tYXlmbHktNjM1OS5jbGVyay5hY2NvdW50cy5kZXYk"
HOST = "busy-mayfly-6359.clerk.accounts.dev"
Q = "__clerk_api_version=2025-04-10&_clerk_js_version=5.0.0"
PASSWORD = "Qm7vLp2Rt9Xw4Zb8"

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(path, data=None, method=None):
    url = f"https://{HOST}{path}?{Q}"
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method or ("POST" if data else "GET"))
    req.add_header("Authorization", f"Bearer {PK}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with opener.open(req, timeout=25) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"raw": raw.decode("utf-8", "replace")[:300]}


def errs(payload):
    return [(e.get("code"), e.get("message")) for e in payload.get("errors", [])]


def main():
    ok = True
    email = f"jova.probe{int(time.time())}+clerk_test@example.com"
    print(f"probe email: {email}\n")

    # 0. bootstrap a client so the instance issues a __client cookie
    st, _ = call("/v1/client")
    print(f"[0] bootstrap client            HTTP {st}  cookies={len(list(jar))}")

    # 1. sign up with email + password
    st, su = call("/v1/client/sign_ups", {"email_address": email, "password": PASSWORD})
    r = su.get("response") or {}
    print(f"[1] sign_up email+password      HTTP {st}  status={r.get('status')} "
          f"password_enabled={r.get('password_enabled')}")
    if errs(su):
        print("    errors:", errs(su))
        ok = False
    suid = r.get("id")

    # 2. verify the email with the test code
    if suid:
        st, v = call(f"/v1/client/sign_ups/{suid}/attempt_verification",
                     {"strategy": "email_code", "code": "424242"})
        r = v.get("response") or {}
        print(f"[2] verify email code 424242    HTTP {st}  status={r.get('status')} "
              f"session={r.get('created_session_id')}")
        if errs(v):
            print("    errors:", errs(v))
            ok = False

    # 3. sign in with email + password (the thing the user asked for)
    st, si = call("/v1/client/sign_ins", {"strategy": "password",
                                          "identifier": email, "password": PASSWORD})
    r = si.get("response") or {}
    print(f"[3] sign_in email+password      HTTP {st}  status={r.get('status')} "
          f"session={r.get('created_session_id')}")
    if errs(si):
        print("    errors:", errs(si))
        ok = False

    # 4. wrong password must be rejected as a password error, not a strategy error
    st, bad = call("/v1/client/sign_ins", {"strategy": "password",
                                           "identifier": email, "password": "WrongPassword999"})
    codes = [c for c, _ in errs(bad)]
    print(f"[4] sign_in wrong password      HTTP {st}  codes={codes}")
    if "form_password_incorrect" not in codes:
        print("    expected form_password_incorrect")
        ok = False

    # 5. an OAuth-only account (no password) must say so, not 'invalid strategy'
    st, oauth = call("/v1/client/sign_ins", {"strategy": "password",
                                             "identifier": "natlusniel@gmail.com",
                                             "password": PASSWORD})
    codes = [c for c, _ in errs(oauth)]
    print(f"[5] sign_in password, OAuth user HTTP {st}  codes={codes}")
    if "strategy_for_user_invalid" not in codes:
        print("    expected strategy_for_user_invalid (account has no password)")

    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
