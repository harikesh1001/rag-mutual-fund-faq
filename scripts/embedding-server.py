from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

MODEL_NAME = "BAAI/bge-base-en-v1.5"
HOST = "127.0.0.1"
PORT = 8001

print(f"Loading embedding model: {MODEL_NAME}")

model = SentenceTransformer(MODEL_NAME)

print("Embedding model loaded.")

app = FastAPI()


class EmbedRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "dimensions": 768,
    }


@app.post("/embed")
def embed(request: EmbedRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Text is required.",
        )

    embedding = model.encode(
        text,
        normalize_embeddings=True,
    ).tolist()

    if len(embedding) != 768:
        raise HTTPException(
            status_code=500,
            detail=f"Expected 768 dimensions, got {len(embedding)}",
        )

    return {
        "embedding": embedding,
        "dimensions": len(embedding),
    }


if __name__ == "__main__":
    print(f"Starting embedding server on http://{HOST}:{PORT}")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
    )
