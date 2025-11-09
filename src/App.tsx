import type { ChangeEvent, FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  applyMove,
  computeValidMoves,
  countDisks,
  createInitialBoard,
  DISK_LABEL,
  nextDisk,
  type Cell,
  type Disk,
  type MoveMap,
} from './lib/othello'
import useOnlineMatch, { DEFAULT_MATCH_SERVER_URL } from './hooks/useOnlineMatch'

const BOARD_INDICES = Array.from({ length: 64 }, (_, index) => index)
type GameMode = 'local' | 'online'

const CONNECTION_LABEL: Record<'disconnected' | 'connecting' | 'open' | 'error', string> = {
  disconnected: '未接続',
  connecting: '接続中…',
  open: '接続済み',
  error: 'エラー',
}

const PHASE_LABEL: Record<'idle' | 'queue' | 'waiting' | 'active' | 'spectating', string> = {
  idle: '待機',
  queue: 'ランダム検索中',
  waiting: 'キー待機中',
  active: '対局中',
  spectating: '観戦中',
}

function App() {
  const [board, setBoard] = useState<Cell[]>(() => createInitialBoard())
  const [currentDisk, setCurrentDisk] = useState<Disk>('B')
  const [lastMove, setLastMove] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState('Black to move first.')
  const [mode, setMode] = useState<GameMode>('local')
  const isOnlineMode = mode === 'online'
  const [matchKeyInput, setMatchKeyInput] = useState('')
  const [serverUrl, setServerUrl] = useState(DEFAULT_MATCH_SERVER_URL)
  const [serverUrlInput, setServerUrlInput] = useState(DEFAULT_MATCH_SERVER_URL)
  const [serverUrlError, setServerUrlError] = useState<string | null>(null)
  const [serverSettingsCollapsed, setServerSettingsCollapsed] = useState(false)
  const [onlinePanelCollapsed, setOnlinePanelCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('matchServerUrl')
    if (stored) {
      setServerUrl(stored)
      setServerUrlInput(stored)
    }
  }, [])

  const online = useOnlineMatch({ enabled: isOnlineMode, serverUrl })
  const {
    connectionState: onlineConnectionState,
    phase: onlinePhase,
    queueSearching,
    waitingInfo,
    promptSpectateKey,
    matchState: remoteState,
    role: onlineRole,
    yourDisk: onlineDisk,
    lastError: onlineError,
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
    serverUrl: resolvedServerUrl,
  } = online
  const previousPhaseRef = useRef(onlinePhase)

  const validMoves = useMemo<MoveMap>(
    () => computeValidMoves(board, currentDisk),
    [board, currentDisk],
  )

  const upcomingMoves = useMemo(
    () => computeValidMoves(board, nextDisk(currentDisk)),
    [board, currentDisk],
  )

  const scores = useMemo(() => countDisks(board), [board])
  const isGameOver = validMoves.size === 0 && upcomingMoves.size === 0

  const insightMessage = useMemo(() => {
    if (isGameOver) {
      if (scores.B === scores.W) return 'The duel ends in a stalemate.'
      const winner = scores.B > scores.W ? 'B' : 'W'
      return `${DISK_LABEL[winner]} controls the final board.`
    }

    if (validMoves.size === 0) {
      return `${DISK_LABEL[currentDisk]} cannot move and must pass.`
    }

    const moveWord = validMoves.size === 1 ? 'move' : 'moves'
    return `${validMoves.size} ${moveWord} available for ${DISK_LABEL[currentDisk]}.`
  }, [currentDisk, isGameOver, scores, validMoves])

  const resetGame = useCallback(() => {
    setBoard(createInitialBoard())
    setCurrentDisk('B')
    setLastMove(null)
    setStatusMessage('New game started. Black to move.')
  }, [])

  const handleLocalCellClick = useCallback(
    (index: number) => {
      const flips = validMoves.get(index)
      if (!flips || isGameOver) return

      setBoard((prev) => applyMove(prev, index, currentDisk, flips))
      setCurrentDisk((prev) => nextDisk(prev))
      setLastMove(index)
    },
    [currentDisk, isGameOver, validMoves],
  )

  useEffect(() => {
    if (isGameOver) {
      if (scores.B === scores.W) {
        setStatusMessage("Game over - it's a tie!")
      } else {
        const winner = scores.B > scores.W ? 'B' : 'W'
        setStatusMessage(
          `${DISK_LABEL[winner]} wins ${scores.B}-${scores.W}. Great match!`,
        )
      }
      return
    }

    if (validMoves.size === 0) {
      setStatusMessage(`${DISK_LABEL[currentDisk]} has no moves. Passing turn.`)
      setCurrentDisk((prev) => nextDisk(prev))
      return
    }

    setStatusMessage(`${DISK_LABEL[currentDisk]} to move.`)
  }, [currentDisk, isGameOver, scores, validMoves])

  const defaultOnlineBoard = useMemo(() => createInitialBoard(), [])
  const defaultOnlineScores = useMemo(() => countDisks(defaultOnlineBoard), [defaultOnlineBoard])

  const connectionHint = useMemo(() => {
    switch (onlineConnectionState) {
      case 'connecting':
        return 'サーバーに接続しています…'
      case 'error':
        return 'サーバー接続でエラーが発生しました。'
      case 'open':
        return 'オンライン対戦を開始できます。'
      default:
        return '接続待機中です。オンラインパネルで試合を開始してください。'
    }
  }, [onlineConnectionState])

  const effectiveBoard = isOnlineMode
    ? remoteState?.board ?? defaultOnlineBoard
    : board
  const effectiveScores = isOnlineMode
    ? remoteState?.scores ?? defaultOnlineScores
    : scores
  const effectiveCurrentDisk = isOnlineMode
    ? remoteState?.currentDisk ?? 'B'
    : currentDisk
  const effectiveLastMove = isOnlineMode
    ? remoteState?.lastMove ?? null
    : lastMove
  const effectiveStatusMessage = isOnlineMode
    ? remoteState?.statusMessage ?? connectionHint
    : statusMessage
  const effectiveGameOver = isOnlineMode ? Boolean(remoteState?.winner) : isGameOver

  const remoteValidMoves = useMemo<MoveMap>(() => {
    if (!remoteState) return new Map()
    return computeValidMoves(remoteState.board, remoteState.currentDisk)
  }, [remoteState])

  const defaultOnlineMoves = useMemo<MoveMap>(
    () => computeValidMoves(defaultOnlineBoard, 'B'),
    [defaultOnlineBoard],
  )

  const displayedValidMoves = useMemo<MoveMap>(() => {
    if (isOnlineMode) {
      return remoteState ? remoteValidMoves : defaultOnlineMoves
    }
    return validMoves
  }, [defaultOnlineMoves, isOnlineMode, remoteState, remoteValidMoves, validMoves])

  const displayInsightNote = isOnlineMode
    ? remoteState?.statusMessage ?? connectionHint
    : insightMessage
  const currentMatchKey = remoteState?.matchKey ?? waitingInfo?.matchKey ?? ''
  const connectionLabel = CONNECTION_LABEL[onlineConnectionState]
  const phaseLabel = PHASE_LABEL[onlinePhase]

  const roleLabel = (() => {
    if (onlineRole === 'spectator') return '観戦モード'
    if (onlineRole === 'player' && onlineDisk) {
      return `${DISK_LABEL[onlineDisk]} プレイヤー`
    }
    return '未参加'
  })()

  const showFriendlyTurnCopy =
    isOnlineMode && !!remoteState && onlineRole === 'player' && !!onlineDisk
  const friendlyDiskLabel =
    showFriendlyTurnCopy && remoteState ? DISK_LABEL[remoteState.currentDisk] : null
  const turnChipText =
    showFriendlyTurnCopy && remoteState
      ? remoteState.currentDisk === onlineDisk
        ? 'あなたの番です'
        : '相手の番です'
      : DISK_LABEL[effectiveCurrentDisk]
  const turnChipNote =
    showFriendlyTurnCopy && friendlyDiskLabel ? `(${friendlyDiskLabel})` : null

  const canPlayOnline =
    isOnlineMode &&
    !!remoteState &&
    onlineRole === 'player' &&
    !!onlineDisk &&
    onlineDisk === remoteState.currentDisk &&
    !remoteState.winner &&
    onlineConnectionState === 'open'

  const handleCellClick = useCallback(
    (index: number) => {
      if (mode === 'online') {
        if (!remoteState || !canPlayOnline) return
        if (!remoteValidMoves.has(index)) return
        sendMove(index)
        return
      }
      handleLocalCellClick(index)
    },
    [canPlayOnline, handleLocalCellClick, mode, remoteState, remoteValidMoves, sendMove],
  )

  const handleModeChange = (next: GameMode) => {
    setMode(next)
  }

  const handleKeyInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.toUpperCase()
    setMatchKeyInput(raw.replace(/[^A-Z0-9]/g, ''))
  }

  const handleJoinByKey = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    joinByKey(matchKeyInput)
  }

  const handleSpectateByKey = () => {
    spectateByKey(matchKeyInput)
  }

  const handleServerUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setServerUrlInput(event.target.value)
  }

  const persistServerUrl = (value: string) => {
    setServerUrl(value)
    if (typeof window === 'undefined') return
    if (value === DEFAULT_MATCH_SERVER_URL) {
      window.localStorage.removeItem('matchServerUrl')
    } else {
      window.localStorage.setItem('matchServerUrl', value)
    }
  }

  const applyServerUrl = () => {
    const trimmed = serverUrlInput.trim()
    if (!/^wss?:\/\//i.test(trimmed)) {
      setServerUrlError('ws:// または wss:// で始まる URL を入力してください。')
      setServerSettingsCollapsed(false)
      return
    }
    setServerUrlError(null)
    persistServerUrl(trimmed)
  }

  const handleServerUrlSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    applyServerUrl()
  }

  const handleServerUrlReset = () => {
    setServerUrlInput(DEFAULT_MATCH_SERVER_URL)
    setServerUrlError(null)
    persistServerUrl(DEFAULT_MATCH_SERVER_URL)
  }

  const leaveButtonDisabled =
    !remoteState && !queueSearching && !waitingInfo && onlinePhase === 'idle'

  useEffect(() => {
    const previousPhase = previousPhaseRef.current
    if (!isOnlineMode) {
      setServerSettingsCollapsed(false)
      setOnlinePanelCollapsed(false)
    } else {
      if (onlinePhase === 'active' && previousPhase !== 'active') {
        setServerSettingsCollapsed(true)
        setOnlinePanelCollapsed(true)
      }

      if (onlinePhase !== 'active' && serverSettingsCollapsed) {
        setServerSettingsCollapsed(false)
      }

      if (onlinePhase !== 'active' && previousPhase === 'active') {
        setOnlinePanelCollapsed(false)
      }
    }

    previousPhaseRef.current = onlinePhase
  }, [isOnlineMode, onlinePhase, serverSettingsCollapsed])

  const toggleServerSettings = () => {
    setServerSettingsCollapsed((prev) => !prev)
  }

  const toggleOnlinePanel = () => {
    setOnlinePanelCollapsed((prev) => !prev)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Pure Browser Play</p>
          <h1>Othello Showdown</h1>
          <p className="lede">ローカル or オンラインで即席オセロ対戦。キー共有と観戦にも対応しました。</p>
        </div>

        <div className="header-controls">
          <div className="mode-toggle" role="group" aria-label="ゲームモード切り替え">
            <button
              type="button"
              className={mode === 'local' ? 'active' : ''}
              aria-pressed={mode === 'local'}
              onClick={() => handleModeChange('local')}
            >
              ローカル
            </button>
            <button
              type="button"
              className={mode === 'online' ? 'active' : ''}
              aria-pressed={mode === 'online'}
              onClick={() => handleModeChange('online')}
            >
              オンライン
            </button>
          </div>

          {mode === 'local' ? (
            <button className="ghost" type="button" onClick={resetGame}>
              ローカル局をリセット
            </button>
          ) : (
            <button
              className="ghost"
              type="button"
              onClick={leaveSession}
              disabled={leaveButtonDisabled}
            >
              オンラインから退出
            </button>
          )}
        </div>
      </header>

      {isOnlineMode && (
        <section className={`online-panel ${onlinePanelCollapsed ? 'collapsed' : ''}`}>
          <div className="online-panel-head">
            <div>
              <p className="label">オンラインコントロール</p>
              <p className="panel-summary">
                {connectionLabel} / {phaseLabel} ・ {roleLabel} ・{' '}
                {currentMatchKey || 'キー未発行'}
              </p>
            </div>
            <button
              type="button"
              className="panel-toggle"
              onClick={toggleOnlinePanel}
              aria-expanded={!onlinePanelCollapsed}
            >
              {onlinePanelCollapsed ? '開く' : '折りたたむ'}
            </button>
          </div>

          <div className="online-panel-body">
            <div className="online-topline">
              <div>
                <p className="label">接続状態</p>
                <p className={`pill ${onlineConnectionState}`}>{connectionLabel}</p>
            </div>
            <div>
              <p className="label">モード</p>
              <p className="pill subtle">{phaseLabel}</p>
            </div>
            <div>
              <p className="label">あなたの役割</p>
              <p className="pill subtle">{roleLabel}</p>
            </div>
            <div>
              <p className="label">現在のキー</p>
              <p className="inline-code">{currentMatchKey || '---'}</p>
            </div>
          </div>

          <div className="online-actions">
            <div>
              <p className="label">ランダムマッチ</p>
              <div className="action-grid">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startRandomMatch}
                  disabled={queueSearching || onlinePhase === 'active'}
                >
                  ランダム開始
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cancelRandomMatch}
                  disabled={!queueSearching}
                >
                  キャンセル
                </button>
              </div>
            </div>

            <div>
              <p className="label">フレンド対戦</p>
              <div className="action-grid">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={createKeyMatch}
                  disabled={Boolean(waitingInfo) || onlinePhase === 'active'}
                >
                  新しいキーを発行
                </button>
                {waitingInfo && (
                  <p className="helper-text">
                    共有キー <span className="inline-code">{waitingInfo.matchKey}</span> / あなたは
                    {DISK_LABEL[waitingInfo.yourDisk]}
                  </p>
                )}
              </div>
            </div>
          </div>

          <form className="key-form" onSubmit={handleJoinByKey}>
            <label className="label" htmlFor="match-key-input">
              マッチングキー
            </label>
            <input
              id="match-key-input"
              className="key-input"
              value={matchKeyInput}
              onChange={handleKeyInputChange}
              placeholder="例: Q2M9ZK"
              autoComplete="off"
            />
            <div className="action-grid">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={onlineConnectionState !== 'open'}
              >
                キーで参加
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSpectateByKey}
                disabled={onlineConnectionState !== 'open'}
              >
                観戦する
              </button>
            </div>
          </form>

            {promptSpectateKey && (
              <div className="prompt-card">
                <p>この部屋は満員です。観戦モードに切り替えますか？ (キー: {promptSpectateKey})</p>
                <div className="action-grid">
                  <button type="button" className="btn btn-primary" onClick={acceptSpectatePrompt}>
                    観戦する
                </button>
                <button type="button" className="btn btn-secondary" onClick={declineSpectatePrompt}>
                  やめておく
                </button>
              </div>
            </div>
          )}

            <div className="online-footer">
              <div className={`server-settings ${serverSettingsCollapsed ? 'collapsed' : ''}`}>
                <div className="server-settings-head">
                  <div>
                    <p className="label">サーバー情報</p>
                    <p className="server-summary">
                      現在の接続先: <span className="inline-code">{resolvedServerUrl}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="server-settings-toggle"
                    onClick={toggleServerSettings}
                    aria-expanded={!serverSettingsCollapsed}
                  >
                    {serverSettingsCollapsed ? '開く' : '折りたたむ'}
                  </button>
                </div>

                {!serverSettingsCollapsed && (
                  <>
                    <form className="server-url-form" onSubmit={handleServerUrlSubmit}>
                      <label className="label" htmlFor="server-url-input">
                        マッチングサーバー URL
                      </label>
                      <div className="server-url-row">
                        <input
                          id="server-url-input"
                          className="server-url-input"
                          value={serverUrlInput}
                          onChange={handleServerUrlChange}
                          placeholder="ws://example.com:8787"
                          autoComplete="off"
                        />
                        <button type="submit" className="btn btn-primary">
                          更新
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleServerUrlReset}
                          disabled={
                            serverUrl === DEFAULT_MATCH_SERVER_URL &&
                            serverUrlInput === DEFAULT_MATCH_SERVER_URL
                          }
                        >
                          既定値
                        </button>
                      </div>
                      <p className="helper-text">更新するとブラウザに保存されます。</p>
                      {serverUrlError && <p className="error-text">{serverUrlError}</p>}
                    </form>
                    <div className="action-grid">
                      <button type="button" className="btn btn-secondary" onClick={reconnect}>
                        再接続を試す
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {onlineError && <p className="error-text">{onlineError}</p>}
          </div>
        </section>
      )}

      <div className="play-area">
        <section className="status-panel">
          <div className="turn-card">
            <p className="label">現在のターン</p>
            <p className={`turn-chip ${effectiveCurrentDisk === 'B' ? 'black' : 'white'}`}>
              <span>{turnChipText}</span>
              {turnChipNote && <span className="turn-chip-note">{turnChipNote}</span>}
            </p>
          </div>

          <div className="scores">
            <div className="score-line black">
              <span>Black</span>
              <strong>{effectiveScores.B}</strong>
            </div>
            <div className="score-line white">
              <span>White</span>
              <strong>{effectiveScores.W}</strong>
            </div>
          </div>

          <p className="status-note">{displayInsightNote}</p>
        </section>

        <section className="board-wrapper">
          <div className="board" role="grid" aria-label="Othello board">
            {BOARD_INDICES.map((index) => {
              const cell = effectiveBoard[index]
              const isValid = displayedValidMoves.has(index)
              const isLast = index === effectiveLastMove
              const cellClasses = ['cell']

              if (cell === 'B') cellClasses.push('black')
              if (cell === 'W') cellClasses.push('white')
              if (isValid && !cell && !effectiveGameOver) cellClasses.push('valid')
              if (isLast) cellClasses.push('recent')

              const row = Math.floor(index / 8) + 1
              const column = (index % 8) + 1
              const ariaLabelParts = [`Row ${row}, Column ${column}`]
              if (cell) ariaLabelParts.push(`${DISK_LABEL[cell]} piece`)
              else if (isValid && !effectiveGameOver) ariaLabelParts.push('valid move')

              const disableCell =
                effectiveGameOver ||
                Boolean(cell) ||
                !isValid ||
                (isOnlineMode && (!remoteState || !canPlayOnline))

              return (
                <button
                  key={index}
                  type="button"
                  role="gridcell"
                  aria-label={ariaLabelParts.join(' - ')}
                  className={cellClasses.join(' ')}
                  onClick={() => handleCellClick(index)}
                  disabled={disableCell}
                >
                  {cell && <span className="disc" aria-hidden />}
                  {!cell && isValid && !effectiveGameOver && <span className="valid-dot" />}
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <p className="status-message" role="status">
        {effectiveStatusMessage}
      </p>
    </main>
  )
}

export default App
