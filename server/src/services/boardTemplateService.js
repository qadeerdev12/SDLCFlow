import Card from '../models/Card.js';
import List from '../models/List.js';
import { getBoardTemplate } from '../data/boardTemplates.js';

function makeTemplateError(templateId) {
  const err = new Error(`Board template "${templateId}" was not found.`);
  err.statusCode = 400;
  err.code = 'VALIDATION';
  return err;
}

export function resolveBoardTemplate(templateId) {
  if (!templateId) return null;

  const template = getBoardTemplate(templateId);
  if (!template) throw makeTemplateError(templateId);
  return template;
}

export async function seedBoardFromTemplate(boardId, template) {
  if (!template) return { lists: [], cards: [] };

  const lists = await List.insertMany(
    template.lists.map((title, index) => ({
      board: boardId,
      title,
      position: (index + 1) * 1000,
    })),
    { ordered: true }
  );

  const listsByTitle = new Map(lists.map((list) => [list.title, list]));
  const cards = await Card.insertMany(
    template.cards.map((card, index) => {
      const list = listsByTitle.get(card.list);
      if (!list) throw makeTemplateError(template.id);

      return {
        board: boardId,
        list: list._id,
        title: card.title,
        tag: card.tag,
        status: card.status,
        position: (index + 1) * 1000,
      };
    }),
    { ordered: true }
  );

  return { lists, cards };
}
