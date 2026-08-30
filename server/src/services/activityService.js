import Activity from '../models/Activity.js';

function roomName(boardId) {
  return `board:${boardId}`;
}

export async function listActivities(boardId, limit = 30) {
  return Activity.find({ board: boardId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'name email');
}

export async function recordActivity({
  io,
  socket,
  boardId,
  actorId,
  action,
  targetType,
  targetId,
  targetTitle,
  metadata = {},
}) {
  const activity = await Activity.create({
    board: boardId,
    actor: actorId,
    action,
    targetType,
    targetId,
    targetTitle,
    metadata,
  });
  await activity.populate('actor', 'name email');

  const payload = {
    boardId: boardId.toString(),
    activity,
  };

  if (socket) socket.to(roomName(boardId)).emit('activity:created', payload);
  else if (io) io.to(roomName(boardId)).emit('activity:created', payload);

  return activity;
}
