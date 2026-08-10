/**
 * Compresses an image file directly in the browser using HTML5 Canvas.
 * This heavily reduces the file size before it gets converted to Base64 and sent to the server.
 * 
 * @param {File} file - The raw image file from an <input type="file">
 * @param {number} maxWidth - The maximum width to scale the image down to
 * @param {number} quality - JPEG compression quality (0 to 1)
 * @returns {Promise<string>} - The highly compressed Base64 Data URL
 */
export const compressImage = (file, maxWidth = 500, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        // Create a canvas to draw and compress the image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert the canvas to a highly compressed JPEG Base64 string
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};
