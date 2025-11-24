import React, { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, AlertTriangle } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelect: (base64: string) => void;
  currentImage: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelect, currentImage }) => {
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size too large. Please upload an image under 5MB.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onImageSelect(base64String);
    };
    reader.readAsDataURL(file);
  }, [onImageSelect]);

  return (
    <div className="w-full">
      <div className="relative group">
        {!currentImage ? (
          <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-lime-500/50 transition-all duration-300">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <div className="p-4 bg-zinc-800 rounded-full mb-4 group-hover:bg-zinc-700 transition-colors">
                <Upload className="w-8 h-8 text-lime-500" />
              </div>
              <p className="mb-2 text-sm text-zinc-400 font-bold">CLICK TO UPLOAD RIDE</p>
              <p className="text-xs text-zinc-500">PNG, JPG or WEBP (MAX 5MB)</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={handleFileChange} 
            />
          </label>
        ) : (
          <div className="relative w-full h-64 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 group">
            <img 
              src={currentImage} 
              alt="Uploaded" 
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
               <label className="cursor-pointer bg-black/80 text-white px-4 py-2 rounded-md border border-lime-500 hover:bg-lime-900/80 transition-colors flex items-center gap-2">
                 <ImageIcon className="w-4 h-4" />
                 <span>Change Vehicle</span>
                 <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleFileChange} 
                />
               </label>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-3 flex items-center gap-2 text-orange-500 text-sm bg-orange-500/10 p-2 rounded border border-orange-500/20">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
};