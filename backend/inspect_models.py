import onnxruntime as ort
import os

def inspect(name, path):
    if not os.path.exists(path):
        print(f"{name} does not exist yet at {path}")
        return
    print(f"\n=== Inspecting {name} ===")
    try:
        session = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
        print("Inputs:")
        for inp in session.get_inputs():
            print(f"  Name: {inp.name}, Shape: {inp.shape}, Type: {inp.type}")
        print("Outputs:")
        for out in session.get_outputs():
            print(f"  Name: {out.name}, Shape: {out.shape}, Type: {out.type}")
    except Exception as e:
        print(f"Error inspecting {name}: {e}")

def main():
    base_dir = os.path.dirname(__file__)
    models_dir = os.path.join(base_dir, "models")
    inspect("SCRFD", os.path.join(models_dir, "scrfd_500m.onnx"))
    inspect("ArcFace", os.path.join(models_dir, "arcface_mobilefacenet.onnx"))
    inspect("MiniFASNet", os.path.join(models_dir, "minifasnet.onnx"))

if __name__ == "__main__":
    main()
