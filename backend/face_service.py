import sys
import json
import base64
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import cv2
    import insightface
    from insightface.app import FaceAnalysis
except ImportError as e:
    sys.stderr.write(f"Import error: {e}\n")
    sys.exit(1)

# Initialize InsightFace App (uses Buffalo_L by default) lazily
app = None
def get_app():
    global app
    if app is None:
        try:
            print("Initializing InsightFace buffalo_l in persistent memory...", flush=True)
            app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection', 'recognition'], providers=['CPUExecutionProvider'])
            app.prepare(ctx_id=0, det_size=(320, 320))
            print("InsightFace loaded successfully.", flush=True)
        except Exception as e:
            sys.stderr.write(f"Lazy initialization error: {e}\n")
            raise e
    return app

print("Biometric daemon helper functions loaded. Listening on port 5001.", flush=True)


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
        faces = get_app().get(img)
    except Exception as e:
        sys.stderr.write(f"Model inference failed: {e}\n")
        return None
    if not faces:
        return None

    return faces[0].normed_embedding.tolist()


def perform_liveness_check(frame_a_b64, frame_b_b64):
    img_a = decode_image_from_b64(frame_a_b64)
    img_b = decode_image_from_b64(frame_b_b64)

    if img_a is None or img_b is None:
        return False, "Failed to decode camera frames."

    try:
        faces_b = get_app().get(img_b)
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

    avg_color_a = np.mean(face_crop_a, axis=(0, 1))
    avg_color_b = np.mean(face_crop_b, axis=(0, 1))

    pink_ratio_a = (avg_color_a[2] + avg_color_a[0]) / (avg_color_a[1] + 1e-5)
    pink_ratio_b = (avg_color_b[2] + avg_color_b[0]) / (avg_color_b[1] + 1e-5)

    if (pink_ratio_a - pink_ratio_b) < 0.08:
         return False, "Spoofing detected: No color flash reflection on face (Screen detected)."

    return True, faces_b[0].normed_embedding.tolist()


class BiometricHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        if self.path == '/extract':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                face_photo = payload.get('facePhoto')
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Invalid JSON payload: {e}'}).encode('utf-8'))
                return

            if not face_photo:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Missing facePhoto parameter'}).encode('utf-8'))
                return

            if isinstance(face_photo, list):
                if len(face_photo) == 2:
                    success, result = perform_liveness_check(face_photo[0], face_photo[1])
                    if success:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'embedding': result}).encode('utf-8'))
                    else:
                        self.send_response(400)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'error': result}).encode('utf-8'))
                else:
                    embedding = None
                    for img in face_photo:
                        emb = get_embedding_from_b64(img)
                        if emb:
                            embedding = emb
                            break
                    if embedding:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'embedding': embedding}).encode('utf-8'))
                    else:
                        self.send_response(400)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'error': 'No face detected in registration photos.'}).encode('utf-8'))
            else:
                embedding = get_embedding_from_b64(face_photo)
                if embedding:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'embedding': embedding}).encode('utf-8'))
                else:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No face detected in the provided image'}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()


def run(server_class=ThreadingHTTPServer, handler_class=BiometricHandler, port=5001):
    server_address = ('127.0.0.1', port)
    httpd = server_class(server_address, handler_class)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    run()
