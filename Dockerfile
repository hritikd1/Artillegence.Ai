# --- STAGE 1: Frontend Build ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- STAGE 2: Final Runtime ---
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

# Set production environment and Playwright optimization
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copy python dependencies first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Scrapling and link Playwright Chromium
# We split these to catch the exact error if one fails
RUN playwright install chromium
RUN python -m scrapling install

# Copy application code
COPY . .

# Copy the built frontend from Stage 1
# This replaces the local frontend/dist (if any) with the fresh build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose API port
EXPOSE 8000

# Start command
CMD ["python", "main.py"]
