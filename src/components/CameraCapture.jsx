import React, { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

// Live camera capture; resolves a JPEG File. Needs HTTPS or localhost, otherwise the caller falls back to the device camera picker.
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch((err) => setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser and try again." : "No camera could be started on this device."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    const video = videoRef.current;
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const q of [0.9, 0.75, 0.6, 0.45]) {
      blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= 2 * 1024 * 1024) break;
    }
    onCapture(new File([blob], `camera-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`, { type: "image/jpeg" }));
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Take a photo" className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/70 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-navy">Take a photo</h3>
          <button type="button" onClick={onClose} aria-label="Close camera" className="rounded-lg p-1.5 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
        )}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50">
            Cancel
          </button>
          {!error && (
            <button type="button" onClick={capture} disabled={!ready} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              <Camera size={16} aria-hidden="true" /> Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
