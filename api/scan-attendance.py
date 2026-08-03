import os
import json
import time
import base64
import hmac
import hashlib
import secrets
from datetime import datetime
from http.server import BaseHTTPRequestHandler
import numpy as np
import cv2
import onnxruntime as ort
from supabase import create_client

# Environment variables
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
HMAC_SECRET = os.environ.get("HMAC_SECRET", "fallback-secret-key-12345")

# Global variables for models and Supabase client
DETECTOR_SESSION = None
RECOGNIZER_SESSION = None
LIVENESS_SESSION = None
supabase_client = None

# Initialize Supabase client
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Failed to initialize Supabase client: {e}")

def init_sessions():
    """Load ONNX sessions globally so they stay warm in memory across serverless calls."""
    global DETECTOR_SESSION, RECOGNIZER_SESSION, LIVENESS_SESSION
    base_dir = os.path.dirname(os.path.dirname(__file__))
    models_dir = os.path.join(base_dir, "backend", "models")
    
    detector_path = os.path.normpath(os.path.join(models_dir, "scrfd_500m.onnx"))
    recognizer_path = os.path.normpath(os.path.join(models_dir, "arcface_mobilefacenet.onnx"))
    liveness_path = os.path.normpath(os.path.join(models_dir, "minifasnet.onnx"))
    
    providers = ['CPUExecutionProvider']
    
    if DETECTOR_SESSION is None and os.path.exists(detector_path):
        DETECTOR_SESSION = ort.InferenceSession(detector_path, providers=providers)
    if RECOGNIZER_SESSION is None and os.path.exists(recognizer_path):
        RECOGNIZER_SESSION = ort.InferenceSession(recognizer_path, providers=providers)
    if LIVENESS_SESSION is None and os.path.exists(liveness_path):
        LIVENESS_SESSION = ort.InferenceSession(liveness_path, providers=providers)

# Post-processing helpers for SCRFD
def distance2bbox(points, distance, stride):
    x1 = points[:, 0] - distance[:, 0] * stride
    y1 = points[:, 1] - distance[:, 1] * stride
    x2 = points[:, 0] + distance[:, 2] * stride
    y2 = points[:, 1] + distance[:, 3] * stride
    return np.stack([x1, y1, x2, y2], axis=-1)

def distance2kps(points, distance, stride):
    kps = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, 0] + distance[:, i] * stride
        py = points[:, 1] + distance[:, i+1] * stride
        kps.append(np.stack([px, py], axis=-1))
    return np.stack(kps, axis=1)

def nms(bboxes, scores, iou_threshold=0.4):
    if len(bboxes) == 0:
        return []
    x1 = bboxes[:, 0]
    y1 = bboxes[:, 1]
    x2 = bboxes[:, 2]
    y2 = bboxes[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        inds = np.where(ovr <= iou_threshold)[0]
        order = order[inds + 1]
    return keep

def generate_anchors_and_decode(outputs, height, width, score_threshold=0.5):
    strides = [8, 16, 32]
    scores_outputs = []
    bboxes_outputs = []
    kps_outputs = []
    
    for out in outputs:
        tensor = out[0]
        channels = tensor.shape[1]
        if channels == 1:
            scores_outputs.append(tensor)
        elif channels == 4:
            bboxes_outputs.append(tensor)
        elif channels == 10:
            kps_outputs.append(tensor)
            
    # Sort by prediction counts descending (stride 8 has largest grid count, stride 32 has smallest)
    scores_outputs.sort(key=lambda x: x.shape[0], reverse=True)
    bboxes_outputs.sort(key=lambda x: x.shape[0], reverse=True)
    kps_outputs.sort(key=lambda x: x.shape[0], reverse=True)
    
    all_bboxes = []
    all_scores = []
    all_kps = []
    
    for i, stride in enumerate(strides):
        scores = scores_outputs[i]
        bboxes_dist = bboxes_outputs[i]
        kps_dist = kps_outputs[i]
        
        f_h = height // stride
        f_w = width // stride
        
        x = np.arange(0, f_w) * stride
        y = np.arange(0, f_h) * stride
        x_grid, y_grid = np.meshgrid(x, y)
        anchor_centers = np.stack([x_grid, y_grid], axis=-1).reshape(-1, 2)
        anchor_centers = np.repeat(anchor_centers, 2, axis=0)
        
        num_preds = scores.shape[0]
        if anchor_centers.shape[0] != num_preds:
            anchor_centers = anchor_centers[:num_preds]
            
        scores_s = scores[:, 0]
        idx = np.where(scores_s >= score_threshold)[0]
        if len(idx) == 0:
            continue
            
        centers = anchor_centers[idx]
        dists = bboxes_dist[idx]
        kps_d = kps_dist[idx]
        scs = scores_s[idx]
        
        bboxes_decoded = distance2bbox(centers, dists, stride)
        kps_decoded = distance2kps(centers, kps_d, stride)
        
        all_bboxes.append(bboxes_decoded)
        all_scores.append(scs)
        all_kps.append(kps_decoded)
        
    if not all_bboxes:
        return np.empty((0, 4)), np.empty((0,)), np.empty((0, 5, 2))
        
    bboxes = np.concatenate(all_bboxes, axis=0)
    scores = np.concatenate(all_scores, axis=0)
    kps = np.concatenate(all_kps, axis=0)
    
    return bboxes, scores, kps

def crop_minifasnet(img, bbox):
    """Crop the face bounding box with a 2.7x scale margin for passive liveness verification."""
    x1, y1, x2, y2 = bbox
    w = x2 - x1
    h = y2 - y1
    cx = x1 + w / 2
    cy = y1 + h / 2
    
    scale = max(w, h) * 2.7
    
    nx1 = int(cx - scale / 2)
    ny1 = int(cy - scale / 2)
    nx2 = int(cx + scale / 2)
    ny2 = int(cy + scale / 2)
    
    img_h, img_w, _ = img.shape
    pad_y = max(0, -ny1, ny2 - img_h)
    pad_x = max(0, -nx1, nx2 - img_w)
    
    if pad_y > 0 or pad_x > 0:
        padded = cv2.copyMakeBorder(img, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=[0, 0, 0])
        crop = padded[ny1+pad_y : ny2+pad_y, nx1+pad_x : nx2+pad_x]
    else:
        crop = img[ny1:ny2, nx1:nx2]
        
    return cv2.resize(crop, (80, 80))

def align_face(img, kps):
    """Align the face using the 5 keypoints template mapping for ArcFace embeddings."""
    src = np.array([
        [38.2946, 51.6963],
        [73.5318, 51.6963],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.3655]
    ], dtype=np.float32)
    
    dst = np.array(kps, dtype=np.float32)
    tform, _ = cv2.estimateAffinePartial2D(dst, src)
    if tform is None:
        return cv2.resize(img, (112, 112))
        
    return cv2.warpAffine(img, tform, (112, 112))

class handler(BaseHTTPRequestHandler):
    def _send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-User-Role')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
        
    def _send_json_error(self, status, error_msg):
        self._send_json_response(status, {"error": error_msg})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-User-Role')
        self.end_headers()

    def do_GET(self):
        """GET request retrieves a randomized one-use color challenge token."""
        if not supabase_client:
            self._send_json_error(500, "Supabase connection is not initialized")
            return
            
        try:
            token = secrets.token_hex(16)
            # Insert challenge token in database
            supabase_client.table("challenge_tokens").insert({"token": token}).execute()
            self._send_json_response(200, {"token": token})
        except Exception as e:
            self._send_json_error(500, f"Database error generating challenge token: {str(e)}")

    def do_POST(self):
        """POST executes the cryptographic, liveness, and recognition pipeline."""
        if not supabase_client:
            self._send_json_error(500, "Supabase connection is not initialized")
            return
            
        try:
            # Load warm ONNX sessions
            init_sessions()
            if DETECTOR_SESSION is None or RECOGNIZER_SESSION is None or LIVENESS_SESSION is None:
                self._send_json_error(500, "Model sessions failed to initialize or model files are missing")
                return

            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
            except Exception:
                self._send_json_error(400, "Invalid JSON payload")
                return
                
            frame_a_b64 = data.get("frameA")
            frame_b_b64 = data.get("frameB")
            token = data.get("token")
            timestamp = data.get("timestamp")
            signature = data.get("signature")
            employee_id_input = data.get("employeeId")
            
            if not all([frame_a_b64, frame_b_b64, token, timestamp, signature]):
                self._send_json_error(400, "Missing required request parameters")
                return
                
            # Step 1: Time-Locked Cryptographic Signature Validation
            # Strip base64 headers if present
            if frame_a_b64.startswith("data:image"):
                frame_a_b64 = frame_a_b64.split(",")[1]
            if frame_b_b64.startswith("data:image"):
                frame_b_b64 = frame_b_b64.split(",")[1]
                
            try:
                frame_a_bytes = base64.b64decode(frame_a_b64)
                frame_b_bytes = base64.b64decode(frame_b_b64)
            except Exception:
                self._send_json_error(400, "Failed to decode base64 image data")
                return
                
            # Verify signature matches raw payload
            combined_payload = frame_a_bytes + frame_b_bytes + token.encode('utf-8') + str(timestamp).encode('utf-8')
            computed_sig = hmac.new(
                HMAC_SECRET.encode('utf-8'),
                combined_payload,
                hashlib.sha256
            ).hexdigest()
            
            if not hmac.compare_digest(computed_sig, signature):
                self._send_json_error(401, "Cryptographic signature mismatch")
                return
                
            # Verify timestamp is less than 3 seconds (3000ms) old
            current_time_ms = int(time.time() * 1000)
            age_ms = current_time_ms - int(timestamp)
            if age_ms < -1000 or age_ms > 3000:
                self._send_json_error(401, "Transaction expired (older than 3 seconds) or timestamp mismatch")
                return
                
            # Verify and consume the challenge token from DB (single-use token verification)
            try:
                del_res = supabase_client.table("challenge_tokens").delete().eq("token", token).execute()
                if not del_res.data:
                    self._send_json_error(401, "Challenge token is invalid or has already been used")
                    return
            except Exception as e:
                self._send_json_error(500, f"Token validation query failed: {str(e)}")
                return
                
            # Step 2: Decode frames for active & passive checks
            nparr_a = np.frombuffer(frame_a_bytes, np.uint8)
            img_a = cv2.imdecode(nparr_a, cv2.IMREAD_COLOR) # BGR
            
            nparr_b = np.frombuffer(frame_b_bytes, np.uint8)
            img_b = cv2.imdecode(nparr_b, cv2.IMREAD_COLOR) # BGR
            
            if img_a is None or img_b is None:
                self._send_json_error(400, "Image decoding failed")
                return
                
            # Resize both to standard 640x640 to match detector model shape
            img_a = cv2.resize(img_a, (640, 640))
            img_b = cv2.resize(img_b, (640, 640))
            
            img_h, img_w = 640, 640
            
            # Run SCRFD Face Detection on Frame B
            # Input shape: (1, 3, 640, 640)
            blob = cv2.dnn.blobFromImage(img_b, 1.0/128.0, (640, 640), (127.5, 127.5, 127.5), swapRB=True)
            outputs = DETECTOR_SESSION.run(None, {DETECTOR_SESSION.get_inputs()[0].name: blob})
            
            bboxes, scores, kps = generate_anchors_and_decode(outputs, img_h, img_w, score_threshold=0.5)
            if len(bboxes) == 0:
                self._send_json_error(400, "No face detected in camera frame")
                return
                
            keep = nms(bboxes, scores, iou_threshold=0.4)
            if not keep:
                self._send_json_error(400, "No face detected in camera frame")
                return
                
            best_idx = keep[0]
            bbox = bboxes[best_idx].astype(int)
            landmarks = kps[best_idx]
            
            # Crop faces
            x1, y1, x2, y2 = bbox
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(img_w, x2), min(img_h, y2)
            
            face_crop_a = img_a[y1:y2, x1:x2]
            face_crop_b = img_b[y1:y2, x1:x2]
            
            if face_crop_a.size == 0 or face_crop_b.size == 0:
                self._send_json_error(400, "Invalid face dimensions detected")
                return
                
            # Active liveness color-churn check
            crop_a_norm = face_crop_a.astype(np.float32) / 255.0
            crop_b_norm = face_crop_b.astype(np.float32) / 255.0
            
            b_diff = np.mean(crop_a_norm[:, :, 0]) - np.mean(crop_b_norm[:, :, 0])
            g_diff = np.mean(crop_a_norm[:, :, 1]) - np.mean(crop_b_norm[:, :, 1])
            r_diff = np.mean(crop_a_norm[:, :, 2]) - np.mean(crop_b_norm[:, :, 2])
            
            # Frame A (Pink flash: high red and blue) vs Frame B (Green flash: high green)
            # Require difference in red > 0.01, blue > 0.01, and green < -0.01
            if not (r_diff > 0.01 and b_diff > 0.01 and g_diff < -0.01):
                self._send_json_error(403, "Spoof Detected - Active color flash reflection check failed")
                return
                
            # Step 3: Passive Liveness check via MiniFASNet
            minifas_crop = crop_minifasnet(img_b, bbox)
            minifas_input = minifas_crop.astype(np.float32) / 255.0
            minifas_input = np.transpose(minifas_input, (2, 0, 1)) # to NCHW
            minifas_input = np.expand_dims(minifas_input, axis=0)
            
            liveness_outputs = LIVENESS_SESSION.run(None, {LIVENESS_SESSION.get_inputs()[0].name: minifas_input})
            logits = liveness_outputs[0]
            
            # Softmax to calculate confidence scores
            exp_logits = np.exp(logits)
            probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
            real_skin_score = float(probs[0][0])
            
            if real_skin_score < 0.95:
                self._send_json_error(403, f"Spoof Detected - Passive liveness skin verification failed ({real_skin_score * 100:.1f}%)")
                return
                
            # Step 4: ArcFace Embedding Generator
            aligned_face = align_face(img_b, landmarks)
            aligned_face_rgb = cv2.cvtColor(aligned_face, cv2.COLOR_BGR2RGB)
            aligned_face_rgb = aligned_face_rgb.astype(np.float32)
            aligned_face_rgb = (aligned_face_rgb - 127.5) / 128.0
            aligned_input = np.transpose(aligned_face_rgb, (2, 0, 1))
            aligned_input = np.expand_dims(aligned_input, axis=0)
            
            rec_outputs = RECOGNIZER_SESSION.run(None, {RECOGNIZER_SESSION.get_inputs()[0].name: aligned_input})
            embedding = rec_outputs[0][0]
            embedding_norm = embedding / np.linalg.norm(embedding)
            
            # Step 5: Database Query Match (RPC match_user_face or direct profile comparison)
            employee_id = None
            name = None
            similarity_val = 0.0
            
            if employee_id_input:
                try:
                    profile_res = supabase_client.table("profiles").select("employee_id, name, face_embedding").eq("employee_id", employee_id_input.strip()).execute()
                    if profile_res.data:
                        profile = profile_res.data[0]
                        db_embedding_raw = profile.get("face_embedding")
                        if db_embedding_raw:
                            if isinstance(db_embedding_raw, str):
                                db_embedding = np.array(json.loads(db_embedding_raw))
                            else:
                                db_embedding = np.array(db_embedding_raw)
                            # Normalize
                            db_embedding_norm = db_embedding / np.linalg.norm(db_embedding)
                            similarity_val = float(np.dot(embedding_norm, db_embedding_norm))
                            if similarity_val > 0.40:
                                employee_id = profile["employee_id"]
                                name = profile["name"]
                            else:
                                self._send_json_error(403, f"Face verification failed: Biometrics do not match the logged-in user profile ({similarity_val * 100:.1f}%)")
                                return
                        else:
                            self._send_json_error(404, "Biometric face profile not configured for this user")
                            return
                    else:
                        self._send_json_error(404, "Employee profile not found")
                        return
                except Exception as db_err:
                    self._send_json_error(500, f"Error fetching biometric profile: {str(db_err)}")
                    return
            else:
                match_res = supabase_client.rpc(
                    "match_user_face",
                    {
                        "query_embedding": embedding_norm.tolist(),
                        "match_threshold": 0.40,
                        "match_count": 1
                    }
                ).execute()
                
                if not match_res.data:
                    self._send_json_error(404, "Face print not matched in corporate database")
                    return
                    
                matched_user = match_res.data[0]
                employee_id = matched_user["employee_id"]
                name = matched_user["name"]
                similarity_val = matched_user["similarity"]
            
            # Step 6: Log Attendance
            now = datetime.now()
            date_str = now.strftime("%b %d, %Y")
            time_str = now.strftime("%I:%M %p")
            
            att_res = supabase_client.table("attendance").select("*").eq("employee_id", employee_id).eq("date", date_str).execute()
            
            log_id = f"{employee_id}_{now.strftime('%Y%m%d')}"
            
            if att_res.data:
                existing_log = att_res.data[0]
                if existing_log["check_out"] == "--:--":
                    res_update = supabase_client.table("attendance").update({
                        "check_out": time_str
                    }).eq("id", existing_log["id"]).execute()
                    self._send_json_response(200, {
                        "message": "Checked out successfully",
                        "employeeName": name,
                        "log": res_update.data[0]
                    })
                else:
                    self._send_json_response(200, {
                        "message": "Attendance already completed for today",
                        "employeeName": name,
                        "log": existing_log
                    })
            else:
                new_log = {
                    "id": log_id,
                    "employee_id": employee_id,
                    "name": name,
                    "date": date_str,
                    "check_in": time_str,
                    "check_out": "--:--",
                    "status": "Present",
                    "confidence": f"{similarity_val * 100:.1f}%",
                    "photo": "data:image/jpeg;base64," + frame_b_b64[:2000] # Store thumbnail preview base64
                }
                res_insert = supabase_client.table("attendance").insert(new_log).execute()
                self._send_json_response(200, {
                    "message": "Checked in successfully",
                    "employeeName": name,
                    "log": res_insert.data[0]
                })
                
        except Exception as e:
            self._send_json_error(500, f"Internal pipeline execution error: {str(e)}")


