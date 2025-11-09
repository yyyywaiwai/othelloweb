import { useCallback, useEffect, useRef } from 'react'

type BrowserAudioContext = AudioContext | null

const resolveAudioContext = (): typeof AudioContext | null => {
  if (typeof window === 'undefined') return null
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  )
}

type Tone = {
  frequency: number
  duration: number
  type?: OscillatorType
}

const useMatchAudioCues = () => {
  const audioContextRef = useRef<BrowserAudioContext>(null)

  const ensureContext = useCallback(() => {
    const AudioContextCtor = resolveAudioContext()
    if (!AudioContextCtor) return null
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor()
    }
    return audioContextRef.current
  }, [])

  const playSequence = useCallback((tones: Tone[]) => {
    const context = ensureContext()
    if (!context) return

    if (context.state === 'suspended') {
      context.resume().catch(() => {
        // Ignore resume errors; playback simply won't occur
      })
    }

    let startTime = context.currentTime
    tones.forEach(({ frequency, duration, type = 'triangle' }) => {
      const oscillator = context.createOscillator()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, startTime)

      const gain = context.createGain()
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

      oscillator.connect(gain)
      gain.connect(context.destination)

      oscillator.start(startTime)
      oscillator.stop(startTime + duration)

      startTime += duration + 0.04
    })
  }, [ensureContext])

  const playMatchReadySound = useCallback(() => {
    playSequence([
      { frequency: 1175, duration: 0.25 },
      { frequency: 1568, duration: 0.32 },
    ])
  }, [playSequence])

  const playYourTurnSound = useCallback(() => {
    playSequence([{ frequency: 932, duration: 0.4, type: 'sine' }])
  }, [playSequence])

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Silently ignore failures when closing the context on unmount
        })
        audioContextRef.current = null
      }
    }
  }, [])

  return { playMatchReadySound, playYourTurnSound }
}

export default useMatchAudioCues
