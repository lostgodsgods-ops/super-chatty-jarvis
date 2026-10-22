FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8788
WORKDIR /app
COPY python_core.py /app/python_core.py
EXPOSE 8788
CMD ["python", "/app/python_core.py"]
