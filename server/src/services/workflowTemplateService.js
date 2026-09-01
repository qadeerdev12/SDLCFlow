import Card from '../models/Card.js';
import List from '../models/List.js';
import { getWorkflowTemplate } from '../data/workflowTemplates.js';

function makeTemplateError(templateId) {
  const err = new Error(`Workflow template "${templateId}" was not found.`);
  err.statusCode = 400;
  err.code = 'VALIDATION';
  return err;
}

export function resolveWorkflowTemplate(templateId) {
  if (!templateId) return null;

  const template = getWorkflowTemplate(templateId);
  if (!template) throw makeTemplateError(templateId);
  return template;
}

export async function seedWorkflowFromTemplate(boardId, workflowId, template) {
  if (!template) return { lists: [], cards: [] };

  const lists = await List.insertMany(
    template.lists.map((title, index) => ({
      board: boardId,
      workflow: workflowId,
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
        workflow: workflowId,
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
