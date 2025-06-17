const express = require('express');
const { authenticate, authorizeRole } = require('../middleware/auth');
const Document = require('../models/Document');
const Reservation = require('../models/Reservation');
const loggingService = require('../services/logging');

const router = express.Router();

// Helper function to get the next available number
const getNextNumber = async () => {
  try {
    const [documents, reservations] = await Promise.all([
      Document.find().select('number'),
      Reservation.find().select('number')
    ]);
    const allNumbers = [...documents, ...reservations].map(item => {
      return parseInt(item.number) || 0;
    });

    const maxNumber = Math.max(0, ...allNumbers);
    
    // Generate next number with padding
    const nextNumber = String(maxNumber + 1).padStart(4, '0');

    // Double check the number doesn't exist (extra safety)
    const [docExists, resExists] = await Promise.all([
      Document.exists({ number: nextNumber }),
      Reservation.exists({ number: nextNumber })
    ]);

    if (docExists || resExists) {
      throw new Error('Generated number already exists');
    }

    return nextNumber;
  } catch (error) {
    console.error('Error generating number:', error);
    throw error;
  }
};

// Reserve endpoint
router.post('/reserve', authenticate, async (req, res) => {
  try {
    // Add debug logging
    console.log('Reservation request:', { type: req.body.type, count: req.body.count });
    
    const { type, count = 1 } = req.body;
    const user = req.user;

    // Validate count again and ensure it's a number
    const reservationCount = parseInt(count);
    if (isNaN(reservationCount) || reservationCount < 1 || reservationCount > 50) {
      return res.status(400).json({ 
        message: "Please provide a valid count between 1 and 50" 
      });
    }

    if (!user.department) {
      return res.status(400).json({ 
        message: "User department is not configured. Please contact administrator." 
      });
    }

    console.log('Starting reservation process for count:', reservationCount);

    // Array to hold all reservations
    const reservedNumbers = [];

    // Create multiple reservations based on count
    for (let i = 0; i < reservationCount; i++) {
      console.log(`Creating reservation ${i + 1} of ${reservationCount}`);
      
      // Get next unique number
      const newNumber = await getNextNumber();
      console.log('Generated number:', newNumber);

      // Create new reservation
      const reservation = new Reservation({
        number: newNumber,
        type,
        department: user.department,
        user: user.id
      });

      await reservation.save();
      await reservation.populate('user', 'name email');

      reservedNumbers.push({
        id: reservation._id,
        number: reservation.number,
        type: reservation.type,
        department: reservation.department,
        reservedAt: reservation.createdAt.toISOString(),
        reservedBy: `${reservation.user.name} (${reservation.user.email})`,
        status: 'active'
      });

      console.log(`Reservation ${i + 1} created:`, reservation.number);
    }

    console.log('All reservations created:', reservedNumbers.length);

    // Log the bulk reservation
    // await loggingService.logDocument(
    //   user, 
    //   `Reserved ${reservationCount} document number(s): ${reservedNumbers.map(r => r.number).join(', ')}`
    // );
    
    // Ensure we're sending back the array
    return res.status(201).json(reservedNumbers);
  } catch (err) {
    console.error('Reserve numbers error:', err);
    return res.status(500).json({ 
      message: "Failed to reserve numbers. " + (err.message || "Please try again.") 
    });
  }
});

// Generate document number
router.post('/generate-number', authenticate, async (req, res) => {
  try {
    const { type } = req.body;
    
    // Get next sequential number using same system
    const number = await getNextNumber();

    // await loggingService.logDocument(
    //   req.user,
    //   `Generated new document number ${number}`
    // );

    res.json({ 
      number,
      type 
    });
  } catch (err) {
    console.error('Generate number error:', err);
    res.status(500).json({ 
      message: "Failed to generate document number. " + (err.message || "Please try again.") 
    });
  }
});

// Update the document registration endpoint to check reservations
router.post('/', authenticate, async (req, res) => {
  try {
    const { number, title, type, department, description } = req.body;
    const user = req.user;

    // Check if number exists in documents or is not reserved
    const [existingDoc, reservation] = await Promise.all([
      Document.findOne({ number }),
      Reservation.findOne({ number })
    ]);

    if (existingDoc) {
      return res.status(400).json({ message: "Document number already exists" });
    }

    // If using a reserved number, ensure it belongs to the user's department
    if (reservation && reservation.department !== user.department) {
      return res.status(400).json({ message: "Invalid document number for this department" });
    }

    const doc = new Document({
      number,
      title,
      type,
      department,
      description,
      user: user.id
    });

    // Handle file attachments if present
    if (req.files && req.files.length > 0) {
      doc.attachments = req.files.map(file => file.path);
    }

    await Promise.all([
      doc.save(),
      // If number was reserved, mark it as used
      reservation ? reservation.deleteOne() : Promise.resolve()
    ]);

    // await loggingService.logDocument(
    //   user, 
    //   `Registered new ${type} document #${number} titled "${title}"`
    // );

    res.status(201).json({
      id: doc._id,
      number: doc.number,
      title: doc.title,
      type: doc.type,
      department: doc.department,
      description: doc.description,
      attachments: doc.attachments,
      createdAt: doc.createdAt.toISOString(),
      registeredBy: user.name
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to register document" });
  }
});

// Get all pending reservations for logged in user's department
router.get('/reserve', authenticate, async (req, res) => {
  try {
    const reservations = await Reservation.find({ 
      department: req.user.department,
      used: false  // Only get unused/pending reservations
    }).populate('user', 'name');

    const formattedReservations = reservations.map(reservation => ({
      id: reservation._id,
      number: reservation.number,
      type: reservation.type,
      department: reservation.department,
      reservedAt: reservation.createdAt.toISOString(),
      reservedBy: reservation.user.name,
      status: 'pending'  // Since we're only getting unused ones, status is always pending
    }));

    res.json(formattedReservations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching reservations" });
  }
});

// Get all registered documents for the user's department
router.get('/', authenticate, async (req, res) => {
  try {
    // Filter documents by user's department
    const documents = await Document.find({
      department: req.user.department  // Only show documents from user's department
    })
    .populate('user', 'name email department')
    .sort({ createdAt: -1 });

    const formattedDocuments = documents.map(doc => ({
      id: doc._id,
      number: doc.number,
      title: doc.title,
      type: doc.type,
      department: doc.user.department,  // Use the registering user's department
      description: doc.description,
      registeredBy: doc.user ? doc.user.name : 'Unknown User',
      registeredAt: doc.createdAt.toISOString()
    }));

    res.json(formattedDocuments);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ message: "Error fetching documents" });
  }
});

// Get reserved numbers (admin sees all, users see only theirs)
router.get('/reserved-numbers', authenticate, async (req, res) => {
  try {
    // Build query based on user role
    const query = req.user.role === 'admin' 
      ? {} 
      : { user: req.user._id };

    const reservations = await Reservation.find(query)
      .populate('user', 'name email department') // Add populate to get user details
      .sort({ createdAt: -1 });

    const formattedReservations = reservations.map(reservation => {
      const reservedDate = new Date(reservation.createdAt);
      const expiresAt = new Date(reservedDate.getTime() + (7 * 24 * 60 * 60 * 1000));
      const now = new Date();

      // Determine status
      let status = 'active';
      if (reservation.used) status = 'used';
      else if (expiresAt < now) status = 'expired';

      return {
        id: reservation._id,
        number: reservation.number,
        type: reservation.type,
        department: reservation.department,
        reservedBy: reservation.user ? `${reservation.user.name} (${reservation.user.email})` : 'Unknown User',
        reservedAt: reservation.createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status
      };
    });

    res.json(formattedReservations);
  } catch (error) {
    console.error('Error fetching reserved numbers:', error);
    res.status(500).json({ message: 'Failed to fetch reserved numbers' });
  }
});

// Delete reserved number (admin only)
router.delete('/reserved-numbers/:id', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({ message: 'Reserved number not found' });
    }

    await reservation.deleteOne();
    // await loggingService.logDocument(
    //   req.user,
    //   `Deleted reserved number ${reservation.number}`
    // );

    res.json({ message: 'Reserved number deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to delete reserved number' });
  }
});

// Get recent documents (admin only)
router.get('/recent', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const documents = await Document.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(documents.map(doc => ({
      type: doc.type,
      number: doc.number,
      title: doc.title,
      compartment: doc.department,
      registeredBy: doc.user.email,
      timestamp: doc.createdAt
    })));
  } catch (error) {
    console.error('Recent documents error:', error);
    res.status(500).json({ message: 'Failed to fetch recent documents' });
  }
});

// Get user's document statistics
router.get('/user-stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [totalDocs, inDocs, outDocs, reservedNumbers] = await Promise.all([
      Document.countDocuments({ user: userId }),
      Document.countDocuments({ user: userId, type: 'IN' }),
      Document.countDocuments({ user: userId, type: 'OUT' }),
      Reservation.countDocuments({ user: userId, used: false })
    ]);

    res.json({
      totalDocuments: totalDocs,
      inDocuments: inDocs,
      outDocuments: outDocs,
      reservedNumbers: reservedNumbers
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: 'Failed to fetch user statistics' });
  }
});

// Get documents created by the authenticated user
router.get('/my-documents', authenticate, async (req, res) => {
  try {
    const documents = await Document.find({
      user: req.user.id  // Only fetch documents created by this user
    })
    .populate('user', 'name email department')
    .sort({ createdAt: -1 });

    const formattedDocuments = documents.map(doc => ({
      id: doc._id,
      number: doc.number,
      title: doc.title,
      type: doc.type,
      department: doc.user.department,
      description: doc.description,
      attachments: doc.attachments,
      registeredBy: doc.user.name,
      registeredAt: doc.createdAt.toISOString()
    }));

    res.json(formattedDocuments);
  } catch (error) {
    console.error('Error fetching user documents:', error);
    res.status(500).json({ message: 'Failed to fetch your documents' });
  }
});

// Get user's reserved numbers
router.get('/my-reservations', authenticate, async (req, res) => {
  try {
    const reservations = await Reservation.find({
      user: req.user.id,
      used: false
    })
    .populate('user', 'name email department')
    .sort({ createdAt: -1 });

    const formattedReservations = reservations.map(reservation => {
      const reservedDate = new Date(reservation.createdAt);
      const expiresAt = new Date(reservedDate.getTime() + (7 * 24 * 60 * 60 * 1000));
      const now = new Date();

      // Determine status
      let status = 'active';
      if (reservation.used) status = 'used';
      else if (expiresAt < now) status = 'expired';

      return {
        id: reservation._id,
        number: reservation.number,
        type: reservation.type,
        department: reservation.department,
        reservedAt: reservation.createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status
      };
    });

    res.json(formattedReservations);
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    res.status(500).json({ message: 'Failed to fetch your reserved numbers' });
  }
});

// Get all documents (admin only)
router.get('/all', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const documents = await Document.find()
      .populate('user', 'name email department')
      .sort({ createdAt: -1 });

    const formattedDocuments = documents.map(doc => ({
      id: doc._id,
      type: doc.type,
      number: doc.number,
      title: doc.title,
      compartment: doc.department,
      description: doc.description,
      attachments: doc.attachments,
      registeredBy: doc.user?.name || 'Unknown User',
      timestamp: doc.createdAt.toISOString()
    }));

    res.json(formattedDocuments);
  } catch (error) {
    console.error('Error fetching all documents:', error);
    res.status(500).json({ message: 'Failed to fetch documents' });
  }
});

// Update document (admin only)
router.put('/:id', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { title, type, department, description } = req.body;
    const documentId = req.params.id;

    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Update fields
    document.title = title;
    document.type = type;
    document.department = department;
    document.description = description;

    await document.save();
    await document.populate('user', 'name email department');

    // await loggingService.logDocument(
    //   req.user,
    //   `Updated document #${document.number}`
    // );

    res.json({
      id: document._id,
      type: document.type,
      number: document.number,
      title: document.title,
      compartment: document.department,
      description: document.description,
      attachments: document.attachments,
      registeredBy: document.user?.name || 'Unknown User',
      timestamp: document.createdAt.toISOString()
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ message: 'Failed to update document' });
  }
});

// Delete document (admin only)
router.delete('/:id', authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Store document info before deletion
    const documentInfo = {
      number: document.number,
      type: document.type
    };

    // Delete the document
    await document.deleteOne();

    // Single log entry after successful deletion
    // await loggingService.logDocument(
    //   req.user,
    //   `Deleted document #${documentInfo.number}`
    // );

    return res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return res.status(500).json({ message: 'Failed to delete document' });
  }
});

module.exports = router;