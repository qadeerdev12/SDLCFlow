import AIUsage from '../models/AIUsage.js';
import { aiUsageOptions } from '../config/aiUsage.js';

const error = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

export function assertAIEnabled() {
  const options = aiUsageOptions();
  if (!options.enabled) throw error('AI features are currently disabled by the server administrator.', 503, 'AI_DISABLED');
  return options;
}

// Reserve immediately before the provider call, never refund: a timeout can
// still incur provider charges. Atomic conditional increments prevent concurrent
// users/processes sharing this database from overspending the request allowance.
export async function reserveAIRequest(now = new Date()) {
  const { dailyLimit } = assertAIEnabled();
  const day = now.toISOString().slice(0, 10);
  const reset = new Date(`${day}T00:00:00.000Z`);
  reset.setUTCDate(reset.getUTCDate() + 1);
  let reserved;
  try {
    try {
      await AIUsage.updateOne({ _id: day }, { $setOnInsert: {
        count: 0, expiresAt: new Date(reset.getTime() + 30 * 86400_000),
      } }, { upsert: true });
    } catch (err) {
      // Another process may create today's unique document first.
      if (err.code !== 11000) throw err;
    }
    reserved = await AIUsage.findOneAndUpdate({ _id: day, count: { $lt: dailyLimit } },
      { $inc: { count: 1 } }, { returnDocument: 'after' }).lean();
  } catch {
    throw error('AI usage could not be checked. Please try again later.', 503, 'AI_USAGE_UNAVAILABLE');
  }
  if (!reserved) {
    throw Object.assign(error('The shared daily AI request limit has been reached. Try again after midnight UTC.', 429, 'AI_DAILY_LIMIT'), {
      retryAfter: Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 1000)),
      resetAt: reset.toISOString(),
    });
  }
}
