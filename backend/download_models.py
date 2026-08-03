import os
import urllib.request

MODELS = {
    "scrfd_500m.onnx": "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/det_500m.onnx",
    "arcface_mobilefacenet.onnx": "https://huggingface.co/WePrompt/buffalo_sc/resolve/main/w600k_mbf.onnx",
    "minifasnet.onnx": "https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx"
}

def main():
    target_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(target_dir, exist_ok=True)
    
    for name, url in MODELS.items():
        dest = os.path.join(target_dir, name)
        if os.path.exists(dest):
            print(f"{name} already exists. Skipping download.")
            continue
        print(f"Downloading {name} to {dest}...")
        try:
            urllib.request.urlretrieve(url, dest)
            print(f"Successfully downloaded {name}")
        except Exception as e:
            print(f"Error downloading {name}: {e}")

if __name__ == "__main__":
    main()
