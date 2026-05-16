import express from 'express';
import dotenv from 'dotenv';
import callRoutes from './routes/calls.js';
import voicemailRoutes from './routes/voicemail.js';
import contactRoutes from './routes/contacts.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/calls', callRoutes);
app.use('/voicemail', voicemailRoutes);
app.use('/contacts', contactRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Cove' }));

app.listen(PORT, () => {
  console.log(`Cove server running on port ${PORT}`);
});

export default app;
