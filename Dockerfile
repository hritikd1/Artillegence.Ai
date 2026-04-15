# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Install system dependencies for Playwright and Node.js
# We need Node.js to build the frontend
RUN apt-get update && apt-get install -y \
    curl \
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
    librandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy application files
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Scrapling browsers and Playwright browsers
RUN python -m scrapling install && playwright install chromium

# Build the frontend
RUN cd frontend && npm install && npm run build

# Expose the API port
EXPOSE 8000

# Start command
CMD ["python", "main.py"]
