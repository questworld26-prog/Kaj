"""Core module implementation."""


# [spec: CORE-001]
def initialize_system(config: dict | None = None) -> dict:
    """Initialize the system with default or custom configuration."""
    base_config = {"status": "ready", "version": "0.1.0"}
    if config:
        base_config.update(config)
    return base_config
