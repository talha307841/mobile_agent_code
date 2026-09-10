FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd --system agentdeck && useradd --system --gid agentdeck agentdeck
COPY pyproject.toml alembic.ini ./
COPY server ./server
COPY client ./client
COPY shared ./shared
COPY migrations ./migrations
RUN pip install --no-cache-dir .
USER agentdeck
EXPOSE 8000
CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

