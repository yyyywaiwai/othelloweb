import { chooseCpuMove, type CpuDifficulty } from '../src/lib/cpuPlayer'
import {
  applyMove,
  computeValidMoves,
  countDisks,
  createInitialBoard,
  nextDisk,
  type Disk,
} from '../shared/othello'

interface GameResult {
  winner: Disk | 'draw'
  scores: ReturnType<typeof countDisks>
}

const randomEntry = <T>(iterable: Iterable<T>): T => {
  const array = Array.from(iterable)
  if (!array.length) throw new Error('Cannot pick from empty iterable')
  return array[Math.floor(Math.random() * array.length)]
}

const RANDOM_OPENING_PLIES = Number(process.env.CPU_BENCH_RANDOM_PLIES ?? 2)

const playHeadlessMatch = (
  blackDifficulty: CpuDifficulty,
  whiteDifficulty: CpuDifficulty,
  randomOpeningPlies = RANDOM_OPENING_PLIES,
): GameResult => {
  let board = createInitialBoard()
  let currentDisk: Disk = 'B'
  let passes = 0

  for (let i = 0; i < randomOpeningPlies; i += 1) {
    const moves = computeValidMoves(board, currentDisk)
    if (!moves.size) {
      passes += 1
      if (passes >= 2) return { winner: 'draw', scores: countDisks(board) }
      currentDisk = nextDisk(currentDisk)
      continue
    }
    passes = 0
    const [move, flips] = randomEntry(moves.entries())
    board = applyMove(board, move, currentDisk, flips)
    currentDisk = nextDisk(currentDisk)
  }

  passes = 0

  while (passes < 2) {
    const moves = computeValidMoves(board, currentDisk)
    if (!moves.size) {
      passes += 1
      currentDisk = nextDisk(currentDisk)
      continue
    }

    passes = 0
    const difficulty = currentDisk === 'B' ? blackDifficulty : whiteDifficulty
    const result = chooseCpuMove(board, currentDisk, { difficulty })
    const chosenMove = result.move ?? moves.keys().next().value
    const flips = moves.get(chosenMove)
    if (!flips) throw new Error('Expected flips for chosen move')
    board = applyMove(board, chosenMove, currentDisk, flips)
    currentDisk = nextDisk(currentDisk)
  }

  const scores = countDisks(board)
  const winner = scores.B === scores.W ? 'draw' : scores.B > scores.W ? 'B' : 'W'
  return { winner, scores }
}

const aggregate = (games: number, black: CpuDifficulty, white: CpuDifficulty) => {
  const tally: Record<'B' | 'W' | 'draw', number> = { B: 0, W: 0, draw: 0 }
  for (let i = 0; i < games; i += 1) {
    const { winner } = playHeadlessMatch(black, white)
    tally[winner] += 1
  }
  return tally
}

const GAMES = Number(process.env.CPU_BENCH_GAMES ?? 12)

const scenarios: Array<[
  string,
  CpuDifficulty,
  CpuDifficulty,
]> = [
  ['Easy vs Normal', 'easy', 'normal'],
  ['Normal vs Easy', 'normal', 'easy'],
  ['Normal vs Hard', 'normal', 'hard'],
  ['Hard vs Normal', 'hard', 'normal'],
  ['Easy vs Hard', 'easy', 'hard'],
  ['Hard vs Easy', 'hard', 'easy'],
]

for (const [label, black, white] of scenarios) {
  const tally = aggregate(GAMES, black, white)
  console.log(`${label} (${GAMES}局):`, tally)
}
