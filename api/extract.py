import os
import json
import base64
from http.server import BaseHTTPRequestHandler
import numpy as np
import cv2
import onnxruntime as ort

# Global variables for models
DETECTOR_SESSION = None
RECOGNIZER_SESSION = None
LIVENESS_SESSION = None

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

def decode_image_from_b64(b64_image):
    if ',' in b64_image:
        b64_image = b64_image.split(',', 1)[1]
    try:
        img_data = base64.b64decode(b64_image)
        nparr = np.frombuffer(img_data, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        return None

def get_embedding_from_b64(b64_image):
    img = decode_image_from_b64(b64_image)
    if img is None:
        return None

    try:
        # Resize/pad to (640,640) for SCRFD input mapping
        h, w, _ = img.shape
        img_h, img_w = 640, 640
        blob = cv2.dnn.blobFromImage(img, 1.0/128.0, (640, 640), (127.5, 127.5, 127.5), swapRB=True)
        outputs = DETECTOR_SESSION.run(None, {DETECTOR_SESSION.get_inputs()[0].name: blob})
        
        bboxes, scores, kps = generate_anchors_and_decode(outputs, img_h, img_w, score_threshold=0.5)
        if len(bboxes) == 0:
            return None
            
        keep = nms(bboxes, scores, iou_threshold=0.4)
        if not keep:
            return None
            
        best_idx = keep[0]
        landmarks = kps[best_idx]
        
        aligned_face = align_face(img, landmarks)
        aligned_face_rgb = cv2.cvtColor(aligned_face, cv2.COLOR_BGR2RGB)
        aligned_face_rgb = aligned_face_rgb.astype(np.float32)
        aligned_face_rgb = (aligned_face_rgb - 127.5) / 128.0
        aligned_input = np.transpose(aligned_face_rgb, (2, 0, 1))
        aligned_input = np.expand_dims(aligned_input, axis=0)
        
        rec_outputs = RECOGNIZER_SESSION.run(None, {RECOGNIZER_SESSION.get_inputs()[0].name: aligned_input})
        embedding = rec_outputs[0][0]
        return embedding.tolist()
    except Exception as e:
        return None

def perform_liveness_check(frame_a_b64, frame_b_b64):
    img_a = decode_image_from_b64(frame_a_b64)
    img_b = decode_image_from_b64(frame_b_b64)

    if img_a is None or img_b is None:
        return False, "Failed to decode camera frames."

    try:
        img_h, img_w = 640, 640
        blob = cv2.dnn.blobFromImage(img_b, 1.0/128.0, (640, 640), (127.5, 127.5, 127.5), swapRB=True)
        outputs = DETECTOR_SESSION.run(None, {DETECTOR_SESSION.get_inputs()[0].name: blob})
        
        bboxes, scores, kps = generate_anchors_and_decode(outputs, img_h, img_w, score_threshold=0.5)
        if len(bboxes) == 0:
            return False, "No face detected in live frame."
            
        keep = nms(bboxes, scores, iou_threshold=0.4)
        if not keep:
            return False, "No face detected in live frame."
            
        best_idx = keep[0]
        bbox = bboxes[best_idx].astype(int)
        landmarks = kps[best_idx]
        
        # Color flash check
        x1, y1, x2, y2 = bbox
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(640, x2), min(640, y2)
        
        face_crop_a = img_a[y1:y2, x1:x2]
        face_crop_b = img_b[y1:y2, x1:x2]
        if face_crop_a.size == 0 or face_crop_b.size == 0:
            return False, "Invalid face dimensions detected."
            
        crop_a_norm = face_crop_a.astype(np.float32) / 255.0
        crop_b_norm = face_crop_b.astype(np.float32) / 255.0
        
        b_diff = np.mean(crop_a_norm[:, :, 0]) - np.mean(crop_b_norm[:, :, 0])
        g_diff = np.mean(crop_a_norm[:, :, 1]) - np.mean(crop_b_norm[:, :, 1])
        r_diff = np.mean(crop_a_norm[:, :, 2]) - np.mean(crop_b_norm[:, :, 2])
        
        if not (r_diff > 0.01 and b_diff > 0.01 and g_diff < -0.01):
            return False, "Spoof Detected - Active color flash reflection check failed"
            
        # Passive liveness MiniFASNet
        minifas_crop = crop_minifasnet(img_b, bbox)
        minifas_input = minifas_crop.astype(np.float32) / 255.0
        minifas_input = np.transpose(minifas_input, (2, 0, 1))
        minifas_input = np.expand_dims(minifas_input, axis=0)
        
        liveness_outputs = LIVENESS_SESSION.run(None, {LIVENESS_SESSION.get_inputs()[0].name: minifas_input})
        logits = liveness_outputs[0]
        exp_logits = np.exp(logits)
        probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
        real_skin_score = float(probs[0][0])
        
        if real_skin_score < 0.95:
            return False, f"Spoof Detected - Passive liveness skin verification failed ({real_skin_score * 100:.1f}%)"
            
        # Extract embedding
        aligned_face = align_face(img_b, landmarks)
        aligned_face_rgb = cv2.cvtColor(aligned_face, cv2.COLOR_BGR2RGB)
        aligned_face_rgb = aligned_face_rgb.astype(np.float32)
        aligned_face_rgb = (aligned_face_rgb - 127.5) / 128.0
        aligned_input = np.transpose(aligned_face_rgb, (2, 0, 1))
        aligned_input = np.expand_dims(aligned_input, axis=0)
        
        rec_outputs = RECOGNIZER_SESSION.run(None, {RECOGNIZER_SESSION.get_inputs()[0].name: aligned_input})
        embedding = rec_outputs[0][0]
        return True, embedding.tolist()
    except Exception as e:
        return False, f"Biometric pipeline error: {str(e)}"

class handler(BaseHTTPRequestHandler):
    def _send_json_response(self, status, data):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
        
    def _send_json_error(self, status, error_msg):
        self._send_json_response(status, {"error": error_msg})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            init_sessions()
            if DETECTOR_SESSION is None or RECOGNIZER_SESSION is None or LIVENESS_SESSION is None:
                self._send_json_error(500, "Model sessions failed to initialize or model files are missing")
                return

            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            face_photo = payload.get('facePhoto')
            if not face_photo:
                self._send_json_error(400, "Missing facePhoto parameter")
                return
                
            if isinstance(face_photo, list):
                if len(face_photo) == 2:
                    success, result = perform_liveness_check(face_photo[0], face_photo[1])
                    if success:
                        self._send_json_response(200, {"embedding": result})
                    else:
                        self._send_json_error(400, result)
                else:
                    embedding = None
                    for img in face_photo:
                        emb = get_embedding_from_b64(img)
                        if emb:
                            embedding = emb
                            break
                    if embedding:
                        self._send_json_response(200, {"embedding": embedding})
                    else:
                        self._send_json_error(400, "No face detected in registration photos.")
            else:
                embedding = get_embedding_from_b64(face_photo)
                if embedding:
                    self._send_json_response(200, {"embedding": embedding})
                else:
                    self._send_json_error(400, "No face detected in the provided image.")
        except Exception as e:
            self._send_json_error(500, f"Error processing biometric request: {str(e)}")
