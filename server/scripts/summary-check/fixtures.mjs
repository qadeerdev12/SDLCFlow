import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../../src/models/User.js';
import Board from '../../src/models/Board.js';
import Card from '../../src/models/Card.js';
import GitHubAccount from '../../src/models/GitHubAccount.js';
import BoardGitHubIntegration from '../../src/models/BoardGitHubIntegration.js';

export const sha = 'a'.repeat(40);
export async function createFixture(mode) {
  const user = await User.create({ name: 'Test User', email: `${new mongoose.Types.ObjectId()}@example.test`, passwordHash: 'unused' });
  const board = await Board.create({ name: mode === 'long-content' ? 'LongProjectIdentifier'.repeat(8) : 'Summary verification', owner: user._id, members: [{ user: user._id, role: 'owner' }] });
  const card = mode === 'commits-only' ? null : await Card.create({ board: board._id, list: new mongoose.Types.ObjectId(), title: mode === 'long-content' ? '<img src=x onerror=alert(1)>' + 'LongTaskIdentifier'.repeat(12) : 'API resilience', status: 'Done', position: 1 });
  if (mode !== 'unlinked') {
    const account = await GitHubAccount.create({ user: user._id, githubId: user.id, username: 'test-user', accessToken: 'fake-github-token' });
    await BoardGitHubIntegration.create({ board: board._id, connectedBy: user._id, githubAccount: account._id,
      repoId: '1', repoOwner: 'example', repoName: 'project', repoFullName: 'example/project', repoUrl: 'https://github.com/example/project', defaultBranch: mode === 'long-content' ? 'release/' + 'LongBranchIdentifier'.repeat(8) : 'main' });
    if (mode === 'disconnected') await account.deleteOne();
  }
  return { board, card, token: jwt.sign({ id: user.id }, process.env.JWT_SECRET), mode, calls: { github: 0, openai: 0 } };
}

// Reject every unrecognized URL: this runner must never fall through to a real
// GitHub/OpenAI call, even when the developer has production keys configured.
export function providerFetch(getFixture) {
  return async (url, options) => {
    const fixture = getFixture();
    if (url.startsWith('https://api.github.com/repos/')) {
      fixture.calls.github++;
      if (fixture.mode === 'rate-limit') return new Response(JSON.stringify({ message: 'Secondary rate limit' }), { status: 403, headers: { 'retry-after': '2' } });
      if (fixture.mode === 'timeout') return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
      const title = fixture.mode === 'long-content' ? 'LongCommitIdentifier'.repeat(15) : 'Improve API resilience';
      return new Response(JSON.stringify([{ sha, commit: { message: title + '\nPRIVATE_COMMIT_BODY', author: { name: 'PRIVATE_AUTHOR', date: '2026-09-11T00:00:00Z' } } }]));
    }
    if (url === 'https://api.openai.com/v1/responses') {
      fixture.calls.openai++;
      const input = JSON.parse(JSON.parse(options.body).input[0].content);
      if (/PRIVATE_COMMIT_BODY|PRIVATE_AUTHOR|fake-github-token/.test(JSON.stringify(input))) throw new Error('Provider input leaked private fixture metadata');
      const tasks = input.tasks || input;
      const text = fixture.mode === 'long-content' ? 'LongGeneratedIdentifier'.repeat(18) : 'Task snapshot verified.';
      const output = Object.fromEntries(tasks.map((group) => [group.section, group.cards.length ? [{ text, cardIds: [group.cards[0].id] }] : []]));
      if (input.github) output.github = input.github.commits.length ? [{ text: 'Commit reports improved API resilience.', commitShas: [input.github.commits[0].sha] }] : [];
      if (fixture.mode === 'revoked') await Board.updateOne({ _id: fixture.board._id }, { members: [] });
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }));
    }
    throw new Error(`Unexpected network request in summary check: ${url}`);
  };
}
