import { Router } from 'express';

export const imagesRouter = Router();

// Helper function to proxy images from external sources
async function proxyImage(imageUrl: string, filename: string, res: any) {
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

    // Allow cross-origin requests (frontend is on different subdomain)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Pipe the image data
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(`[ImageProxy] Failed to fetch ${filename}:`, error);
    res.status(500).send('Failed to fetch image');
  }
}

// Proxy card images from optcgapi.com to avoid CORS issues
imagesRouter.get('/cards/:filename', async (req, res) => {
  const { filename } = req.params;
  const imageUrl = `https://www.optcgapi.com/media/static/Card_Images/${filename}`;
  await proxyImage(imageUrl, filename, res);
});

// Proxy card images from official onepiece-cardgame.com to avoid CORS issues
imagesRouter.get('/official/:filename', async (req, res) => {
  const { filename } = req.params;
  const imageUrl = `https://en.onepiece-cardgame.com/images/cardlist/card/${filename}`;
  await proxyImage(imageUrl, filename, res);
});
