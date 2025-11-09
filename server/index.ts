import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import {
  applyMove,
  computeValidMoves,
  countDisks,
  createInitialBoard,
  DISK_LABEL,
  nextDisk,
  type Cell,
  type Disk,
} from '../shared/othello.js'

type ClientStatus = 'idle' | 'queue' | 'waiting' | 'playing' | 'spectating'
type ClientRole = 'player' | 'spectator' | null

type PlayerSlots = Record<Disk, string | null>

type WinnerFlag = Disk | 'draw' | null

interface RoomState {
  key: string
  board: Cell[]
  currentDisk: Disk
  lastMove: number | null
  players: PlayerSlots
  spectators: Set<string>
  status: 'waiting' | 'playing' | 'finished'
  statusMessage: string
  createdAt: number
  winner: WinnerFlag
  turnDeadline: number | null
}

interface ClientMeta {
  id: string
  socket: WebSocket
  status: ClientStatus
  roomKey: string | null
  role: ClientRole
  disk: Disk | null
  disconnectTimer: NodeJS.Timeout | null
}

interface MessagePayload {
  type: string
  payload?: Record<string, unknown>
}

interface MatchStatePayload {
  matchKey: string
  board: Cell[]
  currentDisk: Disk
  lastMove: number | null
  scores: Record<Disk, number>
  spectators: number
  statusMessage: string
  winner: WinnerFlag
  turnDeadline: number | null
}

const PORT = Number(process.env.MATCH_SERVER_PORT ?? process.env.PORT ?? 8787)
const TURN_TIMEOUT_MS = Number(process.env.MATCH_TURN_TIMEOUT_MS ?? 180000)
const DISCONNECT_GRACE_MS = Number(process.env.MATCH_DISCONNECT_GRACE_MS ?? 15000)

const httpServer = createServer()
const wss = new WebSocketServer({ server: httpServer })

const rooms = new Map<string, RoomState>()
const clientsBySocket = new Map<WebSocket, ClientMeta>()
const clientsById = new Map<string, ClientMeta>()
const randomQueue: string[] = []

const MATCH_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MATCH_KEY_LENGTH = 6

const createMatchKey = () =>
  Array.from({ length: MATCH_KEY_LENGTH }, () =>
    MATCH_KEY_ALPHABET[Math.floor(Math.random() * MATCH_KEY_ALPHABET.length)],
  ).join('')

const toStatePayload = (room: RoomState): MatchStatePayload => ({
  matchKey: room.key,
  board: room.board,
  currentDisk: room.currentDisk,
  lastMove: room.lastMove,
  scores: countDisks(room.board),
  spectators: room.spectators.size,
  statusMessage: room.statusMessage,
  winner: room.winner,
  turnDeadline: room.turnDeadline,
})

const send = (socket: WebSocket, type: string, payload: Record<string, unknown> = {}) => {
  if (socket.readyState !== WebSocket.OPEN) return
  const message: MessagePayload = { type, payload }
  socket.send(JSON.stringify(message))
}

const sendById = (clientId: string | null, type: string, payload: Record<string, unknown> = {}) => {
  if (!clientId) return
  const meta = clientsById.get(clientId)
  if (!meta) return
  send(meta.socket, type, payload)
}

const broadcastRoom = (
  room: RoomState,
  type: string,
  payload: Record<string, unknown> = {},
) => {
  for (const disk of Object.keys(room.players) as Disk[]) {
    sendById(room.players[disk], type, payload)
  }
  for (const spectatorId of room.spectators) {
    sendById(spectatorId, type, payload)
  }
}

const removeFromQueue = (clientId: string) => {
  const index = randomQueue.indexOf(clientId)
  if (index >= 0) randomQueue.splice(index, 1)
}

const releaseClient = (clientId: string | null) => {
  if (!clientId) return
  const meta = clientsById.get(clientId)
  if (!meta) return
  meta.status = 'idle'
  meta.role = null
  meta.roomKey = null
  meta.disk = null
}

const releaseRoomOccupants = (room: RoomState) => {
  for (const disk of ['B', 'W'] as Disk[]) {
    releaseClient(room.players[disk])
    room.players[disk] = null
  }
  for (const spectatorId of room.spectators) {
    releaseClient(spectatorId)
  }
  room.spectators.clear()
}

const refreshTurnDeadline = (room: RoomState) => {
  if (room.status === 'playing') {
    room.turnDeadline = Date.now() + TURN_TIMEOUT_MS
  } else {
    room.turnDeadline = null
  }
}

const rehydrateSession = (meta: ClientMeta) => {
  if (!meta.socket || meta.socket.readyState !== WebSocket.OPEN) return

  if (meta.status === 'queue') {
    send(meta.socket, 'queue:status', { searching: true })
    return
  }

  if (meta.status === 'waiting' && meta.roomKey && meta.disk) {
    send(meta.socket, 'match:waiting', { matchKey: meta.roomKey, yourDisk: meta.disk })
    return
  }

  if (!meta.roomKey) return
  const room = rooms.get(meta.roomKey)
  if (!room) {
    meta.status = 'idle'
    meta.role = null
    meta.disk = null
    meta.roomKey = null
    return
  }

  const state = toStatePayload(room)
  send(meta.socket, 'match:start', {
    youAre: meta.role === 'spectator' ? 'spectator' : 'player',
    yourDisk: meta.disk,
    matchKey: room.key,
    state,
  })
}

const handleTimeout = (room: RoomState) => {
  if (room.status !== 'playing' || !room.turnDeadline) return
  const loser = room.currentDisk
  const winner = nextDisk(loser)
  room.status = 'finished'
  room.winner = winner
  room.statusMessage = winner
    ? `${DISK_LABEL[winner]} wins by timeout.`
    : 'Match ended by timeout.'
  cleanupRoom(room, 'timeout')
}

const deriveStatusMessage = (room: RoomState) => {
  if (room.status === 'finished') {
    room.turnDeadline = null
    if (room.winner === 'draw') {
      room.statusMessage = 'Game over — it\'s a draw.'
    } else if (room.winner) {
      const scores = countDisks(room.board)
      room.statusMessage = `${DISK_LABEL[room.winner]} wins ${scores.B}-${scores.W}.`
    }
    return
  }

  const currentMoves = computeValidMoves(room.board, room.currentDisk)
  if (currentMoves.size > 0) {
    room.statusMessage = `${DISK_LABEL[room.currentDisk]} to move.`
    return
  }

  const alternate = nextDisk(room.currentDisk)
  const alternateMoves = computeValidMoves(room.board, alternate)

  if (alternateMoves.size === 0) {
    room.status = 'finished'
    const scores = countDisks(room.board)
    if (scores.B === scores.W) {
      room.winner = 'draw'
      room.statusMessage = 'Game over — it\'s a draw.'
    } else {
      room.winner = scores.B > scores.W ? 'B' : 'W'
      room.statusMessage = `${DISK_LABEL[room.winner]} controls the board ${scores.B}-${scores.W}.`
    }
    room.turnDeadline = null
    return
  }

  const passingDisk = room.currentDisk
  room.currentDisk = alternate
  room.statusMessage = `${DISK_LABEL[passingDisk]} has no moves. ${DISK_LABEL[room.currentDisk]} plays again.`
}

const ensureRoomTurn = (room: RoomState) => {
  if (room.status === 'finished') return
  deriveStatusMessage(room)
}

const createRoom = (): RoomState => ({
  key: createMatchKey(),
  board: createInitialBoard(),
  currentDisk: 'B',
  lastMove: null,
  players: { B: null, W: null },
  spectators: new Set<string>(),
  status: 'waiting',
  statusMessage: 'Waiting for opponent.',
  createdAt: Date.now(),
  winner: null,
  turnDeadline: null,
})

const startRoom = (room: RoomState) => {
  room.board = createInitialBoard()
  room.currentDisk = 'B'
  room.lastMove = null
  room.status = 'playing'
  room.statusMessage = 'Black to move first.'
  room.winner = null
  refreshTurnDeadline(room)
}

const assignPlayer = (room: RoomState, clientId: string, diskPreference?: Disk) => {
  if (diskPreference) {
    room.players[diskPreference] = clientId
    return diskPreference
  }

  const openSlot = (['B', 'W'] as Disk[]).find((disk) => !room.players[disk])
  if (!openSlot) throw new Error('Room is full')
  room.players[openSlot] = clientId
  return openSlot
}

const cleanupRoom = (room: RoomState, reason = 'completed') => {
  room.turnDeadline = null
  const state = toStatePayload(room)
  broadcastRoom(room, 'match:end', { reason, state })
  releaseRoomOccupants(room)
  rooms.delete(room.key)
}

const handleMove = (meta: ClientMeta, index: number) => {
  if (!meta.roomKey || meta.role !== 'player' || !meta.disk) return

  const room = rooms.get(meta.roomKey)
  if (!room) return
  let roomStatus: RoomState['status'] = room.status
  if (roomStatus !== 'playing') return
  if (room.currentDisk !== meta.disk) return

  const validMoves = computeValidMoves(room.board, room.currentDisk)
  const flips = validMoves.get(index)
  if (!flips) {
    send(meta.socket, 'error', { message: 'Invalid move.' })
    return
  }

  room.board = applyMove(room.board, index, room.currentDisk, flips)
  room.lastMove = index
  room.currentDisk = nextDisk(room.currentDisk)
  ensureRoomTurn(room)
  roomStatus = room.status
  refreshTurnDeadline(room)

  const state = toStatePayload(room)
  broadcastRoom(room, 'match:update', { state })

  if (roomStatus === 'finished') {
    cleanupRoom(room)
  }
}

const handleSpectateJoin = (meta: ClientMeta, key: string) => {
  if (meta.status !== 'idle') {
    send(meta.socket, 'error', { message: 'Leave your current session before spectating.' })
    return
  }

  const room = rooms.get(key)
  if (!room) {
    send(meta.socket, 'error', { message: 'Match not found.' })
    return
  }

  if (room.status !== 'playing') {
    send(meta.socket, 'error', { message: 'Match is not currently playing.' })
    return
  }

  meta.status = 'spectating'
  meta.role = 'spectator'
  meta.roomKey = key
  meta.disk = null
  room.spectators.add(meta.id)

  const state = toStatePayload(room)
  send(meta.socket, 'match:start', {
    youAre: 'spectator',
    matchKey: room.key,
    state,
  })
  broadcastRoom(room, 'match:update', { state })
}

const handleKeyJoin = (meta: ClientMeta, key: string) => {
  if (meta.status !== 'idle') {
    send(meta.socket, 'error', { message: 'Leave your current session before joining another match.' })
    return
  }

  const room = rooms.get(key)
  if (!room) {
    send(meta.socket, 'error', { message: 'Match key not found.' })
    return
  }

  if (room.status === 'playing' && room.players.B && room.players.W) {
    send(meta.socket, 'prompt:spectate', { matchKey: key })
    return
  }

  if (room.status === 'finished') {
    send(meta.socket, 'error', { message: 'Match already finished.' })
    return
  }

  const disk = assignPlayer(room, meta.id, room.players.B ? 'W' : 'B')
  meta.status = 'playing'
  meta.role = 'player'
  meta.roomKey = key
  meta.disk = disk

  if (room.players.B && room.players.W) {
    startRoom(room)
    const state = toStatePayload(room)
    for (const diskKey of ['B', 'W'] as Disk[]) {
      const pid = room.players[diskKey]
      sendById(pid, 'match:start', {
        youAre: 'player',
        yourDisk: diskKey,
        state,
        matchKey: room.key,
      })
    }
  } else {
    room.statusMessage = 'Waiting for opponent to join via key.'
    room.turnDeadline = null
    send(meta.socket, 'match:waiting', { matchKey: key, yourDisk: disk })
  }
}

const handleRandomJoin = (meta: ClientMeta) => {
  if (meta.status !== 'idle') {
    if (meta.status === 'queue') {
      send(meta.socket, 'queue:status', { searching: true })
      return
    }
    send(meta.socket, 'error', { message: 'Leave your current session before re-queueing.' })
    return
  }

  randomQueue.push(meta.id)
  meta.status = 'queue'
  send(meta.socket, 'queue:status', { searching: true })
  if (randomQueue.length >= 2) {
    const [firstId, secondId] = randomQueue.splice(0, 2)
    createRandomRoom(firstId, secondId)
  }
}

const createRandomRoom = (firstId: string, secondId: string) => {
  const firstMeta = clientsById.get(firstId)
  const secondMeta = clientsById.get(secondId)
  if (!firstMeta || !secondMeta) {
    if (firstMeta) randomQueue.unshift(firstMeta.id)
    if (secondMeta) randomQueue.unshift(secondMeta.id)
    return
  }

  const room = createRoom()
  rooms.set(room.key, room)
  const entrants: ClientMeta[] = [firstMeta, secondMeta]
  if (Math.random() > 0.5) entrants.reverse()
  const slots: Array<[ClientMeta, Disk]> = entrants.map((meta, index) => [
    meta,
    index === 0 ? 'B' : 'W',
  ])

  for (const [meta, disk] of slots) {
    room.players[disk] = meta.id
    meta.status = 'playing'
    meta.role = 'player'
    meta.roomKey = room.key
    meta.disk = disk
  }

  startRoom(room)
  const state = toStatePayload(room)
  for (const [meta, disk] of slots) {
    send(meta.socket, 'queue:status', { searching: false })
    send(meta.socket, 'match:start', {
      youAre: 'player',
      yourDisk: disk,
      matchKey: room.key,
      state,
    })
  }
}

const handleLeave = (meta: ClientMeta) => {
  if (meta.status === 'queue') {
    removeFromQueue(meta.id)
    meta.status = 'idle'
    send(meta.socket, 'queue:status', { searching: false })
    return
  }

  if (!meta.roomKey) {
    meta.status = 'idle'
    meta.role = null
    meta.disk = null
    return
  }

  const room = rooms.get(meta.roomKey)
  if (!room) {
    meta.status = 'idle'
    meta.role = null
    meta.disk = null
    meta.roomKey = null
    return
  }

  if (meta.role === 'spectator') {
    room.spectators.delete(meta.id)
    const state = toStatePayload(room)
    broadcastRoom(room, 'match:update', { state })
    meta.status = 'idle'
    meta.role = null
    meta.roomKey = null
    return
  }

  const disk = meta.disk
  if (disk) {
    room.players[disk] = null
  }

  if (room.status === 'playing') {
    room.status = 'finished'
    room.winner = disk ? nextDisk(disk) : null
    room.statusMessage = 'Opponent left the match.'
    cleanupRoom(room, 'opponent-left')
  } else {
    room.statusMessage = 'Host left the lobby.'
    cleanupRoom(room, 'host-left')
  }

  meta.status = 'idle'
  meta.role = null
  meta.roomKey = null
  meta.disk = null
}

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const requestedId = url.searchParams.get('clientId')
  let meta: ClientMeta | undefined =
    requestedId && clientsById.has(requestedId) ? clientsById.get(requestedId) ?? undefined : undefined

  if (meta) {
    if (meta.socket && meta.socket !== socket) {
      try {
        meta.socket.terminate()
      } catch (error) {
        console.warn('Failed to terminate previous socket', error)
      }
    }
    meta.socket = socket
    if (meta.disconnectTimer) {
      clearTimeout(meta.disconnectTimer)
      meta.disconnectTimer = null
    }
  } else {
    const clientId = randomUUID()
    meta = {
      id: clientId,
      socket,
      status: 'idle',
      roomKey: null,
      role: null,
      disk: null,
      disconnectTimer: null,
    }
    clientsById.set(clientId, meta)
  }

  clientsBySocket.set(socket, meta)

  send(socket, 'hello', { clientId: meta.id, message: 'Connected to Othello match server.' })
  rehydrateSession(meta)

  socket.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as MessagePayload
      const { type, payload } = parsed
      if (!type) return
      switch (type) {
        case 'random:join':
          handleRandomJoin(meta)
          break
        case 'random:cancel':
          handleLeave(meta)
          break
        case 'key:create': {
          if (meta.status !== 'idle') {
            send(socket, 'error', { message: 'Already in a session.' })
            break
          }
          const room = createRoom()
          rooms.set(room.key, room)
          const disk = assignPlayer(room, meta.id, 'B')
          meta.status = 'waiting'
          meta.role = 'player'
          meta.roomKey = room.key
          meta.disk = disk
          send(socket, 'match:waiting', { matchKey: room.key, yourDisk: disk })
          break
        }
        case 'key:join': {
          if (!payload || typeof payload.matchKey !== 'string') {
            send(socket, 'error', { message: 'matchKey is required.' })
            break
          }
          handleKeyJoin(meta, payload.matchKey)
          break
        }
        case 'spectate:join': {
          if (!payload || typeof payload.matchKey !== 'string') {
            send(socket, 'error', { message: 'matchKey is required.' })
            break
          }
          handleSpectateJoin(meta, payload.matchKey)
          break
        }
        case 'move': {
          if (!payload || typeof payload.index !== 'number') {
            send(socket, 'error', { message: 'index is required.' })
            break
          }
          handleMove(meta, payload.index)
          break
        }
        case 'leave':
          handleLeave(meta)
          break
        default:
          send(socket, 'error', { message: `Unknown message type: ${type}` })
      }
    } catch (error) {
      console.error('Failed to process message', error)
      send(socket, 'error', { message: 'Malformed message.' })
    }
  })

  socket.on('close', () => {
    clientsBySocket.delete(socket)
    if (meta?.disconnectTimer) {
      return
    }
    meta.disconnectTimer = setTimeout(() => {
      meta.disconnectTimer = null
      handleLeave(meta)
      clientsById.delete(meta.id)
    }, DISCONNECT_GRACE_MS)
  })
})

const timeoutSweepInterval = Math.min(5000, Math.max(1000, Math.floor(TURN_TIMEOUT_MS / 6)))
setInterval(() => {
  const now = Date.now()
  const expiredRooms: RoomState[] = []
  for (const room of rooms.values()) {
    if (room.status === 'playing' && room.turnDeadline && room.turnDeadline <= now) {
      expiredRooms.push(room)
    }
  }
  expiredRooms.forEach((room) => handleTimeout(room))
}, timeoutSweepInterval)

httpServer.listen(PORT, () => {
  console.log(`Matchmaking server listening on port ${PORT}`)
})
