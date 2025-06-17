const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  number: { type: String, required: true },
  type: { type: String, required: true },
  department: { type: String, required: true },
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reservation', reservationSchema);
