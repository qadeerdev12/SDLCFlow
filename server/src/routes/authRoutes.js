import express from 'express';
import {register, login, getMe, getProfile, updateProfile, updatePassword, deleteAccount} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';


const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/profile', protect, getProfile);
router.patch('/profile', protect, updateProfile);
router.patch('/password', protect, updatePassword);
router.delete('/me', protect, deleteAccount);

export default router;
