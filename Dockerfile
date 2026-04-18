# --- STAGE 1: Frontend Build ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- STAGE 2: Final Runtime ---
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

# Set production environment
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production

WORKDIR /app

# Copy python dependencies first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Scrapling and ensure Playwright Chromium is linked
# The base image already contains the browsers, but this ensures 
# the Python environment is fully initialized.
RUN playwright install chromium && \
    python -m scrapling install

# Copy application code
COPY . .

# Copy the built frontend from Stage 1
# This replaces the local frontend/dist (if any) with the fresh build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose API port
EXPOSE 8000

# Start command
CMD ["python", "main.py"]
