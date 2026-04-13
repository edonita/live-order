const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SHOP = process.env.SHOPIFY_STORE_DOMAIN; // e.g. le-olive.myshopify.com
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // Admin API token
const API_VERSION = '2025-01';

let liveState = {
  count: 0,
  latestOrderNumber: '',
  latestProductName: '',
  latestProductImage: '',
  updatedAt: null
};

async function getProductImage(productId) {
  if (!SHOP || !TOKEN || !productId) return '';

  try {
    const res = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/products/${productId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!res.ok) {
      console.error('Shopify product fetch failed:', await res.text());
      return '';
    }

    const data = await res.json();
    return data?.product?.image?.src || '';
  } catch (err) {
    console.error('getProductImage error:', err);
    return '';
  }
}

app.get('/', (req, res) => {
  res.redirect('/live-screen');
});

app.get('/live-screen', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Live Orders</title>
      <style>
        :root {
          --bg: #f8d7da;
          --fg: #111;
          --muted: rgba(0,0,0,0.55);
        }

        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          font-family: Arial, Helvetica, sans-serif;
          background: var(--bg);
          color: var(--fg);
          overflow: hidden;
        }

        .wrap {
          height: 100vh;
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 3vw;
          padding: 4vw;
          align-items: center;
        }

        .left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 2vw;
          color: var(--muted);
          margin-bottom: 1.5vh;
        }

        .count {
          font-size: 16vw;
          font-weight: 700;
          line-height: 0.92;
          margin: 0;
        }

        .label {
          margin-top: 2vh;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 2.4vw;
        }

        .latest {
          margin-top: 5vh;
          font-size: 2vw;
          font-weight: 700;
          line-height: 1.3;
        }

        .latest small {
          display: block;
          margin-top: 1.2vh;
          font-size: 1.3vw;
          font-weight: 400;
          color: var(--muted);
        }

        .right {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%;
        }

        .product-image {
          max-width: 100%;
          max-height: 72vh;
          object-fit: contain;
          border-radius: 24px;
          display: none;
        }

        .placeholder {
          font-size: 1.2vw;
          color: var(--muted);
        }

        .reset-btn {
          position: fixed;
          top: 20px;
          right: 20px;
          border: 0;
          background: #111;
          color: #fff;
          padding: 12px 18px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 14px;
        }

        .footer {
          position: fixed;
          bottom: 16px;
          right: 20px;
          font-size: 12px;
          color: rgba(0,0,0,0.35);
        }
      </style>
    </head>
    <body>
      <button class="reset-btn" onclick="resetCounter()">Reset</button>

      <div class="wrap">
        <div class="left">
          <div class="eyebrow">Bestellingen</div>
          <div id="count" class="count">0</div>
          <div class="label">Live</div>

          <div id="latest" class="latest">
            Laatste bestelling: —
            <small id="item"></small>
          </div>
        </div>

        <div class="right">
          <img id="productImage" class="product-image" alt="Product image" />
          <div id="placeholder" class="placeholder">No image yet</div>
        </div>
      </div>

      <div id="footer" class="footer"></div>

      <script>
        async function loadState() {
          const res = await fetch('/api/live-orders');
          const state = await res.json();

          document.getElementById('count').textContent = state.count || 0;
          document.getElementById('latest').innerHTML =
            'Laatste bestelling: ' + (state.latestOrderNumber || '—') +
            '<small id="item"></small>';

          document.getElementById('item').textContent =
            state.latestProductName || '';

          const img = document.getElementById('productImage');
          const placeholder = document.getElementById('placeholder');

          if (state.latestProductImage) {
            img.src = state.latestProductImage;
            img.style.display = 'block';
            placeholder.style.display = 'none';
          } else {
            img.removeAttribute('src');
            img.style.display = 'none';
            placeholder.style.display = 'block';
          }

          document.getElementById('footer').textContent =
            state.updatedAt ? ('Updated ' + new Date(state.updatedAt).toLocaleTimeString()) : '';
        }

        async function resetCounter() {
          await fetch('/api/live-orders/reset', { method: 'POST' });
          loadState();
        }

        loadState();
        setInterval(loadState, 3000);
      </script>
    </body>
    </html>
  `);
});

app.get('/api/live-orders', (req, res) => {
  res.json(liveState);
});

app.post('/api/live-orders/reset', (req, res) => {
  liveState = {
    count: 0,
    latestOrderNumber: '',
    latestProductName: '',
    latestProductImage: '',
    updatedAt: Date.now()
  };

  res.json({ ok: true });
});

app.post('/webhooks/orders/create', async (req, res) => {
  try {
    const payload = req.body;
    const firstItem = payload?.line_items?.[0] || null;

    const orderNumber = payload?.order_number || payload?.name || '';
    const productName = firstItem?.title || '';
    const productId = firstItem?.product_id || null;

    let productImage = '';

    if (firstItem?.image?.src) {
      productImage = firstItem.image.src;
    } else if (firstItem?.image && typeof firstItem.image === 'string') {
      productImage = firstItem.image;
    } else if (productId) {
      productImage = await getProductImage(productId);
    }

    liveState = {
      count: Number(liveState.count || 0) + 1,
      latestOrderNumber: String(orderNumber),
      latestProductName: String(productName),
      latestProductImage: String(productImage || ''),
      updatedAt: Date.now()
    };

    console.log('New live order:', liveState);
    res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('error');
  }
});

app.listen(PORT, () => {
  console.log(\`Live Orders app running on port \${PORT}\`);
});