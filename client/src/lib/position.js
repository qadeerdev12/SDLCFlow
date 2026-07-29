// Fractional positioning: instead of renumbering every sibling on each move,
// a moved item gets a position *between* its two new neighbors. Positions are
// plain Numbers (see Card/List models), so the midpoint of two floats keeps
// working for many moves before it would ever need a rebalance.
//
// Neighbor positions are the values on either side of the drop slot:
//   - both present  -> midpoint
//   - only prev (dropped at the end)   -> prev + STEP
//   - only next (dropped at the start) -> next / 2
//   - neither (empty container)        -> STEP
const STEP = 1000

export function positionBetween(prevPos, nextPos) {
  const hasPrev = typeof prevPos === 'number'
  const hasNext = typeof nextPos === 'number'
  if (hasPrev && hasNext) return (prevPos + nextPos) / 2
  if (hasPrev) return prevPos + STEP
  if (hasNext) return nextPos / 2
  return STEP
}

// Given an ordered array already containing the moved item at `index`, derive
// the fractional position from the items immediately before/after it.
export function positionForIndex(orderedItems, index) {
  const prev = orderedItems[index - 1]
  const next = orderedItems[index + 1]
  return positionBetween(prev?.position, next?.position)
}
