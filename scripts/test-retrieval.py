import json
import urllib.error
import urllib.request

from sentence_transformers import SentenceTransformer


QUERY = "What is SBI Large Cap Fund?"
MODEL_NAME = "BAAI/bge-base-en-v1.5"


def load_env():
    values = {}

    with open(".env.local", "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"').strip("'")

    return values


def call_supabase_rpc(base_url, service_key, embedding):
    url = f"{base_url.rstrip('/')}/rest/v1/rpc/match_document_chunks"

    payload = {
    "query_embedding": "[" + ",".join(str(value) for value in embedding) + "]",
    "p_match_count": 5,
    "p_filter_scheme_id": None,
}

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response_body = response.read().decode("utf-8")

            if not response_body:
                return []

            return json.loads(response_body)

    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")

        print("\n" + "=" * 70)
        print("SUPABASE RPC ERROR")
        print("=" * 70)
        print(f"HTTP status: {error.code}")
        print(f"Request URL: {url}")
        print(f"Response: {error_body}")
        print("=" * 70)

        raise RuntimeError(
            f"Supabase RPC failed with HTTP {error.code}: {error_body}"
        ) from error

    except urllib.error.URLError as error:
        print("\n" + "=" * 70)
        print("NETWORK ERROR")
        print("=" * 70)
        print(f"Request URL: {url}")
        print(f"Reason: {error.reason}")
        print("=" * 70)

        raise RuntimeError(
            f"Could not connect to Supabase: {error.reason}"
        ) from error


def main():
    env = load_env()

    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not base_url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL is missing")

    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing")

    print(f"Query: {QUERY}")
    print(f"Loading model: {MODEL_NAME}")

    model = SentenceTransformer(MODEL_NAME)

    print("Generating query embedding...")

    embedding = model.encode(
        QUERY,
        normalize_embeddings=True,
    ).tolist()

    if len(embedding) != 768:
        raise RuntimeError(
            f"Expected 768 dimensions, received {len(embedding)}"
        )

    print("Query embedding: 768 dimensions")
    print("Searching Supabase...")

    results = call_supabase_rpc(
        base_url,
        service_key,
        embedding,
    )

    print(f"\nRetrieved chunks: {len(results)}\n")

    for index, result in enumerate(results, start=1):
        print("=" * 70)
        print(f"RESULT {index}")
        print(f"Similarity: {result.get('similarity')}")
        print(f"Source: {result.get('source_title')}")
        print(f"URL: {result.get('source_url')}")
        print(f"Document type: {result.get('document_type')}")
        print("\nContent:")
        print(result.get("content", "")[:700])
        print()


if __name__ == "__main__":
    main()