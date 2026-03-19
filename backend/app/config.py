from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://bcs_user:bcs_password@db:5432/bcs_registration"
    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "bcs2024"

    # Gmail SMTP — use a Gmail App Password (not your regular password)
    # How to create: Google Account → Security → 2-Step Verification → App Passwords
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""   # your Gmail address
    SMTP_PASSWORD: str = ""   # 16-character Gmail App Password

    class Config:
        env_file = ".env"

settings = Settings()
