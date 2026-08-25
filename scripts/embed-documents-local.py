#!/usr/bin/env python3
"""Generate local BGE embeddings for unembedded Supabase document chunks."""

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional


MODEL_NAME = "BAAI/bge-base-en-v1.5"
EXPECTED_DIMENSION = 768
ENCODE_BATCH_SIZE = 16
FETCH_PAGE_SIZE = 500
MAX_WRITE_ATTEMPTS = 5
WRITE_TIMEOUT_SECONDS = 30


def load_env() -> Dict[str, str]:
    values: Dict[str, str] = {}
    env_path = Path.cwd() / ".env.local"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def supabase_request(
    base_url: str,
    service_role_key: str,
    path: str,
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,
    prefer: Optional[str] = None,
) -> tuple[bytes, Dict[str, str]]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=WRITE_TIMEOUT_SECONDS) as response:
            return response.read(), {key.lower(): value for key, value in response.headers.items()}
    except urllib.error.HTTPError as error:
        error.read()
        raise RuntimeError(f"Supabase HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Supabase request timeout or connection failure") from error


def count_chunks(base_url: str, key: str, filter_expression: str = "") -> int:
    query = urllib.parse.urlencode({"select": "id", **({"embedding": filter_expression} if filter_expression else {})})
    _, headers = supabase_request(base_url, key, f"/rest/v1/document_chunks?{query}", prefer="count=exact")
    content_range = headers.get("content-range", "")
    try:
        return int(content_range.rsplit("/", 1)[1])
    except (IndexError, ValueError) as error:
        raise RuntimeError("Supabase did not return an exact chunk count") from error


def load_unembedded_chunks(base_url: str, key: str) -> List[Dict[str, Any]]:
    chunks: List[Dict[str, Any]] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "select": "id,content",
                "embedding": "is.null",
                "order": "id",
                "limit": FETCH_PAGE_SIZE,
                "offset": offset,
            }
        )
        payload, _ = supabase_request(base_url, key, f"/rest/v1/document_chunks?{query}")
        page = json.loads(payload.decode("utf-8"))
        chunks.extend(page)
        if len(page) < FETCH_PAGE_SIZE:
            return chunks
        offset += FETCH_PAGE_SIZE


def retryable(error: RuntimeError) -> bool:
    return any(token in str(error) for token in ("HTTP 429", "HTTP 500", "HTTP 502", "HTTP 503", "HTTP 504", "timeout", "connection"))


def store_embedding(base_url: str, key: str, chunk_id: str, embedding: List[float]) -> None:
    path = f"/rest/v1/document_chunks?id=eq.{urllib.parse.quote(chunk_id, safe='')}&embedding=is.null"
    body = {"embedding": "[" + ",".join(f"{value:.9g}" for value in embedding) + "]"}
    for attempt in range(1, MAX_WRITE_ATTEMPTS + 1):
        try:
            supabase_request(base_url, key, path, method="PATCH", body=body, prefer="return=minimal")
            return
        except RuntimeError as error:
            if attempt == MAX_WRITE_ATTEMPTS or not retryable(error):
                raise
            time.sleep(2 ** (attempt - 1))


def choose_device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else "cpu"


def main() -> int:
    env = load_env()
    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_role_key:
        raise RuntimeError("Supabase server configuration is missing")

    total = count_chunks(base_url, service_role_key)
    unembedded_count = count_chunks(base_url, service_role_key, "is.null")
    unembedded = load_unembedded_chunks(base_url, service_role_key)
    if len(unembedded) != unembedded_count:
        raise RuntimeError("Paginated unembedded chunk count does not match Supabase count")
    already_embedded = total - len(unembedded)
    print(f"Preflight passed: {total} chunks; {unembedded_count} embeddings NULL")

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL_NAME, device=choose_device())
    successful = 0
    failed = 0
    for offset in range(0, len(unembedded), ENCODE_BATCH_SIZE):
        batch = unembedded[offset : offset + ENCODE_BATCH_SIZE]
        vectors = model.encode(
            [chunk["content"] for chunk in batch],
            batch_size=ENCODE_BATCH_SIZE,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        if len(vectors) != len(batch):
            raise RuntimeError("Local model returned an unexpected embedding count")
        for chunk, vector in zip(batch, vectors):
            values = vector.tolist()
            if len(values) != EXPECTED_DIMENSION or not all(math.isfinite(value) for value in values):
                raise RuntimeError(f"Invalid embedding dimension for chunk {chunk['id']}")
            try:
                store_embedding(base_url, service_role_key, chunk["id"], values)
                successful += 1
            except RuntimeError as error:
                failed += 1
                print(f"Chunk write failed ({chunk['id']}): {error}", file=sys.stderr)
        print(f"Progress: {min(offset + len(batch), len(unembedded))}/{len(unembedded)} unembedded chunks processed")

    remaining = count_chunks(base_url, service_role_key, "is.null")
    print("Embedding generation complete")
    print(f"Total chunks: {total}")
    print(f"Already embedded: {already_embedded}")
    print(f"Successfully embedded: {successful}")
    print(f"Failed: {failed}")
    print(f"Remaining unembedded: {remaining}")
    print(f"Embedding dimension: {EXPECTED_DIMENSION}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"Embedding generation failed: {error}", file=sys.stderr)
        raise SystemExit(1)