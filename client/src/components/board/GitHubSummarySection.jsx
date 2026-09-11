import { GitCommitHorizontal } from 'lucide-react'

// Render server-resolved sources, never links extracted from generated prose.
export default function GitHubSummarySection({ github }) {
  return (
    <section className="min-w-0 border-t border-zinc-200 pt-4 dark:border-zinc-800" aria-labelledby="github-summary-title">
      <h3 id="github-summary-title" className="flex items-center gap-2 text-sm font-semibold"><GitCommitHorizontal size={16} aria-hidden="true" />Recent GitHub activity</h3>
      {github.status === 'not_linked' ? (
        <p className="mt-2 text-sm text-zinc-500">No repository is linked to this project. This summary includes tasks only.</p>
      ) : (
        <>
          <a href={github.repository.htmlUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-teal-700 underline underline-offset-2 [overflow-wrap:anywhere] dark:text-teal-300">{github.repository.fullName}</a>
          <p className="mt-1 text-xs leading-5 text-zinc-500 [overflow-wrap:anywhere]">Branch: {github.repository.defaultBranch || 'Repository default'}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{github.included} {github.included === 1 ? 'commit' : 'commits'} included; up to {github.limit} recent commits. Not complete repository history.</p>
          {github.sampledAt && <p className="text-xs leading-5 text-zinc-500">Commit snapshot from {new Date(github.sampledAt).toLocaleString()}.</p>}
          <p className="mt-1 text-xs leading-5 text-zinc-500">Commit titles are not verification of task completion or deployment.</p>
          {github.bullets.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No commits in this sample.</p> : (
            <ul className="mt-3 space-y-4">{github.bullets.map((bullet, index) => (
              <li key={index} className="min-w-0">
                <p className="text-sm leading-6 [overflow-wrap:anywhere]">{bullet.text}</p>
                <ul className="mt-1 space-y-2">{bullet.commits.map((commit) => (
                  <li key={commit.sha} className="min-w-0">
                    <a href={commit.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-700 underline underline-offset-2 [overflow-wrap:anywhere] dark:text-teal-300"><span className="font-mono text-xs">{commit.sha.slice(0, 7)}</span>{' '}{commit.title || 'Untitled commit'}</a>
                  </li>
                ))}</ul>
              </li>
            ))}</ul>
          )}
        </>
      )}
    </section>
  )
}
