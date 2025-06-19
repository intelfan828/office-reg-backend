// api/server.js
const app = require('./app'); // Import your Express app
const mongoose = require('mongoose');
const serverlessExpress = require('@vendia/serverless-express');
require('dotenv').config();

let serverlessHandler;

const connectToMongo = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  }
};

module.exports = async (req, res) => {
  await connectToMongo();

  if (!serverlessHandler) {
    serverlessHandler = serverlessExpress({ app });
  }

  return serverlessHandler(req, res);
};
