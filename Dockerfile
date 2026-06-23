# Smart AgriSense — generic service image.
# Build one image per microservice by passing the service folder as SERVICE:
#   docker build --build-arg SERVICE=plant-detection -t agrisense/plant-detection .
#   docker build --build-arg SERVICE=insect-detection -t agrisense/insect-detection .
#   docker build --build-arg SERVICE=disease-detection -t agrisense/disease-detection .
#   docker build --build-arg SERVICE=crop-recommendation -t agrisense/crop-recommendation .
FROM python:3.11-slim

# libgomp1 is required by the PyTorch CPU runtime; the rest keep Pillow happy.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) CPU-only PyTorch (no CUDA) — dramatically smaller than the default wheel.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.12.0 torchvision==0.27.0

# 2) The rest of the Python dependencies.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3) The selected microservice (code + model weights baked into the image).
ARG SERVICE
COPY ${SERVICE}/ .

# Every service listens on 8000 inside the container (mapped externally).
ENV PORT=8000 \
    MQTT_BROKER="" \
    MQTT_PORT=1883 \
    PYTHONUNBUFFERED=1
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["python", "service.py"]
