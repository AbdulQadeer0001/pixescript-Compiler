from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/pixelscript"
    # JSON list in .env, e.g. CORS_ORIGINS=["http://localhost:5173"]
    cors_origins: list[str] = [
        "http://localhost:8080", "http://127.0.0.1:8080",  # TanStack/Lovable dev server default
        "http://localhost:5173", "http://127.0.0.1:5173",  # plain Vite default
    ]
    # Any localhost / 127.0.0.1 port (covers 8081 when 8080 is busy, preview ports, etc.)
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
