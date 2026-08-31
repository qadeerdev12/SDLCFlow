export const boardTemplates = [
  {
    id: 'software-sprint',
    name: 'Software Sprint',
    summary: 'Plan, build, review, test, and close sprint work.',
    description: 'A practical sprint workflow for shipping product increments with review and QA built in.',
    icon: 'terminal-square',
    emoji: 'code',
    color: 'indigo',
    lists: ['Backlog', 'Ready', 'In Progress', 'Code Review', 'QA', 'Done'],
    cards: [
      { title: 'Define sprint goal', list: 'Backlog', tag: 'Task', status: 'Todo' },
      { title: 'Review open bugs', list: 'Ready', tag: 'Bug', status: 'Todo' },
      { title: 'Prepare release checklist', list: 'QA', tag: 'Chore', status: 'Todo' },
    ],
  },
  {
    id: 'github-project',
    name: 'GitHub Project',
    summary: 'Track issues and pull requests through a familiar flow.',
    description: 'A compact GitHub-style board for features, bugs, docs, chores, and review work.',
    icon: 'git-pull-request',
    emoji: 'git-branch',
    color: 'slate',
    lists: ['Todo', 'In Progress', 'In Review', 'Done'],
    cards: [
      { title: 'Connect issue labels to board tags', list: 'Todo', tag: 'Feature', status: 'Todo' },
      { title: 'Review pull request checklist', list: 'In Review', tag: 'Chore', status: 'Review' },
      { title: 'Update project README notes', list: 'Done', tag: 'Docs', status: 'Done' },
    ],
  },
  {
    id: 'bug-triage',
    name: 'Bug Triage',
    summary: 'Capture, reproduce, prioritize, fix, and verify defects.',
    description: 'A focused workflow for keeping bug reports organized from intake to closure.',
    icon: 'bug',
    emoji: 'bug',
    color: 'rose',
    lists: ['Reported', 'Reproducing', 'Prioritized', 'Fixing', 'Verifying', 'Closed'],
    cards: [
      { title: 'Confirm reproduction steps', list: 'Reproducing', tag: 'Bug', status: 'In Progress' },
      { title: 'Rank customer-impacting reports', list: 'Prioritized', tag: 'Bug', status: 'Todo' },
      { title: 'Verify resolved regressions', list: 'Verifying', tag: 'Bug', status: 'Review' },
    ],
  },
  {
    id: 'product-roadmap',
    name: 'Product Roadmap',
    summary: 'Move product ideas from discovery to released work.',
    description: 'A roadmap board for shaping ideas, planning delivery, beta feedback, and launches.',
    icon: 'map',
    emoji: 'map',
    color: 'sky',
    lists: ['Ideas', 'Planned', 'Building', 'Beta', 'Released'],
    cards: [
      { title: 'Collect customer feedback themes', list: 'Ideas', tag: 'Research', status: 'Todo' },
      { title: 'Scope next roadmap candidate', list: 'Planned', tag: 'Feature', status: 'Todo' },
      { title: 'Prepare beta rollout notes', list: 'Beta', tag: 'Docs', status: 'Review' },
    ],
  },
  {
    id: 'personal-dev',
    name: 'Personal Development',
    summary: 'Organize solo learning, experiments, and project tasks.',
    description: 'A lighter board for personal software projects, study plans, and side quests.',
    icon: 'sparkles',
    emoji: 'sparkles',
    color: 'emerald',
    lists: ['Brainstorm', 'Next', 'Working', 'Waiting', 'Complete'],
    cards: [
      { title: 'Pick the next small improvement', list: 'Next', tag: 'Task', status: 'Todo' },
      { title: 'Document what changed', list: 'Working', tag: 'Docs', status: 'In Progress' },
      { title: 'Review blocked follow-ups', list: 'Waiting', tag: 'Chore', status: 'Blocked' },
    ],
  },
  {
    id: 'release-plan',
    name: 'Release Plan',
    summary: 'Coordinate final checks before a production launch.',
    description: 'A deployment-focused workflow for release readiness, verification, and follow-up.',
    icon: 'rocket',
    emoji: 'rocket',
    color: 'amber',
    lists: ['Scope Lock', 'Final Fixes', 'Verification', 'Deploy', 'Post-release'],
    cards: [
      { title: 'Freeze release scope', list: 'Scope Lock', tag: 'Task', status: 'Done' },
      { title: 'Run smoke test checklist', list: 'Verification', tag: 'Bug', status: 'Todo' },
      { title: 'Monitor production after deploy', list: 'Post-release', tag: 'Chore', status: 'Todo' },
    ],
  },
];

export function listBoardTemplates() {
  // Return fresh objects so callers cannot accidentally mutate the shared
  // catalog that future board-creation code will also rely on.
  return boardTemplates.map((template) => ({
    ...template,
    lists: [...template.lists],
    cards: template.cards.map((card) => ({ ...card })),
  }));
}
