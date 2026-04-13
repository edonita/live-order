const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running 🚀');
});

app.post('/webhooks/orders-create', (req, res) => {
  console.log('Order received:', req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});