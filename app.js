const express = require('express');
const app = express();

app.use(express.json());

let orderCount = 0;
let lastOrder = null;

// webhook from Shopify
app.post('/webhook/order', (req, res) => {
  try {
    const order = req.body;

    orderCount++;

    const item = order.line_items?.[0];

    lastOrder = {
      number: order.name,
      title: item?.title || '',
      image: item?.image?.src || ''
    };

    console.log('NEW ORDER:', lastOrder);

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

// reset counter manually
app.get('/reset', (req, res) => {
  orderCount = 0;
  res.send('Counter reset');
});

// frontend screen
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head>
      <meta http-equiv="refresh" content="3">
      <style>
        body {
          background: #f6c5cc;
          font-family: Arial;
          padding: 40px;
        }
        .count {
          font-size: 120px;
          font-weight: bold;
        }
        .product {
          display: flex;
          align-items: center;
          margin-top: 40px;
        }
        img {
          width: 120px;
          margin-right: 20px;
        }
      </style>
    </head>
    <body>
      <div>BESTELLINGEN</div>
      <div class="count">${orderCount}</div>

      ${
        lastOrder
          ? `
        <div class="product">
          <img src="${lastOrder.image}" />
          <div>
            <div>${lastOrder.number}</div>
            <div>${lastOrder.title}</div>
          </div>
        </div>
      `
          : ''
      }
    </body>
    </html>
  `);
});

app.listen(10000, () => console.log('Server running'));