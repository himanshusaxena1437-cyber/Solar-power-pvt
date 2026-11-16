import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'primary' | 'secondary';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'secondary',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'primary'
            ? 'px-4 py-2.5 rounded-lg bg-[#FEF9C3] text-[#0F1F16] border border-[#EAB308]/40 text-sm font-semibold hover:bg-[#FEF08A] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0'
            : 'px-3.5 py-2 rounded-lg border border-[#DCE6DE] bg-white text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0'
        }
      >
        <Download className="w-4 h-4 text-[#15803D]" />
        <span>{isInstallable ? 'Install Android App' : 'Get Mobile App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-[#DCE6DE] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-[#0F1F16]">
                    Install Solar Power App
                  </h3>
                  <p className="text-xs text-[#4A5D52]">
                    Android Home Screen &amp; APK Packaging Guide
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-[#4A5D52] hover:text-[#0F1F16]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE] text-xs text-[#0F1F16] space-y-1.5">
                <p className="font-semibold">Install on iPhone / iPad (Safari):</p>
                <p>1. Tap the Share icon in the Safari toolbar.</p>
                <p>2. Scroll down and tap &ldquo;Add to Home Screen&rdquo;.</p>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE] text-xs text-[#0F1F16] space-y-1.5">
                <p className="font-semibold">Install Directly on Android (Chrome):</p>
                <p>1. Open the Shared App URL directly in Google Chrome on Android.</p>
                <p>2. Tap Chrome&apos;s menu (⋮) and choose &ldquo;Install App&rdquo; or &ldquo;Add to Home screen&rdquo;.</p>
                <p className="text-[#4A5D52] pt-1">
                  To export a standalone signed <code>.apk</code> file, pass the Shared App URL into PWABuilder (Android TWA) or wrap the Vite build with Capacitor Android.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-[#FEF08A] border border-[#EAB308]/50 px-3 py-2 text-xs font-semibold text-[#0F1F16] shadow-sm">
      <WifiOff className="w-3.5 h-3.5 text-[#CA8A04]" />
      <span>Offline Mode — Cached workspace active</span>
    </div>
  );
};
