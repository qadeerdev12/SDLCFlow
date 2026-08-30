// server/src/routes/boardRoutes.js
import express from 'express';
import { createBoard, getMyBoards, getBoard, updateBoard, deleteBoard } from '../controllers/boardController.js';
import { protect } from '../middleware/auth.js';
import { createList, updateList, deleteList } from '../controllers/listController.js';
import { createCard, updateCard, deleteCard } from '../controllers/cardController.js';



const router = express.Router();

// Every board route requires login. Applying `protect` to all routes in this file:
router.use(protect);

router.post('/', createBoard);    // POST   /api/v1/boards
router.get('/', getMyBoards); 
router.get('/:boardId', getBoard); // GET    /api/v1/boards/:boardId
router.patch('/:boardId', updateBoard);
router.delete('/:boardId', deleteBoard);

// Lists (nested under a board)
router.post('/:boardId/lists', createList);
router.patch('/:boardId/lists/:listId', updateList);
router.delete('/:boardId/lists/:listId', deleteList);

// Cards (nested under a board)
router.post('/:boardId/cards', createCard);
router.patch('/:boardId/cards/:cardId', updateCard);
router.delete('/:boardId/cards/:cardId', deleteCard);

export default router;
