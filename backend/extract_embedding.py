import os
import sys
import json
import base64
import numpy as np
import cv2
import onnxruntime as ort

# Pre-processing helpers for SCRFD
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

def main():
    if len(sys.argv) < 2:
        if not sys.stdin.isatty():
            input_data = sys.stdin.read().strip()
        else:
            print("ERROR: Missing image base64 argument or stdin data")
            sys.exit(1)
    else:
        input_data = sys.argv[1].strip()
        
    if not input_data:
        print("ERROR: Received empty input data")
        sys.exit(1)
        
    # Check if the input is a JSON list of base64 images
    is_json_list = False
    if input_data.startswith("[") and input_data.endswith("]"):
        try:
            img_list = json.loads(input_data)
            if isinstance(img_list, list):
                is_json_list = True
        except Exception:
            is_json_list = False
            
    if not is_json_list:
        img_list = [input_data]
        
    # Paths
    base_dir = os.path.dirname(__file__)
    models_dir = os.path.join(base_dir, "models")
    detector_path = os.path.normpath(os.path.join(models_dir, "scrfd_500m.onnx"))
    recognizer_path = os.path.normpath(os.path.join(models_dir, "arcface_mobilefacenet.onnx"))
    
    if not os.path.exists(detector_path) or not os.path.exists(recognizer_path):
        print("ERROR: Model files missing in backend/models")
        sys.exit(1)
        
    try:
        # Load ONNX sessions once
        providers = ['CPUExecutionProvider']
        detector = ort.InferenceSession(detector_path, providers=providers)
        recognizer = ort.InferenceSession(recognizer_path, providers=providers)
        
        embeddings = []
        errors = []
        
        for idx, img_b64 in enumerate(img_list):
            if img_b64.startswith("data:image"):
                img_b64 = img_b64.split(",")[1]
                
            try:
                img_bytes = base64.b64decode(img_b64)
                nparr = np.frombuffer(img_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                errors.append(f"Image {idx} decoding failed: {e}")
                continue
                
            if img is None:
                errors.append(f"Image {idx} decoded to None")
                continue
                
            # Resize to standard 320x320 to match detector model shape
            img_resized = cv2.resize(img, (320, 320))
            img_h, img_w = 320, 320
            blob = cv2.dnn.blobFromImage(img_resized, 1.0/128.0, (320, 320), (127.5, 127.5, 127.5), swapRB=True)
            outputs = detector.run(None, {detector.get_inputs()[0].name: blob})
            
            bboxes, scores, kps = generate_anchors_and_decode(outputs, img_h, img_w, score_threshold=0.5)
            if len(bboxes) == 0:
                errors.append(f"Image {idx}: No face detected")
                continue
                
            keep = nms(bboxes, scores, iou_threshold=0.4)
            if not keep:
                errors.append(f"Image {idx}: No face detected after NMS")
                continue
                
            best_idx = keep[0]
            landmarks = kps[best_idx]
            
            # Align face & extract ArcFace features
            aligned = align_face(img_resized, landmarks)
            aligned_rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB)
            aligned_rgb = aligned_rgb.astype(np.float32)
            aligned_rgb = (aligned_rgb - 127.5) / 128.0
            aligned_input = np.transpose(aligned_rgb, (2, 0, 1))
            aligned_input = np.expand_dims(aligned_input, axis=0)
            
            rec_outputs = recognizer.run(None, {recognizer.get_inputs()[0].name: aligned_input})
            embedding = rec_outputs[0][0]
            
            # Normalize and add to list
            embedding_norm = embedding / np.linalg.norm(embedding)
            embeddings.append(embedding_norm)
            
        if len(embeddings) == 0:
            print(f"ERROR: No valid face embeddings extracted. Diagnostics: {'; '.join(errors)}")
            sys.exit(1)
            
        # Calculate the average face embedding
        avg_embedding = np.mean(embeddings, axis=0)
        # Normalize the average embedding
        avg_embedding_norm = avg_embedding / np.linalg.norm(avg_embedding)
        
        # Output as comma-separated floats
        embedding_str = ",".join(map(str, avg_embedding_norm.tolist()))
        print(embedding_str)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: Embedding extraction pipeline failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
