import { chooseCpuMove, CPU_DIFFICULTY_LABELS, type CpuDifficulty } from '../src/lib/cpuPlayer'
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

const ORDERED_DIFFICULTIES: CpuDifficulty[] = ['easy', 'normal', 'hard', 'saikyo']

const scenarios: Array<[
  string,
  CpuDifficulty,
  CpuDifficulty,
]> = []

for (let i = 0; i < ORDERED_DIFFICULTIES.length; i += 1) {
  for (let j = i + 1; j < ORDERED_DIFFICULTIES.length; j += 1) {
    const a = ORDERED_DIFFICULTIES[i]
    const b = ORDERED_DIFFICULTIES[j]
    scenarios.push([
      `${CPU_DIFFICULTY_LABELS[a]} vs ${CPU_DIFFICULTY_LABELS[b]}`,
      a,
      b,
    ])
    scenarios.push([
      `${CPU_DIFFICULTY_LABELS[b]} vs ${CPU_DIFFICULTY_LABELS[a]}`,
      b,
      a,
    ])
  }
}

for (const [label, black, white] of scenarios) {
  const tally = aggregate(GAMES, black, white)
  console.log(`${label} (${GAMES}局):`, tally)
}
