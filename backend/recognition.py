import sys
import json
import base64
import numpy as np

try:
    import cv2
    import insightface
    from insightface.app import FaceAnalysis
except ImportError as e:
    sys.stderr.write(f"Import error: {e}\n")
    sys.exit(1)

# Initialize InsightFace App (uses Buffalo_L by default)
try:
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection', 'recognition'], providers=['CPUExecutionProvider'])
    app.prepare(ctx_id=0, det_size=(320, 320))
except Exception as e:
    sys.stderr.write(f"Initialization error: {e}\n")
    sys.exit(1)


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

    faces = app.get(img)
    if not faces:
        return None

    return faces[0].normed_embedding.tolist()


def perform_liveness_check(frame_a_b64, frame_b_b64):
    """
    Strict anti-spoofing liveness check.
    Phone screens and printouts are flat, static, and reflect light uniformly.
    Real human faces are 3D surfaces and absorb light colors differently.
    """
    img_a = decode_image_from_b64(frame_a_b64)
    img_b = decode_image_from_b64(frame_b_b64)

    if img_a is None or img_b is None:
        return False, "Failed to decode camera frames."

    faces_b = app.get(img_b)

    if not faces_b:
        return False, "No face detected in the live frame."

    # Liveness check 1: Structural differences (Detect flat paper or static phone screens)
    gray_a = cv2.cvtColor(img_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(img_b, cv2.COLOR_BGR2GRAY)
    
    mean_diff = np.mean(cv2.absdiff(gray_a, gray_b))

    if mean_diff < 0.45:
        return False, "Spoofing detected: Static display/photo presentation attack."

    # Liveness check 2: Glare & Specular Reflection (Mobile Display screen check)
    box_b = faces_b[0].bbox.astype(int) # [x1, y1, x2, y2]
    # Crop face area
    face_crop = img_b[max(0, box_b[1]):min(img_b.shape[0], box_b[3]), max(0, box_b[0]):min(img_b.shape[1], box_b[2])]
    if face_crop.size > 0:
        gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        # Check percentage of saturated pixels (glare). Glass displays reflect near 255.
        high_brights = np.sum(gray_face > 240) / gray_face.size
        if high_brights > 0.08:
            return False, "Spoofing detected: High glare display screen reflection."

    # Liveness check 3: Color Flash response absorption
    # Reuse B's bounding box coordinates to crop Frame A
    face_crop_a = img_a[max(0, box_b[1]):min(img_a.shape[0], box_b[3]), max(0, box_b[0]):min(img_a.shape[1], box_b[2])]
    
    if face_crop_a.size == 0 or face_crop.size == 0:
        return False, "Spoofing detected: Face bounds invalid."

    avg_color_a = np.mean(face_crop_a, axis=(0, 1)) # BGR
    avg_color_b = np.mean(face_crop, axis=(0, 1)) # BGR

    # Calculate pink ratio: (R+B)/G. Frame A (Pink flash) should have a higher pink ratio than Frame B (Green flash).
    pink_ratio_a = (avg_color_a[2] + avg_color_a[0]) / (avg_color_a[1] + 1e-5)
    pink_ratio_b = (avg_color_b[2] + avg_color_b[0]) / (avg_color_b[1] + 1e-5)

    # If the difference in the color ratio is negligible, it's a self-illuminated display (phone) showing a static image.
    if (pink_ratio_a - pink_ratio_b) < 0.08:
         return False, "Spoofing detected: No color flash reflection on face (Screen detected)."

    return True, faces_b[0].normed_embedding.tolist()


if __name__ == "__main__":
    raw = sys.stdin.read().strip()

    if not raw:
        print("ERROR: No input received", flush=True)
        sys.exit(1)

    try:
        parsed_input = json.loads(raw)
    except json.JSONDecodeError:
        parsed_input = raw

    if isinstance(parsed_input, list):
        if len(parsed_input) == 2:
            success, result = perform_liveness_check(parsed_input[0], parsed_input[1])
            if success:
                print(f"EMBEDDING_DATA:{','.join(str(f) for f in result)}", flush=True)
            else:
                print(f"ERROR: {result}", flush=True)
                sys.exit(1)
        else:
            embedding = None
            for img in parsed_input:
                emb = get_embedding_from_b64(img)
                if emb:
                    embedding = emb
                    break
            if embedding:
                print(f"EMBEDDING_DATA:{','.join(str(f) for f in embedding)}", flush=True)
            else:
                print("ERROR: No face detected in registration photos.", flush=True)
                sys.exit(1)
    else:
        embedding = get_embedding_from_b64(parsed_input)
        if embedding:
            print(f"EMBEDDING_DATA:{','.join(str(f) for f in embedding)}", flush=True)
        else:
            print("ERROR: No face detected in the provided image", flush=True)
            sys.exit(1)
