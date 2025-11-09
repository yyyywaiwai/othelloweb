import {
  applyMove,
  BOARD_SIZE,
  computeValidMoves,
  countDisks,
  nextDisk,
  type Cell,
  type Disk,
} from './othello'

type DifficultyConfig = {
  maxDepth: number
}

export type CpuDifficulty = 'easy' | 'normal' | 'hard' | 'saikyo'

export const CPU_DIFFICULTY_LABELS: Record<CpuDifficulty, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'つよい',
  saikyo: 'さいきょう',
}

export const CPU_DIFFICULTY_PRESETS: Record<CpuDifficulty, DifficultyConfig> = {
  easy: { maxDepth: 2 },
  normal: { maxDepth: 4 },
  hard: { maxDepth: 5 },
  saikyo: { maxDepth: 6 },
}

const DIFFICULTY_CONFIG = CPU_DIFFICULTY_PRESETS

export interface CpuMoveOptions {
  difficulty?: CpuDifficulty
  maxDepthOverride?: number
}

export interface CpuMoveResult {
  move: number | null
  score: number
  depth: number
  nodes: number
}

const CORNERS = [0, 7, 56, 63]
const CORNER_ADJACENT: Record<number, number[]> = {
  0: [1, 8, 9],
  7: [6, 14, 15],
  56: [48, 49, 57],
  63: [54, 55, 62],
}
const EDGE_INDICES = new Set<number>()
const CORNER_SET = new Set(CORNERS)
const CORNER_DANGER = new Set<number>([1, 8, 9, 6, 14, 15, 48, 49, 57, 54, 55, 62])

for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
  const row = Math.floor(index / BOARD_SIZE)
  const col = index % BOARD_SIZE
  if (row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1) {
    EDGE_INDICES.add(index)
  }
}

interface SearchContext {
  maximizingDisk: Disk
  config: DifficultyConfig
  stats: { nodes: number }
}

interface SearchResult {
  move: number | null
  score: number
}

export const chooseCpuMove = (
  board: Cell[],
  disk: Disk,
  options: CpuMoveOptions = {},
): CpuMoveResult => {
  const difficulty = options.difficulty ?? 'normal'
  const config = {
    ...DIFFICULTY_CONFIG[difficulty],
    ...(options.maxDepthOverride ? { maxDepth: options.maxDepthOverride } : {}),
  }

  const context: SearchContext = {
    maximizingDisk: disk,
    config,
    stats: { nodes: 0 },
  }

  const result = negamax(board, disk, config.maxDepth, -Infinity, Infinity, context)

  return {
    move: result.move,
    score: result.score,
    depth: config.maxDepth,
    nodes: context.stats.nodes,
  }
}

const evaluatePerspective = (board: Cell[], disk: Disk, context: SearchContext) => {
  const raw = evaluateBoard(board, context.maximizingDisk)
  return disk === context.maximizingDisk ? raw : -raw
}

const negamax = (
  board: Cell[],
  disk: Disk,
  depth: number,
  alpha: number,
  beta: number,
  context: SearchContext,
): SearchResult => {
  context.stats.nodes += 1
  if (depth === 0) {
    return { move: null, score: evaluatePerspective(board, disk, context) }
  }

  const moves = computeValidMoves(board, disk)
  const opponent = nextDisk(disk)

  if (moves.size === 0) {
    const opponentMoves = computeValidMoves(board, opponent)
    if (opponentMoves.size === 0) {
      return { move: null, score: evaluatePerspective(board, disk, context) }
    }
    const passResult = negamax(board, opponent, depth, -beta, -alpha, context)
    return { move: null, score: -passResult.score }
  }

  let bestMove: number | null = null
  let bestScore = -Infinity

  const orderedMoves = orderMoves([...moves.entries()])

  for (const [index, flips] of orderedMoves) {
    const nextBoard = applyMove(board, index, disk, flips)
    const result = negamax(nextBoard, opponent, depth - 1, -beta, -alpha, context)
    const score = -result.score
    if (score > bestScore) {
      bestScore = score
      bestMove = index
    }
    if (score > alpha) {
      alpha = score
    }
    if (alpha >= beta) {
      break
    }
  }

  return { move: bestMove, score: bestScore }
}

const orderMoves = (entries: Array<[number, number[]]>) =>
  entries.sort((a, b) => scoreMove(b[0]) - scoreMove(a[0]))

const scoreMove = (index: number) => {
  if (CORNER_SET.has(index)) return 100
  if (CORNER_DANGER.has(index)) return -40
  if (EDGE_INDICES.has(index)) return 10
  return 0
}

const evaluateBoard = (board: Cell[], disk: Disk) => {
  const opponent = nextDisk(disk)
  const diskScore = getDiskScore(board, disk, opponent)
  const mobilityScore = getMobilityScore(board, disk, opponent)
  const cornerScore = getCornerScore(board, disk, opponent)
  const frontierScore = getFrontierScore(board, disk, opponent)
  const edgeScore = getEdgeScore(board, disk, opponent)

  return diskScore + mobilityScore + cornerScore + frontierScore + edgeScore
}

const getDiskScore = (board: Cell[], disk: Disk, opponent: Disk) => {
  const counts = countDisks(board)
  const total = counts[disk] + counts[opponent]
  if (total === 0) return 0
  return ((counts[disk] - counts[opponent]) / total) * 100
}

const getMobilityScore = (board: Cell[], disk: Disk, opponent: Disk) => {
  const myMoves = computeValidMoves(board, disk).size
  const oppMoves = computeValidMoves(board, opponent).size
  const total = myMoves + oppMoves
  if (total === 0) return 0
  return ((myMoves - oppMoves) / total) * 90
}

const getCornerScore = (board: Cell[], disk: Disk, opponent: Disk) => {
  let score = 0
  for (const corner of CORNERS) {
    const occupant = board[corner]
    if (occupant === disk) score += 125
    else if (occupant === opponent) score -= 125
    else {
      const adjacent = CORNER_ADJACENT[corner]
      for (const adj of adjacent) {
        if (board[adj] === disk) score -= 40
        else if (board[adj] === opponent) score += 40
      }
    }
  }
  return score
}

const getFrontierScore = (board: Cell[], disk: Disk, opponent: Disk) => {
  let myFrontier = 0
  let oppFrontier = 0

  for (let index = 0; index < board.length; index += 1) {
    const cell = board[index]
    if (!cell) continue
    const row = Math.floor(index / BOARD_SIZE)
    const col = index % BOARD_SIZE
    let isFrontier = false

    for (let dRow = -1; dRow <= 1 && !isFrontier; dRow += 1) {
      for (let dCol = -1; dCol <= 1; dCol += 1) {
        if (dRow === 0 && dCol === 0) continue
        const nextRow = row + dRow
        const nextCol = col + dCol
        if (
          nextRow < 0 ||
          nextRow >= BOARD_SIZE ||
          nextCol < 0 ||
          nextCol >= BOARD_SIZE
        ) {
          continue
        }
        const neighborIndex = nextRow * BOARD_SIZE + nextCol
        if (board[neighborIndex] === null) {
          isFrontier = true
          break
        }
      }
    }

    if (!isFrontier) continue
    if (cell === disk) myFrontier += 1
    else if (cell === opponent) oppFrontier += 1
  }

  const total = myFrontier + oppFrontier
  if (total === 0) return 0
  return ((oppFrontier - myFrontier) / total) * 60
}

const getEdgeScore = (board: Cell[], disk: Disk, opponent: Disk) => {
  let score = 0
  for (const index of EDGE_INDICES) {
    const occupant = board[index]
    if (occupant === disk) score += 6
    else if (occupant === opponent) score -= 6
  }
  return score
}
