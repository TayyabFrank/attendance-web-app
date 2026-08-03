const { spawn } = require('child_process');
const path = require('path');

/**
 * Runs the Python face recognition script and returns the embedding array.
 * @param {string} base64Image - Base64 encoded image string.
 * @returns {Promise<number[]>} Resolves with 128‑dim embedding.
 */
function getEmbedding(base64Image) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'recognition.py');
    const child = spawn('py', [scriptPath, base64Image]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });

    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Python script exited ${code}: ${stderr || stdout}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          return reject(new Error(result.error));
        }
        resolve(result.embedding);
      } catch (e) {
        reject(new Error('Failed to parse embedding output'));
      }
    });
  });
}

module.exports = { getEmbedding };
