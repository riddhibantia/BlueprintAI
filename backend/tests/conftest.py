"""Test isolation: every pytest session gets a FRESH disposable database.

Settings are read at import time, and conftest imports before any app module,
so forcing DATABASE_URL here guarantees no run can ever see another run's rows
(stale-file "Email exists" cascades become impossible by construction).
"""
import os
import tempfile

_fd, _path = tempfile.mkstemp(prefix="devblueprint_test_", suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_path}"


def pytest_sessionfinish(session, exitstatus):
    try:
        os.unlink(_path)
    except OSError:
        pass
