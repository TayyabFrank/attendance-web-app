FROM python:3.9-slim

# Install system dependencies for OpenCV and cmake compiling tools
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the buffalo_l face model on build so that it does not slow down the boot time when deployed
RUN python -c "import insightface; insightface.app.FaceAnalysis(name='buffalo_l')"

COPY . .

# Hugging Face Spaces default port is 7860
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
