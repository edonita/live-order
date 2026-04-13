require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

let orderCount = 0;
let lastOrder = null;

async function getAccessToken() {
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });

  const data = await response.json();
  console.log('TOKEN RESPONSE:', data);

  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function getProductImage(productId) {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://${process.env.SHOPIFY_SHOP}/admin/api/2026-04/products/${productId}.json`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }
  );

  const data = await response.json();
  console.log('PRODUCT RESPONSE:', data);

  if (!response.ok) {
    throw new Error(`Failed to get product: ${JSON.stringify(data)}`);
  }

  return data.product?.image?.src || '';
}

// webhook from Shopify
app.post('/webhook/order', async (req, res) => {
  try {
    const order = req.body;
    orderCount++;

    const item = order.line_items?.[0];
    console.log('WEBHOOK ITEM:', item);

    let image = '';

    if (item?.product_id) {
      image = await getProductImage(item.product_id);
    }

    lastOrder = {
      number: order.name || order.order_number || '',
      title: item?.title || '',
      variant: item?.variant_title || '',
      image,
      updatedAt: Date.now()
    };

    console.log('NEW ORDER:', lastOrder);

    res.sendStatus(200);
  } catch (e) {
    console.error('WEBHOOK ERROR:', e.message);
    res.status(500).send(e.message);
  }
});

// test route
app.get('/test-product/:id', async (req, res) => {
  try {
    const image = await getProductImage(req.params.id);
    res.json({ image });
  } catch (e) {
    console.error('TEST ERROR:', e.message);
    res.status(500).send(e.message);
  }
});

// state route for frontend polling
app.get('/state', (req, res) => {
  res.json({
    count: orderCount,
    latestOrder: lastOrder?.number || '—',
    latestProduct: lastOrder?.title || '',
    latestVariant: lastOrder?.variant || '',
    latestImage: lastOrder?.image || '',
    updatedAt: lastOrder?.updatedAt || 0
  });
});

// reset counter manually
app.get('/reset', (req, res) => {
  orderCount = 0;
  lastOrder = null;
  res.send('Counter reset');
});

// frontend screen
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Live Order Counter</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f8d7da;
  --font: #b86678;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  background: var(--bg);
  color: var(--font);
  font-family: Montserrat, sans-serif;
  overflow: hidden;
}
.wrap {
  height: 100%;
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  align-items: center;
  padding: 4vw;
  gap: 3vw;
}
.left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  text-align: left;
}
.eyebrow {
  font-size: 2.4vw;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--font);
  margin-bottom: 2vh;
}
.count {
  font-weight: 700;
  line-height: 0.95;
  font-size: 16vw;
  margin: 0;
}
.label {
  margin-top: 2vh;
  font-size: 3vw;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--font);
}
.latest {
  margin-top: 5vh;
  font-size: 2.8vw;
  font-weight: 700;
  font-family: Playfair Display,sans-serif;
}

.latest small {
  display: block;
  margin-top: 1vh;
  color: var(--font);
  font-size: 2.5vw;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.3;
}
.right {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
.product-image {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 24px;
  display: block;
}
.product-image.hidden {
  display: none;
}
.footer {
  position: absolute;
  bottom: 1.2vw;
  right: 1.6vw;
  color: var(--font);
  font-size: 0.9vw;
}
</style>
</head>
<body>
  <div class="wrap">
    <div class="left">
      <div class="eyebrow">Bestellingen</div>
      <div id="count" class="count">${orderCount}</div>
      <div class="label">Live</div>
      <div id="latest" class="latest">
        Laatste bestelling: ${lastOrder?.number || '—'}
        <small id="item">${
          lastOrder
            ? [lastOrder.title, lastOrder.variant].filter(Boolean).join(' · ')
            : ''
        }</small>
      </div>
    </div>

    <div class="right">
      <img
        id="productImage"
        class="product-image ${lastOrder?.image ? '' : 'hidden'}"
        src="${lastOrder?.image || ''}"
        alt="Product image"
      />
    </div>
  </div>

  <div id="footer" class="footer">${
    lastOrder?.updatedAt ? 'Updated ' + new Date(lastOrder.updatedAt).toLocaleTimeString() : ''
  }</div>

<script>
function render(state) {
  document.getElementById('count').textContent = state.count ?? 0;
  document.getElementById('latest').innerHTML =
    'Laatste bestelling: ' + (state.latestOrder || '—') + '<small id="item"></small>';

  var item = '';
  if (state.latestProduct) item += state.latestProduct;
  if (state.latestVariant) item += (item ? ' · ' : '') + state.latestVariant;
  document.getElementById('item').textContent = item;

  var img = document.getElementById('productImage');
  if (state.latestImage) {
    img.src = state.latestImage;
    img.classList.remove('hidden');
  } else {
    img.src = '';
    img.classList.add('hidden');
  }

  var updated = state.updatedAt ? new Date(state.updatedAt) : null;
  document.getElementById('footer').textContent =
    updated ? ('Updated ' + updated.toLocaleTimeString()) : '';
}

async function poll() {
  try {
    const res = await fetch('/state');
    const state = await res.json();
    render(state);
  } catch (err) {
    console.error('Polling error:', err);
  }
}

poll();
setInterval(poll, 3000);
</script>
</body>
</html>`);
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});