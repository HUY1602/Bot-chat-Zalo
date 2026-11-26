/**
 * Temporary Hosted Image Endpoint
 * Endpoint: GET /api/image?id=art_xxx.jpg
 * Serves cached AI-generated artwork as clean JPEG/PNG with Content-Length so Zalo CDN can fetch instantaneously.
 */

const imageService = require('../lib/image-service');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const id = req.query?.id;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing image id' });
  }

  const image = await imageService.getTempImage(id);
  if (!image) {
    return res.status(404).json({ ok: false, error: 'Image not found or expired' });
  }

  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Length', String(image.buffer.length));
  res.setHeader('Cache-Control', 'public, max-age=1800, immutable');
  res.setHeader('Content-Disposition', 'inline; filename="artwork.jpg"');

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  return res.status(200).send(image.buffer);
};
