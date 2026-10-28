"""python -m app  ->  start the server."""
import logging
import os

import uvicorn

from .config import Settings
from .main import create_app


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = Settings.load()
    if s.mock_mode:
        logging.getLogger("app").warning("MOCK_MODE is on: scripted replies, no real STT/LLM/TTS")
    if not s.public_base_url:
        logging.getLogger("app").warning("PUBLIC_BASE_URL not set: phone calls need a public https URL (see README)")
    uvicorn.run(create_app(s), host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "8000")),
                log_level="info")


if __name__ == "__main__":
    main()
