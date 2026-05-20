"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Hls from "hls.js";

interface SubtitleTrack {
  url: string;
  lang: string;
  label?: string;
}

interface VideoPlayerProps {
  src: string;
  fallbackSources?: string[];
  poster?: string;
  title?: string;
  subtitles?: SubtitleTrack[];
}

const DEFAULT_SUBTITLES: SubtitleTrack[] = [];
const DEFAULT_FALLBACK_SOURCES: string[] = [];

export default function VideoPlayer({ src, fallbackSources = DEFAULT_FALLBACK_SOURCES, poster, title, subtitles = DEFAULT_SUBTITLES }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sourcePlaylist = useMemo(() => {
    return [src, ...fallbackSources].filter((url, index, urls) => url && urls.indexOf(url) === index);
  }, [src, fallbackSources]);
  const activeSrc = sourcePlaylist[activeSourceIndex] || src;
  const isHls = activeSrc.includes(".m3u8");
  const isDash = activeSrc.includes(".mpd");

  useEffect(() => {
    setActiveSourceIndex(0);
  }, [src, fallbackSources]);

  const scheduleHideControls = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    scheduleHideControls();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isPlaying, scheduleHideControls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset state for new source
    setError(null);
    setLoading(true);
    setBuffering(false);
    setProgress(0);
    setDuration(0);
    setIsPlaying(false);

    let hls: Hls | null = null;

    const handleLoadedMetadata = () => {
      setLoading(false);
      setBuffering(false);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const handleCanPlay = () => { setLoading(false); setBuffering(false); };
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => setBuffering(false);
    const handleTimeUpdate = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };
    const handlePlay = () => { setIsPlaying(true); setLoading(false); setBuffering(false); };
    const handlePause = () => { setIsPlaying(false); setShowControls(true); };
    const handleVolumeChange = () => { setVolume(video.volume); setIsMuted(video.muted); };
    const handleError = () => {
      if (!video.error) return;
      const nextSourceIndex = activeSourceIndex + 1;
      if (nextSourceIndex < sourcePlaylist.length) {
        console.warn("[VideoPlayer] Source failed, trying fallback source", nextSourceIndex + 1);
        setError(null);
        setLoading(true);
        setBuffering(false);
        setActiveSourceIndex(nextSourceIndex);
        return;
      }
      let msg = "Playback failed";
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_ABORTED: msg = "Playback aborted by user"; break;
        case MediaError.MEDIA_ERR_NETWORK: msg = "Network error - video failed to load"; break;
        case MediaError.MEDIA_ERR_DECODE: msg = "Video decode error - format not supported"; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = "Video format not supported by browser"; break;
      }
      console.error("[VideoPlayer] Error:", msg, "Code:", video.error.code, "Src:", activeSrc);
      setError(msg);
      setLoading(false);
      setBuffering(false);
    };
    const handleStalled = () => setBuffering(true);

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("durationchange", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("canplaythrough", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("stalled", handleStalled);
    video.addEventListener("error", handleError);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("volumechange", handleVolumeChange);

    // Add subtitle tracks
    if (subtitles.length > 0) {
      subtitles.forEach((sub) => {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.src = sub.url;
        track.srclang = sub.lang;
        track.label = sub.label || sub.lang;
        video.appendChild(track);
      });
    }

    // Load the video
    console.log("[VideoPlayer] Loading source:", activeSrc.substring(0, 100));

    if (isHls && Hls.isSupported()) {
      console.log("[VideoPlayer] Using hls.js for HLS playback");
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        debug: false,
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log("[VideoPlayer] hls.js media attached");
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log("[VideoPlayer] Manifest parsed, levels:", data.levels.length);
        setLoading(false);
        setBuffering(false);
        video.play().catch((err) => {
          console.log("[VideoPlayer] Auto-play prevented:", err.message);
        });
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        console.error("[VideoPlayer] HLS error:", data.type, data.details, data.fatal ? "FATAL" : "recoverable");
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError(`Network stream error: ${data.details}. Retrying...`);
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError(`Media error: ${data.details}. Recovering...`);
              hls?.recoverMediaError();
              break;
            default:
              setError(`Stream error: ${data.type} - ${data.details}`);
              setLoading(false);
              setBuffering(false);
              hls?.destroy();
              break;
          }
        }
      });

      hls.loadSource(activeSrc);
      hls.attachMedia(video);

    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      console.log("[VideoPlayer] Using native HLS (Safari)");
      video.src = activeSrc;
      video.load();
      video.play().catch(() => {});
    } else if (isDash) {
      console.error("[VideoPlayer] DASH not supported without dash.js");
      setError("DASH streams require dash.js library.");
      setLoading(false);
    } else {
      console.log("[VideoPlayer] Using native video playback");
      video.src = activeSrc;
      video.load();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("durationchange", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("canplaythrough", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("stalled", handleStalled);
      video.removeEventListener("error", handleError);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("volumechange", handleVolumeChange);
      if (hls) {
        hls.destroy();
      }
      video.querySelectorAll("track").forEach((track) => track.remove());
      video.removeAttribute("src");
      video.load();
    };
  }, [activeSrc, activeSourceIndex, isHls, isDash, sourcePlaylist, subtitles]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play().catch(err => console.error("Play failed:", err)) : v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen().catch(err => console.error("Fullscreen failed:", err));
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const pct = parseFloat(e.target.value);
    v.currentTime = (pct / 100) * v.duration;
    setProgress(pct);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "ArrowRight": e.preventDefault(); if (videoRef.current) videoRef.current.currentTime += 10; break;
        case "ArrowLeft": e.preventDefault(); if (videoRef.current) videoRef.current.currentTime -= 10; break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, toggleMute, toggleFullscreen]);

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div ref={containerRef} className="vp-container" onMouseMove={handleMouseMove}
         onMouseLeave={() => isPlaying && setShowControls(false)}>
      <video
        ref={videoRef}
        poster={poster}
        className="vp-video"
        playsInline
        preload="auto"
        onClick={togglePlay}
      />

      {/* Loading / Buffering overlay */}
      {(loading || buffering) && !error && (
        <div className="vp-overlay">
          <div className="vp-spinner" />
          <p style={{ color: "#fff", marginTop: 16, fontSize: 14 }}>
            {buffering ? "Buffering..." : "Loading video..."}
          </p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="vp-overlay vp-error">
          <h3>⚠ {error}</h3>
          <p>The video source may be unavailable or blocked.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => window.location.reload()}>Retry</button>
            <button onClick={() => {
              setError(null);
              setLoading(true);
              const v = videoRef.current;
              if (v) { v.load(); v.play().catch(() => {}); }
            }} style={{ background: "#333" }}>Try Again</button>
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: "#666" }}>
            Source: {activeSrc.substring(0, 60)}...
          </p>
        </div>
      )}

      {/* Big play button when paused and not loading */}
      {!isPlaying && !loading && !error && !buffering && (
        <div className="vp-overlay" onClick={togglePlay} style={{ cursor: "pointer" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(229, 9, 20, 0.9)",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="vp-controls"
           style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none" }}>
        {title && <p className="vp-title">{title}</p>}
        <input type="range" min={0} max={100} value={progress} onChange={handleSeek} className="vp-seek" aria-label="Seek" />
        <div className="vp-row">
          <button onClick={togglePlay} aria-label="Play/Pause">
            {isPlaying ? (
              <svg fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
            ) : (
              <svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button onClick={toggleMute} aria-label="Mute">
            {isMuted ? (
              <svg fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
            ) : (
              <svg fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
            )}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={handleVolume} className="vp-volume" aria-label="Volume" />
          <span className="vp-time">{fmt(videoRef.current?.currentTime || 0)} / {fmt(duration)}</span>
          <div className="vp-spacer" />
          <button onClick={toggleFullscreen} aria-label="Fullscreen">
            <svg fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
