import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInitialBoard,
  countDisks,
  type Cell,
  type Disk,
} from '../lib/othello'

type Winner = Disk | 'draw' | null

type ConnectionState = 'disconnected' | 'connecting' | 'open' | 'error'

type OnlinePhase = 'idle' | 'queue' | 'waiting' | 'active' | 'spectating'

interface ServerMessage {
  type: string
  payload?: Record<string, unknown>
}

export interface RemoteState {
  matchKey: string
  board: Cell[]
  currentDisk: Disk
  lastMove: number | null
  scores: Record<Disk, number>
  spectators: number
  statusMessage: string
  winner: Winner
}

interface UseOnlineMatchOptions {
  enabled: boolean
  serverUrl?: string
}

interface WaitingInfo {
  matchKey: string
  yourDisk: Disk
}

export interface UseOnlineMatchResult {
  connectionState: ConnectionState
  phase: OnlinePhase
  queueSearching: boolean
  waitingInfo: WaitingInfo | null
  promptSpectateKey: string | null
  matchState: RemoteState | null
  role: 'player' | 'spectator' | null
  yourDisk: Disk | null
  lastError: string | null
  startRandomMatch: () => void
  cancelRandomMatch: () => void
  createKeyMatch: () => void
  joinByKey: (key: string) => void
  spectateByKey: (key: string) => void
  acceptSpectatePrompt: () => void
  declineSpectatePrompt: () => void
  sendMove: (index: number) => void
  leaveSession: () => void
  reconnect: () => void
  serverUrl: string
}

export const DEFAULT_MATCH_SERVER_URL =
  import.meta.env.VITE_MATCH_SERVER_URL ?? 'ws://localhost:8787'

const normalizeKey = (input: string) =>
  input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const buildWaitingState = (matchKey: string, message: string): RemoteState => {
  const board = createInitialBoard()
  return {
    matchKey,
    board,
    currentDisk: 'B',
    lastMove: null,
    scores: countDisks(board),
    spectators: 0,
    statusMessage: message,
    winner: null,
  }
}

const useOnlineMatch = ({
  enabled,
  serverUrl = DEFAULT_MATCH_SERVER_URL,
}: UseOnlineMatchOptions): UseOnlineMatchResult => {
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(false)

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [matchState, setMatchState] = useState<RemoteState | null>(null)
  const [role, setRole] = useState<'player' | 'spectator' | null>(null)
  const [yourDisk, setYourDisk] = useState<Disk | null>(null)
  const [queueSearching, setQueueSearching] = useState(false)
  const [waitingInfo, setWaitingInfo] = useState<WaitingInfo | null>(null)
  const [promptSpectateKey, setPromptSpectateKey] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const resetSession = useCallback(() => {
    setMatchState(null)
    setRole(null)
    setYourDisk(null)
    setQueueSearching(false)
    setWaitingInfo(null)
    setPromptSpectateKey(null)
  }, [])

  const cleanupSocket = useCallback(() => {
    if (typeof window !== 'undefined' && reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (socketRef.current) {
      socketRef.current.onopen = null
      socketRef.current.onmessage = null
      socketRef.current.onclose = null
      socketRef.current.onerror = null
      try {
        socketRef.current.close()
      } catch (error) {
        console.warn('Failed to close socket', error)
      }
      socketRef.current = null
    }
  }, [])

  const handleServerMessage = useCallback((event: MessageEvent) => {
    try {
      const incoming = JSON.parse(event.data as string) as ServerMessage
      const payload = incoming.payload ?? {}
      switch (incoming.type) {
        case 'hello':
          setConnectionState('open')
          setLastError(null)
          break
        case 'queue:status':
          setQueueSearching(Boolean(payload.searching))
          break
        case 'match:waiting':
          if (typeof payload.matchKey === 'string' && typeof payload.yourDisk === 'string') {
            const disk = payload.yourDisk as Disk
            setWaitingInfo({ matchKey: payload.matchKey, yourDisk: disk })
            setRole('player')
            setYourDisk(disk)
            setMatchState(buildWaitingState(payload.matchKey, '相手の接続を待機中…'))
          }
          break
        case 'match:start':
          if (payload.state) {
            setMatchState(payload.state as RemoteState)
          }
          setRole(payload.youAre === 'spectator' ? 'spectator' : 'player')
          setYourDisk(typeof payload.yourDisk === 'string' ? (payload.yourDisk as Disk) : null)
          setWaitingInfo(null)
          setQueueSearching(false)
          setPromptSpectateKey(null)
          break
        case 'match:update':
          if (payload.state) {
            setMatchState(payload.state as RemoteState)
          }
          break
        case 'match:end':
          if (payload.state) {
            setMatchState(payload.state as RemoteState)
          }
          setRole(null)
          setYourDisk(null)
          setWaitingInfo(null)
          setQueueSearching(false)
          setPromptSpectateKey(null)
          break
        case 'prompt:spectate':
          if (typeof payload.matchKey === 'string') {
            setPromptSpectateKey(payload.matchKey)
          }
          break
        case 'error':
          if (typeof payload.message === 'string') {
            setLastError(payload.message)
          }
          break
        default:
          break
      }
    } catch (error) {
      console.warn('Failed to parse server message', error)
      setLastError('サーバー応答の解析に失敗しました。')
    }
  }, [])

  const connectSocket = useCallback(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (socketRef.current) {
      const state = socketRef.current.readyState
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return
    }

    setConnectionState('connecting')
    setLastError(null)

    try {
      const ws = new WebSocket(serverUrl)
      socketRef.current = ws

      ws.onopen = () => {
        setConnectionState('open')
      }

      ws.onmessage = handleServerMessage

      ws.onerror = () => {
        setConnectionState('error')
        setLastError('サーバーとの通信でエラーが発生しました。')
      }

      ws.onclose = () => {
        socketRef.current = null
        setConnectionState('disconnected')
        resetSession()
        if (shouldReconnectRef.current && typeof window !== 'undefined') {
          reconnectTimerRef.current = window.setTimeout(() => {
            connectSocket()
          }, 1500)
        }
      }
    } catch (error) {
      console.error('WebSocket connection failed', error)
      setConnectionState('error')
      setLastError('サーバーに接続できませんでした。')
    }
  }, [enabled, handleServerMessage, resetSession, serverUrl])

  useEffect(() => {
    shouldReconnectRef.current = enabled
    if (enabled) {
      connectSocket()
    } else {
      cleanupSocket()
      resetSession()
      setConnectionState('disconnected')
    }

    return () => {
      cleanupSocket()
    }
  }, [cleanupSocket, connectSocket, enabled, resetSession])

  const sendMessage = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setLastError('サーバーに接続できていません。')
        return
      }
      socket.send(JSON.stringify({ type, payload }))
    },
    [],
  )

  const startRandomMatch = useCallback(() => {
    sendMessage('random:join')
  }, [sendMessage])

  const cancelRandomMatch = useCallback(() => {
    sendMessage('random:cancel')
  }, [sendMessage])

  const createKeyMatch = useCallback(() => {
    sendMessage('key:create')
  }, [sendMessage])

  const joinByKey = useCallback(
    (rawKey: string) => {
      const key = normalizeKey(rawKey)
      if (!key) {
        setLastError('マッチングキーを入力してください。')
        return
      }
      sendMessage('key:join', { matchKey: key })
    },
    [sendMessage],
  )

  const spectateByKey = useCallback(
    (rawKey: string) => {
      const key = normalizeKey(rawKey)
      if (!key) {
        setLastError('観戦したいキーを入力してください。')
        return
      }
      sendMessage('spectate:join', { matchKey: key })
    },
    [sendMessage],
  )

  const acceptSpectatePrompt = useCallback(() => {
    if (!promptSpectateKey) return
    spectateByKey(promptSpectateKey)
    setPromptSpectateKey(null)
  }, [promptSpectateKey, spectateByKey])

  const declineSpectatePrompt = useCallback(() => {
    setPromptSpectateKey(null)
  }, [])

  const sendMove = useCallback(
    (index: number) => {
      sendMessage('move', { index })
    },
    [sendMessage],
  )

  const leaveSession = useCallback(() => {
    sendMessage('leave')
    resetSession()
  }, [resetSession, sendMessage])

  const reconnect = useCallback(() => {
    cleanupSocket()
    connectSocket()
  }, [cleanupSocket, connectSocket])

  const phase = useMemo<OnlinePhase>(() => {
    if (!enabled) return 'idle'
    if (queueSearching) return 'queue'
    if (waitingInfo) return 'waiting'
    if (matchState) {
      if (role === 'spectator') return 'spectating'
      if (role === 'player' && !matchState.winner) return 'active'
    }
    return 'idle'
  }, [enabled, matchState, queueSearching, role, waitingInfo])

  return {
    connectionState,
    phase,
    queueSearching,
    waitingInfo,
    promptSpectateKey,
    matchState,
    role,
    yourDisk,
    lastError,
    startRandomMatch,
    cancelRandomMatch,
    createKeyMatch,
    joinByKey,
    spectateByKey,
    acceptSpectatePrompt,
    declineSpectatePrompt,
    sendMove,
    leaveSession,
    reconnect,
    serverUrl,
  }
}

export default useOnlineMatch
