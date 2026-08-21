'use strict';

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
app.disable('x-powered-by');

app.get('/', (req, res) => {
  res.redirect('/api/v1');
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1', routes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Nigeria Tertiary Institutions API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
