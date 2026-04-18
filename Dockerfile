# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Install system dependencies for Playwright and Node.js
# We use a comprehensive list to ensure Chromium runs without needing playwright install-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy application files
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Scrapling and Playwright Chromium
# We explicitly avoid install-deps to prevent root switching issues on Render
RUN playwright install chromium && \
    python -m scrapling install

# Build the frontend
RUN cd frontend && npm install && npm run build

# Expose the API port
EXPOSE 8000

# Start command
# We use uvicorn directly to ensure logging is correctly handled by Render
CMD ["python", "main.py"]
