FROM registry-1.docker.io/library/python:3.13-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY broker.py ./
USER 65534:65534
CMD ["python", "broker.py"]
