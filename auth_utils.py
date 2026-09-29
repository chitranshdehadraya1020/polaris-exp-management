"""
auth_utils.py
--------------
Small, team-friendly authentication helpers used by routes/auth_routes.py.

Uses Werkzeug's password hashing (Werkzeug ships with Flask, so this adds
no new dependency) and Flask's built-in server-side session (signed
cookie) rather than a separate JWT/token system -- simplest thing that
works correctly for a hackathon-scale app.
"""

from functools import wraps

from flask import session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash


def hash_password(plain_password: str) -> str:
    return generate_password_hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, plain_password)


def log_in_user(user) -> None:
    """Stores the minimum needed in the signed session cookie."""
    session["user_id"] = user.id
    session["user_email"] = user.email
    session["user_role"] = user.role


def log_out_user() -> None:
    session.clear()


def current_user_id():
    return session.get("user_id")


def is_logged_in() -> bool:
    return "user_id" in session


def login_required(view_func):
    """Route decorator: rejects the request with 401 if no active session.
    Usage: @login_required above a Flask route function."""
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not is_logged_in():
            return jsonify({"error": "Authentication required. Please log in."}), 401
        return view_func(*args, **kwargs)
    return wrapped
