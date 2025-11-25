import React, { useState, useEffect } from 'react';
import { Biohazard, Skull, Zap, Car, Download, Share2, AlertCircle, Shield, Users, Trophy, Radio } from 'lucide-react';
import { createZombieVehicle } from "./services/geminiService";
import { ImageUploader } from './components/ImageUploader';
import { Button } from './components/Button';
import { GenerationMode, LoadingState } from './types';

// Survivor Card Component
const SurvivorCard = () => (
  <div className="bg-gradient-to-br from-zinc-900 to-black border-2 border-zinc-800 p-4 rounded-xl relative overflow-hidden group shadow-lg shadow-lime-900/10">
    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
      <Shield className="w-32 h-32 text-lime-500 rotate-12" />
    </div>
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
        <span className="text-[10px] text-zinc-500 font-mono tracking-widest">ID: ZMB-HUNTER-01</span>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-[10px] text-red-500 font-bold">ACTIVE DUTY</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-lg bg-zinc-800 border-2 border-lime-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(101,163,13,0.3)]">
           <span className="font-zombie text-4xl text-lime-500">M</span>
        </div>
        <div>
          <h3 className="text-lime-500 font-bold text-xs tracking-widest uppercase mb-1">Squad Leader</h3>
          <p className="text-2xl font-black text-white leading-none tracking-tight font-zombie">COMMANDER MASON</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-[10px] bg-lime-900/40 px-2 py-0.5 rounded text-lime-400 border border-lime-800">LVL 99</span>
            <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 border border-zinc-700">BASE: BUNKER ALPHA</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ isLoading: false, message: '' });
  const [mode, setMode] = useState<GenerationMode>(GenerationMode.SURVIVAL);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!sourceImage) {
      setError("Mason needs a vehicle to upgrade! Upload a photo first.");
      return;
    }

    setLoading({ isLoading: true, message: 'Initiating Garage Protocol...' });
    setError(null);
    setGeneratedImage(null);

    try {
      const steps = [
        'Scanning chassis integrity...',
        'Welding reinforced steel plating...',
        'Mounting roof-top zombie shredders...',
        `Painting "MASON" insignia on doors...`,
        'Applying radioactive decay effects...',
        'Finalizing survival modifications...'
      ];

      let stepIndex = 0;
      const interval = setInterval(() => {
        if (stepIndex < steps.length) {
          setLoading(prev => ({ ...prev, message: steps[stepIndex] }));
          stepIndex++;
        }
      }, 1200);

      const resultBase64 = await generateZombieCar(sourceImage, mode, customPrompt);
      
      clearInterval(interval);
      setGeneratedImage(resultBase64);
    } catch (err: any) {
      setError(err.message || "Garage malfunction. Try uploading a smaller image.");
    } finally {
      setLoading({ isLoading: false, message: '' });
    }
  };

  const handleDownload = () => {
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `mason-zombie-ride-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleRecruitTeam = async () => {
    const url = window.location.href;
    const shareData = {
      title: "Commander Mason's Zombie Garage",
      text: "Mason is building zombie survival trucks! Build yours here:",
      url: url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share canceled');
      }
    } else {
      navigator.clipboard.writeText(url);
      alert("Mission Link Copied! Send it to your squad.");
    }
  };

  const handleShareImage = async () => {
    if (!generatedImage) return;

    try {
      // Fetch the base64 image and convert to blob for sharing
      const res = await fetch(generatedImage);
      const blob = await res.blob();
      const file = new File([blob], "mason-zombie-ride.png", { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Mason's New Ride",
          text: "Check out this zombie survival vehicle I built in Commander Mason's Garage!",
          files: [file]
        });
      } else {
        // Fallback to regular download if sharing files isn't supported (desktop)
        handleDownload();
      }
    } catch (error) {
      console.error("Error sharing:", error);
      handleDownload();
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-zinc-950 text-zinc-200 selection:bg-lime-500/30 selection:text-lime-200">
      
      {/* Header */}
      <header className="border-b border-zinc-800 bg-black/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-lime-500/10 rounded-lg border border-lime-500/20 relative group overflow-hidden animate-pulse">
              <Biohazard className="w-6 h-6 sm:w-8 sm:h-8 text-lime-500 relative z-10" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-zombie text-white tracking-wider leading-none">
                MASON'S <span className="text-lime-500">GARAGE</span>
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Zombie Defense Unit</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
             <button 
               onClick={handleRecruitTeam}
               className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-[10px] sm:text-xs font-bold uppercase transition-all border border-zinc-700 hover:border-lime-500/50 hover:text-white"
             >
                <Users className="w-3 h-3 sm:w-4 sm:h-4 text-lime-500" />
                <span className="hidden sm:inline">Recruit Team</span>
                <span className="sm:hidden">Share App</span>
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8 pb-24">
        
        {/* Intro Banner */}
        <div className="mb-8 sm:mb-12 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/20 border border-red-900/50 text-red-400 text-[10px] font-bold tracking-widest uppercase mb-2 animate-bounce">
            <Radio className="w-3 h-3" /> Incoming Transmission
          </div>
          <h2 className="text-4xl sm:text-7xl font-bold text-white uppercase tracking-tighter font-zombie leading-none">
            Apocalypse <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-emerald-600 drop-shadow-[0_0_15px_rgba(132,204,22,0.5)]">Ready</span>
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm sm:text-base">
            Upload your vehicle. The AI will equip it with armor, weapons, and the official <span className="text-lime-400 font-bold ml-1">COMMANDER MASON</span> seal of approval.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Section */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Mason's ID Card */}
            <SurvivorCard />

            <div className="bg-zinc-900/30 p-6 rounded-2xl border border-zinc-800 backdrop-blur-sm space-y-6 shadow-xl">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                  <Car className="w-4 h-4 text-lime-500" /> 
                  1. Upload Base Vehicle
                </label>
                <ImageUploader 
                  onImageSelect={setSourceImage} 
                  currentImage={sourceImage} 
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-500" /> 
                  2. Select Mutation Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(GenerationMode).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`p-3 rounded-lg border text-sm font-medium transition-all text-left flex flex-col gap-1 relative overflow-hidden group ${
                        mode === m 
                          ? 'bg-lime-950/40 border-lime-500 text-lime-400 shadow-[0_0_10px_rgba(132,204,22,0.1)]' 
                          : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      <span className="relative z-10 font-bold uppercase text-xs">{m}</span>
                      {mode === m && <div className="absolute inset-0 bg-lime-500/10 animate-pulse"></div>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                  <Skull className="w-4 h-4 text-red-500" /> 
                  3. Mason's Special Requests
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. Add a minigun, make it covered in slime, blue neon lights..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-lime-500/50 focus:ring-1 focus:ring-lime-500/50 resize-none h-20 placeholder:text-zinc-700"
                />
              </div>

              <Button 
                onClick={handleGenerate} 
                isLoading={loading.isLoading} 
                className="w-full py-4 text-lg shadow-lg shadow-lime-900/20"
              >
                MUTATE RIDE
              </Button>
              
              {loading.isLoading && (
                <div className="text-center bg-black/50 p-4 rounded-lg border border-lime-500/20">
                   <p className="text-xs text-lime-400 font-mono animate-pulse uppercase tracking-widest mb-2">{loading.message}</p>
                   <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                     <div className="h-full bg-lime-500 animate-[progress_1.5s_ease-in-out_infinite] w-2/3 shadow-[0_0_10px_lime]"></div>
                   </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-200 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-400 uppercase text-xs mb-1">Critical Failure</p>
                    <p className="opacity-90">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-7">
            <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-2xl min-h-[400px] sm:min-h-[600px] flex items-center justify-center group">
              
              {/* Decorative elements */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
              
              {!generatedImage ? (
                <div className="text-center p-8 opacity-50 select-none pointer-events-none relative z-10">
                  <div className="w-32 h-32 mx-auto mb-6 rounded-full border-4 border-dashed border-zinc-800 flex items-center justify-center bg-zinc-900/50 animate-float">
                    <Car className="w-16 h-16 text-zinc-700" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest font-zombie">Awaiting Vehicle</h3>
                  <p className="text-zinc-600 font-mono mt-2 text-sm max-w-xs mx-auto">Upload a car image to begin the transformation sequence.</p>
                </div>
              ) : (
                <div className="relative w-full h-full bg-zinc-900 flex flex-col">
                  <div className="flex-1 flex items-center justify-center bg-black">
                    <img 
                      src={generatedImage} 
                      alt="Zombie Car" 
                      className="w-full h-auto max-h-[70vh] object-contain shadow-2xl"
                    />
                  </div>
                  
                  <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="font-mono text-xs text-lime-500 flex items-center gap-2">
                      <div className="w-2 h-2 bg-lime-500 rounded-full animate-pulse"></div>
                      <div>
                        <p className="font-bold uppercase tracking-wider">Property of Mason</p>
                        <p className="text-zinc-500 text-[10px]">{new Date().toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                       <Button variant="secondary" onClick={handleShareImage} className="flex-1 sm:flex-none py-2 px-4 text-xs flex items-center justify-center gap-2">
                         <Share2 className="w-4 h-4" /> <span className="sm:hidden">Share</span> <span className="hidden sm:inline">Share Image</span>
                       </Button>
                       <Button variant="primary" onClick={handleDownload} className="flex-1 sm:flex-none py-2 px-4 text-xs flex items-center justify-center gap-2">
                         <Download className="w-4 h-4" /> <span className="sm:hidden">Save</span> <span className="hidden sm:inline">Download HD</span>
                       </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gallery / History Placeholder */}
            {generatedImage && (
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4">
                 <div className="bg-zinc-900/80 p-5 rounded-xl border border-zinc-800 hover:border-lime-500/30 transition-all group">
                    <h4 className="font-bold text-lime-400 mb-2 flex items-center gap-2 uppercase tracking-wider text-xs">
                      <Trophy className="w-4 h-4" /> 
                      Survivor Tip #42
                    </h4>
                    <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      "If the zombies are fast, you need nitro. If they are big, you need spikes. If they are glowing green... run."
                    </p>
                 </div>
                 <div className="bg-zinc-900/80 p-5 rounded-xl border border-zinc-800 hover:border-orange-500/30 transition-all group">
                    <h4 className="font-bold text-orange-400 mb-2 flex items-center gap-2 uppercase tracking-wider text-xs">
                      <Zap className="w-4 h-4" /> 
                      Next Mission
                    </h4>
                    <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      Try selecting <span className="text-white font-bold">"Infected Zone"</span> mode and asking for "broken windows and toxic slime" in the text box!
                    </p>
                 </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;