import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
import sys
import gc
import base64
import numpy as np
import cv2
import insightface
from insightface.app import FaceAnalysis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Union

app = FastAPI(title="Smart Attendance Biometric API")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-load FaceAnalysis to prevent boot timeout in serverless/free platforms
face_analysis = None
def get_face_analysis():
    global face_analysis
    if face_analysis is None:
        try:
            print("Initializing InsightFace buffalo_sc in memory...")
            face_analysis = FaceAnalysis(name='buffalo_sc', allowed_modules=['detection', 'recognition'], providers=['CPUExecutionProvider'])
            face_analysis.prepare(ctx_id=0, det_size=(320, 320))
            print("InsightFace model loaded successfully.")
        except Exception as e:
            sys.stderr.write(f"Model initialization error: {e}\n")
            raise HTTPException(status_code=500, detail=f"Model initialization error: {e}")
    return face_analysis

class FacePayload(BaseModel):
    facePhoto: Union[str, List[str]]

def decode_image_from_b64(b64_image):
    if ',' in b64_image:
        b64_image = b64_image.split(',', 1)[1]
    try:
        img_data = base64.b64decode(b64_image)
        nparr = np.frombuffer(img_data, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        sys.stderr.write(f"Base64 decode error: {e}\n")
        return None

def get_embedding_from_b64(b64_image):
    img = decode_image_from_b64(b64_image)
    if img is None:
        return None

    try:
        faces = get_face_analysis().get(img)
    except Exception as e:
        sys.stderr.write(f"Model inference failed: {e}\n")
        return None
    if not faces:
        return None

    emb = faces[0].normed_embedding.tolist()
    gc.collect()
    return emb

def perform_liveness_check(frame_a_b64, frame_b_b64):
    # Completely stripped spoofing checks as requested!
    # Just detect the face and return the embedding.
    img_b = decode_image_from_b64(frame_b_b64)

    if img_b is None:
        return False, "Failed to decode camera frame."

    try:
        faces_b = get_face_analysis().get(img_b)
    except Exception as e:
        sys.stderr.write(f"Model inference failed: {e}\n")
        return False, f"Model inference failed: {e}"

    if not faces_b:
        return False, "No face detected in the live frame."

    emb = faces_b[0].normed_embedding.tolist()
    gc.collect()
    return True, emb

@app.post("/extract")
async def extract(payload: FacePayload):
    face_photo = payload.facePhoto
    
    if isinstance(face_photo, list):
        if len(face_photo) == 2:
            success, result = perform_liveness_check(face_photo[0], face_photo[1])
            if success:
                return {"embedding": result}
            else:
                raise HTTPException(status_code=400, detail=result)
        else:
            embedding = None
            for img in face_photo:
                emb = get_embedding_from_b64(img)
                if emb:
                    embedding = emb
                    break
            if embedding:
                return {"embedding": embedding}
            else:
                raise HTTPException(status_code=400, detail="No face detected in registration photos.")
    else:
        embedding = get_embedding_from_b64(face_photo)
        if embedding:
            return {"embedding": embedding}
        else:
            raise HTTPException(status_code=400, detail="No face detected in the provided image.")

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    # Standalone run defaults to 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)
