const express = require('express');
const { authenticate, authorizeRole } = require('../middleware/auth');
const Log = require('../models/Log');
const User = require('../models/User');

const router = express.Router();

// Get all logs (admin only)
router.get('/', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const logs = await Log.find()
      .sort({ timestamp: -1 })
      .limit(1000);

    res.json(logs.map(log => ({
      id: log._id,
      user: log.user,
      action: log.action,
      type: log.type,
      timestamp: log.timestamp
    })));
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
});

// Add activity log endpoint
router.post('/add', authenticate, async (req, res) => {
  try {
    const { action, type } = req.body;
    
    // Fetch complete user data
    const fullUser = await User.findById(req.user.id);
    if (!fullUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const log = new Log({
      action,
      type,
      user: {
        id: fullUser._id,
        name: fullUser.name,
        email: fullUser.email,
        role: fullUser.role,
        department: fullUser.department
      }
    });

    await log.save();
    
    res.status(201).json({
      success: true,
      log: {
        id: log._id,
        user: `${log.user.name} (${log.user.email})`,
        action: log.action,
        type: log.type,
        timestamp: log.timestamp
      }
    });

  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ message: 'Failed to log activity' });
  }
});

module.exports = router;