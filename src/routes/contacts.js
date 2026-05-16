import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

/**
 * GET /contacts
 * Returns all trusted contacts.
 */
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('contacts').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ contacts: data });
});

/**
 * POST /contacts
 * Add a trusted contact.
 * Body: { name, phone }
 */
router.post('/', async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

  const { data, error } = await supabase.from('contacts').insert([{ name, phone }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ contact: data[0] });
});

/**
 * DELETE /contacts/:id
 * Remove a trusted contact by ID.
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.sendStatus(204);
});

export default router;
