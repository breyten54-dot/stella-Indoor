import { useState } from 'react';
import { Video, Radio, CircleStop, Wifi, WifiOff } from 'lucide-react';

const CAMERAS = [
  { id: 'big-court-cam1', name: 'Big Court - Camera 1', ip: '', icon: Video },
  { id: 'big-court-cam2', name: 'Big Court - Camera 2', ip: '', icon: Video },
];

export function ClipRecorder() {
  const [recording, setRecording] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const triggerRecord = async (camera: typeof CAMERAS[0]) => {
    const piIP = localStorage.getItem(`pi-ip-${camera.id}`) || prompt(`Enter IP address for ${camera.name} (e.g., 192.168.1.100):`);
    if (!piIP) return;
    localStorage.setItem(`pi-ip-${camera.id}`, piIP);

    setRecording(prev => new Set(prev).add(camera.id));
    setToast(`Recording started on ${camera.name}...`);

    try {
      const response = await fetch(`http://${piIP}:5000/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'admin', duration: 30 }),
      });

      if (response.ok) {
        setToast(`${camera.name} recording complete! Clip will appear in Stella Clips shortly.`);
      } else {
        setToast(`Failed to trigger ${camera.name}. Check Pi is online.`);
      }
    } catch {
      setToast(`Cannot reach ${camera.name} at ${piIP}. Check WiFi connection.`);
    }

    setTimeout(() => {
      setRecording(prev => {
        const next = new Set(prev);
        next.delete(camera.id);
        return next;
      });
    }, 3000);

    setTimeout(() => setToast(null), 5000);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Video className="w-6 h-6 text-[#818cf8]" />
          Clip Recorder
        </h1>
        <p className="text-sm text-[#8A8A8A] mt-1">
          Trigger 30-second recordings on the Big Court cameras
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 bg-[#6366f1] rounded-xl px-4 py-3 flex items-center gap-2 text-white text-sm font-semibold animate-fade-in">
          <Radio className="w-4 h-4 shrink-0" />
          {toast}
        </div>
      )}

      <div className="space-y-4">
        {CAMERAS.map((camera) => {
          const isRecording = recording.has(camera.id);
          return (
            <div
              key={camera.id}
              className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isRecording ? 'bg-[#E53935]/20' : 'bg-[#6366f1]/20'}`}>
                    {isRecording ? (
                      <CircleStop className="w-6 h-6 text-[#E53935]" />
                    ) : (
                      <camera.icon className="w-6 h-6 text-[#818cf8]" />
                    )}
                  </div>
                  <div>
                    <p className="text-white font-semibold">{camera.name}</p>
                    <p className="text-xs text-[#8A8A8A]">
                      {localStorage.getItem(`pi-ip-${camera.id}`)
                        ? `IP: ${localStorage.getItem(`pi-ip-${camera.id}`)}`
                        : 'IP not set — tap Record to configure'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => triggerRecord(camera)}
                  disabled={isRecording}
                  className={`h-11 px-5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95 ${
                    isRecording
                      ? 'bg-[#2A2A2A] text-[#8A8A8A] cursor-not-allowed'
                      : 'bg-[#E53935] hover:bg-[#C62828] text-white'
                  }`}
                >
                  {isRecording ? (
                    <><CircleStop className="w-4 h-4" /> Recording...</>
                  ) : (
                    <><Video className="w-4 h-4" /> Record 30s</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-3">Setup Tips</h3>
        <ul className="space-y-2 text-xs text-[#8A8A8A]">
          <li className="flex items-start gap-2">
            <Wifi className="w-3.5 h-3.5 text-[#818cf8] shrink-0 mt-0.5" />
            Make sure both Pis are connected to the same WiFi as this admin device
          </li>
          <li className="flex items-start gap-2">
            <WifiOff className="w-3.5 h-3.5 text-[#E53935] shrink-0 mt-0.5" />
            If a Pi shows as unreachable, check its IP address with: hostname -I
          </li>
          <li className="flex items-start gap-2">
            <Video className="w-3.5 h-3.5 text-[#60A5FA] shrink-0 mt-0.5" />
            Recorded clips appear on the Stella Clips page within 1-2 minutes
          </li>
        </ul>
      </div>
    </div>
  );
}
