'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Loader2,
  Subtitles,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────
interface VideoPlayerProps {
  /** API stream URL for the video file. */
  src: string
  /** Title to show in the overlay. */
  title: string
}

interface TrackInfo {
  index: number
  label: string
  language: string
  kind: string
}

const AUTO_HIDE_MS = 3500

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ss = sec < 10 ? `0${sec}` : `${sec}`
  if (h > 0) {
    const mm = m < 10 ? `0${m}` : `${m}`
    return `${h}:${mm}:${ss}`
  }
  return `${m}:${ss}`
}

export function VideoPlayer({ src, title }: VideoPlayerProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([])
  const [activeAudioTrack, setActiveAudioTrack] = useState(0)
  const [showTrackMenu, setShowTrackMenu] = useState(false)
  const [buffered, setBuffered] = useState(0)

  // ── Auto-hide overlay ─────────────────────────────────
  const resetHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setOverlayVisible(true)
    hideTimer.current = setTimeout(() => {
      if (playing && !showTrackMenu) setOverlayVisible(false)
    }, AUTO_HIDE_MS)
  }, [playing, showTrackMenu])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [resetHideTimer])

  // ── Video event handlers ──────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTime = () => {
      setCurrentTime(v.currentTime)
      if (v.buffered.length > 0) {
        setBuffered((v.buffered.end(v.buffered.length - 1) / (v.duration || 1)) * 100)
      }
    }
    const onDuration = () => setDuration(v.duration)
    const onPlay = () => { setPlaying(true); setLoading(false); setError(null) }
    const onPause = () => setPlaying(false)
    const onWaiting = () => setLoading(true)
    const onCanPlay = () => { setLoading(false); setError(null) }
    const onError = () => {
      setLoading(false)
      const mediaErr = v.error
      if (mediaErr) {
        switch (mediaErr.code) {
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            setError('This video format is not supported by your browser.')
            break
          case MediaError.MEDIA_ERR_NETWORK:
            setError('Network error while loading the video.')
            break
          default:
            setError(`Playback error (code ${mediaErr.code})`)
        }
      }
    }

    // Detect audio tracks when available
    const onLoadedMetadata = () => {
      const audioTrackList = (v as unknown as { audioTracks?: { length: number; [i: number]: { label: string; language: string; kind: string; enabled: boolean } } }).audioTracks
      if (audioTrackList && audioTrackList.length > 0) {
        const tracks: TrackInfo[] = []
        for (let i = 0; i < audioTrackList.length; i++) {
          tracks.push({
            index: i,
            label: audioTrackList[i].label || `Track ${i + 1}`,
            language: audioTrackList[i].language || 'unknown',
            kind: audioTrackList[i].kind,
          })
        }
        setAudioTracks(tracks)
      }
    }

    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('error', onError)
    v.addEventListener('loadedmetadata', onLoadedMetadata)

    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDuration)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('error', onError)
      v.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [])

  // ── Controls ──────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }, [])

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    setVolume(val)
    if (val > 0 && v.muted) {
      v.muted = false
      setMuted(false)
    }
  }, [])

  const skip = useCallback((seconds: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.currentTime + seconds, v.duration || 0))
  }, [])

  const seek = useCallback((pct: number) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    v.currentTime = (pct / 100) * v.duration
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
          skip(-10)
          break
        case 'ArrowRight':
        case 'l':
          skip(10)
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(Math.min(1, volume + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(Math.max(0, volume - 0.1))
          break
        case 'm':
          toggleMute()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'Escape':
          if (showTrackMenu) setShowTrackMenu(false)
          else if (document.fullscreenElement) document.exitFullscreen()
          else router.back()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, toggleMute, toggleFullscreen, skip, changeVolume, volume, router, showTrackMenu])

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      onMouseMove={resetHideTimer}
      onClick={(e) => {
        if (e.target === videoRef.current || (e.target as HTMLElement).dataset.videoArea) {
          togglePlay()
        }
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
        playsInline
        preload="auto"
        autoPlay
      />

      {/* Loading spinner */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-12 w-12 animate-spin text-white/60" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-white/80 text-base">{error}</p>
            <p className="text-white/40 text-xs">
              MKV files with HEVC codec may require transmuxing. The video will stream through ffmpeg automatically.
            </p>
            <button
              onClick={() => { setError(null); videoRef.current?.load() }}
              className="rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Top overlay ──────────────────────────────────── */}
      <div
        className={`absolute inset-x-0 top-0 z-50 flex items-center gap-3 px-4 py-3 transition-all duration-300 ${
          overlayVisible
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
      >
        <button
          onClick={() => router.back()}
          className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="truncate text-sm font-medium text-white/90">{title}</h2>
      </div>

      {/* ── Bottom overlay (controls) ────────────────────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-50 space-y-2 px-4 pb-4 pt-8 transition-all duration-300 ${
          overlayVisible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}
      >
        {/* Progress bar */}
        <div className="group relative h-1.5 cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          seek(((e.clientX - rect.left) / rect.width) * 100)
        }}>
          <div className="absolute inset-0 rounded-full bg-white/20" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${buffered}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-red-500"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={togglePlay}
              className="rounded-full p-2 text-white hover:bg-white/10 transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button
              onClick={() => skip(-10)}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Rewind 10s"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() => skip(10)}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Forward 10s"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button
                onClick={toggleMute}
                className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-0 group-hover/vol:w-20 transition-all duration-200 h-1 appearance-none rounded-full bg-white/20 accent-white cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                aria-label="Volume"
              />
            </div>

            <span className="ml-2 text-xs tabular-nums text-white/70">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Audio tracks button */}
            {audioTracks.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowTrackMenu(!showTrackMenu)}
                  className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Audio tracks"
                >
                  <Subtitles className="h-5 w-5" />
                </button>
                {showTrackMenu && (
                  <div className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-lg bg-black/90 border border-white/10 py-1 shadow-2xl">
                    <p className="px-3 py-1 text-xs text-white/40 uppercase tracking-wider">Audio</p>
                    {audioTracks.map((t) => (
                      <button
                        key={t.index}
                        onClick={() => {
                          setActiveAudioTrack(t.index)
                          setShowTrackMenu(false)
                        }}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                          activeAudioTrack === t.index
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {t.label} ({t.language})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
