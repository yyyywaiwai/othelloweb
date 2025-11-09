export type Disk = 'B' | 'W'
export type Cell = Disk | null

export const BOARD_SIZE = 8

const DIRECTIONS = [
  { row: -1, col: -1 },
  { row: -1, col: 0 },
  { row: -1, col: 1 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
]

export type MoveMap = Map<number, number[]>

export const DISK_LABEL: Record<Disk, string> = {
  B: 'Black',
  W: 'White',
}

const toIndex = (row: number, col: number) => row * BOARD_SIZE + col

const isInBounds = (row: number, col: number) =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE

export const createInitialBoard = (): Cell[] => {
  const board: Cell[] = Array(BOARD_SIZE * BOARD_SIZE).fill(null)
  const center = BOARD_SIZE / 2
  const topLeft = toIndex(center - 1, center - 1)
  board[topLeft] = 'W'
  board[topLeft + 1] = 'B'
  board[topLeft + BOARD_SIZE] = 'B'
  board[topLeft + BOARD_SIZE + 1] = 'W'
  return board
}

export const nextDisk = (disk: Disk): Disk => (disk === 'B' ? 'W' : 'B')

export const computeValidMoves = (board: Cell[], disk: Disk): MoveMap => {
  const moves: MoveMap = new Map()

  board.forEach((cell, index) => {
    if (cell) return

    const row = Math.floor(index / BOARD_SIZE)
    const col = index % BOARD_SIZE
    const flips: number[] = []

    for (const { row: dRow, col: dCol } of DIRECTIONS) {
      let r = row + dRow
      let c = col + dCol
      const captured: number[] = []

      while (isInBounds(r, c)) {
        const targetIndex = toIndex(r, c)
        const occupant = board[targetIndex]

        if (!occupant) {
          captured.length = 0
          break
        }

        if (occupant === disk) {
          if (captured.length) flips.push(...captured)
          break
        }

        captured.push(targetIndex)
        r += dRow
        c += dCol
      }
    }

    if (flips.length) moves.set(index, flips)
  })

  return moves
}

export const applyMove = (
  board: Cell[],
  index: number,
  disk: Disk,
  flips: number[],
): Cell[] => {
  const next = board.slice()
  next[index] = disk
  for (const flipIndex of flips) next[flipIndex] = disk
  return next
}

export const countDisks = (board: Cell[]): Record<Disk, number> =>
  board.reduce(
    (acc, cell) => {
      if (cell === 'B') acc.B += 1
      if (cell === 'W') acc.W += 1
      return acc
    },
    { B: 0, W: 0 },
  )
