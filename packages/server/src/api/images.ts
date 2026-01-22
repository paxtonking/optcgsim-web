import { Router } from 'express';

export const imagesRouter = Router();

// Proxy card images from optcgapi.com to avoid CORS issues
imagesRouter.get('/cards/:filename', async (req, res) => {
  const { filename } = req.params;
  const imageUrl = `https://www.optcgapi.com/media/static/Card_Images/${filename}`;

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return res.status(response.status).send('Image not found');
    }

    // Forward the content type
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Set cache headers (cache for 1 day)
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Pipe the image data
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(`[ImageProxy] Failed to fetch ${filename}:`, error);
    res.status(500).send('Failed to fetch image');
  }
});
