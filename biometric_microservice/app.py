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
import gradio as gr

# Create FastAPI app
fastapi_app = FastAPI(title="Smart Attendance Biometric API")

# Allow CORS
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-load FaceAnalysis to prevent boot timeout in free platforms
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
    img_a = decode_image_from_b64(frame_a_b64)
    img_b = decode_image_from_b64(frame_b_b64)

    if img_a is None or img_b is None:
        return False, "Failed to decode camera frames."

    try:
        faces_b = get_face_analysis().get(img_b)
    except Exception as e:
        sys.stderr.write(f"Model inference failed: {e}\n")
        return False, f"Model inference failed: {e}"
    if not faces_b:
        return False, "No face detected in the live frame."

    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)
    
    mean_diff = np.mean(cv2.absdiff(gray_a, gray_b))

    if mean_diff < 0.45:
        return False, "Spoofing detected: Static display/photo presentation attack."

    box_b = faces_b[0].bbox.astype(int)
    face_crop_b = img_b[max(0, box_b[1]):min(img_b.shape[0], box_b[3]), max(0, box_b[0]):min(img_b.shape[1], box_b[2])]
    face_crop_a = img_a[max(0, box_b[1]):min(img_a.shape[0], box_b[3]), max(0, box_b[0]):min(img_a.shape[1], box_b[2])]

    if face_crop_b.size == 0 or face_crop_a.size == 0:
        return False, "Spoofing detected: Face bounds invalid."

    gray_face = cv2.cvtColor(face_crop_b, cv2.COLOR_BGR2GRAY)
    high_brights = np.sum(gray_face > 240) / gray_face.size
    if high_brights > 0.08:
        return False, "Spoofing detected: High glare display screen reflection."

    gray_face_a = cv2.cvtColor(face_crop_a, cv2.COLOR_BGR2GRAY)
    
    # 1. 3D Structure Check (Standard Deviation of Flash Reflection)
    # A flat screen reflects light uniformly (low std dev). A real 3D face 
    # reflects light unevenly across the nose, cheeks, and forehead (high std dev).
    diff_face = cv2.absdiff(gray_face_a, gray_face)
    std_diff = np.std(diff_face)
    
    if std_diff < 1.5:
        return False, "Spoofing detected: Flat 2D surface reflection (Screen/Paper)."
        
    # 2. Flash Brightness Check
    mean_a = np.mean(gray_face_a)
    mean_b = np.mean(gray_face)
    if (mean_a - mean_b) < 0.5:
        return False, "Spoofing detected: Flash brightness differential failed."

    # 3. Enhanced Color Flash Check
    avg_color_a = np.mean(face_crop_a, axis=(0, 1))
    avg_color_b = np.mean(face_crop_b, axis=(0, 1))

    pink_ratio_a = (avg_color_a[2] + avg_color_a[0]) / (avg_color_a[1] + 1e-5)
    pink_ratio_b = (avg_color_b[2] + avg_color_b[0]) / (avg_color_b[1] + 1e-5)

    if (pink_ratio_a - pink_ratio_b) < 0.04:
         return False, "Spoofing detected: No color flash reflection on face (Screen detected)."

    emb = faces_b[0].normed_embedding.tolist()
    gc.collect()
    return True, emb

@fastapi_app.post("/extract")
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

@fastapi_app.get("/health")
async def health():
    return {"status": "healthy"}

# Define a minimal Gradio interface for visual representation
def api_status_page():
    return "### 🟢 Smart Attendance Biometric API is running successfully!"

demo = gr.Interface(
    fn=api_status_page,
    inputs=None,
    outputs=gr.Markdown(),
    title="Biometric Verification Daemon",
    description="This Hugging Face Space hosts the background biometric and anti-spoofing engine for your smart attendance web application."
)

# Mount our custom FastAPI routes onto Gradio's server
# Note: Gradio will handle hosting, making our FastAPI routes active at the root path /
app = gr.mount_gradio_app(fastapi_app, demo, path="/api-docs")
