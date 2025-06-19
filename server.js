const app = require('./app');
const mongoose = require('mongoose');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Original server startup logic
const startServer = () => {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('MongoDB connected');
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error(err));
};

// For Vercel deployment - export the app
module.exports = app;

// For local development - start the server
if (process.env.NODE_ENV !== 'production') {
  startServer();
} else {
  // In production (Vercel), ensure MongoDB connection is available
  if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
      .then(() => console.log('MongoDB connected (production)'))
      .catch(err => console.error('MongoDB connection error:', err));
  }
}