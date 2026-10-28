"""Core module verification tests."""

from src.core import initialize_system


# [verifies: CORE-001/AC-CORE-001.1]
def test_initialize_system_defaults():
    config = initialize_system()
    assert config["status"] == "ready"
    assert config["version"] == "0.1.0"


# [verifies: CORE-001/AC-CORE-001.2]
def test_initialize_system_custom_overrides():
    config = initialize_system({"custom_key": "custom_val"})
    assert config["custom_key"] == "custom_val"
    assert config["status"] == "ready"
