'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Hls from 'hls.js'
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
  AudioLines,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  videoStreamURL,
  hlsPlaylistURL,
  subtitleURL,
  type VideoMediaInfo,
  type VideoTrackInfo,
} from '@/lib/reader'

interface VideoPlayerProps {
  /** File ID — the player builds stream + subtitle URLs from this. */
  fileId: string
  /** Title to show in the overlay. */
  title: string
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

function labelFor(t: VideoTrackInfo): string {
  if (t.title && t.language) return `${t.language.toUpperCase()} · ${t.title}`
  if (t.title) return t.title
  if (t.language) return t.language.toUpperCase()
  return `Track ${t.index}`
}

const SUB_OFF = -1 // sentinel for "subtitles disabled"

export function VideoPlayer({ fileId, title }: VideoPlayerProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Saved when the user switches audio so we can seek back after the reload.
  const resumeTimeRef = useRef<number>(0)

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buffered, setBuffered] = useState(0)
  const [activeAudio, setActiveAudio] = useState<number | undefined>(undefined)
  const [activeSubtitle, setActiveSubtitle] = useState<number>(SUB_OFF)
  const [openMenu, setOpenMenu] = useState<'audio' | 'subs' | null>(null)

  // ── Probe (audio + subtitle tracks) ───────────────────
  const tracksQuery = useQuery<VideoMediaInfo>({
    queryKey: ['video-probe', fileId],
    queryFn: async () => (await api.get<VideoMediaInfo>(`/probe/${fileId}`)).data,
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 503) return failureCount < 10
      return failureCount < 1
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  })
  const audioTracks = tracksQuery.data?.audio ?? []
  const subtitleTracks = tracksQuery.data?.subtitles ?? []

  // Video stream strategy depends on the source codec (from /probe):
  //  • H.264 8-bit  → transcode=false → single seekable MP4 (warm-up poll).
  //  • HEVC/10-bit/… → transcode=true  → on-demand HLS via hls.js.
  const transcode = tracksQuery.data?.transcode ?? false
  const infoReady = tracksQuery.isSuccess

  // playableSrc drives the <video src> for the MP4 path and Safari's native
  // HLS; for hls.js (MSE) it stays null and the Hls instance feeds the element.
  const [playableSrc, setPlayableSrc] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  // ── MP4 warm-up poll (H.264) ──────────────────────────
  // The stream URL returns 503 + Retry-After while the engine builds a
  // seekable MP4 cache; poll a 2-byte Range until ready so the user sees a
  // "Preparing…" spinner instead of a hard playback error.
  useEffect(() => {
    if (!infoReady || transcode) return
    const mp4Src = videoStreamURL(fileId, activeAudio)
    let cancelled = false
    const controller = new AbortController()
    setPlayableSrc(null)
    setPreparing(true)
    setError(null)

    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(mp4Src, {
            headers: { Range: 'bytes=0-1' },
            signal: controller.signal,
          })
          if (cancelled) return
          if (res.ok || res.status === 206 || res.status === 200) {
            setPreparing(false)
            setPlayableSrc(mp4Src)
            return
          }
          if (res.status === 503) {
            const retry = Number(res.headers.get('Retry-After')) || 3
            await new Promise((r) => setTimeout(r, retry * 1000))
            continue
          }
          setPreparing(false)
          setError('Could not load this video.')
          return
        } catch (err) {
          if (cancelled || (err as Error)?.name === 'AbortError') return
          await new Promise((r) => setTimeout(r, 3000))
        }
      }
    }
    void poll()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fileId, activeAudio, infoReady, transcode, retryNonce])

  // ── HLS attach (re-encode path) ───────────────────────
  // Segments are encoded on demand, so playback starts in ~1s and seeking
  // works for any codec. hls.js drives the element via MSE; Safari plays the
  // playlist natively.
  useEffect(() => {
    if (!infoReady || !transcode) return
    const v = videoRef.current
    if (!v) return
    const url = hlsPlaylistURL(fileId, activeAudio)
    setPreparing(false)
    setError(null)

    if (!Hls.isSupported()) {
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        setPlayableSrc(url) // Safari native HLS
      } else {
        setError('Your browser does not support this video.')
      }
      return
    }

    setPlayableSrc(null) // hls.js attaches to the element directly
    const hls = new Hls({ enableWorker: true })
    hls.loadSource(url)
    hls.attachMedia(v)
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad()
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      } else {
        setError('Playback error while streaming this video.')
        hls.destroy()
      }
    })

    return () => {
      hls.destroy()
    }
  }, [fileId, activeAudio, infoReady, transcode, retryNonce])

  // ── Auto-hide overlay ─────────────────────────────────
  const resetHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setOverlayVisible(true)
    hideTimer.current = setTimeout(() => {
      if (playing && openMenu === null) setOverlayVisible(false)
    }, AUTO_HIDE_MS)
  }, [playing, openMenu])

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
    const onCanPlay = () => {
      setLoading(false)
      setError(null)
      // After an audio switch the new stream starts at 0; seek back to where
      // the user was before the swap (resumeTimeRef is set in handleAudioPick).
      if (resumeTimeRef.current > 0) {
        const target = resumeTimeRef.current
        resumeTimeRef.current = 0
        try { v.currentTime = target } catch { /* ignore */ }
      }
    }
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

    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('error', onError)

    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDuration)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('error', onError)
    }
  }, [])

  // ── Default the subtitle track on first load ──────────
  // Players normally start with subtitles on when the file has them. Prefer an
  // English track, else the first one. Only auto-selects once so it never
  // overrides a later explicit "Off" by the user.
  const subtitleInitRef = useRef(false)
  useEffect(() => {
    if (subtitleInitRef.current || subtitleTracks.length === 0) return
    subtitleInitRef.current = true
    const en = subtitleTracks.findIndex((t) => t.language?.toLowerCase().startsWith('en'))
    setActiveSubtitle(en >= 0 ? en : 0)
  }, [subtitleTracks])

  // ── Subtitle track enable/disable ─────────────────────
  // textTracks is a live list — toggling .mode picks which one renders.
  const applySubtitleMode = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    for (let i = 0; i < v.textTracks.length; i++) {
      const tt = v.textTracks[i]
      if (i === activeSubtitle) {
        // hidden→showing forces the browser to re-evaluate the cue active at
        // the current position (e.g. right after a seek) instead of waiting
        // for the next cue boundary.
        tt.mode = 'hidden'
        tt.mode = 'showing'
      } else {
        tt.mode = 'disabled'
      }
    }
  }, [activeSubtitle])

  useEffect(() => {
    applySubtitleMode()
  }, [applySubtitleMode, subtitleTracks.length])

  // On the HLS path, hls.js's timeline controller touches the video's
  // textTracks when it switches segments on a seek, which can silently reset
  // our external <track> back to disabled. Re-assert the active track after
  // every seek so subtitles survive scrubbing.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.addEventListener('seeked', applySubtitleMode)
    return () => v.removeEventListener('seeked', applySubtitleMode)
  }, [applySubtitleMode])

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

  const handleAudioPick = useCallback((streamIndex: number) => {
    const v = videoRef.current
    if (v) resumeTimeRef.current = v.currentTime
    setActiveAudio(streamIndex)
    setOpenMenu(null)
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
          if (openMenu !== null) setOpenMenu(null)
          else if (document.fullscreenElement) document.exitFullscreen()
          else router.back()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, toggleMute, toggleFullscreen, skip, changeVolume, volume, router, openMenu])

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
      {/* Video element. Subtitle tracks are children so they're registered
          with the video.textTracks list at mount time. */}
      <video
        ref={videoRef}
        src={playableSrc ?? undefined}
        className="h-full w-full object-contain"
        playsInline
        preload="auto"
        autoPlay
        crossOrigin="anonymous"
      >
        {subtitleTracks.map((t, i) => (
          <track
            key={`${fileId}:${t.index}`}
            kind="subtitles"
            srcLang={t.language ?? undefined}
            label={labelFor(t)}
            src={subtitleURL(fileId, t.index)}
            default={i === activeSubtitle}
          />
        ))}
      </video>

      {(loading || preparing) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <Loader2 className="h-12 w-12 animate-spin text-white/60" />
          {preparing && (
            <p className="text-sm text-white/60">Preparing video…</p>
          )}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-white/80 text-base">{error}</p>
            <p className="text-white/40 text-xs">
              The server will transmux this file through ffmpeg. If this keeps failing the source codec may be unsupported.
            </p>
            <button
              onClick={() => { setError(null); setRetryNonce((n) => n + 1) }}
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
            {/* Audio tracks button — only shown when there's a choice to make */}
            {audioTracks.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === 'audio' ? null : 'audio')}
                  className={`rounded-full p-2 transition-colors ${
                    openMenu === 'audio'
                      ? 'bg-white/10 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  aria-label="Audio tracks"
                >
                  <AudioLines className="h-5 w-5" />
                </button>
                {openMenu === 'audio' && (
                  <div className="absolute bottom-full right-0 mb-2 min-w-[220px] rounded-lg bg-black/90 border border-white/10 py-1 shadow-2xl">
                    <p className="px-3 py-1 text-xs text-white/40 uppercase tracking-wider">Audio</p>
                    {audioTracks.map((t) => (
                      <button
                        key={t.index}
                        onClick={() => handleAudioPick(t.index)}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                          activeAudio === t.index || (activeAudio === undefined && t === audioTracks[0])
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {labelFor(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Subtitle tracks — shows even with one option so the user can disable */}
            {subtitleTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === 'subs' ? null : 'subs')}
                  className={`rounded-full p-2 transition-colors ${
                    openMenu === 'subs' || activeSubtitle !== SUB_OFF
                      ? 'bg-white/10 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  aria-label="Subtitles"
                >
                  <Subtitles className="h-5 w-5" />
                </button>
                {openMenu === 'subs' && (
                  <div className="absolute bottom-full right-0 mb-2 max-h-72 min-w-[220px] overflow-y-auto rounded-lg bg-black/90 border border-white/10 py-1 shadow-2xl">
                    <p className="px-3 py-1 text-xs text-white/40 uppercase tracking-wider">Subtitles</p>
                    <button
                      onClick={() => { setActiveSubtitle(SUB_OFF); setOpenMenu(null) }}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                        activeSubtitle === SUB_OFF
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      Off
                    </button>
                    {subtitleTracks.map((t, i) => (
                      <button
                        key={t.index}
                        onClick={() => { setActiveSubtitle(i); setOpenMenu(null) }}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                          activeSubtitle === i
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {labelFor(t)}
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
