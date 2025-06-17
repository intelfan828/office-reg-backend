const express = require('express');
const { authenticate, authorizeRole } = require('../middleware/auth');
const User = require('../models/User');
const Document = require('../models/Document');

const router = express.Router();

// Get dashboard statistics
router.get('/dashboard/stats', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    // Get current counts
    const [currentUserCount, currentInCount, currentOutCount] = await Promise.all([
      User.countDocuments(),
      Document.countDocuments({ type: 'IN' }),
      Document.countDocuments({ type: 'OUT' })
    ]);

    // Get last month's counts
    const [lastMonthUserCount, lastMonthInCount, lastMonthOutCount] = await Promise.all([
      User.countDocuments({ createdAt: { $lt: lastMonth } }),
      Document.countDocuments({ type: 'IN', createdAt: { $lt: lastMonth } }),
      Document.countDocuments({ type: 'OUT', createdAt: { $lt: lastMonth } })
    ]);

    // Calculate percentage changes
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return 100;
      return ((current - previous) / previous) * 100;
    };

    res.json({
      users: {
        total: currentUserCount,
        percentageChange: calculatePercentageChange(currentUserCount, lastMonthUserCount)
      },
      documentsIn: {
        total: currentInCount,
        percentageChange: calculatePercentageChange(currentInCount, lastMonthInCount)
      },
      documentsOut: {
        total: currentOutCount,
        percentageChange: calculatePercentageChange(currentOutCount, lastMonthOutCount)
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard statistics' });
  }
});

module.exports = router;