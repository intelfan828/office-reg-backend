const Log = require('../models/Log');

const loggingService = {
  async createLog(data) {
    try {
      const log = new Log({
        action: data.action,
        type: data.type,
        user: {
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          department: data.user.department
        }
      });
      
      await log.save();
      return log;
    } catch (error) {
      console.error('Logging error:', error);
    }
  },

  async logAuth(user, action) {
    return this.createLog({
      user,
      action,
      type: 'auth'
    });
  },

  async logDocument(user, action) {
    return this.createLog({
      user,
      action,
      type: 'document'
    });
  }
};

module.exports = loggingService;